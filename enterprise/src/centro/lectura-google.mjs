import {ErrorConteo} from '../dominio/conteo.mjs';
const dormir=ms=>new Promise(r=>setTimeout(r,ms));
const transitorios=new Set([429,500,502,503,504]);

/** Una cola compartida por el proceso evita ráfagas de lecturas de Sheets.
 * Nunca adquiere un bloqueo SQL ni vuelve a ejecutar una escritura. */
export function crearRitmoLecturaGoogle({ahora=Date.now,esperar=dormir}={}){
 let cola=Promise.resolve(),siguiente=0;
 return async()=>{
  let liberar;const turno=new Promise(r=>liberar=r),anterior=cola;cola=turno;
  await anterior;
  try{const demora=Math.max(0,siguiente-ahora());if(demora)await esperar(demora);siguiente=ahora()+1100;}
  finally{liberar();}
 };
}
const ritmoCompartido=crearRitmoLecturaGoogle();

/** Retry-After se respeta si cabe en el presupuesto. No se recorta para volver
 * a consultar antes de lo que indicó Google. */
export function esperaReintentoGoogle(respuesta,intento,ahora=Date.now()){
 const h=respuesta.headers?.get('retry-after');
 if(h&&/^\d+$/.test(h))return Number(h)*1000;
 if(h){const fecha=Date.parse(h);if(Number.isFinite(fecha))return Math.max(0,fecha-ahora);}
 return respuesta.status===429?[15000,30000,60000][intento]:[1000,2000,4000][intento];
}
export async function respuestaLecturaGoogle(url,opciones,{fetchImpl=fetch,regular=ritmoCompartido,esperar=dormir,ahora=Date.now,hasta=Infinity}={}){
 if(opciones.method!=='GET'||!/^https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\/[A-Za-z0-9_-]{20,120}\?/.test(url))throw new ErrorConteo('GOOGLE_LECTURA_NO_AUTORIZADA','Destino de lectura no autorizado.');
 for(let intento=0;intento<4;intento++){
  await regular();
  if(ahora()>=hasta)throw new ErrorConteo('GOOGLE_LECTURA_EXPIRADA','Se agotó el tiempo de la lectura. Prepara una revisión nueva; los archivos no confirmados permanecen pendientes.');
  // Los errores de red/certificado se conservan como fallos; nunca se elimina
  // la verificación TLS. Solo se reintentan respuestas HTTP temporales.
  const r=await fetchImpl(url,{...opciones,redirect:'error',signal:AbortSignal.timeout(25000)});
  if(!transitorios.has(r.status)||intento===3)return r;
  const demora=esperaReintentoGoogle(r,intento,ahora());
  if(!Number.isFinite(demora)||demora>60000||ahora()+demora>=hasta)return r;
  await r.body?.cancel();await esperar(demora);
 }
}

const MENSAJES={
 GOOGLE_LECTURA_RECHAZADA:['LECTURA_RECHAZADA','Revisar el estado HTTP de esta fuente y los permisos de la cuenta autorizada.'],
 GOOGLE_LECTURA_EXPIRADA:['TIEMPO_DE_LECTURA','Volver a revisar las novedades; la lectura agotó su tiempo antes de confirmar esta fuente.'],
 GOOGLE_LECTURA_NO_AUTORIZADA:['ALCANCE_O_TIEMPO','Volver a preparar la lectura y revisar que la fuente siga vinculada al panel.'],
 SEDE_NO_DEFINIDA:['SEDE_PENDIENTE','Definir la sede de esta fuente desde la revisión de IMS.'],
 GOOGLE_INVENTARIO_PENDIENTE:['PENDIENTE_DE_INICIAR','Completar código, fecha de inicio y cliente cuando comience este inventario.'],
 GOOGLE_FUENTE_CAMBIO:['FUENTE_EN_USO','Repetir la lectura cuando terminen de guardar las capturas de esta fuente.'],
 GOOGLE_CABECERA_DISTINTA:['COLUMNAS_DISTINTAS','Revisar las columnas de la planilla; no se interpreta otra estructura automáticamente.'],
 GOOGLE_HOJA_NO_IDENTIFICADA:['HOJA_NO_IDENTIFICADA','Revisar que exista la hoja original de conteo físico en la fuente.'],
 GOOGLE_STOCK_INCOMPLETO:['STOCK_PENDIENTE','Completar el stock teórico de las líneas; no se supone cantidad cero.'],
 GOOGLE_CELDA_ERROR:['CELDA_CON_ERROR','Corregir los errores de las celdas requeridas antes de repetir la lectura.'],
 GOOGLE_IDENTIFICADOR_INVALIDO:['IDENTIFICADOR_INVALIDO','Revisar los códigos almacenados como números; deben conservar todos sus dígitos.'],
 GOOGLE_FORMATO_INVALIDO:['DATOS_POR_REVISAR','Revisar el formato y los campos requeridos de la planilla.'],
 GOOGLE_RESPUESTA_INCOMPLETA:['RESPUESTA_INCOMPLETA','Repetir la lectura; Google no confirmó todas las páginas de la hoja.'],
 GOOGLE_LIMITE_FILAS:['LIMITE_DE_LECTURA','Revisar el tamaño de la cuadrícula de esta fuente antes de volver a leer.'],
 GOOGLE_RESPUESTA_GRANDE:['LIMITE_DE_RESPUESTA','Revisar el tamaño de esta fuente; su respuesta superó el límite de lectura.']
};
/** Solo campos acotados para soporte: no refleja mensajes del proveedor,
 * identificadores de Drive, URLs, tokens ni configuración de la conexión. */
export function detalleIncidenciaGoogle(i){
 const codigo=Object.hasOwn(MENSAJES,i?.codigo)?i.codigo:'LECTURA_NO_CONFIRMADA';
 const http=Number.isInteger(i?.http)&&i.http>=100&&i.http<=599?i.http:null;
 let [causa,accion]=MENSAJES[codigo]||['SIN_DIAGNOSTICO','Revisar el detalle de esta fuente en Trabajos y descargas.'];
 if(codigo==='GOOGLE_LECTURA_RECHAZADA'){
  if(http===429){causa='CUOTA_TEMPORAL';accion='Google limitó las solicitudes. Esperar y preparar otra lectura; IMS limita el ritmo y los reintentos.';}
  else if(http===403){causa='ACCESO_RECHAZADO';accion='Revisar permisos y restricciones de la cuenta autorizada sobre esta fuente.';}
  else if(http===404){causa='FUENTE_NO_DISPONIBLE';accion='Revisar el vínculo del panel y el acceso a la fuente; puede estar eliminada o no ser visible para esta cuenta.';}
  else if(http===401){causa='AUTORIZACION_RECHAZADA';accion='Comprobar la autorización Google en Conexiones.';}
  else if(transitorios.has(http)){causa='SERVICIO_TEMPORAL';accion='Google no confirmó el servicio después de los reintentos permitidos. Volver a preparar la lectura.';}
 }
 return {codigo,http,causa,accion,filaPanel:Number.isInteger(i?.filaPanel)&&i.filaPanel>0&&i.filaPanel<=10001?i.filaPanel:null};
}
