import {test} from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import {randomBytes} from 'node:crypto';
import {crearPoolConteos} from '../../src/mysql/conteos.mjs';
import {diagnosticoOperacion} from '../../tools/preparar-operacion.mjs';
if(process.env.IMS_MYSQL_PRUEBAS!=='1'||!/^centromando_ims_pruebas(?:_[a-z0-9]+)?$/.test(process.env.MYSQL_DATABASE||''))throw Error('Solo base sintética.');
test('cinco conexiones bloquean el verificador; el pool nuevo reserva una sin ampliar el límite SQL',{timeout:20000},async()=>{
 const config={host:'127.0.0.1',port:Number(process.env.MYSQL_PORT||3306),database:process.env.MYSQL_DATABASE},admin=await mysql.createConnection({...config,user:'root',password:process.env.IMS_TEST_ROOT_PASSWORD}),usuario='ims_cap_'+randomBytes(6).toString('hex'),password=randomBytes(32).toString('hex'),cfg={...config,user:usuario,password},holders=[];let pool,verificador,quinta,creado=false;
 const limite=e=>['ER_USER_LIMIT_REACHED','ER_TOO_MANY_USER_CONNECTIONS'].includes(e.code);
 try{
  await admin.query("CREATE USER ?@'%' IDENTIFIED BY ? WITH MAX_USER_CONNECTIONS 5",[usuario,password]);creado=true;await admin.query('GRANT SELECT ON `'+config.database+"`.* TO ?@'%'",[usuario]);
  for(let i=0;i<5;i++)holders.push(await mysql.createConnection(cfg));
  await assert.rejects(()=>mysql.createConnection(cfg),e=>{const d=diagnosticoOperacion(e,'CONEXION');assert.ok(limite(e));if(e.code==='ER_USER_LIMIT_REACHED')assert.equal(d.recurso_limite,'max_user_connections');assert.ok(!JSON.stringify(d).includes(usuario));return true;});
  for(const c of holders.splice(0))await c.end();
  pool=await crearPoolConteos({...process.env,MYSQL_USER:usuario,MYSQL_PASSWORD:password});
  for(let i=0;i<4;i++)holders.push(await pool.getConnection());
  const cola=new Promise(resolve=>pool.once('enqueue',()=>resolve('ENCOLADA')));
  quinta=pool.getConnection();assert.equal(await Promise.race([cola,quinta.then(()=>'ABIERTA')]),'ENCOLADA');
  verificador=await mysql.createConnection(cfg);assert.equal((await verificador.query('SELECT 1 n'))[0][0].n,1);
  await assert.rejects(()=>mysql.createConnection(cfg),limite);
  const [[r]]=await admin.execute('SELECT max_user_connections n FROM mysql.user WHERE User=? AND Host=\'%\'',[usuario]);assert.equal(Number(r.n),5);
 }finally{for(const c of holders){if(pool)c.release();else await c.end();}if(quinta)(await quinta).release();await verificador?.end();await pool?.end();if(creado)await admin.query("DROP USER ?@'%'",[usuario]);await admin.end();}
});
