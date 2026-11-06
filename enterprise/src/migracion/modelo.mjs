import {createHash} from 'node:crypto';
import {cantidadExacta} from '../dominio/conteo.mjs';
export const INV=['FECHA INICIO','FECHA FINAL','ID','N de línea','CLIENTE','ABC','PRODUCTO','DESCRIPCIÓN DEL PRODUCTO','SERIE','LOTE','N DESPACHO','N PARTIDA','CAT_LOG','EST_MER','POSICIÓN','UNI','DEPOT','CONTEO FISICO','DESFASE','RESULTADO UNIDADES','RESULTADO SERIES','CONTEO No. 1','CONTEO No. 2','CONTEO FINAL','AJUSTE','MOTIVO','JUSTIFICACION','OBSERVACION','NUEVA POSICION','ACTUALIZACION DEPOT'];
export const REG=['ACTUADOR','FECHA','HORA','USUARIO','CORREO','ID','CLIENTE','CODIGO','POSICION','CONTEO FISICO','RESULTADO CONTEO','CONTEO N1','CONTEO N2','CONTEO N3','LINK'];
export function exigir(ok,message){if(!ok)throw Error(message);}
export const sha=value=>createHash('sha256').update(value).digest('hex');
export function canon(value){
  if(Array.isArray(value))return '['+value.map(canon).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canon(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export function uuidEstable(tipo,clave){
  const b=createHash('sha256').update(canon(['ims-import-v1',tipo,clave])).digest().subarray(0,16);
  b[6]=(b[6]&15)|128;b[8]=(b[8]&63)|128;const h=b.toString('hex');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}
export const normalizar=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function verificarCabecera(actual,esperada){
  exigir(Array.isArray(actual)&&actual.length===esperada.length&&actual.every((h,i)=>normalizar(h)===normalizar(esperada[i])),
    'Contrato de encabezados incompatible; no se proyectan columnas por posición desconocida.');
}
export function celdas(row){return new Map(row.celdas.map(c=>[c.columna,c]));}
export function texto(c){return c?.valor===null||c?.valor===undefined?null:String(c.valor);}
export function decimalCelda(c){
  if(!c||c.valor===null||String(c.valor).trim()===''){
    if(c?.formula&&c.valor===null)throw Error('CONTEO_SIN_RESULTADO');
    return null;
  }
  if(!['n','s','inlineStr'].includes(c.tipo))throw Error('CONTEO_NO_NUMERICO');
  let value=String(c.valor).trim();
  if(c.tipo==='n'&&/[eE]/.test(value)){
    const m=/^(\d+)(?:\.(\d+))?[eE]([+-]?\d{1,3})$/.exec(value);
    if(!m)throw Error('CONTEO_NO_NUMERICO');
    const digits=m[1]+(m[2]||''),p=m[1].length+Number(m[3]);
    if(p>40||p< -40)throw Error('CONTEO_FUERA_PRECISION');
    value=p<=0?'0.'+'0'.repeat(-p)+digits:p>=digits.length?digits+'0'.repeat(p-digits.length):digits.slice(0,p)+'.'+digits.slice(p);
  }
  if(value.startsWith('-'))throw Error('CONTEO_NEGATIVO');
  try{return cantidadExacta(value);}catch{throw Error('CONTEO_NO_NUMERICO_O_FUERA_PRECISION');}
}
function campo(c,max,bytes=false){
  const v=texto(c);if(v!==null&&(bytes?Buffer.byteLength(v):[...v].length)>max)throw Error('CAMPO_FUERA_LONGITUD');return v;
}
export function proyectarFila(row,snapshot,clientes){
  const d=celdas(row),issues=[];
  const cliente=(texto(d.get(5))||'').trim(),sku=(texto(d.get(7))||'').trim(),codigo=(texto(d.get(3))||'').trim();
  if(!cliente)issues.push('CLIENTE_VACIO');else if(!clientes.has(cliente))issues.push('CLIENTE_NO_CATALOGADO');
  if(!sku)issues.push('SKU_VACIO');if(!codigo)issues.push('ID_OPERATIVO_VACIO');
  const cantidad=[];
  for(const col of [22,23,24]){try{cantidad.push(decimalCelda(d.get(col)));}catch(e){issues.push(e.message);cantidad.push(null);}}
  let details;
  try{
    exigir([...cliente].length<=255&&[...sku].length<=255&&[...codigo].length<=255,'CAMPO_FUERA_LONGITUD');
    details={observacion:campo(d.get(28),65535,true)??'',nueva_posicion:campo(d.get(29),255)??'',
      posicion:campo(d.get(15),255),descripcion:campo(d.get(8),65535,true),serie:campo(d.get(9),255),lote:campo(d.get(10),255),unidad:campo(d.get(16),50)};
  }catch{issues.push('CAMPO_FUERA_LONGITUD');}
  return {issues:[...new Set(issues)],codigo,cliente,
    proyeccion:{linea_id:uuidEstable('linea',[snapshot,row.origen_drive,row.fila]),inventario_id:uuidEstable('inventario',row.origen_drive),
      cliente_id:uuidEstable('cliente',cliente),cliente,sku,origen_drive:row.origen_drive,fila_consolidado:row.fila,
      contenido_sha256:sha(canon(row)),conteo_1:cantidad[0],conteo_2:cantidad[1],conteo_final:cantidad[2],...details}};
}
