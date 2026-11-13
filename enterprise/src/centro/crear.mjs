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
export async function crearDesdeCentro({pool,principal:p,solicitud:s,obtenerVista}){
 uuid(s.operacionId);const digest=hash(s);
 return transaccionOperativa(pool,p,async c=>{
  const pf=await perfilCentro(c,p,true);exigir(pf.permisos.crear,'SIN_PERMISO','Tu rol no crea inventarios.');
  const [[prev]]=await c.execute('SELECT hash,resultado FROM ims_cm_auditoria WHERE actor_id=? AND operacion_id=?',[p.actorId,s.operacionId]);if(prev){exigir(prev.hash===digest,'OPERACION_REUTILIZADA','La operación ya corresponde a otra creación.');return {...JSON.parse(prev.resultado),repetida:true};}
  exigir(['API','CSV','BLANCO'].includes(s.fuente)&&['NUEVO','EXISTENTE','NINGUNO'].includes(s.vinculacion));
  const op=tipo=>uuidEstable('cm-creacion',[s.operacionId,tipo]);
  let resultado;
  if(s.fuente==='API'){
   exigir(typeof obtenerVista==='function','SOLICITUD_INVALIDA','Consulta primero la API.');const v=obtenerVista(p.actorId,s.consultaId);exigir(pf.sedes.includes(v.sede),'SIN_PERMISO','Sede no autorizada.');
   resultado=await crearInventarioERP({pool,principal:p,conexion:c,obtenerVista,solicitud:{operacionId:op('stock'),consultaId:s.consultaId,codigo:s.codigo,fechaInicio:s.fechaInicio,fechaProgramada:s.fechaProgramada??'',responsable:s.responsable??'',filasEsperadas:s.filasEsperadas,unidadesEsperadas:s.unidadesEsperadas}});
  }else{
   exigir(pf.sedes.includes(s.sede),'SIN_PERMISO','Sede no autorizada.');
   const [[duplicado]]=await c.execute('SELECT i.id FROM ims_op_inventario i JOIN ims_nat_inventario n ON n.inventario_id=i.id WHERE i.sede=? AND UPPER(TRIM(i.codigo_operativo))=UPPER(TRIM(?)) LIMIT 1',[s.sede,s.codigo]);exigir(!duplicado,'CODIGO_EXISTENTE','Ya existe un inventario con ese código.');
   resultado=await ejecutarOperacion({pool,principal:p,conexion:c,tipo:'crear',solicitud:{operacionId:op('stock'),sede:s.sede,codigo:s.codigo,clientes:s.clientes,fechaInicio:s.fechaInicio,fechaProgramada:s.fechaProgramada??'',responsable:s.responsable??''}});
   if(s.fuente==='CSV'){
    exigir(Array.isArray(s.filas)&&s.filas.length>0&&s.filas.length<=100000);const fs=s.filas.map(filaStock);exigir(fs.every((r,i)=>r.numero===i+1&&s.clientes.includes(r.clienteId)),'SOLICITUD_INVALIDA','Revisa la numeración y los clientes del stock.');
    const id=resultado.inventarioId,rs=fs.map(f=>({id:randomUUID(),f}));
    await insertarFilas(c,'ims_op_linea',['id','inventario_id','cliente_id','sku','observacion'],rs.map(({id:lid,f})=>[lid,id,f.clienteId,f.sku,'']));
    await insertarFilas(c,'ims_op_detalle_linea',['linea_id','posicion','descripcion','serie','lote','unidad'],rs.map(({id,f})=>[id,...['posicion','descripcion','serie','lote','unidad'].map(k=>f[k])]));
    await insertarFilas(c,'ims_nat_linea',['linea_id','inventario_id','numero','depot','justificacion','abc','despacho','partida','categoria','estado_mercancia'],rs.map(({id:lid,f})=>[lid,id,f.numero,f.depot,'',...['abc','despacho','partida','categoria','estadoMercancia'].map(k=>f[k])]));
    const unidades=textoDecimal(fs.reduce((a,f)=>a+decimal(f.depot),0n)),[[check]]=await c.execute('SELECT COUNT(*) n,SUM(depot) total FROM ims_nat_linea WHERE inventario_id=?',[id]);exigir(Number(check.n)===rs.length&&decimal(check.total)===decimal(unidades),'GUARDADO_RECHAZADO','La carga no concilia con el archivo.');
    await c.execute('UPDATE ims_nat_inventario SET borrador=0,version=1 WHERE inventario_id=?',[id]);resultado={...resultado,version:'1',borrador:false,filas:fs.length,unidades};
   }
  }
  await mutarCentro({pool,principal:p,conexion:c,tipo:'archivar',solicitud:{operacionId:op('carpeta'),inventarioId:resultado.inventarioId,carpetaId:s.carpetaId}});
  let eventoId;
  if(s.vinculacion==='NUEVO'){const r=await mutarCentro({pool,principal:p,conexion:c,tipo:'evento',solicitud:{...s.evento,operacionId:op('evento')}});eventoId=r.eventoId;}
  if(s.vinculacion==='EXISTENTE')eventoId=uuid(s.eventoId);
  if(eventoId)await mutarCentro({pool,principal:p,conexion:c,tipo:'vincular',solicitud:{operacionId:op('vinculo'),eventoId,inventarioId:resultado.inventarioId}});
  await accesoWmsNuevo(c,resultado.inventarioId);
  resultado={...resultado,operacionId:s.operacionId,eventoId:eventoId??null,carpetaId:s.carpetaId};
  await c.execute('INSERT INTO ims_cm_auditoria(actor_id,operacion_id,tipo,hash,resultado,antes,despues) VALUES (?,?,?,?,?,\'null\',?)',[p.actorId,s.operacionId,'crear-inventario',digest,JSON.stringify(resultado),JSON.stringify({fuente:s.fuente,eventoId:eventoId??null})]);return resultado;
 });
}
