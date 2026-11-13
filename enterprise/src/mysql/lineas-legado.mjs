// Carga interna de proyecciones verificadas; nunca se expone como cuerpo HTTP.
import {cantidadExacta} from '../dominio/conteo.mjs';
import {uuid} from '../dominio/operacion.mjs';
export function comprobarLineaLegado(l,{pendiente=false}={}){
 uuid(l.linea_id);uuid(l.cliente_id);
 if(!pendiente)uuid(l.inventario_id);
 if(!Number.isInteger(l.numero)||l.numero<1||l.numero>100000||typeof l.sku!=='string'||!l.sku.length||l.sku.length>255||l.bloqueos?.length)throw Error('LINEA_LEGADO_INCOMPATIBLE');
 if(!/^[A-Za-z0-9_-]{20,120}$/.test(l.origen?.origen_drive||'')||!Number.isInteger(l.origen?.fila)||l.origen.fila<2)throw Error('ORIGEN_LEGADO_INCOMPATIBLE');
 cantidadExacta(l.depot);
 for(const k of ['conteo_1','conteo_2','conteo_final'])if(l[k]!==null)cantidadExacta(l[k]);
 if(l.ajuste!==null){const q=l.ajuste;if(typeof q!=='string')throw Error('AJUSTE_LEGADO_INCOMPATIBLE');cantidadExacta(q.startsWith('-')?q.slice(1):q);}
 if(pendiente&&(l.inventario_id!==null||l.codigo_original!==null||l.fecha_inicio!==null||[l.conteo_1,l.conteo_2,l.conteo_final].some(q=>q!==null)))throw Error('PENDIENTE_LEGADO_YA_INICIADO');
 for(const [k,max] of Object.entries({observacion:65535,nueva_posicion:255,posicion:255,descripcion:65535,serie:255,lote:255,unidad:50,motivo:255,justificacion:65535,abc:50,despacho:255,partida:255,categoria:255,estado_mercancia:255})){
  if(typeof l[k]!=='string'||l[k].includes('\0')||(max===65535?Buffer.byteLength(l[k]):[...l[k]].length)>max)throw Error('TEXTO_LEGADO_INCOMPATIBLE');
 }
 return l;
}
export async function insertarFilas(c,tabla,columnas,filas){
 let lote=[],bytes=0;const guardar=async()=>{if(!lote.length)return;await c.execute(`INSERT INTO ${tabla}(${columnas.join(',')}) VALUES ${lote.map(()=>`(${columnas.map(()=>'?').join(',')})`).join(',')}`,lote.flat());lote=[];bytes=0;};
 for(const fila of filas){const n=fila.reduce((n,v)=>n+(v===null?4:Buffer.byteLength(String(v)))+16,0);if(lote.length>=100||bytes+n>512*1024)await guardar();lote.push(fila);bytes+=n;}await guardar();
}
export async function insertarLineasLegado(c,id,lineas){
 await insertarFilas(c,'ims_op_linea',['id','inventario_id','cliente_id','sku','origen_drive','fila_origen','version','conteo_1','conteo_2','conteo_final','observacion','nueva_posicion'],lineas.map(l=>[l.linea_id,id,l.cliente_id,l.sku,l.origen.origen_drive,l.origen.fila,0,l.conteo_1,l.conteo_2,l.conteo_final,l.observacion,l.nueva_posicion]));
 await insertarFilas(c,'ims_op_detalle_linea',['linea_id','posicion','descripcion','serie','lote','unidad'],lineas.map(l=>[l.linea_id,l.posicion,l.descripcion,l.serie,l.lote,l.unidad]));
 await insertarFilas(c,'ims_nat_linea',['linea_id','inventario_id','numero','depot','ajuste','motivo','justificacion','abc','despacho','partida','categoria','estado_mercancia'],lineas.map(l=>[l.linea_id,id,l.numero,l.depot,l.ajuste,l.motivo,l.justificacion,l.abc,l.despacho,l.partida,l.categoria,l.estado_mercancia]));
}
