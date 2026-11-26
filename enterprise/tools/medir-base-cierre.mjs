// Tamaño del esquema IMS completo. Solo metadatos, una conexión y transacción
// READ ONLY; configuración privada por stdin, nunca argumentos ni stdout.
import mysql from 'mysql2/promise';
import {databaseConfig} from './importar-snapshot.mjs';
let c;
try{
 let raw='';for await(const b of process.stdin){raw+=b;if(Buffer.byteLength(raw)>16384)throw Error();}
 const {config}=JSON.parse(raw);c=await mysql.createConnection({...databaseConfig(config),connectTimeout:10000});
 const [[db]]=await c.query('SELECT DATABASE() nombre,CURRENT_USER() usuario');
 if(db.nombre!=='centromando_ims_ensayo'||db.usuario!=='ims_cm_migracion@127.0.0.1')throw Error();
 await c.query('SET TRANSACTION READ ONLY');await c.beginTransaction();
 const [[r]]=await c.query('SELECT SUM(DATA_LENGTH) datosBytes,SUM(INDEX_LENGTH) indicesBytes,COUNT(*) tablas FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
 await c.commit();console.log(JSON.stringify({ok:true,...Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Number(v||0)])),medicion:'TAMANO_ASIGNADO_DATOS_E_INDICES_MYSQL',baseDeDatosModificada:false}));
}catch{console.log(JSON.stringify({ok:false,codigo_error:'TAMANO_BASE_NO_CONFIRMADO',baseDeDatosModificada:false}));process.exitCode=1;}
finally{if(c){try{await c.rollback();}catch{}await c.end();}}
