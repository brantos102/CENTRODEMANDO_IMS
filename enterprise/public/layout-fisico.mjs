/** Geometría física: unidades de catálogo en cm, posiciones del layout en m.
 * Nunca transforma el nombre, stock o las capturas del inventario. */
const cmp=new Intl.Collator('es',{numeric:true}).compare;
const txt=x=>String(x??'').trim().toUpperCase();
export function identificarEstructura(p){
 const parts=txt(p.posicion).split('-'),nave=txt(p.bodega||parts[0]),literal=txt(p.calle||parts[1]),tipoOriginal=txt(p.tipo||p.descripcion||p.origen?.datos?.TIPO_POS),mz=['MZ','MZJV'].includes(nave),m=mz?/^([12])(.+)$/.exec(literal):null;
 const piso=nave==='MZJV'?2:m?Number(m[1]):1,literalSinPiso=m?m[2]:literal;
 let tipo=tipoOriginal;if(mz&&/[A-Z]G$/.test(literalSinPiso))tipo='GAVETA';if(nave==='MZJV')tipo=tipoOriginal||'RACK_LIVIANO';if(nave==='BM'&&/^[ABC][12]$/.test(literal))tipo='ESTANTERIA';
 if(tipo==='PISO'||/^(?:TRAN[S]?[_-]?ING(?:RESO)?|BPA|BPB|PISO)/.test(txt(p.posicion)))tipo='PISO';
 const gaveta=tipo==='GAVETA',base=gaveta&&literalSinPiso.length>1&&literalSinPiso.endsWith('G')?literalSinPiso.slice(0,-1):literalSinPiso;
 return {nave,literal,literalBase:base,piso,tipoVisual:tipo||'SIN_ASIGNAR_TIPO',tipoOriginal,seguridad:nave.endsWith('JV'),columna:txt(p.columna||parts[2]),nivel:txt(p.nivel||parts[3]),gaveta:gaveta?txt(p.profundidad||parts.slice(4).join('-')):''};
}
export function validarPerfilLayout(p){
 if(!p||p.formato!=='ims-layout-fisico-v1'||p.sede!=='UIO'||p.almacen!=='CD_QUITO1'||!Array.isArray(p.racks)||p.racks.length>200||!Array.isArray(p.zonas)||p.zonas.length>100)throw Error('Layout físico incompatible.');
 for(const k of ['ancho','fondo','alturaEntrepiso'])if(!Number.isFinite(p[k])||p[k]<=0||p[k]>1000)throw Error('Dimensión del layout incompatible.');
 if(typeof p.nombre!=='string'||!p.nombre||p.nombre.length>255||!/^[a-f0-9]{64}$/.test(p.sha256Pdf))throw Error('Identificación del plano incompatible.');
 const keys=new Set();for(const r of p.racks){if(!/^[A-Z0-9]+$/.test(r.nave)||!/^[A-Z0-9]+$/.test(r.literal)||!['X','Y'].includes(r.eje)||![1,2].includes(r.piso)||!Number.isFinite(r.x)||!Number.isFinite(r.y)||Math.min(r.x,r.y)<0||r.x>p.ancho||r.y>p.fondo)throw Error('Ancla del layout incompatible.');const k=[r.nave,r.literal,r.piso].join(':');if(keys.has(k))throw Error('Ancla duplicada.');keys.add(k);}
 for(const z of p.zonas)if(typeof z.nombre!=='string'||z.nombre.length>150||!['x','y','ancho','fondo'].every(k=>Number.isFinite(z[k])&&z[k]>=0)||z.x+z.ancho>p.ancho+.01||z.y+z.fondo>p.fondo+.01)throw Error('Zona del layout incompatible.');
 return structuredClone(p);
}
const claveCol=r=>r.tipoVisual==='PISO'?r.posicion:(r.columna||r.posicion)+(r.tipoVisual!=='GAVETA'&&r.profundidad?':'+r.profundidad:'');
const max=(a,f,def=0)=>a.reduce((m,x)=>Math.max(m,f(x)),def);
export function aplicarLayoutFisico(modelo,perfil=null){
 const plano=perfil?validarPerfilLayout(perfil):null,ps=modelo.posiciones.map(p=>({...p,...identificarEstructura(p),dimensionesCm:[...p.dimensionesCm]})),grupos=new Map(),anclas=new Map(plano?.racks.map(r=>[[r.nave,r.literal,r.piso].join(':'),r])||[]),marcos=[],zonas=plano?.zonas.map(z=>({...z}))||[],avisos=[];
 for(const p of ps){if(p.origenGeometria==='EXPLICITA')continue;const gk=JSON.stringify([p.sede,p.almacen,p.nave,p.literalBase,p.piso]);if(!grupos.has(gk))grupos.set(gk,[]);grupos.get(gk).push(p);}
 let provisionalX=plano?plano.ancho+42:35,provisionalY=0,alturaFila=0,indice=0;
 for(const [key,rows]of [...grupos].sort(([a],[b])=>cmp(a,b))){const ref=rows[0],tipos=rows.filter(r=>r.tipoVisual!=='GAVETA'),ligero=['MZ','MZJV'].includes(ref.nave)||rows.some(r=>r.tipoVisual==='RACK_LIVIANO'),est=rows.every(r=>r.tipoVisual==='ESTANTERIA'),baseSpan=max(tipos,r=>Math.max(...r.dimensionesCm.slice(0,2))/100)||(ligero?2.4:est?1:1.2),baseProf=max(tipos,r=>Math.min(...r.dimensionesCm.slice(0,2))/100)||(ligero?.6:est?.4:1),h=max(tipos,r=>r.dimensionesCm[2]/100)||(ligero?.6:est?.35:1.35),columnas=[...new Set(rows.map(claveCol))].sort(cmp),anchos=new Map(),cols=new Map();
  for(const c of columnas){const rs=rows.filter(r=>claveCol(r)===c);anchos.set(c,max(rs.filter(r=>r.tipoVisual!=='GAVETA'),r=>Math.max(...r.dimensionesCm.slice(0,2))/100,baseSpan));}
  let total=0;for(const c of columnas){cols.set(c,total);total+=anchos.get(c);}
  let a=ref.sede==='UIO'&&ref.almacen==='CD_QUITO1'?anclas.get([ref.nave,ref.literalBase,ref.piso].join(':')):null;
  const anclado=!!a;
  if(!a&&ref.nave==='B2'&&/^[A-G]$/.test(ref.literalBase)){const i=ref.literalBase.charCodeAt(0)-65;const offset=i===0?0:4+Math.floor((i-1)/2)*5+((i-1)%2)*1.2;a={x:(plano?plano.ancho+8:0)+offset,y:0,eje:'Y',piso:1};}
  if(!a){if(indice&&indice%5===0){provisionalX=(plano?plano.ancho+42:35);provisionalY+=alturaFila+4;alturaFila=0;}a={x:provisionalX,y:provisionalY,eje:'Y',piso:ref.piso};provisionalX+=baseProf+3;alturaFila=Math.max(alturaFila,total);indice++;avisos.push({grupo:key,codigo:'SIN_ANCLA_EN_PLANO'});}
  const zBase=ref.piso===2?(plano?.alturaEntrepiso||2.1):0,medidasCol=[];
  for(const c of columnas){const cr=rows.filter(r=>claveCol(r)===c),nivelMax=max(cr,r=>/^\d+$/.test(r.nivel)?Number(r.nivel):1,1),w=anchos.get(c),porFila=Math.max(1,Math.floor(w/.29)),alturas=Array.from({length:nivelMax},()=>h),limitePiso=plano?.alturaEntrepiso||2.1;
   if(['MZ','MZJV'].includes(ref.nave)&&h>=.6){let exceso=alturas.reduce((a,b)=>a+b,0)-limitePiso;for(let n=nivelMax-1;n>=0&&exceso>.001;n--){const gs=cr.filter(p=>p.tipoVisual==='GAVETA'&&Number(p.nivel)===n+1),necesario=max(gs,p=>{const cap=Math.max(1,Math.floor(w/(p.dimensionesCm[1]/100)));return Math.ceil(Math.max(1,Number(p.gaveta)||1)/cap)*p.dz;});const candidatas=[.3,.4].filter(v=>v>=necesario-.001&&v<alturas[n]-.001),objetivo=alturas[n]-exceso,preferidas=candidatas.filter(v=>v<=objetivo+.001),nueva=preferidas.length?Math.max(...preferidas):candidatas.length?Math.min(...candidatas):alturas[n];exceso-=alturas[n]-nueva;alturas[n]=nueva;}}
   const bases=alturas.map((_,i)=>alturas.slice(0,i).reduce((a,b)=>a+b,0));
   for(const p of cr){let span=Math.max(...p.dimensionesCm.slice(0,2))/100,prof=Math.min(...p.dimensionesCm.slice(0,2))/100,ox=0,oz=0;const nivel=/^\d+$/.test(p.nivel)?Math.max(1,Number(p.nivel)):1;
    if(p.tipoVisual==='GAVETA'){span=p.dimensionesCm[1]/100;prof=p.dimensionesCm[0]/100;const n=/^\d+$/.test(p.gaveta)?Math.max(1,Number(p.gaveta)):1,cap=Math.max(1,Math.floor(w/span));ox=((n-1)%cap)*span;oz=Math.floor((n-1)/cap)*p.dz;if(oz+p.dz>alturas[nivel-1]+.001){p.incompatibleHueco=true;avisos.push({posicion:p.posicion,codigo:'GAVETAS_SUPERAN_HUECO'});}}
    const u=cols.get(c)+ox,v=0;p.x=a.x+(a.eje==='X'?u:v);p.y=a.y+(a.eje==='X'?v:u);p.dx=a.eje==='X'?span:prof;p.dy=a.eje==='X'?prof:span;p.z=zBase+bases[nivel-1]+oz;p.dz=p.dimensionesCm[2]/100;if(p.tipoVisual!=='GAVETA'&&alturas[nivel-1]<p.dz-.001){p.dz=alturas[nivel-1];p.alturaHuecoVisualCm=p.dz*100;p.alturaVisualProvisional=true;avisos.push({posicion:p.posicion,codigo:'ALTURA_SUPERIOR_AJUSTADA_PROVISIONAL'});}if(['MZ','MZJV'].includes(p.nave)&&p.z+p.dz-zBase>(plano?.alturaSegundaPlanta||plano?.alturaEntrepiso||2.1)+.001){p.incompatibleAltura=true;avisos.push({posicion:p.posicion,codigo:'ALTURA_SUPERA_PISO_MEZZANINE'});}p.layoutGrupo=key;p.origenGeometria=anclado?'PLANO_PDF_CM':'DISTRIBUCION_PROVISIONAL_CM';p.contenedor=p.tipoVisual!=='GAVETA'&&cr.some(r=>r.tipoVisual==='GAVETA'&&r.nivel===p.nivel);
    if(p.tipoVisual==='PISO'){p.z=zBase;p.areaPiso=true;}
   }
   const altoMarco=['MZ','MZJV'].includes(ref.nave)?Math.min(limitePiso,alturas.reduce((a,b)=>a+b,0)):alturas.reduce((a,b)=>a+b,0);medidasCol.push({inicio:cols.get(c),ancho:w,alto:altoMarco,niveles:bases.filter(z=>z<altoMarco-.001)});
  }
  marcos.push({id:key,nave:ref.nave,literal:ref.literalBase,piso:ref.piso,seguridad:ref.seguridad,x:a.x,y:a.y,z:zBase,eje:a.eje,ancho:total,profundidad:baseProf,alto:max(medidasCol,r=>r.alto),columnas:medidasCol,tipo:rows.every(p=>p.tipoVisual==='PISO')?'PISO':est?'ESTANTERIA':ligero?'RACK_LIVIANO':'RACK',provisional:!anclado});
 }
 const incompatibles=ps.filter(p=>p.incompatibleHueco||p.incompatibleAltura),pasoX=max(incompatibles,p=>p.dx)+.3,pasoY=max(incompatibles,p=>p.dy)+.3;let fuera=0;for(const p of incompatibles){p.x=(plano?.ancho||25)+8+(fuera%12)*pasoX;p.y=(plano?.fondo||100)+8+Math.floor(fuera/12)*pasoY;p.z=0;p.layoutGrupo='GAVETAS_PARA_REVISION';p.origenGeometria='DISTRIBUCION_PROVISIONAL_CM';fuera++;}
 const limites=ps.reduce((b,p)=>({minX:Math.min(b.minX,p.x),minY:Math.min(b.minY,p.y),minZ:0,maxX:Math.max(b.maxX,p.x+p.dx),maxY:Math.max(b.maxY,p.y+p.dy),maxZ:Math.max(b.maxZ,p.z+p.dz)}),{minX:0,minY:0,maxX:plano?.ancho||0,maxY:plano?.fondo||0,maxZ:0});
 return {...modelo,version:'ims-layout-fisico-v2',posiciones:ps,marcos,zonas,plano,avisos,limites,excluidas:modelo.excluidas.map(p=>({...p,...identificarEstructura(p)}))};
}
