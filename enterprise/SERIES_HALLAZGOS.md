# Series físicas y planilla alterna del ensayo

Esta fase amplía la operación nativa instalada. Mantiene 3003/8445, el usuario SQL existente, su contraseña, los límites del servicio y los once triggers anteriores. Agrega dos tablas con SELECT/INSERT y dos protecciones de inserción. No cambia Apache, el esquema Power BI, Google, los proyectos vecinos ni los estados/valores de inventarios existentes.

El instalador verifica el perfil SQL anterior exacto antes de ampliarlo. También reconoce un corte entre los dos GRANT autorizados y completa únicamente el que falte. No adopta permisos globales, roles, otras tablas o columnas diferentes. Reutiliza la publicación por versiones y su reversión; las evidencias se conservan aunque se restaure el código anterior.

## Uso en Operación

1. Seleccionar un inventario **nativo**, con stock activado y estado EN_PROCESO, y el cliente autorizado.
2. En **Series físicas y planilla alterna**, escribir/escanear una serie y pulsar **Consultar serie**. Se preservan ceros y separadores; se normalizan espacios exteriores y mayúsculas conforme al WMS.
3. Si coincide con stock, seleccionar la línea y la etapa explícitas. Ante varias coincidencias no se preselecciona una ubicación. La captura registra una unidad, sin reemplazar etapas ya contadas ni elegir otra automáticamente.
4. Si hay series parecidas registradas para ese cliente, revisar la advertencia y confirmar. La confirmación y la lista de advertencias quedan en la auditoría. Una serie parecida no se fusiona con otra.
5. Una serie sin coincidencia requiere SKU del hallazgo. Se registra en la **planilla alterna** con cantidad uno, observación, lote y justificación opcionales. No crea existencias ni altera automáticamente la exactitud.
6. Para un hallazgo sin serie, usar su formulario independiente. Conserva cantidad cero y hasta nueve decimales; no convierte textos, negativos o comas ambiguas a cero.
7. Actualizar el historial de series o planilla alterna para el cliente seleccionado. Muestra usuario y hora de Ecuador, las capturas más recientes primero y páginas de 50 sin omitir empates de fecha.

Una misma serie física se registra una vez por inventario y cliente. Un reintento conserva su UUID y recupera la confirmación; una segunda operación para esa serie se rechaza. El mismo serial en otro cliente permanece independiente. Los permisos se vuelven a verificar incluso al recuperar una respuesta perdida. Entregar/cancelar protege nuevas capturas; una operación anterior ya confirmada puede recuperarse mientras se conserve el permiso de captura.

La consulta de una serie no devuelve existencias teóricas ni desfases a un operador ciego. Los hallazgos no se incorporan al stock por aparecer en la planilla alterna y no publican KPI.

## Cámara y recuperación

**Leer serie con cámara** utiliza detección local del navegador, sin subir imágenes ni activar audio. Requiere HTTPS, permiso del usuario y BarcodeDetector/getUserMedia compatibles. Una lectura cierra la cámara; cambiar de inventario/cliente, ocultar la página o cerrar la captura también libera el flujo. Si el navegador no es compatible, permanecen el lector físico y la escritura manual. La cámara de un dispositivo físico todavía debe validarse con los operarios; la regresión automatizada utiliza vídeo sintético.

Cuando se pierde una respuesta, recuperar la confirmación antes de volver a capturar. El panel conserva la operación en ese navegador y usuario. No borrar sus datos locales para resolver una captura pendiente. Si la sesión venció, volver a entrar con la misma cuenta.

## Límites del alcance

Estas tablas contienen capturas de inventarios nativos; no reinterpretan ni reemplazan el archivo histórico de series de Drive. Falta completar conexiones ERP reales, catálogos EAN/ABC/ubicaciones, reportes/exportaciones, calendario/notificaciones y el traslado de fuentes pendientes/delta antes del corte definitivo. WTW permanece aplazado. Los inventarios abiertos de Google siguen operándose allí durante la validación.
