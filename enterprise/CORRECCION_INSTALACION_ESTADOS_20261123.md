# Corrección de instalación: restricción de estados

El instalador de la revisión 6d4291d podía detenerse con «La restricción de estados difiere del esquema autorizado». MySQL puede presentar CHECK_CLAUSE con un prefijo de juego de caracteres y las dos comillas del literal escapadas, por ejemplo `_latin1\'EN_PROCESO\'`. La expresión regular anterior no reconocía ese formato y obtenía un conjunto vacío de estados.

El preparador reconoce ahora la expresión completa `estado IN (...)`, con comillas normales o escapadas y los prefijos de caracteres conocidos. Comprueba que la restricción corresponde a ims_op_inventario y está activada. Continúa aceptando únicamente los cuatro estados originales o esos mismos estados más CERRADO_SIN_CONSOLIDAR. Rechaza condiciones adicionales, otra columna, literales ambiguos y estados ajenos.

Si hace falta ampliarla, utiliza una única operación ALTER TABLE y vuelve a leer la restricción para confirmar el resultado. Una segunda ejecución comprueba el estado ya ampliado y no vuelve a modificarlo. No actualiza filas ni capturas.

La comprobación se reprodujo con MySQL real en una base sintética: el preparador Python recibió CHECK_CLAUSE con las comillas escapadas, amplió la restricción, conservó las filas, mantuvo ENFORCED=YES y rechazó un estado inválido. Se añadieron regresiones para las variantes de formato y los rechazos que deben conservarse.

Para reintentar, instalar esta revisión mediante enterprise/deploy/habilitar_centro.sh con su identificador completo de commit, publicado en la rama migracion/mysql-candidata-20261104. Incluye las mejoras de conteo, agenda, monitor y Google de 6d4291d. No requiere retirar la restricción ni ejecutar ALTER manualmente.

La instalación real todavía debe completarse en el servidor. La conciliación de los archivos de Google con incidencias continúa siendo un proceso independiente.
