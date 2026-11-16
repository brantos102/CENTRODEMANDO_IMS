import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generarMapaPosiciones,filtrarMapa,clavePosicion,verticesPosicion} from '../public/mapa-posiciones.mjs';
import {leerCatalogo} from '../public/catalogos-csv.mjs';
import {csvPosiciones} from './fixtures/catalogos-csv.mjs';
const fuente=rows=>leerCatalogo(csvPosiciones(rows),'WTW');
const seCruzan=(a,b)=>a.x<b.x+b.dx-1e-8&&a.x+a.dx>b.x+1e-8&&a.y<b.y+b.dy-1e-8&&a.y+a.dy>b.y+1e-8&&a.z<b.z+b.dz-1e-8&&a.z+a.dz>b.z+1e-8;
test('mapa convierte P/Q/R en cm a largo/ancho/alto métricos y conserva el catálogo original',()=>{
 const rows=fuente([{ALTO:'135'}]),antes=JSON.stringify(rows),m=generarMapaPosiciones(rows),p=m.posiciones[0];assert.deepEqual([p.dx,p.dy,p.dz],[1.2,1,1.35]);assert.deepEqual(p.dimensionesCm,[120,100,135]);assert.equal(p.origenGeometria,'GENERADA_CM');assert.equal(JSON.stringify(rows),antes);assert.equal(m.config.pasilloCm,200);assert.equal(verticesPosicion(p).length,8);
});
test('una posición compartida genera un solo volumen y conserva todos sus clientes',()=>{
 const m=generarMapaPosiciones(fuente([{COD_CLIENTE:'ALU'},{COD_CLIENTE:'ALULTE'}]));assert.equal(m.posiciones.length,1);assert.equal(m.posiciones[0].asociaciones,2);assert.deepEqual(m.posiciones[0].clientes,['ALU','ALULTE']);assert.equal(m.resumen.asociacionesCompartidas,1);
});
test('misma etiqueta en otra sede, almacén o bodega permanece separada y sin superposición',()=>{
 const rows=fuente([{COD_CLIENTE:'A'},{CIUDAD:'GUAYAQUIL',ALMACEN:'CD_GYE'},{ALMACEN:'OTRO'},{BODEGA:'OTRA'}]),m=generarMapaPosiciones(rows);assert.equal(m.posiciones.length,4);assert.equal(filtrarMapa(m,{sede:'GYE'}).length,1);assert.equal(new Set(m.posiciones.map(clavePosicion)).size,4);for(const a of m.posiciones)for(const b of m.posiciones)if(a!==b)assert.equal(seCruzan(a,b),false);
});
test('columnas, profundidades y niveles usan las medidas máximas sin solaparse; pasillos son configurables',()=>{
 const rows=fuente(Array.from({length:36},(_,i)=>({POSICION_COD:'POS-'+i,CALLE:i<18?'A':'B',COLUMNA:String(1+i%3).padStart(2,'0'),NIVEL:String(1+Math.floor(i/3)%3),PROFUNDIDAD:String(1+Math.floor(i/9)%2),LARGO:i%2?'120':'60',ANCHO:i%2?'100':'29',ALTO:i%2?'135':'26'}))),m=generarMapaPosiciones(rows,{pasilloCm:250,holguraCm:5});
 assert.equal(m.posiciones.length,36);for(const a of m.posiciones)for(const b of m.posiciones)if(a!==b)assert.equal(seCruzan(a,b),false);
 const g=m.bloques[0],a=g.calles.find(c=>c.nombre==='A'),b=g.calles.find(c=>c.nombre==='B');assert.ok(Math.abs(b.y-(a.y+a.fondo)-2.5)<1e-8);
 const normal=generarMapaPosiciones(rows),cambio=generarMapaPosiciones(rows,{pasilloCm:500});assert.ok(cambio.posiciones.find(p=>p.calle==='B').y>normal.posiciones.find(p=>p.calle==='B').y);
});
test('orden y filtros no cambian coordenadas; orientación intercambiable conserva las medidas fuente',()=>{
 const rows=fuente([{POSICION_COD:'P-10',COLUMNA:'10'},{POSICION_COD:'P-2',COLUMNA:'02'},{POSICION_COD:'P-B',COLUMNA:'B'}]),m=generarMapaPosiciones(rows),r=generarMapaPosiciones([...rows].reverse()),xyz=m=>m.posiciones.map(p=>[p.id,p.x,p.y,p.z,p.dx,p.dy,p.dz]);assert.deepEqual(xyz(m),xyz(r));const f=filtrarMapa(m,{buscar:'P-2'});assert.equal(f.length,1);assert.equal(f[0].x,m.posiciones.find(p=>p.posicion==='P-2').x);const swap=generarMapaPosiciones(rows,{intercambiarXY:true});assert.deepEqual([swap.posiciones[0].dx,swap.posiciones[0].dy],[1,1.2]);assert.deepEqual(swap.posiciones[0].dimensionesCm,[120,100,200]);
});
test('niveles de otra columna no agregan alturas ficticias a un rack',()=>{
 const m=generarMapaPosiciones(fuente([{POSICION_COD:'C1-N1',COLUMNA:'01',NIVEL:'1',ALTO:'100'},{POSICION_COD:'C1-N2',COLUMNA:'01',NIVEL:'2',ALTO:'100'},{POSICION_COD:'C2-N9',COLUMNA:'02',NIVEL:'9',ALTO:'26'}]));assert.equal(m.posiciones.find(p=>p.posicion==='C2-N9').z,0);assert.equal(m.posiciones.find(p=>p.posicion==='C1-N2').z,1);
});
test('ceros o dimensiones discordantes no inventan cubos; valores pequeños siguen siendo centímetros',()=>{
 const rows=fuente([{POSICION_COD:'CERO',LARGO:'0'},{POSICION_COD:'PEQUENA',LARGO:'1.1',ANCHO:'1.2',ALTO:'1.35'},{POSICION_COD:'CONFLICTO',COD_CLIENTE:'A'},{POSICION_COD:'CONFLICTO',COD_CLIENTE:'B',ALTO:'30'}]),m=generarMapaPosiciones(rows);assert.equal(m.excluidas.length,2);assert.equal(m.posiciones.length,1);assert.deepEqual([m.posiciones[0].dx,m.posiciones[0].dy,m.posiciones[0].dz],[.011,.012,.0135]);assert.equal(m.posiciones[0].medidaPequena,true);assert.equal(m.excluidas.find(p=>p.posicion==='CONFLICTO').motivo,'MEDIDAS_DISCORDANTES');
});
test('estados de ocupación y bloqueo se muestran sin modificarlos ni generar cantidades',()=>{
 const m=generarMapaPosiciones(fuente([{POSICION_COD:'A',POS_LOCKEADA:'1'},{POSICION_COD:'B',STATUS_OCUPACION:'OCUPADA'},{POSICION_COD:'C',COD_CLIENTE:'NOKIA',STATUS_OCUPACION:'DISPONIBLE'}]));assert.equal(filtrarMapa(m,{estado:'BLOQUEADA'}).length,1);assert.equal(filtrarMapa(m,{cliente:'NOKIA'})[0].posicion,'C');assert.deepEqual(filtrarMapa(m,{estado:'LIBRE'})[0].estadosOrigen,['DISPONIBLE']);assert.equal(filtrarMapa(m,{estado:'OCUPADA'})[0].posicion,'B');assert.ok(m.posiciones.every(p=>p.cantidad===undefined));
});
test('coordenadas explícitas de la plantilla mantienen sus valores originales',()=>{
 const m=generarMapaPosiciones([{posicion:'EXPLICITA',x:'-2',y:'3',z:'1',ancho:'1.2',fondo:'1',alto:'1.35'}]);assert.equal(m.resumen.explicitas,1);assert.deepEqual([m.posiciones[0].x,m.posiciones[0].y,m.posiciones[0].z],[-2,3,1]);assert.throws(()=>generarMapaPosiciones([],{pasilloCm:-1}));assert.throws(()=>generarMapaPosiciones([],{holguraCm:NaN}));
});
