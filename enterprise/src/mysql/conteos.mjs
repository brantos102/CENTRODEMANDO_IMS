import {randomUUID} from 'node:crypto';
import {ErrorConteo,normalizarSolicitud,prepararCambio} from '../dominio/conteo.mjs';

function exigir(ok,codigo,mensaje){if(!ok)throw new ErrorConteo(codigo,mensaje);}
export async function crearPoolConteos(env){
  const {databaseConfig}=await import('../../tools/importar-snapshot.mjs');
  const mysql=await import('mysql2/promise');
  return mysql.createPool({...databaseConfig(env),connectionLimit:5,queueLimit:50,waitForConnections:true});
}

/** Módulo interno, NO endpoint HTTP. principal debe venir de la sesión validada
 * por el futuro adaptador de autenticación, nunca de req.body ni de localStorage.
 * La base vuelve a comprobar actor y permiso para cada operación/reintento.
 */
export async function guardarConteo({pool,principal,solicitud}){
  exigir(principal?.actorId,'NO_AUTENTICADO','Se requiere una sesión validada.');
  const {payload:p,hash}=normalizarSolicitud(principal.actorId,solicitud);
  for(let intento=0;intento<3;intento++){
    const c=await pool.getConnection();let abierta=false,confirmando=false,destruir=false;
    try{
      const [[db]]=await c.query('SELECT DATABASE() AS nombre, CURRENT_USER() AS usuario');
      exigir(/^centromando_ims(?:_[a-z0-9_]+)?$/.test(db.nombre||'')&&db.nombre.length<=64&&!/^root@/i.test(db.usuario||''),
        'BASE_NO_PERMITIDA','Se requiere base y usuario exclusivos de Centro de Mando.');
      await c.query("SET time_zone = '+00:00'");
      await c.beginTransaction();abierta=true;
      const [[actor]]=await c.execute('SELECT activo FROM ims_op_actor WHERE id=? FOR SHARE',[p.actorId]);
      exigir(actor&&Number(actor.activo)===1,'SIN_PERMISO','Acceso no autorizado.');
      // Bloqueo compartido: cierre no puede adelantarse al conteo; líneas distintas
      // pueden avanzar en paralelo dentro de un inventario.
      const [[inv]]=await c.execute('SELECT estado FROM ims_op_inventario WHERE id=? FOR SHARE',[p.inventarioId]);
      exigir(inv,'SIN_PERMISO','Acceso no autorizado.');
      const [[linea]]=await c.execute('SELECT * FROM ims_op_linea WHERE id=? AND inventario_id=? FOR UPDATE',[p.lineaId,p.inventarioId]);
      exigir(linea,'SIN_PERMISO','Acceso no autorizado.');
      const [[permiso]]=await c.execute('SELECT puede_contar FROM ims_op_permiso WHERE actor_id=? AND inventario_id=? AND cliente_id=? FOR SHARE',
        [p.actorId,p.inventarioId,linea.cliente_id]);
      exigir(permiso&&Number(permiso.puede_contar)===1,'SIN_PERMISO','Acceso no autorizado.');
      const [[previa]]=await c.execute('SELECT payload_sha256,resultado FROM ims_op_operacion WHERE actor_id=? AND operacion_id=? FOR UPDATE',[p.actorId,p.operacionId]);
      if(previa){
        exigir(previa.payload_sha256===hash,'OPERACION_REUTILIZADA','El identificador ya pertenece a otra solicitud.');
        const resultado=JSON.parse(previa.resultado);
        await c.rollback();abierta=false;
        return {...resultado,repetida:true};
      }
      exigir(inv.estado==='EN_PROCESO','INVENTARIO_NO_EDITABLE','El inventario no está abierto para conteo.');
      const {antes,despues,target}=prepararCambio(linea,p);
      const resultado={ok:true,operacionId:p.operacionId,inventarioId:p.inventarioId,lineaId:p.lineaId,
        clienteId:linea.cliente_id,sku:linea.sku,etapa:p.etapa,cantidad:p.cantidad,version:despues.version};
      // target proviene exclusivamente de una lista fija del dominio.
      const [updated]=await c.execute(`UPDATE ims_op_linea SET ${target}=?,version=?,observacion=?,nueva_posicion=? WHERE id=? AND version=?`,
        [p.cantidad,despues.version,despues.observacion,despues.nueva_posicion,p.lineaId,p.versionEsperada]);
      exigir(updated.affectedRows===1,'VERSION_DESACTUALIZADA','La línea cambió; actualiza antes de contar.');
      await c.execute('INSERT INTO ims_op_operacion (actor_id,operacion_id,inventario_id,linea_id,payload_sha256,resultado) VALUES (?,?,?,?,?,?)',
        [p.actorId,p.operacionId,p.inventarioId,p.lineaId,hash,JSON.stringify(resultado)]);
      await c.execute('INSERT INTO ims_op_auditoria (id,actor_id,operacion_id,antes,despues) VALUES (?,?,?,?,?)',
        [randomUUID(),p.actorId,p.operacionId,JSON.stringify(antes),JSON.stringify(despues)]);
      confirmando=true;await c.commit();confirmando=false;abierta=false;
      return {...resultado,repetida:false};
    }catch(error){
      if(abierta){try{await c.rollback();}catch{destruir=true;}abierta=false;}
      if(confirmando){
        destruir=true;
        throw new ErrorConteo('CONFIRMACION_PENDIENTE','No se pudo confirmar la respuesta; reintenta con el mismo identificador de operación.',{cause:error});
      }
      if(error instanceof ErrorConteo)throw error;
      // La unicidad protege operaciones que compiten en líneas distintas.
      // Siempre se revierte la transacción completa antes de volver a leer.
      if(['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT','ER_DUP_ENTRY'].includes(error.code)&&intento<2)continue;
      throw new ErrorConteo('GUARDADO_RECHAZADO','No se guardó la operación. Reintenta con su mismo identificador.',{cause:error});
    }finally{
      if(destruir)c.destroy();else c.release();
    }
  }
}
