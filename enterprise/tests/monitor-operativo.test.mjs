import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filtrarMonitor} from '../public/monitor-filtros.mjs';
import {sincronizarEventoGoogle} from '../src/centro/conectores.mjs';
test('el monitor distingue 15 y 30 días inclusivos, estados y equipo sin incorporar inventarios futuros',()=>{
 const rows=[['a','2026-11-19','EN_PROCESO'],['b','2026-11-05','EN_VALIDACION'],['c','2026-11-04','EN_PROCESO'],['d','2026-10-21','EN_PROCESO'],['e','2026-10-20','EN_PROCESO'],['f','2026-11-20','EN_PROCESO'],['g','2026-11-18','CERRADO_SIN_CONSOLIDAR']].map(([id,fecha_inicio,estado])=>({id,fecha_inicio,estado,cliente:'BELIA',codigo_operativo:id}));
 assert.deepEqual(filtrarMonitor(rows,{hoy:'2026-11-19'}).map(x=>x.id),['a','b']);assert.deepEqual(filtrarMonitor(rows,{hoy:'2026-11-19',dias:30}).map(x=>x.id),['a','b','c','d']);assert.deepEqual(filtrarMonitor(rows,{hoy:'2026-11-19',estado:'CERRADO_SIN_CONSOLIDAR'}).map(x=>x.id),['g']);assert.deepEqual(filtrarMonitor(rows,{hoy:'2026-11-19',dias:30,equipo:new Set(['c']),buscar:'BELIA'}).map(x=>x.id),['c']);
});
test('Calendar invita solo a los destinatarios preparados cuando administración activa el aviso al equipo',async()=>{
 const urls=[],bodies=[],e={id:'a'.repeat(36),cliente:'CLIENTE',titulo:'Conteo',fecha_inicio:'2026-11-19',duracion:2,estado:'Pendiente',asistentes:['lider@sintetico.invalid']};
 const f=async(url,o={})=>{urls.push(url);if(url.includes('/token'))return new Response(JSON.stringify({access_token:'SINTETICO'}));if(!o.method)return new Response('{}',{status:404});bodies.push(JSON.parse(o.body));return new Response('{}');};
 await sincronizarEventoGoogle({calendario:'primary',notificarEquipo:true},e,f);assert.match(urls.at(-1),/sendUpdates=all/);assert.deepEqual(bodies[0].attendees,[{email:'lider@sintetico.invalid'}]);assert.equal(bodies[0].end.date,'2026-11-21');
 await sincronizarEventoGoogle({calendario:'primary'},e,f);assert.match(urls.at(-1),/sendUpdates=none/);assert.equal(bodies[1].attendees,undefined);
});
test('una sincronización Calendar sin cambios conserva asistentes y no reenvía notificaciones',async()=>{
 const e={id:'b'.repeat(36),cliente:'CLIENTE',titulo:'Conteo',fecha_inicio:'2026-11-19',duracion:1,estado:'Pendiente',asistentes:['lider@sintetico.invalid']},cfg={calendario:'primary',notificarEquipo:true};let remoto=null,mutaciones=0;const f=async(url,o={})=>{if(url.includes('/token'))return new Response(JSON.stringify({access_token:'SINTETICO'}));if(o.method){mutaciones++;remoto=JSON.parse(o.body);return new Response('{}');}return remoto?new Response(JSON.stringify(remoto)):new Response('{}',{status:404});};await sincronizarEventoGoogle(cfg,e,f);const r=await sincronizarEventoGoogle(cfg,e,f);assert.equal(r.sinCambios,true);assert.equal(mutaciones,1);
});
test('lector Sheets respeta la sede definida en IMS únicamente cuando el panel no la informa',async()=>{
 const {clienteHojasGoogle}=await import('../src/centro/google-hojas.mjs'),id='archivo_sintetico_sede_123456789',cell=x=>({effectiveValue:{stringValue:x},formattedValue:x}),fila=[cell(''),cell('Inventario'),cell(id),cell(''),cell(''),cell('')],f=async url=>{if(url.includes('/token'))return new Response(JSON.stringify({access_token:'SINTETICO'}));const q=new URL(url).searchParams;if(!q.has('ranges'))return new Response(JSON.stringify({sheets:[{properties:{title:'PANEL DE CONTROL',gridProperties:{rowCount:2}}}]}));return new Response(JSON.stringify({sheets:[{data:[{rowData:[{values:[]},{values:fila}]}]}]}));};const c=await clienteHojasGoogle({hojasLectura:true,sedesArchivos:{[id]:'GYE'}},{fetchImpl:f,controlLectura:{regular:async()=>{},esperar:async()=>{}}});assert.equal((await c.panel())[0].sede,'GYE');fila[5]=cell('UIO');const d=await clienteHojasGoogle({hojasLectura:true,sedesArchivos:{[id]:'GYE'}},{fetchImpl:f,controlLectura:{regular:async()=>{},esperar:async()=>{}}});assert.equal((await d.panel())[0].sede,'UIO');
});
