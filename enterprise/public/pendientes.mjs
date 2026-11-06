const NAME='ims-cm-capturas-v1';
let opening;
function db(){
  return opening??=new Promise((resolve,reject)=>{
    const r=indexedDB.open(NAME,1);let rechazado=false;
    r.onupgradeneeded=()=>{
      const s=r.result.createObjectStore('capturas',{keyPath:'operacionId'});
      s.createIndex('actor','actorId');s.createIndex('actor_linea',['actorId','lineaId'],{unique:true});
    };
    r.onsuccess=()=>{
      if(rechazado){r.result.close();return;}
      r.result.onversionchange=()=>{r.result.close();opening=undefined;};resolve(r.result);
    };
    r.onerror=()=>{opening=undefined;reject(Error('No se pudo abrir el almacenamiento de capturas.'));};
    r.onblocked=()=>{rechazado=true;opening=undefined;reject(Error('Cierra otras pestañas de esta candidata y recarga la página.'));};
  });
}
async function transaccion(mode,work){
  const d=await db();return new Promise((resolve,reject)=>{
    const t=d.transaction('capturas',mode),s=t.objectStore('capturas');let result;
    t.oncomplete=()=>resolve(result);t.onabort=()=>reject(Error('No se pudo conservar la captura en este navegador.'));
    t.onerror=()=>{};
    try{work(s,v=>{result=v;});}catch(e){t.abort();reject(e);}
  });
}
export function listarPendientes(actorId){
  return transaccion('readonly',(s,set)=>{const r=s.index('actor').getAll(actorId);r.onsuccess=()=>set(r.result);});
}
export function guardarPendiente(record){
  return transaccion('readwrite',(s,set)=>{
    const r=s.index('actor_linea').get([record.actorId,record.lineaId]);
    r.onsuccess=()=>{
      if(r.result){set({nuevo:false,registro:r.result});return;}
      s.add(record);set({nuevo:true,registro:record});
    };
  });
}
export function confirmarPendiente(actorId,operacionId){
  return transaccion('readwrite',(s,set)=>{
    const r=s.get(operacionId);r.onsuccess=()=>{
      if(r.result?.actorId===actorId){s.delete(operacionId);set(true);}else set(false);
    };
  });
}
