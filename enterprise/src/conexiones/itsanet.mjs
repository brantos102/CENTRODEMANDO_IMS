// Conector de lectura. Los destinos y métodos son fijos: no acepta URLs del navegador.
import {exigirOperacion as exigir,filaStock} from '../dominio/operacion.mjs';
import {decimal,textoDecimal} from '../dominio/analisis-wms.mjs';
const BASE={UIO:'https://ec.itsanet.com/q_apidepot',GYE:'https://ec.itsanet.com/g_apidepot'};
export function jsonExacto(body){
 return JSON.parse(body,(_k,v,context)=>{
  if(typeof v!=='number')return v;
  exigir(typeof context?.source==='string','CONEXION_INVALIDA','El motor no admite números JSON exactos.');
  return context.source;
 });
}
async function obtener(fetchImpl,url,headers,limite){
 const response=await fetchImpl(url,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(20000)});
 exigir(response.ok,'CONEXION_INVALIDA',response.status===401?'Credencial ERP rechazada.':'El ERP no respondió correctamente.');
 const chunks=[];let size=0;
 for await(const b of response.body??[]){size+=b.length;if(size>limite){await response.body.cancel().catch(()=>{});exigir(false,'CONEXION_INVALIDA','Respuesta ERP demasiado grande.');}chunks.push(b);}
 return Buffer.concat(chunks).toString('utf8');
}
export function normalizarStockERP(rows,{clienteId,codigosCliente}){
 exigir(Array.isArray(rows)&&rows.length<=100000&&Array.isArray(codigosCliente)&&codigosCliente.length>0,'CONEXION_INVALIDA','Configura los códigos ERP autorizados para el cliente.');
 const codigos=new Set(codigosCliente.map(x=>String(x).trim().toUpperCase())),grupos=new Map();
 const informe={leidas:rows.length,incluidas:0,otroCliente:0,seriesDuplicadas:0,agrupadas:0,seriesAjustadas:0};
 for(const r of rows){
  const cli=String(r['COD. CLIENTE']??'').trim().toUpperCase();if(!codigos.has(cli)){informe.otroCliente++;continue;}
  const serie=String(r['NRO. SERIE']??'').trim(),conSerie=serie&&!['0','N/A'].includes(serie.toUpperCase());
  const cantidad=String(r.CANTIDAD??'');exigir(decimal(cantidad)!==null&&decimal(cantidad)>=0n,'CONEXION_INVALIDA','Stock ERP con cantidad inválida. No se omiten filas silenciosamente.');
  const row=filaStock({numero:1,clienteId,sku:String(r['COD. PRODUCTO']??'').trim().toUpperCase(),
   descripcion:String(r.DESCRIPCION??''),serie:conSerie?serie:'',lote:String(r['NRO. LOTE']??''),
   despacho:String(r['NRO. DESPACHO']??''),partida:String(r['NRO. PARTIDA']??''),
   categoria:String(r['CAT. LOG.']??''),estadoMercancia:String(r['EST. MERC.']??''),
   posicion:['NAVE','CALLE','COLUMNA','NIVEL'].map(k=>String(r[k]??'').trim()).filter(Boolean).join('-'),
   unidad:String(r.UNIDAD??''),depot:conSerie?'1':cantidad});
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
  const auth=jsonExacto(await obtener(fetchImpl,BASE[sede]+'/gettoken',{userid,password},65536));
  const token=auth.token??auth.Token??auth.Result??auth.result;
  exigir(typeof token==='string'&&token.length>0&&token.length<=8192,'CONEXION_INVALIDA','Respuesta de autenticación ERP inválida.');
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
