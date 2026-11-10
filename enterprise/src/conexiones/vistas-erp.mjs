import {createHash} from 'node:crypto';
import {ErrorAuth} from '../auth/credenciales.mjs';
import {leerStockERP,normalizarStockERP} from './itsanet.mjs';
import {decimal,textoDecimal} from '../dominio/analisis-wms.mjs';
import {metadatosConexionesERP} from './registro-runtime.mjs';
const exigir=(v,codigo='SOLICITUD_INVALIDA',mensaje='Selección ERP inválida.',status=400)=>{if(!v)throw new ErrorAuth(codigo,mensaje,status);};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const canon=v=>String(v??'').trim().toUpperCase();
function lista(v){
 exigir(Array.isArray(v)&&v.length<=500);const r=v.map(s=>{exigir(typeof s==='string'&&s.trim()&&[...s].length<=255&&!/[\x00-\x1f\x7f]/.test(s));return canon(s);});
 return [...new Set(r)].sort();
}
export function seleccionERP(s,conexiones){
 exigir(s&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).every(k=>['consultaId','sede','referencias','modo','skus','posiciones','incluirVariantes'].includes(k))&&UUID.test(s.consultaId)&&['UIO','GYE'].includes(s.sede));
 exigir(['SKU','POSICIONES'].includes(s.modo)&&typeof s.incluirVariantes==='boolean'&&Array.isArray(s.referencias)&&s.referencias.length<=64);
 const skus=lista(s.skus),posiciones=lista(s.posiciones);
 exigir(s.modo==='SKU'?posiciones.length===0:skus.length===0&&posiciones.length>0&&!s.incluirVariantes);
 const disponibles=conexiones.filter(c=>c.sede===s.sede),refs=s.referencias;
 exigir(refs.every(r=>typeof r==='string'&&/^[a-f0-9]{24}$/.test(r)&&disponibles.some(c=>c.referencia===r))&&new Set(refs).size===refs.length);
 // Por posiciones se recorren TODAS las cuentas habilitadas de la sede.
 const elegidas=s.modo==='POSICIONES'?disponibles:disponibles.filter(c=>refs.includes(c.referencia));
 exigir(elegidas.length>0);
 return {consultaId:s.consultaId,sede:s.sede,modo:s.modo,skus,posiciones,incluirVariantes:s.incluirVariantes,referencias:elegidas.map(c=>c.referencia).sort()};
}
export function filaSeleccionadaERP(r,s){
 if(s.modo==='SKU'){const sku=canon(r['COD. PRODUCTO']);return !s.skus.length||s.skus.some(k=>sku===k||s.incluirVariantes&&sku.startsWith(k));}
 const pos=['NAVE','CALLE','COLUMNA','NIVEL'].map(k=>String(r[k]??'').trim()).filter(Boolean).join('-');
 return s.posiciones.includes(canon(pos));
}
/** Caché temporal de consultas de solo lectura, ligada al actor y a su sede.
 * Una extracción a la vez; sin conexiones SQL retenidas durante peticiones ERP. */
export function crearGestorVistasERP({conexiones,fetchImpl=fetch,ahora=Date.now,ttlMs=600000,maxFilas=100000,maxBytes=16*1024*1024,presupuestoMs=240000}){
 const trabajos=new Map();let ejecutando=false;
 const limpiar=()=>{for(const [id,j] of trabajos)if(j.expira<=ahora())trabajos.delete(id);};
 const buscar=(actor,id)=>{exigir(UUID.test(id));limpiar();const j=trabajos.get(id);exigir(j&&j.actor===actor,'ERP_CONSULTA_VENCIDA','La consulta no está disponible. Extrae nuevamente el stock.',410);return j;};
 const estado=j=>({consultaId:j.id,sede:j.seleccion.sede,estado:j.estado,creadaEn:j.fecha,expiraEn:new Date(j.expira).toISOString(),progreso:{...j.progreso},...(j.error?{error:j.error}:{}),...(j.resultado?{totales:j.resultado.totales,cuentas:j.resultado.cuentas}:{}),soloPrevisualizacion:true});
 async function extraer(j,autorizar){
  const filas=[],cuentas=[];let unidades=0n,bytes=0;
  try{
   for(const ref of j.seleccion.referencias){
    exigir(ahora()-j.inicio<presupuestoMs,'ERP_NO_DISPONIBLE','La extracción excedió su presupuesto. Reduce las cuentas o los filtros.',503);
    await autorizar(j.seleccion.sede);
    const c=conexiones.find(c=>c.referencia===ref);j.progreso.cuentaActual=c.etiqueta;
    const raw=await leerStockERP(c,{fetchImpl});
    // Si la cuenta cambia de composición, no adivinar nuevos clientes.
    exigir(raw.every(r=>c.codigosCliente.includes(canon(r['COD. CLIENTE']))),'ERP_CUENTA_CAMBIO','Una cuenta devuelve códigos no asociados. Revisa la configuración de la cuenta.',409);
    let n=0,total=0n,seleccionadas=0;
    for(const codigo of c.codigosCliente){
     const origen=raw.filter(r=>canon(r['COD. CLIENTE'])===codigo&&filaSeleccionadaERP(r,j.seleccion));seleccionadas+=origen.length;
     const normalizado=normalizarStockERP(origen,{clienteId:c.clienteId??'00000000-0000-0000-0000-000000000001',codigosCliente:[codigo]});
     for(const r of normalizado.filas){
      const fila={...r,numero:filas.length+1,clienteId:c.clienteId,clienteNombre:c.clienteNombre,cuenta:c.etiqueta,referencia:c.referencia,codigoClienteERP:codigo};
      bytes+=Buffer.byteLength(JSON.stringify(fila));exigir(filas.length<maxFilas&&bytes<=maxBytes,'ERP_LIMITE_EXCEDIDO','La selección es demasiado grande. Filtra por SKU o posiciones.',413);
      filas.push(fila);n++;total+=decimal(r.depot);
     }
    }
    unidades+=total;cuentas.push({referencia:ref,etiqueta:c.etiqueta,clienteNombre:c.clienteNombre,codigosCliente:[...c.codigosCliente],filasRecibidas:raw.length,filasSeleccionadas:seleccionadas,lineas:n,unidades:textoDecimal(total)});
    j.progreso.completadas++;
   }
   await autorizar(j.seleccion.sede);
   j.resultado={filas,cuentas,totales:{lineas:filas.length,unidades:textoDecimal(unidades),cuentas:cuentas.length}};j.estado='LISTA';
  }catch(e){
   j.resultado=null;j.estado='ERROR';
   j.error={codigo:['ERP_LIMITE_EXCEDIDO','ERP_CUENTA_CAMBIO','SIN_PERMISO','NO_AUTENTICADO'].includes(e.codigo)?e.codigo:'ERP_NO_DISPONIBLE',mensaje:'No se pudo completar la extracción. No se crearon inventarios ni se publicaron resultados parciales.'};
  }finally{ejecutando=false;}
 }
 return {
  listar(sedes){return metadatosConexionesERP(conexiones.filter(c=>sedes.includes(c.sede)));},
  iniciar(actor,solicitud,autorizar){
   const seleccion=seleccionERP(solicitud,conexiones),digest=createHash('sha256').update(JSON.stringify(seleccion)).digest('hex');limpiar();
   const previa=trabajos.get(seleccion.consultaId);
   if(previa){exigir(previa.actor===actor&&previa.digest===digest,'OPERACION_REUTILIZADA','La consulta ya pertenece a otra selección.',409);return estado(previa);}
   exigir(!ejecutando,'ERP_OCUPADO','Hay una extracción ERP en curso. Intenta de nuevo al terminar.',429);
   while(trabajos.size>=2){const id=[...trabajos].find(([,j])=>j.estado!=='CONSULTANDO')?.[0];exigir(id,'ERP_OCUPADO','Hay una extracción ERP en curso.',429);trabajos.delete(id);}
   const j={id:seleccion.consultaId,actor,digest,seleccion,fecha:new Date(ahora()).toISOString(),inicio:ahora(),expira:ahora()+ttlMs,estado:'CONSULTANDO',progreso:{completadas:0,total:seleccion.referencias.length,cuentaActual:null},resultado:null,error:null};
   trabajos.set(j.id,j);ejecutando=true;
   void Promise.resolve().then(()=>extraer(j,autorizar));
   return estado(j);
  },
  sede(actor,id){return buscar(actor,id).seleccion.sede;},
  consultar(actor,id,desde=0){const j=buscar(actor,id);exigir(Number.isInteger(desde)&&desde>=0&&desde<=maxFilas);const r=estado(j);if(j.resultado){r.filas=j.resultado.filas.slice(desde,desde+50);r.siguiente=desde+50<j.resultado.filas.length?desde+50:null;}return r;}
 };
}
