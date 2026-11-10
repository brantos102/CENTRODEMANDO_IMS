import {test} from 'node:test';
import assert from 'node:assert/strict';
import {consultarERP,jsonExacto,normalizarStockERP,inspeccionarCodigosERP,resumirPrevisualizacionERP,soportaJSONExacto} from '../src/conexiones/itsanet.mjs';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const clienteId='00000000-0000-0000-0000-000000000001';
const row={'COD. CLIENTE':'C','COD. PRODUCTO':'001',CANTIDAD:'9007199254740993.125',NAVE:'A',CALLE:'02'};
test('JSON ERP conserva números exactos antes de convertirlos y no altera cadenas',()=>{
 assert.equal(jsonExacto('{"n":9007199254740993.125,"sku":"0001"}').n,'9007199254740993.125');
 assert.equal(jsonExacto('{"sku":"0001"}').sku,'0001');
});
test('ERP agrupa dimensiones completas por cliente y separa serie; una serie equivale a una unidad',()=>{
 const r=normalizarStockERP([row,row,{...row,'NRO. SERIE':'S'}, {...row,'NRO. SERIE':'s'},
  {...row,'COD. CLIENTE':'AJENO'}, {...row,'NRO. LOTE':'L'}],{clienteId,codigosCliente:['C']});
 assert.equal(r.filas.length,3);assert.equal(r.filas[0].depot,'18014398509481986.250000000');
 assert.equal(r.filas[1].depot,'1.000000000');assert.equal(r.informe.otroCliente,1);assert.equal(r.informe.seriesDuplicadas,1);
 assert.throws(()=>normalizarStockERP([{...row,CANTIDAD:'2,000'}],{clienteId,codigosCliente:['C']}));
});
test('conexión usa exclusivamente GET a su sede, sin redirecciones; token y clave no aparecen en resultado',async()=>{
 const calls=[];const f=async(url,opts)=>{calls.push({url,...opts});return new Response(url.endsWith('gettoken')?'{"token":"secreto_sintetico"}':JSON.stringify([row]));};
 const r=await consultarERP({sede:'GYE',clienteId,userid:'usuario_sintetico',password:'clave_sintetica',codigosCliente:['C']},{fetchImpl:f});
 assert.deepEqual(calls.map(c=>c.url),['https://ec.itsanet.com/g_apidepot/gettoken','https://ec.itsanet.com/g_apidepot/getstock']);
 assert.ok(calls.every(c=>c.method==='GET'&&c.redirect==='error'));
 assert.equal(JSON.stringify(r).includes('secreto_sintetico'),false);
 await assert.rejects(consultarERP({sede:'https://otro',clienteId,userid:'u',password:'p'},{fetchImpl:f}));
});
test('401 y respuesta malformada no publican filas ni cuerpos del ERP',async()=>{
 for(const f of [async()=>new Response('CLAVE_SECRETA',{status:401}),async()=>new Response('CLAVE_SECRETA')])
  await assert.rejects(consultarERP({sede:'UIO',clienteId,userid:'u',password:'p',codigosCliente:['C']},{fetchImpl:f}),e=>!e.message.includes('CLAVE_SECRETA'));
});
test('diagnóstico devuelve códigos exactos y recuentos, sin filtrar por etiqueta ni publicar stock, claves o token',async()=>{
 const llamadas=[],f=async(url,opts)=>{llamadas.push({url,...opts});return new Response(url.endsWith('gettoken')?'{"token":"TOKEN_SINTETICO"}':'{"Result":[{"COD. CLIENTE":" NOKIACNT ","COD. PRODUCTO":"SKU_PRIVADO","CANTIDAD":100},{"COD. CLIENTE":"nokiacnt"},{"COD. CLIENTE":"0007"},{"COD. CLIENTE":9007199254740993},{}]}');};
 const r=await inspeccionarCodigosERP({sede:'GYE',userid:'USER_SINTETICO',password:'CLAVE_SINTETICA'},{fetchImpl:f});
 assert.equal(r.filas_observadas,5);assert.equal(r.filas_sin_codigo,1);assert.deepEqual(r.codigos_observados,[{codigo:'0007',filas:1},{codigo:'9007199254740993',filas:1},{codigo:'NOKIACNT',filas:2}]);
 for(const valor of ['TOKEN_SINTETICO','USER_SINTETICO','CLAVE_SINTETICA','SKU_PRIVADO','CANTIDAD'])assert.equal(JSON.stringify(r).includes(valor),false);
 assert.deepEqual(llamadas.map(c=>c.url),['https://ec.itsanet.com/g_apidepot/gettoken','https://ec.itsanet.com/g_apidepot/getstock']);assert.ok(llamadas.every(c=>c.method==='GET'&&c.redirect==='error'));
});
test('stock vacío verifica consulta sin inventar códigos; token vacío, redirecciones y formatos inválidos fallan sin reflejar cuerpos',async()=>{
 const cfg={sede:'UIO',userid:'u',password:'p'};
 const r=await inspeccionarCodigosERP(cfg,{fetchImpl:async url=>new Response(url.endsWith('gettoken')?'{"Token":"t"}':'')});assert.equal(r.filas_observadas,0);assert.deepEqual(r.codigos_observados,[]);
 for(const respuesta of [new Response('CLAVE_SECRETA',{status:401}),new Response('CLAVE_SECRETA'),new Response('{"token":""}'),new Response(null,{status:302,headers:{Location:'https://otro.invalid'}})])await assert.rejects(inspeccionarCodigosERP(cfg,{fetchImpl:async()=>respuesta}),e=>!e.message.includes('CLAVE_SECRETA'));
 for(const body of ['{}','[null]','[{"COD. CLIENTE":{}}]'])await assert.rejects(inspeccionarCodigosERP(cfg,{fetchImpl:async url=>new Response(url.endsWith('gettoken')?'{"token":"t"}':body)}));
});
test('destinos y cabeceras inválidos se rechazan antes de red; autenticación excesiva tiene límite',async()=>{
 let llamadas=0;const f=async()=>{llamadas++;return new Response('x'.repeat(65537));};
 for(const cfg of [{sede:'https://otro',userid:'u',password:'p'},{sede:'UIO',userid:'u\r\nX:1',password:'p'}])await assert.rejects(inspeccionarCodigosERP(cfg,{fetchImpl:f}));assert.equal(llamadas,0);
 await assert.rejects(inspeccionarCodigosERP({sede:'UIO',userid:'u',password:'p'},{fetchImpl:f}));assert.equal(llamadas,1);
});
test('fallos identifican etapa y HTTP mediante valores acotados, sin reflejar mensajes o cuerpos privados',async()=>{
 const cfg={sede:'UIO',userid:'u',password:'p'};
 await assert.rejects(inspeccionarCodigosERP(cfg,{fetchImpl:async()=>new Response('NO_PUBLICAR',{status:401})}),e=>e.etapaERP==='AUTENTICACION'&&e.httpERP===401&&!JSON.stringify(e).includes('NO_PUBLICAR'));
 await assert.rejects(inspeccionarCodigosERP(cfg,{fetchImpl:async url=>new Response(url.endsWith('gettoken')?'{"token":"t"}':'NO_PUBLICAR',{status:url.endsWith('gettoken')?200:403})}),e=>e.etapaERP==='LECTURA_STOCK'&&e.httpERP===403);
 await assert.rejects(inspeccionarCodigosERP(cfg,{fetchImpl:async url=>{if(url.endsWith('gettoken'))return new Response('{"token":"t"}');throw Error('NO_PUBLICAR');}}),e=>e.etapaERP==='LECTURA_STOCK'&&e.httpERP===null&&!JSON.stringify(e).includes('NO_PUBLICAR'));
});
const fuenteUIO=await readFile(new URL('../../ITSANET_API.gs.js',import.meta.url),'utf8');
const fuenteGYE=await readFile(new URL('../../ITSANET_API_GYE.js',import.meta.url),'utf8');
function tokenGoogle(fuente,nombre,body){
 const match=fuente.match(new RegExp('function '+nombre+'\\(cliente\\) \\{[\\s\\S]*?\\n\\}'));assert.ok(match);
 const ctx=vm.createContext({ITSANET_BASE:'https://ec.itsanet.com/q_apidepot',ITSANET_BASE_GYE:'https://ec.itsanet.com/g_apidepot',_obtenerCredencialesAPI:()=>({user:'u',pass:'p'}),_obtenerCredencialesGYE:()=>({user:'u',pass:'p'}),PropertiesService:{getScriptProperties:()=>({getProperty:()=>null,setProperty:()=>{}})},Utilities:{formatDate:()=> '2026-11-10'},UrlFetchApp:{fetch:()=>({getResponseCode:()=>200,getContentText:()=>body})}});
 vm.runInContext(match[0],ctx);return ctx[nombre]('CLIENTE_SINTETICO');
}
test('selección y trim del token coinciden con ambos getters reales de Apps Script, incluso con campos vacíos y Result no textual',async()=>{
 const bodies=[{token:'',Token:' TOKEN_SINTETICO '},{token:null,Token:false,Result:' TOKEN_SINTETICO '},{token:0,Token:'',Result:' TOKEN_SINTETICO '},{Result:12345},{Result:123.45},{result:['TOKEN_SINTETICO']},{status:200,token:' TOKEN_SINTETICO\n'}];
 for(const auth of bodies){
  const body=JSON.stringify(auth),uio=tokenGoogle(fuenteUIO,'obtenerORenovarTokenWMS',body),gye=tokenGoogle(fuenteGYE,'obtenerORenovarTokenWMS_GYE',body);assert.equal(uio,gye);
  for(const inspeccion of [false,true]){
   let recibido;
   const fetchImpl=async(url,opts)=>{if(url.endsWith('gettoken'))return new Response(body);recibido=opts.headers.token;return new Response('[]');};
   if(inspeccion)await inspeccionarCodigosERP({sede:'UIO',userid:'u',password:'p'},{fetchImpl});
   else await consultarERP({sede:'GYE',clienteId,userid:'u',password:'p',codigosCliente:['C']},{fetchImpl});
   assert.equal(recibido,uio);
  }
 }
});
test('diagnóstico identifica formato JSON/HTML y campos reconocidos sin copiar tokens, prefijos o cuerpos',async()=>{
 const cfg={sede:'UIO',userid:'u',password:'p'};
 for(const [body,headers,tipo] of [['<html>TOKEN_PRIVADO</html>',{'content-type':'text/html'},'HTML'],[JSON.stringify({desconocido:'TOKEN_PRIVADO'}),{'content-type':'application/json'},'JSON']]){
  await assert.rejects(inspeccionarCodigosERP(cfg,{fetchImpl:async()=>new Response(body,{headers})}),e=>e.autenticacionERP.tipo_contenido===tipo&&e.autenticacionERP.token_utilizable===false&&!JSON.stringify(e).includes('TOKEN_PRIVADO'));
 }
 const r=await inspeccionarCodigosERP(cfg,{fetchImpl:async url=>new Response(url.endsWith('gettoken')?JSON.stringify({token:'',Result:' TOKEN_PRIVADO '}):'[]')});assert.equal(r.diagnostico_autenticacion.campo_elegido,'Result');assert.equal(r.diagnostico_autenticacion.recorte_espacios,true);assert.equal(JSON.stringify(r).includes('TOKEN_PRIVADO'),false);
});
test('UTF8 BOM se admite sin perder números de stock exactos y el motor informa su capacidad',async()=>{
 assert.equal(soportaJSONExacto(),true);assert.equal(jsonExacto('\uFEFF{"n":9007199254740993.125}').n,'9007199254740993.125');
 const r=await inspeccionarCodigosERP({sede:'UIO',userid:'u',password:'p'},{fetchImpl:async url=>new Response(url.endsWith('gettoken')?'\uFEFF{"token":" t "}':'\uFEFF[]')});assert.equal(r.filas_observadas,0);
});
test('previsualización devuelve totales exactos por código y conserva la regla de series sin publicar existencias',()=>{
 const filas=[{...row,CANTIDAD:'0.1'},{...row,CANTIDAD:'0.2'},{...row,'NRO. SERIE':'SERIE_PRIVADA',CANTIDAD:'99'},{...row,'NRO. SERIE':'serie_privada',CANTIDAD:'99'},{...row,'COD. CLIENTE':'OTRO',CANTIDAD:'2'}];
 const r=resumirPrevisualizacionERP(filas);assert.equal(r.totales_calculados,true);assert.equal(r.filas_previsualizadas,3);assert.equal(r.unidades_previsualizadas,'3.300000000');assert.equal(r.filas_con_serie,1);
 const c=r.por_codigo.find(c=>c.codigo==='C');assert.equal(c.unidades_previsualizadas,'1.300000000');assert.equal(c.series_duplicadas,1);assert.equal(c.filas_agrupadas,1);assert.equal(JSON.stringify(r).includes('SERIE_PRIVADA'),false);assert.equal(JSON.stringify(r).includes('COD. PRODUCTO'),false);
 const invalido=resumirPrevisualizacionERP([{...row,CANTIDAD:'2,000'}]);assert.equal(invalido.totales_calculados,false);assert.equal(invalido.unidades_previsualizadas,null);assert.equal(invalido.por_codigo[0].unidades_previsualizadas,null);
});
test('filas y unidades de previsualización coinciden con el wizard real para reglas ERP válidas',()=>{
 const ctx=vm.createContext({});vm.runInContext(fuenteUIO,ctx);
 const filas=[{...row,CANTIDAD:'2'},{...row,CANTIDAD:'3'},{...row,CANTIDAD:'99','NRO. SERIE':'S'},{...row,CANTIDAD:'99','NRO. SERIE':'s'},{...row,CANTIDAD:'4','NRO. LOTE':'L'},{...row,CANTIDAD:'6','COD. CLIENTE':'OTRO'}];
 ctx.consultarStockItsanet=()=>({code:200,body:JSON.stringify(filas)});
 const n=resumirPrevisualizacionERP(filas);
 for(const codigo of ['C','OTRO']){
  const g=ctx.previsualizarStockItsanet(codigo,'',true,[codigo]),c=n.por_codigo.find(c=>c.codigo===codigo);assert.equal(c.filas_previsualizadas,g.datosLimpios.length);assert.equal(Number(c.unidades_previsualizadas),g.reporte.sumaCantidad);
 }
});
