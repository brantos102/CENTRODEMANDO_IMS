import {ErrorConteo} from '../dominio/conteo.mjs';
const FASES=new Set(['CONTROLADOR','CONEXION','PERMISOS','CONSULTA','RESPUESTA','CONFIGURACION','GUARDAR']);
const CODIGOS={
 SQL_CONTROLADOR_NO_DISPONIBLE:['No se pudo cargar el controlador de SQL Server.','Revisa la instalación de esta revisión en el servidor IMS.'],
 SQL_RED_NO_DISPONIBLE:['El servidor IMS no pudo establecer la conexión TCP con SQL Server.','Comprueba desde el servidor IMS la ruta y el puerto TCP real de DEPOTWMS. Una conexión desde tu PC puede usar otra ruta o puerto.'],
 SQL_TIEMPO_AGOTADO:['SQL Server no completó esta etapa dentro del tiempo permitido.','Comprueba la conectividad desde el servidor IMS y el puerto real; si falla en CONSULTA, revisa la duración de la vista con TI.'],
 SQL_AUTENTICACION_RECHAZADA:['SQL Server rechazó el inicio de sesión.','Comprueba en el formulario privado el usuario y contraseña de autenticación SQL Server, el puerto y la base. No compartas la contraseña.'],
 SQL_BASE_NO_DISPONIBLE:['La base solicitada no está disponible para esta cuenta.','Comprueba el nombre de base y su acceso en DEPOTWMS; vacío utiliza la base predeterminada del usuario.'],
 SQL_TLS_NO_CONFIRMADO:['No se pudo confirmar la conexión cifrada con SQL Server.','Revisa el certificado y la compatibilidad TLS desde el servidor IMS con TI. La casilla de certificado interno no corrige problemas de red o de credenciales.'],
 SQL_PERMISOS_INSUFICIENTES:['La cuenta no tiene permiso para leer los objetos requeridos.','Confirma SELECT sobre POSICION y view_web_estado_posicion en la base y esquema correctos.'],
 SQL_OBJETO_NO_DISPONIBLE:['No se encontraron los objetos de ocupación en la base o esquema de esta cuenta.','Comprueba la base, el esquema predeterminado y el acceso a POSICION y view_web_estado_posicion.'],
 CUENTA_SQL_NO_LECTORA:['La cuenta no cumple el perfil de solo lectura para ocupación.','Usa una cuenta con SELECT sobre POSICION y la vista, sin sysadmin, db_owner ni permisos INSERT, UPDATE o DELETE sobre POSICION.'],
 INSTANCIA_SQL_NO_CONFIRMADA:['La conexión respondió, pero no corresponde a la instancia DEPOTWMS.','Consulta el puerto TCP real en la conexión que sí funciona y configúralo aquí; escribir 1433 no selecciona automáticamente una instancia con nombre.'],
 OCUPACION_INCOMPLETA:['La respuesta de ocupación está vacía, incompleta o fuera del límite permitido.','Revisa las columnas y la consulta fija de ocupación; el corte anterior se conserva.'],
 OCUPACION_SIN_CONFIGURAR:['Todavía no hay una conexión privada de ocupación guardada.','Completa el formulario y pulsa Guardar conexión privada antes de consultar.'],
 SQL_GUARDADO_NO_CONFIRMADO:['No se confirmó el guardado del corte de ocupación en IMS.','Comprueba el estado de ocupación y la instalación del servicio antes de reintentar.'],
 CONEXION_OCUPACION_NO_CONFIRMADA:['No se confirmó la consulta de ocupación SQL Server.','Comparte este diagnóstico de etapa y código. No compartas credenciales ni mensajes internos del controlador.']
};
const DRIVERS=new Set(['ESOCKET','ETIMEOUT','ELOGIN','EINSTLOOKUP','ECONNREFUSED','EHOSTUNREACH','ENETUNREACH','ENOTFOUND','ECONNRESET','EREQUEST','ECONNCLOSED','ENOTOPEN','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','ERR_SSL_WRONG_VERSION_NUMBER','ERR_SSL_UNSUPPORTED_PROTOCOL','ERR_SSL_NO_SUITABLE_SIGNATURE_ALGORITHM']);
const NUMEROS=new Set([18456,18452,4060,916,229,230,208,207]);
export function diagnosticoOcupacion(error,etapa='CONEXION'){
 const p=error?.diagnosticoOcupacion||{},codigo=Object.hasOwn(CODIGOS,p.codigo)?p.codigo:Object.hasOwn(CODIGOS,error?.codigo)?error.codigo:'CONEXION_OCUPACION_NO_CONFIRMADA',fase=FASES.has(p.etapa)?p.etapa:FASES.has(etapa)?etapa:'CONEXION';
 return {formato:'ims-ocupacion-sql-diagnostico-v1',etapa:fase,codigo,mensaje:CODIGOS[codigo][0],accion:CODIGOS[codigo][1],...(DRIVERS.has(p.controlador)?{controlador:p.controlador}:{}),...(NUMEROS.has(p.numero_sql)?{numero_sql:p.numero_sql}:{})};
}
export function errorOcupacion(error,etapa){
 if(error?.name==='ErrorConteo'&&['SIN_PERMISO','NO_AUTENTICADO','ACTUALIZACION_EN_CURSO'].includes(error.codigo))return error;
 const causas=[error,error?.cause,error?.originalError,error?.originalError?.cause,error?.originalError?.info],codigos=causas.map(x=>x?.code).filter(x=>DRIVERS.has(x)),numero=causas.map(x=>x?.number).find(x=>NUMEROS.has(x));
 let codigo=Object.hasOwn(CODIGOS,error?.codigo)?error.codigo:error?.codigo==='NO_CONFIGURADO'?'OCUPACION_SIN_CONFIGURAR':etapa==='CONTROLADOR'?'SQL_CONTROLADOR_NO_DISPONIBLE':etapa==='GUARDAR'?'SQL_GUARDADO_NO_CONFIRMADO':'CONEXION_OCUPACION_NO_CONFIRMADA';
 const tls=codigos.find(x=>/CERT|SSL|SIGNATURE/.test(x));
 if(tls)codigo='SQL_TLS_NO_CONFIRMADO';else if([4060,916].includes(numero))codigo='SQL_BASE_NO_DISPONIBLE';else if(codigos.includes('ELOGIN')||[18456,18452].includes(numero))codigo='SQL_AUTENTICACION_RECHAZADA';else if([229,230].includes(numero))codigo='SQL_PERMISOS_INSUFICIENTES';else if([208,207].includes(numero))codigo='SQL_OBJETO_NO_DISPONIBLE';else if(codigos.includes('ETIMEOUT'))codigo='SQL_TIEMPO_AGOTADO';else if(codigos.some(c=>['ESOCKET','EINSTLOOKUP','ECONNREFUSED','EHOSTUNREACH','ENETUNREACH','ENOTFOUND','ECONNRESET','ECONNCLOSED','ENOTOPEN'].includes(c)))codigo='SQL_RED_NO_DISPONIBLE';
 const e=new ErrorConteo(codigo,CODIGOS[codigo][0]);e.diagnosticoOcupacion=diagnosticoOcupacion({codigo,diagnosticoOcupacion:{codigo,etapa,controlador:tls||codigos[0],numero_sql:numero}},etapa);return e;
}
