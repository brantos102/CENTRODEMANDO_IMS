import {transaccionOperativa} from '../mysql/operacion-nativa.mjs';
import {perfilCentro} from './servicio.mjs';
import {exigir,uuid} from './dominio.mjs';
/** Progreso de captura por ubicación, siempre bajo el permiso del inventario/cliente.
 * No devuelve stock teórico ni diferencias: también se usa en conteo ciego. */
export async function consultarMapaInventario(pool,p,q={}){
 const id=uuid(q.inventario);
 return transaccionOperativa(pool,p,async c=>{
  const pf=await perfilCentro(c,p),[[inv]]=await c.execute('SELECT i.id,i.sede,i.codigo_operativo,i.estado FROM ims_op_inventario i WHERE i.id=? AND EXISTS(SELECT 1 FROM ims_op_permiso pe WHERE pe.inventario_id=i.id AND pe.actor_id=?)',[id,p.actorId]);
  exigir(inv&&pf.sedes.includes(inv.sede),'SIN_PERMISO','Inventario no autorizado.');
  const [posiciones]=await c.execute(`SELECT TRIM(COALESCE(d.posicion,'')) posicion,COUNT(*) lineas,
   SUM(l.conteo_1 IS NOT NULL) c1,SUM(l.conteo_2 IS NOT NULL) c2,SUM(l.conteo_final IS NOT NULL) c3,
   SUM((l.conteo_1 IS NULL AND (l.conteo_2 IS NOT NULL OR l.conteo_final IS NOT NULL)) OR (l.conteo_2 IS NULL AND l.conteo_final IS NOT NULL)) revisar
   FROM ims_op_linea l JOIN ims_op_permiso pe ON pe.inventario_id=l.inventario_id AND pe.cliente_id=l.cliente_id AND pe.actor_id=?
   LEFT JOIN ims_op_detalle_linea d ON d.linea_id=l.id WHERE l.inventario_id=? GROUP BY TRIM(COALESCE(d.posicion,'')) ORDER BY posicion`,[p.actorId,id]);
  const [[catalogo]]=await c.execute("SELECT x.id,x.nombre,x.filas,x.sha256 FROM ims_cm_catalogo_actual a JOIN ims_cm_catalogo x ON x.id=a.catalogo_id WHERE a.sede=? AND a.tipo='WTW'",[inv.sede]);
  return {inventario:inv,catalogo:catalogo||null,puedeCargar:pf.rol==='ADMIN',posiciones:posiciones.map(r=>({...r,...Object.fromEntries(['lineas','c1','c2','c3','revisar'].map(k=>[k,Number(r[k]||0)]))})),alcance:'LINEAS_AUTORIZADAS_DEL_INVENTARIO',tipoProgreso:'C1_PRESENTE',stockTeoricoIncluido:false};
 });
}
