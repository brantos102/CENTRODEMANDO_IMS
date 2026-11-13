import mysql from 'mysql2/promise';
import {databaseConfig} from './importar-snapshot.mjs';
let c;
try{let raw='';for await(const p of process.stdin){raw+=p;if(raw.length>16384)throw Error();}const s=JSON.parse(raw),cfg=databaseConfig(s.config);if(cfg.user!=='ims_cm_migracion'||cfg.database!=='centromando_ims_ensayo'||!/^[a-f0-9]{40}$/.test(s.revision))throw Error();
 const r=await fetch('http://127.0.0.1:3003/salud',{signal:AbortSignal.timeout(5000),redirect:'error'}),h=await r.json();if(!r.ok||h.centroMando!==true||h.revision!==s.revision)throw Error();
 c=await mysql.createConnection(cfg);const [[db]]=await c.query('SELECT CURRENT_USER() usuario');if(db.usuario!=='ims_cm_migracion@127.0.0.1')throw Error();await c.beginTransaction();
 const [ids]=await c.execute('SELECT actor_id FROM ims_cm_perfil WHERE activacion_pendiente=1 AND cambiar_clave=1 FOR UPDATE');for(const a of ids){await c.execute('UPDATE ims_op_actor SET activo=1 WHERE id=?',[a.actor_id]);await c.execute('UPDATE ims_cm_perfil SET activacion_pendiente=0 WHERE actor_id=?',[a.actor_id]);}await c.commit();console.log(JSON.stringify({ok:true,usuarios_heredados_habilitados:ids.length,cambio_clave_obligatorio:true,cuentas_previas_modificadas:false}));
}catch{try{await c?.rollback();}catch{}console.log(JSON.stringify({ok:false,codigo_error:'ACTIVACION_USUARIOS_CENTRO_NO_CONFIRMADA'}));process.exitCode=1;}finally{await c?.end();}
