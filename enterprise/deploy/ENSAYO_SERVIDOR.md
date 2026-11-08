# Preparación aislada del servidor empresarial

Esta preparación crea únicamente un espacio de ensayo y su cuenta MySQL. No importa datos, no inicia la API, no ocupa puertos, no cambia Apache/systemd ni sustituye la operación de Google. La aplicación empresarial completa y el corte de producción siguen pendientes.

## Alcance fijo

- Código: `/home/enicolalde/bryan/centro_mando_ims`.
- Datos privados: `/home/enicolalde/bryan/centro_mando_ims_datos` (0700), fuera del repositorio.
- Base: `centromando_ims_ensayo`, MySQL local 8.0 existente.
- Cuenta de migración: `ims_cm_migracion@127.0.0.1`, con un máximo de dos conexiones.
- Permisos: SELECT, INSERT, UPDATE, CREATE, INDEX y REFERENCES únicamente en esa base. No es la cuenta de la futura API.

El código se descarga en una carpeta propia nueva, con umask 077, y se fija a una revisión revisada. No ejecutar Git dentro de IV_ITSANET, RRHH o de otro proyecto. Si la carpeta de código ya existe, no sobrescribirla, borrarla ni ejecutar reset/clean para repetir la preparación: revisar su contenido primero.

## Ejecución

En el servidor `apps`, como `enicolalde`, desde la raíz de esa copia del código:

```bash
sudo -v
python3 enterprise/deploy/inicializar_ensayo.py --crear-ensayo
```

`sudo -v` autentica al administrador para las consultas MySQL; no ejecutar el script completo con sudo. El script exige el servidor, usuario y ruta previstos. Usa el cliente MySQL local por socket con sudo solo para crear la base/cuenta, y comprueba la cuenta nueva por TCP contra 127.0.0.1:3306.

Se detiene antes de crear recursos si ya existe la base, el nombre de cuenta en cualquier host o la carpeta privada, o si los datos quedarían bajo Git. No utiliza CREATE IF NOT EXISTS para adoptar recursos anteriores. La contraseña se genera localmente y se guarda exclusivamente en `centro_mando_ims_datos/config/migracion.env` (0600). No se muestra, no se envía en argumentos de comandos y no se debe compartir. El informe `preparacion_para_compartir.json` contiene únicamente metadatos del resultado.

La creación de base/cuenta utiliza DDL de MySQL, que no es transaccional. Ante un fallo parcial se conservan los recursos propios y el archivo privado para revisión; no hay limpieza mediante DROP ni restablecimiento de contraseñas al reintentar. No borrar recursos a ciegas para volver a ejecutar.

La configuración deja `IMS_API_HABILITADA=0` e `IMS_MIGRACION_OPERATIVA=0`. Los valores futuros 3003/8445 no reservan ni abren esos puertos; su disponibilidad se comprobará al preparar el arranque. La preparación no cambia los puertos ni los servicios existentes.

## Validación

- Siete pruebas Python para protección de rutas/servidor, repositorios padre, recursos existentes, permisos y contraseñas, fallos parciales y conservación de otro proyecto; 19 pruebas Python en total.
- Ensayo real en MySQL 8.0.46 local temporal: autenticación de la nueva cuenta, DDL 001–006 con permisos restringidos (20 tablas), límite de dos conexiones, denegación de lectura en otra base y denegación de DROP/ALTER. La base ajena sintética conservó su registro y la carpeta padre sus permisos.
- El ensayo no contactó el servidor empresarial. El comando en Linux debe producir su propio informe antes de transferir datos. No compartir `migracion.env` ni el corte privado.
