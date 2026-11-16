import {leerTablaCsv} from './stock-csv.mjs';
const EAN_DEPOT=['cliente_id','producto_id','tipo_codigo','codigo','cantidad'];
const POS_DEPOT=['posicion_id','posicion_cod','bodega','calle','columna','nivel','profundidad','cod_cliente','status_ocupacion','tipo_pos','almacen','ciudad','pos_lockeada','orden_picking','orden_locator','largo','ancho','alto','volumen','peso','picking','abastecible','bestfit','bestfit_permite_abast','pcj_ocupacion','categoria'];
export function decodificarCatalogo(bytes){
 try{return {texto:new TextDecoder('utf-8',{fatal:true}).decode(bytes),codificacion:'UTF-8'};}
 catch{return {texto:new TextDecoder('windows-1252',{fatal:true}).decode(bytes),codificacion:'Windows-1252'};}
}
export function analizarCatalogo(text,tipo){
 if(!['EAN','WTW'].includes(tipo))throw Error('Tipo de catálogo no válido.');
 const filas=leerTablaCsv(text),head=filas.shift().map(x=>x.trim().toLowerCase());
 const esperado=tipo==='EAN'?EAN_DEPOT:POS_DEPOT,depot=esperado.length===head.length&&esperado.every(h=>head.includes(h));
 if(depot){
  const formato=tipo==='EAN'?'DEPOT_EAN_V1':'DEPOT_POS_V1';
  const datos=filas.map((r,i)=>{
   if(r.length!==head.length)throw Error('Ancho distinto en fila '+(i+2));const original=Object.fromEntries(head.map((h,j)=>[h.toUpperCase(),r[j]])),origen={formato,fila:i+2,datos:original},get=k=>original[k].trim();
   if(tipo==='EAN')return {cliente:get('CLIENTE_ID'),sku:get('PRODUCTO_ID'),ean:get('CODIGO'),tipoCodigo:get('TIPO_CODIGO'),cantidadPresentacion:get('CANTIDAD'),origen};
   const ciudad=get('CIUDAD').toUpperCase(),sede=ciudad==='QUITO'?'UIO':ciudad==='GUAYAQUIL'?'GYE':null;if(!sede)throw Error('Ciudad no reconocida en fila '+(i+2)+'. No se asigna una sede por suposición.');
   return {posicion:get('POSICION_COD'),zona:get('ALMACEN')+' · '+get('BODEGA'),descripcion:get('TIPO_POS'),almacen:get('ALMACEN'),bodega:get('BODEGA'),calle:get('CALLE'),columna:get('COLUMNA'),nivel:get('NIVEL'),profundidad:get('PROFUNDIDAD'),clienteCodigo:get('COD_CLIENTE'),posicionId:get('POSICION_ID'),sede,origen};
  });return {formato,filas:datos};
 }
 const permitidas=tipo==='EAN'?['cliente','sku','ean']:tipo==='WTW'?['posicion','zona','descripcion','x','y','z','ancho','fondo','alto']:[];
 const obligatorias=tipo==='EAN'?['cliente','sku','ean']:['posicion'];
 if(!permitidas.length||head.some(h=>!permitidas.includes(h))||new Set(head).size!==head.length||!obligatorias.every(h=>head.includes(h)))throw Error('Cabeceras inválidas. Descarga la plantilla del catálogo.');
 if(filas.length>50000)throw Error('El catálogo admite hasta 50.000 filas.');
 return {formato:'PLANTILLA_V1',filas:filas.map((r,i)=>{if(r.length!==head.length)throw Error('Ancho distinto en fila '+(i+2));return Object.fromEntries(head.map((h,j)=>[h,r[j]]));})};
}
export const leerCatalogo=(text,tipo)=>analizarCatalogo(text,tipo).filas;
