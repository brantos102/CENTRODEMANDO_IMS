import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validarFilasCatalogo} from '../src/centro/catalogos.mjs';
import {leerCatalogo} from '../public/catalogos-csv.mjs';
test('EAN conserva ceros y asociaciones ambiguas; no reemplaza un SKU por el último leído',()=>{
 const filas=leerCatalogo('cliente;sku;ean\nBELIA;00001;0012345\nBELIA;00002;0012345\n','EAN'),r=validarFilasCatalogo('EAN',filas);assert.equal(r[0].sku,'00001');assert.equal(r[0].ean,'0012345');assert.equal(r.length,2);assert.throws(()=>validarFilasCatalogo('EAN',[...filas,filas[0]]));assert.throws(()=>leerCatalogo('cliente;sku;ean\nBELIA;001\n','EAN'));
});
test('WTW exige geometría completa y explícita sin adivinar ubicaciones ni separadores',()=>{
 const r=validarFilasCatalogo('WTW',leerCatalogo('posicion;zona;x;y;z;ancho;fondo;alto\nA-01;A;0;-2;1.25;1;2;0.5\n','WTW'));assert.equal(r[0].z,'1.25');assert.equal(validarFilasCatalogo('WTW',[{posicion:'A-01'}])[0].x,undefined);
 for(const fila of [{posicion:'A',x:'1'},{...r[0],alto:'0'},{...r[0],y:'1,25'},{...r[0],x:'Infinity'}])assert.throws(()=>validarFilasCatalogo('WTW',[fila]));assert.throws(()=>validarFilasCatalogo('WTW',[{posicion:'A'},{posicion:'A'}]));
});
