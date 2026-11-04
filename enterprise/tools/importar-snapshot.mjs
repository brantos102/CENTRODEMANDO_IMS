import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile, lstat} from 'node:fs/promises';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

const SHA=/^[a-f0-9]{64}$/;
function requireValue(ok,message){if(!ok)throw new Error(message);}
export function databaseConfig(env){
  const database=env.MYSQL_DATABASE;
  requireValue(/^centromando_ims(?:_[a-z0-9_]+)?$/.test(database||'') && database.length<=64,'Configura una base exclusiva centromando_ims o centromando_ims_*');
  requireValue(env.MYSQL_HOST==='127.0.0.1' || env.MYSQL_HOST==='localhost','La carga se ejecuta en el servidor, contra MySQL local');
  requireValue(env.MYSQL_USER && !/^root$/i.test(env.MYSQL_USER),'Usa un usuario exclusivo de migración');
  requireValue(env.MYSQL_PASSWORD,'Falta MYSQL_PASSWORD; no la compartas en logs');
  const port=Number(env.MYSQL_PORT||3306);
  requireValue(Number.isInteger(port)&&port>0&&port<=65535,'Puerto MySQL inválido');
  return {host:env.MYSQL_HOST,port,user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database,charset:'utf8mb4',timezone:'Z',decimalNumbers:false,supportBigNumbers:true,bigNumberStrings:true,dateStrings:true,multipleStatements:false};
}
async function localFile(dir,name,pattern){
  requireValue(pattern.test(name),'Ruta de archivo no permitida en el manifiesto');
  const p=path.join(dir,name),stat=await lstat(p);
  requireValue(stat.isFile()&&!stat.isSymbolicLink(),'El corte requiere archivos regulares, sin enlaces simbólicos');return p;
}
export async function hashFile(file){const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');}
export async function* records(file){
 const input=createReadStream(file,{encoding:'utf8'});const lines=createInterface({input,crlfDelay:Infinity});
 try{for await(const line of lines){requireValue(line.length>0&&Buffer.byteLength(line)<4*1024*1024,'Línea JSONL vacía o demasiado grande');yield {raw:line,row:JSON.parse(line)};}}
 finally{lines.close();input.destroy();}
}
function validRow(row,previous){
 requireValue(Number.isInteger(row.fila)&&row.fila>previous&&row.fila<=1048576,'Filas duplicadas, fuera de orden o inválidas');
 requireValue(Array.isArray(row.celdas)&&row.notas&&typeof row.notas==='object'&&!Array.isArray(row.notas),'Registro de corte inválido');
 requireValue(row.origen_drive===null||(typeof row.origen_drive==='string'&&row.origen_drive.length>0&&row.origen_drive.length<=256),'Origen de fila inválido');
 const cols=new Set();
 for(const c of row.celdas){requireValue(Number.isInteger(c.columna)&&c.columna>=1&&c.columna<=16384&&!cols.has(c.columna),'Columnas duplicadas o inválidas');cols.add(c.columna);requireValue(typeof c.valor==='string'||c.valor===null,'Los valores se preservan como texto o null');}
}
export async function validateSnapshot(dir){
 dir=path.resolve(dir);
 const mf=await localFile(dir,'manifest.json',/^manifest\.json$/);requireValue((await lstat(mf)).size<16*1024*1024,'Manifiesto demasiado grande');
 const manifest=JSON.parse(await readFile(mf,'utf8'));
 requireValue(manifest.version===1&&SHA.test(manifest.snapshot_id),'Versión o identidad de corte inválida');
 requireValue(Array.isArray(manifest.hojas)&&manifest.hojas.length>0&&manifest.hojas.length<=1000,'Lista de hojas inválida');
 const original=await localFile(dir,manifest.original,/^fuente\.xlsx$/);requireValue(await hashFile(original)===manifest.snapshot_id,'El XLSX original no corresponde al corte');
 const styles=await localFile(dir,manifest.estilos,/^estilos\.xml$/);requireValue(await hashFile(styles)===manifest.estilos_sha256,'Los estilos no corresponden al corte');
 const names=new Set(),files=new Set();let total=0;
 for(const sheet of manifest.hojas){
  requireValue(typeof sheet.nombre==='string'&&sheet.nombre.length>0&&sheet.nombre.length<=100&&!names.has(sheet.nombre),'Nombre de hoja inválido o repetido');names.add(sheet.nombre);
  requireValue(typeof sheet.archivo==='string'&&!files.has(sheet.archivo)&&SHA.test(sheet.sha256),'Archivo de hoja duplicado o sin hash');files.add(sheet.archivo);
  const file=await localFile(dir,sheet.archivo,/^hoja_[0-9]{3,4}\.jsonl$/);requireValue(await hashFile(file)===sheet.sha256,'Integridad de hoja no válida: '+sheet.nombre);
  const contract=sheet.nombre==='INVENTARIOS'?30:sheet.nombre==='REGISTRO'?15:null;
  let previous=0,count=0,data=0,headerSeen=false;const origins=new Map();
  for await(const {row} of records(file)){
   validRow(row,previous);previous=row.fila;count++;
   const nonempty=row.celdas.filter(c=>c.valor!==null&&c.valor!==''||c.formula);
   if(contract){
    requireValue(nonempty.every(c=>c.columna<=contract),'Datos fuera de las columnas públicas '+sheet.nombre);
    if(row.fila===1){headerSeen=true;requireValue(Array.isArray(sheet.encabezados)&&sheet.encabezados.length===contract,'Cabecera de contrato inválida');for(let i=1;i<=contract;i++)requireValue(row.celdas.find(c=>c.columna===i)?.valor===sheet.encabezados[i-1],'La cabecera y sus metadatos difieren');}
    if(row.fila>1&&nonempty.length){
     data++;requireValue(row.origen_drive,'Fila de contrato sin procedencia');
     const ref=(contract===30?'C':'F')+row.fila;const marks=String(row.notas[ref]||'').match(/^IMS_ORIGEN_DRIVE=([^\r\n]*)/gm)||[];
     requireValue(marks.length===1&&marks[0].slice('IMS_ORIGEN_DRIVE='.length).trim()===row.origen_drive,'Nota de procedencia incompatible');
     origins.set(row.origen_drive,(origins.get(row.origen_drive)||0)+1);
    }
   }
  }
  requireValue(Number.isSafeInteger(sheet.filas_almacenadas)&&count===sheet.filas_almacenadas,'Conteo de hoja incompatible: '+sheet.nombre);
  if(contract){requireValue(headerSeen,'Falta la fila de encabezados');requireValue(data===sheet.filas_datos_contrato,'Conteo de datos incompatible: '+sheet.nombre);const declared=sheet.filas_por_origen;requireValue(declared&&Object.keys(declared).length===origins.size&&[...origins].every(([key,n])=>Object.hasOwn(declared,key)&&declared[key]===n),'Aportes por origen incompatibles');}
  total+=count;
 }
 requireValue(names.has('INVENTARIOS')&&names.has('REGISTRO'),'Faltan los contratos de inventarios y registro');
 return {dir,manifest,total};
}
async function verifyDatabase(connection,manifest){
 const [sheets]=await connection.execute('SELECT hoja, sha256, filas FROM ims_snapshot_hoja WHERE snapshot_id=?',[manifest.snapshot_id]);
 requireValue(sheets.length===manifest.hojas.length,'La copia MySQL tiene otra cantidad de hojas');
 for(const sheet of manifest.hojas){
  const stored=sheets.find(s=>s.hoja===sheet.nombre);requireValue(stored&&stored.sha256===sheet.sha256&&Number(stored.filas)===sheet.filas_almacenadas,'Metadatos MySQL diferentes');
  let previous=0,count=0;const hash=createHash('sha256');
  while(true){
   const [rows]=await connection.execute('SELECT numero_fila, contenido FROM ims_snapshot_fila WHERE snapshot_id=? AND hoja=? AND numero_fila>? ORDER BY numero_fila LIMIT 250',[manifest.snapshot_id,sheet.nombre,previous]);
   if(!rows.length)break;
   for(const r of rows){hash.update(r.contenido).update('\n');previous=r.numero_fila;count++;}
  }
  requireValue(count===sheet.filas_almacenadas&&hash.digest('hex')===sheet.sha256,'La copia MySQL difiere de la extracción: '+sheet.nombre);
 }
}
export async function importSnapshot(snapshot,connection,onProgress=()=>{}){
 const {dir,manifest}=snapshot;let locked=false,begun=false;
 const [target]=await connection.query('SELECT DATABASE() AS nombre');
 requireValue(/^centromando_ims(?:_[a-z0-9_]+)?$/.test(target[0]?.nombre||''),'La conexión no usa una base exclusiva de Centro de Mando');
 const lock='ims-import:'+createHash('sha256').update(target[0].nombre).digest('hex').slice(0,40);
 try{
  const [result]=await connection.execute('SELECT GET_LOCK(?,0) AS adquirido',[lock]);requireValue(Number(result[0].adquirido)===1,'Otra carga de Centro de Mando está activa');locked=true;
  const ddl=await readFile(new URL('../sql/001_snapshot_staging.sql',import.meta.url),'utf8');
  for(const statement of ddl.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await connection.query(statement);
  await connection.beginTransaction();begun=true;
  const [existing]=await connection.execute('SELECT estado FROM ims_snapshot WHERE snapshot_id=? FOR UPDATE',[manifest.snapshot_id]);
  if(existing.length){
   requireValue(existing[0].estado==='VERIFICADO','El corte previo no está verificado');await verifyDatabase(connection,manifest);await connection.commit();begun=false;return{snapshot_id:manifest.snapshot_id,yaImportado:true,filas:snapshot.total};
  }
  await connection.execute('INSERT INTO ims_snapshot(snapshot_id,archivo,estado,manifiesto) VALUES (?,?,?,?)',[manifest.snapshot_id,manifest.archivo,'IMPORTANDO',JSON.stringify(manifest)]);
  for(const sheet of manifest.hojas){
   await connection.execute('INSERT INTO ims_snapshot_hoja(snapshot_id,hoja,archivo_jsonl,sha256,filas,metadatos) VALUES (?,?,?,?,?,?)',[manifest.snapshot_id,sheet.nombre,sheet.archivo,sheet.sha256,sheet.filas_almacenadas,JSON.stringify(sheet)]);
   let batch=[],count=0,bytes=0;
   const flush=async()=>{if(!batch.length)return;const placeholders=batch.map(()=>'(?,?,?,?,?)').join(',');await connection.execute('INSERT INTO ims_snapshot_fila(snapshot_id,hoja,numero_fila,origen_drive,contenido) VALUES '+placeholders,batch.flat());batch=[];bytes=0;};
   for await(const {raw,row} of records(path.join(dir,sheet.archivo))){if(batch.length && bytes+Buffer.byteLength(raw)>512*1024)await flush();batch.push([manifest.snapshot_id,sheet.nombre,row.fila,row.origen_drive,raw]);bytes+=Buffer.byteLength(raw);count++;if(batch.length===250)await flush();}
   await flush();requireValue(count===sheet.filas_almacenadas,'El archivo cambió durante la importación');onProgress({hoja:sheet.nombre,filas:count});
  }
  await verifyDatabase(connection,manifest);
  await connection.execute('UPDATE ims_snapshot SET estado=? WHERE snapshot_id=?',['VERIFICADO',manifest.snapshot_id]);
  await connection.commit();begun=false;return{snapshot_id:manifest.snapshot_id,yaImportado:false,filas:snapshot.total};
 }catch(error){if(begun)await connection.rollback();throw error;}
 finally{if(locked)await connection.execute('SELECT RELEASE_LOCK(?)',[lock]);}
}
async function main(){
 const [mode,dir]=process.argv.slice(2);requireValue(['--validar','--importar'].includes(mode)&&dir,'Uso: node tools/importar-snapshot.mjs --validar|--importar /ruta/corte');
 const snapshot=await validateSnapshot(dir);
 if(mode==='--validar'){console.log(JSON.stringify({ok:true,snapshot_id:snapshot.manifest.snapshot_id,hojas:snapshot.manifest.hojas.length,filas:snapshot.total,baseDeDatosModificada:false}));return;}
 const config=databaseConfig(process.env);const mysql=await import('mysql2/promise');const connection=await mysql.createConnection(config);
 try{const [rows]=await connection.query('SELECT DATABASE() AS nombre');requireValue(rows[0].nombre===config.database,'La conexión no usa la base exclusiva configurada');const result=await importSnapshot(snapshot,connection,p=>console.log(JSON.stringify(p)));console.log(JSON.stringify({ok:true,...result,aplicacionActivada:false}));}
 finally{await connection.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Carga detenida. Revisa la integridad del corte, la base exclusiva, sus permisos y la conexión; no se muestran credenciales ni datos privados.');process.exitCode=1;});
