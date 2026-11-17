import {guardarBorrador,leerBorradores,retirarBorrador,sumarLectura} from './borradores-wms.mjs';
import {iniciarCamara} from './camara.mjs';
import {cantidadNormalizada,siguienteEtapa,acuseValido,validarPagina,validarResumen,mostrarEntero} from './modelo.mjs';
import {formatearCantidad as mostrarCantidad} from './cantidades.mjs';
import {listarPendientes,guardarPendiente,confirmarPendiente} from './pendientes.mjs';
const $=id=>document.getElementById(id);
const state={usuario:null,csrf:null,epoch:0,inventarios:[],lineas:[],inv:null,pendientes:[],almacen:false,sync:false,formulario:false,scanOcupado:false,cargandoLineas:false,bloquearScope:false,scopeLineas:null,cursorInv:null,cursorLineas:null};
document.addEventListener('ims:solicitar-contexto',()=>{if(state.inv)document.dispatchEvent(new CustomEvent('ims:inventario',{detail:{id:state.inv.id,inventario:{...state.inv},centro:state.centroDisponible,usuario:state.usuario,csrf:state.csrf}}));});
let seqInv=0,seqLineas=0,seqPendientes=0;let borradores=new Map(),elegidas=new Set(),escriturasBorrador=new Map();
let seqResumen=0,seqWms=0,seqBusqueda=0;
const sinFiltros=()=>({buscar:'',cliente:'',sede:''});
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
  document.dispatchEvent(new Event('ims:sesion-cerrada'));
  borradores.clear();elegidas.clear();state.epoch++;state.usuario=null;state.csrf=null;state.inv=null;state.lineas=[];state.inventarios=[];state.pendientes=[];
  $('operacion').hidden=true;$('acceso').hidden=false;$('contrasena').value='';$('login-error').textContent=message;
  $('lista-inventarios').replaceChildren();$('lineas').replaceChildren();$('lista-pendientes').replaceChildren();
  $('modal-conteo').close();$('form-conteo').reset();aviso();
  limpiarResumen();
}
function errorActual(e,c){if(!actual(c))return;if(e.codigo==='CAMBIAR_CLAVE'){window.location.href='/centro#perfil';return;}if(e.status===401)mostrarAcceso('La sesión venció. Inicia sesión para continuar.');else aviso(e.message,true);}
async function entrar(sesion){
  state.epoch++;state.usuario=sesion.usuario;state.csrf=sesion.csrf;
  document.dispatchEvent(new Event('ims:sesion'));state.soloLectura=sesion.soloLectura===true;state.operacionNativa=sesion.operacionNativa===true;state.centroDisponible=sesion.centroDisponible===true;
  $('modo-nativo').hidden=!sesion.operacionNativa;
  $('resumen-titulo').textContent=sesion.operacionNativa?'Tus inventarios autorizados':'Tu resumen de inventarios';
  $('tipo-resumen').textContent=sesion.operacionNativa?'INVENTARIOS AUTORIZADOS':'HISTÓRICO AUTORIZADO';
  $('descripcion-resumen').textContent=sesion.operacionNativa?'Incluye el histórico consultable y los inventarios habilitados para tu cuenta.':'Cifras de los inventarios trasladados a los que tienes acceso.';
$('modo-lectura').hidden=!state.soloLectura;
  $('acceso').hidden=true;$('operacion').hidden=false;$('detalle').hidden=true;$('seleccion-vacia').hidden=false;
  $('usuario').textContent=sesion.usuario.nombre+' · '+sesion.usuario.correo;
  state.inv=null;state.lineas=[];state.inventarios=[];state.cursorInv=null;$('resumen-desplegable').open=true;$('inventarios-desplegable').open=true;aviso();
  state.filtrosInv=sinFiltros();state.busquedaLineas='';state.cargandoInv=false;
  $('form-inventarios').reset();$('form-lineas').reset();limpiarResumen();
  await actualizarPendientes();if(!state.usuario)return;
  await Promise.all([cargarResumen(),cargarInventarios()]);
  const id=new URLSearchParams(window.location.search).get('inventario');
  if(sesion.centroDisponible&&/^[a-f0-9-]{36}$/.test(id||'')){const r=await api('/api/centro/inventario?inventario='+id);await seleccionar(r.inventario);}
}
function limpiarResumen(){
  state.resumen=null;
  for(const k of ['conteos','lineas','clientes','sedes'])$('total-'+k).textContent='—';
  $('resumen-clientes').replaceChildren();$('cliente-inventarios').replaceChildren(new Option('Todos los autorizados',''));
  $('resumen-error').textContent='';$('hora-resumen').textContent='Resumen pendiente de consulta.';
  $('filtro-inventarios-aplicado').textContent='Mostrando tus inventarios autorizados.';
}
async function cargarResumen(){
  if(!state.usuario)return;const c=contexto(),seq=++seqResumen;$('actualizar-resumen').disabled=true;
  try{
    const data=await api('/api/resumen');
    if(!actual(c)||seq!==seqResumen)return;validarResumen(data);state.resumen=data;
    for(const k of ['conteos','lineas','clientes','sedes'])$('total-'+k).textContent=mostrarEntero(data.totales[k]);
    const seleccionado=$('cliente-inventarios').value;
    $('cliente-inventarios').replaceChildren(new Option('Todos los autorizados',''),...data.clientes.map(r=>new Option(r.nombre,r.id)));
    $('cliente-inventarios').value=seleccionado;
    $('resumen-clientes').replaceChildren(...data.clientes.map(r=>{
      const tr=el('tr'),accion=el('td'),b=el('button','Ver inventarios','texto-boton');b.type='button';b.setAttribute('aria-label','Ver inventarios de '+r.nombre);
      b.addEventListener('click',()=>{
        const f={...state.filtrosInv,cliente:r.id,buscar:''};$('cliente-inventarios').value=r.id;$('buscar-inventarios').value='';
        cargarInventarios(false,f);$('inventarios-titulo').scrollIntoView({block:'start',behavior:'smooth'});
      });accion.append(b);tr.append(el('td',r.nombre),el('td',mostrarEntero(r.conteos),'numero'),el('td',mostrarEntero(r.lineas),'numero'),accion);return tr;
    }));
    $('hora-resumen').textContent='Consulta realizada: '+new Date(data.consultado_en).toLocaleString('es-EC',{timeZone:'America/Guayaquil'});
    $('resumen-error').textContent='';
  }catch(e){
    if(!actual(c)||seq!==seqResumen)return;
    if(e.status===401)mostrarAcceso('La sesión venció. Inicia sesión para continuar.');
    else $('resumen-error').textContent=state.resumen?'No se pudo actualizar el resumen. Se conserva la consulta anterior.':'No se pudo consultar el resumen. Reintenta con Actualizar resumen.';
  }finally{if(seq===seqResumen)$('actualizar-resumen').disabled=false;}
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
  $('lista-pendientes').replaceChildren(...state.pendientes.map(p=>el('li',p.codigo+' · '+p.sku+' · etapa '+p.solicitud.etapa+' · cantidad '+mostrarCantidad(p.solicitud.cantidad))));
  $('sincronizar').disabled=state.sync;
}
function pintarInventarios(){
  const list=$('lista-inventarios');list.replaceChildren();
  if(!state.inventarios.length)list.append(el('p','No hay inventarios para esta consulta.','sin-datos'));
  for(const inv of state.inventarios){
    const b=el('button',undefined,'inventario'+(state.inv?.id===inv.id?' seleccionado':''));b.type='button';
    b.disabled=!!state.cargandoInv;
    b.append(el('strong',inv.codigo_operativo),el('span',inv.sede+' · '+inv.estado.replaceAll('_',' ')));
    b.addEventListener('click',()=>seleccionar(inv));list.append(b);
  }
  $('mas-inventarios').hidden=!state.cursorInv;
}
async function cargarInventarios(mas=false,filtros=state.filtrosInv||sinFiltros()){
  if(!state.usuario)return;const c=contexto(),seq=++seqInv;$('actualizar-inv').disabled=true;$('mas-inventarios').disabled=true;
  state.cargandoInv=true;$('filtros-inventarios').disabled=true;pintarInventarios();
  try{
    const q=new URLSearchParams({limite:'50'});for(const[k,v]of Object.entries(filtros))if(v)q.set(k,v);
    if(mas&&state.cursorInv)q.set('cursor',state.cursorInv);
    const data=await api('/api/inventarios?'+q);
    if(!actual(c)||seq!==seqInv)return;validarPagina(data,'inventarios');
    if(!mas&&JSON.stringify(filtros)!==JSON.stringify(state.filtrosInv)){
      state.epoch++;state.inv=null;state.lineas=[];state.cursorLineas=null;
      $('detalle').hidden=true;$('seleccion-vacia').hidden=false;$('lineas').replaceChildren();
    }
    state.filtrosInv={...filtros};
    state.inventarios=mas?[...state.inventarios,...data.datos]:data.datos;state.cursorInv=data.siguiente;pintarInventarios();
    const cliente=state.resumen?.clientes.find(r=>r.id===filtros.cliente)?.nombre;
    const etiquetas=[filtros.buscar&&'Búsqueda: '+filtros.buscar,cliente&&'Cliente: '+cliente,filtros.sede&&'Sede: '+filtros.sede].filter(Boolean);
    $('filtro-inventarios-aplicado').textContent=etiquetas.length?etiquetas.join(' · '):'Mostrando tus inventarios autorizados.';
  }catch(e){errorActual(e,c);}
  finally{if(seq===seqInv){state.cargandoInv=false;$('filtros-inventarios').disabled=false;$('actualizar-inv').disabled=false;$('mas-inventarios').disabled=false;pintarInventarios();}}
}
async function seleccionar(inv){
  $('resumen-desplegable').open=false;$('modo-nativo').hidden=true;if(matchMedia('(max-width:700px)').matches)$('inventarios-desplegable').open=false;
  state.epoch++;state.inv=inv;state.lineas=[];state.scopeLineas=null;state.bloquearScope=false;borradores=new Map();elegidas=new Set();state.cursorLineas=null;document.dispatchEvent(new CustomEvent('ims:inventario',{detail:{id:inv.id,inventario:{...inv},centro:state.centroDisponible,usuario:state.usuario,csrf:state.csrf}}));$('wms-avance').hidden=true;$('wms-acciones').hidden=true;$('wms-contexto').hidden=true;
  state.busquedaLineas='';state.posicionLineas='';$('ims-posicion-activa').hidden=true;$('form-lineas').reset();$('ean-coincidencias').replaceChildren();
  $('seleccion-vacia').hidden=true;$('detalle').hidden=false;
  $('codigo').textContent=inv.codigo_operativo;$('sede').textContent='SEDE '+inv.sede;
  $('estado-inventario').textContent=inv.estado.replaceAll('_',' ')+(inv.estado==='EN_PROCESO'?' · Captura por etapas':' · Consulta');
  const contextoB=contexto();try{const ds=state.almacen?await leerBorradores(state.usuario.actorId,inv.id):[];if(actual(contextoB))borradores=new Map(ds.map(d=>[d.lineaId,d]));}catch(e){if(actual(contextoB))aviso(e.message,true);}pintarInventarios();pintarLineas();await cargarLineas();
}
function pintarLineas(){
  const tbody=$('lineas');tbody.replaceChildren();
  if(!state.lineas.length){const tr=el('tr'),td=el('td','No hay líneas cargadas en esta vista.','sin-datos');td.colSpan=6;tr.append(td);tbody.append(tr);}
  const ordenadas=$('orden-lineas')?.value==='posicion'?[...state.lineas].sort((a,b)=>String(a.posicion||'').localeCompare(String(b.posicion||''),'es')||a.sku.localeCompare(b.sku,'es')):state.lineas;
  for(const row of ordenadas){
    const tr=el('tr');tr.dataset.linea=row.id;
    const product=el('td');product.append(el('strong',row.sku),el('small',row.descripcion||'Sin descripción registrada'),el('small',row.cliente));
    const location=el('td');location.append(el('strong',row.posicion||'Sin posición registrada'),el('small','Serie: '+(row.serie||'—')),el('small','Lote: '+(row.lote||'—')));
    tr.append(product,location,...['conteo_1','conteo_2','conteo_final'].map(k=>el('td',mostrarCantidad(row[k]),'numero')));
    const action=el('td'),etapa=siguienteEtapa(row),pending=state.pendientes.some(p=>p.lineaId===row.id);
    if(pending)action.append(el('span','Por confirmar','pendiente-etiqueta'));
    else if(!state.soloLectura&&row.puede_contar&&state.inv?.estado==='EN_PROCESO'&&etapa&&state.almacen){
      const b=el('button','Contar · '+etapa,'primario');b.type='button';b.disabled=state.bloquearScope;b.addEventListener('click',()=>abrirConteo(row));action.append(b);const elegir=el('input');elegir.type='checkbox';elegir.disabled=state.bloquearScope;elegir.checked=elegidas.has(row.id);elegir.dataset.elegir=row.id;elegir.setAttribute('aria-label','Seleccionar '+row.sku+' en '+row.posicion);elegir.onchange=()=>elegir.checked?elegidas.add(row.id):elegidas.delete(row.id);action.prepend(elegir);const draft=borradores.get(row.id),input=el('input');input.dataset.borrador=row.id;input.inputMode='decimal';input.placeholder='C'+etapa;input.setAttribute('aria-label','Cantidad '+row.sku+' en '+row.posicion);input.value=draft?.cantidad||'';input.disabled=state.bloquearScope||!!draft&&draft.version!==row.version;input.onchange=()=>void encolarBorrador(row,input.value).catch(()=>{});action.append(input);if(draft&&draft.version!==row.version){action.append(el('small','La línea cambió. Borrador: '+draft.cantidad+'. Revisa sus capturas antes de continuar.','error'));const descartar=el('button','Descartar borrador');descartar.type='button';descartar.onclick=async()=>{const c=contexto(),id=state.inv.id;try{await retirarBorrador(c.actorId,id,row.id);if(actual(c)&&state.inv?.id===id){borradores.delete(row.id);elegidas.delete(row.id);pintarLineas();}}catch(e){errorActual(e,c);}};action.append(descartar);}
    }else action.append(el('small',state.soloLectura||!row.puede_contar?'Solo lectura':!state.almacen?'Captura no disponible':etapa?'Consulta':'Etapas completas o por revisar'));
    tr.append(action);tbody.append(tr);
  }
  $('ims-borradores-estado').textContent=borradores.size+' borradores resguardados para este inventario.';
  $('resumen-lineas').textContent=state.lineas.length+' línea(s) cargada(s).'+(state.busquedaLineas?' Búsqueda: '+state.busquedaLineas+'.':'')+(state.cursorLineas?' Hay más líneas disponibles.':'');
  $('mas-lineas').hidden=!state.cursorLineas;
}
async function cargarLineas(mas=false,buscar=state.busquedaLineas||''){
  if(!state.inv||!state.usuario)return;const c=contexto(),id=state.inv.id,seq=++seqLineas,scope=JSON.stringify([state.posicionLineas||'',buscar]);
  $('actualizar-lineas').disabled=true;$('mas-lineas').disabled=true;
  $('filtros-lineas').disabled=true;state.cargandoLineas=true;state.bloquearScope=state.scopeLineas!==scope;$('lineas').setAttribute('aria-busy','true');if(state.bloquearScope)for(const e of document.querySelectorAll('#lineas button,#lineas input,#ims-scan-form button,#ims-guardar-masivo'))e.disabled=true;
  try{
    const q=new URLSearchParams({limite:'50'});if(buscar)q.set('buscar',buscar);if(state.posicionLineas)q.set('posicion',state.posicionLineas);if(mas&&state.cursorLineas)q.set('cursor',state.cursorLineas);
    const data=await api('/api/inventarios/'+id+'/lineas?'+q);
    if(!actual(c)||state.inv?.id!==id||seq!==seqLineas)return;validarPagina(data,'lineas');
    state.scopeLineas=scope;state.busquedaLineas=buscar;state.lineas=mas?[...state.lineas,...data.datos]:data.datos;state.cursorLineas=data.siguiente;pintarLineas();void actualizarWms();
  }catch(e){errorActual(e,c);}
  finally{if(seq===seqLineas){state.cargandoLineas=false;state.bloquearScope=state.scopeLineas!==scope;$('lineas').setAttribute('aria-busy','false');for(const e of document.querySelectorAll('#ims-scan-form button,#ims-guardar-masivo'))e.disabled=state.bloquearScope;pintarLineas();$('filtros-lineas').disabled=false;$('actualizar-lineas').disabled=false;$('mas-lineas').disabled=false;}}
}
let seleccion;
function abrirConteo(row){
  const etapa=siguienteEtapa(row);if(!etapa||!state.usuario||state.formulario||state.bloquearScope)return;
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
  await confirmarPendiente(record.actorId,record.operacionId);try{await retirarBorrador(record.actorId,record.solicitud.inventarioId,record.lineaId);}catch{if(actual(c))aviso('Captura confirmada. El borrador local requiere revisión al actualizar.');}if(actual(c)){borradores.delete(record.lineaId);elegidas.delete(record.lineaId);}document.dispatchEvent(new CustomEvent('ims:captura-confirmada',{detail:{id:record.solicitud.inventarioId}}));
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
$('actualizar-resumen').addEventListener('click',()=>cargarResumen());
$('form-inventarios').addEventListener('submit',e=>{
  e.preventDefault();cargarInventarios(false,{buscar:$('buscar-inventarios').value.trim(),cliente:$('cliente-inventarios').value,sede:$('sede-inventarios').value});
});
$('limpiar-inventarios').addEventListener('click',()=>{$('form-inventarios').reset();cargarInventarios(false,sinFiltros());});
$('form-lineas').addEventListener('submit',e=>{e.preventDefault();void buscarCodigo();});
$('limpiar-lineas').addEventListener('click',()=>{state.posicionLineas='';$('ims-posicion-activa').hidden=true;$('buscar-lineas').value='';cargarLineas(false,'');});
function red(){ $('red').textContent=navigator.onLine?'Red disponible':'Sin red'; }
window.addEventListener('online',red);window.addEventListener('offline',red);red();
$('entrar').disabled=true;
try{await entrar(await api('/api/sesion'));}catch(e){mostrarAcceso(e.status===401?'':e.message);}
finally{verificandoSesion=false;$('entrar').disabled=false;}

async function actualizarWms(){
 if(!state.operacionNativa||!state.inv)return;const id=state.inv.id,c=contexto(),seq=++seqWms;
 try{const r=await api('/api/operacion/inventarios/'+id+'/avance');if(!actual(c)||state.inv?.id!==id||seq!==seqWms)return;document.dispatchEvent(new CustomEvent('ims:avance',{detail:r}));const a=r.totales;$('wms-avance').replaceChildren(...[['Líneas autorizadas',a.lineas],['Conteo 1',a.c1],['Conteo 2',a.c2],['Conteo final',a.c3]].map(([t,v])=>{const d=el('div');d.append(el('span',t),el('strong',mostrarEntero(v)));return d;}));$('wms-avance').hidden=false;$('wms-contexto').hidden=false;$('wms-contexto').textContent=r.borrador?'Stock pendiente de activar.':r.conteoCiego?'Conteo ciego: el stock teórico permanece oculto.':'Captura autorizada. Cada producto y ubicación conserva sus conteos independientes.';state.inv.estado=r.estado;for(const [k,h]of [['wms-series','#series'],['wms-analisis','#analisis'],['wms-supervision','']])$(k).href='/operacion?inventario='+id+h;$('wms-analisis').hidden=r.conteoCiego;$('wms-acciones').hidden=false;pintarLineas();}
 catch(e){if(!actual(c)||state.inv?.id!==id)return;if(e.status===403){$('wms-contexto').hidden=false;$('wms-contexto').textContent='Histórico consultable. Las capturas originales permanecen protegidas.';}else if(e.status===401)errorActual(e,c);}
}
let cerrarProducto;
$('producto-escanear').onclick=async()=>{try{$('producto-camara').hidden=false;cerrarProducto=await iniciarCamara($('producto-video'),{alLeer:v=>{$('producto-camara').hidden=true;$('buscar-lineas').value=v;void buscarCodigo();},alFallar:e=>{$('producto-camara').hidden=true;aviso(e.message,true);}});}catch(e){$('producto-camara').hidden=true;aviso(e.message,true);}};
$('producto-cerrar').onclick=()=>{cerrarProducto?.();$('producto-camara').hidden=true;};window.addEventListener('pagehide',()=>cerrarProducto?.());$('orden-lineas').onchange=pintarLineas;

async function buscarCodigo(){
 const valor=$('buscar-lineas').value.trim(),c=contexto(),id=state.inv?.id,seq=++seqBusqueda;$('ean-coincidencias').replaceChildren();
 if(!id)return;
 try{if(state.centroDisponible&&valor){const r=await api('/api/centro/ean?'+new URLSearchParams({inventario:id,codigo:valor}));if(!actual(c)||seq!==seqBusqueda||$('buscar-lineas').value.trim()!==valor)return;
  if(r.ambigua){aviso('Este EAN corresponde a varios productos autorizados. Selecciona el producto antes de contar.');for(const f of r.coincidencias){const b=el('button',f.cliente+' · '+f.sku,'secundario');b.type='button';b.onclick=()=>{$('buscar-lineas').value=f.sku;$('ean-coincidencias').replaceChildren();void cargarLineas(false,f.sku);};$('ean-coincidencias').append(b);}return;}
  if(r.coincidencias.length){const sku=r.coincidencias[0].sku;$('buscar-lineas').value=sku;const presentaciones=[...new Set(r.coincidencias.filter(f=>f.tipoCodigo).map(f=>f.tipoCodigo+' · '+(f.cantidadPresentacion===''?'cantidad no informada':f.cantidadPresentacion)))];aviso('EAN '+valor+' → producto '+sku+'. Selecciona su ubicación.'+(presentaciones.length?' Valor CANTIDAD del catálogo: '+presentaciones.join('; ')+'. La cantidad se introduce manualmente.':''));await cargarLineas(false,sku);return;}
 }if(actual(c)&&seq===seqBusqueda)await cargarLineas(false,valor);
 }catch(e){errorActual(e,c);}
}

matchMedia('(max-width:700px)').addEventListener('change',e=>{if(e.matches&&state.inv)$('inventarios-desplegable').open=false;});

// La ubicación proviene del mapa del inventario vigente, sin elegir una línea por SKU.
document.addEventListener('ims:contar-posicion',e=>{if(!state.inv||e.detail?.inventarioId!==state.inv.id)return;state.posicionLineas=String(e.detail.posicion||'');$('ims-scan-coincidencias').replaceChildren();$('buscar-lineas').value='';$('ims-posicion-activa').textContent='Ubicación: '+state.posicionLineas+' · Selecciona la línea que vas a contar. Usa Limpiar para volver a todas.';$('ims-posicion-activa').hidden=!state.posicionLineas;void cargarLineas(false,'');});
document.addEventListener('ims:buscar-producto',e=>{if(!state.inv||e.detail?.inventarioId!==state.inv.id)return;state.posicionLineas='';$('ims-posicion-activa').hidden=true;$('buscar-lineas').value=String(e.detail.codigo||'');void buscarCodigo();});
document.addEventListener('ims:actualizar-capturas',()=>{if(state.inv)void cargarLineas();});

function encolarBorrador(row,valor){const c=contexto(),id=state.inv?.id; elegidas.delete(row.id);const p=(escriturasBorrador.get(row.id)||Promise.resolve()).catch(()=>{}).then(()=>actual(c)&&state.inv?.id===id?cambiarBorrador(row,valor,{propagar:true}):undefined);escriturasBorrador.set(row.id,p);void p.finally(()=>{if(escriturasBorrador.get(row.id)===p)escriturasBorrador.delete(row.id);}).catch(()=>{});return p;}
async function cambiarBorrador(row,valor,{propagar=false}={}){if(!state.inv||!state.usuario)return;const c=contexto(),id=state.inv.id;try{const d={actorId:c.actorId,inventarioId:id,lineaId:row.id,sku:row.sku,version:row.version,etapa:siguienteEtapa(row),cantidad:cantidadNormalizada(valor),observacion:row.observacion||'',nuevaPosicion:row.nueva_posicion||''};await guardarBorrador(d);if(!actual(c)||state.inv?.id!==id)return;borradores.set(row.id,d);elegidas.add(row.id);pintarLineas();}catch(e){errorActual(e,c);if(propagar)throw e;}}
async function enviarBorrador(row,d,c){if(d.version!==row.version||d.etapa!==siguienteEtapa(row))throw Error('La línea cambió. Revisa la etapa y el borrador antes de guardar.');const solicitud={operacionId:crypto.randomUUID(),inventarioId:state.inv.id,lineaId:row.id,versionEsperada:row.version,etapa:d.etapa,cantidad:d.cantidad,observacion:d.observacion,nuevaPosicion:d.nuevaPosicion};const r=await guardarPendiente({operacionId:solicitud.operacionId,actorId:c.actorId,lineaId:row.id,solicitud,codigo:state.inv.codigo_operativo,sku:row.sku,creado:new Date().toISOString()});if(!r.nuevo)throw Error('La línea tiene un envío pendiente. Usa Reintentar envíos.');await enviar(r.registro,c);}
$('ims-guardar-masivo').onclick=async()=>{if(state.formulario||state.bloquearScope||state.soloLectura||!state.almacen||!state.inv)return;const c=contexto();state.formulario=true;let confirmadas=0;try{await Promise.all([...escriturasBorrador.values()]);for(const row of state.lineas){if(!actual(c))break;if(!elegidas.has(row.id)||!borradores.has(row.id))continue;await enviarBorrador(row,borradores.get(row.id),c);confirmadas++;}if(actual(c)){aviso(confirmadas+' capturas confirmadas. Las demás conservan su borrador.');await cargarLineas();}}catch(e){errorActual(e,c);}finally{state.formulario=false;if(actual(c))await actualizarPendientes();}};
$('ims-todas-filas').onchange=()=>{for(const e of document.querySelectorAll('[data-elegir]')){e.checked=$('ims-todas-filas').checked;e.checked?elegidas.add(e.dataset.elegir):elegidas.delete(e.dataset.elegir);}};
$('ims-info-extra').onchange=()=>document.body.classList.toggle('ims-info-extra',$('ims-info-extra').checked);
$('ims-scan-form').onsubmit=async e=>{e.preventDefault();if(state.formulario||state.bloquearScope||state.scanOcupado||!state.almacen||!state.inv||state.soloLectura)return;state.scanOcupado=true;const c=contexto(),id=state.inv.id,valor=$('ims-scan-codigo').value.trim(),etapa=Number($('ims-scan-etapa').value),cantidadEntrada=$('ims-scan-cantidad').value,posicionIntento=state.posicionLineas,rafaga=$('ims-scan-rafaga').checked;$('ims-scan-coincidencias').replaceChildren();try{let sku=valor;if(state.centroDisponible){const r=await api('/api/centro/ean?'+new URLSearchParams({inventario:id,codigo:valor}));if(!actual(c))return;if(r.ambigua)throw Error('EAN con varios productos: usa la búsqueda y selecciona una línea antes de contar.');if(r.coincidencias.length)sku=r.coincidencias[0].sku;}const q=new URLSearchParams({buscar:sku,limite:'100'});if(state.posicionLineas)q.set('posicion',state.posicionLineas);const r=await api('/api/inventarios/'+id+'/lineas?'+q);if(!actual(c))return;validarPagina(r,'lineas');const rs=r.datos.filter(l=>(l.sku.toUpperCase()===sku.toUpperCase()||l.serie?.toUpperCase()===valor.toUpperCase())&&l.puede_contar);if(r.siguiente)throw Error('Hay más coincidencias. Selecciona primero una ubicación exacta.');const aplicar=async row=>{if(!actual(c)||state.inv?.id!==id||state.posicionLineas!==posicionIntento)return;if(siguienteEtapa(row)!==etapa)throw Error('La etapa seleccionada ya fue guardada o no corresponde. Revisa C1/C2/C3 antes de continuar.');if(!state.lineas.some(l=>l.id===row.id))state.lineas=[row,...state.lineas];const cantidad=sumarLectura(borradores.get(row.id)?.cantidad,cantidadEntrada);await encolarBorrador(row,cantidad);if(rafaga){state.formulario=true;try{await enviarBorrador(row,borradores.get(row.id),c);await cargarLineas();}finally{state.formulario=false;await actualizarPendientes();}}$('ims-scan-codigo').value='';$('ims-scan-codigo').focus();};if(!rs.length)throw Error('No hay una línea autorizada para ese código en esta ubicación.');if(rs.length===1)await aplicar(rs[0]);else for(const row of rs){const b=el('button',row.sku+' · '+row.posicion+' · '+row.cliente,'secundario');b.type='button';b.onclick=async()=>{if(state.scanOcupado||state.formulario)return;state.scanOcupado=true;try{await aplicar(row);$('ims-scan-coincidencias').replaceChildren();}catch(e){errorActual(e,c);}finally{state.scanOcupado=false;}};$('ims-scan-coincidencias').append(b);}}catch(e){errorActual(e,c);}finally{state.scanOcupado=false;}};
