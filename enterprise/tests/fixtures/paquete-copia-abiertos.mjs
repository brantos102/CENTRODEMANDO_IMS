import {mkdtemp,writeFile,chmod,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const sha=v=>createHash('sha256').update(v).digest('hex');
export async function paqueteCopia(t,{productos=3,auxiliares=1}={}){
 const dir=await mkdtemp(path.join(os.tmpdir(),'ims-copia-abiertos-'));await chmod(dir,0o700);t?.after(()=>rm(dir,{recursive:true,force:true}));
 const corte=randomUUID(),padre=randomUUID(),zip=path.join(dir,'fuente.zip');await writeFile(zip,'ZIP_SINTETICO_NO_ES_UNA_FUENTE_REAL',{mode:0o600});
 const filas=[];for(let i=0;i<productos;i++){
  const ambito=i===2?'FUERA_SELECCION_CONSERVADO':'SELECCION_ACTUAL',origen={corte_id:i===2?padre:corte,origen_drive:'ARCHIVO_FISICO_SINTETICO_00001',hoja_id:1,fila:i+2,zona_horaria:'America/Guayaquil'};
  const referencia=sha(JSON.stringify([ambito,origen.corte_id,origen.origen_drive,origen.hoja_id,origen.fila]));
  filas.push({referencia_copia:referencia,ambito,origen,estado_captura:i===0?'REVISION':'COMPLETO',sku_propuesto:'00001',codigo_operativo_original:i===1?null:'121126_SINTETICO',clientes_panel_referencia:['CLIENTE_SINTETICO'],cantidades:{c1:{estado:i===1?'VACIO':'EXACTA',valor_decimal:i===1?null:'0.000000000'},depot:{estado:'EXACTA',valor_decimal:'9007199254740993.123456789'}},observaciones_preparacion:i===1?['CODIGO_OPERATIVO_NO_DEFINIDO']:[],fila_original:{fila:origen.fila,celdas:[{columna:7,tipo:'s',valor:'00001',nota:'NOTA_PRIVADA_ñ_😀_"\\n'},{columna:22,tipo:i===1?'z':'n',valor:i===1?null:'0'}]},aprobado_para_importar:false});
 }
 const notas=Array.from({length:auxiliares},(_,i)=>({ambito:'SELECCION_ACTUAL',origen:{corte_id:corte,origen_drive:'ARCHIVO_FISICO_SINTETICO_00001',hoja_id:1,fila:productos+i+2},fila_original:{fila:productos+i+2,celdas:[{columna:28,tipo:'s',valor:'SOLO_NOTA_NO_ES_EXISTENCIA'}]}}));
 const ficheros={'lineas_candidatas_NO_IMPORTAR.jsonl':filas.map(r=>JSON.stringify(r)+'\n').join(''),'filas_auxiliares_NO_IMPORTAR.jsonl':notas.map(r=>JSON.stringify(r)+'\n').join(''),'esquemas_NO_COMPARTIR.json':JSON.stringify([{clase:'USUARIOS',cabecera_original:null,columnas:9,filas_copiadas:0}])};
 for(const [n,raw] of Object.entries(ficheros))await writeFile(path.join(dir,n),raw,{mode:0o600});
 const manifest={formato:'ims-abiertos-preparacion-privada-v1',corte_id:corte,archivo_zip:zip,sha256_zip:sha(await readFile(zip)),archivos_sha256:Object.fromEntries(Object.entries(ficheros).map(([n,v])=>[n,sha(v)])),aprobado_para_importar:false};
 const raw=JSON.stringify(manifest,null,2)+'\n';await writeFile(path.join(dir,'preparacion_NO_IMPORTAR.json'),raw,{mode:0o600});
 return {dir,corte,manifest,filas,notas,copiaId:sha(raw),ficheros};
}
