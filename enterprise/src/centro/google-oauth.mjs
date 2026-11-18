import {diagnosticoOAuth,falloOAuth,verificarOAuth,errorRespuestaGoogle,errorRedGoogle,permisosGoogleFaltantes} from './google-diagnostico.mjs';
import {SCOPE_HOJAS} from './google-hojas.mjs';
import {SCOPE_DRIVE} from './drive-evidencias.mjs';
import {SCOPE_CODIGO} from './codigo-origen.mjs';
import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {transaccionOperativa} from '../mysql/operacion-nativa.mjs';
import {perfilCentro} from './servicio.mjs';
import {cifrar,descifrar,obtenerConector,enviarSMTP} from './conectores.mjs';
import {correoCanonico} from '../auth/credenciales.mjs';
import {exigir,hash,uuid} from './dominio.mjs';

export const SCOPES_GOOGLE=['openid','email','https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/calendar.events'];
const sha=s=>createHash('sha256').update(s).digest('hex');
const parse=x=>typeof x==='string'?JSON.parse(x):x;
const CALLBACK='/api/centro/google/callback';
export function callbackGoogle(publicUrl){const u=new URL(publicUrl);exigir(u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash);return u.origin+CALLBACK;}
export function parametrosGoogle(app,redirectUri,estado,verificador){return new URLSearchParams({client_id:app.clienteId,redirect_uri:redirectUri,response_type:'code',scope:[...SCOPES_GOOGLE,...(app.permitirDrive?[SCOPE_DRIVE]:[]),...(app.permitirHojas?[SCOPE_HOJAS]:[]),...(app.permitirScripts?[SCOPE_CODIGO]:[])].join(' '),state:estado,access_type:'offline',prompt:'consent select_account',login_hint:app.correo,code_challenge:createHash('sha256').update(verificador).digest('base64url'),code_challenge_method:'S256'});}
export async function iniciarGoogleOAuth(pool,p,k,publicUrl){
 return transaccionOperativa(pool,p,async c=>{
  const pf=await perfilCentro(c,p,true);exigir(pf.rol==='ADMIN'&&/^[a-f0-9]{64}$/.test(p.sesionHash||''),'SIN_PERMISO','Inicia sesión como administrador para autorizar Google.');
  const [[r]]=await c.execute("SELECT cifrado FROM ims_cm_conector WHERE tipo='GOOGLE_APP'");exigir(r,'NO_CONFIGURADO','Guarda primero el cliente OAuth y la cuenta que vas a conectar.');const app=descifrar(r.cifrado,k),id=randomUUID(),token=randomBytes(32).toString('base64url'),estado=id+'.'+token,verificador=randomBytes(32).toString('base64url'),redirectUri=callbackGoogle(publicUrl);
  await c.execute("INSERT INTO ims_cm_trabajo(id,actor_id,tipo,estado,parametros,resultado) VALUES (?,?,'GOOGLE_OAUTH','EJECUTANDO',?,'{}')",[id,p.actorId,JSON.stringify({estado:sha(estado),privado:cifrar({sesionHash:p.sesionHash,verificador,app,redirectUri},k)})]);
  return {url:'https://accounts.google.com/o/oauth2/v2/auth?'+parametrosGoogle(app,redirectUri,estado,verificador),correo:app.correo};
 });
}
async function jsonGoogle(fetchImpl,url,opciones={},etapa='SERVICIO'){
 let r;try{r=await fetchImpl(url,{...opciones,redirect:'error',signal:AbortSignal.timeout(20000)});}catch(e){throw errorRedGoogle(e,etapa);}
 let body;try{body=await r.json();}catch{throw falloOAuth('RESPUESTA_NO_VALIDA',etapa,{http:r.status});}
 if(!r.ok)throw errorRespuestaGoogle(body,r.status,etapa);return body;
}
export async function completarGoogleOAuth(pool,{estado,codigo,denegado=false},k,fetchImpl=fetch){
 let fase='ESTADO',id,p,validado=false,reclamado=false;
 try{
  verificarOAuth(typeof estado==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.[A-Za-z0-9_-]{43}$/.test(estado),'ESTADO_INVALIDO',fase,{},'SIN_PERMISO');id=uuid(estado.split('.')[0]);
  // creado_en es TIMESTAMP: se compara con la hora de la misma sesión SQL,
  // aunque la conexión que recibe el retorno tenga time_zone=-05:00.
  const [[job]]=await pool.execute("SELECT actor_id,parametros FROM ims_cm_trabajo WHERE id=? AND tipo='GOOGLE_OAUTH' AND estado='EJECUTANDO' AND creado_en>DATE_SUB(CURRENT_TIMESTAMP(6),INTERVAL 10 MINUTE)",[id]);verificarOAuth(job,'ESTADO_VENCIDO_O_USADO',fase,{},'SIN_PERMISO');const params=parse(job.parametros),digest=sha(estado);verificarOAuth(typeof params.estado==='string'&&params.estado.length===digest.length&&timingSafeEqual(Buffer.from(params.estado),Buffer.from(digest)),'ESTADO_INVALIDO',fase,{},'SIN_PERMISO');
  validado=true;fase='CONFIGURACION';const privado=descifrar(params.privado,k);p={actorId:job.actor_id,sesionHash:privado.sesionHash};
  fase='SESION';await transaccionOperativa(pool,p,async c=>{const pf=await perfilCentro(c,p,true);exigir(pf.rol==='ADMIN','SIN_PERMISO','La cuenta ya no tiene autorización administrativa.');const [claim]=await c.execute("UPDATE ims_cm_trabajo SET estado='CANCELADO',actualizado_en=CURRENT_TIMESTAMP(6) WHERE id=? AND estado='EJECUTANDO' AND creado_en>DATE_SUB(CURRENT_TIMESTAMP(6),INTERVAL 10 MINUTE)",[id]);verificarOAuth(claim.affectedRows===1,'ESTADO_VENCIDO_O_USADO','ESTADO',{},'SIN_PERMISO');});reclamado=true;
  fase='TOKEN';verificarOAuth(!denegado,'CONSENTIMIENTO_DENEGADO',fase);verificarOAuth(typeof codigo==='string'&&codigo.length>0&&codigo.length<=2048&&!/[\r\n\0]/.test(codigo),'ESTADO_INVALIDO',fase,{},'SOLICITUD_INVALIDA');
  const app=privado.app,t=await jsonGoogle(fetchImpl,'https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:app.clienteId,client_secret:app.clienteSecreto,redirect_uri:privado.redirectUri,code_verifier:privado.verificador,code:codigo})},fase);
  verificarOAuth(typeof t.access_token==='string'&&t.access_token.length>0&&t.access_token.length<=8192&&!/[\r\n\0]/.test(t.access_token),'RESPUESTA_NO_VALIDA',fase);verificarOAuth(typeof t.refresh_token==='string'&&t.refresh_token.length>0&&t.refresh_token.length<=8192,'ACCESO_OFFLINE_AUSENTE',fase);
  fase='PERMISOS';let scope=t.scope;if(typeof scope!=='string'||!scope.trim()){
   // OAuth permite omitir scope cuando coincide con lo solicitado. Se consulta
   // el permiso real de ese token; nunca se presume lo pedido ni se usa el
   // parámetro scope de la URL de retorno. La URL con el token no se registra.
   const info=await jsonGoogle(fetchImpl,'https://oauth2.googleapis.com/tokeninfo?'+new URLSearchParams({access_token:t.access_token}),{},fase);scope=info.scope;
   const audiencia=info.aud||info.audience||info.issued_to;verificarOAuth(!audiencia||audiencia===app.clienteId,'RESPUESTA_NO_VALIDA',fase);
  }
  const faltantes=permisosGoogleFaltantes([...SCOPES_GOOGLE,...(app.permitirDrive?[SCOPE_DRIVE]:[]),...(app.permitirHojas?[SCOPE_HOJAS]:[]),...(app.permitirScripts?[SCOPE_CODIGO]:[])],scope);verificarOAuth(!faltantes.length,'PERMISOS_INCOMPLETOS',fase,{permisos_faltantes:faltantes});
  fase='IDENTIDAD';const usuario=await jsonGoogle(fetchImpl,'https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+t.access_token}},fase);verificarOAuth(usuario.email_verified===true&&typeof usuario.email==='string','IDENTIDAD_NO_CONFIRMADA',fase);verificarOAuth(correoCanonico(usuario.email)===app.correo,'CUENTA_DISTINTA',fase);
  fase='CALENDARIO';await jsonGoogle(fetchImpl,'https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(app.calendario)+'/events?maxResults=1&fields=kind',{headers:{Authorization:'Bearer '+t.access_token}},fase);
  const configuracion={clienteId:app.clienteId,clienteSecreto:app.clienteSecreto,refreshToken:t.refresh_token,calendario:app.calendario,cuenta:app.correo,correo:true,scriptsLectura:app.permitirScripts===true,driveArchivos:app.permitirDrive===true,hojasLectura:app.permitirHojas===true,automaticos:app.automaticos,autorizadoEn:new Date().toISOString()};
  fase='GUARDAR';return await transaccionOperativa(pool,p,async c=>{const pf=await perfilCentro(c,p,true);exigir(pf.rol==='ADMIN','SIN_PERMISO','Permiso administrativo revocado.');const [[actual]]=await c.execute("SELECT cifrado FROM ims_cm_conector WHERE tipo='GOOGLE_APP'");exigir(actual&&hash(descifrar(actual.cifrado,k))===hash(app),'VERSION_DESACTUALIZADA','La configuración cambió durante la autorización; vuelve a conectar.');
   await c.execute("INSERT INTO ims_cm_conector(tipo,cifrado,actor_id) VALUES ('GOOGLE_CALENDAR',?,?) ON DUPLICATE KEY UPDATE cifrado=VALUES(cifrado),actor_id=VALUES(actor_id),actualizado_en=CURRENT_TIMESTAMP(6)",[cifrar(configuracion,k),p.actorId]);const result={autorizado:true,cuenta:app.correo,calendario:app.calendario};await c.execute("UPDATE ims_cm_trabajo SET estado='COMPLETO',resultado=?,actualizado_en=CURRENT_TIMESTAMP(6) WHERE id=? AND estado='CANCELADO'",[JSON.stringify(result),id]);await c.execute("INSERT INTO ims_cm_auditoria(actor_id,operacion_id,tipo,hash,resultado,antes,despues) VALUES (?,?,'google-autorizacion',?,?,'null','null')",[p.actorId,id,sha(id),JSON.stringify(result)]);return result;
  });
 }catch(e){const error=e instanceof Error?e:falloOAuth('AUTORIZACION_NO_CONFIRMADA',fase);error.diagnosticoGoogle=diagnosticoOAuth(error,fase);
  // Un estado alterado no modifica el intento legítimo. Un segundo retorno
  // tampoco escribe sobre el intento que ya está canjeando el primer código.
  if(validado&&p)try{await pool.execute("UPDATE ims_cm_trabajo SET estado='ERROR',resultado=?,actualizado_en=CURRENT_TIMESTAMP(6) WHERE id=? AND actor_id=? AND tipo='GOOGLE_OAUTH' AND estado=?",[JSON.stringify({autorizado:false,mensaje:error.diagnosticoGoogle.mensaje,diagnostico:error.diagnosticoGoogle}),id,p.actorId,reclamado?'CANCELADO':'EJECUTANDO']);}catch{/* No se sustituye el diagnóstico ni se registra información privada. */}
  throw error;
 }
}
export async function consultarDiagnosticoGoogle(pool,p){return transaccionOperativa(pool,p,async c=>{const pf=await perfilCentro(c,p);exigir(pf.rol==='ADMIN','SIN_PERMISO','El diagnóstico de Google requiere administración.');const [rows]=await c.execute("SELECT id,estado,creado_en,actualizado_en,resultado,TIMESTAMPDIFF(SECOND,creado_en,CURRENT_TIMESTAMP(6)) segundos FROM ims_cm_trabajo WHERE actor_id=? AND tipo='GOOGLE_OAUTH' ORDER BY creado_en DESC,id DESC LIMIT 5",[p.actorId]);return {formato:'ims-google-autorizaciones-resumen-v1',intentos:rows.map(r=>{let resultado={};try{resultado=parse(r.resultado);}catch{}const d=resultado.diagnostico;return {intentoId:r.id,estado:r.estado,antiguedadSegundos:Math.max(0,Number(r.segundos)||0),...(d?{diagnostico:diagnosticoOAuth({diagnosticoGoogle:d})}:r.estado==='EJECUTANDO'&&Number(r.segundos)>600?{diagnostico:diagnosticoOAuth(falloOAuth('ESTADO_VENCIDO_O_USADO','ESTADO'))}:r.estado==='ERROR'?{diagnostico:{codigo:'INTENTO_ANTERIOR_SIN_DETALLE',mensaje:'El intento anterior no guardó la etapa del fallo. Inicia otra autorización con la revisión actual.'}}:{})};})};});}
export function mimeGoogle(config,m){
 const remitente=correoCanonico(config.cuenta);exigir(Array.isArray(m.destinatarios)&&m.destinatarios.length>0&&m.destinatarios.length<=30);const destinatarios=m.destinatarios.map(correoCanonico);uuid(m.id);exigir(typeof m.asunto==='string'&&m.asunto.length<=1000&&typeof m.texto==='string'&&m.texto.length<=50000);
 // Cada palabra codificada respeta RFC 2047 sin partir caracteres UTF-8.
 const palabras=[];let palabra='';for(const ch of m.asunto.replace(/[\r\n]/g,' ')){if(Buffer.byteLength(palabra+ch)>42){palabras.push(palabra);palabra='';}palabra+=ch;}palabras.push(palabra);
 const asunto=palabras.map(p=>'=?UTF-8?B?'+Buffer.from(p).toString('base64')+'?=').join('\r\n ');
 const boundary='ims_'+m.id.replaceAll('-',''),b64=s=>Buffer.from(s).toString('base64').match(/.{1,76}/g)?.join('\r\n')||'',headers=['From: '+remitente,'To: '+destinatarios.join(',\r\n '),'Subject: '+asunto,'Message-ID: <'+m.id+'@centromando.itsanet>','MIME-Version: 1.0'];
 let contenido='';if(m.adjunto){exigir(m.adjunto.nombre==='inventarios.zip'&&typeof m.adjunto.base64==='string'&&m.adjunto.base64.length<=14*1024*1024);const adjunto=Buffer.from(m.adjunto.base64,'base64');exigir(adjunto.length<=10*1024*1024);headers.push('Content-Type: multipart/mixed; boundary="'+boundary+'"');contenido=['--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',b64(m.texto),'--'+boundary,'Content-Type: application/zip','Content-Disposition: attachment; filename="inventarios.zip"','Content-Transfer-Encoding: base64','',b64(adjunto),'--'+boundary+'--',''].join('\r\n');}
 else{headers.push('Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64');contenido=b64(m.texto);}return Buffer.from(headers.join('\r\n')+'\r\n\r\n'+contenido).toString('base64url');
}
export async function enviarGoogle(config,mensaje,fetchImpl=fetch){
 exigir(config.correo===true,'NO_CONFIGURADO','La cuenta Google todavía no tiene autorización de envío.');const t=await jsonGoogle(fetchImpl,'https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:config.clienteId,client_secret:config.clienteSecreto,refresh_token:config.refreshToken})});exigir(typeof t.access_token==='string','CONEXION_RECHAZADA','Google no confirmó la autorización de correo.');await jsonGoogle(fetchImpl,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:'Bearer '+t.access_token,'Content-Type':'application/json'},body:JSON.stringify({raw:mimeGoogle(config,mensaje)})});return {enviado:true,remitente:config.cuenta};
}
export async function cuentaCorreo(pool,k){const [[g]]=await pool.execute("SELECT cifrado FROM ims_cm_conector WHERE tipo='GOOGLE_CALENDAR'");if(g){const config=descifrar(g.cifrado,k);if(config.correo===true)return {tipo:'GOOGLE',config};}return {tipo:'SMTP',config:await obtenerConector(pool,'SMTP',k)};}
export async function enviarCorreoConfigurado(pool,k,mensaje){const c=await cuentaCorreo(pool,k);return c.tipo==='GOOGLE'?enviarGoogle(c.config,mensaje):enviarSMTP(c.config,mensaje);}
