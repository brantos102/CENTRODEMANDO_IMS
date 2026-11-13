export const $=id=>document.getElementById(id);
export const estado={sesion:null,contexto:null};
export function nodo(tag,txt,cls){const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e;}
export function aviso(txt,error=false){const e=$('aviso');e.textContent=txt;e.className=error?'aviso error':'aviso';}
export async function api(path,body){
 const r=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(120000),headers:body?{'Content-Type':'application/json','X-IMS-CSRF':estado.sesion?.csrf??''}:{},body:body?JSON.stringify(body):undefined});
 const d=await r.json();if(!r.ok)throw Object.assign(Error(d.mensaje||'No se completó la solicitud.'),{status:r.status,codigo:d.error});return d;
}
export function fallo(e){aviso(e.message,true);if(e.status===401)$('login')?.removeAttribute('hidden');if(e.codigo==='CAMBIAR_CLAVE')window.location.href='/centro#perfil';}
export function boton(t,fn,cls=''){const b=nodo('button',t,cls);b.type='button';b.addEventListener('click',()=>Promise.resolve().then(fn).catch(fallo));return b;}
export function enlace(t,url,cls=''){const a=nodo('a',t,cls);a.href=url;return a;}
export function opciones(select,items,vacio){select.replaceChildren(...(vacio?[new Option(vacio,'')]:[]),...items.map(x=>new Option(x.nombre??x.label??x,x.id??x.value??x)));}
let dbPromesa;
function basePendientes(){return dbPromesa??=new Promise((resolve,reject)=>{const r=indexedDB.open('ims_centro_mando',1);r.onupgradeneeded=()=>r.result.createObjectStore('pendientes',{keyPath:'actor'});r.onsuccess=()=>resolve(r.result);r.onerror=r.onblocked=()=>reject(Error('No se pudo abrir el resguardo de guardados. La consulta sigue disponible.'));});}
async function pendiente(){const db=await basePendientes();return new Promise((resolve,reject)=>{const t=db.transaction('pendientes','readonly'),r=t.objectStore('pendientes').get(estado.sesion.usuario.actorId);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('No se pudo consultar el guardado pendiente.'));});}
async function conservar(p){const db=await basePendientes();return new Promise((resolve,reject)=>{const t=db.transaction('pendientes','readwrite'),store=t.objectStore('pendientes'),r=store.get(p.actor);let motivo='No se pudo resguardar el guardado. No se envió la solicitud.';r.onsuccess=()=>{if(r.result){motivo='Hay un guardado sin confirmar. Usa Recuperar guardado antes de continuar.';t.abort();}else store.add(p);};t.oncomplete=resolve;t.onabort=t.onerror=()=>reject(Error(motivo));});}
async function olvidar(p){const db=await basePendientes();return new Promise((resolve,reject)=>{const t=db.transaction('pendientes','readwrite'),st=t.objectStore('pendientes'),r=st.get(p.actor);r.onsuccess=()=>{if(r.result?.body.operacionId===p.body.operacionId)st.delete(p.actor);};t.oncomplete=resolve;t.onabort=t.onerror=()=>reject(Error('El servidor respondió. Recupera la confirmación para retirar el guardado local.'));});}
export async function mutar(path,body){
 const p={actor:estado.sesion.usuario.actorId,path,body:{...body,operacionId:crypto.randomUUID()}},resguardo={...p,body:{...p.body}};
 if(Object.hasOwn(body,'contrasena')){delete resguardo.body.contrasena;delete resguardo.body.actual;resguardo.requiereClave=true;}
 await conservar(resguardo);$('recuperar')?.removeAttribute('hidden');return confirmar(p);
}
async function confirmar(p){
 if(p.requiereClave){const cambio=p.path.endsWith('/clave'),clave=$(cambio?'clave-nueva':'nuevo-password')?.value;if(!clave)throw Error('Escribe nuevamente la contraseña en su formulario y luego recupera el guardado.');p={...p,body:{...p.body,contrasena:clave,...(cambio?{actual:$('clave-actual').value}:{})}};}
 try{const r=await api(p.path,p.body);await olvidar(p);$('recuperar')?.setAttribute('hidden','');return r;}
 catch(e){if(e.status>=400&&e.status<500){await olvidar(p);$('recuperar')?.setAttribute('hidden','');}throw e;}
}
export async function prepararRecuperacion(){const b=$('recuperar');if(!b)return;try{b.hidden=!await pendiente();}catch(e){aviso(e.message,true);}b.onclick=async()=>{try{const p=await pendiente();if(!p)return;const r=await confirmar(p);aviso('Guardado confirmado.');if(r.inventarioId)window.location.href='/operacion?inventario='+r.inventarioId;else window.location.reload();}catch(e){fallo(e);}};}
export async function sesion(){
 estado.sesion=await api('/api/sesion');if(!estado.sesion.centroDisponible)throw Error('Esta versión todavía no tiene el Centro de Mando activado.');
 $('login')?.setAttribute('hidden','');$('usuario').textContent=estado.sesion.usuario.nombre||estado.sesion.usuario.correo;await prepararRecuperacion();return estado.sesion;
}
export function instalarLogin(iniciar){
 $('login-form')?.addEventListener('submit',async e=>{e.preventDefault();try{const r=await api('/api/sesion',{correo:$('correo').value,contrasena:$('contrasena').value});$('contrasena').value='';estado.sesion=r;await iniciar();}catch(err){fallo(err);}});
 $('salir')?.addEventListener('click',async()=>{try{await api('/api/sesion/cerrar',{});window.location.href='/centro';}catch(e){fallo(e);}});
}
export function tabla(contenedor,cabeceras,rows){const table=nodo('table'),h=nodo('tr');for(const x of cabeceras)h.append(nodo('th',x));const thead=nodo('thead');thead.append(h);const b=nodo('tbody');for(const r of rows){const tr=nodo('tr');for(const c of r){const td=nodo('td');td.append(c instanceof Node?c:document.createTextNode(String(c??'')));tr.append(td);}b.append(tr);}table.append(thead,b);contenedor.replaceChildren(table);}
