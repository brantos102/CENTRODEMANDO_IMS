# Operación nativa de ensayo

Esta fase permite ensayar inventarios nuevos en MySQL: crear un borrador con uno o varios clientes, cargar stock, asignar usuarios, capturar C1/C2/C3, ajustar, validar y entregar. El histórico trasladado permanece consultable y protegido. Google sigue atendiendo los inventarios abiertos del sistema vigente. Esta fase no autoriza el corte definitivo.

## Instalación sobre el piloto actual

Ejecutar desde una preparación Git limpia y fijada a una revisión aprobada, bajo `centro_mando_ims_datos/preparaciones/<revision>/codigo`:

```bash
bash enterprise/deploy/preparar_y_activar_operacion.sh
```

El script instala las dependencias de esa preparación, ejecuta las pruebas unitarias y prepara las tablas aditivas 007, once triggers y una cuenta SQL propia. Después prepara una versión inmutable y actualiza solamente `centro-mando-ims-ensayo.service`. Conserva `127.0.0.1:3003`, HTTPS 8445 y los límites del servicio. No modifica Apache, sus certificados, los proyectos vecinos ni sus servicios. No reinicia MySQL ni modifica parámetros globales.

La cuenta inicial del piloto recibe administración nativa para UIO/GYE. Mantiene su contraseña y sus permisos históricos de consulta. No se consulta ni modifica Recursos Humanos. Las contraseñas nuevas se generan/asignan de forma independiente; nunca se importan claves/PIN de Sheets.

Antes de reiniciar se verifican los 352 conteos y 97.822 líneas históricos. Después se comprueban HTTPS, sesión, listado, resumen, bloqueo de captura histórica y logout. Si falla la comprobación se intenta restaurar y verificar la unidad anterior. Se conservan los datos y los archivos de diagnóstico; no se retiran tablas ni se borran inventarios para revertir una actualización.

## Recorrido del ensayo

1. Iniciar sesión con la cuenta inicial y abrir **Operación** en el panel Inventarios, o `/operacion`.
2. Crear un código literal `DDMMAA_CLIENTE`, sede, fecha y clientes del catálogo. La fecha no se infiere del nombre. Se permite repetir un código en inventarios independientes.
3. Descargar la plantilla CSV y preparar el stock. `sku` y `depot` son obligatorios; `cliente_id` identifica cada cliente en una carga múltiple. Las filas repetidas permanecen independientes. La carga directa necesita stock previamente validado; no aplica reglas de agrupación silenciosas a un CSV cualquiera.
4. Elegir expresamente punto decimal, coma decimal o coma de miles. Todas las cantidades se conservan como texto decimal exacto de hasta 21 enteros y nueve decimales. Una serie física equivale a una unidad; `0` y `N/A` se consideran ausencia de serie.
5. Cargar y revisar número de líneas y suma. Una interrupción conserva el borrador: recuperar la confirmación y volver a cargar el mismo archivo comprueba cada número de fila sin duplicarlo. Cambiar una fila existente se rechaza.
6. Activar el stock después de conciliar ambos totales. A partir de entonces no se agregan ni sobrescriben líneas de stock.
7. Crear cuentas independientes y asignar cada cliente/inventario: OPERADOR cuenta; AUDITOR y LECTOR consultan; SUPERVISOR administra el inventario. REVOCADO retira su permiso. Ningún rol se acepta en el cuerpo de una captura. Para cambiar el permiso del propio supervisor se necesita otro supervisor.
8. Capturar en la pantalla habitual **Inventarios y capturas**. Los ceros cuentan como valores. Los reintentos conservan el UUID; las etapas previas no se sobrescriben. La cola local conserva las capturas por usuario hasta confirmarlas.
9. En Operación, revisar el análisis, registrar ajustes y enviar a validación. Para volver a contar, devolver a EN_PROCESO. Entregar exige fecha válida y confirmación explícita si hay líneas sin contar, como en el WMS. Un inventario entregado no se reabre desde esta fase. No se publica KPI automáticamente.

La existencia teórica, el físico calculado, el desfase y el análisis no se devuelven a un operador con conteo ciego. La visibilidad se controla en el servidor. C1/C2/C3 permanecen visibles conforme al WMS original.

La pantalla administrativa muestra hasta 500 inventarios nativos recientes. La consulta general conserva su paginación. El publicador se detiene si supera ese límite de comprobación; no asume que una lista truncada es completa.

## Análisis oficial

La referencia elegida por el usuario es `parseAnalysisData` de ITSANET IMS / WMS V124. Los indicadores se cotejan contra una copia de esa función en pruebas. Conservan exclusión DIF_INV, referencias/ubicaciones correctas menos las que tienen errores y denominadores del WMS. No se sustituyen por las fórmulas de la hoja ANALISIS ni las vistas antiguas de Supabase.

El físico conserva la fórmula de la plantilla usada por el WMS: C1 + ajuste mientras falte C2 o C3; con tres etapas completas, C1 + ajuste si C1=C2, o C3 + ajuste si difieren. Las sumas y porcentajes se calculan con enteros escalados, sin parseFloat. Avance de conteo y exactitud son indicadores separados.

## ERP UIO/GYE

`tools/consultar-erp.mjs` permite consultar stock a través de los destinos fijos `q_apidepot` y `g_apidepot`, usando únicamente GET, sin redirecciones y con límites de tiempo/tamaño. Los tokens no se comparten entre credenciales ni se envían al navegador. El conector conserva números JSON como texto antes de convertir cantidades, aplica una serie = una unidad y agrupa solamente las dimensiones logísticas del ERP por cliente.

Necesita un JSON privado 0600, propiedad de enicolalde y sin enlaces, dentro de `centro_mando_ims_datos`, con `sede`, `clienteId`, `userid`, `password` y `codigosCliente`. Las equivalencias de código ERP se configuran explícitamente; no se adivinan por el nombre de una credencial. No pegar esas claves en chat, Git o consola compartida.

```bash
node enterprise/tools/consultar-erp.mjs \
  --config /home/enicolalde/bryan/centro_mando_ims_datos/config/erp_uio_privado.json \
  --salida /home/enicolalde/bryan/centro_mando_ims_datos/erp_stock_nuevo
```

La carpeta de salida debe ser nueva. Produce un stock CSV privado y un resumen; no crea inventarios ni cambia el ERP. Las credenciales de ScriptProperties no están en los ZIP de código y todavía deben trasladarse de forma privada. La conexión corporativa real debe comprobarse antes de sustituir la actual.

## Trabajo pendiente antes del corte definitivo

La captura por escáner de series, hallazgos/planilla alterna, validación EAN/ABC/ubicaciones, reportes/exportaciones nativas, calendario completo y notificaciones requieren completar su paridad con el WMS. Los indicadores de esta fase corresponden a inventarios nativos; el histórico conserva su consulta y sus fuentes, sin reinterpretarlo automáticamente como stock nuevo. Falta trasladar/validar las fuentes pendientes y el delta posterior al corte descargado, comprobar conexiones ERP reales y aceptar un piloto con operarios y jefaturas. WTW permanece aplazado.

Los contratos vigentes INVENTARIOS 30 / REGISTRO 15 no se modifican; tampoco se declara implementada todavía su sustitución completa por exportaciones nativas. Supabase no se utiliza como fuente autoritativa. Hasta completar esos puntos, no desactivar Sheets, los archivos hijos, sus permisos o sus despliegues.
