export function rutaDestino(sede,fecha,cliente){
 if(!['UIO','GYE'].includes(sede)||!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||new Date(fecha+'T12:00:00Z').toISOString().slice(0,10)!==fecha||!String(cliente||'').trim())throw Error('Selecciona sede, fecha válida y cliente para definir el destino.');
 return [sede,fecha.slice(0,4),fecha.slice(5,7),String(cliente).trim()];
}
