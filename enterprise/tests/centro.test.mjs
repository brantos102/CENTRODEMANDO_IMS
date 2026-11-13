import {test} from 'node:test';
import assert from 'node:assert/strict';
import {permisos,puedeCrearRol,evento,transicion,calendario,indicadores,codigosDesdeFilas,fecha} from '../src/centro/dominio.mjs';
import {proyectarEvento,sanearFila} from '../src/centro/importar.mjs';
import {csv,ics} from '../src/centro/reportes.mjs';
import {xlsx} from '../src/centro/archivos.mjs';
import {inflateRawSync} from 'node:zlib';
const actor='00000000-0000-4000-8000-000000000001';
test('jerarquía del original: coordinador crea líderes; líder no crea administradores ni otros líderes',()=>{
 assert.ok(permisos('ADMIN').administrar);assert.ok(!permisos('COORDINADOR').administrar);assert.ok(permisos('LIDER').crear);assert.ok(!permisos('LIDER').exportar);assert.ok(!permisos('AUDITOR').crear);assert.ok(!permisos('OPERARIO').analitica);assert.ok(puedeCrearRol('COORDINADOR','LIDER'));assert.ok(!puedeCrearRol('LIDER','LIDER'));assert.ok(!puedeCrearRol('OPERARIO','OPERARIO'));
});
test('eventos conservan fechas explícitas y duración inclusiva sin inferirlas del nombre del archivo',()=>{
 const e=evento({sede:'UIO',cliente:'BELIA',titulo:'Inventario',fechaInicio:'2026-11-13',duracion:3});assert.equal(e.fecha_inicio,'2026-11-13');assert.equal(calendario([e],'2026-11-15','2026-11-15').length,1);assert.equal(calendario([e],'2026-11-16','2026-11-16').length,0);assert.throws(()=>fecha('2026-02-30'));assert.throws(()=>fecha('2026-15-01'));
});
test('iniciar, pausar y entregar no permiten actuar como otro responsable ni cambiar una entrega',()=>{
 const e={sede:'UIO',responsable_id:actor,estado:'Pendiente'},p={rol:'OPERARIO',sedes:['UIO']};assert.equal(transicion(e,'iniciar',p,actor).estado,'En curso');assert.throws(()=>transicion(e,'iniciar',p,'otro'));assert.throws(()=>transicion(e,'pausar',p,actor));assert.equal(transicion({...e,estado:'En curso'},'pausar',p,actor).estado,'Pausado');assert.throws(()=>transicion({...e,estado:'Entregado'},'finalizar',p,actor));assert.throws(()=>transicion(e,'iniciar',{rol:'ADMIN',sedes:['GYE']},actor));
});
test('indicadores distinguen fecha de inicio de entrega y suman unidades sin perder precisión',()=>{
 const panel=[{cliente:'A',fecha_inicio:'2026-11-01',fecha_fin:'2026-11-10',estado:'Entregado',unidades:'9007199254740993.000000001',referencias:2,posiciones:3},{cliente:'B',fecha_inicio:'2026-01-01',fecha_fin:'2026-02-01',estado:'No Entregado',unidades:'0.000000001'}];const k=indicadores([{fecha_inicio:'2026-11-12',estado:'Pendiente'},{fecha_inicio:'2026-11-13',estado:'En curso'},{fecha_inicio:'2026-11-20',estado:'Pendiente'}],panel,'2026-11-13');assert.equal(k.unidades,'9007199254740993.000000002');assert.equal(k.entregados,1);assert.equal(k.vencidos,1);assert.equal(k.hoy,1);assert.equal(k.proximos,1);assert.equal(k.tendencia[10].entregados,1);assert.equal(k.tendencia[1].entregados,0);
});
test('programación reconoce meses reales y conserva SKU con ceros; un bloque ambiguo requiere mes',()=>{
 const r=codigosDesdeFilas([['ABC','producto_id','JULIO','DICIEMBRE'],['A','000123','X','']]);assert.equal(r[0].sku,'000123');assert.deepEqual(r[0].meses,[7]);assert.deepEqual(r.mesesAfectados,[7,12]);assert.throws(()=>codigosDesdeFilas([['000123','X']]));assert.equal(codigosDesdeFilas([['SKU'],['000123']],11)[0].sku,'000123');
});
test('recuperación mantiene códigos y fecha literal, no expone contraseñas del respaldo de usuarios',()=>{
 const r={fila:9,celdas:[{columna:4,valor:'Conteo'},{columna:5,valor:'BELIA'},{columna:12,tipo:'s',valor:'13/11/2026'},{columna:13,valor:'Entregado'}]};const e=proyectarEvento(r,{clave:'fuente',nombre:'CRONOGRAMA - 2026'});assert.equal(e.fecha_inicio,'2026-11-13');assert.equal(e.estado,'Entregado');const saneada=sanearFila({fila:2,celdas:[{columna:4,valor:'telefono'},{columna:9,valor:'secreto'}]},'USUARIOS');assert.equal(saneada.celdas.length,1);assert.equal(saneada.celdas[0].valor,'telefono');
});
test('referencias de texto del cronograma se enlazan solo por cliente y fecha explícita únicos del mismo respaldo',()=>{
 const row=(fila,vals)=>({fila,celdas:vals.map(([columna,valor])=>({columna,tipo:'s',valor}))}),drive='ORIGEN_SINTETICO_1234567890',r=row(9,[[5,'BELIA'],[12,'13/11/2026'],[17,'BELIA · 13/11/2026']]),f={clave:'snapshot:abc:CRONOGRAMA - 2026',nombre:'CRONOGRAMA - 2026'},panel={clave:'snapshot:abc:PANEL DE CONTROL',nombre:'PANEL DE CONTROL',completa:true,filas:[row(2,[[1,'BELIA'],[3,drive],[4,'13/11/2026']])]};
 assert.equal(proyectarEvento(r,f,[panel]).archivo_drive,drive);
 assert.equal(proyectarEvento(r,f,[{...panel,clave:'snapshot:otro:PANEL DE CONTROL'}]).archivo_drive,'');
 assert.equal(proyectarEvento(r,f,[{...panel,filas:[...panel.filas,row(3,[[1,'BELIA'],[3,'OTRO_ORIGEN_12345678901234'],[4,'13/11/2026']])]}]).archivo_drive,'');
 assert.equal(proyectarEvento({...r,celdas:r.celdas.map(c=>c.columna===17?{...c,valor:'131126_BELIA'}:c)},f,[panel]).archivo_drive,'');
});
test('CSV e ICS no ejecutan fórmulas ni inyectan cabeceras; Excel conserva identificadores como texto',async()=>{
 assert.match(csv([['=1+1','00123','2.000000000']]),/"'=1\+1";"00123"/);assert.ok(!ics([{id:actor,cliente:'A\nEND:VEVENT',titulo:'B',fecha_inicio:'2026-11-13'}]).includes('A\nEND:VEVENT'));
 const b=await xlsx([['SKU','UNIDADES'],['00123','=1+1'],['serie','9007199254740993.000000001']]);let p=0,hoja='';const names=[];while(b.readUInt32LE(p)===0x04034b50){const len=b.readUInt32LE(p+18),n=b.readUInt16LE(p+26),extra=b.readUInt16LE(p+28),name=b.subarray(p+30,p+30+n).toString(),start=p+30+n+extra;names.push(name);if(name==='xl/worksheets/sheet1.xml')hoja=inflateRawSync(b.subarray(start,start+len)).toString();p=start+len;}assert.ok(names.includes('[Content_Types].xml'));assert.match(hoja,/00123/);assert.match(hoja,/9007199254740993.000000001/);assert.ok(!hoja.includes('<f>'));assert.match(hoja,/t="inlineStr"/);
});
test('conexiones privadas se cifran con autenticación y rechazan una clave o contenido distintos',async()=>{
 const {cifrar,descifrar,validarConector}=await import('../src/centro/conectores.mjs'),k='a'.repeat(64),s={password:'SECRETO_SINTETICO',host:'correo.sintetico.invalid'},c=cifrar(s,k);assert.ok(!c.includes(s.password));assert.deepEqual(descifrar(c,k),s);assert.throws(()=>descifrar(c,'b'.repeat(64)));assert.throws(()=>validarConector('SMTP',{host:'localhost',puerto:25}));
});
