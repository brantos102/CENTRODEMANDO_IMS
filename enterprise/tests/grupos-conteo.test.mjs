import {test} from 'node:test';
import assert from 'node:assert/strict';
import {agruparConteo,distribuirConteo} from '../src/dominio/grupos-conteo.mjs';
import {crearColaLecturas,sumarLectura} from '../public/borradores-wms.mjs';
const fila=(id,depot,extra={})=>({id,cliente_id:'cliente',sku:'0001',posicion:'BM-D-72-3',descripcion:'Botín',serie:'',lote:'',unidad:'UN',depot,ajuste:'0',version:'0',conteo_1:null,conteo_2:null,conteo_final:null,puede_contar:1,observacion:'',nueva_posicion:'',...extra});
test('equivalentes suman stock sin perder originales; cada atributo de negocio separa existencias',()=>{
 const a=fila('a','1'),b=fila('b','2');const [g]=agruparConteo([b,a],{visible:true});assert.equal(g.vista.depot,'3.000000000');assert.equal(g.vista.filasOrigen,2);assert.equal(g.miembros.length,2);assert.equal(a.depot,'1');
 for(const k of ['cliente_id','codigo_cliente_erp','sku','posicion','descripcion','serie','lote','unidad','abc','despacho','partida','categoria','estado_mercancia'])assert.equal(agruparConteo([a,{...b,[k]:'OTRO'}]).length,2,k);
});
test('grupo ciego no contiene stock ni un hash de cantidades; el sello cambia con la versión',()=>{
 const g=agruparConteo([fila('a','1'),fila('b','2')])[0].vista,h=agruparConteo([fila('a','999'),fila('b','123')])[0].vista;
 for(const k of ['depot','ajuste','fisico','desfase','resultado'])assert.ok(!Object.hasOwn(g,k));assert.equal(g.firmaGrupo,h.firmaGrupo);assert.notEqual(g.firmaGrupo,agruparConteo([fila('a','1',{version:'1'}),fila('b','2')])[0].vista.firmaGrupo);
});
test('total tres registra 1+2, conserva capturas parciales y exige revisión para reducirlas',()=>{
 const miembros=[fila('a','1'),fila('b','2')];assert.deepEqual(distribuirConteo(miembros,1,'3').map(r=>r.cantidad),['1.000000000','2.000000000']);
 miembros[0].conteo_1='1.000000000';const g=agruparConteo(miembros)[0];assert.equal(g.vista.conteo_1,null);assert.equal(g.vista.registrado_conteo_1,'1.000000000');assert.deepEqual(distribuirConteo(miembros,1,'3').map(r=>[r.linea.id,r.cantidad]),[['b','2.000000000']]);assert.throws(()=>distribuirConteo(miembros,1,'0'),e=>e.codigo==='CANTIDAD_INVALIDA');
});
test('distribución conserva cero, decimales y precisión superior a IEEE754 sin completar etapas heredadas',()=>{
 const miembros=[fila('a','0.000000001'),fila('b','9007199254740993.000000002')];assert.deepEqual(distribuirConteo(miembros,1,'9007199254740993.000000003').map(r=>r.cantidad),['0.000000001','9007199254740993.000000002']);assert.ok(distribuirConteo(miembros,1,'0').every(r=>r.cantidad==='0.000000000'));assert.throws(()=>distribuirConteo([fila('a','1',{conteo_final:'1'})],1,'1'),e=>e.codigo==='ETAPA_INVALIDA');
});
test('cola conserva tres lecturas durante una petición pendiente y continúa tras un error',async()=>{
 const cola=crearColaLecturas();let liberar;const espera=new Promise(r=>liberar=r);let total='0';const ps=Array.from({length:3},(_,i)=>cola.agregar(async()=>{if(!i)await espera;total=sumarLectura(total,'1');}));liberar();await Promise.all(ps);assert.equal(total,'3');await assert.rejects(cola.agregar(()=>{throw Error('fallo');}));await cola.agregar(()=>{total=sumarLectura(total,'1');});await cola.terminar();assert.equal(total,'4');
});
