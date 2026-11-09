# Actualizaciones del piloto con versiones separadas

El usuario confirmó el acceso HTTPS y el login del lector el 9 de noviembre de
2026. La consulta del histórico funciona; Google continúa siendo la operación
vigente. Este procedimiento actualiza solo el piloto, mantiene 3003/8445 y no
cambia datos, permisos MySQL ni configuración Apache.

## Código que atiende a los usuarios

No hacer `git checkout` ni `git pull` en el directorio que está ejecutando el
servicio: Node puede conservar módulos de una versión y servir HTML/JS nuevos.
Se conserva `/home/enicolalde/bryan/centro_mando_ims` como repositorio de origen y
respaldo de la primera versión. Un `git fetch` actualiza objetos/referencias, sin
modificar sus archivos. Preparar un worktree nuevo y privado para cada revisión:

```bash
git worktree add --detach \
  /home/enicolalde/bryan/centro_mando_ims_datos/preparaciones/REVISION/codigo \
  REVISION
```

Usar el SHA completo aprobado, comprobar su pertenencia a la candidata y mantener
umask 077. No adoptar rutas enlazadas o repositorios ajenos. El actualizador exige
que su ruta, HEAD y árbol limpio correspondan exactamente a esa preparación.

Desde esa copia se ejecuta:

```bash
sudo -v
python3 /home/enicolalde/bryan/centro_mando_ims_datos/preparaciones/REVISION/codigo/enterprise/deploy/actualizar_piloto.py \
  --revision REVISION --conteos-esperados 352 --filas-esperadas 97822
```

Las cantidades son las del subconjunto ya trasladado, no del maestro completo.
La copia completa original y las incidencias siguen en el resguardo.

## Qué hace

1. Verifica entorno privado, unidad propia y HTTPS de la versión actual.
2. Extrae archivos `enterprise/` directamente de objetos Git en
   `centro_mando_ims_datos/releases/REVISION`. Rechaza symlinks del repositorio y no
   copia archivos locales sin seguimiento, credenciales ni `node_modules` ajenos.
3. Instala dependencias fijadas mediante `npm ci --omit=dev --ignore-scripts`, con
   caché propia en `centro_mando_ims_datos/cache/npm`. No cambia Node/npm globales.
   Guarda hashes de las fuentes; un reintento verifica sin sobrescribir fuentes.
4. Valida módulos y nueva unidad. Guarda una copia de la anterior identificada por
   SHA-256. Cambia únicamente su WorkingDirectory/montaje a la versión preparada y
   añade `IMS_RELEASE` para identificar el proceso por `/salud`.
5. Reemplaza atómicamente solo `centro-mando-ims-ensayo.service`, comprobando antes
   el hash de su contenido. Ejecuta `daemon-reload` y reinicia **solo el piloto**.
   Puede haber una breve interrupción de esa consulta mientras reinicia.
6. Comprueba por HTTPS revisión, sesión, 352 conteos, resumen de 97.822 líneas,
   búsqueda, bloqueo de captura y logout. No crea tablas ni modifica inventarios.
7. Tras validar, crea solo su enlace en `multi-user.target.wants` y comprueba
   `is-enabled`: el lector queda con inicio automático después de reiniciar.

No habilita otros servicios, no reinicia MySQL/Apache/IV_ITSANET/RRHH/Data Sync ni
abre puertos adicionales. Sus ayudantes privilegiados solo operan la unidad
propia y su enlace. Se conservan versiones anteriores y un estado privado con sus
referencias, sin publicar contraseñas ni cookies.

Si falla la preparación de dependencias, la versión en uso sigue funcionando.
Si falla después de reemplazar la unidad, intenta restaurar la anterior y reiniciar
solo el piloto. Vuelve a leer el archivo si perdió la respuesta de una escritura,
para no declarar recuperado un cambio incierto. No sobrescribe cambios externos.
Un fallo de recuperación requiere revisar el estado del servicio propio.

Las carpetas de versión contienen solo código y dependencias. No editarlas para
desarrollar: una fuente modificada se rechaza. Para la siguiente actualización,
preparar otro SHA/worktree. No repetir los inicializadores de base, cuentas o
publicación HTTPS para actualizar el código.

## Resumen y filtros de esta versión

`GET /api/resumen` exige sesión y cuenta solo inventarios/clientes/líneas visibles
por los permisos del actor activo. Sus dos consultas usan una transacción de
lectura con snapshot consistente. Cuenta inventarios distintos por ID: no fusiona
archivos físicos con el mismo código ni duplica un inventario multicliente en el
total. Las líneas no se deduplican. Los totales se transportan como enteros en texto.

`GET /api/inventarios` permite `buscar`, `cliente` y `sede`, además del cursor y
límite anteriores. Busca código/nombre autorizado y solo acepta UIO/GYE o UUID de
cliente. `GET /api/inventarios/:id/lineas` permite `buscar` sobre producto,
descripción, posición, serie y lote. Escapa `%`, `_` y `!` como texto literal y
mantiene los parámetros SQL, permisos por cliente y paginación de hasta 100 filas.

La pantalla muestra cifras del **histórico autorizado**, consulta por cliente y
búsquedas. No calcula todavía cumplimiento anual, vencidos, calidad ni totales de
unidades del panel original. La hora mostrada corresponde a la consulta en
America/Guayaquil, no a una sincronización nueva con Google. Una respuesta
incompleta conserva la última consulta válida y su hora; cambiar usuario limpia
el resumen y los selectores. Los flujos operativos restantes siguen pendientes.
