#!/usr/bin/env node
import {open,lstat,realpath,mkdir,writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {prepararCredencialesERP} from '../src/migracion/credenciales-erp.mjs';
const BASE='/home/enicolalde/bryan/centro_mando_ims_datos';
async function privado(path,dir=false,base=BASE){
 path=resolve(path);const s=await lstat(path);
 if((path!==base&&!path.startsWith(base+'/'))||await realpath(path)!==path||s.uid!==process.getuid()||(s.mode&0o777)!==(dir?0o700:0o600)||!(dir?s.isDirectory():s.isFile()))throw Error('Ruta privada incompatible.');
 return path;
}
export async function revisarCopia(archivo,salida,{base=BASE}={}){
 base=resolve(base);await privado(base,true,base);
 const source=await privado(archivo,false,base);salida=resolve(salida);await privado(dirname(salida),true,base);
 if(!salida.startsWith(base+'/'))throw Error('Salida incompatible.');
 const handle=await open(source,constants.O_RDONLY|constants.O_NOFOLLOW);let raw;
 try{const info=await handle.stat();if(!info.isFile()||info.uid!==process.getuid()||(info.mode&0o777)!==0o600||info.size>2097152)throw Error('Archivo incompatible.');raw=await handle.readFile();const despues=await handle.stat();if(raw.length>2097152||despues.size!==info.size||despues.mtimeMs!==info.mtimeMs)throw Error('Archivo cambió durante su lectura.');}finally{await handle.close();}
 let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{throw Error('Formato privado inválido. No se importaron datos.');}
 const {registro,resumen}=prepararCredencialesERP(data);
 await mkdir(salida,{mode:0o700});
 await writeFile(join(salida,'registro_erp_NO_COMPARTIR.json'),JSON.stringify(registro,null,2)+'\n',{mode:0o600,flag:'wx'});
 await writeFile(join(salida,'origen_NO_COMPARTIR.json'),raw,{mode:0o600,flag:'wx'});
 const compartir={...resumen,sha256_origen:createHash('sha256').update(raw).digest('hex'),archivo_para_compartir:join(salida,'resumen_erp_para_compartir.json')};
 await writeFile(join(salida,'resumen_erp_para_compartir.json'),JSON.stringify(compartir,null,2)+'\n',{mode:0o600,flag:'wx'});
 return compartir;
}
async function main(){
 if(process.platform!=='linux'||process.argv.length!==6||process.argv[2]!=='--archivo'||process.argv[4]!=='--salida')throw Error('Uso privado del servidor.');
 console.log(JSON.stringify(await revisarCopia(process.argv[3],process.argv[5]),null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Revisión ERP detenida. Comprueba origen, formato y permisos privados. No se muestran ni importan credenciales; conserva los archivos originales.');process.exitCode=1;});
