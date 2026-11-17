import {rutaDestino} from '../../public/ruta-destino.mjs';
import {uuidEstable} from '../migracion/modelo.mjs';
import {exigir} from './dominio.mjs';
export async function asegurarDestino(c,{sede,fechaInicio,clienteId}){
 const [[cli]]=await c.execute('SELECT nombre FROM ims_op_cliente WHERE id=?',[clienteId]);exigir(cli,'SOLICITUD_INVALIDA','Cliente principal no válido.');
 let ruta;try{ruta=rutaDestino(sede,fechaInicio,cli.nombre);}catch{exigir(false,'SOLICITUD_INVALIDA','Fecha o destino no válidos.');}
 let padre=null;for(let i=0;i<ruta.length;i++){const id=uuidEstable('cm-destino-v1',[sede,...ruta.slice(1,i+1).map((v,j)=>j===2?clienteId:v)]);const [[prev]]=await c.execute('SELECT padre_id,sede FROM ims_cm_carpeta WHERE id=?',[id]);if(prev)exigir(prev.padre_id===padre&&prev.sede===sede,'SOLICITUD_INVALIDA','La carpeta destino requiere revisión.');else await c.execute('INSERT IGNORE INTO ims_cm_carpeta(id,padre_id,sede,nombre) VALUES (?,?,?,?)',[id,padre,sede,ruta[i]]);padre=id;}
 return {carpetaId:padre,ruta};
}
