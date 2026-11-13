import {createHash} from 'node:crypto';
import {ErrorConteo} from '../dominio/conteo.mjs';
export function exigir(v,c='SOLICITUD_INVALIDA',m='Revisa los datos enviados.'){if(!v)throw new ErrorConteo(c,m);}
export const hash=x=>createHash('sha256').update(JSON.stringify(ordenar(x))).digest('hex');
function ordenar(x){return Array.isArray(x)?x.map(ordenar):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordenar(x[k])])):x;}
export const normal=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
export const RANGO={ADMIN:4,COORDINADOR:3,LIDER:2,OPERARIO:1,AUDITOR:1};
export function permisos(rol){return {administrar:rol==='ADMIN',crear:['ADMIN','COORDINADOR','LIDER'].includes(rol),exportar:['ADMIN','COORDINADOR'].includes(rol),usuarios:['ADMIN','COORDINADOR','LIDER'].includes(rol),analitica:['ADMIN','COORDINADOR','LIDER'].includes(rol),recordatorios:['ADMIN','COORDINADOR'].includes(rol)};}
export function puedeCrearRol(rol,nuevo){return !!RANGO[nuevo]&&(rol==='ADMIN'||RANGO[rol]>RANGO[nuevo]);}
export function texto(x,max=255,requerido=false){exigir(typeof x==='string'&&[...x].length<=max&&(!requerido||!!x.trim()));return x.trim();}
export function uuid(x){exigir(typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(x));return x;}
export function fecha(x){exigir(typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&x>='1900-01-01'&&x<='2199-12-31'&&!isNaN(Date.parse(x+'T12:00:00Z'))&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x);return x;}
export const diaEcuador=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guayaquil',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export const sumarDias=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export function finalEvento(e){const fin=sumarDias(e.fecha_inicio,Math.max(1,Number(e.duracion)||1)-1);return e.fecha_fin&&e.fecha_fin>fin?e.fecha_fin:fin;}
export function evento(s){
 const r={sede:s.sede,cliente:texto(s.cliente,255,true),titulo:texto(s.titulo,500,true),categoria:texto(s.categoria??'Inventario Cíclico'),frecuencia:texto(s.frecuencia??'MENSUAL',100),prioridad:texto(s.prioridad??'Media',30),observacion:texto(s.observacion??'',8000),fecha_inicio:fecha(s.fechaInicio),fecha_fin:s.fechaFin?fecha(s.fechaFin):null,duracion:Number(s.duracion??1),responsable_id:s.responsableId?uuid(s.responsableId):null,responsable_nombre:texto(s.responsableNombre??'')};
 exigir(['UIO','GYE'].includes(r.sede)&&Number.isInteger(r.duracion)&&r.duracion>=1&&r.duracion<=3660&&['Baja','Media','Alta','Urgente'].includes(r.prioridad));exigir(!r.fecha_fin||r.fecha_fin>=r.fecha_inicio);return r;
}
export function transicion(e,accion,p,actorId){
 const propio=e.responsable_id===actorId,perm=permisos(p.rol);
 exigir(p.sedes.includes(e.sede),'SIN_PERMISO','Sede no autorizada.');
 if(accion==='eliminar'){exigir(p.rol==='ADMIN'||propio||(!e.responsable_id&&perm.crear),'SIN_PERMISO','Solo el responsable o administrador puede eliminar este evento.');return {eliminado:1};}
 if(accion==='apoyar'){exigir(e.estado!=='Entregado','INVENTARIO_NO_EDITABLE','El evento ya se entregó.');return {};}
 exigir(p.rol==='ADMIN'||propio||(!e.responsable_id&&perm.crear),'SIN_PERMISO','Esta acción corresponde al responsable de la tarea.');
 exigir(e.estado!=='Entregado','INVENTARIO_NO_EDITABLE','El evento ya se entregó.');
 if(accion==='iniciar'||accion==='reanudar')return {estado:'En curso',responsable_id:e.responsable_id||actorId};
 if(accion==='pausar'){exigir(e.estado==='En curso','INVENTARIO_NO_EDITABLE','Solo puedes pausar una tarea en curso.');return {estado:'Pausado'};}
 if(accion==='finalizar')return {estado:'Entregado',avance:'100'};
 exigir(false);
}
export const MESES=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
export function codigosDesdeFilas(filas,mesExplicito){
 exigir(Array.isArray(filas)&&filas.length>0&&filas.length<=1000);
 const h=filas[0].map(normal),mapMes=h.map(v=>MESES.indexOf(v)+1),tiene=mapMes.some(x=>x>0),out=[];
 const skuIndex=Math.max(0,h.findIndex(x=>['PRODUCTO','SKU','CODIGO','CODIGOPRODUCTO','PRODUCTOID'].includes(x.replace(/[^A-Z0-9]/g,'')))),abcIndex=h.indexOf('ABC');
 exigir(tiene||(Number.isInteger(mesExplicito)&&mesExplicito>=1&&mesExplicito<=12),'SOLICITUD_INVALIDA','Selecciona el mes cuando la tabla no tiene encabezados de meses.');
 for(const row of filas.slice(tiene||h.some(x=>['PRODUCTO','SKU','CODIGO'].includes(x))?1:0)){
  const sku=texto(String(row[skuIndex]??''),255);if(!sku)continue;
  const meses=tiene?mapMes.filter((mes,i)=>mes>0&&!['','0','NO','FALSE','FALSE()','-'].includes(normal(row[i]))):[mesExplicito];
  out.push({sku,abc:abcIndex>=0?texto(String(row[abcIndex]??''),50):'',meses:[...new Set(meses)].sort((a,b)=>a-b)});
 }
 exigir(new Set(out.map(x=>x.sku)).size===out.length,'SOLICITUD_INVALIDA','La tabla repite códigos; revisa las filas antes de cargar.');out.mesesAfectados=tiene?mapMes.filter(x=>x>0):[mesExplicito];return out;
}
export function calendario(eventos,desde,hasta){fecha(desde);fecha(hasta);exigir(hasta>=desde&&hasta<=sumarDias(desde,366));return eventos.filter(e=>!e.eliminado&&e.fecha_inicio<=hasta&&finalEvento(e)>=desde).map(e=>({...e,fecha_final_calendario:finalEvento(e)}));}
export function indicadores(eventos,panel,hoy=diaEcuador()){
 const anio=hoy.slice(0,4),mes=hoy.slice(0,7),abiertos=eventos.filter(e=>!e.eliminado&&e.estado!=='Entregado');
 const delAnio=panel.filter(p=>p.fecha_inicio?.slice(0,4)===anio),delMes=delAnio.filter(p=>p.fecha_inicio?.slice(0,7)===mes),entregados=delAnio.filter(p=>normal(p.estado)==='ENTREGADO');
 const decimal=x=>{const m=/^(-?)(\d+)(?:\.(\d{1,9}))?$/.exec(String(x??'0'));exigir(m,'GUARDADO_RECHAZADO','Un indicador guardado tiene un formato incompatible.');return BigInt((m[1]||'')+m[2]+(m[3]||'').padEnd(9,'0'));};
 const total=delAnio.reduce((a,p)=>a+decimal(p.unidades),0n),abs=total<0n?-total:total;
 const unidades=(total<0n?'-':'')+String(abs/1000000000n)+'.'+String(abs%1000000000n).padStart(9,'0');
 const tendencia=Array.from({length:12},(_,i)=>({mes:i+1,entregados:panel.filter(p=>normal(p.estado)==='ENTREGADO'&&p.fecha_fin?.slice(0,7)===anio+'-'+String(i+1).padStart(2,'0')).length}));
 return {vencidos:abiertos.filter(e=>e.fecha_inicio<hoy).length,hoy:abiertos.filter(e=>e.fecha_inicio===hoy).length,proximos:abiertos.filter(e=>e.fecha_inicio>hoy&&e.fecha_inicio<=sumarDias(hoy,7)).length,entregados:entregados.length,clientesActivos:new Set(delMes.map(p=>p.cliente)).size,unidades,referencias:delAnio.reduce((a,p)=>a+Number(p.referencias||0),0),posiciones:delAnio.reduce((a,p)=>a+Number(p.posiciones||0),0),avanceMes:delMes.length?delMes.filter(p=>normal(p.estado)==='ENTREGADO').length*100/delMes.length:0,cumplimientoAnio:delAnio.length?entregados.length*100/delAnio.length:0,tendencia};
}
