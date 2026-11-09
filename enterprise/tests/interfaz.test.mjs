import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {cantidadNormalizada,mostrarCantidad,siguienteEtapa,acuseValido,validarPagina,validarResumen,mostrarEntero} from '../public/modelo.mjs';
test('cantidad de captura admite coma decimal y conserva precisión sin miles ni exponentes',()=>{
  assert.equal(cantidadNormalizada('000,125000000'),'0.125000000');
  assert.equal(cantidadNormalizada('123456789012345678901.123456789'),'123456789012345678901.123456789');
  for(const q of ['1.234,56','1e3','-1','1.1234567891',''])assert.throws(()=>cantidadNormalizada(q));
});
test('la vista diferencia cantidad cero de ausencia de conteo',()=>{
  assert.equal(mostrarCantidad('0.000000000'),'0');assert.equal(mostrarCantidad(null),'—');
  assert.equal(mostrarCantidad('10.125000000'),'10.125');
});
test('etapa siguiente respeta cero y no rellena etapas históricas inconsistentes',()=>{
  assert.equal(siguienteEtapa({conteo_1:'0',conteo_2:null,conteo_final:null}),2);
  assert.equal(siguienteEtapa({conteo_1:null,conteo_2:'5',conteo_final:null}),null);
  assert.equal(siguienteEtapa({conteo_1:'0',conteo_2:'0',conteo_final:'0'}),null);
});
test('una respuesta de otra operación no confirma la captura local',()=>{
  const s={operacionId:randomUUID(),inventarioId:randomUUID(),lineaId:randomUUID(),etapa:1,cantidad:'0.125'};
  const a={...s,ok:true,cantidad:'0.125000000',version:'1'};
  assert.equal(acuseValido(a,s),true);
  for(const change of [{operacionId:randomUUID()},{lineaId:randomUUID()},{cantidad:'9'},{ok:false},{etapa:2}])assert.equal(acuseValido({...a,...change},s),false);
});
test('respuesta incompleta no se usa como página y SKU repetido con distintas líneas se conserva',()=>{
  assert.throws(()=>validarPagina({datos:null,siguiente:null},'inventarios'));
  const datos=[1,2].map(()=>({id:randomUUID(),inventario_id:randomUUID(),cliente_id:randomUUID(),cliente:'A',sku:'0001',version:'0',puede_contar:true,conteo_1:null,conteo_2:null,conteo_final:null}));
  const page={datos,siguiente:null};assert.equal(validarPagina(page,'lineas').datos.length,2);
  assert.throws(()=>validarPagina({datos:[{...datos[0],version:undefined}],siguiente:null},'lineas'));
});
test('resumen valida el conjunto completo sin sumar conteos multicliente ni perder enteros grandes',()=>{
  const r={totales:{conteos:'1',lineas:'9007199254740993',clientes:'2',sedes:'1'},consultado_en:new Date().toISOString(),clientes:[
    {id:randomUUID(),nombre:'A',conteos:'1',lineas:'9007199254740992'},
    {id:randomUUID(),nombre:'B',conteos:'1',lineas:'1'}]};
  assert.equal(validarResumen(r),r);assert.equal(mostrarEntero('9007199254740993').replace(/\D/g,''),'9007199254740993');
  for(const cambio of [{clientes:null},{consultado_en:'mal'},{totales:{...r.totales,lineas:'1'}},{clientes:[r.clientes[0],r.clientes[0]]}])assert.throws(()=>validarResumen({...r,...cambio}));
});
