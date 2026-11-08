import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {validateSnapshot,records} from './importar-snapshot.mjs';
import {destinoPrivado} from './planificar-operacion.mjs';
import {celdas,texto,decimalCelda,INV,verificarCabecera,sha,exigir} from '../src/migracion/modelo.mjs';

export function clasificarCantidad(c){
  const v=(texto(c)||'').trim();
  if(!v&&!c?.formula)return 'VACIO';
  if(c?.tipo!=='n'&&v.includes(','))return /^\d{1,3}(?:,\d{3})+$/.test(v)?'TEXTO_COMA_GRUPOS_TRES':'TEXTO_COMA_OTRO_FORMATO';
  try{
    const n=decimalCelda(c);if(n===null)return 'VACIO';
    if(c?.tipo!=='n'&&/^\d{1,3}(?:\.\d{3})+$/.test(v))return 'TEXTO_PUNTO_GRUPOS_TRES';
    return n.endsWith('.000000000')?'ENTERO_VALIDO':'FRACCION_VALIDA';
  }catch(e){return e.message;}
}
const etiqueta=s=>/^\d{6}_[\p{L}\p{N}_. -]{1,80}$/u.test(s)?s:{id_no_estandar:sha(s).slice(0,12),longitud:s.length};
export async function auditarFormatos(corteDir){
  const corte=await validateSnapshot(corteDir),inv=corte.manifest.hojas.find(h=>h.nombre==='INVENTARIOS'),panel=corte.manifest.hojas.find(h=>h.nombre==='PANEL DE CONTROL');
  exigir(inv&&panel,'Faltan hojas de inventario y panel.');verificarCabecera(inv.encabezados,INV);
  const fuentes=new Map();
  for await(const {row} of records(path.join(corte.dir,panel.archivo))){
    if(row.fila===1)continue;const id=(texto(celdas(row).get(3))||'').trim();if(!fuentes.has(id))fuentes.set(id,[]);fuentes.get(id).push(row.fila);
  }
  const columnas={R:{},V:{},W:{},X:{}},casos=new Map();let filas=0;
  for await(const {row} of records(path.join(corte.dir,inv.archivo))){
    if(row.fila===1||!row.celdas.some(c=>c.valor!==null&&c.valor!==''||c.formula))continue;filas++;
    const d=celdas(row),codigo=(texto(d.get(3))||'').trim();
    for(const [n,col] of [[18,'R'],[22,'V'],[23,'W'],[24,'X']]){
      const formato=clasificarCantidad(d.get(n));columnas[col][formato]=(columnas[col][formato]||0)+1;
      if(['VACIO','ENTERO_VALIDO','FRACCION_VALIDA'].includes(formato))continue;
      const key=JSON.stringify([row.origen_drive,codigo,col,formato]);
      if(!casos.has(key))casos.set(key,{filas_panel:fuentes.get(row.origen_drive)||[],codigo:etiqueta(codigo),columna:col,formato,celdas:0,filas_muestra:[]});
      const c=casos.get(key);c.celdas++;if(c.filas_muestra.length<5)c.filas_muestra.push(row.fila);
    }
  }
  exigir(filas===inv.filas_datos_contrato,'El número de filas no coincide con el contrato.');
  return {ok:true,snapshot_id:corte.manifest.snapshot_id,filas_inventarios:filas,columnas_revisadas:columnas,casos:[...casos.values()],
    observaciones:['Una agrupación de tres dígitos es una pista de formato, no autorización para convertir una cantidad.',
      'Los números XLSX tipados se interpretan por su valor almacenado; las fracciones válidas no son errores.',
      'La auditoría incluye CONTEO FISICO (R), CONTEO No. 1 (V), CONTEO No. 2 (W) y CONTEO FINAL (X).',
      'Los valores originales no se muestran ni se modifican. Las muestras son filas del corte, no del archivo hijo vigente.'],
    contiene_valores_de_celdas:false,base_de_datos_modificada:false,fuentes_modificadas:false};
}
export async function guardarAuditoriaFormatos(corteDir,salidaDir){
  const informe=await auditarFormatos(corteDir),destino=await destinoPrivado(salidaDir);await mkdir(destino,{mode:0o700});
  const archivo=path.join(destino,'auditoria_formatos_para_compartir.json');await writeFile(archivo,JSON.stringify(informe,null,2)+'\n',{flag:'wx',mode:0o600});
  return {ok:true,snapshot_id:informe.snapshot_id,filas_inventarios:informe.filas_inventarios,archivo_auditoria:archivo,base_de_datos_modificada:false};
}
async function main(){const [corte,salida,...rest]=process.argv.slice(2);exigir(corte&&salida&&!rest.length,'Uso: node tools/auditar-formatos-conteo.mjs /corte /salida_nueva');console.log(JSON.stringify(await guardarAuditoriaFormatos(corte,salida),null,2));}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Auditoría detenida. Revisa integridad y destino privado.');process.exitCode=1;});
