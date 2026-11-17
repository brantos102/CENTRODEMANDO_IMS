import {createHash} from 'node:crypto';
import {leerEvidencia} from './evidencias.mjs';
import {obtenerConector} from './conectores.mjs';
import {exigir} from './dominio.mjs';
export const SCOPE_DRIVE='https://www.googleapis.com/auth/drive.file';
const ROOT='centro-ims-root-v1';
export async function clienteDrive(config,fetchImpl=fetch){
 exigir(config.driveArchivos===true,'NO_CONFIGURADO','Autoriza Google Drive en Centro de Mando → Conexiones. La foto ya está resguardada en el servidor.');
 const t=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:config.clienteId,client_secret:config.clienteSecreto,refresh_token:config.refreshToken}),signal:AbortSignal.timeout(15000),redirect:'error'});exigir(t.ok,'CONEXION_RECHAZADA','Google no autorizó el acceso a Drive.');const token=await t.json();exigir(typeof token.access_token==='string','CONEXION_RECHAZADA','No se confirmó la autorización de Drive.');
 return async(path,opts={})=>{exigir(/^\/(?:drive\/v3\/files|upload\/drive\/v3\/files)(?:[/?]|$)/.test(path));return fetchImpl('https://www.googleapis.com'+path,{...opts,headers:{Authorization:'Bearer '+token.access_token,...opts.headers},signal:AbortSignal.timeout(45000),redirect:'error'});};
}
/** IDs preasignados y persistidos antes de enviar: reintentar no duplica archivos. */
export async function asegurarObjetoDrive(pool,cuenta,request,{clave,nombre,padre,mime,contenido,sha256}){
 let [[obj]]=await pool.execute('SELECT drive_id,estado FROM ims_cm_drive_objeto WHERE cuenta=? AND clave=?',[cuenta,clave]);
 if(!obj){const r=await request('/drive/v3/files/generateIds?count=1&space=drive&type=files');exigir(r.ok,'CONEXION_RECHAZADA','Drive no confirmó un identificador de archivo.');const {ids}=await r.json();exigir(Array.isArray(ids)&&ids.length===1&&/^[A-Za-z0-9_-]{1,200}$/.test(ids[0]),'CONEXION_RECHAZADA','Drive devolvió un identificador no válido.');await pool.execute('INSERT IGNORE INTO ims_cm_drive_objeto(cuenta,clave,drive_id) VALUES (?,?,?)',[cuenta,clave,ids[0]]);[[obj]]=await pool.execute('SELECT drive_id,estado FROM ims_cm_drive_objeto WHERE cuenta=? AND clave=?',[cuenta,clave]);}
 const id=obj.drive_id,url='/drive/v3/files/'+encodeURIComponent(id)+'?fields=id,mimeType,trashed,parents,appProperties,md5Checksum';
 async function verificar(r){exigir(r.ok,'CONEXION_RECHAZADA','Drive no confirmó el archivo. Reintenta el mismo envío.');const d=await r.json();exigir(d.id===id&&!d.trashed&&d.mimeType===mime&&d.appProperties?.imsClave===clave&&(!sha256||d.appProperties?.imsSha256===sha256)&&(!contenido||d.md5Checksum===createHash('md5').update(contenido).digest('hex'))&&(!padre||d.parents?.includes(padre)),'CONEXION_RECHAZADA','El archivo remoto no coincide con la evidencia. Se conserva la copia privada.');}
 const previo=await request(url);if(previo.ok)await verificar(previo);else if(previo.status===404){const meta={id,name:nombre,mimeType:mime,appProperties:{imsClave:clave,...(sha256?{imsSha256:sha256}:{})},...(padre?{parents:[padre]}:{})};let r;if(contenido){const boundary='ims_evidencia_'+id,body=Buffer.concat([Buffer.from('--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+boundary+'\r\nContent-Type: '+mime+'\r\n\r\n'),contenido,Buffer.from('\r\n--'+boundary+'--\r\n')]);r=await request('/upload/drive/v3/files?uploadType=multipart',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});}else r=await request('/drive/v3/files',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(meta)});exigir(r.ok||r.status===409,'CONEXION_RECHAZADA','El envío a Drive no se confirmó. Reintenta; el identificador se conserva.');await verificar(await request(url));}else exigir(false,'CONEXION_RECHAZADA','No se pudo comprobar el archivo en Drive.');
 await pool.execute("UPDATE ims_cm_drive_objeto SET estado='SUBIDO' WHERE cuenta=? AND clave=? AND drive_id=?",[cuenta,clave,id]);return id;
}
export async function sincronizarEvidencia(pool,p,id,k,fetchImpl=fetch){
 const foto=await leerEvidencia(pool,p,id),config=await obtenerConector(pool,'GOOGLE_CALENDAR',k),request=await clienteDrive(config,fetchImpl),carpetas=[];let parent= foto.carpeta_id;
 for(let i=0;parent&&i<10;i++){const [[c]]=await pool.execute('SELECT id,padre_id,nombre FROM ims_cm_carpeta WHERE id=?',[parent]);exigir(c,'SOLICITUD_INVALIDA','Carpeta de evidencia no disponible.');carpetas.unshift(c);parent=c.padre_id;}exigir(!parent&&carpetas.length===4,'SOLICITUD_INVALIDA','Revisa la jerarquía sede / año / mes / cliente de la evidencia.');
 let remoto=await asegurarObjetoDrive(pool,config.cuenta,request,{clave:ROOT,nombre:'ITSANET IMS',mime:'application/vnd.google-apps.folder'});
 for(const c of carpetas)remoto=await asegurarObjetoDrive(pool,config.cuenta,request,{clave:'carpeta:'+c.id,nombre:c.nombre,padre:remoto,mime:'application/vnd.google-apps.folder'});
 await asegurarObjetoDrive(pool,config.cuenta,request,{clave:'evidencia:'+foto.id,nombre:'novedad-'+foto.id+(foto.mime==='image/png'?'.png':'.jpg'),padre:remoto,mime:foto.mime,contenido:foto.contenido,sha256:foto.sha256});return {id:foto.id,drive:'SUBIDO',cuenta:config.cuenta};
}
