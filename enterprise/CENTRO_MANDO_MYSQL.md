# Centro de Mando Integral en MySQL

Esta ampliación recupera el Centro de Mando además de la operación ITSANET IMS / WMS. Usa la base exclusiva, el servicio y los puertos existentes. No reemplaza otros proyectos, configuraciones globales de Apache ni la carpeta de trabajo activa.

## Datos usados

- Corte elegido `07e58bf9-6fe1-4bf0-b93e-d1a89cb66764`: panel de 370 filas, cronograma 2026 de 411 filas y programación de 5.159 filas, completos por hoja.
- Respaldo verificado ya almacenado en SQL `2b09fd9efdf0a484f6bb88947ca40284e25d4ec9cc6e78779e350008e61a477e`: usuarios, equipos, cronograma anterior, registros y auditorías.
- Inventarios nativos e históricos existentes. Conserva 352 conteos históricos / 97.822 líneas y las capturas de los abiertos ya importados.

No solicita otra extracción de Google. Una hoja parcial se conserva como parcial. Para las hojas administrativas que faltan se usa el respaldo disponible, con su procedencia; no se presenta como una captura nueva de Google. Las filas originales de inventarios y registros permanecen disponibles para revisión administrativa. No se eliminan discrepancias, notas ni filas por compartir SKU.

## Funciones

| Área | Comportamiento |
|---|---|
| Panel | Vencidos, hoy, próximos 7 días, entregados, clientes, unidades, referencias, posiciones y avance. Los archivos nativos reflejan el estado actual de MySQL. |
| Calendario | Semana, mes, navegación por fechas, tareas y tendencia mensual; exportación ICS. Duración inclusiva. |
| Cronograma | Alta, edición, responsable, apoyos, inicio, pausa, reanudación, entrega y eliminación auditada del evento. No elimina el inventario. |
| Creación | API, CSV/TXT con formato numérico explícito o borrador en blanco; carpeta y evento nuevo/existente/sin vínculo. Una transacción reúne stock, procedencia, evento, equipo y permisos. |
| ERP | Conserva las 24 conexiones UIO/GYE; cuentas múltiples y selección por SKU o posiciones, independientes del cliente de planificación en una extracción por posiciones. |
| Archivos | Carpetas y subcarpetas en MySQL; referencias a Google conservadas como originales. Los inventarios nuevos se operan en el servidor. |
| Usuarios | Admin, Coordinador, Líder, Operario y Auditor; rol WMS separado, sedes, altas por jerarquía, activación, edición y restablecimiento de clave. |
| Perfil | Nombre, teléfono y cambio de contraseña; se revocan las otras sesiones al cambiar la clave. |
| IMS / WMS | Capturas C1/C2/C3, versiones, reintentos, conteo ciego, ajustes auditados, cámara/lector, series, planilla alterna y análisis oficial existentes. Historial auxiliar del corte consultable; no vuelve a registrar series de un origen inequívoco. |
| Análisis | Fórmula ITSANET IMS / WMS V124 con enteros escalados. Distingue cero de ausencia y conserva hasta 9 decimales, sin redondear cantidades. |
| Reportes | CSV original de 30 columnas; XLSX con INVENTARIOS, ANALISIS_IMS_WMS, SERIES_FISICAS, PLANILLA_ALTERNA, CAPTURAS, originales auxiliares autorizados y COBERTURA. ZIP de hasta 50 inventarios y envío con adjunto. SKU/series y cantidades exactas en Excel son texto. |
| Consolidación | Auditoría y publicación de resultados únicamente de Entregados verificados. Cola persistente, progreso y revisión de errores. Programación diaria a las 18:30, hora Ecuador. |
| Notificaciones | Recordatorios manuales y automáticos; cuenta Gmail autorizada con OAuth o SMTP TLS cuando no hay Gmail autorizado. Los envíos sin confirmación no se repiten automáticamente. |
| Calendar | Sincronización explícita con Google Calendar; solo crea/modifica los eventos que pertenecen a este Centro. Requiere autorización privada de la cuenta. |
| Trazabilidad | Fuentes, cobertura por hoja, bitácora administrativa, historial original y resultados de trabajos. |
| Terminal integrada | Conserva inventario entre conteo de productos, series, análisis y supervisión; avance completo autorizado, conteo ciego y lectura por cámara/lector. Interfaz móvil y temas compartidos. |
| EAN / WTW | Carga privada de catálogos por sede, versiones inmutables, EAN exacto por cliente autorizado, consulta de posiciones y visor de coordenadas explícitas. Backend/datos originales WTW aún pendientes. |

Los nombres y códigos originales se conservan. Los conteos de códigos/fechas diferentes del mismo archivo mantienen su identidad. La vinculación automática utiliza el origen físico y, cuando corresponde, la fecha explícita. Las referencias de texto del cronograma se resuelven únicamente por cliente y fecha explícita únicos del panel del mismo respaldo. Los equipos del cronograma anterior se concilian por identidad de tarea antes de trasladar las asignaciones; un cambio de número de fila no reasigna personas. Las asociaciones ambiguas quedan señaladas para revisión desde el detalle de la tarea.

Los roles del Centro de Mando y WMS de la hoja USUARIOS son globales en el sistema original; la migración los conserva para UIO/GYE. El administrador puede limitar después las sedes y perfiles. El histórico permanece sin captura. Al limitar las sedes de una cuenta se bloquean también los listados, resúmenes y consultas directas del histórico; se conservan sus permisos originales protegidos en el resguardo. La cuenta ya existente no cambia su contraseña ni identidad. Las cuentas recuperadas se habilitan solo tras verificar la versión nueva y deben cambiar su clave antes de operar. Si el respaldo no contiene una contraseña, quedan para restablecimiento en Usuarios; no se inventa una clave por defecto.

## Publicación

Desde una terminal SSH de `apps` como `enicolalde`, actualizar referencias y ejecutar el lanzador de una revisión publicada:

```bash
(
  set -euo pipefail
  test "$(hostname)" = apps
  test "$(id -un)" = enicolalde
  cd /home/enicolalde/bryan/centro_mando_ims
  test -z "$(git status --porcelain)"
  git fetch origin migracion/mysql-candidata-20261104
  imsRevision='<REVISION_PUBLICADA>'
  git merge-base --is-ancestor "$imsRevision" FETCH_HEAD
  git show "$imsRevision:enterprise/deploy/habilitar_centro.sh" | bash -s -- "$imsRevision"
)
```

El lanzador prueba el código, recupera los datos desde el ZIP/SQL existentes, amplía exclusivamente los privilegios necesarios sobre tablas propias y prepara una versión inmutable. Verifica los permisos previos; no adopta privilegios desconocidos. La aplicación conserva el límite de 512 MB, CPU de 50% y cinco conexiones MySQL. La actualización reinicia únicamente `centro-mando-ims-ensayo.service`, verifica HTTPS, sesión, histórico y funciones del Centro. Si fallan las verificaciones, restaura la unidad anterior.

Entrada: `https://apps.flexnetuio.com:8445/`. También `/centro`, `/crear`, `/inventarios`, `/operacion`, `/erp` y `/catalogos`. La instalación continúa como entorno de validación hasta completar las dependencias y aceptación operativa. No habilita nuevas escuchas.

Tras la publicación, las capturas deben continuar en el servidor sobre el corte elegido. No se sincronizan después los cambios hechos en Google. No se deshabilitan ni modifican los triggers de otros proyectos.

## Conexiones que requieren autorización

Las credenciales ERP existentes se reutilizan desde su registro privado. No autorizan Gmail, SMTP ni Google Calendar. En **Centro de Mando → Conexiones y recordatorios**, el administrador registra un cliente OAuth y autoriza correo/Calendar con la cuenta configurable, inicialmente **bespinoza@itsanet.com**. El secreto se introduce en el formulario privado; no se solicita refresh token manual. El reemplazo de cuenta conserva la conexión anterior hasta completar el consentimiento nuevo. Pasos exactos: [Google Cloud y autorización](GOOGLE_CORREO_CALENDAR.md). SMTP TLS sigue disponible como alternativa cuando no hay Gmail autorizado. Las claves se cifran mediante AES-256-GCM; no se devuelven en las consultas ni se guardan en bitácora o almacenamiento del navegador. La clave `centro/clave_propia` debe incluirse en el respaldo privado.

Los recordatorios automáticos están desactivados hasta que se configure y habilite el correo. La prueba de despliegue no envía correos ni modifica calendarios. Antes de considerar operativas esas conexiones, verificar un envío y una sincronización desde la aplicación. ICS y descargas funcionan sin autorización externa.

Los XLSX se comprimen por bloques para evitar construir una hoja completa en memoria. Los ZIP se conservan siete días en fragmentos SQL, con descarga autenticada y límites de tamaño. La cola no abre otros puertos.

## Actualización de interfaz y dependencias · 16/11/2026

La revisión conserva cantidades exactas y elimina ceros de relleno solamente al mostrarlas. No convierte automáticamente fracciones ERP en enteros. **Revisar calidad y cobertura** informa etapas heredadas, fuentes parciales e inventarios sin cronograma; estos últimos pueden ser creaciones independientes válidas. No aplica una limpieza destructiva ni registra falsos errores de cantidades por diferencias de formato.

La selección de sede filtra también los indicadores del panel. Los datos originales disponibles se identifican como tales; las hojas parciales no se presentan como archivos completos. Para EAN/WTW se añaden tres tablas propias con permisos limitados; no se concede modificación sobre versiones anteriores, existencias históricas o fuentes.

La [matriz vigente](../docs/PARIDAD_INTERFAZ_20261116.md) distingue funcionalidades implementadas, pruebas sintéticas, ejecución corporativa confirmada y dependencias que aún requieren datos o autorización. Las cifras de validación siguientes documentan entregas anteriores.

## Validación de esta entrega

Validada con Node 22.23.3, Python 3.12 y MySQL 8.0.46: 187 pruebas unitarias Node, 155 Python, 123 pruebas de integración SQL y 26 recorridos Chromium, sin omisiones. Las pruebas SQL se ejecutaron en bases sintéticas independientes por archivo para no mezclar fixtures anteriores a la instalación de triggers con las pruebas del perfil operativo. Incluyen revocación por sede sin alterar el histórico, permisos limitados del usuario operativo, entrega del inventario y cronograma en una transacción, equipos tras inserciones de filas, participación de apoyos finalizados, reintentos y bloqueo de descargas tras revocar acceso.

No se hicieron envíos reales ni cambios en calendarios externos durante estas pruebas. La comprobación HTTPS del servidor se ejecuta al aplicar la revisión y verifica el histórico esperado antes de confirmar la actualización.

## Corrección del tiempo de espera del despliegue · 16/11/2026

Si la actualización informa que restauró y verificó la versión anterior, la preparación administrativa queda conservada; ese resultado no confirma que el Centro nuevo esté activo. Los contadores de importación en cero corresponden a un reintento que no encontró fuentes nuevas. Se reutiliza el mismo corte y no hace falta descargar otro ZIP.

Se corrigió un bloqueo exclusivo del perfil del administrador durante la consolidación: ahora conserva la autorización mediante lectura compartida y mantiene disponible la consulta de ese usuario. La evidencia de la operación conserva el control de reintentos concurrentes, sin conceder edición sobre la auditoría.

El verificador HTTPS del Centro admite respuestas de hasta 8 MiB y hasta 30 segundos para consultas, con salud limitada a 10 segundos. Conserva la verificación del certificado y su huella. El límite anterior de 256 KiB era insuficiente para un cronograma completo. Cada consulta informa una etapa fija, estado, HTTP y duración; no registra claves, cookies, identificadores ni contenido de filas. Si falla también el cierre de sesión, el diagnóstico conserva el fallo inicial. La reversión del servicio continúa activa.

Validación: 187 pruebas Node, 160 Python y 17 de integración del Centro con MySQL 8.0.46. Incluye TLS local con certificado sintético, consolidaciones concurrentes, lectura durante la consolidación y un panel de 110.039 líneas (97.822 históricas y 12.217 nativas) con más de 256 KiB de respuesta. Estas pruebas no actualizan el servidor corporativo; la aplicación de la revisión ejecuta allí las comprobaciones HTTPS.

Con CPU de 50 %, memoria de 512 MiB y heap Node de 256 MiB, el panel sintético respondió en 495 ms con 356.867 bytes. La prueba confirma que el verificador debe aceptar más de 256 KiB incluso cuando la consulta responde rápidamente. El registro original del servidor no identificaba la etapa; el progreso nuevo permite comprobarla en el reintento.
