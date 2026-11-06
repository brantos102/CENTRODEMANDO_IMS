import {open,mkdir,mkdtemp,rename,rm,readFile,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateSnapshot,records,hashFile} from './importar-snapshot.mjs';
import {INV,REG,verificarCabecera,celdas,texto,uuidEstable,proyectarFila,canon,sha,exigir} from '../src/migracion/modelo.mjs';
import {estadoPermiteConsolidar} from '../src/dominio/inventario.mjs';

async function existe(p){try{await lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
export async function destinoPrivado(destino){
  destino=path.resolve(destino);exigir(!await existe(destino),'El destino ya existe; no se sobrescriben planes.');
  let actual=path.dirname(destino),resto=[];
  while(!await existe(actual)){resto.unshift(path.basename(actual));actual=path.dirname(actual);}
  const padre=path.join(await realpath(actual),...resto);
  const codigo=fileURLToPath(new URL('../',import.meta.url));
  const rel=path.relative(codigo,path.join(padre,path.basename(destino)));
  exigir(rel.startsWith('..'+path.sep)||path.isAbsolute(rel),'El plan privado debe guardarse fuera de la candidata.');
  for(let p=await realpath(actual);;p=path.dirname(p)){
    exigir(!await existe(path.join(p,'.git','HEAD'))&&!((await existe(path.join(p,'.git')))&&!(await lstat(path.join(p,'.git'))).isDirectory()),
      'El plan contiene datos privados; no se permite dentro de un repositorio.');
    if(p===path.dirname(p))break;
  }
  await mkdir(padre,{recursive:true,mode:0o700});return path.join(padre,path.basename(destino));
}
async function writer(dir,name){const file=await open(path.join(dir,name),'wx',0o600);return {write:value=>file.write(canon(value)+'\n'),close:()=>file.close()};}
const PANEL=['CLIENTE','LINK','ID','FECHA / HORA INICIO','FECHA / HORA FINAL','SEDE','AVANCE'];
export async function planificarOperacion(input,output){
  const snapshot=await validateSnapshot(input),m=snapshot.manifest;
  verificarCabecera(m.hojas.find(s=>s.nombre==='INVENTARIOS').encabezados,INV);
  verificarCabecera(m.hojas.find(s=>s.nombre==='REGISTRO').encabezados,REG);
  const panel=m.hojas.find(s=>s.nombre==='PANEL DE CONTROL');exigir(panel,'Falta PANEL DE CONTROL.');
  const catalogo=[],fuentes=new Map(),clientes=new Set();
  for await(const {row} of records(path.join(snapshot.dir,panel.archivo))){
    const d=celdas(row);
    if(row.fila===1){verificarCabecera(PANEL.map((_,i)=>texto(d.get(i+1))),PANEL);continue;}
    const origen=(texto(d.get(3))||'').trim(),cliente=(texto(d.get(1))||'').trim(),sede=(texto(d.get(6))||'').trim().toUpperCase();
    const r={fila_panel:row.fila,origen_drive:origen,nombre_archivo:texto(d.get(2)),cliente_panel:cliente,sede,
      estado_original:texto(d.get(7)),filas:0,codigo:null,motivos:[],inventario_id:uuidEstable('inventario',origen)};
    if(cliente)clientes.add(cliente);
    if(!/^[A-Za-z0-9_-]{20,256}$/.test(origen))r.motivos.push('ID_DRIVE_INVALIDO');
    if(!['UIO','GYE'].includes(sede))r.motivos.push('SEDE_AUSENTE_O_DESCONOCIDA');
    if(!estadoPermiteConsolidar(r.estado_original))r.motivos.push('FUENTE_HIJA_PENDIENTE');
    const anteriores=fuentes.get(origen)||[];anteriores.push(r);fuentes.set(origen,anteriores);catalogo.push(r);
  }
  exigir(catalogo.length>0,'El panel no contiene inventarios.');
  for(const list of fuentes.values())if(list.length>1)for(const r of list)r.motivos.push('ID_DRIVE_REPETIDO_PANEL');
  const destino=await destinoPrivado(output),temp=await mkdtemp(path.join(path.dirname(destino),'.ims-plan-'));
  let tmp,inc,ready,cat;
  try{
    tmp=await writer(temp,'temporal.jsonl');inc=await writer(temp,'incidencias.jsonl');
    const inv=m.hojas.find(s=>s.nombre==='INVENTARIOS');let leidas=0;
    for await(const {row} of records(path.join(snapshot.dir,inv.archivo))){
      // Las filas que contienen solo notas siguen en staging; no son existencias.
      if(row.fila===1||!row.celdas.some(c=>c.valor!==null&&c.valor!==''||c.formula))continue;
      leidas++;
      const list=fuentes.get(row.origen_drive);exigir(list?.length,'Fila de inventario sin fuente en PANEL DE CONTROL.');
      const p=proyectarFila(row,m.snapshot_id,clientes);
      for(const r of list){
        r.filas++;
        if(r.codigo&&p.codigo&&r.codigo!==p.codigo)r.motivos.push('IDS_OPERATIVOS_MEZCLADOS');
        if(!r.codigo&&p.codigo)r.codigo=p.codigo;
        r.motivos.push(...p.issues);
      }
      if(p.issues.length)await inc.write({fila_consolidado:row.fila,origen_drive:row.origen_drive,motivos:p.issues});
      await tmp.write(p.proyeccion);
    }
    await tmp.close();tmp=null;
    const preparados=new Set(),resumen={inventarios_panel:catalogo.length,inventarios_preparados:0,inventarios_revision:0,
      filas_originales:leidas,filas_preparadas:0,filas_conservadas_para_revision:0,motivos:{}};
    cat=await writer(temp,'catalogo.jsonl');
    for(const r of catalogo){
      if(!r.filas)r.motivos.push('SIN_LINEAS_EN_CONSOLIDADO');
      if(!r.codigo)r.motivos.push('SIN_CODIGO_OPERATIVO');
      r.motivos=[...new Set(r.motivos)].sort();r.preparado=r.motivos.length===0;
      if(r.preparado){preparados.add(r.origen_drive);resumen.inventarios_preparados++;}
      else{resumen.inventarios_revision++;for(const k of r.motivos)resumen.motivos[k]=(resumen.motivos[k]||0)+1;}
      await cat.write(r);
    }
    await cat.close();cat=null;ready=await writer(temp,'lineas_preparadas.jsonl');
    for await(const {row} of records(path.join(temp,'temporal.jsonl'))){if(preparados.has(row.origen_drive)){await ready.write(row);resumen.filas_preparadas++;}else resumen.filas_conservadas_para_revision++;}
    await ready.close();ready=null;await inc.close();inc=null;await rm(path.join(temp,'temporal.jsonl'));
    exigir(resumen.filas_originales===resumen.filas_preparadas+resumen.filas_conservadas_para_revision,'Conciliación de filas incompatible.');
    const archivos={};for(const name of ['catalogo.jsonl','incidencias.jsonl','lineas_preparadas.jsonl'])archivos[name]=await hashFile(path.join(temp,name));
    const identidad={version:1,reglas:'historico-entregado-v1',snapshot_id:m.snapshot_id,archivos,resumen};
    const manifest={...identidad,plan_id:sha(canon(identidad)),creado_utc:new Date().toISOString(),privado:true,activa_usuarios:false,consolida_kpi:false};
    await (await open(path.join(temp,'manifest.json'),'wx',0o600)).close();
    const f=await open(path.join(temp,'manifest.json'),'w');try{await f.writeFile(JSON.stringify(manifest,null,2)+'\n');}finally{await f.close();}
    await rename(temp,destino);return {destino,manifest,snapshot};
  }catch(e){for(const w of [tmp,inc,ready,cat])if(w)await w.close().catch(()=>{});await rm(temp,{recursive:true,force:true});throw e;}
}
export async function validarPlan(dir){
  dir=await realpath(dir);const mf=path.join(dir,'manifest.json');exigir((await lstat(mf)).isFile()&&!(await lstat(mf)).isSymbolicLink(),'Manifiesto inválido.');
  exigir((await lstat(mf)).size<4*1024*1024,'Manifiesto excesivo.');
  const m=JSON.parse(await readFile(mf,'utf8'));
  exigir(m.version===1&&m.reglas==='historico-entregado-v1'&&/^[a-f0-9]{64}$/.test(m.snapshot_id),'Plan incompatible.');
  const identidad={version:m.version,reglas:m.reglas,snapshot_id:m.snapshot_id,archivos:m.archivos,resumen:m.resumen};
  exigir(sha(canon(identidad))===m.plan_id,'La identidad del plan no coincide.');
  const names=['catalogo.jsonl','incidencias.jsonl','lineas_preparadas.jsonl'];
  exigir(Object.keys(m.archivos).length===3&&names.every(n=>Object.hasOwn(m.archivos,n)),'Archivos de plan incompatibles.');
  for(const n of names){const p=path.join(dir,n),s=await lstat(p);exigir(s.isFile()&&!s.isSymbolicLink()&&await hashFile(p)===m.archivos[n],'Integridad del plan no válida.');}
  return {dir,manifest:m};
}
async function main(){
  const [input,output,...rest]=process.argv.slice(2);exigir(input&&output&&!rest.length,'Uso: node tools/planificar-operacion.mjs /corte /plan_privado_nuevo');
  const {manifest:m}=await planificarOperacion(input,output);console.log(JSON.stringify({ok:true,plan_id:m.plan_id,snapshot_id:m.snapshot_id,...m.resumen,base_de_datos_modificada:false}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{
  console.error('Plan detenido. Revisa integridad, contratos y destino privado fuera del repositorio; no se muestran datos de clientes.');process.exitCode=1;
});
