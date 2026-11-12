# Cargar la preparación de abiertos en MySQL para revisión

Cuando la copia SQL esté confirmada, continuar con [la proyección al núcleo operativo](PLAN_OPERATIVO_ABIERTOS.md), que reutiliza el mismo ZIP y la copia existente sin repetir la carga.

El análisis del corte `99d4b7ff-2f53-4f25-b740-23bf1f371c29` confirmó 12.362 líneas de los 12 inventarios seleccionados y 147 líneas conservadas del inventario que pasó a Entregado. Las cantidades de las planillas seleccionadas caben exactamente en la precisión prevista. Se conservan cuatro filas con C3 sin C2, un archivo con 12 códigos operativos y otro con 630 líneas sin código. También se conservan 984 filas auxiliares sin convertirlas en existencias. Estos casos no se corrigen inventando datos.

## Alcance de esta carga

Esta etapa **sí escribe en MySQL**, únicamente en dos tablas nuevas de revisión dentro de `centromando_ims_ensayo`:

- `ims_abiertos_copia`: identidad del paquete, manifiesto y esquemas de origen. La columna `activa` permanece en cero mediante una restricción SQL.
- `ims_abiertos_copia_fila`: cada producto o fila auxiliar con su ámbito, procedencia, JSON completo y SHA-256. Los ceros, vacíos, SKU repetidos, notas, tipos, formatos y valores decimales permanecen en el contenido original. No se convierten a valores flotantes.

El ámbito distingue `SELECCION_ACTUAL` de `FUERA_SELECCION_CONSERVADO`. La copia no crea inventarios en `ims_op_*` o `ims_nat_*`, no activa usuarios, asigna permisos o publica KPI. La web conserva sus inventarios operativos actuales. El histórico y el inventario nativo ya creado desde ERP no se sobrescriben con esta carga.

El cargador usa la cuenta existente **`ims_cm_migracion`**, con una conexión, y admite únicamente la base propia de ensayo; las bases sintéticas están permitidas solo para pruebas. Rechaza root, el perfil operativo y bases de otras aplicaciones antes de crear tablas. No cambia usuarios, permisos, límites globales de MySQL, Apache, servicios, puertos o carpetas de otros proyectos.

## Ejecutar con el ZIP y la preparación existentes

Desde la terminal SSH (`enicolalde@apps`), hacer `git fetch origin migracion/mysql-candidata-20261104` y pasar la revisión publicada y el `destino_privado` del ZIP usado para preparar los datos:

```bash
git show "$imsRevision:enterprise/deploy/copiar_abiertos_mysql.sh" |
  bash -s -- "$imsRevision" "$imsZip"
```

El lanzador prepara un worktree propio y sus dependencias bloqueadas, sin cambiar la versión del servicio. Busca el paquete bajo `PREPARACION_ABIERTOS_<id>/datos`, vinculándolo al ZIP por ruta y SHA-256. Paquetes idénticos se reconocen como el mismo; si encuentra preparaciones diferentes para ese ZIP, detiene antes de conectar a SQL. No elige una por la fecha ni importa archivos ajenos.

Lee la configuración privada existente `config/migracion.env` y la entrega al proceso Node por entrada estándar. No introducir claves en comandos ni subir ese archivo al chat. Los registros muestran códigos controlados; no repiten SQL, valores de filas o mensajes del controlador que puedan contener datos.

## Comprobaciones y reintentos

Antes de conectar se comprueban permisos, archivos regulares sin enlaces, hashes, procedencia, referencias únicas y que ningún candidato esté aprobado para importación operativa. Los SKU o números de línea repetidos no se usan como clave única. La identidad de cada registro sigue la fila física dentro de su copia y ámbito.

La carga se ejecuta en una transacción y en lotes pequeños. Se lee de vuelta **cada fila** y se compara con el archivo preparado, no solo con el número de registros. Se vuelven a comprobar los hashes de entrada antes de confirmar. Un fallo revierte los datos de ese paquete; las tablas de preparación pueden permanecer creadas, sin afectar el núcleo operativo. Una respuesta perdida de COMMIT se recupera repitiendo el mismo comando: verifica íntegramente la copia existente y devuelve `ya_copiada: true`. Una copia SQL alterada se rechaza; el cargador no la repara ni altera una tabla incompatible para forzarla.

El resultado se guarda en `COPIA_ABIERTOS_MYSQL_<id>/resumen_copia_abiertos_mysql_para_compartir.json`. Compartir **solo ese resumen**. El resultado esperado distingue `copia_revision_mysql: true` de `datos_operativos_importados: false`. No significa que los abiertos estén habilitados para captura en la web.

## Pendientes del corte operativo

Queda planificar la interpretación de códigos múltiples y vacíos, conservar las etapas originales de las cuatro filas observadas y completar los datos del maestro. En la copia analizada solo una de sus cinco hojas estaba completa: Panel y Usuarios todavía no tenían fragmentos copiados, y una matriz del cronograma estaba parcial. No se activan cuentas tomando esa copia incompleta como si fuera definitiva.

Google sigue siendo el sistema vigente. La jornada termina a las **17:30, hora de Ecuador**, y `dash_consolidarAuditoria` comienza diariamente a las **18:30**. El delta final se obtendrá después de confirmar la ejecución correcta del trigger, incluyendo fuentes abiertas, maestro, consolidado y archivos que pasaron a Entregado. La activación operativa requiere conciliar ese delta y verificar la aplicación y sus accesos; no tiene una fecha de publicación confirmada por esta carga.
