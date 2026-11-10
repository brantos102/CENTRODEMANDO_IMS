import {ErrorAuth} from '../auth/credenciales.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function paginacion({cursor='',limite='50'}={}){
  if((cursor&&!UUID.test(cursor))||!/^\d{1,3}$/.test(String(limite))||Number(limite)<1||Number(limite)>100)
    throw new ErrorAuth('SOLICITUD_INVALIDA','Paginación inválida.',400);
  return {cursor,limite:Number(limite)};
}
function resultado(rows,n){const mas=rows.length>n;return {datos:rows.slice(0,n),siguiente:mas?rows[n-1].id:null};}
function textoBusqueda(value=''){
  if(typeof value!=='string'||[...value].length>120||/[\x00-\x1f\x7f]/.test(value))
    throw new ErrorAuth('SOLICITUD_INVALIDA','La búsqueda admite hasta 120 caracteres.',400);
  return value.trim();
}
function patron(value){return '%'+value.replace(/[!%_]/g,'!$&')+'%';}
export async function listarInventarios(pool,principal,opciones){
  const {cursor,limite}=paginacion(opciones);
  const buscar=textoBusqueda(opciones?.buscar),sede=opciones?.sede||'',cliente=opciones?.cliente||'';
  if((sede&&!['UIO','GYE'].includes(sede))||(cliente&&!UUID.test(cliente)))throw new ErrorAuth('SOLICITUD_INVALIDA','Filtro inválido.',400);
  const params=[principal.actorId,cursor];let filtros='';
  if(sede){filtros+=' AND i.sede=?';params.push(sede);}
  if(cliente){filtros+=' AND p.cliente_id=?';params.push(cliente);}
  if(buscar){filtros+=" AND (i.codigo_operativo COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!' OR c.nombre COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!')";params.push(patron(buscar),patron(buscar));}
  const [rows]=await pool.execute(`SELECT DISTINCT i.id,i.sede,i.codigo_operativo,i.estado FROM ims_op_inventario i
    JOIN ims_op_permiso p ON p.inventario_id=i.id AND p.actor_id=?
    JOIN ims_op_actor a ON a.id=p.actor_id AND a.activo=1
    JOIN ims_op_cliente c ON c.id=p.cliente_id
    WHERE i.id>? ${filtros} ORDER BY i.id LIMIT ${limite+1}`,params);
  return resultado(rows,limite);
}
export async function listarLineas(pool,principal,inventarioId,opciones,{operacionNativa=false}={}){
  if(!UUID.test(inventarioId))throw new ErrorAuth('SOLICITUD_INVALIDA','Inventario inválido.',400);
  const {cursor,limite}=paginacion(opciones);
  const buscar=textoBusqueda(opciones?.buscar),params=[principal.actorId,inventarioId,cursor];let filtro='';
  if(buscar){
    filtro=" AND (l.sku COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!' OR d.descripcion COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!' OR d.posicion COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!' OR d.serie COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!' OR d.lote COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!')";
    params.push(...Array(5).fill(patron(buscar)));
  }
  const [[acceso]]=await pool.execute('SELECT 1 AS permitido FROM ims_op_permiso WHERE actor_id=? AND inventario_id=? LIMIT 1',[principal.actorId,inventarioId]);
  if(!acceso)throw new ErrorAuth('SIN_PERMISO','Acceso no autorizado.',403);
  const permiso=operacionNativa?"(p.puede_contar=1 AND n.borrador=0 AND z.rol IN ('SUPERVISOR','OPERADOR'))":'p.puede_contar';
  const joins=operacionNativa?' LEFT JOIN ims_nat_inventario n ON n.inventario_id=l.inventario_id LEFT JOIN ims_nat_perfil z ON z.actor_id=p.actor_id AND z.inventario_id=p.inventario_id AND z.cliente_id=p.cliente_id ':'';
  const [rows]=await pool.execute(`SELECT l.id,l.inventario_id,l.cliente_id,l.sku,l.version,l.conteo_1,l.conteo_2,l.conteo_final,
    l.observacion,l.nueva_posicion,${permiso} AS puede_contar,c.nombre AS cliente,
    d.posicion,d.descripcion,d.serie,d.lote,d.unidad FROM ims_op_linea l
    JOIN ims_op_permiso p ON p.inventario_id=l.inventario_id AND p.cliente_id=l.cliente_id AND p.actor_id=?
    JOIN ims_op_actor a ON a.id=p.actor_id AND a.activo=1
    JOIN ims_op_cliente c ON c.id=l.cliente_id
    LEFT JOIN ims_op_detalle_linea d ON d.linea_id=l.id ${joins}
    WHERE l.inventario_id=? AND l.id>? ${filtro} ORDER BY l.id LIMIT ${limite+1}`,params);
  return resultado(rows.map(r=>({...r,version:String(r.version),puede_contar:!!r.puede_contar})),limite);
}

/** Cifras del histórico autorizado, sin leer staging ni calcular KPI de negocio. */
export async function consultarResumen(pool,principal){
  if(!principal?.actorId)throw new ErrorAuth('NO_AUTENTICADO','Inicia sesión para continuar.');
  const c=await pool.getConnection();let tx=false,destruir=false;
  const base=`FROM ims_op_permiso p JOIN ims_op_actor a ON a.id=p.actor_id AND a.activo=1
    JOIN ims_op_inventario i ON i.id=p.inventario_id JOIN ims_op_cliente cli ON cli.id=p.cliente_id
    LEFT JOIN ims_op_linea l ON l.inventario_id=p.inventario_id AND l.cliente_id=p.cliente_id WHERE p.actor_id=?`;
  try{
    await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');tx=true;
    const [[total]]=await c.execute(`SELECT COUNT(DISTINCT i.id) AS conteos,COUNT(l.id) AS lineas,
      COUNT(DISTINCT cli.id) AS clientes,COUNT(DISTINCT i.sede) AS sedes ${base}`,[principal.actorId]);
    const [clientes]=await c.execute(`SELECT cli.id,cli.nombre,COUNT(DISTINCT i.id) AS conteos,COUNT(l.id) AS lineas
      ${base} GROUP BY cli.id,cli.nombre ORDER BY cli.nombre,cli.id`,[principal.actorId]);
    await c.commit();tx=false;
    return {totales:Object.fromEntries(Object.entries(total).map(([k,v])=>[k,String(v)])),
      clientes:clientes.map(r=>({...r,conteos:String(r.conteos),lineas:String(r.lineas)})),consultado_en:new Date().toISOString()};
  }finally{
    if(tx){try{await c.rollback();}catch{destruir=true;}}
    if(destruir)c.destroy();else c.release();
  }
}
