import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {crearCorte} from './fixtures/corte.mjs';
import {planificarOperacion,validarPlan,REGLAS_ORIGINAL,REGLAS_CLIENTE_PANEL} from '../tools/planificar-operacion.mjs';
import {revisarIncidencias} from '../tools/revisar-incidencias.mjs';
import {hashFile} from '../tools/importar-snapshot.mjs';
import {sha,canon} from '../src/migracion/modelo.mjs';

async function cambiarPanel(f,mutar){
  const hoja=f.manifest.hojas.find(h=>h.nombre==='PANEL DE CONTROL'),file=path.join(f.cut,hoja.archivo);
  const rows=(await readFile(file,'utf8')).trim().split('\n').map(JSON.parse);mutar(rows);
  const body=rows.map(r=>JSON.stringify(r)+'\n').join('');await writeFile(file,body);hoja.sha256=sha(body);hoja.filas_almacenadas=rows.length;
  await writeFile(path.join(f.cut,'manifest.json'),JSON.stringify(f.manifest));
}
async function lineas(dir){const s=await readFile(path.join(dir,'lineas_preparadas.jsonl'),'utf8');return s.trim()?s.trim().split('\n').map(JSON.parse):[];}

test('cliente del panel es obligatorio solo en un plan nuevo con la política explícita',async()=>{
  const f=await crearCorte({mutarInv:rows=>{
    rows[0].celdas.find(c=>c.columna===5).valor='ALIAS_ORIGINAL';
    rows[1].celdas.find(c=>c.columna===5).valor='VENTURA';
    rows[2].celdas=rows[2].celdas.filter(c=>c.columna!==5);
  }});
  try{
    const hoja=path.join(f.cut,'hoja_002.jsonl'),antes=await hashFile(hoja);
    const legacy=await planificarOperacion(f.cut,f.plan);assert.equal(legacy.manifest.reglas,REGLAS_ORIGINAL);
    assert.equal(legacy.manifest.resumen.motivos.CLIENTE_NO_CATALOGADO,1);assert.equal(legacy.manifest.resumen.motivos.CLIENTE_VACIO,1);
    const nuevo=path.join(f.dir,'panel');const {manifest:m}=await planificarOperacion(f.cut,nuevo,{clientePanel:true});
    assert.equal(m.reglas,REGLAS_CLIENTE_PANEL);assert.notEqual(m.plan_id,legacy.manifest.plan_id);
    assert.equal(m.resumen.inventarios_preparados,4);assert.equal(m.resumen.filas_preparadas,5);assert.equal(m.resumen.filas_cliente_panel_aplicado,3);
    const rows=await lineas(nuevo);assert.ok(rows.filter(r=>f.origenes.slice(0,2).includes(r.origen_drive)).every(r=>r.cliente==='IBM'));
    const original=JSON.parse((await readFile(hoja,'utf8')).trim().split('\n')[1]);
    assert.equal(rows[0].contenido_sha256,sha(canon(original)));assert.equal(await hashFile(hoja),antes);
    const r=await revisarIncidencias(f.cut,nuevo);assert.equal(r.reglas,REGLAS_CLIENTE_PANEL);
    assert.equal(r.incidencias_de_filas.CLIENTE_NO_CATALOGADO,undefined);assert.equal(r.incidencias_de_filas.CLIENTE_VACIO,undefined);
    assert.equal((await validarPlan(nuevo)).manifest.plan_id,m.plan_id);
  }finally{await f.close();}
});
test('panel sin cliente no utiliza el nombre de la línea como sustituto',async()=>{
  const f=await crearCorte();try{
    await cambiarPanel(f,rows=>{rows[1].celdas.find(c=>c.columna===1).valor='';});
    const {manifest:m}=await planificarOperacion(f.cut,f.plan,{clientePanel:true});
    assert.equal(m.resumen.inventarios_preparados,3);assert.equal(m.resumen.motivos.CLIENTE_PANEL_VACIO,1);
    assert.equal((await lineas(f.plan)).some(r=>r.origen_drive===f.origenes[0]),false);
  }finally{await f.close();}
});
test('origen duplicado con distintos clientes en el panel no elige un cliente ni duplica líneas',async()=>{
  const f=await crearCorte();try{
    await cambiarPanel(f,rows=>{const copy=structuredClone(rows[1]);copy.fila=7;copy.celdas.find(c=>c.columna===1).valor='OTRO';rows.push(copy);});
    const {manifest:m}=await planificarOperacion(f.cut,f.plan,{clientePanel:true});
    assert.equal(m.resumen.motivos.ID_DRIVE_REPETIDO_PANEL,2);assert.equal(m.resumen.filas_originales,5);
    assert.equal(m.resumen.filas_preparadas,3);assert.equal(m.resumen.filas_conservadas_para_revision,2);
    assert.equal((await lineas(f.plan)).some(r=>r.origen_drive===f.origenes[0]),false);
  }finally{await f.close();}
});
test('autoridad del cliente no aprueba comas, negativos, códigos mezclados o estados pendientes',async()=>{
  const f=await crearCorte({mutarInv:rows=>{
    rows[0].celdas.find(c=>c.columna===22).valor='2,000';
    rows[1].celdas.find(c=>c.columna===3).valor='OTRO_CODIGO';
    rows[2].celdas.find(c=>c.columna===22).valor='-1';
  }});
  try{
    const {manifest:m}=await planificarOperacion(f.cut,f.plan,{clientePanel:true});
    for(const motivo of ['CONTEO_NO_NUMERICO_O_FUERA_PRECISION','CONTEO_NEGATIVO','IDS_OPERATIVOS_MEZCLADOS','FUENTE_HIJA_PENDIENTE'])assert.equal(m.resumen.motivos[motivo],1);
    assert.equal(m.resumen.filas_preparadas,2);
  }finally{await f.close();}
});
test('el mismo corte y política producen el mismo plan y se rechazan políticas desconocidas',async()=>{
  const f=await crearCorte();try{
    const a=await planificarOperacion(f.cut,f.plan,{clientePanel:true}),b=await planificarOperacion(f.cut,path.join(f.dir,'otro'),{clientePanel:true});
    assert.equal(a.manifest.plan_id,b.manifest.plan_id);
    await assert.rejects(planificarOperacion(f.cut,path.join(f.dir,'no'),{clientePanel:'true'}),/explícita/);
    const file=path.join(f.plan,'manifest.json'),m=JSON.parse(await readFile(file,'utf8'));m.reglas='regla-no-autorizada';
    m.plan_id=sha(canon({version:m.version,reglas:m.reglas,snapshot_id:m.snapshot_id,archivos:m.archivos,resumen:m.resumen}));await writeFile(file,JSON.stringify(m));
    await assert.rejects(validarPlan(f.plan),/Plan incompatible/);
  }finally{await f.close();}
});
