import {ErrorConteo} from '../dominio/conteo.mjs';
const FASES=new Set(['RETORNO','ESTADO','CONFIGURACION','SESION','TOKEN','PERMISOS','IDENTIDAD','CALENDARIO','GUARDAR','SERVICIO']);
const PROVEEDORES=new Set(['invalid_client','unauthorized_client','invalid_grant','redirect_uri_mismatch','access_denied','invalid_scope','temporarily_unavailable','SERVICE_DISABLED','ACCESS_TOKEN_SCOPE_INSUFFICIENT','PERMISSION_DENIED','UNAUTHENTICATED','NOT_FOUND','accessNotConfigured','insufficientPermissions','forbidden']);
const C={
 ESTADO_INVALIDO:['El retorno no corresponde a una solicitud de autorización válida.','Inicia una autorización nueva desde Conexiones; no reutilices la URL del retorno.'],
 ESTADO_VENCIDO_O_USADO:['La solicitud venció o ya fue utilizada.','Inicia de nuevo desde Conexiones y completa el consentimiento en menos de diez minutos.'],
 SESION_VENCIDA:['La sesión que inició la autorización ya no está vigente.','Vuelve a iniciar sesión como administrador y autoriza de nuevo.'],
 ACCESO_NO_AUTORIZADO:['La cuenta del Centro ya no tiene el permiso requerido.','Utiliza una cuenta administradora y vuelve a iniciar la autorización.'],
 CLIENTE_RECHAZADO:['Google rechazó el cliente OAuth configurado.','Comprueba que el cliente sea de tipo Aplicación web y que su ID y secreto correspondan al mismo cliente; corrígelos en el formulario privado.'],
 REDIRECCION_DISTINTA:['La URI de retorno no coincide con la registrada en Google Cloud.','Copia la URI exacta que muestra Conexiones y regístrala en URI de redirección autorizadas, incluyendo HTTPS y puerto.'],
 CODIGO_RECHAZADO:['Google rechazó el código de autorización.','Inicia una autorización nueva; no recargues ni reutilices el retorno. Si persiste, revisa cliente y URI de retorno.'],
 CONSENTIMIENTO_DENEGADO:['Google no concedió la autorización solicitada.','Vuelve a autorizar y revisa los permisos y las políticas de la organización.'],
 API_DESHABILITADA:['La API de Google de esta etapa no está habilitada para el cliente.','Habilita la API de esta etapa en el mismo proyecto del cliente OAuth y vuelve a autorizar.'],
 GOOGLE_ACCESO_DENEGADO:['Google denegó el acceso al recurso de esta etapa.','Comprueba la API habilitada, los permisos concedidos, las políticas de Workspace y el acceso al calendario configurado.'],
 GOOGLE_RECURSO_NO_ENCONTRADO:['Google no encontró el calendario configurado o no permitió consultarlo.','Utiliza primary para el calendario de la cuenta elegida o revisa el ID y el acceso al calendario compartido.'],
 GOOGLE_RED_NO_DISPONIBLE:['El servidor no pudo completar la comunicación con Google.','Comprueba desde el servidor la salida HTTPS a Google y vuelve a autorizar.'],
 GOOGLE_CERTIFICADO_RECHAZADO:['El servidor no pudo verificar el certificado HTTPS de Google.','Revisa la cadena de certificados o el proxy HTTPS con TI; conserva la validación TLS habilitada.'],
 GOOGLE_TIEMPO_AGOTADO:['Google no respondió dentro del tiempo permitido.','Comprueba la conexión del servidor y vuelve a autorizar desde Conexiones.'],
 RESPUESTA_NO_VALIDA:['No se recibió una respuesta válida de Google.','Comprueba la salida HTTPS y el proxy del servidor; vuelve a iniciar la autorización.'],
 ACCESO_OFFLINE_AUSENTE:['Google no entregó un permiso renovable para trabajar en segundo plano.','Autoriza de nuevo con consentimiento. Si persiste, revisa el acceso de esta aplicación en tu cuenta Google.'],
 PERMISOS_INCOMPLETOS:['El token no contiene todos los permisos solicitados.','Autoriza los permisos faltantes indicados; la conexión anterior permanece activa.'],
 CUENTA_DISTINTA:['La cuenta confirmada por Google no coincide con la configurada.','Revisa la dirección principal de la cuenta, los alias y el correo del formulario; vuelve a autorizar con esa cuenta.'],
 IDENTIDAD_NO_CONFIRMADA:['Google no confirmó una dirección de correo verificada.','Comprueba la cuenta elegida y vuelve a autorizar el acceso a su identidad.'],
 CONFIGURACION_CAMBIO:['La configuración cambió mientras se autorizaba Google.','Inicia otra autorización con la configuración actual.'],
 CONFIGURACION_PENDIENTE:['Falta preparar la configuración privada del cliente OAuth.','Completa ID y secreto desde Conexiones y vuelve a autorizar.'],
 CONFIGURACION_PRIVADA_INVALIDA:['No se pudo leer la configuración privada de esta solicitud.','Comprueba el almacenamiento privado del servicio y vuelve a iniciar la autorización.'],
 GUARDADO_RECHAZADO:['No se pudo guardar la conexión autorizada.','Revisa la actualización y el perfil SQL del servicio; vuelve a Conexiones para comprobar su estado.'],
 GUARDADO_NO_CONFIRMADO:['No se pudo confirmar el resultado del guardado.','Comprueba primero el estado en Conexiones: el guardado podría haberse completado. No lo des por fallido ni repitas envíos.'],
 AUTORIZACION_NO_CONFIRMADA:['No se confirmó la autorización en esta etapa.','Comparte únicamente este diagnóstico para revisar el fallo; inicia el siguiente intento desde Conexiones.']
};
export const SERVICIOS_GOOGLE={
 'https://www.googleapis.com/auth/gmail.send':'Gmail',
 'https://www.googleapis.com/auth/calendar.events':'Calendar',
 'https://www.googleapis.com/auth/drive.file':'Drive',
 'https://www.googleapis.com/auth/spreadsheets.readonly':'Sheets',
 'https://www.googleapis.com/auth/script.projects.readonly':'Apps Script'
};
export function diagnosticoOAuth(error,etapa='RETORNO'){
 const previo=error?.diagnosticoGoogle||{},base={NO_AUTENTICADO:'SESION_VENCIDA',SIN_PERMISO:'ACCESO_NO_AUTORIZADO',NO_CONFIGURADO:'CONFIGURACION_PENDIENTE',VERSION_DESACTUALIZADA:'CONFIGURACION_CAMBIO',GUARDADO_RECHAZADO:'GUARDADO_RECHAZADO',CONFIRMACION_PENDIENTE:'GUARDADO_NO_CONFIRMADO'};
 const codigo=Object.hasOwn(C,previo.codigo)?previo.codigo:base[error?.codigo]||(etapa==='CONFIGURACION'?'CONFIGURACION_PRIVADA_INVALIDA':'AUTORIZACION_NO_CONFIRMADA'),fase=FASES.has(previo.etapa)?previo.etapa:FASES.has(etapa)?etapa:'RETORNO',out={formato:'ims-google-oauth-diagnostico-v1',etapa:fase,codigo,mensaje:C[codigo][0],accion:C[codigo][1]};
 if(PROVEEDORES.has(previo.proveedor))out.proveedor=previo.proveedor;if(Number.isInteger(previo.http)&&previo.http>=100&&previo.http<=599)out.http=previo.http;
 if(Array.isArray(previo.permisos_faltantes))out.permisos_faltantes=[...new Set(previo.permisos_faltantes.filter(s=>Object.values(SERVICIOS_GOOGLE).includes(s)))];
 if(fase==='CALENDARIO')out.api='Google Calendar API';return out;
}
export function falloOAuth(codigo,etapa,extra={},codigoDominio='CONEXION_RECHAZADA'){
 const error=new ErrorConteo(codigoDominio,C[codigo]?.[0]||C.AUTORIZACION_NO_CONFIRMADA[0]);error.diagnosticoGoogle={codigo,etapa,...extra};error.diagnosticoGoogle=diagnosticoOAuth(error,etapa);return error;
}
export function verificarOAuth(condicion,codigo,etapa,extra={},codigoDominio){if(!condicion)throw falloOAuth(codigo,etapa,extra,codigoDominio);}
export function errorRespuestaGoogle(body,http,etapa){
 const error=body?.error,razones=[typeof error==='string'?error:null,...(Array.isArray(error?.details)?error.details.map(d=>d?.reason):[]),...(Array.isArray(error?.errors)?error.errors.map(d=>d?.reason):[]),error?.status],proveedor=razones.find(s=>PROVEEDORES.has(s));let codigo='AUTORIZACION_NO_CONFIRMADA';
 if(['invalid_client','unauthorized_client'].includes(proveedor))codigo='CLIENTE_RECHAZADO';else if(proveedor==='invalid_grant')codigo='CODIGO_RECHAZADO';else if(proveedor==='redirect_uri_mismatch')codigo='REDIRECCION_DISTINTA';else if(proveedor==='access_denied')codigo='CONSENTIMIENTO_DENEGADO';else if(['SERVICE_DISABLED','accessNotConfigured'].includes(proveedor))codigo='API_DESHABILITADA';else if(proveedor==='invalid_scope'||proveedor==='ACCESS_TOKEN_SCOPE_INSUFFICIENT'||proveedor==='insufficientPermissions')codigo='PERMISOS_INCOMPLETOS';else if(http===404&&etapa==='CALENDARIO')codigo='GOOGLE_RECURSO_NO_ENCONTRADO';else if(http===403||http===401)codigo='GOOGLE_ACCESO_DENEGADO';
 return falloOAuth(codigo,etapa,{...(proveedor?{proveedor}:{}),http});
}
export function errorRedGoogle(error,etapa){const c=error?.cause?.code||error?.code;return falloOAuth(['TimeoutError','AbortError'].includes(error?.name)?'GOOGLE_TIEMPO_AGOTADO':['CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].includes(c)?'GOOGLE_CERTIFICADO_RECHAZADO':'GOOGLE_RED_NO_DISPONIBLE',etapa);}
const equivalentes={
 'https://www.googleapis.com/auth/gmail.send':['https://www.googleapis.com/auth/gmail.compose','https://www.googleapis.com/auth/gmail.modify','https://mail.google.com/'],
 'https://www.googleapis.com/auth/calendar.events':['https://www.googleapis.com/auth/calendar'],
 'https://www.googleapis.com/auth/drive.file':['https://www.googleapis.com/auth/drive'],
 'https://www.googleapis.com/auth/spreadsheets.readonly':['https://www.googleapis.com/auth/spreadsheets'],
 'https://www.googleapis.com/auth/script.projects.readonly':['https://www.googleapis.com/auth/script.projects']
};
export function permisosGoogleFaltantes(esperados,scope){const concedidos=new Set(typeof scope==='string'?scope.trim().split(/\s+/):[]);return esperados.filter(s=>s.startsWith('https:')).filter(s=>!concedidos.has(s)&&!(equivalentes[s]||[]).some(x=>concedidos.has(x))).map(s=>SERVICIOS_GOOGLE[s]).filter(Boolean);}
