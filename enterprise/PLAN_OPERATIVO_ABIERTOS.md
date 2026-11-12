# Proyectar los abiertos a las columnas operativas

La copia de revisión del corte `99d4b7ff-2f53-4f25-b740-23bf1f371c29` ya fue confirmada en el servidor por el usuario: 12.509 productos y 984 filas auxiliares, integridad SQL verificada y sin activación operativa. No repetir esa carga para este paso.

El planificador lee esa copia en una transacción MySQL de **solo lectura**, compara nuevamente cada registro con la preparación privada y consulta el catálogo de clientes y los inventarios que ya usan esos archivos de origen. Genera una proyección de todas las líneas a las columnas de `ims_op_linea`, `ims_op_detalle_linea` e `ims_nat_linea`. No inserta las proyecciones en esas tablas ni modifica permisos, Apache, servicios o puertos.

## Ejecutar

Después de actualizar las referencias con `git fetch origin migracion/mysql-candidata-20261104`, usar la revisión publicada, el ZIP privado existente y el `copia_id` del resultado SQL:

```bash
git show "$imsRevision:enterprise/deploy/planificar_abiertos_operativos.sh" |
  bash -s -- "$imsRevision" "$imsZip" "$imsCopia"
```

Se usa un worktree aislado y la cuenta existente `ims_cm_migracion`, con una sola conexión. La configuración se entrega a Node por entrada estándar. El contexto SQL contiene nombres privados del catálogo y se guarda con permiso 0600; no se muestra en consola. No se consulta Recursos Humanos, propiedades de Google ni APIs ERP.

La salida queda en `PLAN_ABIERTOS_OPERATIVOS_<id>/plan/`:

- `lineas_operativas_NO_ACTIVAR.jsonl`: cada producto con procedencia, identidad estable, stock, C1/C2/C3, ajuste, textos originales y observaciones. No convierte ausencia en cero ni completa etapas anteriores.
- `plan_operativo_NO_ACTIVAR.json`: referencias de panel, cliente exacto del catálogo, estados, fechas, esquemas, conflictos con inventarios existentes y hashes. Incluye también el archivo fuera de selección.
- **`resumen_plan_abiertos_para_compartir.json`**: compartir únicamente este archivo. Localiza incidencias por fuente y filas del panel del corte sin publicar nombres, códigos, SKU, correos, cantidades de celdas o ID de Drive.

## Reglas de proyección

El nombre del cliente proviene del panel. Debe corresponder a un único cliente existente por su nombre exacto; no se sustituye por el cliente escrito en una línea ni se crea otro automáticamente. Un archivo que ya aporta líneas a un inventario operativo o histórico requiere conciliación; no se duplica.

Las cantidades se vuelven a interpretar desde las celdas originales y se comparan con la preparación. Se conservan exactamente ceros, fracciones legítimas de celdas numéricas, ajustes negativos y vacíos. Los textos con separadores necesitan una regla de su origen; nunca se convierten por su apariencia. No se corrige C3 sin C2 agregando un cero u otro conteo.

Las fechas usan el perfil `itsanet-dia-original-2000-2099-v2`. Las fechas tipadas y los textos ISO con zona se convierten al día de la zona horaria original cuando está disponible. Si la zona falta o el sistema no puede resolverla, se conserva el día visible que el propio Sheets exportó junto al instante UTC, **solo con un formato de calendario explícito y una representación compatible con ese instante**. No se asume la zona del servidor, navegador o Ecuador. Un visible desconocido no sustituye el instante ni una zona disponible contradictoria: el registro queda para revisión con un motivo específico.

El texto visible debe corresponder al instante para algún desplazamiento dentro de ±14 horas; la comprobación respeta la precisión de la presentación, sin redondearla al día siguiente. Así un valor UTC del día 12 mostrado por Sheets como día 11 conserva el día 11 si su representación local lo confirma. Los valores UTC y visibles originales siguen íntegros en la copia SQL. El resumen informa el origen de cada día (`ZONA_LIBRO` o `DIA_VISIBLE_DE_SHEETS`) y la disponibilidad de la zona, sin publicar fechas de las filas.

Los textos día/mes/año se leen conforme a los formatos encontrados en los respaldos: `dd/MM/yy HH:mm:ss` en COD_INVENTARIOS, `dd/MM/yyyy` en WMS V124 y `dd/MM/yyyy HH:mm:ss` en el consolidador. Se admiten horas válidas y años de dos o cuatro dígitos; el contrato nativo está limitado a 2000–2099. Un serial numérico de Sheets requiere además un formato de calendario explícito, incluido mes/día/año; el número de días no depende de esa presentación. No se redondea la fracción al día siguiente. Los formatos contradictorios, calendarios u horas inválidos y textos desconocidos quedan para revisión. La fecha no se deduce de `DDMMAA_CLIENTE`. Una fecha presente pero no interpretada no se etiqueta además como ausente.

Los estados reconocidos son En Proceso, En Validación, Entregado y Cancelado; otros textos permanecen retenidos. La columna B de la planilla puede reflejar el último conteo en el legado; su valor se conserva como `fecha_fin` original y no convierte por sí solo el inventario a Entregado ni se toma como fecha de entrega nativa. Solo Entregado exacto es elegible para la consolidación, y este plan no publica KPI.

Los códigos múltiples o ausentes, fechas de inicio distintas, planillas parciales o series cuyo stock no coincide con una unidad se señalan para revisión del archivo entero salvo las reglas expresamente confirmadas a continuación. No se eliminan líneas. También se clasifica el tipo y formato de las fechas pendientes, con ejemplos de ubicación sin contenido de celdas.

Una serie repetida en **stock teórico** es un aviso con selección de línea, no una captura física duplicada. El WMS V124 comprueba duplicados en PLANILLA DE SERIES FISICAS; la base teórica puede conservar más de una coincidencia. La aplicación nativa también conserva esas líneas y exige seleccionar SKU/ubicación cuando hay varias coincidencias. El plan no las elimina, combina, renombra ni crea capturas de series a partir de ellas. El resumen muestra sus filas originales y coincidencia de SKU, posición y lote, sin sus valores. El bloqueo de una segunda captura física de la misma serie sigue vigente en la aplicación y SQL.

## Decisiones confirmadas el 12 de noviembre

Estas reglas se aplican únicamente a la copia SQL `430b63caa019504ba42aa4fed841b8c7b19e0b5f94d124810ed770bd893851c7`. Se resuelve el ID físico desde el panel guardado en esa copia y se comprueban el número de líneas y códigos antes de aplicarlas. No se reutilizan posiciones de panel sobre otro corte.

- **Fila 317: 44 productos y 12 códigos.** Separar cada combinación de código literal y día de inicio en un conteo independiente, todos vinculados al mismo archivo de origen. No reunir dos fechas bajo un código ni convertir las 984 filas auxiliares en productos. Las series se comparan dentro de cada conteo; su repetición en fechas o códigos distintos no es por sí sola una serie duplicada del mismo inventario.
- **Fila 334: 630 productos sin inicio.** Conservar pendientes de iniciar, con código, fecha y C1/C2/C3 vacíos. Si aparece una captura, incluso cero, o un código/fecha ya registrados, la regla se detiene para conciliación. No crea un inventario nativo con fecha o código inventados: las proyecciones llevan `inventario_id: null`, `pendiente_id` y sus requisitos de arranque.

El plan privado pasa a `ims-abiertos-plan-operativo-v2`: `fuentes` conserva la procedencia física y las reglas; `inventarios` enumera los conteos lógicos. La numeración propuesta es consecutiva dentro de cada conteo y el número original se conserva por separado. Los ID de inventario incluyen archivo, código y fecha; los ID de línea incluyen el conteo y la fila física. Así un mismo SKU o número original no reúne líneas legítimamente distintas. Ninguna de estas identidades se ha importado todavía al núcleo nativo.

El resumen distingue archivos sin bloqueos estructurales, archivos con bloqueos y archivos pendientes de iniciar. Añade los conteos lógicos de la selección y del archivo conservado fuera de ella. No sumar estos conteos a los 352 históricos como si ya estuvieran activados.

`inventarios_sin_bloqueos_estructurales` indica que los campos de la copia pueden representarse en el núcleo operativo; **no significa que sus datos estén actualizados ni habilitados para captura**. Todas las fuentes conservan `requiere_delta_final: true` y `listo_para_activar: false`. El maestro todavía incompleto, las cuentas/permisos y los cambios ocurridos en Google deben conciliarse antes del corte definitivo. La consolidación diaria de las 18:30, hora de Ecuador, debe terminar correctamente antes de obtener ese delta.
