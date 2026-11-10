# Recuperar las conexiones ERP del sistema vigente

La revisión dirigida posterior ya confirmó los totales de ALU, ALULTE y NOKIACNT3G y preparó 24 conexiones privadas. La siguiente entrega es la [consulta ERP dentro del aplicativo](ERP_CONSULTA_WEB.md); las secciones siguientes documentan la exportación y diagnósticos previos, que no deben repetirse para activar esa pantalla.

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

## Copias de Quito en el proyecto GYE y comprobación de lectura

El usuario confirmó que la segunda copia contiene 17 propiedades UIO y ocho GYE. Las 17 UIO coinciden con la copia original: el primer comparador les heredaba el aviso de ubicación del proyecto GYE, aunque no hubiera conflicto. Ahora se resuelve exclusivamente ese aviso cuando la fuente UIO válida confirma exactamente usuario y contraseña. Se conservan intactos ambos originales. Una contraseña discrepante, un fallback conflictivo o una credencial inutilizable sigue bloqueada; no se elige silenciosamente una fuente.

Se puede ejecutar `tools/diagnosticar-erp-servidor.ps1 -RevisionCodigo REVISION_APROBADA -PlanPrivado RUTA_DEL_PLAN_PRIVADO -VerificarLectura` desde PowerShell del PC. El plan permanece en el servidor; el script no lo descarga ni vuelve a transferir credenciales. Obtiene la revisión aprobada en un worktree nuevo y ejecuta `deploy/diagnosticar_erp_lectura.sh`.

La comprobación vuelve a validar todas las fuentes y la huella del catálogo del plan antes de acceder a la red. No consulta ni modifica MySQL. Usa el catálogo anterior del plan, expresamente identificado como copia. Solicita autenticación en gettoken y consulta getstock mediante GET contra los destinos fijos por sede, con TLS verificado, redirecciones rechazadas y una conexión a la vez. No toca propiedades ni cachés de Google. Cada petición tiene un límite de 20 segundos y un tamaño máximo; el presupuesto compartido de cuatro minutos limita el inicio de consultas. Las restantes figuran como pendientes y no se presentan como verificadas.

Los códigos de cliente se observan antes de aplicar cualquier equivalencia. Los informes incluyen códigos y recuentos, nunca filas de productos, cantidades, contraseñas, usuarios de credencial ni tokens. No crea inventarios, clientes, permisos, KPI o servicios. El archivo `conexiones_erp_para_compartir.json` distingue conexión verificada, stock vacío, fallo, bloqueo por revisión y falta de presupuesto. Un stock vacío verifica lectura pero no inventa códigos. Los fallos muestran únicamente la etapa y el estado HTTP si se recibió; los errores internos y respuestas de autenticación no se reflejan en el informe. PowerShell presenta el avance de cada conexión mientras espera el resultado final.

Se descargan al PC **conexiones_erp_para_compartir.json** y una **revision_asociaciones_erp_para_compartir.json** corregida. El JSON de conexiones puede mostrar `ok:false` si alguna conexión no pudo comprobarse; el resto de los resultados se conserva y se descarga. Este diagnóstico no autoriza automáticamente los códigos observados ni migra existencias.

Las equivalencias de grupos indicadas por el usuario se documentan en [ERP_MULTICLIENTE_Y_POSICIONES.md](ERP_MULTICLIENTE_Y_POSICIONES.md). Los clientes faltantes se reportan como pendientes de catálogo; no se sustituyen por un cliente histórico que se parezca.

## Compatibilidad del token y contraste con el asistente de Google

El siguiente informe del usuario mostró 24 respuestas HTTP 200 detenidas en AUTENTICACION y una respuesta 401 para FINI. No se había llegado a consultar stock. Esto no demuestra que las 24 credenciales sean inválidas: el estado HTTP y el formato de token son comprobaciones diferentes. La causa exacta de esos HTTP 200 todavía requiere el nuevo diagnóstico de formato.

Se encontró y corrigió una diferencia comprobable frente a ambos getters de Apps Script: `json.token || json.Token || json.Result || json.result`, seguido de `String(...).trim()`. El conector usaba selección con `??` y exigía cadena. Ahora conserva la precedencia por valor verdadero y la conversión original; un campo vacío no oculta otro válido. La autenticación usa JSON.parse como los getters originales y admite BOM UTF-8. El stock mantiene el lector numérico exacto y los límites de tamaño, TLS normal y bloqueo de redirecciones.

El diagnóstico incorpora la versión de Node y su capacidad para números JSON exactos. Ante un fallo de autenticación muestra únicamente clase MIME, validez JSON, tipo de raíz, presencia/tipo de los cuatro campos conocidos y campo elegido. No guarda cuerpo, token, prefijo, longitud exacta ni huella del token. Estos metadatos permiten distinguir un formato distinto o HTML de un rechazo HTTP sin solicitar información secreta al usuario.

La consola y el informe también muestran filas recibidas y totales de previsualización por código ERP. Los agregados siguen la normalización de stock: una serie física equivale a una unidad; las copias exactas de esa serie se omiten y las líneas sin serie de iguales dimensiones se agrupan sumando cantidades exactas. Se publican solo totales, nunca cantidades por línea, productos o series. Cantidades ambiguas, SKU ausente u otros datos incompatibles dejan los totales como pendientes, no se convierten en cero ni hacen fallar una conexión de lectura que sí respondió correctamente.

El alcance de esos totales son todos los códigos devueltos por la credencial, sin filtro de SKU ni posiciones. El informe separa los códigos para contrastarlos con la selección del wizard; no presume que una consulta posterior al ERP deba tener las mismas existencias que una captura anterior. Las consultas comienzan por BELIA de UIO y ALU de GYE, los ejemplos que el usuario confirmó operativos. No se crea un inventario durante esta comparación.

Apps Script reutiliza su token del día si ya lo tiene; la comprobación del servidor solicita autenticación nueva. Por eso FINI requiere una revisión independiente si mantiene el 401. No borrar cachés ni reemplazar claves de Google para ejecutar el diagnóstico.

## Resultado real: 24 lecturas verificadas y tres totales pendientes

El informe posterior confirmó 24 conexiones con token y stock válidos: 16 UIO y ocho GYE. FINI conservó el HTTP 401. BELIA devolvió 586 filas, agrupadas en 485 líneas y 66818 unidades. ALU devolvió 838 filas; ALU, ALULTE y NOKIACNT3G quedaron pendientes de calcular totales. No confundir esos tres controles de formato con errores de conexión.

`-InformeAnterior RUTA_PRIVADA_DEL_INFORME_COMPLETO` permite consultar exclusivamente las conexiones verificadas cuya previsualización quedó pendiente. El script valida que las referencias, sedes, etiquetas y recuentos del informe coincidan con todas las fuentes del plan antes de hacer peticiones. El resultado identifica expresamente el alcance y cuántas conexiones quedaron fuera de esa ejecución; no presenta FINI como reintentado ni declara que se volvió a consultar el resto.

Las cantidades del proveedor admiten notación científica y ceros de escala adicionales cuando caben exactamente en DECIMAL(30,9). La conversión usa enteros escalados: no redondea, no adivina miles y no convierte negativos o valores inválidos en cero. El contrato de captura humana permanece igual. Las incidencias indican campo, causa, número de filas únicas y hasta 12 posiciones dentro de la respuesta ERP original. Se reportan separadores ambiguos, negativos, precisión, longitudes de esquema y caracteres de control sin publicar SKU, textos, series o cantidades por fila. La causa de los tres casos reales todavía requiere ejecutar esa revisión; no se presume que sean negativos ni se amplían columnas a ciegas.

El mismo paso prepara, sin activar, un registro para la integración posterior:

- **cuentas_erp_para_compartir.json** contiene etiquetas, códigos realmente observados, cliente/grupo del panel y pendientes de catálogo. Se descarga al PC con los otros dos informes.
- **registro_erp_runtime_NO_COMPARTIR.json** contiene las credenciales originales y sus códigos permitidos, en modo de solo previsualización. Se guarda exclusivamente en la carpeta privada del servidor con permisos 0600, sin cargarse en el servicio, copiarse al PC ni compartirse en Git/chat.

El registro utiliza los nuevos resultados de las conexiones reconsultadas y el informe previo para las demás. Solo prepara conexiones verificadas, de fuentes compatibles y con una cuenta identificada de forma inequívoca. Una credencial con varios códigos sin asociación o un código repetido entre credenciales de la misma sede queda para revisión. FINI permanece pendiente. Los grupos confirmados NOKIA, FOC 5G y MOD 2024 conservan un ID nulo hasta su alta real en el catálogo; no se inventan registros SQL. Esta preparación no habilita importación ni modifica el perfil o la versión de la aplicación.
