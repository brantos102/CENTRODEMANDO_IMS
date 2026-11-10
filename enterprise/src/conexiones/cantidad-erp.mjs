import {ErrorConteo} from '../dominio/conteo.mjs';
import {textoDecimal} from '../dominio/analisis-wms.mjs';
const fallo=codigo=>{throw new ErrorConteo(codigo,'Cantidad ERP incompatible; no se redondeó ni convirtió a cero.');};
/** Léxico numérico ERP exacto: notación científica y ceros de escala incluidos.
 * No admite separadores de miles ni elimina decimales significativos. */
export function cantidadERP(v){
 if(typeof v==='number'){if(!Number.isSafeInteger(v))fallo('CANTIDAD_ERP_NO_EXACTA');v=String(v);}
 if(typeof v!=='string')fallo('CANTIDAD_ERP_INVALIDA');
 v=v.trim();if(v.length>256)fallo('CANTIDAD_ERP_FUERA_PRECISION');
 const m=/^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/.exec(v);
 if(!m)fallo('CANTIDAD_ERP_INVALIDA');
 const [entero,fraccion='']=m[2].split('.');let coef=(entero+fraccion).replace(/^0+/,'');
 if(!coef)return '0.000000000';
 if(m[1]==='-')fallo('CANTIDAD_ERP_NEGATIVA');
 const exp=Number(m[3]||0);if(!Number.isSafeInteger(exp))fallo('CANTIDAD_ERP_FUERA_PRECISION');
 let potencia=exp-fraccion.length+9;
 if(potencia<0){
  const quitar=-potencia;
  if(quitar>coef.length||!coef.endsWith('0'.repeat(Math.min(quitar,coef.length))))fallo('CANTIDAD_ERP_FUERA_PRECISION');
  coef=coef.slice(0,-quitar);potencia=0;
 }
 if(coef.length+potencia>30)fallo('CANTIDAD_ERP_FUERA_PRECISION');
 return textoDecimal(BigInt(coef)*10n**BigInt(potencia));
}
