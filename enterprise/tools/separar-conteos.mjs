import path from 'node:path';
import {records} from './importar-snapshot.mjs';
import {celdas,texto,uuidEstable,exigir,canon} from '../src/migracion/modelo.mjs';

export const REGLAS_CONTEOS='historico-entregado-conteos-v4';
const comparar=(a,b)=>a.codigo_operativo<b.codigo_operativo?-1:a.codigo_operativo>b.codigo_operativo?1:0;
export function validarGrupos(grupos){
  exigir(Array.isArray(grupos)&&grupos.length>=2&&grupos.length<=100,'La separación requiere dos o más códigos.');
  const vistos=new Set();
  return grupos.map(g=>{
    exigir(g&&typeof g.codigo_operativo==='string'&&g.codigo_operativo.trim()===g.codigo_operativo&&g.codigo_operativo.length>0&&g.codigo_operativo.length<=255&&
      Number.isSafeInteger(g.filas)&&g.filas>0&&!vistos.has(g.codigo_operativo),'Código repetido, vacío o cantidad de líneas inválida.');
    vistos.add(g.codigo_operativo);return {codigo_operativo:g.codigo_operativo,filas:g.filas};
  }).sort(comparar);
}
export const idConteo=(origen,codigo)=>uuidEstable('inventario-conteo',[origen,codigo]);
export function validarSeparaciones(reglas){
  exigir(Array.isArray(reglas)&&reglas.length>0&&reglas.length<=100,'Faltan separaciones autorizadas.');
  const origenes=new Set();
  for(const r of reglas){
    exigir(r&&Object.keys(r).length===2&&/^[A-Za-z0-9_-]{20,256}$/.test(r.origen_drive||'')&&!origenes.has(r.origen_drive),'Origen de separación incompatible.');
    origenes.add(r.origen_drive);const grupos=validarGrupos(r.grupos);
    exigir(grupos.every((g,i)=>Object.keys(r.grupos[i]).length===3&&g.codigo_operativo===r.grupos[i].codigo_operativo&&g.filas===r.grupos[i].filas&&
      r.grupos[i].inventario_id===idConteo(r.origen_drive,g.codigo_operativo)),'Identidad de conteo incompatible.');
  }
  return reglas;
}
export async function resolverSeparaciones(corte,catalogo,solicitudes){
  exigir(Array.isArray(solicitudes)&&solicitudes.length<=100,'Solicitudes de separación inválidas.');
  if(!solicitudes.length)return {reglas:[],resumen:[]};
  const esperados=solicitudes.map(validarGrupos),porOrigen=new Map();
  const inv=corte.manifest.hojas.find(s=>s.nombre==='INVENTARIOS');
  for await(const {row} of records(path.join(corte.dir,inv.archivo))){
    if(row.fila===1||!row.celdas.some(c=>c.valor!==null&&c.valor!==''||c.formula))continue;
    const codigo=(texto(celdas(row).get(3))||'').trim();
    if(!porOrigen.has(row.origen_drive))porOrigen.set(row.origen_drive,new Map());
    const g=porOrigen.get(row.origen_drive);g.set(codigo,(g.get(codigo)||0)+1);
  }
  const reglas=[],resumen=[],vistos=new Set();
  for(const grupos of esperados){
    const candidatos=[...porOrigen].filter(([,datos])=>datos.size===grupos.length&&grupos.every(g=>datos.get(g.codigo_operativo)===g.filas));
    exigir(candidatos.length===1,'Los códigos y cantidades autorizados no identifican un único archivo físico completo.');
    const origen=candidatos[0][0],panel=catalogo.filter(r=>r.origen_drive===origen);
    exigir(panel.length===1&&!vistos.has(origen),'Origen de separación repetido o ambiguo en el panel.');vistos.add(origen);
    const conteos=grupos.map(g=>({...g,inventario_id:idConteo(origen,g.codigo_operativo)}));
    reglas.push({origen_drive:origen,grupos:conteos});
    resumen.push({fila_panel:panel[0].fila_panel,filas_totales:grupos.reduce((n,g)=>n+g.filas,0),conteos:grupos});
  }
  const orden=reglas.map((r,i)=>({r,s:resumen[i]})).sort((a,b)=>a.r.origen_drive<b.r.origen_drive?-1:a.r.origen_drive>b.r.origen_drive?1:0);
  return {reglas:orden.map(x=>x.r),resumen:orden.map(x=>x.s)};
}
export async function comprobarSeparaciones(corte,catalogo,reglas){
  if(!reglas.length)return;validarSeparaciones(reglas);
  const r=await resolverSeparaciones(corte,catalogo,reglas.map(r=>r.grupos));
  exigir(canon(r.reglas)===canon(reglas),'La separación no corresponde al origen y contenido del corte.');
}
export function proyeccionConteo(proyeccion,codigo,separaciones){
  const r=separaciones.find(s=>s.origen_drive===proyeccion.origen_drive);if(!r)return proyeccion;
  const g=r.grupos.find(g=>g.codigo_operativo===codigo);exigir(g,'Código ajeno a la separación autorizada.');
  return {...proyeccion,inventario_id:g.inventario_id};
}
export function conteosPreparados(catalogo,separaciones){
  return catalogo.filter(r=>r.preparado).flatMap(r=>{
    const s=separaciones.find(s=>s.origen_drive===r.origen_drive);if(!s)return [r];
    exigir(canon(r.conteos)===canon(s.grupos)&&s.grupos.reduce((n,g)=>n+g.filas,0)===r.filas,'Conteos del catálogo incompatibles con la separación.');
    return s.grupos.map(g=>({...r,codigo:g.codigo_operativo,inventario_id:g.inventario_id,filas:g.filas}));
  });
}
