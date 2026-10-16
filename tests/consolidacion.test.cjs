const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Sheet,book,context}=require('./helpers/gas.cjs');
const head=['FECHA INICIO','FECHA FINAL','ID','N de línea','CLIENTE','ABC','PRODUCTO','LOTE','POSICIÓN','CANTIDAD'];
function line(id,n,client='SG',pos='BM-G-14-1',qty=15){return ['27/2/2026','2/3/2026',id,n,client,'B','5539541827','2026-03',pos,qty]}
function businessRows(sheet){
 const col=sheet.rows[0]?.indexOf('ORIGEN_DRIVE')??-1;
 return sheet.rows.map(row=>col<0?row:row.filter((_,i)=>i!==col));
}
function append(sheet,rows){if(rows.length)sheet.getRange(sheet.getLastRow()+1,1,rows.length,rows[0].length).setValues(rows)}
function replay(c,s,rows){const plan=c._consolPrepararReemplazo(s,rows,head);c._consolPurgarFilasDelLote(s,plan);append(s,rows)}
test('repetir los cuatro inventarios de la captura conserva líneas y cantidades',()=>{
 const {c}=context();const rows=['260227_SG','260508_SG','260529_SG','260605_SG'].flatMap(id=>[line(id,6),line(id,7,'SG','BM-G-24-2',43)]);
 const s=new Sheet('INVENTARIOS',[head,...rows,...rows]);
 replay(c,s,rows);replay(c,s,rows);
 assert.deepEqual(s.rows,[head,...rows]);assert.equal(s.rows.slice(1).reduce((a,r)=>a+r[9],0),232);
});
test('SKU repetido en otra línea, ubicación, inventario o cliente se conserva',()=>{
 const {c}=context();const existing=[line('260227_SG',1,'OTRO'),line('260508_SG',1)];
 const rows=[line('260227_SG',6),line('260227_SG',7),line('260227_SG',8,'SG','OTRA')];
 const s=new Sheet('INVENTARIOS',[head,...existing]);replay(c,s,rows);
 assert.deepEqual(s.rows,[head,...existing,...rows]);
});
test('se preservan sedes distintas con el mismo código y cliente',()=>{
 const {c}=context();const headers=[...head,'BASE'];const old=[...line('260227_SG',6),'GYE'];const row=[...line('260227_SG',6),'UIO'];
 const s=new Sheet('INVENTARIOS',[headers,old,row]);c._consolPurgarFilasDelLote(s,c._consolPrepararReemplazo(s,[row],headers));append(s,[row]);assert.deepEqual(s.rows,[headers,old,row]);
});
test('filas REGISTRO sin ID: reintento exacto, multiplicidad y filas ajenas preservadas',()=>{
 const {c}=context();const row=line('',1);const other=line('',2);const s=new Sheet('REGISTRO',[head,row,row,other]);
 replay(c,s,[row,row]);replay(c,s,[row,row]);assert.deepEqual(s.rows,[head,other,row,row]);
});
test('ID Drive duplicado en el panel se procesa una vez',()=>{
 const {c}=context();const entries=[{id:'drive-A',cliente:'SG'},{id:' drive-A ',cliente:'SG'},{id:'drive-B',cliente:'OTRO'},{id:''}];
 assert.deepEqual(Array.from(c._consolEntradasUnicas(entries),e=>e.id),['drive-A','drive-B']);
});
test('cabecera ID ausente o desalineada bloquea antes de borrar',()=>{
 const {c}=context();const s=new Sheet('INVENTARIOS',[['PRODUCTO'],['5539541827']]);
 assert.throws(()=>c._consolPrepararReemplazo(s,[line('260227_SG',1)],head),/columna ID/);assert.equal(s.rows.length,2);
 const reordered=[...head];[reordered[2],reordered[3]]=[reordered[3],reordered[2]];
 assert.throws(()=>c._consolPrepararReemplazo(new Sheet('INVENTARIOS',[reordered]),[line('260227_SG',1)],head),/incompatibles/);
});
test('fallo de purga se propaga y no permite append silencioso',()=>{
 const {c}=context();const rows=[line('260227_SG',1)];const s=new Sheet('INVENTARIOS',[head,...rows]);s.failDelete=true;
 assert.throws(()=>replay(c,s,rows),/delete failure/);assert.deepEqual(s.rows,[head,...rows]);
});
function workflow(){
 const ctx=context();const {c}=ctx;
 const ids=['drive-file-A-long-identity','drive-file-B-long-identity'];
 const rows=[line('260227_SG',6),line('260508_SG',114)];
 const sheets={'PANEL DE CONTROL':new Sheet('PANEL DE CONTROL',[['CLIENTE','LINK','ID','INICIO','FIN','BASE','AVANCE'],...ids.map(id=>['SG','',id,'','','UIO','Entregado']),['SG','',ids[0],'','','UIO','Entregado']]),INVENTARIOS:new Sheet('INVENTARIOS',[head]),REGISTRO:new Sheet('REGISTRO',[head])};
 const master=book(sheets);const children={};
 ids.forEach((id,i)=>{const inv=new Sheet('PLANILLA DE CONTEO FISICO',[head,rows[i]]);const reg=new Sheet('REGISTRO',[head,rows[i]]);children[id]=book({'PLANILLA DE CONTEO FISICO':inv,REGISTRO:reg});if(i===0)inv.onRead=()=>ctx.setTime(302000)});
 c._getSS=()=>master;c.extractIdFromUrl=v=>v;c.safeOpenSpreadsheet=id=>({ss:children[id]});
 c._normalizarFechasMatriz=rows=>rows;c._stringificarFechasFinales=rows=>rows;
 c.invalidarCacheSeries=()=>{};c.generarLogConsolidacion=()=>{};c._equipoHashActivo=()=>'';
 return {...ctx,sheets,rows,ids};
}
test('núcleo real: corte en lotes, fallo entre INV/REG y reanudaciones sin duplicados ni totales inflados',()=>{
 const {c,props,setTime,sheets,rows}=workflow();
 let result=c._consolidarNucleo({contexto:'web'});assert.equal(result.enCurso,true);assert.equal(props.CONSOL_NEXT_IDX,'1');assert.equal(props.CONSOL_TOTAL,'2');
 assert.deepEqual(businessRows(sheets.INVENTARIOS),[head,rows[0]]);
 setTime(303000);sheets.REGISTRO.failWrite=true;
 assert.throws(()=>c._consolidarNucleo({_continuacion:true}),/write failure/);
 assert.equal(props.CONSOL_NEXT_IDX,'1');assert.equal(JSON.parse(props.CONSOL_ACC).filas,1);
 assert.deepEqual(businessRows(sheets.INVENTARIOS),[head,...rows]);
 setTime(304000);result=c._consolidarNucleo({_continuacion:true});
 assert.equal(result.ok,true);assert.equal(result.filasIncluidas,2);assert.equal(result.sumaCantidad,30);
 assert.deepEqual(businessRows(sheets.INVENTARIOS),[head,...rows]);assert.deepEqual(businessRows(sheets.REGISTRO),[head,...rows]);
 assert.equal(c._consolidarNucleo({_continuacion:true}).noop,true);
});
test('núcleo real: purga fallida no avanza checkpoint ni vuelve a insertar',()=>{
 const {c,props,setTime,sheets,rows,ids}=workflow();c._consolidarNucleo({contexto:'web'});setTime(303000);
 append(sheets.INVENTARIOS,[[...rows[1],ids[1]]]);sheets.INVENTARIOS.failDelete=true;
 assert.throws(()=>c._consolidarNucleo({_continuacion:true}),/delete failure/);assert.equal(props.CONSOL_NEXT_IDX,'1');assert.deepEqual(businessRows(sheets.INVENTARIOS),[head,...rows]);
});
test('núcleo real: prevalidación deja INVENTARIOS y REGISTRO intactos',()=>{
 const {c,setTime,sheets}=workflow();const before=structuredClone([sheets.INVENTARIOS.rows,sheets.REGISTRO.rows]);
 c._consolidarNucleo({modo:'reporte_solo',contexto:'web'});setTime(303000);const result=c._consolidarNucleo({_continuacion:true});
 assert.equal(result.sinEscribir,true);assert.deepEqual([sheets.INVENTARIOS.rows,sheets.REGISTRO.rows],before);
});

test('núcleo real: duplicado intraarchivo no infla Suma Cantidad',()=>{
 const {c,setTime,rows}=workflow();
 const abrir=c.safeOpenSpreadsheet;
 c.safeOpenSpreadsheet=id=>{
  const result=abrir(id);
  const sh=result.ss.getSheetByName('PLANILLA DE CONTEO FISICO');
  if(sh.rows.length===2)sh.rows.push([...sh.rows[1]]);
  return result;
 };
 c._consolidarNucleo({contexto:'web'});setTime(303000);
 const result=c._consolidarNucleo({_continuacion:true});
 assert.equal(result.filasIncluidas,2);assert.equal(result.duplicados,2);
 assert.equal(result.sumaCantidad,rows.reduce((sum,row)=>sum+row[9],0));
});
test('snapshot anterior con referencias repetidas mantiene índices y no repite archivos',()=>{
 const {c,setTime,sheets,props,ids,rows}=workflow();c._consolidarNucleo({contexto:'web'});
 sheets.__CACHE_CONSOLIDACION.rows.push([2,'SG',ids[0],'PENDIENTE','']);props.CONSOL_TOTAL='3';
 setTime(303000);const result=c._consolidarNucleo({_continuacion:true});
 assert.equal(result.ok,true);assert.equal(props.CONSOL_NEXT_IDX,'3');
 assert.deepEqual(businessRows(sheets.INVENTARIOS),[head,...rows]);
});
test('HYCITE: dos IDs Drive con 174 filas idénticas en lotes distintos producen 174 filas',()=>{
 const w=workflow();const {c,setTime,sheets,props,ids}=w;
 const rows=Array.from({length:174},(_,i)=>line('250814_HYCITE',i+1,'HYCITE','POS-'+i,1));
 const abrir=c.safeOpenSpreadsheet;
 c.safeOpenSpreadsheet=id=>{
  const r=abrir(id);r.ss.getSheetByName('PLANILLA DE CONTEO FISICO').rows=[head,...structuredClone(rows)];
  r.ss.getSheetByName('REGISTRO').rows=[head,...structuredClone(rows)];return r;
 };
 c._consolidarNucleo({contexto:'web'});setTime(303000);
 const result=c._consolidarNucleo({_continuacion:true});
 assert.equal(result.filasIncluidas,174);assert.equal(result.registroIncluidas,174);assert.equal(result.sumaCantidad,174);
 assert.equal(result.duplicados,174);assert.deepEqual(businessRows(sheets.INVENTARIOS),[head,...rows]);
 assert.equal(props.CONSOL_KPI_RUN,props.CONSOL_RUN_TOKEN);
 const audit=sheets.AUDITORIA_CONSOLIDACION.rows;
 assert.equal(audit.filter(r=>r[2]===ids[1]).length,1);
 assert.equal(audit.find(r=>r[2]===ids[1])[6],'COPIA_IDENTICA_ENTRE_ARCHIVOS');
});
test('copias físicas en un mismo lote tampoco duplican inventario',()=>{
 const {c,sheets}=workflow();const abrir=c.safeOpenSpreadsheet;
 c.safeOpenSpreadsheet=id=>{
  const r=abrir(id);const inv=r.ss.getSheetByName('PLANILLA DE CONTEO FISICO');inv.onRead=null;
  inv.rows=[head,line('250814_HYCITE',1,'HYCITE')];r.ss.getSheetByName('REGISTRO').rows=[head];return r;
 };
 const r=c._consolidarNucleo({contexto:'web',incluir:'INV'});assert.equal(r.filasIncluidas,1);assert.equal(sheets.INVENTARIOS.rows.length,2);
});
test('mismo código con cantidades distintas bloquea KPI, no elige una fuente silenciosamente',()=>{
 const {c,props,setTime,sheets}=workflow();const abrir=c.safeOpenSpreadsheet;
 let n=0;c.safeOpenSpreadsheet=id=>{const r=abrir(id);r.ss.getSheetByName('PLANILLA DE CONTEO FISICO').rows=[head,line('250814_HYCITE',1,'HYCITE','P',++n)];return r};
 c._consolidarNucleo({contexto:'web'});setTime(303000);
 assert.throws(()=>c._consolidarNucleo({_continuacion:true}),/contradictorio/);
 assert.equal(props.CONSOL_STATUS,'ERROR');assert.equal(props.CONSOL_KPI_RUN,'');assert.equal(sheets.INVENTARIOS.rows.length,2);
});
test('la auditoría se reemplaza al reintentar un lote fallido',()=>{
 const {c,setTime,sheets,ids}=workflow();c._consolidarNucleo({contexto:'web'});setTime(303000);sheets.REGISTRO.failWrite=true;
 assert.throws(()=>c._consolidarNucleo({_continuacion:true}),/write failure/);
 setTime(304000);c._consolidarNucleo({_continuacion:true});
 assert.equal(sheets.AUDITORIA_REGISTRO.rows.filter(r=>r[2]===ids[1]).length,1);
 assert.equal(sheets.AUDITORIA_CONSOLIDACION.rows.filter(r=>r[0]==='TOTAL').length,1);
});
test('corrida anterior al parche no puede continuar con las hojas duplicadas',()=>{
 const {c,props}=workflow();props.CONSOL_STATUS='EN_CURSO';props.CONSOL_VERSION='';
 assert.throws(()=>c._consolidarNucleo({_continuacion:true}),/código anterior/);assert.equal(props.CONSOL_STATUS,'ERROR');
});
test('cierre con filas ajenas añadidas al consolidado bloquea KPI',()=>{
 const {c,setTime,sheets,props}=workflow();c._consolidarNucleo({contexto:'web'});
 append(sheets.INVENTARIOS,[line('AJENO',1)]);setTime(303000);
 assert.throws(()=>c._consolidarNucleo({_continuacion:true}),/KPI no validado/);assert.equal(props.CONSOL_KPI_RUN,'');
});
test('archivo inaccesible no termina con KPI validado',()=>{
 const {c,setTime,props,ids}=workflow();const abrir=c.safeOpenSpreadsheet;c.safeOpenSpreadsheet=id=>id===ids[1]?{ss:null,error:'sin acceso'}:abrir(id);
 c._consolidarNucleo({contexto:'web'});setTime(303000);
 assert.throws(()=>c._consolidarNucleo({_continuacion:true}),/sin procesar/);assert.equal(props.CONSOL_KPI_RUN,'');
});
test('IBM autorizado: mismo código con dos contenidos conserva dos orígenes y sus reintentos',()=>{
 const {c,setTime,sheets,ids}=workflow();const abrir=c.safeOpenSpreadsheet;
 c.safeOpenSpreadsheet=id=>{
  const r=abrir(id);const row=line('250724_IBM',1,'IBM','P',id===ids[0]?1:2);
  r.ss.getSheetByName('PLANILLA DE CONTEO FISICO').rows=[head,row];r.ss.getSheetByName('REGISTRO').rows=[head,row];return r;
 };
 c._consolidarNucleo({contexto:'web'});setTime(303000);sheets.REGISTRO.failWrite=true;
 assert.throws(()=>c._consolidarNucleo({_continuacion:true}),/write failure/);setTime(304000);
 const result=c._consolidarNucleo({_continuacion:true});
 assert.equal(result.filasIncluidas,2);assert.equal(result.sumaCantidad,3);
 assert.equal(sheets.INVENTARIOS.rows[0].at(-1),'ORIGEN_DRIVE');
 assert.deepEqual(sheets.INVENTARIOS.rows.slice(1).map(r=>r.at(-1)),ids);
});
test('VENTURA permanece bloqueado según la respuesta del usuario',()=>{
 const {c,props}=workflow();const abrir=c.safeOpenSpreadsheet;
 c.safeOpenSpreadsheet=id=>{const r=abrir(id);r.ss.getSheetByName('PLANILLA DE CONTEO FISICO').rows=[head,line('260907_VENTURA',1,'VENTURA')];return r};
 assert.throws(()=>c._consolidarNucleo({contexto:'web'}),/VENTURA.*bloqueado/);assert.equal(props.CONSOL_KPI_RUN,'');
});
