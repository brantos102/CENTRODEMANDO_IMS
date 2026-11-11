import {createServer} from 'node:http';
import {ErrorAuth,tokensIguales} from '../auth/credenciales.mjs';
import {iniciarSesion,autenticar,cerrarSesion} from '../auth/sesiones.mjs';
import {guardarConteo} from '../mysql/conteos.mjs';
import {listarInventarios,listarLineas,consultarResumen} from '../mysql/consultas.mjs';
import {ejecutarOperacion,contextoOperacion,consultarOperacion,previsualizarSerie,historialCapturas} from '../mysql/operacion-nativa.mjs';
import {servirEstatico} from './estaticos.mjs';
import {sedesAutorizadasERP,autorizarSedeERP} from '../mysql/acceso-erp.mjs';
import {crearInventarioERP,consultarOrigenERP} from '../mysql/crear-desde-erp.mjs';

export const COOKIE='__Host-ims_cm_session';
export function origenPublico(value){
  let u;try{u=new URL(value);}catch{throw new Error('Configura IMS_PUBLIC_URL con el origen HTTPS propio.');}
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')
    throw new Error('IMS_PUBLIC_URL requiere un origen HTTPS sin ruta ni credenciales.');
  return u.origin;
}
export function tokenDeCookie(header){
  if(typeof header!=='string')return undefined;
  const values=header.split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));
  if(values.length!==1)return undefined;
  return values[0].slice(COOKIE.length+1);
}
function cookie(token,borrar=false){
  return `${COOKIE}=${borrar?'':token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${borrar?0:28800}`;
}
function json(res,status,body){
  if(res.destroyed||res.writableEnded)return;
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"});
  res.end(JSON.stringify(body));
}
function leerJson(req){
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))
    return Promise.reject(new ErrorAuth('FORMATO_INVALIDO','Envía JSON.',415));
  return new Promise((resolve,reject)=>{
    let n=0,superado=false;const partes=[];
    req.on('data',b=>{
      n+=b.length;if(n>16384){if(!superado){superado=true;partes.length=0;reject(new ErrorAuth('CUERPO_EXCESIVO','Solicitud demasiado grande.',413));}return;}
      if(!superado)partes.push(b);
    });
    req.on('end',()=>{
      if(superado)return;
      try{const value=JSON.parse(Buffer.concat(partes).toString('utf8'));
        if(!value||typeof value!=='object'||Array.isArray(value))throw Error();resolve(value);
      }catch{reject(new ErrorAuth('JSON_INVALIDO','Solicitud JSON inválida.',400));}
    });
    req.on('error',()=>reject(new ErrorAuth('SOLICITUD_INCOMPLETA','Solicitud incompleta.',400)));
    req.on('aborted',()=>reject(new ErrorAuth('SOLICITUD_INCOMPLETA','Solicitud incompleta.',400)));
  });
}
function opciones(url,extras=[]){
  const permitidos=['cursor','limite',...extras];
  if([...url.searchParams.keys()].some(k=>!permitidos.includes(k))||
    permitidos.some(k=>url.searchParams.getAll(k).length>1))
    throw new ErrorAuth('SOLICITUD_INVALIDA','Parámetros inválidos.',400);
  return {cursor:url.searchParams.get('cursor')||'',limite:url.searchParams.get('limite')??'50',
    ...Object.fromEntries(extras.map(k=>[k,url.searchParams.get(k)||'']))};
}
const STATUS={NO_AUTENTICADO:401,SIN_PERMISO:403,BASE_NO_PERMITIDA:503,SOLICITUD_INVALIDA:400,CANTIDAD_INVALIDA:400,
  VERSION_DESACTUALIZADA:409,ETAPA_COMPLETA:409,ETAPA_INVALIDA:409,OPERACION_REUTILIZADA:409,
  INVENTARIO_NO_EDITABLE:409,CONFIRMACION_REQUERIDA:409,SERIE_DUPLICADA:409,SERIE_SIMILAR:409,CONFIRMACION_PENDIENTE:503,GUARDADO_RECHAZADO:503,
  ERP_CONSULTA_UTILIZADA:409,ERP_CLIENTE_PENDIENTE:409,CODIGO_EXISTENTE:409};

/** No instala esquema ni crea usuarios. Todas las rutas de datos exigen sesión. */
export function crearApi({pool,publicUrl,soloLectura=false,operacionNativa=false,revision,gestorERP=null,erpCreacion=false}){
  const origin=origenPublico(publicUrl);
  if(operacionNativa&&soloLectura)throw Error('Operación nativa incompatible con solo lectura.');
  if(gestorERP&&!operacionNativa)throw Error('ERP requiere operación nativa.');
  if(erpCreacion&&!gestorERP)throw Error('Creación ERP requiere consulta habilitada.');
  if(revision!==undefined&&!/^[a-f0-9]{40}$/.test(revision))throw Error('Revisión inválida.');
  let loginsEnCurso=0;
  let minuto=0,intentosMinuto=0;
  const servidor=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,origin);
      if(req.headers.origin&&req.headers.origin!==origin)throw new ErrorAuth('ORIGEN_INVALIDO','Origen no permitido.',403);
      if(req.method==='POST'&&req.headers.origin!==origin)throw new ErrorAuth('ORIGEN_INVALIDO','Origen no permitido.',403);
      if(await servirEstatico(req,res,url))return;
      if(req.method==='GET'&&url.pathname==='/salud')return json(res,200,{ok:true,servicio:'centro-mando-ims-candidata',...(revision?{revision}:{})});
      if(req.method==='POST'&&url.pathname==='/api/sesion'){
        const ahora=Math.floor(Date.now()/60000);
        if(ahora!==minuto){minuto=ahora;intentosMinuto=0;}
        if(++intentosMinuto>120)throw new ErrorAuth('INTENTOS_AGOTADOS','Intenta de nuevo en un minuto.',429);
        if(loginsEnCurso>=4)throw new ErrorAuth('OCUPADO','Intenta de nuevo en unos segundos.',503);
        loginsEnCurso++;
        try{
          const body=await leerJson(req);
          if(Object.keys(body).some(k=>!['correo','contrasena'].includes(k)))throw new ErrorAuth('SOLICITUD_INVALIDA','Campos no permitidos.',400);
          const sesion=await iniciarSesion(pool,body);
          res.setHeader('Set-Cookie',cookie(sesion.token));
          return json(res,200,{usuario:sesion.usuario,csrf:sesion.csrf,soloLectura,operacionNativa,erpDisponible:!!gestorERP,erpCreacionDisponible:erpCreacion});
        }finally{loginsEnCurso--;}
      }
      if(!url.pathname.startsWith('/api/'))return json(res,404,{error:'RUTA_NO_DISPONIBLE'});
      const principal=await autenticar(pool,tokenDeCookie(req.headers.cookie));
      if(req.method==='GET'&&url.pathname==='/api/sesion')return json(res,200,{usuario:principal.usuario,csrf:principal.csrf,soloLectura,operacionNativa,erpDisponible:!!gestorERP,erpCreacionDisponible:erpCreacion});
      if(req.method==='POST'){
        if(!tokensIguales(req.headers['x-ims-csrf'],principal.csrf))throw new ErrorAuth('CSRF_INVALIDO','Vuelve a consultar la sesión.',403);
        if(url.pathname==='/api/sesion/cerrar'){
          await cerrarSesion(pool,principal);res.setHeader('Set-Cookie',cookie('',true));return json(res,200,{ok:true});
        }
        if(url.pathname==='/api/conteos'){
          if(soloLectura)throw new ErrorAuth('SOLO_LECTURA','Este piloto permite únicamente consultar inventarios.',403);
          return json(res,200,await guardarConteo({pool,principal,solicitud:await leerJson(req),soloNativos:operacionNativa}));
        }
      }
      if(url.pathname.startsWith('/api/erp/')){
        if(!gestorERP)throw new ErrorAuth('ERP_NO_CONFIGURADO','La consulta ERP todavía no está habilitada.',403);
        if(req.method==='POST'&&url.pathname==='/api/erp/inventarios'){
          if(!erpCreacion)throw new ErrorAuth('ERP_NO_CONFIGURADO','La creación ERP todavía no está habilitada.',403);
          if(url.search)throw new ErrorAuth('SOLICITUD_INVALIDA','Parámetros inválidos.',400);
          return json(res,200,await crearInventarioERP({pool,principal,solicitud:await leerJson(req),obtenerVista:(actor,id)=>gestorERP.paraCrear(actor,id)}));
        }
        const origenERP=/^\/api\/erp\/inventarios\/([a-f0-9-]+)\/origen$/.exec(url.pathname);
        if(req.method==='GET'&&origenERP){
          if(!erpCreacion)throw new ErrorAuth('ERP_NO_CONFIGURADO','La procedencia ERP todavía no está habilitada.',403);
          if([...url.searchParams.keys()].some(k=>k!=='lineas')||url.searchParams.getAll('lineas').length!==1)throw new ErrorAuth('SOLICITUD_INVALIDA','Parámetros inválidos.',400);
          return json(res,200,await consultarOrigenERP(pool,principal,origenERP[1],url.searchParams.get('lineas').split(',')));
        }
        if(req.method==='GET'&&url.pathname==='/api/erp/conexiones'){
          if(url.search)throw new ErrorAuth('SOLICITUD_INVALIDA','Parámetros inválidos.',400);
          const sedes=await sedesAutorizadasERP(pool,principal);
          if(!sedes.length)throw new ErrorAuth('SIN_PERMISO','No tienes autorización para consultar stock ERP.',403);
          return json(res,200,{sedes,conexiones:gestorERP.listar(sedes),soloPrevisualizacion:true});
        }
        if(req.method==='POST'&&url.pathname==='/api/erp/consultas'){
          if(url.search)throw new ErrorAuth('SOLICITUD_INVALIDA','Parámetros inválidos.',400);
          const body=await leerJson(req);await autorizarSedeERP(pool,principal,body.sede);
          return json(res,202,gestorERP.iniciar(principal.actorId,body,sede=>autorizarSedeERP(pool,principal,sede)));
        }
        const erp=/^\/api\/erp\/consultas\/([a-f0-9-]+)$/.exec(url.pathname);
        if(req.method==='GET'&&erp){
          if([...url.searchParams.keys()].some(k=>k!=='desde')||url.searchParams.getAll('desde').length>1||!/^\d{1,6}$/.test(url.searchParams.get('desde')||'0'))throw new ErrorAuth('SOLICITUD_INVALIDA','Parámetros inválidos.',400);
          const sede=gestorERP.sede(principal.actorId,erp[1]);await autorizarSedeERP(pool,principal,sede);
          return json(res,200,gestorERP.consultar(principal.actorId,erp[1],Number(url.searchParams.get('desde')||0)));
        }
        return json(res,404,{error:'RUTA_NO_DISPONIBLE'});
      }
      if(url.pathname.startsWith('/api/operacion')){
        if(!operacionNativa)throw new ErrorAuth('SOLO_LECTURA','La operación nativa todavía no está habilitada.',403);
        if(req.method==='GET'&&url.pathname==='/api/operacion'){
          if(url.search)throw new ErrorAuth('SOLICITUD_INVALIDA','Parámetros inválidos.',400);
          return json(res,200,await contextoOperacion(pool,principal));
        }
        const op=/^\/api\/operacion\/(crear|lineas|activar|asignar|estado|depot|ajustar|usuario|serie|hallazgo)$/.exec(url.pathname);
        if(req.method==='POST'&&op){
          if(!tokensIguales(req.headers['x-ims-csrf'],principal.csrf))throw new ErrorAuth('CSRF_INVALIDO','Consulta tu sesión.',403);
          if(url.search)throw new ErrorAuth('SOLICITUD_INVALIDA','Parámetros inválidos.',400);
          return json(res,200,await ejecutarOperacion({pool,principal,tipo:op[1],solicitud:await leerJson(req)}));
        }
        if(req.method==='POST'&&url.pathname==='/api/operacion/serie/consultar'){
          const body=await leerJson(req);
          if(Object.keys(body).some(k=>!['inventarioId','clienteId','serie'].includes(k)))throw new ErrorAuth('SOLICITUD_INVALIDA','Campos no permitidos.',400);
          return json(res,200,await previsualizarSerie(pool,principal,body.inventarioId,{clienteId:body.clienteId,serie:body.serie}));
        }
        const historial=/^\/api\/operacion\/inventarios\/([a-f0-9-]+)\/(series|hallazgos)$/.exec(url.pathname);
        if(req.method==='GET'&&historial){
          if([...url.searchParams.keys()].some(k=>!['clienteId','cursor'].includes(k))||['clienteId','cursor'].some(k=>url.searchParams.getAll(k).length>1))throw new ErrorAuth('SOLICITUD_INVALIDA','Parámetros inválidos.',400);
          return json(res,200,await historialCapturas(pool,principal,historial[1],{tipo:historial[2],clienteId:url.searchParams.get('clienteId'),cursor:url.searchParams.get('cursor')||''}));
        }
        const inv=/^\/api\/operacion\/inventarios\/([a-f0-9-]+)(\/analisis)?$/.exec(url.pathname);
        if(req.method==='GET'&&inv){
          if([...url.searchParams.keys()].some(k=>k!=='cursor')||url.searchParams.getAll('cursor').length>1)throw new ErrorAuth('SOLICITUD_INVALIDA','Parámetros inválidos.',400);
          return json(res,200,await consultarOperacion(pool,principal,inv[1],{analisis:!!inv[2],cursor:url.searchParams.get('cursor')||''}));
        }
      }
      if(req.method==='GET'&&url.pathname==='/api/resumen'){
        if(url.search)throw new ErrorAuth('SOLICITUD_INVALIDA','Parámetros inválidos.',400);
        return json(res,200,await consultarResumen(pool,principal));
      }
      if(req.method==='GET'&&url.pathname==='/api/inventarios')return json(res,200,await listarInventarios(pool,principal,opciones(url,['buscar','sede','cliente'])));
      const m=/^\/api\/inventarios\/([a-f0-9-]+)\/lineas$/.exec(url.pathname);
      if(req.method==='GET'&&m)return json(res,200,await listarLineas(pool,principal,m[1],opciones(url,['buscar']),{operacionNativa}));
      return json(res,404,{error:'RUTA_NO_DISPONIBLE'});
    }catch(e){
      if(e.status===413)res.setHeader('Connection','close');
      if(e instanceof ErrorAuth)return json(res,e.status,{error:e.codigo,mensaje:e.message});
      if(e.name==='ErrorConteo'&&Object.hasOwn(STATUS,e.codigo))return json(res,STATUS[e.codigo],{error:e.codigo,mensaje:e.message});
      // No devolver mensajes SQL, contraseñas, cookies, hashes ni causas internas.
      return json(res,503,{error:'SERVICIO_NO_DISPONIBLE',mensaje:'No se pudo completar la solicitud.'});
    }
  });
  servidor.requestTimeout=10000;servidor.headersTimeout=5000;servidor.keepAliveTimeout=5000;
  servidor.maxHeadersCount=50;
  return servidor;
}
