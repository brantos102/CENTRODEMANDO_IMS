# ITSANET IMS · Centro de Mando y conteo

Revisión preparada el 19 de noviembre de 2026 para pruebas finales en el servidor.

## Una cuenta, dos espacios de trabajo

La página principal es el Centro de Mando de ITSANET IMS. El monitor abre cada inventario en otra pestaña para contar con la misma sesión. La ventana de conteo contiene sus propias secciones y oculta la navegación duplicada. El acceso sigue limitado por sede, cliente e inventario.

El monitor muestra inventarios nativos activos autorizados, C1 confirmado, pendientes, actividad registrada hoy en hora de Ecuador y acceso directo al documento. Cero es una captura válida. No se presentan como actividad de hoy capturas heredadas sin una operación local fechada. Se actualiza cada treinta segundos cuando está visible y no hay un formulario modal abierto.

Los indicadores muestran K/M con redondeo de presentación y el valor exacto al situar el cursor. Las tablas, entradas, exportaciones y cálculos conservan los decimales originales. Los porcentajes conservan su cálculo.

## Conteo

1. Abrir el inventario desde el monitor o la lista autorizada.
2. Seleccionar una ubicación en Inicio. El avatar aparece inmediatamente en su frente transitable. El encuadre incluye la ubicación y el entorno.
3. Hacer doble clic sobre la posición o pulsar Iniciar conteo físico.
4. Escanear, escoger la etapa y registrar la lectura. El cero se registra explícitamente.
5. Guardar los conteos pendientes. Las herramientas de selección, etiquetas e información extra están en un desplegable.
6. Usar Tabla del inventario para todas las filas y sus filtros. Series, Análisis y Adicionales conservan su operación.

El conteo a ciegas continúa activo. Los operadores y líderes no reciben stock ni diferencias sin la habilitación autorizada. Gestionar y Entregar requieren permisos de supervisión. La navegación del avatar es virtual; no es GPS ni una instrucción para subir a un rack.

Caminar desde la posición anterior es voluntario. La selección normal ya no espera una animación de recorrido y el zoom no se fija a un primer plano del avatar. La navegación manual conserva obstáculos, suelos y separación del mezzanine.

## Cronograma y cuentas

El calendario conserva semana y mes, y añade una matriz anual con desplazamiento horizontal, tareas, responsables y barras por fecha. La lista del cronograma mantiene las acciones y filtros existentes. Los avisos de próximos siete días se consultan desde el encabezado.

Usuarios permite buscar por nombre o correo y filtrar cuentas activas. La creación y edición conservan la jerarquía de roles y sedes. La misma cuenta sirve para supervisión y conteo según sus permisos; la cuenta de servicio Google continúa siendo reemplazable e independiente de las contraseñas de acceso.

## Reportes de inventario y cliente

Cada inventario conserva su descarga CSV y Excel desde su detalle. El CSV es un archivo plano con las treinta columnas originales y cantidades exactas. La tabla del inventario permite consultarlo sin descargar.

Reportes por cliente muestra los inventarios Entregados del año a los que la cuenta tiene acceso, presenta una muestra de hasta doscientas filas y descarga el consolidado completo en CSV. El enlace IMS es estable por cliente y año y requiere una sesión con permiso de exportación.

Se mantienen los archivos y enlaces de HISTORIAL_REPORTES de UIO. La publicación escribe en una hoja administrada IMS_CONSOLIDADO dentro del mismo archivo. No borra ni reordena las hojas originales ni cambia permisos de Drive. Se prepara una hoja temporal, se comprueba la lectura de todas las filas y se reemplazan los valores de la hoja propia en una operación de Google. Un destino manual sin la identificación de IMS no se sobrescribe.

Para entregar el enlace a la pestaña actualizada, utilizar el enlace devuelto por la publicación. Los enlaces originales de los clientes continúan abriendo su archivo; las hojas anteriores se conservan. La publicación de GYE queda pendiente de recibir su historial autorizado de destinos.

## Activación de conexiones y horarios

Entrar como administrador a Centro → Conexiones. Conservar el cliente OAuth que ya funciona y seleccionar las opciones necesarias:

- Sincronizar cronograma con Calendar.
- Activar recordatorios diarios por correo.
- Preparar la revisión de Google a las 18:45.
- Actualizar reportes de clientes en Sheets a las 19:00.

Guardar y autorizar. El permiso de escritura de Sheets es adicional al de lectura y requiere un nuevo consentimiento. La actualización del código no activa estas opciones ni envía mensajes por sí sola.

El servidor mantiene la consolidación a las 18:30. La lectura de Google conserva capturas MySQL y requiere revisar la selección antes de aplicar. Para revisar un plan pasado de dos horas se debe generar uno nuevo. Los datos recién importados se revisan y entregan en IMS antes de incorporarlos al reporte de entregados.

Los recordatorios programados consideran hoy y los próximos tres días, de 08:00 a 17:30, y se deduplican por destinatario, conteo y día. Las altas de líderes y administradores entran en la siguiente planificación según su sede. Calendar utiliza ID estable y recordatorios; el correo se envía por el conector configurado.

Los triggers originales de Apps Script no se modifican. Firebase queda como opción para una futura fase de push; la entrega utiliza avisos en IMS, Gmail y Calendar.

## Pruebas finales en el servidor

1. Entrar con administrador y operador; comprobar que usan una sesión coherente entre Centro y conteo.
2. Verificar monitor, K/M, porcentajes, filtro de equipo y matriz anual.
3. Seleccionar dos ubicaciones y comprobar aparición inmediata del avatar, encuadre, doble clic y recorrido manual opcional.
4. Registrar cero, una cantidad y un recuento; recargar y comprobar persistencia. Confirmar que el operador continúa a ciegas.
5. Descargar CSV de inventario y cliente; comprobar códigos con ceros iniciales y decimales exactos.
6. Autorizar las opciones de Google, crear una tarea de prueba y comprobar su Calendar y su trabajo de sincronización.
7. Revisar las novedades de Google antes de aplicar y comprobar que se conservan capturas locales.
8. Publicar un reporte de prueba y comprobar IMS_CONSOLIDADO en el archivo correcto, sin modificar las hojas originales.

Las pruebas de desarrollo emplean SQL y respuestas de Google sintéticos. No equivalen a una autorización real de la cuenta corporativa ni a una publicación en los archivos empresariales.
