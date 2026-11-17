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
 return !obstaculos.some(o=>!o.areaPiso&&o.tipoVisual!=='PISO'&&o.z<p.z+1.7&&o.z+o.dz>p.z+.15&&p.x>o.x-radio&&p.x<o.x+o.dx+radio&&p.y>o.y-radio&&p.y<o.y+o.dy+radio);
}
export function frentePosicion(p,obstaculos,plano){
 const z=pisoPosicion(p,plano),suelos=suelosAlmacen(obstaculos,plano),candidatos=[{x:p.x+p.dx/2,y:p.y-.6,z,angulo:0},{x:p.x+p.dx/2,y:p.y+p.dy+.6,z,angulo:Math.PI},{x:p.x-.6,y:p.y+p.dy/2,z,angulo:-Math.PI/2},{x:p.x+p.dx+.6,y:p.y+p.dy/2,z,angulo:Math.PI/2}];
 return candidatos.find(c=>puedeCaminar(c,obstaculos,suelos))||null;
}
export function avanzarAvatar(origen,dx,dy,obstaculos,suelos){
 // Barrido en pasos de 10 cm: impide atravesar estanterías con un salto de teclado.
 const pasos=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.1));let p={...origen};for(let i=0;i<pasos;i++){const q={...p,x:p.x+dx/pasos,y:p.y+dy/pasos};if(!puedeCaminar(q,obstaculos,suelos))break;p=q;}return p;
}
export function suelosRecorrido(posiciones,plano,zonas,z){
 if(z<.1)return suelosAlmacen(posiciones,plano);
 const altas=zonas.filter(s=>/MEZZ|JAULA/i.test(s.nombre));if(altas.length)return altas;
 return suelosAlmacen(posiciones.filter(p=>p.piso===2),null);
}
