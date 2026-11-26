# Cierre real recibido y corrección de lectura Google

26 de noviembre de 2026 · ITSANET IMS Ecuador

## Lo confirmado en el servidor

El informe `ims-cierre-operativo-v1` recibido, generado a las 12:19 de Ecuador, acredita la publicación de `4d5b416043d6a53c951e094f7e58fd95cb349fb4`: HTTPS, unidad del servicio y arranque automático verificados.

| Medición | Resultado |
| --- | --- |
| Memoria actual del servicio | 50,89 MiB |
| Pico de memoria | 82,88 MiB |
| Límite de memoria configurado | 512 MiB |
| CPU observada | 0,02 % de un núcleo durante una muestra de 1,021 segundos |
| Cuota de CPU | Equivalente a 0,5 núcleo |
| Esquema MySQL, datos e índices | 5,30 GiB; 62 tablas, incluidas las copias importadas |
| Libre en la partición de datos | 34,07 GiB |
| Histórico conservado | 352 inventarios; 97.822 líneas |
| Inventarios nativos | 24; 12.337 líneas |

La muestra de CPU no constituye una prueba de carga. La memoria del servicio no incluye MySQL ni Apache. El tamaño del esquema no incluye binlogs ni archivos externos.

## Causa confirmada de la lectura parcial

El informe registra 17 archivos intentados, seis confirmados y 11 incidencias. El detalle aportado después confirma **HTTP 429** en las fuentes afectadas: Google limitó temporalmente las solicitudes. Las filas posteriores del panel siguen recibiendo actividad; el siguiente intento debe revisar su estado actual.

No hay una aplicación `GOOGLE_APLICAR` registrada. La ausencia de novedades en una lectura parcial no acredita que los datos estén actualizados.

La corrección:

- Espacia las solicitudes de lectura de Sheets al menos 1,1 segundos dentro del proceso IMS.
- Reintenta únicamente respuestas temporales 429, 500, 502, 503 y 504, con un máximo de cuatro intentos por solicitud.
- Respeta `Retry-After`. Si la espera supera el límite permitido o el presupuesto de la lectura, conserva la fuente sin confirmar; no la anuncia importada.
- Mantiene el límite de ocho minutos de la lectura y distingue su expiración de una fuente no autorizada.
- Conserva como fallos los rechazos de acceso y los problemas de certificado. Solo usa GET para reintentar las hojas, sin modificar fuentes.
- Muestra fila del panel, HTTP y acción recomendada en el informe de cierre, sin incluir IDs de archivos Google ni mensajes privados del proveedor.

Otras aplicaciones que usen la misma cuota de Google pueden seguir causando límites. La comprobación final es el resultado de una nueva lectura en el servidor, no las pruebas con datos simulados.

## Acceso del equipo

El informe confirma cuatro líderes y un operario activos, **cinco cambios de clave pendientes y cero personas con acceso de captura habilitado**. Las cuentas existen; el cambio inicial aún debe completarse.

1. Cada persona inicia sesión en `/centro` con su cuenta individual y abre **Mi perfil**. Debe cambiar su contraseña inicial antes de operar.
2. Si no conoce la contraseña temporal, administración puede restablecerla desde **Usuarios**; la persona vuelve a elegir su clave individual. No se comparten contraseñas en el diagnóstico.
3. Administración revisa en el cronograma al responsable y colaboradores de `101126_BELIA` y `231126_DEGSO`, con permiso para todos sus clientes.
4. `101126_BELIA` está en validación y no admite capturas en ese estado. Si requiere continuar contando, un responsable autorizado debe devolverlo a **En proceso** desde Gestionar, después de revisar su situación. No se cambia automáticamente su estado.

Se comprobó en Chromium con un líder sintético: el sistema bloquea la captura antes del cambio de clave; después permite registrar C1, C2 y C3 y conserva cero como cantidad válida. Las cuentas y capturas reales no se modificaron desde estas pruebas.

## Siguiente verificación en el servidor

Después de actualizar, ejecutar una sola revisión de novedades y esperar a que termine. Revisar las incidencias restantes; aplicar únicamente los grupos seleccionados y confirmados. La importación no entrega ni publica automáticamente inventarios con estado de origen «Entregado».

Finalmente, volver a copiar el informe de cierre para verificar incorporación, cuentas habilitadas y asignación vigente. La validación operativa con el equipo sigue siendo necesaria antes del inicio general previsto para el 30 de noviembre y de la demostración para Argentina del 4 de diciembre.
