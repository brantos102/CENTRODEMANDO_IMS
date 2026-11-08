import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {crearCorte} from './fixtures/corte.mjs';
import {sha} from '../src/migracion/modelo.mjs';
import {hashFile} from '../tools/importar-snapshot.mjs';
import {textoFilaFirma,firmaFilas,verificarFirmas,prepararRecetaFirmas} from '../tools/verificar-firmas-procedencia.mjs';

async function fixture({malaFirma=false,dosCorridas=false,ambiguo=false,mezclar=true,nombresDistintos=false}={}){
  const f=await crearCorte({mutarInv:(rows,orig)=>rows.forEach(r=>{r.celdas.find(c=>c.columna===3).valor='26010'+(orig.indexOf(r.origen_drive)+1)+'_PRUEBA';})});
  const panelFile=path.join(f.cut,'hoja_001.jsonl'),invFile=path.join(f.cut,'hoja_002.jsonl');
  const panel=(await readFile(panelFile,'utf8')).trim().split('\n').map(JSON.parse);
  panel.slice(1).forEach((r,i)=>r.celdas.find(c=>c.columna===2).valor='26010'+(i+1)+'_PRUEBA');
  if(ambiguo)panel[2].celdas.find(c=>c.columna===2).valor='260101_PRUEBA';
  if(nombresDistintos){panel[1].celdas.find(c=>c.columna===2).valor='260199_ARCHIVADO';panel[3].celdas.find(c=>c.columna===2).valor='260101_PRUEBA';}
  const original=(await readFile(invFile,'utf8')).trim().split('\n').map(JSON.parse);
  const cell=(columna,valor)=>({columna,tipo:'s',valor:String(valor),estilo:'0'});
  const reg=[{fila:1,origen_drive:null,celdas:['Clave','Firma','Archivo Drive','Filas','Tabla','Corrida'].map((s,i)=>cell(i+1,s)),notas:{}}];
  for(let i=0;i<4;i++){
    const rows=original.slice(1).filter(r=>r.origen_drive===f.origenes[i]);
    // Las celdas de esta fixture son texto o números representados exactamente;
    // la firma esperada se construye desde los valores previos al cambio de nota.
    const d=new Map(rows[0].celdas.map(c=>[c.columna,c.valor]));
    const texts=rows.map(r=>{const d=new Map(r.celdas.map(c=>[c.columna,c.valor]));const v=Array.from({length:30},(_,j)=>d.get(j+1)??'');while(v.length&&v.at(-1)==='')v.pop();return JSON.stringify(v);});
    const key=JSON.stringify(['INV',JSON.stringify([d.get(3),d.get(5),'']),'']);
    const signature=malaFirma&&i===0?'0'.repeat(64):sha(texts.sort().join('\n'));
    reg.push({fila:i+2,origen_drive:null,celdas:[key,signature,f.origenes[i],rows.length,'INV',dosCorridas&&i===1?'otra':'misma'].map((s,j)=>cell(j+1,s)),notas:{}});
  }
  if(mezclar){original[2].origen_drive=f.origenes[1];original[2].notas={C3:'IMS_ORIGEN_DRIVE='+f.origenes[1]};}
  for(const [filename,rows] of [['hoja_001.jsonl',panel],['hoja_002.jsonl',original],['hoja_005.jsonl',reg]]){
    const body=rows.map(r=>JSON.stringify(r)+'\n').join('');await writeFile(path.join(f.cut,filename),body);
    let sheet=f.manifest.hojas.find(s=>s.archivo===filename);
    if(!sheet){sheet={nombre:'__CONSOL_IDENTIDADES',archivo:filename,filas_almacenadas:rows.length};f.manifest.hojas.push(sheet);}
    sheet.sha256=sha(body);
    if(sheet.nombre==='INVENTARIOS'){sheet.filas_por_origen={};for(const r of rows.slice(1))sheet.filas_por_origen[r.origen_drive]=(sheet.filas_por_origen[r.origen_drive]||0)+1;}
  }
  await writeFile(path.join(f.cut,'manifest.json'),JSON.stringify(f.manifest));return f;
}
test('normalización de firma coincide con un vector calculado por el consolidador real',()=>{
  const row=(values)=>({celdas:values.map(([tipo,valor],i)=>({columna:i+1,tipo,valor}))});
  const a=row([['s','000123'],['n','1.0'],['b','1'],['s','á'],['s','']]);
  const b=row([['s','000124'],['n','1e21'],['b','0'],['s','😀'],['s',null]]);
  assert.equal(firmaFilas([textoFilaFirma(a),textoFilaFirma(b)]),'27b18a1d34eed5196b17023f3ea33c204d3a4ae3c2e2e1901dfb060b72801979');
});
test('solo crea receta tras conciliar todos los archivos que dan o reciben filas',async()=>{
  const f=await fixture();try{
    const antes=await hashFile(path.join(f.cut,'hoja_002.jsonl'));
    const r=await prepararRecetaFirmas({corteDir:f.cut,salidaDir:path.join(f.dir,'verificacion'),snapshotEsperado:f.manifest.snapshot_id,cambiosEsperados:1});
    assert.equal(r.cambios_verificados,1);assert.equal(r.archivos_verificados.length,2);assert.ok(r.archivos_verificados.every(x=>x.firmas_coinciden));
    const receta=JSON.parse(await readFile(r.archivo_receta,'utf8'));assert.deepEqual(receta.bloques,[[3,3,3,2]]);
    assert.equal(await hashFile(path.join(f.cut,'hoja_002.jsonl')),antes);
    assert.equal(JSON.stringify(r).includes('VALOR_SENSIBLE_SINTETICO'),false);assert.equal(JSON.stringify(r).includes(f.origenes[0]),false);
  }finally{await f.close();}
});
test('firma de contenido distinta impide emitir la receta',async()=>{
  const f=await fixture({malaFirma:true});try{
    const out=path.join(f.dir,'no_crear');
    await assert.rejects(prepararRecetaFirmas({corteDir:f.cut,salidaDir:out,snapshotEsperado:f.manifest.snapshot_id,cambiosEsperados:1}),/contenido completo/);
    await assert.rejects(stat(out),{code:'ENOENT'});
  }finally{await f.close();}
});
test('no infiere destino por código cuando varios archivos comparten el nombre',async()=>{
  const f=await fixture({ambiguo:true});try{await assert.rejects(verificarFirmas(f.cut,f.manifest.snapshot_id,1),/cantidad de propuestas/);}finally{await f.close();}
});
test('corridas mezcladas y un corte distinto se rechazan',async()=>{
  const f=await fixture({dosCorridas:true});try{
    await assert.rejects(verificarFirmas(f.cut,f.manifest.snapshot_id,1),/más de una corrida/);
    await assert.rejects(verificarFirmas(f.cut,'0'.repeat(64),1),/corte es diferente/);
  }finally{await f.close();}
});
test('un nombre de archivo distinto no autoriza reasignar una fuente que tiene un solo código',async()=>{
  const f=await fixture({mezclar:false,nombresDistintos:true});try{
    await assert.rejects(verificarFirmas(f.cut,f.manifest.snapshot_id,2),/cantidad de propuestas/);
  }finally{await f.close();}
});
