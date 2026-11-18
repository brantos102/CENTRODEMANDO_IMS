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
