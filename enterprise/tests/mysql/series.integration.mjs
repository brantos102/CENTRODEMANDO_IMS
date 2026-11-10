import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {crearPoolConteos,guardarConteo} from '../../src/mysql/conteos.mjs';
import {ejecutarOperacion,previsualizarSerie,historialCapturas,consultarOperacion} from '../../src/mysql/operacion-nativa.mjs';
import {crearHashPassword} from '../../src/auth/credenciales.mjs';
if(process.env.IMS_MYSQL_PRUEBAS!=='1'||!/^centromando_ims_pruebas(?:_[a-z0-9]+)?$/.test(process.env.MYSQL_DATABASE||''))throw Error('Solo base exclusiva de pruebas.');
let pool;
before(async()=>{pool=await crearPoolConteos(process.env);for(const name of ['002_conteo_operativo.sql','003_autenticacion.sql','004_detalle_linea.sql','007_operacion_nativa.sql','009_series_hallazgos.sql'])for(const sql of (await readFile(new URL('../../sql/'+name,import.meta.url),'utf8')).replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await pool.query(sql);});
after(async()=>{await pool?.end();});
async function fixture({ambigua=false}={}){
 const f={actor:randomUUID(),otroActor:randomUUID(),cliente:randomUUID(),otroCliente:randomUUID()};
 const password=await crearHashPassword('Clave_sintetica_de_series!');
 for(const id of [f.actor,f.otroActor]){
  await pool.execute('INSERT INTO ims_op_actor VALUES (?,1)',[id]);
  await pool.execute('INSERT INTO ims_auth_usuario(actor_id,correo,nombre,password_hash) VALUES (?,?,?,?)',[id,id+'@sintetico.invalid','Ensayo series',password]);
 }
 await pool.execute("INSERT INTO ims_nat_ambito VALUES (?,'UIO','ADMIN')",[f.actor]);
 for(const id of [f.cliente,f.otroCliente])await pool.execute('INSERT INTO ims_op_cliente VALUES (?,?)',[id,'Cliente '+id]);
 f.enviar=(tipo,s={},actor=f.actor,p=pool)=>ejecutarOperacion({pool:p,principal:{actorId:actor},tipo,solicitud:{operacionId:randomUUID(),...s}});
 const r=await f.enviar('crear',{sede:'UIO',codigo:'091126_SERIES',clientes:[f.cliente,f.otroCliente],fechaInicio:'2026-11-09'});f.inv=r.inventarioId;f.v=r.version;
 f.mutar=async(tipo,s={})=>{const r=await f.enviar(tipo,{inventarioId:f.inv,versionEsperada:f.v,...s});f.v=r.version;return r;};
 const filas=[{numero:1,clienteId:f.cliente,sku:'0001',serie:'SN-00001234',depot:'1',posicion:'A'},
  {numero:2,clienteId:f.otroCliente,sku:'0001',serie:'SN-00001234',depot:'1',posicion:'B'},
  {numero:3,clienteId:f.cliente,sku:'0002',serie:'SN-99999999',depot:'1',posicion:'C'}];
 if(ambigua)filas.push({...filas[0],numero:4,posicion:'DUPLICADA'});
 const carga=await f.mutar('lineas',{filas});f.linea=carga.lineas[0];f.otraLinea=carga.lineas[1];
 await f.mutar('activar',{filasEsperadas:filas.length,depotEsperado:String(filas.length)});
 await f.mutar('asignar',{actorId:f.otroActor,clienteId:f.cliente,rol:'OPERADOR'});
 f.body={operacionId:randomUUID(),inventarioId:f.inv,clienteId:f.cliente,serie:'sn-00001234',lineaId:f.linea,versionLinea:'0',etapa:1,confirmarSimilar:false};
 f.capturar=(s={},actor=f.otroActor,p=pool)=>f.enviar('serie',{...f.body,...s},actor,p);
 f.preview=(serie=f.body.serie,clienteId=f.cliente,actor=f.otroActor)=>previsualizarSerie(pool,{actorId:actor},f.inv,{serie,clienteId});
 f.hist=(tipo='series',actor=f.otroActor,clienteId=f.cliente,cursor='')=>historialCapturas(pool,{actorId:actor},f.inv,{tipo,clienteId,cursor});
 return f;
}
async function valor(id){const [[l]]=await pool.execute('SELECT * FROM ims_op_linea WHERE id=?',[id]);return l;}
test('diez reintentos simultáneos de serie crean un C1, una serie y sus auditorías; jamás un C2',async()=>{
 const f=await fixture(),r=await Promise.all(Array.from({length:10},()=>f.capturar()));
 assert.equal(r.filter(r=>!r.repetida).length,1);assert.equal(new Set(r.map(r=>r.serieId)).size,1);
 const l=await valor(f.linea);assert.equal(l.conteo_1,'1.000000000');assert.equal(l.conteo_2,null);
 assert.equal((await f.hist()).datos.length,1);
 for(const table of ['ims_op_operacion','ims_op_auditoria','ims_nat_evento']){const [[n]]=await pool.execute(`SELECT COUNT(*) AS n FROM ${table} WHERE actor_id=? AND operacion_id=?`,[f.otroActor,f.body.operacionId]);assert.equal(Number(n.n),1);}
 await assert.rejects(f.capturar({operacionId:randomUUID(),serie:' SN-00001234 '}),e=>e.codigo==='SERIE_DUPLICADA');
});
test('serie no revela stock teórico ni clientes ajenos; el mismo serial en otro cliente sigue independiente',async()=>{
 const f=await fixture(),p=await f.preview();assert.equal(p.coincidencias.length,1);assert.equal(p.coincidencias[0].id,f.linea);assert.equal(Object.hasOwn(p.coincidencias[0],'depot'),false);
 await assert.rejects(f.preview(f.body.serie,f.otroCliente),e=>e.codigo==='SIN_PERMISO');
 await f.capturar();
 await f.enviar('serie',{...f.body,operacionId:randomUUID(),clienteId:f.otroCliente,lineaId:f.otraLinea},f.actor);
 assert.equal((await valor(f.otraLinea)).conteo_1,'1.000000000');assert.equal((await f.hist('series',f.actor,f.otroCliente)).datos.length,1);
});
test('similitud requiere confirmación; una desconocida va a alterna y no altera stock ni exactitud',async()=>{
 const f=await fixture();await f.capturar();const before=(await consultarOperacion(pool,{actorId:f.actor},f.inv,{analisis:true})).kpis;
 const q=await f.preview('SN-00001235');assert.equal(q.coincidencias.length,0);assert.equal(q.parecidas.length,1);
 const body={operacionId:randomUUID(),inventarioId:f.inv,clienteId:f.cliente,serie:'SN-00001235',confirmarSimilar:false,
  hallazgo:{sku:'0000',descripcion:'Hallazgo',cantidad:'1',posicion:'ALT',observacion:'Observación',justificacion:'Revisar'}};
 await assert.rejects(f.enviar('serie',body,f.otroActor),e=>e.codigo==='SERIE_SIMILAR');
 const r=await f.enviar('serie',{...body,confirmarSimilar:true},f.otroActor);assert.ok(r.hallazgoId);assert.equal(r.lineaId,null);assert.equal(r.advertenciaConfirmada,true);assert.equal(r.seriesParecidas.length,1);
 const [[audit]]=await pool.execute('SELECT despues FROM ims_nat_evento WHERE actor_id=? AND operacion_id=?',[f.otroActor,body.operacionId]);assert.equal(JSON.parse(audit.despues).advertenciaConfirmada,true);
 assert.equal((await f.hist('hallazgos')).datos[0].sku,'0000');
 assert.deepEqual((await consultarOperacion(pool,{actorId:f.actor},f.inv,{analisis:true})).kpis,before);
 const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_op_linea WHERE inventario_id=?',[f.inv]);assert.equal(Number(n.n),3);
});
test('no elige otra etapa ni otra línea; alterna no acepta una serie que ya existe en stock',async()=>{
 const f=await fixture();
 await guardarConteo({pool,principal:{actorId:f.otroActor},soloNativos:true,solicitud:{operacionId:randomUUID(),inventarioId:f.inv,lineaId:f.linea,versionEsperada:'0',etapa:1,cantidad:'0'}});
 await assert.rejects(f.capturar({versionLinea:'1'}),e=>e.codigo==='ETAPA_COMPLETA');assert.equal((await valor(f.linea)).conteo_2,null);
 await assert.rejects(f.capturar({lineaId:f.otraLinea}),e=>e.codigo==='SIN_PERMISO');
 const {lineaId,versionLinea,etapa,...b}=f.body;
 await assert.rejects(f.enviar('serie',{...b,hallazgo:{sku:'FALSO',cantidad:'1'}},f.otroActor),e=>e.codigo==='SOLICITUD_INVALIDA');
 await f.capturar({versionLinea:'1',etapa:2});assert.equal((await valor(f.linea)).conteo_2,'1.000000000');
});
test('respuesta perdida después de COMMIT recupera serie y cantidad; permisos revocados bloquean incluso el reintento',async()=>{
 const f=await fixture(),perdido={getConnection:async()=>{const c=await pool.getConnection();return new Proxy(c,{get(t,k){if(k==='commit')return async()=>{await t.commit();throw Error('Respuesta perdida sintética');};const v=Reflect.get(t,k);return typeof v==='function'?v.bind(t):v;}});}};
 await assert.rejects(f.capturar({},f.otroActor,perdido),e=>e.codigo==='CONFIRMACION_PENDIENTE');
 assert.equal((await f.capturar()).repetida,true);assert.equal((await f.hist()).datos.length,1);
 await f.mutar('asignar',{actorId:f.otroActor,clienteId:f.cliente,rol:'LECTOR'});
 await assert.rejects(f.capturar(),e=>e.codigo==='SIN_PERMISO');
 assert.equal((await f.hist()).datos.length,1);
});
test('fallo al insertar la serie revierte conteo, evento, auditoría y hallazgo de la transacción',async()=>{
 const f=await fixture(),fallo={getConnection:async()=>{const c=await pool.getConnection();return new Proxy(c,{get(t,k){if(k==='execute')return (sql,params)=>{if(sql.startsWith('INSERT INTO ims_nat_serie'))return t.execute(sql,[...params.slice(0,5),'',...params.slice(6)]);return t.execute(sql,params);};const v=Reflect.get(t,k);return typeof v==='function'?v.bind(t):v;}});}};
 await assert.rejects(f.capturar({},f.otroActor,fallo),e=>e.codigo==='GUARDADO_RECHAZADO');
 assert.equal((await valor(f.linea)).conteo_1,null);assert.equal((await f.hist()).datos.length,0);
 for(const table of ['ims_nat_evento','ims_op_operacion','ims_op_auditoria']){const [[n]]=await pool.execute(`SELECT COUNT(*) AS n FROM ${table} WHERE actor_id=? AND operacion_id=?`,[f.otroActor,f.body.operacionId]);assert.equal(Number(n.n),0);}
 assert.equal((await f.capturar()).repetida,false);
});
test('planilla alterna conserva cero y multiplicidad; entrega protege nuevas escrituras y permite recuperar una ya confirmada',async()=>{
 const f=await fixture();const body={operacionId:randomUUID(),inventarioId:f.inv,clienteId:f.cliente,datos:{sku:'0000',cantidad:'0',observacion:'Solo revisión'}};
 await f.enviar('hallazgo',body,f.otroActor);await f.enviar('hallazgo',{...body,operacionId:randomUUID()},f.otroActor);
 assert.equal((await f.hist('hallazgos')).datos.length,2);assert.ok((await f.hist('hallazgos')).datos.every(r=>r.cantidad==='0.000000000'));
 await f.mutar('estado',{estado:'EN_VALIDACION'});await f.mutar('estado',{estado:'ENTREGADO',confirmarIncompleto:true,fechaEntrega:'2026-11-09'});
 assert.equal((await f.enviar('hallazgo',body,f.otroActor)).repetida,true);
 await assert.rejects(f.enviar('hallazgo',{...body,operacionId:randomUUID()},f.otroActor),e=>e.codigo==='INVENTARIO_NO_EDITABLE');
});
test('UUID no se reutiliza entre captura manual, serie y administración',async()=>{
 const f=await fixture();await f.capturar();
 await assert.rejects(guardarConteo({pool,principal:{actorId:f.otroActor},soloNativos:true,solicitud:{operacionId:f.body.operacionId,inventarioId:f.inv,lineaId:f.linea,versionEsperada:'1',etapa:2,cantidad:'1'}}),e=>e.codigo==='OPERACION_REUTILIZADA');
 const r=await f.mutar('depot',{visible:true});
 await assert.rejects(guardarConteo({pool,principal:{actorId:f.actor},soloNativos:true,solicitud:{operacionId:r.operacionId,inventarioId:f.inv,lineaId:f.linea,versionEsperada:'1',etapa:2,cantidad:'1'}}),e=>e.codigo==='OPERACION_REUTILIZADA');
});
test('perfil SQL operativo registra series pero no modifica ni borra sus evidencias', {skip:process.env.IMS_NATIVA_PRIVILEGIOS!=='1'},async t=>{
 const f=await fixture(),runtime=await crearPoolConteos({...process.env,MYSQL_USER:'ims_cm_operacion',MYSQL_PASSWORD:process.env.IMS_RUNTIME_PASSWORD});t.after(()=>runtime.end());
 await f.capturar({},f.otroActor,runtime);
 assert.equal((await historialCapturas(runtime,{actorId:f.otroActor},f.inv,{clienteId:f.cliente,tipo:'series'})).datos.length,1);
 for(const table of ['ims_nat_serie','ims_nat_hallazgo'])for(const sql of [`UPDATE ${table} SET posicion='OTRA'`,`DELETE FROM ${table}`])await assert.rejects(runtime.query(sql),e=>/DENIED/.test(e.code));
});

test('coincidencia ambigua requiere la línea exacta; no cuenta otra ubicación por orden de fila',async()=>{
 const f=await fixture({ambigua:true}),p=await f.preview();assert.equal(p.coincidencias.length,2);
 await assert.rejects(f.capturar({lineaId:undefined}),e=>e.codigo==='SOLICITUD_INVALIDA');
 const destino=p.coincidencias.find(l=>l.posicion==='DUPLICADA');await f.capturar({lineaId:destino.id,versionLinea:destino.version});
 assert.equal((await valor(f.linea)).conteo_1,null);assert.equal((await valor(destino.id)).conteo_1,'1.000000000');
});
test('puede_contar revocado bloquea serie y previsualización aunque el perfil todavía diga OPERADOR',async()=>{
 const f=await fixture();await pool.execute('UPDATE ims_op_permiso SET puede_contar=0 WHERE actor_id=?',[f.otroActor]);
 await assert.rejects(f.preview(),e=>e.codigo==='SIN_PERMISO');await assert.rejects(f.capturar(),e=>e.codigo==='SIN_PERMISO');
 assert.equal((await valor(f.linea)).conteo_1,null);
});
test('historial devuelve todas las capturas sin repetir ni omitir empates de fecha, con ámbito por cliente',async()=>{
 const f=await fixture();
 for(let i=0;i<52;i++)await f.enviar('hallazgo',{inventarioId:f.inv,clienteId:f.cliente,datos:{sku:'0000',cantidad:'0',observacion:'Captura '+i}},f.otroActor);
 await pool.execute("UPDATE ims_nat_hallazgo SET creado_en='2026-11-09 12:00:00.123456' WHERE inventario_id=?",[f.inv]);
 const a=await f.hist('hallazgos'),b=await f.hist('hallazgos',f.otroActor,f.cliente,a.siguiente);
 assert.equal(a.datos.length,50);assert.equal(b.datos.length,2);assert.equal(b.siguiente,null);
 assert.equal(new Set([...a.datos,...b.datos].map(r=>r.id)).size,52);
 await assert.rejects(f.hist('hallazgos',f.otroActor,f.otroCliente,a.siguiente),e=>e.codigo==='SIN_PERMISO');
});
