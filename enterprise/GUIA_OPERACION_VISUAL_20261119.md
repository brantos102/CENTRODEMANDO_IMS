# ITSANET IMS · Conteo, agenda y monitor

Esta entrega amplía la revisión 2fb207a. La instalación actualiza únicamente el servicio propio y comprueba 28 archivos servidos por HTTPS. La restricción de estados de la base propia se amplía de forma idempotente; no se modifican cantidades ni capturas para hacer esa ampliación.

## Conteo del operario

La ventana de conteo abre con la presentación clara, independiente del tema del Centro. El botón de tema permite conservar una preferencia propia para la terminal.

1. Seleccionar la ubicación en el mapa, en la lista o con doble clic sobre la posición solicitada.
2. Escanear EAN, SKU o serie. Revisar cantidad y etapa C1, C2 o C3. Un código con varias coincidencias requiere elegir la fila correcta.
3. Escribir la cantidad física en la fila o utilizar el escaneo. Observación y nueva posición pueden prepararse en esa misma fila. El botón de tres puntos abre el detalle de captura.
4. Pulsar Guardar masivo. El mensaje de confirmación distingue la captura guardada del borrador local. El borrador permanece asociado a la persona, documento y versión de línea.
5. Adjuntar fotos mediante Fotos cuando exista una novedad. Avanzar a la siguiente posición con los botones inferiores.

Vacío significa pendiente; cero confirma ausencia. Una observación sin cantidad no crea un conteo de cero. Mostrar información adicional no habilita la vista del stock: esa autorización sigue dependiendo de la política configurada por la coordinación. Correcto, faltante o sobrante se muestran únicamente cuando el usuario puede ver la comparación. En modo a ciegas se muestra el avance autorizado.

El filtro rápido consulta el inventario completo. Los filtros de cliente, ubicación, etapa y resultado siguen disponibles. La tabla completa conserva todas las líneas y sus valores exactos; la presentación K/M se utiliza en los indicadores.

## Selección en niveles altos

La selección sigue siendo inmediata. En una posición elevada respecto del piso de su planta aparece una escalera virtual con peldaños, plataforma y barandillas; el avatar se sitúa en su altura. Al caminar por el pasillo vuelve al suelo y la escalera desaparece. No cambia la geometría del catálogo, las medidas en centímetros ni las alturas confirmadas del mezzanine. Esta representación es visual y no certifica un equipo físico de acceso.

## Monitor operativo

El monitor abre con los documentos iniciados en los últimos 15 días, incluido hoy. Permite cambiar a hoy, 7, 15 o 30 días y filtrar por estado, cliente o equipo. Los contadores y Copiar resumen corresponden a la selección visible.

Los estados de consulta son pendientes/en proceso, en conteo, en validación y cerrados sin consolidar. El monitor no utiliza una captura reciente para convertir un documento antiguo en un inventario nuevo. Los documentos anteriores al periodo siguen disponibles en Administrar inventarios y en el panel histórico.

## Cerrar sin consolidar

Para inventarios operativos que se conservarán fuera del consolidado:

1. Entrar como administrador de la sede y con supervisión sobre todos los clientes del documento.
2. En Administrar inventarios, seleccionar Cerrar sin consolidar.
3. Escribir un motivo de al menos diez caracteres y guardar el estado.

CERRADO_SIN_CONSOLIDAR conserva capturas e historial, bloquea nuevas capturas y ajustes, y no publica KPI ni reportes consolidados como Entregado. Se consulta por separado en el monitor. No se modifica automáticamente ningún documento ya existente para clasificarlo.

La reapertura exige la misma autorización administrativa, un motivo y volver a EN_PROCESO. El cierre no se transforma directamente en Entregado. Los inventarios ya Entregados conservan su protección; esta opción no retira publicaciones históricas previamente aprobadas. La fecha y el motivo quedan auditados.

## Agenda y cronograma

Las celdas de una tarea semanal y las barras Gantt abren su detalle. Ampliar agenda y Matriz anual utilizan una ventana amplia dentro de IMS; conserva navegación, búsqueda y filtro de estado. Al cerrar, la agenda vuelve al panel.

Desde una tarea pendiente sin inventario vinculado, Crear inventario para esta tarea abre el asistente con sede, cliente y evento seleccionados. El asistente vincula ese mismo evento. Editar tarea y colaboradores permite revisar responsable y apoyos según los permisos; los accesos del inventario se actualizan con el equipo autorizado.

Administración y coordinación pueden gestionar el cronograma de la sede. Un líder puede editar su propia tarea o una aún sin responsable, de acuerdo con sus permisos. Un operario consulta y participa en las funciones de captura y apoyo autorizadas. Las restricciones también se comprueban en el servidor.

## Crear inventario

El asistente presenta las fuentes En blanco, Stock ITSANET y CSV/TXT como opciones visibles. Los clientes adicionales y el destino manual se agrupan como opciones secundarias. La carpeta automática conserva sede/año/mes/cliente. El resumen de cliente, fuente, carpeta y vínculo se revisa antes de crear. Las fuentes ERP y CSV conservan sus validaciones y cantidades exactas.

## Google Calendar y avisos

Centro es la fuente del cronograma. Crear, editar, cambiar equipo o actualizar una tarea prepara su sincronización cuando la opción de agenda está activada en la conexión autorizada.

En Conexiones, la opción Invitar al responsable y colaboradores activos a Calendar y notificar cambios permite enviar invitaciones y actualizaciones del evento desde el servidor. Requiere guardar y autorizar esa configuración de Google. Los eventos utilizan un identificador estable para no duplicarse. Una sincronización sin cambios no vuelve a enviar la actualización. Desactivar la opción conserva los asistentes existentes sin añadir nuevos.

Los recordatorios diarios por correo se activan por separado y se dirigen al equipo asignado y a líderes, coordinadores y administradores activos de la sede. Antes del envío automático se comprueba que el destinatario mantiene el rol o la participación autorizados. La cuenta de servicio sigue siendo reemplazable.

La agenda se gestiona dentro de IMS; Google Calendar recibe los cambios. Esta entrega no añade edición inversa de eventos externos. Las conexiones y automatizaciones siguen restringidas a los perfiles correspondientes.

## Cómo verificar la actualización de Sheets

El panel administrativo Google y agenda muestra separadamente la última lectura confirmada de inventarios y la última incorporación confirmada. Al desplegarlo se ven además cronograma/usuarios, agenda y reportes. El estado corresponde al trabajo registrado en el servidor, no a una estimación del navegador.

Autorizar Google no equivale a incorporar datos. Leer novedades prepara una revisión privada; Aplicar selección revisada incorpora los grupos elegidos y conserva las capturas MySQL. Una lectura terminada con archivos rechazados o conflictos se muestra como Finalizada con incidencias. Una incorporación puede informar incidencias: revisar su resultado antes de dar por completa la migración.

Si un archivo aparece sin sede, el administrador puede seleccionar una sede autorizada en su incidencia y pulsar Definir sede en IMS. Esta asignación se conserva de forma privada sin modificar Sheets. Después debe realizarse una nueva lectura: la revisión anterior no puede aplicarse con una conexión modificada.

Los errores HTTP de Google distinguen falta de acceso o restricciones, archivo no encontrado y límite temporal de lectura. Un administrador del archivo debe dar acceso a la cuenta autorizada cuando corresponda; IMS no presume que un archivo inaccesible está actualizado.

Las filas con igual SKU, posición, serie, lote, unidad y stock solo se distinguen automáticamente por despacho, partida, categoría y estado de mercancía cuando la combinación completa es única en ambos lados. No se utiliza la posición de la fila como desempate. Las identidades aún repetidas, el stock distinto y las etapas heredadas inconsistentes se conservan para revisión.

La revisión de inventarios y avances, la revisión de cronograma/usuarios y la publicación de reportes son procesos distintos. Los disparadores heredados de Apps Script no se reemplazan automáticamente ni se ejecutan desde el navegador.

## Pruebas de aceptación

- Comparar el conteo compacto con una posición real: escaneo, borrador, cantidad cero, observación, nueva posición, fotos y confirmación.
- Revisar un nivel alto de rack y el piso superior de mezzanine; caminar sin atravesar estructuras.
- Comprobar filtros de 15/30 días y cierre sin consolidar con una cuenta de prueba; verificar que se conservan las capturas.
- Abrir una tarea desde una celda, cambiar colaboradores y crear su inventario sin duplicar evento.
- Confirmar con dos cuentas de distinto rol que las opciones administrativas no están disponibles al operario.
- Revisar en el servidor la última lectura e incorporación de Google, sus incidencias y el resultado de Calendar.

Las verificaciones de desarrollo usan datos sintéticos. La conectividad empresarial y la lectura del maestro real requieren la ejecución y evidencia del servidor instalado antes de aprobar producción.
