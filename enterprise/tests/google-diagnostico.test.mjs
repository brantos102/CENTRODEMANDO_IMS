import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticoOAuth,errorRespuestaGoogle,errorRedGoogle,permisosGoogleFaltantes} from '../src/centro/google-diagnostico.mjs';
import {SCOPES_GOOGLE} from '../src/centro/google-oauth.mjs';
import {SCOPE_HOJAS} from '../src/centro/google-hojas.mjs';
test('diagnóstico de API deshabilitada conserva etapa y código permitido sin mensajes, URLs o secretos del proveedor',()=>{
 const error=errorRespuestaGoogle({error:{status:'PERMISSION_DENIED',message:'SECRETO_PROVEEDOR access_token=TOKEN_PRIVADO code=CODIGO_PRIVADO',details:[{reason:'SERVICE_DISABLED',metadata:{url:'https://privado.invalid/?secret=NO_COMPARTIR'}}]}},403,'CALENDARIO'),d=diagnosticoOAuth(error);assert.equal(d.codigo,'API_DESHABILITADA');assert.equal(d.etapa,'CALENDARIO');assert.equal(d.http,403);assert.equal(d.proveedor,'SERVICE_DISABLED');assert.equal(d.api,'Google Calendar API');assert.ok(!/SECRETO_PROVEEDOR|TOKEN_PRIVADO|CODIGO_PRIVADO|NO_COMPARTIR|privado.invalid/.test(JSON.stringify(d)));
});
test('rechazo de cliente y errores no clasificados no reflejan campos arbitrarios del proveedor',()=>{
 assert.equal(diagnosticoOAuth(errorRespuestaGoogle({error:'invalid_client',error_description:'password=NO_COMPARTIR'},401,'TOKEN')).codigo,'CLIENTE_RECHAZADO');const d=diagnosticoOAuth(errorRespuestaGoogle({error:{message:'NO_COMPARTIR',details:[{reason:'token_NO_COMPARTIR'}]}},403,'IDENTIDAD'));assert.equal(d.codigo,'GOOGLE_ACCESO_DENEGADO');assert.ok(!JSON.stringify(d).includes('NO_COMPARTIR'));assert.equal(Object.hasOwn(d,'proveedor'),false);
});
test('errores de red y certificado se distinguen sin sugerir deshabilitar TLS ni mostrar el mensaje interno',()=>{
 const a=errorRedGoogle(Object.assign(new Error('URL_PRIVADA'),{name:'TimeoutError'}),'TOKEN');assert.equal(diagnosticoOAuth(a).codigo,'GOOGLE_TIEMPO_AGOTADO');const b=errorRedGoogle(new Error('SECRETO',{cause:{code:'SELF_SIGNED_CERT_IN_CHAIN'}}),'IDENTIDAD');assert.equal(diagnosticoOAuth(b).codigo,'GOOGLE_CERTIFICADO_RECHAZADO');assert.ok(!JSON.stringify(diagnosticoOAuth(b)).includes('SECRETO'));
});
test('permisos equivalentes ya concedidos se aceptan; permisos ausentes y de solo lectura no conceden escritura',()=>{
 const full='https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/spreadsheets';assert.deepEqual(permisosGoogleFaltantes([...SCOPES_GOOGLE,SCOPE_HOJAS],full),[]);assert.deepEqual(permisosGoogleFaltantes(SCOPES_GOOGLE,'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events.readonly'),['Gmail','Calendar']);assert.deepEqual(permisosGoogleFaltantes([SCOPE_HOJAS],''),['Sheets']);
});
test('el saneamiento del diagnóstico ignora contenido añadido a errores, etapas y permisos',()=>{
 const d=diagnosticoOAuth({codigo:'NO_AUTENTICADO',message:'NO_COMPARTIR',diagnosticoGoogle:{codigo:'NO_COMPARTIR',etapa:'NO_COMPARTIR',http:0,proveedor:'NO_COMPARTIR',permisos_faltantes:['Sheets','NO_COMPARTIR'],tokens:['NO_COMPARTIR']}},'SESION');assert.equal(d.codigo,'SESION_VENCIDA');assert.equal(d.etapa,'SESION');assert.deepEqual(d.permisos_faltantes,['Sheets']);assert.ok(!JSON.stringify(d).includes('NO_COMPARTIR'));
});
