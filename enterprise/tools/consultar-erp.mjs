#!/usr/bin/env node
// Lee una configuración privada del servidor; no recibe contraseñas por argumentos.
import {lstat,mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {consultarERP} from '../src/conexiones/itsanet.mjs';
const BASE='/home/enicolalde/bryan/centro_mando_ims_datos';
async function privada(path,directorio=false){
 path=resolve(path);const s=await lstat(path);
 if(!path.startsWith(BASE+'/')||await realpath(path)!==path||s.uid!==process.getuid()||(s.mode&0o777)!==(directorio?0o700:0o600)||!(directorio?s.isDirectory():s.isFile()))throw Error('Ruta o permisos privados incompatibles.');
 return path;
}
async function main(){
 if(process.platform!=='linux'||process.argv.length!==6||process.argv[2]!=='--config'||process.argv[4]!=='--salida')throw Error('Usa --config archivo.json --salida carpeta_nueva en el servidor.');
 const cfg=JSON.parse(await readFile(await privada(process.argv[3]),'utf8'));
 if(Object.keys(cfg).some(k=>!['sede','clienteId','userid','password','codigosCliente'].includes(k)))throw Error('Configuración incompatible.');
 const destino=resolve(process.argv[5]);await privada(dirname(destino),true);
 const r=await consultarERP(cfg);await mkdir(destino,{mode:0o700});
 const head=['cliente_id','sku','depot','descripcion','posicion','serie','lote','unidad','abc','despacho','partida','categoria','estado_mercancia'];
 const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 const rows=r.filas.map(f=>({...f,cliente_id:f.clienteId,estado_mercancia:f.estadoMercancia}));
 await writeFile(destino+'/stock.csv',head.join(',')+'\r\n'+rows.map(r=>head.map(k=>quote(r[k])).join(',')).join('\r\n')+'\r\n',{mode:0o600,flag:'wx'});
 await writeFile(destino+'/resumen.json',JSON.stringify({ok:true,...r.informe,datosModificados:false})+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({ok:true,...r.informe,carpetaPrivada:destino,datosImportados:false,credencialesPublicadas:false}));
}
main().catch(()=>{console.error('Consulta ERP detenida. Comprueba configuración privada, permisos y conexión; no se muestran credenciales ni respuestas del ERP.');process.exitCode=1;});
