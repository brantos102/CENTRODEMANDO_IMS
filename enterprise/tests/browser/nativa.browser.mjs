import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {crearPoolConteos} from '../../src/mysql/conteos.mjs';
import {crearHashPassword} from '../../src/auth/credenciales.mjs';
import {crearApi} from '../../src/http/api.mjs';
const ORIGIN='https://ims-nativa.invalid',PASSWORD='Clave_nativa_sintetica_2026!';
if(process.env.IMS_MYSQL_PRUEBAS!=='1'||!/^centromando_ims_pruebas(?:_[a-z0-9]+)?$/.test(process.env.MYSQL_DATABASE||''))throw Error('Solo base de pruebas.');
let pool,browser;
before(async()=>{pool=await crearPoolConteos(process.env);browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});});
after(async()=>{await browser?.close();await pool?.end();});
async function fixture(t,{camara=false}={}){
 const actor=randomUUID(),cliente=randomUUID(),correo=actor+'@sintetico.invalid';
 await pool.execute('INSERT INTO ims_op_actor VALUES (?,1)',[actor]);
 await pool.execute('INSERT INTO ims_auth_usuario(actor_id,correo,nombre,password_hash) VALUES (?,?,?,?)',[actor,correo,'Administrador sintético',await crearHashPassword(PASSWORD)]);
 await pool.execute("INSERT INTO ims_nat_ambito VALUES (?,'UIO','ADMIN')",[actor]);
 await pool.execute('INSERT INTO ims_op_cliente VALUES (?,?)',[cliente,'CLIENTE BROWSER '+cliente]);
 const server=crearApi({pool,publicUrl:ORIGIN,operacionNativa:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const context=await browser.newContext({viewport:{width:1280,height:950}}),page=await context.newPage();
 const red={perderSerie:false};
 const base='http://127.0.0.1:'+server.address().port,errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const r=route.request(),url=new URL(r.url());if(url.origin!==ORIGIN)return route.abort();
  const headers={...await r.allHeaders()};for(const k of ['host','connection','content-length','accept-encoding'])delete headers[k];
  const response=await fetch(base+url.pathname+url.search,{method:r.method(),headers,body:['GET','HEAD'].includes(r.method())?undefined:r.postDataBuffer()});
  const h=Object.fromEntries(response.headers);for(const k of ['connection','content-length','transfer-encoding','keep-alive'])delete h[k];
  const body=Buffer.from(await response.arrayBuffer());
  if(red.perderSerie&&url.pathname==='/api/operacion/serie'&&r.method()==='POST'){red.perderSerie=false;return route.abort('failed');}
  await route.fulfill({status:response.status,headers:h,body});
 });
 t.after(async()=>{await context.close();server.closeAllConnections();await new Promise(r=>server.close(r));assert.deepEqual(errors,[]);});
 if(camara)await context.addInitScript(()=>{
  window.__camaraDetenida=0;window.__codigoCamara='SN-00001234';
  Object.defineProperty(HTMLMediaElement.prototype,'readyState',{get:()=>2});HTMLMediaElement.prototype.play=async()=>{};
  window.BarcodeDetector=class{static async getSupportedFormats(){return ['code_128'];}async detect(){return [{rawValue:window.__codigoCamara}];}};
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async options=>{
   window.__audioCamara=options.audio;const stream=document.createElement('canvas').captureStream();
   for(const t of stream.getTracks()){const stop=t.stop.bind(t);t.stop=()=>{window.__camaraDetenida++;stop();};}return stream;
  }});
 });
 await page.goto(ORIGIN);await page.locator('#correo').fill(correo);await page.locator('#contrasena').fill(PASSWORD);await page.locator('#entrar').click();await page.locator('#operacion').waitFor({state:'visible'});
 await page.goto(ORIGIN+'/operacion');await page.locator('#op-contenido').waitFor({state:'visible'});
 return {page,actor,cliente,red};
}
test('navegador: crear, cargar CSV, reanudar carga, activar, contar cero y entregar con confirmación',async t=>{
 const f=await fixture(t),p=f.page;
 await p.locator('#op-creacion summary').click();await p.locator('#op-codigo').fill('091126_BROWSER');await p.locator('#op-clientes').selectOption(f.cliente);await p.locator('#op-fecha').fill('2026-11-09');
 await p.locator('#op-crear button').click();await p.waitForFunction(()=>document.querySelector('#op-detalle').textContent.includes('091126_BROWSER'));
 const inv=await p.locator('#op-inventario').inputValue();
 const csv={name:'stock.csv',mimeType:'text/csv',buffer:Buffer.from('sku,depot,posicion\r\n0001,10,A-01\r\n0001,4,A-02\r\n')};
 await p.locator('#op-csv').setInputFiles(csv);await p.locator('#op-cargar button').click();await p.waitForFunction(()=>document.querySelector('#op-total-filas').value==='2'&&document.querySelector('#op-lineas').rows.length===2);
 await p.locator('#op-cargar button').click();await p.waitForFunction(()=>!document.querySelector('#op-cargar button').disabled);
 await p.locator('#op-activar button').click();await p.locator('#op-cargar').waitFor({state:'hidden'});
 await p.goto(ORIGIN);await p.locator('#operacion').waitFor({state:'visible'});await p.locator('.inventario').first().click();
 await p.getByRole('button',{name:'Contar · 1',exact:true}).first().click();await p.locator('#cantidad').fill('0');await p.locator('#guardar-conteo').click();
 await p.waitForFunction(()=>document.querySelector('#aviso').textContent.includes('confirmado'));
 await p.goto(ORIGIN+'/operacion');await p.locator('#op-inventario').selectOption(inv);await p.waitForFunction(()=>document.querySelector('#op-detalle').textContent.includes('091126_BROWSER'));
 await p.locator('#op-analisis').click();await p.waitForFunction(()=>document.querySelector('#op-kpis').textContent.includes('avance 1/2'));
 await p.locator('#op-destino').selectOption('EN_VALIDACION');await p.locator('#op-estado button').click();await p.waitForFunction(()=>document.querySelector('#op-detalle').textContent.includes('EN_VALIDACION'));
 await p.locator('#op-destino').selectOption('ENTREGADO');await p.locator('#op-entrega').fill('2026-11-09');await p.locator('#op-estado button').click();await p.waitForFunction(()=>document.querySelector('#op-aviso').textContent.includes('incompleto'));
 await p.locator('#op-incompleto').check();await p.locator('#op-estado button').click();await p.waitForFunction(()=>document.querySelector('#op-detalle').textContent.includes('ENTREGADO'));
 const [[n]]=await pool.execute('SELECT COUNT(*) AS n,SUM(conteo_1=0) AS ceros FROM ims_op_linea WHERE inventario_id=?',[inv]);assert.equal(Number(n.n),2);assert.equal(Number(n.ceros),1);
});

test('navegador: cámara sintética, respuesta perdida y recarga registran una serie; desconocida pasa a alterna',async t=>{
 const f=await fixture(t,{camara:true}),p=f.page;
 const inv=await p.evaluate(async cliente=>{
  const s=await (await fetch('/api/sesion')).json();
  const post=async(tipo,body)=>{const r=await fetch('/api/operacion/'+tipo,{method:'POST',headers:{'Content-Type':'application/json','X-IMS-CSRF':s.csrf},body:JSON.stringify({operacionId:crypto.randomUUID(),...body})});const d=await r.json();if(!r.ok)throw Error(d.mensaje);return d;};
  const c=await post('crear',{sede:'UIO',codigo:'091126_SERIE_BROWSER',clientes:[cliente],fechaInicio:'2026-11-09'});
  const l=await post('lineas',{inventarioId:c.inventarioId,versionEsperada:c.version,filas:[{numero:1,clienteId:cliente,sku:'0001',serie:'SN-00001234',depot:'1',posicion:'A-01'}]});
  await post('activar',{inventarioId:c.inventarioId,versionEsperada:l.version,filasEsperadas:1,depotEsperado:'1'});return c.inventarioId;
 },f.cliente);
 await p.locator('#op-actualizar').click();await p.locator('#op-inventario option[value="'+inv+'"]').waitFor({state:'attached'});await p.locator('#op-inventario').selectOption(inv);await p.locator('#op-capturas').waitFor({state:'visible'});
 await p.locator('#op-camara-abrir').click();await p.locator('#op-serie-guardar').waitFor({state:'visible'});
 assert.equal(await p.locator('#op-serie').inputValue(),'SN-00001234');assert.equal(await p.evaluate(()=>window.__audioCamara),false);assert.equal(await p.evaluate(()=>window.__camaraDetenida),1);
 f.red.perderSerie=true;await p.locator('#op-serie-guardar button').click();await p.locator('#op-pendiente').waitFor({state:'visible'});
 await p.reload();await p.locator('#op-contenido').waitFor({state:'visible'});await p.locator('#op-reintentar').click();await p.locator('#op-pendiente').waitFor({state:'hidden'});
 const [[l]]=await pool.execute('SELECT conteo_1,conteo_2 FROM ims_op_linea WHERE inventario_id=?',[inv]);assert.equal(l.conteo_1,'1.000000000');assert.equal(l.conteo_2,null);
 await p.locator('#op-serie').fill('SN-00001235');await p.locator('#op-serie-consultar button').click();await p.locator('#op-serie-hallazgo').waitFor({state:'visible'});await p.locator('#op-serie-sku').fill('0000');await p.locator('#op-serie-posicion').fill('ALTERNATIVA');
 await p.locator('#op-serie-guardar button').click();await p.waitForFunction(()=>document.querySelector('#op-aviso').textContent.includes('parecidas'));
 await p.locator('#op-serie-similar').check();await p.locator('#op-serie-guardar button').click();await p.waitForFunction(()=>document.querySelector('#op-serie').value==='');
 await p.locator('#op-historial-tipo').selectOption('hallazgos');await p.locator('#op-historial').click();await p.waitForFunction(()=>document.querySelector('#op-historial-filas').rows.length===1);
 assert.ok((await p.locator('#op-historial-filas').innerText()).includes('0000'));
 const [[total]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_op_linea WHERE inventario_id=?',[inv]);assert.equal(Number(total.n),1);
});

test('navegador: dos coincidencias no preseleccionan una línea; el operador elige la ubicación explícita',async t=>{
 const f=await fixture(t),p=f.page;
 const inv=await p.evaluate(async cliente=>{
  const s=await (await fetch('/api/sesion')).json();const post=async(tipo,body)=>{const r=await fetch('/api/operacion/'+tipo,{method:'POST',headers:{'Content-Type':'application/json','X-IMS-CSRF':s.csrf},body:JSON.stringify({operacionId:crypto.randomUUID(),...body})});const d=await r.json();if(!r.ok)throw Error(d.mensaje);return d;};
  const c=await post('crear',{sede:'UIO',codigo:'091126_AMBIGUA',clientes:[cliente],fechaInicio:'2026-11-09'});
  const l=await post('lineas',{inventarioId:c.inventarioId,versionEsperada:c.version,filas:['A','B'].map((pos,i)=>({numero:i+1,clienteId:cliente,sku:'0001',serie:'SN-AMBIGUA',depot:'1',posicion:pos}))});
  await post('activar',{inventarioId:c.inventarioId,versionEsperada:l.version,filasEsperadas:2,depotEsperado:'2'});return c.inventarioId;
 },f.cliente);
 await p.locator('#op-actualizar').click();await p.locator('#op-inventario option[value="'+inv+'"]').waitFor({state:'attached'});await p.locator('#op-inventario').selectOption(inv);await p.locator('#op-capturas').waitFor({state:'visible'});
 await p.locator('#op-serie').fill('SN-AMBIGUA');await p.locator('#op-serie-consultar button').click();await p.locator('#op-serie-guardar').waitFor({state:'visible'});
 assert.equal(await p.locator('#op-serie-linea').inputValue(),'');await p.locator('#op-serie-guardar button').click();await p.waitForFunction(()=>document.querySelector('#op-aviso').textContent.includes('Selecciona una línea'));
 const [[antes]]=await pool.execute('SELECT SUM(conteo_1 IS NOT NULL) AS n FROM ims_op_linea WHERE inventario_id=?',[inv]);assert.equal(Number(antes.n),0);
 const [[destino]]=await pool.execute("SELECT l.id FROM ims_op_linea l JOIN ims_op_detalle_linea d ON d.linea_id=l.id WHERE l.inventario_id=? AND d.posicion='B'",[inv]);
 await p.locator('#op-serie-linea').selectOption(destino.id);await p.locator('#op-serie-guardar button').click();await p.waitForFunction(()=>document.querySelector('#op-serie').value==='');
 const [rows]=await pool.execute('SELECT l.id,l.conteo_1 FROM ims_op_linea l WHERE l.inventario_id=?',[inv]);assert.equal(rows.filter(r=>r.conteo_1!==null).length,1);assert.equal(rows.find(r=>r.id===destino.id).conteo_1,'1.000000000');
});
