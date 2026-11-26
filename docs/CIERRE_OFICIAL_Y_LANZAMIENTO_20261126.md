# Cierre operativo de ITSANET IMS

26 de noviembre de 2026 · Ecuador

**Actualización:** se recibió la confirmación de instalación de `4d5b416` y la medición real del servidor. Los rechazos de Google compartidos después corresponden a HTTP 429. Véase [cierre real y corrección de cuota](CIERRE_REAL_Y_CUOTA_GOOGLE_20261126.md). La sección de evidencia pendiente de este documento describe el estado anterior a recibir ese informe.

## Resultado preparado

Esta actualización reúne las correcciones de creación y conteo publicadas el 23 de noviembre y agrega una comprobación del cierre. No asigna un porcentaje de producción a partir del número de pruebas aprobadas.

- C1/C2/C3: secuencias explícitas, cantidades exactas y cero válido. Las filas equivalentes se agrupan sin fusionar estados, categorías, lotes ni otras dimensiones distintas. Las capturas ya confirmadas se conservan.
- Creación: cliente principal y adicionales coordinados con las cuentas API; CSV complementario o stock pendiente explícito para clientes sin credenciales.
- Recordatorios: exclusivamente líderes activos asignados a la tarea. Se vuelve a comprobar al enviar, incluidas solicitudes antiguas en cola.
- Incorporación: el resumen acumula todas las selecciones confirmadas de un plan de Google. Un reintento o una selección posterior no vuelve pendientes grupos ya incorporados.
- Cierre: consulta administrativa por sede, inventarios recientes, acceso por cada cliente y asignación vigente en el cronograma, cuentas pendientes de cambio de clave y capturas locales por etapa. Separa los datos importados de Google y los conflictos anteriores.

## Cómo comprobarlo

Después de instalar, en **Centro de Mando → Google y agenda → Revisar cierre operativo**, administración puede consultar y copiar el informe. Operarios y líderes no acceden a este diagnóstico administrativo.

El instalador también ejecuta `enterprise/deploy/verificar_cierre.py`. Comprueba por HTTPS la revisión publicada y la protección del informe; abre y cierra una sesión administrativa de comprobación. No genera capturas, aplica planes, entrega inventarios ni envía notificaciones.

La comprobación del servidor agrega:

- Servicio activo, unidad correspondiente a la revisión y arranque automático.
- Memoria actual y pico, umbral y límite del servicio, muestra de CPU y cuota configurada.
- Espacio libre en la partición de datos.
- Tamaño asignado a datos e índices del **esquema MySQL completo**, incluidas las copias importadas. Usa una conexión local y una transacción de solo lectura con la cuenta de migración existente; no amplía permisos.

La memoria del servicio no incluye MySQL ni Apache. **512 MiB es el límite del servicio**, no el tamaño de la base. El tamaño MySQL no incluye binlogs ni archivos externos. La consulta desde la interfaz solo puede medir las tablas visibles para el perfil del servicio y lo indica como medición parcial.

Se guarda un JSON privado y distinto en `centro_mando_ims_datos/cierres/`, con permisos 0600. El resumen no contiene contraseñas, tokens, correos del equipo ni identificadores de archivos Google. El resultado `ok: true` confirma que terminó la comprobación; revisar también `evaluacion` y `pendientes`. No constituye una aprobación de lanzamiento.

## Evidencia que falta recibir del servidor

La última instalación acreditada en la conversación corresponde a `df8e8cad1f73e735c6b95a0fbb7e1bfb47a1af11`. No hay confirmación de instalación de las correcciones posteriores. Tampoco se recibió un resultado de `GOOGLE_APLICAR`: el JSON del 23 de noviembre es una revisión `GOOGLE_DELTA` y declara que no modificó datos operativos.

Ese plan ya venció. Preparar una nueva lectura y revisar el estado actual de `261117_HYCITEMKT`, `261118_HYCITE` y `261119_SGMUETRAS`. Si siguen pendientes y sin conflictos, aplicar la selección explícita. En el informe anterior representaban 551 líneas y 597 capturas; estos totales deben volver a comprobarse con la lectura actual.

Los 304 conflictos anteriores y las dos fuentes pendientes de iniciar de aquel informe se conservan para su revisión separada. Los inventarios importados con origen «Entregado» necesitan revisión y cierre nativo; la importación no los publica automáticamente como entregados. Asignar líder y colaboradores desde el evento vinculado y verificar el acceso con una cuenta del equipo.

## Fechas de trabajo

| Fecha de Ecuador | Entregable | Condición comprobable |
| --- | --- | --- |
| 26–27 de noviembre | Instalar revisión de cierre y obtener informe del servidor | Revisión publicada, acceso del equipo y novedades actuales incorporadas o conciliadas |
| Lunes 30 de noviembre | Objetivo de inicio operativo en Ecuador | Validación con líderes: registro, recuperación de borrador, C2/C3 cuando corresponda, descarga y entrega |
| 1–3 de diciembre | Seguimiento inicial y preparación de demostración | Resolver incidencias observadas en la operación y preparar información de ejemplo autorizada |
| Viernes 4 de diciembre | Demo e informe para Argentina | Informar resultados reales y recibir su aprobación y ajustes de operación |

La configuración e implementación inicial en Argentina se estimó en una semana después de su aprobación y de contar con servidor, accesos, clientes, usuarios y datos necesarios. Es una estimación pendiente de validar con su equipo. La instalación actual conserva configuración específica de Ecuador; todavía no acredita una implementación argentina.

La arquitectura operativa usa Node.js/JavaScript, MySQL e interfaz web; Python apoya instalación y migración. Las integraciones de Sheets, Calendar y correo siguen disponibles. No se anuncia que JavaScript haya sido eliminado.
