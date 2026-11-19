import {transaccionOperativa} from '../mysql/operacion-nativa.mjs';
import {perfilCentro} from './servicio.mjs';
import {filasInventario,tablaInventario,csv} from './reportes.mjs';
import {exigir,uuid,diaEcuador} from './dominio.mjs';
import {INV} from '../migracion/modelo.mjs';
export async function datosReporteCliente(pool,p,clienteId,{anio=diaEcuador().slice(0,4),sede=''}={}){uuid(clienteId);exigir(/^20\d\d$/.test(String(anio)),'SOLICITUD_INVALIDA','Revisa el año del reporte.');return transaccionOperativa(pool,p,async c=>{
 const pf=await perfilCentro(c,p);exigir(pf.permisos.exportar&&(!sede||pf.sedes.includes(sede)),'SIN_PERMISO','El reporte requiere coordinación de la sede.');const [[cli]]=await c.execute('SELECT id,nombre FROM ims_op_cliente WHERE id=?',[clienteId]);exigir(cli,'SIN_PERMISO','Cliente no disponible.');const sedes=sede?[sede]:pf.sedes;if(!sedes.length)return {cliente:cli,anio:String(anio),cabecera:INV,filas:[],inventarios:[]};
 const [invs]=await c.execute(`SELECT DISTINCT i.id FROM ims_op_inventario i JOIN ims_op_linea l ON l.inventario_id=i.id JOIN ims_op_permiso pe ON pe.inventario_id=i.id AND pe.cliente_id=l.cliente_id AND pe.actor_id=? LEFT JOIN ims_nat_inventario n ON n.inventario_id=i.id WHERE l.cliente_id=? AND i.sede IN (${sedes.map(()=>'?').join(',')}) AND i.estado='ENTREGADO' AND COALESCE(n.borrador,0)=0 ORDER BY i.id`,[p.actorId,cli.id,...sedes]);const filas=[],inventarios=[];
 for(const i of invs){const {inventario:n,filas:fs}=await filasInventario(c,p,i.id,{administrativo:true}),propias=fs.filter(f=>f.cliente_id===cli.id&&String(f.legado_inicio||n.fecha_inicio||'').slice(0,4)===String(anio));if(!propias.length)continue;filas.push(...tablaInventario(n,propias).slice(1));inventarios.push({id:n.id,codigo:n.codigo_operativo,estado:n.estado,filas:propias.length});exigir(filas.length<=200000,'SOLICITUD_INVALIDA','Divide el reporte por año o sede.');}
 return {cliente:cli,anio:String(anio),cabecera:INV,filas,inventarios,actualizadoEn:new Date().toISOString()};
 });}
export async function reporteClienteCSV(pool,p,id,q){const r=await datosReporteCliente(pool,p,id,q);return {nombre:'ITSANET_'+r.cliente.nombre.replace(/[^A-Za-z0-9_-]/g,'_')+'_'+r.anio+'.csv',contenido:csv([r.cabecera,...r.filas])};}
