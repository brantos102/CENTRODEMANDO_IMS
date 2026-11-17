# Candidato del 17 de noviembre de 2026

Esta entrega integra el visor WebGL propio, la captura rápida y masiva, PDF de análisis, etiquetas y conexión de ocupación SQL Server. Se instala sobre el corte operativo ya elegido; no vuelve a extraer ni sustituir capturas desde Google.

## Recibir desde GitHub en el servidor

Ejecutar en la terminal SSH de `enicolalde@apps`, dentro de `/home/enicolalde/bryan/centro_mando_ims`. No hace falta SCP de Windows.

La revisión se obtiene del commit recién descargado de GitHub. El bloque se copia completo; no contiene marcadores que deban reemplazarse. La clave es la misma del paquete privado de catálogos entregado anteriormente; se introduce oculta y no se añade al historial.

```bash
(
  set -euo pipefail
  cd /home/enicolalde/bryan/centro_mando_ims
  git fetch origin migracion/mysql-candidata-20261104
  imsRevision="$(git rev-parse --verify 'FETCH_HEAD^{commit}')"
  (
    read -r -s -p 'Clave privada del paquete de catálogos: ' IMS_CATALOGOS_CLAVE </dev/tty
    export IMS_CATALOGOS_CLAVE
    git show "$imsRevision:enterprise/tools/recibir-catalogos-github.mjs" |
      node --input-type=module - "$imsRevision" todos
  )
  git show "$imsRevision:enterprise/deploy/habilitar_centro.sh" |
    bash -s -- "$imsRevision"
)
```

El receptor autentica y verifica cada paquete y conserva cualquier ZIP existente diferente. En GitHub están cifrados; no se publican CSV, plano, coordenadas privadas ni la clave. Los archivos descifrados quedan en el directorio privado `centro_mando_ims_datos/entrada`. Al terminar la recepción, se ejecuta el instalador de esa misma revisión.

El instalador crea su propia versión aislada, ejecuta verificaciones, prepara las tablas y permisos propios, importa los catálogos y el layout y actualiza únicamente `centro-mando-ims-ensayo.service`. Conserva el acceso HTTPS por `8445` y el backend local por `3003`. Verifica el histórico esperado y revierte la versión del servicio si la actualización no se confirma. Las migraciones aditivas y los catálogos versionados se conservan durante esa reversión.

## Si el layout se cargó pero sigue la interfaz anterior

La carga de catálogos y layout precede a la activación de la revisión. Un resumen con `yaImportado: true` no acredita que el servicio se actualizó. Si la comprobación del perfil se detiene, la versión anterior continúa sirviendo sus pantallas.

Una vez recibidos los paquetes, reintentar solamente la actualización desde SSH:

```bash
(
  set -euo pipefail
  cd /home/enicolalde/bryan/centro_mando_ims
  git fetch origin migracion/mysql-candidata-20261104
  imsRevision="$(git rev-parse --verify 'FETCH_HEAD^{commit}')"
  git show "$imsRevision:enterprise/deploy/habilitar_centro.sh" |
    bash -s -- "$imsRevision"
)
```

El pool operativo reserva una de las cinco conexiones de su cuenta para comprobaciones. Si el servicio anterior ocupa las cinco, solo ese error de capacidad difiere la comprobación hasta el reinicio propio; los errores de credenciales, permisos o histórico siguen deteniendo la actualización. La revisión no se confirma sin completar la verificación.

El resumen correcto debe incluir `perfil_operacion_verificado: true`, `interfaz_actualizada: true`, `visor: "WEBGL_3D"`, `archivos_interfaz_verificados: 6` y la revisión instalada. Se comparan las huellas de HTML, JS, CSS y bibliotecas 3D servidas por HTTPS con los archivos de la revisión. Si hay una discrepancia o falla el perfil, se restaura la unidad anterior. Después del resultado correcto, recargar IMS con Ctrl+Shift+R.

## Layout físico y alcance de las medidas

- Las columnas P/Q/R se leen como largo, ancho y alto **en centímetros**. Las medidas originales quedan conservadas.
- BM usa las anclas trazadas del PDF de Quito; su ubicación es una aproximación del plano, no un levantamiento topográfico.
- `BM-A2`, `BM-B1`, etc. representan estanterías en planta baja.
- `MZ-1A` y `MZ-2A` comparten planta y se separan verticalmente por **210 cm**. Solo existen dos plantas; la planta alta también tiene 210 cm de altura.
- `MZJV` se representa como jaula de valores en planta alta.
- Los literales compuestos terminados en G, como `1AG` y `1BG`, identifican gavetas; `1G` sigue siendo el literal G.
- Para los conjuntos MZ de cuatro o cinco niveles, los huecos superiores pueden dibujarse a 30 o 40 cm para ajustarse al entrepiso. La ficha identifica estas alturas como **provisionales** y conserva el alto original del catálogo. No reduce gavetas que no caben.
- Las posiciones incompatibles con el hueco se muestran en un área separada para revisión. Las posiciones sin dimensiones positivas no generan volúmenes inventados.
- Los grupos sin ancla en el PDF permanecen en distribución provisional. B2 está separada de BM y usa el orden A, B/C, D/E, F/G hasta recibir su plano.

Progreso, alertas y ocupación son vistas diferentes. Un color de progreso no demuestra ocupación empresarial actual. La presencia representa selección reciente en IMS, no GPS ni la posición física confirmada de una persona.

## Conectar la ocupación de UIO

En **Centro de Mando → Conexiones y recordatorios → Ocupación UIO**, configurar:

| Dato | Valor |
|---|---|
| Motor de origen | SQL Server |
| Servidor | `192.168.4.12` |
| Instancia informativa | `DEPOTWMS` |
| Puerto | `1433` |
| Base de datos | La indicada por TI; vacío usa la predeterminada del usuario |
| Cuenta | Usuario con SELECT en `POSICION` y `view_web_estado_posicion` |

`DEPOTWMS` es el nombre de instancia; no se presupone que sea el nombre de base. Usuario y contraseña se introducen únicamente en el formulario privado. La conexión usa TLS. La confianza en un certificado interno requiere marcar la opción después de validarlo con TI.

Guardar y pulsar **Consultar y actualizar ocupación ahora**. La consulta es fija, basada en la recibida del usuario, y verifica que el puerto corresponda a DEPOTWMS. Rechaza respuestas vacías, incompletas o mayores de 50.000 filas y cuentas con escritura en POSICION. Un fallo conserva el corte anterior. La actualización automática cada cinco minutos es opcional.

Esta conexión no modifica la base empresarial ni el stock congelado, C1/C2/C3, observaciones o estados de los inventarios. GYE y TLF siguen pendientes de sus consultas y conexiones autorizadas.

## Autorizar correo y Calendar

1. Entrar a Google Cloud con la cuenta autorizada y crear o seleccionar el proyecto corporativo.
2. Habilitar **Gmail API** y **Google Calendar API**. Para leer los proyectos de origen, habilitar también **Apps Script API** y el acceso correspondiente de la cuenta a esos proyectos.
3. Configurar la pantalla de consentimiento; usar la modalidad interna si el proyecto pertenece a la organización. Si se usa modalidad externa de pruebas, añadir `bespinoza@itsanet.com` y considerar la caducidad de los tokens de prueba antes de producción.
4. Crear un cliente OAuth de tipo **Aplicación web** con el retorno exacto:
   `https://apps.flexnetuio.com:8445/api/centro/google/callback`.
5. Guardar ID y secreto en el formulario privado de Conexiones. Remitente: `bespinoza@itsanet.com`; calendario: `primary` o el calendario autorizado.
6. Pulsar la autorización y elegir esa misma cuenta. La conexión anterior se conserva si el reemplazo no se verifica.
7. Si se necesita cotejar el código actual, marcar el permiso opcional de lectura, volver a autorizar y pulsar **Leer y resguardar código actual de Google**. Se leen INTERFAZ, plantilla y Centro de Mando, sin modificar código, propiedades o despliegues. El contenido se resguarda cifrado; el resultado compartible contiene huellas y cobertura.

Las credenciales OAuth y las del usuario SQL no se proporcionaron en esta sesión. Esta entrega prepara sus flujos; no acredita una conexión real ya completada.

## Pruebas finales y pendientes

Usar los [manuales de operación y administración](MANUALES_IMS_20261117.md) y la [matriz de aceptación](ACEPTACION_IMS_20261117.md).

La lectura de los tres proyectos actuales de Google sigue pendiente de OAuth. Los IDs por sí solos no permiten verificar su código. Tampoco se declara completada la paridad absoluta de macros, fórmulas y automatizaciones de esas versiones actuales. Los libros exportados conservan las 30 columnas y los resultados calculados por el motor WMS implementado; editarlos fuera de IMS no reimporta automáticamente capturas.

El corte elegido conserva sus límites de cobertura y no incluye modificaciones posteriores realizadas en Google. El perfil de B2, las anclas ausentes y las medidas incompatibles requieren revisión física. La salida a producción queda sujeta a las pruebas reales y aprobación del usuario ya previstas.

## Manuales en PDF

- [Operación y administración](../docs/manuales/Manual_operacion_IMS_20261117.pdf)
- [Instalación y conexiones](../docs/manuales/Guia_instalacion_IMS_20261117.pdf)
- [Pruebas de aceptación](../docs/manuales/Pruebas_aceptacion_IMS_20261117.pdf)
