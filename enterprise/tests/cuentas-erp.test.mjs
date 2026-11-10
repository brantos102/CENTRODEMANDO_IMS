import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepararCredencialesERP,ORIGEN_ERP,ORIGEN_ERP_GYE} from '../src/migracion/credenciales-erp.mjs';
import {conciliarCredencialesERP} from '../src/migracion/asociaciones-erp.mjs';
import {prepararRegistroCuentasERP,validarInformeLecturaERP} from '../src/migracion/cuentas-erp.mjs';
const USER='USUARIO_PRIVADO_ERP',PASS='CLAVE_PRIVADA_ERP';
function fixture(){
 const fuente={formato:'ims-erp-origen-v1',creado_en:'2026-11-10T12:00:00Z',legacy_uio:[]};
 const cred=JSON.stringify({user:USER,pass:PASS});
 const registros=[prepararCredencialesERP({...fuente,...ORIGEN_ERP,propiedades:{CRED_API_HYCITE:cred,CRED_API_FINI:cred}}).registro,prepararCredencialesERP({...fuente,...ORIGEN_ERP_GYE,propiedades:{CREDGYE_API_NOKIACNTLTE:cred,CREDGYE_API_MOD2024:cred,CREDGYE_API_ALU:cred}}).registro];
 const clientes=[{id:'10000000-0000-4000-8000-000000000001',nombre:'HYCITE'},{id:'10000000-0000-4000-8000-000000000002',nombre:'ALU'}];
 const informe={formato:'ims-erp-diagnostico-lectura-v1',conexiones:conciliarCredencialesERP(registros).map(c=>{
  const e=c.entrada;if(e.cliente_configurado==='FINI')return {referencia:e.referencia,sede:e.sede,etiqueta_credencial:e.cliente_configurado,estado:'NO_VERIFICADA',http:401};
  const codigo=e.cliente_configurado==='HYCITE'?'HYCITE2':e.cliente_configurado==='NOKIACNTLTE'?'NOKIACNT':e.cliente_configurado;
  return {referencia:e.referencia,sede:e.sede,etiqueta_credencial:e.cliente_configurado,estado:'VERIFICADA',autenticacion_verificada:true,consulta_stock_verificada:true,peticion_realizada:true,filas_observadas:1,filas_sin_codigo:0,codigos_observados:[{codigo,filas:1}],previsualizacion:{totales_calculados:true}};
 })};
 return {registros,clientes,informe};
}
test('registro separa etiqueta, código real y cliente del panel; conserva claves solo en salida privada',()=>{
 const f=fixture(),r=prepararRegistroCuentasERP(f),hycite=r.privado.conexiones.find(c=>c.etiqueta==='HYCITE');
 assert.deepEqual(hycite.codigosCliente,['HYCITE2']);assert.equal(hycite.clienteNombre,'HYCITE');assert.equal(hycite.userid,USER);assert.equal(hycite.password,PASS);
 assert.equal(r.privado.conexiones.some(c=>c.etiqueta==='FINI'),false);assert.equal(r.reporte.cuentas.find(c=>c.etiqueta_credencial==='FINI').estado,'CONEXION_NO_VERIFICADA');
 assert.equal(JSON.stringify(r.reporte).includes(USER),false);assert.equal(JSON.stringify(r.reporte).includes(PASS),false);assert.equal(r.reporte.resumen.configuracion_activa,false);assert.equal(r.reporte.resumen.base_de_datos_modificada,false);
});
test('grupos confirmados pendientes de catálogo no reciben un UUID inventado ni modifican catálogo',()=>{
 const f=fixture(),antes=JSON.stringify(f.clientes),r=prepararRegistroCuentasERP(f),n=r.privado.conexiones.find(c=>c.etiqueta==='NOKIACNTLTE');assert.equal(n.clienteNombre,'NOKIA');assert.equal(n.clienteId,null);assert.deepEqual(n.codigosCliente,['NOKIACNT']);assert.deepEqual(r.reporte.resumen.altas_catalogo_pendientes,['NOKIA']);assert.equal(JSON.stringify(f.clientes),antes);
 assert.equal(r.reporte.cuentas.find(c=>c.etiqueta_credencial==='MOD2024').estado,'CLIENTE_POR_CONFIRMAR'); // No quitar espacios para adivinar etiquetas.
});
test('informe de otro origen, referencias repetidas y códigos con recuentos incoherentes se rechazan',()=>{
 for(const cambiar of [f=>{f.informe.conexiones[0].sede='UIO';},f=>{f.informe.conexiones[0]=f.informe.conexiones[1];},f=>{f.informe.conexiones.find(c=>c.estado==='VERIFICADA').codigos_observados[0].filas=2;}]){
  const f=fixture();cambiar(f);assert.throws(()=>validarInformeLecturaERP(f.informe,conciliarCredencialesERP(f.registros)));
 }
});
test('dos credenciales con mismo código de una sede y varios códigos no se activan automáticamente',()=>{
 const f=fixture(),rs=f.informe.conexiones.filter(c=>c.sede==='GYE');rs[0].codigos_observados[0].codigo='REPETIDO';rs[1].codigos_observados[0].codigo='REPETIDO';
 const r=prepararRegistroCuentasERP(f);assert.equal(r.reporte.cuentas.filter(c=>c.estado==='CODIGO_EN_VARIAS_CONEXIONES').length,2);
 const f2=fixture(),x=f2.informe.conexiones.find(c=>c.etiqueta_credencial==='ALU');x.filas_observadas=2;x.codigos_observados.push({codigo:'OTRO',filas:1});
 assert.equal(prepararRegistroCuentasERP(f2).reporte.cuentas.find(c=>c.etiqueta_credencial==='ALU').estado,'CODIGOS_REQUIEREN_ASOCIACION');
});
