import {exigirOperacion as exigir} from '../dominio/operacion.mjs';
/** La visibilidad se resuelve en el servidor. Un rol del inventario no eleva el rol del Centro. */
export async function politicaConteo(c,p,{perfiles=[],mostrar_depot=false,esNativo=true}={}){
 const habilitado=mostrar_depot===true||mostrar_depot===1||mostrar_depot==='1';
 const supervisor=perfiles.length>0&&perfiles.every(r=>r.rol==='SUPERVISOR');let coordinador=supervisor;
 if(p.centroHabilitado){const [[cm]]=await c.execute('SELECT rol FROM ims_cm_perfil WHERE actor_id=? FOR SHARE',[p.actorId]);exigir(cm,'SIN_PERMISO','Perfil del Centro no autorizado.');coordinador=supervisor&&['ADMIN','COORDINADOR'].includes(cm.rol);}
 const puedeVerTeorico=esNativo&&(p.centroHabilitado?coordinador||habilitado:perfiles.length>0&&!perfiles.some(r=>r.rol==='OPERADOR')||habilitado);
 return {conteoCiego:!puedeVerTeorico,puedeVerTeorico:!!puedeVerTeorico,puedeConfigurarCantidades:!!coordinador,puedeAjustar:!!coordinador};
}
