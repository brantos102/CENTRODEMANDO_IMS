import {createHash} from 'node:crypto';
import {decimal,textoDecimal,fisicoWms} from './analisis-wms.mjs';
import {cantidadExacta,ErrorConteo} from './conteo.mjs';
export const ETAPAS=['conteo_1','conteo_2','conteo_final'];
// El stock y las capturas no forman parte de la identidad comercial.
const ATRIBUTOS=['cliente_id','codigo_cliente_erp','sku','posicion','descripcion','serie','lote','unidad','abc','despacho','partida','categoria','estado_mercancia'];
export const identidadConteo=r=>JSON.stringify(ATRIBUTOS.map(k=>r[k]??''));
const suma=(rs,k)=>textoDecimal(rs.reduce((a,r)=>a+(decimal(r[k])??0n),0n));
export function agruparConteo(filas,{visible=false}={}){
 const mapa=new Map();
 for(const r of filas){const k=identidadConteo(r);if(!mapa.has(k))mapa.set(k,[]);mapa.get(k).push(r);}
 return [...mapa.values()].map(miembros=>{
  miembros.sort((a,b)=>a.id.localeCompare(b.id));const primero=miembros[0],r={...primero};
  r.version=miembros.reduce((a,m)=>a+BigInt(m.version),0n).toString();
  r.agrupada=miembros.length>1;r.filasOrigen=miembros.length;
  r.firmaGrupo=createHash('sha256').update(JSON.stringify([identidadConteo(r),miembros.map(m=>[m.id,String(m.version)])])).digest('hex');
  r.puede_contar=miembros.every(m=>!!m.puede_contar);
  for(const k of ETAPAS){r[k]=miembros.every(m=>m[k]!==null)?suma(miembros,k):null;r['registrado_'+k]=suma(miembros,k);r['capturadas_'+k]=miembros.filter(m=>m[k]!==null).length;}
  r.observacion=miembros.every(m=>m.observacion===primero.observacion)?primero.observacion:'';
  r.nueva_posicion=miembros.every(m=>m.nueva_posicion===primero.nueva_posicion)?primero.nueva_posicion:'';
  r.notasDistintas=miembros.some(m=>m.observacion!==primero.observacion||m.nueva_posicion!==primero.nueva_posicion);
  if(visible){r.depot=suma(miembros,'depot');r.ajuste=suma(miembros,'ajuste');const fisicos=miembros.map(fisicoWms);const fisico=fisicos.every(f=>f!==null)?textoDecimal(fisicos.reduce((a,f)=>a+f,0n)):null;r.fisico=fisico;r.desfase=fisico===null?null:textoDecimal(decimal(fisico)-decimal(r.depot));r.resultado=r.desfase===null?'PENDIENTE':decimal(r.desfase)===0n?'CORRECTO':decimal(r.desfase)>0n?'SOBRANTE':'FALTANTE';}
  else for(const k of ['depot','ajuste','fisico','desfase','resultado'])delete r[k];
  return {vista:r,miembros};
 }).sort((a,b)=>a.vista.id.localeCompare(b.vista.id));
}
/** Distribuye exclusivamente el total nuevo entre líneas aún sin captura.
 * Las capturas confirmadas se conservan. La asignación queda auditada por línea.
 */
export function distribuirConteo(miembros,etapa,cantidad){
 const k=ETAPAS[etapa-1],total=decimal(cantidadExacta(cantidad)),fijas=miembros.filter(m=>m[k]!==null),pendientes=miembros.filter(m=>m[k]===null);
 if(!pendientes.length)throw new ErrorConteo('ETAPA_COMPLETA','La etapa ya está confirmada.');
 // Una fila ya confirmada puede ir más avanzada que sus equivalentes.
 // Validar su historial, pero exigir secuencia solo a las filas que se escriben.
 if(miembros.some(m=>ETAPAS.some((k,i)=>m[k]===null&&ETAPAS.slice(i+1).some(p=>m[p]!==null)))||pendientes.some(m=>ETAPAS.slice(0,etapa-1).some(p=>m[p]===null)||ETAPAS.slice(etapa).some(p=>m[p]!==null)))throw new ErrorConteo('ETAPA_INVALIDA','Completa o revisa las etapas anteriores antes de contar este grupo.');
 let restante=total-fijas.reduce((a,m)=>a+decimal(m[k]),0n);
 if(restante<0n)throw new ErrorConteo('CANTIDAD_INVALIDA','El total es menor que las capturas ya confirmadas. Solicita revisión al líder; se conservan esas capturas.');
 return pendientes.map((m,i)=>{const esperado=decimal(m.depot)??0n,n=i===pendientes.length-1?restante:(restante<esperado?restante:esperado);restante-=n;return {linea:m,cantidad:textoDecimal(n)};});
}
