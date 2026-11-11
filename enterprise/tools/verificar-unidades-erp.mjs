import {pathToFileURL} from 'node:url';
import {crearPoolConteos} from '../src/mysql/conteos.mjs';
import {decimal,textoDecimal} from '../src/dominio/analisis-wms.mjs';
import {formatearCantidad} from '../public/cantidades.mjs';
/** Lectura de los snapshots ERP contra su stock persistido, nunca de conteos físicos. */
export async function verificarUnidadesERP(pool){
 const [[db]]=await pool.query('SELECT DATABASE() AS nombre,CURRENT_USER() AS usuario');
 if(!/^centromando_ims_(?:ensayo|pruebas(?:_[a-z0-9]+)?)$/.test(db.nombre||'')||!/^ims_cm_operacion@(?:127\.0\.0\.1|%)$/.test(db.usuario||''))throw Error('Perfil propio incompatible.');
 const [rows]=await pool.query(`SELECT h.filas,h.unidades,
  (SELECT COUNT(*) FROM ims_nat_linea n WHERE n.inventario_id=h.inventario_id) AS lineas_actuales,
  (SELECT SUM(n.depot) FROM ims_nat_linea n WHERE n.inventario_id=h.inventario_id) AS unidades_actuales,
  (SELECT COUNT(*) FROM ims_erp_linea e WHERE e.inventario_id=h.inventario_id) AS origenes_actuales
  FROM ims_erp_inventario h`);
 let lineas=0,unidades=0n;
 for(const r of rows){
  if(!Number.isSafeInteger(Number(r.filas))||Number(r.filas)<1||Number(r.filas)!==Number(r.lineas_actuales)||Number(r.filas)!==Number(r.origenes_actuales)||decimal(r.unidades)===null||decimal(r.unidades_actuales)!==decimal(r.unidades))throw Error('El stock guardado no coincide con el corte ERP. No se cambia ninguna cantidad.');
  lineas+=Number(r.filas);unidades+=decimal(r.unidades);
 }
 return {ok:true,inventarios_erp_verificados:rows.length,lineas_erp_verificadas:lineas,unidades_de_cortes_erp:formatearCantidad(textoDecimal(unidades)),cantidades_exactas_verificadas:true,base_de_datos_modificada:false};
}
async function main(){
 let raw='';for await(const parte of process.stdin){raw+=parte;if(Buffer.byteLength(raw)>16384)throw Error();}
 const s=JSON.parse(raw),pool=await crearPoolConteos(s.config);try{console.log(JSON.stringify(await verificarUnidadesERP(pool)));}finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('La conciliación de unidades ERP no se confirmó. No se modificaron cantidades ni se muestran credenciales.');process.exitCode=1;});
