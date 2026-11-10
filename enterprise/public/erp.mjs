const $=id=>document.getElementById(id),state={sesion:null,conexiones:[],consulta:null,resultado:null,siguiente:null,ocupado:false,epoch:0};
function aviso(t,error=false){$('erp-aviso').textContent=t;$('erp-aviso').className=error?'error':'nota';}
function decimal(v){const [n,d='']=String(v).split('.');return n.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+(d.replace(/0+$/,'')?','+d.replace(/0+$/,''):'');}
function limpiar(){state.resultado=null;state.siguiente=null;$('erp-resultados').hidden=true;$('erp-filas').replaceChildren();$('erp-resumen').replaceChildren();}
async function api(path,body){
 const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000),headers:body?{'Content-Type':'application/json','X-IMS-CSRF':state.sesion.csrf}:{},body:body?JSON.stringify(body):undefined});
 let data;try{data=await response.json();}catch{throw Error('Respuesta incompleta; consulta nuevamente el estado.');}
 if(!response.ok){if([401,403,410].includes(response.status))limpiar();throw Object.assign(Error(data.mensaje||'No se pudo completar la consulta.'),{status:response.status});}return data;
}
function modo(){const posiciones=$('erp-modo').value==='POSICIONES';$('erp-panel-cuentas').hidden=posiciones;$('erp-panel-posiciones').hidden=!posiciones;}
function cuentas(){
 $('erp-cuentas').replaceChildren();const lista=state.conexiones.filter(c=>c.sede===$('erp-sede').value),grupos=new Map();
 for(const c of lista){if(!grupos.has(c.clienteNombre))grupos.set(c.clienteNombre,[]);grupos.get(c.clienteNombre).push(c);}
 const preferida=lista.find(c=>c.etiqueta===(c.sede==='UIO'?'BELIA':'ALU'))?.referencia??lista[0]?.referencia;
 for(const [grupo,cs] of grupos){
  const bloque=document.createElement('div'),titulo=document.createElement('strong');titulo.textContent=grupo;bloque.append(titulo);
  for(const c of cs){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=c.referencia;input.checked=c.referencia===preferida;input.dataset.cuenta='1';label.append(input,document.createTextNode(' '+c.etiqueta+' · '+c.codigosCliente.join(', ')));bloque.append(label);}
  $('erp-cuentas').append(bloque);
 }
}
function celdas(body,textos){const tr=document.createElement('tr');for(const t of textos){const td=document.createElement('td');td.textContent=t;tr.append(td);}body.append(tr);}
function mostrar(r,mas=false){
 const cantidad=v=>typeof v==='string'&&/^\d{1,30}\.\d{9}$/.test(v),entero=v=>Number.isInteger(v)&&v>=0;
 if(r.estado!=='LISTA'||!Array.isArray(r.filas)||!r.totales||!Array.isArray(r.cuentas)||r.soloPrevisualizacion!==true||!cantidad(r.totales.unidades)||!entero(r.totales.lineas)||!Number.isFinite(Date.parse(r.creadaEn))||!(r.siguiente===null||entero(r.siguiente))||r.cuentas.some(c=>!c||typeof c.etiqueta!=='string'||typeof c.clienteNombre!=='string'||!cantidad(c.unidades)||![c.filasRecibidas,c.filasSeleccionadas,c.lineas].every(entero))||r.filas.some(f=>!f||!entero(f.numero)||!cantidad(f.depot)||!['clienteNombre','codigoClienteERP','sku','descripcion','posicion','serie','lote','unidad'].every(k=>typeof f[k]==='string')))throw Error('Resultado incompleto.');
 if(!mas){
  state.resultado=r;limpiarTablas();$('erp-resultados').hidden=false;
  $('erp-fecha').textContent='Extracción iniciada: '+new Date(r.creadaEn).toLocaleString('es-EC',{timeZone:'America/Guayaquil'});
  $('erp-totales').textContent=r.totales.lineas+' líneas · '+decimal(r.totales.unidades)+' unidades · '+r.totales.cuentas+' cuentas';
  for(const c of r.cuentas)celdas($('erp-resumen'),[c.etiqueta+' · '+c.clienteNombre,c.filasRecibidas,c.filasSeleccionadas,c.lineas,decimal(c.unidades)]);
 }
 for(const f of r.filas)celdas($('erp-filas'),[f.numero,f.clienteNombre+' · '+f.codigoClienteERP,f.sku+' · '+f.descripcion,f.posicion,[f.serie,f.lote].filter(Boolean).join(' / '),decimal(f.depot)+' '+f.unidad]);
 state.siguiente=r.siguiente;$('erp-mas').hidden=r.siguiente===null;
}
function limpiarTablas(){$('erp-filas').replaceChildren();$('erp-resumen').replaceChildren();}
function ocupado(v){state.ocupado=v;$('erp-controles').disabled=v;$('erp-mas').disabled=v;}
async function consultar(id,epoch){
 const r=await api('/api/erp/consultas/'+id);if(epoch!==state.epoch||state.consulta!==id)return;
 if(r.consultaId!==id)throw Error('La respuesta corresponde a otra consulta.');
 $('erp-progreso').textContent='Cuentas consultadas: '+r.progreso.completadas+' de '+r.progreso.total+(r.progreso.cuentaActual?' · '+r.progreso.cuentaActual:'');
 if(r.estado==='CONSULTANDO'){setTimeout(()=>{consultar(id,epoch).catch(fallo);},1500);return;}
 ocupado(false);$('erp-recuperar').hidden=true;
 if(r.estado==='ERROR'){state.consulta=null;throw Error(r.error?.mensaje||'No se completó la extracción.');}
 mostrar(r);aviso('Consulta completada. No se crearon inventarios.');
}
function fallo(e){ocupado(false);$('erp-recuperar').hidden=!state.consulta||[401,403,410].includes(e.status);aviso(e.message+(state.resultado?' Se conservan los resultados de la extracción anterior.':''),true);}
$('erp-sede').addEventListener('change',cuentas);$('erp-modo').addEventListener('change',modo);
$('erp-form').addEventListener('submit',async e=>{
 e.preventDefault();if(state.ocupado)return;
 const posiciones=$('erp-modo').value==='POSICIONES';
 const body={consultaId:crypto.randomUUID(),sede:$('erp-sede').value,modo:posiciones?'POSICIONES':'SKU',referencias:posiciones?[]:[...document.querySelectorAll('[data-cuenta]:checked')].map(c=>c.value),skus:posiciones?[]:$('erp-skus').value.split(/[\s,;]+/).filter(Boolean),posiciones:posiciones?$('erp-posiciones').value.split(/[\r\n,;]+/).map(s=>s.trim()).filter(Boolean):[],incluirVariantes:!posiciones&&$('erp-variantes').checked};
 if(new TextEncoder().encode(JSON.stringify(body)).length>15000){aviso('La lista es demasiado extensa. Reduce los códigos o posiciones.',true);return;}
 state.consulta=body.consultaId;const epoch=++state.epoch;ocupado(true);$('erp-recuperar').hidden=true;aviso('Consultando stock ERP…');
 try{await api('/api/erp/consultas',body);await consultar(body.consultaId,epoch);}catch(error){if(error.status){state.consulta=null;}fallo(error);}
});
$('erp-recuperar').addEventListener('click',()=>{if(!state.consulta)return;ocupado(true);$('erp-recuperar').hidden=true;consultar(state.consulta,state.epoch).catch(fallo);});
$('erp-mas').addEventListener('click',async()=>{
 if(state.ocupado||state.siguiente===null||!state.resultado)return;ocupado(true);
 const epoch=state.epoch;
 try{const id=state.resultado.consultaId,r=await api('/api/erp/consultas/'+id+'?desde='+state.siguiente);if(epoch!==state.epoch||!state.resultado)return;if(r.consultaId!==id)throw Error('Consulta incompatible.');mostrar(r,true);}catch(e){fallo(e);}finally{ocupado(false);}
});
async function revisarSesion(){
 if(!state.sesion)return;
 try{
  const s=await api('/api/sesion');
  if(s.usuario?.actorId!==state.sesion.usuario.actorId||!s.erpDisponible){state.epoch++;state.consulta=null;state.sesion=null;limpiar();$('erp-contenido').hidden=true;aviso('La sesión cambió. Vuelve a entrar a esta pantalla.',true);}
 }catch(e){if([401,403].includes(e.status)){state.epoch++;state.consulta=null;state.sesion=null;$('erp-contenido').hidden=true;}fallo(e);}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void revisarSesion();});
window.addEventListener('pageshow',()=>{void revisarSesion();});
async function iniciar(){
 state.sesion=await api('/api/sesion');if(!state.sesion.erpDisponible)throw Error('La consulta ERP todavía no está habilitada.');
 const r=await api('/api/erp/conexiones');if(!Array.isArray(r.sedes)||!Array.isArray(r.conexiones))throw Error('Contexto ERP incompleto.');
 state.conexiones=r.conexiones;$('erp-sede').replaceChildren(...r.sedes.map(s=>new Option(s,s)));if(r.sedes.includes('UIO'))$('erp-sede').value='UIO';
 $('erp-usuario').textContent=state.sesion.usuario.correo;$('erp-contenido').hidden=false;cuentas();modo();aviso('Selecciona las cuentas o posiciones que vas a revisar.');
}
void iniciar().catch(fallo);
