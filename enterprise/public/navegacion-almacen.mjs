// Geometría de navegación en metros. La selección representa una ubicación virtual, no GPS.
export function suelosAlmacen(posiciones,plano){
 const grupos=new Map();for(const p of posiciones){const k=p.bodega||p.nave||p.almacen||'BODEGA';if(!grupos.has(k))grupos.set(k,[]);grupos.get(k).push(p);}
 const suelos=[];if(plano)suelos.push({id:'BM',x:0,y:0,ancho:plano.ancho,fondo:plano.fondo});
 for(const [id,ps]of grupos){const minX=Math.min(...ps.map(p=>p.x))-3,minY=Math.min(...ps.map(p=>p.y))-3,maxX=Math.max(...ps.map(p=>p.x+p.dx))+3,maxY=Math.max(...ps.map(p=>p.y+p.dy))+3;if(plano&&ps.every(p=>p.x>=0&&p.y>=0&&p.x+p.dx<=plano.ancho&&p.y+p.dy<=plano.fondo))continue;suelos.push({id,x:minX,y:minY,ancho:maxX-minX,fondo:maxY-minY});}
 return suelos;
}
export function pisoPosicion(p,plano){return p.piso===2&&!p.incompatibleAltura&&!p.incompatibleHueco?(plano?.alturaEntrepiso||2.1):0;}
export function puedeCaminar(p,obstaculos,suelos,radio=.18){
 if(!suelos.some(s=>p.x>=s.x+radio&&p.y>=s.y+radio&&p.x<=s.x+s.ancho-radio&&p.y<=s.y+s.fondo-radio))return false;
 return !(Array.isArray(obstaculos)?obstaculos:obstaculos.alrededor(p,radio)).some(o=>!o.areaPiso&&o.tipoVisual!=='PISO'&&o.z<p.z+1.7&&o.z+o.dz>p.z+.15&&p.x>o.x-radio&&p.x<o.x+o.dx+radio&&p.y>o.y-radio&&p.y<o.y+o.dy+radio);
}
export function frentePosicion(p,obstaculos,plano){
 if(p.frenteEstructura&&!p.incompatibleAltura&&!p.incompatibleHueco)p={...p,...p.frenteEstructura};
 const z=pisoPosicion(p,plano),suelos=suelosAlmacen(Array.isArray(obstaculos)?obstaculos:[p],plano),ys=[{x:p.x+p.dx/2,y:p.y-.6,z,angulo:0},{x:p.x+p.dx/2,y:p.y+p.dy+.6,z,angulo:Math.PI}],xs=[{x:p.x-.6,y:p.y+p.dy/2,z,angulo:Math.PI/2},{x:p.x+p.dx+.6,y:p.y+p.dy/2,z,angulo:-Math.PI/2}],candidatos=p.ejeEstructura==='Y'?[...xs,...ys]:[...ys,...xs];
 return candidatos.find(c=>puedeCaminar(c,obstaculos,suelos))||null;
}
export function avanzarAvatar(origen,dx,dy,obstaculos,suelos){
 // Barrido en pasos de 10 cm: impide atravesar estanterías con un salto de teclado.
 const pasos=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.1));let p={...origen};for(let i=0;i<pasos;i++){const q={...p,x:p.x+dx/pasos,y:p.y+dy/pasos};if(puedeCaminar(q,obstaculos,suelos))p=q;else{const x={...p,x:q.x},y={...p,y:q.y};if(dx&&puedeCaminar(x,obstaculos,suelos))p=x;else if(dy&&puedeCaminar(y,obstaculos,suelos))p=y;else break;}}return p;
}
export function suelosRecorrido(posiciones,plano,zonas,z){
 if(z<.1)return suelosAlmacen(posiciones,plano);
 const altas=zonas.filter(s=>/MEZZ|JAULA/i.test(s.nombre));if(altas.length)return altas;
 return suelosAlmacen(posiciones.filter(p=>p.piso===2),null);
}
export function obstaculosEstructuras(modelo,seleccion){
 const ps=modelo.posiciones.filter(p=>p.almacen===seleccion.almacen&&p.sede===seleccion.sede),grupos=new Set(ps.map(p=>p.layoutGrupo)),obs=[];
 for(const m of modelo.marcos.filter(m=>grupos.has(m.id)&&!['PISO','SIN_ASIGNAR_TIPO'].includes(m.tipo)))for(const c of m.columnas)obs.push({x:m.x+(m.eje==='X'?c.inicio:0),y:m.y+(m.eje==='Y'?c.inicio:0),z:m.z,dx:m.eje==='X'?c.ancho:m.profundidad,dy:m.eje==='Y'?c.ancho:m.profundidad,dz:c.alto});
 for(const p of ps)if(p.origenGeometria==='EXPLICITA')obs.push(p);
 return obs;
}
export function indexarObstaculos(rows){
 const celdas=new Map(),paso=4;for(const o of rows)for(let x=Math.floor(o.x/paso);x<=Math.floor((o.x+o.dx)/paso);x++)for(let y=Math.floor(o.y/paso);y<=Math.floor((o.y+o.dy)/paso);y++){const k=x+':'+y;if(!celdas.has(k))celdas.set(k,[]);celdas.get(k).push(o);}
 return {alrededor(p,r=.25){const rset=new Set();for(let x=Math.floor((p.x-r)/paso);x<=Math.floor((p.x+r)/paso);x++)for(let y=Math.floor((p.y-r)/paso);y<=Math.floor((p.y+r)/paso);y++)for(const o of celdas.get(x+':'+y)||[])rset.add(o);return [...rset];}};
}
export function entornoRecorrido(modelo,p){
 const posiciones=modelo.posiciones.filter(r=>r.almacen===p.almacen&&r.sede===p.sede),plano=p.almacen==='CD_QUITO1'?modelo.plano:null;
 return {posiciones,plano,suelos:suelosRecorrido(posiciones,plano,modelo.zonas,pisoPosicion(p,plano)),obstaculos:indexarObstaculos(obstaculosEstructuras(modelo,p))};
}
export function segmentoLibre(a,b,obstaculos,suelos){const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.1));for(let i=0;i<=n;i++)if(!puedeCaminar({...a,x:a.x+(b.x-a.x)*i/n,y:a.y+(b.y-a.y)*i/n},obstaculos,suelos))return false;return true;}
export function rutaPorPasillos(origen,destino,obstaculos,suelos,{paso=.4,limite=25000}={}){
 if(Math.abs(origen.z-destino.z)>.1||!puedeCaminar(origen,obstaculos,suelos)||!puedeCaminar(destino,obstaculos,suelos))return null;
 if(segmentoLibre(origen,destino,obstaculos,suelos))return [origen,destino];
 const gx=Math.round((destino.x-origen.x)/paso),gy=Math.round((destino.y-origen.y)/paso),world=(x,y)=>({...origen,x:origen.x+x*paso,y:origen.y+y*paso}),key=(x,y)=>x+':'+y,cache=new Map(),libre=(x,y)=>{const k=key(x,y);if(!cache.has(k))cache.set(k,puedeCaminar(world(x,y),obstaculos,suelos));return cache.get(k);};
 const heap=[],put=n=>{heap.push(n);let i=heap.length-1;while(i){const j=(i-1)>>1;if(heap[j].f<=n.f)break;heap[i]=heap[j];i=j;}heap[i]=n;},pop=()=>{const n=heap[0],tail=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].f<heap[j].f)j++;if(heap[j].f>=tail.f)break;heap[i]=heap[j];i=j;}heap[i]=tail;}return n;},dist=(x,y)=>Math.hypot(gx-x,gy-y),inicial={x:0,y:0,g:0,f:dist(0,0),padre:null},mejor=new Map([[key(0,0),0]]);put(inicial);
 for(let visitados=0;heap.length&&visitados<limite;visitados++){const n=pop();if(n.g!==mejor.get(key(n.x,n.y)))continue;if(dist(n.x,n.y)<=1.5&&segmentoLibre(world(n.x,n.y),destino,obstaculos,suelos)){const puntos=[destino];for(let q=n;q;q=q.padre)puntos.unshift(world(q.x,q.y));const salida=[puntos[0]];let i=0;while(i<puntos.length-1){let j=puntos.length-1;while(j>i+1&&!segmentoLibre(puntos[i],puntos[j],obstaculos,suelos))j--;salida.push(puntos[j]);i=j;}return salida;}
  for(const [dx,dy]of [[0,1],[1,0],[0,-1],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]){const x=n.x+dx,y=n.y+dy;if(!libre(x,y)||dx&&dy&&(!libre(x,n.y)||!libre(n.x,y)))continue;const g=n.g+Math.hypot(dx,dy),k=key(x,y);if(g>=(mejor.get(k)??Infinity))continue;mejor.set(k,g);put({x,y,g,f:g+dist(x,y),padre:n});}
 }
 return null;
}
export function limitarCamara(origen,destino,obstaculos){
 const pasos=Math.max(1,Math.ceil(Math.hypot(destino.x-origen.x,destino.y-origen.y,destino.z-origen.z)/.08));let ultimo={...origen};for(let i=1;i<=pasos;i++){const t=i/pasos,p={x:origen.x+(destino.x-origen.x)*t,y:origen.y+(destino.y-origen.y)*t,z:origen.z+(destino.z-origen.z)*t};if(obstaculos.alrededor(p,.08).some(o=>p.x>o.x-.08&&p.x<o.x+o.dx+.08&&p.y>o.y-.08&&p.y<o.y+o.dy+.08&&p.z>o.z-.08&&p.z<o.z+o.dz+.08))break;ultimo=p;}return ultimo;
}
