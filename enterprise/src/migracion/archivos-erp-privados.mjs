import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,dirname} from 'node:path';
export const BASE_ERP_PRIVADA='/home/enicolalde/bryan/centro_mando_ims_datos';
export async function rutaERPPrivada(path,{base=BASE_ERP_PRIVADA,directorio=false}={}){
 base=resolve(base);path=resolve(path);const s=await lstat(path);
 if((path!==base&&!path.startsWith(base+'/'))||await realpath(path)!==path||s.uid!==process.getuid()||(s.mode&0o777)!==(directorio?0o700:0o600)||!(directorio?s.isDirectory():s.isFile()))throw Error('Ruta ERP privada incompatible.');
 return path;
}
export async function leerERPPrivado(path,{base=BASE_ERP_PRIVADA,maxBytes=2097152}={}){
 path=await rutaERPPrivada(path,{base});await rutaERPPrivada(dirname(path),{base,directorio:true});
 const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const s=await h.stat();
  if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o777)!==0o600||s.size>maxBytes)throw Error('Archivo ERP privado incompatible.');
  const raw=await h.readFile(),d=await h.stat();
  if(raw.length>maxBytes||d.size!==s.size||d.mtimeMs!==s.mtimeMs||d.ctimeMs!==s.ctimeMs)throw Error('Archivo ERP cambió durante la lectura.');
  return raw;
 }finally{await h.close();}
}
export function jsonERPPrivado(raw){
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
 catch{throw Error('JSON ERP privado incompatible. No se muestran valores.');}
}
