import {readFile} from 'node:fs/promises';
const ROOT=new URL('../../public/',import.meta.url);
const FILES={
  '/ims':['index.html','text/html; charset=utf-8'],
  '/assets/ims.mjs':['ims.mjs','text/javascript; charset=utf-8'],
  '/assets/ims.css':['ims.css','text/css; charset=utf-8'],
  '/assets/mapa-posiciones.mjs':['mapa-posiciones.mjs','text/javascript; charset=utf-8'],
  '/assets/mapa-visor.mjs':['mapa-visor.mjs','text/javascript; charset=utf-8'],
  '/catalogos':['catalogos.html','text/html; charset=utf-8'],
  '/assets/catalogos.mjs':['catalogos.mjs','text/javascript; charset=utf-8'],
  '/assets/catalogos-csv.mjs':['catalogos-csv.mjs','text/javascript; charset=utf-8'],
  '/plantilla-ean.csv':['plantilla-ean.csv','text/csv; charset=utf-8'],
  '/plantilla-wtw.csv':['plantilla-wtw.csv','text/csv; charset=utf-8'],
  '/assets/interfaz.css':['interfaz.css','text/css; charset=utf-8'],
  '/assets/interfaz.mjs':['interfaz.mjs','text/javascript; charset=utf-8'],
  '/wms':['index.html','text/html; charset=utf-8'],
  '/assets/legado.mjs':['legado.mjs','text/javascript; charset=utf-8'],
  '/inventarios':['index.html','text/html; charset=utf-8'],
  '/centro':['centro.html','text/html; charset=utf-8'],
  '/crear':['crear.html','text/html; charset=utf-8'],
  '/assets/centro.css':['centro.css','text/css; charset=utf-8'],
  '/assets/centro.mjs':['centro.mjs','text/javascript; charset=utf-8'],
  '/assets/crear.mjs':['crear.mjs','text/javascript; charset=utf-8'],
  '/assets/comun-centro.mjs':['comun-centro.mjs','text/javascript; charset=utf-8'],
  '/assets/cantidades.mjs':['cantidades.mjs','text/javascript; charset=utf-8'],
  '/erp':['erp.html','text/html; charset=utf-8'],
  '/assets/erp.mjs':['erp.mjs','text/javascript; charset=utf-8'],
  '/operacion':['operacion.html','text/html; charset=utf-8'],
  '/plantilla-stock.csv':['plantilla-stock.csv','text/csv; charset=utf-8'],
  '/assets/camara.mjs':['camara.mjs','text/javascript; charset=utf-8'],
  '/assets/operacion.mjs':['operacion.mjs','text/javascript; charset=utf-8'],
  '/assets/stock-csv.mjs':['stock-csv.mjs','text/javascript; charset=utf-8'],
  '/':['index.html','text/html; charset=utf-8'],
  '/assets/estilos.css':['estilos.css','text/css; charset=utf-8'],
  '/assets/app.mjs':['app.mjs','text/javascript; charset=utf-8'],
  '/assets/modelo.mjs':['modelo.mjs','text/javascript; charset=utf-8'],
  '/assets/pendientes.mjs':['pendientes.mjs','text/javascript; charset=utf-8']
};
export async function servirEstatico(req,res,url,{centroHabilitado=false}={}){
  if(!['GET','HEAD'].includes(req.method)||!Object.hasOwn(FILES,url.pathname))return false;
  const [file,type]=centroHabilitado&&url.pathname==='/'?FILES['/centro']:FILES[url.pathname],body=await readFile(new URL(file,ROOT));
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer','Content-Length':body.length,
    'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; media-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});
  res.end(req.method==='HEAD'?undefined:body);return true;
}
