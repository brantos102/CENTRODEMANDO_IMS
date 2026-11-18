import {exigir,fecha,hash} from './dominio.mjs';
import {cantidadExacta} from '../dominio/conteo.mjs';
import {normalizar as norm} from '../migracion/modelo.mjs';
export const SCOPE_HOJAS='https://www.googleapis.com/auth/spreadsheets.readonly';
export const MAESTRO_UIO='1Cq2AqRVAZJYmj_zs_zg8C63FPrgRBtJHaNcHWXygaPk';
const ID=/^[A-Za-z0-9_-]{20,120}$/;
const valor=c=>c?.effectiveValue, texto=c=>String(c?.formattedValue??valor(c)?.stringValue??valor(c)?.numberValue??'').trim();
function cantidad(c,{signo=false}={}){
 const v=valor(c);if(!v||Object.keys(v).length===0)return null;
 exigir(!v.errorValue&&!Object.hasOwn(v,'boolValue'),'GOOGLE_CANTIDAD_INVALIDA','Una cantidad contiene un error o un valor lógico.');
 let s;if(Object.hasOwn(v,'numberValue')){exigir(Number.isFinite(v.numberValue)&&Number.isSafeInteger(Math.trunc(v.numberValue)),'GOOGLE_CANTIDAD_INVALIDA','Una cantidad numérica supera la precisión segura de Google.');s=String(v.numberValue);}else s=String(v.stringValue??'').trim();
 if(!s)return null;if(!Object.hasOwn(v,'numberValue'))exigir(!/^-?[1-9]\d{0,2}[.,]\d{3}$/.test(s),'GOOGLE_CANTIDAD_AMBIGUA','Una cantidad de texto puede representar miles o decimales; conviértela a número en Google y vuelve a revisar.');exigir(/^[-]?\d+(?:[.,]\d{1,9})?$/.test(s)&&(!s.startsWith('-')||signo),'GOOGLE_CANTIDAD_INVALIDA','Revisa una cantidad de texto; no se interpretan miles ambiguos.');s=s.replace(',','.');return s.startsWith('-')?'-'+cantidadExacta(s.slice(1)):cantidadExacta(s);
}
function fechaCelda(c){const v=valor(c);if(!v)return null;if(Object.hasOwn(v,'numberValue')){const n=v.numberValue;exigir(Number.isFinite(n)&&n>0&&n<110000,'GOOGLE_FECHA_INVALIDA','Fecha de Google fuera de rango.');return fecha(new Date(Date.UTC(1899,11,30)+Math.floor(n)*86400000).toISOString().slice(0,10));}const s=texto(c);if(!s)return null;let f=s;const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/.exec(s);if(m)f=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');return fecha(f);}
export function interpretarPlanillaGoogle(rows,{archivo,nombre,estadoOrigen='EN PROCESO',sede='UIO'}={}){
 exigir(ID.test(archivo)&&Array.isArray(rows)&&rows.length>0&&rows.length<=100001,'GOOGLE_FORMATO_INVALIDO','Planilla vacía o fuera de límite.');const cab=rows[0].map(texto).map(norm);
 for(const [i,aceptadas]of [[0,['FECHAINICIO']],[2,['ID']],[4,['CLIENTE']],[6,['PRODUCTO','SKU']],[14,['POSICION']],[16,['DEPOT','STOCKTEORICO']],[21,['CONTEONO1','CONTEON1','CONTEO1']],[22,['CONTEONO2','CONTEON2','CONTEO2']],[23,['CONTEOFINAL']]])exigir(aceptadas.includes(cab[i]),'GOOGLE_CABECERA_DISTINTA','La planilla no coincide con las columnas originales de IMS.');
 const grupos=new Map();let auxiliares=0;
 for(let i=1;i<rows.length;i++){
  const r=rows[i],sku=texto(r[6]);if(!sku){auxiliares++;continue;}exigir(![0,2,4,5,6,7,8,9,10,11,12,13,14,15,16,21,22,23,24,25,26,27,28].some(j=>valor(r[j])?.errorValue),'GOOGLE_CELDA_ERROR','La fila contiene un error de Google en un campo requerido.');for(const j of [2,6,8,9])if(Object.hasOwn(valor(r[j])||{},'numberValue'))exigir(Number.isSafeInteger(valor(r[j]).numberValue),'GOOGLE_IDENTIFICADOR_INVALIDO','Un identificador numérico de Google perdió precisión.');
  const codigo=texto(r[2]),inicio=fechaCelda(r[0]),cliente=texto(r[4]);exigir(codigo&&inicio&&cliente,'GOOGLE_INVENTARIO_PENDIENTE','Hay líneas sin código, fecha de inicio o cliente. Se conserva el archivo pendiente de iniciar.');
  exigir([codigo,cliente,sku].every(s=>s.length<=255),'GOOGLE_FORMATO_INVALIDO','Identificador demasiado largo.');
  exigir(['UIO','GYE'].includes(sede),'GOOGLE_SEDE_NO_DEFINIDA','La sede del panel no está definida.');const key=hash([archivo,codigo,inicio,sede]),g=grupos.get(key)||{id:key,archivo,nombre,sede,codigo,fechaInicio:inicio,estadoOrigen,lineas:[]};
  const l={fila:i+1,sku,cliente,conteo_1:cantidad(r[21]),conteo_2:cantidad(r[22]),conteo_final:cantidad(r[23]),depot:cantidad(r[16]),ajuste:cantidad(r[24],{signo:true})};exigir(l.depot!==null,'GOOGLE_STOCK_INCOMPLETO','Una línea no tiene stock teórico. No se supone cero.');
  for(const [k,j,max]of [['posicion',14,255],['descripcion',7,4000],['serie',8,255],['lote',9,255],['unidad',15,50],['abc',5,50],['despacho',10,255],['partida',11,255],['categoria',12,255],['estado_mercancia',13,255],['motivo',25,255],['justificacion',26,16000],['observacion',27,16000],['nueva_posicion',28,255]]){l[k]=texto(r[j]);exigir(l[k].length<=max&&!l[k].includes('\0'),'GOOGLE_FORMATO_INVALIDO','Texto de planilla fuera de límite.');}
  if(['0','N/A'].includes(l.serie.toUpperCase()))l.serie='';g.lineas.push(l);grupos.set(key,g);
 }
 exigir(grupos.size>0&&grupos.size<=1000,'GOOGLE_FORMATO_INVALIDO','No se identificaron conteos completos.');return {grupos:[...grupos.values()],auxiliares};
}
export function interpretarPanelGoogle(rows){
 exigir(Array.isArray(rows)&&rows.length<=10001,'GOOGLE_PANEL_INVALIDO','Panel demasiado grande.');const ids=new Map(),out=[];
 for(let i=1;i<rows.length;i++){const r=rows[i],c=texto(r[2]),urls=[texto(r[1]),r[1]?.hyperlink||''],links=[...new Set(urls.flatMap(s=>[...s.matchAll(/https:\/\/(?:docs\.google\.com\/spreadsheets\/d\/|drive\.google\.com\/file\/d\/)([A-Za-z0-9_-]{20,120})(?=[/?#\s]|$)/g)].map(m=>m[1])))];let id=ID.test(c)?c:links.length===1?links[0]:null;
  exigir(!id||!links.some(x=>x!==id),'GOOGLE_REFERENCIA_DISCORDANTE','El ID y el enlace del panel no coinciden.');const sede=({UIO:'UIO',QUITO:'UIO',GYE:'GYE',GUAYAQUIL:'GYE'})[norm(texto(r[5]))]||null;if(!id)continue;if(ids.has(id)){exigir(ids.get(id)===sede,'GOOGLE_REFERENCIA_DISCORDANTE','Un archivo aparece asignado a varias sedes.');continue;}exigir(![MAESTRO_UIO,'1Y2VZpr-fy6iuZyfX-96N1r9l3WdZOBfFnEV6Y2BHWog','1DTNYkDGdkTbMsAyUa2xeaMeY3zgk77cgua0Gd7_rJSk'].includes(id),'GOOGLE_REFERENCIA_INVALIDA','El panel referencia una plantilla o el maestro.');ids.set(id,sede);out.push({sede,archivo:id,nombre:texto(r[1]),estadoOrigen:texto(r[6]),fechaInicio:fechaPanel(r[3]),fechaFin:fechaPanel(r[4]),filaPanel:i+1});
 }return out;
}
export async function clienteHojasGoogle(config,{fetchImpl=fetch}={}){
 exigir(config.hojasLectura===true,'NO_CONFIGURADO','Autoriza la lectura de Google Sheets en Conexiones.');
 async function json(url,opciones={}){const r=await fetchImpl(url,{...opciones,redirect:'error',signal:AbortSignal.timeout(25000)});exigir(r.ok,'GOOGLE_LECTURA_RECHAZADA','Google no confirmó la lectura. Revisa Sheets API y acceso de la cuenta al maestro y sus archivos.');const raw=await r.text();exigir(Buffer.byteLength(raw)<=16*1024*1024,'GOOGLE_RESPUESTA_GRANDE','La respuesta de Google supera el límite.');return JSON.parse(raw);}
 const t=await json('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:config.clienteId,client_secret:config.clienteSecreto,refresh_token:config.refreshToken})});exigir(typeof t.access_token==='string','GOOGLE_LECTURA_RECHAZADA','No se confirmó acceso a las hojas.');let iniciado=Date.now(),autorizadas=new Set([MAESTRO_UIO]);
 async function get(id,q){exigir(autorizadas.has(id)&&ID.test(id)&&Date.now()-iniciado<8*60*1000,'GOOGLE_LECTURA_NO_AUTORIZADA','Archivo no autorizado o lectura expirada.');return json('https://sheets.googleapis.com/v4/spreadsheets/'+id+'?'+new URLSearchParams(q),{method:'GET',headers:{Authorization:'Bearer '+t.access_token}});}
 async function hoja(id,nombre,maxFilas){const meta=await get(id,{fields:'spreadsheetId,sheets.properties'}),hs=meta.sheets?.filter(s=>norm(s.properties?.title)===norm(nombre));exigir(hs?.length===1,'GOOGLE_HOJA_NO_IDENTIFICADA','No se identificó la hoja original requerida.');const titulo=hs[0].properties.title,fin=hs[0].properties.gridProperties?.rowCount,rows=[];exigir(Number.isInteger(fin)&&fin>0&&fin<=maxFilas,'GOOGLE_LIMITE_FILAS','La cuadrícula supera el límite de lectura segura.');
  for(let desde=1;desde<=fin;desde+=500){const hasta=Math.min(fin,desde+499),d=await get(id,{ranges:"'"+titulo.replaceAll("'","''")+"'!A"+desde+':'+(norm(nombre)==='PANELDECONTROL'?'I':'AD')+hasta,includeGridData:'true',fields:'sheets(data(startRow,rowData(values(effectiveValue,formattedValue,hyperlink))))'}),bloque=d.sheets?.[0]?.data?.[0];exigir(bloque&&(!bloque.startRow||bloque.startRow===desde-1),'GOOGLE_RESPUESTA_INCOMPLETA','Respuesta de hoja incompleta.');const rs=suprimirVacias(bloque.rowData||[]);for(let j=0;j<rs.length;j++)rows[desde-1+j]=rs[j]?.values||[];
  }return Array.from({length:rows.length},(_,i)=>rows[i]||[]);}
 return {async panel(){const rows=await hoja(MAESTRO_UIO,'PANEL DE CONTROL',10001),p=interpretarPanelGoogle(rows);autorizadas=new Set([MAESTRO_UIO,...p.map(p=>p.archivo)]);return p;},async inventario(p){const leer=async()=>interpretarPlanillaGoogle(await hoja(p.archivo,'PLANILLA DE CONTEO FISICO',100001),p),a=await leer(),b=await leer();exigir(hash(a)===hash(b),'GOOGLE_FUENTE_CAMBIO','El archivo cambió durante la lectura. Repite la revisión; no se aplica este archivo.');return a;}};
}
function suprimirVacias(rs){let n=rs.length;while(n&&!(rs[n-1]?.values||[]).some(c=>c.effectiveValue&&Object.keys(c.effectiveValue).length))n--;return rs.slice(0,n);}

function fechaPanel(c){try{return fechaCelda(c);}catch{return null;}}
