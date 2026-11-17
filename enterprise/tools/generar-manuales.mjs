// Generación local de documentación estática; no consulta ni modifica datos operativos.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import PDFDocument from 'pdfkit';
const base=new URL('../',import.meta.url),destino=new URL('../../docs/manuales/',import.meta.url);await mkdir(destino,{recursive:true});
for(const [fuente,nombre]of [['MANUALES_IMS_20261117.md','Manual_operacion_IMS_20261117.pdf'],['ENTREGA_LAYOUT_Y_CONTEO_20261117.md','Guia_instalacion_IMS_20261117.pdf'],['ACEPTACION_IMS_20261117.md','Pruebas_aceptacion_IMS_20261117.pdf']]){
 const contenido=await readFile(new URL(fuente,base),'utf8'),d=new PDFDocument({size:'A4',margin:42,info:{Title:nombre,Author:'ITSANET IMS · Candidato para pruebas'}}),partes=[];const fin=new Promise((r,j)=>{d.on('data',b=>partes.push(b));d.on('end',r);d.on('error',j);});let codigo=false;
 for(const raw of contenido.split('\n')){if(raw.startsWith('```')){codigo=!codigo;d.moveDown(.3);continue;}let linea=raw.replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\*\*/g,'').replace(/`/g,'');if(!linea.trim()){d.moveDown(.3);continue;}if(/^\|[- |]+\|$/.test(linea))continue;if(d.y>740)d.addPage();const nivel=/^(#{1,3}) /.exec(linea);if(nivel){d.moveDown(.6).font('Helvetica-Bold').fontSize(nivel[1].length===1?19:13).fillColor('#173767').text(linea.replace(/^#+ /,''));d.moveDown(.4);}else{d.font(codigo?'Courier':'Helvetica').fontSize(codigo?8.5:10).fillColor('#20304a').text(linea,{lineGap:2});}}
 d.end();await fin;await writeFile(new URL(nombre,destino),Buffer.concat(partes));console.log(nombre);
}
