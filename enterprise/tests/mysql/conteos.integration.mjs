// Ensayo destructible en una base propia de pruebas. Nunca contra datos actuales.
import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {crearPoolConteos,guardarConteo} from '../../src/mysql/conteos.mjs';

if(process.env.IMS_MYSQL_PRUEBAS!=='1'||!/^centromando_ims_pruebas(?:_[a-z0-9]+)?$/.test(process.env.MYSQL_DATABASE||''))
  throw Error('Requiere IMS_MYSQL_PRUEBAS=1 y base exclusiva centromando_ims_pruebas[_sufijo].');
let pool;
before(async()=>{
  pool=await crearPoolConteos(process.env);
  const [[v]]=await pool.query('SELECT VERSION() AS version');console.log('Motor de ensayo:',v.version);
  const ddl=await readFile(new URL('../../sql/002_conteo_operativo.sql',import.meta.url),'utf8');
  for(const stmt of ddl.split(';').map(x=>x.trim()).filter(Boolean))await pool.query(stmt);
});
after(async()=>{if(pool)await pool.end();});

async function fixture(){
  const f={actor:randomUUID(),lector:randomUUID(),cliente:randomUUID(),otroCliente:randomUUID(),
    inventario:randomUUID(),otroInventario:randomUUID(),linea:randomUUID(),otraLinea:randomUUID(),lineaOtroCliente:randomUUID()};
  await pool.execute('INSERT INTO ims_op_actor (id,activo) VALUES (?,1),(?,1)',[f.actor,f.lector]);
  await pool.execute('INSERT INTO ims_op_cliente (id,nombre) VALUES (?,?),(?,?)',[f.cliente,'CLIENTE_A_SINTETICO',f.otroCliente,'CLIENTE_B_SINTETICO']);
  await pool.execute('INSERT INTO ims_op_inventario (id,sede,codigo_operativo,estado) VALUES (?,?,?,?),(?,?,?,?)',
    [f.inventario,'UIO','250724_IBM','EN_PROCESO',f.otroInventario,'GYE','250724_IBM','EN_PROCESO']);
  for(const [inv,cli] of [[f.inventario,f.cliente],[f.inventario,f.otroCliente],[f.otroInventario,f.cliente]])
    await pool.execute('INSERT INTO ims_op_inventario_cliente (inventario_id,cliente_id) VALUES (?,?)',[inv,cli]);
  for(const inv of [f.inventario,f.otroInventario])
    await pool.execute('INSERT INTO ims_op_permiso (actor_id,inventario_id,cliente_id,puede_contar) VALUES (?,?,?,1)',[f.actor,inv,f.cliente]);
  await pool.execute('INSERT INTO ims_op_permiso (actor_id,inventario_id,cliente_id,puede_contar) VALUES (?,?,?,0)',[f.lector,f.inventario,f.cliente]);
  for(const [id,inv,cli,origen] of [[f.linea,f.inventario,f.cliente,'origen-a'],[f.otraLinea,f.otroInventario,f.cliente,'origen-b'],[f.lineaOtroCliente,f.inventario,f.otroCliente,'origen-a']])
    await pool.execute('INSERT INTO ims_op_linea (id,inventario_id,cliente_id,sku,origen_drive,fila_origen,observacion) VALUES (?,?,?,?,?,2,?)',
      [id,inv,cli,'SKU_REPETIDO_SINTETICO',origen,'nota humana']);
  f.solicitud={operacionId:randomUUID(),inventarioId:f.inventario,lineaId:f.linea,etapa:1,versionEsperada:'0',cantidad:'0.25'};
  f.enviar=(s={},actor=f.actor,p=pool)=>guardarConteo({pool:p,principal:{actorId:actor},solicitud:{...f.solicitud,...s}});
  return f;
}
async function linea(id){const [[row]]=await pool.execute('SELECT * FROM ims_op_linea WHERE id=?',[id]);return row;}
async function total(table,actor){
  assert.ok(['ims_op_operacion','ims_op_auditoria'].includes(table));
  const [[r]]=await pool.execute(`SELECT COUNT(*) AS n FROM ${table} WHERE actor_id=?`,[actor]);return Number(r.n);
}
test('diez envios simultaneos de una operacion crean un conteo y una auditoria',async()=>{
  const f=await fixture();const r=await Promise.all(Array.from({length:10},()=>f.enviar()));
  assert.equal(r.filter(x=>!x.repetida).length,1);
  const l=await linea(f.linea);assert.equal(String(l.version),'1');assert.equal(l.conteo_1,'0.250000000');assert.equal(l.conteo_2,null);
  assert.equal(await total('ims_op_operacion',f.actor),1);assert.equal(await total('ims_op_auditoria',f.actor),1);
});
test('misma operacion con otra cantidad se rechaza sin modificar la linea',async()=>{
  const f=await fixture();await f.enviar();
  await assert.rejects(f.enviar({cantidad:'99'}),e=>e.codigo==='OPERACION_REUTILIZADA');
  assert.equal((await linea(f.linea)).conteo_1,'0.250000000');
});
test('rechazo real CHECK de auditoria revierte conteo y operacion',async()=>{
  const f=await fixture();
  // Solo el adaptador de prueba altera el JSON enviado. MySQL ejecuta y rechaza
  // realmente el INSERT; no requiere triggers, SUPER ni cambios globales.
  const auditoriaInvalida={getConnection:async()=>{
    const real=await pool.getConnection();
    return new Proxy(real,{get(target,key){
      if(key==='execute')return async(sql,params)=>{
        if(sql.startsWith('INSERT INTO ims_op_auditoria'))params=[...params.slice(0,3),'{',params[4]];
        return target.execute(sql,params);
      };
      const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
    }});
  }};
  await assert.rejects(f.enviar({},f.actor,auditoriaInvalida),e=>e.codigo==='GUARDADO_RECHAZADO'&&e.cause.code==='ER_CHECK_CONSTRAINT_VIOLATED');
  const l=await linea(f.linea);assert.equal(l.conteo_1,null);assert.equal(String(l.version),'0');
  assert.equal(await total('ims_op_operacion',f.actor),0);assert.equal(await total('ims_op_auditoria',f.actor),0);
  assert.equal((await f.enviar()).repetida,false);assert.equal((await linea(f.linea)).conteo_2,null);
});
test('dos operaciones concurrentes sobre la misma version no se convierten en C1 y C2',async()=>{
  const f=await fixture();const r=await Promise.allSettled([f.enviar(),f.enviar({operacionId:randomUUID(),cantidad:'2'})]);
  assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(r.find(x=>x.status==='rejected').reason.codigo,'VERSION_DESACTUALIZADA');
  assert.equal((await linea(f.linea)).conteo_2,null);
});
test('lector y cliente ajeno no escriben aunque conozcan identificadores',async()=>{
  const f=await fixture();
  await assert.rejects(f.enviar({},f.lector),e=>e.codigo==='SIN_PERMISO');
  await assert.rejects(f.enviar({lineaId:f.lineaOtroCliente}),e=>e.codigo==='SIN_PERMISO');
  assert.equal(await total('ims_op_operacion',f.actor),0);assert.equal((await linea(f.lineaOtroCliente)).conteo_1,null);
});
test('permiso revocado bloquea tambien el reintento de una operacion confirmada',async()=>{
  const f=await fixture();await f.enviar();
  await pool.execute('UPDATE ims_op_permiso SET puede_contar=0 WHERE actor_id=?',[f.actor]);
  await assert.rejects(f.enviar(),e=>e.codigo==='SIN_PERMISO');
  assert.equal(await total('ims_op_auditoria',f.actor),1);
});
test('entregado no acepta nuevos conteos; un reintento autorizado devuelve el resultado previo',async()=>{
  const f=await fixture();await f.enviar();
  await pool.execute("UPDATE ims_op_inventario SET estado='ENTREGADO' WHERE id=?",[f.inventario]);
  assert.equal((await f.enviar()).repetida,true);
  await assert.rejects(f.enviar({operacionId:randomUUID(),etapa:2,versionEsperada:'1'}),e=>e.codigo==='INVENTARIO_NO_EDITABLE');
});
test('inventario en validacion conserva datos sin aceptar capturas nuevas',async()=>{
  const f=await fixture();await pool.execute("UPDATE ims_op_inventario SET estado='EN_VALIDACION' WHERE id=?",[f.inventario]);
  await assert.rejects(f.enviar(),e=>e.codigo==='INVENTARIO_NO_EDITABLE');
  assert.equal((await linea(f.linea)).observacion,'nota humana');assert.equal(await total('ims_op_operacion',f.actor),0);
});
test('mismo codigo operativo y SKU en dos sedes siguen siendo inventarios independientes',async()=>{
  const f=await fixture();await f.enviar();
  await f.enviar({operacionId:randomUUID(),inventarioId:f.otroInventario,lineaId:f.otraLinea,cantidad:'7'});
  assert.equal((await linea(f.linea)).conteo_1,'0.250000000');assert.equal((await linea(f.otraLinea)).conteo_1,'7.000000000');
  assert.equal(await total('ims_op_auditoria',f.actor),2);
});
test('etapas nuevas explicitas preservan cero, notas, SKU y cliente de la linea',async()=>{
  const f=await fixture();await f.enviar({cantidad:'0'});
  const r=await f.enviar({operacionId:randomUUID(),etapa:2,versionEsperada:'1',cantidad:'2.125',nuevaPosicion:'NUEVA'});
  const l=await linea(f.linea);assert.equal(l.conteo_1,'0.000000000');assert.equal(l.conteo_2,'2.125000000');assert.equal(l.observacion,'nota humana');
  assert.equal(l.nueva_posicion,'NUEVA');assert.equal(r.clienteId,f.cliente);assert.equal(r.sku,'SKU_REPETIDO_SINTETICO');
  const [[a]]=await pool.execute('SELECT antes,despues FROM ims_op_auditoria WHERE actor_id=? AND operacion_id=?',[f.actor,r.operacionId]);
  assert.equal(JSON.parse(a.antes).version,'1');assert.equal(JSON.parse(a.despues).version,'2');
});
test('respuesta perdida despues del COMMIT se resuelve con el mismo identificador',async()=>{
  const f=await fixture();
  const respuestaPerdida={getConnection:async()=>{
    const real=await pool.getConnection();
    return new Proxy(real,{get(target,key){
      if(key==='commit')return async()=>{await target.commit();throw Object.assign(Error('respuesta_perdida_simulada'),{code:'PROTOCOL_CONNECTION_LOST'});};
      const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
    }});
  }};
  await assert.rejects(f.enviar({},f.actor,respuestaPerdida),e=>e.codigo==='CONFIRMACION_PENDIENTE');
  assert.equal((await f.enviar()).repetida,true);assert.equal(await total('ims_op_auditoria',f.actor),1);
  assert.equal((await linea(f.linea)).conteo_2,null);
});
test('mismo identificador compitiendo en dos inventarios no confirma dos operaciones',async()=>{
  const f=await fixture();
  const r=await Promise.allSettled([f.enviar(),f.enviar({inventarioId:f.otroInventario,lineaId:f.otraLinea})]);
  assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(r.find(x=>x.status==='rejected').reason.codigo,'OPERACION_REUTILIZADA');
  assert.equal(await total('ims_op_operacion',f.actor),1);assert.equal(await total('ims_op_auditoria',f.actor),1);
  const a=await linea(f.linea),b=await linea(f.otraLinea);assert.equal([a,b].filter(x=>x.conteo_1!==null).length,1);
});
