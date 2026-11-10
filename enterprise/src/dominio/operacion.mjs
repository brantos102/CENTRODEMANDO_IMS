import {ErrorConteo,cantidadExacta} from './conteo.mjs';
export function exigirOperacion(ok,codigo='SOLICITUD_INVALIDA',mensaje='Solicitud inválida.'){
 if(!ok)throw new ErrorConteo(codigo,mensaje);
}
export function uuid(v){exigirOperacion(typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v));return v;}
export function texto(v,max=255,vacio=true){
 exigirOperacion(typeof v==='string'&&[...v].length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v)&& (vacio||v.trim().length>0));return v.trim();
}
export function fecha(v){
 exigirOperacion(typeof v==='string'&&/^20\d\d-\d\d-\d\d$/.test(v));
 const d=new Date(v+'T12:00:00Z');exigirOperacion(!isNaN(d)&&d.toISOString().slice(0,10)===v);return v;
}
export function version(v){exigirOperacion(typeof v==='string'&&/^(0|[1-9]\d{0,18})$/.test(v));return v;}
export function campos(obj,permitidos){
 exigirOperacion(obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.keys(obj).every(k=>permitidos.includes(k)));
}
export function filaStock(f){
 campos(f,['numero','clienteId','sku','descripcion','posicion','serie','lote','unidad','depot','abc','despacho','partida','categoria','estadoMercancia']);
 exigirOperacion(Number.isInteger(f.numero)&&f.numero>=1&&f.numero<=100000);
 const row={numero:f.numero,clienteId:uuid(f.clienteId),sku:texto(f.sku,255,false),depot:cantidadExacta(f.depot)};
 for(const k of ['descripcion','posicion','serie','lote','unidad','abc','despacho','partida','categoria','estadoMercancia'])row[k]=texto(f[k]??'',k==='descripcion'?4000:k==='unidad'||k==='abc'?50:255);
 // La plantilla trata 0/N/A como ausencia de serie. No convierte códigos/SKU a número.
 if(['0','N/A'].includes(row.serie.toUpperCase()))row.serie='';
 exigirOperacion(!row.serie||row.depot===cantidadExacta('1'),'SOLICITUD_INVALIDA','Una serie física corresponde a una unidad.');
 return row;
}
export function ajusteExacto(v){
 exigirOperacion(typeof v==='string');return v.startsWith('-')?'-'+cantidadExacta(v.slice(1)):cantidadExacta(v);
}
