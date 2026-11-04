import {pathToFileURL} from 'node:url';
import {crearPoolConteos} from './mysql/conteos.mjs';
import {crearApi,origenPublico} from './http/api.mjs';

export function configuracionApi(env){
  if(env.IMS_API_HABILITADA!=='1')throw new Error('API candidata deshabilitada; habilitar solo en un entorno preparado.');
  if((env.IMS_HOST||'127.0.0.1')!=='127.0.0.1')throw new Error('La API requiere escuchar solo en 127.0.0.1.');
  const port=Number(env.IMS_PORT||3003);
  if(!Number.isInteger(port)||port<1024||port>65535||[3000,3001,3002,8000,8010,8080,8443,8444].includes(port))
    throw new Error('Puerto inválido o reservado para otro aplicativo.');
  return {host:'127.0.0.1',port,publicUrl:origenPublico(env.IMS_PUBLIC_URL)};
}
async function main(){
  const config=configuracionApi(process.env),pool=await crearPoolConteos(process.env);
  let server;
  try{
    const [[db]]=await pool.query('SELECT DATABASE() AS nombre,CURRENT_USER() AS usuario');
    if(!/^centromando_ims(?:_[a-z0-9_]+)?$/.test(db.nombre||'')||/^root@/i.test(db.usuario||''))throw Error('Base no permitida');
    await pool.query('SELECT sesion_hash FROM ims_auth_sesion LIMIT 0');
    await pool.query('SELECT actor_id FROM ims_auth_usuario LIMIT 0');
    await pool.query('SELECT clave FROM ims_auth_limite LIMIT 0');
    await pool.query('SELECT id FROM ims_op_linea LIMIT 0');
    server=crearApi({pool,publicUrl:config.publicUrl});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port,config.host,resolve);});
    console.log(`API candidata disponible en ${config.host}:${config.port}; frontend pendiente.`);
    let cerrando=false;
    const cerrar=()=>{if(cerrando)return;cerrando=true;server.close(async()=>{await pool.end();process.exitCode=0;});};
    process.once('SIGTERM',cerrar);process.once('SIGINT',cerrar);
  }catch{if(server)server.close();await pool.end();console.error('No se inició la API candidata. Revisa configuración y esquema de su base exclusiva.');process.exitCode=1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{
  console.error('API candidata deshabilitada o configuración incompleta. Revisa su entorno privado.');process.exitCode=1;
});
