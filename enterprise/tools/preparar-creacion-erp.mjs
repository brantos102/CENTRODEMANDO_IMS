import {readFile} from 'node:fs/promises';
import {crearPoolConteos} from '../src/mysql/conteos.mjs';
import {validarEsquemaCreacionERP} from '../src/mysql/esquema-erp.mjs';
import {transaccionOperativa} from '../src/mysql/operacion-nativa.mjs';
const ALTAS=['FOC 5G','MOD 2024','NOKIA'];
export async function prepararCreacionERP(pool,actorId){
 const [[db]]=await pool.query('SELECT DATABASE() AS nombre,CURRENT_USER() AS usuario');
 if(!/^centromando_ims_(?:ensayo|pruebas(?:_[a-z0-9]+)?)$/.test(db.nombre)||!/^ims_cm_migracion@|^ims_pruebas_erp@/.test(db.usuario))throw Error('Perfil de preparación incompatible.');
 const sql=await readFile(new URL('../sql/011_creacion_erp.sql',import.meta.url),'utf8');
 for(const s of sql.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await pool.query(s);
 await validarEsquemaCreacionERP(pool);
 const altas=await transaccionOperativa(pool,{actorId},async c=>{
  await c.execute('SELECT id FROM ims_op_actor WHERE id=? FOR UPDATE',[actorId]);const nuevas=[];
  for(const nombre of ALTAS){
   const [rows]=await c.execute('SELECT id,nombre FROM ims_op_cliente WHERE UPPER(TRIM(nombre)) COLLATE utf8mb4_0900_bin=? FOR SHARE',[nombre]);
   if(rows.length>1)throw Error('Catálogo ambiguo; no se reemplazan nombres.');
   if(!rows.length){await c.execute('INSERT INTO ims_op_cliente(id,nombre) VALUES (UUID(),?)',[nombre]);nuevas.push(nombre);}
  }
  return nuevas;
 });
 return {ok:true,tablas_erp_verificadas:2,clientes_creados:altas,clientes_existentes_renombrados:false,fuentes_modificadas:false};
}
async function main(){
 if(process.argv[2]!=='--preparar')throw Error('Preparación explícita requerida.');let input='';for await(const p of process.stdin){input+=p;if(Buffer.byteLength(input)>65536)throw Error('Excesivo');}const s=JSON.parse(input),pool=await crearPoolConteos(s.config);try{console.log(JSON.stringify(await prepararCreacionERP(pool,s.actorId)));}finally{await pool.end();}
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])main().catch(()=>{console.error('Preparación ERP detenida; no se muestran credenciales.');process.exitCode=1;});
