/** Propuestas de revisión: nunca autoriza ni activa una conexión ERP. */
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const canon=v=>v.trim().toUpperCase();
function exigir(v){if(!v)throw Error('Catálogo o registro ERP incompatible. No se asignaron clientes.');}
export function proponerAsociacionesERP({registros,clientes}){
 exigir(Array.isArray(registros)&&registros.length>0&&registros.length<=10&&Array.isArray(clientes)&&clientes.length<=10000);
 const ids=new Set(),catalogo=clientes.map(c=>{
  exigir(c&&UUID.test(c.id)&&typeof c.nombre==='string'&&c.nombre.length<=255&&canon(c.nombre)&&!ids.has(c.id));
  ids.add(c.id);return {id:c.id,nombre:c.nombre};
 }).sort((a,b)=>a.id.localeCompare(b.id));
 const porNombre=new Map();
 for(const c of catalogo){const nombre=canon(c.nombre);if(!porNombre.has(nombre))porNombre.set(nombre,[]);porNombre.get(nombre).push(c);}
 const grupos=new Map();
 for(const r of registros){
  exigir(r?.formato==='ims-erp-registro-privado-v1'&&Array.isArray(r.entradas));
  for(const e of r.entradas){
   exigir(e&&/^[a-f0-9]{24}$/.test(e.referencia)&&['UIO','GYE'].includes(e.sede)&&typeof e.cliente_configurado==='string'&&canon(e.cliente_configurado)===e.cliente_configurado&&e.cliente_configurado.length>0&&e.cliente_configurado.length<=255&&typeof e.userid==='string'&&typeof e.password==='string'&&typeof e.requiere_revision==='boolean'&&typeof e.formato_utilizable==='boolean');
   const key=JSON.stringify([e.sede,e.cliente_configurado]);
   if(!grupos.has(key))grupos.set(key,[]);grupos.get(key).push(e);
  }
 }
 const conexiones=[...grupos.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,es])=>{
  const e=es[0];exigir(es.every(x=>x.referencia===e.referencia));
  const conflicto=es.some(x=>x.userid!==e.userid||x.password!==e.password);
  const revisar=es.some(x=>x.requiere_revision||!x.formato_utilizable);
  const candidatos=porNombre.get(canon(e.cliente_configurado))||[];
  const estado=conflicto?'CONFLICTO_ENTRE_FUENTES':revisar?'CREDENCIAL_REQUIERE_REVISION':candidatos.length>1?'NOMBRE_AMBIGUO':candidatos.length===1?'COINCIDENCIA_PENDIENTE_CONFIRMACION':'SIN_COINCIDENCIA_EXACTA';
  return {referencia:e.referencia,sede:e.sede,etiqueta_credencial:e.cliente_configurado,estado,
   coincidencias_nombre:candidatos.map(c=>({...c})),cliente_confirmado:null,codigos_cliente_erp:[],conexion_comprobada:false};
 });
 return {formato:'ims-erp-asociaciones-revision-v1',catalogo_clientes:catalogo,conexiones,
  resumen:{ok:true,revisiones_fuente:registros.length,clientes_catalogados:catalogo.length,conexiones:conexiones.length,
   uio:conexiones.filter(c=>c.sede==='UIO').length,gye:conexiones.filter(c=>c.sede==='GYE').length,
   coincidencias_pendientes_confirmacion:conexiones.filter(c=>c.estado==='COINCIDENCIA_PENDIENTE_CONFIRMACION').length,
   sin_coincidencia_exacta:conexiones.filter(c=>c.estado==='SIN_COINCIDENCIA_EXACTA').length,
   nombres_ambiguos:conexiones.filter(c=>c.estado==='NOMBRE_AMBIGUO').length,
   conflictos_entre_fuentes:conexiones.filter(c=>c.estado==='CONFLICTO_ENTRE_FUENTES').length,
   credenciales_para_revision:conexiones.filter(c=>c.estado==='CREDENCIAL_REQUIERE_REVISION').length,
   clientes_asignados:0,codigos_erp_confirmados:0,conexiones_reales_comprobadas:false,
   base_de_datos_modificada:false,fuentes_modificadas:false,credenciales_publicadas:false,aplicacion_reiniciada:false}};
}
