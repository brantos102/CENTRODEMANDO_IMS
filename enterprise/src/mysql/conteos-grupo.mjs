import {normalizarSolicitud,ErrorConteo} from '../dominio/conteo.mjs';
import {distribuirConteo} from '../dominio/grupos-conteo.mjs';
import {gruposAutorizados} from './consultas.mjs';
import {guardarConteo} from './conteos.mjs';
import {transaccionOperativa} from './operacion-nativa.mjs';
import {uuidEstable} from '../migracion/modelo.mjs';
import {createHash} from 'node:crypto';
const exigir=(v,c,m)=>{if(!v)throw new ErrorConteo(c,m);};
export async function guardarConteoGrupo({pool,principal:p,solicitud:s}){
 exigir(typeof s?.firmaGrupo==='string'&&/^[a-f0-9]{64}$/.test(s.firmaGrupo),'SOLICITUD_INVALIDA','Actualiza el grupo antes de contar.');
 const {firmaGrupo,...simple}=s,{payload:n,hash}=normalizarSolicitud(p?.actorId,simple),digest=createHash('sha256').update(hash+firmaGrupo).digest('hex');
 return transaccionOperativa(pool,p,async c=>{
  const [[i]]=await c.execute('SELECT sede,estado FROM ims_op_inventario WHERE id=? FOR UPDATE',[n.inventarioId]);
  exigir(i&&(!p.sedes||p.sedes.includes(i.sede)),'SIN_PERMISO','Inventario no autorizado.');
  const g=(await gruposAutorizados(c,p,n.inventarioId)).find(g=>g.vista.id===n.lineaId);
  exigir(g&&g.vista.puede_contar,'SIN_PERMISO','Grupo no autorizado para captura.');
  const [[prev]]=await c.execute('SELECT payload_sha256,resultado,tipo FROM ims_nat_evento WHERE actor_id=? AND operacion_id=?',[p.actorId,n.operacionId]);
  if(prev){exigir(prev.tipo==='conteo_grupo'&&prev.payload_sha256===digest,'OPERACION_REUTILIZADA','La operación pertenece a otra captura.');return {...JSON.parse(prev.resultado),repetida:true};}
  const [[otra]]=await c.execute('SELECT 1 n FROM ims_op_operacion WHERE actor_id=? AND operacion_id=?',[p.actorId,n.operacionId]);exigir(!otra,'OPERACION_REUTILIZADA','La operación pertenece a otra captura.');
  exigir(i.estado==='EN_PROCESO','INVENTARIO_NO_EDITABLE','El inventario no está abierto para conteo.');
  exigir(g.vista.version===n.versionEsperada&&g.vista.firmaGrupo===firmaGrupo,'VERSION_DESACTUALIZADA','El grupo cambió. Conserva el borrador y revisa sus capturas.');
  exigir(g.miembros.length<=1000,'SOLICITUD_INVALIDA','El grupo excede mil filas de origen; solicita revisión al administrador.');
  const asignaciones=distribuirConteo(g.miembros,n.etapa,n.cantidad),guardadas=[];
  for(const {linea,cantidad} of asignaciones){
   const r=await guardarConteo({pool,conexion:c,principal:p,soloNativos:true,solicitud:{...simple,operacionId:uuidEstable('captura-grupo',[n.operacionId,linea.id]),lineaId:linea.id,versionEsperada:String(linea.version),cantidad}});guardadas.push({lineaId:linea.id,cantidad,version:r.version});
  }
  const resultado={ok:true,operacionId:n.operacionId,inventarioId:n.inventarioId,lineaId:n.lineaId,clienteId:g.vista.cliente_id,sku:g.vista.sku,etapa:n.etapa,cantidad:n.cantidad,version:(BigInt(n.versionEsperada)+BigInt(guardadas.length)).toString(),filasOrigen:g.miembros.length,filasRegistradas:guardadas.length};
  await c.execute('INSERT INTO ims_nat_evento(actor_id,operacion_id,tipo,inventario_id,payload_sha256,resultado,antes,despues) VALUES (?,?,?,?,?,?,?,?)',[p.actorId,n.operacionId,'conteo_grupo',n.inventarioId,digest,JSON.stringify(resultado),JSON.stringify({firmaGrupo,version:n.versionEsperada}),JSON.stringify({etapa:n.etapa,total:n.cantidad,asignaciones:guardadas})]);
  return {...resultado,repetida:false};
 });
}
