import {ErrorAuth} from '../auth/credenciales.mjs';
import {autenticarTransaccion} from './operacion-nativa.mjs';
/** Únicamente SELECT y una transacción breve. No consultar ERP reteniendo c. */
export async function sedesAutorizadasERP(pool,principal){
 const c=await pool.getConnection();let tx=false;
 try{
  await c.beginTransaction();tx=true;await autenticarTransaccion(c,principal);
  const [rows]=await c.execute("SELECT sede FROM ims_nat_ambito WHERE actor_id=? AND rol IN ('ADMIN','SUPERVISOR') FOR SHARE",[principal.actorId]);
  await c.commit();tx=false;return rows.map(r=>r.sede).filter(s=>['UIO','GYE'].includes(s));
 }finally{if(tx)await c.rollback();c.release();}
}
export async function autorizarSedeERP(pool,p,sede){
 if(!['UIO','GYE'].includes(sede)||!(await sedesAutorizadasERP(pool,p)).includes(sede))throw new ErrorAuth('SIN_PERMISO','No tienes autorización para consultar ERP en esa sede.',403);
}
