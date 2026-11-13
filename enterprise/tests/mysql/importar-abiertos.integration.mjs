import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {databaseConfig} from '../../tools/importar-snapshot.mjs';
import {paqueteOperativo} from '../fixtures/operativos-abiertos.mjs';
import {copiarPreparacionAbiertos} from '../../src/migracion/copia-abiertos.mjs';
import {importarAbiertos} from '../../src/migracion/importar-abiertos.mjs';
import {guardarConteo} from '../../src/mysql/conteos.mjs';
import {listarPendientesLegado,iniciarPendienteLegado} from '../../src/mysql/pendientes-legado.mjs';
import {contextoOperacion} from '../../src/mysql/operacion-nativa.mjs';
import {crearHashPassword} from '../../src/auth/credenciales.mjs';
import {crearApi} from '../../src/http/api.mjs';
if(process.env.IMS_MYSQL_PRUEBAS!=='1'||!/^centromando_ims_pruebas(?:_[a-z0-9]+)?$/.test(process.env.MYSQL_DATABASE||''))throw Error('Solo base MySQL sintética propia.');
let pool,root,runtime,passwordHash;const PASSWORD='Clave_sintetica_abiertos_2026!';
before(async()=>{
 const cfg=databaseConfig(process.env);pool=mysql.createPool({...cfg,connectionLimit:3});root=await mysql.createConnection({...cfg,user:'root',password:process.env.IMS_TEST_ROOT_PASSWORD});
 for(const n of ['001_snapshot_staging.sql','002_conteo_operativo.sql','003_autenticacion.sql','004_detalle_linea.sql','005_migracion_operativa.sql','006_conteos_comparten_origen.sql','007_operacion_nativa.sql','009_series_hallazgos.sql'])for(const sql of (await readFile(new URL('../../sql/'+n,import.meta.url),'utf8')).replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await pool.query(sql);
 for(const n of ['008_proteccion_nativa.sql','010_proteccion_series.sql']){const text=await readFile(new URL('../../sql/'+n,import.meta.url),'utf8');for(const sql of text.match(/CREATE TRIGGER[\s\S]*?END\$\$/g)){const nombre=/CREATE TRIGGER (\w+)/.exec(sql)[1];const [existe]=await root.execute('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=?',[nombre]);if(!existe.length)await root.query(sql.slice(0,-2));}}
 const grants={ims_op_actor:'SELECT',ims_op_cliente:'SELECT',ims_op_inventario:'SELECT,INSERT',ims_op_inventario_cliente:'SELECT,INSERT',ims_op_permiso:'SELECT,INSERT',ims_op_linea:'SELECT,INSERT',ims_op_detalle_linea:'SELECT,INSERT',ims_op_operacion:'SELECT,INSERT',ims_op_auditoria:'SELECT,INSERT',ims_auth_usuario:'SELECT',ims_auth_sesion:'SELECT,INSERT,UPDATE',ims_auth_limite:'SELECT,INSERT,UPDATE,DELETE',ims_nat_ambito:'SELECT',ims_nat_inventario:'SELECT,INSERT',ims_nat_perfil:'SELECT,INSERT',ims_nat_linea:'SELECT,INSERT',ims_nat_evento:'SELECT,INSERT'};
 for(const [t,g] of Object.entries(grants))await root.query(`GRANT ${g} ON \`${cfg.database}\`.\`${t}\` TO 'ims_cm_operacion'@'%'`);
 await root.query(`GRANT UPDATE (version,borrador) ON \`${cfg.database}\`.ims_nat_inventario TO 'ims_cm_operacion'@'%'`);
 await root.query(`GRANT UPDATE (version,conteo_1,conteo_2,conteo_final,observacion,nueva_posicion) ON \`${cfg.database}\`.ims_op_linea TO 'ims_cm_operacion'@'%'`);
 runtime=mysql.createPool({...cfg,user:'ims_cm_operacion',password:process.env.IMS_RUNTIME_PASSWORD,connectionLimit:3});passwordHash=await crearHashPassword(PASSWORD);
});
after(async()=>{await runtime?.end();await root?.end();await pool?.end();});
async function fixture(t){
 const cliente=randomUUID(),nombre='Cliente de prueba '+cliente;await pool.execute('INSERT INTO ims_op_cliente VALUES (?,?)',[cliente,nombre]);
 const f=await paqueteOperativo(t,{cliente,nombre});f.actor=randomUUID();f.correo=f.actor+'@sintetico.invalid';await pool.execute('INSERT INTO ims_op_actor VALUES (?,1)',[f.actor]);await pool.execute('INSERT INTO ims_auth_usuario(actor_id,correo,nombre,password_hash) VALUES (?,?,?,?)',[f.actor,f.correo,'Operador de migración',passwordHash]);await pool.execute("INSERT INTO ims_nat_ambito VALUES (?,'UIO','ADMIN')",[f.actor]);
 await copiarPreparacionAbiertos({pool,directorio:f.prep});f.importar=(p=pool)=>importarAbiertos({pool:p,...f.solicitud,actorId:f.actor,correo:f.correo});
 f.codigoPendiente='131126_'+f.pendiente;f.iniciar=(s={},p=runtime)=>iniciarPendienteLegado({pool:p,principal:{actorId:f.actor},solicitud:{operacionId:randomUUID(),pendienteId:f.pendiente,codigo:f.codigoPendiente,fechaInicio:'2026-11-13',...s}});return f;
}
function proxy(cambios){return {getConnection:async()=>{const c=await pool.getConnection();return new Proxy(c,{get(o,k){if(cambios[k])return (...args)=>cambios[k](o,...args);const v=Reflect.get(o,k);return typeof v==='function'?v.bind(o):v;}});}};}
async function linea(id){const [[l]]=await pool.execute('SELECT * FROM ims_op_linea WHERE id=?',[id]);return l;}
test('importa conteos por código/fecha y conserva C1 cero, ausencia, C3 sin C2 y decimal exacto',async t=>{
 const f=await fixture(t),r=await f.importar();assert.equal(r.conteos_habilitados,2);assert.equal(r.lineas_habilitadas,3);assert.equal(r.lineas_pendientes_de_iniciar,2);assert.equal(r.ceros_conservados.conteo_1,1);
 assert.equal((await linea(f.lineas[0].linea_id)).conteo_1,'0.000000000');assert.equal((await linea(f.lineas[1].linea_id)).conteo_1,null);const l=await linea(f.lineas[2].linea_id);assert.equal(l.conteo_1,'1.234567891');assert.equal(l.conteo_2,null);assert.equal(l.conteo_final,'2.000000000');
 const [[x]]=await pool.execute('SELECT depot,ajuste FROM ims_nat_linea WHERE linea_id=?',[f.lineas[0].linea_id]);assert.equal(x.depot,'9007199254740993.123456789');assert.equal(x.ajuste,'-0.125000000');
 const [headers]=await pool.execute('SELECT borrador,fecha_inicio FROM ims_nat_inventario WHERE inventario_id IN (?,?)',[f.inv1,f.inv2]);assert.ok(headers.every(h=>!h.borrador));assert.deepEqual(new Set(headers.map(h=>h.fecha_inicio)),new Set(['2026-11-11','2026-11-12']));
 const contexto=await contextoOperacion(runtime,{actorId:f.actor});assert.equal(contexto.inventarios.length,2);assert.equal((await listarPendientesLegado(runtime,{actorId:f.actor})).datos.find(x=>x.pendienteId===f.pendiente).productos,2);
});
test('reintento conserva capturas nuevas hechas después de la importación y una sola evidencia',async t=>{
 const f=await fixture(t);await f.importar();await guardarConteo({pool:runtime,principal:{actorId:f.actor},soloNativos:true,solicitud:{operacionId:randomUUID(),inventarioId:f.inv1,lineaId:f.lineas[1].linea_id,versionEsperada:'0',etapa:1,cantidad:'0'}});
 const r=await f.importar();assert.equal(r.ya_importado,true);assert.equal((await linea(f.lineas[1].linea_id)).conteo_1,'0.000000000');assert.equal(String((await linea(f.lineas[1].linea_id)).version),'1');
 const [[n]]=await pool.execute("SELECT COUNT(*) AS n FROM ims_nat_evento WHERE actor_id=? AND tipo='migracion_abiertos'",[f.actor]);assert.equal(Number(n.n),1);
});
test('fallo intermedio revierte todos los conteos, permisos y pendientes; reintento carga íntegramente',async t=>{
 const f=await fixture(t);await assert.rejects(f.importar(proxy({execute:async(c,q,p)=>{const r=await c.execute(q,p);if(q.startsWith('INSERT INTO ims_op_detalle_linea'))throw Error('FALLO SINTETICO');return r;}})));
 for(const id of [f.inv1,f.inv2,f.pendiente]){const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_op_inventario WHERE id=?',[id]);assert.equal(Number(n.n),0);}const [[events]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_nat_evento WHERE actor_id=?',[f.actor]);assert.equal(Number(events.n),0);assert.equal((await f.importar()).lineas_habilitadas,3);
});
test('respuesta perdida de COMMIT se recupera con el mismo plan sin duplicar',async t=>{
 const f=await fixture(t);let commits=0;await assert.rejects(f.importar(proxy({commit:async c=>{await c.commit();if(++commits===2)throw Error('RESPUESTA PERDIDA');}})),e=>e.codigo==='CONFIRMACION_IMPORTACION_PENDIENTE');assert.equal((await f.importar()).ya_importado,true);
});
test('no adopta un origen existente ni permite importar con cuenta root o de operación',async t=>{
 const f=await fixture(t),id=randomUUID();await pool.execute("INSERT INTO ims_op_inventario VALUES (?,'UIO','HISTORICO','ENTREGADO')",[id]);await pool.execute('INSERT INTO ims_op_inventario_cliente VALUES (?,?)',[id,f.cliente]);const l=randomUUID();await pool.execute('INSERT INTO ims_op_linea(id,inventario_id,cliente_id,sku,origen_drive,observacion) VALUES (?,?,?,?,?,?)',[l,id,f.cliente,'PROTEGIDO',f.lineas[0].origen.origen_drive,'No cambiar']);
 await assert.rejects(f.importar(),e=>e.codigo==='ORIGEN_YA_IMPORTADO');assert.equal((await linea(l)).sku,'PROTEGIDO');assert.equal((await linea(l)).observacion,'No cambiar');
 await assert.rejects(f.importar(runtime));await assert.rejects(f.importar({getConnection:async()=>new Proxy(root,{get(o,k){if(k==='release')return ()=>{};const v=Reflect.get(o,k);return typeof v==='function'?v.bind(o):v;}})}));
});
test('pendiente conserva stock sin código o fecha hasta iniciarlo; ámbito y rol restringen el acceso',async t=>{
 const f=await fixture(t);await f.importar();const otro=randomUUID();await pool.execute('INSERT INTO ims_op_actor VALUES (?,1)',[otro]);assert.deepEqual((await listarPendientesLegado(runtime,{actorId:otro})).datos,[]);
 await assert.rejects(iniciarPendienteLegado({pool:runtime,principal:{actorId:otro},solicitud:{operacionId:randomUUID(),pendienteId:f.pendiente,codigo:'131126_OTRO',fechaInicio:'2026-11-13'}}),e=>e.codigo==='SIN_PERMISO');await assert.rejects(f.iniciar({codigo:''}));
 const [[antes]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_op_inventario WHERE id=?',[f.pendiente]);assert.equal(Number(antes.n),0);
 const op=randomUUID(),r=await f.iniciar({operacionId:op});assert.equal(r.inventarioId,f.pendiente);assert.equal((await f.iniciar({operacionId:op})).repetida,true);assert.ok(!(await listarPendientesLegado(runtime,{actorId:f.actor})).datos.some(x=>x.pendienteId===f.pendiente));
 for(const l of f.lineas.slice(3)){const x=await linea(l.linea_id);assert.equal(x.conteo_1,null);assert.equal(x.conteo_2,null);assert.equal(x.conteo_final,null);assert.equal(x.origen_drive,l.origen.origen_drive);}
 await assert.rejects(f.iniciar(),e=>e.codigo==='INVENTARIO_NO_EDITABLE');await assert.rejects(f.iniciar({operacionId:op,codigo:'131126_CAMBIO'}),e=>e.codigo==='OPERACION_REUTILIZADA');
});
test('dos inicios simultáneos conservan una sola copia y el stock pendiente original',async t=>{
 const f=await fixture(t);await f.importar();const op=randomUUID(),rs=await Promise.all(Array.from({length:6},()=>f.iniciar({operacionId:op})));assert.equal(rs.filter(x=>!x.repetida).length,1);
 const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_op_linea WHERE inventario_id=?',[f.pendiente]);assert.equal(Number(n.n),2);const [[original]]=await pool.execute("SELECT despues FROM ims_nat_evento WHERE operacion_id=? AND tipo='pendiente_legado'",[f.pendiente]);assert.ok(JSON.parse(original.despues).lineas.every(l=>l.codigo_original===null&&l.fecha_inicio===null));
});
test('API exige sesión, CSRF y sede para consultar e iniciar los pendientes',async t=>{
 const f=await fixture(t);await f.importar();const origin='https://ims-abiertos.invalid',server=crearApi({pool:runtime,publicUrl:origin,operacionNativa:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});const base='http://127.0.0.1:'+server.address().port;
 const req=(url,options={})=>fetch(base+url,{...options,headers:{Origin:origin,'Content-Type':'application/json',...options.headers}});
 assert.equal((await req('/api/operacion/pendientes')).status,401);const login=await req('/api/sesion',{method:'POST',body:JSON.stringify({correo:f.correo,contrasena:PASSWORD})}),s=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];const headers={Cookie:cookie};
 const lista=await req('/api/operacion/pendientes',{headers});const datos=await lista.json();assert.ok(datos.datos.some(x=>x.pendienteId===f.pendiente));assert.deepEqual(Object.keys(datos.datos[0]).sort(),['cliente','clienteId','pendienteId','productos','sede'].sort());
 const body=JSON.stringify({operacionId:randomUUID(),pendienteId:f.pendiente,codigo:f.codigoPendiente,fechaInicio:'2026-11-13'});assert.equal((await req('/api/operacion/iniciar-pendiente',{method:'POST',headers,body})).status,403);assert.equal((await req('/api/operacion/iniciar-pendiente',{method:'POST',headers:{...headers,'X-IMS-CSRF':s.csrf},body})).status,200);
});
