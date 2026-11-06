# Compras: informe trabajado con las conexiones web finales

Genera una **plantilla nueva**, tomando el informe/modelo de COMPRAS_TRABAJADO.pbit y las dos consultas CSV Web.Contents de COMPRAS_FINAL_CONEXIONES.pbit. Requiere Node 22 o superior. No usa Python, Power BI Service, Apps Script ni MySQL.

```powershell
npm ci --ignore-scripts
node iniciar.mjs
```

Pega las rutas de las dos plantillas cuando las solicite. En Windows puedes seleccionarlas en el Explorador y usar **Copiar como ruta**. El generador crea una carpeta nueva `COMPRAS_POWERBI_...` bajo tu perfil de usuario y muestra la ruta del resultado `COMPRAS_FINAL_WEB.pbit`. No sobrescribe ninguna plantilla ni sube archivos a GitHub.

También se pueden indicar las rutas directamente:

```powershell
node migrar.mjs 'C:\ruta\COMPRAS_TRABAJADO.pbit' 'C:\ruta\COMPRAS_FINAL_CONEXIONES.pbit' 'C:\ruta\nueva\COMPRAS_FINAL_WEB.pbit'
```

## Qué se traslada

- Las cinco páginas del trabajado: Consolidado, Guayaquil, Quito, Ahorros y Condiciones; sus 33 visuales, tema, filtros y diseño se conservan completos.
- Las 50 medidas DAX, tipos de columnas y relaciones del modelo trabajado. Se mantienen nombres compatibles con los visuales mediante una capa de transformación M.
- La expresión M de la consulta **Consulta** del final, sin cambiar URL, gid ni sus pasos, como origen de la tabla normalizada **Compras**.
- La expresión M de la consulta **Compras** del final, sin cambiar URL, gid ni sus pasos, como origen de **Ahorros**. Esa consulta de cotizaciones no se confunde con los gastos/facturas.
- DistribucionCiudad y Calendario siguen derivándose de las tablas normalizadas, con las reglas del trabajado.

Los orígenes web aparecen en Power Query como `Origen_Consulta_Web` y `Origen_Cotizaciones_Web`, consultas auxiliares sin otra tabla de datos importada. Se eliminan la copia incrustada, sus parámetros antiguos y los cambios pendientes de la plantilla trabajada para que no vuelvan a reemplazar las fuentes web al abrir.

| Columna de la conexión final | Columna del modelo trabajado |
| --- | --- |
| `Consulta[ Suma de importe ]` | `Compras[Importe]` |
| `Consulta[Etiquetas de fila]` | `Compras[Descripcion]` |
| `Consulta[TIPO SERVICIO]` | `Compras[Tipo]` |
| `Consulta[FACTURAS]` | `Compras[Facturas]` |
| `Consulta[F PAGO]` | `Compras[FormaPago]` |
| `Consulta[Ciudad]` | `Compras[CiudadOrigen]` |
| `Consulta[ Quito ]` / `[ Guayaquil ]` | `Compras[Quito]` / `[Guayaquil]` |
| `Compras[COTI 1]` / `[COTI 2]` de la conexión final | `Ahorros[Coti1]` / `[Coti2]` |

Los espacios en los encabezados se normalizan en Power Query; las hojas de Google no se modifican. Los importes con moneda conservan el validador del trabajado; un importe ambiguo se informa como error, sin transformarlo a cero. Los duplicados potenciales siguen señalados y no se borran automáticamente. Se conserva la regla original que separa el detalle de las filas de totales sin fecha ni descripción.

Las fechas completas conservan su día. Un período publicado como `ago-26` se interpreta como **agosto de 2026**, usando el día 1 para relacionarlo con Calendario; `sep-17` representa septiembre de 2017. Esa convención mensual 20AA es explícita: no se completa con el año actual ni se fuerza todo a 2026. Si la hoja usa esos textos para indicar un día y mes, debe corregirse el formato de publicación antes de entregar. El valor original sigue accesible en la consulta web auxiliar.

## Apertura y comprobación en Power BI Desktop

1. Abre **COMPRAS_FINAL_WEB.pbit** con la misma versión o una más reciente que las plantillas originales (las aportadas usan octubre de 2026).
2. Deja que Power BI cargue los datos desde las conexiones publicadas. Si solicita credenciales para esos enlaces CSV públicos, selecciona **Anónimo**. Las credenciales locales guardadas en Power BI no forman parte de una plantilla.
3. Comprueba las cinco páginas y actualiza. Verifica Total Compras + Total Servicios frente al Total General, los importes por ciudad y el ahorro Coti1 − Coti2 usando el mismo período y los datos actuales de Google Sheets. Los nuevos valores pueden diferir del corte incrustado antiguo.
4. Guarda el resultado como **COMPRAS_FINAL_WEB.pbix**. Conserva el PBIX final anterior hasta completar la revisión.

El generador comprueba el paquete, las referencias de los visuales y las relaciones; no ejecuta el motor de Power BI. La apertura, la autenticación y la actualización real deben confirmarse en Desktop. No se declara probado un refresco por tener solo un archivo PBIT válido.

## Validación de esta entrega

Con las dos plantillas aportadas se comprobaron las cinco páginas, 33 visuales, 50 medidas y 47 referencias de campos. Las nueve expresiones M se analizaron con `@microsoft/powerquery-parser` 5.0.0. Siete pruebas del generador verifican fuentes, conservación del informe, referencias rotas, eliminación de la copia antigua, protección de originales y rutas internas. No hay datos de usuarios ni enlaces de sus hojas en este repositorio. Ver [VERIFICACION_ESTRUCTURAL.json](VERIFICACION_ESTRUCTURAL.json).

Pruebas:

```powershell
npm test
```

El paquete ZIP y sus metadatos se reconstruyen; no se trasladan la firma interna del archivo modificado, el diagrama de tablas antiguo ni la referencia a otro dataset de la plantilla trabajada. Si Desktop rechaza el paquete, conservar los originales y revisar su mensaje exacto antes de utilizar el resultado.
