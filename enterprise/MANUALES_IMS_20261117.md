# Manuales de ITSANET IMS y Centro de Mando

## Operario

1. Iniciar sesión y abrir **Inventarios IMS / WMS**. Elegir el inventario asignado; comprobar cliente, código y sede.
2. En Inicio buscar una ubicación en Registros generales o seleccionarla en el mapa. Pulsar **INICIAR CONTEO FÍSICO** para abrir exactamente esa ubicación.
3. Buscar por EAN, SKU o serie. Si hay varias coincidencias, seleccionar expresamente la línea correcta. Un EAN identifica el producto; la cantidad de presentación del catálogo no multiplica automáticamente el conteo.
4. Para una captura individual, pulsar **Contar · C1/C2/C3**, introducir la cantidad, observación o nueva posición y guardar. Cero es un conteo válido; vacío significa ausencia de captura.
5. Para captura masiva, introducir cantidades en las filas autorizadas, seleccionar las filas y pulsar **GUARDAR MASIVO**. Cada línea conserva su confirmación y auditoría. Si falla una línea, revisar los envíos pendientes y los borradores antes de repetir.
6. El campo rápido usa una etapa explícita. Cantidad 1 acumula una unidad en el borrador; otra cantidad explícita reemplaza la del borrador. Ráfaga envía la línea resuelta mediante el mismo mecanismo de confirmación. Una lectura repetida de C1 no avanza automáticamente a C2.
7. Los borradores se conservan en ese navegador por usuario e inventario. No representan una captura del servidor hasta recibir confirmación. Si cambió la versión de una línea, revisar el conteo actual y descartar el borrador obsoleto antes de continuar.
8. Si se pierde la respuesta, usar **Reintentar envíos**: conserva el identificador original de la operación y evita duplicados. No borrar datos del navegador con capturas por confirmar.

En conteo ciego se ocultan el stock teórico y las diferencias. Un navegador sin almacenamiento disponible permite consultar, pero bloquea la captura que no puede resguardar.

## Series, adicionales y mapa

En **Series**, consultar la serie, verificar producto y ubicación y confirmar la coincidencia autorizada. Una desconocida se registra como hallazgo en Planilla alterna. Las coincidencias similares o múltiples no se asignan automáticamente. El historial conserva usuario y fecha.

En **Adicionales**, introducir posición, SKU, cantidad, descripción, lote o serie opcionales, observación y justificación. Un hallazgo no modifica automáticamente el stock teórico ni una captura existente.

En el mapa, arrastrar para orbitar, usar la rueda para acercar y seleccionar Nave/Literal/Columna/Nivel/Piso/Tipo. TOP, FRONT, SIDE y RESET cambian la cámara. Las dimensiones del catálogo aparecen en centímetros; cualquier altura superior ajustada se identifica en la ficha. Rayos X facilita ver el interior de las estructuras. Sin WebGL, usar Registros generales para contar.

**ETIQUETA DE UBICACIÓN** genera Code128 y QR. El QR abre IMS y requiere una sesión con permisos para ese inventario. La verificación SQL muestra el estado de un corte empresarial y su fecha; ausencia de datos no significa ubicación libre.

## Supervisor

1. Abrir **Administración / ADMIN** y revisar los permisos por cliente. Los roles del Centro y los permisos de inventario son ámbitos distintos.
2. Revisar C1, C2 y C3 y sus auditorías. C3 sin C2 heredado se conserva para revisión; la captura nueva no salta etapas.
3. En **Análisis**, consultar exactitud, faltantes, sobrantes, SKU críticos y el detalle de discrepancias. **REVISAR** abre la ubicación correspondiente. Las gráficas resumen; las cantidades del detalle se conservan como decimales exactos.
4. Registrar los ajustes con motivo, justificación y versión de línea. Un cambio concurrente obliga a actualizar antes de guardar.
5. Exportar PDF para el análisis visible y Excel/CSV desde el evento del Centro para el detalle autorizado. El PDF limita el detalle a las primeras 1.000 discrepancias; Excel conserva todas las líneas del reporte.
6. Enviar a validación y, al entregar, registrar la fecha explícita. La confirmación de líneas incompletas se utiliza solo después de revisar el avance. El botón ENTREGAR abre el formulario; no entrega automáticamente.

## Administrador del Centro

Crear eventos, asignar responsable y apoyos, vincular inventarios y revisar el calendario. Actividades actuales muestra las tareas en curso; Carga por operario cuenta asignaciones activas. La participación dentro de IMS cuenta capturas confirmadas, incluyendo ceros, sin sumar reintentos.

Para crear inventarios, abrir **Crear inventario**, elegir sede, cliente/cuentas ERP, nombre, fuente y carpeta lógica. Se admiten blanco, CSV/TXT y las conexiones API ya registradas. Revisar las filas y unidades de la extracción antes de confirmar. La procedencia por cuenta se conserva aunque se repita el SKU.

Los usuarios heredan solo los permisos concedidos. Cambiar una cuenta o contraseña no debe sustituir identidades o credenciales de otros usuarios. Una persona sin asignación al inventario no puede capturar sus líneas.

**Consolidar con auditoría** revisa resultados. **Publicar KPI verificados** publica únicamente inventarios Entregados, después de la verificación. Los registros del corte de Google y las capturas nativas se distinguen en el historial y el libro exportado.

Correo, Calendar y ocupación se configuran en Conexiones. Antes de enviar correo, revisar destinatarios y trabajo generado; no reenviar a ciegas un trabajo cuyo resultado sea incierto. El cambio a una cuenta corporativa oficial usa el mismo formulario y una nueva autorización, conservando la anterior hasta completar la verificación.

## Soporte

Ante un error, conservar el código, fecha, inventario, operación y resumen compartible. No adjuntar archivos privados con credenciales, tokens, plano descifrado ni resguardos completos. Comprobar primero **Capturas pendientes**, **Trabajos y descargas** y el estado de la propia actualización. No repetir la extracción de Google ni la importación del corte para corregir un problema de interfaz.

Para instalación y conexiones, consultar [la guía de entrega](ENTREGA_LAYOUT_Y_CONTEO_20261117.md).

## Recorrido y selección de ubicaciones

**Ubicaciones** y la terminal IMS utilizan el mismo visor WebGL. En Ubicaciones se muestra BM inicialmente; selecciona B2 en **Bodega / nave** para ver Bodega 2 sobre su propio piso. Las áreas sin ancla confirmada continúan identificadas como provisionales.

Un clic selecciona el hueco y sitúa tu avatar en el pasillo contiguo. Selecciona **Recorrer pasillo** y usa W/A/S/D, las flechas o los botones de dirección; arrastrar sigue permitiendo girar la cámara. El recorrido evita los volúmenes de las estanterías y los límites del piso. En planta alta se limita al mezzanine. La figura representa tu selección virtual, no ubicación física mediante GPS.

El doble clic abre el conteo de los productos autorizados de esa posición. Desde Ubicaciones se necesita haber abierto el mapa con un inventario; la vista general no asigna permisos de captura. **Posición anterior / Siguiente posición** permite avanzar por las ubicaciones del inventario conservando los borradores locales.

## Destino organizado y fotos de novedades

Al crear, **Organizar por sede / año / mes / cliente** utiliza la fecha de inicio y el cliente principal. La ruta se muestra antes de confirmar y las carpetas faltantes se crean junto con el inventario. Puedes desmarcar la organización automática y elegir otra carpeta existente desde el árbol. Los clientes adicionales conservan su acceso por cliente.

En una línea, pulsa **Fotos**, selecciona la cámara o un JPEG/PNG y describe la novedad. El dispositivo ajusta la imagen hasta 1.600 píxeles y conserva el envío pendiente hasta confirmar el servidor. Un reintento usa el mismo identificador; no borres los datos del navegador con fotos pendientes. Las evidencias no rellenan C1/C2/C3 ni modifican stock. Sus permisos dependen de la línea del inventario.

**Enviar a Drive** crea o reutiliza `ITSANET IMS / SEDE / año / mes / cliente`. Las fotos de clientes adicionales usan su propio cliente. Esta acción requiere Google autorizado con **Autorizar las carpetas y fotos creadas por IMS**; el permiso es `drive.file`. La cuenta temporal sigue siendo `bespinoza@itsanet.com` y puede reemplazarse. Las fotos permanecen privadas; no se publican enlaces abiertos. Una respuesta incierta se recupera con el identificador remoto original. La confirmación en Drive verifica también la huella de los bytes enviados.

Hasta autorizar Google, la copia confirmada se conserva en el servidor y el envío a Drive queda pendiente. El envío se inicia con el botón de cada foto; no se presenta como automático. Cambiar la cuenta crea una jerarquía para la nueva cuenta y conserva las copias anteriores.

## Conexiones pendientes de operación

La ocupación dispone de consulta fija de solo lectura para SQL Server DEPOTWMS; requiere configurar la cuenta autorizada en el servidor y comprobar un corte real. Los EAN siguen siendo datos internos de lectura de productos. Su actualización desde SQL requiere identificar la consulta o vista empresarial antes de implementarla; el catálogo privado vigente sigue disponible.
