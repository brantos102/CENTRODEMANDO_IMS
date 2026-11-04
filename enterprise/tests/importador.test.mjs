import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateSnapshot,importSnapshot,databaseConfig} from '../tools/importar-snapshot.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
async function fixture(){
 const dir=await mkdtemp(path.join(tmpdir(),'ims-import-test-'));const original=Buffer.from('fixture-xlsx-checksum');const styles='<styles/>';
 await writeFile(path.join(dir,'fuente.xlsx'),original);await writeFile(path.join(dir,'estilos.xml'),styles);
 const m={version:1,snapshot_id:sha(original),archivo:'fixture.xlsx',original:'fuente.xlsx',estilos:'estilos.xml',estilos_sha256:sha(styles),hojas:[]};
 for(const [i,n,width,idcol] of [[1,'INVENTARIOS',30,3],[2,'REGISTRO',15,6]]){
  const heads=Array.from({length:width},(_,j)=>'H'+(j+1));heads[idcol-1]='ID';
  const rows=[{fila:1,origen_drive:null,celdas:heads.map((valor,j)=>({columna:j+1,tipo:'s',valor,estilo:'0'})),notas:{}}];
  for(const fila of [2,3])rows.push({fila,origen_drive:'source-'+fila,celdas:[{columna:idcol,tipo:'s',valor:'MISMO_ID',estilo:'0'},{columna:width===30?7:8,tipo:'s',valor:'000123',estilo:'0'}],notas:{[(width===30?'C':'F')+fila]:'Nota humana\nIMS_ORIGEN_DRIVE=source-'+fila}});
  const body=rows.map(r=>JSON.stringify(r)+'\n').join('');const file=`hoja_00${i}.jsonl`;await writeFile(path.join(dir,file),body);
  m.hojas.push({nombre:n,archivo:file,sha256:sha(body),filas_almacenadas:3,filas_datos_contrato:2,encabezados:heads,filas_por_origen:{'source-2':1,'source-3':1}});
 }
 await writeFile(path.join(dir,'manifest.json'),JSON.stringify(m));return{dir,m,close:()=>rm(dir,{recursive:true,force:true})};
}
class Connection {
 constructor(database='centromando_ims_prueba'){this.database=database;this.snapshots=[];this.sheets=[];this.rows=[];this.ddl=0;this.commits=0;this.rollbacks=0;this.fail=false;}
 async beginTransaction(){this.backup=structuredClone({snapshots:this.snapshots,sheets:this.sheets,rows:this.rows});}
 async commit(){this.commits++;this.backup=null;}
 async rollback(){Object.assign(this,this.backup);this.backup=null;this.rollbacks++;}
 async execute(sql,p=[]){
  if(sql.startsWith('INSERT INTO ims_snapshot_fila'))return this.query(sql,p);
  if(sql.startsWith('SELECT GET_LOCK'))return[[{adquirido:1}]];
  if(sql.startsWith('SELECT RELEASE_LOCK'))return[[{}]];
  if(sql.startsWith('SELECT estado'))return[this.snapshots.filter(s=>s.id===p[0]).map(s=>({estado:s.estado}))];
  if(sql.startsWith('INSERT INTO ims_snapshot(')){this.snapshots.push({id:p[0],estado:p[2]});return[{}];}
  if(sql.startsWith('INSERT INTO ims_snapshot_hoja')){this.sheets.push({snapshot:p[0],hoja:p[1],sha256:p[3],filas:p[4]});return[{}];}
  if(sql.startsWith('SELECT hoja, sha256'))return[this.sheets.filter(s=>s.snapshot===p[0])];
  if(sql.startsWith('SELECT numero_fila'))return[this.rows.filter(r=>r.snapshot===p[0]&&r.hoja===p[1]&&r.numero_fila>p[2]).sort((a,b)=>a.numero_fila-b.numero_fila).slice(0,250)];
  if(sql.startsWith('UPDATE ims_snapshot SET estado')){this.snapshots.find(s=>s.id===p[1]).estado=p[0];return[{}];}
  throw Error('Consulta no simulada: '+sql);
 }
 async query(sql,p=[]){
  if(sql.startsWith('SELECT DATABASE'))return[[{nombre:this.database}]];
  if(sql.startsWith('CREATE TABLE')){this.ddl++;return[{}];}
  if(sql.startsWith('INSERT INTO ims_snapshot_fila')){
   if(this.fail){this.fail=false;throw Error('Fallo de conexión simulado');}
   for(let i=0;i<p.length;i+=5)this.rows.push({snapshot:p[i],hoja:p[i+1],numero_fila:p[i+2],origen:p[i+3],contenido:p[i+4]});return[{}];
  }
  throw Error('Consulta no simulada: '+sql);
 }
}
test('configuración rechaza bases de otras aplicaciones y usuario root',()=>{
 const config={MYSQL_DATABASE:'centromando_ims',MYSQL_HOST:'127.0.0.1',MYSQL_USER:'ims_migracion',MYSQL_PASSWORD:'fixture'};
 assert.equal(databaseConfig(config).decimalNumbers,false);
 for(const db of ['iv_itsanet','rrhh_itsanet','mysql'])assert.throws(()=>databaseConfig({...config,MYSQL_DATABASE:db}),/exclusiva/);
 assert.throws(()=>databaseConfig({...config,MYSQL_USER:'root'}),/exclusivo/);
});
test('validación recupera ambos orígenes bajo el mismo código sin convertir SKU',async()=>{
 const f=await fixture();try{const s=await validateSnapshot(f.dir);assert.equal(s.total,6);assert.equal(s.manifest.hojas[0].filas_datos_contrato,2);}finally{await f.close();}
});
test('archivo alterado falla antes de solicitar una conexión MySQL',async()=>{
 const f=await fixture();try{await writeFile(path.join(f.dir,'hoja_001.jsonl'),'alterado');await assert.rejects(validateSnapshot(f.dir),/Integridad/);}finally{await f.close();}
});
test('manifiesto no puede leer archivos fuera de la carpeta',async()=>{
 const f=await fixture();try{f.m.hojas[0].archivo='../otro.jsonl';await writeFile(path.join(f.dir,'manifest.json'),JSON.stringify(f.m));await assert.rejects(validateSnapshot(f.dir),/Ruta/);}finally{await f.close();}
});
test('importación completa y reintento conservan filas, notas y multiplicidad sin otra copia',async()=>{
 const f=await fixture();try{
  const s=await validateSnapshot(f.dir),db=new Connection();let r=await importSnapshot(s,db);assert.equal(r.yaImportado,false);assert.equal(db.rows.length,6);
  const rows=db.rows.filter(r=>r.hoja==='INVENTARIOS'&&r.numero_fila>1);assert.deepEqual(rows.map(r=>r.origen),['source-2','source-3']);assert.match(rows[0].contenido,/000123/);assert.match(rows[0].contenido,/Nota humana/);
  r=await importSnapshot(s,db);assert.equal(r.yaImportado,true);assert.equal(db.rows.length,6);assert.equal(db.snapshots[0].estado,'VERIFICADO');
 }finally{await f.close();}
});
test('fallo entre metadatos y filas revierte; reintento permite carga íntegra',async()=>{
 const f=await fixture();try{
  const s=await validateSnapshot(f.dir),db=new Connection();db.fail=true;await assert.rejects(importSnapshot(s,db),/simulado/);assert.equal(db.snapshots.length,0);assert.equal(db.rows.length,0);assert.equal(db.rollbacks,1);
  await importSnapshot(s,db);assert.equal(db.rows.length,6);
 }finally{await f.close();}
});
test('copia MySQL alterada no se declara importada por tener igual número de filas',async()=>{
 const f=await fixture();try{
  const s=await validateSnapshot(f.dir),db=new Connection();await importSnapshot(s,db);db.rows[1].contenido=db.rows[1].contenido.replace('000123','000124');await assert.rejects(importSnapshot(s,db),/difiere/);assert.equal(db.rows.length,6);
 }finally{await f.close();}
});
test('conexión a otra aplicación se rechaza antes de crear tablas',async()=>{
 const f=await fixture();try{const s=await validateSnapshot(f.dir),db=new Connection('iv_itsanet');await assert.rejects(importSnapshot(s,db),/exclusiva/);assert.equal(db.ddl,0);assert.equal(db.snapshots.length,0);}finally{await f.close();}
});

test('cabecera omitida se rechaza aunque se ajusten hash y conteo del manifiesto',async()=>{
 const f=await fixture();try{
  const file=path.join(f.dir,'hoja_001.jsonl');const lines=(await readFile(file,'utf8')).trimEnd().split('\n').slice(1);const body=lines.join('\n')+'\n';await writeFile(file,body);f.m.hojas[0].sha256=sha(body);f.m.hojas[0].filas_almacenadas=2;await writeFile(path.join(f.dir,'manifest.json'),JSON.stringify(f.m));await assert.rejects(validateSnapshot(f.dir),/encabezados/);
 }finally{await f.close();}
});
