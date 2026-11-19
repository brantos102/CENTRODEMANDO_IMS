# Conexiones y actualización de inventarios · 18 de noviembre de 2026

Esta actualización agrega lectura de Google Sheets y una revisión de novedades antes de incorporarlas. Requiere instalar la revisión publicada. El formulario permanece en **Centro → Conexiones**, reservado al administrador. El correo temporal es `bespinoza@itsanet.com`; puede sustituirse por la cuenta oficial desde el mismo formulario.

## 1. SQL Server de ocupación

Abrir **Ocupación UIO · SQL Server de solo lectura** y completar:

| Campo | Valor |
|---|---|
| Servidor | `192.168.4.12` |
| Puerto | `1433` |
| Instancia comprobada por la aplicación | `DEPOTWMS` |
| Base de datos | Nombre proporcionado por TI; vacía utiliza la predeterminada del usuario |
| Usuario y contraseña | Cuenta exclusiva de lectura, introducida en el formulario privado |
| Certificado interno | Marcar únicamente si TI confirmó el certificado del servidor interno |

Guardar y pulsar **Consultar y actualizar ocupación ahora**. La comprobación confirma instancia y permisos SELECT sobre `POSICION` y `view_web_estado_posicion`; rechaza cuentas sysadmin/db_owner o con escritura sobre POSICION. El resultado debe indicar cuántos registros fueron verificados. Luego habilitar la actualización cada cinco minutos si se desea.

Esta lectura actualiza ocupación; el stock congelado y C1/C2/C3 de los inventarios no se reemplazan. Centro presenta la ocupación de la sede; IMS la de las posiciones autorizadas de cada documento. GYE y TLF siguen pendientes de sus consultas de ocupación autorizadas.

## 2. Crear el cliente OAuth web en Google Cloud

1. Con la cuenta que administrará la integración, abrir `https://console.cloud.google.com/` y seleccionar o crear el proyecto de la organización.
2. En **APIs y servicios → Biblioteca**, habilitar **Gmail API**, **Google Calendar API**, **Google Drive API**, **Google Sheets API** y **Apps Script API**.
3. En **Google Auth Platform**, configurar nombre Centro de Mando IMS, correo de soporte y audiencia. Usar audiencia interna si está disponible para la organización. Si se usa audiencia externa en pruebas, añadir `bespinoza@itsanet.com` como usuario de prueba; el modo de pruebas puede requerir reautorizar periódicamente. Para la operación continua TI debe definir la publicación o audiencia corporativa adecuada.
4. En **Clientes → Crear cliente**, elegir **Aplicación web**. Registrar en **URI de redirección autorizadas**, exactamente:

   `https://apps.flexnetuio.com:8445/api/centro/google/callback`

5. Copiar el ID y el secreto al formulario privado **Cliente OAuth de la organización** del Centro. No publicarlos en GitHub ni enviarlos por chat.
6. Seleccionar la cuenta `bespinoza@itsanet.com` y el calendario `primary`, o el ID de un calendario compartido autorizado. Marcar **Leer inventarios actuales de Google Sheets** y, para fotos, **Autorizar las carpetas y fotos creadas por IMS**. Marcar el cotejo de Apps Script únicamente si la cuenta tiene acceso a los proyectos originales.
7. Guardar y autorizar con Google. Conceder los permisos solicitados y volver al Centro. Debe aparecer la cuenta autorizada y la lectura de Sheets habilitada.

Si el cliente OAuth ya estaba configurado, se conserva el secreto al dejarlo vacío y mantener el mismo ID. Para añadir lectura de Sheets hay que volver a autorizar; una autorización anterior sin ese permiso no se presenta como apta para actualizar inventarios.

La cuenta debe poder leer el maestro y los archivos que referencia su panel. Para el cotejo de código, habilitar también el acceso a Apps Script API desde `https://script.google.com/home/usersettings` y comprobar el acceso a los tres proyectos. Leer código es independiente de importar inventarios; no se modifica Apps Script ni sus despliegues.

## 3. Comprobar Calendar, correo y Drive

- Calendar: elegir un evento de ensayo y pulsar **Sincronizar con Google Calendar**; comprobar en Trabajos que terminó correctamente y revisar el evento en la cuenta elegida. El identificador del evento evita duplicados al reintentar. **Sincronizar Calendar** procesa el periodo del año seleccionado por el Centro; usarlo después de comprobar el evento individual.
- Correo: desde un evento de ensayo, **Enviar recordatorio**, revisar el destinatario e introducir únicamente la propia cuenta para la primera prueba. Comprobar Trabajos y recepción antes de activar recordatorios automáticos.
- Drive: adjuntar una foto sintética a una línea de ensayo y utilizar **Enviar a Drive**. Comprobar la ruta `ITSANET IMS / SEDE / año / mes / cliente` y el resultado confirmado. La foto se conserva en el servidor mientras falte autorización de Drive.

Estas son verificaciones reales que deben realizarse en el servidor con la cuenta autorizada. Las pruebas locales utilizan Google simulado y no prueban conectividad empresarial.

## 4. Incorporar inventarios y avances actuales de Google

En Conexiones, abrir **Inventarios y avances actuales de Google · UIO/GYE**:

1. Pulsar **Leer y revisar novedades de Google**. La lectura se ejecuta en segundo plano; preparar el plan no cambia inventarios ni escribe en Google.
2. Revisar fecha de lectura, sede, código, líneas, capturas nuevas e incidencias. Se lee el maestro original `CONSOLIDADO_HISTORICO` y únicamente sus archivos referenciados. La sede se toma de la columna F del panel; una sede vacía, TLF o desconocida queda para revisión.
3. Las planillas se leen dos veces y sus valores interpretados deben coincidir. Si el archivo cambia durante la lectura, se deja como incidencia y se puede repetir esa revisión. Los inventarios cerrados o históricos de MySQL se conservan.
4. Marcar expresamente los grupos que se desea incorporar y pulsar **Aplicar selección revisada**. Ningún grupo se selecciona automáticamente.
5. Revisar el resultado y abrir cada inventario desde el enlace generado. Si MySQL cambió después de preparar el plan, ese grupo queda sin aplicar y requiere una nueva revisión.

### Qué se incorpora

- Inventarios nuevos con clientes identificados en el catálogo existente, código y fecha válidos, cantidades exactas y columnas IMS originales. Se conservan el ID del archivo de origen y la fila de cada línea.
- C1/C2/C3 y ceros de los inventarios nuevos, incluyendo secuencias originales para revisión. Se crea la carpeta lógica SEDE/año/mes/cliente, permisos y evento vinculado.
- En inventarios nativos abiertos ya migrados, únicamente etapas vacías que pueden completarse sin contradecir capturas existentes ni saltar etapas. Cada captura agregada tiene auditoría con origen Google y fecha/usuario de importación.

### Qué requiere conciliación

- Una captura de Google distinta de una ya registrada en MySQL. Prevalece lo conservado en MySQL y se señala el conflicto.
- Un cliente inexistente o ambiguo; un código existente sin un vínculo inequívoco al archivo de Google; stock distinto; líneas nuevas en un inventario ya activado; filas con identidad repetida; secuencias heredadas incompletas; fechas o cantidades ambiguas. Un número real de Google con formato de miles se lee por su valor numérico; textos como `2.000` requieren revisión porque pueden representar miles o decimales.
- Una cuenta o sede revocada, una conexión Google reemplazada o un plan vencido. La vigencia para aplicar es de dos horas.

El cotejo usa cliente, SKU, posición, serie, lote, unidad y stock; no empareja líneas solamente por SKU ni por su número de fila. No elimina filas que falten en Google. Los textos, ajustes, stock y fotos existentes en MySQL se conservan. Los inventarios nuevos se crean **En proceso**, mostrando el estado de origen de Google para revisión; no se cierran, entregan ni publican como KPI automáticamente.

La auditoría registra la importación desde Google sin inventar la autoría original de operadores. El nuevo registro de actividad completo de Google no se importa por este mecanismo. Los planes utilizados se conservan cifrados para trazabilidad; un reintento de la misma selección no duplica inventarios ni etapas. Volver a leer genera otra revisión de las novedades pendientes.

## 5. Corte de operación

Los operadores terminan a las 17:30 de Ecuador y `dash_consolidarAuditoria` se ejecuta a las 18:30. Para el corte final, obtener y revisar las novedades después de terminar la captura de Google, comprobar las incidencias y confirmar dónde continuará cada inventario. No registrar el mismo conteo simultáneamente en ambos sistemas. La lectura de novedades no desactiva los triggers de Google.

## Resumen que puede compartirse

Compartir solamente la revisión instalada, el texto de verificación de ocupación, si Google muestra cuenta/Sheets autorizados y los conteos de inventarios/capturas/incidencias del resultado. No compartir contraseña SQL, secreto OAuth, tokens, contenido de planes cifrados ni archivos privados completos.

## Si el retorno de Google no autoriza

La corrección de OAuth del 18 de noviembre elimina una comparación de vencimiento dependiente de la zona horaria de MySQL. La prueba reprodujo una solicitud vigente rechazada desde una conexión `-05:00`; con la corrección, la misma situación funciona. Esto confirma un defecto del código anterior, pero no permite atribuirle cualquier rechazo real que solo mostraba el mensaje genérico.

Después de instalar la corrección, abrir **Centro → Conexiones** y comenzar una autorización nueva. No recargar ni reutilizar la URL del retorno anterior: el estado y el código son de un solo uso. El cliente y el secreto existentes se conservan; no hace falta regenerarlos para instalar esta corrección.

Si falla, el retorno presenta **Etapa**, **Código**, **HTTP** cuando existe y un diagnóstico para compartir. También puede consultarse en **Conexiones → Diagnóstico de autorización Google → Actualizar diagnóstico**. El botón de copia genera un resumen sin código de autorización, estado secreto, access token, refresh token ni secreto OAuth.

| Código | Acción |
|---|---|
| ESTADO_VENCIDO_O_USADO | Iniciar otra autorización desde Conexiones y completarla en menos de diez minutos |
| CLIENTE_RECHAZADO | Comprobar ID y secreto del mismo cliente de tipo Aplicación web en el formulario privado |
| REDIRECCION_DISTINTA | Registrar exactamente la URI que muestra Conexiones, con HTTPS, puerto y ruta |
| API_DESHABILITADA en CALENDARIO | Habilitar Google Calendar API en el proyecto del cliente OAuth |
| PERMISOS_INCOMPLETOS | Volver a autorizar los servicios indicados como faltantes |
| CUENTA_DISTINTA | Revisar dirección principal, alias y correo configurado; la cuenta debe coincidir |
| GOOGLE_ACCESO_DENEGADO | Revisar API habilitada, permisos del recurso y políticas de Workspace |
| GOOGLE_RED_NO_DISPONIBLE / GOOGLE_TIEMPO_AGOTADO | Comprobar salida HTTPS del servidor a Google |
| GOOGLE_CERTIFICADO_RECHAZADO | Revisar certificados o proxy HTTPS con TI, conservando la validación TLS |
| GUARDADO_NO_CONFIRMADO | Comprobar primero el estado de Conexiones; el guardado podría haberse completado |

Si Google omite `scope` en el canje, la aplicación verifica los permisos reales del token en Google; no presume que se concedió lo solicitado. Acepta permisos equivalentes más amplios ya concedidos, sin solicitarlos adicionalmente. Los permisos de solo lectura no sustituyen a los de escritura necesarios para correo y Calendar.

Los intentos sin diagnóstico guardado aparecen como **INTENTO_ANTERIOR_SIN_DETALLE**. También puede ocurrir con solicitudes que el trabajador de fondo marcó prematuramente como error en las revisiones anteriores; no demuestra que se hayan rechazado permisos de Google. Ante un fallo se conserva la conexión anterior; un resultado de guardado incierto se presenta como tal. La corrección no cambia inventarios, capturas ni fotos.


### Solicitud marcada como ERROR antes de regresar de Google

Se reprodujo otro defecto en el trabajador de fondo: desde una sesión SQL `-05:00`, comparaba `actualizado_en` de tipo TIMESTAMP con UTC_TIMESTAMP y marcaba como ERROR una solicitud OAuth recién creada. El retorno entonces mostraba ESTADO_VENCIDO_O_USADO y el resumen privado no tenía diagnóstico por etapa. La corrección anterior del retorno por sí sola no cubría este proceso.

El trabajador ahora excluye GOOGLE_OAUTH de la limpieza general y usa CURRENT_TIMESTAMP(6) en sus comparaciones y escrituras TIMESTAMP. El retorno conserva su vencimiento de diez minutos, estado de un solo uso, PKCE y validación de sesión. La limpieza de otros trabajos sigue venciendo a los quince minutos reales; se comprueba con sesiones -05:00, +00:00 y +05:30.

Instalar la revisión que incluye esta corrección del trabajador y comenzar una autorización nueva desde Conexiones. No reactivar ni editar manualmente los intentos ERROR anteriores, ni volver a abrir sus retornos. No hace falta recrear el cliente OAuth o cambiar su secreto por este defecto. La confirmación real requiere completar un intento nuevo en el servidor actualizado.


## Diagnóstico de la conexión de ocupación SQL Server

Una conexión que funciona en SQL Server Management Studio con servidor `IP\DEPOTWMS` no confirma que DEPOTWMS escuche en TCP 1433. El formulario utiliza IP y puerto TCP explícitos. Esta revisión también acepta IP\DEPOTWMS y normaliza el servidor a la IP; no descubre el puerto mediante SQL Browser ni ignora un nombre de instancia distinto. En revisiones anteriores era obligatorio introducir solamente la IP. MySQL almacena los datos de IMS; la ocupación se consulta en SQL Server con autenticación SQL Server.

En la sesión de SQL Server que funciona, ejecutar esta SELECT para comprobar base, instancia y puerto sin compartir credenciales:

```sql
SELECT DB_NAME() AS base_actual,
       SERVERPROPERTY('InstanceName') AS instancia,
       CONNECTIONPROPERTY('local_tcp_port') AS puerto_reportado,
       CASE WHEN CONVERT(int, CONNECTIONPROPERTY('local_tcp_port')) < 0
            THEN CONVERT(int, CONNECTIONPROPERTY('local_tcp_port')) + 65536
            ELSE CONVERT(int, CONNECTIONPROPERTY('local_tcp_port'))
       END AS puerto_tcp;
```

Si el puerto alto aparece con signo negativo, se normaliza a su representación de 16 bits sin signo: por ejemplo, -16195 corresponde a 49341. Un resultado NULL no confirma un puerto TCP y debe revisarse con TI. Usar en IMS el puerto real y el nombre de base devuelto por DB_NAME(), conservando exactamente su escritura. La conectividad debe existir desde el servidor IMS, además de desde el PC del operador.

Primero pulsar **Guardar conexión privada** y después **Consultar y actualizar ocupación ahora**. La consulta utiliza la configuración guardada. El fallo ahora presenta etapa, código y acción, además de un JSON en **Diagnóstico SQL para compartir**. Nunca muestra contraseña, consulta, respuesta original del servidor ni cadena de conexión. Antes, errores de dominio no registrados en el mapa HTTP quedaban ocultos bajo «No se pudo completar la solicitud».

- SQL_RED_NO_DISPONIBLE / SQL_TIEMPO_AGOTADO: comprobar ruta y puerto desde IMS; un timeout en CONSULTA requiere revisar la duración de la vista.
- SQL_AUTENTICACION_RECHAZADA: revisar usuario y contraseña en el formulario privado y que sean de la misma instancia.
- SQL_BASE_NO_DISPONIBLE: revisar base y acceso de la cuenta; vacío usa su base predeterminada.
- SQL_TLS_NO_CONFIRMADO: revisar certificado y compatibilidad TLS con TI. Se mantiene el cifrado.
- INSTANCIA_SQL_NO_CONFIRMADA: el puerto respondió pero no corresponde a DEPOTWMS.
- CUENTA_SQL_NO_LECTORA: utilizar SELECT sobre POSICION y view_web_estado_posicion, sin sysadmin, db_owner ni INSERT/UPDATE/DELETE sobre POSICION.
- SQL_OBJETO_NO_DISPONIBLE / SQL_PERMISOS_INSUFICIENTES: revisar base, esquema y permisos de los dos objetos.
- OCUPACION_SIN_CONFIGURAR: guardar la conexión privada antes de consultar.

El corte anterior permanece si falla la lectura. No se modifican las existencias de SQL Server ni las capturas de los inventarios MySQL. No existe una conexión empresarial real desde las pruebas de desarrollo: el resultado final se comprueba en el servidor IMS.


## Automatizaciones de ITSANET IMS · revisión 19 de noviembre

Cada automatización tiene un control explícito en Conexiones. Las conexiones existentes conservan sus opciones anteriores; instalar código no activa envíos nuevos por sí solo.

- **Sincronizar cronograma**: crea una tarea en la misma transacción al crear, editar o cambiar una tarea del cronograma. El trabajador sincroniza Calendar con ID estable. Además, programa una puesta al día diaria. Un cambio de calendario crea una nueva sincronización para ese destino.
- **Recordatorios diarios**: entre las 08:00 y las 17:30 de Ecuador, programa un correo por destinatario, evento y día para los conteos de hoy y los próximos tres días. Incluye equipo asignado y líderes, coordinadores y administradores de la misma sede. Una cuenta nueva entra en la siguiente planificación; las cuentas desactivadas se comprueban antes de enviar. No se remiten contraseñas.
- **Lectura de novedades de Google**: desde las 18:45, prepara una revisión diaria de UIO/GYE. La aplicación conserva las capturas MySQL y la aplicación del plan requiere selección revisada. Los planes caducan a las dos horas: si se revisa al día siguiente hay que pulsar Leer y revisar novedades de Google para obtener uno vigente.
- **Reportes Sheets**: desde las 19:00, actualiza los reportes de los clientes del HISTORIAL_REPORTES de UIO. Incluye los inventarios Entregados del año en MySQL y utiliza los mismos archivos de Google. La hoja IMS_CONSOLIDADO se verifica antes de sustituir su contenido; las otras hojas y los permisos del archivo permanecen. No se crea un archivo distinto para cada actualización. Los reportes de GYE requieren su historial de destinos autorizado.

Para escribir los reportes, activar la opción correspondiente y volver a autorizar Google: solicita spreadsheets de escritura. Tener Sheets de solo lectura no basta para publicar. La cuenta anterior permanece hasta completar el consentimiento nuevo. No se amplían permisos automáticamente por instalar la revisión.

El proceso conserva los triggers existentes de Apps Script. La planificación del servidor usa trabajos persistentes e identificadores para evitar duplicados. El estado y las incidencias se consultan en Trabajos y descargas. Los reportes disponibles en Google pueden contener avances posteriores a la última importación de MySQL: revisar/aplicar las novedades y entregar los inventarios en IMS antes de esperar esos datos en su consolidado.

Firebase se ha evaluado como opción futura para push con el navegador cerrado. Para esta entrega se utilizan los avisos internos de próximos conteos, Gmail y Calendar; no se afirma que haya un proyecto Firebase configurado ni dispositivos inscritos.
