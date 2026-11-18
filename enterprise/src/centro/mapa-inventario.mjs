import {politicaConteo} from '../mysql/politica-conteo.mjs';
import {posicionesWms} from '../dominio/posiciones-wms.mjs';
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
  const [[nat]]=await c.execute('SELECT mostrar_depot FROM ims_nat_inventario WHERE inventario_id=?',[id]);
  const [roles]=await c.execute('SELECT rol FROM ims_nat_perfil WHERE inventario_id=? AND actor_id=?',[id,p.actorId]);const {conteoCiego:ciego}=await politicaConteo(c,{...p,centroHabilitado:true},{perfiles:roles,mostrar_depot:nat?.mostrar_depot,esNativo:!!nat});
  const [filas]=await c.execute(`SELECT l.sku,l.conteo_1,l.conteo_2,l.conteo_final,TRIM(COALESCE(d.posicion,'')) posicion,x.depot,x.ajuste,x.categoria
   FROM ims_op_linea l JOIN ims_op_permiso pe ON pe.inventario_id=l.inventario_id AND pe.cliente_id=l.cliente_id AND pe.actor_id=?
   LEFT JOIN ims_op_detalle_linea d ON d.linea_id=l.id LEFT JOIN ims_nat_linea x ON x.linea_id=l.id WHERE l.inventario_id=? LIMIT 100001`,[p.actorId,id]);exigir(filas.length<=100000,'SOLICITUD_INVALIDA','El inventario excede el límite del mapa.');
  const posiciones=posicionesWms(filas,{ciego});
  const [[catalogo]]=await c.execute("SELECT x.id,x.nombre,x.filas,x.sha256 FROM ims_cm_catalogo_actual a JOIN ims_cm_catalogo x ON x.id=a.catalogo_id WHERE a.sede=? AND a.tipo='WTW'",[inv.sede]);
  return {inventario:inv,catalogo:catalogo||null,puedeCargar:pf.rol==='ADMIN',posiciones:posiciones.map(r=>({...r,...Object.fromEntries(['lineas','c1','c2','c3','revisar'].map(k=>[k,Number(r[k]||0)]))})),alcance:'LINEAS_AUTORIZADAS_DEL_INVENTARIO',tipoProgreso:'CAPTURA_PRESENTE_WMS',conteoCiego:ciego,stockTeoricoIncluido:false};
 });
}
