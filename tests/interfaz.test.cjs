const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../WebApp_JS.html'),'utf8').replace(/^<script>\s*/,'').replace(/<\/script>\s*$/,'');
function setup(permisos={admin:true,baseDatos:true}){
 const nodes={},storage=new Map(),calls=[],toasts=[];
 const node=id=>nodes[id]||=( {innerText:'',innerHTML:'',hidden:false,style:{},attributes:{},setAttribute(k,v){this.attributes[k]=String(v)},value:'',classList:{add(){},remove(){}}} );
 ['datos-estado','datos-mensaje','datos-actualizados','datos-reintentar','consol-banner','theme-toggle','f-cliente','refresh-ind'].forEach(node);
 const document={addEventListener(){},documentElement:{setAttribute(){},getAttribute:()=> 'dark'},querySelector:()=>null,getElementById(id){
  if(/^consol-(resume|cancel)$/.test(id))return node('consol-banner').innerHTML.includes('id="'+id+'"')?node(id):null;
  return nodes[id]||null;
 }};
 function runner(ok,fail){return new Proxy({},{get(_,k){if(k==='withSuccessHandler')return cb=>runner(cb,fail);if(k==='withFailureHandler')return cb=>runner(ok,cb);return(...args)=>calls.push({method:k,args,ok,fail})}})}
 const window={addEventListener(){},USUARIO:{email:'admin@example.invalid',nombre:'Prueba',rol:'Admin',permisos},__WEBAPP_URL__:'https://example.invalid/app-A',location:{pathname:'/panel'},scrollY:0,scrollTo(){}};
 const c=vm.createContext({window,document,console,Date,JSON,Number,Math,Array,String,encodeURIComponent,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},google:{script:{run:runner()}},setTimeout:()=>0,clearTimeout(){}});
 vm.runInContext(source,c);c.toast=(msg,type)=>toasts.push({msg,type});
 return{c,nodes,storage,calls,toasts,window};
}
const datos=()=>({kpis:{vencidos:1},cronograma:[],consolidacion:{status:'ERROR',total:346,procesados:346}});
test('ERROR permanece visible sin controles de reanudación ni validación positiva',()=>{
 const {c,nodes}=setup();c.estado=datos();c.pintarConsolidacion();
 assert.equal(nodes['consol-banner'].hidden,false);assert.match(nodes['consol-banner'].className,/--error/);
 assert.match(nodes['consol-banner'].innerHTML,/con incidencias/);assert.doesNotMatch(nodes['consol-banner'].innerHTML,/id="consol-(resume|cancel)"|--complete/);
});
test('cancelación y prevalidación completada no se presentan como un histórico aprobado',()=>{
 const {c,nodes}=setup();c.estado={consolidacion:{status:'CANCELADO'}};c.pintarConsolidacion();
 assert.match(nodes['consol-banner'].className,/--cancelled/);
 c.estado.consolidacion={status:'COMPLETADO',modo:'reporte_solo'};c.pintarConsolidacion();
 assert.doesNotMatch(nodes['consol-banner'].className,/--complete/);assert.match(nodes['consol-banner'].innerHTML,/no reemplaza el histórico/);
});
test('administrador conserva los mismos endpoints de reanudar y cancelar',()=>{
 const {c,nodes,calls}=setup();c.estado={consolidacion:{status:'EN_CURSO',procesados:1,total:2}};c.pintarConsolidacion();
 nodes['consol-resume'].onclick();assert.equal(calls[0].method,'dash_continuarConsolidacion');
 c.confirm=()=>true;nodes['consol-cancel'].onclick();assert.equal(calls[1].method,'dash_cancelarConsolidacion');
});
test('auditor consulta progreso sin controles de modificación',()=>{
 const {c,nodes}=setup({});c.estado={consolidacion:{status:'EN_CURSO',procesados:1,total:2}};c.pintarConsolidacion();
 assert.match(nodes['consol-banner'].innerHTML,/<progress/);assert.doesNotMatch(nodes['consol-banner'].innerHTML,/id="consol-(resume|cancel)"/);
});
test('fallo de actualización silenciosa conserva datos y hora, y ofrece reintento visible',()=>{
 const {c,nodes,calls}=setup();const old=datos();c.estado=old;c._mostrarEstadoDatos('fresh',Date.now()-60000);const hora=nodes['datos-actualizados'].innerText;
 c.cargarDashboard(true);calls[0].fail({message:'sin conexión'});
 assert.equal(c.estado,old);assert.equal(nodes['datos-actualizados'].innerText,hora);assert.equal(nodes['datos-estado'].attributes['data-state'],'error');assert.equal(nodes['datos-reintentar'].hidden,false);
});
test('respuesta incompleta no reemplaza el estado existente ni anuncia datos frescos',()=>{
 const {c,nodes,calls}=setup();const old=datos();c.estado=old;c.cargarDashboard(true);calls[0].ok(null);
 assert.equal(c.estado,old);assert.equal(nodes['datos-estado'].attributes['data-state'],'error');
});
test('actualización correcta conserva consulta de solo lectura y guarda caché por usuario/proyecto',()=>{
 const {c,nodes,calls,storage}=setup();c.estado=datos();c.pintarDashboard=()=>{};c.cargarDashboard(true);calls[0].ok(datos());
 assert.equal(calls[0].method,'obtenerEstadoIntegralDashboard');assert.equal(nodes['datos-estado'].attributes['data-state'],'fresh');
 assert.equal(JSON.parse(storage.get(c._claveCacheDashboard())).d.consolidacion.status,'ERROR');
});
test('caché ajena por usuario o proyecto no se reutiliza',()=>{
 const {c,storage,window}=setup();storage.set(c._claveCacheDashboard(),JSON.stringify({t:Date.now(),d:datos()}));
 window.USUARIO.email='otro@example.invalid';assert.equal(c._pintarDesdeCache(),false);
 window.USUARIO.email='admin@example.invalid';window.__WEBAPP_URL__='https://example.invalid/app-B';assert.equal(c._pintarDesdeCache(),false);
});
test('caché válida se identifica como copia local; copias vencidas o futuras se descartan',()=>{
 const {c,nodes,storage}=setup();c.pintarDashboard=()=>{};
 storage.set(c._claveCacheDashboard(),JSON.stringify({t:Date.now()-1000,d:datos()}));assert.equal(c._pintarDesdeCache(),true);assert.equal(nodes['datos-estado'].attributes['data-state'],'cache');
 for(const t of [Date.now()-13*3600000,Date.now()+3600000]){storage.set(c._claveCacheDashboard(),JSON.stringify({t,d:datos()}));assert.equal(c._pintarDesdeCache(),false)}
});
test('no se superponen consultas manuales y automáticas',()=>{
 const {c,calls}=setup();c.estado=datos();c.cargarDashboard(true);c.cargarDashboard(false);assert.equal(calls.length,1);
});
