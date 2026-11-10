import {validarRegistroRuntimeERP,registroERPDesdeEntorno} from '../src/conexiones/registro-runtime.mjs';
async function main(){
 const limite=process.argv[2]==='--entorno'?131072:65536;
 let texto='';for await(const parte of process.stdin){texto+=parte;if(Buffer.byteLength(texto)>limite)throw Error('Excesivo');}
 const data=JSON.parse(texto),conexiones=process.argv[2]==='--entorno'?registroERPDesdeEntorno(data):validarRegistroRuntimeERP(data);
 console.log(JSON.stringify({ok:true,conexiones:conexiones.length,sedes:[...new Set(conexiones.map(c=>c.sede))].sort(),solo_previsualizacion:true}));
}
main().catch(()=>{console.error('Perfil ERP privado incompatible; no se muestran valores ni credenciales.');process.exitCode=1;});
