import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatearCantidad as f} from '../public/cantidades.mjs';
import {cantidadNormalizada,acuseValido} from '../public/modelo.mjs';
test('presentación distingue entero, miles, decimales reales, diferencias negativas y ausencia de conteo',()=>{
 for(const [value,expected] of [['2.000000000','2'],['21.000000000','21'],['17357.080000000','17.357,08'],['66818.000000000','66.818'],['0.000000000','0'],['-2.500000000','-2,5'],['0.000000001','0,000000001'],['-0.000000000','0'],[null,'—'],[undefined,'—']])assert.equal(f(value),expected);
});
test('cantidades mayores que IEEE754 y nueve decimales conservan todos sus dígitos al mostrarse',()=>{
 assert.equal(f('9007199254740993.123456789'),'9.007.199.254.740.993,123456789');
 assert.equal(f('999999999999999999999.999999999'),'999.999.999.999.999.999.999,999999999');
 for(const v of ['2,000','1e3','NaN','Infinity',0.1])assert.throws(()=>f(v));
});
test('presentación no reinterpreta entrada ni cambia la confirmación y el envío exactos de captura',()=>{
 assert.equal(cantidadNormalizada('17,08'),'17.08');assert.throws(()=>cantidadNormalizada('17.171,08'));
 const s={operacionId:'a',inventarioId:'b',lineaId:'c',etapa:1,cantidad:'17171.08'};
 assert.equal(acuseValido({...s,ok:true,version:'1',cantidad:'17171.080000000'},s),true);
 assert.equal(acuseValido({...s,ok:true,version:'1',cantidad:'17.171080000'},s),false);
});
