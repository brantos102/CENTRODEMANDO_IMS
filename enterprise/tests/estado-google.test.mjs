import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resumenIncorporacionGoogle} from '../src/centro/estado-google.mjs';
const planId='11111111-1111-4111-8111-111111111111',s={hoy:'2026-11-23',sedes:['UIO']},recientes=[250,207,94].map((filas,i)=>({sede:'UIO',grupoId:String(i).repeat(64),codigo:'ACTUAL_'+i,fechaInicio:'2026-11-19',accion:'CREAR',filas,capturasNuevas:[282,211,104][i],conflictos:0,aplicable:true})),revision={id:planId,tipo:'GOOGLE_DELTA',estado:'COMPLETO',resultado:{creadoEn:'2026-11-23T16:40:00.000Z',archivosIntentados:16,archivosConfirmados:14,grupos:[...recientes,{sede:'UIO',grupoId:'a'.repeat(64),fechaInicio:'2024-12-03',codigo:'ANTIGUO',filas:611,aplicable:true,capturasNuevas:2,conflictos:304}],incidencias:[{codigo:'GOOGLE_INVENTARIO_PENDIENTE'},{codigo:'GOOGLE_INVENTARIO_PENDIENTE'}],config:{token:'SECRETO_SINTETICO'},archivo:'NO_PUBLICAR_ID_GOOGLE'}};
test('la revisión distingue tres novedades recientes, 597 capturas y dos archivos pendientes sin afirmar una incorporación',()=>{
 const r=resumenIncorporacionGoogle([revision],s);assert.equal(r.aplicacion,null);assert.equal(r.revision.fuentesPendientesDeIniciar,2);assert.equal(r.revision.otrasIncidencias,0);assert.equal(r.periodoReciente.novedadesPorAplicar.length,3);assert.equal(r.periodoReciente.novedadesPorAplicar.reduce((n,g)=>n+g.lineas,0),551);assert.equal(r.periodoReciente.novedadesPorAplicar.reduce((n,g)=>n+g.capturas,0),597);assert.equal(r.conflictosAnteriores,304);assert.ok(!/SECRETO_SINTETICO|NO_PUBLICAR_ID_GOOGLE/.test(JSON.stringify(r)));
});
test('solo una aplicación confirmada del mismo plan descuenta los grupos realmente incorporados',()=>{
 const aplicada={id:'22222222-2222-4222-8222-222222222222',tipo:'GOOGLE_APLICAR',estado:'COMPLETO',actualizado_en:'2026-11-23 16:45:00',resultado:{planId,inventariosNuevos:3,capturasAgregadas:597,gruposAplicados:recientes,incidencias:[]}};let r=resumenIncorporacionGoogle([revision,aplicada],s);assert.equal(r.aplicacion.correspondeARevision,true);assert.equal(r.periodoReciente.novedadesPorAplicar.length,0);assert.equal(r.aplicacion.fecha,'2026-11-23T16:45:00Z');assert.equal(r.conflictosAnteriores,304);
 r=resumenIncorporacionGoogle([revision,{...aplicada,resultado:{...aplicada.resultado,gruposAplicados:recientes.slice(0,1)}}],s);assert.equal(r.periodoReciente.novedadesPorAplicar.length,2);
 for(const cambio of [{estado:'ERROR'},{resultado:{...aplicada.resultado,planId:'33333333-3333-4333-8333-333333333333'}}]){r=resumenIncorporacionGoogle([revision,{...aplicada,...cambio}],s);assert.equal(r.aplicacion.correspondeARevision,false);assert.equal(r.periodoReciente.novedadesPorAplicar.length,3);}
});
test('el resumen respeta la sede y no refleja fechas o campos arbitrarios de un resultado',()=>{
 assert.equal(resumenIncorporacionGoogle([revision],{...s,sedes:['GYE']}).periodoReciente.novedadesPorAplicar.length,0);const r=resumenIncorporacionGoogle([{...revision,resultado:{...revision.resultado,creadoEn:'NO_PUBLICAR_SECRETO'}}],s);assert.equal(r.revision.fecha,null);assert.ok(!JSON.stringify(r).includes('NO_PUBLICAR_SECRETO'));
});
test('varias selecciones y un reintento del plan conservan los grupos incorporados sin duplicar totales',()=>{
 const aplicada=(i,gs,estado='COMPLETO')=>({id:String(i).repeat(8)+'-2222-4222-8222-222222222222',tipo:'GOOGLE_APLICAR',estado,resultado:{planId,gruposAplicados:gs}});
 const gs=recientes.map((g,i)=>({...g,nuevo:true,capturas:[282,211,104][i]}));
 const primera=aplicada(1,[gs[0]]),segunda=aplicada(2,[gs[1]]),reintento=aplicada(3,[{...gs[0],yaAplicado:true},gs[2]]);
 const r=resumenIncorporacionGoogle([revision,reintento],{...s,aplicaciones:[primera,segunda,reintento,aplicada(4,gs,'ERROR')]});
 assert.equal(r.periodoReciente.novedadesPorAplicar.length,0);assert.deepEqual(r.aplicacionesDeRevision,{trabajosCompletos:3,gruposIncorporados:3,inventariosNuevos:3,capturasAgregadas:597});
 const fallo=resumenIncorporacionGoogle([revision,aplicada(5,[],'ERROR')],{...s,aplicaciones:[primera,segunda]});
 assert.equal(fallo.aplicacion.correspondeARevision,false);assert.equal(fallo.periodoReciente.novedadesPorAplicar.length,1);
});
