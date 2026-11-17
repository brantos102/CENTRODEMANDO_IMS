import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticoOperacion,verificarRuntime} from '../tools/preparar-operacion.mjs';
test('diagnóstico de perfil conserva solo etapa y código conocido, sin mensaje SQL o credenciales',()=>{
 const r=diagnosticoOperacion({code:'ER_TOO_MANY_USER_CONNECTIONS',message:'password=NO_PUBLICAR',sql:'SELECT CLAVE_PRIVADA'},'CONEXION');assert.equal(r.codigo_error,'ER_TOO_MANY_USER_CONNECTIONS');assert.equal(r.etapa,'CONEXION');assert.equal(diagnosticoOperacion({code:'ER_USER_LIMIT_REACHED',message:"User 'PRIVADO' has exceeded the 'max_user_connections' resource"},'CONEXION').recurso_limite,'max_user_connections');assert.ok(!JSON.stringify(diagnosticoOperacion({code:'ER_USER_LIMIT_REACHED',message:"User 'PRIVADO' exceeded 'max_connections'"},'CONEXION')).includes('PRIVADO'));assert.ok(!JSON.stringify(r).includes('PRIVADA'));assert.ok(!JSON.stringify(r).includes('NO_PUBLICAR'));assert.equal(diagnosticoOperacion({code:'CLAVE_PRIVADA'},'ETAPA_PRIVADA').codigo_error,'VERIFICACION_NO_CONFIRMADA');
});
test('verificación operativa sigue exigiendo la cuenta de producción y solo consulta el histórico',async()=>{
 const queries=[],c={query:async sql=>{queries.push(sql);return sql.startsWith('SELECT DATABASE')?[[{nombre:'centromando_ims_ensayo',usuario:'ims_cm_operacion@127.0.0.1'}]]:sql.includes('COUNT(DISTINCT')?[[{conteos:352,filas:97822}]]:[[]];}};assert.deepEqual((await verificarRuntime(c)).historico,{conteos:352,filas:97822});assert.ok(queries.every(q=>q.startsWith('SELECT ')));await assert.rejects(()=>verificarRuntime({query:async()=>[[{nombre:'centromando_ims_ensayo',usuario:'root@localhost'}]]}),e=>e.code==='PERFIL_OPERACION_INCOMPATIBLE');
});
