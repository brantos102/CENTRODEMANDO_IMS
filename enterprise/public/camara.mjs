/** Cámara local: no sube imágenes ni activa audio. Una lectura cierra el flujo. */
export async function iniciarCamara(video,{alLeer,alFallar,limiteMs=60000}={}){
 if(!globalThis.BarcodeDetector||!navigator.mediaDevices?.getUserMedia)throw Error('Este navegador no admite lectura con cámara. Usa un lector físico o escribe la serie.');
 let stream,timer,detenido=false;
 const cerrar=()=>{if(detenido)return;detenido=true;clearTimeout(timer);for(const track of stream?.getTracks()||[])track.stop();video.srcObject=null;};
 try{
  const formatos=['code_128','code_39','code_93','codabar','ean_13','ean_8','upc_a','upc_e','itf','qr_code','data_matrix','pdf417','aztec'];
  const soportados=await globalThis.BarcodeDetector.getSupportedFormats?.();
  const formats=soportados?formatos.filter(f=>soportados.includes(f)):undefined;
  if(formats&&!formats.length)throw Error('No hay formatos compatibles con la cámara de este navegador.');
  const detector=new globalThis.BarcodeDetector(formats?{formats}:{});
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  video.srcObject=stream;await video.play();const inicio=Date.now();
  const leer=async()=>{
   if(detenido)return;
   if(Date.now()-inicio>=limiteMs){cerrar();alFallar?.(Error('No se detectó una serie. Acerca el código o usa el lector físico.'));return;}
   try{
    if(video.readyState>=2){const values=await detector.detect(video);if(detenido)return;
     const valor=values.find(v=>typeof v.rawValue==='string'&&v.rawValue.trim())?.rawValue;
     if(valor){cerrar();alLeer?.(valor);return;}
    }
    timer=setTimeout(leer,200);
   }catch{cerrar();alFallar?.(Error('No se pudo leer el código con la cámara. Escribe la serie o usa el lector físico.'));}
  };
  timer=setTimeout(leer,0);return cerrar;
 }catch{cerrar();throw Error('No se pudo abrir la cámara. Comprueba el permiso del navegador o usa un lector físico.');}
}
