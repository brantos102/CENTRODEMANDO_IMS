import {ErrorAuth,correoCanonico,crearHashPassword,verificarPassword,sha256,tokenOpaco,tokenValido} from './credenciales.mjs';

let hashDesconocido;
function dummyHash(){return hashDesconocido??=crearHashPassword('CUENTA_SINTETICA_SIN_ACCESO_'+tokenOpaco());}
async function limitarIntento(pool,correo){
  const clave=sha256('ims-login:'+correo);
  await pool.execute('DELETE FROM ims_auth_limite WHERE vence_en<=UTC_TIMESTAMP(6) LIMIT 1000');
  await pool.execute(`INSERT INTO ims_auth_limite (clave,intentos,vence_en) VALUES (?,1,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 2 MINUTE))
    ON DUPLICATE KEY UPDATE intentos=IF(vence_en<=UTC_TIMESTAMP(6),1,intentos+1),
    vence_en=IF(vence_en<=UTC_TIMESTAMP(6),DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 2 MINUTE),vence_en)`,[clave]);
  const [[row]]=await pool.execute('SELECT intentos FROM ims_auth_limite WHERE clave=?',[clave]);
  if(Number(row.intentos)>5)throw new ErrorAuth('INTENTOS_AGOTADOS','Intenta de nuevo dentro de dos minutos.',429);
  return clave;
}
export async function iniciarSesion(pool,{correo,contrasena}){
  correo=correoCanonico(correo);
  if(typeof contrasena!=='string'||Buffer.byteLength(contrasena,'utf8')>1024)
    throw new ErrorAuth('CREDENCIALES_INVALIDAS','Credenciales inválidas.');
  const clave=await limitarIntento(pool,correo);
  const [[u]]=await pool.execute('SELECT actor_id,password_hash,version FROM ims_auth_usuario WHERE correo=?',[correo]);
  const hash=u?.password_hash||await dummyHash();
  const valido=await verificarPassword(contrasena,hash);
  if(!u||!valido)throw new ErrorAuth('CREDENCIALES_INVALIDAS','Credenciales inválidas.');
  const token=tokenOpaco(),csrf=tokenOpaco(),c=await pool.getConnection();let abierta=false,destruir=false;
  try{
    await c.beginTransaction();abierta=true;
    const [[actor]]=await c.execute('SELECT activo FROM ims_op_actor WHERE id=? FOR SHARE',[u.actor_id]);
    const [[actual]]=await c.execute('SELECT nombre,correo,password_hash,version FROM ims_auth_usuario WHERE actor_id=? FOR SHARE',[u.actor_id]);
    if(!actor?.activo||!actual||actual.password_hash!==hash||String(actual.version)!==String(u.version))
      throw new ErrorAuth('CREDENCIALES_INVALIDAS','Credenciales inválidas.');
    await c.execute(`INSERT INTO ims_auth_sesion (sesion_hash,actor_id,usuario_version,csrf_token,expira_en,creado_en)
      VALUES (?,?,?,?,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 8 HOUR),UTC_TIMESTAMP(6))`,[sha256(token),u.actor_id,u.version,csrf]);
    await c.execute('DELETE FROM ims_auth_limite WHERE clave=?',[clave]);
    await c.commit();abierta=false;
    return {token,csrf,usuario:{actorId:u.actor_id,correo:actual.correo,nombre:actual.nombre}};
  }finally{
    if(abierta){try{await c.rollback();}catch{destruir=true;}}
    if(destruir)c.destroy();else c.release();
  }
}
export async function autenticar(pool,token){
  if(!tokenValido(token))throw new ErrorAuth('NO_AUTENTICADO','Inicia sesión para continuar.');
  const sesionHash=sha256(token);
  const [[u]]=await pool.execute(`SELECT s.actor_id,s.csrf_token,u.correo,u.nombre FROM ims_auth_sesion s
    JOIN ims_auth_usuario u ON u.actor_id=s.actor_id AND u.version=s.usuario_version
    JOIN ims_op_actor a ON a.id=u.actor_id AND a.activo=1
    WHERE s.sesion_hash=? AND s.revocada=0 AND s.expira_en>UTC_TIMESTAMP(6)`,[sesionHash]);
  if(!u)throw new ErrorAuth('NO_AUTENTICADO','Inicia sesión para continuar.');
  return {actorId:u.actor_id,sesionHash,csrf:u.csrf_token,usuario:{actorId:u.actor_id,correo:u.correo,nombre:u.nombre}};
}
export async function cerrarSesion(pool,principal){
  await pool.execute('UPDATE ims_auth_sesion SET revocada=1 WHERE sesion_hash=? AND actor_id=?',[principal.sesionHash,principal.actorId]);
}
