import {prepararCsv,sumaStock} from './stock-csv.mjs';
const $=id=>document.getElementById(id),state={sesion:null,contexto:null,inv:null,cursor:null,ocupado:false,epoch:0};
function outbox(){return 'ims_operacion_pendiente_v1_'+state.sesion.usuario.actorId;}
function aviso(s,error=false){$('op-aviso').textContent=s;$('op-aviso').className=error?'error':'nota';}
async function api(url,body){
 const response=await fetch(url,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000),
  headers:body?{'Content-Type':'application/json','X-IMS-CSRF':state.sesion.csrf}:{},body:body?JSON.stringify(body):undefined});
 let data;try{data=await response.json();}catch{throw Error('Respuesta incompleta. Recupera la confirmación antes de repetir.');}
 if(!response.ok)throw Object.assign(Error(data.mensaje||'No se completó la solicitud.'),{status:response.status});return data;
}
function pendiente(){const text=sessionStorage.getItem(outbox());if(!text)return null;const p=JSON.parse(text);return p.actor===state.sesion.usuario.actorId?p:null;}
function controles(){const existe=!!pendiente();$('op-pendiente').hidden=!existe;for(const b of document.querySelectorAll('form button, #op-depot-guardar'))b.disabled=state.ocupado||existe;}
async function ejecutar(p){
 const result=await api('/api/operacion/'+p.tipo,p.body);
 if(result.ok!==true||result.operacionId!==p.body.operacionId||(p.body.inventarioId&&result.inventarioId!==p.body.inventarioId))throw Error('La respuesta no confirma esta operación.');
 sessionStorage.removeItem(outbox());return result;
}
async function mutar(tipo,body){
 if(pendiente())throw Error('Recupera primero la operación por confirmar.');
 const p={actor:state.sesion.usuario.actorId,tipo,body:{operacionId:crypto.randomUUID(),...body}};
 if(new TextEncoder().encode(JSON.stringify(p.body)).length>15000)throw Error('La solicitud tiene demasiado texto. Reduce la descripción o justificación antes de enviarla.');
 // La contraseña de una cuenta nueva no se escribe en el almacenamiento del navegador.
 const resguardo=tipo==='usuario'?{...p,body:{...p.body,contrasena:undefined},requiereClave:true}:p;
 sessionStorage.setItem(outbox(),JSON.stringify(resguardo));
 try{return await ejecutar(p);}catch(e){if(e.status===400||e.status===409)sessionStorage.removeItem(outbox());throw e;}finally{controles();}
}
async function contexto(seleccion=$('op-inventario').value){
 const data=await api('/api/operacion');if(!Array.isArray(data.ambitos)||!Array.isArray(data.inventarios)||!Array.isArray(data.clientes))throw Error('Contexto incompleto.');
 state.contexto=data;
 $('op-inventario').replaceChildren(new Option('Selecciona un inventario',''),...data.inventarios.map(i=>new Option(i.sede+' · '+i.codigo_operativo+' · '+(i.borrador?'BORRADOR':i.estado),i.id)));
 $('op-inventario').value=seleccion;
 $('op-creacion').hidden=!data.ambitos.length;$('op-cuentas').hidden=!data.ambitos.some(r=>r.rol==='ADMIN');
 $('op-sede').replaceChildren(...data.ambitos.map(r=>new Option(r.sede,r.sede)));
 $('op-sede-cuenta').replaceChildren(...data.ambitos.filter(r=>r.rol==='ADMIN').map(r=>new Option(r.sede,r.sede)));
 $('op-clientes').replaceChildren(...data.clientes.map(r=>new Option(r.nombre,r.id)));
 if(seleccion)await detalle(false);else{state.inv=null;$('op-supervision').hidden=true;}
}
function celda(tr,text){const td=document.createElement('td');td.textContent=text;tr.append(td);}
async function detalle(mas=false){
 const id=$('op-inventario').value;if(!id)return;const ep=++state.epoch;
 const r=await api('/api/operacion/inventarios/'+id+(mas&&state.cursor?'?cursor='+state.cursor:''));
 if(ep!==state.epoch||$('op-inventario').value!==id)return;
 if(!r.inventario||!Array.isArray(r.lineas))throw Error('Detalle incompleto.');
 state.inv=r.inventario;state.cursor=r.siguiente;
 const n=state.inv,supervisor=n.perfiles.length&&n.perfiles.every(p=>p.rol==='SUPERVISOR');
 $('op-supervision').hidden=!supervisor;$('op-cargar').hidden=!n.borrador;$('op-activar').hidden=!n.borrador;
 $('op-depot').checked=n.mostrarDepot;
 $('op-detalle').textContent=n.codigo+' · '+n.estado+' · versión '+n.version+(n.borrador?' · Stock por activar':'');
 const clientes=n.perfiles.map(p=>{const c=state.contexto.clientes.find(c=>c.id===p.cliente_id);return new Option(c?.nombre||p.cliente_id,p.cliente_id);});
 $('op-cliente-csv').replaceChildren(...clientes.map(o=>o.cloneNode(true)));$('op-cli-permiso').replaceChildren(...clientes);
 if(!mas){$('op-lineas').replaceChildren();$('op-kpis').replaceChildren();}
 for(const l of r.lineas){const tr=document.createElement('tr');
  celda(tr,l.numero+' · '+l.sku+'\n'+l.id);celda(tr,l.cliente+' · '+(l.posicion||'—'));
  celda(tr,[l.conteo_1,l.conteo_2,l.conteo_final].map(v=>v??'—').join(' / '));
  celda(tr,Object.hasOwn(l,'depot')?[l.depot,l.fisico,l.desfase].map(v=>v??'—').join(' / '):'Conteo ciego');celda(tr,l.version);$('op-lineas').append(tr);
 }
 $('op-mas').hidden=!state.cursor;
}
async function tarea(fn){if(state.ocupado)return;state.ocupado=true;controles();try{await fn();aviso('Operación confirmada.');}catch(e){aviso(e.message,true);}finally{state.ocupado=false;controles();}}
function formulario(id,fn){$(id).addEventListener('submit',e=>{e.preventDefault();tarea(fn);});}
function solicitud(){if(!state.inv)throw Error('Selecciona un inventario.');return {inventarioId:state.inv.id,versionEsperada:state.inv.version};}
formulario('op-crear',async()=>{
 const r=await mutar('crear',{sede:$('op-sede').value,codigo:$('op-codigo').value,clientes:[...$('op-clientes').selectedOptions].map(o=>o.value),fechaInicio:$('op-fecha').value,
 fechaProgramada:$('op-programada').value,responsable:$('op-responsable').value});await contexto(r.inventarioId);
});
formulario('op-cargar',async()=>{
 if(!state.inv?.borrador)throw Error('Selecciona un borrador.');const f=$('op-csv').files[0];if(!f||f.size>24*1024*1024)throw Error('Selecciona un CSV de hasta 24 MB.');
 const rows=prepararCsv(await f.text(),{clienteId:$('op-cliente-csv').value,formato:$('op-formato').value});
 // Comprobar todos los clientes y series antes del primer envío.
 for(const r of rows){if(!state.inv.perfiles.some(p=>p.cliente_id===r.clienteId)||!r.sku|| (r.serie&&!['0','N/A'].includes(r.serie.toUpperCase())&&r.depot!=='1.000000000'))throw Error('Cliente, producto o cantidad de serie inválidos.');}
 const lotes=[];let lote=[];
 for(const row of rows){
  const candidato=[...lote,row];
  const bytes=new TextEncoder().encode(JSON.stringify({...solicitud(),filas:candidato})).length;
  if(candidato.length>10||bytes>14500){if(!lote.length)throw Error('Una línea excede el tamaño permitido. Reduce su descripción.');lotes.push(lote);lote=[];}
  lote.push(row);
  if(new TextEncoder().encode(JSON.stringify({...solicitud(),filas:lote})).length>14500)throw Error('Una línea excede el tamaño permitido. Reduce su descripción.');
 }
 if(lote.length)lotes.push(lote);
 let confirmadas=0;
 for(const filas of lotes){
  const r=await mutar('lineas',{...solicitud(),filas});state.inv.version=r.version;confirmadas+=filas.length;aviso('Stock confirmado: '+confirmadas+' / '+rows.length+' filas.');
 }
 $('op-total-filas').value=rows.length;$('op-total-depot').value=sumaStock(rows);await detalle();
});
formulario('op-activar',async()=>{await mutar('activar',{...solicitud(),filasEsperadas:Number($('op-total-filas').value),depotEsperado:$('op-total-depot').value});await contexto();});
formulario('op-asignar',async()=>{await mutar('asignar',{...solicitud(),actorId:$('op-actor').value,clienteId:$('op-cli-permiso').value,rol:$('op-rol').value});await detalle();});
formulario('op-estado',async()=>{const b={...solicitud(),estado:$('op-destino').value};if(b.estado==='ENTREGADO'){b.fechaEntrega=$('op-entrega').value;b.confirmarIncompleto=$('op-incompleto').checked;}await mutar('estado',b);await contexto();});
formulario('op-ajustar',async()=>{await mutar('ajustar',{...solicitud(),lineaId:$('op-linea-ajuste').value,versionLinea:$('op-version-ajuste').value,ajuste:$('op-cantidad-ajuste').value,motivo:$('op-motivo').value,justificacion:$('op-justificacion').value});await detalle();});
formulario('op-usuario-crear',async()=>{
 const body={sede:$('op-sede-cuenta').value,correo:$('op-correo-nuevo').value,nombre:$('op-nombre-nuevo').value,contrasena:$('op-clave-nueva').value};$('op-clave-nueva').value='';
 const r=await mutar('usuario',body);$('op-cuenta-resultado').textContent=r.correo+' · ID: '+r.actorId+' · Sin permisos hasta asignar.';
});
$('op-depot-guardar').addEventListener('click',()=>tarea(async()=>{await mutar('depot',{...solicitud(),visible:$('op-depot').checked});await detalle();}));
$('op-analisis').addEventListener('click',()=>tarea(async()=>{const id=state.inv?.id;if(!id)throw Error('Selecciona un inventario.');const r=await api('/api/operacion/inventarios/'+id+'/analisis');
 if(state.inv?.id!==id)return;if(r.referencia!=='ITSANET_IMS_WMS_V124'||!r.kpis||!r.avance)throw Error('Análisis incompleto.');
 $('op-kpis').textContent='Exactitud WMS: unidades '+r.kpis.efectividadUnidades+'% · referencias '+r.kpis.efectividadRef+'% · posiciones '+r.kpis.efectividadPos+'% · avance '+r.avance.contadas+'/'+r.avance.lineas+' líneas ('+r.avance.porcentaje+'%).';
}));
$('op-actualizar').addEventListener('click',()=>tarea(()=>contexto()));$('op-inventario').addEventListener('change',()=>tarea(()=>detalle()));$('op-mas').addEventListener('click',()=>tarea(()=>detalle(true)));
$('op-reintentar').addEventListener('click',()=>tarea(async()=>{const p=pendiente();if(!p)return;if(p.requiereClave){p.body.contrasena=$('op-clave-nueva').value;$('op-clave-nueva').value='';if(!p.body.contrasena)throw Error('Escribe otra vez la misma contraseña nueva para recuperar la cuenta.');}const r=await ejecutar(p);await contexto(r.inventarioId||$('op-inventario').value);}));
try{
 state.sesion=await api('/api/sesion');$('op-usuario').textContent=state.sesion.usuario.nombre+' · '+state.sesion.usuario.correo;
 if(state.sesion.operacionNativa!==true)throw Error('La operación nativa aún no está habilitada. El piloto de consulta sigue disponible.');
 $('op-fecha').value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guayaquil',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 await contexto();$('op-contenido').hidden=false;controles();aviso('Sesión verificada. Selecciona o crea un inventario de ensayo.');
}catch(e){aviso(e.status===401?'Inicia sesión desde Inventarios y capturas, luego vuelve a Operación.':e.message,true);}
