// CSV textual: conserva SKU, ceros, celdas vacías y filas repetidas.
export function leerCsv(text){
 if(typeof text!=='string'||text.length>24*1024*1024)throw Error('CSV demasiado grande.');
 text=text.replace(/^\uFEFF/,'');
 const primera=text.split(/\r?\n/,1)[0];
 const separador=primera.includes(';')?';':primera.includes('\t')?'\t':',';
 const rows=[];let row=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;continue;}
  if(ch==='"'){if(cell||closed)throw Error('Comillas CSV inválidas.');quoted=true;continue;}
  if(ch===separador){row.push(cell);cell='';closed=false;continue;}
  if(ch==='\n'||ch==='\r'){
   if(ch==='\r'&&text[i+1]==='\n')i++;
   row.push(cell);if(row.some(v=>v!==''))rows.push(row);row=[];cell='';closed=false;
  }else{if(closed)throw Error('Texto después de comillas CSV.');cell+=ch;}
 }
 if(quoted)throw Error('Comillas CSV sin cerrar.');
 row.push(cell);if(row.some(v=>v!==''))rows.push(row);
 if(rows.length<2||rows.length>100001)throw Error('El CSV debe tener cabecera y de 1 a 100.000 líneas.');
 const head=rows.shift().map(v=>v.trim().toLowerCase());
 if(new Set(head).size!==head.length||head.some(x=>!x)||!head.includes('sku')||!head.includes('depot'))throw Error('Cabeceras inválidas: requiere sku y depot, sin duplicados.');
 const permitidos=['cliente_id','sku','depot','descripcion','posicion','serie','lote','unidad','abc','despacho','partida','categoria','estado_mercancia'];
 if(head.some(h=>!permitidos.includes(h)))throw Error('Columna desconocida; usa la plantilla de stock.');
 return rows.map((r,i)=>{if(r.length!==head.length)throw Error('Ancho distinto a la cabecera en fila '+(i+2));return Object.fromEntries(head.map((h,k)=>[h,r[k]]));});
}
export function cantidadCsv(v,formato){
 v=String(v).trim();
 if(formato==='coma_decimal'){
  if(!/^\d+(?:,\d{1,9})?$/.test(v))throw Error('Cantidad inválida para coma decimal. No admite separadores de miles.');v=v.replace(',','.');
 }else if(formato==='coma_miles'){
  if(!/^(?:\d+|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,9})?$/.test(v))throw Error('Agrupación de miles inválida.');v=v.replaceAll(',','');
 }else if(formato!=='punto_decimal')throw Error('Selecciona el formato de cantidades.');
 if(!/^\d+(?:\.\d{1,9})?$/.test(v))throw Error('Cantidad inválida: no se convierte texto o negativo a cero.');
 let [n,d='']=v.split('.');n=n.replace(/^0+(?=\d)/,'');if(n.length>21)throw Error('Cantidad fuera de precisión.');
 return n+'.'+d.padEnd(9,'0');
}
export function prepararCsv(text,{clienteId,formato}){
 return leerCsv(text).map((r,i)=>({numero:i+1,clienteId:r.cliente_id||clienteId,sku:r.sku.trim(),depot:cantidadCsv(r.depot,formato),
  ...Object.fromEntries(['descripcion','posicion','serie','lote','unidad','abc','despacho','partida','categoria'].map(k=>[k,r[k]??''])),estadoMercancia:r.estado_mercancia??''}));
}
export function sumaStock(rows){const sum=rows.reduce((s,r)=>s+BigInt(r.depot.replace('.','')),0n);return (sum/1000000000n)+'.'+String(sum%1000000000n).padStart(9,'0');}
