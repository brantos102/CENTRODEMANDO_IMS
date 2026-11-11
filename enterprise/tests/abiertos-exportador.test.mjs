import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {simular,ABIERTO,CERRADO,SECRET} from './fixtures/corte-abiertos.mjs';
test('corte restringe proyecto, cuenta efectiva y privacidad antes de publicar contenido',()=>{
 for(const opts of [{proyecto:'OTRO'},{email:'otro@sintetico.invalid'},{efectivo:'otro@sintetico.invalid'}]){const f=simular(opts);assert.throws(f.preparar);assert.equal(f.reads(),0);assert.equal(f.files.length,0);}
 const f=simular({privado:false});assert.throws(f.preparar);assert.ok(f.files.every(f=>!f.content||f.content==='{}'));
});
test('selección conserva abiertos, validación y negaciones, omite solo Entregado y deduplica por archivo físico',()=>{
 const f=simular(),r=f.preparar(),p=f.plan();assert.equal(r.archivos_inventario,3);assert.equal(r.filas_panel_sin_archivo,1);assert.equal(p.fuentes.find(x=>x.id===ABIERTO).panel.length,2);assert.ok(!p.fuentes.some(x=>x.id===CERRADO));assert.throws(f.preparar);assert.equal(f.modificaciones(),0);
});
test('un enlace explícito de Sheets recupera el archivo si falta C, sin inferirlo del nombre',()=>{
 for(const enlace of [true,'rico']){const f=simular({enlace}),r=f.preparar();assert.equal(r.archivos_inventario,3);assert.equal(r.filas_panel_sin_archivo,1);const archivo=f.plan().fuentes.find(x=>x.id===ABIERTO);assert.equal(archivo.panel.length,2);assert.ok(archivo.panel.every(r=>r.ids_archivo_b.includes(ABIERTO)));assert.equal(f.modificaciones(),0);}
});
test('continuación reanuda fragmentos, preserva ceros y notas y excluye contraseñas sin leer propiedades',()=>{
 const f=simular();f.preparar();let r;for(let i=0;i<50;i++){r=f.continuar();if(r.extraccion_terminada)break;}assert.equal(r.lista_para_revision,true);assert.equal(r.fuentes_revision,0);assert.equal(r.corte_final_aprobado,false);assert.equal(f.modificaciones(),0);
 const p=f.plan();for(const source of p.fuentes){assert.equal(source.estado,'COMPLETO');for(const part of source.partes){const raw=f.files.find(f=>f.nombre===part.nombre).content;assert.equal(createHash('sha256').update(raw).digest('hex'),part.sha256);assert.equal(raw.includes(SECRET),false);}}
 const payloads=f.files.filter(f=>f.nombre.startsWith('fuente_')).map(f=>JSON.parse(f.content)),stock=payloads.find(f=>f.hoja==='PLANILLA DE CONTEO FISICO');assert.equal(stock.filas[1].celdas.find(c=>c.columna===2).valor,'0');assert.equal(stock.filas[1].celdas.find(c=>c.columna===3).valor,null);assert.equal(stock.filas[1].celdas[0].valor,'00001');assert.equal(stock.filas[1].celdas[0].nota,'Nota humana');assert.ok(stock.columnas_omitidas.includes(4));assert.equal(f.log.join('').includes(SECRET),false);
 const cantidad=f.files.length;f.continuar();assert.equal(f.files.length,cantidad);
});
test('una fuente que cambia queda retenida para revisión y no se anuncia lista para trasladar',()=>{
 const f=simular({cambio:true});f.preparar();let r;for(let i=0;i<50;i++){r=f.continuar();if(r.extraccion_terminada)break;}assert.equal(r.lista_para_revision,false);assert.ok(r.fuentes_revision>0);assert.equal(f.plan().fuentes.find(f=>f.id===ABIERTO).motivo,'FUENTE_CAMBIO');assert.equal(f.modificaciones(),0);
});
test('un cambio del panel se informa sin sobrescribir el corte ni declarar listo el conjunto',()=>{
 const f=simular();f.preparar();f.panel[1][6]='En validación';let r;for(let i=0;i<50;i++){r=f.continuar();if(r.extraccion_terminada)break;}assert.equal(r.panel_cambio,true);assert.equal(r.lista_para_revision,false);assert.equal(f.plan().panel[1].celdas.find(c=>c.columna===7).valor,'En Proceso');
});
function terminar(f){let r;for(let i=0;i<100;i++){r=f.continuar();if(r.extraccion_terminada)return r;}throw Error('No terminó el corte sintético.');}
test('recuperación preserva plan y fragmentos anteriores, recaptura la fuente cambiada y el maestro ancho con fragmentos pequeños',()=>{
 const f=simular({ancho:true});f.preparar();f.continuar();assert.ok(f.plan().fuentes.find(x=>x.id===ABIERTO).partes.length);f.cambiarOrigen(ABIERTO);const primero=terminar(f);assert.equal(primero.fuentes_revision,2);
 const antes=f.archivosCorte(),planAntes=f.plan();f.panel[2][8]='Responsable actual';const nuevo=f.recuperar();assert.equal(nuevo.fuentes_recapturadas,2);assert.equal(nuevo.fuentes_reutilizadas,4);assert.equal(nuevo.panel_anterior_cambio,true);assert.notEqual(nuevo.corte_id,primero.corte_id);assert.throws(f.recuperar);
 assert.ok(f.files.some(x=>x.nombre==='plan_abiertos_privado.json'&&x.content===antes.find(x=>x.nombre==='plan_abiertos_privado.json').content));const r=terminar(f);assert.equal(r.fuentes_revision,0);assert.equal(r.panel_cambio,false);assert.equal(r.corte_final_aprobado,false);assert.equal(r.fragmentos_conservados_revision,2);assert.equal(f.modificaciones(),0);
 for(const x of antes.filter(x=>x.nombre.startsWith('fuente_')))assert.equal(f.files.find(y=>y.nombre===x.nombre).content,x.content);
 const p=f.plan();assert.equal(p.formato,'ims-abiertos-corte-v2');assert.equal(p.recuperacion.plan_anterior_sha256,createHash('sha256').update(antes.find(x=>x.nombre==='plan_abiertos_privado.json').content).digest('hex'));
 for(const src of p.fuentes)for(const part of src.partes){const texto=f.files.find(x=>x.nombre===part.nombre).content,d=JSON.parse(texto);assert.ok(d.filas.length*d.columnas<=10000);assert.equal(texto.includes(SECRET),false);}
 const master=p.fuentes.find(x=>x.tipo==='MAESTRO');assert.ok(master.hojas.some(h=>h.columnas===385));assert.ok(master.hojas.some(h=>h.columnas===384));assert.equal(p.fuentes.find(x=>x.id===ABIERTO).partes.some(x=>planAntes.fuentes.find(x=>x.id===ABIERTO).partes.some(a=>a.nombre===x.nombre)),false);
});
test('recuperación no empieza mientras haya pendientes ni reinicia la copia ya recuperada',()=>{
 const f=simular();f.preparar();const antes=JSON.stringify(f.archivosCorte());assert.throws(f.recuperar);assert.equal(JSON.stringify(f.archivosCorte()),antes);terminar(f);f.recuperar();const nuevo=JSON.stringify(f.archivosCorte());assert.throws(f.recuperar);assert.equal(JSON.stringify(f.archivosCorte()),nuevo);
});
test('cambio posterior de una fuente reutilizada queda en revisión con sus capturas conservadas',()=>{
 const f=simular();f.preparar();terminar(f);f.recuperar();const p=f.plan(),src=p.fuentes.find(x=>x.id===ABIERTO);assert.ok(src.reutilizada_de);f.cambiarOrigen(ABIERTO);const r=terminar(f);assert.equal(r.fuentes_revision,1);assert.equal(r.lista_para_revision,false);assert.deepEqual(f.plan().fuentes.find(x=>x.id===ABIERTO).partes,src.partes);assert.equal(f.modificaciones(),0);
});
test('un inventario que pasó a Entregado no desaparece: conserva todos sus fragmentos y referencias en el respaldo',()=>{
 const f=simular();f.preparar();terminar(f);const anterior=f.plan().fuentes.find(x=>x.id===ABIERTO);f.panel[1][6]='Entregado';f.panel[4][6]='Entregado';f.recuperar();const r=terminar(f),p=f.plan();assert.equal(r.fuentes_retiradas_panel_actual,1);assert.equal(r.lista_para_revision,false);assert.equal(p.fuentes.some(x=>x.id===ABIERTO),false);assert.deepEqual(p.partes_conservadas_revision.filter(x=>x.fuente_id===ABIERTO).map(x=>x.nombre),anterior.partes.map(x=>x.nombre));assert.equal(f.modificaciones(),0);
});
