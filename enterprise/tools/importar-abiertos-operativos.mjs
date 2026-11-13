import mysql from 'mysql2/promise';
import {databaseConfig} from './importar-snapshot.mjs';
import {importarAbiertos} from '../src/migracion/importar-abiertos.mjs';
import {codigoMysqlSeguro} from '../src/migracion/copia-abiertos.mjs';
let pool;
try{
 let raw='';for await(const b of process.stdin){raw+=b;if(Buffer.byteLength(raw)>16384)throw Error('SOLICITUD_EXCESIVA');}
 const s=JSON.parse(raw),{config,...solicitud}=s;pool=mysql.createPool({...databaseConfig(config),connectionLimit:1});
 console.log(JSON.stringify(await importarAbiertos({pool,...solicitud})));
}catch(e){const codigo=/^[A-Z_]{1,80}$/.test(e.codigo||'')?e.codigo:'IMPORTACION_OPERATIVA_NO_CONFIRMADA';console.log(JSON.stringify({ok:false,codigo_error:codigo,...(/^[A-Z_]{1,80}$/.test(e.etapa||'')?{etapa:e.etapa}:{}),codigo_mysql:codigoMysqlSeguro(e),importacion_puede_estar_confirmada:codigo==='CONFIRMACION_IMPORTACION_PENDIENTE',reintentar_mismo_plan_sin_duplicar:true,servicios_reiniciados:false,apache_modificado:false}));process.exitCode=1;}
finally{await pool?.end();}
