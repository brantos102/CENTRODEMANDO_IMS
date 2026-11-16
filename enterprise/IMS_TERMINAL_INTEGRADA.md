# Terminal ITSANET IMS integrada · 16/11/2026

El registro entregado por el usuario confirma que `6137578` quedó instalado. Ese instalador no cargaba automáticamente los CSV recibidos y su comprobación HTTPS no verificaba la geometría del catálogo. Además, la creación abría Supervisión y el mapa estaba separado en Catálogos. Esta revisión une el flujo operativo.

## Flujo y pantallas

1. **Centro de Mando → Crear inventario**. Seleccionar sede, cliente, fecha y carpeta, elegir API ITSANET (una o varias cuentas, o posiciones), CSV/TXT o en blanco. La extracción muestra filas, unidades y muestra antes de crear; el archivo operativo nuevo se guarda en MySQL con carpeta, vínculo de cronograma y procedencia ERP.
2. La creación y su recuperación abren **`/ims?inventario=<id>`**. Las referencias nativas del panel y los eventos abren esa misma terminal.
3. **Inicio** presenta búsqueda EAN/SKU/serie, registros por ubicación y mapa de las posiciones de ese inventario. **Conteo físico** conserva C1/C2/C3, lector/cámara, cola por usuario, cero y control de revisión. Seleccionar una ubicación filtra por coincidencia exacta; A-01 no incluye A-010. Un producto repetido conserva cada línea y el operador elige cuál contar.
4. **Series, Análisis, Adicionales y Administración** montan los formularios propios de operación en la misma página y mantienen la sesión y el inventario. Utilizan las mismas API, permisos, transacciones y validaciones que Supervisión; no hay otro escritor de conteos. Administración conserva asignaciones, visibilidad de stock, ajustes auditados y entrega explícita.
5. **Mapa bodega** consulta las ubicaciones del inventario y dibuja sus medidas del maestro en cm. Ofrece vistas 3D, superior, frontal y lateral, giro, zoom, progreso C1, revisión de secuencias, ocupación declarada y rayos X. La ficha permite abrir esa ubicación para contar. El ajuste de pasillos sigue siendo una distribución calculada, no un levantamiento de la edificación.

El progreso representa **C1 presente / líneas autorizadas**, no exactitud, unidades físicas ni KPI entregado. La revisión de etapas identifica saltos C2/C3, sin divulgar diferencias o stock teórico al operador ciego. El análisis oficial sigue siendo ITSANET IMS / WMS V124. No se declara reproducida la geometría estructural o todos los efectos visuales de la aplicación externa.

Los formularios y el mapa muestran solo la sesión e inventario vigentes; las respuestas anteriores no habilitan una pestaña de otro inventario. El análisis y Administración se ocultan según el alcance devuelto por el servidor. Cada escritura vuelve a autorizarse en SQL. Cambiar de cuenta limpia el mapa, las filas y los formularios integrados; los guardados pendientes conservan su dueño original.

## Cargar los catálogos ya entregados

No se solicita otro corte Google ni otros CSV. El paquete **privado** `catalogos_ims_privados_20261116.zip` contiene únicamente `POS_ITSANET.csv` y `RELACION_EAN13_UIO.csv`, con las huellas de los archivos recibidos. No contiene credenciales ni código ejecutable y no se publica en Git.

Copiarlo en `/home/enicolalde/bryan/centro_mando_ims_datos/entrada/catalogos_ims_privados_20261116.zip` y ponerle permisos `600`. El lanzador de revisión, después de preparar las tablas propias, llama a `deploy/cargar_catalogos.py` si encuentra este ZIP. Valida nombres, tamaños, huellas fijas y directorio privado antes de extraer. Usa el administrador inicial y la cuenta MySQL de migración existentes. Las asociaciones EAN usan nombres exactos y los metadatos ERP preparados; las ambiguas permanecen conservadas para revisión y no resuelven un SKU automáticamente.

Un catálogo con el mismo original ya cargado se verifica y reutiliza. Si existe un catálogo actual diferente, se detiene y lo conserva; no sustituye una edición posterior. Cada catálogo se importa transaccionalmente y conserva su archivo original; si un catálogo posterior del paquete falla, los anteriores confirmados permanecen versionados y el reintento los verifica. No se tocan stock, capturas o permisos de inventarios.

El resultado imprime por sede registros, posiciones 3D y pendientes de medidas, además de asociaciones EAN pendientes. Si falta el ZIP, el lanzador lo indica y la terminal muestra que falta el maestro, en lugar de presentar la ausencia como una extracción terminada. Si el CSV ya estaba cargado, el mapa lo reutiliza.

Resultado del archivo completo: **30.751 posiciones con medidas positivas y 443 pendientes de medidas cero**. Las ocho posiciones de dimensiones menores a 5 cm conservan sus valores originales. Ver [reglas del mapa](MAPA_PROPIO_POSICIONES.md).

## Verificación y límites

Se probaron extracción API simulada, creación real SQL, vínculo de cronograma, apertura IMS, píxeles del mapa, selección exacta, conteo cero, actualización de progreso, series, planilla alterna, análisis, navegación móvil y descarga. La carga completa de los dos CSV recibidos se ejecutó y repitió en una base temporal propia: tres catálogos, sin duplicados ni cambios de conteos; la copia temporal se eliminó al terminar. Las cuentas/clientes de esa base son sintéticos, por lo que su cobertura de asociaciones EAN no representa la del servidor corporativo.

La [captura de la terminal](../docs/capturas/ims-terminal-integrada-20261116.png) contiene datos sintéticos. La evidencia local no demuestra que esta nueva revisión o el ZIP ya estén aplicados en `apps`.

Se mantienen el servicio propio, `127.0.0.1:3003` y HTTPS `8445`. No se modifica Apache ni se intervienen proyectos ajenos. Correo/Calendar todavía requieren el cliente Google Cloud y consentimiento de `bespinoza@itsanet.com`. Presencia en vivo, ranking específico WMS y documentos PDF/QR/barra no se declaran completos; consultar la [matriz de paridad](../docs/PARIDAD_INTERFAZ_20261116.md). El paso a producción continúa pendiente de completar y aceptar el alcance restante.

Evidencia de esta revisión: **207 Node, 163 Python, 45 casos SQL afectados y 33 recorridos de navegador aprobados**. La consulta del historial integrado se volvió a comprobar tras su integración. Ver [resumen agregado de validación](../docs/VALIDACION_IMS_TERMINAL_20261116.json).
