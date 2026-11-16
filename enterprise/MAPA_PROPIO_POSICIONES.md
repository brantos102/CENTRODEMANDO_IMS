# Mapa propio de posiciones · medidas en centímetros

El usuario confirmó el 16/11/2026 que P/Q/R de `POS_ITSANET.csv` son **LARGO, ANCHO y ALTO en centímetros**, y autorizó una lógica propia en lugar de depender de WTW. El mapa está integrado en **EAN y ubicaciones → Mapa 3D de posiciones**. El despliegue externo de WTW queda aplazado y ya no es una dependencia de este módulo.

## Medidas y distribución

Las dimensiones se leen del original conservado. **120 × 100 × 135 cm** genera un volumen de **1,20 × 1,00 × 1,35 m**. Por defecto largo sigue X, ancho sigue Y y alto sigue Z; el usuario puede intercambiar la orientación largo/ancho sin cambiar la medida original. La plantilla opcional con coordenadas explícitas en metros conserva sus valores.

La distribución calculada agrupa por sede, almacén, bodega, calle, columna, nivel y profundidad. Ordena las etiquetas con comparación natural (02 antes de 10), apila los niveles presentes en cada columna utilizando sus alturas y alinea las profundidades según sus dimensiones. Una etiqueta de nivel no se convierte por sí sola en una altura multiplicada. Los niveles de una columna distinta no agregan alturas a otro rack.

El espacio de cada columna admite todas sus posiciones sin intersecciones; posiciones distintas que comparten una celda lógica se distribuyen en subespacios consecutivos. Cada bodega tiene un bloque separado. Las posiciones compartidas por clientes se representan como un solo volumen y conservan todas sus asociaciones.

| Parámetro inicial | Valor | Comportamiento |
|---|---:|---|
| Pasillo entre calles | 200 cm | Ajustable en la vista |
| Holgura entre posiciones/niveles | 0 cm | Ajustable en la vista |
| Separación entre bloques de bodegas | 300 cm | Ajustable en la vista |

Estos espacios y los orígenes X/Y se generan: no fueron medidos en el CSV. El resultado representa las medidas y estructura lógica del catálogo; no se declara un levantamiento de la edificación. Los ajustes son de visualización y no escriben coordenadas sobre los registros operativos.

Un cero o una medida ausente no se reemplaza por un tamaño supuesto. La posición permanece en el catálogo y se muestra en **Posiciones pendientes de medidas**. Los valores pequeños se respetan en centímetros; no se cambian automáticamente a metros para que tengan una dimensión habitual. Si dos asociaciones del mismo espacio tienen medidas discordantes, se conserva la posición para revisión sin elegir una de ellas arbitrariamente.

## Uso

El mapa permite filtrar por sede (cuando el conjunto incluye varias), almacén, bodega, calle, nivel, cliente y estado, además del buscador de posición/calle/cliente. Filtrar o girar no recalcula la ubicación de las demás posiciones. Se puede arrastrar, acercar/alejar, usar vista en planta o 3D y seleccionar una posición con el puntero o el selector accesible.

La ficha muestra dimensiones originales en cm, coordenadas del modelo en m, etiquetas de ubicación, clientes compartidos y estado declarado. Ocupada, libre y bloqueada provienen de los campos originales; no son una medición nueva de stock. **Descargar imagen** exporta la vista actual con su indicación de distribución calculada. La impresión de nombres utiliza el filtro activo y requiere hasta 1.000 posiciones por selección.

La representación utiliza Canvas y mantiene el modelo completo, con detalle adaptado al tamaño de pantalla y recorte de lo que queda fuera de la vista. No limita el mapa a los primeros 2.000 registros. El selector lista hasta 500 coincidencias para mantenerlo utilizable; el mapa conserva todas y ofrece filtros y búsqueda.

## Resultado del archivo recibido

| Sede | Posiciones con medidas positivas | Pendientes de medidas |
|---|---:|---:|
| UIO | 18.386 | 10 |
| GYE | 12.365 | 433 |
| Total | **30.751** | **443** |

Se conservaron los **31.751 registros**, sus **31.194 posiciones físicas** y **557 asociaciones compartidas**. Hay ocho posiciones con dimensiones menores a 5 cm, conservadas tal como fueron entregadas. Se verificó el modelo completo mediante barrido geométrico y no se encontraron superposiciones en los volúmenes generados.

Se generó un HTML privado autónomo con el archivo completo para revisión sin red. Incluye los datos reales y se mantiene fuera de Git; las capturas y fixtures que se publican en el repositorio usan solamente datos sintéticos. La validación geométrica y el artefacto privado no demuestran que la nueva revisión ya esté instalada en el servidor corporativo.

## Instalación y conservación

Aplicar el lanzador de versiones descrito en [Centro de Mando MySQL](CENTRO_MANDO_MYSQL.md). El mapa se calcula a partir de las filas originales ya importadas: si el CSV de posiciones ya está cargado, **no requiere volver a importarlo**. Si aún falta, usar la [carga directa de los CSV](CATALOGOS_EAN_WTW.md).

No se añaden tablas, privilegios SQL ni puertos para este mapa. No modifica existencias, cantidades de conteo, catálogos originales, tareas o permisos. WTW externo, Apache y los otros proyectos permanecen sin intervención.

## Verificación de esta entrega

Pasaron 207 pruebas Node, 161 Python y 32 de navegador con MySQL. El navegador verificó selección, filtros, cambio de pasillo sin modificar SQL, vista en planta/3D, zoom, pantalla móvil y descarga PNG. La geometría completa también pasó un barrido sin superposiciones en un contenedor limitado a 0,5 CPU y 512 MiB: 3.073 ms y 159 MiB RSS en esta ejecución. Son mediciones locales, no una garantía de tiempo en el servidor o teléfono del usuario.

Evidencia agregada sin filas: [validación del mapa](../docs/VALIDACION_MAPA_PROPIO_20261116.json). La [captura de prueba](../docs/capturas/mapa-propio-cm-20261116.png) utiliza posiciones sintéticas.
