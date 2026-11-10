import {test} from 'node:test';import assert from 'node:assert/strict';
import {serieCanonica,seriesParecidas,datosHallazgo} from '../src/dominio/series.mjs';
test('series conservan ceros y separadores; se normalizan espacios exteriores y mayúsculas sin convertir números',()=>{
 assert.equal(serieCanonica(' 0000-ab12 '),'0000-AB12');
 for(const v of ['',' ','0','n/a','X'.repeat(256)])assert.throws(()=>serieCanonica(v));
});
test('advertencia conserva la regla V124: un carácter o sufijo de hasta dos; nunca fusiona ni advierte códigos cortos',()=>{
 for(const [a,b]of [['ABC1234','ABC1235'],['ABC1234','ABC1234XX']])assert.equal(seriesParecidas(a,b),true);
 for(const [a,b]of [['123','124'],['ABC1234','ABC1234'],['ABC1234','ZZC1234'],['ABC1234','ABC1234XXX']])assert.equal(seriesParecidas(a,b),false);
});
test('planilla alterna preserva cero, cliente explícito en API y decimales exactos; una serie exige cantidad uno',()=>{
 assert.equal(datosHallazgo({sku:'0001',cantidad:'0'}).cantidad,'0.000000000');
 assert.equal(datosHallazgo({sku:'0001',cantidad:'0.125'}).cantidad,'0.125000000');
 assert.throws(()=>datosHallazgo({sku:'0001',cantidad:'2'},{serie:'ABC'}));
 assert.throws(()=>datosHallazgo({sku:'',cantidad:'1'}));
 assert.throws(()=>datosHallazgo({sku:'A',cantidad:'1',usuario:'otra_persona'}));
});
