import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analizarRevisionGoogle} from '../public/revision-google.mjs';
import {opcionesNavegacion} from '../public/navegacion-ui.mjs';
const hoy='2026-11-26',g=(n,extra={})=>({grupoId:String(n),codigo:'INV_'+n,fechaInicio:'2026-11-19',sede:'UIO',filas:2,capturasNuevas:0,conflictos:0,aplicable:false,...extra});
test('18 fuentes completas y diferencias recientes se distinguen del histórico y de los programados',()=>{
 const plan={archivosIntentados:18,archivosConfirmados:18,incidencias:[],grupos:[g(1),g(2,{conflictos:1}),g(3,{conflictos:3}),g(4,{fechaInicio:'2024-12-03',conflictos:304}),g(5,{fechaInicio:'2026-11-27',aplicable:true})]};
 const r=analizarRevisionGoogle(plan,{hoy});assert.equal(r.completa,true);assert.equal(r.recientes,3);assert.equal(r.listos,0);assert.equal(r.revisar,2);assert.equal(r.conflictosAnteriores,304);assert.equal(r.anteriores,1);assert.equal(r.futuros,1);assert.equal(r.grupos[0].situacion,'SIN_CAMBIOS');assert.equal(r.grupos[1].situacion,'REVISAR');
});
test('una captura parcialmente aplicable con diferencias no se incluye entre los recientes listos',()=>{
 const r=analizarRevisionGoogle({grupos:[g(1,{aplicable:true}),g(2,{aplicable:true,conflictos:2}),g(3,{bloqueo:'CODIGO_EXISTENTE_SIN_VINCULO_UNIVOCO'})]},{hoy});
 assert.equal(analizarRevisionGoogle({grupos:[g(8,{aplicable:true,bloqueo:'MYSQL_CAMBIO_DESDE_REVISION'})]},{hoy}).nuevas,0); assert.equal(r.listos,1);assert.equal(r.revisar,2);assert.equal(r.grupos[2].situacion,'BLOQUEADO');
 const aplicado=analizarRevisionGoogle({grupos:[g(1,{aplicable:true})]},{hoy,aplicados:['1']});assert.equal(aplicado.listos,0);assert.equal(aplicado.nuevas,0);assert.equal(aplicado.grupos[0].situacion,'INCORPORADO');
});
test('un error de cuota impide anunciar lectura completa y los pendientes de iniciar tienen su propio conteo',()=>{
 const r=analizarRevisionGoogle({archivosIntentados:18,archivosConfirmados:6,grupos:[],incidencias:[{codigo:'GOOGLE_LECTURA_RECHAZADA',http:429},{codigo:'GOOGLE_INVENTARIO_PENDIENTE'}]},{hoy});assert.equal(r.completa,false);assert.equal(r.lectura.length,1);assert.equal(r.pendientes.length,1);
});
test('el menú de cada rol muestra sus funciones sin presentar administración a operadores o líderes',()=>{
 const consultar=p=>opcionesNavegacion(p,{autenticado:true});
 const operario=consultar({rol:'OPERARIO',permisos:{}});assert.ok(operario.some(i=>i.titulo==='Conteo físico'));assert.ok(!operario.some(i=>i.grupo==='Administración'||i.ruta==='/crear'||i.vista==='usuarios'));
 const lider=consultar({rol:'LIDER',permisos:{crear:true,usuarios:true,analitica:true}});assert.ok(lider.some(i=>i.ruta==='/crear'));assert.ok(lider.some(i=>i.vista==='analitica'));assert.ok(!lider.some(i=>i.grupo==='Administración'));
 const admin=consultar({rol:'ADMIN',permisos:{crear:true,usuarios:true,analitica:true,exportar:true,administrar:true}});assert.ok(admin.some(i=>i.accion==='conexiones'));assert.ok(admin.some(i=>i.accion==='cuenta'));assert.ok(admin.some(i=>i.vista==='reportes'));
 assert.deepEqual(opcionesNavegacion(null),[]);
 const pendiente=consultar({rol:'ADMIN',cambiar_clave:1,permisos:{crear:true,administrar:true}});assert.equal(pendiente.length,1);assert.equal(pendiente[0].vista,'perfil');
 assert.ok(!consultar({permisos:{administrar:'true'}}).some(i=>i.grupo==='Administración'));
});
