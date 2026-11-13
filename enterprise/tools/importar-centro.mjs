import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
import {databaseConfig} from './importar-snapshot.mjs';
import {proyectarHistorico,conservarRegistrosSQL} from '../src/centro/completar-respaldo.mjs';
import {importarCentro,fuentesSQL} from '../src/centro/importar.mjs';
let c,etapa='CONFIGURACION';
try{
 let s='';for await(const p of process.stdin){s+=p;if(s.length>32768)throw Error();}const r=JSON.parse(s),cfg=databaseConfig(r.config);if(cfg.database!=='centromando_ims_ensayo'||cfg.user!=='ims_cm_migracion'||cfg.host!=='127.0.0.1')throw Error();
 c=await mysql.createConnection({...cfg,dateStrings:true});const [[db]]=await c.query('SELECT CURRENT_USER() usuario');if(db.usuario!=='ims_cm_migracion@127.0.0.1')throw Error();
 const zip=JSON.parse(await readFile(r.paquete,'utf8'));if(zip.corte_id!=='07e58bf9-6fe1-4bf0-b93e-d1a89cb66764')throw Error();
 etapa='FUENTES_SQL';const sql=await fuentesSQL(c),out=await importarCentro(c,[...zip.fuentes,...sql],{actorInicial:r.actorInicial});etapa='PLANILLAS_AUXILIARES';if(zip.archivos)for(const f of zip.archivos){const [[existe]]=await c.execute('SELECT 1 n FROM ims_cm_archivo_legado WHERE archivo_drive=? AND hoja=? LIMIT 1',[f.archivo,f.hoja]);if(existe)continue;const {insertarFilas}=await import('../src/mysql/lineas-legado.mjs');await c.beginTransaction();try{await insertarFilas(c,'ims_cm_archivo_legado',['archivo_drive','hoja','fila','contenido','serie'],f.filas.map(r=>[f.archivo,f.hoja,r.fila,JSON.stringify(r),r.fila>1&&/PLANILLA.*SERIE/.test(f.hoja.toUpperCase())?String(r.celdas.find(c=>c.columna===2)?.valor??'').trim().toUpperCase()||null:null]));await c.commit();}catch(e){await c.rollback();throw e;}}etapa='PROYECCION_HISTORICA';const h=await proyectarHistorico(c);etapa='REGISTROS';const reg=await conservarRegistrosSQL(c);console.log(JSON.stringify({...out,...h,...reg}));
}catch(e){console.log(JSON.stringify({ok:false,etapa,codigo_mysql:/^ER_[A-Z_]{1,60}$/.test(e.code||'')?e.code:null,codigo_error:'IMPORTACION_ADMINISTRATIVA_NO_CONFIRMADA',servicios_reiniciados:false}));process.exitCode=1;}finally{await c?.end();}
