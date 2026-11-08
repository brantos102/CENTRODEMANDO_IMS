import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {crearCorte} from './fixtures/corte.mjs';
import {planificarOperacion} from '../tools/planificar-operacion.mjs';
import {prepararLista,encontrarPlan,verificarTraslado} from '../tools/preparar-traslado.mjs';
import {hashFile} from '../tools/importar-snapshot.mjs';

test('elige el plan revisado por hash y enumera el corte completo sin cambiar fuentes ni publicar valores',async()=>{
  const f=await crearCorte();try{
    const good=path.join(f.dir,'VALIDACION_REGLAS_20261108_000001');await mkdir(good);
    const p=await planificarOperacion(f.cut,path.join(good,'plan'));
    const other=path.join(f.dir,'VALIDACION_REGLAS_20261108_000002');await mkdir(other);
    await planificarOperacion(f.cut,path.join(other,'plan'),{clientePanel:true});
    assert.equal(await encontrarPlan(f.cut,p.manifest.plan_id),path.join(good,'plan'));
    const originalHash=await hashFile(path.join(f.cut,'hoja_002.jsonl'));
    const r=await prepararLista({corteDir:f.cut,salidaDir:path.join(f.dir,'envio'),snapshotId:f.manifest.snapshot_id,planId:p.manifest.plan_id,
      original:path.join(f.cut,'fuente.xlsx'),shaOriginal:f.manifest.snapshot_id});
    const lista=JSON.parse(await readFile(r.archivo_lista,'utf8'));
    assert.equal(lista.archivos.length,f.manifest.hojas.length+8);
    assert.ok(lista.archivos.some(a=>a.nombre==='corte/hoja_004.jsonl'));
    assert.ok(lista.archivos.some(a=>a.nombre==='evidencia/fuente_original.xlsx'));
    assert.equal(JSON.stringify(r).includes('VALOR_SENSIBLE_SINTETICO'),false);
    assert.equal(await hashFile(path.join(f.cut,'hoja_002.jsonl')),originalHash);
  }finally{await f.close();}
});
test('corte equivocado, plan diferente y respaldo alterado detienen antes de producir una lista',async()=>{
  const f=await crearCorte();try{
    const p=await planificarOperacion(f.cut,f.plan);
    await assert.rejects(verificarTraslado(f.cut,f.plan,'0'.repeat(64),p.manifest.plan_id),/revisados/);
    await assert.rejects(verificarTraslado(f.cut,f.plan,f.manifest.snapshot_id,'0'.repeat(64)),/revisados/);
    const out=path.join(f.dir,'no_crear');
    await assert.rejects(prepararLista({corteDir:f.cut,planDir:f.plan,salidaDir:out,snapshotId:f.manifest.snapshot_id,planId:p.manifest.plan_id,
      original:path.join(f.cut,'fuente.xlsx'),shaOriginal:'0'.repeat(64)}),/respaldo/);
    await assert.rejects(stat(out),{code:'ENOENT'});
  }finally{await f.close();}
});
