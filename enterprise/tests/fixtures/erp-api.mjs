import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {crearHashPassword} from '../../src/auth/credenciales.mjs';
import {crearApi} from '../../src/http/api.mjs';
import {crearGestorVistasERP} from '../../src/conexiones/vistas-erp.mjs';
export const ERP_ORIGIN='https://ims-erp.invalid',ERP_PASSWORD='Clave_sintetica_ERP_2026!';
export async function esquemaERP(pool){
 for(const n of ['002_conteo_operativo.sql','003_autenticacion.sql','004_detalle_linea.sql','007_operacion_nativa.sql','009_series_hallazgos.sql'])for(const sql of (await readFile(new URL('../../sql/'+n,import.meta.url),'utf8')).replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await pool.query(sql);
}
export async function fixtureERP(pool,t,{sedes=['UIO','GYE'],fallar=false,apiPool=pool}={}){
 const actor=randomUUID(),correo=actor+'@sintetico.invalid';
 await pool.execute('INSERT INTO ims_op_actor VALUES (?,1)',[actor]);
 await pool.execute('INSERT INTO ims_auth_usuario(actor_id,correo,nombre,password_hash) VALUES (?,?,?,?)',[actor,correo,'Revisor ERP',await crearHashPassword(ERP_PASSWORD)]);
 for(const sede of sedes)await pool.execute("INSERT INTO ims_nat_ambito VALUES (?,?,'ADMIN')",[actor,sede]);
 const conexiones=[['UIO','BELIA','BELIA','BELIA'],['GYE','ALU','ALU','ALU'],['GYE','NOKIACNTLTE','NOKIACNT','NOKIA']].map(([sede,etiqueta,codigo,clienteNombre])=>({sede,etiqueta,clienteNombre,clienteId:null,referencia:createHash('sha256').update(JSON.stringify([sede,etiqueta])).digest('hex').slice(0,24),codigosCliente:[codigo],userid:'USUARIO_PRIVADO_'+etiqueta,password:'PASSWORD_PRIVADA_ERP'}));
 const red={calls:[],fallar};
 const gestor=crearGestorVistasERP({conexiones,fetchImpl:async(url,opts)=>{
  red.calls.push(url);if(red.fallar)throw Error('PASSWORD_PRIVADA_ERP');
  if(url.endsWith('gettoken'))return new Response(JSON.stringify({token:'TOKEN_PRIVADO_'+opts.headers.userid}));
  const c=conexiones.find(c=>'TOKEN_PRIVADO_'+c.userid===opts.headers.token);
  const rows=[{'COD. CLIENTE':c.codigosCliente[0],'COD. PRODUCTO':'0001',DESCRIPCION:'Producto <b>texto</b>',NAVE:'A',CANTIDAD:c.etiqueta==='ALU'?'0.1':'1',password:'NO_DEVOLVER_CAMPO_AJENO'}];
  if(c.etiqueta==='ALU')rows.push({...rows[0],'COD. PRODUCTO':'0001_U',NAVE:'B',CANTIDAD:'0.2'});
  return new Response(JSON.stringify(rows));
 }});
 const server=crearApi({pool:apiPool,publicUrl:ERP_ORIGIN,operacionNativa:true,gestorERP:gestor});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const base='http://127.0.0.1:'+server.address().port;
 const req=async(path,{method='GET',body,cookie,csrf,origin=ERP_ORIGIN}={})=>{
  const response=await fetch(base+path,{method,headers:{...(origin?{Origin:origin}:{}),...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-IMS-CSRF':csrf}:{})},body:body?JSON.stringify(body):undefined});return {response,data:await response.json()};
 };
 const login=async()=>{const r=await req('/api/sesion',{method:'POST',body:{correo,contrasena:ERP_PASSWORD}});return {...r,cookie:r.response.headers.get('set-cookie')?.split(';')[0],csrf:r.data.csrf};};
 return {actor,correo,red,conexiones,base,req,login};
}
