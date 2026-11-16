import {randomUUID} from 'node:crypto';
import {transaccionOperativa} from '../mysql/operacion-nativa.mjs';
import {perfilCentro} from './servicio.mjs';
import {exigir,uuid,texto,hash,normal} from './dominio.mjs';

const tipos=['EAN','WTW'];
export function validarFilasCatalogo(tipo,filas){
 exigir(tipos.includes(tipo)&&Array.isArray(filas)&&filas.length>0&&filas.length<=50000,'SOLICITUD_INVALIDA','El catálogo requiere entre 1 y 50.000 filas.');
 const claves=new Set();return filas.map(f=>{
  exigir(f&&typeof f==='object'&&!Array.isArray(f));
  if(tipo==='EAN'){
   const r={cliente:texto(f.cliente,255,true),ean:texto(f.ean,120,true),sku:texto(f.sku,255,true)};
   exigir(!/[\x00-\x1f]/.test(r.ean+r.sku));const k=JSON.stringify([normal(r.cliente),r.ean,r.sku]);exigir(!claves.has(k),'SOLICITUD_INVALIDA','El catálogo repite una asociación EAN, cliente y SKU.');claves.add(k);return r;
  }
  const r={posicion:texto(f.posicion,255,true),zona:texto(f.zona??'',255),descripcion:texto(f.descripcion??'',1000)},campos=['x','y','z','ancho','fondo','alto'],presentes=campos.filter(k=>f[k]!==undefined&&String(f[k]).trim()!=='');
  exigir(presentes.length===0||presentes.length===6,'SOLICITUD_INVALIDA','Las coordenadas requieren x, y, z, ancho, fondo y alto, todas en metros con punto decimal.');
  for(const k of presentes){const v=texto(String(f[k]),24,true);exigir(/^-?\d+(?:\.\d{1,6})?$/.test(v)&&Number.isFinite(Number(v))&&Math.abs(Number(v))<=10000&&(campos.indexOf(k)<3||Number(v)>0),'SOLICITUD_INVALIDA','Coordenada o dimensión inválida. No se adivinan separadores.');r[k]=v;}
  exigir(!claves.has(r.posicion),'SOLICITUD_INVALIDA','Una posición aparece más de una vez en el maestro.');claves.add(r.posicion);return r;
 });
}
async function inventarioAutorizado(c,p,pf,id){
 uuid(id);const [[r]]=await c.execute('SELECT i.sede FROM ims_op_inventario i WHERE i.id=? AND EXISTS(SELECT 1 FROM ims_op_permiso p WHERE p.inventario_id=i.id AND p.actor_id=?)',[id,p.actorId]);exigir(r&&pf.sedes.includes(r.sede),'SIN_PERMISO','Inventario no autorizado.');return r;
}
export async function importarCatalogo(pool,p,s){
 uuid(s.operacionId);return transaccionOperativa(pool,p,async c=>{
  const pf=await perfilCentro(c,p,true);exigir(pf.rol==='ADMIN'&&pf.sedes.includes(s.sede),'SIN_PERMISO','La carga de catálogos corresponde al administrador de la sede.');
  const filas=validarFilasCatalogo(s.tipo,s.filas),nombre=texto(s.nombre,255,true),firma=hash({tipo:s.tipo,sede:s.sede,nombre,filas});
  const [[prev]]=await c.execute('SELECT hash,resultado FROM ims_cm_auditoria WHERE actor_id=? AND operacion_id=?',[p.actorId,s.operacionId]);if(prev){exigir(prev.hash===firma,'OPERACION_REUTILIZADA','La operación corresponde a otro catálogo.');return {...JSON.parse(prev.resultado),repetida:true};}
  await c.execute('INSERT INTO ims_cm_catalogo_actual(sede,tipo) VALUES (?,?) ON DUPLICATE KEY UPDATE sede=VALUES(sede)',[s.sede,s.tipo]);
  const [[actual]]=await c.execute('SELECT catalogo_id FROM ims_cm_catalogo_actual WHERE sede=? AND tipo=? FOR UPDATE',[s.sede,s.tipo]);
  const [clientes]=s.tipo==='EAN'?await c.execute('SELECT id,nombre FROM ims_op_cliente'):[[]];const porNombre=new Map();for(const cl of clientes){const k=normal(cl.nombre);porNombre.set(k,[...(porNombre.get(k)||[]),cl.id]);}
  for(const f of filas)if(s.tipo==='EAN'){const ids=porNombre.get(normal(f.cliente))||[];exigir(ids.length===1,'SOLICITUD_INVALIDA','Hay un cliente del catálogo EAN que no coincide de forma única con el catálogo de clientes. Conserva el nombre oficial del panel.');f.clienteId=ids[0];}
  const id=randomUUID();await c.execute('INSERT INTO ims_cm_catalogo(id,sede,tipo,nombre,sha256,filas,creado_por) VALUES (?,?,?,?,?,?,?)',[id,s.sede,s.tipo,nombre,firma,filas.length,p.actorId]);
  for(let i=0;i<filas.length;i+=100){const lote=filas.slice(i,i+100);await c.execute('INSERT INTO ims_cm_catalogo_fila(catalogo_id,numero,cliente_id,ean,sku,posicion,datos) VALUES '+lote.map(()=>'(?,?,?,?,?,?,?)').join(','),lote.flatMap((f,j)=>[id,i+j+1,f.clienteId??null,f.ean??'',f.sku??'',f.posicion??'',JSON.stringify(f)]));}
  await c.execute('UPDATE ims_cm_catalogo_actual SET catalogo_id=? WHERE sede=? AND tipo=?',[id,s.sede,s.tipo]);const r={catalogoId:id,tipo:s.tipo,sede:s.sede,filas:filas.length,versionAnterior:actual.catalogo_id,existenciasModificadas:false};
  await c.execute('INSERT INTO ims_cm_auditoria(actor_id,operacion_id,tipo,hash,resultado,antes,despues) VALUES (?,?,?,?,?,?,?)',[p.actorId,s.operacionId,'catalogo',firma,JSON.stringify(r),JSON.stringify({catalogoId:actual.catalogo_id}),JSON.stringify({catalogoId:id})]);return r;
 });
}
export async function consultarCatalogos(pool,p,q={}){
 return transaccionOperativa(pool,p,async c=>{
  const pf=await perfilCentro(c,p);exigir(pf.sedes.includes(q.sede),'SIN_PERMISO','Sede no autorizada.');
  const [rows]=await c.execute('SELECT x.id,x.sede,x.tipo,x.nombre,x.filas,x.sha256,x.creado_en FROM ims_cm_catalogo_actual a JOIN ims_cm_catalogo x ON x.id=a.catalogo_id WHERE a.sede=?',[q.sede]);
  if(!q.tipo)return {catalogos:rows};exigir(tipos.includes(q.tipo));const meta=rows.find(r=>r.tipo===q.tipo);if(!meta)return {catalogo:null,filas:[],siguiente:null};
  exigir(q.tipo==='WTW'||pf.rol==='ADMIN','SIN_PERMISO','Las asociaciones EAN se consultan desde un inventario autorizado.');
  const desde=Number(q.desde||0);exigir(Number.isInteger(desde)&&desde>=0);const [filas]=await c.execute('SELECT numero,datos FROM ims_cm_catalogo_fila WHERE catalogo_id=? AND numero>? ORDER BY numero LIMIT 501',[meta.id,desde]);
  return {catalogo:meta,filas:filas.slice(0,500).map(r=>({numero:r.numero,...JSON.parse(r.datos)})),siguiente:filas.length>500?filas[499].numero:null};
 });
}
export async function resolverEAN(pool,p,q){
 return transaccionOperativa(pool,p,async c=>{
  const pf=await perfilCentro(c,p),inv=await inventarioAutorizado(c,p,pf,q.inventario),ean=texto(q.codigo,120,true);
  const [rows]=await c.execute(`SELECT DISTINCT f.sku,cl.id clienteId,cl.nombre cliente FROM ims_cm_catalogo_actual a JOIN ims_cm_catalogo_fila f ON f.catalogo_id=a.catalogo_id JOIN ims_op_cliente cl ON cl.id=f.cliente_id JOIN ims_op_permiso pe ON pe.cliente_id=f.cliente_id AND pe.inventario_id=? AND pe.actor_id=? WHERE a.sede=? AND a.tipo='EAN' AND f.ean=? ORDER BY cl.nombre,f.sku LIMIT 101`,[q.inventario,p.actorId,inv.sede,ean]);
  exigir(rows.length<=100,'SOLICITUD_INVALIDA','Demasiadas asociaciones; revisa el catálogo EAN.');return {coincidencias:rows,ambigua:new Set(rows.map(r=>r.sku)).size>1};
 });
}
