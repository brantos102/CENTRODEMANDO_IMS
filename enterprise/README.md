# Preparación de la migración de Centro de Mando a MySQL

Actualización del 11 de noviembre: [recuperar el corte de abiertos](RECUPERAR_ABIERTOS.md) conserva el plan y los fragmentos anteriores, recaptura fuentes que cambiaron y admite el maestro de 385/384 columnas con fragmentos pequeños. No activa servicios ni importa datos.

Entrega siguiente: [cantidades legibles y corte privado de inventarios abiertos](CORTE_ABIERTOS_Y_FORMATOS.md). El formato elimina ceros de relleno y conserva decimales exactos; el actualizador concilia el stock persistido antes del cambio. El usuario eligió trasladar también los abiertos de Google: se incluye el exportador privado y envío/validación de su corte actual, sin declararlo importado ni cerrar todavía la migración completa.

Nueva entrega: [creación nativa desde consultas ERP](CREACION_DESDE_ERP.md), con stock completo revisado, varias cuentas/clientes, procedencia por línea y recuperación de confirmaciones. Requiere su preparación aditiva y activación propias; la consulta ERP ya verificada en el servidor continúa siendo la versión vigente hasta aplicar esta entrega.

Actualización del 10 de noviembre: [consulta ERP integrada en la web candidata](ERP_CONSULTA_WEB.md), con cuentas múltiples, filtros SKU/variantes y posiciones de toda la sede. Reutiliza sesión y permisos nativos; mantiene la creación ERP deshabilitada y el histórico protegido. Su activación corporativa requiere el actualizador de esa entrega; preparar el registro de credenciales no activa la pantalla.

Estado al 9 de noviembre de 2026: **piloto de consulta desplegado en el servidor empresarial**, no aplicación operativa terminada. El usuario confirmó el acceso HTTPS y login. La operación actual sigue en Apps Script. Este directorio está excluido por `.claspignore` y no se publica mediante clasp.

Ensayo corporativo confirmado por las salidas del usuario: MySQL 8.0.46, base exclusiva `centromando_ims_ensayo`, resguardo de 19 hojas/287.027 filas, 351 archivos físicos/352 conteos/97.822 líneas nativas y lector con 352 permisos. Los originales de INVENTARIOS (102.033 líneas) y REGISTRO (65.773) permanecen conservados, incluidas las incidencias. No se publica KPI ni se utiliza Supabase como fuente.

La nueva [consulta de resumen y actualización por versiones](deploy/VERSIONES_PILOTO.md) agrega cifras autorizadas y filtros, separa el código que atiende al lector del repositorio de trabajo y habilita inicio automático solo del piloto tras validar. No cambiar archivos en uso con checkout/pull: preparar la revisión en un worktree privado. El cambio de versión reinicia brevemente solo el piloto; Apache y los otros aplicativos conservan sus configuraciones.

Preparación inicial del [piloto de solo lectura](deploy/PILOTO_LECTURA.md): lector independiente limitado al plan trasladado y usuario MySQL de consulta. Estos pasos ya fueron ejecutados por el usuario; no repetir los inicializadores para actualizar el código.

El publicador HTTPS inicial instala solo sus cuatro rutas nuevas de Apache y aplica una recarga gradual con comprobaciones de sintaxis, certificado, sesión y conservación de configuraciones anteriores. El usuario ya confirmó el acceso desde su navegador. No sustituye la operación actual ni publica KPI.

Actualización del 6 de noviembre de 2026: núcleo de conteo, sesiones/API y pantallas base de acceso, selección y captura implementados en la candidata. Se probaron contra MySQL **8.0.46 real** local; no se conectó al servidor empresarial. Contratos en [CONTEO_TRANSACCIONAL.md](CONTEO_TRANSACCIONAL.md), [AUTENTICACION_API.md](AUTENTICACION_API.md) y [pantallas y evidencia](../docs/INTERFAZ_CANDIDATA_20261106.md). Arranque deshabilitado por defecto. Faltan identidades/datos reales migrados y el resto de flujos operativos antes de sustituir la aplicación.

Fuente autorizada: el Google Sheets vigente de Centro de Mando, con INVENTARIOS como base del inventario. Supabase está desactualizado y no se usa como origen ni necesita actualizarse.

También está disponible el [diagnóstico y traslado del histórico](TRASLADO_HISTORICO.md): prepara únicamente archivos Entregado íntegros, conserva el catálogo completo y las incidencias, y permite ensayar su carga a entidades internas sin crear cuentas ni permisos. El diagnóstico no activa la API ni modifica el piloto. En PowerShell del PC, desde `enterprise`, ejecutar `& '.\tools\diagnosticar-corte.ps1'` para analizar una descarga reciente sin conectarse a ninguna base de datos.

Las políticas explícitas de cliente obligatorio del panel y de cantidades con separador de miles confirmado generan planes nuevos con versión y controles propios. Incluyen una auditoría de formatos de todas las filas R/V/W/X. No cambian los valores del corte ni reinterpretan planes anteriores; consultar [las reglas y controles](TRASLADO_HISTORICO.md).

La política v4 también permite separar conteos históricos confirmados que comparten un archivo físico. Mantiene la procedencia común, conserva cada código y distingue en el resumen archivos físicos de conteos lógicos. Su registro de aportes es aditivo y protege los orígenes ya importados mediante políticas anteriores. No cambia el código publicado en Apps Script ni las columnas de Power BI.

## Qué conserva esta etapa

- El XLSX original completo, su SHA-256 y estilos; valores originales de todas las hojas, incluidos resultados guardados y texto de fórmulas, sin ejecutarlas.
- Todas las filas y sus posiciones en el corte; códigos, SKU y series como texto, cantidades decimales sin conversión a coma flotante y ceros distintos de vacío.
- Notas humanas y marcadores `IMS_ORIGEN_DRIVE`, sin crear columnas públicas.
- Los 30 encabezados de INVENTARIOS y los 15 de REGISTRO. Rechaza datos fuera de ese contrato o filas sin procedencia.
- La multiplicidad original: no deduplica por SKU, código ni número de línea.
- Las notas sin celdas de valor se guardan en metadatos. Otros objetos del libro, gráficos y comentarios especiales siguen disponibles en el XLSX original.

El paquete es privado, incluye hojas administrativas como USUARIOS y puede contener información de acceso. No subirlo al repositorio ni al chat. Guardarlo en una carpeta propia con acceso restringido y trasladarlo por SSH al servidor; no dentro del directorio publicado por Apache. En Linux se crean directorios 0700 y archivos 0600. No modifica el archivo fuente.

## Validación sin base de datos

En Linux, desde esta candidata y en un directorio propio de Centro de Mando:

```bash
python3 enterprise/tools/exportar_snapshot.py /ruta/descarga_actual.xlsx /ruta/privada/corte_nuevo
node enterprise/tools/importar-snapshot.mjs --validar /ruta/privada/corte_nuevo
```

No sobrescribe un corte existente. Verifica hashes de archivo, estilos y hojas; filas, contratos y aportes por origen. No accede a Google ni necesita credenciales. Es una extracción de un corte temporal; para el cambio final se necesita conciliar el delta posterior.

## Importación de staging: verificada en MySQL local de ensayo

La importación escribe solo `ims_snapshot`, `ims_snapshot_hoja` e `ims_snapshot_fila` en una base nueva y exclusiva. **No son las tablas finales de operación ni las vistas Power BI.** No activa una generación ni cambia las conexiones de usuarios o jefaturas. No utiliza ninguna base de IV_ITSANET, RRHH o Data Sync.

Antes de ejecutarla deben existir la base y el usuario exclusivos, respaldos, capacidad de disco y una prueba en una base de ensayo. El nombre debe ser `centromando_ims` o `centromando_ims_*`. Rechaza nombres ajenos y usuario root. El usuario de migración recibe permisos únicamente en esa base; el usuario de la futura aplicación tendrá permisos reducidos. No modificar parámetros globales del MySQL compartido.

El controlador está fijado en **mysql2 3.24.6**, con package-lock.json reproducible. La versión inicial 3.11.5 se sustituyó tras identificar los avisos GHSA-3f6p-5ww8-9rcr y GHSA-rgwj-5xj2-c3m3; npm audit no reportó vulnerabilidades conocidas en el árbol actualizado del módulo. Se actualizó esta dependencia dentro de su versión mayor 3, sin ejecutar npm audit fix --force.

El 4 de noviembre se importó un corte de referencia de 19 hojas/277.731 filas en MySQL 8.0.46 local, con lectura y verificación de hashes antes del commit; se repitió para comprobar que no añade otra copia. El ensayo corporativo posterior y su corte distinto están resumidos al inicio de este documento. La conciliación del delta al corte final continúa pendiente.

Con esa prueba y configuración resueltas, el comando previsto es:

```bash
cd enterprise
npm ci --ignore-scripts
# Configurar MYSQL_* en un archivo .env privado a partir de .env.example.
# No pegar contraseñas en comandos o mensajes. La plantilla no contiene claves.
node --env-file=.env tools/importar-snapshot.mjs --importar /ruta/privada/corte_nuevo
```

El importador valida todos los archivos antes de conectarse. Usa parámetros SQL, lotes de hasta 250 filas/512 KiB, una conexión y una transacción para el corte. Verifica el contenido leído de MySQL contra el hash de cada hoja antes del COMMIT. Si falla una escritura, revierte; si el corte ya existe, comprueba sus hashes antes de declararlo importado y no añade otra copia. No hace DELETE ni sustituye una copia diferente. La identidad del reintento es SHA-256 del XLSX + hoja + fila de ese corte inmutable; no se reutiliza como identidad de una fila editable del futuro aplicativo.

## Destino de infraestructura propuesto

La [preparación aislada del ensayo](deploy/ENSAYO_SERVIDOR.md) permite crear la carpeta privada, la base `centromando_ims_ensayo` y una cuenta de migración limitada. Rechaza recursos existentes y no inicia servicios ni abre puertos. No ejecutarla con la cuenta root del sistema; requiere la copia de código y la ruta exclusiva previstas.

- Linux, Node 22.23.3 y MySQL 8.0.46 existentes.
- Carpeta propia propuesta: `/home/enicolalde/bryan/centro_mando_ims`.
- Piloto: `127.0.0.1:3003`, arranque confirmado por el usuario con PID/puerto propios.
- URL del lector: `https://apps.flexnetuio.com:8445/`, acceso confirmado por el usuario. Las siguientes actualizaciones conservan estos puertos.
- Conservar IV_ITSANET en 8443→3002, RRHH en 8444→8010 y Data Sync en 80/443→8080. No reutilizar esos vhosts ni los puertos 3000, 3001 y 8000 indicados como reservados.

El servicio systemd y vhost propios ya se entregaron y el usuario confirmó su arranque. La API exige habilitación expresa y el piloto permanece de solo lectura. Faltan gestión/migración del resto de usuarios, servicios de negocio restantes, WMS, notificaciones, indicadores y restantes pantallas antes de sustituir la operación.

## Validación local realizada

- Aplicación candidata: 95 pruebas aprobadas, incluidas las 73 previas y 22 nuevas de integración/encabezados y selección de estado.
- Exportador: 5 pruebas Python aprobadas.
- Importador/protocolo: 9 pruebas Node aprobadas con conexión simulada.
- Política de inventario: 2 pruebas Node aprobadas.
- Corte real «CONTEOS CICLICOS ITSANET (2).xlsx»: 19 hojas y 277.731 filas de copia bruta, incluidas cabeceras y registros auxiliares; INVENTARIOS 100.835 y REGISTRO 64.486 filas de datos. Extracción y validación de hashes aprobadas, sin base modificada.
- Núcleo de conteo: 6 pruebas de dominio y 12 de integración aprobadas contra MySQL 8.0.46 real; consulta el alcance en CONTEO_TRANSACCIONAL.md.
- Driver instalado y DDL 001/002 comprobados en el contenedor local. Importación completa y reintento del corte real verificados sin aplicación activada.
- Interfaz/API: 29 pruebas unitarias, 27 de integración MySQL y 9 de navegador aprobadas, con datos sintéticos. Consulte docs/INTERFAZ_CANDIDATA_20261106.md para alcance y runtimes.
- Histórico candidato: diagnóstico y traslado transaccional del subconjunto íntegro implementados; evidencia del ensayo en docs/VALIDACION_TRASLADO_20261106.json. No habilita usuarios ni publica KPI.
- Pendiente: completar flujos WMS, gestión/migración de usuarios, escritura masiva/series/ajustes, resolución de incidencias, extracción de planillas hijas pendientes, conciliación del delta, indicadores acordados, EAN, aceptación en servidor por roles/sede y corte final. WTW queda aplazado. No publicar estos resultados como aplicación migrada o producción ya validada.

Pruebas reproducibles:

```bash
node --test tests/*.test.cjs
python3 -m unittest discover -s enterprise/tests -p '*_test.py' -v
node --test enterprise/tests/*.test.mjs
```

La regla de consolidación y el modelo operativo/histórico propuesto están en `docs/ARQUITECTURA_OPERACION_HISTORICOS_MYSQL_20261029.md`. Los inventarios en curso se guardarán sin participar en la publicación final. El maestro no sustituye la extracción de las planillas hijas.

La [operación nativa de ensayo](OPERACION_NATIVA.md) incorpora creación, stock, permisos por cliente, conteo, ajustes, validación y entrega, con indicadores de referencia WMS V124. Su activación es explícita y mantiene protegido el histórico; todavía no representa el corte definitivo de Google.

La [captura de series y planilla alterna](SERIES_HALLAZGOS.md) mantiene una unidad por serie, permisos por cliente, advertencias de similitud y recuperación transaccional sin duplicados.

El [traslado ERP privado](TRASLADO_ERP_PRIVADO.md) recupera las credenciales ausentes en los ZIP de código y prepara un diagnóstico sin imprimir claves, asociar clientes automáticamente ni reiniciar el aplicativo.
