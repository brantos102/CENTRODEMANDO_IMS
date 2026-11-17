import {createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {lstat,realpath,readFile,open,link,unlink} from 'node:fs/promises';
import {hostname,userInfo} from 'node:os';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
export const CABECERA=Buffer.from('IMS-CATALOGOS-1\n');
export const SHA_ZIP='f5470be54fb2ed8778a51b09a1392f6c6c972dd022d4dfabab08c1e83cd3c70c';
export const SHA_LAYOUT='6cdf70fbe55e084ada0824d38deaf5c5b263b363d85bea2522ebd5594ce1d83b';
export function descifrarPaquete(cifrado,claveHex,shaEsperado=SHA_ZIP){
 if(!/^[a-fA-F0-9]{64}$/.test(claveHex||'')||!Buffer.isBuffer(cifrado)||cifrado.length<CABECERA.length+29||cifrado.length>20*1024*1024||!cifrado.subarray(0,CABECERA.length).equals(CABECERA))throw Error('PAQUETE_O_CLAVE_INVALIDOS');
 const clave=Buffer.from(claveHex,'hex');try{const i=CABECERA.length,d=createDecipheriv('aes-256-gcm',clave,cifrado.subarray(i,i+12));d.setAAD(CABECERA);d.setAuthTag(cifrado.subarray(i+12,i+28));const zip=Buffer.concat([d.update(cifrado.subarray(i+28)),d.final()]);if(createHash('sha256').update(zip).digest('hex')!==shaEsperado)throw Error('HUELLA_INCOMPATIBLE');return zip;}finally{clave.fill(0);}
}
/** Publica el ZIP por enlace atómico: nunca sustituye un archivo diferente. */
export async function guardarZipPrivado(entrada,zip,shaEsperado=SHA_ZIP,nombre='catalogos_ims_privados_20261116.zip'){
 if(!['catalogos_ims_privados_20261116.zip','layout_bm_privado_20261117.zip'].includes(nombre))throw Error('NOMBRE_INCOMPATIBLE');
 if(createHash('sha256').update(zip).digest('hex')!==shaEsperado)throw Error('HUELLA_INCOMPATIBLE');
 const s=await lstat(entrada);if(await realpath(entrada)!==entrada||!s.isDirectory()||s.isSymbolicLink()||s.uid!==userInfo().uid||(s.mode&0o777)!==0o700)throw Error('DIRECTORIO_PRIVADO_INCOMPATIBLE');
 const destino=join(entrada,nombre);
 const verificar=async()=>{const st=await lstat(destino);if(st.isSymbolicLink()||!st.isFile()||st.uid!==userInfo().uid||(st.mode&0o777)!==0o600||createHash('sha256').update(await readFile(destino)).digest('hex')!==shaEsperado)throw Error('ARCHIVO_PREVIO_DISTINTO_CONSERVADO');};
 try{await verificar();return {yaExistia:true};}catch(e){if(e.code!=='ENOENT')throw e;}
 const temporal=join(entrada,'.catalogos-recibiendo-'+randomBytes(16).toString('hex'));let creado=false;
 try{const f=await open(temporal,'wx',0o600);creado=true;try{await f.writeFile(zip);await f.sync();}finally{await f.close();}let yaExistia=false;try{await link(temporal,destino);}catch(e){if(e.code!=='EEXIST')throw e;yaExistia=true;}await verificar();return {yaExistia};}finally{if(creado)await unlink(temporal);}
}
async function main(){
 if(hostname()!=='apps'||userInfo().username!=='enicolalde'||process.cwd()!=='/home/enicolalde/bryan/centro_mando_ims')throw Error('SERVIDOR_INCOMPATIBLE');
 const revision=process.argv[2];if(!/^[a-f0-9]{40}$/.test(revision||''))throw Error('REVISION_INCOMPATIBLE');
 execFileSync('git',['merge-base','--is-ancestor',revision,'FETCH_HEAD'],{stdio:'pipe'});
 const clave=process.env.IMS_CATALOGOS_CLAVE?.trim();delete process.env.IMS_CATALOGOS_CLAVE;
 const tipo=process.argv[3]||'catalogos',paquetes={catalogos:{nombre:'catalogos_ims_privados_20261116.zip',sha:SHA_ZIP},layout:{nombre:'layout_bm_privado_20261117.zip',sha:SHA_LAYOUT}};
 if(!['catalogos','layout','todos'].includes(tipo))throw Error('PAQUETE_INCOMPATIBLE');
 for(const a of tipo==='todos'?Object.values(paquetes):[paquetes[tipo]]){const cifrado=execFileSync('git',['show',revision+':entregas/'+a.nombre+'.imsenc'],{maxBuffer:20*1024*1024});const zip=descifrarPaquete(cifrado,clave,a.sha),r=await guardarZipPrivado('/home/enicolalde/bryan/centro_mando_ims_datos/entrada',zip,a.sha,a.nombre);console.log(JSON.stringify({ok:true,paquete:a.nombre,zip_recibido:true,...r,sha256:a.sha,datos_importados:false,servicios_reiniciados:false}));}
}
if(process.argv[1]==='-'||(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href))try{await main();}catch{console.error('Recepción detenida: no se confirmó la clave, el paquete o la ruta privada. Se conservan los archivos existentes.');process.exitCode=1;}
