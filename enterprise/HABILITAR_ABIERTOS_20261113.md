# Habilitar los conteos del corte elegido

El usuario confirmó en MySQL la copia `0f35ea9a0565483d03bd66519ba6cb3a144c5c8e4fdbbe386e3468237e1fd75b`, corte `07e58bf9-6fe1-4bf0-b93e-d1a89cb66764`, con 12.362 productos y 984 filas auxiliares. El plan `2c00275f02bde5699a2c0b121d6a8a1c633b16002a83d8494fcf942b201d29ba` confirmó cero bloqueos estructurales, 22 conteos operativos (11.732 líneas) y un archivo pendiente de iniciar (630 líneas). No se pide otro corte ni delta de Google.

## Ejecutar la revisión publicada

En la terminal SSH `enicolalde@apps`, usar el bloque publicado en el chat. El lanzador `enterprise/deploy/habilitar_corte_elegido.sh` recibe revisión Git, ZIP privado existente y hash del plan. Antes de escribir verifica host, usuario, rutas sin enlaces, permisos, copia, hashes y la preparación aislada del código. Ejecuta las pruebas antes de importar.

La importación usa la cuenta existente `ims_cm_migracion` y las tablas operativas ya instaladas en `centromando_ims_ensayo`. Verifica nuevamente la copia SQL completa y el plan exacto elegido. No crea tablas ni amplía privilegios. Rechaza root, otras aplicaciones, orígenes ya importados e identidades en conflicto.

Una sola transacción crea los 22 conteos, sus clientes, detalles y líneas nativas; conserva C1/C2/C3 exactos, sus vacíos y ceros, ajustes, notas, ubicaciones y cada fila independiente. C3 sin C2 queda como estaba: no inventa etapas anteriores. Relee y compara las líneas antes de activar el stock. Los códigos/fechas separados siguen como conteos distintos del mismo origen. La fecha A2 elegida no reescribe fechas de las líneas originales de la copia SQL.

La cuenta de revisión/administración que ya existe recibe supervisión sobre estos conteos. No se crean usuarios, cambian contraseñas ni se importan automáticamente los permisos de la hoja Usuarios, que no fue capturada. Para dar acceso a operadores, usar la administración de cuentas independiente y asignar rol por cliente/inventario. El histórico conserva sus permisos de consulta.

## El pendiente de 630 productos

Sus líneas originales y proyecciones se conservan en un evento `pendiente_legado`, con código, inicio y capturas vacíos. No se crea un inventario con código o fecha ficticios. La sección **Inventarios pendientes de iniciar** en `/operacion` permite elegirlo e indicar código y fecha al comenzar. Entonces crea el inventario con ese mismo stock y C1/C2/C3 vacíos.

Solo ADMIN de su sede ve o inicia pendientes. Un bloqueo nombrado propio serializa los inicios concurrentes; no requiere conceder UPDATE sobre evidencias de auditoría. El identificador de la operación permite recuperar confirmaciones sin otra copia. El registro original permanece inmutable después de iniciar.

## Reintento y aplicación

El evento `migracion_abiertos` vincula corte, copia y plan a los conteos creados. Si se pierde COMMIT, repetir exactamente el mismo bloque recupera la confirmación. Si ya se registraron capturas nuevas en los conteos importados, el reintento las conserva: no restaura cantidades antiguas. Un fallo previo a COMMIT revierte conteos, líneas, permisos y el pendiente conjuntamente.

Después se publica la revisión mediante el actualizador existente: conserva una versión anterior y reinicia únicamente `centro-mando-ims-ensayo.service`. Comprueba HTTPS, login/logout, histórico de 352 conteos y 97.822 líneas, permisos y las 24 conexiones ERP configuradas. No modifica Apache, puertos, MySQL ni otros servicios. `sudo` se usa para esa actualización del servicio propio; no para importar las capturas.

Si la actualización web falla después de confirmar SQL, los datos ya importados no se borran; repetir el bloque conserva las capturas y vuelve a intentar la actualización propia. No eliminar recursos ni cambiar hashes para forzar una confirmación.

## Resultado y uso

La importación guarda `IMPORTACION_ABIERTOS_<id>/resumen_importacion_abiertos_para_compartir.json`. El resultado esperado incluye `datos_operativos_importados: true`, `conteos_habilitados: 22`, `lineas_habilitadas: 11732` y `lineas_pendientes_de_iniciar: 630`. Después debe terminar correctamente la comprobación HTTPS de la revisión publicada.

Con ambas confirmaciones, continuar los conteos habilitados en `https://apps.flexnetuio.com:8445/` y administrar estados/pendientes en `/operacion`. No seguir capturando esas mismas operaciones en Google: la base elegida quedó fijada al corte, sin sincronización de escrituras posteriores. Los originales de Google y todos los ZIP anteriores se conservan como respaldo.

El maestro parcial, el REGISTRO global no capturado y los datos de otras hojas permanecen en los respaldos disponibles; esta entrega no los declara completos ni inventa sus filas. Los 984 auxiliares siguen conservados en la copia MySQL y no se convierten en productos, series físicas o hallazgos nuevos. El traslado de capturas numéricas no atribuye auditorías antiguas a usuarios nuevos. No publica KPI ni sustituye el análisis oficial ITSANET IMS/WMS.
