# Crear inventarios nativos desde ERP

Entrega del 10 de noviembre de 2026. Las capturas corporativas recibidas confirman BELIA con 485 líneas/66.818 unidades y ALU + ALU SWAP con 956 líneas/17.357,08 unidades. Esta entrega utiliza las extracciones de `/erp` para crear inventarios propios de ensayo, preservando cuenta y código ERP por línea. Google continúa siendo el sistema vigente hasta aceptar la migración completa y conciliar el corte final.

## Flujo disponible

1. Extraer stock por cuentas/SKU o por posiciones de toda la sede. Revisar fecha, selección, líneas y unidades.
2. Completar código literal DDMMAA_CLIENTE, fecha de inventario, responsable y fecha programada opcional. La fecha no se deduce del código.
3. Pulsar **Crear inventario y habilitar conteo**. La solicitud contiene identificadores y totales revisados; nunca existencias, credenciales ni asociaciones de clientes enviadas por el navegador.
4. Abrir el inventario creado. El creador recibe supervisión sobre sus clientes y puede asignar cuentas propias, operar conteos y consultar análisis WMS V124 mediante los flujos nativos existentes. La fecha programada queda en el registro nativo; este paso no escribe en el cronograma de Google.

La creación utiliza la consulta completa guardada por el servidor, aunque el navegador solo muestre una página. Una consulta vencida, incompleta, sin stock, ajena o con un cliente sin asociación inequívoca no crea inventarios. La extracción es una fotografía tomada al consultar, no una segunda lectura del ERP al crear; las cuentas se obtuvieron secuencialmente. Para existencias más recientes se debe extraer de nuevo.

## Integridad, procedencia y acceso

Una transacción guarda inventario, clientes, permisos propios, stock, procedencia y auditoría. Antes de activar para conteo, compara filas, numeración, unidades y cada campo leído de MySQL con la extracción original. Un fallo revierte el conjunto. El stock se cierra al terminar; los conteos humanos comienzan vacíos, sin copiar depot al conteo. No se generan KPI durante esta entrega.

La tabla aditiva `ims_erp_inventario` conserva consulta, actor/operación, fecha de extracción, selección, cuentas, totales y huella del contenido. `ims_erp_linea` vincula cada línea nativa con referencia, etiqueta de credencial, código ERP real y nombre de cliente. No almacena usuario, contraseña, token o respuesta cruda del proveedor. No modifica el contrato de INVENTARIOS/REGISTRO de Power BI.

ALU y ALU SWAP conservan el cliente de negocio ALU, con cuenta y código ERP separados por línea. Un mismo SKU/posición en cuentas diferentes conserva líneas independientes. La vista nativa presenta esas cuentas junto a cada línea; no se necesita acceso general al ERP para consultar procedencia de las líneas que el usuario ya tiene autorizadas. Una petición que mezcla líneas autorizadas y ajenas se rechaza completa.

ADMIN/SUPERVISOR vigente en la sede puede crear desde sus propias consultas. El inventario nuevo concede supervisión solamente a su creador; no activa usuarios históricos, no importa identidades de RRHH y no concede permisos a clientes externos automáticamente. Los lectores y operadores usan los permisos nativos por cliente ya existentes. Se mantiene la regla de series físicas del WMS nativo: una serie no se registra dos veces dentro del mismo cliente e inventario; coincidencias múltiples requieren elegir una línea.

Las claves únicas de actor/operación y actor/consulta evitan dos inventarios por reintento o doble envío de la misma extracción. La confirmación persistida se busca antes de pedir la caché: se recupera incluso tras reiniciar el servidor. Reutilizar el ID con otra solicitud se rechaza. El navegador resguarda solo actor y solicitud de creación en sessionStorage, sin stock ni credenciales. Si se pierde la respuesta, recargar y usar **Recuperar confirmación de creación**; no generar otra operación. Si el almacenamiento está bloqueado, la consulta sigue disponible y la creación no se envía sin resguardo.

La interfaz bloquea la creación durante una confirmación pendiente. La caché conserva su caducidad de diez minutos; una operación que nunca se confirmó y cuya extracción expiró exige volver a extraer. Una creación confirmada continúa recuperándose desde SQL, aunque la caché desaparezca. El código de inventario ya usado en la sede se rechaza en la revisión previa; la protección contra duplicados se basa en los identificadores de consulta/operación, no en un nombre de archivo usado como identidad.

## Preparación y actualización aisladas

El actualizador requiere una revisión Git fijada, limpia, en `centro_mando_ims_datos/preparaciones/<revision>/codigo` y el registro privado que ya existe en `ERP_LECTURA_5b24e0016a134b1e9aae96f878faf9ff/registro_erp_runtime_NO_COMPARTIR.json`. El archivo original permanece intacto. Se prepara un entorno nuevo por revisión con la habilitación adicional `IMS_ERP_CREACION=1`; el entorno de la versión de consulta anterior no se sobrescribe.

```bash
bash enterprise/deploy/preparar_y_activar_creacion_erp.sh \
  '/home/enicolalde/bryan/centro_mando_ims_datos/ERP_LECTURA_5b24e0016a134b1e9aae96f878faf9ff/registro_erp_runtime_NO_COMPARTIR.json'
```

El preparador agrega las dos tablas únicamente en `centromando_ims_ensayo`. Verifica columnas, tipos, claves, referencias, reglas y restricciones antes de habilitar su uso; no altera ni sustituye tablas existentes incompatibles. Agrega los nombres de negocio confirmados NOKIA, FOC 5G y MOD 2024 solo cuando no existe ya una coincidencia exacta y única. Conserva todos los IDs y nombres existentes; un catálogo ambiguo detiene la preparación. La cuenta de migración realiza estas altas; el usuario SQL operativo continúa sin INSERT en el catálogo.

La ampliación del perfil operativo es únicamente SELECT/INSERT sobre esas dos tablas nuevas. No concede UPDATE, DELETE, DDL o privilegios globales sobre ellas. Admite reanudar sus propios dos GRANT parciales y rechaza perfiles que tienen otros privilegios. Permanecen las trece protecciones SQL anteriores del histórico, stock y conteos registrados.

Después de pasar pruebas y preparar dependencias, actualiza solo `centro-mando-ims-ensayo.service`, con un reinicio breve, backend `127.0.0.1:3003` y HTTPS existente `8445`. Conserva Apache, firewall, puertos vecinos, MySQL global, otros proyectos y Google. Verifica los 352 conteos históricos/97.822 líneas, login/logout, metadatos de 24 conexiones y habilitación de creación. El despliegue no crea un inventario de prueba ni consulta todas las APIs.

La recuperación automática intenta restaurar y comprobar la unidad anterior si falla la nueva versión. Las tablas, altas de catálogo y permisos aditivos no se borran al restaurar: así se conservan posibles creaciones ya confirmadas. No usar comandos de limpieza o DROP para revertir la interfaz. Los inicializadores antiguos que esperan el perfil sin las dos tablas nuevas se detendrán ante su ampliación; las actualizaciones posteriores deben conservar el modo de creación y verificar el perfil completo.

## Comprobación corporativa pendiente

La creación se probó con Node 22.23.3, MySQL 8.0.46, stock sintético y Chromium. Incluye varios clientes por posiciones, varias cuentas del mismo cliente, carga de 5.000 líneas, verificación íntegra, fallo intermedio, contenido SQL alterado, doble envío, confirmación perdida y lector con permisos parciales. Ninguna credencial real o inventario corporativo se importó desde el entorno de desarrollo.

Después de activar esta entrega, recargar `/erp`, extraer un SKU conocido para un inventario identificado como PRUEBA, revisar líneas/unidades y crearlo. Comprobar su procedencia y un conteo cero desde Operación antes de usarlo con más operadores. FINI continúa pendiente por HTTP 401. La paridad completa del Centro de Mando, exportaciones/reportes para clientes, aceptación del resto de reglas operativas y conciliación del delta final siguen pendientes; WTW permanece aplazado.
