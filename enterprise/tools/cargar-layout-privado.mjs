import mysql from 'mysql2/promise';
import {createHash} from 'node:crypto';
import {databaseConfig} from './importar-snapshot.mjs';
import {validarPerfilLayout,aplicarLayoutFisico} from '../public/layout-fisico.mjs';
import {generarMapaPosiciones} from '../public/mapa-posiciones.mjs';
import {consultarCatalogos} from '../src/centro/catalogos.mjs';
import {importarLayout} from '../src/centro/layout.mjs';
let pool;
try{
 let entrada='';for await(const chunk of process.stdin){entrada+=chunk;if(entrada.length>128000)throw Error();}
 const s=JSON.parse(entrada),cfg=databaseConfig(s.config),perfil=validarPerfilLayout(s.perfil);
 if(cfg.database!=='centromando_ims_ensayo'||cfg.user!=='ims_cm_migracion'||cfg.host!=='127.0.0.1')throw Error('CONFIGURACION_INCOMPATIBLE');
 pool=mysql.createPool({...cfg,connectionLimit:2,dateStrings:true});
 const id=createHash('sha256').update(JSON.stringify(perfil)).digest('hex'),[[anterior]]=await pool.execute('SELECT layout_id FROM ims_cm_layout_actual WHERE sede=? AND almacen=?',[perfil.sede,perfil.almacen]);
 if(anterior&&anterior.layout_id!==id)throw Error('LAYOUT_ACTUAL_DISTINTO_CONSERVADO');
 const r=await importarLayout(pool,{actorId:s.actorId},perfil);
 let desde=null,version,filas=[];
 do{const pagina=await consultarCatalogos(pool,{actorId:s.actorId},{sede:perfil.sede,tipo:'WTW',desde,version});version=pagina.catalogo?.id;if(!version)break;filas.push(...pagina.filas);if(filas.length>50000)throw Error('CATALOGO_EXCEDE_LIMITE');desde=pagina.siguiente;}while(desde!==null);
 const m=aplicarLayoutFisico(generarMapaPosiciones(filas),perfil),avisos=Object.fromEntries([...new Set(m.avisos.map(a=>a.codigo))].map(k=>[k,m.avisos.filter(a=>a.codigo===k).length]));
 console.log(JSON.stringify({...r,yaImportado:!!anterior,medidasCatalogo:'CM',alturaEntrepisoConfirmada:perfil.alturaEntrepisoConfirmada===true,alturaEntrepisoCm:perfil.alturaEntrepiso*100,posiciones:m.posiciones.length,posicionesSinMedidas:m.excluidas.length,avisos,datosInventarioModificados:false}));
}catch(e){console.log(JSON.stringify({ok:false,codigo:/^[A-Z_]{1,70}$/.test(e.message)?e.message:'CARGA_LAYOUT_NO_CONFIRMADA',stockModificado:false}));process.exitCode=1;}finally{await pool?.end();}
