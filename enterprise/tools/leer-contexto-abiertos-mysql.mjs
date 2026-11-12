// stdout es privado: el envoltorio lo guarda con modo 0600, nunca lo muestra.
import mysql from 'mysql2/promise';
import {databaseConfig} from './importar-snapshot.mjs';
import {leerContextoCopiaAbiertos,codigoMysqlSeguro} from '../src/migracion/copia-abiertos.mjs';
let pool;
try{
 let raw='';for await(const b of process.stdin){raw+=b;if(Buffer.byteLength(raw)>16384)throw Error('SOLICITUD_EXCESIVA');}
 const s=JSON.parse(raw);pool=mysql.createPool({...databaseConfig(s.config),connectionLimit:1});
 process.stdout.write(JSON.stringify(await leerContextoCopiaAbiertos({pool,directorio:s.preparacion,copiaId:s.copiaId}))+'\n');
}catch(error){process.stdout.write(JSON.stringify({ok:false,codigo_error:/^[A-Z_]+$/.test(error.codigo||'')?error.codigo:'CONTEXTO_NO_CONFIRMADO',codigo_mysql:codigoMysqlSeguro(error)})+'\n');process.exitCode=1;}
finally{await pool?.end();}
