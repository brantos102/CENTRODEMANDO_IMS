import {ErrorAuth} from '../auth/credenciales.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function paginacion({cursor='',limite='50'}={}){
  if((cursor&&!UUID.test(cursor))||!/^\d{1,3}$/.test(String(limite))||Number(limite)<1||Number(limite)>100)
    throw new ErrorAuth('SOLICITUD_INVALIDA','Paginación inválida.',400);
  return {cursor,limite:Number(limite)};
}
function resultado(rows,n){const mas=rows.length>n;return {datos:rows.slice(0,n),siguiente:mas?rows[n-1].id:null};}
export async function listarInventarios(pool,principal,opciones){
  const {cursor,limite}=paginacion(opciones);
  const [rows]=await pool.execute(`SELECT DISTINCT i.id,i.sede,i.codigo_operativo,i.estado FROM ims_op_inventario i
    JOIN ims_op_permiso p ON p.inventario_id=i.id AND p.actor_id=?
    JOIN ims_op_actor a ON a.id=p.actor_id AND a.activo=1
    WHERE i.id>? ORDER BY i.id LIMIT ${limite+1}`,[principal.actorId,cursor]);
  return resultado(rows,limite);
}
export async function listarLineas(pool,principal,inventarioId,opciones){
  if(!UUID.test(inventarioId))throw new ErrorAuth('SOLICITUD_INVALIDA','Inventario inválido.',400);
  const {cursor,limite}=paginacion(opciones);
  const [[acceso]]=await pool.execute('SELECT 1 AS permitido FROM ims_op_permiso WHERE actor_id=? AND inventario_id=? LIMIT 1',[principal.actorId,inventarioId]);
  if(!acceso)throw new ErrorAuth('SIN_PERMISO','Acceso no autorizado.',403);
  const [rows]=await pool.execute(`SELECT l.id,l.inventario_id,l.cliente_id,l.sku,l.version,l.conteo_1,l.conteo_2,l.conteo_final,
    l.observacion,l.nueva_posicion,p.puede_contar,c.nombre AS cliente,
    d.posicion,d.descripcion,d.serie,d.lote,d.unidad FROM ims_op_linea l
    JOIN ims_op_permiso p ON p.inventario_id=l.inventario_id AND p.cliente_id=l.cliente_id AND p.actor_id=?
    JOIN ims_op_actor a ON a.id=p.actor_id AND a.activo=1
    JOIN ims_op_cliente c ON c.id=l.cliente_id
    LEFT JOIN ims_op_detalle_linea d ON d.linea_id=l.id
    WHERE l.inventario_id=? AND l.id>? ORDER BY l.id LIMIT ${limite+1}`,[principal.actorId,inventarioId,cursor]);
  return resultado(rows.map(r=>({...r,version:String(r.version),puede_contar:!!r.puede_contar})),limite);
}
