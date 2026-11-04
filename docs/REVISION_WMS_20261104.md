> Actualización: el respaldo solicitado de V124 ya se recibió y sus cinco archivos coinciden con HEAD. Véase `COTEJO_WMS_V124_20261104.md`. Los apartados siguientes conservan el estado de la revisión inicial.

# Revisión del código de plantilla y WMS — 4 de noviembre de 2026

## Alcance y versión

Se abrió el ZIP `IMS_CODIGOS_20261104_114204_008.zip`, SHA-256 `be3e19d0e0b39a3e2047316086402d0396aa40cf35a830cecd264987f4dadb7f`. Contiene dos proyectos y sus listados de implementaciones: dos archivos de código/configuración de plantilla y cinco de Interfaz. Se verificó sintaxis de los dos servidores y los dos bloques JavaScript de Js_Core. No se ejecutaron servicios Google, funciones contra hojas reales, envíos de correo ni operaciones sobre producción.

El listado de COD_INVENTARIOS_INTERFAZ vincula el ID WMS comunicado a **@124 — ITSANET_IMS_V3.5**. COD_INVENTARIOS tiene una implementación @1. Los comandos usados para crear el ZIP clonaron **HEAD**, sin versión numérica: la pertenencia de la URL al proyecto queda confirmada por el listado, pero no está comprobada la igualdad del código HEAD con @124 ni con @1. Todos los hallazgos siguientes corresponden a HEAD; no demuestran por sí solos el comportamiento de la implementación publicada.

No se ha realizado una auditoría de todas las copias históricas de la plantilla. El código de la plantilla actual tampoco prueba que todos los archivos hijo tengan la misma revisión o los mismos disparadores.

## Funcionalidad encontrada y destino propuesto

| Área | Funciones/elementos existentes | Reemplazo en el sistema propio |
|---|---|---|
| Catálogo y selección | PANEL DE CONTROL, leerInventariosPanelControl, enlaces directos | Inventario independiente por archivo; sede y clientes explícitos, mismo código operativo |
| Conteo ciego | guardarConteoFila, guardarConteoMasivo, V/W/X, ocultar DEPOT | Evento de conteo transaccional, tres etapas, permisos y ocultación en respuesta del servidor |
| Series | validarSerieCompleta, procesarGuardadoInventario, semejanza y duplicados | Series vinculadas a líneas y sesiones; conservar reglas existentes hasta validar posibles ambigüedades por cliente |
| Hallazgos | guardarPlanillaAlternaCompleta, PLANILLA ALTERNA | Hallazgo con identidad propia y referencia al evento/operario; conservar fila original como evidencia |
| Ajustes | registrarAjusteInventario, motivos, justificaciones y posición nueva | Ajuste auditado; autorización de servidor, sin sobrescribir el historial |
| Auditoría y tiempos | REGISTRO, registrarAuditoria, TIEMPOS, _RESP_WMS | Eventos inmutables, inicio/fin y pausas; copia cruda con procedencia |
| Clasificación | CRONOGRAMA_CODIGOS, caché ABC, _ABC_SNAPSHOT | Catálogo por cliente/código con versión, origen y reglas de respaldo preservadas |
| Analítica | actualizarAnalisis de plantilla, parseAnalysisData de WMS | Definición de métricas explícita y contrastada, vista por revisión y publicación |
| Finalización | finalizarInventarioWMS, estado y fecha en panel/cronograma | Transacción de cierre con revisión esperada; publicación KPI separada y autorizada |
| Operación sin conexión | wms_offline_queue, procesarColaOffline | Cola durable por usuario/inventario, ID único por operación y confirmación después del commit |
| Presencia y ranking | CacheService, PropertiesService, latidos | Sesiones y actividad separadas de contadores de inventario; ranking fuera de la transacción crítica |
| Clientes y auditores | GUEST, enlaces directos, controles visuales | Autorización por usuario/cliente/inventario/línea/documento en cada endpoint |
| WTW y mapas | Maestro POS_UIO, etiquetas, visor 3D y aplicación externa | Catálogo de ubicaciones y adaptador; inventariar dependencia externa antes de retirar Google |
| Exportación y comunicación | PDF, códigos de barras, QR, enlaces Drive/Gmail | Documentos versionados, enlaces compatibles y envío solo por acción autorizada |

No se copiarán los dos Código.js dentro de un mismo ámbito: comparten nombres como onOpen, onEdit, registrarAuditoria, actualizarAnalisis y consolidarDatos, con implementaciones diferentes. En el servidor necesitan módulos separados y contratos explícitos.

## Hallazgos comprobados

### 1. Reintento de conteo sin identidad de operación

Interfaz `guardarConteoFila` (línea 774) elige la primera celda vacía de V/W/X. No recibe identificador de operación. En una prueba sintética, repetir exactamente la petición dejó C1=10 y C2=10: puede convertir un reintento en un segundo conteo. Esto es distinto de los antiguos duplicados del consolidado y no queda solucionado únicamente por deduplicar INVENTARIOS.

La cola offline reenvía esa misma función (`Js_Core.html:3525`). Además, `procesarColaOffline` retira la copia persistente antes de confirmar el envío completo (`:3541`); una interrupción del navegador en ese intervalo puede perder la copia durable. La restauración de cola existente conserva archivo/email originales, lo cual es útil y debe mantenerse, pero no resuelve la identidad de operación.

Destino: `operacion_id` persistido antes de enviar, restricción única por ámbito de operación, respuesta repetible y borrado de cola solo tras confirmación. La clave no debe ser SKU ni cantidad: dos conteos legítimos idénticos son eventos diferentes.

### 2. Conteo y auditoría no son una transacción

En `guardarConteoFila`, el valor se guarda antes de registrar la auditoría. Si la segunda operación falla, el catch responde «Celda ocupada» aunque el conteo haya quedado escrito. La prueba reprodujo este estado y el siguiente reintento ocupó C2. El texto de error oculta causas diferentes, no solo contención.

`acquireFileLock` (`Código.js:88`) usa lectura/escritura de CacheService y vencimiento de 30 segundos: no es una adquisición atómica respaldada por almacenamiento durable. `registrarAjusteInventario` y `guardarPlanillaAlternaCompleta` ni siquiera pasan por ese bloqueo. No se ha simulado carga real ni demostrado una carrera en producción; sí se verificó el orden de las escrituras.

Destino: transacción MySQL corta que incluya conteo, auditoría e identidad de operación, bloqueo de la línea/revisión necesaria y control de versión. Evitar un bloqueo global que detenga inventarios distintos.

### 3. Auditoría masiva con CLIENTE mal referenciado

En `guardarConteoMasivo` (`Código.js:858`), metaData se lee desde C; metaData[4] es G/PRODUCTO. El arreglo de auditoría lo escribe tanto en G/CLIENTE como en H/CODIGO. La prueba lo confirma con datos sintéticos. Además, `procesados` devuelve el tamaño de la solicitud aunque alguna fila se haya ignorado por estar fuera de rango o tener completas las etapas.

Esto ofrece una explicación concreta para algunos clientes con SKU en REGISTRO, pero no permite clasificar automáticamente todas las anomalías del consolidado. Conservar originales y relacionarlos por fuente/evento antes de corregir; no desplazar columnas en bloque ni deducir cliente solo del nombre del archivo.

### 4. Dos motores de indicadores con denominadores distintos

La plantilla `actualizarAnalisis` (`Código.js:1734`) solo considera correcto un SKU cuando todos sus estados presentes son CORRECTO. WMS `parseAnalysisData` (`Código.js:667`) calcula referencias sobre referencias contadas y elimina correctas cuando encuentra errores, pero no cuando encuentra una línea pendiente del mismo SKU.

Prueba: SKU único, una línea correcta y otra aún sin contar. WMS devuelve efectividadRef=100.0; plantilla deja H22=1 y H23=0. Son resultados distintos ante el mismo contenido. El código Supabase de calidad revisado previamente usa otra agregación; no se debe copiarlo como regla autorizada ni usar su base desactualizada como fuente.

Destino: conservar inicialmente las métricas identificadas por definición y revisión; separar avance de conteo y exactitud. La regla final de KPI debe validarse con casos aceptados de negocio. Este informe no selecciona silenciosamente uno de los motores ni cambia cifras históricas.

### 5. Campos históricos explicados por sus escritores

`registrarAuditoria` en Interfaz (`:1114`) escribe fecha/hora en A/ACTUADOR. La plantilla también lo hace (`:1672`). Es una convención de los escritores, no una prueba de desplazamiento de la fila completa.

`guardarPlanillaAlternaCompleta` (`:1094`) escribe el correo del operario en B, cuyo encabezado XLSX es ID. La prueba reproduce este orden. En la plantilla, la auditoría escribe nombre de usuario en E; Interfaz normalmente escribe correo en E. La columna O/LINK se usa para observaciones/eventos en estos escritores, por lo que no todos sus valores son URL.

Destino: persistir cada fila original con fuente, revisión y tipo de escritor cuando sea conocido; normalizar timestamp, operador e inventario en campos internos separados. No cambiar los encabezados públicos de 30/15 ni sobrescribir valores históricos en Google para «arreglar» la importación.

### 6. Identidad y autorización requieren implementación en servidor

En el respaldo HEAD, `validarCredenciales` compara el campo pass, pero las escrituras reciben email/fileId y no exigen una sesión de aplicación ni autorización por cliente en esas funciones. El frontend conserva rol/email en localStorage y aplica controles visuales. Esto no equivale a una autorización de servidor.

`obtenerSesionWMSActual` (`:1164`) recurre a EffectiveUser si ActiveUser está vacío. Con ejecución como USER_DEPLOYING, esa cuenta puede ser quien publica; no debe usarse como identidad demostrada del visitante. La prueba sintética reproduce el fallback, sin consultar usuarios reales.

`getTodosLosUsuarios` y `getUsuariosConHoja` son funciones globales sin sufijo privado y retornan objetos que incluyen pass. El segundo puede aplicar un PIN predeterminado cuando faltan valores. No se han divulgado valores ni probado llamadas externas. El manifiesto HEAD declara DOMAIN/USER_DEPLOYING; no se afirma acceso anónimo público ni se ha inspeccionado la configuración histórica de @124.

Destino: funciones internas privadas y respuestas sanitizadas; contraseñas con hash adecuado, sesiones de servidor y permisos por acción/sede/cliente/línea. Para clientes externos hay que preparar acceso explícito: la configuración DOMAIN del respaldo no demuestra que hoy puedan acceder cuentas externas. No exportar usuarios/contraseñas al navegador ni a un repositorio.

### 7. Cierre y propagación de estado

`finalizarInventarioWMS` (`:1230`) permite confirmar cierre aunque avance sea menor a 100; no se cambia esa regla sin decisión de negocio. Actualiza fecha, panel y cronograma en operaciones separadas. El cronograma se busca también por coincidencias parciales de nombre (`:1199`), potencialmente ambiguas cuando hay códigos iguales; se necesita relación interna estable.

La plantilla actualiza la fecha final B desde el último evento de REGISTRO (`verificarYActualizarColumnaB`, :886). Esa fecha no debe confundirse automáticamente con la entrega comercial seleccionada en WMS. La importación debe conservar ambas evidencias.

Solo Entregado debe entrar al consolidado KPI. Esto no implica descartar archivos En Proceso/En validación ni borrar su stock, series, sesiones o conteos. El cierre operacional y la validación/publicación KPI son estados relacionados pero distintos.

### 8. Disparadores y fuentes auxiliares

La plantilla instala onChange/onEdit y rutina cada 30 minutos; su comentario asume que escribir desde otro script dispara onChange. Las escrituras por script/API no deben usarse como garantía de disparo de triggers instalables. En el respaldo de Interfaz no se encontró una llamada a actualizarInventario de la plantilla para encadenar explícitamente ese pipeline. No se han consultado los triggers instalados reales; no se concluye cuándo se recalcula cada archivo en producción.

Referencia: https://developers.google.com/apps-script/guides/triggers/installable#restrictions

La plantilla busca ABC en CRONOGRAMA_CODIGOS, con snapshot, refresco y predeterminado HYCITE=C. El menú legacy de Interfaz usa ABC2025.txt y tiene actualizarAnalisis vacío. Son caminos distintos, no deben fusionarse por nombre. Js_Core contiene declaraciones repetidas de seis nombres de funciones; se registraron para revisar ámbito y comportamiento antes de modularizar, no se eliminaron automáticamente.

## Dependencias adicionales descubiertas

| Dependencia | Referencia del código | Situación |
|---|---|---|
| Maestro actual | Centro de Mando ya aportado; CRONOGRAMA_CODIGOS, USUARIOS, panel y cronograma | Hay copia XLSX; obtener delta vigente al cortar |
| Catálogo EAN | `1W9N73V2Y04DfxAk2KIMl-0Wk3fzGxBCxAGDoasXifIQ` | Se referencia en obtenerBaseEAN; contenido no recibido |
| Ubicaciones WTW | `1ZoVwXLyyA0dVuo-Ur1DOzEVshJbY96hj`, hoja POS_UIO | ID copiado literalmente del código, vigencia/acceso no comprobados |
| Aplicación WTW externa | Implementación `AKfycbzOP_NTy6LWE3Z9dT5wBHdraPTJPpJ6CenS6Woz1S6DTdBjRB2mYmmz6F3b3j8HeyM80w` | Se usa en iframe, etiquetas y visor; código y proyecto no recibidos |
| Usuarios temporales y configuración | WMS_TEMP_USERS, DEPOT_VIS_*, propiedades y cachés | No vienen en clasp clone; migración privada y controlada, sin publicar secretos |
| Adjuntos y marca | Drive e imágenes Google, historial, enlaces de clientes | Conservar referencias y descargar objetos antes de retirar Google |
| Bibliotecas de interfaz | SweetAlert2, Three/OrbitControls, Chart.js, jsPDF/autoTable, html5-qrcode, JsBarcode, fuentes e iconos | Versionar y servir localmente lo necesario; no sustituir a ciegas dependencias durante la demo |

No se debe cerrar la dependencia de Google sin resolver estas fuentes, los archivos hijo activos y los históricos solicitados por clientes. Tampoco se debe intervenir otra aplicación WTW sin conocer su proyecto y alcance: por ahora es una dependencia identificada, no un componente ya migrado.

## Orden de trabajo propuesto

1. Obtener copia aislada de @124 y comparar hashes con HEAD; inventariar diferencias antes de aplicar arreglos.
2. Completar mapa de datos de EAN/ubicaciones y alcance WTW; preservar archivos hijo y pendientes completos.
3. Implementar en la candidata MySQL un único flujo transaccional e idempotente de conteo/auditoría y sesiones autorizadas. Mantener formatos, códigos y etapas; introducir correcciones de comportamiento con casos reproducibles y validación de negocio.
4. Reproducir pantallas WMS y documentos sobre la nueva API; medir concordancia por inventario y usuario, sin escribir desde dos sistemas al mismo tiempo.
5. Cargar corte inicial y deltas, reconciliar cantidades/eventos por fuente y dar acceso de clientes en el reemplazo. Decidir el corte cuando esas pruebas pasen; conservar retorno que incluya operaciones nuevas.

Todo esto se prepara en aplicación, carpeta y base propias. Los puertos propuestos siguen siendo 127.0.0.1:3003 y HTTPS :8445, sujetos a revalidación y acceso externo; no se han activado servicios ni modificado IV_ITSANET, RRHH o Data Sync.

## Evidencia y límites

`caracterizacion.test.cjs` ejecutó **8 pruebas locales satisfactorias**, con funciones seleccionadas del código recibido y servicios simulados. Documentan comportamientos y defectos existentes: no representan ocho arreglos, pruebas contra Google, concurrencia real, navegador real ni certificación de una migración terminada. Los datos sintéticos no contienen credenciales reales.

La sintaxis correcta no valida toda la operatividad. Falta revisar @124, permisos/triggers/propiedades efectivos, servicios auxiliares y recorridos de operarios/clientes en la candidata del servidor. No se ha modificado ninguno de los archivos fuente recibidos.
