import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,symlink,rename,chmod} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validarPaqueteAbiertos,copiarPreparacionAbiertos} from '../src/migracion/copia-abiertos.mjs';
import {paqueteCopia} from './fixtures/paquete-copia-abiertos.mjs';
test('paquete conserva SKU repetido, cero, ausencia, notas y copia fuera de selección sin activar',async t=>{
 const f=await paqueteCopia(t),p=await validarPaqueteAbiertos(f.dir);assert.equal(p.copiaId,f.copiaId);assert.deepEqual(p.cantidades,[3,1]);assert.deepEqual(p.ambitos.SELECCION_ACTUAL,{productos:2,auxiliares:1});assert.deepEqual(p.ambitos.FUERA_SELECCION_CONSERVADO,{productos:1,auxiliares:0});
 const rows=(await readFile(path.join(f.dir,'lineas_candidatas_NO_IMPORTAR.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);assert.equal(rows[0].sku_propuesto,rows[1].sku_propuesto);assert.notEqual(rows[0].referencia_copia,rows[1].referencia_copia);assert.equal(rows[0].cantidades.c1.valor_decimal,'0.000000000');assert.equal(rows[1].cantidades.c1.valor_decimal,null);assert.equal(rows[0].cantidades.depot.valor_decimal,'9007199254740993.123456789');
});
test('un archivo alterado o enlace no adquiere conexión ni ejecuta SQL',async t=>{
 for(const modo of ['alterado','enlace','permisos']){
  const f=await paqueteCopia(t),file=path.join(f.dir,'lineas_candidatas_NO_IMPORTAR.jsonl');
  if(modo==='alterado')await writeFile(file,(await readFile(file,'utf8'))+' ');else if(modo==='permisos')await chmod(file,0o644);else{await rename(file,file+'.privado');await symlink(file+'.privado',file);}
  let conexiones=0;await assert.rejects(copiarPreparacionAbiertos({directorio:f.dir,pool:{getConnection(){conexiones++;throw Error('No debe conectar.');}}}));assert.equal(conexiones,0);
 }
});
test('filas repetidas, una referencia falsa o una aprobación manipulada no se copian aunque se reescriba su hash',async t=>{
 for(const modo of ['duplicado','referencia','aprobado']){
  const f=await paqueteCopia(t),rows=[...f.filas];if(modo==='duplicado')rows.push(rows[0]);else if(modo==='referencia')rows[0].referencia_copia='0'.repeat(64);else rows[0].aprobado_para_importar=true;
  const raw=rows.map(r=>JSON.stringify(r)+'\n').join('');await writeFile(path.join(f.dir,'lineas_candidatas_NO_IMPORTAR.jsonl'),raw);f.manifest.archivos_sha256['lineas_candidatas_NO_IMPORTAR.jsonl']=createHash('sha256').update(raw).digest('hex');await writeFile(path.join(f.dir,'preparacion_NO_IMPORTAR.json'),JSON.stringify(f.manifest));await assert.rejects(validarPaqueteAbiertos(f.dir));
 }
});
test('perfil ajeno se rechaza antes de crear tablas',async t=>{
 const f=await paqueteCopia(t),sql=[];const c={query:async q=>{sql.push(q);return [[{nombre:'rrhh_itsanet',usuario:'ims_cm_migracion@127.0.0.1',version:'8.0.46'}]];},release(){}};
 await assert.rejects(copiarPreparacionAbiertos({directorio:f.dir,pool:{getConnection:async()=>c}}),e=>e.codigo==='DESTINO_NO_PERMITIDO');assert.equal(sql.length,1);assert.ok(!sql.some(q=>/CREATE|INSERT|UPDATE/.test(q)));
});
