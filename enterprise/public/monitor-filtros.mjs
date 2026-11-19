export function filtrarMonitor(inventarios,{hoy,dias=15,estado='ACTIVOS',buscar='',equipo=null}={}){
 const n=[1,7,15,30].includes(Number(dias))?Number(dias):15,desde=new Date(Date.parse(hoy+'T12:00Z')-(n-1)*86400000).toISOString().slice(0,10),q=buscar.trim().toLocaleLowerCase('es');
 return inventarios.filter(i=>String(i.fecha_inicio).slice(0,10)>=desde&&String(i.fecha_inicio).slice(0,10)<=hoy&&(estado==='ACTIVOS'?['EN_PROCESO','EN_VALIDACION'].includes(i.estado):i.estado===estado)&&(!equipo||equipo.has(i.id))&&(!q||(i.cliente+' '+i.codigo_operativo).toLocaleLowerCase('es').includes(q))).sort((a,b)=>String(b.fecha_inicio).localeCompare(String(a.fecha_inicio))||a.codigo_operativo.localeCompare(b.codigo_operativo));
}
