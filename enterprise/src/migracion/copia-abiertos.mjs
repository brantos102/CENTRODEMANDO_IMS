import {createHash} from 'node:crypto';
import {lstat,readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {records,hashFile} from '../../tools/importar-snapshot.mjs';

const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const ARCHIVOS=['lineas_candidatas_NO_IMPORTAR.jsonl','filas_auxiliares_NO_IMPORTAR.jsonl','esquemas_NO_COMPARTIR.json'];
const TIPOS=['PRODUCTO','AUXILIAR'];
const AMBITOS=['SELECCION_ACTUAL','FUERA_SELECCION_CONSERVADO'];
const sha=s=>createHash('sha256').update(s).digest('hex');
export class ErrorCopiaAbiertos extends Error{
 constructor(codigo){super('La copia privada de revisión no se confirmó. Conserva el paquete original.');this.codigo=codigo;}
}
const MYSQL_SEGUROS=new Set(['ER_ACCESS_DENIED_ERROR','ER_DBACCESS_DENIED_ERROR','ER_TABLEACCESS_DENIED_ERROR','ER_CANNOT_USER','ER_DUP_ENTRY','ER_LOCK_WAIT_TIMEOUT','ER_LOCK_DEADLOCK','ER_NET_PACKET_TOO_LARGE','ER_USER_LIMIT_REACHED','ER_CON_COUNT_ERROR','ER_PARSE_ERROR','ER_CHECK_CONSTRAINT_VIOLATED']);
export const codigoMysqlSeguro=error=>MYSQL_SEGUROS.has(error?.codigoMysql)?error.codigoMysql:MYSQL_SEGUROS.has(error?.code)?error.code:undefined;
const exigir=(v,c='PAQUETE_INCOMPATIBLE')=>{if(!v)throw new ErrorCopiaAbiertos(c);};
async function privado(file,max=512*1024*1024){
 const st=await lstat(file);exigir(st.isFile()&&!st.isSymbolicLink()&&st.size<=max&&(st.mode&0o777)===0o600&&st.uid===process.getuid());return st;
}
function filaPreparada(row,tipo,corte){
 const o=row?.origen;
 exigir(AMBITOS.includes(row?.ambito)&&o&&UUID.test(o.corte_id||'')&&/^[A-Za-z0-9_-]{20,120}$/.test(o.origen_drive||'')&&Number.isInteger(o.hoja_id)&&Number.isInteger(o.fila)&&o.fila>1);
 exigir(row.ambito!=='SELECCION_ACTUAL'||o.corte_id===corte);
 exigir(row.fila_original?.fila===o.fila&&Array.isArray(row.fila_original.celdas));
 const ref=sha(JSON.stringify([row.ambito,o.corte_id,o.origen_drive,o.hoja_id,o.fila]));
 if(tipo==='PRODUCTO')exigir(row.aprobado_para_importar===false&&row.referencia_copia===ref&&typeof row.sku_propuesto==='string'&&row.sku_propuesto.length>0&&row.cantidades);
 return ref;
}
export async function validarPaqueteAbiertos(directorio){
 const dir=path.resolve(directorio),st=await lstat(dir);
 exigir(await realpath(dir)===dir&&st.isDirectory()&&(st.mode&0o777)===0o700&&st.uid===process.getuid());
 const file=path.join(dir,'preparacion_NO_IMPORTAR.json');await privado(file,1024*1024);
 const raw=await readFile(file,'utf8'),m=JSON.parse(raw);
 exigir(m.formato==='ims-abiertos-preparacion-privada-v1'&&UUID.test(m.corte_id||'')&&SHA.test(m.sha256_zip||'')&&m.aprobado_para_importar===false);
 exigir(m.archivos_sha256&&JSON.stringify(Object.keys(m.archivos_sha256).sort())===JSON.stringify([...ARCHIVOS].sort()));
 exigir(typeof m.archivo_zip==='string'&&path.isAbsolute(m.archivo_zip)&&await realpath(m.archivo_zip)===m.archivo_zip&&m.archivo_zip.endsWith('.zip'));
 await privado(m.archivo_zip);exigir(await hashFile(m.archivo_zip)===m.sha256_zip,'ZIP_ALTERADO');
 for(const n of ARCHIVOS){await privado(path.join(dir,n),n.endsWith('.json')?16*1024*1024:512*1024*1024);exigir(SHA.test(m.archivos_sha256[n]||'')&&await hashFile(path.join(dir,n))===m.archivos_sha256[n],'PREPARACION_ALTERADA');}
 const esquemas=await readFile(path.join(dir,ARCHIVOS[2]),'utf8');exigir(Array.isArray(JSON.parse(esquemas)));
 const referencias=new Set(),cantidades=[0,0],ambitos=Object.fromEntries(AMBITOS.map(a=>[a,{productos:0,auxiliares:0}]));let maxLinea=0;
 for(let i=0;i<2;i++)for await(const {raw:line,row} of records(path.join(dir,ARCHIVOS[i]))){
  maxLinea=Math.max(maxLinea,Buffer.byteLength(line));exigir(maxLinea<=512*1024,'REGISTRO_EXCESIVO');
  const ref=filaPreparada(row,TIPOS[i],m.corte_id);exigir(!referencias.has(ref),'FILA_REPETIDA');referencias.add(ref);
  cantidades[i]++;exigir(cantidades[i]<=1000000,'COPIA_EXCESIVA');ambitos[row.ambito][i?'auxiliares':'productos']++;
 }
 return {dir,manifest:m,raw,esquemas,copiaId:sha(raw),cantidades,ambitos,maxLinea};
}
const contrato={
 ims_abiertos_copia:{columnas:{copia_id:'char(64)',corte_id:'char(36)',estado:'varchar(20)',activa:'tinyint unsigned',productos:'int unsigned',auxiliares:'int unsigned',preparacion:'longtext',esquemas:'longtext',creado_en:'timestamp(6)'},unicas:[['copia_id']],checks:["estado IN ('CARGANDO','VERIFICADO')",'activa=0','JSON_VALID(preparacion) AND JSON_VALID(esquemas)']},
 ims_abiertos_copia_fila:{columnas:{copia_id:'char(64)',tipo_registro:'varchar(16)',numero_fila:'int unsigned',referencia_copia:'char(64)',ambito:'varchar(40)',contenido_sha256:'char(64)',contenido:'longtext'},unicas:[['copia_id','tipo_registro','numero_fila'],['copia_id','referencia_copia']],checks:["tipo_registro IN ('PRODUCTO','AUXILIAR')",'numero_fila>0',"ambito IN ('SELECCION_ACTUAL','FUERA_SELECCION_CONSERVADO')",'JSON_VALID(contenido)']}
};
const normal=s=>String(s).toLowerCase().replace(/_utf8mb4/g,'').replace(/\\'/g,"'").replace(/[`\s()]/g,'');
const iguales=(a,b)=>JSON.stringify(a.map(x=>JSON.stringify(x)).sort())===JSON.stringify(b.map(x=>JSON.stringify(x)).sort());
async function destino(c){
 const [[d]]=await c.query('SELECT DATABASE() AS nombre,CURRENT_USER() AS usuario,VERSION() AS version');
 const prueba=/^centromando_ims_pruebas(?:_[a-z0-9]+)?$/.test(d.nombre||'');
 exigir((d.nombre==='centromando_ims_ensayo'||prueba)&&/^8\./.test(d.version||'')&&/^ims_cm_migracion@127\.0\.0\.1$/.test(d.usuario||'')||prueba&&/^8\./.test(d.version||'')&&d.usuario==='ims_cm_migracion@%','DESTINO_NO_PERMITIDO');
 return d.nombre;
}
async function esquema(c){
 for(const [tabla,spec] of Object.entries(contrato)){
  const [[t]]=await c.execute('SELECT ENGINE,TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[tabla]);exigir(t?.ENGINE==='InnoDB'&&t.TABLE_COLLATION==='utf8mb4_0900_bin','ESQUEMA_INCOMPATIBLE');
  const [cols]=await c.execute('SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,CHARACTER_SET_NAME,COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',[tabla]);
  exigir(JSON.stringify(cols.map(x=>x.COLUMN_NAME))===JSON.stringify(Object.keys(spec.columnas)),'ESQUEMA_INCOMPATIBLE');
  for(const col of cols){const ascii=col.COLUMN_TYPE.startsWith('char('),texto=/^(varchar|longtext)/.test(col.COLUMN_TYPE);exigir(col.COLUMN_TYPE===spec.columnas[col.COLUMN_NAME]&&col.IS_NULLABLE==='NO'&&(!ascii||col.CHARACTER_SET_NAME==='ascii'&&col.COLLATION_NAME==='ascii_bin')&&(!texto||col.CHARACTER_SET_NAME==='utf8mb4'&&col.COLLATION_NAME==='utf8mb4_0900_bin'),'ESQUEMA_INCOMPATIBLE');}
  const [idx]=await c.execute('SELECT INDEX_NAME,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND NON_UNIQUE=0 ORDER BY INDEX_NAME,SEQ_IN_INDEX',[tabla]),grupos=new Map();for(const x of idx){if(!grupos.has(x.INDEX_NAME))grupos.set(x.INDEX_NAME,[]);grupos.get(x.INDEX_NAME).push(x.COLUMN_NAME);}exigir(iguales([...grupos.values()],spec.unicas),'ESQUEMA_INCOMPATIBLE');
  const [checks]=await c.execute("SELECT cc.CHECK_CLAUSE,tc.ENFORCED FROM information_schema.TABLE_CONSTRAINTS tc JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME WHERE tc.TABLE_SCHEMA=DATABASE() AND tc.TABLE_NAME=? AND tc.CONSTRAINT_TYPE='CHECK'",[tabla]);exigir(checks.every(x=>x.ENFORCED==='YES')&&iguales(checks.map(x=>normal(x.CHECK_CLAUSE)),spec.checks.map(normal)),'ESQUEMA_INCOMPATIBLE');
  const [triggers]=await c.execute('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE=?',[tabla]);exigir(!triggers.length,'ESQUEMA_INCOMPATIBLE');
 }
 const [fk]=await c.query("SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_SCHEMA,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('ims_abiertos_copia','ims_abiertos_copia_fila') AND REFERENCED_TABLE_NAME IS NOT NULL");
 const [[d]]=await c.query('SELECT DATABASE() AS nombre');exigir(fk.length===1&&fk[0].TABLE_NAME==='ims_abiertos_copia_fila'&&fk[0].COLUMN_NAME==='copia_id'&&fk[0].REFERENCED_TABLE_SCHEMA===d.nombre&&fk[0].REFERENCED_TABLE_NAME==='ims_abiertos_copia'&&fk[0].REFERENCED_COLUMN_NAME==='copia_id','ESQUEMA_INCOMPATIBLE');
 const [reglas]=await c.query("SELECT UPDATE_RULE,DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='ims_abiertos_copia_fila'");exigir(reglas.length===1&&reglas.every(r=>[r.UPDATE_RULE,r.DELETE_RULE].every(x=>['RESTRICT','NO ACTION'].includes(x))),'ESQUEMA_INCOMPATIBLE');
}
async function comprobarArchivos(p){
 exigir(await hashFile(path.join(p.dir,'preparacion_NO_IMPORTAR.json'))===p.copiaId,'PREPARACION_ALTERADA');
 for(const n of ARCHIVOS)exigir(await hashFile(path.join(p.dir,n))===p.manifest.archivos_sha256[n],'PREPARACION_ALTERADA');
 exigir(await hashFile(p.manifest.archivo_zip)===p.manifest.sha256_zip,'ZIP_ALTERADO');
}
async function verificarCopia(c,p){
 const [[h]]=await c.execute('SELECT corte_id,estado,activa,productos,auxiliares,preparacion,esquemas FROM ims_abiertos_copia WHERE copia_id=?',[p.copiaId]);
 exigir(h&&h.corte_id===p.manifest.corte_id&&h.estado==='VERIFICADO'&&Number(h.activa)===0&&Number(h.productos)===p.cantidades[0]&&Number(h.auxiliares)===p.cantidades[1]&&h.preparacion===p.raw&&h.esquemas===p.esquemas,'COPIA_SQL_DIFERENTE');
 for(let tipo=0;tipo<2;tipo++){
  const iter=records(path.join(p.dir,ARCHIVOS[tipo]))[Symbol.asyncIterator]();let anterior=0;
  try{while(true){
   const [rows]=await c.execute('SELECT numero_fila,referencia_copia,ambito,contenido_sha256,contenido FROM ims_abiertos_copia_fila WHERE copia_id=? AND tipo_registro=? AND numero_fila>? ORDER BY numero_fila LIMIT 128',[p.copiaId,TIPOS[tipo],anterior]);
   if(!rows.length)break;
   for(const r of rows){const next=await iter.next();exigir(!next.done,'COPIA_SQL_DIFERENTE');const {raw,row}=next.value;anterior++;exigir(Number(r.numero_fila)===anterior&&r.referencia_copia===filaPreparada(row,TIPOS[tipo],p.manifest.corte_id)&&r.ambito===row.ambito&&r.contenido===raw&&r.contenido_sha256===sha(raw),'COPIA_SQL_DIFERENTE');}
  }exigir(anterior===p.cantidades[tipo]&&(await iter.next()).done,'COPIA_SQL_DIFERENTE');}finally{await iter.return?.();}
 }
}
export async function copiarPreparacionAbiertos({pool,directorio,onProgress=()=>{}}){
 const p=await validarPaqueteAbiertos(directorio),c=await pool.getConnection();let bloqueada=false,abierta=false,lock;
 try{
  const db=await destino(c);lock='ims-abiertos:'+sha(db).slice(0,40);
  const [[limite]]=await c.query('SELECT @@max_allowed_packet AS maximo');exigir(Number(limite.maximo)>Buffer.byteLength(p.raw)+Buffer.byteLength(p.esquemas)+65536&&Number(limite.maximo)>p.maxLinea+65536,'PAQUETE_SQL_EXCESIVO');
  const [[l]]=await c.execute('SELECT GET_LOCK(?,0) AS adquirido',[lock]);exigir(Number(l.adquirido)===1,'OTRA_COPIA_ACTIVA');bloqueada=true;
  for(const sql of (await readFile(new URL('../../sql/012_copia_abiertos_revision.sql',import.meta.url),'utf8')).replace(/^--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean))await c.query(sql);
  await esquema(c);await c.query("SET time_zone = '+00:00'");await c.beginTransaction();abierta=true;
  const [existente]=await c.execute('SELECT estado FROM ims_abiertos_copia WHERE copia_id=? FOR UPDATE',[p.copiaId]);
  if(existente.length){await verificarCopia(c,p);await comprobarArchivos(p);await c.commit();abierta=false;return resultado(p,true);}
  await c.execute('INSERT INTO ims_abiertos_copia(copia_id,corte_id,estado,activa,productos,auxiliares,preparacion,esquemas) VALUES (?,?,?,0,?,?,?,?)',[p.copiaId,p.manifest.corte_id,'CARGANDO',...p.cantidades,p.raw,p.esquemas]);
  for(let tipo=0;tipo<2;tipo++){
   let lote=[],bytes=0,n=0;
   const guardar=async()=>{if(!lote.length)return;await c.execute('INSERT INTO ims_abiertos_copia_fila(copia_id,tipo_registro,numero_fila,referencia_copia,ambito,contenido_sha256,contenido) VALUES '+lote.map(()=>'(?,?,?,?,?,?,?)').join(','),lote.flat());lote=[];bytes=0;onProgress({tipo_registro:TIPOS[tipo],filas:n});};
   for await(const {raw,row} of records(path.join(p.dir,ARCHIVOS[tipo]))){
    const tam=Buffer.byteLength(raw);if(lote.length>=128||bytes+tam>Math.min(512*1024,Number(limite.maximo)/4))await guardar();
    n++;lote.push([p.copiaId,TIPOS[tipo],n,filaPreparada(row,TIPOS[tipo],p.manifest.corte_id),row.ambito,sha(raw),raw]);bytes+=tam;
   }await guardar();exigir(n===p.cantidades[tipo],'PREPARACION_ALTERADA');
  }
  await c.execute("UPDATE ims_abiertos_copia SET estado='VERIFICADO' WHERE copia_id=?",[p.copiaId]);
  await verificarCopia(c,p);await comprobarArchivos(p);await c.commit();abierta=false;
  return resultado(p,false);
 }catch(error){if(abierta)try{await c.rollback();}catch{}if(error instanceof ErrorCopiaAbiertos)throw error;const fallo=new ErrorCopiaAbiertos('COPIA_NO_CONFIRMADA');fallo.codigoMysql=codigoMysqlSeguro(error);throw fallo;}
 finally{if(bloqueada)try{await c.execute('SELECT RELEASE_LOCK(?)',[lock]);}catch{}c.release();}
}
function resultado(p,repetida){return {ok:true,copia_revision_mysql:true,copia_id:p.copiaId,corte_id:p.manifest.corte_id,ya_copiada:repetida,productos:p.cantidades[0],filas_auxiliares:p.cantidades[1],ambitos:p.ambitos,tablas_destino:Object.keys(contrato),integridad_sql_verificada:true,datos_operativos_importados:false,inventarios_activados:false,permisos_creados:false,publicacion_kpi:false,operacion_nativa_modificada:false,requiere_delta_final:true,servicios_reiniciados:false,apache_modificado:false,puertos_abiertos:[]};}
