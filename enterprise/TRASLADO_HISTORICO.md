# Histórico candidato desde Sheets a MySQL

Esta fase agrega un diagnóstico sin base de datos y un traslado transaccional del subconjunto de inventarios íntegros **Entregado** a las entidades candidatas. El maestro completo se conserva en staging, con sus notas, fórmulas originales y XLSX. No sustituye todavía la operación de Apps Script.

## Diagnóstico del Excel vigente en Windows

Descargar otra vez el maestro desde Google Sheets como **Microsoft Excel (.xlsx)**. El corte compartido en octubre no representa automáticamente el estado de noviembre. Usar PowerShell del PC Windows, donde está el repositorio candidato; no la terminal Bash remota del servidor.

Desde `enterprise`:

```powershell
& '.\tools\diagnosticar-corte.ps1'
```

Solicita la ruta completa del XLSX. Requiere Node 22 y Python 3.9 o superior (`py -3` o `python`), sin paquetes Python adicionales. No instala programas ni cambia políticas de ejecución. Si una política corporativa impide ejecutar archivos PS1, TI debe aplicar su procedimiento autorizado; el equivalente manual es:

```powershell
$imsXlsx = (Read-Host 'Ruta completa del XLSX actual').Trim().Trim('"')
$imsPrivado = Join-Path $env:USERPROFILE ('IMS_DATOS_PRIVADOS\DIAGNOSTICO_' + (Get-Date -Format 'yyyyMMdd_HHmmss_fff'))
$imsCorte = Join-Path $imsPrivado 'corte'
$imsPlan = Join-Path $imsPrivado 'plan'
py -3 '.\tools\exportar_snapshot.py' $imsXlsx $imsCorte
if ($LASTEXITCODE -ne 0) { throw 'Extraccion detenida; no continuar.' }
node '.\tools\planificar-operacion.mjs' $imsCorte $imsPlan
if ($LASTEXITCODE -ne 0) { throw 'Diagnostico detenido; no continuar.' }
```

El diagnóstico escribe copias nuevas bajo `%USERPROFILE%\IMS_DATOS_PRIVADOS`; el original queda intacto. No conecta a Google, Supabase, MySQL ni Apps Script. Su salida incluye cantidades y motivos por inventario, sin filas de clientes. El script guarda `resumen_para_compartir.json`; solo ese resumen se puede compartir para continuar la revisión. Los otros archivos contienen datos privados. En Windows se conservan los permisos NTFS heredados de la carpeta de usuario: revisar que no sea una carpeta compartida. No subir el corte ni el plan al repositorio.

El contrato exige INVENTARIOS con sus 30 encabezados y REGISTRO con sus 15, incluido LINK. La procedencia debe estar en las notas `IMS_ORIGEN_DRIVE` de las celdas ID; no se crean columnas públicas. Si falta una nota o cambia un encabezado, se detiene sin deducirlo por SKU.

## Reglas de preparación

- Cada archivo físico de Drive conserva su identidad aunque otro tenga el mismo código operativo. Una línea se identifica por corte + origen + fila del consolidado, nunca solo por SKU o número de línea.
- Solo el estado **Entregado**, tras quitar espacios y comparar mayúsculas, permite preparar el histórico. No acepta «No entregado» ni «Entregado pendiente de validación».
- Todos los renglones de PANEL DE CONTROL quedan en el catálogo privado, incluidos los pendientes. Los que aún no aparecen en INVENTARIOS requieren sus planillas hijas: no se crean como inventarios vacíos ni se pierden por no estar entregados.
- Se valida el archivo completo. Cliente vacío o no catalogado, códigos operativos mezclados dentro del origen, sede desconocida, conteos negativos/ambiguos o campos fuera del tamaño admitido lo dejan para revisión. No se adivina el cliente desde el panel ni se convierte un conteo inválido a cero.
- Cero y ausencia de conteo son distintos; decimales exactos de hasta 21 enteros y 9 decimales, sin redondeo. Un texto como `1,000` requiere revisar la fuente. Las filas que contienen solo notas permanecen en staging sin crear existencias.
- Los campos originales que todavía no tienen entidad operativa siguen disponibles íntegros mediante la referencia a staging. REGISTRO no se convierte en auditorías nuevas: se conserva sin reinterpretar sus columnas históricas ambiguas.

`catalogo.jsonl` identifica cada archivo y sus motivos de revisión. `incidencias.jsonl` identifica las filas que requieren revisión; `lineas_preparadas.jsonl` contiene solo archivos completos preparados. Los hashes y la identidad determinista del plan permiten detectar alteraciones. Estos tres archivos son privados.

## Revisar las incidencias sin volver a descargar o consolidar

Desde `enterprise`, sobre el corte y plan ya generados:

```powershell
$imsDiagnostico = 'C:\ruta\privada\DIAGNOSTICO_...'
$imsRevision = Join-Path $imsDiagnostico ('REVISION_' + (Get-Date -Format 'yyyyMMdd_HHmmss_fff'))
node '.\tools\revisar-incidencias.mjs' (Join-Path $imsDiagnostico 'corte') (Join-Path $imsDiagnostico 'plan') $imsRevision
if ($LASTEXITCODE -ne 0) { throw 'Revision detenida.' }
```

Genera **revision_para_compartir.json** en una carpeta nueva. Este informe acotado se puede adjuntar para revisar la migración: incluye conteos, filas del panel/INVENTARIOS del corte, ejemplos de códigos operativos, columnas afectadas y longitudes. No contiene cantidades, descripciones de productos, series, notas, contraseñas ni filas de USUARIOS. Textos ID ajenos al formato habitual se identifican con hash y longitud. No adjuntar el corte o el plan completo como sustituto del informe.

Para `IDS_OPERATIVOS_MEZCLADOS`, compara la columna ID **dentro de cada origen físico de Drive**. Distingue códigos diferentes de variaciones que coinciden al normalizar mayúsculas, Unicode y espacios. Esa equivalencia es solo una pista para revisión: no autoriza fusionar, renombrar o descartar datos. IBM/VENTURA con un mismo código en archivos físicos distintos se conservan como fuentes independientes y no se marcan por ese solo motivo.

Las muestras están limitadas a cinco archivos, tres códigos y tres tramos por ejemplo; los contadores se calculan sobre todas las filas. Un mismo archivo puede tener varios motivos. El informe no demuestra por sí solo si hay error en la fuente, un renombrado parcial o una procedencia mal asociada; se contrasta con las planillas originales. Las filas del corte pueden diferir de las posiciones en el Google Sheets vigente si la operación continuó después de descargarlo.

Esta revisión solo lee la copia y escribe un informe nuevo. No conecta a MySQL ni Google y no cambia el esquema Power BI, las fuentes, los planes ni los criterios de elegibilidad. Se añadieron cinco pruebas de revisión, incluidas diferencias de formato, fuentes independientes, ocultamiento de valores sensibles y conservación del corte/plan; el conjunto unitario pasa de 37 a 42.

### Contrastar un posible desfase de procedencia entre cortes

Si varios grupos consecutivos conservan su cantidad de filas pero contienen al inicio un bloque del código anterior, primero comprobar la alineación de datos/notas. No reemplazar todos los ID ni aplicar un desplazamiento fijo sin verificar el contenido: puede haber correcciones reales, fuentes repetidas o datos nuevos.

```powershell
$imsHuellas = Join-Path $imsDiagnostico ('HUELLAS_' + (Get-Date -Format 'yyyyMMdd_HHmmss_fff'))
node '.\tools\generar-huellas-inventarios.mjs' (Join-Path $imsDiagnostico 'corte') $imsHuellas
if ($LASTEXITCODE -ne 0) { throw 'Generacion de huellas detenida.' }
Compress-Archive -LiteralPath (Join-Path $imsHuellas 'huellas_inventarios.jsonl.gz') -DestinationPath (Join-Path $imsHuellas 'EVIDENCIA_PROCEDENCIA.zip') -CompressionLevel NoCompression
```

Este ZIP se puede adjuntar para una comparación: contiene exclusivamente posiciones de filas y hashes SHA-256, incluido el identificador de procedencia representado por hash. No contiene las celdas originales, sus notas, SKU, cantidades, series, nombres de clientes o filas de USUARIOS. No es una copia de respaldo ni permite reconstruir los datos. Tratarlo como evidencia interna; no publicarlo en GitHub.

La huella de cada fila representa los 30 valores de INVENTARIOS en su orden, con ausencias/null como texto vacío. Ignora estilo, fórmula, tipo de celda y nota para comparar valores entre exportaciones; conserva el texto y los ceros iniciales. El archivo incorpora cabecera, número de filas y control SHA-256 del contenido anterior al cierre, además del CRC del GZip. Se valida el corte antes de generarlo y se rechaza sobrescribir otra salida.

La igualdad de una huella es evidencia de valores iguales, no autorización para reasignar su origen. Una coincidencia con varios archivos físicos queda ambigua y debe conservarse. La comparación y cualquier plan de reparación requieren verificar también filas nuevas/modificadas, extremos de cada grupo y multiplicidad. Este generador no repara notas, no modifica Sheets/MySQL y no elimina las alertas. Sus cuatro pruebas adicionales elevan el total unitario a 46.

### Copia local con notas de procedencia verificadas

Solo después de contrastar las huellas entre cortes, una receta privada revisada puede corregir marcadores en **una nueva copia XLSX**. La receta y sus huellas no se publican en Git; el operador recibe el JSON y su SHA-256 canónico para vincular la actuación a la revisión concreta.

```powershell
& '.\tools\corregir-procedencia-copia.ps1' -Diagnostico $imsDiagnostico -ArchivoHuellas $imsArchivoHuellas -Receta $imsRecetaPrivada -ShaReceta $imsShaReceta
```

La herramienta requiere coincidencia exacta del XLSX original, archivo de huellas, receta y expansión de filas aprobadas. La versión 2 de receta delimita el tramo contrastado y la posición de las notas de referencia; solo cambia las filas cuya procedencia difiere, con una huella de expansión que vincula fila, valores, origen anterior y origen nuevo. No es una orden de desplazar todas las notas ni sirve para otro corte. Rechaza fuentes ambiguas, contenido distinto, cantidades de correcciones inesperadas y salidas existentes.

Antes de escribir comprueba los 30 valores de cada fila seleccionada directamente en el XLSX, los ID de archivo del panel y sus notas actuales. Cambia exclusivamente el texto del identificador `IMS_ORIGEN_DRIVE`; conserva las notas humanas, incluso si el marcador está dividido entre fragmentos de texto enriquecido. Comprueba que todas las partes internas del libro ajenas al XML de comentarios permanezcan idénticas, incluyendo hojas, fórmulas, encabezados, estilos, gráficos y enlaces. Los comentarios restantes también se contrastan. No edita valores, filas, columnas ni REGISTRO.

El procedimiento genera `fuente_corregida.xlsx`, otro corte y otro plan bajo una carpeta privada nueva, más `resumen_correccion.json` y `resumen_para_compartir.json`. Solo estos dos resúmenes se pueden adjuntar para continuar la revisión. La copia XLSX y sus cortes siguen incluyendo las hojas administrativas privadas. El original se conserva y no se modifica Google Sheets, MySQL, Supabase ni la conexión de Power BI. Un cambio de notas no constituye aprobación de KPI ni resolución de otras incidencias.

Validación: 12 pruebas Python aprobadas (las cinco del exportador y siete de copia), con conservación de texto enriquecido, protección del original, receta alterada, valores de huellas falsificados, origen inesperado, expansión no aprobada y rechazo de extensiones XML no soportadas. Además se inyectó un fallo de 415 notas en una copia del corte anterior de 19 hojas/100.835 filas de INVENTARIOS y se restauró: todos los valores/partes ajenos a comentarios quedaron idénticos y todas las notas finales coincidieron con la referencia. Fue un ensayo local con fallo simulado, no una aplicación al archivo actual del usuario. El auxiliar PowerShell no se ejecutó en Windows en este entorno.

## Traslado a una base exclusiva de ensayo

No ejecutar en el servidor compartido hasta preparar y validar su base y usuario exclusivos. La herramienta no crea bases ni usuarios, no concede permisos y no cambia parámetros globales de MySQL. Con el corte previamente importado y verificado en staging:

```bash
cd enterprise
# Archivo de configuración privado; usuario con permisos solo en la base de ensayo.
# Mantener IMS_API_HABILITADA=0. No usar root ni bases de otras aplicaciones.
IMS_MIGRACION_OPERATIVA=1 node --env-file=/ruta/privada/migracion.env \
  tools/trasladar-operacion.mjs --aplicar /ruta/privada/plan /ruta/privada/corte
```

El nombre de base debe ser `centromando_ims` o `centromando_ims_*`, con conexión local. El opt-in de la línea anterior habilita únicamente el traslado, no la API. Crea las tablas internas 002/004/005 si faltan y escribe en una transacción: plan, catálogo completo y archivos preparados con sus líneas, metadatos y referencias al original. Si falla una escritura o la comprobación final, revierte todos esos datos. El DDL de MySQL no es transaccional: pueden quedar tablas vacías tras un fallo, pero no se declara la carga completa.

Las cantidades y los metadatos se vuelven a calcular desde staging y se comparan con el plan antes de escribir. Antes del COMMIT se leen de MySQL todas las líneas trasladadas y se verifica su hash, multiplicidad, procedencia y contenido. La referencia guardada es la **fila del consolidado**; `fila_origen` de la planilla hija queda NULL porque no se conoce con certeza a partir del maestro.

Repetir el mismo corte/plan comprueba los datos existentes y devuelve `yaTrasladado: true`. No hace DELETE, no suma otra copia y no repara silenciosamente una línea alterada. Un nuevo corte que incluya un origen ya trasladado se rechaza: la conciliación del delta posterior sigue pendiente.

Los inventarios preparados quedan en estado interno ENTREGADO, por lo que el núcleo de conteo rechaza nuevas capturas. El traslado no crea actores, cuentas ni permisos. Se podrán consultar al asignar después permisos de lectura explícitos, con aceptación por cliente/sede. No activa usuarios antiguos ni migra sus contraseñas/PIN. Tampoco aprueba KPI o las reglas de exactitud históricas.

## Ensayo del 6 de noviembre de 2026

Se utilizó MySQL 8.0.46 efímero local y Node 22.23.3, sin conexión al servidor empresarial. El corte aportado se identifica por SHA-256 `8f565334499e252fecbe5ea1a9e4607e40f60c004e094b5e7015a25166d2d16c`; no se afirma que sea el maestro vigente de noviembre.

| Control | Resultado |
| --- | ---: |
| Hojas/filas originales conservadas y verificadas en staging | 19 / 277.731 |
| Inventarios del panel conservados en el catálogo | 363 |
| Archivos íntegros trasladados como histórico candidato | 336 |
| Líneas trasladadas y verificadas por contenido | 91.010 |
| Archivos que requieren revisión | 27 |
| Líneas existentes conservadas para revisión | 9.825 |
| Permisos creados para el corte | 0 |

Los dos archivos IBM conservan 409 filas cada uno. Los dos VENTURA conservan 53 y 64. Repetir el traslado no añadió líneas; la comprobación final, incluida la copia completa de staging, tardó aproximadamente 13 segundos en el contenedor de ensayo. Ese tiempo no es una garantía de rendimiento del servidor compartido.

Entre los motivos de revisión hay 15 planillas hijas pendientes de extraer, clientes vacíos/no catalogados, códigos mezclados, sede desconocida y conteos negativos/ambiguos. Los motivos se solapan: sus cantidades no se suman para contar archivos. El diagnóstico no corrige estos valores ni descarta sus originales.

Se aprobaron 37 pruebas unitarias y 33 de integración MySQL con Node 22. Incluyen fallo real de clave foránea con rollback íntegro, reintento, separación por origen, rechazo de un nuevo corte solapado, plan alterado comparado contra staging, modificación de una cantidad y línea añadida fuera del traslado. La evidencia agregada está en [VALIDACION_TRASLADO_20261106.json](../docs/VALIDACION_TRASLADO_20261106.json); no contiene filas ni credenciales. El auxiliar PowerShell se revisó, pero no se ejecutó aquí en Windows; los módulos Node sí se probaron con Node 22 y la extracción XLSX ya dispone de pruebas Python.

## Límites de esta entrega

Pendientes: extracción de planillas hijas en proceso/validación, resolución de incidencias sin perder el original, conciliación del delta final, gestión de identidades/permisos reales, flujos WMS restantes, indicadores acordados y aceptación por roles en el servidor. WTW sigue aplazado. IV_ITSANET, RRHH, Data Sync y las conexiones Power BI actuales siguen operando en sus configuraciones existentes.
