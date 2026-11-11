import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {crearPoolConteos} from '../../src/mysql/conteos.mjs';
import {fixtureERP,esquemaERP,ERP_ORIGIN,ERP_PASSWORD} from '../fixtures/erp-api.mjs';
import {randomUUID} from 'node:crypto';
if(process.env.IMS_MYSQL_PRUEBAS!=='1'||!/^centromando_ims_pruebas(?:_[a-z0-9]+)?$/.test(process.env.MYSQL_DATABASE||''))throw Error('Solo base de pruebas.');
let pool,browser;before(async()=>{pool=await crearPoolConteos(process.env);await esquemaERP(pool);browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});});after(async()=>{await browser?.close();await pool?.end();});
async function fixture(t,{creacion=false}={}){
 const f=await fixtureERP(pool,t,{creacion}),context=await browser.newContext({viewport:{width:1280,height:950}}),page=await context.newPage(),errors=[],red={perderCreacion:false};
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url());if(u.origin!==ERP_ORIGIN)return route.abort();
  const h={...await r.allHeaders()};for(const k of ['host','connection','content-length','accept-encoding'])delete h[k];
  const response=await fetch(f.base+u.pathname+u.search,{method:r.method(),headers:h,body:['GET','HEAD'].includes(r.method())?undefined:r.postDataBuffer()});
  if(red.perderCreacion&&r.method()==='POST'&&u.pathname==='/api/erp/inventarios'){red.perderCreacion=false;return route.abort('failed');}
  const headers=Object.fromEntries(response.headers);for(const k of ['connection','content-length','transfer-encoding','keep-alive'])delete headers[k];
  return route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())});
 });
 t.after(async()=>{await context.close();assert.deepEqual(errors,[]);});
 await page.goto(ERP_ORIGIN);await page.locator('#correo').fill(f.correo);await page.locator('#contrasena').fill(ERP_PASSWORD);await page.locator('#entrar').click();await page.locator('#operacion').waitFor({state:'visible'});
 await page.goto(ERP_ORIGIN+'/operacion');await page.locator('#op-erp').waitFor({state:'visible'});await page.locator('#op-erp').click();await page.locator('#erp-contenido').waitFor({state:'visible'});
 return {...f,page,interceptar:red};
}
test('navegador ERP: cuentas, variantes SKU y posiciones entre clientes conservan origen y decimales',async t=>{
 const f=await fixture(t),p=f.page;await p.locator('#erp-sede').selectOption('GYE');await p.locator('#erp-skus').fill('0001');await p.locator('#erp-extraer').click();await p.waitForFunction(()=>document.querySelector('#erp-aviso').textContent.includes('Consulta completada'));
 assert.match(await p.locator('#erp-totales').textContent(),/2 líneas · 0,3 unidades/);assert.equal(await p.locator('#erp-filas tr').count(),2);assert.equal(await p.locator('#erp-filas b').count(),0);
 await p.locator('#erp-modo').selectOption('POSICIONES');await p.locator('#erp-posiciones').fill('A');await p.locator('#erp-extraer').click();await p.waitForFunction(()=>document.querySelector('#erp-totales').textContent.includes('1,1 unidades'));
 assert.match(await p.locator('#erp-filas').textContent(),/NOKIA · NOKIACNT/);assert.match(await p.locator('#erp-filas').textContent(),/ALU · ALU/);assert.equal(await p.locator('#erp-filas tr').count(),2);
 await p.setViewportSize({width:390,height:844});await p.locator('#erp-modo').selectOption('SKU');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 const check=await p.locator('#erp-variantes').evaluate(el=>({width:el.getBoundingClientRect().width,display:getComputedStyle(el).display}));
 assert.ok(check.width<40);assert.notEqual(check.display,'block');
});
test('navegador ERP: error conserva datos y fecha anteriores; revocación limpia el stock visible',async t=>{
 const f=await fixture(t),p=f.page;await p.locator('#erp-extraer').click();await p.waitForFunction(()=>document.querySelector('#erp-aviso').textContent.includes('Consulta completada'));
 const fecha=await p.locator('#erp-fecha').textContent(),totales=await p.locator('#erp-totales').textContent();f.red.fallar=true;await p.locator('#erp-extraer').click();await p.waitForFunction(()=>document.querySelector('#erp-aviso').textContent.includes('Se conservan'));
 assert.equal(await p.locator('#erp-fecha').textContent(),fecha);assert.equal(await p.locator('#erp-totales').textContent(),totales);
 await pool.execute('DELETE FROM ims_nat_ambito WHERE actor_id=?',[f.actor]);await p.locator('#erp-extraer').click();await p.waitForFunction(()=>document.querySelector('#erp-resultados').hidden);assert.equal(await p.locator('#erp-filas tr').count(),0);
});
async function prepararCreacion(t){
 const f=await fixture(t,{creacion:true}),p=f.page;await p.locator('#erp-sede').selectOption('GYE');await p.locator('#erp-cuentas input[value="'+f.conexiones[3].referencia+'"]').check();await p.locator('#erp-extraer').click();await p.waitForFunction(()=>document.querySelector('#erp-aviso').textContent.includes('Consulta completada'));await p.locator('#erp-codigo').fill('101126_'+randomUUID());return f;
}
test('navegador: crear desde ALU y ALU SWAP abre el inventario nativo con sus códigos de origen',async t=>{
 const f=await prepararCreacion(t),p=f.page;await p.locator('#erp-crear-enviar').click();await p.locator('#erp-creado').waitFor({state:'visible'});assert.match(await p.locator('#erp-creacion-estado').textContent(),/3 líneas · 1,3 unidades/);
 const href=await p.locator('#erp-creado').getAttribute('href'),id=new URL(href,ERP_ORIGIN).searchParams.get('inventario');await p.locator('#erp-creado').click();await p.locator('#op-lineas tr').first().waitFor();assert.equal(await p.locator('#op-inventario').inputValue(),id);assert.match(await p.locator('#op-lineas').textContent(),/Cuenta ERP: ALU SWAP · ALUSWAP/);assert.match(await p.locator('#op-lineas').textContent(),/Cuenta ERP: ALU · ALU/);
 const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_erp_linea WHERE inventario_id=?',[id]);assert.equal(Number(n.n),3);
});
test('navegador: respuesta de creación perdida y recarga recuperan el mismo inventario sin otra extracción',async t=>{
 const f=await prepararCreacion(t),p=f.page,llamadas=f.red.calls.length;f.interceptar.perderCreacion=true;await p.locator('#erp-crear-enviar').click();await p.locator('#erp-creacion-recuperar').waitFor({state:'visible'});await p.reload();await p.locator('#erp-creacion-recuperar').waitFor({state:'visible'});await p.locator('#erp-creacion-recuperar').click();await p.locator('#erp-creado').waitFor({state:'visible'});
 assert.equal(f.red.calls.length,llamadas);const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_erp_inventario WHERE actor_id=?',[f.actor]);assert.equal(Number(n.n),1);const [[ev]]=await pool.execute("SELECT COUNT(*) AS n FROM ims_nat_evento WHERE actor_id=? AND tipo='crear_erp'",[f.actor]);assert.equal(Number(ev.n),1);
});
test('navegador: almacenamiento bloqueado evita enviar creación sin identificador de recuperación',async t=>{
 const f=await prepararCreacion(t),p=f.page;await p.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('ims_erp_creacion'))throw Error('Bloqueo sintético');return original.call(this,k,v);};});await p.locator('#erp-crear-enviar').click();await p.waitForFunction(()=>document.querySelector('#erp-creacion-estado').textContent.includes('No se envió'));
 const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_erp_inventario WHERE actor_id=?',[f.actor]);assert.equal(Number(n.n),0);
});
