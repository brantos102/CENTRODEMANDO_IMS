import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {crearPoolConteos} from '../../src/mysql/conteos.mjs';
import {crearCorte} from '../fixtures/corte.mjs';
import {validateSnapshot,importSnapshot} from '../../tools/importar-snapshot.mjs';
import {planificarOperacion} from '../../tools/planificar-operacion.mjs';
import {trasladarOperacion} from '../../tools/trasladar-operacion.mjs';
import {canon,sha} from '../../src/migracion/modelo.mjs';
if(process.env.IMS_MYSQL_PRUEBAS!=='1'||!/^centromando_ims_pruebas(?:_[a-z0-9]+)?$/.test(process.env.MYSQL_DATABASE||''))throw Error('Solo una base exclusiva de pruebas.');
let pool;
before(async()=>{pool=await crearPoolConteos(process.env);});after(async()=>{if(pool)await pool.end();});
async function preparar(options){const f=await crearCorte(options);const c=await pool.getConnection();try{await importSnapshot(await validateSnapshot(f.cut),c);await planificarOperacion(f.cut,f.plan);}catch(e){await f.close();throw e;}finally{c.release();}return f;}
async function aplicar(f,connection){const c=connection||await pool.getConnection();try{return await trasladarOperacion({planDir:f.plan,snapshotDir:f.cut,connection:c});}finally{if(!connection)c.release();}}
async function cantidad(f,table='ims_op_linea'){
  assert.ok(['ims_op_linea','ims_mig_aporte'].includes(table));const [[r]]=await pool.execute(`SELECT COUNT(*) AS n FROM ${table} WHERE origen_drive IN (${f.origenes.map(()=>'?').join(',')})`,f.origenes);return Number(r.n);
}
test('traslado real y reintento conservan fuentes y cantidades sin permisos ni activación',async()=>{
  const f=await preparar();try{
    const a=await aplicar(f),b=await aplicar(f);assert.equal(a.filas,5);assert.equal(a.inventarios,4);assert.equal(b.yaTrasladado,true);assert.equal(await cantidad(f),5);
    const [rows]=await pool.execute(`SELECT l.conteo_1,l.conteo_2,l.sku,l.fila_origen,i.estado FROM ims_op_linea l JOIN ims_op_inventario i ON i.id=l.inventario_id WHERE l.origen_drive IN (${f.origenes.map(()=>'?').join(',')})`,f.origenes);
    assert.ok(rows.every(r=>r.estado==='ENTREGADO'&&r.conteo_2===null&&r.fila_origen===null&&r.sku==='000123'));
    assert.ok(rows.some(r=>r.conteo_1==='0.000000000'));
    const [[grants]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_op_permiso p JOIN ims_mig_aporte a ON a.inventario_id=p.inventario_id WHERE a.snapshot_id=?',[f.manifest.snapshot_id]);assert.equal(Number(grants.n),0);
    const [[cat]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_mig_catalogo WHERE snapshot_id=?',[f.manifest.snapshot_id]);assert.equal(Number(cat.n),5);
  }finally{await f.close();}
});
test('corte posterior con los mismos orígenes no apila ni sobrescribe el inventario',async()=>{
  const f=await preparar();let g;try{
    await aplicar(f);g=await preparar({origenes:f.origenes});
    await assert.rejects(aplicar(g),/otro plan\/corte/);assert.equal(await cantidad(f),5);
    const [[p]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_mig_plan WHERE snapshot_id=?',[g.manifest.snapshot_id]);assert.equal(Number(p.n),0);
  }finally{await f.close();if(g)await g.close();}
});
test('fallo real de FK del detalle revierte toda la carga nativa y permite reintentar',async()=>{
  const f=await preparar(),real=await pool.getConnection();try{
    const proxy=new Proxy(real,{get(target,key){
      if(key==='execute')return (sql,params)=>target.execute(sql,sql.startsWith('INSERT INTO ims_op_detalle_linea')?[randomUUID(),...params.slice(1)]:params);
      const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;
    }});
    await assert.rejects(aplicar(f,proxy));assert.equal(await cantidad(f),0);assert.equal(await cantidad(f,'ims_mig_aporte'),0);
    assert.equal((await aplicar(f)).filas,5);
  }finally{real.release();await f.close();}
});
test('plan rehecho con una cantidad falsa se rechaza al compararlo con staging',async()=>{
  const f=await preparar();try{
    const name=path.join(f.plan,'lineas_preparadas.jsonl'),rows=(await readFile(name,'utf8')).trim().split('\n').map(JSON.parse);rows[0].conteo_1='999.000000000';
    const body=rows.map(r=>canon(r)+'\n').join('');await writeFile(name,body);
    const mf=path.join(f.plan,'manifest.json'),m=JSON.parse(await readFile(mf,'utf8'));m.archivos['lineas_preparadas.jsonl']=sha(body);
    m.plan_id=sha(canon({version:m.version,reglas:m.reglas,snapshot_id:m.snapshot_id,archivos:m.archivos,resumen:m.resumen}));await writeFile(mf,JSON.stringify(m));
    await assert.rejects(aplicar(f),/proyección/);assert.equal(await cantidad(f),0);
  }finally{await f.close();}
});
test('alteración de una línea nativa no se arregla borrando y reimportando',async()=>{
  const f=await preparar();try{
    await aplicar(f);await pool.execute('UPDATE ims_op_linea SET conteo_1=77 WHERE origen_drive=?',[f.origenes[0]]);
    await assert.rejects(aplicar(f),/no coincide/);assert.equal(await cantidad(f),5);
    const [[r]]=await pool.execute('SELECT conteo_1 FROM ims_op_linea WHERE origen_drive=? LIMIT 1',[f.origenes[0]]);assert.equal(r.conteo_1,'77.000000000');
  }finally{await f.close();}
});
test('una línea añadida fuera del traslado impide declarar válido el reintento',async()=>{
  const f=await preparar();try{
    await aplicar(f);
    const [[r]]=await pool.execute('SELECT inventario_id,cliente_id FROM ims_op_linea WHERE origen_drive=? LIMIT 1',[f.origenes[0]]);
    await pool.execute('INSERT INTO ims_op_linea (id,inventario_id,cliente_id,sku,origen_drive,observacion) VALUES (?,?,?,?,?,?)',
      [randomUUID(),r.inventario_id,r.cliente_id,'LINEA_AJENA',f.origenes[0],'']);
    await assert.rejects(aplicar(f),/ajenas o ausentes/);assert.equal(await cantidad(f),6);
  }finally{await f.close();}
});
