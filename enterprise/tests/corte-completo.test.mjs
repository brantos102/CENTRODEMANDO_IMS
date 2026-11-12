import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simular,ABIERTO,SECRET} from './fixtures/corte-abiertos.mjs';
export function completoDePrueba({sinRegistro=false}={}){
 const f=simular({ancho:true});f.panel.pop();
 f.agregarHojaMaestro('INVENTARIOS',[['PRODUCTO','DEPOT','PASSWORD'],['0001',0,SECRET]],20);
 if(!sinRegistro)f.agregarHojaMaestro('REGISTRO',[['USUARIO','CONTEO'],['operador@sintetico.invalid',0]],21);
 return f;
}
export function terminar(f){for(let i=0;i<200;i++){const r=f.continuar();if(r.extraccion_terminada)return r;}throw Error('Corte sintético pendiente');}
test('corte completo conserva abiertos y maestro ancho con consolidado y registro, sin contraseñas o propiedades',()=>{
 const f=completoDePrueba();f.prepararCompleto();const r=terminar(f),p=f.planActual();
 assert.equal(r.fuentes_revision,0);assert.equal(r.maestro_completo,true);assert.equal(r.lista_para_revision,true);assert.equal(r.corte_final_aprobado,false);assert.equal(r.propiedades_leidas,false);assert.equal(f.modificaciones(),0);
 assert.equal(p.modo_captura,'ABIERTO_Y_CONSOLIDADO_V1');assert.equal(p.limites.columnas,512);
 const m=p.fuentes.find(f=>f.tipo==='MAESTRO');for(const n of ['USUARIOS','INVENTARIOS','REGISTRO','PANEL DE CONTROL'])assert.ok(m.hojas.some(h=>h.nombre===n));
 assert.ok(!f.archivosCorteActual().some(f=>f.content.includes(SECRET)));
});
test('preparar un corte completo crea otra carpeta y conserva el corte terminado anterior íntegro',()=>{
 const f=completoDePrueba();f.preparar();terminar(f);const prev=f.archivosCorte(),id=f.plan().corte_id;
 f.prepararCompleto();terminar(f);assert.deepEqual(f.archivosCorte(),prev);assert.notEqual(f.planActual().corte_id,id);assert.equal(f.planActual().corte_anterior_conservado,id);
 const nuevos=f.archivosCorteActual();assert.throws(()=>f.recuperar(),/Corte privado detenido/);assert.deepEqual(f.archivosCorteActual(),nuevos);
});
test('nuevo corte completo conserva también un corte legado parcialmente leído sin exigir completarlo',()=>{
 const f=completoDePrueba();f.preparar();f.continuar();
 const anteriores=f.archivosCorte(),p=f.plan();assert.ok(p.fuentes.some(x=>x.estado==='PENDIENTE'));assert.ok(p.fuentes.some(x=>x.partes.length));
 f.prepararCompleto();assert.deepEqual(f.archivosCorte(),anteriores);assert.equal(f.planActual().corte_anterior_conservado,p.corte_id);
 const nuevos=f.archivosCorteActual();assert.throws(()=>f.prepararCompleto(),/CONTINUAR_ANTES/);assert.deepEqual(f.archivosCorteActual(),nuevos);
 const error=JSON.parse(f.log.findLast(x=>x.startsWith('{')&&JSON.parse(x).formato==='ims-abiertos-error-v1'));
 assert.equal(error.paso,'REVISAR_CORTE_ANTERIOR');assert.equal(error.codigo_error,'CONTINUAR_ANTES');assert.equal(error.fuentes_modificadas,false);
 assert.equal(terminar(f).maestro_completo,true);assert.equal(f.modificaciones(),0);
});
test('diagnóstico de preparación identifica la condición sin exponer excepciones ni valores de Google',()=>{
 const f=completoDePrueba();f.panel[1][1]={toString(){throw Error(SECRET+' https://drive.google.com/dato-privado');}};
 assert.throws(()=>f.prepararCompleto(),e=>e.message.includes('LEER_PANEL; SERVICIO_O_FORMATO')&&!e.message.includes(SECRET));
 const r=JSON.parse(f.log.at(-1));assert.equal(r.formato,'ims-abiertos-error-v1');assert.equal(r.etapa,'PREPARACION');assert.equal(r.codigo_error,'SERVICIO_O_FORMATO');
 assert.ok(!f.log.join('').includes(SECRET));assert.ok(!f.log.join('').includes('dato-privado'));assert.equal(f.files.length,0);assert.equal(f.modificaciones(),0);
});
test('captura completa preserva archivos con cliente vacío sin inferir su nombre ni cambiar el panel',()=>{
 const f=completoDePrueba();f.panel[1][0]='';f.panel[4][0]='';f.prepararCompleto();const r=terminar(f),p=f.planActual();
 assert.equal(r.fuentes_revision,0);const origen=p.fuentes.find(x=>x.id===ABIERTO);assert.ok(origen);assert.equal(origen.panel.length,2);assert.ok(origen.panel.every(r=>r.celdas.find(c=>c.columna===1).valor===null));assert.equal(f.modificaciones(),0);
});
test('maestro incompleto o cambio posterior de un origen impide declarar lista la captura completa',()=>{
 const incompleto=completoDePrueba({sinRegistro:true});incompleto.prepararCompleto();const r=terminar(incompleto);assert.equal(r.maestro_completo,false);assert.ok(r.fuentes_revision>0);assert.equal(r.lista_para_revision,false);
 const f=completoDePrueba();f.prepararCompleto();terminar(f);const antes=f.planActual().fuentes.find(x=>x.id===ABIERTO).partes;
 f.cambiarOrigen(ABIERTO);const despues=f.continuar();assert.equal(despues.lista_para_revision,false);assert.ok(despues.fuentes_revision>0);assert.deepEqual(f.planActual().fuentes.find(x=>x.id===ABIERTO).partes,antes);
});
