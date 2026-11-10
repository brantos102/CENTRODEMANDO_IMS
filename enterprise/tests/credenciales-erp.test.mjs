import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {prepararCredencialesERP,ORIGEN_ERP} from '../src/migracion/credenciales-erp.mjs';
const secreta='NO_PUBLICAR_CLAVE_SINTETICA';
function fuente(){return {formato:'ims-erp-origen-v1',...ORIGEN_ERP,creado_en:'2026-11-09T20:00:00Z',propiedades:{CRED_API_CLIENTE:JSON.stringify({user:' usuario ',pass:' '+secreta+' '})},legacy_uio:[]};}
const source=await readFile(new URL('../tools/EXPORTAR_ERP_PRIVADO.gs.txt',import.meta.url),'utf8');
function simular({email='brantos102@gmail.com',efectivo=email,proyecto=ORIGEN_ERP.proyecto,privado=true}={}){
 const f=fuente(),events=[],logs=[],files=[];let reads=0;
 function recurso(tipo){const r={tipo,setSharing(){events.push(tipo+':privado');return r;},getSharingAccess:()=>privado?'PRIVATE':'DOMAIN',getEditors:()=>[],getViewers:()=>[],createFile(name,body){events.push('archivo:vacio');assert.equal(body,'{}');const c=recurso('archivo');files.push(c);return c;},setContent(body){events.push(tipo+':contenido');r.content=body;return r;},getUrl:()=> 'https://drive.google.com/file/d/ID_SINTETICO/view'};return r;}
 const context=vm.createContext({ScriptApp:{getScriptId:()=>proyecto},Session:{getActiveUser:()=>({getEmail:()=>email}),getEffectiveUser:()=>({getEmail:()=>efectivo})},
  PropertiesService:{getScriptProperties:()=>({getProperties:()=>{reads++;return {...f.propiedades,API_TOKEN:secreta,ITSANET_TOKEN_CLIENTE:secreta};}})},
  SpreadsheetApp:{openById:id=>{assert.equal(id,ORIGEN_ERP.maestro);return {getSheetByName:name=>{assert.equal(name,'CREDENCIALES_API');return {getLastRow:()=>2,getRange:(a,b,c,d)=>{assert.deepEqual([a,b,c,d],[2,1,1,3]);return {getValues:()=>[[' LEGACY ',' usuario_legacy ',' '+secreta+' ']]};}};}};}},
  Utilities:{newBlob:text=>({getBytes:()=>Buffer.from(text)})},MimeType:{PLAIN_TEXT:'text/plain'},
  DriveApp:{Access:{PRIVATE:'PRIVATE'},Permission:{VIEW:'VIEW'},createFolder:()=>{events.push('carpeta:crear');return recurso('carpeta');}},Logger:{log:msg=>logs.push(msg)}});
 vm.runInContext(source,context);
 return {run:()=>context.IMSExportarERPPrivado20261109(),events,logs,files,reads:()=>reads};
}
test('exportador restringe proyecto y cuenta antes de leer propiedades o crear archivos',()=>{
 for(const options of [{email:'otro@prueba.invalid'},{email:'',efectivo:'brantos102@gmail.com'},{email:'bespinoza@itsanet.com',efectivo:'brantos102@gmail.com'},{proyecto:'otro'}]){
  const f=simular(options);assert.throws(f.run,e=>!e.message.includes(secreta));assert.equal(f.reads(),0);assert.deepEqual(f.events,[]);
 }
});
test('Drive se comprueba privado ANTES de escribir claves; no se exportan tokens ni se cambian fuentes',()=>{
 const f=simular(),r=f.run();assert.equal(r.ok,true);assert.equal(r.fuentes_modificadas,false);
 assert.ok(f.events.indexOf('archivo:privado')<f.events.indexOf('archivo:contenido'));
 assert.equal(f.logs.join('').includes(secreta),false);
 const out=JSON.parse(f.files[0].content);assert.deepEqual(Object.keys(out.propiedades),['CRED_API_CLIENTE']);assert.equal(out.legacy_uio[0][2],' '+secreta+' ');
 assert.equal(prepararCredencialesERP(out).resumen.conexiones_identificadas,2);
});
test('si Drive no confirma privacidad, el archivo permanece vacío de credenciales',()=>{
 const f=simular({privado:false});assert.throws(f.run,e=>!e.message.includes(secreta));assert.equal(f.events.includes('archivo:contenido'),false);assert.equal(f.logs.length,0);
});
test('precedencia replica al getter: propiedad válida gana a legacy y conserva espacios de su contraseña',()=>{
 const f=fuente();f.legacy_uio=[['CLIENTE','OTRO','OTRA'],['CLIENTE','OTRO_2','OTRA_2']];
 const r=prepararCredencialesERP(f),e=r.registro.entradas[0];assert.equal(e.userid,' usuario ');assert.equal(e.password,' '+secreta+' ');assert.equal(e.fuente,'ScriptProperties');assert.equal(e.requiere_revision,false);assert.equal(r.resumen.legacy_no_utilizada_por_precedencia,1);
 assert.equal(JSON.stringify(r.resumen).includes(secreta),false);assert.equal(JSON.stringify(r.resumen).includes('usuario'),false);
});
test('propiedad inválida usa fallback de Quito; GYE permanece separado y nunca usa claves de UIO',()=>{
 const f=fuente();f.propiedades={CRED_API_CLIENTE:'{',CREDGYE_API_CLIENTE:JSON.stringify({user:'GYE',pass:secreta})};f.legacy_uio=[[' CLIENTE ',' LEGACY ',' '+secreta+' ']];
 const r=prepararCredencialesERP(f);assert.equal(r.resumen.fallback_legacy_uio,1);assert.equal(r.resumen.uio,1);assert.equal(r.resumen.gye,1);
 assert.equal(r.registro.entradas.find(e=>e.sede==='UIO').password,secreta);assert.equal(r.registro.entradas.find(e=>e.sede==='GYE').userid,'GYE');
});
test('primera legacy vacía no se sustituye silenciosamente por una fila posterior válida',()=>{
 const f=fuente();f.propiedades={};f.legacy_uio=[['CLIENTE','',''],['CLIENTE','VALIDO',secreta]];
 const r=prepararCredencialesERP(f);assert.equal(r.registro.entradas[0].userid,'');assert.equal(r.registro.entradas[0].requiere_revision,true);assert.equal(r.resumen.conexiones_preparadas,0);assert.equal(r.resumen.conexiones_identificadas,1);
});
test('claves no canónicas no se renombran; datos ajenos o formato incompleto se rechazan sin red ni SQL',()=>{
 const f=fuente();f.propiedades.CRED_API_cliente=JSON.stringify({user:'OTRO',pass:secreta});const r=prepararCredencialesERP(f);assert.equal(r.registro.entradas.length,1);assert.equal(r.resumen.incidencias,1);
 for(const patch of [{proyecto:'otro'},{maestro:'otro'},{propiedades:{API_TOKEN:secreta}},{legacy_uio:[['CLIENTE',1,2]]},{creado_en:'fecha_invalida'}])assert.throws(()=>prepararCredencialesERP({...fuente(),...patch}),e=>!e.message.includes(secreta));
});
test('valores de propiedad con verdad conservan String del getter, sin ejecutar texto ni inventar asociaciones MySQL',()=>{
 const f=fuente();f.propiedades.CRED_API_CLIENTE=JSON.stringify({user:123,pass:secreta+' $(no_ejecutar)'});
 const r=prepararCredencialesERP(f);assert.equal(r.registro.entradas[0].userid,'123');assert.ok(r.registro.entradas[0].password.includes('$(no_ejecutar)'));assert.equal(r.resumen.clientes_mysql_asignados,0);assert.equal(r.resumen.codigos_erp_confirmados,0);assert.equal(r.resumen.conexiones_reales_comprobadas,false);
});

import {mkdtemp,writeFile,mkdir,readFile as leer,chmod,symlink,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {revisarCopia} from '../tools/revisar-erp-privado.mjs';
async function archivos(t){const base=await mkdtemp(join(tmpdir(),'ims-erp-prueba-'));await chmod(base,0o700);t.after(()=>rm(base,{recursive:true,force:true}));const archivo=join(base,'origen.json'),raw=Buffer.from(JSON.stringify(fuente()));await writeFile(archivo,raw,{mode:0o600});return {base,archivo,raw,salida:join(base,'revision')};}
test('revisión privada conserva exactamente el original y publica únicamente un resumen sin claves', {skip:process.platform!=='linux'},async t=>{
 const f=await archivos(t),r=await revisarCopia(f.archivo,f.salida,{base:f.base});
 const integridad=JSON.parse(await leer(join(f.salida,'integridad_erp_NO_COMPARTIR.json'),'utf8'));assert.equal(integridad.sha256_origen,createHash('sha256').update(f.raw).digest('hex'));assert.equal(Object.hasOwn(r,'sha256_origen'),false);assert.equal(r.base_de_datos_modificada,false);
 assert.deepEqual(await leer(f.archivo),f.raw);assert.deepEqual(await leer(join(f.salida,'origen_NO_COMPARTIR.json')),f.raw);
 const resumen=await leer(join(f.salida,'resumen_erp_para_compartir.json'),'utf8');assert.equal(resumen.includes(secreta),false);assert.equal(resumen.includes('CLIENTE'),false);
 assert.equal((await stat(join(f.salida,'registro_erp_NO_COMPARTIR.json'))).mode&0o777,0o600);assert.equal((await stat(f.salida)).mode&0o777,0o700);
 await assert.rejects(revisarCopia(f.archivo,f.salida,{base:f.base}));assert.deepEqual(await leer(f.archivo),f.raw);
});
test('permisos abiertos, enlaces y rutas fuera de la carpeta se rechazan antes de crear otra copia', {skip:process.platform!=='linux'},async t=>{
 const f=await archivos(t);await chmod(f.archivo,0o644);await assert.rejects(revisarCopia(f.archivo,f.salida,{base:f.base}));await chmod(f.archivo,0o600);
 const enlace=join(f.base,'enlace.json');await symlink(f.archivo,enlace);await assert.rejects(revisarCopia(enlace,f.salida,{base:f.base}));
 await assert.rejects(revisarCopia(f.archivo,join(f.base,'..','fuera'),{base:f.base}));
});
test('JSON malformado que contiene una clave nunca aparece en el error de revisión', {skip:process.platform!=='linux'},async t=>{
 const f=await archivos(t);await writeFile(f.archivo,'{ "clave":"'+secreta+'",',{mode:0o600});
 await assert.rejects(revisarCopia(f.archivo,f.salida,{base:f.base}),e=>!e.message.includes(secreta));
});
