# Revisión de la candidata recibida el 29 de octubre de 2026

Origen: ZIP `IMS_CANDIDATA_REVISION_20261029_145801_533.zip`, 46 archivos. Es el árbol de trabajo de la candidata integrada, no un despliegue. El ZIP original se conserva como respaldo. No contiene `.git`, `.clasp.json`, `.env` ni node_modules. No se ejecutaron utilidades administrativas ni llamadas a ERP, Drive, correo o Calendar.

## Resultado y correcciones locales

Las 73 pruebas existentes se ejecutaron y aprobaron. Se añadieron 18 pruebas significativas y el total de la aplicación pasó a 91, todas aprobadas. Se compiló el conjunto de siete módulos JS permitidos por la lista de 18 archivos de clasp; no hay funciones globales duplicadas. Se comprobó la sintaxis JS del asistente y WebApp_JS.

1. **Pérdida de stock al combinar clientes.** La clave en ITSANET_MULTI omitía CLIENTE, despacho y partida: dos clientes con el mismo SKU/lote/serie/posición perdían la segunda fila y su cantidad. Reproducido con pruebas de pérdida de filas y cantidades. Se usa identidad por cliente ERP y dimensiones logísticas; dos credenciales coincidentes excluyen solo copias completas y una contradicción de valores para la misma identidad detiene la creación en vez de elegir silenciosamente.
2. **Agrupación UIO/GYE incompleta.** La extracción con alias podía agrupar clientes distintos; la de series omitía despacho/partida y otras dimensiones. Se reutiliza un helper puro de identidad con JSON que conserva cliente, SKU, serie cuando aplica, lote, despacho, partida, categoría, estado, posición y unidad. Se conserva el ajuste de una unidad por fila con serie y la suma de registros sin serie de la misma identidad. Estos criterios requieren aceptación con muestras ERP reales antes de publicarse; las pruebas locales no consultan ERP.
3. **Sede no persistida al crear.** El asistente enviaba la selección para extraer stock, pero no en el payload final, y ambos caminos de creación omitían SEDE. Se añade sede al payload y a la columna F existente de PANEL DE CONTROL. Quito es el valor por defecto para llamadas antiguas y las sedes inválidas se rechazan antes de crear. No se modifica ningún registro histórico.
4. **Cabecera no reconocida confundida con datos SKU vacíos.** El modo fijo descartaba campos desconocidos y luego reportaba cada SKU vacío. Se detecta la falta del encabezado PRODUCTO durante la alineación y se informa por archivo sin cambiar el esquema. No acepta un producto vacío como válido ni adivina alias. El usuario ya corrigió FLUKE y su incorporación se verificó en el XLSX vigente.

INVENTARIOS sigue A:AD (30), REGISTRO sigue A:O (15) y la procedencia sigue en notas. IBM y VENTURA conservan sus escenarios de prueba. SUPABASE.js y .claspignore no se modificaron. `enterprise/` está excluido del despliegue Apps Script.

## Base de la migración

La fuente es el Google Sheets actualizado, no Supabase. Se preparó `enterprise/` con exportador de copia íntegra y manifiesto, validador, esquema MySQL de staging e importador transaccional. No es un backend empresarial completo ni sustituye todavía Apps Script.

Se verificó el exportador contra las 19 hojas del XLSX vigente: 277.731 filas brutas, con 100.835 de inventario y 64.486 de registro. Se conservan texto original, notas, estilos y archivo fuente, sin conversiones numéricas que pierdan precisión. No se elimina ninguna repetición por SKU/código/línea. Los paquetes privados de datos no se incluyen en el ZIP de código.

El importador tiene 9 pruebas de protocolo/transacción con conexión simulada y el exportador 5 pruebas. El DDL y el driver MySQL están pendientes de validación en un motor real. No se han instalado en el servidor, creado bases, abierto puertos ni activado servicios.

## Pendientes que impiden declarar la migración terminada

- Sustituir llamadas `google.script.run` y servicios SpreadsheetApp, DriveApp, Session, PropertiesService, ScriptApp y otros por servicios HTTP, almacenamiento MySQL, sesión y trabajos propios. Las APIs `api/` y `web/` actuales siguen siendo consultas sobre Supabase.
- Diseñar/probar tablas de operación y vistas Power BI 30/15 desde las reglas de la fuente actual. Las tablas de staging solo conservan la copia y su trazabilidad.
- Credenciales ERP y configuración en ScriptProperties no vienen en el ZIP ni en el libro. Deben transferirse mediante el mecanismo privado del servidor, sin repositorio ni chat.
- La selección de sede es enrutamiento de stock, no una política completa de permisos por sede. Validar roles y pertenencia en backend. El panel del libro disponible contiene UIO y una fila sin sede; no permite atribuir todos los históricos a GYE o certificar sus datos.
- Revisar el comportamiento de inventario multi-cliente cuando una credencial falla: el código conserva un reporte de errores y puede continuar con otros clientes. La aceptación operativa debe establecer si se permite un resultado parcial o se debe bloquear toda la selección; no se presentó esa política como resuelta.
- Permanecen 3.183 líneas con CLIENTE vacío, texto en campos numéricos de REGISTRO y las incidencias de KPI documentadas en el análisis del libro. La importación conserva los originales y no los rellena como cero ni asigna cliente/sede por inferencia.
- Confirmar 8445 local, configuraciones y accesibilidad externa. La URL propuesta es `https://apps.flexnetuio.com:8445/` con futuro backend `127.0.0.1:3003`. No usar 108443, 118443 ni 128443: exceden 65535.
- Crear un entorno MySQL exclusivo, probar restauración/importación y contrastar datos/roles/flujos; planificar delta final y reversión que conserve operaciones nuevas. Google sigue siendo el escritor durante esta preparación.

## Entrega y límite de publicación

Los cambios están únicamente en la copia aislada de revisión. No se hizo commit, push, merge a codigo-en-vivo ni clasp push/deploy. No ejecutar esos comandos sobre producción como consecuencia de esta entrega. El próximo paso es validar la candidata y el entorno separado, no sustituir las aplicaciones existentes.

## Ampliación: regla Entregado e históricos

La revisión posterior confirmó 363 archivos (348 Entregado y 15 En Proceso). Se añadió comparación exacta de Entregado en la selección del núcleo y cuatro pruebas que conservan los archivos pendientes fuera del consolidado; total de aplicación: 95 aprobadas. Se añadieron dos pruebas de política del modelo nuevo: total herramientas Node 11 y Python 5. Véase el documento de arquitectura para la preservación de pendientes, históricos, portal por cliente y los proyectos inventarios_uio/Interfaz pendientes de recibir.
