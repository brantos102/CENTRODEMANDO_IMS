import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {crearPoolConteos} from '../../src/mysql/conteos.mjs';
import {fixtureERP,esquemaERP} from '../fixtures/erp-api.mjs';
if(process.env.IMS_MYSQL_PRUEBAS!=='1'||!/^centromando_ims_pruebas(?:_[a-z0-9]+)?$/.test(process.env.MYSQL_DATABASE||''))throw Error('Solo base propia de pruebas.');
let pool;before(async()=>{pool=await crearPoolConteos(process.env);await esquemaERP(pool);});after(async()=>{await pool?.end();});
const solicitud=(f,c=f.conexiones[1])=>({consultaId:randomUUID(),sede:c.sede,modo:'SKU',referencias:[c.referencia],skus:[],posiciones:[],incluirVariantes:true});
async function esperar(f,s,id){for(let i=0;i<100;i++){const r=await f.req('/api/erp/consultas/'+id,s);if(r.data.estado!=='CONSULTANDO')return r;await new Promise(r=>setTimeout(r,2));}throw Error('Consulta no terminada');}
test('ERP exige sesión, ámbito de sede y CSRF antes de cualquier petición al proveedor',async t=>{
 const f=await fixtureERP(pool,t,{sedes:['UIO']}),s=await f.login();assert.equal((await f.req('/api/erp/conexiones')).response.status,401);
 const meta=await f.req('/api/erp/conexiones',s);assert.equal(meta.response.status,200);assert.deepEqual(meta.data.sedes,['UIO']);assert.equal(meta.data.conexiones.length,1);assert.equal(JSON.stringify(meta.data).includes('USUARIO_PRIVADO'),false);
 assert.equal((await f.req('/api/erp/consultas',{...s,method:'POST',body:solicitud(f)})).response.status,403);
 assert.equal((await f.req('/api/erp/consultas',{...s,csrf:null,method:'POST',body:solicitud(f,f.conexiones[0])})).response.status,403);
 assert.equal((await f.req('/api/erp/consultas',{...s,origin:'https://otra.invalid',method:'POST',body:solicitud(f,f.conexiones[0])})).response.status,403);assert.equal(f.red.calls.length,0);
 const lector=await fixtureERP(pool,t,{sedes:[]}),l=await lector.login();assert.equal((await lector.req('/api/erp/conexiones',l)).response.status,403);assert.equal(lector.red.calls.length,0);
});
test('previsualizar varias cuentas por posición conserva origen, cantidades y todo el histórico sin INSERT de inventario',async t=>{
 const f=await fixtureERP(pool,t),s=await f.login(),body={...solicitud(f),modo:'POSICIONES',referencias:[],posiciones:['A'],incluirVariantes:false};
 const [[antes]]=await pool.query('SELECT COUNT(*) AS n FROM ims_op_inventario');
 assert.equal((await f.req('/api/erp/consultas',{...s,method:'POST',body})).response.status,202);const r=await esperar(f,s,body.consultaId);
 assert.equal(r.response.status,200);assert.equal(r.data.estado,'LISTA');assert.equal(r.data.totales.lineas,2);assert.equal(r.data.totales.unidades,'1.100000000');assert.deepEqual(new Set(r.data.filas.map(r=>r.codigoClienteERP)),new Set(['ALU','NOKIACNT']));
 for(const valor of ['PASSWORD_PRIVADA_ERP','USUARIO_PRIVADO','TOKEN_PRIVADO','NO_DEVOLVER_CAMPO_AJENO'])assert.equal(JSON.stringify(r.data).includes(valor),false);
 const [[despues]]=await pool.query('SELECT COUNT(*) AS n FROM ims_op_inventario');assert.equal(String(antes.n),String(despues.n));
});
test('consulta ajena y permiso revocado no exponen resultados de la caché',async t=>{
 const f=await fixtureERP(pool,t),s=await f.login(),body=solicitud(f);await f.req('/api/erp/consultas',{...s,method:'POST',body});assert.equal((await esperar(f,s,body.consultaId)).data.estado,'LISTA');
 const otra=await fixtureERP(pool,t),o=await otra.login();assert.equal((await f.req('/api/erp/consultas/'+body.consultaId,o)).response.status,410);
 await pool.execute('DELETE FROM ims_nat_ambito WHERE actor_id=?',[f.actor]);assert.equal((await f.req('/api/erp/consultas/'+body.consultaId,s)).response.status,403);
});
test('fallo de proveedor queda visible sin devolver cuerpos ni resultados parciales',async t=>{
 const f=await fixtureERP(pool,t,{fallar:true}),s=await f.login(),body=solicitud(f);await f.req('/api/erp/consultas',{...s,method:'POST',body});const r=await esperar(f,s,body.consultaId);
 assert.equal(r.data.estado,'ERROR');assert.equal(r.data.filas,undefined);assert.equal(JSON.stringify(r.data).includes('PASSWORD_PRIVADA_ERP'),false);
});
test('ERP funciona con la cuenta SQL operativa sin ampliar privilegios ni escribir inventarios',{
 skip:process.env.IMS_NATIVA_PRIVILEGIOS!=='1'
},async t=>{
 const runtime=await crearPoolConteos({...process.env,MYSQL_USER:'ims_cm_operacion',MYSQL_PASSWORD:process.env.IMS_RUNTIME_PASSWORD});t.after(()=>runtime.end());
 const f=await fixtureERP(pool,t,{apiPool:runtime}),s=await f.login(),body=solicitud(f);
 assert.equal((await f.req('/api/erp/conexiones',s)).response.status,200);
 assert.equal((await f.req('/api/erp/consultas',{...s,method:'POST',body})).response.status,202);
 const r=await esperar(f,s,body.consultaId);assert.equal(r.data.estado,'LISTA');assert.equal(r.data.totales.unidades,'0.300000000');
 const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_nat_inventario WHERE creador_id=?',[f.actor]);assert.equal(Number(n.n),0);
});
