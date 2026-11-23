import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {crearPoolConteos} from '../../src/mysql/conteos.mjs';
if(process.env.IMS_MYSQL_PRUEBAS!=='1'||!/^centromando_ims_pruebas(?:_[a-z0-9]+)?$/.test(process.env.MYSQL_DATABASE||''))throw Error('Solo base sintética propia.');
// Ejecuta el preparador Python real; el puente utiliza exclusivamente esta base
// de pruebas y transmite valores de metadata, nunca datos de autenticación.
async function preparar(pool){
 const codigo=`import sys,json
sys.path.insert(0,'deploy')
import preparar_centro as cm
cm.op.DB=sys.argv[1]
def admin(sql):
 print(json.dumps({'sql':sql}),flush=True)
 r=json.loads(sys.stdin.readline())
 if 'error' in r: raise RuntimeError('MySQL rechazó la prueba de estados')
 return r['filas']
cm.preparar_estado_sin_consolidar(admin)
`;
 const child=spawn('python3',['-c',codigo,process.env.MYSQL_DATABASE],{stdio:['pipe','pipe','pipe']});let buffer='',err='',fallo=null,consultas=[];child.stderr.on('data',b=>{err+=b;});child.stdin.on('error',()=>{});
 child.stdout.on('data',b=>{buffer+=b;let i;while((i=buffer.indexOf('\n'))>=0){const linea=buffer.slice(0,i);buffer=buffer.slice(i+1);let req;try{req=JSON.parse(linea);}catch(e){fallo=e;child.kill();return;}consultas.push(req.sql);void pool.query(req.sql).then(([rows])=>child.stdin.write(JSON.stringify({filas:Array.isArray(rows)?rows.map(r=>Object.values(r)):[]})+'\n')).catch(e=>{fallo=e;child.stdin.write('{"error":true}\n');});}});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});assert.equal(code,0,err);if(fallo)throw fallo;return consultas;
}
test('preparador Python acepta CHECK_CLAUSE real, amplía atómicamente y conserva filas, protección e idempotencia',async()=>{
 const pool=await crearPoolConteos(process.env),c=await pool.getConnection();try{
  await c.query("SET SESSION sql_mode='STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION'");
  const sql=await readFile(new URL('../../sql/002_conteo_operativo.sql',import.meta.url),'utf8'),tabla=sql.match(/CREATE TABLE IF NOT EXISTS ims_op_inventario \([\s\S]*?\) ENGINE=.*?;/)[0].replace(",'CERRADO_SIN_CONSOLIDAR'",'');await c.query(tabla);await c.query("ALTER TABLE ims_op_inventario DROP CHECK ck_ims_op_estado, ADD CONSTRAINT ck_ims_op_estado CHECK (estado IN ('EN_PROCESO','EN_VALIDACION','ENTREGADO','CANCELADO'))");await c.query("INSERT INTO ims_op_inventario VALUES ('00000000-0000-4000-8000-000000000001','UIO','SINTETICO','EN_PROCESO')");
  const [[original]]=await c.query("SELECT CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='ck_ims_op_estado'");assert.match(original.CHECK_CLAUSE,/\\'/);const [antes]=await c.query('SELECT * FROM ims_op_inventario');const primera=await preparar(c);assert.equal(primera.filter(q=>q.startsWith('ALTER TABLE')).length,1);const [despues]=await c.query('SELECT * FROM ims_op_inventario');assert.deepEqual(despues,antes);const segunda=await preparar(c);assert.equal(segunda.filter(q=>q.startsWith('ALTER TABLE')).length,0);await assert.rejects(c.query("UPDATE ims_op_inventario SET estado='ESTADO_NO_AUTORIZADO'"));const [[check]]=await c.query("SELECT t.ENFORCED FROM information_schema.TABLE_CONSTRAINTS t WHERE t.CONSTRAINT_SCHEMA=DATABASE() AND t.CONSTRAINT_NAME='ck_ims_op_estado'");assert.equal(check.ENFORCED,'YES');
 }finally{c.release();await pool.end();}
});
