/** Distribución propia de consulta. No escribe posiciones ni cantidades. */
const texto=x=>String(x??'').trim();
const nats=new Intl.Collator('es',{numeric:true,sensitivity:'variant'});
export const ordenarEtiqueta=(a,b)=>nats.compare(a,b)||(a<b?-1:a>b?1:0);
export const clavePosicion=p=>JSON.stringify([p.sede||'',p.almacen||'',p.bodega||'',p.posicion]);
function medida(x){const s=texto(x);return /^\d+(?:\.\d{1,6})?$/.test(s)&&Number(s)>0&&Number(s)<=100000?Number((Number(s)/100).toFixed(8)):null;}
function opciones(p){const r={pasilloCm:200,holguraCm:0,entreBodegasCm:300,intercambiarXY:false,...p};for(const k of ['pasilloCm','holguraCm','entreBodegasCm'])if(!Number.isFinite(Number(r[k]))||Number(r[k])<0||Number(r[k])>5000)throw Error('Usa separaciones entre 0 y 5.000 cm.');return {...r,pasilloCm:Number(r.pasilloCm),holguraCm:Number(r.holguraCm),entreBodegasCm:Number(r.entreBodegasCm),intercambiarXY:r.intercambiarXY===true};}
function estado(rows){const orig=rows.map(p=>p.origen?.datos||{});if(orig.some(o=>texto(o.POS_LOCKEADA)==='1'))return 'BLOQUEADA';const s=new Set(orig.map(o=>texto(o.STATUS_OCUPACION).toUpperCase()).filter(Boolean));if(s.has('OCUPADA')||s.has('OCUPADO'))return 'OCUPADA';if(s.size===1&&(s.has('LIBRE')||s.has('DISPONIBLE')||s.has('VACIA')||s.has('VACIO')))return 'LIBRE';return 'SIN_DATO';}
function prefijos(tamanos,gap){let v=0;const r=new Map();for(const k of [...tamanos.keys()].sort(ordenarEtiqueta)){r.set(k,v);v+=tamanos.get(k)+gap;}return {offset:r,total:Math.max(0,v-gap)};}
export function generarMapaPosiciones(filas,params={}){
 if(!Array.isArray(filas)||filas.length>50000)throw Error('El mapa admite hasta 50.000 registros.');const cfg=opciones(params),gap=cfg.holguraCm/100,pasillo=cfg.pasilloCm/100,entre=cfg.entreBodegasCm/100,unicas=new Map();
 for(const p of filas){const k=clavePosicion(p);if(!unicas.has(k))unicas.set(k,[]);unicas.get(k).push(p);}
 const posiciones=[],excluidas=[],grupos=new Map(),explicitas=[];
 for(const [id,rows]of unicas){const p=rows[0],o=p.origen?.datos||{},base={id,posicion:p.posicion,sede:p.sede||'',almacen:p.almacen||'',bodega:p.bodega||'',zona:p.zona||'',calle:texto(p.calle??o.CALLE),columna:texto(p.columna??o.COLUMNA),nivel:texto(p.nivel??o.NIVEL),profundidad:texto(p.profundidad??o.PROFUNDIDAD),clientes:[...new Set(rows.map(p=>p.clienteCodigo||'').filter(Boolean))].sort(ordenarEtiqueta),asociaciones:rows.length,estado:estado(rows),estadosOrigen:[...new Set(rows.map(r=>texto(r.origen?.datos?.STATUS_OCUPACION)).filter(Boolean))].sort(ordenarEtiqueta),tipo:texto(p.descripcion||o.TIPO_POS)};
  if(p.x!==undefined){const [x,y,z,dx,dy,dz]=['x','y','z','ancho','fondo','alto'].map(k=>Number(p[k]));if([x,y,z,dx,dy,dz].every(Number.isFinite)&&Math.min(dx,dy,dz)>0){const r={...base,x,y,z,dx,dy,dz,origenGeometria:'EXPLICITA',dimensionesCm:[dx*100,dy*100,dz*100]};explicitas.push(r);posiciones.push(r);continue;}}
  const dims=rows.map(r=>{const d=r.origen?.datos||{};return [medida(d.LARGO),medida(d.ANCHO),medida(d.ALTO)];});
  if(dims.some(d=>d.includes(null))){excluidas.push({...base,motivo:'SIN_MEDIDAS_POSITIVAS'});continue;}
  if(dims.some(d=>d.some((v,i)=>v!==dims[0][i]))){excluidas.push({...base,motivo:'MEDIDAS_DISCORDANTES'});continue;}
  const [largo,ancho,alto]=dims[0],r={...base,dx:cfg.intercambiarXY?ancho:largo,dy:cfg.intercambiarXY?largo:ancho,dz:alto,dimensionesCm:[Number(o.LARGO),Number(o.ANCHO),Number(o.ALTO)],origenGeometria:'GENERADA_CM',medidaPequena:Math.min(largo,ancho,alto)<.05,estructuraIncompleta:!base.calle||!base.columna||!base.nivel};
  const key=JSON.stringify([base.sede,base.almacen,base.bodega]);if(!grupos.has(key))grupos.set(key,{id:key,sede:base.sede,almacen:base.almacen,bodega:base.bodega,calles:new Map(),posiciones:[]});const g=grupos.get(key),calle=r.calle||'Sin calle';
  if(!g.calles.has(calle))g.calles.set(calle,{columnas:new Map(),profundidades:new Map()});const c=g.calles.get(calle),col=r.columna||'Posición '+r.posicion,nivel=r.nivel||'Sin nivel',prof=r.profundidad||'Sin profundidad';
  c.profundidades.set(prof,Math.max(c.profundidades.get(prof)||0,r.dy));if(!c.columnas.has(col))c.columnas.set(col,new Map());const slots=c.columnas.get(col),slot=JSON.stringify([nivel,prof]);if(!slots.has(slot))slots.set(slot,[]);slots.get(slot).push(r);g.posiciones.push(r);
 }
 const bloques=[];for(const key of [...grupos.keys()].sort(ordenarEtiqueta)){const g=grupos.get(key);let cy=0,ancho=0,alto=0;const calles=[];
  for(const calle of [...g.calles.keys()].sort(ordenarEtiqueta)){const c=g.calles.get(calle),prof=prefijos(c.profundidades,gap),anchos=new Map();
   for(const [col,slots]of c.columnas)anchos.set(col,Math.max(...[...slots.values()].map(rs=>rs.reduce((s,r)=>s+r.dx,0)+Math.max(0,rs.length-1)*gap)));
   const cols=prefijos(anchos,gap);for(const [col,slots]of c.columnas){const alturas=new Map();for(const rs of slots.values())for(const r of rs){const n=r.nivel||'Sin nivel';alturas.set(n,Math.max(alturas.get(n)||0,r.dz));}const niv=prefijos(alturas,gap);alto=Math.max(alto,niv.total);for(const [slot,rs]of slots){let sx=0;const [n,d]=JSON.parse(slot);for(const r of rs.sort((a,b)=>ordenarEtiqueta(a.posicion,b.posicion))){r.x=cols.offset.get(col)+sx;r.y=cy+prof.offset.get(d);r.z=niv.offset.get(n);sx+=r.dx+gap;}}}
   calles.push({nombre:calle,x:0,y:cy,ancho:cols.total,fondo:prof.total});cy+=prof.total+pasillo;ancho=Math.max(ancho,cols.total);
  }bloques.push({id:g.id,sede:g.sede,almacen:g.almacen,bodega:g.bodega,ancho,fondo:Math.max(0,cy-pasillo),alto,calles,posiciones:g.posiciones});
 }
 const columnas=Math.max(1,Math.ceil(Math.sqrt(bloques.length))),inicio=explicitas.length?Math.max(...explicitas.map(r=>r.x+r.dx))+entre:0;let x=inicio,y=0,maxFila=0;
 for(const [i,g]of bloques.entries()){if(i&&i%columnas===0){x=inicio;y+=maxFila+entre;maxFila=0;}g.x=x;g.y=y;for(const r of g.posiciones){r.x+=x;r.y+=y;posiciones.push(r);}for(const c of g.calles){c.x+=x;c.y+=y;}x+=g.ancho+entre;maxFila=Math.max(maxFila,g.fondo);}
 posiciones.sort((a,b)=>ordenarEtiqueta(a.id,b.id));const limites=posiciones.reduce((b,p)=>({minX:Math.min(b.minX,p.x),minY:Math.min(b.minY,p.y),minZ:Math.min(b.minZ,p.z),maxX:Math.max(b.maxX,p.x+p.dx),maxY:Math.max(b.maxY,p.y+p.dy),maxZ:Math.max(b.maxZ,p.z+p.dz)}),{minX:0,minY:0,minZ:0,maxX:0,maxY:0,maxZ:0});
 return {version:'ims-mapa-propio-v1',unidad:'m',config:cfg,posiciones,excluidas,bloques,limites,resumen:{registros:filas.length,posiciones:unicas.size,dibujables:posiciones.length,excluidas:excluidas.length,asociacionesCompartidas:filas.length-unicas.size,calculadas:posiciones.filter(p=>p.origenGeometria==='GENERADA_CM').length,explicitas:explicitas.length,medidasPequenas:posiciones.filter(p=>p.medidaPequena).length}};
}
export function filtrarMapa(modelo,f={}){const q=texto(f.buscar).toUpperCase();return modelo.posiciones.filter(p=>(!f.sede||p.sede===f.sede)&&(!f.almacen||p.almacen===f.almacen)&&(!f.bodega||p.bodega===f.bodega)&&(!f.calle||p.calle===f.calle)&&(!f.nivel||p.nivel===f.nivel)&&(!f.cliente||p.clientes.includes(f.cliente))&&(!f.estado||p.estado===f.estado)&&(!q||[p.posicion,p.almacen,p.bodega,p.calle,p.columna,p.nivel,...p.clientes].some(x=>x.toUpperCase().includes(q))));}
export function verticesPosicion(p){const {x,y,z,dx:a,dy:b,dz:h}=p;return [[x,y,z],[x+a,y,z],[x+a,y+b,z],[x,y+b,z],[x,y,z+h],[x+a,y,z+h],[x+a,y+b,z+h],[x,y+b,z+h]];}
