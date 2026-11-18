import {test} from 'node:test';
import assert from 'node:assert/strict';
import {politicaConteo} from '../src/mysql/politica-conteo.mjs';
test('visibilidad interpreta 0 de MySQL como oculto y nunca agrega teórico a un inventario histórico',async()=>{
 for(const mostrar_depot of [false,0,'0',null,undefined]){const p=await politicaConteo(null,{},{perfiles:[{rol:'OPERADOR'}],mostrar_depot});assert.equal(p.conteoCiego,true);}
 for(const mostrar_depot of [true,1,'1']){const p=await politicaConteo(null,{},{perfiles:[{rol:'OPERADOR'}],mostrar_depot});assert.equal(p.puedeVerTeorico,true);}
 const h=await politicaConteo(null,{},{perfiles:[{rol:'SUPERVISOR'}],mostrar_depot:'1',esNativo:false});assert.equal(h.puedeVerTeorico,false);
});
