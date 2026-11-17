# Pruebas de aceptación en el servidor

Registrar resultado, usuario, inventario de prueba y evidencia. Los ensayos locales usan datos sintéticos; no sustituyen la verificación de las conexiones empresariales.

| Caso | Resultado esperado |
|---|---|
| Versión y acceso HTTPS | La revisión instalada coincide con la publicada; inicio/cierre de sesión funcionan por 8445 |
| Conservación de datos | Se conservan histórico, conteos importados, ceros y capturas nuevas hechas en MySQL |
| Crear desde API UIO/GYE | Extrae solo cuentas autorizadas, conserva cuenta de origen, repeticiones legítimas y cantidades exactas |
| Crear desde CSV o en blanco | Conserva SKU con ceros y valida la interpretación de cantidades antes de crear |
| Conteo por ubicación | Seleccionar A-01 no incorpora las líneas de A-010 |
| Cantidades | Probar 0, entero, fracción y cantidad grande; no convertir el punto decimal del ERP en miles |
| Captura masiva | Resguarda borradores y confirma por fila sin duplicar un reintento |
| Ráfaga | La etapa es explícita; volver a leer C1 guardado no crea C2 |
| Concurrencia | Otro cambio de línea exige actualizar la versión; no sobrescribe una captura nueva |
| Permisos | Operador de un cliente no ve otro; conteo ciego oculta teórico y diferencias |
| Presencia | Solo selección reciente de ubicaciones autorizadas; no revela posiciones de otros clientes |
| Series / alterna | Coincidencia múltiple requiere selección; desconocida queda auditada como hallazgo |
| Análisis | Revisar casos correctos, faltantes, sobrantes, C3 heredado y DIF_INV contra el motor WMS |
| PDF / etiquetas / Excel | Descarga autorizada, identificadores conservados, QR exige sesión, 30 columnas del stock |
| Mezzanine | MZ-1/MZ-2 son dos plantas, entrepiso 210 cm, MZJV arriba; BM-A2 sigue en planta baja |
| Gavetas | 1AG/1BG son gavetas, 1G no; alturas superiores provisionales y excepciones quedan identificadas |
| Plano BM | Verificar con recorrido físico las anclas del PDF y las posiciones que permanecen provisionales |
| Ocupación SQL | Lectura real desde 192.168.4.12:1433, cuenta SELECT, fecha de corte y conservación del corte previo ante fallo |
| Stock congelado | Refrescar ocupación no cambia stock ni C1/C2/C3 del inventario |
| Correo / Calendar | Autorizar bespinoza@itsanet.com, enviar prueba a destinatario elegido y sincronizar un evento de ensayo |
| Código actual Google | Leer los tres proyectos autorizados y completar el cotejo de reglas y funciones antes de afirmar paridad total |
| Entrega / KPI | Fecha explícita, revisión de incompletos y publicación solo de Entregados verificados |
| Móvil | Campos y tablas accesibles, selección exacta y guardado confirmado en el dispositivo usado para contar |

Pendientes externos: nombre de base/usuario SQL de lectura, cliente OAuth y consentimiento de Google, comprobación física de alturas superiores y anclas no presentes en el plano, layout definitivo de B2 y consultas GYE/TLF. El corte elegido no incorpora modificaciones posteriores de Google.

## Ampliación: recorrido, destino y fotos

| Caso | Resultado esperado |
|---|---|
| Ubicaciones e IMS | Mismo WebGL, controles y dimensiones originales en cm |
| Piso B2 | Cambiar a B2 muestra suelo bajo las estructuras, separado del plano BM |
| Avatar | Clic en la posición sitúa el avatar en un pasillo contiguo y resalta la selección |
| Recorrido | WASD/botones evitan atravesar racks; planta alta no sale de la plataforma |
| Doble clic | Abre solo productos autorizados de la ubicación del inventario seleccionado |
| Cambio de posición | Anterior/siguiente conserva borradores sin presentarlos como capturas confirmadas |
| Carpetas | Inventario nuevo crea SEDE/año/mes/cliente; repetir no duplica carpetas |
| Foto | Confirmación del servidor, lectura tras recargar, nota conservada y cantidades intactas |
| Privacidad | Usuario sin permiso del cliente no descarga fotos; POST sin CSRF se rechaza |
| Drive pendiente | Sin OAuth se conserva la foto privada y se indica que falta autorización |
| Drive autorizado | Habilitar Drive API y drive.file; enviar una foto sintética y verificar la ruta y los bytes |
| Reintento de Drive | Una respuesta perdida reutiliza el ID remoto y conserva una sola copia |
| Cuenta reemplazable | Nueva cuenta conserva archivos antiguos y genera su propia jerarquía |

No se ha realizado envío real a Google ni lectura real de la base empresarial desde el entorno de desarrollo. Confirmarlos en el servidor es parte de estas pruebas finales.

## Alcance de ocupación y recorrido entre pasillos

| Caso | Resultado esperado |
|---|---|
| Centro / inventario | Con 15 posiciones en la sede y dos en el documento, Centro presenta 15 e IMS únicamente dos |
| Posiciones compartidas | Dos clientes en una posición ocupada no duplican el total físico |
| Permisos de ocupación | Operador de un cliente no recibe posiciones de otro cliente ni el total del corte global desde la consulta del inventario |
| Coincidencia exacta | Solicitar A-01 no incorpora A-010; las posiciones sin SQL quedan Sin dato |
| Bloqueo | Una disponible bloqueada conserva ambos indicadores; una ocupada bloqueada también |
| Movimiento continuo | Mantener una dirección mueve el avatar; soltarla lo detiene, sin atravesar racks |
| Ruta automática | Seleccionar otro hueco en recorrido calcula una ruta, completa sus esquinas y llega a las coordenadas del pasillo de destino |
| Cámara | Al caminar no entra en la estructura situada detrás del avatar |
| Bodegas sin plano | Orden A, B/C, D/E, pasillos de 240 cm, cruces cada doce columnas y piso visible |
| Presentación | Los totales del documento quedan encima del mapa, sin taparse con el panel lateral; comprobar escritorio y móvil |

La validación de rutas usa geometría sintética. La ocupación empresarial actual requiere configurar y probar la conexión SQL de solo lectura en el servidor.
