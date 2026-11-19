# ITSANET IMS · Gantt, programación y usuarios

Esta revisión incluye los cambios de la entrega a22454e y completa la revisión del maestro, la programación mensual y la ayuda de uso.

## Indicadores K/M

Unidades, referencias y posiciones se abrevian en los indicadores. Por ejemplo, 4.104.120,099 se presenta como 4,1 M; 16.956 como 16,96 K; 20.867 como 20,87 K. Los porcentajes conservan su cálculo. Al situar el cursor se consulta el valor completo. Las entradas, tablas de detalle y archivos exportados conservan sus cantidades exactas.

Si se ve la presentación completa de una versión anterior, instalar esta revisión y actualizar el navegador. El pie del Centro muestra la revisión servida. El instalador comprueba por HTTPS los archivos preparados, incluida la ayuda y sus estilos.

## Cronograma de actividades y Gantt

El panel principal abre el Gantt del mes, con tareas, responsables, duración y barras por fecha. Semana y calendario mensual continúan disponibles; Matriz anual permite recorrer todo el año. La tarea abre su detalle, sus responsables y los inventarios o archivos vinculados.

Para incorporar el cronograma actual del maestro UIO:

1. Entrar como administrador con permiso de UIO y lectura de Google Sheets autorizada.
2. Pulsar Actualizar cronograma y cuentas de Google. Seleccionar el año de la hoja CRONOGRAMA del maestro.
3. Leer y revisar. Se presentan tareas nuevas, actualizables, conservadas e incidencias, además de las cuentas del origen.
4. Elegir cronograma, usuarios o ambos, y las sedes autorizadas para las cuentas nuevas.
5. Incorporar la revisión seleccionada y comprobar el resumen y las incidencias.

El proceso conserva cambios locales, tareas eliminadas en IMS y estados que entrarían en conflicto con un inventario nativo abierto. Las tareas sin una identificación inequívoca requieren revisión. No cambia cantidades ni capturas y no elimina tareas locales ausentes de Google. Una modificación posterior a la revisión se detecta antes de incorporar.

La revisión es privada, cifrada, pertenece al administrador que la solicitó y caduca a las dos horas. Las tareas de Calendar se preparan si su sincronización está activada. Los triggers existentes de Apps Script se conservan.

El lector utiliza el contrato de columnas B:T y encabezado de la fila 8 del cronograma recibido. Los datos de GYE requieren su maestro autorizado; esta revisión utiliza el maestro UIO ya configurado.

## Programación mensual de códigos

El cronograma de códigos indica qué SKU debe contarse cada mes del cliente seleccionado. No representa stock ni capturas.

La consulta tiene filtros de sede, cliente, SKU y mes. Las tarjetas muestran cuántos códigos corresponden a cada mes. La matriz usa puntos para los meses programados y mantiene los SKU con ceros iniciales. Se informa del número total y del límite de filas visibles.

Al actualizar, debe elegirse un alcance:

- **Solo el mes seleccionado**: reemplaza la pertenencia de los SKU a ese mes. Los códigos ausentes salen de ese mes; los otros once meses conservan su programación. Una lista sin columnas mensuales utiliza esta opción. Si se utiliza una tabla con meses, debe contener el encabezado del mes elegido.
- **Los meses de la tabla**: reemplaza la programación de las columnas mensuales incluidas, aunque el filtro de consulta esté en un mes diferente. Los meses sin columna conservan su contenido. Si la tabla contiene los doce meses, actualiza todo el año.

El ABC existente se conserva cuando la carga no incluye una columna ABC. Los otros clientes se conservan.

Primero pulsar Revisar cambios. La vista previa muestra meses afectados, códigos cargados y asignaciones nuevas o retiradas. Después pulsar Aplicar programación revisada. Si la tabla o la programación cambió, debe revisarse de nuevo. Los códigos que quedan sin meses se conservan como registros; el proceso no elimina sus capturas ni cambia las existencias.

## Usuarios existentes y altas

La misma cuenta se utiliza en Centro de Mando y conteo. Antes de crear otra cuenta, buscar nombre o correo en Usuarios.

Incorporar cuentas del maestro abre la revisión actual de USUARIOS. Los correos que ya existen conservan su clave, perfil y estado de MySQL. No se duplican ni se sustituyen cuentas por una coincidencia de nombre.

La lectura utiliza A:H y no lee la columna de contraseñas de Google. Una identidad nueva se incorpora inactiva, con cambio de clave obligatorio. El administrador utiliza Restablecer clave y Activar; la persona cambia su contraseña al entrar. Esto no afecta las claves de las cuentas que ya operan en IMS. Los destinatarios de recordatorios deben tener una cuenta activa en su sede.

Crear usuario continúa disponible según la jerarquía de roles. Las altas y activaciones actualizan la lista de personas disponibles para el cronograma.

## Para qué sirve cada módulo

- **Administrar inventarios**: seleccionar el documento, asignar accesos por cliente, revisar avance y diferencias, configurar visibilidad autorizada y gestionar validación o entrega. Los ajustes conservan motivo y auditoría.
- **Conteo físico**: registrar cantidades reales por ubicación y etapa. Cero confirma ausencia; vacío queda pendiente.
- **Tabla del inventario**: consultar todas las líneas y filtrar cliente, producto, ubicación, captura o resultado; también permite contar por fila.
- **Series**: registrar unidades identificadas por números de serie y sus posiciones, comprobar duplicados y consultar su historial.
- **Análisis**: revisar avance, faltantes, sobrantes y recuentos. En modo a ciegas se muestra la información permitida; el análisis no modifica capturas por sí solo.
- **Adicionales**: registrar mercancía o novedades encontradas fuera de la línea prevista, con descripción, cantidad, posición, justificación y evidencia.
- **Reportes**: descargar los archivos del inventario y consultar el consolidado por cliente de los Entregados del año.
- **Ubicaciones**: consultar mapa y ocupación de la sede; dentro del conteo se limita a las posiciones del documento.

El botón Ayuda explica la pantalla activa con pasos de uso. Los controles principales tienen comentarios al situar el cursor o enfocarlos. Las acciones disponibles siguen dependiendo del rol, la sede y el acceso al inventario.

## Comprobación antes de aprobar producción

1. Verificar K/M y el valor completo del indicador.
2. Revisar el Gantt del mes y la matriz anual contra el maestro.
3. Leer e incorporar una revisión del cronograma y comprobar cuentas conservadas e incidencias.
4. Actualizar un único mes de un cliente de prueba y comprobar los otros once.
5. Cargar una tabla de varios meses y revisar que su alcance es independiente del filtro.
6. Probar Ayuda en Administración, Series y Análisis.
7. Restablecer y activar una cuenta nueva de prueba y comprobar sus sedes y permisos.

Las pruebas de desarrollo utilizan datos y respuestas de Google sintéticos. La lectura del maestro real se ejecuta desde el servidor con la conexión privada configurada.
