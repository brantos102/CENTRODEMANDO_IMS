# Inventarios con varios códigos ERP y selección por posiciones

Reglas confirmadas por el usuario el 10 de noviembre de 2026. El sistema Google sigue siendo la operación vigente durante la validación del servidor. Este documento no activa conexiones ni cambia inventarios o permisos.

## Grupos de negocio y cuentas de Depot

| Sede | Etiqueta de conexión | Cliente/grupo confirmado | Tratamiento |
| --- | --- | --- | --- |
| GYE | ALU, ALU SWAP, ALULTE | ALU | Conservar cuentas y códigos de los subclientes |
| GYE | NOKIA5G, NOKIACNT3G, NOKIACNTLTE | NOKIA | Conservar cuentas y códigos de los subclientes |
| GYE | FOC 5G | FOC 5G | Cliente independiente |
| GYE | MOD 2024 | MOD 2024 | Cliente independiente |
| UIO | FINI | Pendiente de identificar | No asignar a otro cliente por semejanza |

La etiqueta que permite autenticarse no se toma como COD. CLIENTE. El diagnóstico obtiene los códigos que devuelve el ERP; después se confirma qué códigos pertenecen a cada cuenta y grupo. Los nombres del catálogo vigente conservan su autoridad. En el catálogo trasladado de 39 clientes ya existe ALU, pero faltan NOKIA, FOC 5G y MOD 2024; se informa esa ausencia sin crear ni renombrar registros automáticamente.

## Composición de un inventario

Un inventario es un archivo/operación independiente. Puede reunir varias cuentas ERP del mismo grupo y también cuentas de clientes independientes, respetando los permisos. Cada línea debe conservar el cliente, el código de cuenta ERP, la sede y la procedencia física. Agrupar en el tablero no debe fusionar las existencias, cambiar sus cantidades o borrar la identidad del subcliente.

Se requieren dos criterios explícitos de selección:

1. **Por códigos:** elegir uno o varios códigos de cuentas ERP autorizadas. El inventario incluye sus líneas, manteniendo la identidad de cada cuenta.
2. **Por posiciones:** elegir posiciones y examinar todas las cuentas presentes en ellas dentro de las conexiones y permisos autorizados. La selección no se limita artificialmente a un único cliente marcado en el formulario. La vista previa informa los clientes y códigos encontrados; un código sin asociación se resuelve antes de crear el inventario.

La segunda opción conserva el control de acceso: seleccionar una posición no concede acceso a cuentas ajenas. Antes de confirmar, la vista previa debe enumerar cuentas, posiciones, líneas y totales exactos; el archivo se crea con esa composición, sin copiar existencias que quedaron fuera de la selección.

## Identidad y verificaciones de la futura importación

- Separar grupo de negocio, cuenta ERP y conexión de lectura. Un grupo puede tener varias cuentas; cada cuenta conserva su código real y su sede.
- Guardar procedencia de conexión/cuenta en las líneas nativas. El contrato CSV y las 30/15 columnas públicas de Power BI no se amplían para almacenar metadatos internos.
- Si dos credenciales devuelven la misma cuenta, detectarlo antes de sumar stock. Un informe de códigos compartidos no prueba por sí solo que dos conjuntos de existencias sean copias idénticas.
- No usar SKU, número de línea o posición como identificador único; existen repeticiones legítimas y diferentes fuentes físicas.
- Conservar ceros iniciales, series, lotes, ubicación y cantidades exactas. Una consulta para crear otro inventario no actualiza el stock ya congelado de un inventario existente.
- La selección y la creación deben conservar su solicitud e identidad para poder reintentarse sin duplicar líneas. Las etapas de conteo, correcciones, auditoría y permisos actuales se mantienen.
- Solo Entregado habilita consolidación/KPI; los inventarios en validación siguen guardados.

## Alcance implementado en esta revisión

Se implementaron el diagnóstico de lectura ERP, la corrección de copias UIO/GYE, las propuestas de asociación y los grupos confirmados como metadatos de revisión. No se modificó el servicio corporativo activo. La importación ERP desde la interfaz, el alta de los tres clientes faltantes, la persistencia de cuentas ERP por línea y los dos selectores operativos siguen pendientes; requieren los códigos reales y la validación de la vista previa. La creación nativa existente con varias cuentas del catálogo no se presenta como si ya incorporara esta nueva selección por posiciones.
