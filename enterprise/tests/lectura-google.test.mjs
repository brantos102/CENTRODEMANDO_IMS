import {test} from 'node:test';
import assert from 'node:assert/strict';
import {crearRitmoLecturaGoogle,respuestaLecturaGoogle,esperaReintentoGoogle,detalleIncidenciaGoogle} from '../src/centro/lectura-google.mjs';
const url='https://sheets.googleapis.com/v4/spreadsheets/archivo_sintetico_123456789?fields=spreadsheetId',opciones={method:'GET'},sinRitmo=async()=>{};
test('las solicitudes concurrentes se espacian y un fallo al esperar no bloquea la cola posterior',async()=>{
 let reloj=1000,falla=false;const pausas=[],ritmo=crearRitmoLecturaGoogle({ahora:()=>reloj,esperar:async ms=>{pausas.push(ms);if(falla){falla=false;throw Error('sintético');}reloj+=ms;}});
 await Promise.all([ritmo(),ritmo(),ritmo()]);assert.deepEqual(pausas,[1100,1100]);falla=true;await assert.rejects(ritmo());await ritmo();assert.equal(reloj,4300);
});
test('429 y fallo temporal se reintentan en la misma lectura respetando Retry-After, sin escrituras',async()=>{
 let n=0,reloj=0;const pausas=[],calls=[];
 const r=await respuestaLecturaGoogle(url,opciones,{regular:sinRitmo,ahora:()=>reloj,esperar:async ms=>{pausas.push(ms);reloj+=ms;},fetchImpl:async(u,o)=>{calls.push({u,o});return ++n===1?new Response('NO_PUBLICAR',{status:429,headers:{'Retry-After':'2'}}):n===2?new Response('ERROR_PRIVADO',{status:503}):new Response('{}');}});
 assert.equal(r.status,200);assert.deepEqual(pausas,[2000,2000]);assert.equal(n,3);assert.ok(calls.every(c=>c.u===url&&c.o.method==='GET'&&c.o.redirect==='error'));
});
test('un límite persistente se informa tras cuatro intentos y 403/404 no se ocultan con reintentos',async()=>{
 for(const status of [429,403,404]){let n=0;const pausas=[];const r=await respuestaLecturaGoogle(url,opciones,{regular:sinRitmo,esperar:async ms=>pausas.push(ms),fetchImpl:async()=>{n++;return new Response('NO_PUBLICAR',{status});}});assert.equal(r.status,status);assert.equal(n,status===429?4:1);assert.deepEqual(pausas,status===429?[15000,30000,60000]:[]);}
});
test('se respeta una espera larga del proveedor y el presupuesto total sin fingir la lectura de una fuente',async()=>{
 for(const [retry,hasta] of [['120',Infinity],['2',1000]]){let n=0,pausas=0;const r=await respuestaLecturaGoogle(url,opciones,{hasta,ahora:()=>0,regular:sinRitmo,esperar:async()=>pausas++,fetchImpl:async()=>{n++;return new Response('privado',{status:429,headers:{'Retry-After':retry}});}});assert.equal(r.status,429);assert.equal(n,1);assert.equal(pausas,0);}
 await assert.rejects(respuestaLecturaGoogle(url,opciones,{hasta:1,ahora:()=>1,regular:sinRitmo,fetchImpl:async()=>{throw Error('No debe consultar');}}),e=>e.codigo==='GOOGLE_LECTURA_EXPIRADA');
 assert.equal(esperaReintentoGoogle(new Response('',{status:429,headers:{'Retry-After':'Thu, 26 Nov 2026 15:00:02 GMT'}}),0,Date.parse('2026-11-26T15:00:00Z')),2000);
});
test('no reintenta certificados rechazados ni admite una escritura o un destino ajeno',async()=>{
 let llamadas=0;const fetchImpl=async()=>{llamadas++;throw Object.assign(Error('SECRETO_RED'),{cause:{code:'CERT_HAS_EXPIRED'}});};await assert.rejects(respuestaLecturaGoogle(url,opciones,{regular:sinRitmo,fetchImpl}));assert.equal(llamadas,1);
 for(const [u,o] of [[url,{method:'POST'}],['https://ajeno.invalid/'+url,opciones]])await assert.rejects(respuestaLecturaGoogle(u,o,{regular:sinRitmo,fetchImpl}),e=>e.codigo==='GOOGLE_LECTURA_NO_AUTORIZADA');assert.equal(llamadas,1);
});
test('diagnóstico de fuentes conserva fila, HTTP y acción acotados sin reflejar mensajes, enlaces ni credenciales',()=>{
 const secreto={codigo:'GOOGLE_LECTURA_RECHAZADA',http:429,filaPanel:371,archivo:'NO_PUBLICAR_ID',mensaje:'NO_PUBLICAR_TOKEN',url:'NO_PUBLICAR_URL'};
 const d=detalleIncidenciaGoogle(secreto);assert.equal(d.causa,'CUOTA_TEMPORAL');assert.equal(d.filaPanel,371);assert.ok(!JSON.stringify(d).includes('NO_PUBLICAR'));
 assert.equal(detalleIncidenciaGoogle({...secreto,http:403}).causa,'ACCESO_RECHAZADO');assert.equal(detalleIncidenciaGoogle({...secreto,http:404}).causa,'FUENTE_NO_DISPONIBLE');assert.equal(detalleIncidenciaGoogle({...secreto,http:503}).causa,'SERVICIO_TEMPORAL');
 const r=detalleIncidenciaGoogle({...secreto,codigo:'NO_PUBLICAR_TOKEN',http:'NO_PUBLICAR_TOKEN',filaPanel:-1});assert.equal(r.http,null);assert.equal(r.filaPanel,null);assert.equal(r.codigo,'LECTURA_NO_CONFIRMADA');assert.ok(!JSON.stringify(r).includes('NO_PUBLICAR'));
});
