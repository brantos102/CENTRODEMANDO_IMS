import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {crearCorte} from './fixtures/corte.mjs';
import {planificarOperacion} from '../tools/planificar-operacion.mjs';
import {revisarIncidencias,guardarRevision} from '../tools/revisar-incidencias.mjs';
import {hashFile} from '../tools/importar-snapshot.mjs';

async function fixture(options){const f=await crearCorte(options);try{await planificarOperacion(f.cut,f.plan);return f;}catch(e){await f.close();throw e;}}
test('revisión distingue códigos distintos de variaciones de formato sin aprobarlos',async()=>{
  for(const [codigo,equivalente] of [['250724_ibm',true],['250725_IBM',false]]){
    const f=await fixture({mutarInv:rows=>{rows[1].celdas.find(c=>c.columna===3).valor=codigo;}});
    try{
      const r=await revisarIncidencias(f.cut,f.plan),mix=r.mezcla_codigos;
      assert.equal(r.inventarios_preparados,3);assert.equal(mix.archivos,1);
      assert.equal(mix.equivalentes_al_normalizar_formato,equivalente?1:0);
      assert.equal(mix.codigos_distintos_aun_normalizados,equivalente?0:1);
      assert.equal(mix.ejemplos[0].codigos.length,2);assert.equal(mix.ejemplos[0].codigos[1].primera_fila,3);
      assert.equal(r.base_de_datos_modificada,false);
    }finally{await f.close();}
  }
});
test('IBM/VENTURA con el mismo código en diferentes fuentes no se diagnostican como mezclados',async()=>{
  const f=await fixture();try{
    const r=await revisarIncidencias(f.cut,f.plan);
    assert.equal(r.mezcla_codigos.archivos,0);assert.equal(r.inventarios_preparados,4);
    assert.equal(r.revision_sin_lineas.length,1);assert.equal(r.revision_sin_lineas[0].fila_panel,6);
  }finally{await f.close();}
});
test('muestras ubican columnas sin publicar contenido de cantidades, notas ni hojas administrativas',async()=>{
  const sensible='NO_PUBLICAR_VALOR_SENSIBLE';
  const f=await fixture({mutarInv:rows=>{
    rows[0].celdas.find(c=>c.columna===22).valor=sensible;
    rows[0].celdas.find(c=>c.columna===3).valor=sensible;
    rows[0].celdas.find(c=>c.columna===5).valor='';
    rows[0].celdas.find(c=>c.columna===9).valor=sensible.repeat(15);
    rows[1].celdas.find(c=>c.columna===22).valor='-2';
  }});
  try{
    const r=await revisarIncidencias(f.cut,f.plan),text=JSON.stringify(r);
    assert.equal(text.includes(sensible),false);assert.equal(text.includes('VALOR_SENSIBLE_SINTETICO'),false);
    assert.equal(text.includes('Nota humana'),false);assert.equal(text.includes('Producto sintético'),false);
    assert.equal(r.incidencias_de_filas.CONTEO_NEGATIVO.ejemplos[0].celdas[0].columna,'V');
    assert.equal(r.incidencias_de_filas.CLIENTE_VACIO.ejemplos[0].fila_inventarios,2);
    assert.equal(r.incidencias_de_filas.CAMPO_FUERA_LONGITUD.ejemplos[0].celdas[0].columna,'I');
    assert.ok(r.mezcla_codigos.ejemplos[0].codigos[0].codigo.id_no_estandar);
  }finally{await f.close();}
});
test('guardar revisión conserva corte y plan y rechaza sobrescribir una carpeta',async()=>{
  const f=await fixture();try{
    const paths=[path.join(f.cut,'manifest.json'),path.join(f.cut,'hoja_002.jsonl'),path.join(f.plan,'manifest.json')];
    const antes=await Promise.all(paths.map(hashFile)),salida=path.join(f.dir,'revision');
    const r=await guardarRevision(f.cut,f.plan,salida);assert.equal(JSON.parse(await readFile(r.archivo,'utf8')).ok,true);
    assert.deepEqual(await Promise.all(paths.map(hashFile)),antes);
    await assert.rejects(guardarRevision(f.cut,f.plan,salida),/existe/);
  }finally{await f.close();}
});
test('corte alterado se rechaza antes de crear el informe',async()=>{
  const f=await fixture();try{
    await writeFile(path.join(f.cut,'hoja_002.jsonl'),'ALTERADO');
    const salida=path.join(f.dir,'revision');await assert.rejects(guardarRevision(f.cut,f.plan,salida),/Integridad/);
    await assert.rejects(stat(salida),{code:'ENOENT'});
  }finally{await f.close();}
});
