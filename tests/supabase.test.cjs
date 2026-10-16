const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {context,Sheet,book}=require('./helpers/gas.cjs');
function setup(rows=[['A',1],['B',2],['A',3]]){
 const ctx=context();const {c,props}=ctx;
 vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../SUPABASE.js'),'utf8'),c);
 const inv=new Sheet('INVENTARIOS',[['ID','VALOR'],...rows]);
 const sheets={INVENTARIOS:inv,REGISTRO:new Sheet('REGISTRO',[['ID','VALOR'],...rows])};c._getSS=()=>book(sheets);
 Object.assign(props,{CONSOL_RUN_TOKEN:'run-1',CONSOL_STATUS:'COMPLETADO',CONSOL_KPI_RUN:'run-1',CONSOL_KPI_FILAS:String(rows.length),CONSOL_KPI_REG_RUN:'run-1',CONSOL_KPI_REG_FILAS:String(rows.length)});
 const calls=[];c._supabaseFetch=(path,method,body)=>{calls.push({path,method,body});return {code:201,body:''}};
 const reconcile=()=>c._sbReconciliarPorArchivo('INVENTARIOS','inventarios','SB_RECON_INV',()=>({}),r=>({archivo_id:r[0],valor:r[1]}));
 return {...ctx,sheets,calls,reconcile};
}
test('Supabase reúne tramos A/B/A y borra A una sola vez preservando ambas filas',()=>{
 const {c,sheets,calls,reconcile}=setup();const groups=c._sbBloquesPorArchivo(sheets.INVENTARIOS,0);
 assert.equal(groups.length,2);assert.equal(groups[0].n,2);assert.equal(groups[0].bloques.length,2);
 const r=reconcile();assert.equal(r.ok,true);assert.equal(r.filas,3);assert.equal(r.archivos,2);
 assert.equal(calls.filter(x=>x.method==='delete'&&x.path.includes('eq.A')).length,1);
 const a=calls.find(x=>x.method==='post'&&x.body[0].archivo_id==='A').body;
 assert.deepEqual(Array.from(a,r=>r.fila_origen),[2,4]);
});
test('fuente parcial o sin validación no genera ninguna petición a Supabase',()=>{
 const {props,calls,reconcile}=setup();props.CONSOL_STATUS='EN_CURSO';assert.throws(reconcile,/Supabase pausado/);assert.equal(calls.length,0);
 props.CONSOL_STATUS='COMPLETADO';props.CONSOL_KPI_RUN='';assert.throws(reconcile,/Supabase pausado/);assert.equal(calls.length,0);
});
test('una nueva corrida reinicia el índice de reconciliación anterior',()=>{
 const {props,reconcile,calls}=setup();props.SB_RECON_INV='1';props.SB_RECON_INV_RUN='old';reconcile();
 assert.equal(calls[0].path,'inventarios?archivo_id=eq.A');assert.equal(props.SB_RECON_INV_RUN,'run-1');
});
test('rechazo parcial informa filas reales y conserva checkpoint en el archivo fallido',()=>{
 const {c,props,reconcile}=setup([['A',1],['A',2]]);let fallar=true;const remote=[];
 c._supabaseFetch=(path,method,body)=>{
  if(method==='delete'){remote.length=0;return {code:204}}
  if(fallar&&(body.length>1||body[0].valor===2))return {code:400};
  remote.push(...body);return {code:201};
 };
 let r=reconcile();assert.equal(r.ok,false);assert.equal(r.completo,false);assert.equal(r.filas,1);assert.equal(props.SB_RECON_INV,'0');
 fallar=false;r=reconcile();assert.equal(r.ok,true);assert.equal(r.filas,2);assert.equal(remote.length,2);
});
test('el mismo lock impide publicar mientras otra ejecución escribe',()=>{
 const {c,calls}=setup();c.LockService={getScriptLock:()=>({tryLock:()=>false})};
 assert.equal(c.reconciliarInventariosSupabase().ok,false);assert.equal(calls.length,0);
});
test('REGISTRO de otra corrida no se publica con la validación de INVENTARIOS',()=>{
 const {c,props,calls}=setup();props.CONSOL_KPI_REG_RUN='old';
 assert.throws(()=>c.reconciliarRegistroSupabase(),/REGISTRO requiere/);assert.equal(calls.length,0);
});
test('el mapeo conserva archivo_id y publica origen_drive para distinguir IBM',()=>{
 const {c}=setup();const h=['ID','CLIENTE','PRODUCTO','ORIGEN_DRIVE'];
 const r=c._sbMapInventarios(['250724_IBM','IBM','SKU','drive-A'],h,c._sbColsInventarios(h));
 assert.equal(r.archivo_id,'250724_IBM');assert.equal(r.origen_drive,'drive-A');
});
test('nombres antiguos de migración y sincronización no evitan el guard de validación',()=>{
 const {c,props,calls}=setup();props.CONSOL_KPI_RUN='';
 for(const name of ['migrarInventariosASupabase','migrarRegistroASupabase','sincronizarInventariosSupabase','sincronizarRegistroSupabase','sincronizarTodoSupabase'])assert.throws(()=>c[name](),/Supabase pausado/);
 assert.equal(calls.length,0);
});
test('fase completa no se borra otra vez en la misma corrida; reinicio explícito sí permite refrescar',()=>{
 const {c,calls,reconcile}=setup();reconcile();const count=calls.length;
 assert.equal(reconcile().yaSincronizado,true);assert.equal(calls.length,count);
 c.reiniciarReconciliacionSupabase();reconcile();assert.ok(calls.length>count);
});
test('sincronización horaria usa un presupuesto compartido y no declara completa una publicación parcial',()=>{
 const {c,setTime}=setup();let advanced=false;
 for(const fn of ['migrarPanelASupabase','migrarCronogramaASupabase','migrarEquipoASupabase','migrarClientesASupabase'])c[fn]=()=>({ok:true});
 c._sbColsInventarios=()=>({});c._sbColsRegistro=()=>({});
 c._sbMapInventarios=r=>({archivo_id:r[0]});c._sbMapRegistro=c._sbMapInventarios;
 c._supabaseFetch=()=>{if(!advanced){setTime(220000);advanced=true}return {code:201}};
 const r=c.sincronizarTodoSupabase();assert.equal(r.completo,false);assert.equal(r.registro.archivos,0);
 assert.equal(c.sincronizarTodoSupabase().completo,true);
});
