const ROLES={ADMIN:'Administrador',COORDINADOR:'Coordinador',LIDER:'Líder de conteo',OPERARIO:'Operario',AUDITOR:'Auditor'};
const crear=(tag,texto,clase)=>{const e=document.createElement(tag);if(texto)e.textContent=texto;if(clase)e.className=clase;return e;};
export function opcionesNavegacion(perfil,{autenticado=false,crearInventario=false}={}){
 if(!autenticado)return [];
 const p=perfil?.permisos||{},pendiente=!!perfil?.cambiar_clave;
 const items=[{grupo:'Mi cuenta',titulo:'Mi perfil',descripcion:pendiente?'Completar tu clave inicial para comenzar':'Datos de contacto y contraseña',ruta:'/centro#perfil',vista:'perfil'}];
 if(pendiente)return items;
 items.push({grupo:'Operación',titulo:'Centro de Mando',descripcion:'Agenda, equipo e inventarios actuales',ruta:'/centro',vista:'dashboard'},
  {grupo:'Operación',titulo:'Conteo físico',descripcion:'Elegir posición, registrar cantidades y evidencias',ruta:'/ims'},
  {grupo:'Consulta',titulo:'Ubicaciones',descripcion:'Mapa del almacén, posiciones y ocupación',ruta:'/catalogos'});
 if(p.crear===true||crearInventario)items.push({grupo:'Operación',titulo:'Crear inventario',descripcion:'Preparar clientes, stock y programación',ruta:'/crear'},
  {grupo:'Operación',titulo:'Administrar inventarios',descripcion:'Revisar permisos, conteos y entregas',ruta:'/operacion'},
  {grupo:'Consulta',titulo:'Stock ITSANET',descripcion:'Consultar existencias de los clientes autorizados',ruta:'/erp'});
 if(p.usuarios===true)items.push({grupo:'Equipo',titulo:'Usuarios y permisos',descripcion:'Gestionar las cuentas permitidas por tu rol',ruta:'/centro#usuarios',vista:'usuarios'});
 if(p.analitica===true)items.push({grupo:'Resultados',titulo:'Analítica del equipo',descripcion:'Revisar carga de trabajo, avance y asignaciones',ruta:'/centro#analitica',vista:'analitica'});
 if(p.exportar===true)items.push({grupo:'Resultados',titulo:'Reportes por cliente',descripcion:'Consultar entregados y descargar sus resultados',ruta:'/centro#reportes',vista:'reportes'});
 if(p.administrar===true)items.push({grupo:'Administración',titulo:'Validar inventarios de Google',descripcion:'Leer novedades, revisar diferencias e incorporar',accion:'conexiones'},
  {grupo:'Administración',titulo:'Cuenta, agenda y recordatorios',descripcion:'Configurar los servicios del equipo',accion:'cuenta'},
  {grupo:'Administración',titulo:'Cierre operativo',descripcion:'Comprobar incorporación y accesos pendientes',accion:'fuentes-cierre'});
 items.push({grupo:'Mi cuenta',titulo:'Configurar mi espacio',descripcion:'Modo día o noche y módulos visibles',accion:'personalizar'},
  {grupo:'Mi cuenta',titulo:'Ayuda de esta pantalla',descripcion:'Cómo utilizar sus funciones',accion:'ayuda'});
 return items;
}

/** Un menú común que conserva los controles y permisos de cada pantalla. */
export function instalarNavegacionUI({header,nav,personalizar}){
 let perfil=null,sesion=null,puedeCrear=false;
 const dialog=crear('dialog',undefined,'suite-menu');dialog.id='ims-menu-trabajo';dialog.setAttribute('aria-labelledby','ims-menu-titulo');
 const cab=crear('div',undefined,'suite-menu-cabecera'),texto=crear('div'),titulo=crear('h2','Tu espacio de trabajo');titulo.id='ims-menu-titulo';const descripcion=crear('p','Funciones disponibles para tu cuenta y sede.'),cerrar=crear('button','Cerrar');cerrar.type='button';cerrar.onclick=()=>dialog.close();texto.append(titulo,descripcion);cab.append(texto,cerrar);
 const buscar=crear('input');buscar.type='search';buscar.placeholder='¿Qué necesitas hacer?';buscar.setAttribute('aria-label','Buscar función del aplicativo');const lista=crear('div',undefined,'suite-menu-lista');dialog.append(cab,buscar,lista);document.body.append(dialog);
 const botones=[],lugares=[header,document.querySelector('body.centro-mando>header'),document.querySelector('.ims-header-acciones')].filter((x,i,a)=>x&&a.indexOf(x)===i);
 for(const lugar of lugares){const b=crear('button','Menú de trabajo','suite-menu-abrir');b.type='button';b.disabled=true;b.title='Busca y abre las funciones disponibles para tu perfil. Conserva el inventario al cambiar de área.';b.setAttribute('aria-description',b.title);b.setAttribute('aria-controls',dialog.id);b.setAttribute('aria-haspopup','dialog');b.onclick=()=>{buscar.value='';pintar();dialog.showModal();buscar.focus();};lugar.append(b);botones.push(b);}
 const insignias=[];for(const lugar of lugares){const rol=crear('span',undefined,'suite-rol');rol.hidden=true;lugar.append(rol);insignias.push(rol);}
 function navegar(ruta){const destino=new URL(ruta,location.origin),id=document.getElementById('op-inventario')?.value||new URL(location.href).searchParams.get('inventario');if(/^[a-f0-9-]{36}$/.test(id||'')&&['/centro','/ims','/operacion','/catalogos'].includes(destino.pathname))destino.searchParams.set('inventario',id);location.href=destino.pathname+destino.search+destino.hash;}
 function ejecutar(item){dialog.close();if(item.accion==='personalizar'){personalizar.click();return;}if(item.accion==='ayuda'){(document.querySelector('.ims-header-acciones .ayuda-ims-boton')||document.querySelector('body.centro-mando>header .ayuda-ims-boton')||document.querySelector('.suite-header .ayuda-ims-boton'))?.click();return;}
  if(item.accion){if(document.body.classList.contains('centro-mando')){if(item.accion==='cuenta')document.dispatchEvent(new CustomEvent('ims:conexiones',{detail:{seccion:'cuenta'}}));else document.getElementById(item.accion)?.click();}else navegar('/centro#'+(item.accion==='fuentes-cierre'?'cierre':item.accion==='cuenta'?'configuracion-google':'validacion-google'));return;}
  if(item.vista&&document.body.classList.contains('centro-mando')){document.querySelector('#navegacion [data-vista="'+item.vista+'"]')?.click();return;}
  const a=[...nav.querySelectorAll('a')].find(a=>a.dataset.area===item.ruta);if(a){a.click();return;}navegar(item.ruta);
 }
 function pintar(){descripcion.textContent=(ROLES[perfil?.rol]||'Usuario autorizado')+(perfil?.sedes?.length?' · '+perfil.sedes.join(' / '):'')+(perfil?.cambiar_clave?' · Cambia tu clave inicial para comenzar.':' · Funciones disponibles para tu cuenta.');const q=buscar.value.trim().toLocaleLowerCase('es'),opciones=opcionesNavegacion(perfil,{autenticado:!!sesion,crearInventario:puedeCrear}).filter(i=>!q||(i.titulo+' '+i.descripcion+' '+i.grupo).toLocaleLowerCase('es').includes(q));lista.replaceChildren();for(const grupo of ['Operación','Equipo','Resultados','Consulta','Administración','Mi cuenta']){const items=opciones.filter(i=>i.grupo===grupo);if(!items.length)continue;const seccion=crear('section'),h=crear('h3',grupo);seccion.append(h);for(const item of items){const b=crear('button',undefined,'suite-menu-item');b.type='button';b.append(crear('strong',item.titulo),crear('span',item.descripcion),crear('i','›'));b.onclick=()=>ejecutar(item);seccion.append(b);}lista.append(seccion);}if(!opciones.length)lista.append(crear('p','No hay funciones que coincidan con tu búsqueda.'));}
 buscar.oninput=pintar;
 document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&!e.repeat&&sesion){if(!dialog.open&&(e.target?.closest?.('input,textarea,select,[contenteditable=true]')||document.querySelector('dialog[open]')))return;e.preventDefault();if(dialog.open){dialog.close();return;}botones.find(b=>b.getClientRects().length)?.click();}});
 document.addEventListener('ims:vista',e=>{document.querySelector('.suite-area-actual')?.replaceChildren(document.createTextNode(e.detail?.titulo||'Centro de Mando'));});
 return {actualizar(p,s,{crear=false}={}){perfil=p;sesion=s;puedeCrear=crear;for(const b of botones)b.disabled=!s;const rol=ROLES[p?.rol]||'Usuario autorizado';for(const b of insignias){b.hidden=!s;b.textContent=p?.cambiar_clave?'Clave inicial pendiente':rol;}if(dialog.open){if(!s)dialog.close();else pintar();}}};
}
