import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cantidadERP} from '../src/conexiones/cantidad-erp.mjs';
import {cantidadExacta} from '../src/dominio/conteo.mjs';
import {textoDecimal} from '../src/dominio/analisis-wms.mjs';
import {diagnosticarCamposERP,resumirPrevisualizacionERP,normalizarStockERP} from '../src/conexiones/itsanet.mjs';
test('cantidades ERP equivalentes conservan exactamente cero, exponentes y ceros de escala',()=>{
 for(const [entrada,salida] of [['0E-19','0.000000000'],['-0.0000000000','0.000000000'],['1E3','1000.000000000'],['1.230000000000','1.230000000'],['1000000000e-18','0.000000001'],['.5','0.500000000'],['+12.','12.000000000'],['9.99999999999999999999999999999e20','999999999999999999999.999999999']])assert.equal(cantidadERP(entrada),salida);
 for(let i=1n;i<=100n;i++){const n=i*123456789012345n;assert.equal(cantidadERP(n+'e-9'),textoDecimal(n));assert.equal(cantidadERP(n*1000n+'e-12'),textoDecimal(n));}
 assert.throws(()=>cantidadExacta('1e3')); // La captura humana mantiene su contrato original.
});
test('miles ambiguos, negativos, fracciones fuera de precisión y números ya inexactos no se redondean',()=>{
 for(const value of ['2,000','1.23e-8','1e21','1e999999999','1e-999999999','-1','NaN','1 unidad',0.1,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>cantidadERP(value));
 assert.equal(cantidadERP(' 2.000000000000 '),'2.000000000');
});
test('normalización de stock acepta números ERP exactos sin alterar dimensiones ni regla de series',()=>{
 const r=normalizarStockERP([{'COD. CLIENTE':'C','COD. PRODUCTO':'0001',CANTIDAD:'1e3'},{'COD. CLIENTE':'C','COD. PRODUCTO':'0001',CANTIDAD:'2.000000000000'}],{clienteId:'10000000-0000-4000-8000-000000000001',codigosCliente:['C']});
 assert.equal(r.filas[0].sku,'0001');assert.equal(r.filas[0].depot,'1002.000000000');
 const serie=resumirPrevisualizacionERP([{'COD. CLIENTE':'C','COD. PRODUCTO':'A','NRO. SERIE':'S',CANTIDAD:'0E-19'}]);assert.equal(serie.unidades_previsualizadas,'1.000000000');
});
test('diagnóstico cuenta filas únicas y señala campo/causa/longitud sin exponer valores',()=>{
 const filas=[{'COD. CLIENTE':'C','COD. PRODUCTO':'SKU_PRIVADO',CANTIDAD:'-1',DESCRIPCION:'X'.repeat(4001),'NRO. SERIE':'S'.repeat(256)},{'COD. CLIENTE':'C','COD. PRODUCTO':'SKU_PRIVADO',CANTIDAD:'-2'}];
 const r=diagnosticarCamposERP(filas);assert.equal(r.filas_con_incidencias,2);assert.equal(r.incidencias.find(c=>c.motivo==='CANTIDAD_ERP_NEGATIVA').filas,2);assert.equal(r.incidencias.find(c=>c.campo==='DESCRIPCION').longitud_maxima_observada,4001);assert.equal(JSON.stringify(r).includes('SKU_PRIVADO'),false);
 const preview=resumirPrevisualizacionERP(filas);assert.equal(preview.totales_calculados,false);assert.equal(preview.unidades_previsualizadas,null);assert.equal(preview.por_codigo[0].validacion.filas_con_incidencias,2);
 const mezclado=resumirPrevisualizacionERP([{'COD. CLIENTE':'OTRO','COD. PRODUCTO':'X',CANTIDAD:'1'},...filas]);assert.deepEqual(mezclado.por_codigo.find(c=>c.codigo==='C').validacion.incidencias.find(i=>i.campo==='CANTIDAD').muestras_fila_respuesta,[2,3]);
});
