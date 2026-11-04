import {test} from 'node:test';
import assert from 'node:assert/strict';
import {crearHashPassword,verificarPassword,correoCanonico,tokenOpaco,sha256,tokensIguales} from '../src/auth/credenciales.mjs';
import {COOKIE,tokenDeCookie,origenPublico} from '../src/http/api.mjs';
import {configuracionApi} from '../src/servir.mjs';

test('scrypt verifica contraseña y genera sales distintas sin guardar el texto original',async()=>{
  const password='Clave_sintetica_2026!',a=await crearHashPassword(password),b=await crearHashPassword(password);
  assert.notEqual(a,b);assert.equal(a.includes(password),false);
  assert.equal(await verificarPassword(password,a),true);assert.equal(await verificarPassword('otra_clave_larga',a),false);
});
test('cuentas nuevas rechazan claves cortas; hashes ajenos o parámetros alterados no se ejecutan',async()=>{
  await assert.rejects(crearHashPassword('1234'),e=>e.codigo==='PASSWORD_INVALIDO');
  assert.equal(await verificarPassword('clave','scrypt$v1$999999999$8$1$00$00'),false);
  assert.equal(await verificarPassword('clave',null),false);
});
test('correo se normaliza sin admitir valores ambiguos o fuera de tamaño',()=>{
  assert.equal(correoCanonico('  OPERADOR@Prueba.invalid  '),'operador@prueba.invalid');
  for(const v of [null,'a@@b.invalid','a b@c.invalid','sin-correo','x'.repeat(255)+'@a.invalid'])assert.throws(()=>correoCanonico(v));
});
test('tokens opacos tienen formato fijo y comparación estricta',()=>{
  const a=tokenOpaco(),b=tokenOpaco();assert.equal(a.length,43);assert.notEqual(a,b);
  assert.equal(tokensIguales(a,a),true);assert.equal(tokensIguales(a,b),false);
  assert.equal(tokensIguales(a,undefined),false);assert.equal(sha256(a).length,64);assert.notEqual(sha256(a),a);
});
test('cookie propia no acepta sesiones de otras aplicaciones ni valores duplicados',()=>{
  const token=tokenOpaco();assert.equal(tokenDeCookie(`otra=123; ${COOKIE}=${token}`),token);
  assert.equal(tokenDeCookie('session=123'),undefined);
  assert.equal(tokenDeCookie(`${COOKIE}=${token}; ${COOKIE}=otro`),undefined);
});
test('origen HTTPS conserva el puerto y rechaza credenciales o rutas',()=>{
  assert.equal(origenPublico('https://apps.flexnetuio.com:8445/'),'https://apps.flexnetuio.com:8445');
  for(const v of ['http://apps.flexnetuio.com:8445','https://a:b@apps.flexnetuio.com/','https://apps.flexnetuio.com/ruta','https://apps.flexnetuio.com/?x=1'])
    assert.throws(()=>origenPublico(v));
});
test('inicio requiere habilitación expresa y no admite host público ni puertos reservados',()=>{
  const env={IMS_API_HABILITADA:'1',IMS_PUBLIC_URL:'https://apps.flexnetuio.com:8445'};
  assert.equal(configuracionApi(env).port,3003);
  assert.throws(()=>configuracionApi({...env,IMS_API_HABILITADA:''}));
  assert.throws(()=>configuracionApi({...env,IMS_HOST:'0.0.0.0'}));
  for(const port of [3000,3001,3002,8000,8010,8080,8443,8444])assert.throws(()=>configuracionApi({...env,IMS_PORT:String(port)}));
});
