import {sumarDias} from './dominio.mjs';
const n=v=>Number.isSafeInteger(v)&&v>=0?v:0;
const parse=v=>{try{return typeof v==='string'?JSON.parse(v):v||{};}catch{return {};}};
const fecha=v=>v instanceof Date?v.toISOString():typeof v==='string'&&/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z?$/.test(v)?v.replace(' ','T').replace(/Z?$/,'Z'):null;
const id=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)?v:null;
/** Resumen para soporte: distingue revisión de incorporación y no incluye filas,
 * identificadores de archivos de Google, tokens ni configuración de conexiones. */
export function resumenIncorporacionGoogle(jobs,{hoy,sedes}){
 const lectura=jobs.find(j=>j.tipo==='GOOGLE_DELTA'),aplicada=jobs.find(j=>j.tipo==='GOOGLE_APLICAR'),r=parse(lectura?.resultado),a=parse(aplicada?.resultado),desde=sumarDias(hoy,-29),permitidos=g=>sedes.includes(g.sede);
 const grupos=(Array.isArray(r.grupos)?r.grupos:[]).filter(permitidos),incidencias=Array.isArray(r.incidencias)?r.incidencias:[],coincide=!!lectura&&aplicada?.estado==='COMPLETO'&&a.planId===lectura.id;
 const aplicados=coincide?new Set((a.gruposAplicados||[]).filter(permitidos).map(g=>g.grupoId)):new Set();
 const recientes=grupos.filter(g=>typeof g.fechaInicio==='string'&&g.fechaInicio>=desde&&g.fechaInicio<=hoy),sinAplicar=recientes.filter(g=>g.aplicable&&!aplicados.has(g.grupoId));
 return {formato:'ims-google-incorporacion-resumen-v1',consulta:hoy,
  revision:lectura?{tipo:'GOOGLE_DELTA',trabajoId:id(lectura.id),estado:lectura.estado,fecha:fecha(r.creadoEn??lectura.actualizado_en),archivosIntentados:n(r.archivosIntentados??r.archivosLeidos),archivosConfirmados:Number.isSafeInteger(r.archivosConfirmados)?r.archivosConfirmados:null,fuentesPendientesDeIniciar:incidencias.filter(i=>i.codigo==='GOOGLE_INVENTARIO_PENDIENTE').length,otrasIncidencias:incidencias.filter(i=>i.codigo!=='GOOGLE_INVENTARIO_PENDIENTE').length}:null,
  aplicacion:aplicada?{tipo:'GOOGLE_APLICAR',trabajoId:id(aplicada.id),estado:aplicada.estado,planId:id(a.planId),fecha:fecha(aplicada.actualizado_en),correspondeARevision:coincide,inventariosNuevos:n(a.inventariosNuevos),capturasAgregadas:n(a.capturasAgregadas),incidencias:Array.isArray(a.incidencias)?a.incidencias.length:0}:null,
  periodoReciente:{desde,hasta:hoy,novedadesPorAplicar:sinAplicar.map(g=>({codigo:String(g.codigo??'').slice(0,255),fechaInicio:g.fechaInicio,accion:g.accion==='CREAR'?'CREAR':'COMPLETAR_CAPTURAS',lineas:n(g.filas),capturas:n(g.capturasNuevas),conflictos:n(g.conflictos)})),gruposConConflictos:recientes.filter(g=>n(g.conflictos)>0).length},
  conflictosAnteriores:grupos.filter(g=>g.fechaInicio<desde).reduce((a,g)=>a+n(g.conflictos),0),
  nota:'GOOGLE_DELTA revisa; GOOGLE_APLICAR incorpora. Los archivos pendientes de iniciar y los conflictos anteriores se conservan para revisión separada.'};
}
