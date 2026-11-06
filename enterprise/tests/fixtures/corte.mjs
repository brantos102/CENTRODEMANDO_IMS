import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {INV,REG,sha} from '../../src/migracion/modelo.mjs';

export async function crearCorte({origenes,mutarInv,estado}={}){
  const dir=await mkdtemp(path.join(tmpdir(),'ims-corte-operativo-')),cut=path.join(dir,'corte');await mkdir(cut);
  origenes??=Array.from({length:5},()=> 'F_'+randomUUID().replaceAll('-',''));
  const cell=(columna,valor,tipo='s')=>({columna,tipo,valor:String(valor),estilo:'0'});
  const header=(n)=>({fila:1,origen_drive:null,celdas:n.map((v,i)=>cell(i+1,v)),notas:{}});
  const panel=[header(['CLIENTE','LINK','ID','FECHA / HORA INICIO','FECHA / HORA FINAL','SEDE','AVANCE'])];
  const datos=[];
  for(let i=0;i<5;i++){
    const cliente=i<2?'IBM':'VENTURA',codigo=i<2?'250724_IBM':'260907_VENTURA';
    panel.push({fila:i+2,origen_drive:null,celdas:[cell(1,cliente),cell(2,codigo),cell(3,origenes[i]),cell(6,'UIO'),cell(7,estado?.(i)??(i===4?'En Proceso':'Entregado'))],notas:{}});
    if(i===4)continue;
    for(let j=0;j<(i===0?2:1);j++){
      const fila=datos.length+2;
      datos.push({fila,origen_drive:origenes[i],celdas:[cell(3,codigo),cell(4,'1','n'),cell(5,cliente),cell(7,'000123'),
        cell(8,'Producto sintético'),cell(9,'SERIE_'+fila),cell(15,'A-01'),cell(16,'UN'),cell(22,fila===2?'0':'2.125','n'),cell(28,'Nota humana')],
        notas:{['C'+fila]:'Nota original\nIMS_ORIGEN_DRIVE='+origenes[i]}});
    }
  }
  mutarInv?.(datos,origenes);
  const inv=[header(INV),...datos];
  const reg=[header(REG),{fila:2,origen_drive:origenes[0],celdas:[cell(1,'45800.5','n'),cell(7,'SKU_EN_CAMPO_HISTORICO')],notas:{F2:'IMS_ORIGEN_DRIVE='+origenes[0]}}];
  const original='corte sintético de checksum '+randomUUID(),styles='<styles/>';
  const manifest={version:1,snapshot_id:sha(original),archivo:'corte_sintetico.xlsx',original:'fuente.xlsx',estilos:'estilos.xml',estilos_sha256:sha(styles),hojas:[]};
  await writeFile(path.join(cut,'fuente.xlsx'),original);await writeFile(path.join(cut,'estilos.xml'),styles);
  let index=0;
  for(const [nombre,rows] of [['PANEL DE CONTROL',panel],['INVENTARIOS',inv],['REGISTRO',reg],['USUARIOS',[header(['CORREO','CONTRASENA']),{fila:2,origen_drive:null,celdas:[cell(1,'cuenta@prueba.invalid'),cell(2,'VALOR_SENSIBLE_SINTETICO')],notas:{}}]]]){
    const body=rows.map(r=>JSON.stringify(r)+'\n').join(''),archivo='hoja_'+String(++index).padStart(3,'0')+'.jsonl';await writeFile(path.join(cut,archivo),body);
    const contrato=['INVENTARIOS','REGISTRO'].includes(nombre),filasPorOrigen={};
    for(const r of rows.slice(1))if(r.origen_drive)filasPorOrigen[r.origen_drive]=(filasPorOrigen[r.origen_drive]||0)+1;
    manifest.hojas.push({nombre,archivo,sha256:sha(body),filas_almacenadas:rows.length,encabezados:contrato?rows[0].celdas.map(c=>c.valor):null,
      ...(contrato?{filas_datos_contrato:rows.slice(1).filter(r=>r.celdas.some(c=>c.valor!==null&&c.valor!==''||c.formula)).length,filas_por_origen:filasPorOrigen}:{})});
  }
  await writeFile(path.join(cut,'manifest.json'),JSON.stringify(manifest));
  return {dir,cut,manifest,origenes,datos,plan:path.join(dir,'plan'),close:()=>rm(dir,{recursive:true,force:true})};
}
