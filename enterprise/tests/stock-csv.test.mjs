import {test} from 'node:test';import assert from 'node:assert/strict';
import {prepararCsv,cantidadCsv,sumaStock,leerCsv} from '../public/stock-csv.mjs';
test('CSV conserva SKU con ceros, multiplicidad, descripción con salto/comas y cero exacto',()=>{
 const rows=prepararCsv('sku;depot;descripcion\r\n0001;0;"dos, partes\ny salto"\r\n0001;0;otra\r\n',{clienteId:'demo',formato:'punto_decimal'});
 assert.equal(rows.length,2);assert.equal(rows[0].sku,'0001');assert.equal(rows[0].descripcion,'dos, partes\ny salto');assert.equal(sumaStock(rows),'0.000000000');
});
test('el formato de cantidades es explícito: CIBERC miles no cambia decimales de otros archivos',()=>{
 assert.equal(cantidadCsv('2,954','coma_miles'),'2954.000000000');assert.equal(cantidadCsv('2,954','coma_decimal'),'2.954000000');
 for(const [v,f]of [['2,954','punto_decimal'],['2,95','coma_miles'],['1.234,5','coma_decimal'],['-1','punto_decimal'],['1e3','punto_decimal']])assert.throws(()=>cantidadCsv(v,f));
 assert.equal(sumaStock([{depot:'999999999999999999999.000000001'},{depot:'1.000000001'}]),'1000000000000000000000.000000002');
});
test('cabeceras duplicadas, desconocidas, filas anchas y comillas incompletas bloquean toda la lectura',()=>{
 for(const csv of ['sku,depot,depot\na,1,1','sku,depot,intruso\na,1,x','sku,depot\na,1,x','sku,depot\n"a,1'])assert.throws(()=>leerCsv(csv));
});
