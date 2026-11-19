import {descifrar} from './conectores.mjs';
import {randomUUID} from 'node:crypto';
// La tarea se confirma en la misma transacción del cronograma. El trabajador
// consulta la opción de sincronización de la conexión antes de enviar a Google.
export async function encolarCambioCalendario(c,eventoId,clave){
 if(!clave)return;const [[cfg]]=await c.execute("SELECT actor_id,cifrado FROM ims_cm_conector WHERE tipo='GOOGLE_CALENDAR'");if(!cfg||!descifrar(cfg.cifrado,clave).sincronizarAgenda)return;
 await c.execute("INSERT INTO ims_cm_trabajo(id,actor_id,tipo,parametros,resultado) VALUES (?,?,'CALENDARIO_CAMBIO',?,'{}')",[randomUUID(),cfg.actor_id,JSON.stringify({eventoId})]);
}
