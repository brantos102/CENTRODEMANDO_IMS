import {exigir,uuid} from './dominio.mjs';
import {serieCanonica} from '../dominio/series.mjs';
export async function serieYaCapturada(c,id,serie){
 const [rs]=await c.execute(`SELECT DISTINCT origen_drive FROM ims_op_linea WHERE inventario_id=? AND origen_drive IS NOT NULL`,[id]);
 for(const r of rs){const [[n]]=await c.execute('SELECT COUNT(DISTINCT inventario_id) n FROM ims_op_linea WHERE origen_drive=?',[r.origen_drive]);if(Number(n.n)!==1)continue;
  const [[old]]=await c.execute('SELECT fila FROM ims_cm_archivo_legado WHERE archivo_drive=? AND serie=? LIMIT 1',[r.origen_drive,serieCanonica(serie)]);if(old)return true;
 }return false;
}
export async function archivoLegado(c,p,id,hoja,desde=0){
 uuid(id);exigir(Number.isInteger(desde)&&desde>=0&&desde<=1000000);
 const [origenes]=await c.execute('SELECT DISTINCT l.origen_drive FROM ims_op_linea l JOIN ims_op_permiso a ON a.inventario_id=l.inventario_id AND a.cliente_id=l.cliente_id AND a.actor_id=? WHERE l.inventario_id=? AND l.origen_drive IS NOT NULL',[p.actorId,id]);exigir(origenes.length===1,'SOLICITUD_INVALIDA','Este inventario no tiene un archivo de origen único.');const origen=origenes[0].origen_drive;
 const [[sin]]=await c.execute('SELECT COUNT(*) n FROM ims_op_linea l WHERE l.origen_drive=? AND NOT EXISTS(SELECT 1 FROM ims_op_permiso a WHERE a.actor_id=? AND a.inventario_id=l.inventario_id AND a.cliente_id=l.cliente_id)',[origen,p.actorId]);exigir(Number(sin.n)===0,'SIN_PERMISO','El historial completo del archivo requiere autorización sobre todos sus conteos.');
 const [hs]=await c.execute('SELECT DISTINCT hoja FROM ims_cm_archivo_legado WHERE archivo_drive=? ORDER BY hoja',[origen]);const permitidas=hs.filter(h=>/^(PLANILLA.*(?:SERIE|ALTERNA)|REGISTRO|HISTORIAL|LOG)/.test(h.hoja.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()));
 if(!hoja)return {hojas:permitidas.map(x=>x.hoja)};exigir(permitidas.some(x=>x.hoja===hoja),'SIN_PERMISO','Hoja no autorizada.');
 const [rs]=await c.execute('SELECT fila,contenido FROM ims_cm_archivo_legado WHERE archivo_drive=? AND hoja=? AND fila>? ORDER BY fila LIMIT 51',[origen,hoja,desde]);return {hoja,alcance:'ARCHIVO_ORIGINAL_COMPLETO',filas:rs.slice(0,50).map(r=>JSON.parse(r.contenido)),siguiente:rs.length>50?rs[49].fila:null};
}

export async function entregarCronograma(c,{inventarioId,actorId,operacionId}){
 const {uuidEstable}=await import('../migracion/modelo.mjs');
 const [es]=await c.execute('SELECT e.id,e.estado,e.version,e.fecha_fin FROM ims_cm_evento e JOIN ims_cm_vinculo v ON v.evento_id=e.id WHERE v.inventario_id=? AND e.eliminado=0 AND e.estado<>\'Entregado\' FOR UPDATE',[inventarioId]);
 for(const e of es){const [is]=await c.execute('SELECT i.estado,n.fecha_entrega FROM ims_cm_vinculo v JOIN ims_op_inventario i ON i.id=v.inventario_id LEFT JOIN ims_nat_inventario n ON n.inventario_id=i.id WHERE v.evento_id=?',[e.id]);if(!is.length||is.some(i=>i.estado!=='ENTREGADO'))continue;const fin=is.map(i=>i.fecha_entrega).filter(Boolean).sort().at(-1);if(!fin)continue;
  await c.execute("UPDATE ims_cm_evento SET estado='Entregado',avance=100,fecha_fin=?,version=version+1 WHERE id=?",[fin,e.id]);await c.execute("UPDATE ims_cm_equipo SET estado='FINALIZADO' WHERE evento_id=? AND estado='ACTIVO'",[e.id]);const r={eventoId:e.id,estado:'Entregado',fechaFin:fin};await c.execute('INSERT INTO ims_cm_auditoria(actor_id,operacion_id,tipo,hash,resultado,antes,despues) VALUES (?,?,?,?,?,?,?)',[actorId,uuidEstable('cm-entrega',[operacionId,e.id]),'entrega-inventario','0'.repeat(64),JSON.stringify(r),JSON.stringify({estado:e.estado,version:String(e.version)}),JSON.stringify(r)]);
 }
}
