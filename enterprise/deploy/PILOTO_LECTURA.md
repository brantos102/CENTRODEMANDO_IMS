# Piloto de consulta del histórico trasladado

Esta etapa prepara una cuenta nueva de Centro de Mando, con lectura solo de los
inventarios del plan v4 ya trasladado. No sustituye al Centro de Mando de Google,
no publica KPI ni convierte el ensayo en la operación final. La autenticación es
independiente de RRHH; no importa PIN, contraseñas ni usuarios históricos.

## Preparación en el servidor

Ejecutar como `enicolalde` en `apps`, dentro de
`/home/enicolalde/bryan/centro_mando_ims`, sobre la revisión candidata revisada:

```bash
sudo -v
python3 enterprise/deploy/preparar_piloto.py --preparar \
  --correo 'CORREO_ELEGIDO' --plan-id 'SHA256_DEL_PLAN_TRASLADADO'
```

El programa vuelve a comprobar puertos 3003/8445 y referencias de configuración,
cuenta de migración, staging verificado, plan trasladado, conteos y ENTREGADO.
Si los puertos o nombres están ocupados, se detiene sin liberar puertos ni
reemplazar recursos. Requiere la carpeta privada y `migracion.env` del
inicializador; **no volver a ejecutar ese inicializador**.

Instala únicamente el esquema aditivo de autenticación 003 y crea en una
transacción el actor/credencial y sus permisos `puede_contar=0`. El usuario MySQL
`ims_cm_lector@127.0.0.1`, con máximo cinco conexiones, tiene SELECT sobre las
tablas nativas necesarias y la credencial, y permisos específicos para sesiones
y límite de intentos. No puede actualizar inventarios, cambiar permisos, leer
staging ni administrar otras bases. El modo HTTP de lectura rechaza POST de
conteos; la interfaz identifica el piloto y oculta la captura.

Se crea solo `centro_mando_ims_datos/piloto` (0700), con archivos 0600:

| Archivo | Uso |
| --- | --- |
| `solicitud.json` | Identidad y secretos para reanudar el mismo piloto. Privado. |
| `acceso_privado.txt` | Correo y contraseña nueva. Consultar en el servidor; no compartir en chat/Git. |
| `piloto.env` | Conexión de consulta y configuración futura de API. Privado. |
| `centro-mando-ims-ensayo.service` | Borrador systemd: loopback 3003, límites CPU/memoria y montaje de solo lectura de enterprise. |
| `centro-mando-ims-8445.conf` | Borrador Apache: Listen independiente 8445. |
| `centro-mando-ims-ensayo-ssl.conf` | Borrador HTTPS: proxy a 127.0.0.1:3003 y rutas de certificado informadas por el servidor. |

**No instala estos borradores en `/etc`, no arranca ni habilita servicios, no
recarga Apache y no abre puertos.** La bandera de API del archivo privado queda
lista para el futuro arranque explícito; no ejecuta dicho arranque. No cambia
permisos/propietarios de carpetas padre ni modifica otros proyectos. El resumen
no incluye claves, hashes de contraseña ni datos de filas.

Si hay una interrupción, conservar la carpeta privada. `--reanudar` con el mismo
correo y plan verifica/reusa la misma identidad sin rotar claves ni duplicar
permisos. No adopta cuentas preexistentes ajenas, no reactiva actores desactivados
ni repara permisos ampliados o archivos modificados. Una cuenta MySQL creada con
concesiones incompletas requiere revisión; no aumenta privilegios al reanudar.

## Publicación posterior

### Arranque del backend local

Tras confirmar el resumen de preparación, ejecutar en `apps` como `enicolalde`:

```bash
bash enterprise/deploy/arrancar_piloto.sh
```

Compara la unidad y el entorno con los borradores preparados, verifica puertos y
referencias nuevamente, rechaza unidades/complementos preexistentes y valida la
unidad con `systemd-analyze verify`. Crea exclusivamente su unidad en
`/etc/systemd/system`, carga la definición con `daemon-reload` y arranca solo
`centro-mando-ims-ensayo.service`. No habilita arranque al reiniciar.

Confirma `/salud` y que la escucha sea exactamente 127.0.0.1:3003 con el MainPID
del servicio. Esta prueba acredita arranque, conexión inicial a MySQL y respuesta
HTTP local; no acredita login de navegador, acceso externo ni TLS. Si falla luego
de solicitar arranque, intenta detener solo su servicio y conserva su unidad para
revisión. No repetirlo si la unidad ya existe; revisar primero su estado/registro.

No instala vhosts ni Listen, no recarga/reinicia Apache ni otro servicio y no
modifica cuentas o datos de inventario. El resultado local debe ser correcto antes
de publicar HTTPS. Para diagnóstico del servicio propio, usar
`sudo journalctl -u centro-mando-ims-ensayo.service -n 30 --no-pager`; no compartir
el archivo de entorno ni el archivo de acceso privado.

### HTTPS

Con el backend local confirmado, ejecutar desde la raíz de la revisión candidata:

```bash
sudo -v
python3 enterprise/deploy/publicar_piloto_https.py --activar --conteos-esperados 352
```

El número debe corresponder al resumen de permisos del ensayo. Comprueba unidad,
entorno de lectura, PID/puerto del backend, puerto 8445, módulos y certificado
vigente para `apps.flexnetuio.com`. Crea dos archivos y dos enlaces nuevos con
nombres propios de Apache; su ayudante privilegiado solo opera esas cuatro rutas.
Rechaza cualquier ruta preexistente y usa creación exclusiva, sin sobrescritura.
Guarda fuera de Git una fotografía de hashes de configuraciones existentes y los
dos archivos propios identificados con un nonce. No copia ni cambia certificados,
claves, archivos anteriores ni reglas de firewall.

Comprueba sintaxis antes/después de añadir el piloto y ejecuta solo
`systemctl reload apache2` (recarga gradual). Mantiene el backend en ejecución.
Valida localmente HTTPS con nombre/SNI y certificado configurado, página de salud,
bloqueo anónimo, login del lector, todos sus inventarios, primera línea, rechazo de
captura y revocación de sesión. La prueba TLS confía explícitamente en el
certificado ya configurado y verifica su huella; no usa `-k` ni desactiva hostname.
No acredita por sí sola confianza del navegador, DNS/NAT o acceso desde fuera.

Ante fallos de creación, sintaxis, recarga o acceso, retira solo archivos/enlaces
que coincidan con el contenido propio y su nonce. Antes de recargar de vuelta
comprueba sintaxis. Si alguno cambió o no puede confirmar la recuperación, se
detiene para revisión sin sobrescribirlo. Conserva el backend local y todos los
datos. No repetir la publicación si ya existen sus rutas; revisar el resultado.
No activa arranque automático del backend al reiniciar; sigue siendo un piloto.

Si el JSON indica `ok:true`, abrir `https://apps.flexnetuio.com:8445/` desde el
equipo del usuario. El correo/contraseña están en `acceso_privado.txt`, dentro de
la carpeta privada del piloto. Abrir ese archivo en el editor remoto para uso
personal; no pegarlo en chat ni incluirlo en Git. La aceptación del navegador y
el acceso externo deben comprobarse antes de dar disponibilidad por confirmada.

Antes de instalar el vhost, revisar en el servidor resumen, borradores,
puertos/configuraciones nuevamente, vigencia/nombre del certificado y sintaxis.
El certificado y su clave **no se copian ni modifican**. `/usr/bin/node` fue
informado por el servidor; confirmar su versión al arrancar. El aviso global
AH00558 no requiere editar configuraciones ajenas.

La instalación posterior usará nombres propios, probará primero el backend y
comprobará Apache antes de una recarga gradual. Nunca reiniciar IV_ITSANET, RRHH,
Data Sync ni MySQL para publicar el piloto. Si hay un fallo, retirar solo los
archivos/enlaces creados para el piloto y detener únicamente su unidad. El
arranque real, aislamiento systemd y TLS empresarial siguen pendientes de validar
en `apps`; una prueba sintética no los acredita.

La interfaz inicial consulta productos, ubicaciones y etapas. Faltan planillas
hijas pendientes, incidencias, delta final, otros flujos WMS, indicadores y
aceptación por roles antes de trasladar la operación. WTW sigue aplazado.

## Pruebas locales

`npm test` y `python3 -m unittest discover -s enterprise/tests -p '*_test.py'`
no requieren acceso al servidor. Las integraciones MySQL se ejecutan únicamente
en una base `centromando_ims_pruebas*` con `IMS_MYSQL_PRUEBAS=1`. La prueba adicional
de privilegios requiere un MySQL efímero, `IMS_PILOTO_SQL_PRUEBAS` apuntando al SQL
producido por `sql_cuenta`, y contraseñas sintéticas en
`IMS_MYSQL_ADMIN_PASSWORD`/`IMS_MYSQL_LECTOR_PASSWORD`. Si no se proporcionan, solo
esa prueba se omite. Nunca solicitar contraseñas administrativas corporativas
para ejecutar estas pruebas. La evidencia publicada corresponde al ensayo
completo con esa prueba habilitada y MySQL 8.0.46 real.
