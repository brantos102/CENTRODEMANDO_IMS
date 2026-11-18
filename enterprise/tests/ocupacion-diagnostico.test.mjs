import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticoOcupacion,errorOcupacion} from '../src/centro/ocupacion-diagnostico.mjs';
import {leerOcupacionSQL} from '../src/centro/ocupacion.mjs';
const secreto='PASSWORD_Y_SQL_PRIVADOS_NO_MOSTRAR';
const config={host:'192.0.2.12',puerto:15433,base:'SINTETICA',usuario:'lector',password:secreto};
test('distingue rechazo de login, base, TCP y certificado por códigos del controlador sin publicar sus mensajes',()=>{
 for(const [origen,codigo]of [[{code:'ELOGIN'},'SQL_AUTENTICACION_RECHAZADA'],[{code:'ELOGIN',originalError:{info:{number:4060}}},'SQL_BASE_NO_DISPONIBLE'],[{code:'ESOCKET',cause:{code:'ECONNREFUSED'}},'SQL_RED_NO_DISPONIBLE'],[{code:'ESOCKET',originalError:{code:'CERT_HAS_EXPIRED'}},'SQL_TLS_NO_CONFIRMADO'],[{code:'ETIMEOUT'},'SQL_TIEMPO_AGOTADO'],[{code:'EREQUEST',number:229},'SQL_PERMISOS_INSUFICIENTES'],[{code:'EREQUEST',number:208},'SQL_OBJETO_NO_DISPONIBLE']]){
  const e=errorOcupacion(Object.assign(Error(secreto),origen),'CONEXION');assert.equal(e.codigo,codigo);assert.ok(!JSON.stringify(e).includes(secreto));assert.ok(!e.message.includes(secreto));
 }
});
test('una conexión rechazada conserva etapa, cierra el pool y nunca devuelve consultas ni credenciales',async()=>{
 let cerrada=false,visto;const driver={ConnectionPool:class{constructor(c){visto=c;}async connect(){throw Object.assign(Error(secreto),{code:'ELOGIN'});}async close(){cerrada=true;}}};
 await assert.rejects(leerOcupacionSQL(config,{driver}),e=>e.codigo==='SQL_AUTENTICACION_RECHAZADA'&&e.diagnosticoOcupacion.etapa==='CONEXION'&&!JSON.stringify(e).includes(secreto));assert.equal(cerrada,true);assert.equal(visto.port,15433);assert.equal(visto.options.encrypt,true);
});
test('errores de consulta conservan su etapa y no se confunden con credenciales incorrectas',async()=>{
 let n=0,cerrada=false;const driver={ConnectionPool:class{async connect(){return this;}request(){return {query:async()=>{if(++n===1)return {recordset:[{instancia:'DEPOTWMS',admin:0,propietario:0,puede_leer:1,puede_vista:1,puede_modificar:0,puede_insertar:0,puede_borrar:0}]};throw Object.assign(Error(secreto),{code:'EREQUEST',number:208});}};}async close(){cerrada=true;}}};
 await assert.rejects(leerOcupacionSQL(config,{driver}),e=>e.codigo==='SQL_OBJETO_NO_DISPONIBLE'&&e.diagnosticoOcupacion.etapa==='CONSULTA');assert.equal(cerrada,true);
});
test('cuenta de escritura e instancia distinta conservan sus rechazos con explicación segura',async()=>{
 for(const [p,codigo]of [[{instancia:'OTRA'},'INSTANCIA_SQL_NO_CONFIRMADA'],[{instancia:'DEPOTWMS',admin:0,propietario:0,puede_leer:1,puede_vista:1,puede_modificar:1},'CUENTA_SQL_NO_LECTORA']]){
  let n=0;const driver={ConnectionPool:class{async connect(){return this;}request(){return {query:async()=>{n++;return {recordset:[p]};}};}async close(){}}};await assert.rejects(leerOcupacionSQL(config,{driver}),e=>e.codigo===codigo&&e.diagnosticoOcupacion.etapa==='PERMISOS');assert.equal(n,1);
 }
});
test('diagnóstico descarta textos, códigos, fases y números ajenos a las listas permitidas',()=>{
 const d=diagnosticoOcupacion({codigo:secreto,diagnosticoOcupacion:{etapa:secreto,codigo:secreto,controlador:secreto,numero_sql:123456,mensaje:secreto,password:secreto}},'CONEXION');assert.equal(d.codigo,'CONEXION_OCUPACION_NO_CONFIRMADA');assert.equal(d.etapa,'CONEXION');assert.ok(!JSON.stringify(d).includes(secreto));assert.equal(d.controlador,undefined);assert.equal(d.numero_sql,undefined);
});

test('acepta el servidor de SSMS con DEPOTWMS y conserva puerto explícito; rechaza otra instancia',async()=>{
 const {validarConector}=await import('../src/centro/conectores.mjs'),c={host:'192.0.2.12\\DEPOTWMS',puerto:49341,base:'SINTETICA',usuario:'lector',password:'SINTETICA'},r=validarConector('OCUPACION_SQL_UIO',c);assert.equal(r.host,'192.0.2.12');assert.equal(r.instancia,'DEPOTWMS');assert.equal(r.puerto,49341);assert.equal(validarConector('OCUPACION_SQL_UIO',{...c,host:'192.0.2.12\\depotwms'}).host,r.host);assert.throws(()=>validarConector('OCUPACION_SQL_UIO',{...c,host:'192.0.2.12\\OTRA'}));assert.throws(()=>validarConector('OCUPACION_SQL_UIO',{...c,host:'192.0.2.12\\DEPOTWMS\\OTRA'}));
});
