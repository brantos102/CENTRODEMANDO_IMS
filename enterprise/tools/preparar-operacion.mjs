import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {databaseConfig} from './importar-snapshot.mjs';
import {correoCanonico} from '../src/auth/credenciales.mjs';
export async function prepararAdministrador(c,{actorId,correo}){
 if(!/^[a-f0-9-]{36}$/.test(actorId))throw Error('Actor incompatible.');correo=correoCanonico(correo);
 const [[db]]=await c.query('SELECT DATABASE() AS nombre,CURRENT_USER() AS usuario');
 if(!/^centromando_ims_(?:ensayo|pruebas(?:_[a-z0-9]+)?)$/.test(db.nombre)||/^root@/.test(db.usuario))throw Error('Base incompatible.');
 for(const file of ['007_operacion_nativa.sql','009_series_hallazgos.sql'])for(const sql of (await readFile(new URL('../sql/'+file,import.meta.url),'utf8')).replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await c.query(sql);
 await c.beginTransaction();let tx=true;
 try{
  const [[u]]=await c.execute('SELECT u.actor_id,a.activo FROM ims_auth_usuario u JOIN ims_op_actor a ON a.id=u.actor_id WHERE u.actor_id=? AND u.correo=? FOR SHARE',[actorId,correo]);
  if(!u?.activo)throw Error('Cuenta de revisión no encontrada.');
  for(const sede of ['UIO','GYE']){
   const [[s]]=await c.execute('SELECT rol FROM ims_nat_ambito WHERE actor_id=? AND sede=? FOR UPDATE',[actorId,sede]);
   if(s&&s.rol!=='ADMIN')throw Error('El ámbito ya tiene otra configuración. No se reemplaza.');
   if(!s)await c.execute("INSERT INTO ims_nat_ambito VALUES (?,?,'ADMIN')",[actorId,sede]);
  }
  await c.commit();tx=false;return {ok:true,ambitosPreparados:['UIO','GYE'],historialModificado:false};
 }finally{if(tx)await c.rollback();}
}
export async function verificarRuntime(c){
 const [[db]]=await c.query('SELECT DATABASE() AS nombre,CURRENT_USER() AS usuario');
 if(db.nombre!=='centromando_ims_ensayo'||db.usuario!=='ims_cm_operacion@127.0.0.1')throw Error('Perfil de operación incompatible.');
 await c.query('SELECT id FROM ims_nat_serie LIMIT 0');await c.query('SELECT id FROM ims_nat_hallazgo LIMIT 0');
 const [[r]]=await c.query(`SELECT COUNT(DISTINCT i.id) AS conteos,COUNT(l.id) AS filas FROM ims_op_inventario i
  LEFT JOIN ims_op_linea l ON l.inventario_id=i.id LEFT JOIN ims_nat_inventario n ON n.inventario_id=i.id WHERE n.inventario_id IS NULL`);
 return {ok:true,historico:{conteos:Number(r.conteos),filas:Number(r.filas)}};
}
async function main(){
 if(!['--preparar','--verificar'].includes(process.argv[2])||process.argv.length!==3)throw Error('Uso interno.');
 let raw='';for await(const b of process.stdin){raw+=b;if(raw.length>16384)throw Error('Solicitud excesiva.');}
 const s=JSON.parse(raw),mysql=await import('mysql2/promise'),cfg=databaseConfig(s.config);
 if(cfg.database!=='centromando_ims_ensayo'||cfg.user!==(process.argv[2]==='--preparar'?'ims_cm_migracion':'ims_cm_operacion'))throw Error('Perfil incompatible.');
 const c=await mysql.createConnection(cfg);
 try{console.log(JSON.stringify(process.argv[2]==='--preparar'?await prepararAdministrador(c,s):await verificarRuntime(c)));}finally{await c.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Preparación operativa detenida. No se muestran credenciales ni SQL.');process.exitCode=1;});
