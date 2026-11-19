# Manuales de ITSANET IMS y Centro de Mando

## Operario

1. Iniciar sesión y abrir **Inventarios IMS / WMS**. Elegir el inventario asignado; comprobar cliente, código y sede.
2. En Inicio buscar una ubicación en Registros generales o seleccionarla en el mapa. Pulsar **INICIAR CONTEO FÍSICO** para abrir exactamente esa ubicación.
3. Buscar por EAN, SKU o serie. Si hay varias coincidencias, seleccionar expresamente la línea correcta. Un EAN identifica el producto; la cantidad de presentación del catálogo no multiplica automáticamente el conteo.
4. Para una captura individual, pulsar **Contar · C1/C2/C3**, introducir la cantidad, observación o nueva posición y guardar. Cero es un conteo válido; vacío significa ausencia de captura.
5. Para captura masiva, introducir cantidades en las filas autorizadas, seleccionar las filas y pulsar **GUARDAR MASIVO**. Cada línea conserva su confirmación y auditoría. Si falla una línea, revisar los envíos pendientes y los borradores antes de repetir.
6. El campo rápido usa una etapa explícita. Cantidad 1 acumula una unidad en el borrador; otra cantidad explícita reemplaza la del borrador. **Guardar cada lectura** envía la línea resuelta mediante el mismo mecanismo de confirmación. Una lectura repetida de C1 no avanza automáticamente a C2.
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

Un clic selecciona el hueco. La primera selección sitúa tu avatar en el pasillo contiguo; las siguientes inician el recorrido automático cuando existe una ruta libre en la misma bodega y planta. Selecciona **Recorrer pasillo** y usa W/A/S/D, las flechas o los botones de dirección; arrastrar sigue permitiendo girar la cámara. El recorrido evita los volúmenes de las estanterías y los límites del piso. En planta alta se limita al mezzanine. La figura representa tu selección virtual, no ubicación física mediante GPS.

El doble clic abre el conteo de los productos autorizados de esa posición. Desde Ubicaciones se necesita haber abierto el mapa con un inventario; la vista general no asigna permisos de captura. **Posición anterior / Siguiente posición** permite avanzar por las ubicaciones del inventario conservando los borradores locales.

## Destino organizado y fotos de novedades

Al crear, **Organizar por sede / año / mes / cliente** utiliza la fecha de inicio y el cliente principal. La ruta se muestra antes de confirmar y las carpetas faltantes se crean junto con el inventario. Puedes desmarcar la organización automática y elegir otra carpeta existente desde el árbol. Los clientes adicionales conservan su acceso por cliente.

En una línea, pulsa **Fotos**, selecciona la cámara o un JPEG/PNG y describe la novedad. El dispositivo ajusta la imagen hasta 1.600 píxeles y conserva el envío pendiente hasta confirmar el servidor. Un reintento usa el mismo identificador; no borres los datos del navegador con fotos pendientes. Las evidencias no rellenan C1/C2/C3 ni modifican stock. Sus permisos dependen de la línea del inventario.

**Enviar a Drive** crea o reutiliza `ITSANET IMS / SEDE / año / mes / cliente`. Las fotos de clientes adicionales usan su propio cliente. Esta acción requiere Google autorizado con **Autorizar las carpetas y fotos creadas por IMS**; el permiso es `drive.file`. La cuenta temporal sigue siendo `bespinoza@itsanet.com` y puede reemplazarse. Las fotos permanecen privadas; no se publican enlaces abiertos. Una respuesta incierta se recupera con el identificador remoto original. La confirmación en Drive verifica también la huella de los bytes enviados.

Hasta autorizar Google, la copia confirmada se conserva en el servidor y el envío a Drive queda pendiente. El envío se inicia con el botón de cada foto; no se presenta como automático. Cambiar la cuenta crea una jerarquía para la nueva cuenta y conserva las copias anteriores.

## Conexiones pendientes de operación

La ocupación dispone de consulta fija de solo lectura para SQL Server DEPOTWMS; requiere configurar la cuenta autorizada en el servidor y comprobar un corte real. Los EAN siguen siendo datos internos de lectura de productos. Su actualización desde SQL requiere identificar la consulta o vista empresarial antes de implementarla; el catálogo privado vigente sigue disponible.

## Ocupación total y ocupación del documento

**Centro de Control → Ubicaciones** presenta el total de la sede según el último corte SQL: posiciones físicas únicas, ocupadas, disponibles, bloqueadas, sin dato y porcentaje de ocupación confirmada. Varios clientes en la misma posición no duplican el total. El resumen de posiciones visibles cambia con los filtros; el total de la sede se conserva. Si aún no existe conexión SQL, se identifica expresamente el catálogo importado como fuente.

**ITSANET IMS** muestra solo las posiciones autorizadas del inventario abierto. La ocupación se consulta con el identificador del inventario y se filtra en el servidor por sus posiciones y permisos de cliente. Una posición sin coincidencia SQL queda **Sin dato**, aunque el catálogo anterior la indicara disponible. El bloqueo se identifica por separado y puede coexistir con ocupación o disponibilidad. Las estructuras vecinas se dibujan como contexto para caminar; sus productos y capturas no aparecen en el documento.

## Caminar entre racks y estanterías

Selecciona una ubicación del documento y pulsa **Recorrer pasillo**. Mantén W/S para avanzar o retroceder, A/D para desplazarte lateralmente y Q/E o flechas izquierda/derecha para girar. Las flechas arriba/abajo avanzan/retroceden. También puedes mantener los botones de dirección en pantalla. Arrastrar la cámara cambia la dirección de mirada; la cámara de recorrido evita atravesar los racks.

Al seleccionar otro hueco durante el recorrido se calcula una ruta libre alrededor de las estructuras. El recorrido comienza automáticamente; **Caminar a selección** permite reanudarlo; **Posicionarme aquí** sitúa directamente el avatar frente al hueco seleccionado. Las rutas no atraviesan racks ni cortan sus esquinas. El doble clic abre los productos autorizados de esa posición; Esc detiene el movimiento. Cambiar a conteo, series u otra pestaña pausa el recorrido.

La figura representa una posición virtual en el mapa. No confirma presencia física ni GPS.

Hasta recibir los planos de las otras bodegas, el orden provisional sigue la lógica de Quito: fila A, parejas B/C, D/E y siguientes, pasillos de 240 cm y un cruce cada doce columnas. Los huecos mantienen sus medidas originales en cm. En mezzanine las dos plantas quedan a 210 cm y tienen una plataforma de recorrido; las distribuciones sin plano se identifican como provisionales. Las anclas confirmadas del PDF de BM se conservan.

## Tabla completa y señales de captura

El menú **ITSANET IMS** del Centro abre una pestaña independiente y conserva el panel principal. Dentro del inventario, **Tabla del inventario** o **Ver inventario completo** muestra todas las líneas autorizadas, con páginas de 50 filas y **Cargar más líneas**. Los filtros de cliente, SKU, posición exacta y captura se aplican a todo el inventario en el servidor, incluyendo filas todavía no cargadas. El orden visual se aplica a las filas cargadas. El resumen mantiene el total autorizado del inventario aunque se filtre una sola ubicación.

**Falta contar**, **Conteo registrado**, **Recuento pendiente** y **Revisar historial** describen las capturas. Un borrador local sigue pendiente hasta la confirmación del servidor. **Correcto**, **Faltante** y **Sobrante**, las columnas Teórico/Físico/Diferencia y su filtro aparecen únicamente cuando la cuenta puede consultar cantidades. En modo ciego, Análisis presenta avance y pendientes sin revelar existencias ni diferencias. Un cero confirmado cuenta como captura.

Solo ADMIN o COORDINADOR del Centro con permisos de supervisor sobre el inventario pueden habilitar cantidades o registrar ajustes. El rol de líder o supervisor nativo por sí solo no concede esas acciones. Habilitar cantidades permite consultar resultados a los usuarios autorizados de ese inventario; deshabilitarlas vuelve a ocultarlos. Las API aplican los mismos permisos que la pantalla.

Los huecos solicitados llevan contorno amarillo y rótulos seleccionables sobre el mapa; las estructuras del contexto quedan atenuadas. Cuando varios rótulos se superponen, pulsa el grupo de ubicaciones para acercar la cámara. Un doble clic abre el conteo de la posición seleccionada. El avatar con casco y chaleco anima brazos y piernas al caminar. Su posición es virtual; cambia de planta o bodega mediante selección y sigue los pasillos cuando la geometría permite calcular una ruta.

## Crear el cliente OAuth web

1. Entrar a Google Cloud, seleccionar el proyecto de la organización y habilitar Gmail API y Google Calendar API. Habilitar Google Drive API para carpetas y fotos.
2. Configurar Google Auth Platform, correo de soporte y audiencia. Si la aplicación está en pruebas, añadir `bespinoza@itsanet.com` como usuario de prueba.
3. Crear un cliente OAuth de tipo **Aplicación web**. Desde **Conexiones → Cliente OAuth de la organización**, copiar la URI de retorno que muestra el servidor y registrarla exactamente en Google Cloud, incluyendo HTTPS, puerto y ruta.
4. Introducir ID y secreto exclusivamente en el formulario privado de Conexiones. Elegir cuenta, calendario y permisos necesarios; guardar y autorizar con Google.
5. Verificar cuenta autorizada y realizar una prueba de Calendar y correo a destinatario elegido. El mismo formulario permite sustituir la cuenta temporal por la oficial.

El estado real de la cuenta y su consentimiento se consulta en Conexiones. Si la cuenta ya está autorizada no hace falta crear otro cliente OAuth; los permisos adicionales de escritura de reportes se autorizan al activar esa opción. La conexión SQL real de ocupación se configura en el formulario privado de Conexiones: servidor `192.168.4.12`, puerto TCP real confirmado de DEPOTWMS (no suponer 1433), usuario de solo lectura y base de datos autorizada; si se deja la base vacía se utiliza la predeterminada de ese usuario. No introducir secretos en el chat ni en GitHub. La consulta EAN empresarial todavía requiere una vista autorizada; hasta entonces continúa el catálogo importado.


## ITSANET IMS unificado · actualización 19 de noviembre

El Centro de Mando incorpora Monitor operativo de hoy, matriz anual, próximos conteos, búsqueda de cuentas y reportes por cliente. Desde el monitor se abre la ventana de conteo en otra pestaña con la misma cuenta. Los indicadores se abrevian con K/M; los conteos, tablas y archivos conservan cantidades exactas.

En conteo, Inicio contiene el mapa, Conteo físico permite escanear y registrar, Tabla del inventario permite consultar y filtrar todas las filas, y Series, Análisis y Adicionales conservan sus operaciones. Gestionar abre la supervisión únicamente con permiso. Las herramientas secundarias se agrupan en desplegables. Seleccionar una ubicación coloca el avatar inmediatamente; el doble clic abre el conteo autorizado de esa posición. Caminar desde la posición anterior es una opción manual, con un encuadre más amplio.

La configuración completa, los horarios, el alcance de los reportes Sheets y las pruebas de aceptación se describen en ENTREGA_UNIFICACION_IMS_20261119.md y su PDF.
