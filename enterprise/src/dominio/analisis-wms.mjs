// Referencia oficial elegida: ITSANET IMS / WMS V124, parseAnalysisData.
// Las cantidades usan enteros escalados; nunca parseFloat ni sumas IEEE754.
import {ErrorConteo} from './conteo.mjs';
const ESCALA=1000000000n;
export function decimal(v){
  if(v===null||v===undefined||v==='')return null;
  if(typeof v==='number'){if(!Number.isSafeInteger(v))throw new ErrorConteo('CANTIDAD_INVALIDA','Cantidad no exacta.');v=String(v);}
  if(typeof v!=='string'||!/^-[0-9]+(?:\.[0-9]{1,9})?$|^[0-9]+(?:\.[0-9]{1,9})?$/.test(v)||v.replace(/^-/, '').split('.')[0].length>30)throw new ErrorConteo('CANTIDAD_INVALIDA','Cantidad inválida.');
  const negativo=v.startsWith('-');const [n,d='']=(negativo?v.slice(1):v).split('.');
  return BigInt(n+d.padEnd(9,'0'))*(negativo?-1n:1n);
}
export function textoDecimal(n){
  if(n===null)return null;
  const signo=n<0n?'-':'';if(n<0n)n=-n;
  return signo+(n/ESCALA)+'.'+String(n%ESCALA).padStart(9,'0');
}
export function fisicoWms(r){
  const a=decimal(r.conteo_1),b=decimal(r.conteo_2),c=decimal(r.conteo_final);
  if(a===null)return null;
  return ((b===null||c===null||a===b)?a:c)+(decimal(r.ajuste)??0n);
}
export function resultadoWms(r){
  const fisico=fisicoWms(r),teorico=decimal(r.depot);
  const dif=fisico===null||teorico===null?null:fisico-teorico;
  return {fisico:textoDecimal(fisico),desfase:textoDecimal(dif),
    resultado:dif===null?'PENDIENTE':dif===0n?'CORRECTO':dif>0n?'SOBRANTE':'FALTANTE'};
}
function porcentaje(ok,total){
  if(total===0n)return '0.0';
  const negativo=ok<0n;let n=(negativo?-ok:ok)*1000n;const d=total<0n?-total:total;
  const x=(n*2n+d)/(d*2n);return (negativo&&x!==0n?'-':'')+(x/10n)+'.'+String(x%10n);
}
export function acumuladorWms(){
  let total=0n,correctas=0n,validadas=0n,lineas=0,contadas=0;
  const refs=new Set(),pos=new Set(),rc=new Set(),pc=new Set(),rok=new Set(),pok=new Set(),re=new Set(),pe=new Set();
  return {
    agregar(r){
      const sku=String(r.sku??'').trim(),p=String(r.posicion??'').trim();
      if(!sku||String(r.categoria??'').trim().toUpperCase()==='DIF_INV')return;
      const q=decimal(r.depot)??0n,f=fisicoWms(r),estado=resultadoWms(r).resultado;
      lineas++;refs.add(sku);pos.add(p);total+=q;
      if(estado==='PENDIENTE')return;
      contadas++;rc.add(sku);pc.add(p);validadas+=q;
      if(estado==='CORRECTO'){correctas+=f;rok.add(sku);pok.add(p);}
      else {re.add(sku);pe.add(p);correctas+=estado==='SOBRANTE'?q:f;}
    },
    terminar(){
      for(const k of re)rok.delete(k);for(const k of pe)pok.delete(k);
      return {referencia:'ITSANET_IMS_WMS_V124',kpis:{
        efectividadUnidades:porcentaje(correctas,total),efectividadRef:porcentaje(BigInt(rok.size),BigInt(rc.size)),
        efectividadPos:porcentaje(BigInt(pok.size),BigInt(pc.size)),uniValidadas:textoDecimal(validadas),uniTotal:textoDecimal(total),
        refValidadas:rc.size,refTotal:refs.size,posValidadas:pc.size,posTotal:pos.size},
        avance:{lineas,contadas,porcentaje:lineas?Number((BigInt(contadas)*200n+BigInt(lineas))/(2n*BigInt(lineas))):0}};
    }
  };
}
export function analisisWms(filas){const a=acumuladorWms();for(const f of filas)a.agregar(f);return a.terminar();}
