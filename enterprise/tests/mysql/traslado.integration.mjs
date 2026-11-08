import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {crearPoolConteos} from '../../src/mysql/conteos.mjs';
import {crearCorte} from '../fixtures/corte.mjs';
import {validateSnapshot,importSnapshot} from '../../tools/importar-snapshot.mjs';
import {planificarOperacion,identidadPlan} from '../../tools/planificar-operacion.mjs';
import {trasladarOperacion} from '../../tools/trasladar-operacion.mjs';
import {canon,sha,uuidEstable} from '../../src/migracion/modelo.mjs';
if(process.env.IMS_MYSQL_PRUEBAS!=='1'||!/^centromando_ims_pruebas(?:_[a-z0-9]+)?$/.test(process.env.MYSQL_DATABASE||''))throw Error('Solo una base exclusiva de pruebas.');
let pool;
before(async()=>{pool=await crearPoolConteos(process.env);});after(async()=>{if(pool)await pool.end();});
async function preparar(options,politica){const f=await crearCorte(options);const c=await pool.getConnection();try{await importSnapshot(await validateSnapshot(f.cut),c);await planificarOperacion(f.cut,f.plan,politica);}catch(e){await f.close();throw e;}finally{c.release();}return f;}
async function aplicar(f,connection){const c=connection||await pool.getConnection();try{return await trasladarOperacion({planDir:f.plan,snapshotDir:f.cut,connection:c});}finally{if(!connection)c.release();}}
async function cantidad(f,table='ims_op_linea'){
  assert.ok(['ims_op_linea','ims_mig_aporte','ims_mig_conteo_aporte'].includes(table));const [[r]]=await pool.execute(`SELECT COUNT(*) AS n FROM ${table} WHERE origen_drive IN (${f.origenes.map(()=>'?').join(',')})`,f.origenes);return Number(r.n);
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

async function actualizarHashPlan(f,nombre,rows){
  const body=rows.map(r=>canon(r)+'\n').join('');await writeFile(path.join(f.plan,nombre),body);
  const file=path.join(f.plan,'manifest.json'),m=JSON.parse(await readFile(file,'utf8'));m.archivos[nombre]=sha(body);
  m.plan_id=sha(canon(identidadPlan(m)));await writeFile(file,JSON.stringify(m));
}
test('cliente obligatorio del panel se traslada y reintenta conservando el cliente original en staging',async()=>{
  const f=await preparar({mutarInv:rows=>{rows[0].celdas.find(c=>c.columna===5).valor='ALIAS_SINTETICO';rows[1].celdas=rows[1].celdas.filter(c=>c.columna!==5);}},{clientePanel:true});
  try{
    assert.equal((await aplicar(f)).filas,5);assert.equal((await aplicar(f)).yaTrasladado,true);assert.equal(await cantidad(f),5);
    const [rows]=await pool.execute(`SELECT cl.nombre,r.contenido FROM ims_op_linea l
      JOIN ims_op_cliente cl ON cl.id=l.cliente_id JOIN ims_mig_linea m ON m.linea_id=l.id
      JOIN ims_snapshot_fila r ON r.snapshot_id=m.snapshot_id AND r.hoja=m.hoja AND r.numero_fila=m.fila_consolidado
      WHERE l.origen_drive=? ORDER BY m.fila_consolidado`,[f.origenes[0]]);
    assert.ok(rows.every(r=>r.nombre==='IBM'));assert.equal(rows.length,2);
    assert.equal(JSON.parse(rows[0].contenido).celdas.find(c=>c.columna===5).valor,'ALIAS_SINTETICO');
    assert.equal(JSON.parse(rows[1].contenido).celdas.some(c=>c.columna===5),false);
    const [[grants]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_op_permiso p JOIN ims_mig_aporte a ON a.inventario_id=p.inventario_id WHERE a.snapshot_id=?',[f.manifest.snapshot_id]);assert.equal(Number(grants.n),0);
  }finally{await f.close();}
});
test('cliente del catálogo alterado y con hash recalculado no reemplaza la autoridad del panel',async()=>{
  const f=await preparar(undefined,{clientePanel:true});try{
    const rows=(await readFile(path.join(f.plan,'catalogo.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);rows[0].cliente_panel='VENTURA';
    await actualizarHashPlan(f,'catalogo.jsonl',rows);
    await assert.rejects(aplicar(f),/Catálogo no corresponde/);assert.equal(await cantidad(f),0);
  }finally{await f.close();}
});
test('proyección con otro cliente y hash rehecho se rechaza aunque ese cliente exista en el panel',async()=>{
  const f=await preparar(undefined,{clientePanel:true});try{
    const rows=(await readFile(path.join(f.plan,'lineas_preparadas.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
    rows[0].cliente='VENTURA';rows[0].cliente_id=uuidEstable('cliente','VENTURA');await actualizarHashPlan(f,'lineas_preparadas.jsonl',rows);
    await assert.rejects(aplicar(f),/proyección/);assert.equal(await cantidad(f),0);assert.equal(await cantidad(f,'ims_mig_aporte'),0);
  }finally{await f.close();}
});
test('regla de miles conserva texto original, cantidades exactas y reintento en MySQL',async()=>{
  const f=await preparar({mutarInv:rows=>{
    rows[3].celdas.find(c=>c.columna===3).valor='260608_CIBERC';
    const c=rows[3].celdas.find(c=>c.columna===22);c.valor='2,000';c.tipo='s';
  }},{clientePanel:true,conteosMiles:[{codigo_operativo:'260608_CIBERC',total_conteo_1:'2000'}]});
  try{
    assert.equal((await aplicar(f)).filas,5);assert.equal((await aplicar(f)).yaTrasladado,true);
    const [[r]]=await pool.execute(`SELECT l.conteo_1,r.contenido FROM ims_op_linea l JOIN ims_mig_linea m ON m.linea_id=l.id
      JOIN ims_snapshot_fila r ON r.snapshot_id=m.snapshot_id AND r.hoja=m.hoja AND r.numero_fila=m.fila_consolidado
      WHERE l.origen_drive=?`,[f.origenes[2]]);
    assert.equal(r.conteo_1,'2000.000000000');assert.equal(JSON.parse(r.contenido).celdas.find(c=>c.columna===22).valor,'2,000');
  }finally{await f.close();}
});
test('un control total o un origen alterados se rechazan aunque se recalcule el hash del plan',async()=>{
  for(const campo of ['total','origen']){
    const f=await preparar({mutarInv:rows=>{rows[3].celdas.find(c=>c.columna===3).valor='260608_CIBERC';const c=rows[3].celdas.find(c=>c.columna===22);c.valor='2,000';c.tipo='s';}},
      {conteosMiles:[{codigo_operativo:'260608_CIBERC',total_conteo_1:'2000'}]});
    try{
      const file=path.join(f.plan,'manifest.json'),m=JSON.parse(await readFile(file,'utf8'));
      if(campo==='total')m.opciones.cantidades[0].total_conteo_1='975.000000000';else m.opciones.cantidades[0].origen_drive=f.origenes[3];
      m.plan_id=sha(canon(identidadPlan(m)));await writeFile(file,JSON.stringify(m));
      await assert.rejects(aplicar(f),campo==='total'?/total de CONTEO/:/no corresponde al origen/);assert.equal(await cantidad(f),0);
    }finally{await f.close();}
  }
});

const gruposCompartidos=[{codigo_operativo:'280818_CORRCAL',filas:1},{codigo_operativo:'250818_CORRCAL',filas:1}];
async function prepararSeparado(origenes){
  return preparar({origenes,mutarInv:rows=>{
    rows[0].celdas.find(c=>c.columna===3).valor=gruposCompartidos[0].codigo_operativo;
    rows[1].celdas.find(c=>c.columna===3).valor=gruposCompartidos[1].codigo_operativo;
    rows[3].celdas.find(c=>c.columna===3).valor='260608_CIBERC';const c=rows[3].celdas.find(c=>c.columna===22);c.valor='2,000';c.tipo='s';
  }},{clientePanel:true,separarConteos:[gruposCompartidos],conteosMiles:[{codigo_operativo:'260608_CIBERC',total_conteo_1:'2000'}]});
}
test('dos conteos de un archivo físico se trasladan y reintentan sin duplicar líneas ni perder el cero',async()=>{
  const f=await prepararSeparado();try{
    const r=await aplicar(f);assert.equal(r.inventarios,4);assert.equal(r.conteos,5);assert.equal(r.filas,5);
    assert.equal((await aplicar(f)).yaTrasladado,true);assert.equal(await cantidad(f),5);assert.equal(await cantidad(f,'ims_mig_conteo_aporte'),5);
    const [rows]=await pool.execute(`SELECT i.id,i.codigo_operativo,l.conteo_1,l.origen_drive FROM ims_op_inventario i
      JOIN ims_op_linea l ON l.inventario_id=i.id WHERE l.origen_drive=? ORDER BY i.codigo_operativo`,[f.origenes[0]]);
    assert.equal(new Set(rows.map(r=>r.id)).size,2);assert.deepEqual(rows.map(r=>r.codigo_operativo),['250818_CORRCAL','280818_CORRCAL']);
    assert.deepEqual(rows.map(r=>r.conteo_1),['2.125000000','0.000000000']);
    const [[q]]=await pool.execute('SELECT conteo_1 FROM ims_op_linea WHERE origen_drive=?',[f.origenes[2]]);assert.equal(q.conteo_1,'2000.000000000');
    const [[grants]]=await pool.execute('SELECT COUNT(*) AS n FROM ims_op_permiso p JOIN ims_mig_conteo_aporte a ON a.inventario_id=p.inventario_id WHERE a.snapshot_id=?',[f.manifest.snapshot_id]);assert.equal(Number(grants.n),0);
  }finally{await f.close();}
});
test('una línea atribuida al otro conteo del mismo archivo se rechaza antes de confirmar',async()=>{
  const f=await prepararSeparado();try{
    const rows=(await readFile(path.join(f.plan,'lineas_preparadas.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
    rows[0].inventario_id=rows[1].inventario_id;await actualizarHashPlan(f,'lineas_preparadas.jsonl',rows);
    await assert.rejects(aplicar(f),/proyección/);assert.equal(await cantidad(f),0);assert.equal(await cantidad(f,'ims_mig_conteo_aporte'),0);
  }finally{await f.close();}
});
test('una separación cambia el modelo del plan pero no sobrescribe un origen de una carga anterior',async()=>{
  const f=await prepararSeparado();let legacy;
  try{
    await aplicar(f);legacy=await preparar({origenes:f.origenes});
    await assert.rejects(aplicar(legacy),/otro plan\/corte/);assert.equal(await cantidad(f),5);
  }finally{await f.close();if(legacy)await legacy.close();}
});
test('fallo durante el traslado de un conteo compartido revierte todos los conteos de la carga',async()=>{
  const f=await prepararSeparado(),real=await pool.getConnection();try{
    const proxy=new Proxy(real,{get(target,key){
      if(key==='execute')return (sql,params)=>target.execute(sql,sql.startsWith('INSERT INTO ims_op_detalle_linea')?[randomUUID(),...params.slice(1)]:params);
      const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
    }});
    await assert.rejects(aplicar(f,proxy));assert.equal(await cantidad(f),0);assert.equal(await cantidad(f,'ims_mig_conteo_aporte'),0);
    assert.equal((await aplicar(f)).conteos,5);
  }finally{real.release();await f.close();}
});
test('un origen importado con la política anterior tampoco se reemplaza mediante una separación nueva',async()=>{
  const legacy=await preparar();let separado;
  try{
    await aplicar(legacy);separado=await prepararSeparado(legacy.origenes);
    await assert.rejects(aplicar(separado),/otro plan\/corte/);assert.equal(await cantidad(legacy),5);assert.equal(await cantidad(legacy,'ims_mig_aporte'),4);
    assert.equal(await cantidad(separado,'ims_mig_conteo_aporte'),0);
  }finally{await legacy.close();if(separado)await separado.close();}
});
test('un código del registro de aportes alterado bloquea el reintento sin reparar ni sobrescribir datos',async()=>{
  const f=await prepararSeparado();try{
    await aplicar(f);
    const [[r]]=await pool.execute('SELECT inventario_id FROM ims_mig_conteo_aporte WHERE origen_drive=? ORDER BY codigo_operativo LIMIT 1',[f.origenes[0]]);
    await pool.execute('UPDATE ims_mig_conteo_aporte SET codigo_operativo=? WHERE inventario_id=?',['CODIGO_ALTERADO',r.inventario_id]);
    await assert.rejects(aplicar(f),/Origen nativo incompatible/);assert.equal(await cantidad(f),5);
    const [[i]]=await pool.execute('SELECT codigo_operativo FROM ims_op_inventario WHERE id=?',[r.inventario_id]);assert.equal(i.codigo_operativo,'250818_CORRCAL');
  }finally{await f.close();}
});
