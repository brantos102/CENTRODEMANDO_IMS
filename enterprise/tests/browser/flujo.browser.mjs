import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {crearPoolConteos} from '../../src/mysql/conteos.mjs';
import {crearHashPassword} from '../../src/auth/credenciales.mjs';
import {crearApi} from '../../src/http/api.mjs';
if(process.env.IMS_MYSQL_PRUEBAS!=='1'||!/^centromando_ims_pruebas(?:_[a-z0-9]+)?$/.test(process.env.MYSQL_DATABASE||''))
  throw Error('Solo se admite una base exclusiva de pruebas.');
const ORIGIN='https://ims-candidata.invalid',PASSWORD='Clave_sintetica_2026!';
let pool,browser,passwordHash;
before(async()=>{
  pool=await crearPoolConteos(process.env);passwordHash=await crearHashPassword(PASSWORD);
  for(const name of ['002_conteo_operativo.sql','003_autenticacion.sql','004_detalle_linea.sql']){
    const text=await readFile(new URL('../../sql/'+name,import.meta.url),'utf8');
    for(const sql of text.replace(/^--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean))await pool.query(sql);
  }
  browser=await chromium.launch({executablePath:process.env.IMS_BROWSER_EXECUTABLE||'/usr/bin/chromium',headless:true,
    args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
});
after(async()=>{if(browser)await browser.close();if(pool)await pool.end();});
async function fixture(t,options={}){
  const f={actor:randomUUID(),lector:randomUUID(),cliente:randomUUID(),otroCliente:randomUUID(),inv:randomUUID(),a:randomUUID(),b:randomUUID(),oculta:randomUUID(),requests:[],fault:null};
  f.correo=f.actor+'@prueba.invalid';f.correoLector=f.lector+'@prueba.invalid';
  await pool.execute('INSERT INTO ims_op_actor (id,activo) VALUES (?,1),(?,1)',[f.actor,f.lector]);
  await pool.execute('INSERT INTO ims_auth_usuario (actor_id,correo,nombre,password_hash) VALUES (?,?,?,?),(?,?,?,?)',
    [f.actor,f.correo,'Operador de demostración',passwordHash,f.lector,f.correoLector,'Lector de demostración',passwordHash]);
  await pool.execute('INSERT INTO ims_op_cliente (id,nombre) VALUES (?,?),(?,?)',[f.cliente,'CLIENTE DEMO A',f.otroCliente,'CLIENTE NO AUTORIZADO']);
  await pool.execute('INSERT INTO ims_op_inventario (id,sede,codigo_operativo,estado) VALUES (?,?,?,?)',[f.inv,'UIO','DEMO_UIO_01','EN_PROCESO']);
  for(const c of [f.cliente,f.otroCliente])await pool.execute('INSERT INTO ims_op_inventario_cliente (inventario_id,cliente_id) VALUES (?,?)',[f.inv,c]);
  for(const [a,p] of [[f.actor,1],[f.lector,0]])await pool.execute('INSERT INTO ims_op_permiso (actor_id,inventario_id,cliente_id,puede_contar) VALUES (?,?,?,?)',[a,f.inv,f.cliente,p]);
  for(const [id,c,pos] of [[f.a,f.cliente,'A-01-01'],[f.b,f.cliente,'A-02-01'],[f.oculta,f.otroCliente,'B-01-01']]){
    await pool.execute('INSERT INTO ims_op_linea (id,inventario_id,cliente_id,sku,observacion) VALUES (?,?,?,?,?)',[id,f.inv,c,'000123','Nota humana']);
    await pool.execute('INSERT INTO ims_op_detalle_linea (linea_id,posicion,descripcion,serie,lote,unidad) VALUES (?,?,?,?,?,?)',
      [id,pos,'Consumible de demostración',null,'LOTE DEMO','UN']);
  }
  const server=crearApi({pool,publicUrl:ORIGIN,soloLectura:options.soloLectura===true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const context=await browser.newContext({viewport:{width:1440,height:1000}});f.page=await context.newPage();
  if(options.sinAlmacen)await f.page.addInitScript(()=>Object.defineProperty(window,'indexedDB',{get(){throw Error('Almacenamiento bloqueado en ensayo');}}));
  const errors=[];f.page.on('pageerror',e=>errors.push(e.message));
  // Proxy de prueba: todos los recursos/llamadas del origen reservado se envían
  // al HTTP local real. No se deshabilita TLS ni se contacta un dominio externo;
  // no se presenta este proxy de prueba como una validación del TLS empresarial.
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==ORIGIN)return route.abort();
    if(url.pathname==='/api/resumen'&&f.fault==='resumen-incompleto')return route.fulfill({status:200,contentType:'application/json',body:'{"totales":{"conteos":"999"}}'});
    const count=url.pathname==='/api/conteos'&&request.method()==='POST';
    if(url.pathname.endsWith('/lineas')&&f.fault==='pagina-incompleta')return route.fulfill({status:200,contentType:'application/json',body:'{"datos":null}'});
    if(count){f.requests.push(request.postDataJSON());if(f.fault==='antes')return route.abort('failed');}
    const headers={...await request.allHeaders()};
    for(const k of ['host','connection','content-length','accept-encoding'])delete headers[k];
    try{
      const r=await fetch(base+url.pathname+url.search,{method:request.method(),headers,
        body:['GET','HEAD'].includes(request.method())?undefined:request.postDataBuffer()});
      const body=Buffer.from(await r.arrayBuffer());
      if(count&&f.fault==='despues')return route.abort('failed');
      const h=Object.fromEntries(r.headers);
      for(const k of ['connection','transfer-encoding','content-length','keep-alive'])delete h[k];
      if(url.pathname.endsWith('/lineas')&&f.fault==='demorar-pagina'){
        f.fault=null;f.liberarPagina=()=>route.fulfill({status:r.status,headers:h,body});return;
      }
      await route.fulfill({status:r.status,headers:h,body});
    }catch{await route.abort('failed');}
  });
  t.after(async()=>{await context.close();server.closeAllConnections();await new Promise(r=>server.close(r));assert.deepEqual(errors,[]);});
  f.login=async(lector=false)=>{
    await f.page.locator('#correo').fill(lector?f.correoLector:f.correo);
    await f.page.locator('#contrasena').fill(PASSWORD);await f.page.locator('#entrar').click();
    await f.page.locator('#operacion').waitFor({state:'visible'});
    await f.page.getByRole('button',{name:'DEMO_UIO_01',exact:false}).click();
    await f.page.locator(`tr[data-linea="${f.a}"]`).waitFor();
  };
  f.capturar=async(id,cantidad)=>{
    await f.page.locator(`tr[data-linea="${id}"] button`).click();await f.page.locator('#cantidad').fill(cantidad);
    await f.page.locator('#guardar-conteo').click();
    await f.page.locator('#modal-conteo').waitFor({state:'hidden'});
  };
  f.pendientes=()=>f.page.evaluate(async actor=>{const m=await import('/assets/pendientes.mjs');return m.listarPendientes(actor);},f.actor);
  f.numeroAuditorias=async()=>{const [[r]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_op_auditoria WHERE actor_id=?',[f.actor]);return Number(r.n);};
  await f.page.goto(ORIGIN);await f.page.locator('#entrar').waitFor();
  return f;
}
async function esperar(fn){for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,50));}assert.fail('No se cumplió la condición de la prueba.');}
test('login, SKU repetido, texto no ejecutable y lectura por cliente en navegador',async t=>{
  const f=await fixture(t);
  await pool.execute('UPDATE ims_op_detalle_linea SET descripcion=? WHERE linea_id=?',['Producto <img src=x onerror=alert(1)>',f.a]);
  await f.login();
  assert.equal(await f.page.locator('tr[data-linea]').count(),2);
  assert.equal(await f.page.locator('#lineas img').count(),0);
  assert.ok((await f.page.locator('#lineas').textContent()).includes('<img src=x'));
  assert.equal(await f.page.locator(`tr[data-linea="${f.oculta}"]`).count(),0);
  assert.equal(await f.page.locator('#contrasena').inputValue(),'');
});
test('dos líneas del mismo SKU guardan cantidades independientes, incluido cero',async t=>{
  const f=await fixture(t);await f.login();await f.capturar(f.a,'0,25');
  await esperar(async()=>await f.numeroAuditorias()===1);
  await f.page.locator(`tr[data-linea="${f.a}"]`).getByRole('button',{name:'Contar · 2',exact:true}).waitFor();
  await f.capturar(f.b,'0');await esperar(async()=>await f.numeroAuditorias()===2);
  const [rows]=await pool.execute('SELECT id,conteo_1,conteo_2 FROM ims_op_linea WHERE id IN (?,?)',[f.a,f.b]);
  assert.equal(rows.find(r=>r.id===f.a).conteo_1,'0.250000000');assert.equal(rows.find(r=>r.id===f.b).conteo_1,'0.000000000');
  assert.ok(rows.every(r=>r.conteo_2===null));
  if(process.env.IMS_BROWSER_ARTIFACTS){await mkdir(process.env.IMS_BROWSER_ARTIFACTS,{recursive:true});await f.page.screenshot({path:path.join(process.env.IMS_BROWSER_ARTIFACTS,'escritorio.png'),fullPage:true});}
});
test('respuesta perdida, recarga y reintento conservan el UUID y una sola auditoría',async t=>{
  const f=await fixture(t);await f.login();f.fault='despues';await f.capturar(f.a,'5');
  await f.page.locator('#pendientes-panel').waitFor({state:'visible'});await esperar(async()=>await f.numeroAuditorias()===1);
  const op=f.requests[0].operacionId;assert.equal((await f.pendientes())[0].operacionId,op);
  f.fault=null;await f.page.reload();await f.page.locator('#operacion').waitFor({state:'visible'});
  await f.page.locator('#sincronizar').click();await f.page.locator('#pendientes-panel').waitFor({state:'hidden'});
  assert.equal(f.requests[1].operacionId,op);assert.equal(await f.numeroAuditorias(),1);assert.equal((await f.pendientes()).length,0);
});
test('sin envío confirmado, otro usuario no ve ni transmite los pendientes del operador',async t=>{
  const f=await fixture(t);await f.login();f.fault='antes';await f.capturar(f.a,'7');
  await f.page.locator('#pendientes-panel').waitFor({state:'visible'});assert.equal(await f.numeroAuditorias(),0);
  await f.page.locator('#salir').click();await f.page.locator('#acceso').waitFor({state:'visible'});
  f.fault=null;await f.login(true);assert.equal(await f.page.locator('#pendientes-panel').isVisible(),false);
  assert.equal(await f.page.locator('#lineas button').count(),0);
  await f.page.locator('#salir').click();await f.page.locator('#acceso').waitFor({state:'visible'});
  await f.login();await f.page.locator('#sincronizar').click();await f.page.locator('#pendientes-panel').waitFor({state:'hidden'});
  assert.equal(await f.numeroAuditorias(),1);assert.equal(f.requests[0].operacionId,f.requests[1].operacionId);
});
test('doble submit no convierte una captura en dos etapas',async t=>{
  const f=await fixture(t);await f.login();await f.page.locator(`tr[data-linea="${f.a}"] button`).click();await f.page.locator('#cantidad').fill('1');
  await f.page.evaluate(()=>{const form=document.getElementById('form-conteo');form.requestSubmit();form.requestSubmit();});
  await esperar(async()=>await f.numeroAuditorias()===1);await f.page.locator('#pendientes-panel').waitFor({state:'hidden'});
  const [[row]]=await pool.execute('SELECT conteo_1,conteo_2 FROM ims_op_linea WHERE id=?',[f.a]);assert.equal(row.conteo_1,'1.000000000');assert.equal(row.conteo_2,null);
});
test('diseño móvil mantiene formularios y tablas dentro de la ventana',async t=>{
  const f=await fixture(t);await f.page.setViewportSize({width:390,height:844});await f.login();
  const layout=await f.page.evaluate(()=>({ok:document.documentElement.scrollWidth<=innerWidth,
    fuera:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,id:e.id,clase:e.className,right:e.getBoundingClientRect().right})).filter(e=>e.right>innerWidth).slice(0,12)}));
  assert.equal(layout.ok,true,JSON.stringify(layout.fuera));
  await f.page.locator(`tr[data-linea="${f.a}"] button`).click();
  const bounds=await f.page.locator('#modal-conteo').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);
  if(process.env.IMS_BROWSER_ARTIFACTS){await mkdir(process.env.IMS_BROWSER_ARTIFACTS,{recursive:true});await f.page.screenshot({path:path.join(process.env.IMS_BROWSER_ARTIFACTS,'movil.png'),fullPage:true});}
});
test('respuesta incompleta conserva las líneas anteriores y ofrece reintento',async t=>{
  const f=await fixture(t);await f.login();f.fault='pagina-incompleta';
  await f.page.locator('#actualizar-lineas').click();
  await esperar(async()=>(await f.page.locator('#aviso').textContent()).includes('Respuesta incompleta'));
  assert.equal(await f.page.locator('tr[data-linea]').count(),2);
});
test('una respuesta anterior no borra el conteo recién confirmado en pantalla',async t=>{
  const f=await fixture(t);await f.login();f.fault='demorar-pagina';await f.page.locator('#actualizar-lineas').click();
  await esperar(()=>!!f.liberarPagina);await f.capturar(f.a,'2');
  const etapa2=f.page.locator(`tr[data-linea="${f.a}"]`).getByRole('button',{name:'Contar · 2',exact:true});await etapa2.waitFor();
  await f.liberarPagina();await f.page.waitForLoadState('networkidle');assert.equal(await etapa2.isVisible(),true);
});
test('almacenamiento bloqueado permite consulta y evita capturas sin respaldo local',async t=>{
  const f=await fixture(t,{sinAlmacen:true});await f.login();
  assert.equal(await f.page.locator('tr[data-linea]').count(),2);
  assert.equal(await f.page.locator('#lineas button').count(),0);
  assert.equal(await f.numeroAuditorias(),0);
  assert.ok((await f.page.locator('#aviso').textContent()).includes('No se pueden conservar capturas'));
});
test('piloto anuncia solo lectura y oculta captura aun con un permiso de conteo previo',async t=>{
  const f=await fixture(t,{soloLectura:true});await f.login();
  assert.equal(await f.page.locator('#modo-lectura').isVisible(),true);
  assert.equal(await f.page.locator('tr[data-linea]').count(),2);
  assert.equal(await f.page.locator('#lineas button').count(),0);
  assert.equal(await f.numeroAuditorias(),0);
  await f.page.reload();await f.page.locator('#operacion').waitFor({state:'visible'});
  assert.equal(await f.page.locator('#modo-lectura').isVisible(),true);
});
test('resumen y búsquedas encuentran producto y ubicación sin descargar todas las líneas',async t=>{
  const f=await fixture(t,{soloLectura:true});await f.login();
  await esperar(async()=>await f.page.locator('#total-lineas').textContent()==='2');
  assert.equal(await f.page.locator('#total-conteos').textContent(),'1');
  assert.equal(await f.page.locator('#total-clientes').textContent(),'1');
  await f.page.locator('#buscar-lineas').fill('A-02');await f.page.getByRole('button',{name:'Filtrar líneas',exact:true}).click();
  await esperar(async()=>await f.page.locator('tr[data-linea]').count()===1);
  assert.equal(await f.page.locator(`tr[data-linea="${f.b}"]`).count(),1);
  await f.page.locator('#limpiar-lineas').click();await esperar(async()=>await f.page.locator('tr[data-linea]').count()===2);
  await f.page.locator('#buscar-inventarios').fill('NO_EXISTE');await f.page.getByRole('button',{name:'Buscar inventarios',exact:true}).click();
  await esperar(async()=>await f.page.locator('#lista-inventarios button').count()===0);
  assert.equal(await f.page.locator('#detalle').isVisible(),false);
  assert.equal(await f.page.locator('#total-lineas').textContent(),'2');
  await f.page.locator('#limpiar-inventarios').click();await esperar(async()=>await f.page.locator('#lista-inventarios button').count()===1);
});
test('resumen incompleto no reemplaza cifras ni hora de la consulta anterior',async t=>{
  const f=await fixture(t);await f.login();await esperar(async()=>await f.page.locator('#total-lineas').textContent()==='2');
  const hora=await f.page.locator('#hora-resumen').textContent();f.fault='resumen-incompleto';
  await f.page.locator('#actualizar-resumen').click();
  await esperar(async()=>(await f.page.locator('#resumen-error').textContent()).includes('Se conserva'));
  assert.equal(await f.page.locator('#total-lineas').textContent(),'2');assert.equal(await f.page.locator('#hora-resumen').textContent(),hora);
});
test('cerrar sesión y entrar con otro cliente no conserva su resumen ni selector',async t=>{
  const f=await fixture(t);await f.login();await esperar(async()=>await f.page.locator('#total-lineas').textContent()==='2');
  await pool.execute('DELETE FROM ims_op_permiso WHERE actor_id=?',[f.lector]);
  await pool.execute('INSERT INTO ims_op_permiso (actor_id,inventario_id,cliente_id,puede_contar) VALUES (?,?,?,0)',[f.lector,f.inv,f.otroCliente]);
  await f.page.locator('#salir').click();await f.page.locator('#acceso').waitFor({state:'visible'});
  await f.page.locator('#correo').fill(f.correoLector);await f.page.locator('#contrasena').fill(PASSWORD);await f.page.locator('#entrar').click();
  await esperar(async()=>await f.page.locator('#total-lineas').textContent()==='1');
  assert.equal(await f.page.locator(`#cliente-inventarios option[value="${f.cliente}"]`).count(),0);
  assert.equal(await f.page.locator(`#cliente-inventarios option[value="${f.otroCliente}"]`).count(),1);
});
