import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {records,validateSnapshot} from './importar-snapshot.mjs';
import {destinoPrivado} from './planificar-operacion.mjs';
import {generarHuellas} from './generar-huellas-inventarios.mjs';
import {celdas,texto,canon,sha,INV,verificarCabecera,exigir} from '../src/migracion/modelo.mjs';

export function valorFirma(c){
  if(!c||c.valor===null||c.valor==='')return '';
  if(c.tipo==='b'){exigir(['0','1'].includes(c.valor),'Booleano no interpretable para firma.');return c.valor==='1'?'true':'false';}
  if(c.tipo==='n'){const n=Number(c.valor);exigir(Number.isFinite(n),'Número no interpretable para firma.');return String(n);}
  return String(c.valor);
}
export function textoFilaFirma(row){
  const d=celdas(row),v=Array.from({length:30},(_,i)=>valorFirma(d.get(i+1)));
  while(v.length&&v.at(-1)==='')v.pop();return JSON.stringify(v);
}
export const firmaFilas=filas=>sha(filas.slice().sort().join('\n'));
const hayDatos=r=>r.fila>1&&r.celdas.some(c=>c.valor!==null&&c.valor!==''||c.formula);
const codigoArchivo=s=>/^\d{6}_[\p{L}\p{N}_. -]{1,80}$/u.test(s);
const claveGrupo=(id,cliente)=>JSON.stringify([id,cliente,'']);

export async function verificarFirmas(corteDir,snapshotEsperado,cambiosEsperados){
  exigir(/^[a-f0-9]{64}$/.test(snapshotEsperado)&&Number.isSafeInteger(cambiosEsperados)&&cambiosEsperados>0&&cambiosEsperados<=1000,'Se requiere corte y cantidad esperados.');
  const corte=await validateSnapshot(corteDir),m=corte.manifest;
  exigir(m.snapshot_id===snapshotEsperado,'El corte es diferente del previsto.');
  const panel=m.hojas.find(h=>h.nombre==='PANEL DE CONTROL'),inv=m.hojas.find(h=>h.nombre==='INVENTARIOS'),reg=m.hojas.find(h=>h.nombre==='__CONSOL_IDENTIDADES');
  exigir(panel&&inv&&reg,'Falta el registro independiente de firmas.');verificarCabecera(inv.encabezados,INV);
  const fuentes=new Map(),porNombre=new Map();
  for await(const {row} of records(path.join(corte.dir,panel.archivo))){
    if(row.fila===1)continue;const d=celdas(row),id=(texto(d.get(3))||'').trim(),nombre=(texto(d.get(2))||'').trim();if(!id)continue;
    exigir(!fuentes.has(id),'Archivo repetido en el panel; no se infiere su procedencia.');
    fuentes.set(id,{fila:row.fila,nombre});
    if(codigoArchivo(nombre)){if(!porNombre.has(nombre))porNombre.set(nombre,[]);porNombre.get(nombre).push(id);}
  }
  const propuestas=new Map(),codigosActuales=new Map();let sinDestinoUnico=0;
  for await(const {row} of records(path.join(corte.dir,inv.archivo))){
    if(!hayDatos(row))continue;const actual=fuentes.get(row.origen_drive);exigir(actual,'Fila sin archivo del panel.');
    const codigo=(texto(celdas(row).get(3))||'').trim();
    if(!codigosActuales.has(row.origen_drive))codigosActuales.set(row.origen_drive,new Set());
    if(codigo)codigosActuales.get(row.origen_drive).add(codigo);
    if(!codigo||codigo===actual.nombre)continue;
    const destinos=porNombre.get(codigo)||[];
    if(destinos.length!==1){sinDestinoUnico++;continue;}
    if(destinos[0]===row.origen_drive)continue;
    propuestas.set(row.fila,{antes:row.origen_drive,despues:destinos[0]});
  }
  const cambios=new Map([...propuestas].filter(([,c])=>codigosActuales.get(c.antes).size>1)),afectados=new Set();
  for(const c of cambios.values()){afectados.add(c.antes);afectados.add(c.despues);}
  exigir(cambios.size===cambiosEsperados,'La cantidad de propuestas es distinta de la esperada; no se crea receta.');
  const grupos=new Map([...afectados].map(id=>[id,new Map()]));
  for await(const {row} of records(path.join(corte.dir,inv.archivo))){
    if(!hayDatos(row))continue;const id=cambios.get(row.fila)?.despues||row.origen_drive;if(!afectados.has(id))continue;
    const d=celdas(row),k=claveGrupo(valorFirma(d.get(3)).trim(),valorFirma(d.get(5)).trim()),g=grupos.get(id);
    if(!g.has(k))g.set(k,[]);g.get(k).push(textoFilaFirma(row));
  }
  const esperados=new Map([...afectados].map(id=>[id,new Map()])),runs=new Set();
  for await(const {row} of records(path.join(corte.dir,reg.archivo))){
    if(row.fila===1)continue;const d=celdas(row);if(texto(d.get(5))!=='INV')continue;
    const run=texto(d.get(6));exigir(run,'Firma sin corrida.');runs.add(run);
    const id=texto(d.get(3));if(!afectados.has(id))continue;
    const key=JSON.parse(texto(d.get(1))),identity=JSON.parse(key[1]),hash=texto(d.get(2)),n=Number(texto(d.get(4)));
    exigir(key[0]==='INV'&&Array.isArray(identity)&&identity.length===3&&identity[2]===''&&/^[a-f0-9]{64}$/.test(hash)&&Number.isSafeInteger(n)&&n>0,'Firma de origen incompatible.');
    const k=JSON.stringify(identity),g=esperados.get(id);exigir(!g.has(k),'Firma duplicada para una identidad.');g.set(k,{hash,n});
  }
  exigir(runs.size===1,'El registro contiene más de una corrida.');
  const archivos=[];
  for(const id of afectados){
    const propuestos=grupos.get(id),originales=esperados.get(id);
    exigir(originales.size>0&&originales.size===propuestos.size,'Faltan firmas o sobran grupos en un archivo afectado.');
    const firmas=[];let filas=0;
    for(const [key,rows] of propuestos){
      const original=originales.get(key),calculada=firmaFilas(rows);
      exigir(original&&original.n===rows.length&&original.hash===calculada,'El contenido completo no coincide con la firma del consolidador; no se crea receta.');
      filas+=rows.length;firmas.push({identidad_sha256:sha(key),firma:calculada,filas:rows.length});
    }
    archivos.push({fila_panel:fuentes.get(id).fila,filas,grupos:firmas.length,firmas_coinciden:true,firmas});
  }
  archivos.sort((a,b)=>a.fila_panel-b.fila_panel);
  const bloques=[];
  for(const [f,c] of [...cambios].sort((a,b)=>a[0]-b[0])){
    const before=fuentes.get(c.antes).fila,after=fuentes.get(c.despues).fila,last=bloques.at(-1);
    if(last&&last[1]+1===f&&last[2]===before&&last[3]===after)last[1]=f;else bloques.push([f,f,before,after]);
  }
  return {corte,snapshot_id:m.snapshot_id,filas_esperadas:inv.filas_datos_contrato,cambios:cambios.size,bloques,archivos,
    corrida_sha256:sha([...runs][0]),filas_sin_destino_unico_conservadas:sinDestinoUnico};
}

export async function prepararRecetaFirmas({corteDir,salidaDir,snapshotEsperado,cambiosEsperados}){
  // No escribir una receta parcial: todos los archivos que dan/reciben filas
  // deben coincidir íntegros con la firma registrada antes de consolidar.
  const v=await verificarFirmas(corteDir,snapshotEsperado,cambiosEsperados),destino=await destinoPrivado(salidaDir);
  await mkdir(destino,{mode:0o700});
  const huellas=await generarHuellas(corteDir,path.join(destino,'huellas'));
  const evidencia={corrida_sha256:v.corrida_sha256,archivos:v.archivos};
  const receta={version:1,snapshot_id:v.snapshot_id,huellas_sha256:huellas.sha256_archivo,referencia_snapshot_id:v.snapshot_id,
    tipo_evidencia:'firmas_contenido_consolidador',firmas_evidencia_sha256:sha(canon(evidencia)),archivos_verificados:v.archivos,
    filas_esperadas:v.filas_esperadas,cambios_esperados:v.cambios,bloques:v.bloques};
  const archivo=path.join(destino,'receta_privada.json');await writeFile(archivo,JSON.stringify(receta,null,2)+'\n',{flag:'wx',mode:0o600});
  const resumen={ok:true,snapshot_id:v.snapshot_id,cambios_verificados:v.cambios,archivos_verificados:v.archivos,
    firmas_evidencia_sha256:receta.firmas_evidencia_sha256,filas_sin_destino_unico_conservadas:v.filas_sin_destino_unico_conservadas,
    archivo_receta:archivo,sha_receta:sha(canon(receta)),archivo_huellas:huellas.archivo_huellas,base_de_datos_modificada:false,fuentes_modificadas:false};
  await writeFile(path.join(destino,'verificacion_para_compartir.json'),JSON.stringify(resumen,null,2)+'\n',{flag:'wx',mode:0o600});return resumen;
}
async function main(){
  const [corteDir,salidaDir,snapshotEsperado,cambios,...rest]=process.argv.slice(2);
  exigir(corteDir&&salidaDir&&snapshotEsperado&&cambios&&!rest.length,'Uso: node tools/verificar-firmas-procedencia.mjs /corte /salida snapshot_sha cantidad');
  console.log(JSON.stringify(await prepararRecetaFirmas({corteDir,salidaDir,snapshotEsperado,cambiosEsperados:Number(cambios)}),null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{
  console.error('Verificación detenida: '+e.message);process.exitCode=1;
});
