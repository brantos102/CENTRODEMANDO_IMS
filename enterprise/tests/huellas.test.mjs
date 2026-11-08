import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {crearCorte} from './fixtures/corte.mjs';
import {huellaFila,generarHuellas} from '../tools/generar-huellas-inventarios.mjs';
import {hashFile} from '../tools/importar-snapshot.mjs';
import {sha} from '../src/migracion/modelo.mjs';

test('huella compara valores sin depender de fila, notas, tipos o estilos; conserva ceros de SKU',async()=>{
  const f=await crearCorte();try{
    const a=f.datos[0],b=structuredClone(a);b.fila=99;b.notas={};b.celdas.reverse();
    b.celdas.forEach(c=>{c.estilo='999';c.tipo='s';});
    assert.equal(huellaFila(a).h,huellaFila(b).h);
    b.celdas.find(c=>c.columna===7).valor='123';assert.notEqual(huellaFila(a).h,huellaFila(b).h);
    const c=structuredClone(a);c.origen_drive=f.origenes[1];assert.equal(huellaFila(a).h,huellaFila(c).h);assert.notEqual(huellaFila(a).o,huellaFila(c).o);
  }finally{await f.close();}
});
test('paquete contiene solo hashes y posiciones, con control del contenido completo',async()=>{
  const f=await crearCorte();try{
    const r=await generarHuellas(f.cut,path.join(f.dir,'huellas')),raw=gunzipSync(await readFile(r.archivo_huellas)).toString('utf8');
    const lines=raw.trimEnd().split('\n'),head=JSON.parse(lines[0]),end=JSON.parse(lines.at(-1));
    assert.equal(head.snapshot_id,f.manifest.snapshot_id);assert.equal(head.filas,5);assert.equal(end.filas,5);
    assert.equal(end.sha256_contenido,sha(lines.slice(0,-1).join('\n')+'\n'));
    assert.equal(r.sha256_archivo,await hashFile(r.archivo_huellas));
    for(const value of ['VALOR_SENSIBLE_SINTETICO','"000123"','Producto sintético','Nota humana',...f.origenes])assert.equal(raw.includes(value),false);
    for(const line of lines.slice(1,-1)){
      const row=JSON.parse(line);assert.deepEqual(Object.keys(row).sort(),['c','f','h','o']);
      for(const key of ['c','h','o'])assert.match(row[key],/^[a-f0-9]{64}$/);
    }
  }finally{await f.close();}
});
test('la generación conserva el corte y no sobrescribe otra carpeta',async()=>{
  const f=await crearCorte();try{
    const input=path.join(f.cut,'hoja_002.jsonl'),before=await hashFile(input),out=path.join(f.dir,'huellas');
    await generarHuellas(f.cut,out);await assert.rejects(generarHuellas(f.cut,out),/existe/);
    assert.equal(await hashFile(input),before);
  }finally{await f.close();}
});
test('corte alterado falla antes de crear un paquete de huellas',async()=>{
  const f=await crearCorte();try{
    await writeFile(path.join(f.cut,'hoja_002.jsonl'),'ALTERADO');const out=path.join(f.dir,'huellas');
    await assert.rejects(generarHuellas(f.cut,out),/Integridad/);await assert.rejects(stat(out),{code:'ENOENT'});
  }finally{await f.close();}
});
