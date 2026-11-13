import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {paqueteOperativo} from './fixtures/operativos-abiertos.mjs';
import {validarPlanAbierto,importarAbiertos,idImportacion} from '../src/migracion/importar-abiertos.mjs';
test('plan operativo mantiene conteos separados, ceros, decimales grandes y stock pendiente sin código o fecha',async t=>{
 const f=await paqueteOperativo(t),v=await validarPlanAbierto(f.solicitud);assert.equal(v.inventarios.size,2);assert.equal(v.pendientes.size,1);assert.equal(v.total,5);assert.equal(v.inventarios.get(f.inv1).lineas[0].conteo_1,'0.000000000');assert.equal(v.inventarios.get(f.inv1).lineas[1].conteo_1,null);assert.equal(v.inventarios.get(f.inv1).lineas[0].depot,'9007199254740993.123456789');assert.ok([...v.pendientes.values()][0].lineas.every(l=>l.fecha_inicio===null&&l.codigo_original===null));
});
test('hash de plan distinto o proyecciones alteradas se rechazan antes de adquirir conexión',async t=>{
 for(const modo of ['plan','lineas']){const f=await paqueteOperativo(t);if(modo==='plan')f.solicitud.planId='0'.repeat(64);else{const file=path.join(f.planDir,'lineas_operativas_NO_ACTIVAR.jsonl');await writeFile(file,(await readFile(file,'utf8'))+' ');}let conexiones=0;await assert.rejects(importarAbiertos({...f.solicitud,actorId:randomUUID(),correo:'x@sintetico.invalid',pool:{getConnection(){conexiones++;throw Error('PROHIBIDO');}}}));assert.equal(conexiones,0);}
});
test('no habilita un plan con bloqueos, delta obligatorio o una captura en un pendiente aunque se recalculen hashes',async t=>{
 for(const modo of ['bloqueo','delta','pendiente']){
  const f=await paqueteOperativo(t);if(modo==='bloqueo')f.p.fuentes[0].bloqueos={CANTIDAD_NO_INTERPRETADA:1};else if(modo==='delta')f.p.requiere_delta_final=true;else{f.lineas[3].conteo_1='0.000000000';const raw=f.lineas.map(l=>JSON.stringify(l)+'\n').join('');await writeFile(path.join(f.planDir,'lineas_operativas_NO_ACTIVAR.jsonl'),raw);f.p.proyecciones_sha256=createHash('sha256').update(raw).digest('hex');}
  const raw=JSON.stringify(f.p);await writeFile(path.join(f.planDir,'plan_operativo_NO_ACTIVAR.json'),raw);f.solicitud.planId=createHash('sha256').update(raw).digest('hex');await assert.rejects(validarPlanAbierto(f.solicitud));
 }
});
test('identificador del libro de importación es estable y cambia para otro plan o copia',()=>{
 const a=idImportacion('importar',['corte','copia','plan']);assert.equal(a,idImportacion('importar',['corte','copia','plan']));assert.notEqual(a,idImportacion('importar',['corte','otra','plan']));
});
