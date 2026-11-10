// Conector de lectura. Los destinos y métodos son fijos: no acepta URLs del navegador.
import {exigirOperacion as exigir,filaStock} from '../dominio/operacion.mjs';
import {decimal,textoDecimal} from '../dominio/analisis-wms.mjs';
import {ErrorConteo} from '../dominio/conteo.mjs';
import {cantidadERP} from './cantidad-erp.mjs';
const BASE={UIO:'https://ec.itsanet.com/q_apidepot',GYE:'https://ec.itsanet.com/g_apidepot'};
export function jsonExacto(body){
 return JSON.parse(body.replace(/^\uFEFF/,''),(_k,v,context)=>{
  if(typeof v!=='number')return v;
  exigir(typeof context?.source==='string','CONEXION_INVALIDA','El motor no admite números JSON exactos.');
  return context.source;
 });
}
export function soportaJSONExacto(){
 try{let fuente;JSON.parse('{"n":9007199254740993}',(k,v,c)=>{if(k==='n')fuente=c?.source;return v;});return fuente==='9007199254740993';}catch{return false;}
}
const tipo=v=>v===null?'nulo':Array.isArray(v)?'arreglo':typeof v==='string'?'cadena':typeof v==='number'?'numero':typeof v==='boolean'?'booleano':typeof v==='object'?'objeto':'ausente';
function leerTokenERP(body,diagnostico={}){
 const m={tipo_contenido:diagnostico.tipo_contenido??'SIN_TIPO',json_valido:false,tipo_raiz:null,campos_reconocidos:[],campo_elegido:null,tipo_elegido:null,recorte_espacios:false,limite_excedido:false,token_utilizable:false};
 diagnostico.autenticacion=m;
 let auth;try{auth=JSON.parse(body.replace(/^\uFEFF/,''));m.json_valido=true;m.tipo_raiz=tipo(auth);}catch{exigir(false,'CONEXION_INVALIDA','Formato de autenticación ERP no verificado.');}
 // Contrato del Apps Script vigente: primer campo con valor verdadero,
 // después String y trim. No convertir los números de metadatos en tokens.
 for(const campo of ['token','Token','Result','result']){
  if(auth!==null&&Object.hasOwn(Object(auth),campo)){
   const valor=auth[campo];m.campos_reconocidos.push({campo,tipo:tipo(valor),con_valor:!!valor});
   if(!m.campo_elegido&&valor){m.campo_elegido=campo;m.tipo_elegido=tipo(valor);}
  }
 }
 const elegido=m.campo_elegido?auth[m.campo_elegido]:null;
 exigir(elegido,'CONEXION_INVALIDA','Token ERP no verificado.');
 const raw=String(elegido),token=raw.trim();m.recorte_espacios=raw!==token;m.limite_excedido=token.length>8192;
 m.token_utilizable=token.length>0&&!m.limite_excedido&&!/[\r\n\x00-\x1f\x7f]/.test(token);
 exigir(m.token_utilizable,'CONEXION_INVALIDA','Token ERP no verificado.');
 return token;
}
async function obtener(fetchImpl,url,headers,limite,diagnostico=null){
 const response=await fetchImpl(url,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(20000)});
 if(diagnostico){
  diagnostico.http=response.status;
  const mime=String(response.headers?.get('content-type')||'').split(';')[0].trim().toLowerCase();
  diagnostico.tipo_contenido=!mime?'SIN_TIPO':mime.includes('json')?'JSON':mime==='text/html'?'HTML':mime.includes('xml')?'XML':mime==='text/plain'?'TEXTO':'OTRO';
 }
 exigir(response.ok,'CONEXION_INVALIDA',response.status===401?'Credencial ERP rechazada.':'El ERP no respondió correctamente.');
 const chunks=[];let size=0;
 for await(const b of response.body??[]){size+=b.length;if(size>limite){await response.body.cancel().catch(()=>{});exigir(false,'CONEXION_INVALIDA','Respuesta ERP demasiado grande.');}chunks.push(b);}
 return Buffer.concat(chunks).toString('utf8');
}
function camposFilaERP(r,clienteId,depot){
 const serie=String(r['NRO. SERIE']??'').trim();
 return {numero:1,clienteId,sku:String(r['COD. PRODUCTO']??'').trim().toUpperCase(),
  descripcion:String(r.DESCRIPCION??''),serie:serie&&!['0','N/A'].includes(serie.toUpperCase())?serie:'',lote:String(r['NRO. LOTE']??''),
  despacho:String(r['NRO. DESPACHO']??''),partida:String(r['NRO. PARTIDA']??''),
  categoria:String(r['CAT. LOG.']??''),estadoMercancia:String(r['EST. MERC.']??''),
  posicion:['NAVE','CALLE','COLUMNA','NIVEL'].map(k=>String(r[k]??'').trim()).filter(Boolean).join('-'),
  unidad:String(r.UNIDAD??''),depot};
}
export function normalizarStockERP(rows,{clienteId,codigosCliente}){
 exigir(Array.isArray(rows)&&rows.length<=100000&&Array.isArray(codigosCliente)&&codigosCliente.length>0,'CONEXION_INVALIDA','Configura los códigos ERP autorizados para el cliente.');
 const codigos=new Set(codigosCliente.map(x=>String(x).trim().toUpperCase())),grupos=new Map();
 const informe={leidas:rows.length,incluidas:0,otroCliente:0,seriesDuplicadas:0,agrupadas:0,seriesAjustadas:0};
 for(const r of rows){
  const cli=String(r['COD. CLIENTE']??'').trim().toUpperCase();if(!codigos.has(cli)){informe.otroCliente++;continue;}
  const serie=String(r['NRO. SERIE']??'').trim(),conSerie=serie&&!['0','N/A'].includes(serie.toUpperCase());
  const cantidad=cantidadERP(r.CANTIDAD);
  const row=filaStock(camposFilaERP(r,clienteId,conSerie?'1':cantidad));
  if(conSerie&&decimal(cantidad)!==1000000000n)informe.seriesAjustadas++;
  const key=JSON.stringify([cli,row.sku,row.lote,row.despacho,row.partida,row.categoria,row.estadoMercancia,row.posicion,row.unidad,conSerie?row.serie.toUpperCase():null]);
  const previo=grupos.get(key);
  if(previo){
   if(conSerie){informe.seriesDuplicadas++;continue;}
   previo.depot=textoDecimal(decimal(previo.depot)+decimal(row.depot));filaStock(previo);informe.agrupadas++;
  }else grupos.set(key,row);
 }
 const filas=[...grupos.values()].map((r,i)=>({...r,numero:i+1}));informe.incluidas=filas.length;
 return {filas,informe};
}
export async function consultarERP({sede,clienteId,userid,password,codigosCliente},{fetchImpl=fetch}={}){
 exigir(Object.hasOwn(BASE,sede)&&typeof userid==='string'&&userid&&typeof password==='string'&&password,'CONEXION_INVALIDA','Configuración ERP incompleta.');
 // Sin caché compartida: un token nunca pasa a otra credencial/sede/cliente.
 try{
  const token=leerTokenERP(await obtener(fetchImpl,BASE[sede]+'/gettoken',{userid,password},65536));
  const body=await obtener(fetchImpl,BASE[sede]+'/getstock',{token},24*1024*1024);
  const data=body.trim()?jsonExacto(body):[];
  const rows=Array.isArray(data)?data:data.Result??data.result??data.data;
  return normalizarStockERP(rows,{clienteId,codigosCliente});
 }catch(e){
  // Nunca propagar bodies, encabezados, tokens o mensajes de URL fetch.
  if(e.name==='ErrorConteo')throw e;
  exigir(false,'CONEXION_INVALIDA','No se pudo consultar el ERP. No se guardaron existencias.');
 }
}
/** Lectura interna del servidor para aplicar selección por SKU/posiciones.
 * Las filas de este resultado nunca se envían directamente al navegador. */
export async function leerStockERP({sede,userid,password},{fetchImpl=fetch}={}){
 exigir(Object.hasOwn(BASE,sede)&&typeof userid==='string'&&userid&&typeof password==='string'&&password&&!/[\r\n\x00]/.test(userid+password),'CONEXION_INVALIDA','Configuración ERP incompleta.');
 try{
  const token=leerTokenERP(await obtener(fetchImpl,BASE[sede]+'/gettoken',{userid,password},65536));
  const body=await obtener(fetchImpl,BASE[sede]+'/getstock',{token},24*1024*1024);
  const data=body.trim()?jsonExacto(body):[],rows=Array.isArray(data)?data:data?.Result??data?.result??data?.data;
  exigir(Array.isArray(rows)&&rows.length<=100000&&rows.every(r=>r&&typeof r==='object'&&!Array.isArray(r)),'CONEXION_INVALIDA','Formato de stock no verificado.');
  return rows;
 }catch{throw new ErrorConteo('CONEXION_INVALIDA','No se pudo consultar el stock ERP. No se guardaron existencias.');}
}
/** Diagnóstico de lectura: solo devuelve códigos de cliente y recuentos.
 * No aplica equivalencias de clientes, no crea stock ni exporta filas. */
export async function inspeccionarCodigosERP({sede,userid,password},{fetchImpl=fetch}={}){
 exigir(Object.hasOwn(BASE,sede)&&typeof userid==='string'&&userid&&typeof password==='string'&&password&&!/[\r\n\x00]/.test(userid+password),'CONEXION_INVALIDA','Configuración ERP incompleta.');
 let etapa='AUTENTICACION';const diagnostico={http:null};
 try{
  const token=leerTokenERP(await obtener(fetchImpl,BASE[sede]+'/gettoken',{userid,password},65536,diagnostico),diagnostico);
  etapa='LECTURA_STOCK';diagnostico.http=null;
  const body=await obtener(fetchImpl,BASE[sede]+'/getstock',{token},24*1024*1024,diagnostico);
  etapa='FORMATO_STOCK';
  const data=body.trim()?jsonExacto(body):[];
  const rows=Array.isArray(data)?data:data?.Result??data?.result??data?.data;
  exigir(Array.isArray(rows)&&rows.length<=100000,'CONEXION_INVALIDA','Formato de stock no verificado.');
  const codigos=new Map();let sinCodigo=0;
  for(const r of rows){
   exigir(r&&typeof r==='object'&&!Array.isArray(r),'CONEXION_INVALIDA','Formato de stock no verificado.');
   const valor=r['COD. CLIENTE'];
   exigir(valor==null||typeof valor==='string','CONEXION_INVALIDA','Código ERP no verificado.');
   const codigo=String(valor??'').trim().toUpperCase();
   if(!codigo){sinCodigo++;continue;}
   exigir(codigo.length<=255&&!/[\x00-\x1f\x7f]/.test(codigo),'CONEXION_INVALIDA','Código ERP no verificado.');
   codigos.set(codigo,(codigos.get(codigo)||0)+1);
   exigir(codigos.size<=1000,'CONEXION_INVALIDA','Demasiados códigos ERP para este diagnóstico.');
  }
  return {autenticacion_verificada:true,consulta_stock_verificada:true,diagnostico_autenticacion:diagnostico.autenticacion,filas_observadas:rows.length,filas_sin_codigo:sinCodigo,codigos_observados:[...codigos].sort(([a],[b])=>a.localeCompare(b)).map(([codigo,filas])=>({codigo,filas})),previsualizacion:resumirPrevisualizacionERP(rows)};
 }catch{
  const error=new ErrorConteo('CONEXION_INVALIDA','Consulta de códigos ERP no verificada. No se guardaron existencias ni respuestas privadas.');
  error.etapaERP=etapa;error.httpERP=Number.isInteger(diagnostico.http)&&diagnostico.http>=100&&diagnostico.http<=599?diagnostico.http:null;
  error.autenticacionERP=diagnostico.autenticacion??null;error.tipoContenidoERP=diagnostico.tipo_contenido??'SIN_TIPO';
  throw error;
 }
}
/** Solo agregados de las filas recibidas; no filtra por etiqueta ni publica líneas. */
export function diagnosticarCamposERP(rows,indices=rows.map((_,i)=>i+1)){
 exigir(indices.length===rows.length&&indices.every(n=>Number.isInteger(n)&&n>0&&n<=100000),'CONEXION_INVALIDA','Índices ERP incompatibles.');
 const grupos=new Map(),afectadas=new Set();
 const anotar=(fila,campo,motivo,longitud=null)=>{
  const key=campo+'|'+motivo;if(!grupos.has(key))grupos.set(key,{campo,motivo,filas:0,muestras_fila_respuesta:[]});
  const g=grupos.get(key);g.filas++;if(g.muestras_fila_respuesta.length<12)g.muestras_fila_respuesta.push(fila);if(longitud!==null)g.longitud_maxima_observada=Math.max(g.longitud_maxima_observada||0,longitud);afectadas.add(fila);
 };
 const limites={sku:255,descripcion:4000,serie:255,lote:255,despacho:255,partida:255,categoria:255,estadoMercancia:255,posicion:255,unidad:50};
 const nombres={sku:'COD. PRODUCTO',descripcion:'DESCRIPCION',serie:'NRO. SERIE',lote:'NRO. LOTE',despacho:'NRO. DESPACHO',partida:'NRO. PARTIDA',categoria:'CAT. LOG.',estadoMercancia:'EST. MERC.',posicion:'POSICION',unidad:'UNIDAD'};
 rows.forEach((r,i)=>{
  const fila=indices[i];
  try{cantidadERP(r.CANTIDAD);}catch(e){anotar(fila,'CANTIDAD',['CANTIDAD_ERP_INVALIDA','CANTIDAD_ERP_NEGATIVA','CANTIDAD_ERP_FUERA_PRECISION','CANTIDAD_ERP_NO_EXACTA'].includes(e.codigo)?e.codigo:'CANTIDAD_ERP_INVALIDA');}
  const f=camposFilaERP(r,'00000000-0000-0000-0000-000000000001','1');
  for(const [k,max] of Object.entries(limites)){
   const value=f[k].trim(),length=[...value].length;
   if(length>max)anotar(fila,nombres[k],'LONGITUD_SUPERA_ESQUEMA',length);
   if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))anotar(fila,nombres[k],'CARACTER_DE_CONTROL');
   if(k==='sku'&&!value)anotar(fila,nombres[k],'PRODUCTO_AUSENTE');
  }
 });
 return {filas_revisadas:rows.length,filas_con_incidencias:afectadas.size,incidencias:[...grupos.values()].sort((a,b)=>(a.campo+a.motivo).localeCompare(b.campo+b.motivo))};
}
export function resumirPrevisualizacionERP(rows){
 const porCodigo=new Map(),indicesCodigo=new Map();let sinCodigo=0;
 for(const [i,r] of rows.entries()){const codigo=String(r['COD. CLIENTE']??'').trim().toUpperCase();if(!codigo){sinCodigo++;continue;}if(!porCodigo.has(codigo)){porCodigo.set(codigo,[]);indicesCodigo.set(codigo,[]);}porCodigo.get(codigo).push(r);indicesCodigo.get(codigo).push(i+1);}
 let filas=0,unidades=0n,series=0,completo=sinCodigo===0;
 const codigos=[];
 for(const [codigo,grupo] of [...porCodigo].sort(([a],[b])=>a.localeCompare(b))){
  const sinSku=grupo.filter(r=>!String(r['COD. PRODUCTO']??'').trim()).length;
  const meta={codigo,filas_recibidas:grupo.length,filas_sin_sku:sinSku,totales_calculados:false,filas_previsualizadas:null,unidades_previsualizadas:null};
  try{
   exigir(sinSku===0,'CONEXION_INVALIDA','Stock incompleto para previsualización.');
   // UUID neutro únicamente para validar el formato; no asigna un cliente SQL.
   const normalizado=normalizarStockERP(grupo,{clienteId:'00000000-0000-0000-0000-000000000001',codigosCliente:[codigo]});
   let total=0n,conSerie=0;for(const f of normalizado.filas){total+=decimal(f.depot);if(f.serie)conSerie++;}
   Object.assign(meta,{totales_calculados:true,filas_previsualizadas:normalizado.filas.length,unidades_previsualizadas:textoDecimal(total),filas_con_serie:conSerie,series_duplicadas:normalizado.informe.seriesDuplicadas,filas_agrupadas:normalizado.informe.agrupadas,cantidades_serie_ajustadas:normalizado.informe.seriesAjustadas});
   filas+=normalizado.filas.length;unidades+=total;series+=conSerie;
  }catch{
   completo=false;meta.motivo='DATOS_REQUIEREN_REVISION_PARA_PREVISUALIZAR';meta.validacion=diagnosticarCamposERP(grupo,indicesCodigo.get(codigo));
   if(!meta.validacion.filas_con_incidencias)meta.validacion.incidencias.push({campo:'AGRUPACION',motivo:'REQUIERE_REVISION_DE_AGRUPACION',filas:0,muestras_fila_respuesta:[]});
  }
  codigos.push(meta);
 }
 return {alcance:'TODOS_LOS_CODIGOS_DEVUELTOS_SIN_FILTRO_SKU_NI_POSICION',totales_calculados:completo,filas_previsualizadas:completo?filas:null,unidades_previsualizadas:completo?textoDecimal(unidades):null,filas_con_serie:completo?series:null,filas_sin_codigo:sinCodigo,por_codigo:codigos};
}
