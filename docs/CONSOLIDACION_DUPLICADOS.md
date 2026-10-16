# Corrección de consolidación y protección de KPI

## Resultado y alcance

Cambios preparados sobre codigo-en-vivo (base 50f0cea), con la fuente TXT del usuario verificada contra esa base. La corrección se entrega por la rama codigo-en-vivo; su publicación en GitHub no importa código al proyecto Google ni ejecuta SQL remoto. La URL de la aplicación y el libro de Google no son accesibles desde este entorno. No se modificaron los adjuntos originales.

El XLSB contiene 183.358 filas en INVENTARIOS. La auditoría atribuye 82.597 a reprocesamientos de archivos y hay 174 copias exactas adicionales entre dos fuentes HYCITE. Comparar todas las columnas da 100.587 filas distintas, que no equivale a haber conciliado las fuentes ni validado los KPI.

## Comportamiento corregido

- Un ID físico de Drive se procesa una vez por corrida; también se protegen snapshots anteriores con referencias repetidas.
- Los reintentos reemplazan sus filas por código, cliente, sede cuando existe y ORIGEN_DRIVE. Los IDs largos de Drive ya no se comparan erróneamente con códigos como 260227_SG.
- ORIGEN_DRIVE se añade al final de INVENTARIOS/REGISTRO. Los códigos y las columnas existentes se conservan. En Supabase se conserva archivo_id y se añade origen_drive mediante la migración SQL incluida.
- Se alinea cada archivo por sus propios encabezados, normalizando tildes/espacios/puntuación. La cabecera del primer archivo no se reutiliza como si todas las planillas tuvieran el mismo ancho u orden. Columnas adicionales se conservan y el esquema persiste entre lotes; las filas anteriores se amplían con celdas vacías y su origen se desplaza conjuntamente. Columnas sobrantes completamente vacías se ignoran. Si hay datos bajo un encabezado vacío, se conserva la posición histórica cuando existe o se asigna SIN_ENCABEZADO_N. Encabezados ambiguos siguen bloqueándose en lugar de sobrescribir campos. La versión 96 mostró el fallo de anchura en el archivo FLUKE 14lubH6SOapWYykvwHfCrqNktmGHVDdFedPLl2oMr7D0; el mensaje anterior «Columnas sin encabezado» no demostraba que faltase la cabecera.
- Las columnas extra se preservan en las hojas; no se crean columnas ni mapeos adicionales automáticamente en Supabase. Los mapeos conocidos y la columna origen_drive permanecen.
- Un registro persistente oculto (__CONSOL_IDENTIDADES) compara en INVENTARIOS el contenido completo y la multiplicidad de cada grupo entre fuentes, también entre lotes. Copias completas idénticas se excluyen y se identifican en la auditoría. Contenido contradictorio de INVENTARIOS se bloquea, sin elegir automáticamente por fecha.
- REGISTRO se compara por evento completo: dos archivos pueden aportar conjuntos distintos del mismo código sin provocar una contradicción. Solo se excluyen eventos completamente idénticos entre fuentes; cambios de fecha, cantidad, usuario, posición u otro campo se conservan. Eventos sin ID se mantienen separados por archivo, porque no hay identidad suficiente para fusionarlos. Esta corrección responde al fallo observado en versión 94 con 240219_BEL/BELIA dentro de dos archivos físicos.
- IBM 250724_IBM: ambos archivos se conservan como inventarios distintos, según la decisión expresa del usuario. Se distinguen por ORIGEN_DRIVE/origen_drive.
- VENTURA 260907_VENTURA: habilitado por nueva indicación del usuario. Se conservan las fuentes de 53 y 64 filas con ORIGEN_DRIVE distinto; el adjunto no presenta filas idénticas ni coincidencias de SKU/serie/lote/despacho/partida/posición entre ellas. Se retiró el bloqueo específico sin desactivar los controles generales de integridad. El Excel de revisión anterior, que excluía VENTURA, quedó desactualizado.
- Una purga fallida aborta el append. Contadores y checkpoint se guardan juntos, después de escribir ambos destinos. La auditoría del lote también se reemplaza para no multiplicar sus filas ni TOTAL.
- Las cantidades de filas descartadas no se suman. Al cierre se comparan filas reales, contadores y el registro de fuentes. Archivos inaccesibles, contradicciones, diferencias de filas o errores críticos impiden la marca de validación.
- El presupuesto de lectura es de 3,5 minutos desde el inicio de la ejecución, reservando tiempo para confirmar el lote. No se supone que el editor disponga de 25 minutos. Un watchdog puede completar también un corte posterior al último checkpoint.
- La ruta legacy consolidarDatosFinal y sus wrappers usan el mismo núcleo protegido.

## Supabase

La sincronización de inventarios/registro exige una corrida completa con marca de validación y número de filas consistente. Comparte el lock del consolidador, bloquea fuentes parciales y distingue la validación de REGISTRO. Las entradas antiguas de migración/sincronización también usan esta ruta.

Los tramos no contiguos de un mismo archivo_id se agrupan antes de hacer DELETE: se conserva todo su contenido, incluidos diferentes orígenes IBM. Los reintentos informan las filas efectivamente aceptadas y no avanzan del archivo fallido. Cada corrida nueva reinicia el progreso; las fases terminadas se recuerdan para no reiniciarlas mientras se completa la siguiente. La tarea horaria comparte un presupuesto de 3,5 minutos entre las dos hojas y devuelve completo:false mientras falta trabajo.

El reemplazo REST remoto sigue siendo DELETE + INSERT: no es una transacción común. No refrescar Power BI mientras hay una publicación parcial o fallida. Este cambio no purga indiscriminadamente históricos de Supabase ausentes en las hojas y no demuestra integridad de datos remotos sin verificarlos.

Antes de sincronizar se debe ejecutar supabase/20261015_origen_drive.sql en el proyecto correcto. Solo añade dos columnas y sus índices; no borra datos. No se ejecutó en este entorno por falta de acceso a Supabase.

## Pruebas

Desde la raíz:

    node --check Cronograma_Recordatorios.js
    node --check SUPABASE.js
    node --test tests/consolidacion.test.cjs tests/supabase.test.cjs
    git diff --check

44 pruebas con el núcleo real en una VM Node y dobles de los servicios de Google: cortes, reintentos, fallo entre escrituras, fallos de purga, auditoría, copias HYCITE, IBM con orígenes separados incluso después de una interrupción, eventos REGISTRO parciales y compartidos de BELIA en varios archivos, VENTURA habilitado con 117 filas y reintento, cierre inconsistente, publicación Supabase parcial y variaciones de esquema/orden/columnas vacías, incluida recuperación después de insertar columnas. No son pruebas del runtime de Google, permisos, cuotas o SQL real.

También se ejecutó el filtro de fuentes real contra las filas atribuidas por la auditoría a los primeros procesamientos de los 346 archivos del XLSB: 100.761 filas de entrada; 174 copias HYCITE excluidas; 100.587 filas para revisión, incluyendo las 117 de VENTURA y conservando ambos IBM. Es una repetición sobre la exportación, no una relectura de archivos hijos originales ni una ejecución de la consolidación completa en Google.

## Aplicación en el flujo del usuario

1. Conservar una copia del libro y del proyecto antes de sustituir archivos. Revisar los cambios en el checkout local del PC; un git pull no descargará esta corrección mientras no se envíe a GitHub.
2. Reemplazar Cronograma_Recordatorios y SUPABASE completos con los archivos del paquete. Incluir .claspignore actualizado. No importar tests ni SQL como archivos Apps Script. Comprobar con clasp status y clasp open que el binding apunta al proyecto de prueba correcto antes de clasp push. No inferir el scriptId a partir de la URL /exec.
3. Validar primero en una copia del proyecto y libro. El paquete no cambia el binding .clasp.json. Si se usa copia manual, los .txt contienen exactamente los .js correspondientes.
4. Detener una corrida antigua mediante dash_cancelarConsolidacion antes de empezar la nueva. No reanudar una corrida hecha con el código anterior: la nueva versión usa CONSOL_VERSION=4 y rechaza estados de versiones anteriores. No borrar la hoja INVENTARIOS a mano para resolverlo.
5. Ejecutar consolidarTodoDesdeEditor. Esperar las continuaciones, revisar AUDITORIA_CONSOLIDACION/REGISTRO, ERRORES_VALIDACION_DETALLE y el resultado. VENTURA ya no tiene un bloqueo específico: ambos archivos deben consolidarse. Los errores reales de integridad sí impiden emitir la validación global.
6. Para conservar IBM como dos inventarios en Power BI, usar ORIGEN_DRIVE (Sheets) u origen_drive (Supabase) como identidad de archivo; DISTINCTCOUNT del antiguo código ID/archivo_id seguiría contando esos dos archivos como uno. Conservar el código original como etiqueta.
7. Tras validar en copia y aplicar la versión correspondiente, crear una nueva versión de la implementación Web App para que /exec la use. Importar código al editor y actualizar una implementación versionada son pasos distintos.
8. Ejecutar la migración SQL aditiva en Supabase antes de sincronizar las nuevas columnas. Solo después de una consolidación global validada, ejecutar sincronizarTodoSupabase hasta obtener ok:true y completo:true. Conciliar por código y origen con la hoja. Refrescar Power BI al final.

No se emitió una marca de KPI válido para los datos actuales, no se importó código al proyecto Google y no se reconstruyeron los datos de producción. El Excel anterior sin VENTURA quedó desactualizado. Las pruebas locales no certifican el KPI de producción: es necesario ejecutar y verificar la corrida real.
