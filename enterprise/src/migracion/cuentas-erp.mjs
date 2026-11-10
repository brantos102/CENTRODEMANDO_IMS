import {conciliarCredencialesERP,proponerAsociacionesERP} from './asociaciones-erp.mjs';
const exigir=v=>{if(!v)throw Error('Evidencia ERP incompatible. No se registraron ni activaron conexiones.');};
const texto=v=>typeof v==='string'&&v.length>0&&v.length<=255&&!/[\x00-\x1f\x7f]/.test(v);
/** Verifica correspondencia entre informe de lectura y fuentes privadas.
 * No confunde un código observado con una asignación SQL o una importación. */
export function validarInformeLecturaERP(informe,conexiones){
 exigir(informe?.formato==='ims-erp-diagnostico-lectura-v1'&&Array.isArray(informe.conexiones)&&informe.conexiones.length===conexiones.length);
 const esperadas=new Map(conexiones.map(c=>[c.entrada.referencia,c.entrada])),vistas=new Set();
 for(const r of informe.conexiones){
  const e=esperadas.get(r?.referencia);exigir(e&&!vistas.has(r.referencia)&&r.sede===e.sede&&r.etiqueta_credencial===e.cliente_configurado);vistas.add(r.referencia);
  exigir(['VERIFICADA','VERIFICADA_SIN_STOCK','NO_VERIFICADA','BLOQUEADA_POR_REVISION','PENDIENTE_PRESUPUESTO'].includes(r.estado));
  if(['VERIFICADA','VERIFICADA_SIN_STOCK'].includes(r.estado)){
   exigir(r.autenticacion_verificada===true&&r.consulta_stock_verificada===true&&r.peticion_realizada===true&&Number.isInteger(r.filas_observadas)&&r.filas_observadas>=0&&r.filas_observadas<=100000&&Number.isInteger(r.filas_sin_codigo)&&r.filas_sin_codigo>=0&&Array.isArray(r.codigos_observados)&&r.codigos_observados.length<=1000);
   const codigos=new Set();let filas=r.filas_sin_codigo;
   for(const x of r.codigos_observados){exigir(texto(x?.codigo)&&x.codigo===x.codigo.trim().toUpperCase()&&!codigos.has(x.codigo)&&Number.isInteger(x.filas)&&x.filas>0&&x.filas<=100000);codigos.add(x.codigo);filas+=x.filas;}
   exigir(filas===r.filas_observadas&&(r.estado==='VERIFICADA_SIN_STOCK')===(r.filas_observadas===0));
  }
 }
 return new Map(informe.conexiones.map(r=>[r.referencia,r]));
}
/** Resultado privado contiene credenciales: nunca enviarlo al navegador/chat. */
export function prepararRegistroCuentasERP({registros,clientes,informe}){
 const conexiones=conciliarCredencialesERP(registros),lecturas=validarInformeLecturaERP(informe,conexiones);
 const propuestas=proponerAsociacionesERP({registros,clientes});
 const porRef=new Map(propuestas.conexiones.map(c=>[c.referencia,c]));
 const compartidos=new Map();
 for(const r of lecturas.values())if(r.estado==='VERIFICADA')for(const c of r.codigos_observados){const k=JSON.stringify([r.sede,c.codigo]);if(!compartidos.has(k))compartidos.set(k,[]);compartidos.get(k).push(r.referencia);}
 const privadas=[],revision=[],altas=new Set();
 for(const c of conexiones){
  const e=c.entrada,r=lecturas.get(e.referencia),p=porRef.get(e.referencia);
  let estado='PREPARADA_SOLO_PREVISUALIZACION',cliente=null,nombre=p.grupo_confirmado_por_usuario||e.cliente_configurado;
  const candidatos=p.grupo_confirmado_por_usuario?p.clientes_catalogados_del_grupo:p.coincidencias_nombre;
  if(c.conflicto||c.requiere_revision)estado='FUENTE_REQUIERE_REVISION';
  else if(!['VERIFICADA','VERIFICADA_SIN_STOCK'].includes(r.estado))estado='CONEXION_NO_VERIFICADA';
  else if(r.estado==='VERIFICADA_SIN_STOCK')estado='SIN_CODIGOS_OBSERVADOS';
  else if(r.filas_sin_codigo||r.codigos_observados.length!==1)estado='CODIGOS_REQUIEREN_ASOCIACION';
  else if(r.codigos_observados.some(x=>compartidos.get(JSON.stringify([r.sede,x.codigo])).length>1))estado='CODIGO_EN_VARIAS_CONEXIONES';
  else if(candidatos.length>1)estado='CLIENTE_AMBIGUO';
  else if(candidatos.length===0&&!p.grupo_confirmado_por_usuario)estado='CLIENTE_POR_CONFIRMAR';
  if(candidatos.length===1)cliente=candidatos[0];
  if(estado==='PREPARADA_SOLO_PREVISUALIZACION'){
   if(!cliente)altas.add(nombre);
   privadas.push({referencia:e.referencia,sede:e.sede,etiqueta:e.cliente_configurado,userid:e.userid,password:e.password,
    clienteId:cliente?.id??null,clienteNombre:cliente?.nombre??nombre,codigosCliente:r.codigos_observados.map(x=>x.codigo)});
  }
  revision.push({referencia:e.referencia,sede:e.sede,etiqueta_credencial:e.cliente_configurado,estado,cliente_destino:cliente?.nombre??nombre,cliente_id:cliente?.id??null,
   codigos_observados:r.codigos_observados?.map(x=>x.codigo)??[],alta_catalogo_pendiente:estado==='PREPARADA_SOLO_PREVISUALIZACION'&&!cliente,
   datos_previsualizacion_pendientes:r.previsualizacion?.totales_calculados!==true,configuracion_activa:false,importacion_autorizada:false});
 }
 const resumen={ok:true,conexiones_examinadas:conexiones.length,conexiones_preparadas:privadas.length,conexiones_pendientes:conexiones.length-privadas.length,
  altas_catalogo_pendientes:[...altas].sort(),codigos_lectura_preparados:privadas.reduce((n,c)=>n+c.codigosCliente.length,0),
  configuracion_activa:false,importacion_autorizada:false,base_de_datos_modificada:false,credenciales_publicadas:false,servicio_reiniciado:false};
 return {privado:{formato:'ims-erp-runtime-v1',modo:'solo_previsualizacion',conexiones:privadas},
  reporte:{formato:'ims-erp-cuentas-preparadas-v1',resumen,cuentas:revision}};
}
