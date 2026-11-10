import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,chmod,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {proponerAsociacionesERP} from '../src/migracion/asociaciones-erp.mjs';
import {prepararCredencialesERP,ORIGEN_ERP,ORIGEN_ERP_GYE} from '../src/migracion/credenciales-erp.mjs';
import {revisarCopia} from '../tools/revisar-erp-privado.mjs';
import {catalogoERP,prepararRevisionAsociaciones} from '../tools/revisar-asociaciones-erp.mjs';
const SECRET='CLAVE_SINTETICA_NO_PUBLICAR',USER='USUARIO_ERP_NO_PUBLICAR';
const id1='10000000-0000-4000-8000-000000000001',id2='10000000-0000-4000-8000-000000000002';
const clientes=[{id:id1,nombre:'FLUKE'},{id:id2,nombre:'NOKIACNT'}];
const fuente=(propiedades={CRED_API_FLUKE:JSON.stringify({user:USER,pass:SECRET})})=>({formato:'ims-erp-origen-v1',...ORIGEN_ERP,creado_en:'2026-11-10T12:00:00Z',propiedades,legacy_uio:[]});
const reg=f=>prepararCredencialesERP(f).registro;
test('nombre idéntico propone revisión sin asignar cliente ni inferir códigos ERP',()=>{
 const r=proponerAsociacionesERP({registros:[reg(fuente())],clientes}),c=r.conexiones[0];
 assert.equal(c.estado,'COINCIDENCIA_PENDIENTE_CONFIRMACION');assert.deepEqual(c.coincidencias_nombre,[clientes[0]]);assert.equal(c.cliente_confirmado,null);assert.deepEqual(c.codigos_cliente_erp,[]);assert.equal(r.resumen.clientes_asignados,0);
 assert.equal(JSON.stringify(r).includes(SECRET),false);assert.equal(JSON.stringify(r).includes(USER),false);
});
test('alias y prefijos nunca se confunden con nombre del panel; nombres originales permanecen intactos',()=>{
 const r=proponerAsociacionesERP({registros:[reg(fuente({CRED_API_NOKIACNTLTE:JSON.stringify({user:USER,pass:SECRET})}))],clientes});
 assert.equal(r.conexiones[0].estado,'SIN_COINCIDENCIA_EXACTA');assert.deepEqual(r.conexiones[0].coincidencias_nombre,[]);assert.deepEqual(r.catalogo_clientes,clientes);
});
test('dos clientes con nombre normalizado igual requieren revisión ambigua, sin elegir el primero',()=>{
 const r=proponerAsociacionesERP({registros:[reg(fuente())],clientes:[...clientes,{id:'10000000-0000-4000-8000-000000000003',nombre:' fluke '}]});
 assert.equal(r.conexiones[0].estado,'NOMBRE_AMBIGUO');assert.equal(r.conexiones[0].coincidencias_nombre.length,2);assert.equal(r.conexiones[0].cliente_confirmado,null);
});
test('misma etiqueta en UIO y GYE sigue separada; claves discrepantes de una sede son conflicto',()=>{
 const gye={...fuente({CREDGYE_API_FLUKE:JSON.stringify({user:USER,pass:SECRET})}),...ORIGEN_ERP_GYE};
 const a=reg(fuente()),b=reg(gye),d=reg(fuente({CRED_API_FLUKE:JSON.stringify({user:USER,pass:'OTRA_SINTETICA'})}));
 const r=proponerAsociacionesERP({registros:[a,b,a],clientes});assert.equal(r.conexiones.length,2);assert.equal(r.resumen.uio,1);assert.equal(r.resumen.gye,1);
 const r2=proponerAsociacionesERP({registros:[a,b,d],clientes});assert.equal(r2.conexiones.find(c=>c.sede==='UIO').estado,'CONFLICTO_ENTRE_FUENTES');assert.equal(r2.conexiones.find(c=>c.sede==='GYE').estado,'COINCIDENCIA_PENDIENTE_CONFIRMACION');
 assert.equal(JSON.stringify(r2).includes('OTRA_SINTETICA'),false);
});
test('credencial con fallback conflictivo no se aprueba por coincidir el nombre',()=>{
 const f=fuente({});f.legacy_uio=[['FLUKE',USER,SECRET],['FLUKE',USER,'OTRA']];
 const r=proponerAsociacionesERP({registros:[reg(f)],clientes});assert.equal(r.conexiones[0].estado,'CREDENCIAL_REQUIERE_REVISION');
});
test('catálogo inválido y registros ajenos se rechazan; el orden no cambia propuestas',()=>{
 assert.throws(()=>proponerAsociacionesERP({registros:[reg(fuente())],clientes:[...clientes,clientes[0]]}));
 assert.throws(()=>proponerAsociacionesERP({registros:[{}],clientes}));
 const a=proponerAsociacionesERP({registros:[reg(fuente())],clientes});const b=proponerAsociacionesERP({registros:[reg(fuente())],clientes:[...clientes].reverse()});assert.deepEqual(a,b);
});
test('consulta exige base y usuario exclusivos y usa transacción de solo lectura, cerrada incluso con fallo',async()=>{
 const queries=[];let rollback=0;
 const c={query:async q=>{queries.push(q);if(q.startsWith('SELECT DATABASE'))return [[{nombre:'centromando_ims_ensayo',usuario:'ims_cm_operacion@127.0.0.1'}]];if(q.startsWith('SELECT id'))return [clientes];return [];},rollback:async()=>{rollback++;}};
 assert.deepEqual(await catalogoERP(c),clientes);assert.deepEqual(queries.slice(1),['SET TRANSACTION READ ONLY','START TRANSACTION WITH CONSISTENT SNAPSHOT','SELECT id,nombre FROM ims_op_cliente ORDER BY id']);assert.equal(rollback,1);
 c.query=async q=>{if(q.startsWith('SELECT DATABASE'))return [[{nombre:'otra_app',usuario:'root@localhost'}]];throw Error('No debe llegar');};await assert.rejects(catalogoERP(c));assert.equal(rollback,1);
 c.query=async q=>{if(q.startsWith('SELECT DATABASE'))return [[{nombre:'centromando_ims_ensayo',usuario:'ims_cm_operacion@127.0.0.1'}]];if(q.startsWith('SELECT id'))throw Error('SINTETICO');return [];};await assert.rejects(catalogoERP(c));assert.equal(rollback,2);
});
async function archivos(t){
 const base=await mkdtemp(join(tmpdir(),'ims-asociaciones-erp-'));await chmod(base,0o700);t.after(()=>rm(base,{recursive:true,force:true}));
 const archivo=join(base,'origen.json');await writeFile(archivo,JSON.stringify(fuente()),{mode:0o600});const revision=join(base,'revision');await revisarCopia(archivo,revision,{base});
 return {base,revision,salida:join(base,'asociaciones'),leerCatalogo:async()=>clientes};
}
test('revisión de archivos conserva originales, excluye secretos y huellas privadas y no sobrescribe',async t=>{
 const f=await archivos(t),original=await readFile(join(f.revision,'origen_NO_COMPARTIR.json'));
 const r=await prepararRevisionAsociaciones({...f,revisiones:[f.revision]});assert.equal(r.base_de_datos_modificada,false);
 const pub=await readFile(join(f.salida,'revision_asociaciones_erp_para_compartir.json'),'utf8');assert.equal(pub.includes(USER),false);assert.equal(pub.includes(SECRET),false);assert.equal(pub.includes(createHash('sha256').update(original).digest('hex')),false);
 assert.deepEqual(await readFile(join(f.revision,'origen_NO_COMPARTIR.json')),original);
 await assert.rejects(prepararRevisionAsociaciones({...f,revisiones:[f.revision]}));
});
test('original alterado, registro preparado alterado y permisos abiertos detienen ANTES de MySQL',async t=>{
 const f=await archivos(t);let calls=0;f.leerCatalogo=async()=>{calls++;return clientes;};
 const p=join(f.revision,'origen_NO_COMPARTIR.json'),raw=await readFile(p);
 await writeFile(p,raw+' ');await assert.rejects(prepararRevisionAsociaciones({...f,revisiones:[f.revision]}));assert.equal(calls,0);await writeFile(p,raw);
 const p2=join(f.revision,'registro_erp_NO_COMPARTIR.json'),raw2=await readFile(p2),j=JSON.parse(raw2);j.entradas[0].cliente_configurado='OTRO';await writeFile(p2,JSON.stringify(j));await assert.rejects(prepararRevisionAsociaciones({...f,revisiones:[f.revision]}));assert.equal(calls,0);await writeFile(p2,raw2);
 await chmod(p,0o644);await assert.rejects(prepararRevisionAsociaciones({...f,revisiones:[f.revision]}));assert.equal(calls,0);
});
test('rutas con enlace, salida ajena o revisiones repetidas no abren MySQL',async t=>{
 const f=await archivos(t);let calls=0;f.leerCatalogo=async()=>{calls++;return clientes;};
 const link=join(f.base,'enlace');await symlink(f.revision,link);await assert.rejects(prepararRevisionAsociaciones({...f,revisiones:[link]}));
 await assert.rejects(prepararRevisionAsociaciones({...f,revisiones:[f.revision,f.revision]}));
 await assert.rejects(prepararRevisionAsociaciones({...f,revisiones:[f.revision],salida:join(f.base,'..','salida-ajena')}));assert.equal(calls,0);
});
test('copia UIO dentro del proyecto GYE no invalida la misma credencial confirmada por el proyecto UIO',()=>{
 const uio=reg(fuente()),gye=reg({...fuente(),...ORIGEN_ERP_GYE});
 assert.equal(gye.entradas[0].requiere_revision,true);const antes=JSON.stringify([uio,gye]);
 const r=proponerAsociacionesERP({registros:[gye,uio],clientes});
 assert.equal(r.conexiones[0].estado,'COINCIDENCIA_PENDIENTE_CONFIRMACION');assert.equal(r.resumen.avisos_ubicacion_resueltos,1);assert.equal(r.resumen.credenciales_para_revision,0);
 assert.deepEqual(r,proponerAsociacionesERP({registros:[uio,gye],clientes}));assert.equal(JSON.stringify([uio,gye]),antes);assert.equal(JSON.stringify(r).includes(SECRET),false);
});
test('aviso GYE sin fuente UIO, claves distintas o legacy conflictiva no se resuelven por ubicación',()=>{
 const gye=reg({...fuente(),...ORIGEN_ERP_GYE});
 assert.equal(proponerAsociacionesERP({registros:[gye],clientes}).resumen.credenciales_para_revision,1);
 const distinta=reg(fuente({CRED_API_FLUKE:JSON.stringify({user:USER,pass:'OTRA'})}));
 const r=proponerAsociacionesERP({registros:[distinta,gye],clientes});assert.equal(r.resumen.conflictos_entre_fuentes,1);assert.equal(r.resumen.avisos_ubicacion_resueltos,0);
 const legacy=fuente({});legacy.legacy_uio=[['FLUKE',USER,SECRET],['FLUKE',USER,'OTRA']];
 const r2=proponerAsociacionesERP({registros:[reg(legacy),gye],clientes});assert.equal(r2.resumen.credenciales_para_revision,1);assert.equal(r2.resumen.avisos_ubicacion_resueltos,0);
});
test('17 copias UIO y ocho conexiones GYE producen 25 conexiones y resuelven solo 17 avisos de ubicación',()=>{
 const props=Object.fromEntries(Array.from({length:17},(_,i)=>['CRED_API_C'+i,JSON.stringify({user:USER+i,pass:SECRET+i})]));
 const otras=Object.fromEntries(Array.from({length:8},(_,i)=>['CREDGYE_API_G'+i,JSON.stringify({user:USER+i,pass:SECRET+i})]));
 const uio=reg(fuente(props)),gye=reg({...fuente({...props,...otras}),...ORIGEN_ERP_GYE});
 const r=proponerAsociacionesERP({registros:[gye,uio],clientes});assert.equal(r.resumen.conexiones,25);assert.equal(r.resumen.uio,17);assert.equal(r.resumen.gye,8);assert.equal(r.resumen.avisos_ubicacion_resueltos,17);assert.equal(r.resumen.credenciales_para_revision,0);assert.equal(r.resumen.conflictos_entre_fuentes,0);assert.equal(r.resumen.clientes_asignados,0);
});
test('grupos confirmados preservan subclientes, detectan altas pendientes y no inventan códigos ni parentesco de FINI',()=>{
 const etiquetas=['ALU','ALU SWAP','ALULTE','NOKIA5G','NOKIACNT3G','NOKIACNTLTE','FOC 5G','MOD 2024'];
 const props=Object.fromEntries(etiquetas.map(etiqueta=>['CREDGYE_API_'+etiqueta,JSON.stringify({user:USER,pass:SECRET})]));
 const gye=reg({...fuente(props),...ORIGEN_ERP_GYE});
 const r=proponerAsociacionesERP({registros:[gye,reg(fuente({CRED_API_FINI:JSON.stringify({user:USER,pass:SECRET})}))],clientes:[...clientes,{id:'10000000-0000-4000-8000-000000000003',nombre:'ALU'}]});
 assert.deepEqual(r.resumen.grupos_pendientes_de_catalogo,['FOC 5G','MOD 2024','NOKIA']);assert.equal(r.resumen.conexiones_con_grupo_confirmado,8);
 assert.equal(r.conexiones.find(c=>c.etiqueta_credencial==='ALU SWAP').grupo_confirmado_por_usuario,'ALU');assert.equal(r.conexiones.find(c=>c.etiqueta_credencial==='NOKIA5G').grupo_confirmado_por_usuario,'NOKIA');
 assert.equal(r.conexiones.find(c=>c.etiqueta_credencial==='FOC 5G').tipo_cliente,'INDEPENDIENTE');assert.equal(r.conexiones.find(c=>c.etiqueta_credencial==='MOD 2024').tipo_cliente,'INDEPENDIENTE');
 assert.equal(r.conexiones.find(c=>c.etiqueta_credencial==='FINI').grupo_confirmado_por_usuario,null);assert.ok(r.conexiones.every(c=>c.cliente_confirmado===null&&c.codigos_cliente_erp.length===0));
});
