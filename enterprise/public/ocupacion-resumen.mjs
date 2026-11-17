export const claveOcupacion=p=>JSON.stringify([p.almacen||'',p.bodega||'',p.posicion]);
/** Una posición física puede tener varios clientes. Bloqueo y ocupación son dimensiones independientes. */
export function resumirOcupacion(filas){
 const unicas=new Map();for(const p of filas){const k=claveOcupacion(p),prev=unicas.get(k),ocupada=p.ocupada===true||p.estado==='OCUPADA',disponible=p.disponible===true||p.estado==='DISPONIBLE'||p.estado==='LIBRE';unicas.set(k,{ocupada:ocupada||prev?.ocupada||false,disponible:disponible||prev?.disponible||false,bloqueada:p.bloqueada===true||p.estado==='BLOQUEADA'||prev?.bloqueada||false});}
 const ps=[...unicas.values()],ocupadas=ps.filter(p=>p.ocupada).length,disponibles=ps.filter(p=>!p.ocupada&&p.disponible).length;
 return {total:ps.length,ocupadas,disponibles,bloqueadas:ps.filter(p=>p.bloqueada).length,sinDato:ps.length-ocupadas-disponibles,porcentaje:ps.length?Math.round(1000*ocupadas/ps.length)/10:null};
}
export function estadoOcupacion(p,filas,sql){
 const r=filas.get(claveOcupacion(p));return r||(sql?{...p,estado:'SIN_DATO',ocupada:false,bloqueada:false}:p);
}
export function ocupacionCatalogo(p){
 const original=p.origen?.datos||{},estados=p.estadosOrigen||[original.STATUS_OCUPACION||p.estado],ocupada=estados.includes('OCUPADA'),bloqueada=original.POS_LOCKEADA==='1'||p.estado==='BLOQUEADA';
 const disponible=estados.some(s=>['LIBRE','DISPONIBLE'].includes(s));return {...p,ocupada,disponible,bloqueada,estado:bloqueada?'BLOQUEADA':ocupada?'OCUPADA':estados.some(s=>['LIBRE','DISPONIBLE'].includes(s))?'DISPONIBLE':'SIN_DATO'};
}
export function pintarResumenOcupacion(box,resumen,{titulo='Ocupación',fuente='',fecha=''}={}){
 box.replaceChildren();const h=document.createElement('h3');h.textContent=titulo;box.append(h);if(!resumen){const p=document.createElement('p');p.textContent='No hay un corte de ocupación disponible.';box.append(p);return;}
 const grid=document.createElement('div');grid.className='ocupacion-kpis';for(const [clave,label]of [['total','Total posiciones'],['ocupadas','Ocupadas'],['disponibles','Disponibles'],['bloqueadas','Bloqueadas'],['sinDato','Sin dato'],['porcentaje','Ocupación confirmada']]){const card=document.createElement('div'),v=document.createElement('strong'),l=document.createElement('span');card.dataset.ocupacion=clave;v.textContent=clave==='porcentaje'?(resumen[clave]===null?'—':resumen[clave]+'%'):String(resumen[clave]??0);l.textContent=label;card.append(l,v);grid.append(card);}box.append(grid);const nota=document.createElement('p');nota.className='nota';nota.textContent=fuente+(fecha?' · corte '+new Date(fecha).toLocaleString('es-EC',{timeZone:'America/Guayaquil'}):'')+'. El bloqueo se muestra por separado y puede coincidir con ocupada o disponible. Sin dato no significa disponible.';box.append(nota);
}
