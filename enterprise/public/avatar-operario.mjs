import * as THREE from './vendor/three.module.min.js';
/** Operario virtual de 1,75 m. Su posición representa la selección, no un seguimiento físico. */
export function crearOperario(){
 const grupo=new THREE.Group();grupo.name='operario-ims';const materiales=new Map();
 function material(color){if(!materiales.has(color))materiales.set(color,new THREE.MeshStandardMaterial({color,roughness:.7}));return materiales.get(color);}
 function pieza(geo,color,x,y,z,parent=grupo){const m=new THREE.Mesh(geo,material(color));m.position.set(x,y,z);parent.add(m);return m;}
 const caja=(w,d,h,c,x,y,z,parent)=>pieza(new THREE.BoxGeometry(w,d,h),c,x,y,z,parent);
 const esfera=(r,c,x,y,z,sx=1,sy=1,sz=1)=>{const m=pieza(new THREE.SphereGeometry(r,16,12),c,x,y,z);m.scale.set(sx,sy,sz);return m;};
 caja(.35,.24,.46,0x1856a1,0,0,1.05);caja(.37,.26,.35,0xffcf25,0,0,1.08);
 for(const x of [-.105,.105])caja(.035,.015,.35,0xeefbff,x,.14,1.08);caja(.38,.015,.035,0xeefbff,0,.14,1.01);
 esfera(.13,0xe4b58c,0,0,1.46,.85,.9,1.15);
 for(const x of [-.042,.042])esfera(.013,0x182b4e,x,.117,1.48);
 const casco=pieza(new THREE.SphereGeometry(.16,20,12,0,Math.PI*2,0,Math.PI/2),0x2685ff,0,0,1.57);casco.rotation.x=Math.PI/2;
 const ala=pieza(new THREE.CylinderGeometry(.18,.18,.025,24),0x2674dc,0,.015,1.57);ala.rotation.x=Math.PI/2;
 caja(.028,.22,.02,0xeefbff,0,.015,1.725);
 const piernas=[],brazos=[];for(const [i,x]of [-.105,.105].entries()){
  const pierna=new THREE.Group();pierna.position.set(x,0,.85);grupo.add(pierna);piernas.push(pierna);
  caja(.14,.19,.65,0x193c70,0,0,-.32,pierna);caja(.15,.2,.045,0xe8f468,0,0,-.51,pierna);caja(.17,.29,.13,0x18263e,0,.04,-.765,pierna);
  const brazo=new THREE.Group();brazo.position.set(x<0?-.25:.25,0,1.25);grupo.add(brazo);brazos.push(brazo);
  const m=pieza(new THREE.CapsuleGeometry(.065,.3,4,10),0x1856a1,0,0,-.19,brazo);m.rotation.x=Math.PI/2;caja(.14,.14,.04,0xe8f468,0,0,-.29,brazo);pieza(new THREE.SphereGeometry(.068,12,8),0xe4b58c,0,.02,-.43,brazo);
 }
 const sombra=new THREE.Mesh(new THREE.CircleGeometry(.34,24),new THREE.MeshBasicMaterial({color:0x172f54,transparent:true,opacity:.25,depthWrite:false}));sombra.position.z=.012;grupo.add(sombra);
 return {grupo,animar(distancia=0){const a=Math.sin(distancia*9)*.42;for(let i=0;i<2;i++){piernas[i].rotation.x=(i?-1:1)*a;brazos[i].rotation.x=(i?1:-1)*a*.7;}},reposar(){for(const m of [...piernas,...brazos])m.rotation.x=0;},destruir(){const geos=new Set(),mats=new Set();grupo.traverse(o=>{if(o.geometry&&!o.isSprite)geos.add(o.geometry);if(o.material)mats.add(o.material);});for(const g of geos)g.dispose();for(const m of mats){m.map?.dispose();m.dispose();}grupo.clear();}};
}
