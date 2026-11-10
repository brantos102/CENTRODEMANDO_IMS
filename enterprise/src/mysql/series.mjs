import {randomUUID} from 'node:crypto';
import {serieCanonica,seriesParecidas,datosHallazgo} from '../dominio/series.mjs';
import {exigirOperacion as exigir,uuid,texto} from '../dominio/operacion.mjs';
import {normalizarSolicitud,prepararCambio} from '../dominio/conteo.mjs';
const PUEDE_CONTAR=['SUPERVISOR','OPERADOR'];
export function exigirClienteCaptura(n,s){
 uuid(s.clienteId);
 exigir(n.perfiles.some(r=>r.cliente_id===s.clienteId&&Number(r.puede_contar)===1&&PUEDE_CONTAR.includes(r.rol)), 'SIN_PERMISO','Cliente no autorizado para captura.');
 exigir(!n.borrador&&n.estado==='EN_PROCESO','INVENTARIO_NO_EDITABLE','El inventario no está abierto para captura.');
}
export async function consultarSerieInterna(c,n,s){
 const serie=serieCanonica(s.serie);
 const [[duplicada]]=await c.execute('SELECT id FROM ims_nat_serie WHERE inventario_id=? AND cliente_id=? AND serie=? LIMIT 1',[n.id,s.clienteId,serie]);
 const [coincidencias]=await c.execute(`SELECT l.id,l.sku,l.version,l.conteo_1,l.conteo_2,l.conteo_final,d.descripcion,d.posicion,d.serie
  FROM ims_op_linea l JOIN ims_op_detalle_linea d ON d.linea_id=l.id WHERE l.inventario_id=? AND l.cliente_id=?
  AND UPPER(TRIM(d.serie)) COLLATE utf8mb4_0900_bin=? ORDER BY l.id LIMIT 11`,[n.id,s.clienteId,serie]);
 // Sugerencias solo entre capturas del cliente autorizado, sin exponer otros clientes.
 const parecidas=[];let ultimo='';
 if(!duplicada){do{
  const [rows]=await c.execute('SELECT id,serie FROM ims_nat_serie WHERE inventario_id=? AND cliente_id=? AND id>? ORDER BY id LIMIT 500',[n.id,s.clienteId,ultimo]);
  for(const r of rows)if(seriesParecidas(serie,r.serie)&&parecidas.length<10)parecidas.push(r.serie);
  ultimo=rows.length===500&&parecidas.length<10?rows.at(-1).id:'';
 }while(ultimo);}
 return {serie,duplicada:!!duplicada,coincidencias:coincidencias.slice(0,10).map(r=>({...r,version:String(r.version)})),
  coincidenciasTruncadas:coincidencias.length>10,parecidas};
}
/** Preparación/efectos en la transacción que ya tiene inventario y sesión bloqueados.
 * Persistir se llama DESPUÉS del evento, antes de COMMIT, para mantener sus FK.
 */
export async function prepararCaptura(c,n,p,s,tipo){
 exigirClienteCaptura(n,s);
 let serie=null,consulta=null,linea=null,conteo=null,hallazgo=null,antes=null;
 if(tipo==='serie'){
  consulta=await consultarSerieInterna(c,n,s);serie=consulta.serie;
  exigir(!consulta.duplicada,'SERIE_DUPLICADA','La serie ya fue registrada para este cliente en este inventario.');
  exigir(typeof s.confirmarSimilar==='boolean');
  exigir(!consulta.parecidas.length||s.confirmarSimilar,'SERIE_SIMILAR','Hay una serie parecida. Vuelve a consultar y revisa antes de confirmar.');
  if(consulta.coincidencias.length||consulta.coincidenciasTruncadas){
   exigir(!s.hallazgo,'SOLICITUD_INVALIDA','La serie existe en stock; selecciona su línea.');uuid(s.lineaId);
   const [[l]]=await c.execute(`SELECT l.*,d.serie,d.posicion FROM ims_op_linea l JOIN ims_op_detalle_linea d ON d.linea_id=l.id
    WHERE l.id=? AND l.inventario_id=? AND l.cliente_id=? FOR SHARE`,[s.lineaId,n.id,s.clienteId]);
   exigir(l&&serieCanonica(l.serie)===serie,'SIN_PERMISO','La línea no corresponde a esta serie y cliente.');
   const input={operacionId:s.operacionId,inventarioId:n.id,lineaId:l.id,versionEsperada:s.versionLinea,etapa:s.etapa,cantidad:'1'};
   if(s.nuevaPosicion!==undefined)input.nuevaPosicion=texto(s.nuevaPosicion,255);
   const {payload,hash}=normalizarSolicitud(p.actorId,input),cambio=prepararCambio(l,payload);
   const resultado={ok:true,operacionId:s.operacionId,inventarioId:n.id,lineaId:l.id,clienteId:l.cliente_id,sku:l.sku,
    etapa:s.etapa,cantidad:payload.cantidad,version:cambio.despues.version};
   const [u]=await c.execute(`UPDATE ims_op_linea SET ${cambio.target}=?,version=?,observacion=?,nueva_posicion=? WHERE id=? AND version=?`,
    [payload.cantidad,cambio.despues.version,cambio.despues.observacion,cambio.despues.nueva_posicion,l.id,s.versionLinea]);
   exigir(u.affectedRows===1,'VERSION_DESACTUALIZADA','La línea cambió. Vuelve a consultar la serie.');
   await c.execute('INSERT INTO ims_op_operacion(actor_id,operacion_id,inventario_id,linea_id,payload_sha256,resultado) VALUES (?,?,?,?,?,?)',
    [p.actorId,s.operacionId,n.id,l.id,hash,JSON.stringify(resultado)]);
   await c.execute('INSERT INTO ims_op_auditoria(id,actor_id,operacion_id,antes,despues) VALUES (?,?,?,?,?)',
    [randomUUID(),p.actorId,s.operacionId,JSON.stringify(cambio.antes),JSON.stringify(cambio.despues)]);
   linea=l;conteo=resultado;antes={lineaId:l.id,...cambio.antes};
  }else{
   exigir(s.lineaId===undefined&&s.versionLinea===undefined&&s.etapa===undefined&&s.hallazgo,'SOLICITUD_INVALIDA','Serie desconocida: completa la planilla alterna del cliente.');
   hallazgo=datosHallazgo(s.hallazgo,{serie});
  }
 }else{
  exigir(s.serie===undefined,'SOLICITUD_INVALIDA','Usa la captura de series para registrar una serie física.');
  hallazgo=datosHallazgo(s.datos);
 }
 const hallazgoId=hallazgo?randomUUID():null,serieId=serie?randomUUID():null;
 const resultado={inventarioId:n.id,clienteId:s.clienteId,...(serie?{serie,serieId}:{}),hallazgoId,
  lineaId:linea?.id??null,versionLinea:conteo?.version??null,etapa:conteo?.etapa??null,
  cantidad:hallazgo?.cantidad??conteo.cantidad,advertenciaConfirmada:!!(consulta?.parecidas.length&&s.confirmarSimilar),seriesParecidas:consulta?.parecidas??[],publicacionKpi:false};
 const persistir=async()=>{
  if(hallazgo)await c.execute(`INSERT INTO ims_nat_hallazgo(id,inventario_id,cliente_id,actor_id,operacion_id,sku,descripcion,posicion,serie,lote,cantidad,observacion,justificacion)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,[hallazgoId,n.id,s.clienteId,p.actorId,s.operacionId,hallazgo.sku,hallazgo.descripcion,hallazgo.posicion,serie,hallazgo.lote,hallazgo.cantidad,hallazgo.observacion,hallazgo.justificacion]);
  if(serie)await c.execute(`INSERT INTO ims_nat_serie(id,inventario_id,cliente_id,actor_id,operacion_id,serie,posicion,linea_id,hallazgo_id)
   VALUES (?,?,?,?,?,?,?,?,?)`,[serieId,n.id,s.clienteId,p.actorId,s.operacionId,serie,texto(s.posicion??linea?.posicion??hallazgo?.posicion??'',255),linea?.id??null,hallazgoId]);
 };
 return {resultado,antes,persistir};
}
