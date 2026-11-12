import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import {databaseConfig} from '../../tools/importar-snapshot.mjs';
import {copiarPreparacionAbiertos} from '../../src/migracion/copia-abiertos.mjs';
import {paqueteCopia} from '../fixtures/paquete-copia-abiertos.mjs';
import {esquemaERP} from '../fixtures/erp-api.mjs';
if(process.env.IMS_MYSQL_PRUEBAS!=='1'||!/^centromando_ims_pruebas(?:_[a-z0-9]+)?$/.test(process.env.MYSQL_DATABASE||''))throw Error('Solo MySQL sintético propio.');
let pool,admin,runtime,baseline;
async function estadoNativo(){const [a]=await pool.query('SELECT * FROM ims_op_linea ORDER BY id'),[b]=await pool.query('SELECT * FROM ims_nat_linea ORDER BY linea_id'),[c]=await pool.query('SELECT * FROM ims_nat_inventario ORDER BY inventario_id');return {a,b,c};}
before(async()=>{
 const cfg=databaseConfig(process.env);pool=mysql.createPool({...cfg,connectionLimit:2});admin=await mysql.createConnection({...cfg,user:'root',password:process.env.IMS_TEST_ROOT_PASSWORD});await esquemaERP(pool);
 const actor=randomUUID(),cliente=randomUUID(),inv=randomUUID(),linea=randomUUID();
 await pool.execute('INSERT INTO ims_op_actor VALUES (?,0)',[actor]);await pool.execute('INSERT INTO ims_op_cliente VALUES (?,?)',[cliente,'CLIENTE_NATIVO_SINTETICO']);await pool.execute('INSERT INTO ims_op_inventario VALUES (?,?,?,?)',[inv,'UIO','OPERACION_EXISTENTE','EN_PROCESO']);await pool.execute('INSERT INTO ims_op_inventario_cliente VALUES (?,?)',[inv,cliente]);await pool.execute('INSERT INTO ims_op_linea(id,inventario_id,cliente_id,sku,conteo_1,observacion) VALUES (?,?,?,?,?,?)',[linea,inv,cliente,'00001','0.000000000','NO_MODIFICAR']);await pool.execute('INSERT INTO ims_nat_inventario(inventario_id,creador_id,borrador,fecha_inicio) VALUES (?,?,0,?)',[inv,actor,'2026-11-12']);await pool.execute('INSERT INTO ims_nat_linea(linea_id,inventario_id,numero,depot,justificacion) VALUES (?,?,1,?,?)',[linea,inv,'9007199254740993.123456789','NO_MODIFICAR']);baseline=await estadoNativo();
 await admin.query("GRANT SELECT ON `"+cfg.database+"`.`ims_op_actor` TO 'ims_cm_operacion'@'%'");runtime=mysql.createPool({...cfg,user:'ims_cm_operacion',password:process.env.IMS_RUNTIME_PASSWORD,connectionLimit:1});
});
after(async()=>{await runtime?.end();await admin?.end();await pool?.end();});
function proxied(cambiar){return {getConnection:async()=>{const c=await pool.getConnection();return new Proxy(c,{get(o,k){if(cambiar[k])return (...args)=>cambiar[k](o,...args);const v=Reflect.get(o,k);return typeof v==='function'?v.bind(o):v;}});}};}
test('copia SQL conserva ceros, ausencia, duplicidad legítima, notas y gran decimal sin tocar el núcleo operativo',async t=>{
 const f=await paqueteCopia(t),r=await copiarPreparacionAbiertos({pool,directorio:f.dir});assert.equal(r.productos,3);assert.equal(r.filas_auxiliares,1);assert.equal(r.ya_copiada,false);assert.equal(r.inventarios_activados,false);assert.equal(r.datos_operativos_importados,false);
 const [rows]=await pool.execute("SELECT contenido FROM ims_abiertos_copia_fila WHERE copia_id=? AND tipo_registro='PRODUCTO' ORDER BY numero_fila",[r.copia_id]);const xs=rows.map(x=>JSON.parse(x.contenido));assert.equal(xs[0].cantidades.c1.valor_decimal,'0.000000000');assert.equal(xs[1].cantidades.c1.valor_decimal,null);assert.equal(xs[0].sku_propuesto,xs[1].sku_propuesto);assert.notEqual(xs[0].referencia_copia,xs[1].referencia_copia);assert.equal(xs[0].cantidades.depot.valor_decimal,'9007199254740993.123456789');assert.equal(xs[0].fila_original.celdas[0].nota,f.filas[0].fila_original.celdas[0].nota);assert.deepEqual(await estadoNativo(),baseline);
 await assert.rejects(pool.execute('UPDATE ims_abiertos_copia SET activa=1 WHERE copia_id=?',[r.copia_id]),e=>e.code==='ER_CHECK_CONSTRAINT_VIOLATED');
});
test('reintento concurrente conserva una sola copia y verifica el contenido completo',async t=>{
 const f=await paqueteCopia(t),rs=await Promise.allSettled([copiarPreparacionAbiertos({pool,directorio:f.dir}),copiarPreparacionAbiertos({pool,directorio:f.dir})]);assert.ok(rs.some(r=>r.status==='fulfilled'));for(const r of rs)if(r.status==='rejected')assert.equal(r.reason.codigo,'OTRA_COPIA_ACTIVA');
 const repetida=await copiarPreparacionAbiertos({pool,directorio:f.dir});assert.equal(repetida.ya_copiada,true);const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_abiertos_copia_fila WHERE copia_id=?',[f.copiaId]);assert.equal(Number(n.n),4);
});
test('fallo tras insertar filas revierte el paquete y un reintento carga íntegramente',async t=>{
 const f=await paqueteCopia(t),fallo=proxied({execute:async(c,sql,params)=>{const r=await c.execute(sql,params);if(sql.startsWith('INSERT INTO ims_abiertos_copia_fila'))throw Error('FALLO_SINTETICO');return r;}});
 await assert.rejects(copiarPreparacionAbiertos({pool:fallo,directorio:f.dir}));for(const tabla of ['ims_abiertos_copia','ims_abiertos_copia_fila']){const [[r]]=await pool.execute('SELECT COUNT(*) AS n FROM '+tabla+' WHERE copia_id=?',[f.copiaId]);assert.equal(Number(r.n),0);}assert.equal((await copiarPreparacionAbiertos({pool,directorio:f.dir})).productos,3);
});
test('respuesta perdida de COMMIT se recupera sin duplicar la copia',async t=>{
 const f=await paqueteCopia(t),perdida=proxied({commit:async c=>{await c.commit();throw Error('RESPUESTA_PERDIDA_SINTETICA');}});await assert.rejects(copiarPreparacionAbiertos({pool:perdida,directorio:f.dir}));assert.equal((await copiarPreparacionAbiertos({pool,directorio:f.dir})).ya_copiada,true);
});
test('igual cantidad de registros no oculta una fila SQL alterada',async t=>{
 const f=await paqueteCopia(t);await copiarPreparacionAbiertos({pool,directorio:f.dir});await pool.execute("UPDATE ims_abiertos_copia_fila SET contenido=REPLACE(contenido,'00001','ALTERADO') WHERE copia_id=? AND tipo_registro='PRODUCTO' AND numero_fila=1",[f.copiaId]);await assert.rejects(copiarPreparacionAbiertos({pool,directorio:f.dir}),e=>e.codigo==='COPIA_SQL_DIFERENTE');
});
test('una preparación que cambia durante la carga se revierte',async t=>{
 const f=await paqueteCopia(t),file=path.join(f.dir,'lineas_candidatas_NO_IMPORTAR.jsonl'),original=await readFile(file);let alterado=false;
 const modificado=proxied({execute:async(c,sql,params)=>{const r=await c.execute(sql,params);if(sql.startsWith('INSERT INTO ims_abiertos_copia_fila')&&!alterado){alterado=true;await writeFile(file,Buffer.concat([original,Buffer.from(' ')]));}return r;}});
 await assert.rejects(copiarPreparacionAbiertos({pool:modificado,directorio:f.dir}));const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_abiertos_copia WHERE copia_id=?',[f.copiaId]);assert.equal(Number(n.n),0);await writeFile(file,original);assert.equal((await copiarPreparacionAbiertos({pool,directorio:f.dir})).productos,3);
});
test('root y perfil operativo no pueden ejecutar el cargador; el perfil operativo no lee filas privadas',async t=>{
 const f=await paqueteCopia(t);await assert.rejects(copiarPreparacionAbiertos({pool:{getConnection:async()=>new Proxy(admin,{get(o,k){if(k==='release')return ()=>{};const v=Reflect.get(o,k);return typeof v==='function'?v.bind(o):v;}})},directorio:f.dir}),e=>e.codigo==='DESTINO_NO_PERMITIDO');await assert.rejects(copiarPreparacionAbiertos({pool:runtime,directorio:f.dir}),e=>e.codigo==='DESTINO_NO_PERMITIDO');await assert.rejects(runtime.query('SELECT contenido FROM ims_abiertos_copia_fila'),e=>e.code==='ER_TABLEACCESS_DENIED_ERROR');
});
test('esquema existente incompatible no se altera para forzar la carga',async t=>{
 const f=await paqueteCopia(t);await admin.query('ALTER TABLE ims_abiertos_copia MODIFY estado VARCHAR(21) NOT NULL');try{await assert.rejects(copiarPreparacionAbiertos({pool,directorio:f.dir}),e=>e.codigo==='ESQUEMA_INCOMPATIBLE');const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_abiertos_copia WHERE copia_id=?',[f.copiaId]);assert.equal(Number(n.n),0);}finally{await admin.query('ALTER TABLE ims_abiertos_copia MODIFY estado VARCHAR(20) NOT NULL');}
});
test('paquete producido por el preparador Python real se copia sin activar las fuentes en revisión',async()=>{
 assert.ok(process.env.IMS_PAQUETE_REAL);const r=await copiarPreparacionAbiertos({pool,directorio:process.env.IMS_PAQUETE_REAL});assert.equal(r.productos,6);assert.equal(r.filas_auxiliares,1);assert.equal(r.integridad_sql_verificada,true);assert.equal(r.inventarios_activados,false);assert.deepEqual(await estadoNativo(),baseline);
});
test('carga y lectura paginadas conservan 1700 SKU repetidos y 257 filas auxiliares sin otra copia',async t=>{
 const f=await paqueteCopia(t,{productos:1700,auxiliares:257});const r=await copiarPreparacionAbiertos({pool,directorio:f.dir});assert.equal(r.productos,1700);assert.equal(r.filas_auxiliares,257);assert.equal(r.integridad_sql_verificada,true);const [[n]]=await pool.execute('SELECT COUNT(*) AS n,COUNT(DISTINCT referencia_copia) AS referencias FROM ims_abiertos_copia_fila WHERE copia_id=?',[r.copia_id]);assert.equal(Number(n.n),1957);assert.equal(Number(n.referencias),1957);assert.equal((await copiarPreparacionAbiertos({pool,directorio:f.dir})).ya_copiada,true);assert.deepEqual(await estadoNativo(),baseline);
});
