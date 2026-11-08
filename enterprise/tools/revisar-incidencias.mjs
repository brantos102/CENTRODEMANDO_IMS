import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFile,mkdir} from 'node:fs/promises';
import {validateSnapshot,records} from './importar-snapshot.mjs';
import {validarPlan,destinoPrivado,politicaPlan} from './planificar-operacion.mjs';
import {opcionesCantidad} from './reglas-cantidades.mjs';
import {celdas,texto,decimalCelda,proyectarFila,sha,exigir} from '../src/migracion/modelo.mjs';

const normalizarId=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim().toUpperCase();
// Solo se muestran códigos con el formato operativo habitual. Otros textos se
// identifican por hash y fila, sin copiar su posible contenido administrativo.
const etiquetaId=s=>/^\d{6}_[\p{L}\p{N}_. -]{1,80}$/u.test(s)?s:{id_no_estandar:sha(s).slice(0,12),longitud:s.length};
const hayDatos=r=>r.fila>1&&r.celdas.some(c=>c.valor!==null&&c.valor!==''||c.formula);
const MUESTRAS=5,CODIGOS=3,TRAMOS=3;

function detallesFila(row,issues,opciones){
  const d=celdas(row),out=[];
  for(const [col,letra] of [[22,'V'],[23,'W'],[24,'X']]){
    try{decimalCelda(d.get(col),opciones);}catch(e){
      const v=texto(d.get(col))||'';
      out.push({motivo:e.message,columna:letra,longitud:v.length,contiene_coma:v.includes(','),contiene_punto:v.includes('.')});
    }
  }
  if(issues.includes('CAMPO_FUERA_LONGITUD')){
    for(const [col,letra,max,bytes] of [[3,'C',255,false],[5,'E',255,false],[7,'G',255,false],[8,'H',65535,true],
      [9,'I',255,false],[10,'J',255,false],[15,'O',255,false],[16,'P',50,false],[28,'AB',65535,true],[29,'AC',255,false]]){
      let v=texto(d.get(col));if(v===null)continue;
      if([3,5,7].includes(col))v=v.trim();
      const n=bytes?Buffer.byteLength(v):[...v].length;
      if(n>max)out.push({motivo:'CAMPO_FUERA_LONGITUD',columna:letra,longitud:n,maximo:max,unidad:bytes?'bytes':'caracteres'});
    }
  }
  for(const [motivo,columna] of [['CLIENTE_VACIO','E'],['CLIENTE_NO_CATALOGADO','E'],['SKU_VACIO','G'],['ID_OPERATIVO_VACIO','C']]){
    if(issues.includes(motivo))out.push({motivo,columna});
  }
  return out;
}

export async function revisarIncidencias(corteDir,planDir){
  const corte=await validateSnapshot(corteDir),plan=await validarPlan(planDir),m=plan.manifest;
  exigir(m.snapshot_id===corte.manifest.snapshot_id,'El plan pertenece a otro corte.');
  const catalogo=[];
  for await(const {row} of records(path.join(plan.dir,'catalogo.jsonl')))catalogo.push(row);
  const clientes=new Set(catalogo.map(r=>r.cliente_panel).filter(Boolean));
  const politica=politicaPlan(m),clientePanel=politica.clientePanel;
  const fuentes=new Map();
  for(const r of catalogo){
    if(!fuentes.has(r.origen_drive))fuentes.set(r.origen_drive,{panel:[],clientesPanel:[],codigos:new Map(),tramos:[],totalTramos:0,ultimo:null,filas:0});
    fuentes.get(r.origen_drive).panel.push(r.fila_panel);
    fuentes.get(r.origen_drive).clientesPanel.push(r.cliente_panel);
  }
  const motivos=Object.create(null);
  function motivo(nombre,origen,muestra){
    const b=motivos[nombre]??={archivos:new Set(),filas:0,porArchivo:new Map()};
    b.archivos.add(origen);b.filas++;
    if(!b.porArchivo.has(origen))b.porArchivo.set(origen,[]);
    const ejemplos=b.porArchivo.get(origen);
    if(ejemplos.length<MUESTRAS)ejemplos.push(muestra);
  }
  const inv=corte.manifest.hojas.find(h=>h.nombre==='INVENTARIOS');
  for await(const {row} of records(path.join(corte.dir,inv.archivo))){
    if(!hayDatos(row))continue;
    const s=fuentes.get(row.origen_drive);exigir(s,'Fila sin fuente catalogada.');s.filas++;
    const opciones=clientePanel?{clientePanel:s.panel.length===1?s.clientesPanel[0]:''}:{};
    opciones.cantidades=opcionesCantidad(politica.cantidades,row.origen_drive);
    const p=proyectarFila(row,m.snapshot_id,clientes,opciones);
    if(p.codigo){
      let c=s.codigos.get(p.codigo);
      if(!c){c={codigo:p.codigo,filas:0,primera_fila:row.fila,ultima_fila:row.fila};s.codigos.set(p.codigo,c);}
      c.filas++;c.ultima_fila=row.fila;
    }
    if(!s.ultimo||s.ultimo.codigo!==p.codigo||s.ultimo.hasta+1!==row.fila){
      s.ultimo={codigo:p.codigo,desde:row.fila,hasta:row.fila};s.totalTramos++;
      if(s.tramos.length<TRAMOS)s.tramos.push(s.ultimo);
    }else s.ultimo.hasta=row.fila;
    const detalles=detallesFila(row,p.issues,opciones.cantidades);
    for(const issue of p.issues){
      motivo(issue,row.origen_drive,{filas_panel:s.panel,fila_inventarios:row.fila,
        ...(p.codigo?{codigo:etiquetaId(p.codigo)}:{}),
        celdas:detalles.filter(x=>x.motivo===issue).map(({motivo,...d})=>d)});
    }
  }
  const mezcla={archivos:0,equivalentes_al_normalizar_formato:0,codigos_distintos_aun_normalizados:0,ejemplos:[]},separacionesAutorizadas=[];
  for(const [origen,s] of fuentes)if(s.codigos.size>1){
    const autorizada=politica.separaciones.find(r=>r.origen_drive===origen);
    if(autorizada){
      exigir(autorizada.grupos.length===s.codigos.size&&autorizada.grupos.every(g=>s.codigos.get(g.codigo_operativo)?.filas===g.filas),'La separación no coincide con las filas del corte.');
      separacionesAutorizadas.push({filas_panel:s.panel,filas_inventarios:s.filas,conteos:autorizada.grupos.map(g=>({codigo:etiquetaId(g.codigo_operativo),filas:g.filas}))});continue;
    }
    mezcla.archivos++;
    const equivalentes=new Set([...s.codigos.keys()].map(normalizarId)).size===1;
    if(equivalentes)mezcla.equivalentes_al_normalizar_formato++;else mezcla.codigos_distintos_aun_normalizados++;
    if(mezcla.ejemplos.length<MUESTRAS)mezcla.ejemplos.push({filas_panel:s.panel,filas_inventarios:s.filas,
      codigos_distintos:s.codigos.size,equivalentes_al_normalizar:equivalentes,
      codigos:[...s.codigos.values()].slice(0,CODIGOS).map(({codigo,...rest})=>({codigo:etiquetaId(codigo),...rest})),
      tramos_totales:s.totalTramos,tramos_muestra:s.tramos.map(({codigo,...rest})=>({...rest,codigo:codigo?etiquetaId(codigo):'(vacio)'}))});
  }
  exigir(catalogo.length===m.resumen.inventarios_panel,'El catálogo y su resumen no coinciden.');
  const detalle={};
  for(const [nombre,b] of Object.entries(motivos)){
    const grupos=[...b.porArchivo.values()],ejemplos=[];
    // Primero una fila por archivo; después las adicionales hasta el límite.
    for(let i=0;i<MUESTRAS&&ejemplos.length<MUESTRAS;i++){
      for(const g of grupos){if(g[i])ejemplos.push(g[i]);if(ejemplos.length===MUESTRAS)break;}
    }
    detalle[nombre]={archivos:b.archivos.size,filas:b.filas,ejemplos};
  }
  return {ok:true,reglas:m.reglas,snapshot_id:m.snapshot_id,plan_id:m.plan_id,filas_inventarios:inv.filas_datos_contrato,
    inventarios_preparados:m.resumen.inventarios_preparados,inventarios_revision:m.resumen.inventarios_revision,
    ...(politica.separaciones.length?{conteos_preparados:m.resumen.conteos_preparados,separaciones_autorizadas:separacionesAutorizadas}:{}),
    mezcla_codigos:mezcla,incidencias_de_filas:detalle,
    revision_sin_lineas:catalogo.filter(r=>!r.preparado&&!r.filas).map(r=>({fila_panel:r.fila_panel,motivos:r.motivos})),
    limitacion_muestras:{archivos_mezclados:MUESTRAS,codigos_por_ejemplo:CODIGOS,tramos_por_ejemplo:TRAMOS,ejemplos_por_motivo:MUESTRAS},
    observaciones:['La equivalencia de formato solo se diagnostica; no autoriza fusionar ni corregir códigos.',
      'Las filas indicadas pertenecen al consolidado del corte, no necesariamente a la planilla hija ni a la hoja vigente.',
      'Los motivos pueden solaparse en un mismo archivo. No se suman para contar inventarios.'],
    base_de_datos_modificada:false,fuentes_modificadas:false};
}

export async function guardarRevision(corte,plan,salida){
  const informe=await revisarIncidencias(corte,plan),destino=await destinoPrivado(salida);
  await mkdir(destino,{mode:0o700});
  const archivo=path.join(destino,'revision_para_compartir.json');
  await writeFile(archivo,JSON.stringify(informe,null,2)+'\n',{flag:'wx',mode:0o600});return {informe,archivo};
}
async function main(){
  const [corte,plan,salida,...rest]=process.argv.slice(2);
  exigir(corte&&plan&&salida&&!rest.length,'Uso: node tools/revisar-incidencias.mjs /corte /plan /carpeta_nueva');
  const {informe:r,archivo}=await guardarRevision(corte,plan,salida);
  console.log(JSON.stringify({ok:true,snapshot_id:r.snapshot_id,archivos_con_ids_mezclados:r.mezcla_codigos.archivos,
    equivalentes_al_normalizar_formato:r.mezcla_codigos.equivalentes_al_normalizar_formato,
    codigos_distintos_aun_normalizados:r.mezcla_codigos.codigos_distintos_aun_normalizados,
    archivo_revision:archivo,base_de_datos_modificada:false},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{
  console.error('Revisión detenida: verifica las rutas, integridad del corte/plan y que la carpeta de salida sea nueva y privada.');process.exitCode=1;
});
