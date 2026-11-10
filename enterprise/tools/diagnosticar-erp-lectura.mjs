#!/usr/bin/env node
// Solo lectura de gettoken/getstock. Credenciales y respuestas completas nunca se guardan.
import {mkdir,writeFile,appendFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {registroVerificado} from './revisar-asociaciones-erp.mjs';
import {BASE_ERP_PRIVADA,rutaERPPrivada,leerERPPrivado,jsonERPPrivado} from '../src/migracion/archivos-erp-privados.mjs';
import {proponerAsociacionesERP,conciliarCredencialesERP} from '../src/migracion/asociaciones-erp.mjs';
import {inspeccionarCodigosERP} from '../src/conexiones/itsanet.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const exigir=v=>{if(!v)throw Error('Plan ERP privado incompatible. No se importaron datos.');};
export async function diagnosticarLecturaERP({plan,salida,base=BASE_ERP_PRIVADA,fetchImpl=fetch,ahora=Date.now,presupuestoMs=240000,progreso=()=>{}}){
 base=resolve(base);await rutaERPPrivada(base,{base,directorio:true});
 exigir(Number.isInteger(presupuestoMs)&&presupuestoMs>0&&presupuestoMs<=240000);
 const original=jsonERPPrivado(await leerERPPrivado(plan,{base}));
 exigir(original?.formato==='ims-erp-asociaciones-plan-privado-v1'&&Array.isArray(original.fuentes)&&original.fuentes.length>0&&original.fuentes.length<=10);
 exigir(original.revision?.formato==='ims-erp-asociaciones-revision-v1'&&Array.isArray(original.revision.catalogo_clientes)&&/^[a-f0-9]{64}$/.test(original.sha256_catalogo)&&sha(JSON.stringify(original.revision.catalogo_clientes))===original.sha256_catalogo);
 const registros=[],dirs=new Set();
 // Validar TODAS las fuentes antes de la primera petición de red.
 for(const f of original.fuentes){
  exigir(f&&typeof f.directorio==='string'&&!dirs.has(resolve(f.directorio)));dirs.add(resolve(f.directorio));
  const checked=await registroVerificado(f.directorio,{base});exigir(checked.integridad.sha256_origen===f.sha256_origen);registros.push(checked.registro);
 }
 const asociaciones=proponerAsociacionesERP({registros,clientes:original.revision.catalogo_clientes});
 const conexiones=conciliarCredencialesERP(registros);exigir(conexiones.length>0&&conexiones.length<=64);
 salida=resolve(salida);exigir(salida.startsWith(base+'/'));await rutaERPPrivada(dirname(salida),{base,directorio:true});
 // Nunca sobrescribir un diagnóstico anterior, ni siquiera si no hubo conexión.
 await mkdir(salida,{mode:0o700});
 await writeFile(join(salida,'revision_asociaciones_erp_para_compartir.json'),JSON.stringify(asociaciones,null,2)+'\n',{mode:0o600,flag:'wx'});
 const inicio=ahora(),resultados=[];
 for(const c of conexiones){
  const e=c.entrada;
  let r={referencia:e.referencia,sede:e.sede,etiqueta_credencial:e.cliente_configurado,estado:'NO_VERIFICADA',peticion_realizada:false};
  if(c.conflicto||c.requiere_revision)r.estado='BLOQUEADA_POR_REVISION';
  else if(ahora()-inicio>=presupuestoMs)r.estado='PENDIENTE_PRESUPUESTO';
  else{
   r.peticion_realizada=true;
   try{
    const observado=await inspeccionarCodigosERP({sede:e.sede,userid:e.userid,password:e.password},{fetchImpl});
    r={...r,estado:observado.filas_observadas===0?'VERIFICADA_SIN_STOCK':'VERIFICADA',...observado};
   }catch(error){
    // No registrar errores de fetch, encabezados, usuario, claves o cuerpos.
    r.motivo='AUTENTICACION_O_CONSULTA_NO_VERIFICADA';
    r.etapa_no_verificada=['AUTENTICACION','LECTURA_STOCK','FORMATO_STOCK'].includes(error?.etapaERP)?error.etapaERP:'CONEXION';
    r.http=Number.isInteger(error?.httpERP)&&error.httpERP>=100&&error.httpERP<=599?error.httpERP:null;
   }
  }
  resultados.push(r);
  await appendFile(join(salida,'progreso_erp_para_compartir.jsonl'),JSON.stringify(r)+'\n',{mode:0o600,flag:'a'});
  progreso({conexion:resultados.length,total:conexiones.length,sede:r.sede,etiqueta_credencial:r.etiqueta_credencial,estado:r.estado});
 }
 const verificadas=resultados.filter(r=>r.estado==='VERIFICADA'||r.estado==='VERIFICADA_SIN_STOCK').length;
 const resumen={ok:verificadas===conexiones.length,diagnostico_terminado:!resultados.some(r=>r.estado==='PENDIENTE_PRESUPUESTO'),
  conexiones:conexiones.length,conexiones_verificadas:verificadas,sin_stock:resultados.filter(r=>r.estado==='VERIFICADA_SIN_STOCK').length,
  no_verificadas:resultados.filter(r=>r.estado==='NO_VERIFICADA').length,bloqueadas:resultados.filter(r=>r.estado==='BLOQUEADA_POR_REVISION').length,
  pendientes_por_presupuesto:resultados.filter(r=>r.estado==='PENDIENTE_PRESUPUESTO').length,
  avisos_ubicacion_resueltos:asociaciones.resumen.avisos_ubicacion_resueltos,clientes_asignados:0,codigos_erp_confirmados:0,
  datos_importados:false,base_de_datos_modificada:false,fuentes_modificadas:false,credenciales_publicadas:false,
  aplicacion_reiniciada:false,apache_modificado:false,puertos_abiertos:[],
  catalogo_utilizado:'COPIA_DEL_PLAN_PRIVADO_PREVIO',consulta_catalogo_mysql_realizada:false,
  archivo_para_compartir:join(salida,'conexiones_erp_para_compartir.json')};
 const report={formato:'ims-erp-diagnostico-lectura-v1',resumen,conexiones:resultados};
 await writeFile(resumen.archivo_para_compartir,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
 return resumen;
}
async function main(){
 const a=process.argv.slice(2);
 exigir(process.platform==='linux'&&a.length===5&&a[0]==='--verificar-lectura-erp'&&a[1]==='--plan'&&a[3]==='--salida');
 const resumen=await diagnosticarLecturaERP({plan:a[2],salida:a[4],progreso:p=>console.log(JSON.stringify({tipo:'progreso_erp',...p}))});
 console.log(JSON.stringify({tipo:'resultado_erp',resumen}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Diagnóstico ERP detenido. Conserva el plan y las copias privadas; no compartas claves ni errores internos. No se importaron existencias.');process.exitCode=1;});
