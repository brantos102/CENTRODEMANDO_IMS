import {readFile,open,mkdir,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {unzipSync,zipSync,strToU8} from 'fflate';
import {prepararBase,leerFecha} from './funciones-m.mjs';

const TEXTO=new TextDecoder('utf-8',{fatal:true});
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const textoM=e=>Array.isArray(e)?e.join('\n'):e;
function exigir(ok,msg){if(!ok)throw Error(msg);}
export function leerJson(bytes){
  exigir(bytes?.length,'Falta un archivo JSON requerido.');
  const utf16=bytes[0]===255&&bytes[1]===254||bytes[1]===0;
  const s=utf16?new TextDecoder('utf-16le',{fatal:true}).decode(bytes):TEXTO.decode(bytes);
  return JSON.parse(s.replace(/^\uFEFF/,''));
}
function jsonUtf16(obj){return new Uint8Array(Buffer.from(JSON.stringify(obj),'utf16le'));}
export function abrirPlantilla(bytes){
  exigir(bytes.length<=64*1024*1024,'La plantilla supera 64 MiB.');let total=0;
  const files=unzipSync(bytes,{filter:f=>{
    exigir(f.originalSize<=128*1024*1024&&(total+=f.originalSize)<=256*1024*1024,'Plantilla descomprimida demasiado grande.');
    exigir(!f.name.startsWith('/')&&!f.name.includes('\\')&&!f.name.split('/').includes('..'),'Ruta interna no permitida.');return true;
  }});
  exigir(files.DataModelSchema&&files['Report/definition/pages/pages.json'],'Se necesita una plantilla PBIT con modelo y definición de informe.');
  return files;
}
function tabla(model,name){const ts=model.tables.filter(t=>t.name===name);exigir(ts.length===1,'Falta una tabla única: '+name);return ts[0];}
function particion(t){exigir(t.partitions?.length===1&&t.partitions[0].source?.type==='m','Partición M incompatible: '+t.name);return t.partitions[0];}
function webExp(t){
  const expr=particion(t).source.expression,s=textoM(expr);
  const urls=[...s.matchAll(/Web\.Contents\(\s*"([^"]+)"/g)].map(m=>m[1]);
  exigir(urls.length===1,'Se esperaba una conexión Web.Contents por tabla.');
  const u=new URL(urls[0]);
  exigir(u.protocol==='https:'&&u.hostname==='docs.google.com'&&u.pathname.endsWith('/pub')&&u.searchParams.get('output')==='csv','La conexión debe ser el CSV HTTPS publicado de Google Sheets.');
  return {expression:structuredClone(expr),url:urls[0]};
}
function nuevaExp(name,expression,resultType){return {name,kind:'m',expression,lineageTag:randomUUID(),...(resultType?{annotations:[{name:'PBI_ResultType',value:resultType}]}:{})};}
function reemplazarOrigen(t,origen,columnas){
  const p=particion(t),s=textoM(p.source.expression);
  const re=/Origen\s*=\s*LeerHoja\("(?:[^"\r\n]|"")*",\s*\{[^}]*\},\s*"[A-Za-z0-9+/=]+"\),/g;
  exigir([...s.matchAll(re)].length===1,'No se reconoce la fuente incrustada de '+t.name+'.');
  const lista='{'+columnas.map(x=>JSON.stringify(x)).join(', ')+'}';
  let resultado=s.replace(re,'Origen = PrepararBaseWeb('+origen+', '+lista+'),');
  const fecha=/FechasValidadas = Table\.TransformColumns\(NumerosValidados,[^\r\n]+\),/g;
  exigir([...resultado.matchAll(fecha)].length===1,'Transformación de fecha no reconocida en '+t.name+'.');
  resultado=resultado.replace(fecha,'FechasValidadas = Table.FromRecords(List.Transform(Table.ToRecords(NumerosValidados), (r) => Record.TransformFields(r, {{"Fecha", (v) => LeerFechaWeb(v, "'+(t.name==='Compras'?'BASE KPIS':'AHORROS')+'", r[FilaOrigen])}})), Table.ColumnNames(NumerosValidados), MissingField.Error),');
  p.source.expression=resultado.split('\n');
}
function comprobarReferencias(files,model){
  const tables=new Map(model.tables.map(t=>[t.name,t]));let refs=0;
  function visit(v){
    if(!v||typeof v!=='object')return;
    for(const kind of ['Column','Measure'])if(v[kind]?.Expression?.SourceRef?.Entity){
      const x=v[kind],t=tables.get(x.Expression.SourceRef.Entity);
      exigir(t,'Un visual referencia una tabla ausente.');
      const items=kind==='Column'?t.columns:t.measures;
      exigir(items?.some(x2=>x2.name===x.Property),'Campo ausente en un visual: '+t.name+'.'+x.Property);refs++;
    }
    for(const value of Object.values(v))visit(value);
  }
  for(const [name,bytes] of Object.entries(files))if(name.startsWith('Report/definition/')&&name.endsWith('.json'))visit(leerJson(bytes));
  for(const r of model.relationships||[])for(const end of ['from','to']){
    const t=tables.get(r[end+'Table']);exigir(t?.columns.some(c=>c.name===r[end+'Column']),'Relación con columna ausente.');
  }
  return refs;
}
export function construir(trabajado,final){
  const w=abrirPlantilla(trabajado),f=abrirPlantilla(final),ws=leerJson(w.DataModelSchema),fs=leerJson(f.DataModelSchema);
  exigir(ws.compatibilityLevel===fs.compatibilityLevel,'Versiones de modelo incompatibles.');
  const wm=ws.model,fm=fs.model;
  for(const name of ['Compras','Ahorros','DistribucionCiudad','Calendario'])tabla(wm,name);
  const comprasWeb=webExp(tabla(fm,'Consulta')),ahorrosWeb=webExp(tabla(fm,'Compras'));
  exigir(comprasWeb.url!==ahorrosWeb.url,'Las dos consultas apuntan al mismo CSV; revise sus hojas/gid.');
  const schema=structuredClone(fs),model=structuredClone(wm);schema.model=model;
  const leerNumero=model.expressions?.find(e=>e.name==='LeerNumero');exigir(leerNumero,'Falta el validador de importes del trabajado.');
  model.expressions=[leerNumero,
    nuevaExp('Origen_Consulta_Web',comprasWeb.expression,'Table'),nuevaExp('Origen_Cotizaciones_Web',ahorrosWeb.expression,'Table'),
    nuevaExp('PrepararBaseWeb',prepararBase),nuevaExp('LeerFechaWeb',leerFecha)];
  reemplazarOrigen(tabla(model,'Compras'),'Origen_Consulta_Web',['Fecha','Pais','Etiquetas de fila','Suma de importe','TIPO SERVICIO','FACTURAS','Quito','Guayaquil','F PAGO','Ciudad']);
  reemplazarOrigen(tabla(model,'Ahorros'),'Origen_Cotizaciones_Web',['FECHA','CATEGORIA','COTI 1','COTI 2','DIFERENCIA']);
  for(const a of model.annotations||[])if(a.name==='PBI_QueryOrder')a.value=JSON.stringify(['Compras','Ahorros','DistribucionCiudad','Calendario',...model.expressions.map(e=>e.name)]);
  const out={};
  // Se conserva el informe trabajado completo, incluido su tema y orden de páginas.
  for(const [n,b] of Object.entries(w))if(n.startsWith('Report/'))out[n]=b;
  out.DataModelSchema=jsonUtf16(schema);
  for(const n of ['Version','Settings','Metadata']){exigir(f[n],'Falta '+n+' en la plantilla final.');out[n]=f[n];}
  // No trasladar cambios pendientes con snapshots, diagramas obsoletos, el dataset
  // remoto anterior ni los vínculos de seguridad del archivo modificado.
  out['[Content_Types].xml']=strToU8('<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="" /><Override PartName="/Version" ContentType="" /><Override PartName="/DataModelSchema" ContentType="" /><Override PartName="/Settings" ContentType="application/json" /><Override PartName="/Metadata" ContentType="application/json" /></Types>');
  const referencia=comprobarReferencias(out,model),allM=[...model.expressions.map(e=>textoM(e.expression)),...model.tables.flatMap(t=>t.partitions||[]).filter(p=>p.source.type==='m').map(p=>textoM(p.source.expression))].join('\n');
  exigir(!/Binary\.FromText|DatosSnapshot|File\.Contents|pOrigen|pRutaExcel|pGoogleSheetsURL|LeerHoja\(/.test(allM),'Quedó una fuente antigua o una copia incrustada.');
  exigir((allM.match(/Web\.Contents\(/g)||[]).length===2,'La salida debe utilizar exactamente las dos conexiones web finales.');
  const pages=leerJson(out['Report/definition/pages/pages.json']).pageOrder;
  const resumen={version:1,fuentes:{trabajado_sha256:sha(trabajado),final_sha256:sha(final)},
    paginas:pages.map(p=>leerJson(out['Report/definition/pages/'+p+'/page.json']).displayName),
    visuales:Object.keys(out).filter(n=>n.endsWith('/visual.json')).length,
    medidas:model.tables.reduce((n,t)=>n+(t.measures?.length||0),0),referencias_visuales_verificadas:referencia,
    conexiones_web:2,consultas_origen_finales_conservadas:true,snapshot_incrustado:false,
    fechas_mensuales:'mmm-AA se interpreta como mes de 20AA, día 1; fechas completas conservan su día',
    validacion:'Estructura y referencias verificadas; apertura y actualización pendientes en Power BI Desktop'};
  return {bytes:zipSync(out,{level:6}),resumen,files:out};
}
export async function migrar({trabajado,final,salida}){
  const output=path.resolve(salida);exigir(path.extname(output).toLowerCase()==='.pbit','La salida debe terminar en .pbit.');
  exigir(output!==path.resolve(trabajado)&&output!==path.resolve(final),'La salida debe ser nueva; no sobrescribir los originales.');
  const [w,f]=await Promise.all([readFile(trabajado),readFile(final)]),r=construir(w,f);
  await mkdir(path.dirname(output),{recursive:true,mode:0o700});
  const handle=await open(output,'wx',0o600);let completa=false;
  try{await handle.writeFile(r.bytes);completa=true;}finally{await handle.close();if(!completa)await unlink(output);}
  return r.resumen;
}
async function main(){
  const args=process.argv.slice(2);exigir(args.length===3,'Uso: node migrar.mjs trabajado.pbit final.pbit salida_nueva.pbit');
  const r=await migrar({trabajado:args[0],final:args[1],salida:args[2]});console.log(JSON.stringify(r,null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('Migración detenida: '+e.message);process.exitCode=1;});
