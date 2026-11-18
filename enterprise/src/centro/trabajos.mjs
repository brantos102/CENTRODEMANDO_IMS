import {prepararDeltaGoogle,aplicarDeltaGoogle} from './google-delta.mjs';
import {cuentaCorreo,enviarCorreoConfigurado} from './google-oauth.mjs';
import {randomUUID} from 'node:crypto';
import {transaccionOperativa} from '../mysql/operacion-nativa.mjs';
import {perfilCentro} from './servicio.mjs';
import {exigir,hash,uuid,diaEcuador,sumarDias} from './dominio.mjs';
import {uuidEstable} from '../migracion/modelo.mjs';
import {correoCanonico} from '../auth/credenciales.mjs';
import {consolidarCentro,reporteInventario} from './reportes.mjs';
import {zip} from './archivos.mjs';
import {obtenerConector,sincronizarEventoGoogle} from './conectores.mjs';
const parse=x=>typeof x==='string'?JSON.parse(x):x;
export async function solicitarTrabajo(pool,p,s){
 uuid(s.operacionId);exigir(['AUDITORIA','PUBLICACION','RECORDATORIO','CALENDARIO','CALENDARIO_LOTE','ZIP','REPORTE','GOOGLE_DELTA','GOOGLE_APLICAR'].includes(s.tipo));
 return transaccionOperativa(pool,p,async c=>{const pf=await perfilCentro(c,p,true),per=pf.permisos;exigir(['AUDITORIA','PUBLICACION','GOOGLE_DELTA','GOOGLE_APLICAR'].includes(s.tipo)?pf.rol==='ADMIN':['ZIP','REPORTE'].includes(s.tipo)?per.exportar:per.recordatorios,'SIN_PERMISO','Tu rol no tiene este permiso.');
 if(s.tipo==='GOOGLE_DELTA')exigir(pf.sedes.some(s=>['UIO','GYE'].includes(s)),'SIN_PERMISO','Se requiere una sede autorizada.');if(s.tipo==='GOOGLE_APLICAR'){uuid(s.planId);exigir(pf.sedes.some(s=>['UIO','GYE'].includes(s))&&Array.isArray(s.grupos)&&s.grupos.length>0&&s.grupos.length<=1000&&s.grupos.every(x=>/^[a-f0-9]{64}$/.test(x)));}
 const d=hash(s),[[prev]]=await c.execute('SELECT hash,resultado FROM ims_cm_auditoria WHERE actor_id=? AND operacion_id=?',[p.actorId,s.operacionId]);if(prev){exigir(prev.hash===d,'OPERACION_REUTILIZADA','La operación corresponde a otra solicitud.');return parse(prev.resultado);}
 if(['RECORDATORIO','CALENDARIO'].includes(s.tipo)){uuid(s.eventoId);const [[e]]=await c.execute('SELECT sede FROM ims_cm_evento WHERE id=?',[s.eventoId]);exigir(e&&pf.sedes.includes(e.sede),'SIN_PERMISO','Evento no autorizado.');}
 if(['RECORDATORIO','REPORTE'].includes(s.tipo))exigir(Array.isArray(s.destinatarios)&&s.destinatarios.length>0&&s.destinatarios.length<=30&&s.destinatarios.every(c=>correoCanonico(c)===c),'SOLICITUD_INVALIDA','Revisa los correos destinatarios.');
 if(s.tipo==='CALENDARIO_LOTE'){exigir((!s.sede||pf.sedes.includes(s.sede))&&/^\d{4}-\d{2}-\d{2}$/.test(s.desde||'')&&/^\d{4}-\d{2}-\d{2}$/.test(s.hasta||'')&&s.hasta>=s.desde,'SOLICITUD_INVALIDA','Revisa la sede y las fechas de la agenda.');}
 if(['ZIP','REPORTE'].includes(s.tipo)){exigir(Array.isArray(s.inventarios)&&s.inventarios.length>0&&s.inventarios.length<=50);s.inventarios.forEach(uuid);}
 const id=randomUUID(),resultado={trabajoId:id,estado:'PENDIENTE'};await c.execute('INSERT INTO ims_cm_trabajo(id,actor_id,tipo,parametros,resultado) VALUES (?,?,?,?,\'{}\')',[id,p.actorId,s.tipo,JSON.stringify(s)]);await c.execute('INSERT INTO ims_cm_auditoria(actor_id,operacion_id,tipo,hash,resultado,antes,despues) VALUES (?,?,?,?,?,\'null\',\'null\')',[p.actorId,s.operacionId,'trabajo:'+s.tipo,d,JSON.stringify(resultado)]);return resultado;
 });
}
export async function consultarTrabajo(pool,p,id){uuid(id);return transaccionOperativa(pool,p,async c=>{const [[r]]=await c.execute('SELECT id,tipo,estado,progreso,resultado FROM ims_cm_trabajo WHERE id=? AND actor_id=?',[id,p.actorId]);exigir(r,'SIN_PERMISO','Trabajo no autorizado.');if(['GOOGLE_DELTA','GOOGLE_APLICAR'].includes(r.tipo)){const pf=await perfilCentro(c,p);exigir(pf.rol==='ADMIN'&&pf.sedes.some(s=>['UIO','GYE'].includes(s)),'SIN_PERMISO','La revisión de Google requiere administración de la sede.');const d=parse(r.resultado),gs=r.tipo==='GOOGLE_DELTA'?d.grupos:d.gruposAplicados;exigir((gs||[]).every(g=>pf.sedes.includes(g.sede)),'SIN_PERMISO','Se revocó una sede del resultado.');}return {...r,resultado:parse(r.resultado)};});}
export async function descargarTrabajo(pool,p,id){uuid(id);return transaccionOperativa(pool,p,async c=>{
 const [[r]]=await c.execute('SELECT tipo,estado,parametros FROM ims_cm_trabajo WHERE id=? AND actor_id=?',[id,p.actorId]);exigir(r&&r.tipo==='ZIP'&&r.estado==='COMPLETO','SIN_PERMISO','El reporte no está disponible.');const pf=await perfilCentro(c,p);exigir(pf.permisos.exportar,'SIN_PERMISO','Tu rol no exporta.');
 // Un archivo ya generado tampoco concede acceso después de revocar permisos.
 for(const inventario of parse(r.parametros).inventarios){const [[i]]=await c.execute('SELECT i.sede FROM ims_op_inventario i WHERE i.id=? AND NOT EXISTS(SELECT 1 FROM ims_op_inventario_cliente ic WHERE ic.inventario_id=i.id AND NOT EXISTS(SELECT 1 FROM ims_op_permiso p WHERE p.inventario_id=ic.inventario_id AND p.cliente_id=ic.cliente_id AND p.actor_id=?))',[inventario,p.actorId]);exigir(i&&pf.sedes.includes(i.sede),'SIN_PERMISO','Se revocó el acceso al inventario del reporte.');}
 const [bs]=await c.execute('SELECT contenido FROM ims_cm_archivo WHERE trabajo_id=? ORDER BY parte',[id]);exigir(bs.length,'SOLICITUD_INVALIDA','El reporte ya expiró. Solicita una nueva descarga.');return Buffer.concat(bs.map(b=>b.contenido));
 });}
export function iniciarTrabajadorCentro({pool,clave,actorAutomatico,enviar,google=sincronizarEventoGoogle,clienteHojas,intervalo=3000}){
 const correo=async mensaje=>enviar?enviar(await obtenerConector(pool,'SMTP',clave),mensaje):enviarCorreoConfigurado(pool,clave,mensaje);
 let ocupado=false,cerrado=false,enCurso=Promise.resolve(),ultimoPlan='';
 const ejecutar=async()=>{if(ocupado||cerrado)return;ocupado=true;
 try{
  if(actorAutomatico){
   const hoy=diaEcuador(),hora=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Guayaquil',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()),minuto=hoy+' '+hora;
   if(minuto!==ultimoPlan){ultimoPlan=minuto;
    if(hora>='18:30')await solicitarTrabajo(pool,{actorId:actorAutomatico},{operacionId:uuidEstable('cm-diario',[hoy,'18:30']),tipo:'PUBLICACION'});
    if(hora>='08:00'&&hora<'17:30'){
     let smtp=null;try{smtp=(await cuentaCorreo(pool,clave)).config;}catch{}
     if(smtp?.automaticos){const [es]=await pool.execute("SELECT id FROM ims_cm_evento WHERE eliminado=0 AND estado<>'Entregado' AND fecha_inicio<=? AND fecha_inicio>=? ORDER BY fecha_inicio LIMIT 200",[sumarDias(hoy,3),sumarDias(hoy,-30)]);for(const e of es){const [us]=await pool.execute("SELECT DISTINCT u.correo FROM ims_cm_equipo q JOIN ims_auth_usuario u ON u.actor_id=q.actor_id JOIN ims_op_actor a ON a.id=u.actor_id WHERE q.evento_id=? AND q.estado='ACTIVO' AND a.activo=1",[e.id]);if(us.length)await solicitarTrabajo(pool,{actorId:actorAutomatico},{operacionId:uuidEstable('cm-recordatorio',[hoy,e.id]),tipo:'RECORDATORIO',eventoId:e.id,destinatarios:us.map(x=>x.correo).sort()});}}
    }
   }
  }
  await pool.execute("UPDATE ims_cm_trabajo SET estado='ERROR',resultado=?,actualizado_en=UTC_TIMESTAMP(6) WHERE estado='EJECUTANDO' AND actualizado_en<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 15 MINUTE)",[JSON.stringify({mensaje:'No se confirmó este trabajo. Revisa el resultado antes de repetir un envío.'})]);
  const [[job]]=await pool.execute("SELECT * FROM ims_cm_trabajo WHERE estado='PENDIENTE' ORDER BY creado_en,id LIMIT 1");if(!job)return;
  const [claim]=await pool.execute("UPDATE ims_cm_trabajo SET estado='EJECUTANDO',actualizado_en=UTC_TIMESTAMP(6) WHERE id=? AND estado='PENDIENTE'",[job.id]);if(claim.affectedRows!==1)return;const p={actorId:job.actor_id},s=parse(job.parametros);let r;
  try{
   if(job.tipo==='GOOGLE_DELTA')r=await prepararDeltaGoogle(pool,p,clave,job.id,{...(clienteHojas?{cliente:clienteHojas}:{}),onProgress:async n=>{await pool.execute('UPDATE ims_cm_trabajo SET progreso=?,actualizado_en=UTC_TIMESTAMP(6) WHERE id=?',[n,job.id]);}});
   else if(job.tipo==='GOOGLE_APLICAR')r=await aplicarDeltaGoogle(pool,p,clave,{...s,operacionId:uuidEstable('google-aplicar-trabajo',job.id)});
   else if(['AUDITORIA','PUBLICACION'].includes(job.tipo))r=await consolidarCentro(pool,p,{operacionId:uuidEstable('cm-consolidacion',job.id),publicar:job.tipo==='PUBLICACION'});
   else if(job.tipo==='CALENDARIO_LOTE'){
    const config=await obtenerConector(pool,'GOOGLE_CALENDAR',clave),firma=hash(config),eventos=await transaccionOperativa(pool,p,async c=>{const pf=await perfilCentro(c,p);exigir(pf.permisos.recordatorios,'SIN_PERMISO','Permiso de calendario revocado.');const sedes=s.sede?[s.sede]:pf.sedes;exigir(sedes.length&&sedes.every(x=>pf.sedes.includes(x)),'SIN_PERMISO','Sede no autorizada.');const [rs]=await c.execute('SELECT * FROM ims_cm_evento WHERE sede IN ('+sedes.map(()=>'?').join(',')+') AND fecha_inicio BETWEEN ? AND ? ORDER BY fecha_inicio,id LIMIT 2001',[...sedes,s.desde,s.hasta]);exigir(rs.length<=2000,'SOLICITUD_INVALIDA','Selecciona un periodo menor de la agenda.');return rs;});
    let confirmados=0;for(const ev of eventos){const actual=await obtenerConector(pool,'GOOGLE_CALENDAR',clave);exigir(hash(actual)===firma,'VERSION_DESACTUALIZADA','La cuenta de calendario cambió. Repite la sincronización con la cuenta nueva.');const fresco=await transaccionOperativa(pool,p,async c=>{const pf=await perfilCentro(c,p);exigir(pf.permisos.recordatorios&&pf.sedes.includes(ev.sede),'SIN_PERMISO','Permiso de calendario revocado.');const [[e]]=await c.execute('SELECT * FROM ims_cm_evento WHERE id=?',[ev.id]);return e;});await google(config,fresco);confirmados++;await pool.execute('UPDATE ims_cm_trabajo SET progreso=?,actualizado_en=UTC_TIMESTAMP(6) WHERE id=?',[confirmados,job.id]);}r={sincronizados:confirmados,cuenta:config.cuenta||config.calendario};
   }
   else if(['ZIP','REPORTE'].includes(job.tipo)){
    const partes=[];let bytes=0;for(const id of s.inventarios){const f=await reporteInventario(pool,p,id,'excel');bytes+=f.contenido.length;exigir(bytes<=30*1024*1024,'SOLICITUD_INVALIDA','La selección supera 30 MB; divide los inventarios.');partes.push([f.nombre,f.contenido]);await pool.execute('UPDATE ims_cm_trabajo SET progreso=?,actualizado_en=UTC_TIMESTAMP(6) WHERE id=?',[partes.length,job.id]);}const b=zip(partes);exigir(b.length<=30*1024*1024,'SOLICITUD_INVALIDA','El ZIP supera 30 MB; divide la selección.');
    if(job.tipo==='REPORTE'){exigir(b.length<=10*1024*1024,'SOLICITUD_INVALIDA','El adjunto supera 10 MB. Usa la descarga ZIP.');await correo({id:job.id,destinatarios:s.destinatarios,asunto:'Reporte de inventarios · ITSANET IMS',texto:'Se adjunta el reporte de los '+partes.length+' inventarios seleccionados.',adjunto:{nombre:'inventarios.zip',base64:b.toString('base64')}});r={enviado:true,inventarios:partes.length};}
    else{const c=await pool.getConnection();try{await c.beginTransaction();for(let i=0;i<b.length;i+=262144)await c.execute('INSERT INTO ims_cm_archivo VALUES (?,?,?)',[job.id,i/262144,b.subarray(i,i+262144)]);await c.commit();}catch(e){await c.rollback();throw e;}finally{c.release();}r={descarga:'/api/centro/trabajos/'+job.id+'/archivo',bytes:b.length,inventarios:partes.length};}
   }else{
    const e=await transaccionOperativa(pool,p,async c=>{const pf=await perfilCentro(c,p);exigir(pf.permisos.recordatorios,'SIN_PERMISO','Permiso revocado.');const [[e]]=await c.execute('SELECT * FROM ims_cm_evento WHERE id=?',[s.eventoId]);exigir(e&&pf.sedes.includes(e.sede),'SIN_PERMISO','Evento no autorizado.');return e;});
    const date=x=>x instanceof Date?x.toISOString().slice(0,10):x;e.fecha_inicio=date(e.fecha_inicio);e.fecha_fin=date(e.fecha_fin);
    if(job.tipo==='RECORDATORIO'){exigir(!e.eliminado,'SOLICITUD_INVALIDA','El evento fue eliminado.');r=await correo({id:job.id,destinatarios:s.destinatarios,asunto:'Recordatorio de inventario · '+e.cliente,texto:[e.cliente+' · '+e.titulo,'Fecha: '+e.fecha_inicio,'Responsable: '+e.responsable_nombre,'Estado: '+e.estado,e.observacion,'Centro de Mando · ITSANET IMS'].join('\n')});}
    else r=await google(await obtenerConector(pool,'GOOGLE_CALENDAR',clave),e);
   }
   await pool.execute("UPDATE ims_cm_trabajo SET estado='COMPLETO',resultado=?,actualizado_en=UTC_TIMESTAMP(6) WHERE id=?",[JSON.stringify(r),job.id]);
  }catch(e){await pool.execute("UPDATE ims_cm_trabajo SET estado='ERROR',resultado=?,actualizado_en=UTC_TIMESTAMP(6) WHERE id=?",[JSON.stringify({mensaje:e.codigo?e.message:'No se pudo confirmar el trabajo. Revisa su estado antes de repetirlo.'}),job.id]);}
  await pool.execute("DELETE a FROM ims_cm_archivo a JOIN ims_cm_trabajo t ON t.id=a.trabajo_id WHERE t.creado_en<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY) AND (t.tipo<>'GOOGLE_DELTA' OR JSON_EXTRACT(t.parametros,'$.aplicado') IS NULL)");
 }catch{/* No registra consultas, respuestas externas ni secretos. */}finally{ocupado=false;}
 };
 const tick=()=>{if(!ocupado&&!cerrado)enCurso=ejecutar();return enCurso;};
 const timer=setInterval(tick,intervalo);timer.unref();void tick();
 return {ejecutar:tick,cerrar:()=>{cerrado=true;clearInterval(timer);return enCurso;}};
}
