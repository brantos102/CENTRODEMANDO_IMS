import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {mkdir,unlink,rmdir} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGzip} from 'node:zlib';
import {validateSnapshot,records,hashFile} from './importar-snapshot.mjs';
import {destinoPrivado} from './planificar-operacion.mjs';
import {canon,sha,celdas,texto,exigir} from '../src/migracion/modelo.mjs';

export function huellaFila(row){
  const d=celdas(row);
  // Se compara el contenido de las 30 columnas. La posición, estilo, fórmula
  // y nota no forman parte de esta huella de valores entre cortes.
  const valores=Array.from({length:30},(_,i)=>texto(d.get(i+1))??'');
  return {f:row.fila,h:sha(canon(valores)),o:sha(row.origen_drive),c:sha(valores[2].trim())};
}
export async function generarHuellas(corteDir,salidaDir){
  const corte=await validateSnapshot(corteDir),m=corte.manifest;
  const panel=m.hojas.find(h=>h.nombre==='PANEL DE CONTROL'),inv=m.hojas.find(h=>h.nombre==='INVENTARIOS');
  exigir(panel&&inv,'Faltan las hojas necesarias.');
  const origenes=[];
  for await(const {row} of records(path.join(corte.dir,panel.archivo))){
    if(row.fila===1)continue;const d=celdas(row),id=(texto(d.get(3))||'').trim(),nombre=(texto(d.get(2))||'').trim();
    if(!id)continue;
    origenes.push({fila_panel:row.fila,origen_sha256:sha(id),
      ...(/^\d{6}_[\p{L}\p{N}_. -]{1,80}$/u.test(nombre)?{codigo_nombre_sha256:sha(nombre)}:{})});
  }
  const destino=await destinoPrivado(salidaDir);await mkdir(destino,{mode:0o700});
  const archivo=path.join(destino,'huellas_inventarios.jsonl.gz');let filas=0;
  async function* contenido(){
    const control=createHash('sha256');
    const cabecera={tipo:'cabecera',version:1,algoritmo:'sha256-array30-valores-v1',snapshot_id:m.snapshot_id,
      filas:inv.filas_datos_contrato,origenes};
    let line=JSON.stringify(cabecera)+'\n';control.update(line);yield line;
    for await(const {row} of records(path.join(corte.dir,inv.archivo))){
      if(row.fila===1||!row.celdas.some(c=>c.valor!==null&&c.valor!==''||c.formula))continue;
      line=JSON.stringify(huellaFila(row))+'\n';control.update(line);yield line;filas++;
    }
    exigir(filas===inv.filas_datos_contrato,'El número de huellas no coincide con el corte.');
    yield JSON.stringify({tipo:'fin',filas,sha256_contenido:control.digest('hex')})+'\n';
  }
  try{
    await pipeline(Readable.from(contenido()),createGzip({level:6}),createWriteStream(archivo,{flags:'wx',mode:0o600}));
    return {ok:true,snapshot_id:m.snapshot_id,filas,archivo_huellas:archivo,sha256_archivo:await hashFile(archivo),
      contiene_valores_de_celdas:false,base_de_datos_modificada:false,fuentes_modificadas:false};
  }catch(e){await unlink(archivo).catch(()=>{});await rmdir(destino).catch(()=>{});throw e;}
}
async function main(){
  const [corte,salida,...rest]=process.argv.slice(2);
  exigir(corte&&salida&&!rest.length,'Uso: node tools/generar-huellas-inventarios.mjs /corte /carpeta_nueva');
  console.log(JSON.stringify(await generarHuellas(corte,salida),null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{
  console.error('Generación detenida: verifica la integridad del corte y una carpeta de salida nueva y privada.');process.exitCode=1;
});
