# Configurar correo y Google Calendar

Cuenta temporal autorizada por el usuario: **bespinoza@itsanet.com**. La cuenta y el calendario se configuran en el servidor y pueden reemplazarse después; no se cambia el código ni la identidad de los operadores. Esta conexión es independiente de RRHH y de las 24 conexiones ERP.

## Crear el cliente OAuth

Estos pasos se realizan en [Google Cloud Console](https://console.cloud.google.com/) con una cuenta que pueda administrar el proyecto de la organización. No requieren modificar Apache ni abrir puertos. El código de esta entrega prepara el formulario y el callback; no crea recursos dentro de una consola Google a la que no se ha concedido acceso.

1. Seleccionar o crear un proyecto dedicado, por ejemplo **ITSANET Centro de Mando**. Mantener el proyecto bajo la organización que lo administrará cuando se sustituya la cuenta temporal.
2. En **APIs y servicios → Biblioteca**, habilitar **Gmail API** y **Google Calendar API**.
3. Abrir **Google Auth Platform** (o **Pantalla de consentimiento OAuth**). Registrar nombre de la aplicación, correo de soporte y contacto de TI. Elegir audiencia **Interna** si el proyecto pertenece a Google Workspace de ITSANET y sus políticas lo permiten. Si solo está disponible **Externa**, agregar `bespinoza@itsanet.com` como usuario de prueba mientras se valida. La política de Workspace puede requerir que TI autorice el cliente.
4. En **Acceso a los datos**, registrar únicamente:

   | Permiso | Uso |
   |---|---|
   | `openid` y `email` | Verificar que se autoriza la cuenta configurada |
   | `https://www.googleapis.com/auth/gmail.send` | Enviar recordatorios y reportes solicitados |
   | `https://www.googleapis.com/auth/calendar.events` | Consultar y sincronizar los eventos propios del Centro |

5. En **Clientes → Crear cliente → Aplicación web**, usar:

   | Campo | Valor exacto |
   |---|---|
   | Nombre | Centro de Mando servidor |
   | Origen JavaScript autorizado, si se configura | `https://apps.flexnetuio.com:8445` |
   | URI de redirección autorizada | `https://apps.flexnetuio.com:8445/api/centro/google/callback` |

   La URI de redirección incluye el puerto **8445**, no lleva barra final ni fragmento. Para un futuro dominio distinto, registrar también su URI exacta antes de cambiar el origen de la aplicación. El intercambio del código ocurre en el servidor.
6. Conservar el **ID del cliente** y su **secreto** en el almacenamiento privado de la organización. El secreto se introduce solamente en el formulario privado de ITSANET IMS. No adjuntarlo al chat, Git, capturas ni resúmenes compartidos. No hace falta OAuth Playground ni generar un refresh token manualmente.

Una aplicación **Externa en Pruebas** con permisos de Gmail/Calendar suele recibir refresh tokens que caducan a los siete días. No dejar esa modalidad como configuración definitiva de producción. TI debe resolver la audiencia interna o la publicación/verificación externa que corresponda antes de cerrar esta integración como operativa permanentemente.

## Autorizar desde ITSANET IMS

Después de instalar esta revisión, entrar a `https://apps.flexnetuio.com:8445/centro` como administrador y abrir **Conexiones y recordatorios**.

1. Cuenta: `bespinoza@itsanet.com`. Calendario: `primary` para el principal de esa cuenta, o el ID de un calendario compartido en el que tenga permiso de edición.
2. Abrir **Cliente OAuth de la organización**. Introducir ID y secreto del cliente recién creado. Comprobar que la URI mostrada coincide con la registrada en Cloud.
3. Dejar inicialmente desmarcados los recordatorios automáticos. Pulsar **Guardar configuración y autorizar con Google** y elegir exactamente la cuenta corporativa configurada. Conceder correo y calendario.
4. En la confirmación, pulsar **Volver al Centro de Mando**. Se debe mostrar la cuenta autorizada. No se envía un correo ni se crea un evento durante esta autorización: se verifican identidad, permisos concedidos y lectura del calendario.
5. Desde una tarea de prueba conocida, solicitar un recordatorio a un destinatario autorizado y revisar su resultado en **Trabajos**. Solicitar una sincronización explícita de una tarea o de la agenda de la sede y revisar el calendario. La prueba real requiere esas acciones del usuario; la batería automatizada usa transportes simulados.

La sincronización es de Centro de Mando hacia Calendar. Los cambios hechos directamente en Google no se importan como órdenes de modificar MySQL. El lote revisa las sedes autorizadas y el propietario del evento remoto. No modifica eventos de otras aplicaciones. Los nombres de tareas y observaciones de las tareas seleccionadas se incluyen en los eventos sincronizados.

## Sustituir la cuenta temporal

Abrir el mismo formulario, cambiar la cuenta y, si corresponde, el calendario. Si se conserva el cliente OAuth, dejar el secreto vacío: se reutiliza cifrado. Si se crea otro cliente, introducir su ID y secreto nuevos. Autorizar con la cuenta oficial.

La conexión anterior permanece activa hasta que termine correctamente el consentimiento de la nueva cuenta. Un error, una cuenta distinta, un permiso parcial o una autorización caducada no reemplazan la conexión existente. Después del reemplazo, verificar un envío y sincronizar los eventos necesarios al calendario nuevo; los eventos ya creados en el calendario anterior no se eliminan automáticamente. TI puede revocar luego la autorización de la cuenta anterior.

Las claves y tokens se almacenan cifrados mediante AES-256-GCM. El respaldo privado debe incluir `centro/clave_propia` junto con el respaldo de la base. La alternativa SMTP TLS se usa cuando no hay una cuenta Gmail autorizada; guardar SMTP no sustituye una conexión Gmail activa.

## Diagnóstico

| Mensaje | Revisar |
|---|---|
| `redirect_uri_mismatch` | URI exacta, HTTPS y puerto 8445 |
| Acceso bloqueado | Audiencia, usuario de prueba y política de Workspace |
| La autorización no se confirmó | APIs habilitadas, los dos permisos concedidos, cuenta correcta y sesión administrativa vigente; volver a iniciar desde Conexiones |
| No aparece cuenta autorizada | No se completó el retorno. Volver al Centro y repetir el consentimiento |
| Falló después de varios días | Estado de pruebas externas, revocación o cambio de políticas; revisar en Cloud y volver a autorizar |

El servidor necesita salida HTTPS a Google para autorizar y enviar; no necesita puertos de escucha adicionales. Nunca pegar códigos de autorización, cookies, secretos ni tokens en el chat.
