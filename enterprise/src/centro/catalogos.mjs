import {randomUUID,createHash} from 'node:crypto';
import {analizarCatalogo,decodificarCatalogo} from '../../public/catalogos-csv.mjs';
import {transaccionOperativa} from '../mysql/operacion-nativa.mjs';
import {perfilCentro} from './servicio.mjs';
import {exigir,uuid,texto,hash,normal} from './dominio.mjs';

const tipos=['EAN','WTW'];
function origen(f){
 if(!f.origen)return {};
 const o=f.origen;exigir(['DEPOT_EAN_V1','DEPOT_POS_V1'].includes(o.formato)&&Number.isInteger(o.fila)&&o.fila>=2&&o.datos&&typeof o.datos==='object'&&!Array.isArray(o.datos)&&Object.keys(o.datos).length<=30&&Object.entries(o.datos).every(([k,v])=>/^[A-Z_]+$/.test(k)&&typeof v==='string'&&v.length<=2000));return {origen:{formato:o.formato,fila:o.fila,datos:{...o.datos}}};
}
function archivoCatalogo(s){
 const a=s.archivo;exigir(tipos.includes(s.tipo)&&a&&typeof a.base64==='string'&&a.base64.length<=22369624&&/^[A-Za-z0-9+/]+={0,2}$/.test(a.base64),'SOLICITUD_INVALIDA','Archivo CSV no válido o mayor que 16 MB.');
 const bytes=Buffer.from(a.base64,'base64');exigir(bytes.length>0&&bytes.length<=16*1024*1024&&bytes.toString('base64')===a.base64);
 let p,codificacion;try{const d=decodificarCatalogo(bytes);codificacion=d.codificacion;p=analizarCatalogo(d.texto,s.tipo);}catch(e){exigir(false,'SOLICITUD_INVALIDA',e.message);}
 exigir(p.filas.length<=50000,'SOLICITUD_INVALIDA','El archivo supera 50.000 registros.');
 const filas=p.filas.filter(f=>!f.sede||f.sede===s.sede);exigir(filas.length,'SOLICITUD_INVALIDA','El archivo no contiene registros para la sede seleccionada.');
 return {bytes,codificacion,formato:p.formato,sha256:createHash('sha256').update(bytes).digest('hex'),total:p.filas.length,sedes:Object.fromEntries(['UIO','GYE'].map(sede=>[sede,p.filas.filter(f=>f.sede===sede).length])),filas};
}
async function clientesCatalogo(c,filas,s,cuentasERP){
 const [clientes]=await c.execute('SELECT id,nombre FROM ims_op_cliente'),porNombre=new Map(),porId=new Map(clientes.map(x=>[x.id,x]));for(const cl of clientes){const k=normal(cl.nombre);porNombre.set(k,[...(porNombre.get(k)||[]),cl.id]);}
 const asociaciones=s.asociaciones??{};exigir(asociaciones&&typeof asociaciones==='object'&&!Array.isArray(asociaciones)&&Object.keys(asociaciones).length<=1000);const codigos=new Set(filas.map(f=>f.cliente));for(const [codigo,id]of Object.entries(asociaciones))exigir(codigos.has(codigo)&&(id===null||porId.has(uuid(id))),'SOLICITUD_INVALIDA','La asociación requiere un código del archivo y un cliente existente.');
 const grupos=new Map();for(const f of filas){const codigo=f.cliente,candidatos=new Set(porNombre.get(normal(codigo))||[]);let metodo='NOMBRE_EXACTO';
  for(const x of cuentasERP.filter(x=>x.sede===s.sede&&(x.codigosCliente||[]).includes(codigo))){const ids=x.clienteId&&porId.has(x.clienteId)?[x.clienteId]:porNombre.get(normal(x.clienteNombre))||[];for(const id of ids)candidatos.add(id);if(ids.length)metodo='CUENTA_ERP_VERIFICADA';}
  if(Object.hasOwn(asociaciones,codigo)){candidatos.clear();if(asociaciones[codigo])candidatos.add(asociaciones[codigo]);metodo='ASOCIACION_EXPLICITA';}
  const id=candidatos.size===1?[...candidatos][0]:null;f.clienteId=id;
  if(!grupos.has(codigo))grupos.set(codigo,{codigo,filas:0,clienteId:id,clienteNombre:id?porId.get(id).nombre:null,metodo:id?metodo:candidatos.size>1?'AMBIGUO':'PENDIENTE'});grupos.get(codigo).filas++;
 }return [...grupos.values()];
}
export async function previsualizarCatalogo(pool,p,s,{cuentasERP=[]}={}){
 return transaccionOperativa(pool,p,async c=>{const pf=await perfilCentro(c,p);exigir(pf.rol==='ADMIN'&&pf.sedes.includes(s.sede),'SIN_PERMISO','La carga de catálogos corresponde al administrador de la sede.');const a=archivoCatalogo(s),filas=validarFilasCatalogo(s.tipo,a.filas),clientes=s.tipo==='EAN'?await clientesCatalogo(c,filas,s,cuentasERP):[];return {formato:a.formato,codificacion:a.codificacion,sha256:a.sha256,bytes:a.bytes.length,filasArchivo:a.total,filasSede:filas.length,otrasSedes:a.total-filas.length,sedes:a.sedes,clientes,pendientes:filas.filter(f=>s.tipo==='EAN'&&!f.clienteId).length,asociacionesWTW:s.tipo==='WTW'?filas.length:0,posicionesWTW:s.tipo==='WTW'?new Set(filas.map(f=>JSON.stringify([f.almacen||'',f.bodega||'',f.posicion]))).size:0,geometria:filas.filter(f=>f.x!==undefined).length,existenciasModificadas:false};});
}
export function validarFilasCatalogo(tipo,filas){
 exigir(tipos.includes(tipo)&&Array.isArray(filas)&&filas.length>0&&filas.length<=50000,'SOLICITUD_INVALIDA','El catálogo requiere entre 1 y 50.000 filas.');
 const claves=new Set();return filas.map(f=>{
  exigir(f&&typeof f==='object'&&!Array.isArray(f));
  if(tipo==='EAN'){
   const r={cliente:texto(f.cliente,255,true),ean:texto(f.ean,120,true),sku:texto(f.sku,255,true),...origen(f)};
   if(r.origen){r.tipoCodigo=texto(f.tipoCodigo??'',50);r.cantidadPresentacion=texto(f.cantidadPresentacion??'',100);}
   exigir(!/[\x00-\x1f]/.test(r.ean+r.sku));const k=r.origen?'fila:'+r.origen.fila:JSON.stringify([normal(r.cliente),r.ean,r.sku]);exigir(!claves.has(k),'SOLICITUD_INVALIDA','El catálogo repite una asociación EAN, cliente y SKU.');claves.add(k);return r;
  }
  const r={posicion:texto(f.posicion,255,true),zona:texto(f.zona??'',255),descripcion:texto(f.descripcion??'',1000),...origen(f)},campos=['x','y','z','ancho','fondo','alto'],presentes=campos.filter(k=>f[k]!==undefined&&String(f[k]).trim()!=='');
  if(r.origen)for(const k of ['almacen','bodega','calle','columna','nivel','profundidad','clienteCodigo','posicionId','sede'])r[k]=texto(f[k]??'',255);
  exigir(presentes.length===0||presentes.length===6,'SOLICITUD_INVALIDA','Las coordenadas requieren x, y, z, ancho, fondo y alto, todas en metros con punto decimal.');
  for(const k of presentes){const v=texto(String(f[k]),24,true);exigir(/^-?\d+(?:\.\d{1,6})?$/.test(v)&&Number.isFinite(Number(v))&&Math.abs(Number(v))<=10000&&(campos.indexOf(k)<3||Number(v)>0),'SOLICITUD_INVALIDA','Coordenada o dimensión inválida. No se adivinan separadores.');r[k]=v;}
  const k=r.origen?'fila:'+r.origen.fila:r.posicion;exigir(!claves.has(k),'SOLICITUD_INVALIDA','Una posición aparece más de una vez en el maestro.');claves.add(k);return r;
 });
}
async function inventarioAutorizado(c,p,pf,id){
 uuid(id);const [[r]]=await c.execute('SELECT i.sede FROM ims_op_inventario i WHERE i.id=? AND EXISTS(SELECT 1 FROM ims_op_permiso p WHERE p.inventario_id=i.id AND p.actor_id=?)',[id,p.actorId]);exigir(r&&pf.sedes.includes(r.sede),'SIN_PERMISO','Inventario no autorizado.');return r;
}
export async function importarCatalogo(pool,p,s,{cuentasERP=[]}={}){
 uuid(s.operacionId);return transaccionOperativa(pool,p,async c=>{
  const pf=await perfilCentro(c,p,true);exigir(pf.rol==='ADMIN'&&pf.sedes.includes(s.sede),'SIN_PERMISO','La carga de catálogos corresponde al administrador de la sede.');
  const archivo=s.archivo?archivoCatalogo(s):null,filas=validarFilasCatalogo(s.tipo,archivo?archivo.filas:s.filas),nombre=texto(s.nombre,255,true),firma=hash({tipo:s.tipo,sede:s.sede,nombre,filas,...(archivo?{archivoSha256:archivo.sha256,asociaciones:s.asociaciones??{}}:{})});
  exigir(filas.every(f=>!f.sede||f.sede===s.sede),'SOLICITUD_INVALIDA','El catálogo contiene filas de otra sede.');
  const [[prev]]=await c.execute('SELECT hash,resultado FROM ims_cm_auditoria WHERE actor_id=? AND operacion_id=?',[p.actorId,s.operacionId]);if(prev){exigir(prev.hash===firma,'OPERACION_REUTILIZADA','La operación corresponde a otro catálogo.');return {...JSON.parse(prev.resultado),repetida:true};}
  await c.execute('INSERT INTO ims_cm_catalogo_actual(sede,tipo) VALUES (?,?) ON DUPLICATE KEY UPDATE sede=VALUES(sede)',[s.sede,s.tipo]);
  const [[actual]]=await c.execute('SELECT catalogo_id FROM ims_cm_catalogo_actual WHERE sede=? AND tipo=? FOR UPDATE',[s.sede,s.tipo]);
  const clientes=s.tipo==='EAN'?await clientesCatalogo(c,filas,s,cuentasERP):[];
  if(s.tipo==='EAN'&&archivo?.formato!=='DEPOT_EAN_V1')exigir(filas.every(f=>f.clienteId),'SOLICITUD_INVALIDA','Hay un cliente del catálogo EAN que no coincide de forma única con el catálogo de clientes. Conserva el nombre oficial del panel.');
  const id=randomUUID();await c.execute('INSERT INTO ims_cm_catalogo(id,sede,tipo,nombre,sha256,filas,creado_por) VALUES (?,?,?,?,?,?,?)',[id,s.sede,s.tipo,nombre,firma,filas.length,p.actorId]);
  for(let i=0;i<filas.length;i+=100){const lote=filas.slice(i,i+100);await c.execute('INSERT INTO ims_cm_catalogo_fila(catalogo_id,numero,cliente_id,ean,sku,posicion,datos) VALUES '+lote.map(()=>'(?,?,?,?,?,?,?)').join(','),lote.flatMap((f,j)=>[id,i+j+1,f.clienteId??null,f.ean??'',f.sku??'',f.posicion??'',JSON.stringify(f)]));}
  if(archivo){const sedes=Object.keys(archivo.sedes).filter(k=>archivo.sedes[k]>0);for(let i=0;i<archivo.bytes.length;i+=262144)await c.execute('INSERT INTO ims_cm_catalogo_archivo(catalogo_id,parte,sha256,bytes_archivo,codificacion,formato,sedes_archivo,contenido) VALUES (?,?,?,?,?,?,?,?)',[id,i/262144,archivo.sha256,archivo.bytes.length,archivo.codificacion,archivo.formato,JSON.stringify(sedes.length?sedes:[s.sede]),archivo.bytes.subarray(i,i+262144)]);}
  await c.execute('UPDATE ims_cm_catalogo_actual SET catalogo_id=? WHERE sede=? AND tipo=?',[id,s.sede,s.tipo]);const r={catalogoId:id,tipo:s.tipo,sede:s.sede,filas:filas.length,versionAnterior:actual.catalogo_id,existenciasModificadas:false,...(archivo?{archivoOriginalConservado:true,sha256Original:archivo.sha256,filasOtrasSedes:archivo.total-filas.length,clientes,filasPendientes:filas.filter(f=>s.tipo==='EAN'&&!f.clienteId).length}:{})};
  await c.execute('INSERT INTO ims_cm_auditoria(actor_id,operacion_id,tipo,hash,resultado,antes,despues) VALUES (?,?,?,?,?,?,?)',[p.actorId,s.operacionId,'catalogo',firma,JSON.stringify(r),JSON.stringify({catalogoId:actual.catalogo_id}),JSON.stringify({catalogoId:id})]);return r;
 });
}
export async function consultarCatalogos(pool,p,q={}){
 return transaccionOperativa(pool,p,async c=>{
  const pf=await perfilCentro(c,p);exigir(pf.sedes.includes(q.sede),'SIN_PERMISO','Sede no autorizada.');
  const [rows]=await c.execute('SELECT x.id,x.sede,x.tipo,x.nombre,x.filas,x.sha256,x.creado_en,(SELECT COUNT(*) FROM ims_cm_catalogo_fila f WHERE f.catalogo_id=x.id AND f.cliente_id IS NULL AND x.tipo=\'EAN\') pendientes,(SELECT sha256 FROM ims_cm_catalogo_archivo ar WHERE ar.catalogo_id=x.id AND ar.parte=0) sha256_original,(SELECT sedes_archivo FROM ims_cm_catalogo_archivo ar WHERE ar.catalogo_id=x.id AND ar.parte=0) sedes_original FROM ims_cm_catalogo_actual a JOIN ims_cm_catalogo x ON x.id=a.catalogo_id WHERE a.sede=?',[q.sede]);
  for(const r of rows){r.originalDisponible=pf.rol==='ADMIN'&&!!r.sedes_original&&JSON.parse(r.sedes_original).every(s=>pf.sedes.includes(s));delete r.sedes_original;}
  if(!q.tipo)return {catalogos:rows};exigir(tipos.includes(q.tipo));const meta=rows.find(r=>r.tipo===q.tipo);if(!meta)return {catalogo:null,filas:[],siguiente:null};
  exigir(q.tipo==='WTW'||pf.rol==='ADMIN','SIN_PERMISO','Las asociaciones EAN se consultan desde un inventario autorizado.');
  if(q.version)exigir(q.version===meta.id,'VERSION_DESACTUALIZADA','El catálogo cambió durante la consulta. Actualiza para cargar una versión completa.');
  const desde=Number(q.desde||0);exigir(Number.isInteger(desde)&&desde>=0);const [filas]=await c.execute('SELECT numero,datos FROM ims_cm_catalogo_fila WHERE catalogo_id=? AND numero>? ORDER BY numero LIMIT 501',[meta.id,desde]);
  return {catalogo:meta,filas:filas.slice(0,500).map(r=>({numero:r.numero,...JSON.parse(r.datos)})),siguiente:filas.length>500?filas[499].numero:null};
 });
}
export async function resolverEAN(pool,p,q){
 return transaccionOperativa(pool,p,async c=>{
  const pf=await perfilCentro(c,p),inv=await inventarioAutorizado(c,p,pf,q.inventario),ean=texto(q.codigo,120,true);
  const [rows]=await c.execute(`SELECT DISTINCT f.sku,cl.id clienteId,cl.nombre cliente,JSON_UNQUOTE(JSON_EXTRACT(f.datos,'$.tipoCodigo')) tipoCodigo,JSON_UNQUOTE(JSON_EXTRACT(f.datos,'$.cantidadPresentacion')) cantidadPresentacion FROM ims_cm_catalogo_actual a JOIN ims_cm_catalogo_fila f ON f.catalogo_id=a.catalogo_id JOIN ims_op_cliente cl ON cl.id=f.cliente_id JOIN ims_op_permiso pe ON pe.cliente_id=f.cliente_id AND pe.inventario_id=? AND pe.actor_id=? WHERE a.sede=? AND a.tipo='EAN' AND f.ean=? ORDER BY cl.nombre,f.sku LIMIT 101`,[q.inventario,p.actorId,inv.sede,ean]);
  exigir(rows.length<=100,'SOLICITUD_INVALIDA','Demasiadas asociaciones; revisa el catálogo EAN.');return {coincidencias:rows,ambigua:new Set(rows.map(r=>r.sku)).size>1};
 });
}
export async function originalCatalogo(pool,p,id){
 uuid(id);return transaccionOperativa(pool,p,async c=>{const pf=await perfilCentro(c,p),[[meta]]=await c.execute('SELECT sede,nombre FROM ims_cm_catalogo WHERE id=?',[id]);exigir(pf.rol==='ADMIN'&&meta&&pf.sedes.includes(meta.sede),'SIN_PERMISO','Original no autorizado.');const [partes]=await c.execute('SELECT parte,sha256,bytes_archivo,sedes_archivo,contenido FROM ims_cm_catalogo_archivo WHERE catalogo_id=? ORDER BY parte',[id]);exigir(partes.length&&partes.every((p,i)=>p.parte===i),'SOLICITUD_INVALIDA','El original no está disponible.');exigir(JSON.parse(partes[0].sedes_archivo).every(s=>pf.sedes.includes(s)),'SIN_PERMISO','El original completo requiere autorización para todas las sedes que contiene.');const contenido=Buffer.concat(partes.map(p=>p.contenido));exigir(contenido.length===partes[0].bytes_archivo&&createHash('sha256').update(contenido).digest('hex')===partes[0].sha256,'GUARDADO_RECHAZADO','No se confirmó la integridad del original.');return {nombre:meta.nombre.replace(/[^A-Za-z0-9_.-]/g,'_'),contenido};});
}
