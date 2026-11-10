# Recuperar las conexiones ERP del sistema vigente

El piloto corporativo permanece en ef556ba. Esta fase prepara una copia privada de las credenciales y un diagnóstico. No cambia el servicio, Apache, puertos, datos de inventario, MySQL o las conexiones que utilizan los operarios. Todavía no comprueba autenticación contra el ERP.

Los ZIP de código de Apps Script no incluyen ScriptProperties. Por eso se requiere una exportación específica desde el proyecto vigente. El archivo central y el ID del proyecto se verifican en el exportador; no usar las secuencias de INVENTARIOS_UIO o INTERFAZ.

## Exportación en Google

1. Abrir el proyecto Apps Script del Centro de Mando cuyo ID termina en `FAfhlsD`.
2. Añadir un archivo **nuevo de secuencia de comandos**, llamado `IMS_Exportar_ERP_Privado`. Copiar en él el contenido completo de [EXPORTAR_ERP_PRIVADO.gs.txt](tools/EXPORTAR_ERP_PRIVADO.gs.txt). No reemplazar archivos existentes, hacer clasp push ni publicar un despliegue.
3. Guardar y ejecutar `IMSExportarERPPrivado20261109` desde el selector del editor. El nombre no termina en guion bajo. Usar una de las dos cuentas autorizadas del propietario de esta migración que tenga acceso al proyecto. El exportador exige que el usuario activo sea también el usuario efectivo; no permite ejecutarse como otra persona.
4. El registro muestra un resumen sin claves y el enlace de un archivo privado en tu Drive. Descargar ese JSON **tal cual**, en la carpeta privada de Windows `IMS_DATOS_PRIVADOS`, fuera del repositorio. Su nombre empieza con `NO_COMPARTIR_ERP_PRIVADO_`.

El código lee únicamente propiedades CRED_API_/CREDGYE_API_ y las primeras tres columnas de la hoja antigua CREDENCIALES_API, si existe. Excluye tokens y otras propiedades. No cambia claves, cachés, hojas, permisos originales ni triggers. Primero crea una carpeta y un archivo vacío propios y comprueba privacidad y ausencia de otros editores/lectores; solo entonces escribe las credenciales.

Si se detiene, el mensaje identifica la etapa: PROYECTO, CUENTA, LECTURA o DRIVE_PRIVADO. No copiar valores de propiedades al chat para resolverlo. Las pruebas del exportador son simuladas; su ejecución real queda a cargo de la cuenta autorizada en Google.

## Copia desde Windows y diagnóstico del servidor

Ejecutar desde **PowerShell del PC**, utilizando `tools/enviar-erp-privado.ps1` de la revisión aprobada:

```powershell
& '.\enterprise\tools\enviar-erp-privado.ps1' `
  -ArchivoPrivado (Read-Host 'Ruta completa del JSON privado descargado') `
  -RevisionCodigo 'REVISION_APROBADA_DE_40_CARACTERES' `
  -Enviar
```

El flujo utiliza SSH/SCP hacia enicolalde@192.168.4.94, conserva la verificación de la identidad SSH y envía exclusivamente a una ruta nueva de centro_mando_ims_datos/entrada. Comprueba carpeta privada, propietario, destino libre, permisos 0600 y SHA-256. Las claves viajan dentro del archivo, no en argumentos, comandos remotos o consola.

Después obtiene la revisión aprobada en un worktree privado y ejecuta la revisión de formato. El servidor guarda una copia exacta del original y un registro preparado en archivos privados. No instala dependencias ni activa otra versión del aplicativo. Si la copia o la revisión falla, conserva los originales y los servicios vigentes.

Se abre una carpeta local que contiene **resumen_envio_erp_para_compartir.json**. Ese es el único archivo que debe compartirse en el chat. El JSON descargado de Drive, origen_NO_COMPARTIR.json y registro_erp_NO_COMPARTIR.json contienen credenciales y permanecen privados.

La revisión conserva la precedencia del getter actual: propiedad válida primero; en UIO se usa la primera fila coincidente de legacy como fallback. Los espacios de una contraseña de ScriptProperties se mantienen, mientras legacy aplica el trim del getter. No sustituye una primera fila vacía por otra posterior ni mezcla sedes. Los conflictos en un respaldo legacy no bloquean una propiedad válida que tiene precedencia.

Las etiquetas de credenciales se conservan separadas del cliente MySQL. Los nombres del panel mantienen su autoridad y las asociaciones con cliente/sede/códigos ERP deben confirmarse antes de usar estas credenciales. Un ok del diagnóstico indica que se pudo leer y clasificar la copia, no que el ERP ya esté conectado. GYE=0 describe este proyecto; no descarta que exista otra configuración en la copia de desarrollo.

La secuencia de transferencia PowerShell fue revisada y sus scripts remotos se validaron con Bash; la ejecución real de Windows/SSH y el acceso de Drive siguen pendientes. Esta fase no hace peticiones gettoken/getstock ni modifica las conexiones de producción.
