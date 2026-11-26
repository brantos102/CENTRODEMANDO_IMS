import {exigir,uuid,texto} from './dominio.mjs';
export const MODULOS_UI=['centro','conteo','crear','gestion','stock','ubicaciones','usuarios','analitica','reportes','series','adicionales','mapa','notificaciones'];
export const ROLES_UI=['COORDINADOR','LIDER','OPERARIO','AUDITOR'];
const objeto=x=>x&&typeof x==='object'&&!Array.isArray(x);
function reglas(x={}){exigir(objeto(x)&&Object.keys(x).every(k=>MODULOS_UI.includes(k)&&typeof x[k]==='boolean'),'SOLICITUD_INVALIDA','Revisa los módulos y sus casillas.');return {...x};}
export function validarPoliticaUI(s){
 exigir(objeto(s));const roles={},usuarios={},grupos=[];
 exigir(Object.keys(s).every(k=>['roles','usuarios','grupos','correo'].includes(k)));
 for(const [r,v]of Object.entries(s.roles||{})){exigir(ROLES_UI.includes(r));roles[r]=reglas(v);}
 exigir(Object.keys(s.usuarios||{}).length<=1000);for(const [id,v]of Object.entries(s.usuarios||{}))usuarios[uuid(id)]=reglas(v);
 exigir(Array.isArray(s.grupos||[])&&(s.grupos||[]).length<=50);for(const g of s.grupos||[]){exigir(objeto(g)&&Array.isArray(g.miembros)&&g.miembros.length<=1000);grupos.push({id:uuid(g.id),nombre:texto(g.nombre,100,true),miembros:[...new Set(g.miembros.map(uuid))],modulos:reglas(g.modulos)});}
 exigir(new Set(grupos.map(g=>g.id)).size===grupos.length);const correo={dias:3,asunto:'Próximo inventario · {cliente}',introduccion:'Tienes un inventario programado. Revisa el equipo y prepara el conteo.'};
 if(s.correo){exigir(Number.isInteger(s.correo.dias)&&s.correo.dias>=0&&s.correo.dias<=30);correo.dias=s.correo.dias;correo.asunto=texto(s.correo.asunto,160,true);correo.introduccion=texto(s.correo.introduccion,1500,true);exigir(!/[\r\n]/.test(correo.asunto),'SOLICITUD_INVALIDA','El asunto debe estar en una sola línea.');}
 return {roles,usuarios,grupos,correo};
}
export async function leerPoliticaUI(c){const [[r]]=await c.execute('SELECT version,datos FROM ims_cm_politica_ui WHERE id=1');return {version:String(r?.version||0),politica:validarPoliticaUI(r?(typeof r.datos==='string'?JSON.parse(r.datos):r.datos):{})};}
export function modulosEfectivos(politica,rol,actor){const out=Object.fromEntries(MODULOS_UI.map(k=>[k,true]));if(rol==='ADMIN')return out;Object.assign(out,politica.roles[rol]||{});for(const g of politica.grupos)if(g.miembros.includes(actor))for(const [k,v]of Object.entries(g.modulos))if(v===false)out[k]=false;Object.assign(out,politica.usuarios[actor]||{});return out;}
export function moduloRuta(path,method){
 if(path.startsWith('/api/conteos'))return 'conteo';
 if(/^\/api\/erp\//.test(path))return 'stock';
 if(/^\/api\/operacion(?:\/|$)/.test(path)){if(/\/(serie(?:\/consultar)?|series)$/.test(path))return 'series';if(/\/(hallazgo|hallazgos)$/.test(path))return 'adicionales';if(path.endsWith('/analisis'))return 'analitica';if(path.endsWith('/avance'))return null;if(path==='/api/operacion'||/^\/api\/operacion\/inventarios\/[a-f0-9-]+$/.test(path))return null;return 'gestion';}
 const r=path.replace('/api/centro/','');if(r==='perfil'||r==='clave'||r==='contexto'||r==='politica-ui')return null;
 if(r==='documentos-inventario')return 'reportes';if(/^inventarios\/[^/]+\/(excel|csv|pdf)$/.test(r)||r.startsWith('clientes/'))return 'reportes';
 if(r==='inventarios'||r==='carpeta')return 'crear';if(r.startsWith('usuario'))return 'usuarios';if(r==='analitica')return 'analitica';if(r.startsWith('catalogos')||r==='layout')return 'ubicaciones';if(r==='mapa-inventario')return 'mapa';if(r==='recordatorio-destinatarios')return 'notificaciones';if(['dashboard','eventos'].includes(r))return 'centro';return null;
}
