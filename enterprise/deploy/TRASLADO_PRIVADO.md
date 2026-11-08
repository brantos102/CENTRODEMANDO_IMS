# Transferencia privada del corte y plan revisados

La preparación de MySQL no importa datos. Este paso empaqueta el corte completo y el plan aprobado en el PC y los envía por SSH al directorio privado ya creado. No inicia servicios, abre puertos ni ejecuta SQL.

## PC Windows

Desde `enterprise`, con Node y Python disponibles:

```powershell
& '.\tools\enviar-corte-servidor.ps1' -DirectorioCorte $imsCorte -SnapshotId $imsSnapshot -PlanId $imsPlanRevisado -ArchivoOriginal $imsOriginal -ShaOriginal $imsShaOriginal -Enviar
```

El auxiliar encuentra el plan por su identidad exacta dentro de `VALIDACION_REGLAS_*` junto al corte. No presupone que el plan más reciente sea el correcto. Valida el corte completo, los contratos 30/15, sus hashes y el plan antes de enumerar los archivos. Si hay un original de respaldo, también exige su SHA-256.

El ZIP contiene únicamente `corte/`, `plan/`, el manifiesto de paquete y, si se solicitó, `evidencia/fuente_original.xlsx`. Incluye todas las hojas del corte, incluso las administrativas y las líneas pendientes; no se reduce a las filas preparadas. El paquete contiene datos privados y puede contener información histórica de acceso de USUARIOS. No adjuntarlo al chat ni al repositorio. Los archivos hijos cuyo contenido no está en el corte todavía requieren extracción propia.

La lista de entradas y sus rutas absolutas se guarda solo en `lista_privada.json` local; no se incorpora al ZIP. El empaquetado verifica los bytes y hashes mientras lee y no transforma los valores. Cambios de fuente o salidas existentes lo detienen y una salida parcial propia se retira.

Con `-Enviar`, verifica primero por SSH que la entrada remota sea la ruta prevista, propiedad del usuario y con permisos 0700. Usa un nombre UUID nuevo y comprueba que no exista. SCP envía únicamente ese ZIP a `/home/enicolalde/bryan/centro_mando_ims_datos/entrada/`. No se envían credenciales de MySQL ni se lee `migracion.env`. Puede pedir autenticación SSH normal; no compartir contraseñas.

El informe `resumen_envio_para_compartir.json` contiene identidades, tamaño, SHA-256 y estado del envío. `archivo_enviado=true` indica que SCP terminó correctamente; la comprobación remota de hashes y la importación aún están pendientes. Solo ese informe se comparte. El auxiliar PowerShell se revisó pero no se ejecutó en Windows desde este entorno.

## Recepción Linux

Actualizar primero la copia exclusiva del código a la revisión aprobada. No volver a ejecutar el inicializador ni modificar IV_ITSANET, RRHH u otros proyectos. Usar el nombre, SHA-256 e identidades del informe enviado; no elegir el ZIP más reciente por fecha.

```bash
python3 enterprise/tools/paquete_traslado.py recibir --paquete /ruta/privada/entrada/paquete.zip --sha256 SHA_PAQUETE --destino /ruta/privada/recibidos/carga_nueva --snapshot-id SHA_CORTE --plan-id SHA_PLAN
node enterprise/tools/preparar-traslado.mjs --verificar /ruta/privada/recibidos/carga_nueva/corte /ruta/privada/recibidos/carga_nueva/plan SHA_CORTE SHA_PLAN
```

La recepción CLI solo se permite en `apps`, como `enicolalde`, bajo la carpeta privada prevista. Verifica el SHA-256 del ZIP antes de extraer y cada tamaño/hash individual; rechaza rutas fuera del contrato, enlaces, nombres repetidos, directorios y compresiones inesperadas. Exige espacio libre con un margen de 1 GiB, limita el contenido a 8 GiB y crea archivos 0600 y directorios 0700. No sobrescribe destinos. Ante error solo retira la salida propia recién creada, conservando ZIP y fuentes.

La primera recepción declara `validacion_semantica_pendiente=true`: su comprobación de transporte no basta para importar. El comando Node posterior valida el corte y plan revisados, incluyendo todos los archivos y contratos; no ejecuta SQL. Solo después corresponde importar staging con la configuración privada y cuenta de ensayo. Las filas no preparadas permanecen en staging; no reciben aprobación operativa ni KPI por estar respaldadas.

## Validación de las herramientas

69 pruebas Node y 26 Python aprobadas. Se probaron selección por identidad exacta, respaldo incorrecto, alteración de bytes aunque se recalcule el hash del ZIP, nombres duplicados, rutas fuera del contrato, enlaces, salidas existentes, fuentes cambiadas y falta de espacio. Una copia histórica real de 19 hojas completó empaquetado, recepción, hashes de todos sus archivos y validación posterior del corte/plan (100.835 filas de INVENTARIOS y 64.486 de REGISTRO). Fue un ensayo local de las herramientas, no la transferencia del corte actual del usuario ni una importación MySQL. PowerShell/SCP requieren su ejecución y comprobación en los equipos correspondientes.
