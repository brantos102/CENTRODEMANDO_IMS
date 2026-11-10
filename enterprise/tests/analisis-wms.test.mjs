import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {fisicoWms,analisisWms,resultadoWms} from '../src/dominio/analisis-wms.mjs';
import {filaStock,fecha} from '../src/dominio/operacion.mjs';
test('físico conserva la fórmula real: C1 parcial; C3 solo ante tres conteos y diferencia C1/C2',()=>{
 const r={conteo_1:'5',conteo_2:null,conteo_final:null,ajuste:'-1',depot:'4'};
 assert.equal(fisicoWms(r),4000000000n);assert.equal(fisicoWms({...r,conteo_2:'8'}),4000000000n);
 assert.equal(fisicoWms({...r,conteo_2:'5',conteo_final:'9'}),4000000000n);
 assert.equal(fisicoWms({...r,conteo_2:'8',conteo_final:'9'}),8000000000n);
 assert.equal(fisicoWms({...r,conteo_1:null}),null);
 assert.equal(resultadoWms({...r,conteo_1:'0',ajuste:null}).resultado,'FALTANTE');
});
test('exactitud distingue avance y un SKU con líneas pendientes; un error elimina su referencia correcta',()=>{
 const rows=[{sku:'001',posicion:'',depot:'10',conteo_1:'10'},{sku:'001',posicion:'B',depot:'10',conteo_1:null},
  {sku:'002',posicion:'C',depot:'5',conteo_1:'7'},{sku:'002',posicion:'D',depot:'5',conteo_1:'5'},
  {sku:'003',posicion:'X',depot:'99',conteo_1:null,categoria:'DIF_INV'}];
 const a=analisisWms(rows);
 assert.equal(a.kpis.efectividadUnidades,'66.7');assert.equal(a.kpis.efectividadRef,'50.0');
 assert.equal(a.kpis.refTotal,2);assert.equal(a.kpis.refValidadas,2);assert.equal(a.kpis.posTotal,4);
 assert.deepEqual(a.avance,{lineas:4,contadas:3,porcentaje:75});
});
test('sumas exceden el entero seguro de JS sin perder nueve decimales',()=>{
 const a=analisisWms([{sku:'A',posicion:'A',depot:'9007199254740993.000000001',conteo_1:'9007199254740993.000000001'},
  {sku:'B',depot:'0.000000001',conteo_1:'0.000000001'}]);
 assert.equal(a.kpis.uniTotal,'9007199254740993.000000002');assert.equal(a.kpis.efectividadUnidades,'100.0');
});
test('códigos, fechas y series inválidos fallan antes de SQL; no se interpreta DDMMAA como fecha',()=>{
 assert.throws(()=>fecha('2026-02-30'));assert.equal(fecha('2028-02-29'),'2028-02-29');
 const row={numero:1,clienteId:'00000000-0000-0000-0000-000000000001',sku:'001',depot:'2000',serie:'S'};
 assert.throws(()=>filaStock(row));assert.equal(filaStock({...row,serie:'0'}).sku,'001');
});
test('indicadores cotejados contra el código original de parseAnalysisData del WMS V124',async()=>{
 const source=await readFile(new URL('./fixtures/analisis-wms-v124.js',import.meta.url),'utf8');
 const context=vm.createContext({});vm.runInContext(source,context);
 for(let escenario=0;escenario<15;escenario++){
  const filas=Array.from({length:80},(_,i)=>({sku:'SKU_'+(i%7),posicion:i%5?'P_'+(i%9):'',categoria:i%13===0?'DIF_INV':'',
   depot:String((i+escenario)%17),conteo_1:i%4?String((i+escenario+1)%19):null,conteo_2:i%6?'4':null,conteo_final:i%7?'6':null,ajuste:i%5===0?'-1':null}));
  const rows=filas.map(r=>{const a=Array(30).fill(''),x=resultadoWms(r);a[6]=r.sku;a[12]=r.categoria;a[14]=r.posicion;a[16]=r.depot;a[17]=x.fisico??'';a[18]=x.desfase??'';a[19]=x.resultado;return a;});
  const oficial=context.parseAnalysisData(rows).kpis,nuevo=analisisWms(filas).kpis;
  for(const k of ['efectividadUnidades','efectividadRef','efectividadPos'])assert.equal(String(nuevo[k]),Number(oficial[k]).toFixed(1));
  for(const k of ['refValidadas','refTotal','posValidadas','posTotal'])assert.equal(nuevo[k],oficial[k]);
  for(const k of ['uniValidadas','uniTotal'])assert.equal(Number(nuevo[k]),oficial[k]);
 }
});
