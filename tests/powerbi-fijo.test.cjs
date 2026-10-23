
const test=require("node:test"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {context}=require("./helpers/gas.cjs");
const sbSource=fs.readFileSync(path.join(__dirname,"../SUPABASE.js"),"utf8");
class PbiSheet {
  constructor(name,head,extra) {
    this.name=name;this.rows=[head.concat(extra||[])];this.notes=[];this.cols=100;this.cap=1000;
    this.failWrite=false;this.failNotes=false;
  }
  getName(){return this.name;}
  getLastRow(){let n=this.rows.length;while(n&&!this.rows[n-1].some(x=>x!==""&&x!=null))n--;return n;}
  getLastColumn(){return Math.max(0,...this.rows.map(r=>{let n=r.length;while(n&&(r[n-1]===""||r[n-1]==null))n--;return n;}));}
  getMaxColumns(){return this.cols;}
  getMaxRows(){return this.cap;}
  insertRowsAfter(after,n){this.cap+=n;}
  deleteColumns(col,n){this.rows.forEach(r=>r.splice(col-1,n));this.notes.forEach(r=>r.splice(col-1,n));this.cols-=n;}
  deleteRows(row,n){this.rows.splice(row-1,n);this.notes.splice(row-1,n);}
  getRange(row,col,n=1,m=1) {
    const sheet=this;
    return {
      getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>sheet.rows[row+i-1]?.[col+j-1]??""));},
      getNotes(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>sheet.notes[row+i-1]?.[col+j-1]??""));},
      setNotes(values){if(sheet.failNotes){sheet.failNotes=false;throw Error("notas");}for(let i=0;i<n;i++){sheet.notes[row+i-1]??=[];for(let j=0;j<m;j++)sheet.notes[row+i-1][col+j-1]=values[i][j];}return this;},
      setValues(values){if(sheet.failWrite){sheet.failWrite=false;throw Error("valores");}for(let i=0;i<n;i++){sheet.rows[row+i-1]??=[];for(let j=0;j<m;j++)sheet.rows[row+i-1][col+j-1]=values[i][j];}return this;},
      setNumberFormat(){return this;},
      clearContent(){for(let i=0;i<n;i++)for(let j=0;j<m;j++)if(sheet.rows[row+i-1])sheet.rows[row+i-1][col+j-1]="";return this;}
    };
  }
}
const INV=["FECHA INICIO","FECHA FINAL","ID","N de linea","CLIENTE","ABC","PRODUCTO","DESCRIPCION DEL PRODUCTO","SERIE","LOTE","N DESPACHO","N PARTIDA","CAT_LOG","EST_MER","POSICION","UNI","DEPOT","CONTEO FISICO","DESFASE","RESULTADO UNIDADES","RESULTADO SERIES","CONTEO No. 1","CONTEO No. 2","CONTEO FINAL","AJUSTE","MOTIVO","JUSTIFICACION","OBSERVACION","NUEVA POSICION","ACTUALIZACION DEPOT"];
const REG=["ACTUADOR","FECHA","HORA","USUARIO","CORREO","ID","CLIENTE","CODIGO","POSICION","CONTEO FISICO","RESULTADO CONTEO","CONTEO N1","CONTEO N2","CONTEO N3","LINK"];
function pbiRow(h,source,id="MISMO_ID",line="1"){
  const r=h.map(()=>"");r[h.indexOf("ID")]=id;r[h.indexOf("CLIENTE")]="IBM";
  r[h===INV?6:7]="SKU";r[h===INV?3:8]=line;return r.concat([source]);
}
function check(v){if(!v)throw Error("Comprobacion fallida");}
function same(a,b){check(JSON.stringify(a)===JSON.stringify(b));}
function fails(fn){let failed=false;try{fn();}catch(e){failed=true;}check(failed);}
function fixture(){
  const {c,props}=context();vm.runInContext(sbSource,c);
  Object.assign(props,{CONSOL_PBI_FIJO:"1",CONSOL_PBI_HEAD_INV:JSON.stringify(INV),CONSOL_PBI_HEAD_REG:JSON.stringify(REG),CONSOL_RUN_TOKEN:"run-A",CONSOL_VERSION:"6"});
  const inv=new PbiSheet("INVENTARIOS",INV,["FR","TRUE","488","ORIGEN_DRIVE"]),reg=new PbiSheet("REGISTRO",REG,["EXTRA","ORIGEN_DRIVE"]),posts=[],calls=[],clones=[];
  c._getSS=()=>({getId:()=>"MASTER",getSheetByName:n=>n==="INVENTARIOS"?inv:n==="REGISTRO"?reg:null});
  c._supabaseFetch=(...args)=>{calls.push(args);return {code:204,body:""};};
  c._sbEnviarLote=(_,rows)=>{posts.push(...rows);return rows.length;};
  c.DriveApp={getFileById:()=>({makeCopy:name=>{clones.push(name);return {getId:()=>"COPY"};}})};
  return {c,props,inv,reg,posts,calls,clones};
}
function send(f,sh,rows,fresh){
  const head=f.c._pbiHead(sh).concat(["ORIGEN_DRIVE"]);
  f.c._consolAjustarDestino(sh,head,fresh);
  f.c._pbiEscribir(sh,rows,head,fresh,f.c._consolPrepararReemplazo(sh,rows,head,fresh));
}
test("Proyeccion fija: campos extras, reordenados y encabezados ambiguos",()=>{
  const f=fixture();
  for(const head of [INV,REG]){
    const esquema=head.slice(),src=head.concat(["FR","TRUE","488"]),row=src.map((_,i)=>String(i));
    const result=f.c._consolAlinearColumnas([row],src,esquema,[],"fuente");
    same(esquema,head);same(result[0],row.slice(0,head.length));
  }
  const r=f.c._consolAlinearColumnas([["SKU","COD"]],["PRODUCTO","ID"],INV.slice(),[],"fuente")[0];
  check(r[6]==="SKU"&&r[2]==="COD");
  fails(()=>f.c._consolAlinearColumnas([["A","B"]],["PRODUCTO","PRODUCTO"],INV.slice(),[],"fuente"));
});
test("Escritura publica 30/15: notas privadas y notas humanas conservadas",()=>{
  const f=fixture();f.inv.notes[1]=[];f.inv.notes[1][2]="Nota humana";
  for(const [sh,head] of [[f.inv,INV],[f.reg,REG]]){
    send(f,sh,[pbiRow(head,"Drive_A")],true);same(sh.rows[0],head);
    check(sh.getMaxColumns()===head.length&&sh.getLastColumn()===head.length&&sh.rows[1].length===head.length);
  }
  check(f.inv.notes[1][2].includes("Nota humana")&&f.c._pbiOrigen(f.inv.notes[1][2])==="Drive_A");
  check(f.c._pbiVirtual(f.inv).getRange(2,31,1,1).getValues()[0][0]==="Drive_A");
});
test("IBM: fuentes distintas con mismo ID sobreviven al reintento",()=>{
  const f=fixture(),a=pbiRow(INV,"Drive_A","250724_IBM"),b=pbiRow(INV,"Drive_B","250724_IBM");
  send(f,f.inv,[a,b],true);send(f,f.inv,[a],false);check(f.inv.getLastRow()===3);
  same(f.c._pbiVirtual(f.inv).getRange(2,31,2,1).getValues().map(r=>r[0]).sort(),["Drive_A","Drive_B"]);
});
test("VENTURA: conserva 53+64 filas sin duplicarlas al reintentar",()=>{
  const f=fixture(),a=Array.from({length:53},(_,i)=>pbiRow(INV,"Drive_A","260907_VENTURA",String(i)));
  const b=Array.from({length:64},(_,i)=>pbiRow(INV,"Drive_B","260907_VENTURA",String(i)));
  send(f,f.inv,a,true);send(f,f.inv,b,false);send(f,f.inv,a,false);check(f.inv.getLastRow()===118);
});
test("Fallos de notas y valores permiten reintentar sin duplicar",()=>{
  for(const flag of ["failNotes","failWrite"]){
    const f=fixture();send(f,f.inv,[pbiRow(INV,"Drive_A")],true);f.inv[flag]=true;
    fails(()=>send(f,f.inv,[pbiRow(INV,"Drive_B")],false));
    send(f,f.inv,[pbiRow(INV,"Drive_B")],false);send(f,f.inv,[pbiRow(INV,"Drive_B")],false);
    check(f.inv.getLastRow()===3);
  }
});
test("REGISTRO puede inicializarse tras un fallo sin borrar INVENTARIOS",()=>{
  const f=fixture();send(f,f.inv,[pbiRow(INV,"Drive_A")],true);f.reg.failWrite=true;
  fails(()=>send(f,f.reg,[pbiRow(REG,"Drive_A")],true));
  send(f,f.reg,[pbiRow(REG,"Drive_A")],false);check(f.inv.getLastRow()===2&&f.reg.getLastRow()===2);
});
test("REGISTRO sin ID conserva la multiplicidad y la purga mantiene notas alineadas",()=>{
  const f=fixture(),a=pbiRow(REG,"Drive_A","");
  send(f,f.reg,[a,a],true);send(f,f.reg,[a,a],false);check(f.reg.getLastRow()===3);
  send(f,f.inv,[pbiRow(INV,"Drive_A"),pbiRow(INV,"Drive_B"),pbiRow(INV,"Drive_A","MISMO_ID","2")],true);
  send(f,f.inv,[pbiRow(INV,"Drive_A")],false);
  same(f.c._pbiVirtual(f.inv).getRange(2,31,2,1).getValues().map(r=>r[0]),["Drive_B","Drive_A"]);
});
test("Supabase exige KPI valido y obtiene la procedencia desde notas",()=>{
  const f=fixture();send(f,f.inv,[pbiRow(INV,"Drive_A"),pbiRow(INV,"Drive_B")],true);
  const sync=()=>f.c._sbReconciliarPorArchivo("INVENTARIOS","inventarios","TEST_SYNC",f.c._sbColsInventarios,f.c._sbMapInventarios);
  fails(sync);check(!f.calls.length);
  Object.assign(f.props,{CONSOL_STATUS:"COMPLETADO",CONSOL_KPI_RUN:"run-A",CONSOL_KPI_FILAS:"2"});
  const r=sync();check(r.ok&&r.completo&&r.filas===2&&r.archivos===1&&f.calls.length===1);
  same(f.posts.map(o=>o.origen_drive),["Drive_A","Drive_B"]);check(f.inv.getLastColumn()===30);
});
test("Activacion requiere reposo y respaldo antes de congelar el esquema",()=>{
  let f=fixture();Object.assign(f.props,{CONSOL_PBI_FIJO:"0",CONSOL_STATUS:"EN_CURSO"});
  fails(()=>f.c.activarEsquemaFijoPowerBI_());check(!f.clones.length);
  f=fixture();Object.assign(f.props,{CONSOL_PBI_FIJO:"0",CONSOL_STATUS:"ERROR"});
  f.c.DriveApp={getFileById(){throw Error("sin respaldo");}};
  fails(()=>f.c.activarEsquemaFijoPowerBI_());check(f.props.CONSOL_PBI_FIJO==="0");
  f=fixture();Object.assign(f.props,{CONSOL_PBI_FIJO:"0",CONSOL_STATUS:"ERROR"});
  const before=JSON.stringify([f.inv.rows,f.reg.rows]);f.c.activarEsquemaFijoPowerBI_();
  check(f.clones.length===1&&f.props.CONSOL_PBI_FIJO==="1"&&f.props.CONSOL_VERSION==="6");
  check(JSON.stringify([f.inv.rows,f.reg.rows])===before&&f.props.CONSOL_RUN_TOKEN==="");
  same(JSON.parse(f.props.CONSOL_PBI_HEAD_INV),INV);same(JSON.parse(f.props.CONSOL_PBI_HEAD_REG),REG);
});
test("Encabezados modificados y filas demasiado anchas se rechazan sin escribir",()=>{
  let f=fixture();f.inv.rows[0][6]="OTRO";fails(()=>send(f,f.inv,[pbiRow(INV,"Drive_A")],true));
  f=fixture();const before=JSON.stringify(f.inv.rows);
  fails(()=>send(f,f.inv,[pbiRow(INV,"Drive_A").concat(["EXTRA"])],true));check(JSON.stringify(f.inv.rows)===before);
});
