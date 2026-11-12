import {copiarPreparacionAbiertos,ErrorCopiaAbiertos,codigoMysqlSeguro} from '../src/migracion/copia-abiertos.mjs';
import {databaseConfig} from './importar-snapshot.mjs';
async function main(){
 let raw='';for await(const parte of process.stdin){raw+=parte;if(Buffer.byteLength(raw)>16384)throw new ErrorCopiaAbiertos('SOLICITUD_INCOMPATIBLE');}
 const s=JSON.parse(raw),mysql=await import('mysql2/promise'),pool=mysql.createPool({...databaseConfig(s.config),connectionLimit:1,queueLimit:1,waitForConnections:true});
 try{console.log(JSON.stringify(await copiarPreparacionAbiertos({pool,directorio:s.preparacion})));}finally{await pool.end();}
}
main().catch(error=>{console.log(JSON.stringify({ok:false,codigo_error:error instanceof ErrorCopiaAbiertos?error.codigo:'COPIA_NO_CONFIRMADA',codigo_mysql:codigoMysqlSeguro(error),copia_mysql_confirmada:false,tablas_preparacion_pueden_existir:true,reintentar_mismo_paquete_verifica_copia:true,datos_operativos_importados:false,inventarios_activados:false,operacion_nativa_modificada:false,servicios_reiniciados:false,apache_modificado:false}));process.exitCode=1;});
