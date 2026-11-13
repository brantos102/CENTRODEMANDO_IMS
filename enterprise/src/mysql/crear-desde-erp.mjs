import {randomUUID,createHash} from 'node:crypto';
import {exigirOperacion as exigir,uuid,texto,fecha,campos,filaStock} from '../dominio/operacion.mjs';
import {decimal,textoDecimal} from '../dominio/analisis-wms.mjs';
import {transaccionOperativa} from './operacion-nativa.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const canon=v=>v.trim().toUpperCase();
export function solicitudCrearERP(s){
 campos(s,['operacionId','consultaId','codigo','fechaInicio','fechaProgramada','responsable','filasEsperadas','unidadesEsperadas']);
 const r={operacionId:uuid(s.operacionId),consultaId:uuid(s.consultaId),codigo:texto(s.codigo,255,false),fechaInicio:fecha(s.fechaInicio),fechaProgramada:s.fechaProgramada?fecha(s.fechaProgramada):null,responsable:texto(s.responsable??'',255),filasEsperadas:s.filasEsperadas,unidadesEsperadas:s.unidadesEsperadas};
 exigir(/^\d{6}_.+/.test(r.codigo),'SOLICITUD_INVALIDA','Usa el código literal DDMMAA_CLIENTE; la fecha se registra por separado.');
 exigir(Number.isInteger(r.filasEsperadas)&&r.filasEsperadas>0&&r.filasEsperadas<=100000&&typeof r.unidadesEsperadas==='string'&&/^\d{1,31}\.\d{9}$/.test(r.unidadesEsperadas));return r;
}
async function ambito(c,p,sede){const [[r]]=await c.execute("SELECT rol FROM ims_nat_ambito WHERE actor_id=? AND sede=? AND rol IN ('ADMIN','SUPERVISOR') FOR SHARE",[p.actorId,sede]);exigir(r,'SIN_PERMISO','No tienes autorización para crear inventarios ERP de esta sede.');}
async function insertar(c,tabla,columnas,rows){
 if(!rows.length)return;
 await c.execute(`INSERT INTO ${tabla}(${columnas.join(',')}) VALUES ${rows.map(r=>'('+r.map(()=>'?').join(',')+')').join(',')}`,rows.flat());
}
/** Una transacción: inventario, permisos, stock, procedencia, activación y auditoría.
 * La solicitud nunca contiene existencias ni IDs de clientes del navegador.
 * La confirmación persistida se recupera antes de requerir la caché temporal. */
export async function crearInventarioERP({pool,principal:p,solicitud,obtenerVista,conexion}){
 const s=solicitudCrearERP(solicitud),digest=hash(s),ejecutar=conexion?(_pool,_p,fn)=>fn(conexion):transaccionOperativa;
 for(let intento=0;intento<3;intento++)try{return await ejecutar(pool,p,async c=>{
  // Las claves únicas de evento y consulta impiden dos creaciones por reintento.
  // Un perdedor concurrente revierte y relee la confirmación sin ampliar privilegios.
  const [[prev]]=await c.execute('SELECT e.tipo,e.payload_sha256,e.resultado,i.sede FROM ims_nat_evento e LEFT JOIN ims_op_inventario i ON i.id=e.inventario_id WHERE e.actor_id=? AND e.operacion_id=? FOR SHARE',[p.actorId,s.operacionId]);
  if(prev){exigir(prev.tipo==='crear_erp'&&prev.payload_sha256===digest,'OPERACION_REUTILIZADA','El identificador ya corresponde a otra operación.');await ambito(c,p,prev.sede);return {...JSON.parse(prev.resultado),repetida:true};}
  const [[captura]]=await c.execute('SELECT operacion_id FROM ims_op_operacion WHERE actor_id=? AND operacion_id=?',[p.actorId,s.operacionId]);exigir(!captura,'OPERACION_REUTILIZADA','El identificador ya corresponde a una captura.');
  const [[usada]]=await c.execute('SELECT inventario_id FROM ims_erp_inventario WHERE actor_id=? AND consulta_id=?',[p.actorId,s.consultaId]);exigir(!usada,'ERP_CONSULTA_UTILIZADA','Esta extracción ya creó un inventario. Recupera la operación original.');
  const v=obtenerVista(p.actorId,s.consultaId);await ambito(c,p,v.sede);
  exigir(v.filas.length===s.filasEsperadas&&v.totales.lineas===s.filasEsperadas&&v.totales.unidades===s.unidadesEsperadas,'SOLICITUD_INVALIDA','La revisión de stock no coincide. Extrae y revisa nuevamente.');
  const [[nombre]]=await c.execute('SELECT i.id FROM ims_op_inventario i JOIN ims_nat_inventario n ON n.inventario_id=i.id WHERE i.sede=? AND UPPER(TRIM(i.codigo_operativo))=? LIMIT 1 FOR SHARE',[v.sede,canon(s.codigo)]);exigir(!nombre,'CODIGO_EXISTENTE','Ya existe un inventario nativo con ese código en la sede. Usa un código distinto.');
  const clientes=new Map();
  for(const f of v.filas){
   const key=JSON.stringify([f.clienteId,f.clienteNombre]);if(clientes.has(key))continue;
   const [rows]=f.clienteId?await c.execute('SELECT id,nombre FROM ims_op_cliente WHERE id=? FOR SHARE',[f.clienteId]):await c.execute('SELECT id,nombre FROM ims_op_cliente WHERE UPPER(TRIM(nombre)) COLLATE utf8mb4_0900_bin=? FOR SHARE',[canon(f.clienteNombre)]);
   exigir(rows.length===1&&canon(rows[0].nombre)===canon(f.clienteNombre),'ERP_CLIENTE_PENDIENTE','Falta una asociación exacta y única del cliente en el catálogo. No se creó el inventario.');clientes.set(key,rows[0].id);
  }
  const preparadas=v.filas.map((f,i)=>({id:randomUUID(),origen:{referencia:f.referencia,etiqueta:f.cuenta,codigo:f.codigoClienteERP,cliente:f.clienteNombre},fila:filaStock(Object.fromEntries(['numero','clienteId','sku','descripcion','posicion','serie','lote','unidad','depot','abc','despacho','partida','categoria','estadoMercancia'].map(k=>[k,k==='numero'?i+1:k==='clienteId'?clientes.get(JSON.stringify([f.clienteId,f.clienteNombre])):f[k]??''])))}));
  const suma=preparadas.reduce((a,r)=>a+decimal(r.fila.depot),0n);exigir(textoDecimal(suma)===s.unidadesEsperadas,'SOLICITUD_INVALIDA','Las unidades de la extracción no coinciden.');
  const contenido=hash({seleccion:v.seleccion,cuentas:v.cuentas,filas:preparadas.map(r=>({origen:r.origen,fila:r.fila}))}),id=randomUUID();
  await c.execute("INSERT INTO ims_op_inventario(id,sede,codigo_operativo,estado) VALUES (?,?,?,'EN_PROCESO')",[id,v.sede,s.codigo]);
  await c.execute('INSERT INTO ims_nat_inventario(inventario_id,creador_id,fecha_inicio,fecha_programada,responsable) VALUES (?,?,?,?,?)',[id,p.actorId,s.fechaInicio,s.fechaProgramada,s.responsable]);
  for(const cli of new Set(clientes.values())){
   await c.execute('INSERT INTO ims_op_inventario_cliente VALUES (?,?)',[id,cli]);await c.execute('INSERT INTO ims_op_permiso VALUES (?,?,?,1)',[p.actorId,id,cli]);await c.execute("INSERT INTO ims_nat_perfil VALUES (?,?,?,'SUPERVISOR')",[p.actorId,id,cli]);
  }
  const result={ok:true,operacionId:s.operacionId,consultaId:s.consultaId,inventarioId:id,sede:v.sede,codigo:s.codigo,filas:s.filasEsperadas,unidades:s.unidadesEsperadas,borrador:false,version:'1',publicacionKpi:false,contenidoSha256:contenido};
  await c.execute('INSERT INTO ims_nat_evento(actor_id,operacion_id,tipo,inventario_id,payload_sha256,resultado,antes,despues) VALUES (?,?,?,?,?,?,?,?)',[p.actorId,s.operacionId,'crear_erp',id,digest,JSON.stringify(result),'null',JSON.stringify(result)]);
  await c.execute('INSERT INTO ims_erp_inventario(inventario_id,actor_id,operacion_id,consulta_id,payload_sha256,contenido_sha256,consulta_en,filas,unidades,seleccion,cuentas) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[id,p.actorId,s.operacionId,s.consultaId,digest,contenido,new Date(v.creadaEn).toISOString().slice(0,23).replace('T',' '),s.filasEsperadas,s.unidadesEsperadas,JSON.stringify(v.seleccion),JSON.stringify(v.cuentas)]);
  // Lotes limitados también por bytes; una descripción larga no excede max_allowed_packet.
  let lote=[],bytes=0;
  async function guardar(){
   await insertar(c,'ims_op_linea',['id','inventario_id','cliente_id','sku','observacion'],lote.map(r=>[r.id,id,r.fila.clienteId,r.fila.sku,'']));
   await insertar(c,'ims_op_detalle_linea',['linea_id','posicion','descripcion','serie','lote','unidad'],lote.map(r=>[r.id,...['posicion','descripcion','serie','lote','unidad'].map(k=>r.fila[k])]));
   await insertar(c,'ims_nat_linea',['linea_id','inventario_id','numero','depot','justificacion','abc','despacho','partida','categoria','estado_mercancia'],lote.map(r=>[r.id,id,r.fila.numero,r.fila.depot,'',...['abc','despacho','partida','categoria','estadoMercancia'].map(k=>r.fila[k])]));
   await insertar(c,'ims_erp_linea',['linea_id','inventario_id','referencia','etiqueta','codigo_cliente_erp','cliente_nombre'],lote.map(r=>[r.id,id,r.origen.referencia,r.origen.etiqueta,r.origen.codigo,r.origen.cliente]));lote=[];bytes=0;
  }
  for(const r of preparadas){const n=Buffer.byteLength(JSON.stringify(r));if(lote.length&&(lote.length>=100||bytes+n>128*1024))await guardar();lote.push(r);bytes+=n;}if(lote.length)await guardar();
  const [[check]]=await c.execute('SELECT COUNT(*) AS filas,MAX(numero) AS maximo,SUM(depot) AS unidades FROM ims_nat_linea WHERE inventario_id=?',[id]);const [[origen]]=await c.execute('SELECT COUNT(*) AS filas FROM ims_erp_linea WHERE inventario_id=?',[id]);
  exigir(Number(check.filas)===s.filasEsperadas&&Number(check.maximo)===s.filasEsperadas&&Number(origen.filas)===s.filasEsperadas&&decimal(check.unidades)===suma,'GUARDADO_RECHAZADO','La conciliación de stock y procedencia falló. No se confirmó el inventario.');
  for(let offset=0;offset<preparadas.length;offset+=500){
   const [copia]=await c.execute(`SELECT x.numero,l.cliente_id,l.sku,x.depot,d.descripcion,d.posicion,d.serie,d.lote,d.unidad,x.abc,x.despacho,x.partida,x.categoria,x.estado_mercancia AS estadoMercancia,e.referencia,e.etiqueta,e.codigo_cliente_erp,e.cliente_nombre FROM ims_nat_linea x JOIN ims_op_linea l ON l.id=x.linea_id JOIN ims_op_detalle_linea d ON d.linea_id=l.id JOIN ims_erp_linea e ON e.linea_id=l.id AND e.inventario_id=x.inventario_id WHERE x.inventario_id=? AND x.numero>? ORDER BY x.numero LIMIT 500`,[id,offset]);
   exigir(copia.length===Math.min(500,preparadas.length-offset),'GUARDADO_RECHAZADO','La copia SQL está incompleta.');
   for(let i=0;i<copia.length;i++){
    const r=copia[i],fila={numero:Number(r.numero),clienteId:r.cliente_id,sku:r.sku,depot:r.depot};for(const k of ['descripcion','posicion','serie','lote','unidad','abc','despacho','partida','categoria','estadoMercancia'])fila[k]=r[k];
    const original=preparadas[offset+i];exigir(hash({origen:{referencia:r.referencia,etiqueta:r.etiqueta,codigo:r.codigo_cliente_erp,cliente:r.cliente_nombre},fila})===hash({origen:original.origen,fila:original.fila}),'GUARDADO_RECHAZADO','El contenido SQL no coincide con la extracción. No se confirmó el inventario.');
   }
  }
  await c.execute('UPDATE ims_nat_inventario SET borrador=0,version=1 WHERE inventario_id=?',[id]);
  return {...result,repetida:false};
 });}catch(e){if(e.cause?.code==='ER_DUP_ENTRY'&&intento<2)continue;throw e;}
}

export async function consultarOrigenERP(pool,p,id,lineas){
 uuid(id);exigir(Array.isArray(lineas)&&lineas.length>0&&lineas.length<=50&&new Set(lineas).size===lineas.length);lineas.forEach(uuid);
 return transaccionOperativa(pool,p,async c=>{
  const [permitidas]=await c.execute(`SELECT l.id FROM ims_op_linea l JOIN ims_nat_inventario n ON n.inventario_id=l.inventario_id JOIN ims_op_permiso a ON a.inventario_id=l.inventario_id AND a.cliente_id=l.cliente_id AND a.actor_id=? JOIN ims_nat_perfil p ON p.actor_id=a.actor_id AND p.inventario_id=a.inventario_id AND p.cliente_id=a.cliente_id WHERE l.inventario_id=? AND l.id IN (${lineas.map(()=>'?').join(',')}) FOR SHARE`,[p.actorId,id,...lineas]);exigir(permitidas.length===lineas.length,'SIN_PERMISO','Líneas no autorizadas.');
  const [rows]=await c.execute(`SELECT linea_id,referencia,etiqueta,codigo_cliente_erp,cliente_nombre FROM ims_erp_linea WHERE inventario_id=? AND linea_id IN (${lineas.map(()=>'?').join(',')})`,[id,...lineas]);return {inventarioId:id,datos:rows};
 });
}
