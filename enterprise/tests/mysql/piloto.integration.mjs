import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import mysql from 'mysql2/promise';
import {crearCorte} from '../fixtures/corte.mjs';
import {validateSnapshot,importSnapshot} from '../../tools/importar-snapshot.mjs';
import {planificarOperacion} from '../../tools/planificar-operacion.mjs';
import {trasladarOperacion} from '../../tools/trasladar-operacion.mjs';
import {prepararLector} from '../../tools/preparar-piloto.mjs';
import {crearPoolConteos} from '../../src/mysql/conteos.mjs';
import {crearApi} from '../../src/http/api.mjs';

const DATABASE=process.env.MYSQL_DATABASE;
if(process.env.IMS_MYSQL_PRUEBAS!=='1'||!/^centromando_ims_pruebas(?:_[a-z0-9]+)?$/.test(DATABASE||''))throw Error('Solo una base exclusiva de pruebas.');
let pool;
before(async()=>{pool=await crearPoolConteos(process.env);});
after(async()=>{if(pool)await pool.end();});
async function fixture(t){
  const f=await crearCorte({mutarInv:rows=>{
    rows[0].celdas.find(c=>c.columna===3).valor='280818_CORRCAL';
    rows[1].celdas.find(c=>c.columna===3).valor='250818_CORRCAL';
  }});
  t.after(()=>f.close());
  const c=await pool.getConnection();
  try{
    await importSnapshot(await validateSnapshot(f.cut),c);
    const p=await planificarOperacion(f.cut,f.plan,{clientePanel:true,separarConteos:[[
      {codigo_operativo:'280818_CORRCAL',filas:1},{codigo_operativo:'250818_CORRCAL',filas:1}]]});
    await trasladarOperacion({planDir:f.plan,snapshotDir:f.cut,connection:c});
    f.lector={planId:p.manifest.plan_id,actorId:randomUUID(),correo:randomUUID()+'@prueba.invalid',
      nombre:'Lector sintético',contrasena:'Clave_de_prueba_sintetica_2026!',database:DATABASE};
  }finally{c.release();}
  f.preparar=async(aplicar=true,connection)=>{
    const c=connection||await pool.getConnection();
    try{return await prepararLector({connection:c,...f.lector,aplicar});}finally{if(!connection)c.release();}
  };
  return f;
}
test('piloto crea un lector limitado al plan; repetir conserva hash, líneas, cantidades y permisos',async t=>{
  const f=await fixture(t);
  const [[antes]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_auth_usuario').catch(()=>[[{n:0}]]);
  const pre=await f.preparar(false);assert.equal(pre.conteos,5);assert.equal(pre.inventarios,4);assert.equal(pre.filas,5);
  const a=await f.preparar(),b=await f.preparar();assert.equal(a.yaPreparado,false);assert.equal(b.yaPreparado,true);
  assert.equal(a.permisos,5);assert.equal(a.conteos,5);assert.equal(a.solo_lectura,true);
  const [permisos]=await pool.execute('SELECT inventario_id,puede_contar FROM ims_op_permiso WHERE actor_id=?',[f.lector.actorId]);
  assert.equal(permisos.length,5);assert.ok(permisos.every(p=>Number(p.puede_contar)===0));
  const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_auth_usuario');assert.equal(Number(n.n),Number(antes.n)+1);
  const [valores]=await pool.execute(`SELECT l.conteo_1,l.version FROM ims_op_linea l JOIN ims_mig_conteo_aporte a
    ON a.inventario_id=l.inventario_id WHERE a.plan_id=?`,[f.lector.planId]);
  assert.equal(valores.length,5);assert.ok(valores.some(l=>l.conteo_1==='0.000000000'));assert.ok(valores.every(l=>String(l.version)==='0'));
});
test('cuenta preexistente, plan cambiado o permiso ampliado detienen sin reemplazar identidad',async t=>{
  const f=await fixture(t);await f.preparar();
  const c=await pool.getConnection();
  try{
    await assert.rejects(prepararLector({connection:c,...f.lector,actorId:randomUUID(),aplicar:true}),/otra identidad/);
    await assert.rejects(prepararLector({connection:c,...f.lector,planId:'f'.repeat(64),aplicar:true}),/no está trasladado/);
    await pool.execute('UPDATE ims_op_permiso SET puede_contar=1 WHERE actor_id=? LIMIT 1',[f.lector.actorId]);
    await assert.rejects(f.preparar(),/permisos no corresponden/);
    const [[r]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_op_permiso WHERE actor_id=? AND puede_contar=1',[f.lector.actorId]);assert.equal(Number(r.n),1);
  }finally{c.release();}
});
test('fallo al asignar permisos revierte actor y credencial nuevos',async t=>{
  const f=await fixture(t),real=await pool.getConnection();
  try{
    const proxy=new Proxy(real,{get(target,key){
      if(key==='execute')return (sql,params)=>{if(sql.startsWith('INSERT INTO ims_op_permiso'))throw Error('Fallo sintético');return target.execute(sql,params);};
      const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
    }});
    await assert.rejects(f.preparar(true,proxy),/Fallo sintético/);
    const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_op_actor WHERE id=?',[f.lector.actorId]);assert.equal(Number(n.n),0);
    const [[u]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_auth_usuario WHERE actor_id=?',[f.lector.actorId]);assert.equal(Number(u.n),0);
    assert.equal((await f.preparar()).usuario_preparado,true);
  }finally{real.release();}
});
test('MySQL lector permite login/consulta/logout y rechaza escrituras operativas y lectura del resguardo',{
  skip:!(process.env.IMS_PILOTO_SQL_PRUEBAS&&process.env.IMS_MYSQL_ADMIN_PASSWORD&&process.env.IMS_MYSQL_LECTOR_PASSWORD)
},async t=>{
  assert.ok(process.env.IMS_PILOTO_SQL_PRUEBAS&&process.env.IMS_MYSQL_ADMIN_PASSWORD&&process.env.IMS_MYSQL_LECTOR_PASSWORD,'Se requiere el SQL de prueba generado por preparar_piloto.py.');
  const f=await fixture(t);await f.preparar();
  const admin=await mysql.createConnection({host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT||3306),user:'root',password:process.env.IMS_MYSQL_ADMIN_PASSWORD});
  try{
    const sql=(await readFile(process.env.IMS_PILOTO_SQL_PRUEBAS,'utf8')).replaceAll('`centromando_ims_ensayo`','`'+DATABASE+'`');
    for(const sentencia of sql.split(';').map(s=>s.trim()).filter(Boolean))await admin.query(sentencia);
  }finally{await admin.end();}
  const lector=await crearPoolConteos({...process.env,MYSQL_USER:'ims_cm_lector',MYSQL_PASSWORD:process.env.IMS_MYSQL_LECTOR_PASSWORD});
  t.after(()=>lector.end());
  for(const sql of ['UPDATE ims_op_linea SET version=version','UPDATE ims_op_permiso SET puede_contar=1',
    'SELECT * FROM ims_snapshot_fila LIMIT 1','SELECT * FROM mysql.user','DELETE FROM ims_auth_usuario',
    'CREATE TABLE no_permitida (id INT)'])await assert.rejects(lector.query(sql),e=>/DENIED/.test(e.code));
  const ORIGIN='https://apps.flexnetuio.com:8445';
  const server=crearApi({pool:lector,publicUrl:ORIGIN,soloLectura:true});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
  const url='http://127.0.0.1:'+server.address().port;
  const login=await fetch(url+'/api/sesion',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},
    body:JSON.stringify({correo:f.lector.correo,contrasena:f.lector.contrasena})});
  assert.equal(login.status,200);const s=await login.json();assert.equal(s.soloLectura,true);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const headers={Origin:ORIGIN,Cookie:cookie,'X-IMS-CSRF':s.csrf,'Content-Type':'application/json'};
  const inv=await fetch(url+'/api/inventarios',{headers});assert.equal(inv.status,200);const datos=await inv.json();assert.equal(datos.datos.length,5);
  const lineas=await fetch(url+'/api/inventarios/'+datos.datos[0].id+'/lineas',{headers});assert.equal(lineas.status,200);assert.ok((await lineas.json()).datos.length>0);
  const post=await fetch(url+'/api/conteos',{method:'POST',headers,body:'{}'});assert.equal(post.status,403);assert.equal((await post.json()).error,'SOLO_LECTURA');
  const logout=await fetch(url+'/api/sesion/cerrar',{method:'POST',headers});assert.equal(logout.status,200);await logout.json();
  const sesion=await fetch(url+'/api/sesion',{headers});assert.equal(sesion.status,401);await sesion.json();
});
