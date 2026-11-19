export const celda=v=>({effectiveValue:typeof v==='number'?{numberValue:v}:{stringValue:String(v??'')},formattedValue:String(v??'')});
export function maestroCentroGoogle({correo='existente@sintetico.invalid',titulo='Conteo maestro sintético',estado='Pendiente',avance=0,responsable='Revisor ERP',fecha='19/11/2026'}={}){
 const cab=Array(20).fill('').map(celda);cab[4]=celda('CLIENTE');cab[11]=celda('FECHA DE INICIO');cab[12]=celda('ESTADO');const r=Array(20).fill('').map(celda);for(const [i,v]of [[3,titulo],[4,'BELIA'],[5,'Inventario Cíclico'],[7,'MENSUAL'],[8,responsable],[9,'Alta'],[10,'Observación de origen'],[11,fecha],[12,estado],[14,2]])r[i]=celda(v);r[15]={effectiveValue:{numberValue:avance/100},formattedValue:avance+'%'};
 return {cronograma:[...Array.from({length:7},()=>[]),cab,r],usuarios:[['Correo','Nombre','Rol','Teléfono','Activo','','','Rol WMS'].map(celda),[correo,'Revisor ERP','ADMIN','','TRUE','','','ADMIN','CLAVE_GOOGLE_NO_LEER'].map(celda)]};
}
