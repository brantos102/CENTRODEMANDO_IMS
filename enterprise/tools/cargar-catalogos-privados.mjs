import {readFile,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import mysql from 'mysql2/promise';
import {databaseConfig} from './importar-snapshot.mjs';
import {importarCatalogo} from '../src/centro/catalogos.mjs';
import {analizarCatalogo,decodificarCatalogo} from '../public/catalogos-csv.mjs';
import {generarMapaPosiciones} from '../public/mapa-posiciones.mjs';
import {uuidEstable} from '../src/migracion/modelo.mjs';
/** Importación privada/versionada: un catálogo diferente ya activo siempre se conserva. */
export async function cargarCatalogosPrivados(pool,actorId,archivos,{cuentasERP=[]}={}){
 const resultados=[];
 for(const a of archivos){
  const st=await lstat(a.ruta);if(!st.isFile()||st.isSymbolicLink()||st.size>16*1024*1024||await realpath(a.ruta)!==a.ruta)throw Error('ARCHIVO_PRIVADO_INVALIDO');
  const bytes=await readFile(a.ruta),sha256=createHash('sha256').update(bytes).digest('hex');if(sha256!==a.sha256)throw Error('HUELLA_INCOMPATIBLE');
  for(const sede of a.sedes){
   const [[actual]]=await pool.execute('SELECT x.id,(SELECT sha256 FROM ims_cm_catalogo_archivo ar WHERE ar.catalogo_id=x.id AND ar.parte=0) sha256 FROM ims_cm_catalogo_actual ac JOIN ims_cm_catalogo x ON x.id=ac.catalogo_id WHERE ac.sede=? AND ac.tipo=?',[sede,a.tipo]);
   if(actual&&actual.sha256!==sha256)throw Error('CATALOGO_ACTUAL_DISTINTO_CONSERVADO');
   const r=actual?{catalogoId:actual.id,yaImportado:true}:await importarCatalogo(pool,{actorId},{operacionId:uuidEstable('catalogo-privado',[actorId,sede,a.tipo,sha256]),sede,tipo:a.tipo,nombre:a.nombre,archivo:{base64:bytes.toString('base64')}},{cuentasERP});
   const [[check]]=await pool.execute('SELECT COUNT(*) n,SUM(cliente_id IS NULL) pendientes FROM ims_cm_catalogo_fila WHERE catalogo_id=?',[r.catalogoId]);
   const filas=analizarCatalogo(decodificarCatalogo(bytes).texto,a.tipo).filas.filter(f=>!f.sede||f.sede===sede);if(Number(check.n)!==filas.length)throw Error('CONTEO_CATALOGO_INCOMPATIBLE');
   const geometria=a.tipo==='WTW'?generarMapaPosiciones(filas).resumen:null;
   resultados.push({sede,tipo:a.tipo,registros:Number(check.n),yaImportado:!!r.yaImportado,...(geometria?{posiciones3d:geometria.dibujables,pendientesMedidas:geometria.excluidas}:{}),originalVerificado:true,...(a.tipo==='EAN'?{pendientesAsociacion:Number(check.pendientes||0)}:{})});
  }
 }
 return {ok:true,catalogos:resultados,stockModificado:false,conteosModificados:false,apacheModificado:false,puertosAbiertos:[]};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){let pool;try{let entrada='';for await(const chunk of process.stdin){entrada+=chunk;if(entrada.length>32768)throw Error();}const s=JSON.parse(entrada),cfg=databaseConfig(s.config);if(cfg.database!=='centromando_ims_ensayo'||cfg.user!=='ims_cm_migracion'||cfg.host!=='127.0.0.1')throw Error('CONFIGURACION_INCOMPATIBLE');pool=mysql.createPool({...cfg,connectionLimit:2,dateStrings:true});console.log(JSON.stringify(await cargarCatalogosPrivados(pool,s.actorId,s.archivos,{cuentasERP:s.cuentasERP??[]})));}catch(e){console.log(JSON.stringify({ok:false,codigo:/^[A-Z_]{1,70}$/.test(e.message)?e.message:'CARGA_CATALOGOS_NO_CONFIRMADA',codigoMysql:/^ER_[A-Z_]{1,60}$/.test(e.code||'')?e.code:null,stockModificado:false}));process.exitCode=1;}finally{await pool?.end();}}
