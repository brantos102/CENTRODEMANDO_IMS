# Catálogos EAN y WTW

Desde el 16 de noviembre ambos módulos vuelven al alcance solicitado por el usuario. La aplicación incluye `/catalogos`, accesible también desde la terminal y el Centro de Mando. No se pide otro corte de inventarios.

## EAN

Un administrador carga un CSV privado por sede. La plantilla contiene `cliente;sku;ean`. El nombre del cliente debe coincidir de forma única con el catálogo oficial del panel. SKU y EAN son texto: se conservan ceros iniciales y no se eliminan prefijos para adivinar equivalencias.

En la terminal, escribir o escanear un EAN y pulsar **Filtrar líneas**. El servidor resuelve solo asociaciones de clientes autorizados de ese inventario y sede. Si un EAN corresponde a varios SKU, se ofrecen las coincidencias y se exige elegir; no prevalece la última fila. Un SKU repetido en distintas posiciones sigue requiriendo elegir su línea antes de contar. La consulta del EAN no guarda un conteo.

La aplicación anterior tenía una búsqueda en Drive del CSV **RL_PRODUCTO_CODIGOS EAN13**, además de un adaptador `/productos` condicionado a propiedades de Apps Script. Ese adaptador contiene comentarios que piden ajustar su endpoint y campos; no demuestra una API real ya configurada. No se sustituye por un endpoint inventado ni se reutilizan credenciales de stock para otro servicio.

El catálogo real no está incluido en el corte ya importado. Debe cargarse por el formulario privado cuando el responsable lo entregue, manteniendo sus columnas como texto. No compartir filas operativas por el chat.

## Ubicaciones y visor WTW

La pantalla permite consultar y filtrar posiciones, zonas y descripción; imprimir nombres; girar un visor de las ubicaciones con geometría explícita. Se conserva un acceso al despliegue WTW original identificado en los respaldos, con sus propios permisos. La vigencia de ese despliegue aún debe comprobarse por su responsable.

La plantilla CSV usa `posicion;zona;descripcion;x;y;z;ancho;fondo;alto`. Solo `posicion` es obligatoria. Las coordenadas y dimensiones opcionales se expresan en metros, con punto decimal y hasta seis decimales. Se aceptan únicamente las seis juntas; dimensiones positivas. Una posición sin geometría aparece en el listado y no se dibuja mediante coordenadas supuestas. Los campos del maestro original deben mapearse explícitamente a la plantilla cuando se reciba su esquema real.

El visor representa hasta 2.000 ubicaciones por filtro y la tabla hasta 1.000 resultados; ambos informan su límite. La carga admite hasta 50.000 filas y 16 MB de CSV. Es un visor local de consulta: no se declara que reemplace las operaciones ni las etiquetas codificadas del backend externo que todavía no se ha recibido.

Fuentes detectadas en el análisis del código original:

| Dependencia | Referencia disponible | Pendiente |
|---|---|---|
| EAN | `1W9N73V2Y04DfxAk2KIMl-0Wk3fzGxBCxAGDoasXifIQ` y búsqueda por nombre de CSV | Confirmar catálogo efectivo y cargar datos privados |
| Ubicaciones | `1ZoVwXLyyA0dVuo-Ur1DOzEVshJbY96hj`, hoja `POS_UIO` | Confirmar referencia y recibir maestro/esquema |
| Backend WTW | Despliegue Apps Script `AKfycbzOP_NTy6LWE3Z9dT5wBHdraPTJPpJ6CenS6Woz1S6DTdBjRB2mYmmz6F3b3j8HeyM80w` | ID de secuencia de comandos, código y versión activa, reglas de ubicaciones/etiquetas/3D |

Un ID de despliegue no es el ID del proyecto Apps Script. Sin el código y los datos efectivos no se declara paridad completa con WTW, ni se interviene su proyecto.

## Conservación y permisos

Cada importación crea una versión en `ims_cm_catalogo` y `ims_cm_catalogo_fila`, con huella SHA-256, autor y fecha. El puntero `ims_cm_catalogo_actual` cambia en la misma transacción y se registra en auditoría. Un error revierte la carga completa. Repetir una operación confirmada no crea otra copia. El perfil operativo no puede actualizar ni borrar versiones anteriores.

No se alteran existencias, cantidades, capturas ni archivos de origen. Solo administradores de la sede importan; el maestro WTW se consulta desde las sedes habilitadas. La búsqueda EAN se limita adicionalmente al inventario y cliente autorizados. La instalación añade exclusivamente esas tres tablas y sus permisos mínimos a la base propia; conserva Apache, puertos y otros servicios.
