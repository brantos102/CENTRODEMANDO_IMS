#!/usr/bin/env node
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {prepararCredencialesERP} from '../src/migracion/credenciales-erp.mjs';
import {proponerAsociacionesERP} from '../src/migracion/asociaciones-erp.mjs';
import {BASE_ERP_PRIVADA,rutaERPPrivada,leerERPPrivado,jsonERPPrivado} from '../src/migracion/archivos-erp-privados.mjs';
import {databaseConfig} from './importar-snapshot.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const exigir=v=>{if(!v)throw Error('Revisión ERP incompatible. No se asignaron clientes.');};
export async function registroVerificado(dir,{base=BASE_ERP_PRIVADA}={}){
 dir=await rutaERPPrivada(dir,{base,directorio:true});
 const raw=await leerERPPrivado(join(dir,'origen_NO_COMPARTIR.json'),{base});
 const integridad=jsonERPPrivado(await leerERPPrivado(join(dir,'integridad_erp_NO_COMPARTIR.json'),{base}));
 exigir(/^[a-f0-9]{64}$/.test(integridad?.sha256_origen)&&integridad.sha256_origen===sha(raw));
 const {registro}=prepararCredencialesERP(jsonERPPrivado(raw));
 const guardado=jsonERPPrivado(await leerERPPrivado(join(dir,'registro_erp_NO_COMPARTIR.json'),{base}));
 exigir(isDeepStrictEqual(registro,guardado));
 return {registro,integridad:{directorio:dir,sha256_origen:sha(raw)}};
}
export async function catalogoERP(connection,{database='centromando_ims_ensayo',user='ims_cm_operacion@127.0.0.1'}={}){
 const [[db]]=await connection.query('SELECT DATABASE() AS nombre,CURRENT_USER() AS usuario');
 exigir(db?.nombre===database&&db.usuario===user);
 await connection.query('SET TRANSACTION READ ONLY');
 await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
 try{
  const [clientes]=await connection.query('SELECT id,nombre FROM ims_op_cliente ORDER BY id');
  // Termina sin COMMIT: este flujo no realiza escrituras ni cambia perfiles.
  return clientes;
 }finally{await connection.rollback();}
}
export async function prepararRevisionAsociaciones({revisiones,salida,leerCatalogo,base=BASE_ERP_PRIVADA}){
 base=resolve(base);await rutaERPPrivada(base,{base,directorio:true});
 exigir(Array.isArray(revisiones)&&revisiones.length>0&&revisiones.length<=10&&new Set(revisiones.map(p=>resolve(p))).size===revisiones.length);
 salida=resolve(salida);exigir(salida.startsWith(base+'/'));await rutaERPPrivada(dirname(salida),{base,directorio:true});
 const fuentes=[];
 // Validar todos los originales ANTES de abrir MySQL.
 for(const dir of revisiones)fuentes.push(await registroVerificado(dir,{base}));
 const clientes=await leerCatalogo();
 const revision=proponerAsociacionesERP({registros:fuentes.map(f=>f.registro),clientes});
 await mkdir(salida,{mode:0o700});
 const guardar=(nombre,datos)=>writeFile(join(salida,nombre),JSON.stringify(datos,null,2)+'\n',{mode:0o600,flag:'wx'});
 await guardar('asociaciones_erp_NO_COMPARTIR.json',{formato:'ims-erp-asociaciones-plan-privado-v1',fuentes:fuentes.map(f=>f.integridad),sha256_catalogo:sha(JSON.stringify(revision.catalogo_clientes)),revision});
 await guardar('revision_asociaciones_erp_para_compartir.json',revision);
 const resumen={...revision.resumen,archivo_para_compartir:join(salida,'revision_asociaciones_erp_para_compartir.json')};
 await guardar('resumen_asociaciones_erp_para_compartir.json',resumen);
 return resumen;
}
async function main(){
 const args=process.argv.slice(2);
 exigir(process.platform==='linux'&&args.length>=4&&args[0]==='--salida'&&args[2]==='--revisiones');
 const base=BASE_ERP_PRIVADA;
 const leerCatalogo=async()=>{
  // Leer el perfil existente como datos; nunca ejecutar/source el archivo env.
  const raw=await leerERPPrivado(join(base,'operacion','operacion.env'),{base,maxBytes:16384});
  const env={};
  for(const line of new TextDecoder('utf-8',{fatal:true}).decode(raw).split('\n')){
   if(!line)continue;const m=/^([A-Z_][A-Z_0-9]*)=([^\r\n]*)$/.exec(line);exigir(m&&!Object.hasOwn(env,m[1]));env[m[1]]=m[2];
  }
  const cfg=databaseConfig(env);exigir(cfg.host==='127.0.0.1'&&cfg.port===3306&&cfg.database==='centromando_ims_ensayo'&&cfg.user==='ims_cm_operacion');
  const mysql=await import('mysql2/promise'),c=await mysql.createConnection({...cfg,connectTimeout:10000});
  try{return await catalogoERP(c);}finally{await c.end();}
 };
 console.log(JSON.stringify(await prepararRevisionAsociaciones({salida:args[1],revisiones:args.slice(3),leerCatalogo}),null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Revisión de asociaciones detenida. Comprueba revisión privada, integridad, perfil y dependencias. No se muestran credenciales ni respuestas SQL; conserva los originales.');process.exitCode=1;});
