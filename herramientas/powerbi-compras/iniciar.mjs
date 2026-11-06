import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import path from 'node:path';
import {homedir} from 'node:os';
import {migrar} from './migrar.mjs';

const terminal=createInterface({input:stdin,output:stdout});
function ruta(s){s=s.trim();return s.length>1&&((s.startsWith('"')&&s.endsWith('"'))||(s.startsWith("'")&&s.endsWith("'")))?s.slice(1,-1):s;}
try{
  console.log('Usa las dos plantillas PBIT que ya exportaste. Puedes copiar su ruta con clic derecho > Copiar como ruta.');
  const trabajado=ruta(await terminal.question('Ruta completa de COMPRAS_TRABAJADO.pbit: '));
  const final=ruta(await terminal.question('Ruta completa de COMPRAS_FINAL_CONEXIONES.pbit: '));
  if(!trabajado||!final)throw Error('Se necesitan las dos rutas.');
  const carpeta=path.join(homedir(),'COMPRAS_POWERBI_'+new Date().toISOString().replaceAll(/[:.]/g,'-'));
  const salida=path.join(carpeta,'COMPRAS_FINAL_WEB.pbit');
  const resumen=await migrar({trabajado,final,salida});
  console.log(JSON.stringify(resumen,null,2));
  console.log('\nARCHIVO GENERADO: '+salida);
  console.log('Abre esa plantilla en Power BI Desktop, actualiza y guarda como COMPRAS_FINAL_WEB.pbix.');
}catch(e){console.error('Proceso detenido: '+e.message);process.exitCode=1;}
finally{terminal.close();}
