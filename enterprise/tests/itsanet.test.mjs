import {test} from 'node:test';
import assert from 'node:assert/strict';
import {consultarERP,jsonExacto,normalizarStockERP} from '../src/conexiones/itsanet.mjs';
const clienteId='00000000-0000-0000-0000-000000000001';
const row={'COD. CLIENTE':'C','COD. PRODUCTO':'001',CANTIDAD:'9007199254740993.125',NAVE:'A',CALLE:'02'};
test('JSON ERP conserva números exactos antes de convertirlos y no altera cadenas',()=>{
 assert.equal(jsonExacto('{"n":9007199254740993.125,"sku":"0001"}').n,'9007199254740993.125');
 assert.equal(jsonExacto('{"sku":"0001"}').sku,'0001');
});
test('ERP agrupa dimensiones completas por cliente y separa serie; una serie equivale a una unidad',()=>{
 const r=normalizarStockERP([row,row,{...row,'NRO. SERIE':'S'}, {...row,'NRO. SERIE':'s'},
  {...row,'COD. CLIENTE':'AJENO'}, {...row,'NRO. LOTE':'L'}],{clienteId,codigosCliente:['C']});
 assert.equal(r.filas.length,3);assert.equal(r.filas[0].depot,'18014398509481986.250000000');
 assert.equal(r.filas[1].depot,'1.000000000');assert.equal(r.informe.otroCliente,1);assert.equal(r.informe.seriesDuplicadas,1);
 assert.throws(()=>normalizarStockERP([{...row,CANTIDAD:'2,000'}],{clienteId,codigosCliente:['C']}));
});
test('conexión usa exclusivamente GET a su sede, sin redirecciones; token y clave no aparecen en resultado',async()=>{
 const calls=[];const f=async(url,opts)=>{calls.push({url,...opts});return new Response(url.endsWith('gettoken')?'{"token":"secreto_sintetico"}':JSON.stringify([row]));};
 const r=await consultarERP({sede:'GYE',clienteId,userid:'usuario_sintetico',password:'clave_sintetica',codigosCliente:['C']},{fetchImpl:f});
 assert.deepEqual(calls.map(c=>c.url),['https://ec.itsanet.com/g_apidepot/gettoken','https://ec.itsanet.com/g_apidepot/getstock']);
 assert.ok(calls.every(c=>c.method==='GET'&&c.redirect==='error'));
 assert.equal(JSON.stringify(r).includes('secreto_sintetico'),false);
 await assert.rejects(consultarERP({sede:'https://otro',clienteId,userid:'u',password:'p'},{fetchImpl:f}));
});
test('401 y respuesta malformada no publican filas ni cuerpos del ERP',async()=>{
 for(const f of [async()=>new Response('CLAVE_SECRETA',{status:401}),async()=>new Response('CLAVE_SECRETA')])
  await assert.rejects(consultarERP({sede:'UIO',clienteId,userid:'u',password:'p',codigosCliente:['C']},{fetchImpl:f}),e=>!e.message.includes('CLAVE_SECRETA'));
});
