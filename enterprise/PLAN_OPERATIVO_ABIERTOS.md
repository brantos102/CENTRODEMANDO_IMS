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

Las fechas tipadas se convierten al día de la zona horaria original. Un texto ISO válido se conserva como fecha; un texto ambiguo o una fecha ausente requieren revisión. La fecha no se deduce de `DDMMAA_CLIENTE`. Los estados reconocidos son En Proceso, En Validación, Entregado y Cancelado; otros textos permanecen retenidos. Solo Entregado exacto es elegible para la consolidación, y este plan no publica KPI.

Los códigos múltiples o ausentes, fechas de inicio distintas, planillas parciales, series repetidas o series cuyo stock no coincide con una unidad se señalan para revisión del archivo entero. No se eliminan sus líneas. La numeración propuesta es consecutiva dentro del archivo para el núcleo nativo, y el número original se conserva por separado. SKU y números originales repetidos no son identidad única.

`inventarios_sin_bloqueos_estructurales` indica que los campos de la copia pueden representarse en el núcleo operativo; **no significa que sus datos estén actualizados ni habilitados para captura**. Todas las fuentes conservan `requiere_delta_final: true` y `listo_para_activar: false`. El maestro todavía incompleto, las cuentas/permisos y los cambios ocurridos en Google deben conciliarse antes del corte definitivo. La consolidación diaria de las 18:30, hora de Ecuador, debe terminar correctamente antes de obtener ese delta.
