import {createHash} from 'node:crypto';
import {transaccionOperativa,exigirAmbitoOperacion} from './operacion-nativa.mjs';
import {uuid,texto,fecha,campos,exigirOperacion as exigir} from '../dominio/operacion.mjs';
import {comprobarLineaLegado,insertarLineasLegado} from './lineas-legado.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
export async function listarPendientesLegado(pool,p){return transaccionOperativa(pool,p,async c=>{
 const [rs]=await c.execute(`SELECT e.resultado FROM ims_nat_evento e JOIN ims_nat_ambito a ON a.actor_id=? AND a.rol='ADMIN' AND a.sede=JSON_UNQUOTE(JSON_EXTRACT(e.resultado,'$.sede'))
  WHERE e.tipo='pendiente_legado' AND NOT EXISTS(SELECT 1 FROM ims_nat_evento z WHERE z.tipo='iniciar_pendiente' AND JSON_UNQUOTE(JSON_EXTRACT(z.antes,'$.pendienteId'))=e.operacion_id) ORDER BY e.creado_en,e.operacion_id LIMIT 101`,[p.actorId]);
 exigir(rs.length<=100,'SOLICITUD_INVALIDA','Hay demasiados pendientes para este listado.');
 return {datos:rs.map(r=>{const x=JSON.parse(r.resultado);return {pendienteId:x.pendienteId,sede:x.sede,clienteId:x.clienteId,cliente:x.cliente,productos:x.productos};})};
});}
export async function iniciarPendienteLegado({pool,principal:p,solicitud:s}){
 campos(s,['operacionId','pendienteId','codigo','fechaInicio']);uuid(s.operacionId);uuid(s.pendienteId);
 const codigo=texto(s.codigo,255,false),inicio=fecha(s.fechaInicio);exigir(/^\d{6}_.+/.test(codigo),'SOLICITUD_INVALIDA','Indica el código DDMMAA_CLIENTE al iniciar.');
 const digest=sha(JSON.stringify({pendienteId:s.pendienteId,codigo,fechaInicio:inicio}));
 // La evidencia es inmutable: la cuenta operativa no recibe UPDATE sobre ella.
 // El bloqueo nombrado serializa el inicio entre administradores y se libera
 // después de COMMIT/ROLLBACK, también cuando se pierde una respuesta.
 const conexion=await pool.getConnection(),lock='ims-pendiente:'+s.pendienteId;let bloqueada=false,destruida=false;
 const prestada=new Proxy(conexion,{get(o,k){if(k==='release')return ()=>{};if(k==='destroy')return ()=>{destruida=true;o.destroy();};const v=Reflect.get(o,k);return typeof v==='function'?v.bind(o):v;}});
 try{
  const [[l]]=await conexion.execute('SELECT GET_LOCK(?,5) AS adquirido',[lock]);exigir(Number(l.adquirido)===1,'CONFIRMACION_PENDIENTE','Otro inicio está en curso. Recupera esta misma operación.');bloqueada=true;
  return await transaccionOperativa({getConnection:async()=>prestada},p,async c=>{
  const [rows]=await c.execute("SELECT actor_id,resultado,despues,payload_sha256 FROM ims_nat_evento WHERE operacion_id=? AND tipo='pendiente_legado'",[s.pendienteId]);
  exigir(rows.length===1,'SIN_PERMISO','Pendiente no autorizado.');const f=rows[0],cab=JSON.parse(f.resultado);await exigirAmbitoOperacion(c,p,cab.sede,true);
  const [[prev]]=await c.execute('SELECT tipo,payload_sha256,resultado FROM ims_nat_evento WHERE actor_id=? AND operacion_id=? FOR SHARE',[p.actorId,s.operacionId]);
  if(prev){exigir(prev.tipo==='iniciar_pendiente'&&prev.payload_sha256===digest,'OPERACION_REUTILIZADA','El identificador pertenece a otra solicitud.');return {...JSON.parse(prev.resultado),repetida:true};}
  const [[op]]=await c.execute('SELECT operacion_id FROM ims_op_operacion WHERE actor_id=? AND operacion_id=? FOR SHARE',[p.actorId,s.operacionId]);exigir(!op,'OPERACION_REUTILIZADA','El identificador pertenece a otra captura.');
  const [[empezado]]=await c.execute("SELECT operacion_id FROM ims_nat_evento WHERE tipo='iniciar_pendiente' AND JSON_UNQUOTE(JSON_EXTRACT(antes,'$.pendienteId'))=? LIMIT 1",[s.pendienteId]);exigir(!empezado,'INVENTARIO_NO_EDITABLE','El pendiente ya fue iniciado.');
  const [[repetido]]=await c.execute('SELECT i.id FROM ims_op_inventario i JOIN ims_nat_inventario n ON n.inventario_id=i.id WHERE i.sede=? AND UPPER(TRIM(i.codigo_operativo))=UPPER(TRIM(?)) LIMIT 1 FOR SHARE',[cab.sede,codigo]);exigir(!repetido,'CODIGO_EXISTENTE','Ya existe ese código en la sede.');
  exigir(sha(f.despues)===f.payload_sha256,'SOLICITUD_INVALIDA','La copia del pendiente no coincide.');const datos=JSON.parse(f.despues),ls=datos.lineas;
  exigir(Array.isArray(ls)&&ls.length===cab.productos&&ls.length>0&&ls.length<=100000,'SOLICITUD_INVALIDA','La cantidad de líneas no coincide.');
  ls.forEach((l,n)=>{comprobarLineaLegado(l,{pendiente:true});exigir(l.cliente_id===cab.clienteId&&l.pendiente_id===s.pendienteId&&l.numero===n+1);});
  const [[cliente]]=await c.execute('SELECT nombre FROM ims_op_cliente WHERE id=? FOR SHARE',[cab.clienteId]);exigir(cliente?.nombre===cab.cliente,'SOLICITUD_INVALIDA','El cliente del pendiente cambió.');
  const id=s.pendienteId;
  await c.execute("INSERT INTO ims_op_inventario(id,sede,codigo_operativo,estado) VALUES (?,?,?,'EN_PROCESO')",[id,cab.sede,codigo]);
  await c.execute('INSERT INTO ims_nat_inventario(inventario_id,creador_id,version,borrador,fecha_inicio) VALUES (?,?,1,1,?)',[id,p.actorId,inicio]);
  await c.execute('INSERT INTO ims_op_inventario_cliente VALUES (?,?)',[id,cab.clienteId]);await c.execute('INSERT INTO ims_op_permiso VALUES (?,?,?,1)',[p.actorId,id,cab.clienteId]);await c.execute("INSERT INTO ims_nat_perfil VALUES (?,?,?,'SUPERVISOR')",[p.actorId,id,cab.clienteId]);
  await insertarLineasLegado(c,id,ls);await c.execute('UPDATE ims_nat_inventario SET borrador=0 WHERE inventario_id=?',[id]);
  const r={ok:true,operacionId:s.operacionId,inventarioId:id,version:'1',borrador:false,lineas:ls.length};
  await c.execute('INSERT INTO ims_nat_evento(actor_id,operacion_id,tipo,inventario_id,payload_sha256,resultado,antes,despues) VALUES (?,?,?,?,?,?,?,?)',[p.actorId,s.operacionId,'iniciar_pendiente',id,digest,JSON.stringify(r),JSON.stringify({pendienteId:s.pendienteId,corteId:cab.corteId,copiaId:cab.copiaId}),JSON.stringify({codigo,fechaInicio:inicio})]);return {...r,repetida:false};
  });
 }finally{if(bloqueada&&!destruida)try{await conexion.execute('SELECT RELEASE_LOCK(?)',[lock]);}catch{destruida=true;conexion.destroy();}if(!destruida)conexion.release();}
}
