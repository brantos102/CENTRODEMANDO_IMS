import {agruparConteo,ETAPAS} from '../dominio/grupos-conteo.mjs';
import {politicaConteo} from './politica-conteo.mjs';
import {resultadoWms} from '../dominio/analisis-wms.mjs';
import {ErrorAuth} from '../auth/credenciales.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function paginacion({cursor='',limite='50'}={}){
  if((cursor&&!UUID.test(cursor))||!/^\d{1,3}$/.test(String(limite))||Number(limite)<1||Number(limite)>100)
    throw new ErrorAuth('SOLICITUD_INVALIDA','Paginación inválida.',400);
  return {cursor,limite:Number(limite)};
}
function alcance(principal){return principal.sedes===undefined?{sql:'',params:[]}:{sql:principal.sedes.length?' AND i.sede IN ('+principal.sedes.map(()=>'?').join(',')+')':' AND 0',params:principal.sedes};}
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
  const scope=alcance(principal),params=[principal.actorId,cursor,...scope.params];let filtros=scope.sql;
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
 const {cursor,limite}=paginacion(opciones),scope=alcance(principal),cabecera=operacionNativa?'n.inventario_id nativo,n.mostrar_depot':'0 nativo,0 mostrar_depot',joinN=operacionNativa?'LEFT JOIN ims_nat_inventario n ON n.inventario_id=i.id':'';
 const [[h]]=await pool.execute(`SELECT i.sede,${cabecera} FROM ims_op_inventario i ${joinN} WHERE i.id=? AND EXISTS(SELECT 1 FROM ims_op_permiso p WHERE p.actor_id=? AND p.inventario_id=i.id) ${scope.sql}`,[inventarioId,principal.actorId,...scope.params]);
 if(!h)throw new ErrorAuth('SIN_PERMISO','Acceso no autorizado.',403);
 const nativo=operacionNativa&&typeof h.nativo==='string'&&UUID.test(h.nativo);
 const [roles]=nativo?await pool.execute('SELECT rol FROM ims_nat_perfil WHERE inventario_id=? AND actor_id=?',[inventarioId,principal.actorId]):[[]],politica=await politicaConteo(pool,principal,{perfiles:roles,mostrar_depot:h.mostrar_depot,esNativo:nativo}),visible=politica.puedeVerTeorico;
 const buscar=textoBusqueda(opciones?.buscar),posicion=textoBusqueda(opciones?.posicion),sku=textoBusqueda(opciones?.sku),cliente=opciones?.cliente||'',captura=opciones?.captura||'',res=opciones?.resultado||'';
 if(cliente&&!UUID.test(cliente)||!['','POR_CONTAR','CONTADO','RECUENTO','HEREDADO'].includes(captura)||!['','PENDIENTE','CORRECTO','FALTANTE','SOBRANTE'].includes(res))throw new ErrorAuth('SOLICITUD_INVALIDA','Filtro de tabla inválido.',400);
 if(res&&!visible)throw new ErrorAuth('SIN_PERMISO','El conteo ciego no permite filtrar por diferencias contra el stock.',403);
 if(opciones?.agrupar!==undefined&&!['','0','1'].includes(opciones.agrupar))throw new ErrorAuth('SOLICITUD_INVALIDA','Agrupación inválida.',400);
 if(nativo&&opciones?.agrupar==='1'){
  const grupos=await gruposAutorizados(pool,principal,inventarioId,{visible}),todos=grupos.map(g=>g.vista),canon=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es'),incluye=(a,b)=>canon(a).includes(canon(b));
  const ts={lineas:todos.length,filasOrigen:grupos.reduce((a,g)=>a+g.miembros.length,0),contadas:0,pendientes:0,c2:0,c3:0,recuentos:0,...(visible?{correctas:0,diferencias:0}:{})};
  for(const r of todos){ts[r.conteo_1===null?'pendientes':'contadas']++;if(r.conteo_2!==null)ts.c2++;if(r.conteo_final!==null)ts.c3++;if(r.conteo_1!==null&&r.conteo_2!==null&&r.conteo_1!==r.conteo_2&&r.conteo_final===null)ts.recuentos++;if(visible){if(r.resultado==='CORRECTO')ts.correctas++;if(['FALTANTE','SOBRANTE'].includes(r.resultado))ts.diferencias++;}}
  const filtrados=todos.filter(r=>(!buscar||['sku','posicion','descripcion','serie','lote'].some(k=>incluye(r[k],buscar)))&&(!sku||incluye(r.sku,sku))&&(!posicion||String(r.posicion??'').trim()===posicion)&&(!cliente||r.cliente_id===cliente)&&(!res||r.resultado===res)&&(!captura||({POR_CONTAR:r.conteo_1===null,CONTADO:r.conteo_1!==null,RECUENTO:r.conteo_1!==null&&r.conteo_2!==null&&r.conteo_1!==r.conteo_2&&r.conteo_final===null,HEREDADO:ETAPAS.some((k,i)=>r[k]===null&&ETAPAS.slice(i+1).some(p=>r[p]!==null))})[captura]));
  return {...resultado(filtrados.filter(r=>r.id>cursor),limite),...politica,agrupacion:true,totales:ts,filtradas:filtrados.length,clientes:[...new Map(todos.map(r=>[r.cliente_id,{id:r.cliente_id,nombre:r.cliente}])).values()].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'))};
 }
 const fisico="((CASE WHEN l.conteo_1 IS NULL THEN NULL WHEN l.conteo_2 IS NULL OR l.conteo_final IS NULL OR l.conteo_1=l.conteo_2 THEN l.conteo_1 ELSE l.conteo_final END)+COALESCE(x.ajuste,0))",estado=operacionNativa?`CASE WHEN ${fisico} IS NULL OR x.depot IS NULL THEN 'PENDIENTE' WHEN ${fisico}=x.depot THEN 'CORRECTO' WHEN ${fisico}>x.depot THEN 'SOBRANTE' ELSE 'FALTANTE' END`:"'PENDIENTE'";
 const base=`FROM ims_op_linea l JOIN ims_op_permiso p ON p.inventario_id=l.inventario_id AND p.cliente_id=l.cliente_id AND p.actor_id=? JOIN ims_op_actor a ON a.id=p.actor_id AND a.activo=1 JOIN ims_op_cliente c ON c.id=l.cliente_id LEFT JOIN ims_op_detalle_linea d ON d.linea_id=l.id ${operacionNativa?'LEFT JOIN ims_nat_inventario n ON n.inventario_id=l.inventario_id LEFT JOIN ims_nat_perfil z ON z.actor_id=p.actor_id AND z.inventario_id=p.inventario_id AND z.cliente_id=p.cliente_id LEFT JOIN ims_nat_linea x ON x.linea_id=l.id':''} WHERE l.inventario_id=?`,params=[principal.actorId,inventarioId],fs=[];
 if(buscar){fs.push("(l.sku COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!' OR d.descripcion COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!' OR d.posicion COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!' OR d.serie COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!' OR d.lote COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!')");params.push(...Array(5).fill(patron(buscar)));}
 if(posicion){fs.push('TRIM(d.posicion)=?');params.push(posicion);}if(sku){fs.push("l.sku COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!'");params.push(patron(sku));}if(cliente){fs.push('l.cliente_id=?');params.push(cliente);}
 if(captura==='POR_CONTAR')fs.push('l.conteo_1 IS NULL');if(captura==='CONTADO')fs.push('l.conteo_1 IS NOT NULL');if(captura==='RECUENTO')fs.push('l.conteo_1 IS NOT NULL AND l.conteo_2 IS NOT NULL AND l.conteo_1<>l.conteo_2 AND l.conteo_final IS NULL');if(captura==='HEREDADO')fs.push('((l.conteo_1 IS NULL AND (l.conteo_2 IS NOT NULL OR l.conteo_final IS NOT NULL)) OR (l.conteo_2 IS NULL AND l.conteo_final IS NOT NULL))');if(res){fs.push(`(${estado})=?`);params.push(res);}
 const filtro=fs.length?' AND '+fs.map(f=>'('+f+')').join(' AND '):'',permiso=operacionNativa?"(p.puede_contar=1 AND n.borrador=0 AND z.rol IN ('SUPERVISOR','OPERADOR'))":'p.puede_contar';
 const [rows]=await pool.execute(`SELECT l.id,l.inventario_id,l.cliente_id,l.sku,l.version,l.conteo_1,l.conteo_2,l.conteo_final,l.observacion,l.nueva_posicion,${permiso} puede_contar,c.nombre cliente,d.posicion,d.descripcion,d.serie,d.lote,d.unidad ${operacionNativa?',x.abc,x.despacho,x.partida,x.categoria,x.estado_mercancia':''} ${visible?',x.depot,x.ajuste':''} ${base} ${filtro} AND l.id>? ORDER BY l.id LIMIT ${limite+1}`,[...params,cursor]);
 const [[t]]=await pool.execute(`SELECT COUNT(*) lineas,SUM(l.conteo_1 IS NOT NULL) contadas,SUM(l.conteo_1 IS NULL) pendientes,SUM(l.conteo_2 IS NOT NULL) c2,SUM(l.conteo_final IS NOT NULL) c3,SUM(l.conteo_1 IS NOT NULL AND l.conteo_2 IS NOT NULL AND l.conteo_1<>l.conteo_2 AND l.conteo_final IS NULL) recuentos ${visible?`,SUM((${estado})='CORRECTO') correctas,SUM((${estado}) IN ('FALTANTE','SOBRANTE')) diferencias`:''} ${base}`,[principal.actorId,inventarioId]);
 const [[filtradas]]=filtro?await pool.execute(`SELECT COUNT(*) total ${base} ${filtro}`,params):[[{total:t.lineas}]], [clientes]=await pool.execute(`SELECT DISTINCT c.id,c.nombre ${base} ORDER BY c.nombre,c.id`,[principal.actorId,inventarioId]);
 return {...resultado(rows.map(r=>({...r,version:String(r.version),puede_contar:!!r.puede_contar,...(visible?resultadoWms(r):{})})),limite),...politica,totales:Object.fromEntries(Object.entries(t).map(([k,v])=>[k,Number(v||0)])),filtradas:Number(filtradas.total),clientes};
}

/** Cifras del histórico autorizado, sin leer staging ni calcular KPI de negocio. */
export async function consultarResumen(pool,principal){
  if(!principal?.actorId)throw new ErrorAuth('NO_AUTENTICADO','Inicia sesión para continuar.');
  const c=await pool.getConnection();let tx=false,destruir=false;
  const scope=alcance(principal),params=[principal.actorId,...scope.params];
  const base=`FROM ims_op_permiso p JOIN ims_op_actor a ON a.id=p.actor_id AND a.activo=1
    JOIN ims_op_inventario i ON i.id=p.inventario_id JOIN ims_op_cliente cli ON cli.id=p.cliente_id
    LEFT JOIN ims_op_linea l ON l.inventario_id=p.inventario_id AND l.cliente_id=p.cliente_id WHERE p.actor_id=? ${scope.sql}`;
  try{
    await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');tx=true;
    const [[total]]=await c.execute(`SELECT COUNT(DISTINCT i.id) AS conteos,COUNT(l.id) AS lineas,
      COUNT(DISTINCT cli.id) AS clientes,COUNT(DISTINCT i.sede) AS sedes ${base}`,params);
    const [clientes]=await c.execute(`SELECT cli.id,cli.nombre,COUNT(DISTINCT i.id) AS conteos,COUNT(l.id) AS lineas
      ${base} GROUP BY cli.id,cli.nombre ORDER BY cli.nombre,cli.id`,params);
    await c.commit();tx=false;
    return {totales:Object.fromEntries(Object.entries(total).map(([k,v])=>[k,String(v)])),
      clientes:clientes.map(r=>({...r,conteos:String(r.conteos),lineas:String(r.lineas)})),consultado_en:new Date().toISOString()};
  }finally{
    if(tx){try{await c.rollback();}catch{destruir=true;}}
    if(destruir)c.destroy();else c.release();
  }
}

/** Lee la identidad completa antes de paginar. Nunca se agrupa una página parcial. */
export async function gruposAutorizados(c,p,id,{visible=false}={}){
 const [rs]=await c.execute(`SELECT l.*,cli.nombre cliente,d.posicion,d.descripcion,d.serie,d.lote,d.unidad,
 x.depot,x.ajuste,x.abc,x.despacho,x.partida,x.categoria,x.estado_mercancia,e.codigo_cliente_erp,
 (a.puede_contar=1 AND n.borrador=0 AND z.rol IN ('SUPERVISOR','OPERADOR')) puede_contar
 FROM ims_op_linea l JOIN ims_op_cliente cli ON cli.id=l.cliente_id
 JOIN ims_op_permiso a ON a.inventario_id=l.inventario_id AND a.cliente_id=l.cliente_id AND a.actor_id=?
 JOIN ims_op_actor u ON u.id=a.actor_id AND u.activo=1
 JOIN ims_nat_inventario n ON n.inventario_id=l.inventario_id
 LEFT JOIN ims_nat_perfil z ON z.actor_id=a.actor_id AND z.inventario_id=a.inventario_id AND z.cliente_id=a.cliente_id
 JOIN ims_nat_linea x ON x.linea_id=l.id LEFT JOIN ims_op_detalle_linea d ON d.linea_id=l.id
 LEFT JOIN ims_erp_linea e ON e.linea_id=l.id AND e.inventario_id=l.inventario_id
 WHERE l.inventario_id=? ORDER BY l.id LIMIT 100001`,[p.actorId,id]);
 if(rs.length>100000)throw new ErrorAuth('SOLICITUD_INVALIDA','Este inventario requiere una revisión del límite de líneas antes de agrupar.',400);
 return agruparConteo(rs.map(r=>({...r,version:String(r.version)})),{visible});
}
