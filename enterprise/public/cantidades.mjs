/** Presentación es-EC de decimales exactos. No usar para interpretar entradas. */
export function formatearCantidad(value){
 if(value===null||value===undefined||value==='')return '—';
 if(typeof value==='number'){if(!Number.isSafeInteger(value))throw Error('Cantidad recibida sin precisión exacta.');value=String(value);}
 if(typeof value!=='string'||!/^(-?)(\d{1,40})(?:\.(\d{1,9}))?$/.test(value))throw Error('Formato de cantidad no reconocido.');
 const [,signo,n,d='']=/^(-?)(\d+)(?:\.(\d+))?$/.exec(value),entero=n.replace(/^0+(?=\d)/,''),decimales=d.replace(/0+$/,'');
 return (signo&&(entero!=='0'||decimales)?'-':'')+entero.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+(decimales?','+decimales:'');
}
