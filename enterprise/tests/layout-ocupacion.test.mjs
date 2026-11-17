import {test} from 'node:test';
import assert from 'node:assert/strict';
import {identificarEstructura,aplicarLayoutFisico,validarPerfilLayout} from '../public/layout-fisico.mjs';
import {generarMapaPosiciones} from '../public/mapa-posiciones.mjs';
import {leerCatalogo} from '../public/catalogos-csv.mjs';
import {csvPosiciones} from './fixtures/catalogos-csv.mjs';
import {sumarLectura} from '../public/borradores-wms.mjs';
import {posicionesWms} from '../src/dominio/posiciones-wms.mjs';
import {leerOcupacionSQL,normalizarOcupacion} from '../src/centro/ocupacion.mjs';
import {validarConector} from '../src/centro/conectores.mjs';
const modelo=rs=>generarMapaPosiciones(leerCatalogo(csvPosiciones(rs),'WTW'));
const perfil={formato:'ims-layout-fisico-v1',sede:'UIO',almacen:'CD_QUITO1',nombre:'Plano sintético',sha256Pdf:'a'.repeat(64),ancho:40,fondo:80,alturaEntrepiso:2.1,alturaEntrepisoConfirmada:false,racks:[{nave:'MZ',literal:'A',piso:1,x:5,y:8,eje:'X'},{nave:'MZ',literal:'A',piso:2,x:5,y:8,eje:'X'}],zonas:[]};
test('semántica: MZ-2A y MZJV son planta alta; BM-A2 es estantería en planta baja',()=>{
 assert.equal(identificarEstructura({posicion:'MZ-2A-01-1'}).piso,2);
 assert.equal(identificarEstructura({posicion:'MZJV-2B-01-1'}).seguridad,true);assert.equal(identificarEstructura({posicion:'MZJV-1B-01-1'}).piso,2);
 assert.equal(identificarEstructura({posicion:'BM-A2-01-1'}).piso,1);
 assert.equal(identificarEstructura({posicion:'BM-A2-01-1'}).tipoVisual,'ESTANTERIA');
 assert.equal(identificarEstructura({posicion:'TRAN_ING'}).tipoVisual,'PISO');assert.notEqual(identificarEstructura({posicion:'MZ-1G-01-1',tipo:'RACK_LIVIANO'}).tipoVisual,'GAVETA');
});
test('el entrepiso usa la misma planta XY y su altura explícita, conserva centímetros y separa plantas',()=>{
 const rs=[1,2].map(n=>({POSICION_COD:'MZ-'+n+'A-01-1',BODEGA:'MZ',CALLE:n+'A',TIPO_POS:'RACK_LIVIANO',LARGO:'60',ANCHO:'240',ALTO:'60'})),base=modelo(rs),antes=JSON.stringify(base),m=aplicarLayoutFisico(base,perfil),[a,b]=m.posiciones;
 assert.equal(JSON.stringify(base),antes);assert.deepEqual([a.x,a.y],[b.x,b.y]);assert.equal(b.z-a.z,2.1);assert.deepEqual(a.dimensionesCm,[60,240,60]);assert.deepEqual([a.dx,a.dy,a.dz],[2.4,.6,.6]);
});
test('gavetas se anidan en el hueco de la estantería; excesos conservan medidas en revisión',()=>{
 const m=aplicarLayoutFisico(modelo([{POSICION_COD:'MZ-1A-01-1',BODEGA:'MZ',CALLE:'1A',TIPO_POS:'RACK_LIVIANO',LARGO:'60',ANCHO:'240',ALTO:'60'},...[1,9,25].map(n=>({POSICION_COD:'MZ-1AG-01-1-'+n,BODEGA:'MZ',CALLE:'1AG',PROFUNDIDAD:String(n),TIPO_POS:'GAVETA',LARGO:'60',ANCHO:'29',ALTO:'26'}))]),perfil);
 const parent=m.posiciones.find(p=>p.tipoVisual==='RACK_LIVIANO'),ds=m.posiciones.filter(p=>p.tipoVisual==='GAVETA');assert.equal(parent.contenedor,true);assert.equal(ds[0].x,parent.x);assert.equal(ds[1].z,.26);assert.equal(ds[2].incompatibleHueco,true);assert.equal(ds[2].origenGeometria,'DISTRIBUCION_PROVISIONAL_CM');assert.deepEqual(ds[2].dimensionesCm,[60,29,26]);
});
test('niveles de rack ausentes no se comprimen; piso y profundidades no se superponen',()=>{
 const m=aplicarLayoutFisico(modelo([{POSICION_COD:'BM-A-01-3',BODEGA:'BM',ALTO:'135',NIVEL:'3'},...[1,2].map(n=>({POSICION_COD:'PISO-'+n,BODEGA:'PISO',TIPO_POS:'PISO',NIVEL:String(n)})),...[0,1].map(n=>({POSICION_COD:'OTRO-'+n,BODEGA:'OTRO',PROFUNDIDAD:n?'1':''}))]));assert.equal(m.posiciones.find(p=>p.posicion==='BM-A-01-3').z,2.7);const ps=m.posiciones.filter(p=>p.nave==='PISO');assert.notEqual(ps[0].y,ps[1].y);const ds=m.posiciones.filter(p=>p.nave==='OTRO');assert.notEqual(ds[0].y,ds[1].y);
});
test('perfil rechaza anclas duplicadas y zonas fuera del plano',()=>{
 assert.throws(()=>validarPerfilLayout({...perfil,racks:[perfil.racks[0],perfil.racks[0]]}));assert.throws(()=>validarPerfilLayout({...perfil,zonas:[{nombre:'Fuera',x:39,y:0,ancho:2,fondo:1}]}));
});
test('lecturas rápidas suman exactamente una unidad, una cantidad explícita reemplaza y cero se conserva',()=>{
 assert.equal(sumarLectura('9007199254740993.000000001'),'9007199254740994.000000001');assert.equal(sumarLectura('5.5','1'),'6.5');assert.equal(sumarLectura('5','0'),'0');assert.equal(sumarLectura('5','2.25'),'2.25');assert.throws(()=>sumarLectura('1','1.000.000'));
});
test('estado del mapa sigue WMS y protege diferencias en conteo ciego',()=>{
 const filas=[{sku:'A',posicion:'P',depot:'2',conteo_1:'0',conteo_2:null,conteo_final:null,ajuste:'0'},{sku:'B',posicion:'P',depot:'1',conteo_1:'2',conteo_2:null,conteo_final:null,ajuste:'0'}];assert.equal(posicionesWms(filas)[0].categoria,'MIXTO (Falt/Sob)');const c=posicionesWms(filas,{ciego:true})[0];assert.equal(c.c1,2);assert.equal(c.faltantes,undefined);assert.equal(c.categoria,'COMPLETADAS');
});
export const filaSQL=Object.fromEntries(['POSICION_ID','POSICION_COD','BODEGA','CALLE','COLUMNA','NIVEL','PROFUNDIDAD','COD_CLIENTE','STATUS_OCUPACION','TIPO_POS','ALMACEN','CIUDAD','POS_LOCKEADA','ORDEN_PICKING','ORDEN_LOCATOR','LARGO','ANCHO','ALTO','VOLUMEN','PESO','PICKING','ABASTECIBLE','BESTFIT','BESTFIT_PERMITE_ABAST','PCJ_OCUPACION'].map(k=>[k,({POSICION_COD:'BM-A-01-1',BODEGA:'BM',ALMACEN:'CD_QUITO1',CIUDAD:'QUITO',STATUS_OCUPACION:'OCUPADA'})[k]??0]));
const permisos={instancia:'DEPOTWMS',admin:0,propietario:0,puede_leer:1,puede_vista:1,puede_modificar:0,puede_insertar:0,puede_borrar:0};
test('SQL Server usa puerto explícito, cifrado y solo las dos SELECT fijas; cierra conexión',async()=>{
 const consultas=[];let config,cerrada=false;const driver={ConnectionPool:class{constructor(c){config=c;}async connect(){return this;}request(){return {query:async q=>{consultas.push(q);return {recordset:consultas.length===1?[permisos]:[filaSQL]};}};}async close(){cerrada=true;}}};const r=await leerOcupacionSQL({host:'192.0.2.12',puerto:1433,usuario:'lector',password:'sintetica',base:'DEPOT'},{driver});assert.equal(r.length,1);assert.equal(config.options.readOnlyIntent,true);assert.equal(config.options.encrypt,true);assert.equal(config.options.trustServerCertificate,false);assert.equal(config.port,1433);assert.equal(consultas.length,2);assert.match(consultas[1],/SELECT TOP \(50001\)/);assert.doesNotMatch(consultas[1],/\b(?:UPDATE|INSERT|DELETE|EXEC|CREATE|ALTER)\b/i);assert.equal(cerrada,true);
});
test('rechaza cuenta de escritura antes de leer posiciones; errores no exponen la contraseña',async()=>{
 let consultas=0,cerrada=false;const driver={ConnectionPool:class{async connect(){return this;}request(){return {query:async()=>{consultas++;return {recordset:[{...permisos,puede_modificar:1}]};}};}async close(){cerrada=true;}}};await assert.rejects(()=>leerOcupacionSQL({},{driver}),e=>e.codigo==='CUENTA_SQL_NO_LECTORA');assert.equal(consultas,1);assert.equal(cerrada,true);const fallo={ConnectionPool:class{async connect(){throw Error('password=NO_PUBLICAR');}async close(){}}};await assert.rejects(()=>leerOcupacionSQL({},{driver:fallo}),e=>e.codigo==='CONEXION_OCUPACION_NO_CONFIRMADA'&&!e.message.includes('NO_PUBLICAR'));
});
test('una extracción vacía o truncada no sustituye ocupación; conexión valida rechaza sa',()=>{
 assert.throws(()=>normalizarOcupacion([]));assert.throws(()=>normalizarOcupacion([{}]));assert.throws(()=>normalizarOcupacion(Array(50001).fill(filaSQL)));assert.throws(()=>validarConector('OCUPACION_SQL_UIO',{host:'192.0.2.12',usuario:'sa',password:'x'}));
});

test('MZ de cinco niveles adapta arriba a 30 cm y mantiene 60 cm originales sin superponer pisos',()=>{
 const m=aplicarLayoutFisico(modelo([1,2,3,4,5].map(n=>({POSICION_COD:'MZ-1A-01-'+n,BODEGA:'MZ',CALLE:'1A',TIPO_POS:'RACK_LIVIANO',NIVEL:String(n),LARGO:'60',ANCHO:'240',ALTO:'60'}))),perfil),ps=m.posiciones.sort((a,b)=>a.z-b.z);
 assert.deepEqual(ps.map(p=>p.dz),[.6,.6,.3,.3,.3]);assert.ok(ps.at(-1).z+ps.at(-1).dz<=2.100001);assert.ok(ps.every(p=>p.dimensionesCm[2]===60));assert.equal(ps.filter(p=>p.alturaVisualProvisional).length,3);assert.equal(identificarEstructura({posicion:'MZ-1AG-01-1-1',tipo:'SIN_ASIGNAR_TIPO'}).tipoVisual,'GAVETA');
});

test('cotejo Google pide solo el permiso opcional de lectura y acepta únicamente proyectos autorizados',async()=>{
 const {parametrosGoogle,SCOPES_GOOGLE}=await import('../src/centro/google-oauth.mjs'),{leerCodigoGoogle,PROYECTOS_ORIGEN,SCOPE_CODIGO}=await import('../src/centro/codigo-origen.mjs');assert.ok(!parametrosGoogle({clienteId:'sintetico',correo:'a@sintetico.invalid'},'https://ims.sintetico.invalid','estado','pkce').get('scope').includes(SCOPE_CODIGO));assert.ok(parametrosGoogle({permitirScripts:true},'https://ims.sintetico.invalid','estado','pkce').get('scope').includes(SCOPE_CODIGO));assert.ok(!SCOPES_GOOGLE.includes(SCOPE_CODIGO));let peticiones=0;await assert.rejects(()=>leerCodigoGoogle({scriptsLectura:true},'PROYECTO_AJENO',async()=>{peticiones++;}));assert.equal(peticiones,0);const ids=Object.values(PROYECTOS_ORIGEN);assert.equal(ids.length,3);
});
test('cotejo del código lee contenido, sin propiedades ni modificaciones a Google',async()=>{
 const {leerCodigoGoogle,PROYECTOS_ORIGEN}=await import('../src/centro/codigo-origen.mjs'),requests=[],files=[{name:'Reglas',type:'SERVER_JS',source:'function contar() {}'}],r=await leerCodigoGoogle({scriptsLectura:true,clienteId:'id',clienteSecreto:'SECRETO_SINTETICO',refreshToken:'TOKEN_SINTETICO'},PROYECTOS_ORIGEN.INTERFAZ,async(url,o)=>{requests.push({url,method:o.method});return requests.length===1?{ok:true,json:async()=>({access_token:'TOKEN_SINTETICO'})}:{ok:true,text:async()=>JSON.stringify({files})};});assert.deepEqual(r,files);assert.deepEqual(requests.map(r=>r.method),['POST','GET']);assert.match(requests[1].url,/\/content$/);assert.ok(!requests.some(r=>/properties|deployments/.test(r.url)));
});
test('no activa ocupación de otra instancia que responda en el mismo puerto',async()=>{let consultas=0;const driver={ConnectionPool:class{async connect(){return this;}request(){return {query:async()=>{consultas++;return {recordset:[{...permisos,instancia:'OTRA'}]};}};}async close(){}}};await assert.rejects(()=>leerOcupacionSQL({},{driver}),e=>e.codigo==='INSTANCIA_SQL_NO_CONFIRMADA');assert.equal(consultas,1);});
