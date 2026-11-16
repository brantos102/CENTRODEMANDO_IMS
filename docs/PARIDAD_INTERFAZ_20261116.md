# Paridad, interfaz y conexiones · 16/11/2026

Esta revisión continúa la migración completa solicitada. El objetivo incluye **Centro de Mando, ITSANET IMS/WMS, EAN y WTW**. Instalar esta revisión no significa que las dependencias externas estén resueltas ni que se haya completado la aceptación de producción.

Se cotejaron el código original disponible (`CentroDeMandoIntegral.html`, `BlindInventory.html`, `Cronograma_Recordatorios.js`, adaptadores ITSANET y el cotejo documentado de WMS V124), las capturas del usuario y las pantallas nuevas mediante Chromium. No se inspeccionó una sesión corporativa autenticada del navegador ni se modificaron sus proyectos de Google.

## Base confirmada y cambios actuales

El usuario confirmó la instalación anterior `df7d43dbd086dc01a4767e63acf751e94b1405aa`, con Centro disponible y comprobaciones HTTPS correctas. Se mantienen el corte elegido `07e58bf9-6fe1-4bf0-b93e-d1a89cb66764`, **352 conteos históricos / 97.822 líneas**, **23 conteos nativos**, 24 conexiones ERP y las cuentas ya recuperadas. No se solicita otro corte de inventarios ni se importan cambios posteriores de Google.

| Área del original | Implementación actual | Evidencia y límite |
|---|---|---|
| Dashboard, calendario, tendencia y cronograma | Centro nativo, fechas Ecuador, responsables/apoyos, pausa/reanudación/entrega, carpetas y vínculos | SQL y navegador. El selector de sede filtra también las tarjetas; no solo la tabla |
| Perfil, usuarios y acceso por cliente | Sesiones propias, jerarquía, sedes, permisos WMS y cambio obligatorio de clave heredada | Revocación y consultas directas verificadas en SQL. No reutiliza sesiones de RRHH |
| Creación del archivo | API de una o varias cuentas/clientes, CSV/TXT con formato explícito, borrador, carpeta y vínculo nuevo/existente/ninguno | Transacciones y reintentos. Los documentos operativos nuevos se guardan en MySQL |
| C1/C2/C3 y conteo ciego | Terminal de productos con control de revisión, UUID de operación y cola durable por usuario | Cero, duplicidad legítima, caída de respuesta y recarga probados. El histórico sigue protegido |
| Series, semejanzas y planilla alterna | Pantalla integrada con cámara/lector, selección explícita de coincidencia y trazabilidad | Navegador/SQL. Preserva los datos auxiliares disponibles del origen |
| Análisis y ajustes | Motor oficial ITSANET IMS / WMS V124; supervisión por línea y cantidades exactas legibles | Cotejo con función original y SQL. No redondea el stock para ocultar fracciones |
| Móvil y continuidad entre pantallas | Cabecera/tema comunes, inventario conservado entre productos, series, análisis y catálogos; conteos como tarjetas en móvil | Capturas sintéticas y recorridos a 390 px; no requiere desplazamiento horizontal para guardar el conteo |
| EAN | Importación privada/versionada por sede y resolución exacta por inventario/cliente autorizado | SQL/navegador. Falta cargar el catálogo real; no se eliminan ceros ni se elige arbitrariamente entre SKU |
| Ubicaciones WTW / visor | Catálogo local, filtro, impresión de nombres, visor de geometría explícita y acceso al WTW original | Probado con posiciones sintéticas. Falta maestro real y backend externo; no se declara paridad completa de sus operaciones/etiquetas/3D |
| Excel, CSV e historial | CSV conserva 30 columnas; libro XLSX añade análisis, series, alterna, capturas, originales autorizados y cobertura; ZIP y envío | Ceros de SKU y cantidades como texto exacto. Hojas parciales identificadas; no se inventa el historial faltante |
| Correo y Calendar | OAuth web con PKCE, estado de un uso ligado a sesión administrativa, configuración cifrada y reemplazo de cuenta; sincronización propia por tarea/lote | SQL y transportes simulados. Cliente Cloud y consentimiento real aún pendientes. No se enviaron mensajes ni se escribieron calendarios reales en las pruebas |
| Auditoría y consolidación | Trabajos persistidos, progreso, publicación de Entregados y programación propia a las 18:30 | SQL, permisos mínimos y concurrencia. La instalación no solicita publicación KPI ni cambia triggers externos |
| Calidad de datos | Revisión de secuencias heredadas, fuentes parciales e inventarios independientes sin cronograma | Solo consulta. Conserva cantidades/capturas; restringe inventarios a las sedes del administrador |
| Funciones auxiliares del WMS original | Presencia en tiempo real, ranking de captura, vistas masivas específicas y documentos PDF/QR/códigos de barras | No se declaran reproducidas íntegramente por esta revisión. El ranking de participación del Centro y sus impresiones no sustituyen automáticamente esos módulos |
| Archivos externos y adjuntos de Drive | Se conservan referencias/originales recibidos y descargas nuevas | Adjuntos no entregados y contenidos no presentes en el corte no se presentan como migrados |

## Lo que requiere datos o acceso externos

1. **Google Cloud:** crear el cliente OAuth web y autorizar `bespinoza@itsanet.com`. La [guía de configuración](../enterprise/GOOGLE_CORREO_CALENDAR.md) incluye las APIs, permisos y la URI exacta. Queda preparada la sustitución por la cuenta oficial, sin cambios de código.
2. **EAN:** entregar el catálogo efectivo al responsable para cargarlo por el formulario privado. La búsqueda por Drive y el adaptador genérico del respaldo no prueban por sí solos cuál es su fuente vigente.
3. **WTW:** recibir el maestro POS_UIO, el ID de proyecto Apps Script, su código/versión activa y reglas. El ID de despliegue disponible no permite reconstruir su backend. Se pidió al usuario la ubicación y responsable de estas fuentes, sin pedir credenciales en el chat.
4. Completar las funciones auxiliares identificadas y su cotejo con la versión original, y aceptar los flujos con responsables/operadores de ambas sedes. Probar respaldo/restauración y operación del servidor con sus datos efectivos antes de confirmar el cierre total.

Estas dependencias no justifican sobrescribir datos ni desactivar el aplicativo Google todavía utilizado por otros proyectos. El servicio sigue marcado como **entorno de validación**. El paso a producción se realizará cuando la implementación completa y su aceptación estén terminadas, conforme a la última instrucción del usuario.

## Verificación reproducida

| Batería | Resultado |
|---|---|
| Node 22.23.3, unidades | 195 aprobadas |
| Python 3.12 | 161 aprobadas |
| MySQL 8.0.46, integración | 138 casos en 11 archivos, todos aprobados en sus ejecuciones finales |
| Chromium | 30 recorridos aprobados, sin omisiones |

Los casos SQL se aíslan por archivo en bases sintéticas. Se repitieron los dos archivos afectados por montaje/usuario de archivos privados y contraseña del lector de pruebas; no se relajaron validaciones del código. La prueba de respuesta tardía del navegador espera la petición retenida concreta y mantiene la comprobación de que no retrocede la etapa confirmada. No depende de una espera global de inactividad de red.

Las pruebas externas de Gmail/Calendar usan transportes simulados, nunca cuentas reales. Las capturas de esta entrega contienen únicamente fixtures sintéticos y no son evidencia de que el servidor corporativo ya ejecuta esta revisión.

Capturas revisables: [conteo escritorio](capturas/ims-conteo-escritorio-20261116.png), [conteo móvil](capturas/ims-conteo-movil-20261116.png), [configuración Google](capturas/ims-conexiones-20261116.png) y [WTW con geometría sintética](capturas/ims-wtw-20261116.png).

## Instalación de la revisión

Usar el lanzador fijado a la revisión publicada, como indica [Centro de Mando MySQL](../enterprise/CENTRO_MANDO_MYSQL.md). Reutiliza el mismo respaldo privado, comprueba pruebas/permisos, añade únicamente las tres tablas de catálogos y prepara una versión independiente. No cambia la clave privada existente ni importa catálogos automáticamente.

Solo se reinicia `centro-mando-ims-ensayo.service`. Se conservan `127.0.0.1:3003`, HTTPS `8445`, Apache y los servicios de otros proyectos. Si la comprobación HTTPS falla, se restaura la unidad anterior; las tablas aditivas quedan conservadas. No crea un cliente Google Cloud ni autoriza una cuenta como consecuencia de instalar el código.
