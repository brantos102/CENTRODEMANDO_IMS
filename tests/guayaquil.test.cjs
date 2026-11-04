const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {context}=require('./helpers/gas.cjs');
function setup(){
  const f=context();
  for(const file of ['ITSANET_API.gs.js','ITSANET_API_GYE.js','ITSANET_ROUTER.js','ITSANET_MULTI.js']){
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),f.c,{filename:file});
  }
  return f;
}
function row(client,qty=5,dispatch='D1',sku='SKU-1',serial=''){
  const f=Array(17).fill('');Object.assign(f,{4:client,6:sku,7:'Producto',8:serial,9:'L1',10:dispatch,11:'P1',12:'DISPONIBLE',13:'NUV',14:'POS-1',15:'UN',16:qty});return f;
}
function stock(client,qty=5,dispatch='D1',sku='SKU-1',serial=''){
 return {'COD. CLIENTE':client,'COD. PRODUCTO':sku,'DESCRIPCION':'Producto','NRO. SERIE':serial,'NRO. LOTE':'L1','NRO. DESPACHO':dispatch,'NRO. PARTIDA':'P1','CAT. LOG.':'DISPONIBLE','EST. MERC.':'NUV','NAVE':'POS','CALLE':'1','UNIDAD':'UN','CANTIDAD':qty};
}
function multiFixture(items){const f=setup();f.c._extraerStockConAlias=(_,cli)=>({datosLimpios:[items[cli]],reporte:{totalLeidas:1,clientesEfectivos:[items[cli][4]]}});return f.c;}

test('multi: mismo SKU/serie/lote/posición de clientes diferentes conserva ambas cantidades',()=>{
 const c=multiFixture({ALU:row('ALU',5),HYCITE:row('HYCITE',7)});
 const r=c.previsualizarStockMulti('GYE',['ALU','HYCITE']);
 assert.equal(r.datosLimpios.length,2);assert.equal(r.reporte.sumaCantidad,12);
 assert.deepEqual(Array.from(r.datosLimpios,x=>x[4]),['ALU','HYCITE']);
});
test('multi: despachos distintos bajo el mismo código ERP no se descartan',()=>{
 const c=multiFixture({CRED1:row('REAL',5,'D1'),CRED2:row('REAL',7,'D2')});
 const r=c.previsualizarStockMulti('UIO',['CRED1','CRED2']);assert.equal(r.datosLimpios.length,2);assert.equal(r.reporte.sumaCantidad,12);
});
test('multi: coincidencia completa de dos credenciales del mismo cliente se cuenta una vez',()=>{
 const c=multiFixture({CRED1:row('REAL',5),CRED2:row('REAL',5)});
 const r=c.previsualizarStockMulti('GYE',['CRED1','CRED2']);assert.equal(r.datosLimpios.length,1);assert.equal(r.reporte.sumaCantidad,5);
});
test('multi: stock contradictorio de la misma identidad no elige una cantidad silenciosamente',()=>{
 const c=multiFixture({CRED1:row('REAL',5),CRED2:row('REAL',7)});
 assert.throws(()=>c.previsualizarStockMulti('GYE',['CRED1','CRED2']),/contradictorio/i);
});
test('router y alias ERP conservan sede y excluyen alias pedidos con credencial propia',()=>{
 const {c}=setup(),calls=[];
 c.previsualizarStockItsanet=()=>{calls.push('UIO');return{datosLimpios:[row('ALU')],reporte:{}}};
 c.previsualizarStockItsanet_GYE=()=>{calls.push('GYE');return{datosLimpios:[row('ALU')],reporte:{}}};
 c.previsualizarStockRouter('GYE','ALU');c.previsualizarStockRouter('QUITO','ALU');assert.deepEqual(calls,['GYE','UIO']);
 assert.deepEqual(Array.from(c._aliasClienteERP('NOKIACNTLTE',[{cliente:'NOKIACNT'},{cliente:'NOKIA5G'}],{NOKIA5G:true})),['NOKIACNT']);
});
test('GYE: token cacheado no reutiliza el token UIO ni consulta el ERP',()=>{
 const {c,props}=setup();c.Utilities.formatDate=()=> '2026-10-29';
 props.CREDGYE_API_ALU=JSON.stringify({user:'fixture',pass:'fixture'});props.ITSANET_TOKEN_GYE_ALU='fixture-gye';props.FECHA_TOKEN_GYE_ALU='2026-10-29';props.ITSANET_TOKEN_ALU='fixture-uio';
 c.UrlFetchApp={fetch(){throw Error('No debe consultarse el ERP real');}};
 assert.equal(c.obtenerORenovarTokenWMS_GYE('ALU'),'fixture-gye');assert.equal(props.ITSANET_TOKEN_ALU,'fixture-uio');
});
for(const site of ['UIO','GYE']){
 const name=site==='GYE'?'previsualizarStockItsanet_GYE':'previsualizarStockItsanet';
 const fetch=site==='GYE'?'consultarStockItsanet_GYE':'consultarStockItsanet';
 test(site+': alias con clientes distintos no mezcla sus cantidades',()=>{
  const {c}=setup();c[fetch]=()=>({code:200,body:JSON.stringify([stock('A',5),stock('B',7)])});
  const r=c[name]('CRED',null,false,['A','B']);assert.equal(r.datosLimpios.length,2);assert.equal(r.reporte.sumaCantidad,12);
 });
 test(site+': misma serie con despachos distintos conserva ambas líneas y regla de una unidad',()=>{
  const {c}=setup();c[fetch]=()=>({code:200,body:JSON.stringify([stock('A',9,'D1','SKU','S1'),stock('A',8,'D2','SKU','S1')])});
  const r=c[name]('A');assert.equal(r.datosLimpios.length,2);assert.equal(r.reporte.sumaCantidad,2);
 });
 test(site+': repeticiones sin serie de la misma identidad siguen sumándose',()=>{
  const {c}=setup();c[fetch]=()=>({code:200,body:JSON.stringify([stock('A',5),stock('A',7)])});
  const r=c[name]('A');assert.equal(r.datosLimpios.length,1);assert.equal(r.reporte.sumaCantidad,12);
 });
}

function creationFixture(){
 const f=setup(),writes=[],created=[];
 const sheet={getRange:(row,col)=>typeof row==='string'?{getValues:()=>[['CLIENTE']]}:{setValue(value){writes.push({row,col,value});return this;}}};
 f.c._getSS=()=>({getSheetByName:()=>sheet});
 f.c.DriveApp={getFolderById:()=>({getName:()=> 'fixture-folder'}),getFileById:()=>({makeCopy(){created.push(true);return{getId:()=> 'fixture-file',getUrl:()=> 'https://example.invalid/file'};}})};
 f.c._compartirArchivoConEquipo=()=>({});f.c._usuarioActual=()=> '';f.c.Session={getScriptTimeZone:()=> 'America/Guayaquil'};f.c.Utilities.formatDate=()=> '29/10/2026 10:00:00';
 return{...f,writes,created};
}
for(const method of ['procesarCreacionArchivo','_procesarCreacionArchivoInline']){
 test(method+': registra la sede GYE en la columna SEDE existente',()=>{
  const f=creationFixture();f.c[method]({folderId:'folder',fileName:'fixture',clientName:'ALU',dataSource:'BLANK',sede:'GYE'});
  assert.equal(f.writes.find(w=>w.col===6)?.value,'GYE');assert.equal(f.created.length,1);
 });
 test(method+': conserva Quito por defecto y rechaza una sede inválida antes de crear archivos',()=>{
  let f=creationFixture();f.c[method]({folderId:'folder',fileName:'fixture',clientName:'ALU',dataSource:'BLANK'});
  assert.equal(f.writes.find(w=>w.col===6)?.value,'UIO');
  f=creationFixture();assert.throws(()=>f.c[method]({folderId:'folder',fileName:'fixture',clientName:'ALU',sede:'OTRA'}),/sede/i);assert.equal(f.created.length,0);
 });
}
