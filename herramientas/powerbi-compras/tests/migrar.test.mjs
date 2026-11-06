import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {zipSync,strToU8} from 'fflate';
import {construir,migrar,abrirPlantilla,leerJson,textoM} from '../migrar.mjs';
const json=x=>new Uint8Array(Buffer.from(JSON.stringify(x),'utf16le'));
function tabla(name,source,columns=[],measures=[]){return {name,columns:columns.map(name=>({name,dataType:'string'})),measures,partitions:[{name,source:{type:'m',expression:source}}]};}
function fixture(){
 const worked={compatibilityLevel:1600,model:{tables:[
   tabla('Compras','let\n Origen = LeerHoja("BASE KPIS", {"Fecha"}, "W10="),\n FechasValidadas = Table.TransformColumns(NumerosValidados, {{"Fecha", each Date.From(_), type date}}),\n Resultado = FechasValidadas\nin Resultado',['Fecha','Importe'],[{name:'Total Compras',expression:'SUM(Compras[Importe])'}]),
   tabla('Ahorros','let\n Origen = LeerHoja("AHORROS", {"FECHA"}, "W10="),\n FechasValidadas = Table.TransformColumns(NumerosValidados, {{"Fecha", each Date.From(_), type date}}),\n Resultado = FechasValidadas\nin Resultado',['Fecha']),
   tabla('DistribucionCiudad','Compras',['Fecha']),tabla('Calendario','Compras',['Fecha'])],
   expressions:[{name:'LeerNumero',kind:'m',expression:'(x)=>x'},{name:'pOrigen',kind:'m',expression:'"Snapshot"'}],
   relationships:[{fromTable:'Compras',fromColumn:'Fecha',toTable:'Calendario',toColumn:'Fecha'}],annotations:[{name:'PBI_QueryOrder',value:'[]'}]}};
 const source=gid=>`let Origen=Csv.Document(Web.Contents("https://docs.google.com/spreadsheets/d/e/PRUEBA/pub?gid=${gid}&output=csv")) in Origen`;
 const final={name:'ID_FINAL',compatibilityLevel:1600,model:{tables:[tabla('Consulta',source(1)),tabla('Compras',source(2))]}};
 const files={Version:strToU8('1.32'),Settings:json({Version:4}),Metadata:json({Version:5}),
   DataModelSchema:json(worked),'[Content_Types].xml':strToU8('<Types/>'),UnappliedChanges:strToU8('CACHÉ_SENSIBLE_ANTIGUA'),Connections:strToU8('DATASET_ANTERIOR'),SecurityBindings:strToU8('FIRMA_ANTERIOR'),
   'Report/definition/pages/pages.json':strToU8(JSON.stringify({pageOrder:['p1']})),
   'Report/definition/pages/p1/page.json':strToU8(JSON.stringify({displayName:'Consolidado'})),
   'Report/definition/pages/p1/visuals/v1/visual.json':strToU8(JSON.stringify({field:{Measure:{Expression:{SourceRef:{Entity:'Compras'}},Property:'Total Compras'}}})),
   'Report/StaticResources/RegisteredResources/tema.json':strToU8('{}')};
 return {worked,final,files,pack:()=>({w:zipSync({...files,DataModelSchema:json(worked)}),f:zipSync({...files,DataModelSchema:json(final)})})};
}
test('conserva informe, medidas y relaciones, con las dos fuentes M finales intactas',()=>{
 const f=fixture(),{w,f:final}=f.pack(),r=construir(w,final),s=leerJson(r.files.DataModelSchema),m=s.model;
 assert.equal(s.name,'ID_FINAL');assert.equal(r.resumen.medidas,1);
 for(const name of Object.keys(f.files).filter(n=>n.startsWith('Report/')))assert.deepEqual(r.files[name],f.files[name]);
 assert.deepEqual(m.tables[0].measures,f.worked.model.tables[0].measures);assert.deepEqual(m.relationships,f.worked.model.relationships);
 assert.deepEqual(m.expressions.find(e=>e.name==='Origen_Consulta_Web').expression,f.final.model.tables[0].partitions[0].source.expression);
 assert.deepEqual(m.expressions.find(e=>e.name==='Origen_Cotizaciones_Web').expression,f.final.model.tables[1].partitions[0].source.expression);
 assert.ok(textoM(m.tables[0].partitions[0].source.expression).includes('PrepararBaseWeb(Origen_Consulta_Web'));
 assert.equal(r.resumen.referencias_visuales_verificadas,1);
});
test('elimina cambios pendientes, conexión al dataset anterior y copia incrustada',()=>{
 const f=fixture(),p=f.pack(),r=construir(p.w,p.f),m=leerJson(r.files.DataModelSchema).model;
 for(const name of ['UnappliedChanges','Connections','SecurityBindings','DiagramLayout'])assert.equal(r.files[name],undefined);
 const text=JSON.stringify(m);assert.equal(/LeerHoja\(|Binary.FromText|pOrigen|W10=/.test(text),false);
 assert.equal(m.expressions.some(e=>e.name==='LeerNumero'),true);
});
test('un visual con un campo ausente detiene la preparación',()=>{
 const f=fixture();f.files['Report/definition/pages/p1/visuals/v1/visual.json']=strToU8(JSON.stringify({Measure:{Expression:{SourceRef:{Entity:'Compras'}},Property:'MEDIDA_AUSENTE'}}));
 const p=f.pack();assert.throws(()=>construir(p.w,p.f),/Campo ausente/);
});
test('rechaza conexiones inesperadas y las dos fuentes apuntando al mismo CSV',()=>{
 for(const mode of ['externa','repetida']){
  const f=fixture();f.final.model.tables[1].partitions[0].source.expression=mode==='externa'?f.final.model.tables[1].partitions[0].source.expression.replace('docs.google.com','sitio.invalid'):f.final.model.tables[0].partitions[0].source.expression;
  const p=f.pack();assert.throws(()=>construir(p.w,p.f),mode==='externa'?/CSV HTTPS/:/mismo CSV/);
 }
});
test('modelo trabajado con una fuente no reconocida se rechaza antes de crear salida',()=>{
 const f=fixture();f.worked.model.tables[0].partitions[0].source.expression='OtroOrigen';const p=f.pack();assert.throws(()=>construir(p.w,p.f),/fuente incrustada/);
});
test('no sobrescribe salida ni modifica ninguna plantilla original',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'pbit-prueba-'));
 try{
  const p=fixture().pack(),w=path.join(dir,'trabajado.pbit'),f=path.join(dir,'final.pbit'),out=path.join(dir,'nuevo.pbit');await writeFile(w,p.w);await writeFile(f,p.f);
  await migrar({trabajado:w,final:f,salida:out});const antes=await readFile(out);
  await assert.rejects(migrar({trabajado:w,final:f,salida:out}),/EEXIST/);assert.deepEqual(await readFile(out),antes);
  await assert.rejects(migrar({trabajado:w,final:f,salida:f}),/no sobrescribir/);
  assert.deepEqual(await readFile(w),Buffer.from(p.w));assert.deepEqual(await readFile(f),Buffer.from(p.f));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('rechaza rutas internas que salgan del paquete',()=>{
 assert.throws(()=>abrirPlantilla(zipSync({'../fuera':strToU8('x')})),/Ruta interna/);
});
