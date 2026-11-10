import {randomUUID,createHash} from 'node:crypto';
import {ErrorConteo} from '../dominio/conteo.mjs';
import {correoCanonico,crearHashPassword,verificarPassword} from '../auth/credenciales.mjs';
import {exigirOperacion as exigir,uuid,texto,fecha,version,campos,filaStock,ajusteExacto} from '../dominio/operacion.mjs';
import {acumuladorWms,resultadoWms,decimal,textoDecimal} from '../dominio/analisis-wms.mjs';
import {prepararCaptura,consultarSerieInterna,exigirClienteCaptura} from './series.mjs';
const SUPER=['SUPERVISOR'];
const ROLES=['SUPERVISOR','OPERADOR','AUDITOR','LECTOR'];
function canon(v){return Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;}
function hash(v){return createHash('sha256').update(JSON.stringify(canon(v))).digest('hex');}
export async function autenticarTransaccion(c,p){
 exigir(p?.actorId,'NO_AUTENTICADO','Se requiere sesión.');uuid(p.actorId);
 const [[db]]=await c.query('SELECT DATABASE() AS nombre,CURRENT_USER() AS usuario');
 exigir(/^centromando_ims(?:_[a-z0-9_]+)?$/.test(db.nombre||'')&&!/^root@/i.test(db.usuario||''),'BASE_NO_PERMITIDA','Base no permitida.');
 const [[a]]=await c.execute('SELECT activo FROM ims_op_actor WHERE id=? FOR SHARE',[p.actorId]);
 exigir(a?.activo,'SIN_PERMISO','Acceso no autorizado.');
 if(p.sesionHash!==undefined){
  exigir(/^[a-f0-9]{64}$/.test(p.sesionHash),'NO_AUTENTICADO','Sesión inválida.');
  const [[s]]=await c.execute(`SELECT s.actor_id FROM ims_auth_sesion s JOIN ims_auth_usuario u
   ON u.actor_id=s.actor_id AND u.version=s.usuario_version WHERE s.sesion_hash=? AND s.actor_id=?
   AND s.revocada=0 AND s.expira_en>UTC_TIMESTAMP(6) FOR SHARE`,[p.sesionHash,p.actorId]);
  exigir(s,'NO_AUTENTICADO','La sesión ya no está vigente.');
 }
}
export async function exigirCapturaNativa(c,p,inventarioId,clienteId){
 const [[r]]=await c.execute(`SELECT n.borrador,p.rol FROM ims_nat_inventario n JOIN ims_nat_perfil p
  ON p.inventario_id=n.inventario_id WHERE n.inventario_id=? AND p.actor_id=? AND p.cliente_id=? FOR SHARE`,
 [inventarioId,p.actorId,clienteId]);
 exigir(r&&!r.borrador&&['OPERADOR','SUPERVISOR'].includes(r.rol),'SIN_PERMISO','Este inventario no está habilitado para captura nativa.');
}
async function ambito(c,p,sede,admin=false){
 exigir(['UIO','GYE'].includes(sede));
 const [[r]]=await c.execute('SELECT rol FROM ims_nat_ambito WHERE actor_id=? AND sede=? FOR SHARE',[p.actorId,sede]);
 exigir(r&&(!admin||r.rol==='ADMIN'),'SIN_PERMISO','No tienes ese permiso para la sede.');return r;
}
async function acceso(c,p,id,roles,completo=false,bloquear=false){
 uuid(id);
 const [[n]]=await c.execute(`SELECT i.*,n.version,n.borrador,n.fecha_inicio,n.fecha_entrega,n.mostrar_depot,
  n.fecha_programada,n.responsable FROM ims_op_inventario i JOIN ims_nat_inventario n ON n.inventario_id=i.id
  WHERE i.id=? ${bloquear?'FOR UPDATE':''}`,[id]);
 exigir(n,'SIN_PERMISO','Inventario nativo no autorizado.');
 const [perfiles]=await c.execute(`SELECT p.cliente_id,p.rol,cli.nombre,a.puede_contar FROM ims_nat_perfil p
  JOIN ims_op_permiso a ON a.actor_id=p.actor_id AND a.inventario_id=p.inventario_id AND a.cliente_id=p.cliente_id
  JOIN ims_op_cliente cli ON cli.id=p.cliente_id WHERE p.inventario_id=? AND p.actor_id=? FOR SHARE`,[id,p.actorId]);
 exigir(perfiles.length&&(!roles||perfiles.every(r=>roles.includes(r.rol))),'SIN_PERMISO','Acceso no autorizado.');
 if(completo){
  const [[t]]=await c.execute('SELECT COUNT(*) AS n FROM ims_op_inventario_cliente WHERE inventario_id=?',[id]);
  exigir(Number(t.n)===perfiles.length,'SIN_PERMISO','Esta acción requiere autorización sobre todos los clientes del inventario.');
 }
 return {...n,version:String(n.version),perfiles};
}
async function nuevaVersion(c,n){await c.execute('UPDATE ims_nat_inventario SET version=version+1 WHERE inventario_id=?',[n.id]);return String(BigInt(n.version)+1n);}
function mismaVersion(n,s){exigir(n.version===version(s.versionEsperada),'VERSION_DESACTUALIZADA','El inventario cambió. Actualiza antes de continuar.');}
async function transaccion(pool,p,fn){
 for(let intento=0;intento<3;intento++){
  const c=await pool.getConnection();let abierta=false,commit=false,destruir=false;
  try{
   await c.query("SET time_zone = '+00:00'");await c.beginTransaction();abierta=true;
   await autenticarTransaccion(c,p);const result=await fn(c);
   commit=true;await c.commit();commit=false;abierta=false;return result;
  }catch(e){
   if(abierta)try{await c.rollback();}catch{destruir=true;}
   if(commit){destruir=true;throw new ErrorConteo('CONFIRMACION_PENDIENTE','Reintenta la misma operación para recuperar la confirmación.');}
   if(e instanceof ErrorConteo||e.name==='ErrorAuth')throw e;
   if(['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(e.code)&&intento<2)continue;
   throw new ErrorConteo('GUARDADO_RECHAZADO','No se confirmó la operación. Conserva su identificador y reintenta.',{cause:e});
  }finally{if(destruir)c.destroy();else c.release();}
 }
}
const CAMPOS={
 crear:['sede','codigo','clientes','fechaInicio','fechaProgramada','responsable'],
 lineas:['inventarioId','versionEsperada','filas'],activar:['inventarioId','versionEsperada','filasEsperadas','depotEsperado'],
 asignar:['inventarioId','versionEsperada','actorId','clienteId','rol'],
 estado:['inventarioId','versionEsperada','estado','confirmarIncompleto','fechaEntrega'],
 depot:['inventarioId','versionEsperada','visible'],
 ajustar:['inventarioId','versionEsperada','lineaId','versionLinea','ajuste','motivo','justificacion'],
 usuario:['sede','correo','nombre','contrasena'],
 serie:['inventarioId','clienteId','serie','lineaId','versionLinea','etapa','posicion','nuevaPosicion','confirmarSimilar','hallazgo'],
 hallazgo:['inventarioId','clienteId','datos']
};
/** Todas las mutaciones se limitan a inventarios creados aquí, nunca al histórico migrado.
 * operacionId se conserva al reintentar, incluso si se pierde la respuesta de COMMIT.
 */
export async function ejecutarOperacion({pool,principal:p,tipo,solicitud:s}){
 exigir(Object.hasOwn(CAMPOS,tipo));campos(s,['operacionId',...CAMPOS[tipo]]);uuid(s.operacionId);
 const digest=hash({tipo,...s,...(tipo==='usuario'?{contrasena:undefined}:{})});

 if(tipo==='usuario'){
  correoCanonico(s.correo);texto(s.nombre,255,false);
  exigir(typeof s.contrasena==='string'&&s.contrasena.length>=12&&Buffer.byteLength(s.contrasena)<=1024);

 }
 return transaccion(pool,p,async c=>{
  let n;
  if(['crear','usuario'].includes(tipo))await ambito(c,p,s.sede,tipo==='usuario');
  else n=await acceso(c,p,s.inventarioId,['serie','hallazgo'].includes(tipo)?null:SUPER,!['serie','hallazgo'].includes(tipo),true);
  if(['serie','hallazgo'].includes(tipo))exigir(n.perfiles.some(r=>r.cliente_id===s.clienteId&&Number(r.puede_contar)===1&&['SUPERVISOR','OPERADOR'].includes(r.rol)),'SIN_PERMISO','Cliente no autorizado para captura.');
  const [[prev]]=await c.execute('SELECT tipo,payload_sha256,resultado FROM ims_nat_evento WHERE actor_id=? AND operacion_id=? FOR SHARE',[p.actorId,s.operacionId]);
  if(prev){
   exigir(prev.tipo===tipo&&prev.payload_sha256===digest,'OPERACION_REUTILIZADA','El identificador ya pertenece a otra solicitud.');
   const resultado=JSON.parse(prev.resultado);
   if(tipo==='usuario'){
    const [[u]]=await c.execute('SELECT password_hash FROM ims_auth_usuario WHERE actor_id=?',[resultado.actorId]);
    exigir(u&&await verificarPassword(s.contrasena,u.password_hash),'OPERACION_REUTILIZADA','La cuenta ya fue creada con otra contraseña.');
   }
   return {...resultado,repetida:true};
  }
  const [[otro]]=await c.execute('SELECT operacion_id FROM ims_op_operacion WHERE actor_id=? AND operacion_id=? FOR SHARE',[p.actorId,s.operacionId]);
  exigir(!otro,'OPERACION_REUTILIZADA','El identificador ya pertenece a otra captura.');
  if(n&&!['serie','hallazgo'].includes(tipo))mismaVersion(n,s);
  let antes=n?{estado:n.estado,version:n.version,borrador:!!n.borrador}:null;
  let result,persistir;
  if(tipo==='crear'){
   const codigo=texto(s.codigo,255,false);exigir(/^\d{6}_.+/.test(codigo),'SOLICITUD_INVALIDA','Usa el código literal DDMMAA_CLIENTE; la fecha se registra por separado.');
   const inicio=fecha(s.fechaInicio),programada=s.fechaProgramada?fecha(s.fechaProgramada):null;
   const responsable=texto(s.responsable??'',255);
   exigir(Array.isArray(s.clientes)&&s.clientes.length>0&&s.clientes.length<=50&&new Set(s.clientes).size===s.clientes.length);
   for(const cli of s.clientes){uuid(cli);const [[r]]=await c.execute('SELECT id FROM ims_op_cliente WHERE id=? FOR SHARE',[cli]);exigir(r,'SOLICITUD_INVALIDA','Cliente no catalogado.');}
   const id=randomUUID();
   await c.execute("INSERT INTO ims_op_inventario(id,sede,codigo_operativo,estado) VALUES (?,?,?,'EN_PROCESO')",[id,s.sede,codigo]);
   await c.execute('INSERT INTO ims_nat_inventario(inventario_id,creador_id,fecha_inicio,fecha_programada,responsable) VALUES (?,?,?,?,?)',[id,p.actorId,inicio,programada,responsable]);
   for(const cli of s.clientes){
    await c.execute('INSERT INTO ims_op_inventario_cliente VALUES (?,?)',[id,cli]);
    await c.execute('INSERT INTO ims_op_permiso VALUES (?,?,?,1)',[p.actorId,id,cli]);
    await c.execute("INSERT INTO ims_nat_perfil VALUES (?,?,?,'SUPERVISOR')",[p.actorId,id,cli]);
   }
   result={inventarioId:id,version:'0',borrador:true};
  }else if(tipo==='usuario'){
   const correo=correoCanonico(s.correo);
   const [[prevUser]]=await c.execute('SELECT actor_id FROM ims_auth_usuario WHERE correo=? FOR SHARE',[correo]);
   exigir(!prevUser,'SOLICITUD_INVALIDA','El correo ya tiene una cuenta propia. No se cambia su identidad ni su contraseña.');
   const actor=randomUUID();await c.execute('INSERT INTO ims_op_actor VALUES (?,1)',[actor]);
   await c.execute('INSERT INTO ims_auth_usuario(actor_id,correo,nombre,password_hash) VALUES (?,?,?,?)',[actor,correo,texto(s.nombre,255,false),await crearHashPassword(s.contrasena)]);
   result={actorId:actor,correo,sinPermisos:true};
  }else if(tipo==='lineas'){
   exigir(n.borrador&&n.estado==='EN_PROCESO','INVENTARIO_NO_EDITABLE','La carga de stock ya está cerrada.');
   exigir(Array.isArray(s.filas)&&s.filas.length>0&&s.filas.length<=10);
   const filas=s.filas.map(filaStock),ids=[];
   for(const f of filas){
    exigir(n.perfiles.some(r=>r.cliente_id===f.clienteId),'SIN_PERMISO','Cliente ajeno al inventario.');
    const [[existente]]=await c.execute(`SELECT l.id,l.sku,l.cliente_id,x.numero,x.depot,x.abc,x.despacho,x.partida,x.categoria,x.estado_mercancia,
     d.descripcion,d.posicion,d.serie,d.lote,d.unidad FROM ims_nat_linea x JOIN ims_op_linea l ON l.id=x.linea_id
     JOIN ims_op_detalle_linea d ON d.linea_id=l.id WHERE x.inventario_id=? AND x.numero=? FOR SHARE`,[n.id,f.numero]);
    if(existente){
     const previa={numero:Number(existente.numero),clienteId:existente.cliente_id,sku:existente.sku,depot:existente.depot,
      ...Object.fromEntries(['descripcion','posicion','serie','lote','unidad','abc','despacho','partida','categoria'].map(k=>[k,existente[k]])),estadoMercancia:existente.estado_mercancia};
     exigir(hash(previa)===hash(f),'SOLICITUD_INVALIDA','La fila ya existe con otros datos; no se sobrescribe el stock.');ids.push(existente.id);continue;
    }
    const id=randomUUID();ids.push(id);
    await c.execute('INSERT INTO ims_op_linea(id,inventario_id,cliente_id,sku,observacion) VALUES (?,?,?,?,?)',[id,n.id,f.clienteId,f.sku,'']);
    await c.execute('INSERT INTO ims_op_detalle_linea(linea_id,posicion,descripcion,serie,lote,unidad) VALUES (?,?,?,?,?,?)',[id,f.posicion,f.descripcion,f.serie,f.lote,f.unidad]);
    await c.execute('INSERT INTO ims_nat_linea(linea_id,inventario_id,numero,depot,justificacion,abc,despacho,partida,categoria,estado_mercancia) VALUES (?,?,?,?,?,?,?,?,?,?)',
     [id,n.id,f.numero,f.depot,'',f.abc,f.despacho,f.partida,f.categoria,f.estadoMercancia]);
   }
   result={inventarioId:n.id,lineas:ids,version:await nuevaVersion(c,n)};
  }else if(tipo==='activar'){
   exigir(n.borrador&&n.estado==='EN_PROCESO','INVENTARIO_NO_EDITABLE','El stock ya fue activado.');
   const [[v]]=await c.execute('SELECT COUNT(*) AS n,MAX(numero) AS maximo,SUM(depot) AS total FROM ims_nat_linea WHERE inventario_id=?',[n.id]);
   exigir(Number.isInteger(s.filasEsperadas)&&s.filasEsperadas>0&&Number(v.n)===s.filasEsperadas&&Number(v.maximo)===s.filasEsperadas&&decimal(v.total)===decimal(s.depotEsperado),
    'SOLICITUD_INVALIDA','La cantidad de filas o suma de stock no coincide. El borrador se conserva.');
   await c.execute('UPDATE ims_nat_inventario SET borrador=0 WHERE inventario_id=?',[n.id]);
   result={inventarioId:n.id,borrador:false,filas:Number(v.n),version:await nuevaVersion(c,n)};
  }else if(tipo==='asignar'){
   uuid(s.actorId);uuid(s.clienteId);exigir([...ROLES,'REVOCADO'].includes(s.rol));
   exigir(n.perfiles.some(r=>r.cliente_id===s.clienteId),'SIN_PERMISO','Cliente no autorizado.');
   exigir(s.actorId!==p.actorId,'SOLICITUD_INVALIDA','Conserva tu permiso de supervisión; otra persona debe revisar su cambio.');
   const [[u]]=await c.execute('SELECT a.id FROM ims_op_actor a JOIN ims_auth_usuario u ON u.actor_id=a.id WHERE a.id=? AND a.activo=1 FOR SHARE',[s.actorId]);
   exigir(u,'SOLICITUD_INVALIDA','La cuenta no existe o está inactiva.');
   const [[anterior]]=await c.execute('SELECT rol FROM ims_nat_perfil WHERE actor_id=? AND inventario_id=? AND cliente_id=? FOR UPDATE',[s.actorId,n.id,s.clienteId]);
   antes={...antes,actorId:s.actorId,clienteId:s.clienteId,rol:anterior?.rol??null};
   if(s.rol==='REVOCADO'){
    await c.execute('DELETE FROM ims_nat_perfil WHERE actor_id=? AND inventario_id=? AND cliente_id=?',[s.actorId,n.id,s.clienteId]);
    await c.execute('DELETE FROM ims_op_permiso WHERE actor_id=? AND inventario_id=? AND cliente_id=?',[s.actorId,n.id,s.clienteId]);
   }else{
   const contar=['SUPERVISOR','OPERADOR'].includes(s.rol)?1:0;
   await c.execute('INSERT INTO ims_op_permiso VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE puede_contar=?',[s.actorId,n.id,s.clienteId,contar,contar]);
   await c.execute('INSERT INTO ims_nat_perfil VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE rol=?',[s.actorId,n.id,s.clienteId,s.rol,s.rol]);
   }
   result={inventarioId:n.id,actorId:s.actorId,clienteId:s.clienteId,rol:s.rol,version:await nuevaVersion(c,n)};
  }else if(tipo==='depot'){
   exigir(typeof s.visible==='boolean');
   await c.execute('UPDATE ims_nat_inventario SET mostrar_depot=? WHERE inventario_id=?',[s.visible?1:0,n.id]);
   result={inventarioId:n.id,mostrarDepot:s.visible,version:await nuevaVersion(c,n)};
  }else if(tipo==='ajustar'){
   exigir(!n.borrador&&['EN_PROCESO','EN_VALIDACION'].includes(n.estado),'INVENTARIO_NO_EDITABLE','El inventario no admite ajustes.');
   uuid(s.lineaId);version(s.versionLinea);const ajuste=ajusteExacto(s.ajuste),motivo=texto(s.motivo,255),justificacion=texto(s.justificacion,8000);
   const [[l]]=await c.execute('SELECT l.*,x.ajuste,x.motivo,x.justificacion FROM ims_op_linea l JOIN ims_nat_linea x ON x.linea_id=l.id WHERE l.id=? AND l.inventario_id=? FOR UPDATE',[s.lineaId,n.id]);
   exigir(l&&n.perfiles.some(r=>r.cliente_id===l.cliente_id),'SIN_PERMISO','Línea no autorizada.');
   exigir(String(l.version)===s.versionLinea,'VERSION_DESACTUALIZADA','La línea cambió.');
   antes={...antes,lineaId:l.id,ajuste:l.ajuste,motivo:l.motivo,justificacion:l.justificacion,versionLinea:String(l.version)};
   await c.execute('UPDATE ims_nat_linea SET ajuste=?,motivo=?,justificacion=? WHERE linea_id=?',[ajuste,motivo,justificacion,l.id]);
   await c.execute('UPDATE ims_op_linea SET version=version+1 WHERE id=?',[l.id]);
   result={inventarioId:n.id,lineaId:l.id,ajuste,motivo,justificacion,versionLinea:String(BigInt(l.version)+1n),version:await nuevaVersion(c,n)};
  }else if(['serie','hallazgo'].includes(tipo)){
   const captura=await prepararCaptura(c,n,p,s,tipo);result=captura.resultado;antes=captura.antes;persistir=captura.persistir;
  }else if(tipo==='estado'){
   exigir(!n.borrador,'INVENTARIO_NO_EDITABLE','Activa primero el stock.');
   exigir(['EN_PROCESO','EN_VALIDACION','ENTREGADO','CANCELADO'].includes(s.estado));
   const permitidos={EN_PROCESO:['EN_VALIDACION','CANCELADO'],EN_VALIDACION:['EN_PROCESO','ENTREGADO','CANCELADO'],ENTREGADO:[],CANCELADO:[]};
   exigir(permitidos[n.estado].includes(s.estado),'INVENTARIO_NO_EDITABLE','Transición no permitida. Los inventarios entregados quedan protegidos.');
   const [[av]]=await c.execute(`SELECT COUNT(*) AS total,SUM(l.conteo_1 IS NOT NULL OR l.conteo_2 IS NOT NULL OR l.conteo_final IS NOT NULL) AS contadas
    FROM ims_op_linea l JOIN ims_nat_linea x ON x.linea_id=l.id WHERE l.inventario_id=? AND TRIM(UPPER(x.categoria))<>'DIF_INV' AND TRIM(l.sku)<>''`,[n.id]);
   const incompleto=Number(av.contadas)<Number(av.total)||Number(av.total)===0;
   if(s.estado==='ENTREGADO'){
    exigir(typeof s.confirmarIncompleto==='boolean');fecha(s.fechaEntrega);
    exigir(!incompleto||s.confirmarIncompleto,'CONFIRMACION_REQUERIDA','El conteo está incompleto. Revisa el avance y confirma expresamente para entregarlo.');
   }else exigir(s.confirmarIncompleto===undefined&&s.fechaEntrega===undefined);
   await c.execute('UPDATE ims_op_inventario SET estado=? WHERE id=?',[s.estado,n.id]);
   if(s.estado==='ENTREGADO')await c.execute('UPDATE ims_nat_inventario SET fecha_entrega=? WHERE inventario_id=?',[s.fechaEntrega,n.id]);
   result={inventarioId:n.id,estado:s.estado,fechaEntrega:s.fechaEntrega??null,incompleto,contadas:Number(av.contadas),total:Number(av.total),publicacionKpi:false,version:await nuevaVersion(c,n)};
  }
  const salida={ok:true,operacionId:s.operacionId,...result};
  await c.execute('INSERT INTO ims_nat_evento(actor_id,operacion_id,tipo,inventario_id,payload_sha256,resultado,antes,despues) VALUES (?,?,?,?,?,?,?,?)',
   [p.actorId,s.operacionId,tipo,result.inventarioId??null,digest,JSON.stringify(salida),JSON.stringify(antes),JSON.stringify(result)]);
  if(persistir)await persistir();
  return {...salida,repetida:false};
 });
}

export async function contextoOperacion(pool,p){
 const [ambitos]=await pool.execute('SELECT s.sede,s.rol FROM ims_nat_ambito s JOIN ims_op_actor a ON a.id=s.actor_id AND a.activo=1 WHERE s.actor_id=?',[p.actorId]);
 const [inventarios]=await pool.execute(`SELECT DISTINCT i.id,i.sede,i.codigo_operativo,i.estado,n.borrador,n.creado_en,
  (SELECT COUNT(*) FROM ims_op_linea l JOIN ims_nat_perfil z ON z.inventario_id=l.inventario_id AND z.cliente_id=l.cliente_id AND z.actor_id=p.actor_id WHERE l.inventario_id=i.id) AS lineas FROM ims_nat_perfil p
  JOIN ims_op_permiso a ON a.actor_id=p.actor_id AND a.inventario_id=p.inventario_id AND a.cliente_id=p.cliente_id
  JOIN ims_op_inventario i ON i.id=p.inventario_id JOIN ims_nat_inventario n ON n.inventario_id=i.id
  WHERE p.actor_id=? ORDER BY n.creado_en DESC,i.id LIMIT 500`,[p.actorId]);
 const [clientes]=ambitos.length?await pool.query('SELECT id,nombre FROM ims_op_cliente ORDER BY nombre,id'): [[]];
 return {ambitos,inventarios,clientes};
}
export async function consultarOperacion(pool,p,id,{analisis=false,cursor=''}={}){
 if(cursor)uuid(cursor);
 return transaccion(pool,p,async c=>{
  const n=await acceso(c,p,id);
  const ciego=n.perfiles.some(r=>r.rol==='OPERADOR')&&!n.mostrar_depot;
  const parametros=[p.actorId,id];
  const base=`FROM ims_op_linea l JOIN ims_nat_linea x ON x.linea_id=l.id JOIN ims_op_detalle_linea d ON d.linea_id=l.id
   JOIN ims_nat_perfil p ON p.inventario_id=l.inventario_id AND p.cliente_id=l.cliente_id AND p.actor_id=?
   JOIN ims_op_cliente cli ON cli.id=l.cliente_id WHERE l.inventario_id=?`;
  if(analisis){
   exigir(!ciego,'SIN_PERMISO','El conteo ciego no revela existencias teóricas ni indicadores.');
   const a=acumuladorWms();let ultimo='';
   do{
    const [rows]=await c.execute(`SELECT l.id,l.sku,l.conteo_1,l.conteo_2,l.conteo_final,d.posicion,x.depot,x.ajuste,x.categoria ${base} AND l.id>? ORDER BY l.id LIMIT 500`,[...parametros,ultimo]);
    for(const r of rows)a.agregar(r);ultimo=rows.length===500?rows.at(-1).id:'';
   }while(ultimo);
   return {...a.terminar(),inventarioId:id,estado:n.estado,publicacionKpi:false};
  }
  const select=ciego?'':',x.depot,x.ajuste,x.motivo,x.justificacion';
  const [lineas]=await c.execute(`SELECT l.id,l.cliente_id,l.sku,l.version,l.conteo_1,l.conteo_2,l.conteo_final,l.observacion,l.nueva_posicion,
   d.posicion,d.descripcion,d.serie,d.lote,d.unidad,x.numero,x.categoria,cli.nombre AS cliente,p.rol ${select} ${base} AND l.id>? ORDER BY l.id LIMIT 51`,[...parametros,cursor]);
  const siguiente=lineas.length===51?lineas[49].id:null;
  return {inventario:{id,estado:n.estado,sede:n.sede,codigo:n.codigo_operativo,version:n.version,borrador:!!n.borrador,
   fechaInicio:n.fecha_inicio,fechaEntrega:n.fecha_entrega,fechaProgramada:n.fecha_programada,responsable:n.responsable,
   mostrarDepot:!!n.mostrar_depot,perfiles:n.perfiles},
   lineas:lineas.slice(0,50).map(r=>({...r,version:String(r.version),...(!ciego?resultadoWms(r):{})})),siguiente};
 });
}

export async function previsualizarSerie(pool,p,id,solicitud){
 campos(solicitud,['clienteId','serie']);
 return transaccion(pool,p,async c=>{const n=await acceso(c,p,id);exigirClienteCaptura(n,solicitud);return consultarSerieInterna(c,n,solicitud);});
}
export async function historialCapturas(pool,p,id,{clienteId,cursor='',tipo='series'}={}){
 uuid(clienteId);if(cursor)uuid(cursor);exigir(['series','hallazgos'].includes(tipo));
 return transaccion(pool,p,async c=>{
  const n=await acceso(c,p,id);exigir(n.perfiles.some(r=>r.cliente_id===clienteId),'SIN_PERMISO','Cliente no autorizado.');
  const tabla=tipo==='series'?'ims_nat_serie':'ims_nat_hallazgo';
  let filtro='',params=[id,clienteId];
  if(cursor){
   const [[anchor]]=await c.execute(`SELECT creado_en FROM ${tabla} WHERE id=? AND inventario_id=? AND cliente_id=?`,[cursor,id,clienteId]);
   exigir(anchor,'SOLICITUD_INVALIDA','Cursor inválido.');
   filtro=' AND (s.creado_en<? OR (s.creado_en=? AND s.id<?))';params.push(anchor.creado_en,anchor.creado_en,cursor);
  }
  const extra=tipo==='series'?',COALESCE(l.sku,h.sku) AS sku,COALESCE(d.descripcion,h.descripcion) AS descripcion':'';
  const joins=tipo==='series'?'LEFT JOIN ims_op_linea l ON l.id=s.linea_id LEFT JOIN ims_op_detalle_linea d ON d.linea_id=l.id LEFT JOIN ims_nat_hallazgo h ON h.id=s.hallazgo_id':'';
  const [rows]=await c.execute(`SELECT s.*,u.nombre AS usuario ${extra} FROM ${tabla} s ${joins} LEFT JOIN ims_auth_usuario u ON u.actor_id=s.actor_id WHERE s.inventario_id=? AND s.cliente_id=? ${filtro} ORDER BY s.creado_en DESC,s.id DESC LIMIT 51`,params);
  return {datos:rows.slice(0,50),siguiente:rows.length===51?rows[49].id:null};
 });
}
