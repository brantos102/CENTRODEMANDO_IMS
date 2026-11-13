import {iniciarCamara} from './camara.mjs';
import {prepararCsv,sumaStock} from './stock-csv.mjs';
import {formatearCantidad} from './cantidades.mjs';
const $=id=>document.getElementById(id),state={sesion:null,contexto:null,inv:null,cursor:null,ocupado:false,epoch:0};
let consultaSerie=null,cursorHistorial=null,historialScope='';
function outbox(){return 'ims_operacion_pendiente_v1_'+state.sesion.usuario.actorId;}
function aviso(s,error=false){$('op-aviso').textContent=s;$('op-aviso').className=error?'error':'nota';}
async function api(url,body){
 const response=await fetch(url,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000),
  headers:body?{'Content-Type':'application/json','X-IMS-CSRF':state.sesion.csrf}:{},body:body?JSON.stringify(body):undefined});
 let data;try{data=await response.json();}catch{throw Error('Respuesta incompleta. Recupera la confirmación antes de repetir.');}
 if(!response.ok)throw Object.assign(Error(data.mensaje||'No se completó la solicitud.'),{status:response.status});return data;
}
function pendiente(){const text=sessionStorage.getItem(outbox());if(!text)return null;const p=JSON.parse(text);return p.actor===state.sesion.usuario.actorId?p:null;}
function controles(){for(const id of ['op-inventario','op-series-cliente','op-historial-tipo','op-actualizar','op-camara-abrir'])$(id).disabled=state.ocupado;const existe=!!pendiente();$('op-pendiente').hidden=!existe;for(const b of document.querySelectorAll('form button, #op-depot-guardar'))b.disabled=state.ocupado||existe;}
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
 $('op-erp').hidden=!state.sesion.erpDisponible||!data.ambitos.some(r=>['ADMIN','SUPERVISOR'].includes(r.rol));
 $('op-inventario').replaceChildren(new Option('Selecciona un inventario',''),...data.inventarios.map(i=>new Option(i.sede+' · '+i.codigo_operativo+' · '+(i.borrador?'BORRADOR':i.estado),i.id)));
 $('op-inventario').value=seleccion;
 $('op-creacion').hidden=!data.ambitos.length;$('op-cuentas').hidden=!data.ambitos.some(r=>r.rol==='ADMIN');
 $('op-sede').replaceChildren(...data.ambitos.map(r=>new Option(r.sede,r.sede)));
 $('op-sede-cuenta').replaceChildren(...data.ambitos.filter(r=>r.rol==='ADMIN').map(r=>new Option(r.sede,r.sede)));
 $('op-clientes').replaceChildren(...data.clientes.map(r=>new Option(r.nombre,r.id)));
 const pendientes=await api('/api/operacion/pendientes');if(!Array.isArray(pendientes.datos))throw Error('Listado de pendientes incompleto.');
 $('op-legado-pendientes').hidden=!pendientes.datos.length;
 $('op-pendiente-origen').replaceChildren(...pendientes.datos.map(r=>new Option(r.sede+' · '+r.cliente+' · '+r.productos+' productos',r.pendienteId)));
 if(seleccion)await detalle(false);else{state.inv=null;$('op-supervision').hidden=true;$('op-series-panel').hidden=true;}
}
function celda(tr,text){const td=document.createElement('td');td.textContent=text;tr.append(td);}
async function detalle(mas=false){
 const id=$('op-inventario').value;if(!id)return;const ep=++state.epoch;
 const r=await api('/api/operacion/inventarios/'+id+(mas&&state.cursor?'?cursor='+state.cursor:''));
 if(ep!==state.epoch||$('op-inventario').value!==id)return;
 if(!r.inventario||!Array.isArray(r.lineas))throw Error('Detalle incompleto.');
 const origen=state.sesion.erpCreacionDisponible&&r.lineas.length?await api('/api/erp/inventarios/'+id+'/origen?lineas='+r.lineas.map(l=>l.id).join(',')):{datos:[]};
 if(!Array.isArray(origen.datos)||ep!==state.epoch||$('op-inventario').value!==id)return;
 const procedencias=new Map(origen.datos.map(o=>[o.linea_id,o]));
 state.inv=r.inventario;state.cursor=r.siguiente;
 actualizarSeries();
 const n=state.inv,supervisor=n.perfiles.length&&n.perfiles.every(p=>p.rol==='SUPERVISOR');
 $('op-supervision').hidden=!supervisor;$('op-cargar').hidden=!n.borrador;$('op-activar').hidden=!n.borrador;
 $('op-depot').checked=n.mostrarDepot;
 $('op-detalle').textContent=n.codigo+' · '+n.estado+' · versión '+n.version+(n.borrador?' · Stock por activar':'');
 const clientes=n.perfiles.map(p=>{const c=state.contexto.clientes.find(c=>c.id===p.cliente_id);return new Option(c?.nombre||p.cliente_id,p.cliente_id);});
 $('op-cliente-csv').replaceChildren(...clientes.map(o=>o.cloneNode(true)));$('op-cli-permiso').replaceChildren(...clientes);
 if(!mas){$('op-lineas').replaceChildren();$('op-kpis').replaceChildren();}
 for(const l of r.lineas){const tr=document.createElement('tr');
  const erp=procedencias.get(l.id);
  celda(tr,l.numero+' · '+l.sku+'\n'+l.id);celda(tr,l.cliente+' · '+(l.posicion||'—')+(erp?'\nCuenta ERP: '+erp.etiqueta+' · '+erp.codigo_cliente_erp:''));
  celda(tr,[l.conteo_1,l.conteo_2,l.conteo_final].map(formatearCantidad).join(' / '));
  celda(tr,Object.hasOwn(l,'depot')?[l.depot,l.fisico,l.desfase].map(formatearCantidad).join(' / '):'Conteo ciego');celda(tr,l.version);$('op-lineas').append(tr);
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
formulario('op-iniciar-pendiente',async()=>{
 const r=await mutar('iniciar-pendiente',{pendienteId:$('op-pendiente-origen').value,codigo:$('op-pendiente-codigo').value,fechaInicio:$('op-pendiente-fecha').value});await contexto(r.inventarioId);
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
 $('op-kpis').textContent='Exactitud WMS: unidades '+formatearCantidad(r.kpis.efectividadUnidades)+'% · referencias '+formatearCantidad(r.kpis.efectividadRef)+'% · posiciones '+formatearCantidad(r.kpis.efectividadPos)+'% · avance '+r.avance.contadas+'/'+r.avance.lineas+' líneas ('+r.avance.porcentaje+'%).';
}));
$('op-actualizar').addEventListener('click',()=>tarea(()=>contexto()));$('op-inventario').addEventListener('change',()=>tarea(()=>detalle()));$('op-mas').addEventListener('click',()=>tarea(()=>detalle(true)));
$('op-reintentar').addEventListener('click',()=>tarea(async()=>{const p=pendiente();if(!p)return;if(p.requiereClave){p.body.contrasena=$('op-clave-nueva').value;$('op-clave-nueva').value='';if(!p.body.contrasena)throw Error('Escribe otra vez la misma contraseña nueva para recuperar la cuenta.');}const r=await ejecutar(p);await contexto(r.inventarioId||$('op-inventario').value);}));
let cerrarCaptura=null,camaraEpoch=0;
function cerrarCamara(){camaraEpoch++;cerrarCaptura?.();cerrarCaptura=null;$('op-camara').hidden=true;}
$('op-camara-abrir').addEventListener('click',async()=>{
 if(state.ocupado)return;cerrarCamara();const ep=camaraEpoch;$('op-camara').hidden=false;
 try{
  const cerrar=await iniciarCamara($('op-camara-video'),{alLeer:valor=>{if(ep!==camaraEpoch)return;cerrarCamara();$('op-serie').value=valor;limpiarSerie();$('op-serie-consultar').requestSubmit();},alFallar:e=>{if(ep===camaraEpoch){cerrarCamara();aviso(e.message,true);}}});
  if(ep!==camaraEpoch)cerrar();else cerrarCaptura=cerrar;
 }catch(e){if(ep===camaraEpoch){cerrarCamara();aviso(e.message,true);}}
});
$('op-camara-cerrar').addEventListener('click',cerrarCamara);addEventListener('pagehide',cerrarCamara);document.addEventListener('visibilitychange',()=>{if(document.hidden)cerrarCamara();});
$('op-serie-linea').addEventListener('change',()=>{$('op-serie-posicion').value=consultaSerie?.coincidencias.find(l=>l.id===$('op-serie-linea').value)?.posicion||'';});
function limpiarSerie(){consultaSerie=null;$('op-serie-guardar').hidden=true;$('op-serie-informe').textContent='';$('op-serie-similar').checked=false;}
function actualizarSeries(){
 const anterior=$('op-series-cliente').value;
 $('op-series-cliente').replaceChildren(...state.inv.perfiles.map(p=>new Option(state.contexto.clientes.find(c=>c.id===p.cliente_id)?.nombre||p.nombre||p.cliente_id,p.cliente_id)));
 if(state.inv.perfiles.some(p=>p.cliente_id===anterior))$('op-series-cliente').value=anterior;
 $('op-series-panel').hidden=false;limpiarSerie();actualizarClienteSerie();
}
function actualizarClienteSerie(){
 cerrarCamara();
 const perfil=state.inv?.perfiles.find(p=>p.cliente_id===$('op-series-cliente').value);
 $('op-capturas').hidden=!perfil||!['OPERADOR','SUPERVISOR'].includes(perfil.rol)||!Number(perfil.puede_contar)||state.inv.borrador||state.inv.estado!=='EN_PROCESO';
 cursorHistorial=null;historialScope='';$('op-historial-filas').replaceChildren();$('op-historial-mas').hidden=true;$('op-historial-estado').textContent='';limpiarSerie();
}
$('op-series-cliente').addEventListener('change',actualizarClienteSerie);$('op-serie').addEventListener('input',limpiarSerie);
formulario('op-serie-consultar',async()=>{
 limpiarSerie();const id=state.inv?.id,clienteId=$('op-series-cliente').value,serie=$('op-serie').value;
 const r=await api('/api/operacion/serie/consultar',{inventarioId:id,clienteId,serie});
 if(state.inv?.id!==id||$('op-series-cliente').value!==clienteId||$('op-serie').value!==serie)return;
 if(typeof r.duplicada!=='boolean'||!Array.isArray(r.coincidencias)||!Array.isArray(r.parecidas)||typeof r.serie!=='string')throw Error('Consulta de serie incompleta.');
 consultaSerie={...r,inventarioId:id,clienteId};
 $('op-serie-informe').textContent=r.duplicada?'La serie ya fue registrada.':r.coincidenciasTruncadas?'Hay demasiadas coincidencias; solicita revisar el stock.':(r.coincidencias.length?'Coincide con stock. Selecciona la línea y etapa correctas.':'Serie sin coincidencia: completa el hallazgo.')+(r.parecidas.length?' Series parecidas registradas: '+r.parecidas.join(', '):'');
 $('op-serie-guardar').hidden=r.duplicada||r.coincidenciasTruncadas;
 $('op-serie-posicion').value=r.coincidencias.length===1?(r.coincidencias[0]?.posicion||''):'';$('op-serie-nueva').value='';$('op-serie-nueva-panel').hidden=!r.coincidencias.length;
 $('op-serie-conocida').hidden=!r.coincidencias.length;$('op-serie-hallazgo').hidden=!!r.coincidencias.length;
 $('op-serie-similar-panel').hidden=!r.parecidas.length;
 $('op-serie-linea').replaceChildren(...(r.coincidencias.length>1?[new Option('Selecciona la línea y ubicación exactas','')]:[]),...r.coincidencias.map(l=>new Option(l.sku+' · '+(l.posicion||'Sin posición')+' · C1/C2/C3: '+[l.conteo_1,l.conteo_2,l.conteo_final].map(formatearCantidad).join(' / '),l.id)));
});
formulario('op-serie-guardar',async()=>{
 const q=consultaSerie;if(!q||q.inventarioId!==state.inv?.id||q.clienteId!==$('op-series-cliente').value||q.serie!==$('op-serie').value.trim().toUpperCase())throw Error('Vuelve a consultar la serie.');
 if(q.parecidas.length&&!$('op-serie-similar').checked)throw Error('Revisa las series parecidas y confirma antes de registrar.');
 const b={inventarioId:q.inventarioId,clienteId:q.clienteId,serie:q.serie,confirmarSimilar:$('op-serie-similar').checked,posicion:$('op-serie-posicion').value};
 if(q.coincidencias.length){
  const l=q.coincidencias.find(l=>l.id===$('op-serie-linea').value);if(!l)throw Error('Selecciona una línea.');
  Object.assign(b,{lineaId:l.id,versionLinea:l.version,etapa:Number($('op-serie-etapa').value)});
  if($('op-serie-nueva').value)b.nuevaPosicion=$('op-serie-nueva').value;
 }else b.hallazgo={sku:$('op-serie-sku').value,descripcion:$('op-serie-descripcion').value,posicion:$('op-serie-posicion').value,cantidad:'1',lote:$('op-serie-lote').value,observacion:$('op-serie-obs').value,justificacion:$('op-serie-justificacion').value};
 await mutar('serie',b);$('op-serie').value='';await detalle();await cargarHistorial(false);$('op-serie').focus();
});
formulario('op-hallazgo',async()=>{
 await mutar('hallazgo',{inventarioId:state.inv?.id,clienteId:$('op-series-cliente').value,datos:{sku:$('op-hallazgo-sku').value,cantidad:$('op-hallazgo-cantidad').value,
 descripcion:$('op-hallazgo-desc').value,posicion:$('op-hallazgo-pos').value,lote:$('op-hallazgo-lote').value,observacion:$('op-hallazgo-obs').value,justificacion:$('op-hallazgo-just').value}});
 $('op-historial-tipo').value='hallazgos';await cargarHistorial(false);
});
function fechaCaptura(value){
 if(typeof value!=='string')return 'Fecha no disponible';
 const iso=/^\d{4}-\d{2}-\d{2} /.test(value)?value.replace(' ','T')+'Z':value,d=new Date(iso);
 return Number.isFinite(d.getTime())?d.toLocaleString('es-EC',{timeZone:'America/Guayaquil'}):'Fecha no disponible';
}
async function cargarHistorial(mas=false){
 const id=state.inv?.id,clienteId=$('op-series-cliente').value,tipo=$('op-historial-tipo').value,scope=id+clienteId+tipo;
 if(!id||!clienteId)return;const params=new URLSearchParams({clienteId});if(mas&&scope===historialScope&&cursorHistorial)params.set('cursor',cursorHistorial);
 const r=await api('/api/operacion/inventarios/'+id+'/'+tipo+'?'+params);
 if(id!==state.inv?.id||clienteId!==$('op-series-cliente').value||tipo!==$('op-historial-tipo').value)return;
 if(!Array.isArray(r.datos)||!(r.siguiente===null||typeof r.siguiente==='string')||r.datos.some(f=>!f||typeof f.id!=='string'||f.inventario_id!==id||f.cliente_id!==clienteId||typeof f.creado_en!=='string'||typeof f.sku!=='string'))throw Error('Historial incompleto.');
 if(!mas||scope!==historialScope)$('op-historial-filas').replaceChildren();
 for(const f of r.datos){const tr=document.createElement('tr');celda(tr,fechaCaptura(f.creado_en));celda(tr,(f.serie||'Sin serie')+' · '+f.sku);celda(tr,(f.posicion||'—')+' · '+formatearCantidad(f.cantidad??'1'));celda(tr,(f.observacion||f.descripcion||'')+' · '+(f.usuario||f.actor_id));$('op-historial-filas').append(tr);}
 historialScope=scope;cursorHistorial=r.siguiente;$('op-historial-mas').hidden=!r.siguiente;$('op-historial-estado').textContent=$('op-historial-filas').rows.length+' captura(s) consultada(s).';
}
$('op-historial').addEventListener('click',()=>tarea(()=>cargarHistorial(false)));$('op-historial-mas').addEventListener('click',()=>tarea(()=>cargarHistorial(true)));$('op-historial-tipo').addEventListener('change',()=>{cursorHistorial=null;$('op-historial-filas').replaceChildren();$('op-historial-mas').hidden=true;});
try{
 state.sesion=await api('/api/sesion');$('op-usuario').textContent=state.sesion.usuario.nombre+' · '+state.sesion.usuario.correo;
 if(state.sesion.operacionNativa!==true)throw Error('La operación nativa aún no está habilitada. El piloto de consulta sigue disponible.');
 $('op-fecha').value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guayaquil',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const seleccionado=new URL(location.href).searchParams.get('inventario')||'';
 await contexto(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(seleccionado)?seleccionado:'');$('op-contenido').hidden=false;controles();aviso('Sesión verificada. Selecciona o crea un inventario de ensayo.');
}catch(e){aviso(e.status===401?'Inicia sesión desde Inventarios y capturas, luego vuelve a Operación.':e.message,true);}
