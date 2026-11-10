import {texto,exigirOperacion as exigir,campos} from './operacion.mjs';
import {cantidadExacta} from './conteo.mjs';
export function serieCanonica(v){const s=texto(v,255,false).toUpperCase();exigir([...s].length<=255&&!['0','N/A'].includes(s));return s;}
// Regla de advertencia del WMS V124. No fusiona ni corrige una serie.
export function seriesParecidas(a,b){
 if(!a||!b||a===b||a.length<6||b.length<6)return false;
 const [c,l]=a.length<b.length?[a,b]:[b,a];
 if(l.length-c.length<=2&&l.startsWith(c))return true;
 if(a.length===b.length){let n=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i]&&++n>1)return false;return n===1;}
 return false;
}
export function datosHallazgo(s,{serie=null}={}){
 campos(s,['sku','descripcion','posicion','lote','cantidad','observacion','justificacion']);
 const r={sku:texto(s.sku,255,false),descripcion:texto(s.descripcion??'',4000),posicion:texto(s.posicion??'',255),
 lote:texto(s.lote??'',255),cantidad:cantidadExacta(s.cantidad),observacion:texto(s.observacion??'',4000),justificacion:texto(s.justificacion??'',8000)};
 exigir(!serie||r.cantidad===cantidadExacta('1'),'SOLICITUD_INVALIDA','Una serie física corresponde a una unidad.');
 return r;
}
