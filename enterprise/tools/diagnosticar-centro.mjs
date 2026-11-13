// Diagnóstico de paridad: solo metadatos y conteos, nunca usuarios o celdas.
import mysql from 'mysql2/promise';
import {databaseConfig} from './importar-snapshot.mjs';
let pool;
try{
 let raw='';for await(const b of process.stdin){raw+=b;if(Buffer.byteLength(raw)>16384)throw Error();}const s=JSON.parse(raw);pool=mysql.createPool({...databaseConfig(s.config),connectionLimit:1});const c=await pool.getConnection();
 try{
  const [[db]]=await c.query('SELECT DATABASE() AS nombre,CURRENT_USER() AS usuario');if(db.nombre!=='centromando_ims_ensayo'||db.usuario!=='ims_cm_migracion@127.0.0.1')throw Error();
  await c.query('SET TRANSACTION READ ONLY');await c.beginTransaction();
  const [hojas]=await c.query('SELECT h.snapshot_id,h.hoja,h.filas,h.metadatos FROM ims_snapshot_hoja h JOIN ims_snapshot s ON s.snapshot_id=h.snapshot_id WHERE s.estado=\'VERIFICADO\' ORDER BY s.creado_en DESC,h.hoja LIMIT 201');if(hojas.length>200)throw Error();
  const [historicos]=await c.query('SELECT snapshot_id,COUNT(*) AS filas FROM ims_mig_linea GROUP BY snapshot_id');
  const [[usuarios]]=await c.query('SELECT COUNT(*) AS cuentas,SUM(a.activo=1) AS activas FROM ims_auth_usuario u JOIN ims_op_actor a ON a.id=u.actor_id');
  const [ambitos]=await c.query('SELECT sede,rol,COUNT(*) AS cuentas FROM ims_nat_ambito GROUP BY sede,rol');
  await c.commit();console.log(JSON.stringify({ok:true,formato:'ims-centro-paridad-diagnostico-v1',hojas_resguardadas:hojas.map(h=>{let m={};try{m=JSON.parse(h.metadatos);}catch{}return {snapshot_id:h.snapshot_id,hoja:h.hoja,filas:Number(h.filas),columnas:m.columnas??m.encabezados?.length??null};}),historicos,cuentas:{total:Number(usuarios.cuentas),activas:Number(usuarios.activas)},ambitos,base_de_datos_modificada:false,servicios_reiniciados:false}));
 }finally{try{await c.rollback();}catch{}c.release();}
}catch{console.log(JSON.stringify({ok:false,codigo_error:'DIAGNOSTICO_CENTRO_NO_CONFIRMADO',base_de_datos_modificada:false,servicios_reiniciados:false}));process.exitCode=1;}finally{await pool?.end();}
