# C2/C3 e incorporación operativa desde Google

23 de noviembre de 2026 · ITSANET IMS · Hora de Ecuador

## Corrección de conteo

Una agrupación podía contener una fila con C1/C2/C3 confirmados y otra equivalente todavía en C1. La comprobación de secuencia consideraba también las etapas posteriores de la fila ya terminada y rechazaba completar C2 en la pendiente.

Ahora se comprueba la secuencia de las filas que se van a escribir. Se conservan los conteos y las versiones de las filas ya confirmadas. Un historial que tiene C3 sin C2 sigue identificado para revisión: no se inventa el conteo que falta.

En la pantalla:

1. Confirma C1 con Guardar masivo o con el botón de captura.
2. La fila muestra **C2 →** cuando su segundo conteo está pendiente. Ese botón abre la captura de C2.
3. Después de confirmar C2, la fila muestra **C3 →** para registrar el final.
4. En el escáner selecciona la etapa que vas a trabajar. Si la etapa elegida ya estaba confirmada, aparece **Usar C2** o **Usar C3**. La elección prepara el código para que revises la cantidad y pulses Registrar lectura; no crea una captura automáticamente.

En una fila agrupada se introduce el **total de esa etapa**, incluida la cantidad ya confirmada que indica la pantalla. Las cantidades confirmadas se conservan y solo se completa la parte pendiente. Cero es una captura válida.

La regla de cálculo WMS se conserva: C2 se registra como segundo conteo; el físico utiliza C3 cuando existen los tres conteos y C1 difiere de C2. No se cambian resultados históricos para forzar una coincidencia.

La captura continúa requiriendo un inventario en proceso, stock activado, permiso del usuario sobre el cliente y una versión vigente. Los reintentos conservan operación, etapa y cantidad; no avanzan automáticamente a otra etapa.

## Incorporación actual desde Google

El informe compartido del 23 de noviembre a las 11:40:43 de Ecuador corresponde a **GOOGLE_DELTA**, una revisión. Informa 16 archivos intentados, 14 confirmados y dos fuentes pendientes de iniciar. No muestra errores de acceso a Google.

La revisión identifica tres inventarios recientes aplicables y sin conflictos, con 551 líneas y 597 capturas en total. Los conflictos de los inventarios anteriores se conservan para una conciliación separada.

Desde Conexiones:

1. Pulsa Leer y revisar novedades de Google si el plan anterior expiró.
2. **Seleccionar recientes sin conflictos · últimos 30 días** marca los grupos aplicables del periodo. Omite grupos anteriores, futuros, bloqueados o con conflictos. Revisa los nombres y fechas antes de aplicar.
3. Pulsa **Aplicar selección revisada**. Espera el resultado de GOOGLE_APLICAR con inventarios nuevos, capturas agregadas e incidencias.
4. Cada inventario incorporado ofrece **Asignar líder y colaboradores**, que abre su tarea del cronograma para revisar el equipo. El equipo autorizado recibe acceso al inventario y sus clientes mediante los permisos existentes.
5. Revisa el estado operativo antes de entregar o consolidar. El estado original de Google se conserva para revisión; una importación no publica automáticamente los inventarios como entregados.

Los archivos sin código, fecha o cliente no generan inventarios vacíos ni existencias inventadas. La selección no modifica otras fuentes de Google ni reemplaza capturas de MySQL.

## Resultado verificable y cuentas

Después de aplicar puedes pulsar **Copiar resumen de incorporación**, en el resultado de Conexiones o en Google y agenda del panel. Su formato es `ims-google-incorporacion-resumen-v1`.

El resumen distingue:

- La revisión GOOGLE_DELTA y su fecha.
- La ejecución GOOGLE_APLICAR y si corresponde a ese plan.
- Inventarios nuevos, capturas agregadas y grupos recientes aún por aplicar.
- Fuentes pendientes de iniciar, otras incidencias de lectura y conflictos anteriores.
- Líderes y operarios activos en las sedes autorizadas, cuentas pendientes de cambio de clave y personas con acceso de captura asignado.

No incluye claves, tokens, identificadores de archivos de Google ni filas de inventario. Una aplicación de un plan anterior no se presenta como confirmación del plan nuevo. Una aplicación parcial conserva visibles los grupos que no incorporó.

La corrección no modifica la regla de recordatorios: solo líderes activos asignados a la tarea y autorizados para su sede. También se comprueban los destinatarios de trabajos que ya estaban en cola.
