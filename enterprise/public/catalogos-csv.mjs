import {leerTablaCsv} from './stock-csv.mjs';
export function leerCatalogo(text,tipo){
 const filas=leerTablaCsv(text),head=filas.shift().map(x=>x.trim().toLowerCase());
 const permitidas=tipo==='EAN'?['cliente','sku','ean']:tipo==='WTW'?['posicion','zona','descripcion','x','y','z','ancho','fondo','alto']:[];
 const obligatorias=tipo==='EAN'?['cliente','sku','ean']:['posicion'];
 if(!permitidas.length||head.some(h=>!permitidas.includes(h))||new Set(head).size!==head.length||!obligatorias.every(h=>head.includes(h)))throw Error('Cabeceras inválidas. Descarga la plantilla del catálogo.');
 if(filas.length>50000)throw Error('El catálogo admite hasta 50.000 filas.');
 return filas.map((r,i)=>{if(r.length!==head.length)throw Error('Ancho distinto en fila '+(i+2));return Object.fromEntries(head.map((h,j)=>[h,r[j]]));});
}
