import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {crearCorte} from './fixtures/corte.mjs';
import {planificarOperacion,validarPlan,destinoPrivado} from '../tools/planificar-operacion.mjs';
import {decimalCelda,uuidEstable} from '../src/migracion/modelo.mjs';

test('plan conserva fuentes IBM/VENTURA distintas y líneas con misma numeración/SKU',async()=>{
  const f=await crearCorte();try{
    const {manifest:m}=await planificarOperacion(f.cut,f.plan);assert.equal(m.resumen.inventarios_preparados,4);assert.equal(m.resumen.filas_preparadas,5);
    assert.equal(m.resumen.inventarios_revision,1);assert.equal(m.resumen.motivos.FUENTE_HIJA_PENDIENTE,1);
    const lines=(await readFile(path.join(f.plan,'lineas_preparadas.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(new Set(lines.map(r=>r.linea_id)).size,5);assert.equal(new Set(lines.map(r=>r.inventario_id)).size,4);
    assert.equal(lines[0].sku,'000123');assert.equal(lines[0].conteo_1,'0.000000000');assert.equal(lines[0].conteo_2,null);
    const again=await planificarOperacion(f.cut,path.join(f.dir,'plan2'));assert.equal(again.manifest.plan_id,m.plan_id);
    const all=(await Promise.all(['catalogo.jsonl','incidencias.jsonl','lineas_preparadas.jsonl','manifest.json'].map(n=>readFile(path.join(f.plan,n),'utf8')))).join('');
    assert.equal(all.includes('VALOR_SENSIBLE_SINTETICO'),false);
  }finally{await f.close();}
});
test('un cliente vacío bloquea su inventario completo, sin adivinar desde el panel',async()=>{
  const f=await crearCorte({mutarInv:rows=>{rows[0].celdas=rows[0].celdas.filter(c=>c.columna!==5);}});
  try{const {manifest:m}=await planificarOperacion(f.cut,f.plan);assert.equal(m.resumen.filas_preparadas,3);assert.equal(m.resumen.filas_conservadas_para_revision,2);assert.equal(m.resumen.motivos.CLIENTE_VACIO,1);}finally{await f.close();}
});
test('negativos y texto ambiguo no se convierten a cero',async()=>{
  for(const value of ['-1','1,000']){
    const f=await crearCorte({mutarInv:rows=>{rows[0].celdas.find(c=>c.columna===22).valor=value;}});
    try{const {manifest:m}=await planificarOperacion(f.cut,f.plan);assert.equal(m.resumen.filas_conservadas_para_revision,2);}finally{await f.close();}
  }
  assert.equal(decimalCelda({tipo:'n',valor:'1.25e2'}),'125.000000000');
  assert.equal(decimalCelda({tipo:'n',valor:'0'}),'0.000000000');assert.equal(decimalCelda(undefined),null);
});
test('solo estado Entregado exacto habilita preparar el histórico',async()=>{
  for(const estado of ['No entregado','Entregado pendiente de validación','Entregado?']){
    const f=await crearCorte({estado:i=>i===0?estado:(i===4?'En Proceso':'Entregado')});
    try{const {manifest:m}=await planificarOperacion(f.cut,f.plan);assert.equal(m.resumen.inventarios_preparados,3);}finally{await f.close();}
  }
});
test('cliente ajeno al catálogo y códigos mezclados requieren revisión',async()=>{
  const f=await crearCorte({mutarInv:rows=>{rows[0].celdas.find(c=>c.columna===5).valor='ALIAS_NO_CONFIRMADO';rows[1].celdas.find(c=>c.columna===3).valor='OTRO_ID';}});
  try{const {manifest:m}=await planificarOperacion(f.cut,f.plan);assert.equal(m.resumen.motivos.CLIENTE_NO_CATALOGADO,1);assert.equal(m.resumen.motivos.IDS_OPERATIVOS_MEZCLADOS,1);}finally{await f.close();}
});
test('destino en código, sobrescritura y plan alterado se rechazan',async()=>{
  await assert.rejects(destinoPrivado(fileURLToPath(new URL('../datos-plan-no-crear',import.meta.url))),/fuera/);
  const f=await crearCorte();try{
    await planificarOperacion(f.cut,f.plan);await assert.rejects(planificarOperacion(f.cut,f.plan),/existe/);
    await writeFile(path.join(f.plan,'lineas_preparadas.jsonl'),'alterado');await assert.rejects(validarPlan(f.plan),/Integridad/);
  }finally{await f.close();}
});
test('identidad determinista no usa SKU ni número de línea como clave única',()=>{
  assert.equal(uuidEstable('inventario','fuente-a'),uuidEstable('inventario','fuente-a'));
  assert.notEqual(uuidEstable('inventario','fuente-a'),uuidEstable('inventario','fuente-b'));
  assert.notEqual(uuidEstable('cliente','A'),uuidEstable('inventario','A'));
});
test('una fila que solo contiene notas queda en staging sin crear existencias',async()=>{
  const f=await crearCorte({mutarInv:rows=>rows.push({fila:7,origen_drive:null,celdas:[],notas:{C7:'Nota sin existencia'}})});
  try{
    const {manifest:m}=await planificarOperacion(f.cut,f.plan);
    assert.equal(m.resumen.filas_originales,5);assert.equal(m.resumen.filas_preparadas,5);
    const inv=f.manifest.hojas.find(r=>r.nombre==='INVENTARIOS');
    assert.equal(inv.filas_almacenadas,7);assert.equal(inv.filas_datos_contrato,5);
  }finally{await f.close();}
});
