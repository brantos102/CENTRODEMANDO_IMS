import {cantidadNormalizada,mostrarCantidad,siguienteEtapa,acuseValido,validarPagina} from './modelo.mjs';
import {listarPendientes,guardarPendiente,confirmarPendiente} from './pendientes.mjs';
const $=id=>document.getElementById(id);
const state={usuario:null,csrf:null,epoch:0,inventarios:[],lineas:[],inv:null,pendientes:[],almacen:false,sync:false,formulario:false,cursorInv:null,cursorLineas:null};
let seqInv=0,seqLineas=0,seqPendientes=0;
let verificandoSesion=true;
function el(tag,text,clase){const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(clase)e.className=clase;return e;}
function aviso(text='',fallo=false){$('aviso').textContent=text;$('aviso').hidden=!text;$('aviso').classList.toggle('fallo',fallo);}
function contexto(){return {epoch:state.epoch,actorId:state.usuario?.actorId};}
function actual(c){return c.epoch===state.epoch&&c.actorId===state.usuario?.actorId;}
async function api(path,{method='GET',body,csrf=state.csrf}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,
      headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(method==='POST'&&csrf?{'X-IMS-CSRF':csrf}:{})},
      body:body===undefined?undefined:JSON.stringify(body)});
    let data;try{data=await response.json();}catch{throw Error('No se recibió una respuesta válida. Reintenta.');}
    if(!response.ok)throw Object.assign(Error(data.mensaje||'No se pudo completar la solicitud.'),{status:response.status,codigo:data.error});
    return data;
  }catch(e){if(e.name==='AbortError'||e instanceof TypeError)throw Error('No se pudo confirmar la comunicación. Reintenta cuando tengas conexión.');throw e;}
  finally{clearTimeout(timer);}
}
function mostrarAcceso(message=''){
  state.epoch++;state.usuario=null;state.csrf=null;state.inv=null;state.lineas=[];state.inventarios=[];state.pendientes=[];
  $('operacion').hidden=true;$('acceso').hidden=false;$('contrasena').value='';$('login-error').textContent=message;
  $('lista-inventarios').replaceChildren();$('lineas').replaceChildren();$('lista-pendientes').replaceChildren();
  $('modal-conteo').close();$('form-conteo').reset();aviso();
}
function errorActual(e,c){if(!actual(c))return;if(e.status===401)mostrarAcceso('La sesión venció. Inicia sesión para continuar.');else aviso(e.message,true);}
async function entrar(sesion){
  state.epoch++;state.usuario=sesion.usuario;state.csrf=sesion.csrf;
  $('acceso').hidden=true;$('operacion').hidden=false;$('detalle').hidden=true;$('seleccion-vacia').hidden=false;
  $('usuario').textContent=sesion.usuario.nombre+' · '+sesion.usuario.correo;
  state.inv=null;state.lineas=[];state.inventarios=[];state.cursorInv=null;aviso();
  await actualizarPendientes();if(!state.usuario)return;await cargarInventarios();
}
async function actualizarPendientes(){
  if(!state.usuario)return;const c=contexto(),seq=++seqPendientes;
  try{const pendientes=await listarPendientes(c.actorId);if(!actual(c)||seq!==seqPendientes)return;state.pendientes=pendientes;state.almacen=true;}
  catch(e){if(!actual(c)||seq!==seqPendientes)return;state.almacen=false;aviso('No se pueden conservar capturas en este navegador. La consulta sigue disponible.',true);}
  if(actual(c)&&seq===seqPendientes){pintarPendientes();pintarLineas();}
}
function pintarPendientes(){
  $('pendientes-panel').hidden=!state.pendientes.length;
  $('pendientes-titulo').textContent=state.pendientes.length+' captura(s) por confirmar';
  $('lista-pendientes').replaceChildren(...state.pendientes.map(p=>el('li',p.codigo+' · '+p.sku+' · etapa '+p.solicitud.etapa+' · cantidad '+p.solicitud.cantidad)));
  $('sincronizar').disabled=state.sync;
}
function pintarInventarios(){
  const list=$('lista-inventarios');list.replaceChildren();
  if(!state.inventarios.length)list.append(el('p','No tienes inventarios asignados.','sin-datos'));
  for(const inv of state.inventarios){
    const b=el('button',undefined,'inventario'+(state.inv?.id===inv.id?' seleccionado':''));b.type='button';
    b.append(el('strong',inv.codigo_operativo),el('span',inv.sede+' · '+inv.estado.replaceAll('_',' ')));
    b.addEventListener('click',()=>seleccionar(inv));list.append(b);
  }
  $('mas-inventarios').hidden=!state.cursorInv;
}
async function cargarInventarios(mas=false){
  if(!state.usuario)return;const c=contexto(),seq=++seqInv;$('actualizar-inv').disabled=true;$('mas-inventarios').disabled=true;
  try{
    const data=await api('/api/inventarios?limite=50'+(mas&&state.cursorInv?'&cursor='+encodeURIComponent(state.cursorInv):''));
    if(!actual(c)||seq!==seqInv)return;validarPagina(data,'inventarios');
    state.inventarios=mas?[...state.inventarios,...data.datos]:data.datos;state.cursorInv=data.siguiente;pintarInventarios();
  }catch(e){errorActual(e,c);}
  finally{if(seq===seqInv){$('actualizar-inv').disabled=false;$('mas-inventarios').disabled=false;}}
}
async function seleccionar(inv){
  state.epoch++;state.inv=inv;state.lineas=[];state.cursorLineas=null;
  $('seleccion-vacia').hidden=true;$('detalle').hidden=false;
  $('codigo').textContent=inv.codigo_operativo;$('sede').textContent='SEDE '+inv.sede;
  $('estado-inventario').textContent=inv.estado.replaceAll('_',' ')+(inv.estado==='EN_PROCESO'?' · Captura por etapas':' · Consulta');
  pintarInventarios();pintarLineas();await cargarLineas();
}
function pintarLineas(){
  const tbody=$('lineas');tbody.replaceChildren();
  if(!state.lineas.length){const tr=el('tr'),td=el('td','No hay líneas cargadas en esta vista.','sin-datos');td.colSpan=6;tr.append(td);tbody.append(tr);}
  for(const row of state.lineas){
    const tr=el('tr');tr.dataset.linea=row.id;
    const product=el('td');product.append(el('strong',row.sku),el('small',row.descripcion||'Sin descripción registrada'),el('small',row.cliente));
    const location=el('td');location.append(el('strong',row.posicion||'Sin posición registrada'),el('small','Serie: '+(row.serie||'—')),el('small','Lote: '+(row.lote||'—')));
    tr.append(product,location,...['conteo_1','conteo_2','conteo_final'].map(k=>el('td',mostrarCantidad(row[k]),'numero')));
    const action=el('td'),etapa=siguienteEtapa(row),pending=state.pendientes.some(p=>p.lineaId===row.id);
    if(pending)action.append(el('span','Por confirmar','pendiente-etiqueta'));
    else if(row.puede_contar&&state.inv?.estado==='EN_PROCESO'&&etapa&&state.almacen){
      const b=el('button','Contar · '+etapa,'primario');b.type='button';b.addEventListener('click',()=>abrirConteo(row));action.append(b);
    }else action.append(el('small',!row.puede_contar?'Solo lectura':!state.almacen?'Captura no disponible':etapa?'Consulta':'Etapas completas o por revisar'));
    tr.append(action);tbody.append(tr);
  }
  $('resumen-lineas').textContent=state.lineas.length+' línea(s) cargada(s).'+(state.cursorLineas?' Hay más líneas disponibles.':'');
  $('mas-lineas').hidden=!state.cursorLineas;
}
async function cargarLineas(mas=false){
  if(!state.inv||!state.usuario)return;const c=contexto(),id=state.inv.id,seq=++seqLineas;
  $('actualizar-lineas').disabled=true;$('mas-lineas').disabled=true;
  try{
    const data=await api('/api/inventarios/'+id+'/lineas?limite=50'+(mas&&state.cursorLineas?'&cursor='+encodeURIComponent(state.cursorLineas):''));
    if(!actual(c)||state.inv?.id!==id||seq!==seqLineas)return;validarPagina(data,'lineas');
    state.lineas=mas?[...state.lineas,...data.datos]:data.datos;state.cursorLineas=data.siguiente;pintarLineas();
  }catch(e){errorActual(e,c);}
  finally{if(seq===seqLineas){$('actualizar-lineas').disabled=false;$('mas-lineas').disabled=false;}}
}
let seleccion;
function abrirConteo(row){
  const etapa=siguienteEtapa(row);if(!etapa||!state.usuario||state.formulario)return;
  seleccion={row:{...row},inv:{...state.inv},contexto:contexto(),etapa};
  $('form-conteo').reset();$('conteo-error').textContent='';$('conteo-titulo').textContent=etapa===3?'Registrar conteo final':'Registrar conteo '+etapa;
  $('producto-conteo').textContent=row.sku+' · '+(row.posicion||'Sin posición')+' · '+row.cliente;
  $('observacion').value=row.observacion||'';$('nueva-posicion').value=row.nueva_posicion||'';
  $('modal-conteo').showModal();$('cantidad').focus();
}
async function enviar(record,c){
  if(state.usuario?.actorId!==record.actorId)throw Error('Inicia sesión con la cuenta que capturó este envío.');
  const data=await api('/api/conteos',{method:'POST',body:record.solicitud,csrf:state.csrf});
  if(!acuseValido(data,record.solicitud))throw Error('La respuesta no confirma esta captura. Conservamos el envío para revisión.');
  await confirmarPendiente(record.actorId,record.operacionId);
  if(actual(c))aviso(data.repetida?'La operación ya estaba guardada. Confirmación recuperada.':'Conteo guardado y confirmado.');
}
$('form-login').addEventListener('submit',async e=>{
  e.preventDefault();if(verificandoSesion)return;$('entrar').disabled=true;$('login-error').textContent='';
  const body={correo:$('correo').value,contrasena:$('contrasena').value};$('contrasena').value='';
  try{await entrar(await api('/api/sesion',{method:'POST',body,csrf:null}));}
  catch(e){$('login-error').textContent=e.message;}finally{$('entrar').disabled=false;}
});
$('form-conteo').addEventListener('submit',async e=>{
  e.preventDefault();if(state.formulario||!seleccion||!actual(seleccion.contexto))return;
  const s=seleccion,c=s.contexto;state.formulario=true;$('guardar-conteo').disabled=true;$('cerrar-conteo').disabled=true;$('conteo-error').textContent='';
  let creado=false;
  try{
    const solicitud={operacionId:crypto.randomUUID(),inventarioId:s.inv.id,lineaId:s.row.id,etapa:s.etapa,versionEsperada:s.row.version,cantidad:cantidadNormalizada($('cantidad').value)};
    if($('observacion').value!==(s.row.observacion||''))solicitud.observacion=$('observacion').value;
    if($('nueva-posicion').value!==(s.row.nueva_posicion||''))solicitud.nuevaPosicion=$('nueva-posicion').value;
    const r=await guardarPendiente({operacionId:solicitud.operacionId,actorId:c.actorId,lineaId:s.row.id,solicitud,codigo:s.inv.codigo_operativo,sku:s.row.sku,creado:new Date().toISOString()});
    creado=true;$('modal-conteo').close();
    if(!r.nuevo){aviso('Esta línea tiene un envío pendiente. Reinténtalo desde Capturas pendientes.',true);return;}
    if(actual(c))aviso('Enviando captura. Espera la confirmación.');
    await enviar(r.registro,c);
    if(actual(c))await cargarLineas();
  }catch(e){
    if(creado)errorActual(e,c);else $('conteo-error').textContent=e.message;
  }finally{
    state.formulario=false;$('guardar-conteo').disabled=false;$('cerrar-conteo').disabled=false;
    if(actual(c))await actualizarPendientes();
  }
});
$('sincronizar').addEventListener('click',async()=>{
  if(state.sync||!state.usuario)return;state.sync=true;const c=contexto();pintarPendientes();
  try{
    const records=await listarPendientes(c.actorId);
    for(const r of records){if(!actual(c))break;await enviar(r,c);}
    if(actual(c)&&state.inv)await cargarLineas();
  }catch(e){errorActual(e,c);}finally{state.sync=false;if(actual(c))await actualizarPendientes();}
});
$('salir').addEventListener('click',async()=>{
  const c=contexto();$('salir').disabled=true;
  try{await api('/api/sesion/cerrar',{method:'POST'});if(actual(c))mostrarAcceso();}
  catch(e){if(e.status===401)mostrarAcceso();else if(actual(c))aviso('No se pudo cerrar sesión. La sesión sigue activa; reintenta el cierre.',true);}
  finally{$('salir').disabled=false;}
});
$('cerrar-conteo').addEventListener('click',()=>{if(!state.formulario)$('modal-conteo').close();});
$('modal-conteo').addEventListener('cancel',e=>{if(state.formulario)e.preventDefault();});
$('actualizar-inv').addEventListener('click',()=>cargarInventarios());
$('mas-inventarios').addEventListener('click',()=>cargarInventarios(true));
$('actualizar-lineas').addEventListener('click',()=>cargarLineas());
$('mas-lineas').addEventListener('click',()=>cargarLineas(true));
function red(){ $('red').textContent=navigator.onLine?'Red disponible':'Sin red'; }
window.addEventListener('online',red);window.addEventListener('offline',red);red();
$('entrar').disabled=true;
try{await entrar(await api('/api/sesion'));}catch(e){mostrarAcceso(e.status===401?'':e.message);}
finally{verificandoSesion=false;$('entrar').disabled=false;}
