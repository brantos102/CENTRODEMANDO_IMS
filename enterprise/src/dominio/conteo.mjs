import {createHash} from 'node:crypto';

export class ErrorConteo extends Error {
  constructor(codigo,mensaje,options){super(mensaje,options);this.name='ErrorConteo';this.codigo=codigo;}
}
function exigir(ok,codigo,mensaje){if(!ok)throw new ErrorConteo(codigo,mensaje);}
function uuid(value){
  exigir(typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value),
    'SOLICITUD_INVALIDA','Se requiere un identificador UUID.');
  return value.toLowerCase();
}
export function cantidadExacta(value){
  if(typeof value==='number'){
    exigir(Number.isSafeInteger(value)&&value>=0,'CANTIDAD_INVALIDA','Envía decimales como texto exacto.');
    value=String(value);
  }
  exigir(typeof value==='string'&&/^\d{1,30}(?:\.\d{1,9})?$/.test(value),
    'CANTIDAD_INVALIDA','Cantidad no negativa, con hasta nueve decimales.');
  let [entero,decimal='']=value.split('.');entero=entero.replace(/^0+(?=\d)/,'');
  exigir(entero.length<=21,'CANTIDAD_INVALIDA','Cantidad fuera de precisión DECIMAL(30,9).');
  return entero+'.'+decimal.padEnd(9,'0');
}
function textoOpcional(obj,key,maxBytes){
  if(!Object.hasOwn(obj,key))return {cambiar:false,valor:null};
  const v=obj[key];
  exigir(typeof v==='string'&&Buffer.byteLength(v,'utf8')<=maxBytes,'SOLICITUD_INVALIDA','Texto inválido o demasiado largo.');
  if(key==='nuevaPosicion')exigir([...v].length<=255,'SOLICITUD_INVALIDA','Posición demasiado larga.');
  return {cambiar:true,valor:v};
}
export function normalizarSolicitud(actorId,input){
  exigir(input&&typeof input==='object'&&!Array.isArray(input),'SOLICITUD_INVALIDA','Falta la solicitud.');
  const allowed=new Set(['operacionId','inventarioId','lineaId','etapa','versionEsperada','cantidad','observacion','nuevaPosicion']);
  exigir(Object.keys(input).every(k=>allowed.has(k)),'SOLICITUD_INVALIDA','La solicitud contiene campos no permitidos.');
  const v=input.versionEsperada;
  exigir((typeof v==='string'&&/^(0|[1-9]\d{0,19})$/.test(v))||
    (typeof v==='number'&&Number.isSafeInteger(v)&&v>=0),'SOLICITUD_INVALIDA','Versión de línea inválida.');
  exigir(BigInt(v)<18446744073709551615n,'SOLICITUD_INVALIDA','Versión fuera de rango.');
  exigir(Number.isInteger(input.etapa)&&input.etapa>=1&&input.etapa<=3,'SOLICITUD_INVALIDA','Etapa inválida.');
  const payload={
    actorId:uuid(actorId),operacionId:uuid(input.operacionId),
    inventarioId:uuid(input.inventarioId),lineaId:uuid(input.lineaId),
    etapa:input.etapa,versionEsperada:String(v),cantidad:cantidadExacta(input.cantidad),
    observacion:textoOpcional(input,'observacion',32768),nuevaPosicion:textoOpcional(input,'nuevaPosicion',1020)
  };
  return {payload,hash:createHash('sha256').update(JSON.stringify(payload)).digest('hex')};
}

/** No elige automáticamente otra etapa: un reintento conserva operación y etapa. */
export function prepararCambio(linea,payload){
  exigir(String(linea.version)===payload.versionEsperada,'VERSION_DESACTUALIZADA','La línea cambió; actualiza antes de contar.');
  const fields=['conteo_1','conteo_2','conteo_final'];
  const target=fields[payload.etapa-1];
  exigir(linea[target]===null,'ETAPA_COMPLETA','Esta etapa ya tiene un conteo.');
  exigir(fields.slice(0,payload.etapa-1).every(k=>linea[k]!==null),'ETAPA_INVALIDA','Falta completar la etapa anterior.');
  const antes={version:String(linea.version),conteo_1:linea.conteo_1,conteo_2:linea.conteo_2,
    conteo_final:linea.conteo_final,observacion:linea.observacion,nueva_posicion:linea.nueva_posicion};
  const despues={...antes,[target]:payload.cantidad,version:(BigInt(linea.version)+1n).toString()};
  if(payload.observacion.cambiar)despues.observacion=payload.observacion.valor;
  if(payload.nuevaPosicion.cambiar)despues.nueva_posicion=payload.nuevaPosicion.valor;
  return {antes,despues,target};
}
