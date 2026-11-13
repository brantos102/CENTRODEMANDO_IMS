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
| Reportes | CSV, XLSX real de 30 columnas, ZIP de hasta 50 inventarios autorizados y envío de reportes con adjunto. SKU/series en Excel son texto. |
| Consolidación | Auditoría y publicación de resultados únicamente de Entregados verificados. Cola persistente, progreso y revisión de errores. Programación diaria a las 18:30, hora Ecuador. |
| Notificaciones | Recordatorios manuales y automáticos para el equipo asignado; SMTP TLS configurado por el administrador. Los envíos sin confirmación no se repiten automáticamente. |
| Calendar | Sincronización explícita con Google Calendar; solo crea/modifica los eventos que pertenecen a este Centro. Requiere autorización privada de la cuenta. |
| Trazabilidad | Fuentes, cobertura por hoja, bitácora administrativa, historial original y resultados de trabajos. |

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

Entrada: `https://apps.flexnetuio.com:8445/`. También `/centro`, `/crear`, `/inventarios`, `/operacion` y `/erp`.

Tras la publicación, las capturas deben continuar en el servidor sobre el corte elegido. No se sincronizan después los cambios hechos en Google. No se deshabilitan ni modifican los triggers de otros proyectos.

## Conexiones que requieren autorización

Las credenciales ERP existentes se reutilizan desde su registro privado. No autorizan Gmail, SMTP ni Google Calendar. En **Centro de Mando → Conexiones y recordatorios**, el administrador configura SMTP TLS o autoriza Calendar con sus credenciales propias. Se cifran mediante AES-256-GCM; no se devuelven claves a las consultas, no se guardan en la bitácora ni en el navegador. La clave de cifrado se conserva en `centro/clave_propia`, privada, y debe incluirse en el respaldo privado.

Los recordatorios automáticos están desactivados hasta que se configure y habilite el correo. La prueba de despliegue no envía correos ni modifica calendarios. Antes de considerar operativas esas conexiones, verificar un envío y una sincronización desde la aplicación. ICS y descargas funcionan sin autorización externa.

Los XLSX se comprimen por bloques para evitar construir una hoja completa en memoria. Los ZIP se conservan siete días en fragmentos SQL, con descarga autenticada y límites de tamaño. La cola no abre otros puertos.

## Validación de esta entrega

Validada con Node 22.23.3, Python 3.12 y MySQL 8.0.46: 187 pruebas unitarias Node, 155 Python, 123 pruebas de integración SQL y 26 recorridos Chromium, sin omisiones. Las pruebas SQL se ejecutaron en bases sintéticas independientes por archivo para no mezclar fixtures anteriores a la instalación de triggers con las pruebas del perfil operativo. Incluyen revocación por sede sin alterar el histórico, permisos limitados del usuario operativo, entrega del inventario y cronograma en una transacción, equipos tras inserciones de filas, participación de apoyos finalizados, reintentos y bloqueo de descargas tras revocar acceso.

No se hicieron envíos reales ni cambios en calendarios externos durante estas pruebas. La comprobación HTTPS del servidor se ejecuta al aplicar la revisión y verifica el histórico esperado antes de confirmar la actualización.
