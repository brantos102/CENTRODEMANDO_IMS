import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {crearPoolConteos,guardarConteo} from '../../src/mysql/conteos.mjs';
import {ejecutarOperacion,consultarOperacion} from '../../src/mysql/operacion-nativa.mjs';
import {crearHashPassword} from '../../src/auth/credenciales.mjs';
import {crearApi} from '../../src/http/api.mjs';
if(process.env.IMS_MYSQL_PRUEBAS!=='1'||!/^centromando_ims_pruebas(?:_[a-z0-9]+)?$/.test(process.env.MYSQL_DATABASE||''))throw Error('Solo base de pruebas.');
let pool;
before(async()=>{
 pool=await crearPoolConteos(process.env);
 for(const f of ['002_conteo_operativo.sql','003_autenticacion.sql','004_detalle_linea.sql','007_operacion_nativa.sql']){
  const ddl=await readFile(new URL('../../sql/'+f,import.meta.url),'utf8');
  for(const sql of ddl.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await pool.query(sql);
 }
});
after(async()=>{await pool?.end();});
async function fixture(){
 const f={admin:randomUUID(),operador:randomUUID(),auditor:randomUUID(),cliente:randomUUID(),otroCliente:randomUUID(),op:randomUUID()};
 const password=await crearHashPassword('Clave_sintetica_nativa_2026!');
 for(const id of [f.admin,f.operador,f.auditor]){
  await pool.execute('INSERT INTO ims_op_actor VALUES (?,1)',[id]);
  await pool.execute('INSERT INTO ims_auth_usuario(actor_id,correo,nombre,password_hash) VALUES (?,?,?,?)',[id,id+'@sintetico.invalid','Ensayo',password]);
 }
 await pool.execute("INSERT INTO ims_nat_ambito VALUES (?,'UIO','ADMIN')",[f.admin]);
 for(const [id,name] of [[f.cliente,'CLIENTE A'],[f.otroCliente,'CLIENTE B']])await pool.execute('INSERT INTO ims_op_cliente VALUES (?,?)',[id,name]);
 f.ejecutar=(tipo,body={},actor=f.admin,p=pool)=>ejecutarOperacion({pool:p,principal:{actorId:actor},tipo,solicitud:{operacionId:randomUUID(),...body}});
 const r=await f.ejecutar('crear',{operacionId:f.op,sede:'UIO',codigo:'091126_ENSAYO',clientes:[f.cliente],fechaInicio:'2026-11-09'});
 f.inv=r.inventarioId;f.version=r.version;
 f.mutar=async(tipo,body={})=>{const r=await f.ejecutar(tipo,{inventarioId:f.inv,versionEsperada:f.version,...body});f.version=r.version;return r;};
 f.filas=[{numero:1,clienteId:f.cliente,sku:'0001',depot:'10',posicion:'A-01'},{numero:2,clienteId:f.cliente,sku:'0001',depot:'4',posicion:'A-02'}];
 f.cargar=()=>f.mutar('lineas',{filas:f.filas});f.activar=()=>f.mutar('activar',{filasEsperadas:2,depotEsperado:'14'});
 f.asignar=(actorId=f.operador,rol='OPERADOR')=>f.mutar('asignar',{actorId,clienteId:f.cliente,rol});
 f.leer=(actor=f.admin,opts={})=>consultarOperacion(pool,{actorId:actor},f.inv,opts);
 return f;
}
test('flujo real: crear, carga reanudable sin fusionar SKU, asignar, C1/C2/C3, ajuste, validar y entregar',async()=>{
 const f=await fixture();const carga=await f.cargar();assert.equal(carga.lineas.length,2);
 await f.cargar();await f.activar();await f.asignar();
 const antes=await f.leer();assert.equal(antes.lineas.length,2);assert.equal(antes.lineas[0].sku,'0001');
 const l=antes.lineas.find(l=>l.numero===1);
 let v=l.version;
 for(const [etapa,cantidad]of [[1,'8'],[2,'9'],[3,'10']]){
  const r=await guardarConteo({pool,principal:{actorId:f.operador},soloNativos:true,solicitud:{operacionId:randomUUID(),inventarioId:f.inv,lineaId:l.id,versionEsperada:v,etapa,cantidad}});v=r.version;
 }
 await f.mutar('ajustar',{lineaId:l.id,versionLinea:v,ajuste:'-1',motivo:'AJUSTE',justificacion:'Ensayo'});
 const a=await f.leer(f.admin,{analisis:true});assert.equal(a.kpis.efectividadUnidades,'64.3');assert.equal(a.avance.contadas,1);
 await f.mutar('estado',{estado:'EN_VALIDACION'});
 await assert.rejects(f.mutar('estado',{estado:'ENTREGADO',fechaEntrega:'2026-11-09',confirmarIncompleto:false}),e=>e.codigo==='CONFIRMACION_REQUERIDA');
 const fin=await f.mutar('estado',{estado:'ENTREGADO',fechaEntrega:'2026-11-09',confirmarIncompleto:true});assert.equal(fin.incompleto,true);assert.equal(fin.publicacionKpi,false);
 await assert.rejects(f.mutar('estado',{estado:'EN_PROCESO'}),e=>e.codigo==='INVENTARIO_NO_EDITABLE');
});
test('operador ciego no recibe depot, diferencia ni análisis; auditor no cuenta y otro cliente no accede',async()=>{
 const f=await fixture();await f.cargar();await f.activar();await f.asignar();await f.asignar(f.auditor,'AUDITOR');
 const lectura=await f.leer(f.operador);assert.ok(lectura.lineas.every(l=>!Object.hasOwn(l,'depot')&&!Object.hasOwn(l,'desfase')));
 await assert.rejects(f.leer(f.operador,{analisis:true}),e=>e.codigo==='SIN_PERMISO');
 const l=lectura.lineas[0];
 await assert.rejects(guardarConteo({pool,principal:{actorId:f.auditor},soloNativos:true,solicitud:{operacionId:randomUUID(),inventarioId:f.inv,lineaId:l.id,versionEsperada:'0',etapa:1,cantidad:'1'}}),e=>e.codigo==='SIN_PERMISO');
 await assert.rejects(f.ejecutar('estado',{inventarioId:f.inv,versionEsperada:f.version,estado:'EN_VALIDACION'},f.operador),e=>e.codigo==='SIN_PERMISO');
 await f.mutar('depot',{visible:true});assert.ok((await f.leer(f.operador)).lineas.every(l=>Object.hasOwn(l,'depot')));
 await f.asignar(f.operador,'REVOCADO');await assert.rejects(f.leer(f.operador),e=>e.codigo==='SIN_PERMISO');
});
test('histórico sin marca nativa no se edita aunque se falsifique permiso de contar; el borrador tampoco cuenta',async()=>{
 const f=await fixture();await f.cargar();
 const l=(await f.leer()).lineas[0];
 await assert.rejects(guardarConteo({pool,principal:{actorId:f.admin},soloNativos:true,solicitud:{operacionId:randomUUID(),inventarioId:f.inv,lineaId:l.id,versionEsperada:'0',etapa:1,cantidad:'1'}}),e=>e.codigo==='SIN_PERMISO');
 const hist=randomUUID(),linea=randomUUID();
 await pool.execute("INSERT INTO ims_op_inventario VALUES (?,'UIO','HISTORICO','EN_PROCESO')",[hist]);
 await pool.execute('INSERT INTO ims_op_inventario_cliente VALUES (?,?)',[hist,f.cliente]);
 await pool.execute('INSERT INTO ims_op_permiso VALUES (?,?,?,1)',[f.admin,hist,f.cliente]);
 await pool.execute("INSERT INTO ims_op_linea(id,inventario_id,cliente_id,sku,observacion) VALUES (?,?,?,'0001','HUMANA')",[linea,hist,f.cliente]);
 await assert.rejects(f.ejecutar('estado',{inventarioId:hist,versionEsperada:'0',estado:'EN_VALIDACION'}),e=>e.codigo==='SIN_PERMISO');
 await assert.rejects(guardarConteo({pool,principal:{actorId:f.admin},soloNativos:true,solicitud:{operacionId:randomUUID(),inventarioId:hist,lineaId:linea,versionEsperada:'0',etapa:1,cantidad:'1'}}),e=>e.codigo==='SIN_PERMISO');
 const [[r]]=await pool.execute('SELECT conteo_1,observacion FROM ims_op_linea WHERE id=?',[linea]);assert.equal(r.conteo_1,null);assert.equal(r.observacion,'HUMANA');
});
test('stock cambiado, total incorrecto, cliente ajeno y versión obsoleta no se aceptan',async()=>{
 const f=await fixture();await f.cargar();
 await assert.rejects(f.mutar('lineas',{filas:[{...f.filas[0],depot:'11'}]}),e=>e.codigo==='SOLICITUD_INVALIDA');
 await assert.rejects(f.mutar('activar',{filasEsperadas:2,depotEsperado:'15'}),e=>e.codigo==='SOLICITUD_INVALIDA');
 await assert.rejects(f.mutar('lineas',{filas:[{...f.filas[0],numero:3,clienteId:f.otroCliente}]}),e=>e.codigo==='SIN_PERMISO');
 await assert.rejects(f.ejecutar('activar',{inventarioId:f.inv,versionEsperada:'0',filasEsperadas:2,depotEsperado:'14'}),e=>e.codigo==='VERSION_DESACTUALIZADA');
 assert.equal((await f.leer()).lineas.length,2);await f.activar();
 await assert.rejects(f.cargar(),e=>e.codigo==='INVENTARIO_NO_EDITABLE');
});
test('crear simultáneamente y perder respuesta de COMMIT no deja dos inventarios; reintento recupera el ID',async()=>{
 const f=await fixture(),body={operacionId:randomUUID(),sede:'UIO',codigo:'091126_ENSAYO',clientes:[f.cliente],fechaInicio:'2026-11-09'};
 const reales=await Promise.allSettled([f.ejecutar('crear',body),f.ejecutar('crear',body)]);
 const primera=reales.find(r=>r.status==='fulfilled').value;const recuperada=await f.ejecutar('crear',body);assert.equal(primera.inventarioId,recuperada.inventarioId);assert.equal(recuperada.repetida,true);
 const id=randomUUID(),perdido={getConnection:async()=>{const c=await pool.getConnection();return new Proxy(c,{get(t,k){if(k==='commit')return async()=>{await t.commit();throw Error('Respuesta perdida sintética');};const v=Reflect.get(t,k);return typeof v==='function'?v.bind(t):v;}});}};
 await assert.rejects(f.ejecutar('crear',{...body,operacionId:id},f.admin,perdido),e=>e.codigo==='CONFIRMACION_PENDIENTE');
 const r=await f.ejecutar('crear',{...body,operacionId:id});assert.equal(r.repetida,true);
 const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_nat_evento WHERE actor_id=? AND operacion_id=?',[f.admin,id]);assert.equal(Number(n.n),1);
});
test('fallo SQL al auditar revierte stock y versión completos',async()=>{
 const f=await fixture(),fallo={getConnection:async()=>{const c=await pool.getConnection();return new Proxy(c,{get(t,k){if(k==='execute')return (sql,params)=>t.execute(sql,sql.startsWith('INSERT INTO ims_nat_evento')?[...params.slice(0,6),'{',params[7]]:params);const v=Reflect.get(t,k);return typeof v==='function'?v.bind(t):v;}});}};
 await assert.rejects(f.ejecutar('lineas',{inventarioId:f.inv,versionEsperada:f.version,filas:f.filas},f.admin,fallo),e=>e.codigo==='GUARDADO_RECHAZADO');
 const r=await f.leer();assert.equal(r.lineas.length,0);assert.equal(r.inventario.version,'0');
});
test('cuenta nueva no importa identidad de RRHH ni recibe acceso hasta asignarse; reintento no cambia contraseña',async()=>{
 const f=await fixture(),body={operacionId:randomUUID(),sede:'UIO',correo:randomUUID()+'@sintetico.invalid',nombre:'Prueba',contrasena:'Clave_sintetica_para_ensayo!'};
 const r=await f.ejecutar('usuario',body);assert.equal(r.sinPermisos,true);
 await assert.rejects(f.leer(r.actorId),e=>e.codigo==='SIN_PERMISO');
 assert.equal((await f.ejecutar('usuario',body)).actorId,r.actorId);
 await assert.rejects(f.ejecutar('usuario',{...body,contrasena:'Otra_clave_de_ensayo!'}),e=>e.codigo==='OPERACION_REUTILIZADA');
 await assert.rejects(f.ejecutar('usuario',{...body,operacionId:randomUUID()},f.operador),e=>e.codigo==='SIN_PERMISO');
 const [[event]]=await pool.execute('SELECT antes,despues,resultado FROM ims_nat_evento WHERE actor_id=? AND operacion_id=?',[f.admin,body.operacionId]);
 assert.equal(JSON.stringify(event).includes(body.contrasena),false);
});
test('HTTP real exige sesión, CSRF y habilitación; no acepta rol ni correo en captura',async t=>{
 const f=await fixture(),origin='https://ims.invalid',server=crearApi({pool,publicUrl:origin,operacionNativa:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/api/operacion')).status,401);
 const login=await fetch(base+'/api/sesion',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({correo:f.admin+'@sintetico.invalid',contrasena:'Clave_sintetica_nativa_2026!'})});
 const s=await login.json();assert.equal(s.operacionNativa,true);const headers={Origin:origin,Cookie:login.headers.get('set-cookie').split(';')[0],'Content-Type':'application/json'};
 assert.equal((await fetch(base+'/api/operacion/crear',{method:'POST',headers,body:'{}'})).status,403);
 headers['X-IMS-CSRF']=s.csrf;const r=await fetch(base+'/api/operacion',{headers});assert.equal(r.status,200);assert.equal((await r.json()).inventarios.length,1);
});
test('cuenta SQL operativa: flujo permitido y protección del histórico, conteos previos, auditoría y otras bases',{
 skip:process.env.IMS_NATIVA_PRIVILEGIOS!=='1'
},async t=>{
 const runtime=await crearPoolConteos({...process.env,MYSQL_USER:'ims_cm_operacion',MYSQL_PASSWORD:process.env.IMS_RUNTIME_PASSWORD});t.after(()=>runtime.end());
 const f=await fixture();
 const run=(tipo,body)=>f.ejecutar(tipo,body,f.admin,runtime);
 const creado=await run('crear',{sede:'UIO',codigo:'091126_RUNTIME',clientes:[f.cliente],fechaInicio:'2026-11-09'});
 const carga=await run('lineas',{inventarioId:creado.inventarioId,versionEsperada:'0',filas:f.filas});
 const activa=await run('activar',{inventarioId:creado.inventarioId,versionEsperada:carga.version,filasEsperadas:2,depotEsperado:'14'});
 const l=(await consultarOperacion(runtime,{actorId:f.admin},creado.inventarioId)).lineas[0];
 await guardarConteo({pool:runtime,principal:{actorId:f.admin},soloNativos:true,solicitud:{operacionId:randomUUID(),inventarioId:creado.inventarioId,lineaId:l.id,versionEsperada:'0',etapa:1,cantidad:'0'}});
 await assert.rejects(runtime.execute('UPDATE ims_op_linea SET conteo_1=99 WHERE id=?',[l.id]),e=>e.code==='ER_SIGNAL_EXCEPTION');
 await assert.rejects(runtime.execute('UPDATE ims_op_linea SET sku=? WHERE id=?',['OTRO',l.id]),e=>/DENIED/.test(e.code));
 await assert.rejects(runtime.query('UPDATE ims_nat_ambito SET rol=rol'),e=>/DENIED/.test(e.code));
 await assert.rejects(runtime.query('DELETE FROM ims_op_auditoria'),e=>/DENIED/.test(e.code));
 await assert.rejects(runtime.query('SELECT * FROM mysql.user'),e=>/DENIED/.test(e.code));
 await assert.rejects(runtime.query('SELECT * FROM ims_snapshot_fila'),e=>/DENIED/.test(e.code));
 const hist=randomUUID(),linea=randomUUID();
 await pool.execute("INSERT INTO ims_op_inventario VALUES (?,'UIO','HISTORICO_RUNTIME','ENTREGADO')",[hist]);
 await pool.execute('INSERT INTO ims_op_inventario_cliente VALUES (?,?)',[hist,f.cliente]);
 await pool.execute("INSERT INTO ims_op_linea(id,inventario_id,cliente_id,sku,observacion) VALUES (?,?,?,'0001','HISTORICO')",[linea,hist,f.cliente]);
 await assert.rejects(runtime.execute("UPDATE ims_op_inventario SET estado='EN_PROCESO' WHERE id=?",[hist]),e=>e.code==='ER_SIGNAL_EXCEPTION');
 await assert.rejects(runtime.execute('UPDATE ims_op_linea SET conteo_1=1 WHERE id=?',[linea]),e=>e.code==='ER_SIGNAL_EXCEPTION');
 await assert.rejects(runtime.execute('INSERT INTO ims_nat_inventario(inventario_id,creador_id,fecha_inicio) VALUES (?,?,?)',[hist,f.admin,'2026-11-09']),e=>e.code==='ER_SIGNAL_EXCEPTION');
 await assert.rejects(runtime.execute('INSERT INTO ims_op_permiso VALUES (?,?,?,1)',[f.admin,hist,f.cliente]),e=>e.code==='ER_SIGNAL_EXCEPTION');
});
