import {asegurarDestino} from './carpetas.mjs';
import {randomUUID} from 'node:crypto';
import {transaccionOperativa,ejecutarOperacion} from '../mysql/operacion-nativa.mjs';
import {crearInventarioERP} from '../mysql/crear-desde-erp.mjs';
import {insertarFilas} from '../mysql/lineas-legado.mjs';
import {filaStock} from '../dominio/operacion.mjs';
import {decimal,textoDecimal} from '../dominio/analisis-wms.mjs';
import {perfilCentro,mutarCentro,accesoWmsNuevo} from './servicio.mjs';
import {uuidEstable} from '../migracion/modelo.mjs';
import {exigir,hash,uuid} from './dominio.mjs';
/** Una sola transacción incluye stock, carpeta, evento, equipo y permisos.
 * El identificador se conserva en el navegador hasta confirmar su resultado. */
export async function crearDesdeCentro({pool,principal:p,solicitud:s,obtenerVista,claveCentro}){
 uuid(s.operacionId);const digest=hash(s);
 return transaccionOperativa(pool,p,async c=>{
  const pf=await perfilCentro(c,p,true);exigir(pf.permisos.crear,'SIN_PERMISO','Tu rol no crea inventarios.');
  const [[prev]]=await c.execute('SELECT hash,resultado FROM ims_cm_auditoria WHERE actor_id=? AND operacion_id=?',[p.actorId,s.operacionId]);if(prev){exigir(prev.hash===digest,'OPERACION_REUTILIZADA','La operación ya corresponde a otra creación.');return {...JSON.parse(prev.resultado),repetida:true};}
  exigir(['API','CSV','BLANCO'].includes(s.fuente)&&['NUEVO','EXISTENTE','NINGUNO'].includes(s.vinculacion));
  exigir(Array.isArray(s.clientes)&&s.clientes.length>0&&s.clientes.length<=50&&new Set(s.clientes).size===s.clientes.length,'SOLICITUD_INVALIDA','Selecciona los clientes del inventario.');
  s.clientes.forEach(uuid);exigir(s.clientes.includes(uuid(s.clientePrincipalId??s.clientes[0])),'SIN_PERMISO','El cliente principal debe estar seleccionado.');
  const [catalogo]=await c.execute('SELECT id,nombre FROM ims_op_cliente');exigir(s.clientes.every(id=>catalogo.some(c=>c.id===id)),'SOLICITUD_INVALIDA','Cliente no registrado.');
  const op=tipo=>uuidEstable('cm-creacion',[s.operacionId,tipo]);
  let resultado;
  if(s.fuente==='API'&&s.consultaId){
   exigir(typeof obtenerVista==='function','SOLICITUD_INVALIDA','Consulta primero la API.');const v=obtenerVista(p.actorId,s.consultaId);exigir(pf.sedes.includes(v.sede)&&v.sede===s.sede,'SIN_PERMISO','La sede seleccionada no coincide con la extracción.');
   const mismos=f=>{const encontrados=catalogo.filter(c=>f.clienteId?c.id===f.clienteId:c.nombre.trim().toUpperCase()===f.clienteNombre?.trim().toUpperCase());return encontrados.length===1&&s.clientes.includes(encontrados[0].id)&&encontrados[0].nombre.trim().toUpperCase()===f.clienteNombre?.trim().toUpperCase();};
   exigir(v.filas.every(mismos)&&v.cuentas.every(c=>mismos(c)),'SOLICITUD_INVALIDA','El stock extraído corresponde a otro cliente. Selecciona de nuevo los clientes y extrae su stock.');
   resultado=await crearInventarioERP({pool,principal:p,conexion:c,prepararSinActivar:true,obtenerVista,solicitud:{operacionId:op('stock'),consultaId:s.consultaId,codigo:s.codigo,fechaInicio:s.fechaInicio,fechaProgramada:s.fechaProgramada??'',responsable:s.responsable??'',filasEsperadas:s.filasEsperadas,unidadesEsperadas:s.unidadesEsperadas}});
  }else{
   exigir(pf.sedes.includes(s.sede),'SIN_PERMISO','Sede no autorizada.');
   const [[duplicado]]=await c.execute('SELECT i.id FROM ims_op_inventario i JOIN ims_nat_inventario n ON n.inventario_id=i.id WHERE i.sede=? AND UPPER(TRIM(i.codigo_operativo))=UPPER(TRIM(?)) LIMIT 1',[s.sede,s.codigo]);exigir(!duplicado,'CODIGO_EXISTENTE','Ya existe un inventario con ese código.');
   resultado=await ejecutarOperacion({pool,principal:p,conexion:c,tipo:'crear',solicitud:{operacionId:op('stock'),sede:s.sede,codigo:s.codigo,clientes:s.clientes,fechaInicio:s.fechaInicio,fechaProgramada:s.fechaProgramada??'',responsable:s.responsable??''}});
   if(s.fuente==='CSV'){
    exigir(Array.isArray(s.filas)&&s.filas.length>0&&s.filas.length<=100000);const fs=s.filas.map(filaStock);exigir(fs.every((r,i)=>r.numero===i+1&&s.clientes.includes(r.clienteId)),'SOLICITUD_INVALIDA','Revisa la numeración y los clientes del stock.');
    exigir(s.clientes.every(id=>fs.some(f=>f.clienteId===id)),'SOLICITUD_INVALIDA','Falta stock de un cliente seleccionado. Usa CSV complementarios en Stock ITSANET o prepara la carga manual.');
    const id=resultado.inventarioId,rs=fs.map(f=>({id:randomUUID(),f}));
    await insertarFilas(c,'ims_op_linea',['id','inventario_id','cliente_id','sku','observacion'],rs.map(({id:lid,f})=>[lid,id,f.clienteId,f.sku,'']));
    await insertarFilas(c,'ims_op_detalle_linea',['linea_id','posicion','descripcion','serie','lote','unidad'],rs.map(({id,f})=>[id,...['posicion','descripcion','serie','lote','unidad'].map(k=>f[k])]));
    await insertarFilas(c,'ims_nat_linea',['linea_id','inventario_id','numero','depot','justificacion','abc','despacho','partida','categoria','estado_mercancia'],rs.map(({id:lid,f})=>[lid,id,f.numero,f.depot,'',...['abc','despacho','partida','categoria','estadoMercancia'].map(k=>f[k])]));
    const unidades=textoDecimal(fs.reduce((a,f)=>a+decimal(f.depot),0n)),[[check]]=await c.execute('SELECT COUNT(*) n,SUM(depot) total FROM ims_nat_linea WHERE inventario_id=?',[id]);exigir(Number(check.n)===rs.length&&decimal(check.total)===decimal(unidades),'GUARDADO_RECHAZADO','La carga no concilia con el archivo.');
    await c.execute('UPDATE ims_nat_inventario SET borrador=0,version=1 WHERE inventario_id=?',[id]);resultado={...resultado,version:'1',borrador:false,filas:fs.length,unidades};
   }
  }
  if(s.fuente==='API'){
   const id=resultado.inventarioId;
   const [existentes]=await c.execute('SELECT cliente_id FROM ims_op_inventario_cliente WHERE inventario_id=?',[id]);
   for(const cli of s.clientes.filter(cli=>!existentes.some(e=>e.cliente_id===cli))){
    await c.execute('INSERT INTO ims_op_inventario_cliente VALUES (?,?)',[id,cli]);await c.execute('INSERT INTO ims_op_permiso VALUES (?,?,?,1)',[p.actorId,id,cli]);await c.execute("INSERT INTO ims_nat_perfil VALUES (?,?,?,'SUPERVISOR')",[p.actorId,id,cli]);
   }
   const complementarias=s.filasComplementarias??[];exigir(Array.isArray(complementarias)&&complementarias.length<=100000);
   if(complementarias.length){
    const [cubiertos]=await c.execute('SELECT DISTINCT cliente_id FROM ims_op_linea WHERE inventario_id=?',[id]);
    const [[num]]=await c.execute('SELECT COALESCE(MAX(numero),0) n FROM ims_nat_linea WHERE inventario_id=?',[id]);
    const fs=complementarias.map((f,i)=>filaStock({...f,numero:Number(num.n)+i+1}));
    exigir(fs.every(f=>s.clientes.includes(f.clienteId)&&!cubiertos.some(c=>c.cliente_id===f.clienteId)),'SOLICITUD_INVALIDA','El CSV complementario debe corresponder a un cliente seleccionado sin stock API.');
    const rs=fs.map(f=>({id:randomUUID(),f}));
    await insertarFilas(c,'ims_op_linea',['id','inventario_id','cliente_id','sku','observacion'],rs.map(({id:lid,f})=>[lid,id,f.clienteId,f.sku,'']));
    await insertarFilas(c,'ims_op_detalle_linea',['linea_id','posicion','descripcion','serie','lote','unidad'],rs.map(({id,f})=>[id,...['posicion','descripcion','serie','lote','unidad'].map(k=>f[k])]));
    await insertarFilas(c,'ims_nat_linea',['linea_id','inventario_id','numero','depot','justificacion','abc','despacho','partida','categoria','estado_mercancia'],rs.map(({id:lid,f})=>[lid,id,f.numero,f.depot,'',...['abc','despacho','partida','categoria','estadoMercancia'].map(k=>f[k])]));
   }
   const [cubiertos]=await c.execute('SELECT DISTINCT cliente_id FROM ims_op_linea WHERE inventario_id=?',[id]);
   const pendientes=s.clientes.filter(cli=>!cubiertos.some(c=>c.cliente_id===cli)),confirmados=s.clientesPendientes??[];
   exigir(Array.isArray(confirmados)&&confirmados.length===pendientes.length&&new Set(confirmados).size===confirmados.length&&confirmados.every(cli=>pendientes.includes(cli)),'SOLICITUD_INVALIDA','Falta stock de un cliente seleccionado. Adjunta su CSV o confirma que quedará pendiente de carga manual.');
   const [[check]]=await c.execute('SELECT COUNT(*) n,SUM(depot) total FROM ims_nat_linea WHERE inventario_id=?',[id]);
   const borrador=pendientes.length>0;
   await c.execute('UPDATE ims_nat_inventario SET borrador=?,version=1 WHERE inventario_id=?',[borrador?1:0,id]);
   resultado={...resultado,version:'1',borrador,filas:Number(check.n),unidades:textoDecimal(decimal(check.total)??0n),clientesPendientes:pendientes};
  }
  let destino={carpetaId:s.carpetaId};if(s.destinoAutomatico===true){const [[i]]=await c.execute('SELECT sede FROM ims_op_inventario WHERE id=?',[resultado.inventarioId]);const clienteId=uuid(s.clientePrincipalId);const [[permitido]]=await c.execute('SELECT 1 n FROM ims_op_inventario_cliente WHERE inventario_id=? AND cliente_id=?',[resultado.inventarioId,clienteId]);exigir(permitido,'SIN_PERMISO','El cliente principal debe pertenecer al inventario.');destino=await asegurarDestino(c,{sede:i.sede,fechaInicio:s.fechaInicio,clienteId});}
  await mutarCentro({pool,principal:p,conexion:c,claveCentro,tipo:'archivar',solicitud:{operacionId:op('carpeta'),inventarioId:resultado.inventarioId,carpetaId:destino.carpetaId}});
  let eventoId;
  if(s.vinculacion==='NUEVO'){const r=await mutarCentro({pool,principal:p,conexion:c,claveCentro,tipo:'evento',solicitud:{...s.evento,operacionId:op('evento')}});eventoId=r.eventoId;}
  if(s.vinculacion==='EXISTENTE')eventoId=uuid(s.eventoId);
  if(eventoId)await mutarCentro({pool,principal:p,conexion:c,claveCentro,tipo:'vincular',solicitud:{operacionId:op('vinculo'),eventoId,inventarioId:resultado.inventarioId}});
  await accesoWmsNuevo(c,resultado.inventarioId);
  resultado={...resultado,operacionId:s.operacionId,eventoId:eventoId??null,carpetaId:destino.carpetaId,rutaDestino:destino.ruta??null};
  await c.execute('INSERT INTO ims_cm_auditoria(actor_id,operacion_id,tipo,hash,resultado,antes,despues) VALUES (?,?,?,?,?,\'null\',?)',[p.actorId,s.operacionId,'crear-inventario',digest,JSON.stringify(resultado),JSON.stringify({fuente:s.fuente,eventoId:eventoId??null})]);return resultado;
 });
}
