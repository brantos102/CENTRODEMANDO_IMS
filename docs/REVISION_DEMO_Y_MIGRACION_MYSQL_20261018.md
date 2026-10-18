# Revisión para demo y migración empresarial — 18 de octubre de 2026

## Dictamen y alcance

La interfaz y los flujos revisados tienen una base aprovechable para la demo, pero el histórico de producción todavía requiere una consolidación nueva y validada. No se ha certificado la funcionalidad total en Google, ERP, Supabase ni Power BI. Después de esta revisión el usuario aprobó mejorar la legibilidad y los estados del panel y asistente; esa entrega se describe más abajo. El motor de datos y las reglas de inventario no se modifican en esta entrega.

Se verificaron los HEAD remotos y se revisó la arquitectura, las rutas principales, el estado de consolidación, la sincronización, permisos, formularios, cálculos y dependencias. El repositorio tiene unas 26.000 líneas entre Apps Script, interfaces y API. Revisar su arquitectura y probar recorridos no equivale a comprobar todos los caminos posibles.

| Rama remota | Revisión observada |
| --- | --- |
| codigo-en-vivo | c71aa652f9d8e1045ac6a0579fbd8e40aeda91bb |
| desarrollo | 69f602fac9a4c15eb20df95700a45b097cc1c222 |
| hotfix/consolidacion-cronograma | 50f0ceab99fafc6751839269e4f695b88ba259d9 |
| claude/dazzling-knuth-nv0sxt | 0a78f2e84bb93592942d0e72e3d29a38c729ce48 |

No se mezclaron ramas. `desarrollo` y la rama `claude` divergen de producción; no son sustitutos directos para publicar antes de la reunión.

## Estado de datos y CORRCAL

La ejecución diagnosticada terminó con estado ERROR, versión interna de estado 4 y 346/346 archivos recorridos. Esto significa que se alcanzó el cierre y este rechazó la validación, no que los KPI estén aprobados.

| Destino | Filas físicas | Registro de fuentes | Acumulador antiguo |
| --- | ---: | ---: | ---: |
| INVENTARIOS | 98.470 | 98.470 | 147.380 |
| REGISTRO | 64.787 | 64.787 | 90.938 |

El contador por archivo de `c71aa65`, versión interna 5, corrige la suma repetida de aportes. La etiqueta `versionEstado: 4` del diagnóstico describe la corrida antigua; no demuestra que haya fallado la importación del código nuevo.

El detalle contiene 2.118 incidencias únicas, todas `SKU_VACIO`. Los primeros ejemplos corresponden a CORRCAL, archivo `12E7utsTdalk9Qz-_Ddrebk0PUMd_F__RuSlcDmv-ARQ`. El usuario confirmó que el encabezado estaba mal escrito y ya lo corrigió a PRODUCTO. No corresponde desactivar la comprobación de SKU ni inventar códigos. La exportación previa atribuía 905 filas incluidas a ese archivo; eso tampoco certifica su estado actual.

Siguiente validación en el proyecto real, conservado ya el diagnóstico: cancelar el estado anterior y ejecutar `consolidarTodoDesdeEditor`. Esperar las continuaciones y verificar COMPLETADO, cero críticos, conciliación por origen y ausencia de archivos con error. Si quedan SKU_VACIO, revisar los archivos restantes en ERRORES_VALIDACION_DETALLE. No asumir que la corrección de un encabezado resuelve automáticamente las 2.118 incidencias.

## Evidencia de las comprobaciones

- 43 pruebas del núcleo de consolidación y 10 de sincronización Supabase: 53 aprobadas. Incluyen reintentos, cortes, aportes por archivo, IBM y VENTURA, eventos REGISTRO, cabeceras variables y bloqueo de críticos reales.
- Análisis de sintaxis: 25 bloques JavaScript de archivos raíz y scripts de interfaces, aprobados. Las expresiones de plantillas se sustituyeron para comprobar la sintaxis del JavaScript; esto no ejecuta el motor de plantillas de Google.
- Chromium local con RPC Google simulados: 16 comprobaciones sobre la interfaz actual, 14 aprobadas y 2 fallidas; además, 1 comprobación de la propuesta aislada aprobada. Navegación, perfil, usuarios, analytics, filtros, temas, modal KPI e impedimentos de creación sin CSV/API validados. Los gráficos usaron un sustituto de Chart.js; no se validaron descarga CDN, renderizado real de gráficas ni datos del servidor.
- API y proxy: 11 comprobaciones HTTP locales aprobadas, con Supabase simulado. Se reprodujeron adicionalmente 5 problemas de manejo de errores, límites o autenticación descritos abajo. Las rutas de lectura básicas que pasan no invalidan esos hallazgos.
- No se ejecutaron en producción creación de archivos, conteos, permisos, correos, Calendar, exportación ZIP, ERP ni actualización de Power BI. El terminal WMS y el histórico tienen revisión estática, sin una prueba operativa completa en este entorno.

Los JSON de evidencia, las capturas y los scripts de revisión de esta máquina se conservan fuera del runtime en `/workspace/ims-analysis/demo-review-20261018/`. Todos los datos usados en las pruebas HTTP y de interfaz son simulados; no contienen claves ni exportaciones productivas.

## Entrega visual aprobada y verificada

El usuario eligió «Panel y asistente: mejorar legibilidad y mostrar el estado de consolidación». Se aplicó ese alcance en WebApp.html, WebApp_JS.html y AsistenteCreacionV2.html:

- Tipografía, cifras, contraste y espaciado más legibles. Cabecera y navegación agrupadas para evitar superposición al desplazarse. Tablas y calendario conservan su desplazamiento dentro del componente; las pantallas verificadas no desbordan el ancho del navegador.
- Estado persistente de consolidación: en curso, con incidencias, cancelada, completada o sin corrida informada. La prevalidación completada se identifica explícitamente como una revisión que no reemplaza el histórico. El control de reanudar/cancelar mantiene los endpoints existentes y aparece solo en curso y para roles con permiso de consolidación en la interfaz.
- Última consulta al panel con hora de Ecuador y aviso de actualización, caché o error. Un fallo de refresco conserva los datos visibles y ofrece reintentar. Consultar datos operativos no emite una marca de KPI histórico validado.
- Caché separada por usuario y proyecto; se ignora la clave global antigua. No se superponen consultas de actualización manuales y automáticas.
- Asistente con campos y requisitos más legibles, diseño adaptable y preferencia de tema guardada por el panel cuando el navegador comparte ese almacenamiento. La extracción, validación, vinculación y creación mantienen su implementación previa.
- Colores del gráfico adaptados al tema sin cambiar sus series, cálculos o filtros.

No se añadió modo presentación, no se modificaron fórmulas KPI y no se incorporó una migración a MySQL en el código operativo. Los hallazgos de la API adicional permanecen documentados para una entrega separada.

Validación de esta entrega: **63 pruebas Node aprobadas** (43 consolidación + 10 Supabase + 10 estados/caché/permisos de interfaz), y **45 comprobaciones Chromium aprobadas**, sin excepciones JavaScript. Se probaron escritorio, tableta y móvil hasta 360 px, ambos temas, estados de error y recuperación, navegación, filtros, prevalidación y requisitos BLANK/CSV/API. Google y los datos fueron simulados; Chart.js se sustituyó en las pruebas por un doble que comprueba opciones y series. La petición de la biblioteca CDN desde este entorno respondió HTTP 403; eso no demuestra un fallo en los navegadores de producción. La carga real del CDN y el servicio Google se comprueban al importar y abrir la implementación autorizada.

Comandos Node desde la raíz:

```sh
node tests/consolidacion.test.cjs
node tests/supabase.test.cjs
node tests/interfaz.test.cjs
git diff --check
```

`tests/interfaz.browser.cjs` requiere Playwright disponible para Node y Chromium instalado. `NODE_PATH` puede señalar la instalación de Playwright del entorno de desarrollo; `IMS_UI_OUTPUT` permite guardar capturas fuera del checkout. El comando es `node tests/interfaz.browser.cjs`. Las capturas y resultados de esta ejecución están en `/workspace/ims-analysis/demo-implementation-20261018/`; no se importan como archivos Apps Script.

La publicación Git y la importación Google son pasos separados. Actualizar el deployment de producción existente, recargar el navegador y comprobar las pantallas reales antes de la demo. Una nueva consolidación tras corregir CORRCAL sigue siendo necesaria para validar el histórico; cambiar su presentación no reconstruye los datos.

## Hallazgos priorizados

| Prioridad | Hallazgo y evidencia | Acción propuesta |
| --- | --- | --- |
| Antes de presentar KPI históricos | Consolidación real en ERROR y cabecera CORRCAL corregida por el usuario | Ejecutar y conciliar una corrida nueva; no publicar el resultado anterior como validado |
| Demo | `WebApp_JS.html`, `pintarConsolidacion`: elimina el indicador cuando `enCurso` es falso, incluso en ERROR. Reproducido en Chromium | Mostrar estado persistente de consolidación y última actualización; diferenciar indicadores operativos del histórico |
| Demo | Pantalla de 390 px produce 734 px de ancho global. Reproducido en interfaz actual | Contener tablas y calendario en su propio desplazamiento; ajustar cabecera y columnas. La propuesta local eliminó el desbordamiento en ese tamaño |
| Demo | `ims_estado_cache` puede reutilizar datos hasta 12 horas; el refresco silencioso no muestra su error al usuario | Indicar datos en caché/actualizando/sin conexión con fecha; conservar lo último visible sin presentarlo como recién validado. Separar caché por usuario y proyecto |
| Exactitud | “Cumplimiento año” divide entregados entre toda la lista de cronograma; su período puede no coincidir con el rótulo. Lectura de `pintarDashboard` | Acordar y verificar denominador por año antes de cambiar la fórmula. Separar ajuste visual de cambio de definición KPI |
| API adicional | `/resumen` convierte `count` nulo en 0 e ignora el error. Una tabla simulada falló y respondió HTTP 200 con panel=0 | Devolver error o estado parcial explícito; conservar el último dato válido |
| API adicional | `/analitica` no examina el error de cronograma. Reproducido: fallo de tabla y HTTP 200 con eventos=0 | Rechazar la respuesta incompleta o marcarla explícitamente |
| API adicional | Consultas de analítica sin paginación o agregado SQL. Con límite simulado de PostgREST, 1.100 registros produjeron 1.000 | Agregar en SQL o paginar con orden estable y verificar el total. El límite real de Supabase está pendiente de comprobar |
| Acceso empresarial | La API permite leer datos si falta API_TOKEN. El proxy agrega un token común sin autenticar al visitante. Reproducido localmente | Exigir configuración y sesión en servidor; comprobar protección externa de Vercel. No se verificó exposición del despliegue real |
| Calidad de KPI | Vistas SQL toman desfase nulo como correcto y cuentan SKU/posición como correctos si alguna línea coincide. Puede diferir del criterio del WMS que excluye un SKU con cualquier error | Conciliar reglas con responsables de KPI y casos mixtos antes de portar las vistas a MySQL; no modificar la fórmula a horas de la reunión sin esa decisión |
| Publicación de datos | Reemplazos REST en Supabase usan DELETE y POST separados | En MySQL, staging y activación transaccional de una versión validada; no mostrar generaciones parciales |
| Identidad/roles | `_usuarioActual` y WMS tienen rutas de compatibilidad basadas en usuario efectivo o rol enviado/identidad manual; varias escrituras WMS requieren revisión de autorización en servidor | Prueba por roles y sesión del usuario real. En el servidor nuevo, identidad y permisos resueltos exclusivamente por backend |

## Propuesta visual acotada para estas horas

Las capturas de propuesta son copias locales. No cambian el proyecto Google ni usan KPI productivos como si estuvieran validados.

### Paquete recomendado: panel y asistente

1. Tipografía legible para proyección, cifras más grandes, mejor contraste de texto secundario y espaciado uniforme. Conservar temas claro y oscuro.
2. Mostrar actualización de datos y estado de consolidación, incluidos ERROR y CANCELADO. La tarjeta operativa y la validación del histórico se identifican por separado.
3. Calendario y tablas con encabezados claros, botones consistentes y desplazamiento dentro del componente. No cambiar fechas, filtros ni acciones de inicio/fin.
4. Asistente de creación con campos de mayor tamaño, estado de requisitos visible y resumen más legible. Conservar selección de fuente, extracción, validación, vínculo a cronograma, carpeta y bloqueo del doble envío.
5. Verificar escritorio, proyector y móvil, ambos temas y los permisos de cada rol antes de importar.

Es un alcance pequeño de interfaz, estimable en unas horas después de elegirlo y según las incidencias de prueba. No incluye sustituir Apps Script, cambiar esquemas ni rehacer reglas de inventario. La corrección de errores de API y de fórmulas KPI se evalúa como cambio separado, especialmente si la demo utiliza el panel adicional de Vercel.

### Opcional: modo presentación

Un interruptor local pliega los grupos administrativos y amplía la zona de calendario y resultados. Mantiene accesibles las herramientas al salir y respeta permisos. No cambia estado del servidor, deshabilita validaciones, inventa cifras ni deja botones de escritura expuestos a otro rol.

### Criterio para publicar

Publicar únicamente el alcance elegido y probado. Conservar la versión anterior de la misma implementación; importar el conjunto correcto de 15 archivos y actualizar el deployment existente. La comparación de archivos debe mostrar solo el cambio previsto.

El acceso actual de Apps Script es DOMAIN según appsscript.json. Comprobar previamente la cuenta de quien abrirá la demo desde otro país; la ubicación geográfica no reemplaza la autorización del dominio. No es necesario ampliar el acceso público para compartir pantalla durante la reunión.

## Recorrido de aceptación en el entorno real

| Recorrido | Resultado que debe comprobarse | Estado de esta revisión |
| --- | --- | --- |
| Inicio por Google, perfil y permisos | Cada rol ve y puede ejecutar solo lo autorizado | Navegación simulada probada; autorización Google pendiente |
| Panel, calendario y filtros | Sin errores JS, mismos eventos y fechas en ambos temas | Recorridos simulados aprobados; datos reales pendientes |
| Crear inventario | BLANK, CSV y API; vínculo a evento existente/nuevo/sin vínculo; carpeta correcta; un solo archivo por envío | Impedimentos y formulario simulados probados; creación real pendiente |
| WMS | Auditor sin escritura; operario autorizado; conteo y reconteo sin duplicados ni pérdida al refrescar | Revisión estática; operación real pendiente |
| Consolidación | Corrida nueva, reintentos y cierre conciliado por fuente; IBM y VENTURA preservados | 43 pruebas locales aprobadas; corrida real pendiente |
| Reportes, ZIP y notificaciones | Un reporte por cliente, descarga válida, destinatarios y Calendar correctos | Pendiente en copia autorizada; no se enviaron mensajes desde esta revisión |
| Supabase y Power BI | Generación validada, conciliada por archivo/cliente/origen, refresco al final | 10 pruebas locales de sincronización aprobadas; servicios reales pendientes |

## Migración al mismo servidor empresarial de IV_ITSANET

El usuario confirmó el destino compartido con IV_ITSANET. No existe documentación de ese despliegue en este workspace y este chat no permite consultar otra conversación. No se dedujeron versión MySQL, sistema operativo, proxy, puertos, dominios ni credenciales a partir del nombre del otro proyecto.

### Arquitectura propuesta

Navegador → HTTPS y sesión empresarial → servicio IMS → MySQL privado. Un trabajador IMS ejecuta importaciones, consolidaciones, exportaciones y tareas programadas. Power BI consulta vistas de lectura validadas. Drive, Google Calendar, correo y ERP permanecen como integraciones explícitas durante la transición.

El servicio IMS debe tener base/esquema lógico propio, usuario MySQL propio, proceso o contenedor propio y límites de recursos. Reutilizar el servidor no implica reutilizar tablas, sesiones o credenciales de IV_ITSANET. Confirmar el sistema de despliegue existente antes de proponer comandos o puertos definitivos. Evitar cambiar parámetros globales de MySQL o del proxy que puedan afectar al proyecto ya migrado.

No se recomienda conectar el navegador directamente a MySQL ni sustituir una URL de Supabase como si los motores fueran equivalentes. `supabase-js`, PostgREST y las vistas PostgreSQL deben adaptarse. La interfaz actual usa `google.script.run`, plantillas HTML, Session, DriveApp, SpreadsheetApp, triggers y cuotas; esas llamadas necesitan contratos HTTP y trabajos de servidor equivalentes.

### Inventario de migración completo

- Fuentes originales: libro maestro y todos sus tabs, archivos hijos entregados y en proceso, otros años, fórmulas y valores, hojas alternas, series, análisis e historial. No limitar la exportación a INVENTARIOS.
- Panel, cronograma, códigos programados, clientes, equipo, usuarios y roles, apoyos, registro de actividades, auditorías y notificaciones.
- Datos presentes en Supabase, esquema real, índices, restricciones, vistas, políticas y diferencias con Sheets. No tratar la copia de Supabase como fuente completa sin conciliarla.
- Referencias Drive/Calendar, archivos exportados y metadatos de integraciones. Decidir qué documentos siguen en Drive y cuáles se almacenan en el servidor; una tabla SQL no copia los archivos.
- Configuración y secretos transferidos mediante el mecanismo del servidor, separados de datos de negocio. No exportar contraseñas ni ScriptProperties al repositorio, logs o navegador. Identificar sesiones, triggers y callbacks que deben sustituirse, porque `clasp clone` no los exporta.

### Modelo e identidad

Entidades iniciales: país/sede/cliente; usuario/rol/permiso; evento/equipo de tarea; fuente de inventario; corrida de importación; snapshot de inventario; línea de inventario; conteo/evento de registro; incidencias de validación; auditoría y trabajo programado.

`archivo_id` o el código visible no es único: IBM y VENTURA tienen fuentes distintas autorizadas bajo el mismo código. Conservar el ID de Drive como procedencia externa y asignar identidad interna propia. Un SKU puede repetirse legítimamente por ubicación, serie, lote, despacho y partida; no crear una restricción UNIQUE por SKU ni por código de inventario.

Para la carga inicial, una clave de reintento puede incluir snapshot + fuente + hoja + número de fila de esa exportación inmutable. El número de fila de una hoja editable no es una clave estable para operaciones posteriores. Las nuevas líneas y eventos reciben IDs internos e idempotencia por petición; la auditoría conserva la procedencia y la multiplicidad original.

Conservar códigos y series como texto, incluidos ceros iniciales. Cantidades en DECIMAL con precisión elegida a partir de los rangos reales. Fechas de negocio como DATE; instantes con zona original y normalización UTC. Añadir país/sede/zona horaria de forma explícita; no copiar UIO como constante para otras operaciones.

### Carga y activación

1. Inventariar y respaldar fuentes, configuración y despliegues; comprobar una restauración. Separar copia sin transformar y tablas normalizadas.
2. Exportar por lotes con manifiesto, fuente, fecha, filas y firma verificable; guardar incidencias sin descartarlas ni maquillarlas como cero. Una corrección de datos debe dejar trazabilidad.
3. Importar a staging con transacciones por lote y reintentos. Validar tipos, claves y relaciones. Reejecutar el mismo manifiesto no añade otra copia.
4. Conciliar por país/sede/cliente/código/origen, no solo el total global: filas, unidades, referencias, posiciones, fechas, series y diferencias. Conservar ambos IBM, ambos VENTURA y las copias HYCITE identificadas.
5. Reescribir las vistas PostgreSQL y probar sus resultados contra casos conocidos. DATE_TRUNC, FILTER y casts `::` requieren equivalentes MySQL; acordar primero las reglas de exactitud, nulos y períodos.
6. Activar una generación validada dentro de una transacción. Las lecturas y Power BI consultan la generación activa completa; un fallo de importación deja vigente la anterior.
7. Ejecutar en paralelo como lector para comparar resultados, con un solo sistema autorizado a escribir y enviar notificaciones. Reservar una ventana para el delta final, probar el cambio y habilitar las tareas nuevas sin duplicar correos o Calendar.

### Rendimiento y convivencia

Usar pool de conexiones y consultas parametrizadas. Dimensionar concurrencia según RAM, CPU y capacidad del MySQL compartido, sin fijar tamaños a ciegas. Diseñar índices sobre los filtros reales —fuente, fecha, sede, cliente, SKU/posición—, confirmar con EXPLAIN y medir consultas lentas. Paginar por clave estable. Evitar procesar históricos completos en cada carga de pantalla. Guardar estado de trabajos en MySQL y publicar progreso para que los reintentos sobrevivan al reinicio del proceso.

### Reversión y aceptación

Durante la comparación, Apps Script sigue siendo el escritor. Después del corte, MySQL será el escritor autorizado; si se requieren hojas, se actualizan como salida controlada. Evitar escritura bidireccional sin un mecanismo de conflictos.

La reversión posterior al corte necesita exportar o reconciliar los cambios escritos en MySQL. Volver solo a la URL antigua puede perder conteos nuevos. Definir esa transferencia y probarla antes del corte, junto con respaldo/restauración y control de tareas programadas.

La migración se acepta cuando se concilian las fuentes, pasan los recorridos reales por rol, Power BI coincide con las vistas aprobadas y la operación de IMS no degrada IV_ITSANET en una carga representativa. No se ofrece una garantía de ausencia de errores basada únicamente en pruebas locales.
