# Interfaz operativa y validación de inventarios

26 de noviembre de 2026 · ITSANET IMS Ecuador

## Un menú para cada cuenta

**Menú de trabajo** está disponible en Centro, conteo, gestión, creación, stock y ubicaciones. Permite buscar una función por su nombre o por la tarea que realiza. Fuera de los campos de entrada también se abre con **Ctrl+K** o **⌘K**.

| Perfil | Orientación del menú |
| --- | --- |
| Operario | Conteo, consulta de ubicaciones, perfil, ayuda y preferencias de presentación. |
| Líder | Operación, creación, gestión, analítica y administración de usuarios según su jerarquía. |
| Coordinador | Operación, equipo y resultados según sus permisos. |
| Administrador | Operación, equipo, resultados, validación de Google, configuración y cierre. |
| Auditor | Consulta y funciones habilitadas para su cuenta. |

Las funciones administrativas de Google aparecen únicamente para administración. El servidor vuelve a comprobar rol, sede y permisos de inventario; la presentación no concede accesos.

Si está pendiente el cambio de clave inicial, el menú orienta a **Mi perfil**. Después del cambio se muestran las funciones autorizadas.

El inventario seleccionado se conserva al pasar desde gestión a Centro, a la validación y a la ventana de conteo. Las preferencias de **Día/Noche** y de módulos visibles se configuran desde **Configurar mi espacio** y se conservan por cuenta en ese navegador.

## Validación y conexiones

Administración puede entrar desde **Menú de trabajo → Validar inventarios de Google**, o desde **Herramientas y datos → Validación y conexiones**.

La ventana ampliada tiene cuatro pestañas:

1. **Inventarios:** lectura, diferencias y selección para incorporar.
2. **Cuenta y agenda:** configuración de Google, servicios y recordatorios.
3. **Ocupación:** conexión de lectura del almacén.
4. **Diagnóstico:** comprobaciones técnicas y resultados para soporte.

Las pestañas admiten teclado con las flechas, Inicio y Fin. En móvil, la barra se desplaza horizontalmente y el contenido tiene su propio desplazamiento.

## Leer el resultado sin confundir sus etapas

Al abrir Inventarios, IMS recupera **la última lectura guardada de la cuenta**, sin consultar otra vez Google ni crear trabajos nuevos. Si la lectura venció, conserva su detalle para consulta y solicita una nueva lectura antes de incorporar. Si cambió el acceso a una sede, el resultado protegido deja de estar disponible.

**Lectura completa** confirma los archivos de esa consulta. Las diferencias de inventario se presentan por separado y requieren revisión.

**Incorporación confirmada** muestra el último resultado de aplicación, sus inventarios y capturas y su fecha. Una lectura posterior corresponde a otro plan y conserva la incorporación anterior. Una aplicación con incidencias muestra sus pendientes, sin presentarla como una incorporación completa.

Las vistas del resultado son:

- **Recientes:** inventarios de los últimos 30 días. Las novedades y diferencias aparecen antes que los registros coincidentes.
- **Listos para incorporar:** novedades recientes sin conflictos.
- **Por revisar:** diferencias o bloqueos recientes, explicados por inventario.
- **Sin cambios:** inventarios recientes coincidentes o incorporados en ese plan.
- **Histórico:** inventarios anteriores; sus diferencias no se mezclan con los pendientes recientes.
- **Programados:** aparece si hay inventarios con fecha futura.

Se puede buscar por inventario o sede. Los resultados se presentan por páginas y conservan la selección al cambiar de vista. Las cantidades de conteo se muestran completas; los indicadores grandes utilizan K/M.

## Revisar e incorporar

1. Consulta la lectura guardada o pulsa **Leer y revisar novedades de Google**. Durante la consulta se muestra el tiempo transcurrido.
2. Abre **Revisar diferencias** para ver fila, producto, ubicación y explicación. Cuando los conteos difieren, **Comparar conteos** muestra los valores de IMS y Google por etapa.
3. Selecciona únicamente los inventarios revisados. **Seleccionar recientes sin conflictos** prepara esa selección; la incorporación requiere pulsar **Aplicar selección revisada**.
4. Comprueba la confirmación. Los inventarios incorporados quedan marcados y se evita volver a seleccionar ese mismo grupo. Si algo cambió durante la revisión, se muestra el pendiente y se prepara una lectura nueva.
5. Usa **Asignar líder y colaboradores** para continuar con el equipo del evento vinculado.

Cuando no hay capturas aplicables, la ventana muestra el estado y las diferencias que corresponde revisar. No solicita aplicar una selección vacía.

El texto de recordatorios indica su alcance real: **únicamente líderes de conteo activos asignados a la tarea**. Esta restricción sigue comprobándose al preparar y al enviar los avisos.

## Situación real y entrega

El informe recibido confirma la revisión instalada `e37fdec`, 18 de 18 fuentes leídas sin incidencias de lectura, una aplicación completada con dos inventarios nuevos y 665 capturas, y 31 inventarios nativos.

Ese informe conserva pendientes operativos: dos inventarios recientes con conflictos, cinco cuentas pendientes de cambio de clave y ocho inventarios recientes sin equipo listo. Esta entrega mejora su presentación y navegación. La conciliación y la habilitación del equipo se completan con sus responsables antes del inicio general.

Las capturas de esta guía y la validación automatizada usan datos sintéticos. Las pruebas no envían correos ni modifican los inventarios del servidor corporativo.
