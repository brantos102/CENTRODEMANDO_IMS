import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validarRegistroRuntimeERP,registroERPDesdeEntorno,metadatosConexionesERP} from '../src/conexiones/registro-runtime.mjs';
import {crearGestorVistasERP,seleccionERP} from '../src/conexiones/vistas-erp.mjs';
const USER='USUARIO_NO_PUBLICAR',PASS='PASSWORD_NO_PUBLICAR',TOKEN='TOKEN_NO_PUBLICAR';
function cuenta(sede,etiqueta,codigo=etiqueta){return {referencia:createHash('sha256').update(JSON.stringify([sede,etiqueta])).digest('hex').slice(0,24),sede,etiqueta,userid:USER+'_'+etiqueta,password:PASS,clienteId:null,clienteNombre:etiqueta.startsWith('ALU')?'ALU':etiqueta,codigosCliente:[codigo]};}
const registro=()=>({formato:'ims-erp-runtime-v1',modo:'solo_previsualizacion',conexiones:[cuenta('UIO','BELIA'),cuenta('GYE','ALU'),cuenta('GYE','ALU SWAP')]});
const solicitud=(c,parches={})=>({consultaId:randomUUID(),sede:c.sede,modo:'SKU',referencias:[c.referencia],skus:[],posiciones:[],incluirVariantes:true,...parches});
const stock=(cod,sku='0001',pos='A')=>({'COD. CLIENTE':cod,'COD. PRODUCTO':sku,NAVE:pos,CANTIDAD:'1e3'});
async function terminar(g,actor,id){for(let i=0;i<100;i++){const r=g.consultar(actor,id);if(r.estado!=='CONSULTANDO')return r;await new Promise(r=>setTimeout(r,1));}throw Error('No terminó la prueba');}
test('perfil privado se valida sin revelar secretos y rechaza códigos repetidos, referencias falsas y destinos ajenos',()=>{
 const r=registro(),b=Buffer.from(JSON.stringify(r)).toString('base64');assert.equal(registroERPDesdeEntorno({IMS_ERP_REGISTRO_BASE64:b}).length,3);
 const meta=JSON.stringify(metadatosConexionesERP(validarRegistroRuntimeERP(r)));for(const secreto of [USER,PASS])assert.equal(meta.includes(secreto),false);
 for(const mutar of [r=>r.conexiones.push({...r.conexiones[1]}),r=>r.conexiones[1].sede='http://otra',r=>r.conexiones[1].password+='\n',r=>r.conexiones[1].referencia='0'.repeat(24),r=>r.conexiones[2].codigosCliente=['ALU']]){const x=registro();mutar(x);assert.throws(()=>validarRegistroRuntimeERP(x));}
 assert.throws(()=>registroERPDesdeEntorno({IMS_ERP_REGISTRO_BASE64:b+'\n'}));
});
test('validación del entorno admite la expansión base64 del registro y solo publica metadatos',()=>{
 const r={formato:'ims-erp-runtime-v1',modo:'solo_previsualizacion',conexiones:Array.from({length:4},(_,i)=>({...cuenta('GYE','CUENTA'+i),userid:'u'.repeat(6000),password:'p'.repeat(7000)}))};
 const raw=JSON.stringify(r),env={IMS_ERP_HABILITADO:'1',IMS_ERP_REGISTRO_BASE64:Buffer.from(raw).toString('base64')};
 assert.ok(Buffer.byteLength(raw)<65536);assert.ok(Buffer.byteLength(JSON.stringify(env))>65536);
 const proceso=spawnSync(process.execPath,[fileURLToPath(new URL('../tools/validar-erp-runtime.mjs',import.meta.url)),'--entorno'],{input:JSON.stringify(env),encoding:'utf8',timeout:10000});
 assert.equal(proceso.status,0);assert.deepEqual(JSON.parse(proceso.stdout),{ok:true,conexiones:4,sedes:['GYE'],solo_previsualizacion:true});
 assert.equal(proceso.stdout.includes('p'.repeat(20)),false);assert.equal(proceso.stderr,'');
});
test('posiciones recorren todas las cuentas habilitadas de la sede y SKU no acepta credenciales ni selecciones cruzadas',()=>{
 const cs=registro().conexiones,c=cs[1],s=seleccionERP(solicitud(c,{modo:'POSICIONES',referencias:[],posiciones:[' a '],incluirVariantes:false}),cs);assert.deepEqual(s.posiciones,['A']);assert.equal(s.referencias.length,2);
 for(const p of [{referencias:[cs[0].referencia]},{userid:USER},{modo:'POSICIONES',posiciones:[],incluirVariantes:false},{modo:'POSICIONES',posiciones:['A'],skus:['X'],incluirVariantes:false}])assert.throws(()=>seleccionERP(solicitud(c,p),cs));
});
test('vista conserva códigos/SKU repetidos entre cuentas, unidades exactas y no revela credenciales',async()=>{
 const cs=validarRegistroRuntimeERP(registro()),calls=[];
 // Cada credencial responde SU cuenta, sin unir líneas de subclientes por SKU.
 let actual;
 const f=crearGestorVistasERP({conexiones:cs,fetchImpl:async(url,opts)=>{calls.push(url);if(url.endsWith('gettoken')){actual=opts.headers.userid.endsWith('ALU SWAP')?'ALU SWAP':'ALU';return new Response(JSON.stringify({token:TOKEN}));}return new Response(JSON.stringify([stock(actual)]));}});
 const s=solicitud(cs[1],{modo:'POSICIONES',referencias:[],posiciones:['A'],incluirVariantes:false});f.iniciar('actor',s,async()=>{});const r=await terminar(f,'actor',s.consultaId);
 assert.equal(r.estado,'LISTA');assert.equal(r.totales.lineas,2);assert.equal(r.totales.unidades,'2000.000000000');assert.deepEqual(new Set(r.filas.map(f=>f.codigoClienteERP)),new Set(['ALU','ALU SWAP']));assert.ok(r.filas.every(f=>f.sku==='0001'&&f.clienteNombre==='ALU'));
 for(const secreto of [USER,PASS,TOKEN])assert.equal(JSON.stringify(r).includes(secreto),false);assert.equal(r.soloPrevisualizacion,true);
});
test('filtros SKU con variantes y posiciones mantienen su alcance y no se intersectan accidentalmente',async()=>{
 const cs=registro().conexiones;
 const g=crearGestorVistasERP({conexiones:cs,fetchImpl:async url=>new Response(url.endsWith('gettoken')?'{"token":"t"}':JSON.stringify([stock('BELIA','001','X'),stock('BELIA','001_U','Y'),stock('BELIA','002','X')]))});
 const a=solicitud(cs[0],{skus:['001'],incluirVariantes:true});g.iniciar('actor',a,async()=>{});const r=await terminar(g,'actor',a.consultaId);assert.equal(r.totales.lineas,2);
 const b=solicitud(cs[0],{modo:'POSICIONES',referencias:[],posiciones:['X'],incluirVariantes:false});g.iniciar('actor',b,async()=>{});const q=await terminar(g,'actor',b.consultaId);assert.deepEqual(q.filas.map(f=>f.sku),['001','002']);
});
test('sin resultados parciales: fallo, cuenta nueva o permiso revocado dejan ERROR sin filas',async()=>{
 const cs=registro().conexiones;
 for(const modo of ['fallo','ajena','revocada']){
  let auth=0;const g=crearGestorVistasERP({conexiones:cs,fetchImpl:async url=>{if(modo==='fallo')throw Error(PASS);return new Response(url.endsWith('gettoken')?'{"token":"t"}':JSON.stringify([stock(modo==='ajena'?'OTRO':'BELIA')]));}}),s=solicitud(cs[0]);
  g.iniciar('actor',s,async()=>{if(modo==='revocada'&&++auth>1)throw Object.assign(Error(USER),{codigo:'SIN_PERMISO'});});const r=await terminar(g,'actor',s.consultaId);assert.equal(r.estado,'ERROR');assert.equal(r.filas,undefined);assert.equal(JSON.stringify(r).includes(PASS),false);assert.equal(JSON.stringify(r).includes(USER),false);
 }
});
test('consulta ligada al actor: misma solicitud no repite extracción, otra selección no reutiliza ID y caduca',async()=>{
 let reloj=0,llamadas=0;const cs=registro().conexiones,g=crearGestorVistasERP({conexiones:cs,ahora:()=>reloj,fetchImpl:async url=>{llamadas++;return new Response(url.endsWith('gettoken')?'{"token":"t"}':'[]');}}),s=solicitud(cs[0]);
 g.iniciar('a',s,async()=>{});g.iniciar('a',s,async()=>{});await terminar(g,'a',s.consultaId);assert.equal(llamadas,2);
 assert.throws(()=>g.consultar('b',s.consultaId));assert.throws(()=>g.iniciar('a',{...s,skus:['X']},async()=>{}));reloj=600001;assert.throws(()=>g.consultar('a',s.consultaId));
});
test('una extracción a la vez y límite de selección: no se publican filas al exceder tamaño',async()=>{
 let liberar;const espera=new Promise(r=>liberar=r),cs=registro().conexiones,g=crearGestorVistasERP({conexiones:cs,maxFilas:1,fetchImpl:async url=>{await espera;return new Response(url.endsWith('gettoken')?'{"token":"t"}':JSON.stringify([stock('BELIA'),stock('BELIA','OTRO')]));}}),s=solicitud(cs[0]);
 g.iniciar('a',s,async()=>{});assert.throws(()=>g.iniciar('b',solicitud(cs[0]),async()=>{}));liberar();const r=await terminar(g,'a',s.consultaId);assert.equal(r.estado,'ERROR');assert.equal(r.filas,undefined);
});
