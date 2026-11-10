# Consulta ERP dentro de Centro de Mando

Actualización del 10 de noviembre de 2026. La candidata incorpora `/erp`, accesible desde **Operación → Consultar stock ERP**, con la misma sesión del aplicativo. Esta entrega consulta existencias; todavía no crea inventarios desde ERP ni sustituye el sistema operativo de Google.

## Selección y resultados

- Por SKU: elegir sede y una o varias cuentas. Pueden pertenecer al mismo grupo o a clientes distintos. SKU vacío selecciona todos los productos de esas cuentas; la opción de variantes incluye códigos que comienzan por el SKU indicado.
- Por posiciones: introducir posiciones exactas, una por línea. El servidor consulta todas las cuentas habilitadas de esa sede, independientemente de las casillas de cliente marcadas previamente. Las posiciones se forman con NAVE-CALLE-COLUMNA-NIVEL no vacíos y conservan ceros y guiones.
- Cada resultado distingue cuenta, cliente del panel y código real del ERP. No une existencias de subclientes porque tengan el mismo SKU o posición. Los SKU y series conservan sus ceros iniciales.
- Filas recibidas, filas seleccionadas y líneas normalizadas son recuentos diferentes. Series exactas repetidas se omiten y las líneas sin serie con las mismas dimensiones se agrupan; las unidades se suman con enteros escalados, sin coma flotante. Una serie física representa una unidad.
- Las consultas muestran fecha de inicio, progreso y páginas de 50 líneas. Un fallo de cualquier cuenta no publica un resultado parcial. Si ya existía una extracción completa, la pantalla conserva sus datos y su fecha, indicando que la nueva extracción falló. Una sesión o autorización rechazada limpia esos datos.

Una extracción global a la vez, presupuesto de cuatro minutos, respuesta ERP de hasta 24 MiB/100.000 filas por cuenta, resultado seleccionado de hasta 16 MiB/100.000 líneas y dos consultas temporales como máximo. La caché del servidor caduca a los diez minutos y desaparece al reiniciar. No guarda el stock en localStorage, IndexedDB o nuevas tablas SQL. Consultar todas las posiciones de una sede no es una fotografía transaccional del ERP: las cuentas se leen secuencialmente y sus existencias pueden cambiar entre consultas.

## Acceso y configuración privada

Solo ADMIN y SUPERVISOR con ámbito vigente en la sede pueden consultar ERP. Un permiso de lectura o conteo sobre un inventario particular no concede acceso general al stock. Se revalidan actor, sesión y ámbito antes de cada cuenta y antes de entregar resultados. Los identificadores de consulta pertenecen al actor y una petición repetida no vuelve a extraer existencias. Las peticiones POST exigen origen HTTPS y CSRF.

Los endpoints ERP son fijos para UIO/GYE. El navegador no recibe contraseñas, usuarios ERP, tokens ni respuestas crudas del proveedor; la salida proyecta únicamente campos de inventario y metadatos autorizados. Los textos se presentan mediante `textContent`. Las consultas no aceptan URLs ni credenciales enviadas por el navegador.

El registro privado ya preparado en el servidor se valida y copia a un entorno separado por revisión, `centro_mando_ims_datos/erp/<revision>.env`, con permisos 0600. Su base64 es una codificación, no cifrado: no compartir ese archivo, su manifiesto privado ni el registro original. No se añaden secretos al repositorio, al archivo público de la unidad o a los informes de salida. El servicio recibe ese entorno adicional mediante systemd; se mantiene el perfil SQL operativo actual y sus privilegios.

## Evidencia corporativa recibida

El registro combina las 25 comprobaciones previas con una revisión dirigida de ALU, ALULTE y NOKIACNT3G. Las tres últimas consultas devolvieron:

| Cuenta GYE | Filas recibidas | Líneas normalizadas | Unidades exactas |
| --- | ---: | ---: | ---: |
| ALU | 838 | 810 | 17171.080000000 |
| ALULTE | 71 | 69 | 863.440000000 |
| NOKIACNT3G | 97 | 96 | 1461.200000000 |

Quedan 24 conexiones preparadas: 16 UIO y ocho GYE. FINI conserva el rechazo HTTP 401 y no se habilita. Las otras 22 conexiones no se volvieron a consultar durante la revisión dirigida; estos informes no certifican disponibilidad futura ni totales inmutables.

NOKIA, FOC 5G y MOD 2024 conservan nombres de grupo confirmados e ID de catálogo nulo. Pueden consultarse, pero este paso no inventa clientes SQL ni habilita su importación. La creación ERP requerirá altas de catálogo y procedencia persistente por cuenta/código; no se ofrece una descarga CSV que pierda esa procedencia.

## Actualizar solo el servicio propio

Preparar un worktree privado y limpio de la revisión publicada en `centro_mando_ims_datos/preparaciones/<revision>/codigo`. Desde allí ejecutar en Bash del servidor `apps`, como `enicolalde`:

```bash
bash enterprise/deploy/preparar_y_activar_erp.sh \
  '/home/enicolalde/bryan/centro_mando_ims_datos/ERP_LECTURA_5b24e0016a134b1e9aae96f878faf9ff/registro_erp_runtime_NO_COMPARTIR.json'
```

El paso instala dependencias fijadas y ejecuta pruebas antes de validar el registro privado. Conserva la versión activa mientras prepara una release nueva. Verifica la cuenta SQL, las protecciones existentes, 352 conteos históricos y 97.822 líneas antes de sustituir exclusivamente `centro-mando-ims-ensayo.service`. No ejecuta el inicializador de usuarios, no reasigna roles y no agrega tablas o clientes.

El único reinicio de aplicación es el de ese servicio propio. Continúa escuchando en `127.0.0.1:3003`, detrás del HTTPS ya configurado en `8445`; no instala otro listener ni modifica Apache, firewall, MySQL global, servicios vecinos o Google. Si falla la comprobación de salud/login/histórico/ERP, el actualizador intenta restaurar la unidad anterior y comprueba su salud. Una restauración que no pueda confirmarse se informa como error, nunca como despliegue correcto.

La comprobación HTTPS valida sesión, 24 metadatos ERP sin campos secretos, histórico protegido y cierre de sesión. No consulta a las 24 APIs durante el reinicio. Después de un resultado correcto, entrar a `https://apps.flexnetuio.com:8445/erp` y revisar BELIA de UIO, ALU de GYE y una posición conocida. Los nuevos totales dependen de las existencias del momento; comparar con el sistema vigente usando la misma selección y fecha.

La evidencia automatizada usa MySQL 8.0.46 y datos/credenciales sintéticos. La activación corporativa y las consultas desde la nueva pantalla solo se declaran verificadas después de recibir su resultado real. Continúan pendientes el alta de tres grupos, FINI, la creación directa desde ERP, la paridad completa del WMS y la conciliación del corte final. WTW sigue aplazado.
