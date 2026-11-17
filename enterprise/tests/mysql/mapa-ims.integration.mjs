import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {crearPoolConteos} from '../../src/mysql/conteos.mjs';
import {esquemaCentro,fixtureCentro} from '../fixtures/centro.mjs';
import {crearDesdeCentro} from '../../src/centro/crear.mjs';
import {consultarMapaInventario} from '../../src/centro/mapa-inventario.mjs';
import {importarCatalogo} from '../../src/centro/catalogos.mjs';
import {guardarConteo} from '../../src/mysql/conteos.mjs';
import {cargarCatalogosPrivados} from '../../tools/cargar-catalogos-privados.mjs';
import {csvPosiciones} from '../fixtures/catalogos-csv.mjs';
if(process.env.IMS_MYSQL_PRUEBAS!=='1'||!/^centromando_ims_pruebas(?:_[a-z0-9]+)?$/.test(process.env.MYSQL_DATABASE||''))throw Error('Solo base de pruebas.');
let pool;before(async()=>{pool=await crearPoolConteos(process.env);await esquemaCentro(pool);});after(async()=>{await pool?.end();});
test('mapa IMS: progreso por cliente autorizado conserva cero, oculta cantidades y rechaza otro inventario; ubicación exacta no incluye su prefijo',async t=>{
 const f=await fixtureCentro(pool,t),s={...f.solicitud,vinculacion:'NINGUNO',filas:[{numero:1,clienteId:f.cli.id,sku:'0001',depot:'9',posicion:'A-01'},{numero:2,clienteId:f.cli.id,sku:'0001',depot:'1',posicion:'A-010'}]},r=await crearDesdeCentro({pool,principal:{actorId:f.actor},solicitud:s}),[[l]]=await pool.execute('SELECT id,version FROM ims_op_linea WHERE inventario_id=? AND sku=? ORDER BY id LIMIT 1',[r.inventarioId,'0001']);
 await guardarConteo({pool,principal:{actorId:f.actor},soloNativos:true,solicitud:{operacionId:randomUUID(),inventarioId:r.inventarioId,lineaId:l.id,versionEsperada:String(l.version),etapa:1,cantidad:'0'}});
 const m=await consultarMapaInventario(pool,{actorId:f.actor},{inventario:r.inventarioId});assert.equal(m.posiciones.reduce((a,p)=>a+p.c1,0),1);assert.equal(m.stockTeoricoIncluido,false);assert.ok(!JSON.stringify(m).includes('depot'));assert.ok(!JSON.stringify(m).includes('desfase'));
 const login=await f.login(),exacta=await f.req('/api/inventarios/'+r.inventarioId+'/lineas?posicion=A-01',login);assert.equal(exacta.response.status,200);assert.equal(exacta.data.datos.length,1);assert.equal(exacta.data.datos[0].posicion,'A-01');
 const otro=await fixtureCentro(pool,t);await assert.rejects(()=>consultarMapaInventario(pool,{actorId:otro.actor},{inventario:r.inventarioId}),e=>e.codigo==='SIN_PERMISO'||e.code==='SIN_PERMISO');
 await pool.execute('DELETE FROM ims_nat_perfil WHERE inventario_id=? AND actor_id=?',[r.inventarioId,f.actor]);await pool.execute('DELETE FROM ims_op_permiso WHERE inventario_id=? AND actor_id=?',[r.inventarioId,f.actor]);await assert.rejects(()=>consultarMapaInventario(pool,{actorId:f.actor},{inventario:r.inventarioId}));
});
test('carga privada importa medidas originales, repite sin versiones nuevas y conserva catálogo distinto',async t=>{
 const f=await fixtureCentro(pool,t),dir=await mkdtemp(join(tmpdir(),'ims-catalogos-test-')),ruta=join(dir,'pos.csv'),csv=csvPosiciones([{CIUDAD:'GUAYAQUIL',ALMACEN:'CD_GUAYAQUIL1',POSICION_COD:'G-01',ALTO:'135'}]),sha256=createHash('sha256').update(csv).digest('hex');await writeFile(ruta,csv,{mode:0o600});
 await pool.execute("DELETE FROM ims_cm_catalogo_actual WHERE sede='GYE' AND tipo='WTW'");const args=[{ruta,nombre:'pos.csv',tipo:'WTW',sedes:['GYE'],sha256}],a=await cargarCatalogosPrivados(pool,f.actor,args),b=await cargarCatalogosPrivados(pool,f.actor,args);assert.equal(a.catalogos[0].posiciones3d,1);assert.equal(b.catalogos[0].yaImportado,true);assert.equal(a.conteosModificados,false);
 const distinto=await importarCatalogo(pool,{actorId:f.actor},{operacionId:randomUUID(),tipo:'WTW',sede:'GYE',nombre:'posterior.csv',filas:[{posicion:'NUEVA'}]});await assert.rejects(()=>cargarCatalogosPrivados(pool,f.actor,args),/CATALOGO_ACTUAL_DISTINTO_CONSERVADO/);const [[actual]]=await pool.execute("SELECT catalogo_id FROM ims_cm_catalogo_actual WHERE sede='GYE' AND tipo='WTW'");assert.equal(actual.catalogo_id,distinto.catalogoId);
 await writeFile(ruta,csv+'CAMBIO');await assert.rejects(()=>cargarCatalogosPrivados(pool,f.actor,args),/HUELLA_INCOMPATIBLE/);
});


test('mapa de un operador de un solo cliente no revela las posiciones ni las capturas del segundo cliente',async t=>{
 const f=await fixtureCentro(pool,t),[[alu]]=await pool.execute("SELECT id FROM ims_op_cliente WHERE nombre='ALU'"),s={...f.solicitud,clientes:[f.cli.id,alu.id],vinculacion:'NINGUNO',filas:[{numero:1,clienteId:f.cli.id,sku:'VISIBLE',depot:'10',posicion:'VISIBLE-01'},{numero:2,clienteId:alu.id,sku:'OTRO',depot:'20',posicion:'OTRO-CLIENTE-02'}]},r=await crearDesdeCentro({pool,principal:{actorId:f.actor},solicitud:s}),operador=await fixtureCentro(pool,t);
 await pool.execute("UPDATE ims_cm_perfil SET rol='OPERARIO',rol_wms='OPERADOR' WHERE actor_id=?",[operador.actor]);await pool.execute('INSERT INTO ims_op_permiso VALUES (?,?,?,1)',[operador.actor,r.inventarioId,f.cli.id]);await pool.execute("INSERT INTO ims_nat_perfil VALUES (?,?,?,'OPERADOR')",[operador.actor,r.inventarioId,f.cli.id]);const m=await consultarMapaInventario(pool,{actorId:operador.actor},{inventario:r.inventarioId});assert.deepEqual(m.posiciones.map(x=>x.posicion),['VISIBLE-01']);assert.equal(m.stockTeoricoIncluido,false);
});


test('carga privada EAN usa un alias ERP verificado y no pierde una asociación desconocida',async t=>{
 const f=await fixtureCentro(pool,t),dir=await mkdtemp(join(tmpdir(),'ims-ean-test-')),ruta=join(dir,'ean.csv'),csv='CLIENTE_ID;PRODUCTO_ID;TIPO_CODIGO;CODIGO;CANTIDAD\nALIAS_VERIFICADO;0001;EAN13;0001234567890;12\nDESCONOCIDO;0002;EAN13;0001234567891;1\n';await writeFile(ruta,csv,{mode:0o600});await pool.execute("DELETE FROM ims_cm_catalogo_actual WHERE sede='UIO' AND tipo='EAN'");
 const r=await cargarCatalogosPrivados(pool,f.actor,[{ruta,nombre:'ean.csv',tipo:'EAN',sedes:['UIO'],sha256:createHash('sha256').update(csv).digest('hex')}],{cuentasERP:[{sede:'UIO',clienteId:f.cli.id,clienteNombre:f.cli.nombre,codigosCliente:['ALIAS_VERIFICADO']}]});assert.equal(r.catalogos[0].registros,2);assert.equal(r.catalogos[0].pendientesAsociacion,1);const [[dato]]=await pool.execute("SELECT f.cliente_id FROM ims_cm_catalogo_fila f JOIN ims_cm_catalogo_actual a ON a.catalogo_id=f.catalogo_id WHERE a.sede='UIO' AND a.tipo='EAN' AND f.sku='0001'");assert.equal(dato.cliente_id,f.cli.id);
});

test('ocupación de Centro es global; IMS filtra en el servidor por posiciones exactas y permisos de cliente',async t=>{
 const {guardarCorteOcupacion,consultarOcupacion,consultarOcupacionInventario}=await import('../../src/centro/ocupacion.mjs'),{leerCatalogo}=await import('../../public/catalogos-csv.mjs'),{mutarCentro}=await import('../../src/centro/servicio.mjs'),{ejecutarOperacion}=await import('../../src/mysql/operacion-nativa.mjs'),f=await fixtureCentro(pool,t),p={actorId:f.actor},otroCliente=randomUUID();await pool.execute('INSERT INTO ims_op_cliente VALUES (?,?)',[otroCliente,'PRIVADO '+otroCliente]);
 const r=await crearDesdeCentro({pool,principal:p,solicitud:{...f.solicitud,vinculacion:'NINGUNO',clientes:[f.cli.id,otroCliente],filas:[{...f.solicitud.filas[0],posicion:'BM-A-01-1'},{...f.solicitud.filas[0],numero:2,posicion:'BM-A-01-2'},{...f.solicitud.filas[0],numero:3,posicion:'SIN_CORTE'},{...f.solicitud.filas[0],numero:4,clienteId:otroCliente,posicion:'BM-PRIVADO-01-1'}]}});
 const filas=leerCatalogo(csvPosiciones(['BM-A-01-1','BM-A-01-2','BM-A-01-10','BM-PRIVADO-01-1'].map((pos,i)=>({POSICION_COD:pos,BODEGA:'BM',CALLE:'A',COLUMNA:String(i+1),STATUS_OCUPACION:i===1?'DISPONIBLE':'OCUPADA',POS_LOCKEADA:i===1?'1':'0'}))),'WTW').map(r=>r.origen.datos);await guardarCorteOcupacion(pool,p,[...filas,{...filas[0],COD_CLIENTE:'OTRO_CLIENTE'}]);
 const u=await mutarCentro({pool,principal:p,tipo:'usuario',solicitud:{operacionId:randomUUID(),correo:randomUUID()+'@sintetico.invalid',nombre:'Operario ocupado',rol:'OPERARIO',sedes:['UIO'],contrasena:'Clave_sintetica_20261117!'}});await ejecutarOperacion({pool,principal:p,tipo:'asignar',solicitud:{operacionId:randomUUID(),inventarioId:r.inventarioId,versionEsperada:'1',actorId:u.actorId,clienteId:f.cli.id,rol:'OPERADOR'}});
 const global=await consultarOcupacion(pool,p,'UIO'),scoped=await consultarOcupacionInventario(pool,{actorId:u.actorId},r.inventarioId);assert.equal(global.resumen.total,4);assert.equal(global.resumen.ocupadas,3);assert.equal(global.resumen.bloqueadas,1);assert.equal(scoped.resumen.total,3);assert.equal(scoped.resumen.ocupadas,1);assert.equal(scoped.resumen.sinDato,1);assert.deepEqual(scoped.posiciones.map(p=>p.posicion).sort(),['BM-A-01-1','BM-A-01-2','SIN_CORTE']);assert.equal(scoped.corte.filas,undefined);assert.ok(!JSON.stringify(scoped).includes('BM-PRIVADO'));const otro=await fixtureCentro(pool,t);await assert.rejects(()=>consultarOcupacionInventario(pool,{actorId:otro.actor},r.inventarioId),e=>e.codigo==='SIN_PERMISO');
 const auth=await f.login(),http=await f.req('/api/centro/ocupacion-inventario?inventario='+r.inventarioId,auth);assert.equal(http.response.status,200);assert.equal(http.data.alcance,'POSICIONES_AUTORIZADAS_DEL_INVENTARIO');assert.ok(!http.data.posiciones.some(p=>p.posicion==='BM-A-01-10'));
});
