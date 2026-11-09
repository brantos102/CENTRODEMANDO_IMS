/** Aprovisionamiento interno del lector de ensayo. No abre puertos ni importa RRHH. */
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {correoCanonico,crearHashPassword,verificarPassword,sha256} from '../src/auth/credenciales.mjs';
import {databaseConfig} from './importar-snapshot.mjs';

function exigir(ok,mensaje){if(!ok)throw Error(mensaje);}
export async function prepararLector({connection:c,planId,actorId,correo,nombre,contrasena,
  database='centromando_ims_ensayo',aplicar=false}){
  exigir(/^centromando_ims_(?:ensayo|pruebas(?:_[a-z0-9]+)?)$/.test(database),'Base de ensayo incompatible.');
  exigir(/^[a-f0-9]{64}$/.test(planId||'')&&/^[a-f0-9-]{36}$/.test(actorId||''),'Identidad del piloto inválida.');
  correo=correoCanonico(correo);
  exigir(typeof nombre==='string'&&nombre.trim()&&nombre.length<=255,'Nombre inválido.');
  const hash=await crearHashPassword(contrasena);
  const [[db]]=await c.query('SELECT DATABASE() AS nombre,CURRENT_USER() AS usuario');
  exigir(db.nombre===database&&!/^root@/i.test(db.usuario),'Conexión ajena al ensayo.');
  const lock='ims-operacion:'+sha256(database).slice(0,40);let locked=false,tx=false;
  try{
    const [[l]]=await c.execute('SELECT GET_LOCK(?,0) AS ok',[lock]);exigir(Number(l.ok)===1,'Otra operación de migración está activa.');locked=true;
    const [[p]]=await c.execute(`SELECT p.snapshot_id,p.manifiesto,s.estado FROM ims_mig_plan p
      JOIN ims_snapshot s ON s.snapshot_id=p.snapshot_id WHERE p.plan_id=?`,[planId]);
    exigir(p?.estado==='VERIFICADO','El plan no está trasladado con resguardo verificado.');
    const m=JSON.parse(p.manifiesto),r=m.resumen;
    exigir(m.plan_id===planId&&m.snapshot_id===p.snapshot_id&&r?.conteos_preparados>0,'Se requiere un plan v4 trasladado.');
    const [[tot]]=await c.execute(`SELECT COUNT(*) AS conteos,COUNT(DISTINCT origen_drive) AS inventarios,SUM(filas) AS filas
      FROM ims_mig_conteo_aporte WHERE plan_id=?`,[planId]);
    exigir(Number(tot.conteos)===r.conteos_preparados&&Number(tot.inventarios)===r.inventarios_preparados&&Number(tot.filas)===r.filas_preparadas,'El aporte no coincide con el plan.');
    const [[native]]=await c.execute(`SELECT COUNT(*) AS filas,COUNT(DISTINCT l.inventario_id) AS conteos,
      SUM(i.estado<>'ENTREGADO') AS fuera_estado FROM ims_op_linea l
      JOIN ims_mig_conteo_aporte a ON a.inventario_id=l.inventario_id AND a.plan_id=?
      JOIN ims_op_inventario i ON i.id=l.inventario_id`,[planId]);
    exigir(Number(native.filas)===r.filas_preparadas&&Number(native.conteos)===r.conteos_preparados&&Number(native.fuera_estado)===0,'El inventario nativo no coincide con el traslado entregado.');
    if(!aplicar)return {inventarios:Number(tot.inventarios),conteos:Number(tot.conteos),filas:Number(tot.filas),prevalidado:true};
    const ddl=await readFile(new URL('../sql/003_autenticacion.sql',import.meta.url),'utf8');
    for(const sql of ddl.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await c.query(sql);
    await c.beginTransaction();tx=true;
    const [[u]]=await c.execute('SELECT actor_id,correo,nombre,password_hash FROM ims_auth_usuario WHERE correo=? OR actor_id=? FOR UPDATE',[correo,actorId]);
    let repetido=false;
    if(u){
      exigir(u.actor_id===actorId&&u.correo===correo&&u.nombre===nombre&&await verificarPassword(contrasena,u.password_hash),'La cuenta ya existe con otra identidad; no se modifica.');
      const [[a]]=await c.execute('SELECT activo FROM ims_op_actor WHERE id=? FOR SHARE',[actorId]);
      exigir(Number(a?.activo)===1,'El actor existente está desactivado; no se reactiva automáticamente.');
      repetido=true;
    }else{
      const [[a]]=await c.execute('SELECT id FROM ims_op_actor WHERE id=? FOR UPDATE',[actorId]);
      exigir(!a,'Actor existente sin credencial del piloto.');
      await c.execute('INSERT INTO ims_op_actor (id,activo) VALUES (?,1)',[actorId]);
      await c.execute('INSERT INTO ims_auth_usuario (actor_id,correo,nombre,password_hash) VALUES (?,?,?,?)',[actorId,correo,nombre,hash]);
      await c.execute(`INSERT INTO ims_op_permiso (actor_id,inventario_id,cliente_id,puede_contar)
        SELECT ?,ic.inventario_id,ic.cliente_id,0 FROM ims_op_inventario_cliente ic
        JOIN ims_mig_conteo_aporte a ON a.inventario_id=ic.inventario_id WHERE a.plan_id=?`,[actorId,planId]);
    }
    const [[per]]=await c.execute(`SELECT COUNT(*) AS permisos,COUNT(DISTINCT p.inventario_id) AS conteos,
      COALESCE(SUM(p.puede_contar<>0 OR a.inventario_id IS NULL),0) AS indebidos FROM ims_op_permiso p
      LEFT JOIN ims_mig_conteo_aporte a ON a.inventario_id=p.inventario_id AND a.plan_id=? WHERE p.actor_id=?`,[planId,actorId]);
    const [[esperados]]=await c.execute(`SELECT COUNT(*) AS n FROM ims_op_inventario_cliente ic
      JOIN ims_mig_conteo_aporte a ON a.inventario_id=ic.inventario_id WHERE a.plan_id=?`,[planId]);
    exigir(Number(per.conteos)===r.conteos_preparados&&Number(per.indebidos)===0&&Number(per.permisos)===Number(esperados.n),'Los permisos no corresponden al lector del plan; no se amplían automáticamente.');
    await c.commit();tx=false;
    return {usuario_preparado:true,yaPreparado:repetido,solo_lectura:true,conteos:Number(per.conteos),permisos:Number(per.permisos),filas:r.filas_preparadas};
  }finally{
    if(tx)await c.rollback();
    if(locked)await c.execute('SELECT RELEASE_LOCK(?)',[lock]);
  }
}
async function main(){
  exigir(process.argv.length===3&&['--validar','--preparar'].includes(process.argv[2]),'Uso interno desde preparar_piloto.py.');
  let raw='';for await(const part of process.stdin){raw+=part;exigir(raw.length<=8192,'Solicitud excesiva.');}
  const s=JSON.parse(raw),mysql=await import('mysql2/promise');
  const config=databaseConfig(s.migracion);
  exigir(config.database==='centromando_ims_ensayo'&&config.user==='ims_cm_migracion','Cuenta de migración incompatible.');
  const c=await mysql.createConnection(config);
  try{
    const [[who]]=await c.query('SELECT CURRENT_USER() AS usuario');
    exigir(who.usuario==='ims_cm_migracion@127.0.0.1','La sesión no utiliza la cuenta exclusiva de migración.');
    console.log(JSON.stringify({ok:true,...await prepararLector({connection:c,...s.lector,aplicar:process.argv[2]==='--preparar'})}));
  }
  finally{await c.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{
  console.error('Preparación del lector detenida. No se reemplazan cuentas existentes ni se publican credenciales.');process.exitCode=1;
});
