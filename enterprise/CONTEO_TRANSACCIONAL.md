# Núcleo candidato de conteo — 4 de noviembre de 2026

Esta entrega implementa un módulo interno de conteo en MySQL; no sustituye todavía el WMS ni la aplicación actual. No tiene servidor HTTP ni puerto escuchando, no publica KPI, no se conecta a Google/Supabase y no modifica las aplicaciones del servidor empresarial.

## Cambio implementado

Una operación identifica un evento de conteo, no un SKU, una fila ni una cantidad. La interfaz futura debe generar un UUID antes del primer envío, persistirlo con la solicitud y reutilizarlo en todos los reintentos. Un segundo conteo legítimo utiliza otro UUID y otra etapa explícita.

`src/mysql/conteos.mjs` confirma en una sola transacción:

1. Actor activo, inventario y permiso específico sobre el cliente de la línea.
2. Operación previa: si existe con el mismo contenido devuelve el resultado guardado; si cambió la solicitud rechaza la reutilización del UUID.
3. Estado EN_PROCESO, versión esperada de la línea y etapa explícita disponible.
4. Actualización de conteo, registro de operación y auditoría antes/después.
5. COMMIT. Si se pierde su respuesta, devuelve CONFIRMACION_PENDIENTE y el cliente debe reenviar el mismo UUID.

Los permisos se vuelven a comprobar también antes de devolver una operación previa. Un permiso revocado no permite recuperar resultados mediante reintentos. El estado no editable impide capturas nuevas; una operación ya confirmada puede recuperarse después del cierre si el actor conserva permiso.

No se usan CacheService, candados temporales ni un bloqueo global de inventarios. Hay lectura compartida del estado y bloqueo de la línea que se cuenta, con unicidad por actor/operación. Las situaciones de deadlock/conflicto transitorio se revierten y se reintentan como máximo tres veces. Ningún reintento cambia automáticamente a la siguiente etapa.

## Contrato del módulo

```js
await guardarConteo({
  pool,
  principal: { actorId: idInternoDeLaSesionValidada },
  solicitud: {
    operacionId: uuidPersistidoAntesDeEnviar,
    inventarioId,
    lineaId,
    etapa: 1,             // 1 = V/C1; 2 = W/C2; 3 = X/final
    versionEsperada: '0',
    cantidad: '0.250',
    observacion: 'Texto opcional',
    nuevaPosicion: 'Texto opcional'
  }
});
```

`principal` es un dato interno confiable que deberá construir el adaptador de autenticación tras validar una sesión. **No se debe aceptar desde el cuerpo HTTP, querystring o localStorage. Ese adaptador todavía no existe.** El permiso de la base es una segunda comprobación y no reemplaza autenticar al visitante. El módulo no ofrece un login ni debe montarse directamente como endpoint.

La solicitud rechaza campos como email, rol o actorId. SKU y cliente se obtienen de la línea almacenada; no de la carga del navegador. El resultado devuelve operación, inventario, línea, cliente, SKU, etapa, cantidad exacta y versión. `repetida` distingue la recuperación de un resultado previo sin volver a escribir. Esa respuesta conserva la versión original del evento: el futuro cliente debe usarla como confirmación y no sustituir con ella una versión más reciente ya mostrada.

Omitir observación o posición conserva el dato anterior; enviar texto vacío lo limpia de forma explícita y auditada. Se preservan cero y cantidades decimales como cadenas exactas. DECIMAL(30,9) admite hasta 21 dígitos enteros y nueve decimales: fuera de esa precisión se rechaza, nunca se redondea. Los conteos físicos son no negativos; los ajustes, incluidos los negativos, necesitan un módulo independiente aún pendiente. Los datos históricos crudos no se convierten ni se descartan por estas validaciones.

Versiones e identidades son internas y no agregan columnas al formato Power BI. Los códigos operativos pueden repetirse; no hay UNIQUE por SKU/código operativo/número de fila. Inventarios IBM/VENTURA y sedes distintas conservan su independencia.

## Tablas nuevas de la candidata

`sql/002_conteo_operativo.sql` contiene ocho tablas con prefijo ims_op_: actor, cliente, inventario, inventario_cliente, permiso, linea, operacion y auditoria. Son el mínimo del núcleo ensayado; no constituyen todo el modelo final ni una migración automática del maestro. Las tablas de staging del SQL 001 permanecen separadas.

La línea conserva referencias a origen Drive/fila, sin hacerlas identidad única. La migración futura debe asociar cada línea y su cliente real, preservando dimensiones logísticas en el modelo completo. Los registros históricos ambiguos permanecen intactos en staging para revisión; este SQL no los rellena con supuestos ni los activa como inventarios actuales.

Solo se habilitan capturas nuevas en EN_PROCESO. EN_VALIDACION/ENTREGADO/CANCELADO preservan los datos y rechazan nuevos conteos por este módulo. Reapertura, ajustes y autorización para cerrar siguen pendientes; no se ha cambiado el flujo de producción ni establecido una regla de cierre diferente en el WMS actual.

`crearPoolConteos` exige MySQL local, base centromando_ims o centromando_ims_* y usuario distinto de root; mantiene decimales/cantidades grandes como texto y máximo cinco conexiones. `guardarConteo` verifica también la base efectiva y el usuario antes de iniciar escrituras. No crea bases/usuarios ni modifica parámetros globales.

## Validación ejecutada

Se ejecutó en este entorno un contenedor **mysql:8.0.46**, conectado por un puerto aleatorio en 127.0.0.1, con la base exclusiva centromando_ims_pruebas y usuario propio sin privilegios globales. No se usó ninguna conexión del servidor empresarial. El DDL se ejecutó realmente en InnoDB.

Doce pruebas de integración aprobadas:

- Diez envíos simultáneos del mismo evento producen un conteo y una auditoría.
- Reutilizar su identificador con otra cantidad se rechaza.
- Un CHECK real que rechaza la auditoría revierte la línea y la operación; un reintento posterior funciona sin ocupar C2.
- Dos eventos nuevos contra la misma versión dejan uno confirmado y otro en conflicto, sin convertirlo en una segunda etapa.
- Un lector y un cliente ajeno no escriben.
- Revocar el permiso bloquea también recuperar una operación previa.
- Entregado rechaza capturas nuevas y permite recuperar una ya confirmada con permiso vigente.
- En validación conserva sus datos sin aceptar capturas nuevas.
- Dos sedes con mismo código operativo/SKU mantienen conteos independientes.
- Etapas explícitas conservan cero, decimales, notas y los metadatos correctos de la línea.
- Una respuesta perdida simulada después de un COMMIT real permite recuperar la operación sin duplicarla.
- Un identificador compitiendo en dos inventarios confirma solo una operación.

Las fallas se inyectaron en adaptadores de prueba: se envió JSON inválido para que MySQL rechazara realmente el INSERT y se ocultó una respuesta después de ejecutar realmente COMMIT. No se solicitaron privilegios SUPER ni se alteró la configuración global. No equivalen a una prueba de fallo físico del servidor o de navegación real.

Además aprobaron seis pruebas del dominio; las nueve del importador con conexión simulada y dos de política de inventario (17 Node en total); cinco Python del exportador; y las 95 pruebas de la aplicación candidata Apps Script. El corte privado ya aportado se cargó completo y verificó en MySQL de ensayo: 19 hojas/277.731 filas brutas; INVENTARIOS 100.835 y REGISTRO 64.486 filas de datos. Repetir el corte devolvió yaImportado=true sin añadir otra copia. Este corte corresponde a la descarga previa y no se presenta como datos en vivo del 4 de noviembre.

El entorno anfitrión usa Node 24.19.0. También aprobaron en un contenedor **Node 22.23.3**, el runtime informado para el servidor, las 17 pruebas Node del módulo, las 12 contra MySQL real y las 95 de la candidata anterior. Los comandos npm usan el runner estándar compatible con Node 22; la bandera --test-isolation=none usada antes en el anfitrión no existe en Node 22 y se retiró de los comandos distribuidos. Se incluye lockfile para instalar con npm ci, sin reutilizar dependencias de IV_ITSANET/RRHH/Data Sync. La aceptación en el servidor empresarial sigue pendiente.

## Reproducción

Las pruebas unitarias no necesitan base:

```bash
cd enterprise
npm ci --ignore-scripts
npm test
```

Las de integración requieren una base **exclusiva de ensayo**, nunca la base operativa. Crean tablas y datos sintéticos. Se exige IMS_MYSQL_PRUEBAS=1 y nombre centromando_ims_pruebas o centromando_ims_pruebas_sufijo. Preparar su conexión en un archivo privado que no se comparte ni se sube al repositorio:

```bash
node --env-file=/ruta/privada/pruebas.env --test tests/mysql/conteos.integration.mjs
```

No ejecutar SQL 002 ni iniciar servicios en producción como consecuencia de recibir este paquete. Esta entrega prepara un núcleo revisable; el siguiente bloque debe integrar autenticación/sesión y lectura autorizada, después la interfaz y los demás escritores WMS. La publicación KPI y sus definiciones se validarán separadamente.
