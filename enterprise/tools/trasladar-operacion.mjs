import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {records,validateSnapshot,verifyStoredSnapshot,databaseConfig} from './importar-snapshot.mjs';
import {validarPlan,politicaPlan} from './planificar-operacion.mjs';
import {comprobarCantidades,opcionesCantidad} from './reglas-cantidades.mjs';
import {REGLAS_CONTEOS,comprobarSeparaciones,conteosPreparados,proyeccionConteo} from './separar-conteos.mjs';
import {canon,sha,exigir,celdas,texto,proyectarFila,uuidEstable} from '../src/migracion/modelo.mjs';
import {estadoPermiteConsolidar} from '../src/dominio/inventario.mjs';

// Nombres internos constantes: nunca se interpolan nombres del plan o de HTTP.
const tablaAportes=m=>m.reglas===REGLAS_CONTEOS?'ims_mig_conteo_aporte':'ims_mig_aporte';

async function insertar(c,table,columns,rows){
  if(!rows.length)return;
  // Nombres constantes internos, nunca proceden del plan ni de HTTP.
  let batch=[],bytes=0;
  const flush=async()=>{if(!batch.length)return;await c.execute(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${batch.map(()=>`(${columns.map(()=>'?').join(',')})`).join(',')}`,batch.flat());batch=[];bytes=0;};
  for(const row of rows){const n=Buffer.byteLength(JSON.stringify(row));if(batch.length&&(batch.length>=200||bytes+n>512*1024))await flush();batch.push(row);bytes+=n;}
  await flush();
}
async function verificarNativo(c,m,catalogo,onProgress=()=>{}){
  const tabla=tablaAportes(m),politica=politicaPlan(m);
  const [aportes]=await c.execute(`SELECT inventario_id,origen_drive,filas,snapshot_id${m.reglas===REGLAS_CONTEOS?',codigo_operativo':''} FROM ${tabla} WHERE plan_id=?`,[m.plan_id]);
  const prepared=conteosPreparados(catalogo,politica.separaciones);exigir(aportes.length===prepared.length,'Aportes nativos diferentes del plan.');
  for(const r of prepared){const a=aportes.find(x=>x.inventario_id===r.inventario_id);exigir(a&&a.origen_drive===r.origen_drive&&a.snapshot_id===m.snapshot_id&&Number(a.filas)===r.filas&&
    (m.reglas!==REGLAS_CONTEOS||a.codigo_operativo===r.codigo),'Origen nativo incompatible.');}
  const [cantidades]=await c.execute(`SELECT a.inventario_id,COUNT(l.id) AS filas FROM ${tabla} a
    LEFT JOIN ims_op_linea l ON l.inventario_id=a.inventario_id WHERE a.plan_id=? GROUP BY a.inventario_id`,[m.plan_id]);
  for(const r of prepared)exigir(Number(cantidades.find(x=>x.inventario_id===r.inventario_id)?.filas)===r.filas,
    'Hay líneas nativas ajenas o ausentes en un inventario; no se sobrescribe.');
  const hash=(await import('node:crypto')).createHash('sha256');let previous=0,count=0,ultimaNotificacion=Date.now();
  onProgress({fase:'verificacion_en_transaccion',filas:0,total:m.resumen.filas_preparadas});
  for(;;){
    // La primera verificación ocurre antes del COMMIT, con tablas recién
    // pobladas. Fijar el recorrido por la clave de paginación evita planes
    // costosos de unión mientras se conserva el mismo filtro y resultado.
    const [rows]=await c.execute(`SELECT m.fila_consolidado,m.contenido_sha256,r.contenido,l.*,cl.nombre AS cliente,
      d.posicion,d.descripcion,d.serie,d.lote,d.unidad FROM ims_mig_linea m FORCE INDEX (uq_ims_mig_fila)
      STRAIGHT_JOIN ims_op_linea l ON l.id=m.linea_id STRAIGHT_JOIN ${tabla} a ON a.inventario_id=l.inventario_id AND a.plan_id=?
      STRAIGHT_JOIN ims_op_cliente cl ON cl.id=l.cliente_id STRAIGHT_JOIN ims_op_detalle_linea d ON d.linea_id=l.id
      STRAIGHT_JOIN ims_snapshot_fila r ON r.snapshot_id=m.snapshot_id AND r.hoja=m.hoja AND r.numero_fila=m.fila_consolidado
      WHERE m.snapshot_id=? AND m.hoja='INVENTARIOS' AND m.fila_consolidado>? ORDER BY m.fila_consolidado LIMIT 250`,[m.plan_id,m.snapshot_id,previous]);
    if(!rows.length)break;
    for(const r of rows){
      exigir(sha(canon(JSON.parse(r.contenido)))===r.contenido_sha256,'El original de una línea cambió.');
      exigir(String(r.version)==='0'&&r.fila_origen===null,'La línea nativa ya fue utilizada o modificada. No se sobrescribe.');
      const p={linea_id:r.id,inventario_id:r.inventario_id,cliente_id:r.cliente_id,cliente:r.cliente,sku:r.sku,
        origen_drive:r.origen_drive,fila_consolidado:r.fila_consolidado,contenido_sha256:r.contenido_sha256,
        conteo_1:r.conteo_1,conteo_2:r.conteo_2,conteo_final:r.conteo_final,observacion:r.observacion,nueva_posicion:r.nueva_posicion,
        posicion:r.posicion,descripcion:r.descripcion,serie:r.serie,lote:r.lote,unidad:r.unidad};
      hash.update(canon(p)+'\n');previous=r.fila_consolidado;count++;
    }
    if(Date.now()-ultimaNotificacion>=5000||count===m.resumen.filas_preparadas){onProgress({fase:'verificacion_en_transaccion',filas:count,total:m.resumen.filas_preparadas});ultimaNotificacion=Date.now();}
  }
  exigir(count===m.resumen.filas_preparadas&&hash.digest('hex')===m.archivos['lineas_preparadas.jsonl'],'El contenido nativo no coincide con el plan.');
  const [cat]=await c.execute('SELECT contenido FROM ims_mig_catalogo WHERE plan_id=? ORDER BY fila_panel',[m.plan_id]);
  exigir(cat.length===catalogo.length&&sha(cat.map(r=>r.contenido+'\n').join(''))===m.archivos['catalogo.jsonl'],'Catálogo de revisión incompatible.');
  const [invs]=await c.execute(`SELECT i.*,a.origen_drive FROM ${tabla} a JOIN ims_op_inventario i ON i.id=a.inventario_id WHERE a.plan_id=?`,[m.plan_id]);
  for(const r of prepared){const i=invs.find(x=>x.id===r.inventario_id);exigir(i&&i.origen_drive===r.origen_drive&&i.estado==='ENTREGADO'&&i.codigo_operativo===r.codigo&&i.sede===r.sede,'El inventario nativo cambió; no se reemplaza.');}
}
export async function trasladarOperacion({planDir,snapshotDir,connection:c,onProgress=()=>{}}){
  const plan=await validarPlan(planDir),snapshot=await validateSnapshot(snapshotDir),m=plan.manifest;
  const politica=politicaPlan(m);
  exigir(m.snapshot_id===snapshot.manifest.snapshot_id,'Plan y corte diferentes.');
  const [[db]]=await c.query('SELECT DATABASE() AS nombre,CURRENT_USER() AS usuario');
  exigir(/^centromando_ims(?:_[a-z0-9_]+)?$/.test(db.nombre||'')&&!/^root@/i.test(db.usuario||''),'Base o usuario no permitido.');
  const [estado]=await c.execute('SELECT estado FROM ims_snapshot WHERE snapshot_id=?',[m.snapshot_id]);
  exigir(estado[0]?.estado==='VERIFICADO','Primero se requiere staging íntegro y verificado.');
  onProgress({fase:'verificando_copia_resguardo'});
  await verifyStoredSnapshot(c,snapshot.manifest);
  const catalogo=[];for await(const {row} of records(path.join(plan.dir,'catalogo.jsonl')))catalogo.push(row);
  await comprobarCantidades(snapshot,catalogo,politica.cantidades);
  await comprobarSeparaciones(snapshot,catalogo,politica.separaciones);
  const panel=snapshot.manifest.hojas.find(s=>s.nombre==='PANEL DE CONTROL'),originales=new Map(),clientes=new Set(),cuentasOrigen=new Map();
  for await(const {row} of records(path.join(snapshot.dir,panel.archivo))){
    if(row.fila===1)continue;const d=celdas(row);originales.set(row.fila,{origen:(texto(d.get(3))||'').trim(),sede:(texto(d.get(6))||'').trim().toUpperCase(),estado:texto(d.get(7)),cliente:(texto(d.get(1))||'').trim()});
    const cliente=(texto(d.get(1))||'').trim();if(cliente)clientes.add(cliente);
    const origen=(texto(d.get(3))||'').trim();cuentasOrigen.set(origen,(cuentasOrigen.get(origen)||0)+1);
  }
  exigir(catalogo.length===originales.size&&catalogo.length===m.resumen.inventarios_panel,'Catálogo incompleto.');
  const fuentesPreparadas=new Map(),vistas=new Set();
  const invSheet=snapshot.manifest.hojas.find(s=>s.nombre==='INVENTARIOS');
  for(const r of catalogo){
    const o=originales.get(r.fila_panel);exigir(o&&!vistas.has(r.fila_panel)&&o.origen===r.origen_drive&&o.sede===r.sede&&o.estado===r.estado_original&&o.cliente===r.cliente_panel,'Catálogo no corresponde al panel.');vistas.add(r.fila_panel);
    if(!r.preparado)continue;
    exigir(estadoPermiteConsolidar(o.estado)&&['UIO','GYE'].includes(o.sede)&&cuentasOrigen.get(o.origen)===1&&
      (!politica.clientePanel||Boolean(o.cliente))&&r.motivos.length===0&&r.filas>0&&r.filas===invSheet.filas_por_origen[o.origen]&&
      r.inventario_id===uuidEstable('inventario',o.origen)&&!fuentesPreparadas.has(o.origen),'Inventario no preparado o duplicado.');
    fuentesPreparadas.set(o.origen,r);
  }
  exigir(fuentesPreparadas.size===m.resumen.inventarios_preparados,'Conteo de inventarios preparado incompatible.');
  const lista=conteosPreparados(catalogo,politica.separaciones),preparados=new Map(lista.map(r=>[r.inventario_id,r])),tabla=tablaAportes(m);
  exigir(preparados.size===lista.length&&preparados.size===(m.reglas===REGLAS_CONTEOS?m.resumen.conteos_preparados:m.resumen.inventarios_preparados),'Conteo lógico preparado incompatible.');
  onProgress({fase:'prevalidacion_completa',archivos:fuentesPreparadas.size,conteos:preparados.size,filas:m.resumen.filas_preparadas});
  const lock='ims-operacion:'+sha(db.nombre).slice(0,40);let locked=false,tx=false;
  try{
    const [[l]]=await c.execute('SELECT GET_LOCK(?,0) AS ok',[lock]);exigir(Number(l.ok)===1,'Otro traslado está activo.');locked=true;
    for(const name of ['002_conteo_operativo.sql','004_detalle_linea.sql','005_migracion_operativa.sql','006_conteos_comparten_origen.sql']){
      const ddl=await readFile(new URL('../sql/'+name,import.meta.url),'utf8');for(const sql of ddl.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await c.query(sql);
    }
    await c.beginTransaction();tx=true;
    const [[previo]]=await c.execute('SELECT snapshot_id FROM ims_mig_plan WHERE plan_id=? FOR UPDATE',[m.plan_id]);
    if(previo){await verificarNativo(c,m,catalogo,onProgress);await c.commit();tx=false;return {yaTrasladado:true,inventarios:fuentesPreparadas.size,conteos:preparados.size,filas:m.resumen.filas_preparadas};}
    // Cero reemplazos de otro corte y cero escrituras sobre un inventario existente.
    for(const r of fuentesPreparadas.values()){
      const [[a]]=await c.execute('SELECT inventario_id FROM ims_mig_aporte WHERE origen_drive=? FOR UPDATE',[r.origen_drive]);
      const [[b]]=await c.execute('SELECT inventario_id FROM ims_mig_conteo_aporte WHERE origen_drive=? LIMIT 1 FOR UPDATE',[r.origen_drive]);
      exigir(!a&&!b,'Un origen ya pertenece a otro plan/corte; requiere conciliación de delta.');
    }
    for(const r of preparados.values()){
      const [[i]]=await c.execute('SELECT id FROM ims_op_inventario WHERE id=? FOR UPDATE',[r.inventario_id]);exigir(!i,'Ya existe el inventario nativo; no se sobrescribe.');
    }
    await c.execute('INSERT INTO ims_mig_plan (plan_id,snapshot_id,manifiesto,creado_en) VALUES (?,?,?,UTC_TIMESTAMP(6))',[m.plan_id,m.snapshot_id,canon(m)]);
    await insertar(c,'ims_mig_catalogo',['plan_id','snapshot_id','hoja','fila_panel','contenido'],catalogo.map(r=>[m.plan_id,m.snapshot_id,'PANEL DE CONTROL',r.fila_panel,canon(r)]));
    for(const r of preparados.values()){
      await c.execute("INSERT INTO ims_op_inventario (id,sede,codigo_operativo,estado) VALUES (?,?,?,'ENTREGADO')",[r.inventario_id,r.sede,r.codigo]);
      if(m.reglas===REGLAS_CONTEOS)await c.execute('INSERT INTO ims_mig_conteo_aporte (inventario_id,origen_drive,plan_id,snapshot_id,filas,codigo_operativo) VALUES (?,?,?,?,?,?)',[r.inventario_id,r.origen_drive,m.plan_id,m.snapshot_id,r.filas,r.codigo]);
      else await c.execute('INSERT INTO ims_mig_aporte (inventario_id,origen_drive,plan_id,snapshot_id,filas) VALUES (?,?,?,?,?)',[r.inventario_id,r.origen_drive,m.plan_id,m.snapshot_id,r.filas]);
    }
    const knownClients=new Set(),relations=new Set(),counts=new Map();let batch=[],bytes=0,previous=1,total=0,escritas=0,ultimaEscritura=Date.now();
    const flush=async()=>{
      if(!batch.length)return;
      const [raws]=await c.execute(`SELECT numero_fila,contenido FROM ims_snapshot_fila WHERE snapshot_id=? AND hoja='INVENTARIOS' AND numero_fila IN (${batch.map(()=>'?').join(',')})`,[m.snapshot_id,...batch.map(r=>r.fila_consolidado)]);
      const raw=new Map(raws.map(r=>[r.numero_fila,JSON.parse(r.contenido)]));
      for(const r of batch){
        exigir(raw.has(r.fila_consolidado),'Falta el original de una línea.');
        const inv=preparados.get(r.inventario_id);
        const opciones=politica.clientePanel?{clientePanel:inv?.cliente_panel}:{};
        opciones.cantidades=opcionesCantidad(politica.cantidades,r.origen_drive);
        const p=proyectarFila(raw.get(r.fila_consolidado),m.snapshot_id,clientes,opciones);
        p.proyeccion=proyeccionConteo(p.proyeccion,p.codigo,politica.separaciones);
        exigir(inv&&inv.origen_drive===r.origen_drive&&p.issues.length===0&&p.codigo===inv.codigo&&canon(p.proyeccion)===canon(r),'La proyección no coincide con su original.');
        if(!knownClients.has(r.cliente_id)){
          const [[prev]]=await c.execute('SELECT nombre FROM ims_op_cliente WHERE id=? FOR UPDATE',[r.cliente_id]);
          if(prev)exigir(prev.nombre===r.cliente,'Identidad de cliente incompatible.');else await c.execute('INSERT INTO ims_op_cliente (id,nombre) VALUES (?,?)',[r.cliente_id,r.cliente]);
          knownClients.add(r.cliente_id);
        }
        const rel=r.inventario_id+':'+r.cliente_id;
        if(!relations.has(rel)){await c.execute('INSERT INTO ims_op_inventario_cliente (inventario_id,cliente_id) VALUES (?,?)',[r.inventario_id,r.cliente_id]);relations.add(rel);}
        counts.set(r.inventario_id,(counts.get(r.inventario_id)||0)+1);
      }
      await insertar(c,'ims_op_linea',['id','inventario_id','cliente_id','sku','origen_drive','fila_origen','version','conteo_1','conteo_2','conteo_final','observacion','nueva_posicion'],
        batch.map(r=>[r.linea_id,r.inventario_id,r.cliente_id,r.sku,r.origen_drive,null,0,r.conteo_1,r.conteo_2,r.conteo_final,r.observacion,r.nueva_posicion]));
      await insertar(c,'ims_op_detalle_linea',['linea_id','posicion','descripcion','serie','lote','unidad'],batch.map(r=>[r.linea_id,r.posicion,r.descripcion,r.serie,r.lote,r.unidad]));
      await insertar(c,'ims_mig_linea',['linea_id','snapshot_id','hoja','fila_consolidado','contenido_sha256'],batch.map(r=>[r.linea_id,m.snapshot_id,'INVENTARIOS',r.fila_consolidado,r.contenido_sha256]));
      escritas+=batch.length;
      if(Date.now()-ultimaEscritura>=5000||escritas===m.resumen.filas_preparadas){onProgress({fase:'escritura_en_transaccion',filas:escritas,total:m.resumen.filas_preparadas});ultimaEscritura=Date.now();}
      batch=[];bytes=0;
    };
    for await(const {raw,row} of records(path.join(plan.dir,'lineas_preparadas.jsonl'))){
      exigir(Number.isSafeInteger(row.fila_consolidado)&&row.fila_consolidado>previous,'Líneas repetidas o fuera de orden.');previous=row.fila_consolidado;
      if(batch.length&&(bytes+Buffer.byteLength(raw)>512*1024||batch.length>=200))await flush();
      batch.push(row);bytes+=Buffer.byteLength(raw);total++;
    }
    await flush();exigir(total===m.resumen.filas_preparadas,'Faltan líneas preparadas.');
    for(const r of preparados.values())exigir(counts.get(r.inventario_id)===r.filas,'Un inventario quedó incompleto.');
    await verificarNativo(c,m,catalogo,onProgress);
    await c.commit();tx=false;return {yaTrasladado:false,inventarios:fuentesPreparadas.size,conteos:preparados.size,filas:total};
  }catch(e){if(tx)await c.rollback();throw e;}
  finally{if(locked)await c.execute('SELECT RELEASE_LOCK(?)',[lock]);}
}
async function main(){
  const [flag,planDir,snapshotDir,...rest]=process.argv.slice(2);
  exigir(flag==='--aplicar'&&planDir&&snapshotDir&&!rest.length&&process.env.IMS_MIGRACION_OPERATIVA==='1','Requiere habilitación expresa y --aplicar /plan /corte.');
  const config=databaseConfig(process.env),mysql=await import('mysql2/promise'),c=await mysql.createConnection(config);
  try{const r=await trasladarOperacion({planDir,snapshotDir,connection:c,onProgress:p=>console.error(JSON.stringify({progreso:p}))});console.log(JSON.stringify({ok:true,...r,usuarios_activados:false,permisos_creados:false,publicacion_kpi:false}));}finally{await c.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{
  console.error('Traslado detenido. Revisa el corte, plan, staging, base exclusiva y conflictos existentes. No se muestran datos ni credenciales.');process.exitCode=1;
});
