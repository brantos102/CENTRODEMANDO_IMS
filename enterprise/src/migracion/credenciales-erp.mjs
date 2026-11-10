import {createHash} from 'node:crypto';
export const ORIGEN_ERP={proyecto:'1QPDNLYYqLXkOjNyWoL49JepzxW32XaTskLWfSYOfCdE10Dt62FAfhlsD',maestro:'1Cq2AqRVAZJYmj_zs_zg8C63FPrgRBtJHaNcHWXygaPk'};
export const ORIGEN_ERP_GYE={proyecto:'1qF3PYXIJb8liPB2lGpbltE6CD4r4dmV57O0G1-FGt3WgjbNq3zyGJ27e',maestro:null};
function exigir(v){if(!v)throw Error('Exportación ERP incompatible. Conserva el original privado; no se importaron datos.');}
function objeto(v){return v&&typeof v==='object'&&!Array.isArray(v);}
function valores(v){
 if(!objeto(v)||!v.user||!v.pass)return null;
 // Igual que el getter original: los campos con valor se convierten con String.
 return {userid:String(v.user),password:String(v.pass)};
}
function firma(v){return createHash('sha256').update(JSON.stringify(v)).digest('hex');}
/** Solo interpreta la copia privada; nunca lee/escribe Google, SQL o el ERP. */
export function prepararCredencialesERP(data){
 exigir(objeto(data)&&data.formato==='ims-erp-origen-v1');
 const esGYE=data.proyecto===ORIGEN_ERP_GYE.proyecto;
 const origen=esGYE?ORIGEN_ERP_GYE:ORIGEN_ERP;
 exigir(data.proyecto===origen.proyecto&&data.maestro===origen.maestro);
 exigir(typeof data.creado_en==='string'&&Number.isFinite(Date.parse(data.creado_en))&&objeto(data.propiedades)&&Array.isArray(data.legacy_uio)&&data.legacy_uio.length<=10000);
 exigir(!esGYE||data.legacy_uio.length===0);
 const claves=Object.keys(data.propiedades);
 const propiedades=new Map(),legacy=new Map(),problemas=[],revisar=new Set();
 let propiedadesUIO=0,propiedadesGYE=0,legacyRepetidas=0;
 claves.sort().forEach((k,index)=>{
  const m=/^(CRED_API_|CREDGYE_API_)(.*)$/.exec(k);exigir(m&&typeof data.propiedades[k]==='string');
  const sede=m[1]==='CRED_API_'?'UIO':'GYE',cli=m[2],key=JSON.stringify([sede,cli]);
  if(sede==='UIO')propiedadesUIO++;else propiedadesGYE++;
  if(esGYE&&sede==='UIO'){
   revisar.add(key);problemas.push({fuente:'propiedades',indice:index,motivo:'PREFIJO_UIO_EN_PROYECTO_GYE'});
  }
  if(!cli||cli!==cli.trim().toUpperCase()){
   problemas.push({fuente:'propiedades',indice:index,motivo:'CLAVE_NO_CANONICA'});return;
  }
  let valor;try{valor=valores(JSON.parse(data.propiedades[k]));}catch{valor=null;}
  if(!valor){problemas.push({fuente:'propiedades',indice:index,motivo:'CREDENCIAL_INVALIDA'});return;}
  propiedades.set(key,{sede,cliente_configurado:cli,...valor,fuente:'ScriptProperties'});
 });
 data.legacy_uio.forEach((r,index)=>{
  exigir(Array.isArray(r)&&r.length===3&&r.every(v=>typeof v==='string'&&v.length<=50000));
  const cli=r[0].trim().toUpperCase();if(!cli)return;
  const key=JSON.stringify(['UIO',cli]),candidate={sede:'UIO',cliente_configurado:cli,userid:r[1].trim(),password:r[2].trim(),fuente:'CREDENCIALES_API',fila_legacy:index+2};
  if(legacy.has(key)){
   legacyRepetidas++;
   const first=legacy.get(key);
   if(first.userid!==candidate.userid||first.password!==candidate.password){revisar.add(key);problemas.push({fuente:'legacy_uio',indice:index,motivo:'LEGACY_CONFLICTIVA'});}
   return; // El getter original usa la PRIMERA fila coincidente, incluso si está vacía.
  }
  legacy.set(key,candidate);
 });
 const efectivas=new Map(propiedades);
 let fallback=0,legacySombreadas=0;
 for(const [key,entry] of legacy){
  if(propiedades.has(key)){legacySombreadas++;continue;}
  efectivas.set(key,entry);fallback++;
 }
 const entradas=[...efectivas.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,e])=>{
  const formatoUtilizable=!!e.userid&&!!e.password&&!/[\r\n\x00]/.test(e.userid+e.password);
  if(!formatoUtilizable)problemas.push({fuente:e.fuente,motivo:'CREDENCIAL_REQUIERE_REVISION'});
  return {referencia:firma([e.sede,e.cliente_configurado]).slice(0,24),...e,
   requiere_revision:((!propiedades.has(key)||esGYE)&&revisar.has(key))||!formatoUtilizable,formato_utilizable:formatoUtilizable,
   conexion_comprobada:false,cliente_mysql_asignado:false,codigos_erp_confirmados:false};
 });
 return {
  registro:{formato:'ims-erp-registro-privado-v1',origen:{...origen,creado_en:data.creado_en},entradas,problemas},
  resumen:{ok:true,propiedades_erp:claves.length,propiedades_uio:propiedadesUIO,propiedades_gye:propiedadesGYE,
   conexiones_identificadas:entradas.length,conexiones_preparadas:entradas.filter(e=>e.formato_utilizable).length,uio:entradas.filter(e=>e.sede==='UIO').length,gye:entradas.filter(e=>e.sede==='GYE').length,
   fallback_legacy_uio:fallback,filas_legacy_repetidas:legacyRepetidas,legacy_no_utilizada_por_precedencia:legacySombreadas,
   incidencias:problemas.length,conexiones_para_revision:entradas.filter(e=>e.requiere_revision).length,
   fuentes_modificadas:false,base_de_datos_modificada:false,credenciales_publicadas:false,conexiones_reales_comprobadas:false,
   clientes_mysql_asignados:0,codigos_erp_confirmados:0}
 };
}
