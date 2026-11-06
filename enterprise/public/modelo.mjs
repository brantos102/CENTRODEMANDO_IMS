export function cantidadNormalizada(value){
  const s=String(value??'').trim().replace(',','.');
  if(!/^\d{1,30}(?:\.\d{1,9})?$/.test(s))throw Error('Escribe una cantidad no negativa, sin separadores de miles y con hasta nueve decimales.');
  const [a,b='']=s.split('.'),entero=a.replace(/^0+(?=\d)/,'');
  if(entero.length>21)throw Error('La cantidad supera la precisión admitida.');
  return entero+(b?'.'+b:'');
}
export function mostrarCantidad(value){
  if(value===null||value===undefined)return '—';
  return String(value).replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
}
export function siguienteEtapa(linea){
  const v=[linea.conteo_1,linea.conteo_2,linea.conteo_final];
  const i=v.findIndex(x=>x===null);
  if(i<0||v.slice(i+1).some(x=>x!==null))return null;
  return i+1;
}
export function acuseValido(acuse,solicitud){
  try{
    return acuse?.ok===true&&acuse.operacionId===solicitud.operacionId&&
      acuse.inventarioId===solicitud.inventarioId&&acuse.lineaId===solicitud.lineaId&&
      acuse.etapa===solicitud.etapa&&typeof acuse.version==='string'&&
      mostrarCantidad(cantidadNormalizada(acuse.cantidad))===mostrarCantidad(cantidadNormalizada(solicitud.cantidad));
  }catch{return false;}
}
export function validarPagina(data,tipo){
  const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
  const decimal=v=>v===null||(typeof v==='string'&&/^\d+(?:\.\d+)?$/.test(v));
  if(!data||!Array.isArray(data.datos)||data.datos.length>100||(data.siguiente!==null&&!uuid(data.siguiente)))throw Error('Respuesta incompleta. Se conserva la vista anterior; reintenta.');
  for(const r of data.datos){
    const ok=uuid(r.id)&&(tipo==='inventarios'?
      typeof r.codigo_operativo==='string'&&typeof r.sede==='string'&&typeof r.estado==='string':
      uuid(r.inventario_id)&&uuid(r.cliente_id)&&typeof r.cliente==='string'&&typeof r.sku==='string'&&
      typeof r.version==='string'&&/^\d+$/.test(r.version)&&typeof r.puede_contar==='boolean'&&
      [r.conteo_1,r.conteo_2,r.conteo_final].every(decimal));
    if(!ok)throw Error('Respuesta incompleta. Se conserva la vista anterior; reintenta.');
  }
  return data;
}
