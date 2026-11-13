import {readFile,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {records,hashFile} from '../../tools/importar-snapshot.mjs';
import {leerContextoCopiaAbiertos,codigoMysqlSeguro} from './copia-abiertos.mjs';
import {comprobarLineaLegado,insertarLineasLegado} from '../mysql/lineas-legado.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex'),SHA=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export class ErrorImportarAbiertos extends Error{constructor(codigo){super(codigo);this.codigo=codigo;}}
const exigir=(v,c='PLAN_ABIERTO_INCOMPATIBLE')=>{if(!v)throw new ErrorImportarAbiertos(c);};
export function idImportacion(tipo,clave){const b=Buffer.from(sha(JSON.stringify(['ims-abiertos-importacion-v1',tipo,clave])).slice(0,32),'hex');b[6]=(b[6]&15)|128;b[8]=(b[8]&63)|128;const h=b.toString('hex');return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');}
async function privado(f,d=false,max=512*1024*1024){const s=await lstat(f);exigir(await realpath(f)===f&&!s.isSymbolicLink()&&(d?s.isDirectory():s.isFile())&&(s.mode&0o777)===(d?0o700:0o600)&&s.uid===process.getuid()&&(d||s.size<=max),'ARCHIVO_PRIVADO_INCOMPATIBLE');}
export async function validarPlanAbierto({directorio,preparacion,planId,copiaId,corteId}){
 exigir(SHA.test(planId||'')&&SHA.test(copiaId||'')&&UUID.test(corteId||''));
 const dir=path.resolve(directorio);await privado(dir,true);const file=path.join(dir,'plan_operativo_NO_ACTIVAR.json');await privado(file,false,16*1024*1024);exigir(await hashFile(file)===planId,'PLAN_ALTERADO');
 const p=JSON.parse(await readFile(file,'utf8')),a=p.corte_elegido;
 exigir(p.formato==='ims-abiertos-plan-operativo-v2'&&p.copia_id===copiaId&&p.corte_id===corteId&&p.requiere_delta_final===false&&p.aprobado_para_importar===false&&a?.formato==='ims-abiertos-corte-elegido-v1'&&a.copia_id===copiaId&&a.corte_id===corteId&&a.usar_capturas_guardadas===true&&a.solicitar_nueva_extraccion_google===false);
 const m=JSON.parse(await readFile(path.join(preparacion,'preparacion_NO_IMPORTAR.json'),'utf8'));exigir(m.sha256_zip===a.sha256_zip&&m.corte_id===corteId&&await hashFile(path.join(preparacion,'preparacion_NO_IMPORTAR.json'))===copiaId,'COPIA_DE_OTRO_PLAN');
 const lineFile=path.join(dir,'lineas_operativas_NO_ACTIVAR.jsonl');await privado(lineFile);exigir(await hashFile(lineFile)===p.proyecciones_sha256,'PROYECCIONES_ALTERADAS');
 exigir(Array.isArray(p.fuentes)&&p.fuentes.length>0&&p.fuentes.length<=1000&&Array.isArray(p.inventarios)&&p.inventarios.length>0&&p.inventarios.length<=1000);
 const fuentes=new Map();for(const f of p.fuentes){exigir(f.ambito==='SELECCION_ACTUAL'&&!Object.keys(f.bloqueos).length&&f.requiere_delta_final===false&&['UIO','GYE'].includes(f.sede)&&UUID.test(f.cliente_id||'')&&typeof f.cliente_panel==='string');exigir(!fuentes.has(f.origen_drive));fuentes.set(f.origen_drive,f);}
 const inventarios=new Map();for(const i of p.inventarios){exigir(UUID.test(i.inventario_id||'')&&!inventarios.has(i.inventario_id)&&i.sin_bloqueos_estructurales&&!Object.keys(i.bloqueos).length&&i.requiere_delta_final===false&&['EN_PROCESO','EN_VALIDACION'].includes(i.estado_destino)&&/^20\d\d-\d\d-\d\d$/.test(i.fecha_inicio)&&typeof i.codigo_operativo==='string'&&i.codigo_operativo.length>0&&i.codigo_operativo.length<=255);const f=fuentes.get(i.origen_drive);exigir(f&&!f.pendiente_de_iniciar&&i.cliente_id===f.cliente_id&&i.sede===f.sede&&i.cliente_panel===f.cliente_panel);inventarios.set(i.inventario_id,{...i,lineas:[]});}
 const pendientes=new Map(),ids=new Set(),refs=new Set();let total=0;
 for await(const {row:l} of records(lineFile)){
  exigir(++total<=100000&&l.ambito==='SELECCION_ACTUAL'&&SHA.test(l.referencia_copia||'')&&!refs.has(l.referencia_copia)&&!ids.has(l.linea_id));refs.add(l.referencia_copia);ids.add(l.linea_id);
  const f=fuentes.get(l.origen?.origen_drive);exigir(f&&f.cliente_id===l.cliente_id);
  comprobarLineaLegado(l,{pendiente:!!f.pendiente_de_iniciar});
  if(f.pendiente_de_iniciar){exigir(UUID.test(l.pendiente_id||''));if(!pendientes.has(l.pendiente_id))pendientes.set(l.pendiente_id,{...f,pendiente_id:l.pendiente_id,lineas:[]});const grupo=pendientes.get(l.pendiente_id);exigir(grupo.origen_drive===f.origen_drive);grupo.lineas.push(l);}
  else{const grupo=inventarios.get(l.inventario_id);exigir(grupo&&grupo.origen_drive===f.origen_drive);grupo.lineas.push(l);}
 }
 exigir(total===p.productos&&inventarios.size+pendientes.size>0);
 for(const i of [...inventarios.values(),...pendientes.values()]){exigir(i.lineas.length===i.productos&&i.productos>0);exigir(i.lineas.every((l,n)=>l.numero===n+1));}
 for(const f of fuentes.values()){const n=[...inventarios.values(),...pendientes.values()].filter(i=>i.origen_drive===f.origen_drive).reduce((n,i)=>n+i.lineas.length,0);exigir(n===f.productos,'FUENTE_NO_CONCILIADA');}
 return {dir,file,lineFile,p,inventarios,pendientes,fuentes,planId,copiaId,corteId,preparacion,total};
}
async function destino(c){const [[d]]=await c.query('SELECT DATABASE() AS nombre,CURRENT_USER() AS usuario,VERSION() AS version');const test=/^centromando_ims_pruebas(?:_[a-z0-9]+)?$/.test(d.nombre||'');exigir(/^8\./.test(d.version||'')&&(d.nombre==='centromando_ims_ensayo'&&d.usuario==='ims_cm_migracion@127.0.0.1'||test&&['ims_cm_migracion@%','ims_cm_migracion@127.0.0.1'].includes(d.usuario)),'DESTINO_NO_PERMITIDO');return d.nombre;}
async function actor(c,actorId,correo,sedes){const [[a]]=await c.execute('SELECT u.correo,a.activo FROM ims_auth_usuario u JOIN ims_op_actor a ON a.id=u.actor_id WHERE u.actor_id=? FOR SHARE',[actorId]);exigir(a?.activo&&a.correo===correo,'ADMINISTRADOR_NO_CONFIRMADO');for(const s of sedes){const [[r]]=await c.execute('SELECT rol FROM ims_nat_ambito WHERE actor_id=? AND sede=? FOR SHARE',[actorId,s]);exigir(r?.rol==='ADMIN','AMBITO_ADMINISTRATIVO_NO_CONFIRMADO');}}
async function sinConflictos(c,v){
 for(const f of v.fuentes.values()){
  const [[cliente]]=await c.execute('SELECT nombre FROM ims_op_cliente WHERE id=? FOR SHARE',[f.cliente_id]);exigir(cliente?.nombre===f.cliente_panel,'CLIENTE_CAMBIO');
  const [prev]=await c.execute('SELECT id FROM ims_op_linea WHERE origen_drive=? LIMIT 1 FOR SHARE',[f.origen_drive]);exigir(!prev.length,'ORIGEN_YA_IMPORTADO');
 }
 for(const i of [...v.inventarios.values(),...v.pendientes.values()]){const id=i.inventario_id||i.pendiente_id;const [prev]=await c.execute('SELECT id FROM ims_op_inventario WHERE id=? FOR SHARE',[id]);exigir(!prev.length,'IDENTIDAD_EXISTENTE');}
}
async function comprobarInsertado(c,i){
 const keys=['sku','cliente_id','origen_drive','fila_origen','version','conteo_1','conteo_2','conteo_final','observacion','nueva_posicion','posicion','descripcion','serie','lote','unidad','numero','depot','ajuste','motivo','justificacion','abc','despacho','partida','categoria','estado_mercancia'];
 for(let n=0;n<i.lineas.length;n+=100){const [rs]=await c.execute(`SELECT l.*,d.posicion,d.descripcion,d.serie,d.lote,d.unidad,x.numero,x.depot,x.ajuste,x.motivo,x.justificacion,x.abc,x.despacho,x.partida,x.categoria,x.estado_mercancia FROM ims_op_linea l JOIN ims_op_detalle_linea d ON d.linea_id=l.id JOIN ims_nat_linea x ON x.linea_id=l.id WHERE l.inventario_id=? AND x.numero>? ORDER BY x.numero LIMIT 100`,[i.inventario_id,n]);exigir(rs.length===Math.min(100,i.lineas.length-n),'FILAS_INSERTADAS_DIFERENTES');for(let j=0;j<rs.length;j++){const l=i.lineas[n+j],r=rs[j],esperado={...l,origen_drive:l.origen.origen_drive,fila_origen:l.origen.fila,version:'0'};exigir(r.id===l.linea_id&&keys.every(k=>String(r[k])===String(esperado[k])),'CONTENIDO_INSERTADO_DIFERENTE');}}
}
async function sinCambios(v){exigir(await hashFile(v.file)===v.planId&&await hashFile(v.lineFile)===v.p.proyecciones_sha256,'PLAN_ALTERADO');}
export async function importarAbiertos({pool,actorId,correo,...solicitud}){
 exigir(UUID.test(actorId||'')&&typeof correo==='string');const v=await validarPlanAbierto(solicitud);
 await leerContextoCopiaAbiertos({pool,directorio:v.preparacion,copiaId:v.copiaId});
 const c=await pool.getConnection();let abierta=false,bloqueada=false,commit=false,destruir=false,lock,etapa='VERIFICAR_DESTINO';
 try{
  const db=await destino(c);lock='ims-abiertos-op:'+sha(db).slice(0,40);const [[r]]=await c.execute('SELECT GET_LOCK(?,0) AS adquirido',[lock]);exigir(Number(r.adquirido)===1,'OTRA_IMPORTACION_ACTIVA');bloqueada=true;
  await c.query("SET time_zone = '+00:00'");await c.beginTransaction();abierta=true;await actor(c,actorId,correo,new Set([...v.fuentes.values()].map(f=>f.sede)));
  const operacionId=idImportacion('importar',[v.corteId,v.copiaId,v.planId]);const [[prev]]=await c.execute('SELECT tipo,payload_sha256,resultado FROM ims_nat_evento WHERE actor_id=? AND operacion_id=? FOR SHARE',[actorId,operacionId]);
  if(prev){exigir(prev.tipo==='migracion_abiertos'&&prev.payload_sha256===v.planId,'IMPORTACION_DIFERENTE');await sinCambios(v);await c.commit();abierta=false;return {...JSON.parse(prev.resultado),ya_importado:true};}
  etapa='VERIFICAR_ORIGENES';await sinConflictos(c,v);
  const [[packet]]=await c.query('SELECT @@max_allowed_packet AS maximo');
  etapa='CONSERVAR_PENDIENTES';for(const p of v.pendientes.values()){
   const res={pendienteId:p.pendiente_id,sede:p.sede,clienteId:p.cliente_id,cliente:p.cliente_panel,productos:p.productos,copiaId:v.copiaId,corteId:v.corteId};const contenido=JSON.stringify({lineas:p.lineas,origenDrive:p.origen_drive});exigir(Buffer.byteLength(contenido)+65536<Number(packet.maximo),'PENDIENTE_EXCEDE_PAQUETE_SQL');
   await c.execute('INSERT INTO ims_nat_evento(actor_id,operacion_id,tipo,inventario_id,payload_sha256,resultado,antes,despues) VALUES (?,?,?,NULL,?,?,?,?)',[actorId,p.pendiente_id,'pendiente_legado',sha(contenido),JSON.stringify(res),JSON.stringify({copiaId:v.copiaId,planId:v.planId}),contenido]);
  }
  etapa='IMPORTAR_CONTEOS';for(const i of v.inventarios.values()){
   await c.execute('INSERT INTO ims_op_inventario(id,sede,codigo_operativo,estado) VALUES (?,?,?,?)',[i.inventario_id,i.sede,i.codigo_operativo,i.estado_destino]);
   await c.execute('INSERT INTO ims_nat_inventario(inventario_id,creador_id,version,borrador,fecha_inicio,mostrar_depot) VALUES (?,?,1,1,?,0)',[i.inventario_id,actorId,i.fecha_inicio]);
   await c.execute('INSERT INTO ims_op_inventario_cliente VALUES (?,?)',[i.inventario_id,i.cliente_id]);
   await c.execute('INSERT INTO ims_op_permiso VALUES (?,?,?,1)',[actorId,i.inventario_id,i.cliente_id]);await c.execute("INSERT INTO ims_nat_perfil VALUES (?,?,?,'SUPERVISOR')",[actorId,i.inventario_id,i.cliente_id]);
   await insertarLineasLegado(c,i.inventario_id,i.lineas);await comprobarInsertado(c,i);
   await c.execute('UPDATE ims_nat_inventario SET borrador=0 WHERE inventario_id=?',[i.inventario_id]);
  }
  const activas=[...v.inventarios.values()].flatMap(i=>i.lineas);const resultado={ok:true,ya_importado:false,corte_id:v.corteId,copia_id:v.copiaId,plan_id:v.planId,datos_operativos_importados:true,conteos_habilitados:v.inventarios.size,lineas_habilitadas:activas.length,archivos_pendientes_de_iniciar:v.pendientes.size,lineas_pendientes_de_iniciar:[...v.pendientes.values()].reduce((n,p)=>n+p.lineas.length,0),capturas_conservadas:Object.fromEntries(['conteo_1','conteo_2','conteo_final'].map(k=>[k,activas.filter(l=>l[k]!==null).length])),ceros_conservados:Object.fromEntries(['conteo_1','conteo_2','conteo_final'].map(k=>[k,activas.filter(l=>l[k]==='0.000000000').length])),historico_modificado:false,cuentas_existentes_modificadas:false,acceso_inicial:'SUPERVISOR_CUENTA_EXISTENTE',publicacion_kpi:false,solicitar_nueva_extraccion_google:false};
  await c.execute('INSERT INTO ims_nat_evento(actor_id,operacion_id,tipo,inventario_id,payload_sha256,resultado,antes,despues) VALUES (?,?,?,NULL,?,?,?,?)',[actorId,operacionId,'migracion_abiertos',v.planId,JSON.stringify(resultado),JSON.stringify(v.p.corte_elegido),JSON.stringify({inventarios:[...v.inventarios.keys()],pendientes:[...v.pendientes.keys()],lineas:v.total})]);
  etapa='CONFIRMAR_TRANSACCION';await sinCambios(v);commit=true;await c.commit();commit=false;abierta=false;return resultado;
 }catch(error){if(abierta)try{await c.rollback();}catch{destruir=true;}if(commit){destruir=true;throw new ErrorImportarAbiertos('CONFIRMACION_IMPORTACION_PENDIENTE');}const fallo=error instanceof ErrorImportarAbiertos?error:new ErrorImportarAbiertos('IMPORTACION_OPERATIVA_NO_CONFIRMADA');fallo.etapa=etapa;fallo.codigoMysql=codigoMysqlSeguro(error);throw fallo;}
 finally{if(bloqueada&&!destruir)try{await c.execute('SELECT RELEASE_LOCK(?)',[lock]);}catch{}if(destruir)c.destroy();else c.release();}
}
