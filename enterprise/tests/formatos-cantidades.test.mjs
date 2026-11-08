import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {crearCorte} from './fixtures/corte.mjs';
import {decimalCelda} from '../src/migracion/modelo.mjs';
import {planificarOperacion,validarPlan} from '../tools/planificar-operacion.mjs';
import {clasificarCantidad,guardarAuditoriaFormatos} from '../tools/auditar-formatos-conteo.mjs';
import {revisarIncidencias} from '../tools/revisar-incidencias.mjs';
import {hashFile} from '../tools/importar-snapshot.mjs';

test('miles autorizados son exactos; no se cambian decimales reales ni se aceptan agrupaciones defectuosas',()=>{
  const opciones={milesComa:true,soloEnteros:true};
  for(const [v,n] of [['2,000','2000'],['1,000','1000'],['2,954','2954'],['1,234,567','1234567']])assert.equal(decimalCelda({tipo:'s',valor:v},opciones),n+'.000000000');
  for(const v of ['2,95','12,34,567','1,000.5','1,000,','-1','1.25'])assert.throws(()=>decimalCelda({tipo:'s',valor:v},opciones));
  assert.throws(()=>decimalCelda({tipo:'s',valor:'2,954'}));
  assert.equal(decimalCelda({tipo:'n',valor:'2.954'}),'2.954000000');
  assert.throws(()=>decimalCelda({tipo:'n',valor:'2.954'},opciones),/FRACCION/);
  assert.equal(decimalCelda({tipo:'n',valor:'2.000'},opciones),'2.000000000');
});
async function fixtureMiles({valor='2,000'}={}){
  return crearCorte({mutarInv:rows=>{rows[3].celdas.find(c=>c.columna===3).valor='260608_CIBERC';rows[3].celdas.find(c=>c.columna===22).valor=valor;rows[3].celdas.find(c=>c.columna===22).tipo='s';}});
}
test('plan exige un origen físico único y concilia el total autorizado sin tocar el original',async()=>{
  const f=await fixtureMiles();try{
    const file=path.join(f.cut,'hoja_002.jsonl'),before=await hashFile(file);
    const {manifest:m}=await planificarOperacion(f.cut,f.plan,{clientePanel:true,conteosMiles:[{codigo_operativo:'260608_CIBERC',total_conteo_1:'2000'}]});
    assert.equal(m.reglas,'historico-entregado-reglas-v3');assert.equal(m.resumen.controles_cantidades[0].total_conteo_1_calculado,'2000.000000000');
    assert.equal(m.opciones.cantidades[0].origen_drive,f.origenes[2]);
    const rows=(await readFile(path.join(f.plan,'lineas_preparadas.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(rows.find(r=>r.origen_drive===f.origenes[2]).conteo_1,'2000.000000000');
    assert.ok(rows.some(r=>r.conteo_1==='2.125000000'));assert.equal(await hashFile(file),before);
    assert.equal((await validarPlan(f.plan)).manifest.plan_id,m.plan_id);
    const r=await revisarIncidencias(f.cut,f.plan);assert.equal(r.incidencias_de_filas.CONTEO_NO_NUMERICO_O_FUERA_PRECISION,undefined);
  }finally{await f.close();}
});
test('total incorrecto, código ausente, duplicado físico y fracción sin autorización no generan plan',async()=>{
  for(const [valor,codigo,total] of [['2,000','260608_CIBERC','975'],['2,000','AUSENTE','2000'],['2,954','260608_CIBERC','2.954']]){
    const f=await fixtureMiles({valor});try{
      await assert.rejects(planificarOperacion(f.cut,f.plan,{conteosMiles:[{codigo_operativo:codigo,total_conteo_1:total}]}));
      await assert.rejects(stat(f.plan),{code:'ENOENT'});
    }finally{await f.close();}
  }
  const f=await crearCorte();try{
    await assert.rejects(planificarOperacion(f.cut,f.plan,{conteosMiles:[{codigo_operativo:'250724_IBM',total_conteo_1:'4.25'}]}));
    await assert.rejects(planificarOperacion(f.cut,f.plan,{conteosMiles:[{codigo_operativo:'250724_IBM',total_conteo_1:'4'}]}),/único archivo físico/);
  }finally{await f.close();}
});
test('auditoría revisa todos los orígenes y etapas sin exponer valores ni declarar inválidas las fracciones',async()=>{
  const f=await fixtureMiles();try{
    const before=await hashFile(path.join(f.cut,'hoja_002.jsonl')),r=await guardarAuditoriaFormatos(f.cut,path.join(f.dir,'auditoria'));
    const report=JSON.parse(await readFile(r.archivo_auditoria,'utf8'));
    assert.equal(report.filas_inventarios,5);assert.equal(report.columnas_revisadas.V.FRACCION_VALIDA,3);
    assert.equal(report.columnas_revisadas.V.TEXTO_COMA_GRUPOS_TRES,1);assert.equal(report.casos.length,1);
    assert.equal(report.casos[0].codigo,'260608_CIBERC');assert.equal(report.casos[0].columna,'V');
    assert.equal(JSON.stringify(report).includes('2,000'),false);assert.equal(JSON.stringify(report).includes('VALOR_SENSIBLE_SINTETICO'),false);
    assert.equal(await hashFile(path.join(f.cut,'hoja_002.jsonl')),before);
    assert.equal(clasificarCantidad({tipo:'n',valor:'1.234'}),'FRACCION_VALIDA');
    assert.equal(clasificarCantidad({tipo:'s',valor:'1.234'}),'TEXTO_PUNTO_GRUPOS_TRES');
    assert.equal(clasificarCantidad({tipo:'s',valor:'1,23'}),'TEXTO_COMA_OTRO_FORMATO');
  }finally{await f.close();}
});
