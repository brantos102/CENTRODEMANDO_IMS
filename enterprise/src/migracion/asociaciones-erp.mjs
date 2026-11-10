/** Propuestas de revisión: nunca autoriza ni activa una conexión ERP. */
import {ORIGEN_ERP,ORIGEN_ERP_GYE} from './credenciales-erp.mjs';
import {GRUPOS_ERP_CONFIRMADOS} from '../conexiones/grupos-erp.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const canon=v=>v.trim().toUpperCase();
function exigir(v){if(!v)throw Error('Catálogo o registro ERP incompatible. No se asignaron clientes.');}
/** Resultado privado: contiene credenciales. No devolver al navegador ni registrar. */
export function conciliarCredencialesERP(registros){
 exigir(Array.isArray(registros)&&registros.length>0&&registros.length<=10);
 const grupos=new Map();
 for(const r of registros){
  exigir(r?.formato==='ims-erp-registro-privado-v1'&&Array.isArray(r.entradas));
  const origen=[ORIGEN_ERP,ORIGEN_ERP_GYE].find(o=>o.proyecto===r.origen?.proyecto&&o.maestro===r.origen?.maestro);exigir(origen);
  for(const e of r.entradas){
   exigir(e&&/^[a-f0-9]{24}$/.test(e.referencia)&&['UIO','GYE'].includes(e.sede)&&typeof e.cliente_configurado==='string'&&canon(e.cliente_configurado)===e.cliente_configurado&&e.cliente_configurado.length>0&&e.cliente_configurado.length<=255&&typeof e.userid==='string'&&typeof e.password==='string'&&typeof e.requiere_revision==='boolean'&&typeof e.formato_utilizable==='boolean');
   const key=JSON.stringify([e.sede,e.cliente_configurado]);
   if(!grupos.has(key))grupos.set(key,[]);grupos.get(key).push({entrada:e,proyecto:origen.proyecto});
  }
 }
 return [...grupos.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,fuentes])=>{
  const es=fuentes.map(f=>f.entrada),e=es[0];exigir(es.every(x=>x.referencia===e.referencia));
  const conflicto=es.some(x=>x.userid!==e.userid||x.password!==e.password);
  // Solo resuelve el aviso de ubicación si una copia UIO válida confirma
  // exactamente usuario/clave. Ninguna otra incidencia queda perdonada.
  const uio=fuentes.find(f=>f.proyecto===ORIGEN_ERP.proyecto&&f.entrada.sede==='UIO'&&f.entrada.formato_utilizable&&!f.entrada.requiere_revision);
  const resueltos=fuentes.filter(f=>!conflicto&&uio&&f.proyecto===ORIGEN_ERP_GYE.proyecto&&f.entrada.sede==='UIO'&&f.entrada.fuente==='ScriptProperties'&&f.entrada.formato_utilizable&&f.entrada.requiere_revision);
  const revisar=fuentes.some(f=>!f.entrada.formato_utilizable||(f.entrada.requiere_revision&&!resueltos.includes(f)));
  return {entrada:uio?.entrada??e,conflicto,requiere_revision:revisar,copias_ubicacion_resueltas:resueltos.length,fuentes_revisadas:fuentes.length};
 });
}
export function proponerAsociacionesERP({registros,clientes}){
 exigir(Array.isArray(clientes)&&clientes.length<=10000);
 const ids=new Set(),catalogo=clientes.map(c=>{
  exigir(c&&UUID.test(c.id)&&typeof c.nombre==='string'&&c.nombre.length<=255&&canon(c.nombre)&&!ids.has(c.id));
  ids.add(c.id);return {id:c.id,nombre:c.nombre};
 }).sort((a,b)=>a.id.localeCompare(b.id));
 const porNombre=new Map();
 for(const c of catalogo){const nombre=canon(c.nombre);if(!porNombre.has(nombre))porNombre.set(nombre,[]);porNombre.get(nombre).push(c);}
 const conexiones=conciliarCredencialesERP(registros).map(({entrada:e,conflicto,requiere_revision:revisar,copias_ubicacion_resueltas,fuentes_revisadas})=>{
  const candidatos=porNombre.get(canon(e.cliente_configurado))||[];
  const grupo=GRUPOS_ERP_CONFIRMADOS.find(g=>g.sede===e.sede&&g.etiqueta===e.cliente_configurado);
  const clientesGrupo=grupo?(porNombre.get(canon(grupo.cliente))||[]):[];
  const estado=conflicto?'CONFLICTO_ENTRE_FUENTES':revisar?'CREDENCIAL_REQUIERE_REVISION':grupo
   ?clientesGrupo.length>1?'NOMBRE_AMBIGUO':clientesGrupo.length===1?'GRUPO_CONFIRMADO_PENDIENTE_CODIGOS':'GRUPO_CONFIRMADO_PENDIENTE_CATALOGO_Y_CODIGOS'
   :candidatos.length>1?'NOMBRE_AMBIGUO':candidatos.length===1?'COINCIDENCIA_PENDIENTE_CONFIRMACION':'SIN_COINCIDENCIA_EXACTA';
  return {referencia:e.referencia,sede:e.sede,etiqueta_credencial:e.cliente_configurado,estado,copias_ubicacion_resueltas,fuentes_revisadas,
   coincidencias_nombre:candidatos.map(c=>({...c})),grupo_confirmado_por_usuario:grupo?.cliente??null,tipo_cliente:grupo?.tipo??null,
   clientes_catalogados_del_grupo:clientesGrupo.map(c=>({...c})),cliente_confirmado:null,codigos_cliente_erp:[],conexion_comprobada:false};
 });
 return {formato:'ims-erp-asociaciones-revision-v1',catalogo_clientes:catalogo,conexiones,
  resumen:{ok:true,revisiones_fuente:registros.length,clientes_catalogados:catalogo.length,conexiones:conexiones.length,
   uio:conexiones.filter(c=>c.sede==='UIO').length,gye:conexiones.filter(c=>c.sede==='GYE').length,
   coincidencias_pendientes_confirmacion:conexiones.filter(c=>c.estado==='COINCIDENCIA_PENDIENTE_CONFIRMACION').length,
   sin_coincidencia_exacta:conexiones.filter(c=>c.estado==='SIN_COINCIDENCIA_EXACTA').length,
   nombres_ambiguos:conexiones.filter(c=>c.estado==='NOMBRE_AMBIGUO').length,
   conflictos_entre_fuentes:conexiones.filter(c=>c.estado==='CONFLICTO_ENTRE_FUENTES').length,
   credenciales_para_revision:conexiones.filter(c=>c.estado==='CREDENCIAL_REQUIERE_REVISION').length,
   avisos_ubicacion_resueltos:conexiones.reduce((n,c)=>n+c.copias_ubicacion_resueltas,0),
   conexiones_con_grupo_confirmado:conexiones.filter(c=>c.grupo_confirmado_por_usuario).length,
   grupos_pendientes_de_catalogo:[...new Set(conexiones.filter(c=>c.grupo_confirmado_por_usuario&&!c.clientes_catalogados_del_grupo.length).map(c=>c.grupo_confirmado_por_usuario))].sort(),
   clientes_asignados:0,codigos_erp_confirmados:0,conexiones_reales_comprobadas:false,
   base_de_datos_modificada:false,fuentes_modificadas:false,credenciales_publicadas:false,aplicacion_reiniciada:false}};
}
