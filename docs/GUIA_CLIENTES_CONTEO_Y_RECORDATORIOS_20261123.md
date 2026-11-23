# ITSANET IMS · Clientes, conteo y recordatorios

23 de noviembre de 2026 · Hora de Ecuador

## Recordatorios solo a líderes de conteo

Los destinatarios deben cumplir simultáneamente estas condiciones:

- Cuenta activa y perfil **LIDER** en el Centro de Mando.
- Acceso a la sede de la tarea.
- Asignación como responsable de la tarea o integrante activo de su equipo.

Registrar una cuenta no la suscribe a todos los conteos. Operarios, auditores, administradores, coordinadores y líderes sin asignación quedan fuera de estos avisos. El formulario muestra únicamente los líderes elegibles.

El servidor valida los destinatarios al solicitar el trabajo y vuelve a comprobarlos al ejecutarlo. Si un trabajo anterior incluía otras personas, se filtran antes de enviar; si no queda ningún líder elegible, termina omitido sin enviar correo. Esto también cubre una desactivación, cambio de rol o retiro de acceso posterior a la solicitud. La programación diaria conserva una solicitud por líder, tarea y día.

La opción de invitaciones y avisos de Calendar utiliza los mismos líderes asignados. El equipo mantiene su participación y acceso al cronograma dentro de IMS.

## Crear inventario con los clientes correctos

Escribe el nombre del cliente principal y selecciona la sugerencia del catálogo. Agrega los clientes adicionales antes de extraer stock.

En **Stock ITSANET**, las cuentas visibles y la extracción por SKU o posición corresponden a esos clientes. El servidor contrasta también sede, cliente principal, clientes adicionales y clientes reales de la consulta; cambiar campos del navegador no permite incorporar el stock de otro cliente.

Si falta una cuenta API o la selección no devuelve stock de un cliente:

1. Notifica al administrador si faltan sus credenciales.
2. Adjunta y valida el CSV correspondiente a ese cliente, eligiendo el formato de cantidades correcto; o marca que queda pendiente de carga manual.
3. Revisa el resumen de API + CSV y los clientes pendientes antes de crear.

Cuando algún cliente sigue sin líneas, el documento queda **en preparación**. Se conservan el stock API y los CSV incorporados; no se inventan SKU ni existencias para el cliente pendiente. Desde **Administrar inventarios**, carga las líneas del cliente faltante y activa el stock tras revisar sus totales. La activación comprueba que todos los clientes seleccionados tengan líneas. Una cantidad explícita de cero se conserva como cero.

La carga combinada se confirma en una sola transacción: stock, clientes, carpeta, evento, equipo y auditoría.

## Contar filas equivalentes

En la ventana de conteo se presenta una fila por existencia equivalente. Coinciden cliente IMS, código del cliente ERP, SKU, posición, descripción, serie, lote, unidad, ABC, despacho, partida, categoría lógica y estado de mercancía. Una diferencia en cualquiera de esos atributos mantiene filas separadas y se muestra al elegir la existencia.

Ejemplo: dos filas iguales con stock 1 y 2 se muestran con stock total 3 para los perfiles autorizados. Las dos filas originales continúan almacenadas.

- Tres lecturas rápidas de cantidad 1 preparan un total de 3. La cola conserva las lecturas mientras se consulta el código anterior.
- Una cantidad explícita distinta de 1 establece el total del borrador. El campo vacío mantiene la captura pendiente; cero confirma ausencia.
- **Guardar masivo** confirma los borradores seleccionados, incluso si quedaron en otra página. Espera su confirmación antes de cerrar.
- Si un código tiene lotes, estados o categorías diferentes, selecciona la existencia correcta antes de continuar.
- La captura agrupada conserva las cantidades ya confirmadas y registra únicamente las líneas pendientes. El total no puede ser menor que lo ya confirmado.
- La distribución a las líneas de origen usa su stock inicial y conserva el total exacto; cada asignación tiene su operación y auditoría. Si falla una de las líneas, se revierte el grupo completo.
- Un reintento recupera la confirmación de la misma operación. Una versión diferente exige revisar el borrador.

Cuando ya había capturas en filas equivalentes, se conservan intactas. La vista agrupada compara el total; Excel y Análisis conservan también las diferencias por fila de origen. Un total coincidente no elimina esas diferencias históricas: el líder debe revisarlas y seguir las etapas de recuento.

Los borradores de una interfaz anterior que no identifican el grupo se conservan para revisión. No se convierten automáticamente en capturas del total. Abre **Revisar borradores guardados**, comprueba las cantidades y registra el total de la fila actual. El descarte requiere una acción explícita del usuario.

El conteo ciego sigue ocultando stock, ajustes, diferencias y resultados comparativos en la respuesta del servidor. K/M se utiliza en indicadores; capturas y archivos conservan la precisión exacta.

## Personalización y descargas

**Personalizar** permite escoger día/noche y mostrar u ocultar módulos existentes. Las preferencias se guardan por cuenta en este navegador; **Restaurar módulos** recupera la presentación. La preferencia visual no modifica los permisos.

En el conteo, **Descargas de este inventario** ofrece Excel completo, archivo plano CSV y PDF de análisis según el acceso autorizado. Excel conserva las filas originales, atributos, análisis, series, planilla alterna e historial de capturas. El consolidado de cliente conserva su consulta IMS y los destinos actuales de Google Sheets.

El doble clic del mapa reconoce la segunda pulsación aunque el enfoque inmediato haya movido la etiqueta de la posición.

## Comprobar el uso operativo

El instalador de df8e8ca fue confirmado por el servidor del usuario: HTTPS y operación nativa habilitados, 24 conexiones ERP, 352 inventarios históricos protegidos y 23 nativos en ese momento. El contador «usuarios heredados habilitados: 0» informa las altas de esa instalación; no es el total de cuentas activas.

Para habilitar a cada persona: revisa **Usuarios**, su cuenta activa, perfil, sede y asignación al inventario o equipo de la tarea. Una cuenta nueva no obtiene acceso indiscriminado a todos los clientes.

La incorporación de datos actuales de Google se comprueba por separado:

1. En **Conexiones**, lee y revisa las novedades actuales. Resuelve los archivos rechazados y las sedes pendientes que señale esa revisión.
2. Aplica únicamente los grupos conciliados. Confirma el resultado de **GOOGLE_APLICAR** en Trabajos.
3. Actualiza el cronograma y cuentas desde el maestro; revisa y aplica el cronograma correspondiente.
4. Comprueba la fecha, cliente, líneas y capturas del inventario que va a utilizar el equipo.

El último resumen de Google compartido correspondía al 19 de noviembre, con archivos rechazados, sedes pendientes y sin un resultado GOOGLE_APLICAR confirmado. La instalación por sí sola no acredita que se hayan incorporado todas las novedades posteriores de Google.
