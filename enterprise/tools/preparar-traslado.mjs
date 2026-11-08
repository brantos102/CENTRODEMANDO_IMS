import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readdir,readFile,lstat,writeFile,mkdir} from 'node:fs/promises';
import {validateSnapshot,hashFile} from './importar-snapshot.mjs';
import {validarPlan,destinoPrivado} from './planificar-operacion.mjs';
import {exigir} from '../src/migracion/modelo.mjs';

export async function verificarTraslado(corteDir,planDir,snapshotId,planId){
  exigir(/^[a-f0-9]{64}$/.test(snapshotId)&&/^[a-f0-9]{64}$/.test(planId),'Se requieren las identidades revisadas del corte y plan.');
  const corte=await validateSnapshot(corteDir),plan=await validarPlan(planDir);
  exigir(corte.manifest.snapshot_id===snapshotId&&plan.manifest.snapshot_id===snapshotId&&plan.manifest.plan_id===planId,'El corte o plan no son los revisados.');
  const inv=corte.manifest.hojas.find(h=>h.nombre==='INVENTARIOS'),reg=corte.manifest.hojas.find(h=>h.nombre==='REGISTRO');
  return {corte,plan,resumen:{snapshot_id:snapshotId,plan_id:planId,hojas:corte.manifest.hojas.length,
    filas_inventarios:inv.filas_datos_contrato,filas_registro:reg.filas_datos_contrato,...plan.manifest.resumen}};
}
export async function encontrarPlan(corteDir,planId){
  const padre=path.dirname(path.resolve(corteDir)),dirs=await readdir(padre,{withFileTypes:true});
  for(const d of dirs.filter(d=>d.isDirectory()&&!d.isSymbolicLink()&&/^VALIDACION_REGLAS_[0-9_]+$/.test(d.name)).sort((a,b)=>a.name<b.name?1:-1)){
    const p=path.join(padre,d.name,'plan');let stat;
    try{stat=await lstat(path.join(p,'manifest.json'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
    exigir(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<4*1024*1024,'Manifiesto candidato incompatible.');
    const m=JSON.parse(await readFile(path.join(p,'manifest.json'),'utf8'));
    if(m.plan_id===planId){await validarPlan(p);return p;}
  }
  throw Error('No se encontró el plan revisado bajo VALIDACION_REGLAS.');
}
export async function prepararLista({corteDir,planDir:planExplicito,salidaDir,snapshotId,planId,original,shaOriginal}){
  const planDir=planExplicito||await encontrarPlan(corteDir,planId),v=await verificarTraslado(corteDir,planDir,snapshotId,planId),archivos=[];
  async function agregar(nombre,file){
    const s=await lstat(file);exigir(s.isFile()&&!s.isSymbolicLink(),'La transferencia exige archivos regulares.');
    archivos.push({nombre,ruta_local:path.resolve(file),bytes:s.size,sha256:await hashFile(file)});
  }
  for(const n of ['manifest.json','fuente.xlsx','estilos.xml',...v.corte.manifest.hojas.map(h=>h.archivo)])await agregar('corte/'+n,path.join(v.corte.dir,n));
  for(const n of ['manifest.json','catalogo.jsonl','incidencias.jsonl','lineas_preparadas.jsonl'])await agregar('plan/'+n,path.join(v.plan.dir,n));
  if(original||shaOriginal){
    exigir(original&&/^[a-f0-9]{64}$/.test(shaOriginal||''),'Falta la identidad del Excel original de respaldo.');
    exigir(await hashFile(original)===shaOriginal,'El Excel original de respaldo es distinto del esperado.');
    await agregar('evidencia/fuente_original.xlsx',original);
  }
  const destino=await destinoPrivado(salidaDir);await mkdir(destino,{mode:0o700});
  const lista=path.join(destino,'lista_privada.json');
  await writeFile(lista,JSON.stringify({version:1,snapshot_id:snapshotId,plan_id:planId,archivos},null,2)+'\n',{flag:'wx',mode:0o600});
  return {ok:true,archivo_lista:lista,directorio_salida:destino,...v.resumen,original_evidencia_sha256:original?shaOriginal:null,
    fuentes_modificadas:false,base_de_datos_modificada:false};
}
async function main(){
  const [modo,corte,tercero,snapshotId,planId,original,shaOriginal,...rest]=process.argv.slice(2);
  exigir(corte&&tercero&&snapshotId&&planId&&!rest.length,'Faltan rutas o identidades del traslado.');
  if(modo==='--verificar'){exigir(!original&&!shaOriginal,'Argumentos de verificación incompatibles.');const v=await verificarTraslado(corte,tercero,snapshotId,planId);console.log(JSON.stringify({ok:true,...v.resumen,base_de_datos_modificada:false}));return;}
  exigir(modo==='--listar','Modo de traslado incompatible.');console.log(JSON.stringify(await prepararLista({corteDir:corte,salidaDir:tercero,snapshotId,planId,original,shaOriginal}),null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Preparación detenida: revisa rutas, identidades e integridad. No se muestran datos privados.');process.exitCode=1;});
