import {createHash} from 'node:crypto';
import {transaccionOperativa,exigirCapturaNativa} from '../mysql/operacion-nativa.mjs';
import {perfilCentro} from './servicio.mjs';
import {asegurarDestino} from './carpetas.mjs';
import {exigir,uuid,texto} from './dominio.mjs';
export function imagenEvidencia(s){
 exigir(typeof s.base64==='string'&&s.base64.length<=4194304&&s.base64.length%4===0&&/^[A-Za-z0-9+/]*={0,2}$/.test(s.base64),'SOLICITUD_INVALIDA','Selecciona una foto JPEG o PNG de hasta 3 MB.');
 const b=Buffer.from(s.base64,'base64');exigir(b.toString('base64')===s.base64,'SOLICITUD_INVALIDA','La imagen codificada no es válida.');exigir(b.length>=32&&b.length<=3145728,'SOLICITUD_INVALIDA','La foto debe tener entre 32 bytes y 3 MB.');
 const png=b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&b.subarray(-8).equals(Buffer.from([73,69,78,68,174,66,96,130])),jpg=b[0]===255&&b[1]===216&&b[2]===255&&b[b.length-2]===255&&b[b.length-1]===217;
 exigir(png||jpg,'SOLICITUD_INVALIDA','El contenido no corresponde a una foto JPEG o PNG.');return {contenido:b,mime:png?'image/png':'image/jpeg',sha256:createHash('sha256').update(b).digest('hex')};
}
async function acceso(c,p,lineaId,escribir=false){
 const pf=await perfilCentro(c,p),[[r]]=await c.execute(`SELECT l.id,l.inventario_id,l.cliente_id,i.sede,i.estado,n.fecha_inicio,pe.puede_contar FROM ims_op_linea l JOIN ims_op_inventario i ON i.id=l.inventario_id JOIN ims_op_permiso pe ON pe.inventario_id=l.inventario_id AND pe.cliente_id=l.cliente_id AND pe.actor_id=? LEFT JOIN ims_nat_inventario n ON n.inventario_id=i.id WHERE l.id=? FOR SHARE`,[p.actorId,uuid(lineaId)]);
 exigir(r&&pf.sedes.includes(r.sede),'SIN_PERMISO','Producto no autorizado.');if(escribir){exigir(r.puede_contar&&r.estado==='EN_PROCESO','SIN_PERMISO','Las fotos nuevas requieren un inventario en proceso y permiso de captura.');await exigirCapturaNativa(c,p,r.inventario_id,r.cliente_id);}return r;
}
export async function guardarEvidencia(pool,p,s){uuid(s.operacionId);uuid(s.lineaId);const foto=imagenEvidencia(s),nota=texto(s.nota||'',2000);return transaccionOperativa(pool,p,async c=>{
 const l=await acceso(c,p,s.lineaId),[[prev]]=await c.execute('SELECT id,actor_id,linea_id,sha256,nota FROM ims_cm_evidencia WHERE id=?',[s.operacionId]);if(prev){exigir(prev.actor_id===p.actorId&&prev.linea_id===s.lineaId&&prev.sha256===foto.sha256&&prev.nota===nota,'OPERACION_REUTILIZADA','El envío pertenece a otra evidencia.');return {id:prev.id,guardada:true,repetida:true};}
 await acceso(c,p,s.lineaId,true);const fecha=l.fecha_inicio instanceof Date?l.fecha_inicio.toISOString().slice(0,10):l.fecha_inicio;const d=await asegurarDestino(c,{sede:l.sede,fechaInicio:fecha,clienteId:l.cliente_id});
 await c.execute('INSERT INTO ims_cm_evidencia(id,actor_id,inventario_id,linea_id,carpeta_id,mime,sha256,nota,contenido) VALUES (?,?,?,?,?,?,?,?,?)',[s.operacionId,p.actorId,l.inventario_id,l.id,d.carpetaId,foto.mime,foto.sha256,nota,foto.contenido]);
 const result={id:s.operacionId,guardada:true,ruta:d.ruta,drive:'PENDIENTE_AUTORIZACION_O_ENVIO'};await c.execute("INSERT INTO ims_cm_auditoria(actor_id,operacion_id,tipo,hash,resultado,antes,despues) VALUES (?,?,'evidencia',?,?,'null','null')",[p.actorId,s.operacionId,foto.sha256,JSON.stringify(result)]);return result;
 });}
export async function listarEvidencias(pool,p,lineaId){return transaccionOperativa(pool,p,async c=>{await acceso(c,p,lineaId);const [fotos]=await c.execute('SELECT id,mime,nota,creado_en FROM ims_cm_evidencia WHERE linea_id=? ORDER BY creado_en,id LIMIT 100',[lineaId]);return {fotos};});}
export async function leerEvidencia(pool,p,id){return transaccionOperativa(pool,p,async c=>{const [[r]]=await c.execute('SELECT * FROM ims_cm_evidencia WHERE id=?',[uuid(id)]);exigir(r,'SIN_PERMISO','Evidencia no autorizada.');await acceso(c,p,r.linea_id);return r;});}
