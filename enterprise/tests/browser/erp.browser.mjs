import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {crearPoolConteos} from '../../src/mysql/conteos.mjs';
import {fixtureERP,esquemaERP,ERP_ORIGIN,ERP_PASSWORD} from '../fixtures/erp-api.mjs';
if(process.env.IMS_MYSQL_PRUEBAS!=='1'||!/^centromando_ims_pruebas(?:_[a-z0-9]+)?$/.test(process.env.MYSQL_DATABASE||''))throw Error('Solo base de pruebas.');
let pool,browser;before(async()=>{pool=await crearPoolConteos(process.env);await esquemaERP(pool);browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});});after(async()=>{await browser?.close();await pool?.end();});
async function fixture(t){
 const f=await fixtureERP(pool,t),context=await browser.newContext({viewport:{width:1280,height:950}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url());if(u.origin!==ERP_ORIGIN)return route.abort();
  const h={...await r.allHeaders()};for(const k of ['host','connection','content-length','accept-encoding'])delete h[k];
  const response=await fetch(f.base+u.pathname+u.search,{method:r.method(),headers:h,body:['GET','HEAD'].includes(r.method())?undefined:r.postDataBuffer()});
  const headers=Object.fromEntries(response.headers);for(const k of ['connection','content-length','transfer-encoding','keep-alive'])delete headers[k];
  return route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())});
 });
 t.after(async()=>{await context.close();assert.deepEqual(errors,[]);});
 await page.goto(ERP_ORIGIN);await page.locator('#correo').fill(f.correo);await page.locator('#contrasena').fill(ERP_PASSWORD);await page.locator('#entrar').click();await page.locator('#operacion').waitFor({state:'visible'});
 await page.goto(ERP_ORIGIN+'/operacion');await page.locator('#op-erp').waitFor({state:'visible'});await page.locator('#op-erp').click();await page.locator('#erp-contenido').waitFor({state:'visible'});
 return {...f,page};
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
