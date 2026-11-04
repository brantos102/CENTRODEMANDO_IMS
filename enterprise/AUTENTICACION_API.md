# Sesiones y API candidata — 4 de noviembre de 2026

Backend candidato implementado y probado con usuarios sintéticos. No sustituye la aplicación actual, no configura Apache ni inicia servicios permanentes. WTW sigue pendiente.

## Rutas implementadas

| Método y ruta | Comportamiento |
|---|---|
| GET /salud | Liveness del proceso candidato; no certifica datos ni conectividad de base |
| POST /api/sesion | Login por correo/contraseña y creación de cookie propia |
| GET /api/sesion | Usuario autenticado y token CSRF; sin contraseña ni hash |
| POST /api/sesion/cerrar | Revoca la sesión y elimina su cookie |
| GET /api/inventarios | Inventarios permitidos, con paginación |
| GET /api/inventarios/{id}/lineas | Líneas únicamente de clientes permitidos |
| POST /api/conteos | Conteo transaccional e idempotente, con identidad de sesión |

Las consultas aceptan solo cursor UUID y límite entre 1 y 100. No aceptan tablas, selectores SQL ni filtros arbitrarios. SKU y cliente del conteo se obtienen de la línea almacenada.

## Identidad y control de acceso

SQL 003 agrega ims_auth_usuario, ims_auth_sesion e ims_auth_limite; requiere SQL 002. No importa ni activa automáticamente usuarios del maestro/WMS y no crea cuentas predeterminadas.

Las contraseñas nuevas requieren 12 caracteres y se guardan con scrypt N=32768/r=8/p=1, sal aleatoria de 16 bytes y resultado de 32 bytes. Se validan formato y parámetros del hash antes de verificarlo. **Esto no cambia los PIN actuales ni significa que los operarios ya estén migrados.** La gestión/migración de identidades y permisos sigue pendiente.

Un actor activo con fila explícita en ims_op_permiso puede leer ese cliente/inventario; puede_contar=0 deniega capturas y puede_contar=1 las permite si el inventario está abierto. No hay rol recibido del navegador que eluda ese permiso. Los inventarios con varios clientes filtran las líneas por cliente permitido.

La cookie __Host-ims_cm_session usa Secure, HttpOnly, SameSite=Strict, Path=/ y máximo ocho horas. No tiene Domain ni usa nombres de sesión de otras aplicaciones. La base guarda solo el hash SHA-256 del token de sesión. Sesiones desconocidas, duplicadas, revocadas o vencidas no autentican. Desactivar al actor o incrementar la versión de su credencial invalida las sesiones en consultas posteriores.

Login y consulta de sesión devuelven un token CSRF para X-IMS-CSRF en los POST autenticados. Todo POST exige Origin exactamente igual a IMS_PUBLIC_URL, incluido puerto. No se habilita CORS para otros orígenes. Las cookies no se restringen por puerto: nombre propio, control de origen y separación de sesiones son necesarios al compartir hostname.

El núcleo comprueba sesión y versión de credencial dentro de la transacción del conteo. Un contexto obtenido antes de logout no permite escribir después de revocar la sesión. principal solo se construye desde la autenticación del servidor; no desde req.body/localStorage. Las llamadas internas de confianza del núcleo anterior conservan su contrato; no deben exponerse directamente como endpoints.

## Límites y errores

- Cinco intentos por correo en dos minutos, persistidos en MySQL; entradas vencidas retiradas por lotes.
- Máximo cuatro logins en procesamiento y 120 peticiones de login por minuto/proceso. Ajustar capacidad en piloto sin quitar la validación.
- Cuerpo JSON máximo de 16 KiB; JSON roto, formatos ajenos, parámetros duplicados e identidad/rol en el cuerpo del conteo se rechazan.
- Respuestas de sesión/datos con Cache-Control: no-store. No se devuelven mensajes SQL, causas internas, contraseñas, hashes ni configuración.
- Correo desconocido y contraseña incorrecta devuelven el mismo error genérico. Recuperación de contraseña y administración de usuarios no están implementadas todavía.

## Arranque controlado

src/servir.mjs requiere IMS_API_HABILITADA=1, base propia, usuario no root, esquema preparado y origen HTTPS. Por defecto está deshabilitado. Solo admite 127.0.0.1; rechaza puertos reservados de las aplicaciones existentes. Propuesta: 3003 y HTTPS :8445, sujetos a preparación independiente. No se habilitaron en el servidor empresarial.

La API debe tener un archivo privado y usuario de aplicación propio, con privilegios específicos, separado del usuario de migración y de IV_ITSANET/RRHH/Data Sync. .env.example no contiene contraseña. npm run servir no instala esquema ni crea usuarios. No activarlo por haber actualizado la rama: todavía faltan interfaz y datos/usuarios operativos normalizados. No se entrega un vhost/systemd para habilitarlo automáticamente.

Las pruebas HTTP usan loopback y Origin para simular el proxy HTTPS. No son pruebas de navegador/TLS real. Secure se mantiene; la prueba del navegador se realizará con el HTTPS propio preparado.

## Validación realizada

Node **22.23.3** y MySQL **8.0.46** en contenedores locales desechables, sin puertos publicados al host:

- **24 pruebas unitarias:** las 17 anteriores y siete de credenciales/configuración.
- **26 de integración:** doce del núcleo y catorce de HTTP/sesiones.
- Login, cookie/CSRF, aislamiento por cliente, lector sin escritura, logout, expiración, desactivación, cambio de credencial, límite de intentos, formatos, errores sanitizados y reintentos aprobados.
- Solo usuarios, contraseñas y conteos sintéticos; ninguna credencial de operarios modificada.

Pruebas unitarias sin base ni puertos: `npm test` desde enterprise. Las de integración crean tablas/datos de ensayo y exigen IMS_MYSQL_PRUEBAS=1, base centromando_ims_pruebas o sufijo permitido y conexión privada:

```bash
node --env-file=/ruta/privada/pruebas.env --test tests/mysql/*.integration.mjs
```

Faltan interfaz nativa, administración/migración de identidades/permisos, carga de staging a entidades operativas, creación de inventarios, series, hallazgos, ajustes, captura masiva, documentos, EAN e indicadores/publicación conciliados. Los pendientes se conservan completos; solo Entregado es elegible para KPI. Las salidas Power BI siguen en 30/15. No es aún un portal listo para operación real.
