import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
const codigo=await readFile(new URL('../../tools/EXPORTAR_ABIERTOS_PRIVADO.gs.txt',import.meta.url),'utf8');
const PROY='1QPDNLYYqLXkOjNyWoL49JepzxW32XaTskLWfSYOfCdE10Dt62FAfhlsD',MASTER='1Cq2AqRVAZJYmj_zs_zg8C63FPrgRBtJHaNcHWXygaPk',ABIERTO='ARCHIVO_ABIERTO_SINTETICO_00001',VALIDACION='ARCHIVO_VALIDACION_SINTETICO_00002',NEGACION='ARCHIVO_NO_ENTREGADO_SINTETICO_00003',CERRADO='ARCHIVO_ENTREGADO_SINTETICO_00004',SECRET='NO_EXPORTAR_CLAVE_SINTETICA';
export function simular({email='brantos102@gmail.com',efectivo=email,proyecto=PROY,privado=true,cambio=false,enlace=false,ancho=false}={}){
 const log=[],files=[],folders=[],books=new Map(),origenes=new Map();let reads=0,clock=Date.now(),modificaciones=0;
 const it=items=>{let n=0;return {hasNext:()=>n<items.length,next:()=>items[n++]};};
 const panel=[['CLIENTE','ARCHIVO','DRIVE','FECHA','','SEDE','ESTADO','','RESPONSABLE'],['BELIA','101126_BELIA',ABIERTO,'','','UIO','En Proceso','','Responsable'],['NOKIA','101126_NOKIA',VALIDACION,'','','GYE','En validación','',''],['OTRO','101126_OTRO',NEGACION,'','','UIO','No Entregado','',''],['BELIA','101126_BELIA',ABIERTO,'','','UIO','En Proceso','',''],['CERRADO','101126_CERRADO',CERRADO,'','','UIO',' Entregado ','',''],['PLANIFICADO','','','','','UIO','Pendiente','','']];
 panel[1][3]=new Date('2026-11-10T05:00:00Z');
 if(enlace)for(const i of [1,4]){panel[i][2]='';panel[i][1]=enlace==='rico'?'101126_BELIA':'https://docs.google.com/spreadsheets/d/'+ABIERTO+'/edit';}
 function hoja(nombre,data,id){
  const sh={data,id,getName:()=>nombre,getSheetId:()=>id,getLastRow:()=>data.length,getLastColumn:()=>Math.max(0,...data.map(r=>r.length)),getRange(a,b,n,m){return {
   getValues(){reads++;const rows=Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>data[a+i-1]?.[b+j-1]??''));if(cambio&&nombre==='PLANILLA DE CONTEO FISICO'&&a===1){origenes.get(ABIERTO).version++;data[1][1]=99;}return rows;},
   getDisplayValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>String(data[a+i-1]?.[b+j-1]??'')));},
   getRichTextValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},()=>({getLinkUrl:()=>enlace==='rico'&&nombre==='PANEL DE CONTROL'&&[2,5].includes(a+i)?'https://docs.google.com/spreadsheets/d/'+ABIERTO+'/edit':null,getRuns:()=>[]})));},
   getFormulas(){return Array.from({length:n},()=>Array(m).fill(''));},getNotes(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>a+i===2&&j===0?'Nota humana':''));},getNumberFormats(){return Array.from({length:n},()=>Array(m).fill('0.000000000'));},
   setValue(){modificaciones++;throw Error('PROHIBIDO');},setValues(){modificaciones++;throw Error('PROHIBIDO');}
  };}};return sh;
 }
 function origen(id,sheets){const source={version:1,getLastUpdated(){return new Date(source.version);},getName:()=>id,getId:()=>id,setContent(){modificaciones++;throw Error('PROHIBIDO');}};origenes.set(id,source);books.set(id,{getSpreadsheetTimeZone:()=> 'America/Guayaquil',getSheetByName:n=>sheets.find(s=>s.getName()===n),getSheets:()=>sheets});}
 const usuarios=[['CORREO','NOMBRE','ROL','PASS','ACTIVO','','','ROL WMS','CLAVE'],['operador@sintetico.invalid','Nombre','Operador',SECRET,true,'','','OPERADOR',SECRET]],crono=[['FECHA','ESTADO'],['2026-11-10','En Proceso']];
 if(ancho){usuarios.forEach((r,i)=>{while(r.length<385)r.push('');r[384]=i?'Dato administrativo':'CAMPO ADMINISTRATIVO';});for(let i=0;i<65;i++){if(!crono[i])crono[i]=['2026-11-10','En Proceso'];while(crono[i].length<384)crono[i].push('');crono[i][383]=i?'Dato de cronograma':'CAMPO DE CRONOGRAMA';}}
 origen(MASTER,[hoja('PANEL DE CONTROL',panel,1),hoja('USUARIOS',usuarios,2),hoja('CREDENCIALES_API',[['USER','PASSWORD'],['SECRETO',SECRET]],3),hoja('CRONOGRAMA - 2026',crono,4)]);
 for(const id of [ABIERTO,VALIDACION,NEGACION])origen(id,[hoja('PLANILLA DE CONTEO FISICO',[['SKU','C1','C2','PASSWORD'],['00001',0,'',SECRET]],1),hoja('REGISTRO',[['USUARIO','CANTIDAD'],['operador@sintetico.invalid',0]],2),hoja('USUARIOS',[['correo','pass'],['x',SECRET]],3)]);
 origen('1Y2VZpr-fy6iuZyfX-96N1r9l3WdZOBfFnEV6Y2BHWog',[hoja('MAESTRO EAN',[['SKU','EAN'],['0001','012345']],1)]);
 origen('1DTNYkDGdkTbMsAyUa2xeaMeY3zgk77cgua0Gd7_rJSk',[hoja('UBICACIONES',[['POSICION'],['A-01']],1)]);
 function recurso(nombre,folder=false){const r={nombre,id:randomUUID(),content:'',priv:false,children:[],getId:()=>r.id,getUrl:()=> 'https://drive.google.com/'+r.id,getOwner:()=>({getEmail:()=>email}),setSharing(){r.priv=true;return r;},getSharingAccess:()=>privado&&r.priv?'PRIVATE':'DOMAIN',getEditors:()=>[],getViewers:()=>[],getBlob:()=>({getDataAsString:()=>r.content}),setContent(text){assert.equal(r.getSharingAccess(),'PRIVATE');r.content=text;return r;},getFilesByName:n=>it(r.children.filter(f=>f.nombre===n)),createFile(n,text){const f=recurso(n);f.content=text;r.children.push(f);files.push(f);return f;}};return r;}
 const ctx=vm.createContext({ScriptApp:{getScriptId:()=>proyecto},Session:{getActiveUser:()=>({getEmail:()=>email}),getEffectiveUser:()=>({getEmail:()=>efectivo})},Logger:{log:x=>log.push(x)},Date:class extends Date{static [Symbol.hasInstance](v){return Object.prototype.toString.call(v)==='[object Date]';}static now(){clock+=60000;return clock;}},
  PropertiesService:{getScriptProperties(){throw Error('PROHIBIDO');}},
  SpreadsheetApp:{openById:id=>{reads++;if(!books.has(id))throw Error('ORIGEN_AJENO');return books.get(id);}},
  Utilities:{getUuid:randomUUID,DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_algo,text)=>[...createHash('sha256').update(text).digest()],newBlob:text=>({getBytes:()=>Buffer.from(text)})},MimeType:{PLAIN_TEXT:'text/plain'},
  DriveApp:{Access:{PRIVATE:'PRIVATE'},Permission:{VIEW:'VIEW'},getFileById:id=>{const f=origenes.get(id)||files.find(f=>f.id===id);if(!f)throw Error();return f;},getFolderById:id=>{const f=folders.find(f=>f.id===id);if(!f)throw Error();return f;},getFilesByName:n=>it(files.filter(f=>f.nombre===n)),createFolder:n=>{const f=recurso(n,true);folders.push(f);return f;},createFile:(n,text)=>{const f=recurso(n);f.content=text;files.push(f);return f;}}
 });vm.runInContext(codigo,ctx);
 const preparar=()=>ctx.IMSPrepararCorteAbiertos20261110(),continuar=()=>ctx.IMSContinuarCorteAbiertos20261110(),recuperar=()=>ctx.IMSRecuperarCorteAbiertos20261111(),plan=()=>JSON.parse(folders[0].children.find(f=>f.nombre==='plan_abiertos_privado.json').content);
 const actual=()=>{const cfg=JSON.parse(files.find(f=>f.nombre.startsWith('IMS_ABIERTOS_CONTROL_')).content);return folders.find(f=>f.id===cfg.carpeta);};
 return {preparar,continuar,recuperar,files,log,panel,plan,prepararCompleto:()=>ctx.IMSPrepararCorteCompleto20261112(),planActual:()=>JSON.parse(actual().children.find(f=>f.nombre==='plan_abiertos_privado.json').content),archivosCorteActual:()=>actual().children.map(f=>({nombre:f.nombre,content:f.content})),agregarHojaMaestro:(nombre,data,id)=>books.get(MASTER).getSheets().push(hoja(nombre,data,id)),archivosCorte:()=>folders[0].children.map(f=>({nombre:f.nombre,content:f.content})),cambiarOrigen:(id)=>{origenes.get(id).version++;},reemplazarPlanilla:(id,rows)=>{const sh=books.get(id).getSheetByName('PLANILLA DE CONTEO FISICO');sh.data.splice(0,sh.data.length,...rows);origenes.get(id).version++;},reads:()=>reads,modificaciones:()=>modificaciones};
}

export {ABIERTO,CERRADO,SECRET};

export function recuperacionDePrueba(retirar=false){
 const f=simular({ancho:true}),fin=()=>{for(let i=0;i<100;i++)if(f.continuar().extraccion_terminada)return;throw Error('Corte sintético pendiente.');};
 f.preparar();f.continuar();f.cambiarOrigen(ABIERTO);fin();const base=f.archivosCorte();
 if(retirar){f.panel[1][6]='Entregado';f.panel[4][6]='Entregado';}else f.panel[2][8]='Responsable actual';
 f.recuperar();fin();return {base,actual:f.archivosCorte()};
}
