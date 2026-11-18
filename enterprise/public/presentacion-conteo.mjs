const canon=v=>String(v).replace(/^0+(?=\d)/,'').replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
const tiene=v=>v!==null&&v!==undefined&&v!=='';
export function estadoLinea(r){
 const [a,b,c]=[r.conteo_1,r.conteo_2,r.conteo_final];
 if(!tiene(a)&&(tiene(b)||tiene(c))||!tiene(b)&&tiene(c))return {codigo:'REVISAR',texto:'Revisar historial',clase:'revisar'};
 if(!tiene(a))return {codigo:'PENDIENTE',texto:'Falta contar',clase:'pendiente'};
 if(tiene(b)&&!tiene(c)&&canon(a)!==canon(b))return {codigo:'RECUENTO',texto:'Recuento pendiente',clase:'revisar'};
 if(['CORRECTO','FALTANTE','SOBRANTE'].includes(r.resultado))return {codigo:r.resultado,texto:({CORRECTO:'Correcto',FALTANTE:'Faltante',SOBRANTE:'Sobrante'})[r.resultado],clase:r.resultado.toLowerCase()};
 return {codigo:'REGISTRADO',texto:tiene(c)?'Conteos completos':'Conteo registrado',clase:'registrado'};
}
export function etiquetaEstado(r){const e=estadoLinea(r),span=document.createElement('span');span.className='estado-conteo estado-'+e.clase;span.dataset.estado=e.codigo;span.textContent=e.texto;return span;}
export function resumenConteo(box,t,{ciego=true}={}){
 box.replaceChildren();if(!t)return;const cols=[['lineas','Líneas'],['contadas','Con C1'],['pendientes','Falta contar'],['recuentos','Recuento pendiente'],...(!ciego?[['correctas','Correctas'],['diferencias','Con diferencia']]:[])];
 for(const [k,label]of cols){const d=document.createElement('div'),l=document.createElement('span'),v=document.createElement('strong');l.textContent=label;v.textContent=String(t[k]??0);d.dataset.resumenConteo=k;d.append(l,v);box.append(d);}
 const barra=document.createElement('progress');barra.max=Math.max(1,t.lineas||0);barra.value=t.contadas||0;barra.setAttribute('aria-label','Líneas con primer conteo confirmado');box.append(barra);
}
