# Preparación de abiertos mientras Google sigue operando

Una vez revisado el resumen de preparación, continuar con [la copia de revisión en MySQL](COPIA_ABIERTOS_MYSQL.md), sin repetir la extracción ni subir otro ZIP. Esa carga conserva los candidatos y sus observaciones; no los activa como inventarios operativos.

El usuario confirmó que los operadores continúan registrando inventarios. Su jornada termina a las **17:30, hora de Ecuador**, y el trigger **`dash_consolidarAuditoria`** se ejecuta diariamente a las **18:30**. Un cambio de versión durante las copias es esperable en ese contexto. No debe eliminarse la verificación ni declararse estable una fuente que cambió, pero se puede preparar y revisar la migración con la copia ya recibida, sin esperar una nueva extracción perfecta durante la jornada.

## Qué hace este paso

`preparar_traslado_abiertos.py` primero verifica el ZIP y su respaldo anterior. Exige que no queden fuentes pendientes, pero admite fuentes en revisión para **preparar datos**, conservando sus marcas. No ejecuta el plan operativo ni escribe en MySQL. Recorre las planillas de conteo con sus encabezados reales y genera en un directorio privado:

- `lineas_candidatas_NO_IMPORTAR.jsonl`: cada línea con su archivo físico, hoja, fila, zona horaria, SKU, código operativo original, referencia del cliente del panel y fila original completa con notas, formatos, fórmulas como texto y valores tipados. No usa SKU o número de línea como identidad única. Cada candidato indica `aprobado_para_importar: false`.
- `filas_auxiliares_NO_IMPORTAR.jsonl`: filas con notas/datos sin SKU o sin una cabecera inequívoca, sin inventar existencias ni descartarlas.
- `esquemas_NO_COMPARTIR.json`: encabezados originales e índices de campos para planillas, catálogos, usuarios, cronograma, EAN y ubicaciones. Las filas de esos catálogos siguen conservadas en el ZIP; este paso no las importa ni activa cuentas.
- `preparacion_NO_IMPORTAR.json`: procedencia y hashes de los archivos generados para comprobar su integridad antes de un futuro traslado.
- `resumen_preparacion_abiertos_para_compartir.json`: solo conteos, índices de columnas, tipos de fuente y observaciones controladas. No muestra clientes, SKU, ID de Drive, correos o contenido de filas.

Las líneas de inventarios que quedaron fuera de selección —incluido el de la fila 370 que pasó a Entregado— se preparan **aparte**, con su corte anterior y estado de captura originales. No se suman a los abiertos ni se dan por definitivas cuando la copia anterior estaba en revisión. El ZIP y sus fragmentos no se modifican; también se comprueba su hash después de preparar los datos.

Las cantidades numéricas se representan exactamente con nueve decimales, comprobando DECIMAL(30,9), sin coma flotante ni redondeo. Cero y ausencia de captura permanecen distintos. Los textos con separadores (`2,000`, `2.000`, etc.) se marcan para una regla explícita por origen; no se adivina si son miles o decimales. Las fracciones numéricas reales se conservan. Negativos, etapas sin predecesora, códigos múltiples o cabeceras ambiguas se señalan sin completar, renombrar, combinar o borrar datos. Estas observaciones son casos para revisión; no declaran perdido o inválido todo un inventario.

## Ejecutar en el servidor con el ZIP existente

Desde la terminal SSH de VS Code (`enicolalde@apps`), después de `git fetch origin migracion/mysql-candidata-20261104`, usar la revisión completa publicada:

```bash
git show "$imsRevision:enterprise/deploy/revalidar_abiertos.sh" |
  bash -s -- "$imsRevision" "$imsZip" --preparar
```

`imsZip` debe ser el `destino_privado` exacto del último resumen enviado, bajo la entrada propia. El lanzador comprueba servidor, usuario, revisión, permisos, rutas y árbol limpio. Prepara un worktree privado sin cambiar el checkout activo, y crea `PREPARACION_ABIERTOS_<id>/datos`. No instala dependencias, lee credenciales MySQL/ERP, llama a Google, cambia Apache, abre puertos o reinicia servicios.

Muestra el JSON y la ruta `PREPARACION_ABIERTOS_<id>/resumen_preparacion_abiertos_para_compartir.json`. Compartir **solo ese resumen**. Conservar los candidatos, esquemas y plan de preparación en el servidor. No volver a subir el ZIP ni editar Apps Script para este análisis.

## Secuencia para el corte definitivo

1. Preparar el modelo y comprobar la importación con estas copias mientras Google permanece como sistema vigente. Las capturas nativas ya existentes y el histórico trasladado no se sobrescriben con los candidatos.
2. Cuando la aplicación y la importación estén listas para el corte, esperar el fin de la jornada de captura a las 17:30. Mantener el trigger vigente durante esta fase de preparación.
3. A las 18:30 se inicia `dash_consolidarAuditoria`. Comprobar en el registro de Apps Script que terminó correctamente; no asumir su finalización por haber llegado esa hora.
4. Obtener el delta final: fuentes abiertas que cambiaron, novedades del maestro y del consolidado posterior al trigger, y archivos que pasaron a Entregado. Conciliar capturas, notas, códigos, clientes y totales contra la copia de preparación antes del traslado final. Este código todavía no obtiene ese delta ni certifica su integridad.
5. Verificar accesos, permisos, conteos y resultados de referencia WMS en MySQL y la web, y coordinar el cambio de sistema de captura. La preparación no activa ni publica automáticamente la aplicación.

No se ha fijado una fecha u hora de activación. `requiere_delta_final: true`, `corte_final_aprobado: false` y `datos_importados: false` son deliberados. Este paso avanza la preparación de datos; no representa por sí solo la migración operativa completa.
