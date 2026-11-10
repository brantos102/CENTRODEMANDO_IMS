import {createHash} from 'node:crypto';
const exigir=v=>{if(!v)throw Error('Perfil ERP privado incompatible. No se habilitó la consulta.');};
const texto=(v,max)=>typeof v==='string'&&v.trim()&&[...v].length<=max&&!/[\x00-\x1f\x7f]/.test(v);
/** Devuelve secretos solo al código del servidor. No serializar este resultado. */
export function validarRegistroRuntimeERP(data){
 exigir(data?.formato==='ims-erp-runtime-v1'&&data.modo==='solo_previsualizacion'&&Array.isArray(data.conexiones)&&data.conexiones.length>0&&data.conexiones.length<=64);
 exigir(Object.keys(data).every(k=>['formato','modo','conexiones'].includes(k)));
 const refs=new Set(),cuentas=new Set();
 const conexiones=data.conexiones.map(c=>{
  exigir(c&&Object.keys(c).every(k=>['referencia','sede','etiqueta','userid','password','clienteId','clienteNombre','codigosCliente'].includes(k)));
  exigir(['UIO','GYE'].includes(c.sede)&&texto(c.etiqueta,255)&&c.etiqueta===c.etiqueta.trim().toUpperCase()&&/^[a-f0-9]{24}$/.test(c.referencia)&&!refs.has(c.referencia));
  exigir(createHash('sha256').update(JSON.stringify([c.sede,c.etiqueta])).digest('hex').slice(0,24)===c.referencia);refs.add(c.referencia);
  exigir(texto(c.userid,8192)&&texto(c.password,8192)&&texto(c.clienteNombre,255));
  exigir(c.clienteId===null||typeof c.clienteId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(c.clienteId));
  exigir(Array.isArray(c.codigosCliente)&&c.codigosCliente.length>0&&c.codigosCliente.length<=1000);
  const codigosCliente=c.codigosCliente.map(codigo=>{exigir(texto(codigo,255)&&codigo===codigo.trim().toUpperCase());const k=JSON.stringify([c.sede,codigo]);exigir(!cuentas.has(k));cuentas.add(k);return codigo;});
  return Object.freeze({...c,codigosCliente:Object.freeze(codigosCliente)});
 });
 return Object.freeze(conexiones);
}
export function registroERPDesdeEntorno(env){
 try{
  const b=env.IMS_ERP_REGISTRO_BASE64;exigir(typeof b==='string'&&b.length<=131072&&/^[A-Za-z0-9+/]+={0,2}$/.test(b));
  const raw=Buffer.from(b,'base64');exigir(raw.length<=65536&&raw.toString('base64')===b);
  return validarRegistroRuntimeERP(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)));
 }catch{throw Error('Perfil ERP privado incompatible. No se habilitó la consulta.');}
}
export function metadatosConexionesERP(conexiones){
 return conexiones.map(c=>({referencia:c.referencia,sede:c.sede,etiqueta:c.etiqueta,clienteId:c.clienteId,clienteNombre:c.clienteNombre,codigosCliente:[...c.codigosCliente]}));
}
