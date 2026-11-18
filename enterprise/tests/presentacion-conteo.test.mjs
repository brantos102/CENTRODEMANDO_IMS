import {test} from 'node:test';
import assert from 'node:assert/strict';
import {estadoLinea} from '../public/presentacion-conteo.mjs';
import {crearOperario} from '../public/avatar-operario.mjs';
test('estados visuales distinguen cero, falta contar, recuento e historial heredado sin inventar un resultado comparativo',()=>{
 const row={conteo_1:null,conteo_2:null,conteo_final:null};
 assert.equal(estadoLinea(row).codigo,'PENDIENTE');assert.equal(estadoLinea({...row,conteo_1:'0.000000000'}).codigo,'REGISTRADO');
 assert.equal(estadoLinea({...row,conteo_1:'0.125',conteo_2:'0.125000000'}).codigo,'REGISTRADO');
 assert.equal(estadoLinea({...row,conteo_1:'9007199254740992.125',conteo_2:'9007199254740992.126'}).codigo,'RECUENTO');
 assert.equal(estadoLinea({...row,conteo_2:'0'}).codigo,'REVISAR');assert.equal(estadoLinea({...row,conteo_1:'0',conteo_final:'0'}).codigo,'REVISAR');
 assert.equal(estadoLinea({...row,conteo_1:'0',resultado:'FALTANTE'}).codigo,'FALTANTE');assert.equal(estadoLinea({...row,conteo_1:'0',resultado:'CORRECTO'}).codigo,'CORRECTO');
});
test('operario virtual tiene casco y articulaciones finitas; caminar y reposar conserva sus medidas y libera recursos',()=>{
 const a=crearOperario();let geometria=0;a.grupo.traverse(o=>{if(o.geometry){geometria++;for(const n of o.geometry.attributes.position.array)assert.ok(Number.isFinite(n));}});assert.ok(geometria>20);a.animar(1.25);assert.ok(a.grupo.children.some(o=>o.rotation.x!==0));a.reposar();a.destruir();assert.equal(a.grupo.children.length,0);
});
