import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {crearPoolConteos,guardarConteo} from '../../src/mysql/conteos.mjs';
import {crearInventarioERP,consultarOrigenERP} from '../../src/mysql/crear-desde-erp.mjs';
import {validarEsquemaCreacionERP} from '../../src/mysql/esquema-erp.mjs';
import {consultarOperacion,ejecutarOperacion} from '../../src/mysql/operacion-nativa.mjs';
import {fixtureERP,esquemaERP} from '../fixtures/erp-api.mjs';
import {prepararCreacionERP} from '../../tools/preparar-creacion-erp.mjs';
import {crearHashPassword} from '../../src/auth/credenciales.mjs';
if(process.env.IMS_MYSQL_PRUEBAS!=='1'||!/^centromando_ims_pruebas(?:_[a-z0-9]+)?$/.test(process.env.MYSQL_DATABASE||''))throw Error('Solo base propia sintética.');
let pool,runtime;before(async()=>{pool=await crearPoolConteos(process.env);await esquemaERP(pool);runtime=await crearPoolConteos({...process.env,MYSQL_USER:'ims_cm_operacion',MYSQL_PASSWORD:process.env.IMS_RUNTIME_PASSWORD});});after(async()=>{await runtime?.end();await pool?.end();});
async function vista(t,{posiciones=false,opciones={}}={}){
 const f=await fixtureERP(pool,t,{creacion:true,apiPool:runtime,...opciones}),s=await f.login(),consultaId=randomUUID(),refs=f.conexiones.filter(c=>c.sede==='GYE'&&c.clienteNombre==='ALU').map(c=>c.referencia);
 const post={...s,method:'POST',body:{consultaId,sede:'GYE',referencias:refs,modo:posiciones?'POSICIONES':'SKU',skus:[],posiciones:posiciones?['A']:[],incluirVariantes:!posiciones}};
 assert.equal((await f.req('/api/erp/consultas',post)).response.status,202);let r;
 for(let i=0;i<100;i++){r=await f.req('/api/erp/consultas/'+consultaId,s);if(r.data.estado!=='CONSULTANDO')break;await new Promise(r=>setTimeout(r,5));}assert.equal(r.data.estado,'LISTA');
 const body={operacionId:randomUUID(),consultaId,codigo:'101126_'+randomUUID(),fechaInicio:'2026-11-10',fechaProgramada:'2026-11-12',responsable:'Prueba sintética',filasEsperadas:r.data.totales.lineas,unidadesEsperadas:r.data.totales.unidades};
 const crear=b=>f.req('/api/erp/inventarios',{...s,method:'POST',body:b??body});
 return {...f,s,body,crear,vista:r.data,principal:{actorId:f.actor},obtenerVista:(a,id)=>f.gestor.paraCrear(a,id)};
}
test('esquema y usuario SQL operativo permiten crear ERP sin ampliar sus permisos de edición',async()=>{
 assert.deepEqual(await validarEsquemaCreacionERP(runtime),{ok:true,tablas_erp_verificadas:2});
 for(const sql of ['UPDATE ims_erp_inventario SET filas=1','DELETE FROM ims_erp_linea','SELECT * FROM mysql.user'])await assert.rejects(runtime.query(sql),e=>/DENIED/.test(e.code));
});
test('preparación aditiva conserva clientes existentes, reanuda sin duplicarlos y detecta un esquema alterado',async t=>{
 const f=await fixtureERP(pool,t),[antes]=await pool.query('SELECT id,nombre FROM ims_op_cliente ORDER BY id');
 await prepararCreacionERP(pool,f.actor);const segundo=await prepararCreacionERP(pool,f.actor);assert.deepEqual(segundo.clientes_creados,[]);
 for(const r of antes){const [[actual]]=await pool.execute('SELECT id,nombre FROM ims_op_cliente WHERE id=?',[r.id]);assert.deepEqual(actual,r);}
 await pool.query('ALTER TABLE ims_erp_linea MODIFY cliente_nombre VARCHAR(254) NOT NULL');
 try{await assert.rejects(validarEsquemaCreacionERP(runtime),e=>e.codigo==='ERP_ESQUEMA_INCOMPATIBLE');}finally{await pool.query('ALTER TABLE ims_erp_linea MODIFY cliente_nombre VARCHAR(255) NOT NULL');}
 assert.equal((await validarEsquemaCreacionERP(runtime)).ok,true);
});
test('crear ALU más ALU SWAP conserva SKU repetido, decimales, origen y stock completo activo',async t=>{
 const f=await vista(t),r=await f.crear();assert.equal(r.response.status,200);assert.equal(r.data.filas,3);assert.equal(r.data.unidades,'1.300000000');assert.equal(r.data.publicacionKpi,false);
 const n=await consultarOperacion(runtime,f.principal,r.data.inventarioId);assert.equal(n.inventario.borrador,false);assert.equal(n.inventario.estado,'EN_PROCESO');assert.equal(n.lineas.length,3);assert.ok(n.lineas.every(l=>l.conteo_1===null));
 const o=await consultarOrigenERP(runtime,f.principal,r.data.inventarioId,n.lineas.map(l=>l.id));assert.deepEqual(new Set(o.datos.map(l=>l.codigo_cliente_erp)),new Set(['ALU','ALUSWAP']));
 assert.equal(n.lineas.filter(l=>l.sku==='0001'&&l.posicion==='A').length,2);assert.equal(new Set(n.lineas.map(l=>l.cliente_id)).size,1);
 const l=n.lineas[0];await guardarConteo({pool:runtime,principal:f.principal,soloNativos:true,solicitud:{operacionId:randomUUID(),inventarioId:r.data.inventarioId,lineaId:l.id,versionEsperada:'0',etapa:1,cantidad:'0'}});
 await assert.rejects(ejecutarOperacion({pool:runtime,principal:f.principal,tipo:'lineas',solicitud:{operacionId:randomUUID(),inventarioId:r.data.inventarioId,versionEsperada:'1',filas:[]}}),e=>e.codigo==='INVENTARIO_NO_EDITABLE');
 const [[header]]=await pool.execute('SELECT cuentas,seleccion FROM ims_erp_inventario WHERE inventario_id=?',[r.data.inventarioId]);assert.equal(JSON.stringify(header).includes('PASSWORD_PRIVADA'),false);
});
test('posiciones crea varios clientes sin perder el código de cuenta de cada línea',async t=>{
 const f=await vista(t,{posiciones:true}),r=await f.crear();assert.equal(r.response.status,200);assert.equal(r.data.filas,3);assert.equal(r.data.unidades,'2.100000000');const n=await consultarOperacion(runtime,f.principal,r.data.inventarioId);assert.equal(n.inventario.perfiles.length,2);
 const o=await consultarOrigenERP(runtime,f.principal,r.data.inventarioId,n.lineas.map(l=>l.id));assert.deepEqual(new Set(o.datos.map(l=>l.codigo_cliente_erp)),new Set(['ALU','ALUSWAP','NOKIACNT']));
});
test('reintento concurrente y caché perdida recuperan un solo inventario y un solo evento',async t=>{
 const f=await vista(t),rs=await Promise.all([f.crear(),f.crear()]);assert.ok(rs.every(r=>r.response.status===200));assert.equal(rs[0].data.inventarioId,rs[1].data.inventarioId);
 const rec=await crearInventarioERP({pool:runtime,principal:f.principal,solicitud:f.body,obtenerVista:()=>{throw Error('Caché perdida');}});assert.equal(rec.repetida,true);assert.equal(rec.inventarioId,rs[0].data.inventarioId);
 const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_nat_evento WHERE actor_id=? AND operacion_id=?',[f.actor,f.body.operacionId]);assert.equal(Number(n.n),1);
 const repetida=await f.crear({...f.body,operacionId:randomUUID()});assert.equal(repetida.response.status,409);assert.equal(repetida.data.error,'ERP_CONSULTA_UTILIZADA');
});
test('pérdida de respuesta de COMMIT conserva confirmación recuperable sin otra extracción',async t=>{
 const f=await vista(t),perdido={getConnection:async()=>{const c=await runtime.getConnection();return new Proxy(c,{get(o,k){if(k==='commit')return async()=>{await o.commit();throw Error('Respuesta perdida sintética');};const v=Reflect.get(o,k);return typeof v==='function'?v.bind(o):v;}});}};
 await assert.rejects(crearInventarioERP({pool:perdido,principal:f.principal,solicitud:f.body,obtenerVista:f.obtenerVista}),e=>e.codigo==='CONFIRMACION_PENDIENTE');
 const r=await crearInventarioERP({pool:runtime,principal:f.principal,solicitud:f.body,obtenerVista:()=>{throw Error('Sin caché');}});assert.equal(r.repetida,true);assert.equal(r.filas,3);
});
test('fallo a mitad de carga revierte inventario, permisos, auditoría y procedencia completos',async t=>{
 const f=await vista(t),fallo={getConnection:async()=>{const c=await runtime.getConnection();return new Proxy(c,{get(o,k){if(k==='execute')return async(sql,params)=>{if(sql.startsWith('INSERT INTO ims_erp_linea'))throw Error('Fallo sintético');return o.execute(sql,params);};const v=Reflect.get(o,k);return typeof v==='function'?v.bind(o):v;}});}};
 await assert.rejects(crearInventarioERP({pool:fallo,principal:f.principal,solicitud:f.body,obtenerVista:f.obtenerVista}),e=>e.codigo==='GUARDADO_RECHAZADO');
 for(const [tabla,col] of [['ims_nat_inventario','creador_id'],['ims_nat_evento','actor_id'],['ims_erp_inventario','actor_id']]){const [[n]]=await pool.execute(`SELECT COUNT(*) AS n FROM ${tabla} WHERE ${col}=?`,[f.actor]);assert.equal(Number(n.n),0);}
 assert.equal((await f.crear()).response.status,200);
});
test('igual número de líneas y unidades no oculta una copia SQL con SKU alterado',async t=>{
 const f=await vista(t),alterado={getConnection:async()=>{const c=await runtime.getConnection();return new Proxy(c,{get(o,k){if(k==='execute')return (sql,params)=>{if(sql.startsWith('INSERT INTO ims_op_linea(')){params=[...params];params[3]='SKU_ALTERADO_SINTETICO';}return o.execute(sql,params);};const v=Reflect.get(o,k);return typeof v==='function'?v.bind(o):v;}});}};
 await assert.rejects(crearInventarioERP({pool:alterado,principal:f.principal,solicitud:f.body,obtenerVista:f.obtenerVista}),e=>e.codigo==='GUARDADO_RECHAZADO');
 const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_erp_inventario WHERE actor_id=?',[f.actor]);assert.equal(Number(n.n),0);assert.equal((await f.crear()).response.status,200);
});
test('totales alterados, existencias desde navegador, consulta ajena y rol revocado no crean stock',async t=>{
 const f=await vista(t);for(const cambios of [{filasEsperadas:99},{unidadesEsperadas:'0.000000000'},{filas:[]},{clienteId:randomUUID()}]){const r=await f.crear({...f.body,...cambios});assert.equal(r.response.status,400);}
 const otra=await fixtureERP(pool,t,{creacion:true,apiPool:runtime}),s=await otra.login();assert.equal((await f.req('/api/erp/inventarios',{...s,method:'POST',body:f.body})).response.status,410);
 await pool.execute('DELETE FROM ims_nat_ambito WHERE actor_id=?',[f.actor]);assert.equal((await f.crear()).response.status,403);
 const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_nat_inventario WHERE creador_id=?',[f.actor]);assert.equal(Number(n.n),0);
});
test('procedencia exige permiso de inventario y no filtra otros clientes a un lector parcial',async t=>{
 const f=await vista(t,{posiciones:true}),r=await f.crear(),n=await consultarOperacion(runtime,f.principal,r.data.inventarioId),lector=randomUUID();await pool.execute('INSERT INTO ims_op_actor VALUES (?,1)',[lector]);
 const alu=n.inventario.perfiles.find(p=>p.nombre==='ALU').cliente_id;
 await pool.execute('INSERT INTO ims_auth_usuario(actor_id,correo,nombre,password_hash) VALUES (?,?,?,?)',[lector,lector+'@sintetico.invalid','Lector parcial',await crearHashPassword('Clave_lector_sintetico!')]);
 await ejecutarOperacion({pool:runtime,principal:f.principal,tipo:'asignar',solicitud:{operacionId:randomUUID(),inventarioId:r.data.inventarioId,versionEsperada:'1',actorId:lector,clienteId:alu,rol:'LECTOR'}});
 const permitidas=n.lineas.filter(l=>l.cliente_id===alu).map(l=>l.id);const o=await consultarOrigenERP(runtime,{actorId:lector},r.data.inventarioId,permitidas);assert.ok(o.datos.every(l=>l.cliente_nombre==='ALU'));
 await assert.rejects(consultarOrigenERP(runtime,{actorId:lector},r.data.inventarioId,n.lineas.map(l=>l.id)),e=>e.codigo==='SIN_PERMISO');
});
test('carga de 5000 líneas concilia stock y procedencia en lotes con cantidades exactas',async t=>{
 const f=await vista(t,{opciones:{stock:c=>Array.from({length:2500},(_,i)=>({'COD. CLIENTE':c.codigosCliente[0],'COD. PRODUCTO':String(i).padStart(8,'0'),NAVE:'A',CANTIDAD:'0.1'}))}}),r=await f.crear();
 assert.equal(r.response.status,200);assert.equal(r.data.filas,5000);assert.equal(r.data.unidades,'500.000000000');
 const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_erp_linea WHERE inventario_id=?',[r.data.inventarioId]);assert.equal(Number(n.n),5000);
});
