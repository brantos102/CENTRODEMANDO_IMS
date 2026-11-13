import {transaccionOperativa} from '../mysql/operacion-nativa.mjs';
import {perfilCentro} from './servicio.mjs';
import {exigir,uuid,hash,diaEcuador} from './dominio.mjs';
import {acumuladorWms,resultadoWms} from '../dominio/analisis-wms.mjs';
import {xlsx,zip} from './archivos.mjs';
import {INV} from '../migracion/modelo.mjs';
const parse=x=>typeof x==='string'?JSON.parse(x):x;
export function csvCelda(x){const s=String(x??'');return '"'+(/^[\s]*[=+@\-]/.test(s)&&!/^[-+]?\d+(?:\.\d{1,9})?$/.test(s)?"'":'')+s.replaceAll('"','""')+'"';}
export function csv(filas){return '\ufeff'+filas.map(r=>r.map(csvCelda).join(';')).join('\r\n')+'\r\n';}
export function xml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
// Excel XML mantiene SKU, series y cantidades como cadenas exactas y no ejecuta fórmulas.
export function excel(filas,nombre='INVENTARIOS'){
 return '<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="'+xml(nombre)+'"><Table>'+filas.map(r=>'<Row>'+r.map(c=>'<Cell><Data ss:Type="String">'+xml(c)+'</Data></Cell>').join('')+'</Row>').join('')+'</Table></Worksheet></Workbook>';
}
export function ics(eventos){const safe=x=>String(x??'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ITSANET//Centro de Mando//ES','CALSCALE:GREGORIAN',...eventos.flatMap(e=>['BEGIN:VEVENT','UID:'+e.id+'@centromando.itsanet','DTSTART;VALUE=DATE:'+e.fecha_inicio.replaceAll('-',''),'SUMMARY:'+safe(e.cliente+' · '+e.titulo),'DESCRIPTION:'+safe(e.observacion),'END:VEVENT']),'END:VCALENDAR',''].join('\r\n');}
export async function filasInventario(c,p,id,{administrativo=false}={}){
 uuid(id);
 const [[n]]=await c.execute('SELECT i.*,n.fecha_inicio,n.fecha_entrega,n.borrador,n.version FROM ims_op_inventario i LEFT JOIN ims_nat_inventario n ON n.inventario_id=i.id WHERE i.id=?',[id]);exigir(n,'SIN_PERMISO','Inventario no autorizado.');
 const [[faltas]]=await c.execute('SELECT COUNT(*) n FROM ims_op_inventario_cliente ic WHERE ic.inventario_id=? AND NOT EXISTS(SELECT 1 FROM ims_op_permiso p WHERE p.inventario_id=ic.inventario_id AND p.cliente_id=ic.cliente_id AND p.actor_id=?)',[id,p.actorId]);exigir(administrativo||Number(faltas.n)===0,'SIN_PERMISO','El reporte requiere autorización para todos los clientes del inventario.');
 const rows=[];let desde='';
 for(;;){const [r]=await c.execute(`SELECT l.*,cli.nombre cliente,d.posicion,d.descripcion,d.serie,d.lote,d.unidad,x.numero,x.depot,x.ajuste,x.motivo,x.justificacion,x.abc,x.despacho,x.partida,x.categoria,x.estado_mercancia,h.depot legado_depot,h.ajuste legado_ajuste,h.fecha_inicio legado_inicio,h.fecha_fin legado_fin,h.datos legado_datos FROM ims_op_linea l JOIN ims_op_cliente cli ON cli.id=l.cliente_id LEFT JOIN ims_op_detalle_linea d ON d.linea_id=l.id LEFT JOIN ims_nat_linea x ON x.linea_id=l.id LEFT JOIN ims_cm_linea_historica h ON h.linea_id=l.id WHERE l.inventario_id=? AND l.id>? ORDER BY l.id LIMIT 500`,[id,desde]);if(!r.length)break;
  for(const f of r){if(f.numero===null){const h=f.legado_datos?parse(f.legado_datos):{};f.depot=f.legado_depot;f.ajuste=f.legado_ajuste;for(const k of ['motivo','justificacion','abc','despacho','partida','categoria','estado_mercancia','resultado_series'])f[k]=h[k]??'';f.numero=h.numero??f.fila_origen;}
   f.resultado=resultadoWms(f);rows.push(f);
  }desde=r.at(-1).id;exigir(rows.length<=200000,'SOLICITUD_INVALIDA','El inventario supera el límite del reporte.');
 }
 return {inventario:n,filas:rows};
}
export function tablaInventario(n,filas){return [INV,...filas.map(f=>[f.legado_inicio||n.fecha_inicio,f.legado_fin||n.fecha_entrega,n.codigo_operativo,f.numero,f.cliente,f.abc,f.sku,f.descripcion,f.serie,f.lote,f.despacho,f.partida,f.categoria,f.estado_mercancia,f.posicion,f.unidad,f.depot,f.resultado.fisico,f.resultado.desfase,f.resultado.resultado,f.resultado_series||'',f.conteo_1,f.conteo_2,f.conteo_final,f.ajuste,f.motivo,f.justificacion,f.observacion,f.nueva_posicion,''])];}
export async function reporteInventario(pool,p,id,formato='csv'){
 return transaccionOperativa(pool,p,async c=>{const pf=await perfilCentro(c,p);exigir(pf.permisos.exportar,'SIN_PERMISO','Tu rol no exporta reportes.');const {inventario:n,filas}=await filasInventario(c,p,id);exigir(pf.sedes.includes(n.sede),'SIN_PERMISO','Sede no autorizada.');const t=tablaInventario(n,filas);return {nombre:(n.codigo_operativo.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9_.-]/g,'_').slice(0,120)||'inventario')+'_'+id+(formato==='excel'?'.xlsx':'.csv'),tipo:formato==='excel'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv; charset=utf-8',contenido:formato==='excel'?await xlsx(t):csv(t)};});
}
export async function consolidarCentro(pool,p,s){
 uuid(s.operacionId);return transaccionOperativa(pool,p,async c=>{
 const pf=await perfilCentro(c,p,true);exigir(pf.rol==='ADMIN','SIN_PERMISO','La consolidación corresponde al administrador.');const d=hash({tipo:'consolidar',publicar:s.publicar===true});
 const [[prev]]=await c.execute('SELECT hash,resultado FROM ims_cm_auditoria WHERE actor_id=? AND operacion_id=?',[p.actorId,s.operacionId]);if(prev){exigir(prev.hash===d,'OPERACION_REUTILIZADA','La operación corresponde a otra solicitud.');return {...parse(prev.resultado),repetida:true};}
 const [invs]=pf.sedes.length?await c.execute('SELECT id,estado FROM ims_op_inventario WHERE sede IN ('+pf.sedes.map(()=>'?').join(',')+') ORDER BY id',pf.sedes):[[]],incidencias=[],resultados=[];
 for(const i of invs){if(i.estado!=='ENTREGADO')continue;
  // Bloquea la cabecera durante el cálculo para que una entrega revertida no se publique.
  const [[estado]]=await c.execute('SELECT estado FROM ims_op_inventario WHERE id=? FOR SHARE',[i.id]);if(estado.estado!=='ENTREGADO')continue;
  const {inventario,filas}=await filasInventario(c,p,i.id,{administrativo:true}),a=acumuladorWms();let listo=true;
  for(const r of filas){if(r.depot===null){listo=false;continue;}a.agregar(r);}const out=a.terminar();
  if(!listo){incidencias.push({inventarioId:i.id,motivo:'STOCK_HISTORICO_SIN_PROYECCION_EXACTA'});continue;}
  const firma=hash(filas.map(r=>[r.id,r.version,r.depot,r.ajuste,r.conteo_1,r.conteo_2,r.conteo_final,r.posicion,r.categoria]));resultados.push({inventarioId:i.id,codigo:inventario.codigo_operativo,resultado:out});
  if(s.publicar===true)await c.execute(`INSERT INTO ims_cm_publicacion(inventario_id,firma,resultado,publicado_por) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE firma=VALUES(firma),resultado=VALUES(resultado),publicado_por=VALUES(publicado_por),publicado_en=CURRENT_TIMESTAMP(6)`,[i.id,firma,JSON.stringify(out),p.actorId]);
 }
 const resultado={revisados:invs.length,entregadosVerificados:resultados.length,incidencias,publicados:s.publicar===true?resultados.length:0,referencia:'ITSANET_IMS_WMS_V124'};
 await c.execute('INSERT INTO ims_cm_auditoria(actor_id,operacion_id,tipo,hash,resultado,antes,despues) VALUES (?,?,?,?,?,\'null\',?)',[p.actorId,s.operacionId,'consolidar',d,JSON.stringify(resultado),JSON.stringify({inventarios:resultados.map(r=>r.inventarioId)})]);return resultado;
 });
}
