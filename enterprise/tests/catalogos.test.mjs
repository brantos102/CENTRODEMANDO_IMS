import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validarFilasCatalogo} from '../src/centro/catalogos.mjs';
import {leerCatalogo,analizarCatalogo,decodificarCatalogo} from '../public/catalogos-csv.mjs';
import {CSV_EAN,csvPosiciones} from './fixtures/catalogos-csv.mjs';
test('EAN conserva ceros y asociaciones ambiguas; no reemplaza un SKU por el último leído',()=>{
 const filas=leerCatalogo('cliente;sku;ean\nBELIA;00001;0012345\nBELIA;00002;0012345\n','EAN'),r=validarFilasCatalogo('EAN',filas);assert.equal(r[0].sku,'00001');assert.equal(r[0].ean,'0012345');assert.equal(r.length,2);assert.throws(()=>validarFilasCatalogo('EAN',[...filas,filas[0]]));assert.throws(()=>leerCatalogo('cliente;sku;ean\nBELIA;001\n','EAN'));
});
test('WTW exige geometría completa y explícita sin adivinar ubicaciones ni separadores',()=>{
 const r=validarFilasCatalogo('WTW',leerCatalogo('posicion;zona;x;y;z;ancho;fondo;alto\nA-01;A;0;-2;1.25;1;2;0.5\n','WTW'));assert.equal(r[0].z,'1.25');assert.equal(validarFilasCatalogo('WTW',[{posicion:'A-01'}])[0].x,undefined);
 for(const fila of [{posicion:'A',x:'1'},{...r[0],alto:'0'},{...r[0],y:'1,25'},{...r[0],x:'Infinity'}])assert.throws(()=>validarFilasCatalogo('WTW',[fila]));assert.throws(()=>validarFilasCatalogo('WTW',[{posicion:'A'},{posicion:'A'}]));
});
test('exportación DEPOT EAN conserva tipo, presentación, fila original y ceros sin convertir a stock',()=>{
 const p=analizarCatalogo(CSV_EAN,'EAN'),r=validarFilasCatalogo('EAN',p.filas);assert.equal(p.formato,'DEPOT_EAN_V1');assert.equal(r[0].ean,'0012345678901');assert.equal(r[0].cantidadPresentacion,'12');assert.equal(r[1].tipoCodigo,'DUN14');assert.equal(r[1].cantidadPresentacion,'');assert.equal(r[2].cantidadPresentacion,'0');assert.equal(r[0].origen.datos.PRODUCTO_ID,'000123');assert.equal(r[0].origen.fila,2);assert.equal(r[0].depot,undefined);
});
test('exportación DEPOT de posiciones conserva dos sedes y asociaciones por cliente sin fabricar geometría',()=>{
 const p=analizarCatalogo(csvPosiciones(),'WTW'),r=validarFilasCatalogo('WTW',p.filas);assert.deepEqual(r.map(f=>f.sede),['UIO','UIO','GYE']);assert.equal(r[0].posicion,r[1].posicion);assert.notEqual(r[0].clienteCodigo,r[1].clienteCodigo);assert.equal(r[0].columna,'01');assert.equal(r[0].x,undefined);assert.equal(r[0].origen.datos.LARGO,'120');assert.equal(Object.keys(r[0].origen.datos).length,26);assert.throws(()=>analizarCatalogo(csvPosiciones([{CIUDAD:'DESCONOCIDA'}]),'WTW'));
});
test('CSV admite UTF-8 y Windows-1252 sin reemplazar caracteres del catálogo',()=>{
 const raw=Uint8Array.from([67,76,65,89,59,193,59,48,48,49]);const d=decodificarCatalogo(raw);assert.equal(d.codificacion,'Windows-1252');assert.equal(d.texto,'CLAY;Á;001');assert.equal(decodificarCatalogo(new TextEncoder().encode('CLAY;Á;001')).codificacion,'UTF-8');
});
