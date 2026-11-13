import {createHash} from 'node:crypto';
import {decimalCelda,sha,canon} from '../migracion/modelo.mjs';
import {ajusteExacto} from '../dominio/operacion.mjs';
import {insertarFilas} from '../mysql/lineas-legado.mjs';
import {normal,exigir} from './dominio.mjs';
const parse=x=>typeof x==='string'?JSON.parse(x):x;
export async function proyectarHistorico(c,{snapshots=[]}={}){
 exigir(Array.isArray(snapshots)&&snapshots.length<=100&&snapshots.every(x=>/^[a-f0-9]{64}$/.test(x)));
 let previo='',filas=0,incidencias=0;
 await c.beginTransaction();try{
 for(;;){const [rs]=await c.execute(`SELECT m.linea_id,m.contenido_sha256,f.contenido FROM ims_mig_linea m JOIN ims_snapshot_fila f ON f.snapshot_id=m.snapshot_id AND f.hoja=m.hoja AND f.numero_fila=m.fila_consolidado WHERE m.linea_id>? ${snapshots.length?'AND m.snapshot_id IN ('+snapshots.map(()=>'?').join(',')+')':''} ORDER BY m.linea_id LIMIT 250`,[previo,...snapshots]);if(!rs.length)break;const insert=[];
  for(const r of rs){const raw=parse(r.contenido);exigir(sha(canon(raw))===r.contenido_sha256,'GUARDADO_RECHAZADO','Una fila histórica difiere de su linaje.');const d=new Map(raw.celdas.map(x=>[x.columna,x])),v=col=>String(d.get(col)?.valor??''),datos={numero:v(4),abc:v(6),despacho:v(11),partida:v(12),categoria:v(13),estado_mercancia:v(14),motivo:v(26),justificacion:v(27),resultado_series:v(21)};let depot=null,ajuste=null;
   try{depot=decimalCelda(d.get(17));ajuste=v(25)?ajusteExacto(v(25)):null;}catch{incidencias++;depot=null;ajuste=null;}
   const fecha=col=>{const cel=d.get(col);if(cel?.tipo==='d'&&/^\d{4}-\d{2}-\d{2}/.test(cel.valor))return cel.valor.slice(0,10);if(cel?.tipo==='n'&&/^\d+(\.\d+)?$/.test(cel.valor)){const n=Number(cel.valor);if(n>0&&n<110000)return new Date(Date.UTC(1899,11,30)+Math.floor(n)*86400000).toISOString().slice(0,10);}return null;};
   const [[old]]=await c.execute('SELECT depot,ajuste,datos FROM ims_cm_linea_historica WHERE linea_id=?',[r.linea_id]);if(old){exigir(old.depot===depot&&old.ajuste===ajuste&&old.datos===JSON.stringify(datos),'GUARDADO_RECHAZADO','Una proyección histórica existente difiere.');continue;}
   insert.push([r.linea_id,depot,ajuste,fecha(1),fecha(2),JSON.stringify(datos)]);filas++;
  }
  await insertarFilas(c,'ims_cm_linea_historica',['linea_id','depot','ajuste','fecha_inicio','fecha_fin','datos'],insert);previo=rs.at(-1).linea_id;
 }
 await c.commit();return {filasHistoricasProyectadas:filas,cantidadesHistoricasParaRevision:incidencias};
 }catch(e){await c.rollback();throw e;}
}
export async function conservarRegistrosSQL(c){
 const [hs]=await c.execute(`SELECT h.* FROM ims_snapshot_hoja h JOIN ims_snapshot s ON s.snapshot_id=h.snapshot_id WHERE s.estado='VERIFICADO' ORDER BY s.creado_en DESC,h.hoja`);let filas=0,hojas=0;
 for(const h of hs){const n=normal(h.hoja).replace(/[^A-Z0-9]/g,'');if(n==='USUARIOS'||/CREDENCIAL|PASSWORD|CONTRASENA|TOKEN|SECRET/.test(n))continue;const clave='snapshot:'+h.snapshot_id+':'+h.hoja,[[ya]]=await c.execute('SELECT clave FROM ims_cm_fuente WHERE clave=?',[clave]);if(ya)continue;
 await c.beginTransaction();try{
  await c.execute('INSERT INTO ims_cm_fuente(clave,sha256,metadatos,filas) VALUES (?,?,?,?)',[clave,h.sha256,JSON.stringify({nombre:h.hoja,clase:n,completa:true,prioridad:1}),h.filas]);
  let antes=0,total=0;const huella=createHash('sha256');
  for(;;){const [rs]=await c.execute('SELECT numero_fila,contenido FROM ims_snapshot_fila WHERE snapshot_id=? AND hoja=? AND numero_fila>? ORDER BY numero_fila LIMIT 100',[h.snapshot_id,h.hoja,antes]);if(!rs.length)break;for(const r of rs){huella.update(r.contenido).update('\n');total++;}await insertarFilas(c,'ims_cm_legado',['fuente','fila','clase','contenido'],rs.map(r=>[clave,r.numero_fila,n,r.contenido]));antes=rs.at(-1).numero_fila;}
  exigir(total===Number(h.filas)&&huella.digest('hex')===h.sha256,'GUARDADO_RECHAZADO','El registro SQL no coincide con su huella.');await c.commit();filas+=total;hojas++;
 }catch(e){await c.rollback();throw e;}
 }
 return {hojasDeRegistroConservadas:hojas,filasDeRegistroConservadas:filas};
}
