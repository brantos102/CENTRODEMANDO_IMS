import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {cantidadExacta,normalizarSolicitud,prepararCambio} from '../src/dominio/conteo.mjs';
import {guardarConteo} from '../src/mysql/conteos.mjs';

function request(extra={}){return {operacionId:randomUUID(),inventarioId:randomUUID(),lineaId:randomUUID(),
  etapa:1,versionEsperada:'0',cantidad:'0',...extra};}
test('cantidad cero y decimales se conservan sin coma flotante ni redondeo',()=>{
  assert.equal(cantidadExacta('000.000'), '0.000000000');
  assert.equal(cantidadExacta('123456789012345678901.123456789'),'123456789012345678901.123456789');
  assert.equal(cantidadExacta(10),'10.000000000');
});
test('cantidades invalidas o fuera de precision se rechazan antes de SQL',()=>{
  for(const q of ['',null,false,NaN,Infinity,-1,'-1','1e3','1,5','1.1234567891',0.1,'1234567890123456789012'])
    assert.throws(()=>cantidadExacta(q),e=>e.codigo==='CANTIDAD_INVALIDA');
});
test('hash representa solicitud semantica; un cambio de etapa, version o texto es distinto',()=>{
  const a=randomUUID(),r=request({cantidad:'10'});
  const n=normalizarSolicitud(a,r);assert.equal(n.hash,normalizarSolicitud(a,{...r,cantidad:'10.000',versionEsperada:0}).hash);
  for(const changed of [{etapa:2},{versionEsperada:'1'},{observacion:''},{nuevaPosicion:'A'}])
    assert.notEqual(n.hash,normalizarSolicitud(a,{...r,...changed}).hash);
});
test('email y rol no se aceptan dentro de la solicitud de conteo',()=>{
  for(const extra of [{email:'ejemplo@prueba.invalid'},{rol:'ADMIN'},{actorId:randomUUID()}])
    assert.throws(()=>normalizarSolicitud(randomUUID(),request(extra)),e=>e.codigo==='SOLICITUD_INVALIDA');
});
test('etapas secuenciales, version y textos omitidos conservan los valores anteriores',()=>{
  const r=request(),p=normalizarSolicitud(randomUUID(),r).payload;
  const line={version:'0',conteo_1:null,conteo_2:null,conteo_final:null,observacion:'humana',nueva_posicion:'A'};
  const c=prepararCambio(line,p);assert.equal(c.despues.conteo_1,'0.000000000');
  assert.equal(c.despues.observacion,'humana');assert.equal(c.despues.nueva_posicion,'A');
  assert.equal(c.despues.version,'1');assert.equal(line.conteo_1,null);
  assert.throws(()=>prepararCambio(line,{...p,etapa:2}),e=>e.codigo==='ETAPA_INVALIDA');
  assert.throws(()=>prepararCambio({...line,version:'1'},p),e=>e.codigo==='VERSION_DESACTUALIZADA');
  assert.throws(()=>prepararCambio({...line,conteo_1:'0.000000000'},p),e=>e.codigo==='ETAPA_COMPLETA');
});
test('sin principal interno no se adquiere conexion ni se ejecuta SQL',async()=>{
  await assert.rejects(guardarConteo({pool:{getConnection(){throw Error('No debe llamarse');}},solicitud:request()}),
    e=>e.codigo==='NO_AUTENTICADO');
});
