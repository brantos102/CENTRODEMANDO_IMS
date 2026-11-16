# Paquete de catálogos para traslado al servidor

`catalogos_ims_privados_20261116.zip.imsenc` contiene el ZIP de los CSV entregados por el usuario, cifrado con AES-256-GCM y una clave aleatoria de 256 bits. **La clave se entrega por el chat privado y no está en este repositorio.** Este archivo no se abre directamente con un descompresor ZIP.

El receptor `enterprise/tools/recibir-catalogos-github.mjs` usa únicamente módulos estándar de Node, verifica autenticidad y la huella del ZIP original, y lo guarda con permisos 600 en la entrada propia del proyecto. Requiere ejecutar como `enicolalde` en `apps`, desde `/home/enicolalde/bryan/centro_mando_ims`, con una revisión fijada y verificada frente a FETCH_HEAD. No reemplaza un archivo anterior distinto, no consulta SQL ni reinicia servicios.

Tras recuperar el ZIP se utiliza el lanzador normal, que valida las huellas de cada CSV antes de cargar los catálogos. Los originales en claro se mantienen en la carpeta privada, fuera de Git.

SHA-256 del ZIP recuperado: `f5470be54fb2ed8778a51b09a1392f6c6c972dd022d4dfabab08c1e83cd3c70c`.
