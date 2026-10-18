/** Comprobaciones de interfaz con Chromium y RPC simulados; nunca accede a producción.
 * Requiere Playwright y Chromium instalados en el entorno de desarrollo.
 * IMS_UI_OUTPUT permite conservar capturas fuera del repositorio.
 */
const fs=require('node:fs'),http=require('node:http'),vm=require('node:vm'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=process.env.IMS_UI_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'ims-ui-'));
fs.mkdirSync(out,{recursive:true});
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const permisos=Object.fromEntries(['verDashboard','crearInventario','iniciarFin','consolidar','limpiar','recordatorios','exportar','abrirLibro','gestionUsuarios','verAnalytics','baseDatos','verArchivoHijo','crearUsuarios','editarUsuarios','admin'].map(k=>[k,true]));
const user={nombre:'Usuario de revisión',email:'revision@example.invalid',rol:'Admin',permisos};
const base=new Date(),day=(n)=>new Date(base.getTime()+n*86400000).getTime();
const names=['FLUKE','HYCITE','AIRIS','SG','TELEFÓNICA','VENTURA'];
const fixture={fecha:base.getTime(),kpis:{vencidos:2,hoy:1,proximos7:3,entregadosCronos:2,unidades:3580000,referencias:15500,posiciones:18900,entregadosAnio:197,avanceGlobalMes:0.75,clientesActivosMes:6},chartAnual:Array.from({length:12},(_,i)=>({invent:i<10?12+i:0,slotting:i<10?4:0})),cronograma:names.map((n,i)=>({fila:i+2,cliente:n,titulo:'Inventario cíclico · revisión local',categoria:'Inventario Cíclico',responsable:i?'Usuario de revisión':'',apoyos:[],prioridad:'Media',fechaInicio:day(i-3),fechaFin:day(i-1),duracion:3,fechaEntrega:i===1?day(-2):null,estado:i===1||i===2?'Entregado':i===3?'En Proceso':'Pendiente',pct:i===1||i===2?1:i===3?.5:0,diasRestantes:i-3,urlArchivo:'',fileId:'',wmsUrl:''})),panelUltimos:[{cliente:'HYCITE',responsable:'Usuario de revisión',unidades:12500,efectividad:1,avance:'Entregado',pct:1}],cargaResp:{'Usuario de revisión':4},usuariosActivos:{count:1,nombres:['Usuario de revisión']},equipo:['Usuario de revisión'],clientes:names,consolidacion:{enCurso:false,status:'ERROR',procesados:346,total:346,modo:'tolerante'}};
function browserInit(d,u){
 window.__auditCalls=[];window.__auditUnknown=[];window.__auditFailDashboard=false;
 window.Chart=class{constructor(c,o){this.data=o.data;this.options=o.options}destroy(){}resize(){}update(){}};
 const map={obtenerEstadoIntegralDashboard:d,obtenerClientesEquipoWizard:{clientes:d.clientes,equipo:d.equipo,yo:u.nombre},obtenerEstructuraInicial:{id:'VIRTUAL_ROOT',name:'Itsanet (revisión)'},obtenerSubcarpetas:[{id:'folder-local',name:'INVENTARIOS DE REVISIÓN'}],obtenerEventosCronogramaPorCliente:[],obtenerMiPerfil:{...u,telefono:'',analytics:{}},listarUsuarios:[{...u,activo:true,fila:2}],obtenerAnalyticsGlobal:{porUsuario:[]}};
 function runner(ok,fail){return new Proxy({},{get(t,k){
  if(k==='withSuccessHandler')return cb=>runner(cb,fail);
  if(k==='withFailureHandler')return cb=>runner(ok,cb);
  return(...args)=>{window.__auditCalls.push(k);setTimeout(()=>{try{if(k==='obtenerEstadoIntegralDashboard' && window.__auditFailDashboard)throw Error('Fallo simulado de consulta');if(!(k in map)){window.__auditUnknown.push(k);throw Error('RPC no simulado: '+k)}if(ok)ok(structuredClone(map[k]));}catch(e){if(fail)fail(e);else throw e}},0)};
 }})}
 window.google={script:{url:{getLocation(cb){cb({parameter:{}})}},host:{close(){}},run:runner()}};
}
const bootstrap='<script>('+browserInit.toString()+')('+JSON.stringify(fixture)+','+JSON.stringify(user)+');</script>';

function pageHtml(file){let h=read(file);h=h.replace(/<script\b[^>]*\bsrc=["'][^"']+["'][^>]*><\/script>/gi,'').replace(/<link\b[^>]*fonts\.googleapis[^>]*>/gi,'');h=h.replace(/<\?!=\s*usuarioJSON\s*\?>/g,JSON.stringify(user)).replace(/<\?=\s*webAppUrl\s*\?>/g,'https://example.invalid/exec').replace(/<\?!=\s*include\('WebApp_JS'\);\s*\?>/g,read('WebApp_JS.html')).replace(/<\?[^?]*\?>/g,'');h=h.replace('</head>',bootstrap+'</head>');return h;}
const pages={'/panel':pageHtml('WebApp.html'),'/wizard':pageHtml('AsistenteCreacionV2.html'),'/wms':pageHtml('BlindInventory.html')};
const result={alcance:'Interfaz real con RPC simulados y sustituto de Chart.js; sin servicios de producción.',checks:[],pageErrors:[]};
for(const f of ['WebApp.html','WebApp_JS.html','AsistenteCreacionV2.html'])for(const m of read(f).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1].replace(/<\?[^?]*\?>/g,'null'),{filename:f});
const server=http.createServer((req,res)=>{const h=pages[req.url];res.writeHead(h?200:404,{'Content-Type':'text/html;charset=utf-8'});res.end(h||'');});
let browser;
(async()=>{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-proxy-server']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'America/Guayaquil'});
 await context.route(/https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
 const p=await context.newPage();p.setDefaultTimeout(5000);p.on('pageerror',e=>result.pageErrors.push(e.message));
 const check=async(name,fn)=>{try{await fn();result.checks.push({name,ok:true});console.log('OK',name)}catch(e){result.checks.push({name,ok:false,error:e.message});console.error('FALLO',name,e.message)}};
 await p.goto(origin+'/panel');await p.waitForFunction(()=>document.getElementById('datos-estado').getAttribute('data-state')==='fresh');
 await check('panel, calendario y cronograma',async()=>{assert.equal(await p.locator('#kpi-venc').innerText(),'2');assert.ok(await p.locator('#cron-body .rw').count())});
 await check('ERROR permanece visible con advertencia de KPI',async()=>{assert.ok(await p.locator('#consol-banner').isVisible());assert.match(await p.locator('#consol-banner').innerText(),/incidencias.*|auditoría/);assert.equal(await p.locator('#consol-resume').count(),0)});
 await check('sin reanudación o cancelación para auditor',async()=>{await p.evaluate(()=>{estado.consolidacion={status:'EN_CURSO',total:346,procesados:200};P={};aplicarPermisosBotones();pintarConsolidacion()});assert.equal(await p.locator('#consol-cancel').count(),0);assert.equal(await p.locator('#b-consolidar').isVisible(),false)});
 await check('administrador conserva controles de consolidación',async()=>{await p.evaluate(v=>{P=v;aplicarPermisosBotones();pintarConsolidacion()},permisos);assert.ok(await p.locator('#consol-cancel').isVisible());assert.equal(await p.locator('progress').getAttribute('value'),'58')});
 await check('prevalidación completa no anuncia histórico validado',async()=>{await p.evaluate(()=>{estado.consolidacion={status:'COMPLETADO',modo:'reporte_solo'};pintarConsolidacion()});assert.match(await p.locator('#consol-banner').innerText(),/no reemplaza el histórico/);assert.equal(await p.locator('#consol-banner.consol-state--complete').count(),0)});
 await check('fallo de refresco conserva cifras y muestra reintento',async()=>{await p.evaluate(()=>{window.__auditFailDashboard=true;cargarDashboard(true)});await p.waitForFunction(()=>document.getElementById('datos-estado').getAttribute('data-state')==='error');assert.equal(await p.locator('#kpi-venc').innerText(),'2');assert.ok(await p.locator('#datos-reintentar').isVisible())});
 await check('reintento recupera consulta sin ocultar error histórico',async()=>{await p.evaluate(()=>{window.__auditFailDashboard=false});await p.locator('#datos-reintentar').click();await p.waitForFunction(()=>document.getElementById('datos-estado').getAttribute('data-state')==='fresh');assert.ok(await p.locator('#consol-banner.consol-state--error').isVisible())});
 await check('calendario semana/mes y filtro de entregados',async()=>{await p.evaluate(()=>{calSetVista('mes');calToggleEstado('ent')});assert.equal(await p.evaluate(()=>calEstadoFiltro),'ent');await p.evaluate(()=>{calSetVista('semana');calSetEstado('all')})});
 await check('filtro por cliente conserva el resultado esperado',async()=>{await p.evaluate(()=>{cronPeriodo='all';$('f-cliente').value='VENTURA';pintarCron()});assert.match(await p.locator('#cron-body').innerText(),/VENTURA/);await p.evaluate(()=>{$('f-cliente').value='';cronPeriodo='semana';pintarCron()})});
 await check('detalle KPI abre y cierra',async()=>{await p.evaluate(()=>abrirKpiDetalle('venc'));assert.ok(await p.locator('#modal').isVisible());await p.evaluate(()=>cerrarModal())});
 for(const sec of ['perfil','usuarios','analytics','dashboard'])await check('navegación '+sec,async()=>{await p.evaluate(s=>nav(s),sec);await p.waitForTimeout(50);assert.ok(await p.locator('#sec-'+sec).isVisible())});
 for(const theme of ['dark','light']){
  await p.evaluate(t=>aplicarTema(t),theme);
  await check('gráfico conserva datos y actualiza colores '+theme,async()=>{const r=await p.evaluate(()=>({actual:chart.options.plugins.legend.labels.color,expected:getComputedStyle(document.documentElement).getPropertyValue('--text').trim(),points:chart.data.datasets[0].data.length}));assert.equal(r.actual,r.expected);assert.equal(r.points,12)});
  for(const width of [1440,1024,768,390,360])await check('panel '+theme+' '+width+'px sin desborde',async()=>{await p.setViewportSize({width,height:1000});const m=await p.evaluate(()=>({w:innerWidth,s:document.documentElement.scrollWidth}));assert.ok(m.s<=m.w+2,JSON.stringify(m))});
  await p.setViewportSize({width:1440,height:1000});await p.screenshot({path:path.join(out,'panel-'+theme+'.png'),fullPage:true});
 }
 // El asistente recibe la preferencia visual desde localStorage del mismo origen.
 for(const theme of ['dark','light']){
  await p.evaluate(t=>localStorage.setItem('ims_tema',t),theme);await p.goto(origin+'/wizard');await p.waitForFunction(()=>document.getElementById('wizard-loader').classList.contains('hidden'));
  await check('asistente hereda tema '+theme,async()=>assert.equal(await p.locator('html').getAttribute('data-theme'),theme));
  await check('asistente '+theme+' exige requisitos iniciales',async()=>assert.ok(await p.locator('#btn-procesar').isDisabled()));
  await check('asistente '+theme+' permite BLANK con datos completos',async()=>{await p.locator('#cliente').fill('FLUKE');await p.locator('#fileName').fill('261018_FLUKE');await p.locator('input[name=modo][value=ninguno]').check();await p.locator('.folder-item[data-id="folder-local"]').click();assert.equal(await p.locator('#btn-procesar').isDisabled(),false)});
  await check('asistente '+theme+' exige extracción API',async()=>{await p.locator('.radio-mini').filter({hasText:'API ITSANET'}).click();assert.ok(await p.locator('#btn-procesar').isDisabled())});
  await check('asistente '+theme+' exige carga CSV',async()=>{await p.locator('.radio-mini').filter({hasText:'CSV / TXT'}).click();assert.ok(await p.locator('#btn-procesar').isDisabled())});
  for(const width of [1440,768,390,360])await check('asistente '+theme+' '+width+'px sin desborde',async()=>{await p.setViewportSize({width,height:1000});const m=await p.evaluate(()=>({w:innerWidth,s:document.documentElement.scrollWidth}));assert.ok(m.s<=m.w+2,JSON.stringify(m))});
  await p.setViewportSize({width:1440,height:1000});await p.screenshot({path:path.join(out,'asistente-'+theme+'.png'),fullPage:true});
 }
 await check('sin excepciones de JavaScript',async()=>assert.deepEqual(result.pageErrors,[]));
 await context.close();
})().catch(e=>{result.pageErrors.push(e.message);console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.close();fs.writeFileSync(path.join(out,'resultados.json'),JSON.stringify(result,null,2));const failed=result.checks.filter(x=>!x.ok).length;console.log(JSON.stringify({checks:result.checks.length,failed,pageErrors:result.pageErrors.length,output:out}));if(failed||result.pageErrors.length)process.exitCode=1});
