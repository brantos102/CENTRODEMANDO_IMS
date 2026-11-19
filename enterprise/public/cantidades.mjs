/** Presentación es-EC de decimales exactos. No usar para interpretar entradas. */
export function formatearCantidad(value){
 if(value===null||value===undefined||value==='')return '—';
 if(typeof value==='number'){if(!Number.isSafeInteger(value))throw Error('Cantidad recibida sin precisión exacta.');value=String(value);}
 if(typeof value!=='string'||!/^(-?)(\d{1,40})(?:\.(\d{1,9}))?$/.test(value))throw Error('Formato de cantidad no reconocido.');
 const [,signo,n,d='']=/^(-?)(\d+)(?:\.(\d+))?$/.exec(value),entero=n.replace(/^0+(?=\d)/,''),decimales=d.replace(/0+$/,'');
 return (signo&&(entero!=='0'||decimales)?'-':'')+entero.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+(decimales?','+decimales:'');
}
/** Solo para indicadores; las tablas y archivos conservan el decimal exacto. */
export function formatearCompacto(value){
 const exacto=formatearCantidad(value);if(exacto==='—')return exacto;const s=String(value),neg=s.startsWith('-'),[n,d='']=s.replace(/^-/, '').split('.'),v=BigInt(n)*1000000000n+BigInt(d.padEnd(9,'0'));if(v<1000000000000n)return exacto;
 let factor=v>=1000000000000000n?1000000000000000n:1000000000000n,sufijo=factor===1000000000000n?'K':'M',r=(v*100n+factor/2n)/factor;if(sufijo==='K'&&r>=100000n){factor*=1000n;sufijo='M';r=(v*100n+factor/2n)/factor;}
 return (neg?'-':'')+formatearCantidad(String(r/100n)+'.'+String(r%100n).padStart(2,'0'))+' '+sufijo;
}
