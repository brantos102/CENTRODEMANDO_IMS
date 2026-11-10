import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,chmod,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ORIGEN_ERP,ORIGEN_ERP_GYE} from '../src/migracion/credenciales-erp.mjs';
import {revisarCopia} from '../tools/revisar-erp-privado.mjs';
import {prepararRevisionAsociaciones} from '../tools/revisar-asociaciones-erp.mjs';
import {diagnosticarLecturaERP} from '../tools/diagnosticar-erp-lectura.mjs';
const SECRET='CLAVE_PRUEBA_PRIVADA',USER='USUARIO_PRUEBA_PRIVADO',TOKEN='TOKEN_PRUEBA_PRIVADO';
async function fixture(t,{claveCopia=SECRET}={}){
 const base=await mkdtemp(join(tmpdir(),'ims-diagnostico-erp-'));await chmod(base,0o700);t.after(()=>rm(base,{recursive:true,force:true}));
 const props={CRED_API_FLUKE:JSON.stringify({user:USER,pass:SECRET})},fecha='2026-11-10T12:00:00Z';
 const uio={formato:'ims-erp-origen-v1',...ORIGEN_ERP,creado_en:fecha,propiedades:props,legacy_uio:[]};
 const gye={...uio,...ORIGEN_ERP_GYE,propiedades:{CRED_API_FLUKE:JSON.stringify({user:USER,pass:claveCopia}),CREDGYE_API_ALU:JSON.stringify({user:USER+'_GYE',pass:SECRET+'_GYE'})}};
 const revisiones=[];
 for(const [name,fuente] of [['uio',uio],['gye',gye]]){
  const archivo=join(base,name+'.json');await writeFile(archivo,JSON.stringify(fuente),{mode:0o600});const revision=join(base,'revision_'+name);await revisarCopia(archivo,revision,{base});revisiones.push(revision);
 }
 const a=join(base,'asociaciones');await prepararRevisionAsociaciones({base,revisiones,salida:a,leerCatalogo:async()=>[{id:'10000000-0000-4000-8000-000000000001',nombre:'FLUKE'}]});
 return {base,revisiones,plan:join(a,'asociaciones_erp_NO_COMPARTIR.json'),salida:join(base,'lectura')};
}
test('consulta secuencial elimina falso aviso, verifica ambas sedes una sola vez y no importa ni expone credenciales',async t=>{
 const f=await fixture(t);let activas=0,max=0;const calls=[];
 const fetchImpl=async(url,opts)=>{activas++;max=Math.max(max,activas);calls.push({url,...opts});await new Promise(r=>setTimeout(r,1));activas--;return new Response(url.endsWith('gettoken')?JSON.stringify({token:TOKEN}):JSON.stringify([{'COD. CLIENTE':'COD_REAL','COD. PRODUCTO':'SKU_PRIVADO',CANTIDAD:123}]));};
 const r=await diagnosticarLecturaERP({...f,fetchImpl});assert.equal(max,1);assert.equal(calls.length,4);assert.equal(r.ok,true);assert.equal(r.conexiones_verificadas,2);assert.equal(r.avisos_ubicacion_resueltos,1);assert.equal(r.clientes_asignados,0);assert.equal(r.datos_importados,false);
 const report=await readFile(r.archivo_para_compartir,'utf8');for(const v of [SECRET,USER,TOKEN,'SKU_PRIVADO'])assert.equal(report.includes(v),false);assert.ok(report.includes('COD_REAL'));
 assert.equal((await stat(r.archivo_para_compartir)).mode&0o777,0o600);assert.equal((await stat(f.salida)).mode&0o777,0o700);
 let repetidas=0;await assert.rejects(diagnosticarLecturaERP({...f,fetchImpl:async()=>{repetidas++;throw Error('No llegar');}}));assert.equal(repetidas,0);
});
test('un fallo de conexión no oculta otras verificaciones ni publica el error privado',async t=>{
 const f=await fixture(t);
 const r=await diagnosticarLecturaERP({...f,fetchImpl:async url=>{if(url.includes('/g_apidepot/'))throw Error(SECRET);return new Response(url.endsWith('gettoken')?JSON.stringify({token:TOKEN}):'[]');}});
 assert.equal(r.ok,false);assert.equal(r.no_verificadas,1);assert.equal(r.sin_stock,1);assert.equal(r.conexiones_verificadas,1);assert.equal(r.diagnostico_terminado,true);assert.equal((await readFile(r.archivo_para_compartir,'utf8')).includes(SECRET),false);
});
test('presupuesto compartido deja pendientes visibles, sin fingir que todas se consultaron',async t=>{
 const f=await fixture(t);let clock=0,calls=0;
 const r=await diagnosticarLecturaERP({...f,presupuestoMs:100,ahora:()=>clock,fetchImpl:async url=>{calls++;if(url.endsWith('gettoken'))return new Response(JSON.stringify({token:TOKEN}));clock=100;return new Response('[]');}});
 assert.equal(calls,2);assert.equal(r.ok,false);assert.equal(r.pendientes_por_presupuesto,1);assert.equal(r.diagnostico_terminado,false);
});
test('fuente o plan alterados detienen todo antes del primer acceso al ERP',async t=>{
 const f=await fixture(t);let calls=0;const fetchImpl=async()=>{calls++;throw Error('No llegar');};
 const path=join(f.revisiones[0],'origen_NO_COMPARTIR.json'),raw=await readFile(path);await writeFile(path,raw+' ');await assert.rejects(diagnosticarLecturaERP({...f,fetchImpl}));assert.equal(calls,0);await writeFile(path,raw);
 const plan=JSON.parse(await readFile(f.plan));plan.sha256_catalogo='0'.repeat(64);await writeFile(f.plan,JSON.stringify(plan));await assert.rejects(diagnosticarLecturaERP({...f,fetchImpl}));assert.equal(calls,0);
});
test('un conflicto real bloquea esa conexión antes de pedir token y permite verificar las demás',async t=>{
 const f=await fixture(t,{claveCopia:'OTRA_CLAVE_PRIVADA'}),calls=[];
 const r=await diagnosticarLecturaERP({...f,fetchImpl:async url=>{calls.push(url);assert.ok(url.includes('/g_apidepot/'));return new Response(url.endsWith('gettoken')?JSON.stringify({token:TOKEN}):'[]');}});
 assert.equal(calls.length,2);assert.equal(r.bloqueadas,1);assert.equal(r.conexiones_verificadas,1);assert.equal(r.ok,false);assert.equal(r.avisos_ubicacion_resueltos,0);
});
test('informe conserva diagnóstico de formato y versión del motor sin afirmar que HTTP 200 confirma conexión',async t=>{
 const f=await fixture(t),logs=[];
 const r=await diagnosticarLecturaERP({...f,progreso:p=>logs.push(p),fetchImpl:async()=>new Response('<html>'+SECRET+'</html>',{headers:{'content-type':'text/html'}})});
 assert.equal(r.conexiones_verificadas,0);assert.equal(r.no_verificadas,2);assert.equal(r.ok,false);assert.ok(/^\d+\./.test(r.motor.node));assert.equal(r.motor.json_numeros_exactos,true);
 const report=JSON.parse(await readFile(r.archivo_para_compartir,'utf8'));assert.equal(report.conexiones[0].http,200);assert.equal(report.conexiones[0].diagnostico_autenticacion.json_valido,false);assert.equal(report.conexiones[0].tipo_contenido,'HTML');assert.equal(JSON.stringify(report).includes(SECRET),false);
 assert.equal(logs[0].formato_autenticacion.tipo_contenido,'HTML');assert.equal(JSON.stringify(logs).includes(SECRET),false);
});
test('revisión dirigida consulta solo la previsualización pendiente y prepara registro completo sin activar ni publicar claves',async t=>{
 const f=await fixture(t);
 const primero=await diagnosticarLecturaERP({...f,fetchImpl:async url=>new Response(url.endsWith('gettoken')?JSON.stringify({token:TOKEN}):JSON.stringify([{'COD. CLIENTE':url.includes('/q_apidepot/')?'FLUKE':'ALU','COD. PRODUCTO':'SKU_PRIVADO',CANTIDAD:'1',DESCRIPCION:url.includes('/q_apidepot/')?'D'.repeat(4001):'correcta'}]))});
 const llamadas=[];
 const r=await diagnosticarLecturaERP({...f,salida:join(f.base,'segunda'),diagnosticoAnterior:primero.archivo_para_compartir,fetchImpl:async url=>{llamadas.push(url);assert.ok(url.includes('/q_apidepot/'));return new Response(url.endsWith('gettoken')?JSON.stringify({token:TOKEN}):JSON.stringify([{'COD. CLIENTE':'FLUKE','COD. PRODUCTO':'SKU_PRIVADO',CANTIDAD:'1e3'}]));}});
 assert.equal(llamadas.length,2);assert.equal(r.conexiones,1);assert.equal(r.conexiones_fuera_de_esta_revision,1);assert.equal(r.conexiones_con_totales_pendientes,0);assert.equal(r.alcance,'SOLO_PREVISUALIZACIONES_PENDIENTES');assert.equal(r.registro_preparado.conexiones_preparadas,2);assert.equal(r.registro_preparado.configuracion_activa,false);
 const privado=join(f.base,'segunda','registro_erp_runtime_NO_COMPARTIR.json');assert.ok((await readFile(privado,'utf8')).includes(SECRET));assert.equal((await stat(privado)).mode&0o777,0o600);
 const publico=await readFile(join(f.base,'segunda','cuentas_erp_para_compartir.json'),'utf8');assert.equal(publico.includes(SECRET),false);assert.equal(publico.includes(USER),false);
});
test('informe anterior incompatible detiene antes de consultar ERP o crear otra carpeta',async t=>{
 const f=await fixture(t);
 const primero=await diagnosticarLecturaERP({...f,fetchImpl:async url=>new Response(url.endsWith('gettoken')?JSON.stringify({token:TOKEN}):'[]')});
 const informe=JSON.parse(await readFile(primero.archivo_para_compartir,'utf8'));informe.conexiones[0].referencia='0'.repeat(24);await writeFile(primero.archivo_para_compartir,JSON.stringify(informe));
 let calls=0;await assert.rejects(diagnosticarLecturaERP({...f,salida:join(f.base,'segunda'),diagnosticoAnterior:primero.archivo_para_compartir,fetchImpl:async()=>{calls++;throw Error('NO_LLEGAR');}}));assert.equal(calls,0);
});
