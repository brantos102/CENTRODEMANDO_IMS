import path from 'node:path';
import {records} from './importar-snapshot.mjs';
import {celdas,texto,decimalCelda,exigir,canon} from '../src/migracion/modelo.mjs';
import {cantidadExacta} from '../src/dominio/conteo.mjs';

export const REGLAS_CANTIDADES='historico-entregado-reglas-v3';
export const unidadesEscaladas=s=>BigInt(s.replace('.',''));
export function textoEscalado(n){const s=n.toString().padStart(10,'0');return s.slice(0,-9)+'.'+s.slice(-9);}
export function entradasCantidades(entradas){
  exigir(Array.isArray(entradas)&&entradas.length<=100,'Reglas de cantidades inválidas.');
  const codigos=new Set();
  return entradas.map(r=>{
    exigir(r&&Object.keys(r).length===2&&typeof r.codigo_operativo==='string'&&r.codigo_operativo.trim()===r.codigo_operativo&&r.codigo_operativo.length>0&&r.codigo_operativo.length<=255&&!codigos.has(r.codigo_operativo),'Código de regla vacío, duplicado o incompatible.');
    codigos.add(r.codigo_operativo);const total=cantidadExacta(r.total_conteo_1);
    exigir(total.endsWith('.000000000'),'El control autorizado debe ser entero.');
    return {codigo_operativo:r.codigo_operativo,total_conteo_1:total};
  }).sort((a,b)=>a.codigo_operativo<b.codigo_operativo?-1:a.codigo_operativo>b.codigo_operativo?1:0);
}
export function validarResueltas(reglas){
  exigir(Array.isArray(reglas)&&reglas.length>0,'Faltan reglas de cantidades.');
  const entradas=entradasCantidades(reglas.map(r=>({codigo_operativo:r.codigo_operativo,total_conteo_1:r.total_conteo_1}))),ids=new Set();
  for(const r of reglas){
    exigir(Object.keys(r).length===3&&/^[A-Za-z0-9_-]{20,256}$/.test(r.origen_drive||'')&&!ids.has(r.origen_drive)&&r.total_conteo_1===cantidadExacta(r.total_conteo_1),'Regla de origen incompatible.');ids.add(r.origen_drive);
  }
  exigir(entradas.length===reglas.length,'Reglas incompletas.');return reglas;
}
export const opcionesCantidad=(reglas,origen)=>reglas.some(r=>r.origen_drive===origen)?{milesComa:true,soloEnteros:true}:{};

// El código solo selecciona una propuesta. Se exige un único archivo físico,
// un único código en ese archivo y el total autorizado de TODAS sus filas V.
export async function resolverCantidades(corte,catalogo,solicitudes){
  const entradas=entradasCantidades(solicitudes);if(!entradas.length)return {reglas:[],controles:[]};
  const porCodigo=new Map(entradas.map(r=>[r.codigo_operativo,{fuentes:new Set(),suma:0n,filas:0,invalidas:0,textosMiles:0}])),codigosPorOrigen=new Map();
  const inv=corte.manifest.hojas.find(h=>h.nombre==='INVENTARIOS');
  for await(const {row} of records(path.join(corte.dir,inv.archivo))){
    if(row.fila===1||!row.celdas.some(c=>c.valor!==null&&c.valor!==''||c.formula))continue;
    const d=celdas(row),codigo=(texto(d.get(3))||'').trim();
    if(!codigosPorOrigen.has(row.origen_drive))codigosPorOrigen.set(row.origen_drive,new Set());codigosPorOrigen.get(row.origen_drive).add(codigo);
    const c=porCodigo.get(codigo);if(!c)continue;c.fuentes.add(row.origen_drive);c.filas++;
    try{const v=decimalCelda(d.get(22),{milesComa:true,soloEnteros:true});if(v!==null)c.suma+=unidadesEscaladas(v);}
    catch{c.invalidas++;}
    if(d.get(22)?.tipo!=='n'&&(texto(d.get(22))||'').includes(','))c.textosMiles++;
  }
  const reglas=[],controles=[];
  for(const e of entradas){
    const c=porCodigo.get(e.codigo_operativo);exigir(c.fuentes.size===1,'El código autorizado no identifica un único archivo físico.');
    const origen=[...c.fuentes][0],panel=catalogo.filter(r=>r.origen_drive===origen);
    exigir(panel.length===1&&codigosPorOrigen.get(origen).size===1,'Origen de cantidades ambiguo o con códigos mezclados.');
    exigir(!c.invalidas&&textoEscalado(c.suma)===e.total_conteo_1,'El total de CONTEO No. 1 no coincide con el control autorizado; no se crea plan.');
    reglas.push({...e,origen_drive:origen});
    controles.push({codigo_operativo:e.codigo_operativo,fila_panel:panel[0].fila_panel,filas:c.filas,textos_miles_en_conteo_1:c.textosMiles,
      total_conteo_1_esperado:e.total_conteo_1,total_conteo_1_calculado:textoEscalado(c.suma),coincide:true});
  }
  return {reglas,controles};
}
export async function comprobarCantidades(corte,catalogo,reglas){
  if(!reglas.length)return;
  validarResueltas(reglas);
  const r=await resolverCantidades(corte,catalogo,reglas.map(({codigo_operativo,total_conteo_1})=>({codigo_operativo,total_conteo_1})));
  exigir(canon(r.reglas)===canon(reglas),'La regla de cantidades no corresponde al origen del corte.');
}
