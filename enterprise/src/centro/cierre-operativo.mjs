import {diaEcuador,sumarDias,exigir} from './dominio.mjs';
import {leerEstadoGoogle} from './estado-google.mjs';
const marcador=a=>a.map(()=>'?').join(',');
const numeros=r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Number(v||0)]));
const iso=v=>v instanceof Date?v.toISOString():v?String(v).replace(' ','T').replace(/Z?$/,'Z'):null;

export async function cuentasOperacion(c,sedes){
 const [[cuentas]]=await c.execute(`SELECT
  COUNT(DISTINCT CASE WHEN cm.rol='LIDER' THEN a.id END) lideresActivos,
  COUNT(DISTINCT CASE WHEN cm.rol='OPERARIO' THEN a.id END) operariosActivos,
  COUNT(DISTINCT CASE WHEN cm.cambiar_clave=1 THEN a.id END) pendientesCambioClave,
  COUNT(DISTINCT CASE WHEN cm.cambiar_clave=0 AND EXISTS(SELECT 1 FROM ims_op_permiso p
   JOIN ims_op_inventario i ON i.id=p.inventario_id AND i.sede=ac.sede AND i.estado='EN_PROCESO'
   JOIN ims_nat_inventario n ON n.inventario_id=i.id AND n.borrador=0
   JOIN ims_nat_perfil z ON z.inventario_id=p.inventario_id AND z.actor_id=p.actor_id AND z.cliente_id=p.cliente_id AND z.rol IN ('OPERADOR','SUPERVISOR')
   WHERE p.actor_id=a.id AND p.puede_contar=1) THEN a.id END) conAccesoDeCaptura
  FROM ims_op_actor a JOIN ims_cm_perfil cm ON cm.actor_id=a.id AND cm.rol IN ('LIDER','OPERARIO')
  JOIN ims_cm_acceso ac ON ac.actor_id=a.id WHERE a.activo=1 AND ac.sede IN (${sedes.length?marcador(sedes):"''"})`,sedes);
 return numeros(cuentas);
}

/** Solo consultas. El informe comprueba datos y permisos actuales; no realiza
 * capturas de prueba, inicia trabajos, entrega inventarios ni envía avisos. */
export async function consultarCierreOperativo(c,{sedes,hoy=diaEcuador(),ahora=new Date()}={}){
 exigir(Array.isArray(sedes)&&sedes.length>0&&sedes.every(s=>['UIO','GYE'].includes(s)),'SIN_PERMISO','Se requiere una sede autorizada.');
 const desde=sumarDias(hoy,-29),marks=marcador(sedes);
 const {jobs,incorporacionGoogle:google}=await leerEstadoGoogle(c,{hoy,sedes});
 const cuentas=await cuentasOperacion(c,sedes);
 const [totales]=await c.execute(`SELECT i.sede,i.estado,n.inventario_id IS NOT NULL nativo,
  COUNT(DISTINCT i.id) inventarios,COUNT(l.id) lineas,
  SUM(l.conteo_1 IS NOT NULL) c1,SUM(l.conteo_2 IS NOT NULL) c2,SUM(l.conteo_final IS NOT NULL) c3,
  SUM((l.conteo_2 IS NOT NULL AND l.conteo_1 IS NULL) OR (l.conteo_final IS NOT NULL AND l.conteo_2 IS NULL)) etapasHeredadas
  FROM ims_op_inventario i LEFT JOIN ims_nat_inventario n ON n.inventario_id=i.id
  LEFT JOIN ims_op_linea l ON l.inventario_id=i.id WHERE i.sede IN (${marks}) GROUP BY i.sede,i.estado,nativo ORDER BY i.sede,nativo,i.estado`,sedes);
 // Comprueba acceso por cliente: tener un líder en uno de los clientes no
 // permite anunciar que todo el inventario multicliente está asignado.
 // El acceso WMS global no sustituye la asignación vigente en el cronograma.
 const [recientes]=await c.execute(`SELECT i.id,i.sede,i.codigo_operativo codigo,i.estado,n.fecha_inicio fechaInicio,n.borrador,
  COUNT(ic.cliente_id) clientes,
  SUM(NOT EXISTS(SELECT 1 FROM ims_op_permiso p JOIN ims_op_actor a ON a.id=p.actor_id AND a.activo=1
   JOIN ims_cm_perfil cm ON cm.actor_id=a.id AND cm.rol='LIDER' AND cm.cambiar_clave=0
   JOIN ims_cm_acceso ac ON ac.actor_id=a.id AND ac.sede=i.sede
   JOIN ims_nat_perfil z ON z.actor_id=p.actor_id AND z.inventario_id=p.inventario_id AND z.cliente_id=p.cliente_id AND z.rol IN ('OPERADOR','SUPERVISOR')
   WHERE p.inventario_id=i.id AND p.cliente_id=ic.cliente_id AND p.puede_contar=1
   AND EXISTS(SELECT 1 FROM ims_cm_vinculo v JOIN ims_cm_evento e ON e.id=v.evento_id AND e.eliminado=0
    WHERE v.inventario_id=i.id AND (e.responsable_id=a.id OR EXISTS(SELECT 1 FROM ims_cm_equipo q WHERE q.evento_id=e.id AND q.actor_id=a.id AND q.estado='ACTIVO'))))) clientesSinLider,
  SUM(NOT EXISTS(SELECT 1 FROM ims_op_permiso p JOIN ims_op_actor a ON a.id=p.actor_id AND a.activo=1
   JOIN ims_cm_perfil cm ON cm.actor_id=a.id AND cm.rol IN ('LIDER','OPERARIO') AND cm.cambiar_clave=0
   JOIN ims_cm_acceso ac ON ac.actor_id=a.id AND ac.sede=i.sede
   JOIN ims_nat_perfil z ON z.actor_id=p.actor_id AND z.inventario_id=p.inventario_id AND z.cliente_id=p.cliente_id AND z.rol IN ('OPERADOR','SUPERVISOR')
   WHERE p.inventario_id=i.id AND p.cliente_id=ic.cliente_id AND p.puede_contar=1
   AND EXISTS(SELECT 1 FROM ims_cm_vinculo v JOIN ims_cm_evento e ON e.id=v.evento_id AND e.eliminado=0
    WHERE v.inventario_id=i.id AND (e.responsable_id=a.id OR EXISTS(SELECT 1 FROM ims_cm_equipo q WHERE q.evento_id=e.id AND q.actor_id=a.id AND q.estado='ACTIVO'))))) clientesSinEquipoHabilitado
  FROM ims_op_inventario i JOIN ims_nat_inventario n ON n.inventario_id=i.id
  JOIN ims_op_inventario_cliente ic ON ic.inventario_id=i.id
  WHERE i.sede IN (${marks}) AND n.fecha_inicio BETWEEN ? AND ? AND i.estado IN ('EN_PROCESO','EN_VALIDACION')
  GROUP BY i.id ORDER BY i.sede,n.fecha_inicio,i.codigo_operativo`,[...sedes,desde,hoy]);
 const [[capturas]]=await c.execute(`SELECT
  SUM(JSON_UNQUOTE(JSON_EXTRACT(o.resultado,'$.etapa'))='1') c1,
  SUM(JSON_UNQUOTE(JSON_EXTRACT(o.resultado,'$.etapa'))='2') c2,
  SUM(JSON_UNQUOTE(JSON_EXTRACT(o.resultado,'$.etapa'))='3') c3,MAX(o.creado_en) ultima
  FROM ims_op_operacion o JOIN ims_op_inventario i ON i.id=o.inventario_id
  WHERE i.sede IN (${marks}) AND o.creado_en>=? AND o.creado_en<?
   AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(o.resultado,'$.origen')),'')<>'GOOGLE'`,[...sedes,desde+' 05:00:00',sumarDias(hoy,1)+' 05:00:00']);
 const [[tamano]]=sedes.includes('UIO')&&sedes.includes('GYE')?await c.execute('SELECT SUM(DATA_LENGTH) datosBytes,SUM(INDEX_LENGTH) indicesBytes,COUNT(*) tablas FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()'):[[{datosBytes:null,indicesBytes:null,tablas:null}]];
 const lectura=jobs.find(j=>j.tipo==='GOOGLE_DELTA'),fechaLectura=google.revision?.fecha,edad=fechaLectura?(ahora.getTime()-new Date(fechaLectura).getTime())/3600000:null;
 const pendientes=[];
 if(lectura?.estado!=='COMPLETO')pendientes.push({codigo:'LECTURA_GOOGLE_SIN_CONFIRMAR',accion:'Revisar novedades de inventarios y esperar a que termine la lectura.'});
 else if(edad===null||!Number.isFinite(edad)||edad<0||edad>24)pendientes.push({codigo:'LECTURA_GOOGLE_DESACTUALIZADA',accion:'Preparar una lectura actual de Google antes del cierre.'});
 if(google.revision?.otrasIncidencias)pendientes.push({codigo:'FUENTES_GOOGLE_POR_REVISAR',cantidad:google.revision.otrasIncidencias,accion:'Resolver las incidencias de lectura o identificación de fuentes.'});
 if(google.periodoReciente.novedadesPorAplicar.length)pendientes.push({codigo:'NOVEDADES_RECIENTES_SIN_INCORPORAR',cantidad:google.periodoReciente.novedadesPorAplicar.length,accion:'Revisar y aplicar la selección reciente; si el plan venció, volver a leer.'});
 if(google.periodoReciente.gruposConConflictos)pendientes.push({codigo:'CONFLICTOS_RECIENTES',cantidad:google.periodoReciente.gruposConConflictos,accion:'Conciliar las diferencias de los inventarios recientes sin sustituir capturas locales.'});
 if(!cuentas.lideresActivos)pendientes.push({codigo:'LIDERES_SIN_HABILITAR',accion:'Crear o activar las cuentas de los líderes de conteo.'});
 if(cuentas.pendientesCambioClave)pendientes.push({codigo:'CUENTAS_PENDIENTES_CAMBIO_CLAVE',cantidad:cuentas.pendientesCambioClave,accion:'Cada persona debe iniciar sesión y cambiar su clave inicial en Centro → Mi perfil antes de contar. Si no conoce su clave temporal, administración puede restablecerla desde Usuarios.'});
 const conPendientes=recientes.filter(r=>Number(r.borrador)||Number(r.clientesSinLider)||Number(r.clientesSinEquipoHabilitado));
 if(conPendientes.length)pendientes.push({codigo:'INVENTARIOS_RECIENTES_SIN_EQUIPO_LISTO',cantidad:conPendientes.length,accion:'Completar stock pendiente y asignar líder y colaboradores; deben terminar el cambio de clave inicial.'});
 return {formato:'ims-cierre-operativo-v1',generadoEn:ahora.toISOString(),sedes,periodo:{desde,hasta:hoy},
  evaluacion:pendientes.length?'PENDIENTES_DE_DATOS_Y_ACCESOS':'DATOS_Y_ACCESOS_COMPROBADOS',pendientes,
  google,cuentasOperacion:cuentas,
  inventarios:totales.map(({sede,estado,nativo,...r})=>({sede,estado,nativo:!!Number(nativo),...numeros(r)})),
  recientes:recientes.map(({id,sede,codigo,estado,fechaInicio,...r})=>({inventarioId:id,sede,codigo,estado,fechaInicio:fechaInicio instanceof Date?fechaInicio.toISOString().slice(0,10):fechaInicio,...numeros(r)})),
  capturasLocales30Dias:{...numeros({c1:capturas.c1,c2:capturas.c2,c3:capturas.c3}),ultima:iso(capturas.ultima),nota:'Registros locales auditados, separados de las importaciones de Google; no equivalen por sí solos a una aprobación operativa.'},
  baseDatos:tamano.datosBytes===null?{medicion:'RESERVADA_AL_ADMIN_DE_AMBAS_SEDES'}:{...numeros(tamano),medicion:'TABLAS_VISIBLES_PARA_PERFIL_OPERATIVO',nota:'Medición parcial según los permisos del servicio. El informe ejecutado en el servidor mide el esquema completo; no incluye binlogs, archivos externos ni memoria de MySQL.'},
  validacionEnCampo:'Confirmar con un líder el registro C1/C2/C3 cuando corresponda, la descarga y la entrega del inventario antes del inicio general. Este informe no genera capturas de prueba.',
  datosInventarioModificados:false,fuentesGoogleModificadas:false,notificacionesEnviadas:false};
}
