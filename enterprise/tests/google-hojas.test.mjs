import {test} from 'node:test';
import assert from 'node:assert/strict';
import {interpretarPlanillaGoogle,interpretarPanelGoogle,clienteHojasGoogle,MAESTRO_UIO,SCOPE_HOJAS} from '../src/centro/google-hojas.mjs';
import {parametrosGoogle} from '../src/centro/google-oauth.mjs';
import {INV} from '../src/migracion/modelo.mjs';
const celda=x=>x===null?{}:{effectiveValue:typeof x==='number'?{numberValue:x}:{stringValue:x},formattedValue:String(x)},archivo='archivo_google_sintetico_123456789';
function filas(){const r=Array(30).fill(null);for(const [i,v]of [[0,'18/11/2026'],[2,'261118_BELIA'],[4,'BELIA'],[6,'000123'],[14,'BM-A-01-1'],[16,2],[21,0]])r[i]=v;return [INV.map(celda),r.map(celda)];}
test('el lector recupera la página del panel después de un 429 y conserva los archivos vinculados',async()=>{
 let rangos=0;const pausas=[],fila=[celda(''),celda('Inventario sintético'),celda(archivo),celda(''),celda(''),celda('UIO')];
 const fetchImpl=async url=>{
  if(url.includes('oauth2.googleapis.com'))return new Response(JSON.stringify({access_token:'SOLO_SINTETICO'}));
  const u=new URL(url);if(!u.searchParams.has('ranges'))return new Response(JSON.stringify({sheets:[{properties:{title:'PANEL DE CONTROL',gridProperties:{rowCount:2}}}]}));
  if(++rangos===1)return new Response('NO_PUBLICAR_PROVEEDOR',{status:429,headers:{'Retry-After':'3'}});
  return new Response(JSON.stringify({sheets:[{data:[{startRow:0,rowData:[{values:[]},{values:fila}]}]}]}));
 };
 const api=await clienteHojasGoogle({hojasLectura:true},{fetchImpl,controlLectura:{regular:async()=>{},esperar:async ms=>pausas.push(ms)}}),panel=await api.panel();
 assert.equal(rangos,2);assert.deepEqual(pausas,[3000]);assert.equal(panel.length,1);assert.equal(panel[0].archivo,archivo);assert.equal(panel[0].sede,'UIO');
});
test('planilla Google conserva cero, decimales exactos e identificadores; separa códigos y no interpreta miles de texto ambiguos',()=>{
 const rows=filas(),rs=interpretarPlanillaGoogle(rows,{archivo,nombre:'Sintético'});assert.equal(rs.grupos[0].lineas[0].conteo_1,'0.000000000');assert.equal(rs.grupos[0].lineas[0].conteo_2,null);assert.equal(rs.grupos[0].lineas[0].sku,'000123');rows[1][22]=celda('0,125');rows[1][24]=celda('-0.125');assert.equal(interpretarPlanillaGoogle(rows,{archivo}).grupos[0].lineas[0].ajuste,'-0.125000000');rows.push([...rows[1]]);rows[2][2]=celda('261118_OTRO');assert.equal(interpretarPlanillaGoogle(rows,{archivo}).grupos.length,2);rows[1][16]=celda('2.000,125');assert.throws(()=>interpretarPlanillaGoogle(rows,{archivo}),e=>e.codigo==='GOOGLE_CANTIDAD_INVALIDA');
});
test('rechaza columnas desplazadas, valores numéricos fuera de precisión segura, fechas y códigos incompletos',()=>{
 for(const [col,value]of [[16,9007199254740992],[21,'1.1234567891'],[0,'31/02/2026'],[2,null]]){const rows=filas();rows[1][col]=celda(value);assert.throws(()=>interpretarPlanillaGoogle(rows,{archivo}));}const rows=filas();rows[0].splice(4,1);assert.throws(()=>interpretarPlanillaGoogle(rows,{archivo}),e=>e.codigo==='GOOGLE_CABECERA_DISTINTA');
});
test('panel solo acepta referencias coherentes y el OAuth agrega lectura de Sheets cuando se solicita',()=>{
 const row=['BELIA','https://docs.google.com/spreadsheets/d/'+archivo+'/edit',archivo,null,null,'UIO','EN PROCESO'];assert.equal(interpretarPanelGoogle([[],row.map(celda)])[0].archivo,archivo);row[2]='otro_archivo_sintetico_12345';assert.throws(()=>interpretarPanelGoogle([[],row.map(celda)]),e=>e.codigo==='GOOGLE_REFERENCIA_DISCORDANTE');const p=parametrosGoogle({clienteId:'123.apps.googleusercontent.com',correo:'sintetico@example.invalid',permitirHojas:true},'https://ims.invalid/api/centro/google/callback','estado','verificador');assert.ok(p.get('scope').split(' ').includes(SCOPE_HOJAS));assert.ok(!p.get('scope').split(' ').includes('https://www.googleapis.com/auth/spreadsheets'));
});
test('lectura por páginas no omite datos después de una zona vacía y solo consulta archivos vinculados al panel',async()=>{
 const visitas=[],headers=INV.map(celda);const fetchImpl=async(url,o)=>{visitas.push({url,method:o.method||'GET'});if(url.includes('oauth2.googleapis.com'))return new Response(JSON.stringify({access_token:'sintetico'}));const u=new URL(url),id=u.pathname.split('/').at(-1),range=u.searchParams.get('ranges');if(!range)return new Response(JSON.stringify({sheets:[{properties:{title:id===MAESTRO_UIO?'PANEL DE CONTROL':'PLANILLA DE CONTEO FISICO',gridProperties:{rowCount:id===MAESTRO_UIO?2:1001}}}]}));if(id===MAESTRO_UIO)return new Response(JSON.stringify({sheets:[{data:[{rowData:[{values:[]},{values:['BELIA','Archivo',archivo,null,null,'UIO','EN PROCESO'].map(celda)}]}]}]}));const desde=Number(/!A(\d+)/.exec(range)[1]),rowData=desde===1?[{values:headers}]:desde===1001?[{values:filas()[1]}]:[];return new Response(JSON.stringify({sheets:[{data:[{startRow:desde-1,rowData}]}]}));};const c=await clienteHojasGoogle({hojasLectura:true},{fetchImpl,controlLectura:{regular:async()=>{},esperar:async()=>{}}});const panel=await c.panel(),r=await c.inventario(panel[0]);assert.equal(r.grupos[0].lineas[0].fila,1001);await assert.rejects(()=>c.inventario({archivo:'otro_archivo_sintetico_12345'}),e=>e.codigo==='GOOGLE_LECTURA_NO_AUTORIZADA');assert.ok(visitas.filter(v=>v.url.includes('sheets.googleapis.com')).every(v=>v.method==='GET'));
});

test('el panel toma la sede de F y la fecha final de E sin asignar por defecto otra bodega',()=>{
 const filas=[[],['BELIA','Archivo','archivo_sintetico_gye_12345','17/11/2026','18/11/2026','GYE','ENTREGADO'].map(celda)];const p=interpretarPanelGoogle(filas)[0];assert.equal(p.sede,'GYE');assert.equal(p.fechaFin,'2026-11-18');filas[1][5]=celda('TLF');assert.equal(interpretarPanelGoogle(filas)[0].sede,null);
});
test('una fuente que cambia entre lecturas se deja para revisión y no se presenta como un corte estable',async()=>{
 let lectura=0;const fetchImpl=async(url,o)=>{if(url.includes('oauth2.googleapis.com'))return new Response(JSON.stringify({access_token:'sintetico'}));const u=new URL(url),id=u.pathname.split('/').at(-1),range=u.searchParams.get('ranges');if(!range)return new Response(JSON.stringify({sheets:[{properties:{title:id===MAESTRO_UIO?'PANEL DE CONTROL':'PLANILLA DE CONTEO FISICO',gridProperties:{rowCount:2}}}]}));if(id===MAESTRO_UIO)return new Response(JSON.stringify({sheets:[{data:[{rowData:[{values:[]},{values:['BELIA','Archivo',archivo,null,null,'UIO','EN PROCESO'].map(celda)}]}]}]}));const rows=filas();rows[1][21]=celda(lectura++);return new Response(JSON.stringify({sheets:[{data:[{rowData:rows.map(values=>({values}))}]}]}));};const c=await clienteHojasGoogle({hojasLectura:true},{fetchImpl,controlLectura:{regular:async()=>{},esperar:async()=>{}}}),panel=await c.panel();await assert.rejects(()=>c.inventario(panel[0]),e=>e.codigo==='GOOGLE_FUENTE_CAMBIO');
});

test('miles formateados de Google se leen por su valor numérico, mientras los textos ambiguos se revisan',()=>{
 const r=filas();r[1][16]={effectiveValue:{numberValue:2000},formattedValue:'2.000'};assert.equal(interpretarPlanillaGoogle(r,{archivo}).grupos[0].lineas[0].depot,'2000.000000000');r[1][16]=celda('2.000');assert.throws(()=>interpretarPlanillaGoogle(r,{archivo}),e=>e.codigo==='GOOGLE_CANTIDAD_AMBIGUA');
});
