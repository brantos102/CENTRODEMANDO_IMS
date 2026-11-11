import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verificarUnidadesERP} from '../tools/verificar-unidades-erp.mjs';
function pool(rows){return {query:async sql=>sql.startsWith('SELECT DATABASE')?[[{nombre:'centromando_ims_pruebas_unidades',usuario:'ims_cm_operacion@%'}]]:[rows]};}
test('conciliación de cortes ERP usa stock guardado y cantidades exactas, no el texto de la interfaz',async()=>{
 const r=await verificarUnidadesERP(pool([{filas:485,lineas_actuales:'485',origenes_actuales:'485',unidades:'66818.000000000',unidades_actuales:'66818.000000000'}]));assert.equal(r.unidades_de_cortes_erp,'66.818');assert.equal(r.cantidades_exactas_verificadas,true);assert.equal(r.base_de_datos_modificada,false);
});
test('una diferencia de una milmillonésima o una procedencia faltante detienen sin redondear',async()=>{
 const base={filas:1,lineas_actuales:1,origenes_actuales:1,unidades:'9007199254740993.123456789',unidades_actuales:'9007199254740993.123456789'};
 for(const cambio of [{unidades_actuales:'9007199254740993.123456788'},{lineas_actuales:0},{origenes_actuales:0}])await assert.rejects(verificarUnidadesERP(pool([{...base,...cambio}])));
});
