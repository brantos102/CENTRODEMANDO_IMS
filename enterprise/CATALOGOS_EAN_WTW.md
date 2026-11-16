# Catálogos EAN y WTW

Desde el 16 de noviembre ambos módulos vuelven al alcance solicitado por el usuario. La aplicación incluye `/catalogos`, accesible también desde la terminal y el Centro de Mando. No se pide otro corte de inventarios.

## EAN

Un administrador carga un CSV privado por sede. La plantilla contiene `cliente;sku;ean`. El nombre del cliente debe coincidir de forma única con el catálogo oficial del panel. SKU y EAN son texto: se conservan ceros iniciales y no se eliminan prefijos para adivinar equivalencias.

En la terminal, escribir o escanear un EAN y pulsar **Filtrar líneas**. El servidor resuelve solo asociaciones de clientes autorizados de ese inventario y sede. Si un EAN corresponde a varios SKU, se ofrecen las coincidencias y se exige elegir; no prevalece la última fila. Un SKU repetido en distintas posiciones sigue requiriendo elegir su línea antes de contar. La consulta del EAN no guarda un conteo.

La aplicación anterior tenía una búsqueda en Drive del CSV **RL_PRODUCTO_CODIGOS EAN13**, además de un adaptador `/productos` condicionado a propiedades de Apps Script. Ese adaptador contiene comentarios que piden ajustar su endpoint y campos; no demuestra una API real ya configurada. No se sustituye por un endpoint inventado ni se reutilizan credenciales de stock para otro servicio.

El usuario entregó `RELACION_EAN13_UIO.csv`: **12.496 registros**, cinco columnas, codificación Windows-1252. La carga reconoce directamente `CLIENTE_ID;PRODUCTO_ID;TIPO_CODIGO;CODIGO;CANTIDAD`, conserva tipo de código y el campo CANTIDAD, además de todas las celdas originales. No convierte presentaciones en stock ni multiplica capturas automáticamente; la semántica de CANTIDAD queda pendiente de confirmación. La consulta EAN muestra el valor declarado de CANTIDAD y mantiene la cantidad de captura manual.

Los códigos de cliente se asocian por nombre oficial inequívoco, por una cuenta ERP verificada de la misma sede o por una selección explícita del administrador en la vista previa. No se elimina un prefijo para adivinar el cliente. Las filas del formato DEPOT que no tienen asociación confirmada se conservan con cliente pendiente; no participan en la resolución EAN hasta una nueva versión con esa asociación. No se crean clientes ficticios ni se descarta el resto del catálogo por estas filas.

## Ubicaciones y visor WTW

La pantalla permite consultar y filtrar posiciones, zonas y descripción; imprimir nombres; girar un visor de las ubicaciones con geometría explícita. Se conserva un acceso al despliegue WTW original identificado en los respaldos, con sus propios permisos. La vigencia de ese despliegue aún debe comprobarse por su responsable.

La plantilla opcional usa `posicion;zona;descripcion;x;y;z;ancho;fondo;alto`. Solo `posicion` es obligatoria. Sus coordenadas y dimensiones explícitas se expresan en metros, con punto decimal y hasta seis decimales; se aceptan únicamente las seis juntas y dimensiones positivas.

La exportación real **POS_ITSANET.csv se carga directamente**, sin convertir sus 26 columnas a la plantilla. Contiene **31.751 registros**: 18.540 UIO (18.396 posiciones físicas) y 13.211 GYE (12.798 posiciones físicas). Las 557 asociaciones adicionales corresponden a posiciones compartidas por clientes; no se eliminan. POSICION_ID tampoco se utiliza como identidad global porque se repite en distintos almacenes. Se conservan ciudad, almacén, bodega, calle, columna, nivel, profundidad, cliente, bloqueos, ocupación, dimensiones y demás campos del original.

El archivo contiene dimensiones pero no X/Y/Z ni origen físico de los pasillos. No se asigna una escala a CALLE/COLUMNA/NIVEL ni se convierten LARGO/ANCHO/ALTO a metros sin confirmación de su unidad. Por tanto se muestra el maestro completo y las dimensiones originales, y **no se genera un plano físico supuesto**. El backend y configuración del WTW actual siguen pendientes.

El visor representa hasta 2.000 ubicaciones por filtro y la tabla hasta 1.000 resultados; ambos informan su límite. La carga admite hasta 50.000 filas y 16 MB de CSV. Es un visor local de consulta: no se declara que reemplace las operaciones ni las etiquetas codificadas del backend externo que todavía no se ha recibido.

Fuentes detectadas en el análisis del código original:

| Dependencia | Referencia disponible | Pendiente |
|---|---|---|
| EAN | CSV real recibido y validado: `RELACION_EAN13_UIO.csv` | Cargar en UIO y revisar asociaciones no confirmadas |
| Ubicaciones | CSV real recibido y validado: `POS_ITSANET.csv` | Cargar por sede y confirmar unidad/plano de distribución |
| Backend WTW | Despliegue Apps Script `AKfycbzOP_NTy6LWE3Z9dT5wBHdraPTJPpJ6CenS6Woz1S6DTdBjRB2mYmmz6F3b3j8HeyM80w` | ID de secuencia de comandos, código y versión activa, reglas de ubicaciones/etiquetas/3D |

Un ID de despliegue no es el ID del proyecto Apps Script. Sin el código y los datos efectivos no se declara paridad completa con WTW, ni se interviene su proyecto.

## Conservación y permisos

Cada importación crea una versión en `ims_cm_catalogo` y `ims_cm_catalogo_fila`, con huella SHA-256, autor y fecha. El puntero `ims_cm_catalogo_actual` cambia en la misma transacción y se registra en auditoría. Un error revierte la carga completa. Repetir una operación confirmada no crea otra copia. El perfil operativo no puede actualizar ni borrar versiones anteriores.

No se alteran existencias, cantidades, capturas ni archivos de origen. Solo administradores de la sede importan; el maestro WTW se consulta desde las sedes habilitadas. La búsqueda EAN se limita adicionalmente al inventario y cliente autorizados. La instalación añade exclusivamente esas tres tablas y sus permisos mínimos a la base propia; conserva Apache, puertos y otros servicios.

La carga de archivos originales añade `ims_cm_catalogo_archivo`, con permisos SELECT/INSERT y fragmentos de 256 KiB. Conserva los bytes originales, codificación, formato y hash SHA-256 del archivo completo. Un fallo revierte también estos fragmentos y el cambio de versión. El original se descarga autenticado y se verifica su hash antes de entregarlo; si contiene ambas sedes, requiere acceso administrativo a ambas. La descarga de versiones antiguas también mantiene esta restricción.

## Cargar los archivos recibidos

Tras instalar la revisión correspondiente, abrir **EAN y WTW → Importar una versión del catálogo**:

1. Seleccionar **UIO**, tipo **EAN** y `RELACION_EAN13_UIO.csv`. Pulsar **Revisar archivo y asociaciones**. Verificar los clientes propuestos; las asociaciones desconocidas pueden conservarse pendientes. Confirmar la carga: deben conservarse **12.496 registros**.
2. Seleccionar **UIO**, tipo **WTW** y `POS_ITSANET.csv`. Revisar: **18.540 registros**, **18.396 posiciones físicas**. El original íntegro conserva también los datos de GYE. Confirmar la carga de UIO.
3. Seleccionar **GYE**, tipo **WTW** y el mismo `POS_ITSANET.csv`. Revisar y confirmar: **13.211 registros**, **12.798 posiciones físicas**.

El formulario espera a recibir el catálogo de clientes antes de habilitar la revisión. La vista previa no escribe en la base. Cada confirmación importa solo la sede seleccionada. Quito y Guayaquil tienen versiones activas independientes; un mismo nombre de posición no mezcla sus clientes ni almacenes. No se carga el archivo EAN de UIO en GYE porque no se recibió un catálogo EAN de esa sede.

Los CSV reales se usan para análisis privado y no se incluyen en Git ni en las capturas de prueba. La instalación del código no equivale a haber importado estos datos en el servidor corporativo. La evidencia compartida contiene solamente estructura, hashes, conteos y resultados de validación.

Validación de esta ampliación: 198 pruebas Node, 161 Python, 32 de integración del Centro con MySQL 8.0.46 y 31 recorridos Chromium aprobados. Los CSV reales completos también pasaron la validación de estructura y proyección con heap de 256 MiB, contenedor de 512 MiB y CPU de 50 %; lectura, validación y firma tardaron 3.435 ms, con RSS final de 171 MiB. Esta prueba de archivos no importa datos operativos ni mide el tiempo de carga de MySQL corporativo. [Evidencia](../docs/VALIDACION_CATALOGOS_DEPOT_20261116.json).
