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
test('captura completa preserva archivos con cliente vacío sin inferir su nombre ni cambiar el panel',()=>{
 const f=completoDePrueba();f.panel[1][0]='';f.panel[4][0]='';f.prepararCompleto();const r=terminar(f),p=f.planActual();
 assert.equal(r.fuentes_revision,0);const origen=p.fuentes.find(x=>x.id===ABIERTO);assert.ok(origen);assert.equal(origen.panel.length,2);assert.ok(origen.panel.every(r=>r.celdas.find(c=>c.columna===1).valor===null));assert.equal(f.modificaciones(),0);
});
test('maestro incompleto o cambio posterior de un origen impide declarar lista la captura completa',()=>{
 const incompleto=completoDePrueba({sinRegistro:true});incompleto.prepararCompleto();const r=terminar(incompleto);assert.equal(r.maestro_completo,false);assert.ok(r.fuentes_revision>0);assert.equal(r.lista_para_revision,false);
 const f=completoDePrueba();f.prepararCompleto();terminar(f);const antes=f.planActual().fuentes.find(x=>x.id===ABIERTO).partes;
 f.cambiarOrigen(ABIERTO);const despues=f.continuar();assert.equal(despues.lista_para_revision,false);assert.ok(despues.fuentes_revision>0);assert.deepEqual(f.planActual().fuentes.find(x=>x.id===ABIERTO).partes,antes);
});
