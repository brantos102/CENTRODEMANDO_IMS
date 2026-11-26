# ITSANET IMS · operación e identidad corporativa

26 de noviembre de 2026. Guía de la actualización posterior a `2d9a474`.

## Operario

1. Inicia sesión con tu cuenta y completa el cambio de clave inicial.
2. Abre el inventario asignado. En **Inicio**, busca una ubicación en Registros generales o en el mapa. El visor dibuja las estructuras y posiciones del inventario; conserva la geometría del almacén para el recorrido seguro. Los paneles de búsqueda, registros y posición flotan sobre el escenario. El resumen de ocupación se despliega cuando lo necesitas.
3. Pulsa **Iniciar conteo físico**. Comprueba la ubicación y el producto antes de registrar.
4. Escanear prepara una cantidad; las lecturas repetidas se acumulan en el borrador. **Guardar masivo** confirma lo preparado. **Guardar cada lectura** activa el envío individual. Espera siempre la confirmación verde.
5. C1, C2 y C3 son etapas distintas. El sistema indica cuál corresponde; un cero es una captura válida. Si dos filas tienen atributos distintos, revisa cuál estás contando.
6. El icono de ojo indica la política de cantidades resuelta por el servidor. En conteo ciego se mantienen ocultos el teórico y las diferencias, incluso en las descargas.
7. **Series** abre una ventana sobre el inventario. Consulta, revisa la coincidencia y confirma una sola vez. Una serie desconocida queda en planilla alterna; no sustituye el stock.
8. En **Tabla del inventario → Descargas** tienes Excel, CSV y PDF con los datos autorizados. **Cobertura y enlaces de Sheets** muestra únicamente publicaciones confirmadas. El PDF conserva hasta 20.000 líneas; para documentos mayores utiliza Excel o CSV completos.

La actualización automática consulta MySQL cada cinco minutos. Se pospone durante un formulario, un guardado, un borrador pendiente o una edición activa para conservar el trabajo. La lectura e incorporación de Google se revisa desde administración.

## Líder de conteo

1. Revisa el calendario semanal y el monitor del Centro. Puedes cambiar a mes, Gantt o matriz anual.
2. **Crear inventario** abre el asistente dentro del Centro. Elige UIO o GYE, cliente principal y adicionales, fecha y fuente.
3. API ITSANET consulta las cuentas autorizadas de los clientes seleccionados. Para contar por posición utiliza ese modo y comprueba el stock obtenido. Si falta una cuenta, notifica a administración y adjunta CSV o conserva el cliente pendiente de carga.
4. Revisa destino, responsable, colaboradores y resumen antes de crear. Un inventario en blanco abre su preparación; debe cargarse y activarse el stock antes de contar.
5. Asigna el equipo por inventario y cliente. La política de módulos complementa estos permisos.
6. Al finalizar revisa capturas, recuentos, evidencias, análisis y entrega. Una importación de Google no constituye por sí sola la aprobación de campo.

## Administrador

En **Menú de trabajo → Módulos y notificaciones** se administra la política global de UIO y GYE. Se requiere administración de ambas sedes.

- **Por perfil:** establece qué módulos puede utilizar cada rango dentro de sus permisos existentes.
- **Por grupo:** crea un grupo, selecciona integrantes y aplica restricciones compartidas.
- **Por usuario:** una regla individual tiene prioridad sobre perfil y grupo.
- **Heredar:** conserva la regla del nivel previo.

Administración mantiene siempre su acceso. Las casillas no asignan inventarios, no conceden otra sede ni revelan cantidades ocultas. Los accesos de captura y la visibilidad se gestionan en la supervisión del inventario. La política se guarda en MySQL con control de versión y auditoría. Si otro administrador la cambia mientras editas, vuelve a abrirla antes de guardar.

Las sesiones consultan los permisos al iniciar y cada cinco minutos. Las API comprueban los permisos en cada solicitud.

### Notificaciones

Configura anticipación de 0 a 30 días, asunto e introducción. El asunto admite `{cliente}`, `{sede}` y `{fecha}`. La activación de correos se conserva en **Validación y conexiones → Cuenta y agenda**.

Los destinatarios de recordatorios son exclusivamente líderes activos asignados. Se comprueban al preparar la tarea y antes de enviarla. Una política guardada no envía correos por sí sola. Calendar conserva su configuración específica para avisos al equipo.

### Google, clientes y auditoría

1. En **Validación y conexiones → Inventarios**, consulta la última lectura o prepara una nueva.
2. Separa novedades recientes de conflictos anteriores. La lectura de Google no modifica capturas.
3. Selecciona y aplica únicamente los grupos revisados. Conserva la confirmación de incorporación.
4. **Reportes por cliente** consulta entregados autorizados y publica, mediante un trabajo explícito, la hoja propia `IMS_CONSOLIDADO` en los archivos del historial registrado. Las hojas originales se conservan.
5. La cobertura de cada inventario distingue MySQL de los enlaces Sheets confirmados. Un enlace al consolidado de entregados no prueba que un inventario todavía abierto esté publicado. IMS no cambia permisos de Google ni publica archivos como acceso público.
6. Conserva Excel para la revisión completa de líneas, series, alterna e historial autorizado. Las capturas mantienen cantidades exactas. Los indicadores pueden abreviarse como K/M.

## Identidad y accesibilidad

Se incorporan Azul Real `#1c58d7`, azul profundo `#0e2c6b`, tonos `#d2def7`, `#77aaff` y `#8dabeb`, y Schibsted Grotesk. El logotipo se extrae de los trazados del manual corporativo aportado. La tipografía se sirve localmente con licencia OFL; la aplicación no necesita descargar fuentes desde un tercero.

El menú conserva texto junto a los iconos. Hay foco de teclado, etiquetas accesibles, modo día/noche y distribución móvil. Los paneles flotantes permiten seleccionar ubicación y operar el visor; el color complementa los mensajes de estado.

## Actualización y validación

Utiliza el instalador existente `enterprise/deploy/habilitar_centro.sh` con la revisión publicada. La actualización agrega la tabla de política administrativa y conserva inventarios y capturas. El instalador verifica los archivos públicos por HTTPS.

Después de instalar: recarga con Ctrl+F5, revisa la política administrativa y valida con un líder un inventario autorizado: creación, carga, C1/C2/C3 cuando corresponda, series, evidencia, descarga y entrega.

El último informe corporativo recibido mantiene pendientes dos inventarios recientes con conflictos, cinco cambios de clave y ocho inventarios sin equipo listo. Esta actualización no concilia esos datos automáticamente.

**Cobertura por cliente:** Administración puede abrir **Revisar calidad y cobertura** y buscar cliente o sede para cotejar inventarios, entregados, líneas con C1, KPI publicados y el último consolidado Sheets confirmado. Esta consulta conserva los datos y no inicia publicaciones.
