import {permisosEquipo} from './servicio.mjs';
import {readFile} from 'node:fs/promises';
import {randomBytes,createHash,scrypt as scryptCb} from 'node:crypto';
import {promisify} from 'node:util';
import {normalizar,uuidEstable} from '../migracion/modelo.mjs';
import {correoCanonico} from '../auth/credenciales.mjs';
import {hash,exigir,normal,MESES} from './dominio.mjs';
const scrypt=promisify(scryptCb),parse=x=>typeof x==='string'?JSON.parse(x):x;
const cv=(r,col)=>r.celdas.find(c=>c.columna===col);
const valor=(r,col)=>String(cv(r,col)?.valor??'').trim();
function fechaCelda(r,col){
 const c=cv(r,col),v=c?.valor;if(v===null||v===undefined||v==='')return null;
 if(c.tipo==='d')return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guayaquil',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
 if(c.tipo==='n'&&/^\d+(\.\d+)?$/.test(v)){const n=Number(v);if(n>0&&n<110000)return new Date(Date.UTC(1899,11,30)+Math.floor(n)*86400000).toISOString().slice(0,10);}
 if(/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(v))return v.slice(0,10);
 const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);if(m){const f=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');if(new Date(f+'T12:00Z').toISOString().slice(0,10)===f)return f;}return null;
}
const esSensible=n=>/CREDENCIAL|PASSWORD|CONTRASENA|TOKEN|SECRET/.test(normalizar(n));
export function sanearFila(row,nombre){
 if(normalizar(nombre)==='USUARIOS')return {...row,celdas:row.celdas.filter(c=>c.columna!==9)};
 return row;
}
export function claseHoja(nombre){const n=normalizar(nombre);if(n==='USUARIOS')return 'USUARIOS';if(n==='PANELDECONTROL')return 'PANEL';if(n==='EQUIPOTAREA'||n==='EQUIPOSTAREA'||n==='EQUIPOOPERATIVO')return 'EQUIPO';if(n.includes('CRONOGRAMA')&&!n.includes('CODIGO'))return 'CRONOGRAMA';if(n.includes('CODIGO')&&n.includes('CRON'))return 'CODIGOS';if(n==='LOGUSUARIOS')return 'LOG';return 'CONSERVADO';}
export function proyectarEvento(r,fuente,fuentes=[]){
 if(r.fila<9||!valor(r,5))return null;
 const f=fechaCelda(r,12);if(!f)return {incidencia:'EVENTO_SIN_FECHA',fila:r.fila};
 const referencia=valor(r,17)+' '+String(cv(r,17)?.formula??''),estado=normal(valor(r,13)),sede=/GYE|GUAYAQUIL/.test(normal(fuente.nombre))?'GYE':'UIO',drive=referencia.match(/(?:\/d\/|id=)([a-zA-Z0-9_-]{20,120})/);
 const prefijo=fuente.clave.split(':').slice(0,2).join(':')+':',panel=fuentes.find(f=>f.clave.startsWith(prefijo)&&normalizar(f.nombre)==='PANELDECONTROL'&&f.completa),fechaChip=referencia.match(/(?:^|[\s·])(\d{1,2}\/\d{1,2}\/\d{4})(?=$|\s)/),dia=fechaChip?fechaCelda({celdas:[{columna:1,tipo:'s',valor:fechaChip[1]}]},1):null,coinciden=panel?.filas.filter(p=>p.fila>1&&normal(valor(p,1))===normal(valor(r,5))&&dia&&fechaCelda(p,4)===dia)||[],ids=[...new Set(coinciden.map(p=>valor(p,3)).filter(Boolean))];
 const archivo=drive?.[1]||(panel?.filas.some(p=>valor(p,3)===valor(r,17))?valor(r,17):ids.length===1?ids[0]:'');
 return {id:uuidEstable('cm-evento',[fuente.clave,r.fila]),sede,cliente:valor(r,5),titulo:valor(r,4)||valor(r,5),categoria:valor(r,6),frecuencia:valor(r,8),prioridad:['Baja','Media','Alta','Urgente'].find(p=>normal(p)===normal(valor(r,10)))||'Media',observacion:valor(r,11),fecha_inicio:f,fecha_fin:fechaCelda(r,14),duracion:Math.max(1,Math.min(3660,Math.trunc(Number(valor(r,15)))||1)),estado:estado==='ENTREGADO'?'Entregado':['EN PROCESO','EN CURSO','INICIADO'].includes(estado)?'En curso':estado==='PAUSADO'?'Pausado':'Pendiente',avance:estado==='ENTREGADO'?'100':String(Math.max(0,Math.min(100,Number(valor(r,16))||0))),responsable_nombre:valor(r,9),archivo_drive:archivo,origen:fuente.clave,origen_fila:r.fila};
}
export async function fuentesSQL(c){
 const [hojas]=await c.execute(`SELECT h.*,s.creado_en FROM ims_snapshot_hoja h JOIN ims_snapshot s ON s.snapshot_id=h.snapshot_id WHERE s.estado='VERIFICADO' ORDER BY s.creado_en DESC,h.hoja`);
 const vistas=new Set(),fuentes=[];
 for(const h of hojas){const key=normalizar(h.hoja);if(vistas.has(key)||!['USUARIOS','PANEL','EQUIPO','CRONOGRAMA','CODIGOS'].includes(claseHoja(h.hoja))||esSensible(h.hoja))continue;vistas.add(key);
 const [rs]=await c.execute('SELECT numero_fila,contenido FROM ims_snapshot_fila WHERE snapshot_id=? AND hoja=? ORDER BY numero_fila',[h.snapshot_id,h.hoja]);
 exigir(rs.length===Number(h.filas),'GUARDADO_RECHAZADO','El respaldo administrativo SQL está incompleto.');
 exigir(createHash('sha256').update(rs.map(r=>r.contenido+'\n').join('')).digest('hex')===h.sha256,'GUARDADO_RECHAZADO','La copia administrativa SQL no coincide con su huella.');const filas=rs.map(r=>parse(r.contenido));fuentes.push({clave:'snapshot:'+h.snapshot_id+':'+h.hoja,nombre:h.hoja,completa:true,sha256:h.sha256,filas,prioridad:1});
 }return fuentes;
}
const claveNombre=s=>normal(s).split(/\s+/).sort().join(' ');
function rolWmsLegado(r,rol){const v=normal(valor(r,8));return v?(['ADMIN','OPERADOR','AUDITOR','TEMPORAL'].includes(v)?v:'AUDITOR'):['COORDINADOR','LIDER'].includes(rol)?'ADMIN':'OPERADOR';}
function rolLegado(r){const n=normal(r);return n==='ADMIN'?'ADMIN':n==='COORDINADOR'?'COORDINADOR':n.includes('LIDER')?'LIDER':n==='AUDITOR'?'AUDITOR':'OPERARIO';}
export async function importarCentro(c,fuentes,{actorInicial}){
 exigir(fuentes.every(f=>f.clave&&Array.isArray(f.filas)&&f.sha256&&typeof f.completa==='boolean'));
 fuentes.sort((a,b)=>b.prioridad-a.prioridad);
 const resumen={fuentes:0,filasConservadas:0,eventos:0,panel:0,usuariosNuevos:0,usuariosExistentesConservados:0,usuariosSinClave:0,alcanceRolesOriginales:'GLOBAL_UIO_GYE',incidencias:[],sinNuevaExtraccionGoogle:true};
 const nombres=new Set(),nuevasFuentes=new Set(),nuevosActores=new Set();
 await c.beginTransaction();
 try{
  // La cuenta actual y su contraseña nunca se sustituyen por datos del respaldo.
  const [[admin]]=await c.execute('SELECT actor_id FROM ims_auth_usuario WHERE actor_id=?',[actorInicial]);exigir(admin,'GUARDADO_RECHAZADO','La cuenta inicial no coincide.');
  await c.execute("INSERT IGNORE INTO ims_cm_perfil(actor_id,rol,rol_wms) VALUES (?,'ADMIN','ADMIN')",[actorInicial]);
  const [ambitos]=await c.execute('SELECT actor_id,sede,rol FROM ims_nat_ambito');for(const a of ambitos){await c.execute('INSERT IGNORE INTO ims_cm_perfil(actor_id,rol) VALUES (?,?)',[a.actor_id,a.rol==='ADMIN'?'ADMIN':'LIDER']);await c.execute('INSERT IGNORE INTO ims_cm_acceso VALUES (?,?)',[a.actor_id,a.sede]);}
  for(const f of fuentes){
   if(esSensible(f.nombre))continue;
   const clase=claseHoja(f.nombre),name=normalizar(f.nombre);
   if(nombres.has(name))continue;if(f.completa)nombres.add(name);
   const [[old]]=await c.execute('SELECT sha256 FROM ims_cm_fuente WHERE clave=?',[f.clave]);if(old){exigir(old.sha256===f.sha256,'GUARDADO_RECHAZADO','Una fuente administrativa importada cambió.');continue;}
   await c.execute('INSERT INTO ims_cm_fuente(clave,sha256,metadatos,filas) VALUES (?,?,?,?)',[f.clave,f.sha256,JSON.stringify({nombre:f.nombre,clase,completa:f.completa,prioridad:f.prioridad}),f.filas.length]);resumen.fuentes++;nuevasFuentes.add(f.clave);
   // Usuarios se procesan antes de eliminar su contraseña del área de consulta.
   if(clase==='USUARIOS')for(const r of f.filas.filter(x=>x.fila>1)){
    let correo;try{correo=correoCanonico(valor(r,1));}catch{if(valor(r,1))resumen.incidencias.push({clase:'USUARIO_CORREO_INVALIDO',fila:r.fila});continue;}
    const [[oldUser]]=await c.execute('SELECT actor_id FROM ims_auth_usuario WHERE correo=?',[correo]);if(oldUser){resumen.usuariosExistentesConservados++;continue;}
    const id=uuidEstable('cm-usuario',correo),rol=rolLegado(valor(r,3)),activo=!['FALSE','0','NO'].includes(normal(valor(r,5))),pass=valor(r,9),tiene=!!pass&&Buffer.byteLength(pass)<=1024;
    const sal=randomBytes(16),h=await scrypt(tiene?pass:randomBytes(48).toString('hex'),sal,32,{N:32768,r:8,p:1,maxmem:67108864});
    await c.execute('INSERT INTO ims_op_actor VALUES (?,0)',[id]);await c.execute('INSERT INTO ims_auth_usuario(actor_id,correo,nombre,password_hash) VALUES (?,?,?,?)',[id,correo,valor(r,2)||correo,`scrypt$v1$32768$8$1$${sal.toString('hex')}$${h.toString('hex')}`]);
    await c.execute('INSERT INTO ims_cm_perfil(actor_id,rol,rol_wms,telefono,cambiar_clave,activacion_pendiente) VALUES (?,?,?,?,1,?)',[id,rol,rolWmsLegado(r,rol),valor(r,4).slice(0,80),activo&&tiene?1:0]);for(const sede of ['UIO','GYE']){await c.execute('INSERT INTO ims_cm_acceso VALUES (?,?)',[id,sede]);if(['ADMIN','COORDINADOR','LIDER'].includes(rol))await c.execute('INSERT INTO ims_nat_ambito VALUES (?,?,?)',[id,sede,rol==='ADMIN'?'ADMIN':'SUPERVISOR']);}resumen.usuariosNuevos++;nuevosActores.add(id);if(!tiene)resumen.usuariosSinClave++;
   }
   for(let i=0;i<f.filas.length;i+=50){const rs=f.filas.slice(i,i+50);await c.execute('INSERT INTO ims_cm_legado(fuente,fila,clase,contenido) VALUES '+rs.map(()=>'(?,?,?,?)').join(','),rs.flatMap(r=>[f.clave,r.fila,clase,JSON.stringify(sanearFila(r,f.nombre))]));resumen.filasConservadas+=rs.length;}
   if(!f.completa){resumen.incidencias.push({clase:'HOJA_PARCIAL_CONSERVADA',hoja:f.nombre});continue;}
   if(clase==='CRONOGRAMA'){
    // Solo proyecta el contrato B:T conocido. Los demás formatos quedan conservados.
    const h=f.filas.find(r=>r.fila===8);
    if(!h||!normalizar(valor(h,5)).includes('CLIENTE')||!/FECHA|INICIO/.test(normalizar(valor(h,12)))||!normalizar(valor(h,13)).includes('ESTADO')){resumen.incidencias.push({clase:'CRONOGRAMA_FORMATO_DISTINTO_CONSERVADO',hoja:f.nombre});continue;}
    for(const r of f.filas){const e=proyectarEvento(r,f,fuentes);if(!e)continue;if(e.incidencia){resumen.incidencias.push(e);continue;}
     const cols=Object.keys(e);await c.execute(`INSERT INTO ims_cm_evento(${cols.join(',')},creado_por) VALUES (${cols.map(()=>'?').join(',')},?)`,[...cols.map(k=>e[k]),actorInicial]);resumen.eventos++;
    }
   }
   if(clase==='CODIGOS')for(const r of f.filas.filter(x=>x.fila>1&&valor(x,1)&&valor(x,2))){
    const sede=/GYE|GUAYAQUIL/.test(normal(f.nombre))?'GYE':'UIO',meses=Array.from({length:12},(_,i)=>i+1).filter(i=>valor(r,i+3)!=='');
    const id=uuidEstable('cm-codigo',[sede,valor(r,1),valor(r,2)]),[[prev]]=await c.execute('SELECT abc,meses FROM ims_cm_codigo WHERE sede=? AND cliente=? AND sku=?',[sede,valor(r,1),valor(r,2)]);
    const union=[...new Set([...(prev?parse(prev.meses):[]),...meses])].sort((a,b)=>a-b);
    await c.execute('INSERT INTO ims_cm_codigo(id,sede,cliente,sku,abc,meses,origen) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE meses=VALUES(meses)',[id,sede,valor(r,1),valor(r,2),valor(r,3),JSON.stringify(union),f.clave]);
   }
   if(clase==='PANEL')for(const r of f.filas.filter(x=>x.fila>1&&valor(x,1))){
    const id=uuidEstable('cm-panel',[f.clave,r.fila]),drive=valor(r,3),sede=/GYE|GUAYAQUIL/.test(normal(valor(r,6)))?'GYE':'UIO',num=col=>/^\d+(\.\d{1,9})?$/.test(valor(r,col))?valor(r,col):null;
    await c.execute('INSERT INTO ims_cm_panel(id,archivo_drive,cliente,sede,fecha_inicio,fecha_fin,estado,responsable,unidades,referencias,posiciones,datos,origen,origen_fila) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[id,drive,valor(r,1),sede,fechaCelda(r,4),fechaCelda(r,5),valor(r,7),valor(r,9),num(10),/^\d+$/.test(valor(r,11))?valor(r,11):null,/^\d+$/.test(valor(r,12))?valor(r,12):null,JSON.stringify(r),f.clave,r.fila]);resumen.panel++;
   }
  }
  const [sinPerfil]=await c.execute('SELECT u.actor_id FROM ims_auth_usuario u LEFT JOIN ims_cm_perfil p ON p.actor_id=u.actor_id WHERE p.actor_id IS NULL');
  for(const u of sinPerfil){await c.execute("INSERT INTO ims_cm_perfil(actor_id,rol) VALUES (?,'OPERARIO')",[u.actor_id]);await c.execute('INSERT IGNORE INTO ims_cm_acceso(actor_id,sede) SELECT ?,i.sede FROM ims_op_permiso p JOIN ims_op_inventario i ON i.id=p.inventario_id WHERE p.actor_id=? GROUP BY i.sede',[u.actor_id,u.actor_id]);}
  // Las identidades se enlazan solo cuando el nombre canónico es único.
  const [usuarios]=await c.execute('SELECT u.actor_id,u.nombre FROM ims_auth_usuario u JOIN ims_cm_perfil p ON p.actor_id=u.actor_id'),unicos=new Map();for(const u of usuarios){const k=claveNombre(u.nombre);unicos.set(k,unicos.has(k)?null:u.actor_id);}
  const [candidatos]=await c.execute('SELECT id,origen,origen_fila,cliente,titulo,fecha_inicio,responsable_id,responsable_nombre,archivo_drive FROM ims_cm_evento WHERE origen<>\'NATIVO\' AND version=0');const es=candidatos.filter(e=>nuevasFuentes.has(e.origen));
  for(const e of es){const actor=unicos.get(claveNombre(e.responsable_nombre));if(actor){await c.execute('UPDATE ims_cm_evento SET responsable_id=? WHERE id=?',[actor,e.id]);await c.execute("INSERT IGNORE INTO ims_cm_equipo VALUES (?,?,'RESPONSABLE','ACTIVO')",[e.id,actor]);}
   if(e.archivo_drive){const [ids]=await c.execute('SELECT DISTINCT l.inventario_id,n.fecha_inicio FROM ims_op_linea l LEFT JOIN ims_nat_inventario n ON n.inventario_id=l.inventario_id WHERE l.origen_drive=?',[e.archivo_drive]);const seleccion=ids.length<=1||ids.every(x=>!x.fecha_inicio)?ids:ids.filter(x=>x.fecha_inicio===e.fecha_inicio);if(ids.length>1&&!seleccion.length)resumen.incidencias.push({clase:'VINCULO_VARIOS_CONTEOS_REQUIERE_MAPEO',fila:e.origen_fila??null});for(const i of seleccion)await c.execute('INSERT IGNORE INTO ims_cm_vinculo VALUES (?,?)',[e.id,i.inventario_id]);}
  }
  for(const f of fuentes.filter(f=>nuevasFuentes.has(f.clave)&&claseHoja(f.nombre)==='EQUIPO'&&normalizar(f.nombre)==='EQUIPOSTAREA'))for(const r of f.filas.filter(r=>r.fila>1)){
   const correo=valor(r,5).toLowerCase(),fila=Number(valor(r,2));if(!correo||!Number.isInteger(fila))continue;
   const [[u]]=await c.execute('SELECT actor_id FROM ims_auth_usuario WHERE correo=?',[correo]);if(!u)continue;
   const prefijo=f.clave.split(':').slice(0,2).join(':')+':',cron=fuentes.find(x=>x.clave.startsWith(prefijo)&&normalizar(x.nombre)==='CRONOGRAMA2026'&&x.completa),anterior=cron?.filas.find(x=>x.fila===fila),tarea=anterior?proyectarEvento(anterior,cron,fuentes):null;
   const declarada=tarea&&!tarea.incidencia&&(!valor(r,3)||normal(valor(r,3))===normal(tarea.cliente))&&(!valor(r,4)||normal(valor(r,4))===normal(tarea.titulo));
   const evs=declarada?es.filter(e=>normal(e.cliente)===normal(tarea.cliente)&&normal(e.titulo)===normal(tarea.titulo)&&e.fecha_inicio===tarea.fecha_inicio&&(!e.archivo_drive||!tarea.archivo_drive||e.archivo_drive===tarea.archivo_drive)):[];
   if(evs.length!==1){resumen.incidencias.push({clase:'EQUIPO_REQUIERE_MAPEO',fila:r.fila});continue;}
   const papel=normal(valor(r,7))==='RESPONSABLE'?'RESPONSABLE':'APOYO',st=normal(valor(r,8)),estado=['ACTIVO','FINALIZADO','EXCLUIDO','EVENTO_ELIMINADO'].includes(st)?st:st?'EXCLUIDO':'ACTIVO';
   await c.execute('INSERT INTO ims_cm_equipo VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE papel=VALUES(papel),estado=VALUES(estado)',[evs[0].id,u.actor_id,papel,estado]);
  }
  for(const e of es){if(!e.responsable_id){const [rs]=await c.execute("SELECT actor_id FROM ims_cm_equipo WHERE evento_id=? AND papel='RESPONSABLE' AND estado='ACTIVO'",[e.id]);if(rs.length===1)await c.execute('UPDATE ims_cm_evento SET responsable_id=? WHERE id=?',[rs[0].actor_id,e.id]);}await permisosEquipo(c,e.id);}
  // El Rol WMS explícito de USUARIOS tenía alcance sobre los archivos de la sede.
  // Conserva lectura histórica; solo los conteos nativos reciben captura.
  const [legados]=await c.execute("SELECT p.actor_id,p.rol_wms,ac.sede FROM ims_cm_perfil p JOIN ims_cm_acceso ac ON ac.actor_id=p.actor_id WHERE p.cambiar_clave=1");
  for(const u of legados.filter(u=>nuevosActores.has(u.actor_id))){const [is]=await c.execute('SELECT i.id,n.inventario_id nativo,ic.cliente_id FROM ims_op_inventario i JOIN ims_op_inventario_cliente ic ON ic.inventario_id=i.id LEFT JOIN ims_nat_inventario n ON n.inventario_id=i.id WHERE i.sede=?',[u.sede]);for(const i of is){const rol=u.rol_wms==='ADMIN'?'SUPERVISOR':u.rol_wms==='OPERADOR'?'OPERADOR':'AUDITOR';await c.execute('INSERT IGNORE INTO ims_op_permiso VALUES (?,?,?,?)',[u.actor_id,i.id,i.cliente_id,i.nativo&&rol!=='AUDITOR'?1:0]);if(i.nativo)await c.execute('INSERT IGNORE INTO ims_nat_perfil VALUES (?,?,?,?)',[u.actor_id,i.id,i.cliente_id,rol]);}}
  for(const sede of ['UIO','GYE'])for(const n of ['ITSANET '+sede+' - INVENTARIOS CICLICOS','ITSANET '+sede+' - SLOTTING'])await c.execute('INSERT IGNORE INTO ims_cm_carpeta(id,padre_id,sede,nombre) VALUES (?,NULL,?,?)',[uuidEstable('cm-carpeta',[sede,n]),sede,n]);
  await c.commit();return {ok:true,...resumen,cuentasExistentesModificadas:false,existenciasModificadas:false};
 }catch(e){await c.rollback();throw e;}
}
