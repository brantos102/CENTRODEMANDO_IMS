import {archivoLegado} from './legado.mjs';
import {randomUUID} from 'node:crypto';
import {transaccionOperativa} from '../mysql/operacion-nativa.mjs';
import {correoCanonico,crearHashPassword,verificarPassword} from '../auth/credenciales.mjs';
import {exigir,hash,texto,uuid,fecha,evento,transicion,permisos,puedeCrearRol,codigosDesdeFilas,calendario,indicadores,diaEcuador} from './dominio.mjs';
const parse=x=>typeof x==='string'?JSON.parse(x):x;
const date=x=>x instanceof Date?x.toISOString().slice(0,10):x;
export async function perfilCentro(c,p,bloquear=false){
 const [[r]]=await c.execute(`SELECT p.rol,p.rol_wms,p.telefono,p.cambiar_clave,p.version FROM ims_cm_perfil p WHERE p.actor_id=? ${bloquear?'FOR UPDATE':'FOR SHARE'}`,[p.actorId]);
 exigir(r,'SIN_PERMISO','Tu cuenta aún no tiene un perfil del Centro de Mando.');
 const [as]=await c.execute('SELECT sede FROM ims_cm_acceso WHERE actor_id=?',[p.actorId]);
 return {...r,sedes:as.map(x=>x.sede),permisos:permisos(r.rol)};
}
const marcador=a=>a.map(()=>'?').join(',');
async function cargarEventos(c,pf){
 if(!pf.sedes.length)return [];
 const [es]=await c.execute(`SELECT * FROM ims_cm_evento WHERE sede IN (${marcador(pf.sedes)}) AND eliminado=0 ORDER BY fecha_inicio,id LIMIT 20000`,pf.sedes);
 for(const e of es){e.fecha_inicio=date(e.fecha_inicio);e.fecha_fin=date(e.fecha_fin);e.version=String(e.version);e.eliminado=!!e.eliminado;}
 return es;
}
async function personas(c,pf){
 if(!pf.sedes.length)return [];
 const [ps]=await c.execute(`SELECT DISTINCT u.actor_id,u.correo,u.nombre,p.rol,p.rol_wms,a.activo,p.telefono FROM ims_auth_usuario u JOIN ims_op_actor a ON a.id=u.actor_id JOIN ims_cm_perfil p ON p.actor_id=u.actor_id JOIN ims_cm_acceso ac ON ac.actor_id=u.actor_id WHERE ac.sede IN (${marcador(pf.sedes)}) ORDER BY u.nombre,u.actor_id LIMIT 1000`,pf.sedes);
 const [as]=await c.execute('SELECT actor_id,sede FROM ims_cm_acceso');return ps.map(x=>({...x,activo:!!x.activo,sedes:as.filter(a=>a.actor_id===x.actor_id).map(a=>a.sede)}));
}
export async function consultarCentro(pool,p,recurso,query={}){
 return transaccionOperativa(pool,p,async c=>{
 const pf=await perfilCentro(c,p);
 if(recurso==='contexto'){
  const [clientes]=await c.execute('SELECT id,nombre FROM ims_op_cliente ORDER BY nombre');
  const [carpetas]=pf.sedes.length?await c.execute(`SELECT * FROM ims_cm_carpeta WHERE sede IN (${marcador(pf.sedes)}) ORDER BY nombre`,pf.sedes):[[]];
  const [fuentes]=await c.execute('SELECT clave,filas,metadatos,importado_en FROM ims_cm_fuente ORDER BY importado_en,clave');
  return {perfil:pf,clientes,carpetas,personas:await personas(c,pf),fuentes:fuentes.map(x=>({...x,metadatos:parse(x.metadatos)})),hoy:diaEcuador()};
 }
 if(recurso==='inventario'){
  const id=uuid(query.inventario),[[i]]=await c.execute('SELECT DISTINCT i.id,i.sede,i.codigo_operativo,i.estado FROM ims_op_inventario i JOIN ims_op_permiso a ON a.inventario_id=i.id AND a.actor_id=? WHERE i.id=?',[p.actorId,id]);exigir(i&&pf.sedes.includes(i.sede),'SIN_PERMISO','Inventario no autorizado.');return {inventario:i};
 }
 if(recurso==='perfil')return {usuario:p.usuario,perfil:pf};
 if(recurso==='usuarios'){exigir(pf.permisos.usuarios,'SIN_PERMISO','Tu rol no administra usuarios.');const ps=await personas(c,pf);return {usuarios:ps,roles:['ADMIN','COORDINADOR','LIDER','OPERARIO','AUDITOR'].filter(x=>puedeCrearRol(pf.rol,x))};}
 if(['dashboard','eventos','analitica'].includes(recurso)){
  const es=await cargarEventos(c,pf);
  const [eq]=pf.sedes.length?await c.execute(`SELECT q.*,u.nombre FROM ims_cm_equipo q JOIN ims_cm_evento e ON e.id=q.evento_id JOIN ims_auth_usuario u ON u.actor_id=q.actor_id WHERE e.eliminado=0 AND e.sede IN (${marcador(pf.sedes)})`,pf.sedes):[[]];
  const [vs]=pf.sedes.length?await c.execute(`SELECT v.*,i.codigo_operativo,i.estado,n.borrador,n.version FROM ims_cm_vinculo v JOIN ims_cm_evento e ON e.id=v.evento_id JOIN ims_op_inventario i ON i.id=v.inventario_id LEFT JOIN ims_nat_inventario n ON n.inventario_id=i.id WHERE e.sede IN (${marcador(pf.sedes)})`,pf.sedes):[[]];
  for(const e of es){e.equipo=eq.filter(x=>x.evento_id===e.id);e.inventarios=vs.filter(x=>x.evento_id===e.id).map(x=>({...x,version:String(x.version??'0')}));}
  if(recurso==='eventos')return {eventos:query.desde?calendario(es,query.desde,query.hasta):es};
  if(recurso==='analitica'){
   exigir(pf.permisos.analitica,'SIN_PERMISO','Tu rol no consulta la analítica del equipo.');
   const ps=await personas(c,pf),cargas=ps.map(u=>{const propios=es.filter(e=>e.responsable_id===u.actor_id||e.equipo.some(q=>q.actor_id===u.actor_id&&['ACTIVO','FINALIZADO'].includes(q.estado)));return {actorId:u.actor_id,nombre:u.nombre,responsabilidades:propios.filter(e=>e.responsable_id===u.actor_id).length,apoyos:propios.filter(e=>e.equipo.some(q=>q.actor_id===u.actor_id&&q.papel==='APOYO'&&['ACTIVO','FINALIZADO'].includes(q.estado))).length,exclusiones:es.filter(e=>e.equipo.some(q=>q.actor_id===u.actor_id&&q.estado==='EXCLUIDO')).length,asignados:propios.length,entregados:propios.filter(e=>e.estado==='Entregado').length,enCurso:propios.filter(e=>e.estado==='En curso').length,pendientes:propios.filter(e=>['Pendiente','Pausado'].includes(e.estado)).length};});
   return {usuarios:cargas};
  }
  const [panel]=pf.sedes.length?await c.execute(`SELECT * FROM ims_cm_panel WHERE sede IN (${marcador(pf.sedes)}) ORDER BY origen_fila`,pf.sedes):[[]];for(const r of panel){r.fecha_inicio=date(r.fecha_inicio);r.fecha_fin=date(r.fecha_fin);}
  const [hist]=pf.sedes.length?await c.execute(`SELECT DISTINCT i.id,i.codigo_operativo,l.origen_drive FROM ims_op_inventario i JOIN ims_op_linea l ON l.inventario_id=i.id LEFT JOIN ims_nat_inventario n ON n.inventario_id=i.id WHERE n.inventario_id IS NULL AND i.sede IN (${marcador(pf.sedes)})`,pf.sedes):[[]];
  for(const row of panel)row.inventarios=hist.filter(h=>h.origen_drive===row.archivo_drive).map(h=>({id:h.id,codigo:h.codigo_operativo,nativo:false}));
  // El panel capturado se conserva. Para archivos operativos, la vista usa el estado actual de MySQL.
  const [nativos]=pf.sedes.length?await c.execute(`SELECT i.id,i.sede,i.codigo_operativo,i.estado,n.fecha_inicio,n.fecha_entrega,n.responsable,MIN(l.origen_drive) archivo_drive,SUM(x.depot) unidades,COUNT(DISTINCT l.sku) referencias,COUNT(DISTINCT d.posicion) posiciones FROM ims_op_inventario i JOIN ims_nat_inventario n ON n.inventario_id=i.id AND n.borrador=0 LEFT JOIN ims_op_linea l ON l.inventario_id=i.id LEFT JOIN ims_nat_linea x ON x.linea_id=l.id LEFT JOIN ims_op_detalle_linea d ON d.linea_id=l.id WHERE i.sede IN (${marcador(pf.sedes)}) GROUP BY i.id`,pf.sedes):[[]];
  const [unicos]=pf.sedes.length?await c.execute(`SELECT COALESCE(NULLIF(l.origen_drive,''),i.id) grupo,COUNT(DISTINCT l.sku) referencias,COUNT(DISTINCT d.posicion) posiciones FROM ims_op_inventario i JOIN ims_nat_inventario n ON n.inventario_id=i.id AND n.borrador=0 LEFT JOIN ims_op_linea l ON l.inventario_id=i.id LEFT JOIN ims_op_detalle_linea d ON d.linea_id=l.id WHERE i.sede IN (${marcador(pf.sedes)}) GROUP BY grupo`,pf.sedes):[[]];
  const grupos=new Map();for(const n of nativos){const key=n.archivo_drive||n.id;if(!grupos.has(key))grupos.set(key,[]);grupos.get(key).push(n);}
  for(const [key,ns] of grupos){const row=panel.find(r=>r.archivo_drive===key),m=ns[0];const total=ns.reduce((a,n)=>{const [v,f='']=String(n.unidades||'0').split('.');return a+BigInt(v+f.padEnd(9,'0'));},0n),unidades=String(total/1000000000n)+'.'+String(total%1000000000n).padStart(9,'0');
   const vista={...(row||{id:m.id,archivo_drive:'',cliente:m.codigo_operativo,sede:m.sede}),inventarios:ns.map(n=>({id:n.id,codigo:n.codigo_operativo,nativo:true})),fecha_inicio:row?.fecha_inicio||ns.map(n=>date(n.fecha_inicio)).sort()[0],fecha_fin:ns.every(n=>n.estado==='ENTREGADO')?ns.map(n=>date(n.fecha_entrega)).sort().at(-1):null,estado:ns.every(n=>n.estado==='ENTREGADO')?'Entregado':ns.every(n=>n.estado==='CANCELADO')?'Cancelado':'En proceso',responsable:m.responsable,unidades,referencias:Number(unicos.find(u=>u.grupo===key)?.referencias??0),posiciones:Number(unicos.find(u=>u.grupo===key)?.posiciones??0)};
   if(row)Object.assign(row,vista);else panel.push(vista);
  }
  const [trabajos]=await c.execute('SELECT id,tipo,estado,progreso,resultado,actualizado_en FROM ims_cm_trabajo WHERE actor_id=? ORDER BY creado_en DESC LIMIT 10',[p.actorId]);
  const [[pub]]=await c.execute('SELECT COUNT(*) AS n FROM ims_cm_publicacion');
  return {indicadores:indicadores(es,panel),eventos:es,actualizadoEn:new Date().toISOString(),publicados:Number(pub.n),trabajos:trabajos.map(x=>({...x,resultado:parse(x.resultado)})),panel:panel.map(({datos,...r})=>r),kpiOrigen:'PANEL_DEL_CORTE_ELEGIDO'};
 }
 if(recurso==='codigos'){
  exigir(pf.sedes.includes(query.sede),'SIN_PERMISO','Sede no autorizada.');
  const q=texto(query.buscar??'',255),cli=texto(query.cliente??'',255),mes=query.mes?Number(query.mes):0;exigir(Number.isInteger(mes)&&mes>=0&&mes<=12);
  const [cs]=await c.execute('SELECT id,cliente,sku,abc,meses FROM ims_cm_codigo WHERE sede=? AND (?=\'\' OR cliente=?) AND (?=\'\' OR LOCATE(?,sku)>0) ORDER BY cliente,sku LIMIT 5000',[query.sede,cli,cli,q,q]);
  const datos=cs.map(x=>({...x,meses:parse(x.meses)}));return {datos:datos.filter(x=>!mes||x.meses.includes(mes)).slice(0,300),totalesPorMes:Array.from({length:12},(_,i)=>datos.filter(x=>x.meses.includes(i+1)).length),limite:300};
 }
 if(recurso==='archivo-legado'){const [[i]]=await c.execute('SELECT sede FROM ims_op_inventario WHERE id=?',[uuid(query.inventario)]);exigir(i&&pf.sedes.includes(i.sede),'SIN_PERMISO','Sede no autorizada.');return archivoLegado(c,p,query.inventario,query.hoja,Number(query.desde||0));}
 if(recurso==='legado'){
  exigir(pf.permisos.administrar,'SIN_PERMISO','La revisión del respaldo corresponde al administrador.');
  const fuente=texto(query.fuente??'',255,true),desde=Number(query.desde||0);exigir(Number.isInteger(desde)&&desde>=0&&desde<=1000000);
  const [[f]]=await c.execute('SELECT metadatos FROM ims_cm_fuente WHERE clave=?',[fuente]);exigir(f,'SOLICITUD_INVALIDA','Fuente no reconocida.');
  const [rows]=await c.execute('SELECT fila,contenido FROM ims_cm_legado WHERE fuente=? AND fila>? ORDER BY fila LIMIT 51',[fuente,desde]);
  return {nombre:parse(f.metadatos).nombre,filas:rows.slice(0,50).map(x=>({fila:x.fila,celdas:parse(x.contenido).celdas.map(c=>({columna:c.columna,valor:c.valor}))})),siguiente:rows.length>50?rows[49].fila:null};
 }
 if(recurso==='auditoria'){
  exigir(pf.permisos.administrar,'SIN_PERMISO','Auditoría administrativa reservada.');
  const [a]=await c.execute('SELECT actor_id,operacion_id,tipo,resultado,creado_en FROM ims_cm_auditoria ORDER BY creado_en DESC LIMIT 100');return {datos:a.map(x=>({...x,resultado:parse(x.resultado)}))};
 }
 exigir(false);
 });
}
async function asignarEquipo(c,id,actor,papel){
 const [[u]]=await c.execute('SELECT a.activo FROM ims_op_actor a JOIN ims_cm_acceso ac ON ac.actor_id=a.id JOIN ims_cm_evento e ON e.sede=ac.sede WHERE a.id=? AND e.id=? FOR SHARE',[uuid(actor),id]);exigir(u?.activo,'SOLICITUD_INVALIDA','El integrante debe tener una cuenta activa.');
 await c.execute(`INSERT INTO ims_cm_equipo(evento_id,actor_id,papel,estado) VALUES (?,?,?,'ACTIVO') ON DUPLICATE KEY UPDATE papel=VALUES(papel),estado='ACTIVO'`,[id,actor,papel]);
}
export async function permisosEquipo(c,id){
 const [es]=await c.execute(`SELECT q.actor_id,q.papel,v.inventario_id,ic.cliente_id FROM ims_cm_equipo q JOIN ims_cm_vinculo v ON v.evento_id=q.evento_id JOIN ims_nat_inventario n ON n.inventario_id=v.inventario_id JOIN ims_op_inventario_cliente ic ON ic.inventario_id=v.inventario_id WHERE q.evento_id=? AND q.estado='ACTIVO'`,[id]);
 for(const q of es){
  const [[pf]]=await c.execute('SELECT rol,rol_wms FROM ims_cm_perfil WHERE actor_id=?',[q.actor_id]);const rol=pf?.rol_wms==='AUDITOR'?'AUDITOR':q.papel==='RESPONSABLE'?'SUPERVISOR':'OPERADOR';
  // Nunca revoca ni reduce una autorización existente al vincular un evento.
  await c.execute('INSERT INTO ims_op_permiso(actor_id,inventario_id,cliente_id,puede_contar) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE puede_contar=GREATEST(puede_contar,VALUES(puede_contar))',[q.actor_id,q.inventario_id,q.cliente_id,rol==='AUDITOR'?0:1]);
  await c.execute("INSERT INTO ims_nat_perfil(actor_id,inventario_id,cliente_id,rol) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE rol=CASE WHEN rol='SUPERVISOR' OR VALUES(rol)='SUPERVISOR' THEN 'SUPERVISOR' WHEN rol='OPERADOR' OR VALUES(rol)='OPERADOR' THEN 'OPERADOR' ELSE VALUES(rol) END",[q.actor_id,q.inventario_id,q.cliente_id,rol]);
 }
}
export async function mutarCentro({pool,principal:p,tipo,solicitud:s,conexion}){
 exigir(s&&typeof s==='object'&&!Array.isArray(s));uuid(s.operacionId);
 // No se guarda contraseña ni su resumen criptográfico en la bitácora.
 const digest=hash({tipo,...s,contrasena:undefined,actual:undefined});
 const ejecutar=conexion?(_pool,_p,fn)=>fn(conexion):transaccionOperativa;
 return ejecutar(pool,p,async c=>{
  const pf=await perfilCentro(c,p,true);
  const [[prev]]=await c.execute('SELECT hash,resultado FROM ims_cm_auditoria WHERE actor_id=? AND operacion_id=?',[p.actorId,s.operacionId]);
  if(prev){exigir(prev.hash===digest,'OPERACION_REUTILIZADA','Esta operación ya se usó para otros datos.');const r=parse(prev.resultado);
   if(['usuario','clave','usuario-clave'].includes(tipo)&&s.contrasena){const [[u]]=await c.execute('SELECT password_hash FROM ims_auth_usuario WHERE actor_id=?',[tipo==='clave'?p.actorId:r.actorId]);exigir(u&&await verificarPassword(s.contrasena,u.password_hash),'OPERACION_REUTILIZADA','La operación fue confirmada con otra contraseña.');}
   return {...r,repetida:true};
  }
  let resultado={},antes=null,despues=null;
  if(tipo==='evento'){
   exigir(pf.permisos.crear,'SIN_PERMISO','Tu rol no crea eventos.');const e=evento(s);exigir(pf.sedes.includes(e.sede),'SIN_PERMISO','Sede no autorizada.');
   if(s.eventoId){uuid(s.eventoId);const [[old]]=await c.execute('SELECT * FROM ims_cm_evento WHERE id=? AND eliminado=0 FOR UPDATE',[s.eventoId]);exigir(old&&pf.sedes.includes(old.sede),'SIN_PERMISO','Evento no autorizado.');exigir(String(old.version)===String(s.version),'VERSION_DESACTUALIZADA','El evento cambió. Actualiza antes de guardar.');exigir(old.estado!=='Entregado','INVENTARIO_NO_EDITABLE','La entrega ya está registrada.');
    if(old.sede!==e.sede||old.cliente!==e.cliente){const [[v]]=await c.execute('SELECT COUNT(*) n FROM ims_cm_vinculo WHERE evento_id=?',[s.eventoId]);exigir(Number(v.n)===0,'INVENTARIO_NO_EDITABLE','El evento vinculado conserva su sede y cliente. Crea otro evento para una operación distinta.');}
    if(!Object.hasOwn(s,'fechaFin'))e.fecha_fin=date(old.fecha_fin);
    antes=old;await c.execute(`UPDATE ims_cm_evento SET ${Object.keys(e).map(k=>'`'+k+'`=?').join(',')},version=version+1 WHERE id=?`,[...Object.values(e),s.eventoId]);resultado={eventoId:s.eventoId,version:String(BigInt(old.version)+1n)};
   }else{const id=randomUUID();await c.execute(`INSERT INTO ims_cm_evento(id,${Object.keys(e).join(',')},origen,creado_por) VALUES (${Array(Object.keys(e).length+3).fill('?').join(',')})`,[id,...Object.values(e),'NATIVO',p.actorId]);resultado={eventoId:id,version:'0'};}
   await c.execute("UPDATE ims_cm_equipo SET estado='EXCLUIDO' WHERE evento_id=? AND papel='RESPONSABLE' AND (? IS NULL OR actor_id<>?)",[resultado.eventoId,e.responsable_id,e.responsable_id]);
   if(e.responsable_id)await asignarEquipo(c,resultado.eventoId,e.responsable_id,'RESPONSABLE');
   if(s.apoyos!==undefined){exigir(Array.isArray(s.apoyos)&&s.apoyos.length<=30);await c.execute("UPDATE ims_cm_equipo SET estado='EXCLUIDO' WHERE evento_id=? AND papel='APOYO' AND estado='ACTIVO'",[resultado.eventoId]);for(const actor of new Set(s.apoyos))if(actor!==e.responsable_id)await asignarEquipo(c,resultado.eventoId,actor,'APOYO');}
   await permisosEquipo(c,resultado.eventoId);despues=e;
  }else if(tipo==='accion'){
   const [[e]]=await c.execute('SELECT * FROM ims_cm_evento WHERE id=? AND eliminado=0 FOR UPDATE',[uuid(s.eventoId)]);exigir(e,'SIN_PERMISO','Evento no disponible.');exigir(String(e.version)===String(s.version),'VERSION_DESACTUALIZADA','El evento cambió. Actualiza antes de continuar.');
   const cambios=transicion(e,s.accion,pf,p.actorId);antes=e;
   if(s.accion==='apoyar')await asignarEquipo(c,e.id,p.actorId,'APOYO');
   if(s.accion==='finalizar'){
    const fin=fecha(s.fechaFin);exigir(fin>=date(e.fecha_inicio),'SOLICITUD_INVALIDA','La entrega no puede ser anterior al inicio.');cambios.fecha_fin=fin;
    const [[n]]=await c.execute(`SELECT COUNT(*) n FROM ims_cm_vinculo v JOIN ims_nat_inventario n ON n.inventario_id=v.inventario_id JOIN ims_op_inventario i ON i.id=n.inventario_id WHERE v.evento_id=? AND i.estado<>'ENTREGADO'`,[e.id]);
    exigir(Number(n.n)===0,'INVENTARIO_NO_EDITABLE','Entrega primero los inventarios vinculados desde Operación, después de revisar el análisis y las líneas pendientes.');
    await c.execute("UPDATE ims_cm_equipo SET estado='FINALIZADO' WHERE evento_id=? AND estado='ACTIVO'",[e.id]);
   }
   if(s.accion==='eliminar')await c.execute("UPDATE ims_cm_equipo SET estado='EVENTO_ELIMINADO' WHERE evento_id=? AND estado='ACTIVO'",[e.id]);
   if(Object.keys(cambios).length)await c.execute(`UPDATE ims_cm_evento SET ${Object.keys(cambios).map(k=>'`'+k+'`=?').join(',')},version=version+1 WHERE id=?`,[...Object.values(cambios),e.id]);
   else await c.execute('UPDATE ims_cm_evento SET version=version+1 WHERE id=?',[e.id]);
   if(cambios.responsable_id)await asignarEquipo(c,e.id,cambios.responsable_id,'RESPONSABLE');await permisosEquipo(c,e.id);
   despues=cambios;resultado={eventoId:e.id,version:String(BigInt(e.version)+1n),accion:s.accion};
  }else if(tipo==='vincular'){
   exigir(pf.permisos.crear,'SIN_PERMISO','Tu rol no vincula inventarios.');
   const [[e]]=await c.execute('SELECT * FROM ims_cm_evento WHERE id=? AND eliminado=0 FOR UPDATE',[uuid(s.eventoId)]);
   const [[n]]=await c.execute(`SELECT i.id,i.sede FROM ims_op_inventario i JOIN ims_nat_inventario n ON n.inventario_id=i.id WHERE i.id=?`,[uuid(s.inventarioId)]);
   exigir(e&&e.estado!=='Entregado'&&n&&e.sede===n.sede&&pf.sedes.includes(n.sede),'SIN_PERMISO','El evento y el inventario deben pertenecer a una sede autorizada.');
   const [[cli]]=await c.execute('SELECT COUNT(*) n FROM ims_op_inventario_cliente ic JOIN ims_op_cliente c ON c.id=ic.cliente_id WHERE ic.inventario_id=? AND c.nombre=?',[n.id,e.cliente]);const [[erp]]=await c.execute("SELECT JSON_UNQUOTE(JSON_EXTRACT(seleccion,'$.modo')) modo FROM ims_erp_inventario WHERE inventario_id=?",[n.id]);exigir(Number(cli.n)>0||erp?.modo==='POSICIONES','SOLICITUD_INVALIDA','El cliente del evento debe pertenecer al inventario, salvo una extracción ERP por posiciones.');
   const [[falta]]=await c.execute('SELECT COUNT(*) n FROM ims_op_inventario_cliente ic WHERE ic.inventario_id=? AND NOT EXISTS(SELECT 1 FROM ims_nat_perfil p WHERE p.inventario_id=ic.inventario_id AND p.cliente_id=ic.cliente_id AND p.actor_id=? AND p.rol=\'SUPERVISOR\')',[n.id,p.actorId]);exigir(Number(falta.n)===0,'SIN_PERMISO','Se requiere supervisión de todos los clientes para vincular.');
   await c.execute('INSERT IGNORE INTO ims_cm_vinculo VALUES (?,?)',[e.id,n.id]);await permisosEquipo(c,e.id);resultado={eventoId:e.id,inventarioId:n.id};
  }else if(tipo==='carpeta'){
   exigir(pf.permisos.crear&&pf.sedes.includes(s.sede),'SIN_PERMISO','Sede no autorizada.');const nombre=texto(s.nombre,255,true);exigir(!/[\\/\u0000-\u001f]/.test(nombre)&&!['.','..'].includes(nombre));
   if(s.padreId){const [[r]]=await c.execute('SELECT sede FROM ims_cm_carpeta WHERE id=?',[uuid(s.padreId)]);exigir(r?.sede===s.sede,'SIN_PERMISO','Carpeta no autorizada.');}
   const id=randomUUID();await c.execute('INSERT INTO ims_cm_carpeta VALUES (?,?,?,?)',[id,s.padreId||null,s.sede,nombre]);resultado={carpetaId:id};
  }else if(tipo==='archivar'){
   exigir(pf.permisos.crear,'SIN_PERMISO','Tu rol no organiza inventarios.');
   const [[n]]=await c.execute(`SELECT i.sede FROM ims_op_inventario i JOIN ims_nat_inventario n ON n.inventario_id=i.id JOIN ims_nat_perfil p ON p.inventario_id=i.id AND p.actor_id=? AND p.rol='SUPERVISOR' WHERE i.id=?`,[p.actorId,uuid(s.inventarioId)]);
   const [[f]]=await c.execute('SELECT sede FROM ims_cm_carpeta WHERE id=?',[uuid(s.carpetaId)]);exigir(n&&f&&n.sede===f.sede&&pf.sedes.includes(n.sede),'SIN_PERMISO','Carpeta no autorizada.');await c.execute('INSERT INTO ims_cm_documento VALUES (?,?) ON DUPLICATE KEY UPDATE carpeta_id=VALUES(carpeta_id)',[s.inventarioId,s.carpetaId]);resultado={inventarioId:s.inventarioId,carpetaId:s.carpetaId};
  }else if(tipo==='perfil'){
   const nombre=texto(s.nombre,255,true),telefono=texto(s.telefono??'',80);await c.execute('UPDATE ims_auth_usuario SET nombre=? WHERE actor_id=?',[nombre,p.actorId]);await c.execute('UPDATE ims_cm_perfil SET telefono=?,version=version+1 WHERE actor_id=?',[telefono,p.actorId]);resultado={guardado:true};
  }else if(tipo==='clave'){
   const [[u]]=await c.execute('SELECT password_hash FROM ims_auth_usuario WHERE actor_id=? FOR UPDATE',[p.actorId]);exigir(await verificarPassword(s.actual,u.password_hash),'SIN_PERMISO','La contraseña actual no coincide.');
   const h=await crearHashPassword(s.contrasena);await c.execute('UPDATE ims_auth_usuario SET password_hash=? WHERE actor_id=?',[h,p.actorId]);await c.execute('UPDATE ims_cm_perfil SET cambiar_clave=0 WHERE actor_id=?',[p.actorId]);
   // La sesión actual continúa; todas las otras se revocan en la misma transacción.
   await c.execute('UPDATE ims_auth_sesion SET revocada=1 WHERE actor_id=? AND sesion_hash<>?',[p.actorId,p.sesionHash??'']);resultado={guardado:true};
  }else if(tipo==='usuario'){
   exigir(pf.permisos.usuarios&&puedeCrearRol(pf.rol,s.rol),'SIN_PERMISO','Solo puedes crear perfiles de menor nivel que el tuyo.');
   const correo=correoCanonico(s.correo),nombre=texto(s.nombre,255,true);exigir(Array.isArray(s.sedes)&&s.sedes.length&&s.sedes.length<=2&&new Set(s.sedes).size===s.sedes.length&&s.sedes.every(x=>pf.sedes.includes(x)),'SIN_PERMISO','Sedes no autorizadas.');
   const [[old]]=await c.execute('SELECT actor_id FROM ims_auth_usuario WHERE correo=? FOR SHARE',[correo]);exigir(!old,'SOLICITUD_INVALIDA','El correo ya existe. No se reemplazan cuentas ni claves.');const clave=await crearHashPassword(s.contrasena),id=randomUUID();
   await c.execute('INSERT INTO ims_op_actor(id,activo) VALUES (?,1)',[id]);await c.execute('INSERT INTO ims_auth_usuario(actor_id,correo,nombre,password_hash) VALUES (?,?,?,?)',[id,correo,nombre,clave]);await c.execute('INSERT INTO ims_cm_perfil(actor_id,rol,rol_wms,telefono) VALUES (?,?,?,?)',[id,s.rol,['ADMIN','COORDINADOR','LIDER'].includes(s.rol)?'ADMIN':s.rol==='AUDITOR'?'AUDITOR':'OPERADOR',texto(s.telefono??'',80)]);
   for(const sede of s.sedes){await c.execute('INSERT INTO ims_cm_acceso VALUES (?,?)',[id,sede]);if(['ADMIN','COORDINADOR','LIDER'].includes(s.rol))await c.execute('INSERT INTO ims_nat_ambito VALUES (?,?,?)',[id,sede,s.rol==='ADMIN'?'ADMIN':'SUPERVISOR']);}
   resultado={actorId:id,correo};
  }else if(tipo==='usuario-clave'){
   exigir(pf.rol==='ADMIN'&&s.actorId!==p.actorId,'SIN_PERMISO','Usa Mi perfil para cambiar tu propia contraseña.');uuid(s.actorId);
   const h=await crearHashPassword(s.contrasena);const [[u]]=await c.execute('SELECT actor_id FROM ims_cm_perfil WHERE actor_id=? FOR UPDATE',[s.actorId]);exigir(u,'SOLICITUD_INVALIDA','Cuenta no reconocida.');
   await c.execute('UPDATE ims_auth_usuario SET password_hash=? WHERE actor_id=?',[h,s.actorId]);await c.execute('UPDATE ims_cm_perfil SET cambiar_clave=1 WHERE actor_id=?',[s.actorId]);await c.execute('UPDATE ims_auth_sesion SET revocada=1 WHERE actor_id=?',[s.actorId]);resultado={actorId:s.actorId,guardado:true};
  }else if(tipo==='usuario-rol'){
   exigir(pf.rol==='ADMIN'&&s.actorId!==p.actorId&&['ADMIN','COORDINADOR','LIDER','OPERARIO','AUDITOR'].includes(s.rol),'SIN_PERMISO','Solo el administrador modifica otros perfiles.');uuid(s.actorId);
   exigir(Array.isArray(s.sedes)&&s.sedes.length>0&&s.sedes.length<=2&&new Set(s.sedes).size===s.sedes.length&&s.sedes.every(x=>pf.sedes.includes(x)),'SIN_PERMISO','Sedes no autorizadas.');
   const [[u]]=await c.execute('SELECT actor_id FROM ims_cm_perfil WHERE actor_id=? FOR UPDATE',[s.actorId]);exigir(u,'SOLICITUD_INVALIDA','Cuenta no reconocida.');
   exigir(['ADMIN','OPERADOR','AUDITOR'].includes(s.rolWms),'SOLICITUD_INVALIDA','Selecciona un rol WMS válido.');await c.execute('UPDATE ims_cm_perfil SET rol=?,rol_wms=?,version=version+1 WHERE actor_id=?',[s.rol,s.rolWms,s.actorId]);await c.execute('DELETE FROM ims_cm_acceso WHERE actor_id=?',[s.actorId]);await c.execute('DELETE FROM ims_nat_ambito WHERE actor_id=?',[s.actorId]);
   for(const sede of s.sedes){await c.execute('INSERT INTO ims_cm_acceso VALUES (?,?)',[s.actorId,sede]);if(['ADMIN','COORDINADOR','LIDER'].includes(s.rol))await c.execute('INSERT INTO ims_nat_ambito VALUES (?,?,?)',[s.actorId,sede,s.rol==='ADMIN'?'ADMIN':'SUPERVISOR']);}
   await c.execute('DELETE p FROM ims_nat_perfil p JOIN ims_op_inventario i ON i.id=p.inventario_id WHERE p.actor_id=? AND i.sede NOT IN ('+s.sedes.map(()=>'?').join(',')+')',[s.actorId,...s.sedes]);
   await c.execute('DELETE p FROM ims_op_permiso p JOIN ims_op_inventario i ON i.id=p.inventario_id JOIN ims_nat_inventario n ON n.inventario_id=i.id WHERE p.actor_id=? AND i.sede NOT IN ('+s.sedes.map(()=>'?').join(',')+')',[s.actorId,...s.sedes]);
   const rol=s.rolWms==='ADMIN'?'SUPERVISOR':s.rolWms==='OPERADOR'?'OPERADOR':'AUDITOR';await c.execute('UPDATE ims_nat_perfil SET rol=? WHERE actor_id=?',[rol,s.actorId]);await c.execute('UPDATE ims_op_permiso p JOIN ims_nat_inventario n ON n.inventario_id=p.inventario_id SET p.puede_contar=? WHERE p.actor_id=?',[rol==='AUDITOR'?0:1,s.actorId]);
   await c.execute('UPDATE ims_auth_sesion SET revocada=1 WHERE actor_id=?',[s.actorId]);resultado={actorId:s.actorId,rol:s.rol,rolWms:s.rolWms,sedes:s.sedes};
  }else if(tipo==='usuario-estado'){
   exigir(pf.rol==='ADMIN'&&s.actorId!==p.actorId&&typeof s.activo==='boolean','SIN_PERMISO','Solo el administrador modifica otras cuentas.');uuid(s.actorId);
   const [[u]]=await c.execute('SELECT actor_id FROM ims_cm_perfil WHERE actor_id=?',[s.actorId]);exigir(u,'SOLICITUD_INVALIDA','Cuenta no reconocida.');await c.execute('UPDATE ims_op_actor SET activo=? WHERE id=?',[s.activo?1:0,s.actorId]);await c.execute('UPDATE ims_auth_sesion SET revocada=1 WHERE actor_id=?',[s.actorId]);resultado={actorId:s.actorId,activo:s.activo};
  }else if(tipo==='codigos'){
   exigir(pf.rol==='ADMIN'&&pf.sedes.includes(s.sede),'SIN_PERMISO','Carga de códigos reservada al administrador.');const cliente=texto(s.cliente,255,true),filas=codigosDesdeFilas(s.filas,s.mes);
   for(const f of filas){const [[old]]=await c.execute('SELECT meses FROM ims_cm_codigo WHERE sede=? AND cliente=? AND sku=? FOR UPDATE',[s.sede,cliente,f.sku]);const meses=[...new Set([...(old?parse(old.meses):[]).filter(x=>!filas.mesesAfectados.includes(x)),...f.meses])].sort((a,b)=>a-b);await c.execute(`INSERT INTO ims_cm_codigo(id,sede,cliente,sku,abc,meses,origen) VALUES (?,?,?,?,?,?,'NATIVO') ON DUPLICATE KEY UPDATE abc=VALUES(abc),meses=VALUES(meses),origen='NATIVO'`,[randomUUID(),s.sede,cliente,f.sku,f.abc,JSON.stringify(meses)]);}resultado={cargados:filas.length};
  }else exigir(false);
  await c.execute('INSERT INTO ims_cm_auditoria(actor_id,operacion_id,tipo,hash,resultado,antes,despues) VALUES (?,?,?,?,?,?,?)',[p.actorId,s.operacionId,tipo,digest,JSON.stringify(resultado),JSON.stringify(antes),JSON.stringify(despues)]);
  return {...resultado,repetida:false};
 });
}

export async function accesoWmsNuevo(c,id){
 const [us]=await c.execute('SELECT p.actor_id,p.rol_wms,ic.cliente_id FROM ims_cm_perfil p JOIN ims_cm_acceso a ON a.actor_id=p.actor_id JOIN ims_op_inventario i ON i.sede=a.sede JOIN ims_op_inventario_cliente ic ON ic.inventario_id=i.id WHERE i.id=?',[id]);
 for(const u of us){const rol=u.rol_wms==='ADMIN'?'SUPERVISOR':u.rol_wms==='OPERADOR'?'OPERADOR':'AUDITOR';await c.execute('INSERT IGNORE INTO ims_op_permiso VALUES (?,?,?,?)',[u.actor_id,id,u.cliente_id,rol==='AUDITOR'?0:1]);await c.execute('INSERT IGNORE INTO ims_nat_perfil VALUES (?,?,?,?)',[u.actor_id,id,u.cliente_id,rol]);}
}
