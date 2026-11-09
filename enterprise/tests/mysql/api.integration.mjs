import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {crearPoolConteos,guardarConteo} from '../../src/mysql/conteos.mjs';
import {crearHashPassword,sha256} from '../../src/auth/credenciales.mjs';
import {autenticar} from '../../src/auth/sesiones.mjs';
import {crearApi,COOKIE} from '../../src/http/api.mjs';

if(process.env.IMS_MYSQL_PRUEBAS!=='1'||!/^centromando_ims_pruebas(?:_[a-z0-9]+)?$/.test(process.env.MYSQL_DATABASE||''))
  throw Error('Se requiere una base exclusiva de pruebas y IMS_MYSQL_PRUEBAS=1.');
const ORIGIN='https://apps.flexnetuio.com:8445',PASSWORD='Clave_sintetica_2026!';
let pool,hash;
before(async()=>{
  pool=await crearPoolConteos(process.env);hash=await crearHashPassword(PASSWORD);
  for(const name of ['002_conteo_operativo.sql','003_autenticacion.sql','004_detalle_linea.sql']){
    const ddl=await readFile(new URL('../../sql/'+name,import.meta.url),'utf8');
    for(const sql of ddl.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await pool.query(sql);
  }
});
after(async()=>{if(pool)await pool.end();});
async function fixture(t){
  const f={actor:randomUUID(),lector:randomUUID(),cliente:randomUUID(),otroCliente:randomUUID(),
    inv:randomUUID(),invAjeno:randomUUID(),linea:randomUUID(),lineaAjena:randomUUID()};
  f.correo=f.actor+'@prueba.invalid';f.correoLector=f.lector+'@prueba.invalid';
  await pool.execute('INSERT INTO ims_op_actor (id,activo) VALUES (?,1),(?,1)',[f.actor,f.lector]);
  await pool.execute('INSERT INTO ims_auth_usuario (actor_id,correo,nombre,password_hash) VALUES (?,?,?,?),(?,?,?,?)',
    [f.actor,f.correo,'Operador sintético',hash,f.lector,f.correoLector,'Lector sintético',hash]);
  await pool.execute('INSERT INTO ims_op_cliente (id,nombre) VALUES (?,?),(?,?)',[f.cliente,'CLIENTE_A',f.otroCliente,'CLIENTE_B']);
  await pool.execute('INSERT INTO ims_op_inventario (id,sede,codigo_operativo,estado) VALUES (?,?,?,?),(?,?,?,?)',
    [f.inv,'UIO','CODIGO_REPETIDO','EN_PROCESO',f.invAjeno,'GYE','CODIGO_REPETIDO','EN_PROCESO']);
  for(const [i,c] of [[f.inv,f.cliente],[f.inv,f.otroCliente],[f.invAjeno,f.otroCliente]])
    await pool.execute('INSERT INTO ims_op_inventario_cliente (inventario_id,cliente_id) VALUES (?,?)',[i,c]);
  for(const [a,puede] of [[f.actor,1],[f.lector,0]])
    await pool.execute('INSERT INTO ims_op_permiso (actor_id,inventario_id,cliente_id,puede_contar) VALUES (?,?,?,?)',[a,f.inv,f.cliente,puede]);
  for(const [id,cliente] of [[f.linea,f.cliente],[f.lineaAjena,f.otroCliente]])
    await pool.execute('INSERT INTO ims_op_linea (id,inventario_id,cliente_id,sku,observacion) VALUES (?,?,?,?,?)',[id,f.inv,cliente,'SKU_0001','Nota humana']);
  const server=crearApi({pool,publicUrl:ORIGIN});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  f.url='http://127.0.0.1:'+server.address().port;
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
  f.req=async(path,{method='GET',body,cookie,csrf,origin=ORIGIN,headers={}}={})=>{
    const res=await fetch(f.url+path,{method,headers:{...(origin?{Origin:origin}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),
      ...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-IMS-CSRF':csrf}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await res.json();return {res,data};
  };
  f.login=async(correo=f.correo,password=PASSWORD)=>{
    const r=await f.req('/api/sesion',{method:'POST',body:{correo,contrasena:password}});
    return {...r,cookie:r.res.headers.get('set-cookie')?.split(';')[0],csrf:r.data.csrf};
  };
  f.solicitud={operacionId:randomUUID(),inventarioId:f.inv,lineaId:f.linea,etapa:1,versionEsperada:'0',cantidad:'0.125'};
  return f;
}
test('sesión HTTP solo entrega cookie propia segura y datos sanitizados',async t=>{
  const f=await fixture(t),r=await f.login();assert.equal(r.res.status,200);
  const ck=r.res.headers.get('set-cookie');for(const value of [COOKIE,'HttpOnly','Secure','SameSite=Strict','Path=/'])assert.ok(ck.includes(value));
  assert.equal(r.data.usuario.correo,f.correo);assert.equal(Object.hasOwn(r.data,'token'),false);assert.equal(Object.hasOwn(r.data.usuario,'password_hash'),false);
  assert.equal(r.res.headers.get('cache-control'),'no-store');
  const token=r.cookie.slice(COOKIE.length+1);
  const [[stored]]=await pool.execute('SELECT sesion_hash FROM ims_auth_sesion WHERE actor_id=?',[f.actor]);
  assert.equal(stored.sesion_hash,sha256(token));assert.notEqual(stored.sesion_hash,token);
  assert.equal((await f.req('/api/sesion',{cookie:r.cookie})).res.status,200);
});
test('correo inexistente y contraseña incorrecta responden igual',async t=>{
  const f=await fixture(t),a=await f.login(f.correo,'Otra_clave_2026!'),b=await f.login(randomUUID()+'@prueba.invalid');
  assert.equal(a.res.status,401);assert.equal(b.res.status,401);assert.deepEqual(a.data,b.data);
  assert.equal(a.res.headers.get('set-cookie'),null);
});
test('sin sesión o con cookie ajena no se consultan inventarios',async t=>{
  const f=await fixture(t);
  for(const headers of [{},{Cookie:'session=ajena'},{Authorization:'Bearer ajeno','X-User-Email':f.correo}])
    assert.equal((await f.req('/api/inventarios',{headers})).res.status,401);
});
test('listados solo muestran inventarios y líneas del cliente permitido',async t=>{
  const f=await fixture(t),s=await f.login();
  const inv=await f.req('/api/inventarios',{cookie:s.cookie});assert.equal(inv.data.datos.length,1);assert.equal(inv.data.datos[0].id,f.inv);
  const l=await f.req(`/api/inventarios/${f.inv}/lineas`,{cookie:s.cookie});
  assert.equal(l.data.datos.length,1);assert.equal(l.data.datos[0].cliente_id,f.cliente);assert.equal(l.data.datos[0].id,f.linea);
  assert.equal((await f.req(`/api/inventarios/${f.invAjeno}/lineas`,{cookie:s.cookie})).res.status,403);
});
test('lector consulta sus líneas pero no guarda conteos',async t=>{
  const f=await fixture(t),s=await f.login(f.correoLector);
  assert.equal((await f.req(`/api/inventarios/${f.inv}/lineas`,{cookie:s.cookie})).res.status,200);
  const r=await f.req('/api/conteos',{method:'POST',body:f.solicitud,cookie:s.cookie,csrf:s.csrf});assert.equal(r.res.status,403);
});
test('resumen cuenta solo líneas y clientes autorizados sin duplicar inventarios multicliente',async t=>{
  const f=await fixture(t),s=await f.login(f.correoLector);
  assert.equal((await f.req('/api/resumen')).res.status,401);
  const a=await f.req('/api/resumen',{cookie:s.cookie});assert.equal(a.res.status,200);
  assert.deepEqual(a.data.totales,{conteos:'1',lineas:'1',clientes:'1',sedes:'1'});
  assert.equal(a.data.clientes.length,1);assert.equal(a.data.clientes[0].id,f.cliente);
  await pool.execute('INSERT INTO ims_op_permiso (actor_id,inventario_id,cliente_id,puede_contar) VALUES (?,?,?,0)',[f.lector,f.inv,f.otroCliente]);
  const b=await f.req('/api/resumen',{cookie:s.cookie});assert.equal(b.data.totales.conteos,'1');assert.equal(b.data.totales.lineas,'2');assert.equal(b.data.totales.clientes,'2');
  assert.equal((await f.req('/api/resumen?select=*',{cookie:s.cookie})).res.status,400);
});
test('búsqueda por código/cliente/sede conserva el ámbito de permisos y escapa comodines literales',async t=>{
  const f=await fixture(t),s=await f.login();
  for(const q of ['buscar=codigo','buscar=cliente_a','sede=UIO','cliente='+f.cliente]){
    const r=await f.req('/api/inventarios?'+q,{cookie:s.cookie});assert.equal(r.res.status,200);assert.deepEqual(r.data.datos.map(r=>r.id),[f.inv]);
  }
  for(const q of ['buscar=%25','buscar=CLIENTE_B','sede=GYE','cliente='+f.otroCliente]){
    const r=await f.req('/api/inventarios?'+q,{cookie:s.cookie});assert.equal(r.res.status,200);assert.equal(r.data.datos.length,0);
  }
  for(const q of ['buscar=x&buscar=y','cliente=mal','sede=OTRA','buscar='+('x'.repeat(121))])assert.equal((await f.req('/api/inventarios?'+q,{cookie:s.cookie})).res.status,400);
});
test('búsqueda de líneas encuentra SKU con ceros, descripción y ubicación sin exponer el otro cliente',async t=>{
  const f=await fixture(t),s=await f.login();
  await pool.execute('INSERT INTO ims_op_detalle_linea (linea_id,posicion,descripcion,serie,lote,unidad) VALUES (?,?,?,?,?,?)',[f.linea,'A-01','Consumible único','SERIE_012','LOTE-1','UN']);
  for(const buscar of ['SKU_0001','único','a-01','serie_012','LOTE-1']){
    const r=await f.req(`/api/inventarios/${f.inv}/lineas?buscar=`+encodeURIComponent(buscar),{cookie:s.cookie});assert.equal(r.res.status,200);assert.deepEqual(r.data.datos.map(r=>r.id),[f.linea]);
  }
  const r=await f.req(`/api/inventarios/${f.inv}/lineas?buscar=%25`,{cookie:s.cookie});assert.equal(r.data.datos.length,0);
  assert.equal((await f.req(`/api/inventarios/${f.invAjeno}/lineas?buscar=SKU`,{cookie:s.cookie})).res.status,403);
});
test('origen de otra aplicación o CSRF ausente no permiten escrituras',async t=>{
  const f=await fixture(t),s=await f.login();
  assert.equal((await f.req('/api/conteos',{method:'POST',body:f.solicitud,cookie:s.cookie})).res.status,403);
  assert.equal((await f.req('/api/conteos',{method:'POST',body:f.solicitud,cookie:s.cookie,csrf:s.csrf,origin:'https://apps.flexnetuio.com:8443'})).res.status,403);
  assert.equal((await f.req('/api/sesion',{method:'POST',body:{correo:f.correo,contrasena:PASSWORD},origin:null})).res.status,403);
});
test('cliente ajeno y campos de identidad enviados en el cuerpo se rechazan',async t=>{
  const f=await fixture(t),s=await f.login();
  const opts={method:'POST',cookie:s.cookie,csrf:s.csrf};
  assert.equal((await f.req('/api/conteos',{...opts,body:{...f.solicitud,lineaId:f.lineaAjena}})).res.status,403);
  assert.equal((await f.req('/api/conteos',{...opts,body:{...f.solicitud,actorId:f.lector,rol:'ADMIN'}})).res.status,400);
});
test('reintento HTTP no duplica auditoría y nueva etapa exige nueva versión',async t=>{
  const f=await fixture(t),s=await f.login(),opts={method:'POST',cookie:s.cookie,csrf:s.csrf,body:f.solicitud};
  const a=await f.req('/api/conteos',opts),b=await f.req('/api/conteos',opts);
  assert.equal(a.res.status,200);assert.equal(a.data.repetida,false);assert.equal(b.data.repetida,true);assert.equal(a.data.clienteId,f.cliente);
  const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_op_auditoria WHERE actor_id=?',[f.actor]);assert.equal(Number(n.n),1);
  const c=await f.req('/api/conteos',{...opts,body:{...f.solicitud,operacionId:randomUUID(),etapa:2,versionEsperada:'1',cantidad:'0'}});
  assert.equal(c.res.status,200);assert.equal(c.data.cantidad,'0.000000000');
});
test('logout revoca sesión y el núcleo rechaza un contexto obtenido antes del cierre',async t=>{
  const f=await fixture(t),s=await f.login(),token=s.cookie.slice(COOKIE.length+1),principal=await autenticar(pool,token);
  assert.equal((await f.req('/api/sesion/cerrar',{method:'POST',cookie:s.cookie,csrf:s.csrf})).res.status,200);
  assert.equal((await f.req('/api/sesion',{cookie:s.cookie})).res.status,401);
  await assert.rejects(guardarConteo({pool,principal,solicitud:f.solicitud}),e=>e.codigo==='NO_AUTENTICADO');
});
test('sesión vencida, usuario desactivado y versión de credencial cambiada dejan de autenticar',async t=>{
  const f=await fixture(t),s=await f.login();
  await pool.execute('UPDATE ims_auth_sesion SET expira_en=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 SECOND) WHERE actor_id=?',[f.actor]);
  assert.equal((await f.req('/api/sesion',{cookie:s.cookie})).res.status,401);
  const s2=await f.login();await pool.execute('UPDATE ims_auth_usuario SET version=version+1 WHERE actor_id=?',[f.actor]);
  assert.equal((await f.req('/api/sesion',{cookie:s2.cookie})).res.status,401);
  const s3=await f.login();await pool.execute('UPDATE ims_op_actor SET activo=0 WHERE id=?',[f.actor]);
  assert.equal((await f.req('/api/sesion',{cookie:s3.cookie})).res.status,401);
});
test('límite de login persiste en base y se recupera al vencer la ventana',async t=>{
  const f=await fixture(t);
  for(let i=0;i<5;i++)assert.equal((await f.login(f.correo,'fallo_sintetico')).res.status,401);
  assert.equal((await f.login()).res.status,429);
  await pool.execute('UPDATE ims_auth_limite SET vence_en=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 SECOND) WHERE clave=?',[sha256('ims-login:'+f.correo)]);
  assert.equal((await f.login()).res.status,200);
});
test('paginación y formatos inválidos no se convierten en filtros SQL arbitrarios',async t=>{
  const f=await fixture(t),s=await f.login();
  for(const q of ['limite=1000','limite=0','cursor=mal','select=*','limite=1&limite=2'])
    assert.equal((await f.req('/api/inventarios?'+q,{cookie:s.cookie})).res.status,400);
  const r=await f.req('/api/conteos',{method:'POST',body:{...f.solicitud,observacion:'x'.repeat(17000)},cookie:s.cookie,csrf:s.csrf});
  assert.equal(r.res.status,413);
});
test('formularios y JSON roto se rechazan sin cambiar conteos',async t=>{
  const f=await fixture(t),s=await f.login();
  const form=await f.req('/api/conteos',{method:'POST',body:f.solicitud,cookie:s.cookie,csrf:s.csrf,
    headers:{'Content-Type':'application/x-www-form-urlencoded'}});assert.equal(form.res.status,415);
  const invalid=await fetch(f.url+'/api/conteos',{method:'POST',headers:{Origin:ORIGIN,Cookie:s.cookie,'X-IMS-CSRF':s.csrf,'Content-Type':'application/json'},body:'{'});
  assert.equal(invalid.status,400);await invalid.json();
  const [[line]]=await pool.execute('SELECT version,conteo_1 FROM ims_op_linea WHERE id=?',[f.linea]);
  assert.equal(String(line.version),'0');assert.equal(line.conteo_1,null);
});
test('un fallo interno no devuelve mensajes SQL ni configuración al navegador',async t=>{
  const server=crearApi({pool:{execute:async()=>{throw Error('SQL_SECRETO_SINTETICO');}},publicUrl:ORIGIN});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/sesion',{headers:{Origin:ORIGIN,Cookie:COOKIE+'='+'a'.repeat(43)}});
  assert.equal(r.status,503);assert.equal((await r.text()).includes('SQL_SECRETO'),false);
});
test('recursos de interfaz usan CSP propia y no exponen archivos del proyecto',async t=>{
  const f=await fixture(t),root=await fetch(f.url+'/');
  assert.equal(root.status,200);assert.ok(root.headers.get('content-security-policy').includes("script-src 'self'"));
  assert.ok((await root.text()).includes('form-login'));
  const js=await fetch(f.url+'/assets/app.mjs');assert.equal(js.status,200);assert.ok(js.headers.get('content-type').includes('javascript'));await js.text();
  for(const path of ['/enterprise/.env','/assets/../../enterprise/.env']){
    const r=await fetch(f.url+path);assert.equal(r.status,404);await r.text();
  }
});
