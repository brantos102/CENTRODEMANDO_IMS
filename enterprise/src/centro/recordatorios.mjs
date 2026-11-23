import {transaccionOperativa} from '../mysql/operacion-nativa.mjs';
import {perfilCentro} from './servicio.mjs';
import {uuid,exigir} from './dominio.mjs';
/** La agenda no convierte a todos los integrantes en destinatarios de correo.
 * Solo líderes activos, autorizados para la sede y asignados a esta tarea.
 */
export async function lideresRecordatorio(c,eventoId){
 uuid(eventoId);
 const [us]=await c.execute(`SELECT DISTINCT u.actor_id,u.nombre,u.correo FROM ims_cm_evento e
 JOIN ims_cm_acceso ac ON ac.sede=e.sede
 JOIN ims_op_actor a ON a.id=ac.actor_id AND a.activo=1
 JOIN ims_cm_perfil pf ON pf.actor_id=a.id AND pf.rol='LIDER'
 JOIN ims_auth_usuario u ON u.actor_id=a.id
 WHERE e.id=? AND e.eliminado=0 AND (e.responsable_id=a.id OR EXISTS(
 SELECT 1 FROM ims_cm_equipo q WHERE q.evento_id=e.id AND q.actor_id=a.id AND q.estado='ACTIVO'))
 ORDER BY u.correo LIMIT 101`,[eventoId]);return us;
}
export async function destinatariosRecordatorio(pool,p,eventoId){
 uuid(eventoId);return transaccionOperativa(pool,p,async c=>{
  const pf=await perfilCentro(c,p),[[e]]=await c.execute('SELECT sede FROM ims_cm_evento WHERE id=? AND eliminado=0',[eventoId]);
  exigir(pf.permisos.recordatorios&&e&&pf.sedes.includes(e.sede),'SIN_PERMISO','Tarea no autorizada.');
  return {destinatarios:await lideresRecordatorio(c,eventoId),alcance:'LIDERES_ASIGNADOS_ACTIVOS'};
 });
}
