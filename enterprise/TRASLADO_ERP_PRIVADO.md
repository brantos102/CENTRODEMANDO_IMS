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

Se abre una carpeta local que contiene **resumen_envio_erp_para_compartir.json**. Ese es el único archivo que debe compartirse en el chat. El JSON descargado de Drive, origen_NO_COMPARTIR.json, registro_erp_NO_COMPARTIR.json e integridad_erp_NO_COMPARTIR.json permanecen privados.

La revisión conserva la precedencia del getter actual: propiedad válida primero; en UIO se usa la primera fila coincidente de legacy como fallback. Los espacios de una contraseña de ScriptProperties se mantienen, mientras legacy aplica el trim del getter. No sustituye una primera fila vacía por otra posterior ni mezcla sedes. Los conflictos en un respaldo legacy no bloquean una propiedad válida que tiene precedencia.

Las etiquetas de credenciales se conservan separadas del cliente MySQL. Los nombres del panel mantienen su autoridad y las asociaciones con cliente/sede/códigos ERP deben confirmarse antes de usar estas credenciales. Un ok del diagnóstico indica que se pudo leer y clasificar la copia, no que el ERP ya esté conectado. GYE=0 describe este proyecto; no descarta que exista otra configuración en la copia de desarrollo.

El usuario confirmó la ejecución de la primera transferencia: 17 credenciales UIO, cero GYE y ninguna incidencia; copia remota verificada. Esto valida el traslado informado, todavía no el acceso gettoken/getstock. Ninguna credencial real ha sido compartida con el entorno de revisión de código.

## Proyecto independiente de Guayaquil

El proyecto GYE confirmado por el usuario es `1qF3PYXIJb8liPB2lGpbltE6CD4r4dmV57O0G1-FGt3WgjbNq3zyGJ27e`. Abrir ese proyecto, añadir un archivo nuevo y pegar [EXPORTAR_ERP_GYE_PRIVADO.gs.txt](tools/EXPORTAR_ERP_GYE_PRIVADO.gs.txt). Guardar y ejecutar **IMSExportarERPGYEPrivado20261110**, sin desplegar ni sustituir código existente. Descargar el JSON del enlace privado mostrado en el registro.

Este exportador lee únicamente las propiedades de ese proyecto. No abre el maestro de Quito, no presume el ID de una planilla de Guayaquil y no aplica el fallback legacy UIO. Si el proyecto no contiene propiedades ERP se detiene antes de crear archivos; no equivale a que Guayaquil no tenga una conexión en otro almacenamiento. El prefijo CREDGYE_API_ identifica GYE; una propiedad CRED_API_ encontrada en ese proyecto se conserva con su prefijo original y queda para revisión, sin convertirla a GYE automáticamente.

## Comparar con los clientes MySQL, sin asignar ni conectar al ERP

La transferencia admite `-CompararCatalogo` y `-RevisionERPAdicional` para reunir la nueva copia con una revisión anterior en el servidor. Desde PowerShell del PC:

```powershell
& '.\enterprise\tools\enviar-erp-privado.ps1' `
  -ArchivoPrivado (Read-Host 'Ruta completa del JSON privado de GYE') `
  -RevisionCodigo 'REVISION_APROBADA_DE_40_CARACTERES' `
  -CompararCatalogo `
  -RevisionERPAdicional '/home/enicolalde/bryan/centro_mando_ims_datos/ERP_REVISION_ID_DE_LA_COPIA_UIO' `
  -Enviar
```

Esta opción instala exclusivamente las dependencias de producción del worktree de preparación, con npm ci, lockfile y scripts desactivados, usando una caché privada propia. Nunca reinstala dependencias de la versión que está atendiendo solicitudes. Lee el perfil operativo privado existente; no lo ejecuta como código ni usa root. Verifica la identidad de la base y la cuenta SQL antes de consultar únicamente id/nombre de ims_op_cliente dentro de una transacción de solo lectura que termina en rollback. No crea tablas, usuarios, permisos, asociaciones ni inventarios. No reinicia servicios ni cambia Apache o puertos.

La revisión vuelve a verificar original, huella privada y registro preparado antes de abrir MySQL. Si alguien alteró la copia o el registro, se detiene. Las fuentes se mantienen separadas por sede y etiqueta; dos fuentes con contraseñas distintas para la misma conexión quedan como conflicto. Una coincidencia de nombre exacto normalizado solo es una propuesta pendiente de confirmación. No elimina signos ni acentos, no resuelve alias por prefijo y nunca inventa códigos COD. CLIENTE a partir de la etiqueta. Los nombres existentes del catálogo del panel se conservan.

Se descargan a una nueva carpeta privada de Windows:

- **resumen_envio_erp_para_compartir.json**: resultado de traslado y totales de revisión.
- **revision_asociaciones_erp_para_compartir.json**: nombres del catálogo, etiquetas de credenciales, IDs y propuestas por confirmar. No contiene usuarios ERP, contraseñas, tokens ni huellas del archivo secreto. Este es el informe necesario para revisar equivalencias de clientes.

**asociaciones_erp_NO_COMPARTIR.json** permanece en el servidor: contiene las referencias e integridad de las fuentes privadas. No compartirlo. La revisión no prueba autenticación real ni habilita importación de stock; esas dos acciones requieren las asociaciones y los códigos ERP confirmados.
