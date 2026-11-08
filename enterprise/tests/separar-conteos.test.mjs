import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {crearCorte} from './fixtures/corte.mjs';
import {planificarOperacion,validarPlan,politicaPlan} from '../tools/planificar-operacion.mjs';
import {revisarIncidencias} from '../tools/revisar-incidencias.mjs';
import {hashFile} from '../tools/importar-snapshot.mjs';
import {conteosPreparados,idConteo,validarSeparaciones} from '../tools/separar-conteos.mjs';
import {uuidEstable} from '../src/migracion/modelo.mjs';

const grupos=[{codigo_operativo:'280818_CORRCAL',filas:1},{codigo_operativo:'250818_CORRCAL',filas:1}];
async function fixture(options={}){return crearCorte({...options,mutarInv:(rows,ids)=>{
  rows[0].celdas.find(c=>c.columna===3).valor=grupos[0].codigo_operativo;
  rows[1].celdas.find(c=>c.columna===3).valor=grupos[1].codigo_operativo;
  for(const row of rows.slice(0,2))row.celdas.push({columna:1,tipo:'s',valor:'12/09/2025',estilo:'0'});
  options.mutarInv?.(rows,ids);
}});}
const leer=async(dir,name)=>(await readFile(path.join(dir,name),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);

test('dos códigos autorizados en un origen conservan líneas y generan dos conteos sin renombrar fechas',async()=>{
  const f=await fixture();try{
    const raw=path.join(f.cut,'hoja_002.jsonl'),antes=await hashFile(raw),p=path.join(f.dir,'separado');
    const legacy=await planificarOperacion(f.cut,f.plan);assert.equal(legacy.manifest.resumen.motivos.IDS_OPERATIVOS_MEZCLADOS,1);
    const {manifest:m}=await planificarOperacion(f.cut,p,{clientePanel:true,separarConteos:[grupos]});
    assert.equal(m.reglas,'historico-entregado-conteos-v4');assert.equal(m.resumen.inventarios_panel,5);
    assert.equal(m.resumen.inventarios_preparados,4);assert.equal(m.resumen.conteos_preparados,5);assert.equal(m.resumen.filas_preparadas,5);
    const politica=politicaPlan(m),cat=await leer(p,'catalogo.jsonl'),native=conteosPreparados(cat,politica.separaciones),rows=await leer(p,'lineas_preparadas.jsonl');
    assert.equal(native.length,5);const source=rows.filter(r=>r.origen_drive===f.origenes[0]);
    assert.equal(source.length,2);assert.equal(new Set(source.map(r=>r.inventario_id)).size,2);assert.equal(new Set(rows.map(r=>r.linea_id)).size,5);
    assert.deepEqual(new Set(source.map(r=>r.conteo_1)),new Set(['0.000000000','2.125000000']));
    assert.equal(source[0].inventario_id,idConteo(f.origenes[0],'280818_CORRCAL'));assert.equal(source[1].inventario_id,idConteo(f.origenes[0],'250818_CORRCAL'));
    assert.equal(rows.find(r=>r.origen_drive===f.origenes[1]).inventario_id,uuidEstable('inventario',f.origenes[1]));
    assert.equal(await hashFile(raw),antes);
    assert.equal((await validarPlan(p)).manifest.plan_id,m.plan_id);
    const revision=await revisarIncidencias(f.cut,p);assert.equal(revision.mezcla_codigos.archivos,0);
    assert.equal(revision.separaciones_autorizadas.length,1);assert.equal(revision.separaciones_autorizadas[0].filas_inventarios,2);
  }finally{await f.close();}
});
test('orden de códigos no cambia identidades ni plan; códigos iguales en otro origen permanecen distintos',async()=>{
  const f=await fixture({mutarInv:rows=>{rows[2].celdas.find(c=>c.columna===3).valor='280818_CORRCAL';}});try{
    const a=await planificarOperacion(f.cut,f.plan,{separarConteos:[grupos]});
    const b=await planificarOperacion(f.cut,path.join(f.dir,'otro'),{separarConteos:[[...grupos].reverse()]});
    assert.equal(a.manifest.plan_id,b.manifest.plan_id);
    const rows=await leer(f.plan,'lineas_preparadas.jsonl');assert.equal(new Set(rows.map(r=>r.inventario_id)).size,5);
  }finally{await f.close();}
});
test('cantidad incorrecta, código desconocido o separación repetida se rechazan antes del plan',async()=>{
  for(const solicitudes of [
    [[{codigo_operativo:grupos[0].codigo_operativo,filas:2},grupos[1]]],
    [[grupos[0],{codigo_operativo:'OTRO',filas:1}]],
    [grupos,grupos]
  ]){
    const f=await fixture();try{
      await assert.rejects(planificarOperacion(f.cut,f.plan,{separarConteos:solicitudes}));await assert.rejects(stat(f.plan),{code:'ENOENT'});
    }finally{await f.close();}
  }
});
test('una separación no reúne líneas de dos archivos físicos ni retira cantidades inválidas',async()=>{
  const f=await fixture({mutarInv:(rows,ids)=>{rows[1].origen_drive=ids[1];rows[1].notas={C3:'IMS_ORIGEN_DRIVE='+ids[1]};}});try{
    // Esta mutación cambia los aportes de la fixture: se comprueba el resolver
    // mediante un corte válido sin reutilizar el manifiesto de filas anterior.
    await assert.rejects(planificarOperacion(f.cut,f.plan,{separarConteos:[grupos]}),/único archivo físico completo/);
  }finally{await f.close();}
  const g=await fixture({mutarInv:rows=>{rows[0].celdas.find(c=>c.columna===22).valor='-1';}});try{
    const {manifest:m}=await planificarOperacion(g.cut,g.plan,{separarConteos:[grupos]});
    assert.equal(m.resumen.motivos.CONTEO_NEGATIVO,1);assert.equal(m.resumen.inventarios_preparados,3);
    assert.equal(m.resumen.conteos_preparados,3);assert.equal(m.resumen.filas_conservadas_para_revision,2);
  }finally{await g.close();}
});
test('estado pendiente se conserva y no se activa por separar códigos; identidad falsificada se rechaza',async()=>{
  const f=await fixture({estado:i=>i===0?'En Validación':i===4?'En Proceso':'Entregado'});try{
    const {manifest:m}=await planificarOperacion(f.cut,f.plan,{separarConteos:[grupos]});
    assert.equal(m.resumen.inventarios_preparados,3);assert.equal(m.resumen.conteos_preparados,3);assert.equal(m.resumen.motivos.FUENTE_HIJA_PENDIENTE,2);
    const reglas=structuredClone(m.opciones.separaciones);reglas[0].grupos[0].inventario_id=uuidEstable('inventario','otra');
    assert.throws(()=>validarSeparaciones(reglas),/Identidad/);
  }finally{await f.close();}
});
