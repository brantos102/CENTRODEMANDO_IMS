#!/usr/bin/env python3
"""Prepara un lector del ensayo y borradores de publicación; no inicia servicios."""
import argparse
import fcntl
import json
import os
import platform
import re
import secrets
import socket
import stat
import subprocess
import uuid
from pathlib import Path

APP = Path('/home/enicolalde/bryan/centro_mando_ims')
DATABASE = 'centromando_ims_ensayo'
DB_USER = 'ims_cm_lector'
ACCOUNT = "'ims_cm_lector'@'127.0.0.1'"
URL = 'https://apps.flexnetuio.com:8445'
LECTURA = ('ims_op_actor', 'ims_op_cliente', 'ims_op_inventario', 'ims_op_permiso',
           'ims_op_linea', 'ims_op_detalle_linea', 'ims_auth_usuario')
PRIVILEGIOS = {t: {'SELECT'} for t in LECTURA}
PRIVILEGIOS.update({'ims_auth_sesion': {'SELECT', 'INSERT', 'UPDATE'},
                   'ims_auth_limite': {'SELECT', 'INSERT', 'UPDATE', 'DELETE'}})


class PilotoError(Exception):
    pass


def exigir(ok, mensaje):
    if not ok:
        raise PilotoError(mensaje)


def privado(path, directorio=False):
    path = Path(path)
    exigir(path.resolve() == path and not path.is_symlink(), 'Ruta privada incompatible o enlazada.')
    info = path.stat()
    exigir(info.st_uid == os.geteuid() and stat.S_IMODE(info.st_mode) == (0o700 if directorio else 0o600)
           and (stat.S_ISDIR(info.st_mode) if directorio else stat.S_ISREG(info.st_mode)),
           'Propietario o permisos privados incompatibles: ' + str(path))
    return path


def escribir(path, contenido):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(contenido)
        f.flush()
        os.fsync(f.fileno())


def admin_mysql(sql):
    env = {k: v for k, v in os.environ.items() if not k.startswith('MYSQL')}
    result = subprocess.run(['sudo', '-n', 'mysql', '--no-defaults', '--protocol=SOCKET',
                             '--host=localhost', '--user=root', '--batch', '--skip-column-names', '--raw'],
                            input=sql, text=True, capture_output=True, env=env)
    exigir(result.returncode == 0, 'MySQL rechazó la preparación del piloto. Se conservan los recursos propios para revisar/reanudar; no se muestran claves ni SQL.')
    return [line.split('\t') for line in result.stdout.splitlines() if line]


def sql_cuenta(clave):
    exigir(bool(re.fullmatch('[a-f0-9]{64}', clave)), 'Clave MySQL generada incompatible.')
    sql = f"CREATE USER {ACCOUNT} IDENTIFIED BY '{clave}' WITH MAX_USER_CONNECTIONS 5;\n"
    for tabla, permisos in PRIVILEGIOS.items():
        sql += f"GRANT {', '.join(sorted(permisos))} ON `{DATABASE}`.`{tabla}` TO {ACCOUNT};\n"
    return sql


def verificar_grants(rows):
    vistos = {}
    uso = False
    for row in rows:
        line = row[0].replace('`ims_cm_lector`@`127.0.0.1`', ACCOUNT)
        if line in (f'GRANT USAGE ON *.* TO {ACCOUNT}', f'GRANT USAGE ON *.* TO {ACCOUNT} WITH MAX_USER_CONNECTIONS 5'):
            exigir(not uso, 'Declaración de cuenta repetida.')
            uso = True
            continue
        match = re.fullmatch(r'GRANT ([A-Z, ]+) ON `' + DATABASE + r'`\.`([a-z_]+)` TO ' + re.escape(ACCOUNT), line)
        exigir(match is not None and match[2] not in vistos, 'Los privilegios del lector no corresponden al piloto; no se ajustan automáticamente.')
        vistos[match[2]] = set(match[1].split(', '))
    exigir(uso and vistos == PRIVILEGIOS, 'Privilegios incompletos o ajenos al lector del ensayo.')


def conexion_lector(clave):
    env = {k: v for k, v in os.environ.items() if not k.startswith('MYSQL')}
    env['MYSQL_PWD'] = clave
    result = subprocess.run(['mysql', '--no-defaults', '--protocol=TCP', '--host=127.0.0.1', '--port=3306',
                             '--user=' + DB_USER, '--database=' + DATABASE, '--batch', '--skip-column-names'],
                            input='SELECT DATABASE(), CURRENT_USER();', text=True, capture_output=True, env=env)
    exigir(result.returncode == 0 and result.stdout.strip() == DATABASE + '\t' + DB_USER + '@127.0.0.1',
           'La cuenta MySQL de consulta no coincide con la configuración privada.')


def ejecutar_node(app, solicitud, aplicar):
    run = subprocess.run(['/usr/bin/node', str(app / 'enterprise/tools/preparar-piloto.mjs'),
                          '--preparar' if aplicar else '--validar'], input=json.dumps(solicitud),
                         text=True, capture_output=True)
    exigir(run.returncode == 0, 'El lector no pudo prepararse/verificarse. No se sobrescriben cuentas; conserva la carpeta piloto para revisión.')
    data = json.loads(run.stdout)
    exigir(data.get('ok') is True, 'Respuesta de preparación incompatible.')
    return data


def plantillas(app, carpeta):
    return {
        'piloto.env': f'MYSQL_HOST=127.0.0.1\nMYSQL_PORT=3306\nMYSQL_DATABASE={DATABASE}\nMYSQL_USER={DB_USER}\nMYSQL_PASSWORD={{clave}}\n'
                      f'IMS_MIGRACION_OPERATIVA=0\nIMS_API_HABILITADA=1\nIMS_SOLO_LECTURA=1\nIMS_HOST=127.0.0.1\nIMS_PORT=3003\nIMS_PUBLIC_URL={URL}\n',
        'centro-mando-ims-ensayo.service': f'''[Unit]
Description=Centro de Mando IMS - piloto de consulta
After=network.target mysql.service
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=simple
User=enicolalde
WorkingDirectory={app}/enterprise
EnvironmentFile={carpeta}/piloto.env
ExecStart=/usr/bin/node --max-old-space-size=256 src/servir.mjs
Restart=on-failure
RestartSec=5
TimeoutStopSec=20
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=tmpfs
BindReadOnlyPaths={app}/enterprise
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ProtectProc=invisible
CapabilityBoundingSet=
RestrictSUIDSGID=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
MemoryHigh=384M
MemoryMax=512M
CPUQuota=50%
TasksMax=32
LimitNOFILE=1024

[Install]
WantedBy=multi-user.target
''',
        'centro-mando-ims-8445.conf': '''# Archivo de puertos exclusivo del piloto.
Listen 8445 https
''',
        'centro-mando-ims-ensayo-ssl.conf': '''<VirtualHost *:8445>
    ServerName apps.flexnetuio.com
    SSLEngine on
    SSLCertificateFile /etc/ssl/certs/apps.flexnetuio.com.crt
    SSLCertificateKeyFile /etc/ssl/private/apps.flexnetuio.com.key
    SSLProtocol -all +TLSv1.2 +TLSv1.3
    ProxyRequests Off
    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    ProxyPass / http://127.0.0.1:3003/ connectiontimeout=5 timeout=30
    ProxyPassReverse / http://127.0.0.1:3003/
    Header always set X-Robots-Tag "noindex, nofollow"
    LimitRequestBody 16384
    ErrorLog ${APACHE_LOG_DIR}/centro-mando-ims-ensayo-error.log
    CustomLog ${APACHE_LOG_DIR}/centro-mando-ims-ensayo-access.log combined
</VirtualHost>
'''}


def preparar(app, correo, plan_id, reanudar=False, admin=admin_mysql, node=ejecutar_node, conectar=conexion_lector):
    app = Path(app)
    exigir(app.resolve() == app and app.is_dir() and app.stat().st_uid == os.geteuid(), 'Ruta de código incompatible.')
    datos = privado(app.parent / 'centro_mando_ims_datos', True)
    privado(datos / 'config', True)
    migracion = privado(datos / 'config/migracion.env')
    config = dict(line.split('=', 1) for line in migracion.read_text().splitlines() if line and not line.startswith('#'))
    exigir(config.get('MYSQL_DATABASE') == DATABASE and config.get('MYSQL_HOST') == '127.0.0.1'
           and config.get('MYSQL_PORT') == '3306' and config.get('MYSQL_USER') == 'ims_cm_migracion'
           and re.fullmatch('[a-f0-9]{64}', config.get('MYSQL_PASSWORD', '')), 'La configuración no es la del ensayo esperado.')
    exigir(bool(re.fullmatch('[a-f0-9]{64}', plan_id)) and bool(re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', correo))
           and len(correo) <= 254, 'Correo o plan inválido.')
    carpeta = datos / 'piloto'
    cuentas = admin(f"SELECT User,Host,max_user_connections FROM mysql.user WHERE User='{DB_USER}';")
    if not reanudar:
        exigir(not os.path.lexists(carpeta), 'La carpeta piloto ya existe. No se reemplaza: utiliza --reanudar con el mismo correo y plan tras revisar el resultado anterior.')
        exigir(not cuentas, 'La cuenta MySQL ya existe; no se adopta ni se cambia su contraseña.')
        solicitud = {'migracion': config, 'lector': {'planId': plan_id, 'actorId': str(uuid.uuid4()),
                     'correo': correo.lower(), 'nombre': 'Revisión del piloto', 'contrasena': secrets.token_urlsafe(24)},
                     'clave_mysql': secrets.token_hex(32), 'version': 1}
        # Validación previa sin DDL, cuentas, permisos ni archivos nuevos.
        node(app, solicitud, False)
        carpeta.mkdir(mode=0o700)
        escribir(carpeta / 'solicitud.json', json.dumps(solicitud, ensure_ascii=False) + '\n')
    else:
        privado(carpeta, True)
        solicitud = json.loads(privado(carpeta / 'solicitud.json').read_text())
        exigir(solicitud.get('version') == 1 and solicitud.get('migracion') == config
               and solicitud['lector']['planId'] == plan_id and solicitud['lector']['correo'] == correo.lower(),
               'La solicitud privada no corresponde al mismo piloto.')
        exigir(not cuentas or cuentas == [[DB_USER, '127.0.0.1', '5']], 'Hay otra cuenta o límite con el mismo nombre; no se modifica.')
    fd = os.open(carpeta / 'preparacion.lock', os.O_WRONLY | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as lock:
        privado(carpeta / 'preparacion.lock')
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise PilotoError('Otra preparación del piloto está activa.')
        resultado = node(app, solicitud, True)
        if not cuentas:
            admin(sql_cuenta(solicitud['clave_mysql']))
        exigir(admin(f"SELECT User,Host,max_user_connections FROM mysql.user WHERE User='{DB_USER}';")
               == [[DB_USER, '127.0.0.1', '5']], 'Cuenta o límite MySQL incompatibles.')
        verificar_grants(admin('SHOW GRANTS FOR ' + ACCOUNT + ';'))
        conectar(solicitud['clave_mysql'])
        archivos = plantillas(app, carpeta)
        archivos['piloto.env'] = archivos['piloto.env'].replace('{clave}', solicitud['clave_mysql'])
        archivos['acceso_privado.txt'] = f"URL: {URL}\nCorreo: {correo.lower()}\nContraseña: {solicitud['lector']['contrasena']}\nRol: solo lectura\n"
        for nombre, contenido in archivos.items():
            destino = carpeta / nombre
            if os.path.lexists(destino):
                exigir(privado(destino).read_text() == contenido, 'Archivo del piloto modificado; no se sobrescribe: ' + nombre)
            else:
                escribir(destino, contenido)
        return {**resultado, 'cuenta_mysql': DB_USER, 'configuracion_lista': True,
                'directorio_privado': str(carpeta), 'aplicacion_activada': False, 'apache_modificado': False,
                'puertos_abiertos': [], 'publicacion_kpi': False, 'otros_proyectos_modificados': False}


def preflight_servidor():
    exigir(platform.system() == 'Linux' and socket.gethostname() == 'apps'
           and os.geteuid() != 0 and __import__('pwd').getpwuid(os.geteuid()).pw_name == 'enicolalde',
           'Ejecuta en apps como enicolalde, sin sudo delante de python3.')
    exigir(Path(__file__).resolve() == APP / 'enterprise/deploy/preparar_piloto.py', 'Código fuera de la carpeta exclusiva.')
    exigir(Path('/usr/bin/node').is_file(), 'Falta /usr/bin/node.')
    # Comprobar también IPv6; ningún bind, kill, restart ni reserva de puertos.
    run = subprocess.run(['ss', '-H', '-lnt', '( sport = :3003 or sport = :8445 )'], text=True, capture_output=True)
    exigir(run.returncode == 0 and not run.stdout.strip(), '3003 o 8445 están ocupados. No se detiene ningún servicio.')
    refs = subprocess.run(['sudo', '-n', 'grep', '-RIlE', '--include=*.conf', '--include=*.service',
                           '--include=*.socket', '(^|[^0-9])(3003|8445)([^0-9]|$)',
                           '/etc/apache2', '/etc/systemd/system', '/lib/systemd/system'], text=True, capture_output=True)
    exigir(refs.returncode == 1 and not refs.stdout.strip(),
           '3003/8445 tienen referencias de configuración o la comprobación no pudo completarse. No se modifica nada.')
    for path in ('/etc/systemd/system/centro-mando-ims-ensayo.service',
                 '/etc/apache2/conf-available/centro-mando-ims-8445.conf',
                 '/etc/apache2/sites-available/centro-mando-ims-ensayo-ssl.conf'):
        exigir(not os.path.lexists(path), 'Ya existe configuración publicada del piloto: ' + path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preparar', action='store_true', required=True)
    parser.add_argument('--correo', required=True)
    parser.add_argument('--plan-id', required=True)
    parser.add_argument('--reanudar', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    preflight_servidor()
    print(json.dumps(preparar(APP, args.correo, args.plan_id, args.reanudar), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (PilotoError, OSError, ValueError, KeyError) as exc:
        if isinstance(exc, PilotoError):
            print('Detenido: ' + str(exc), file=__import__('sys').stderr)
        else:
            print('Detenido: preparación incompleta. Conserva el directorio privado para revisión; no compartas sus credenciales.', file=__import__('sys').stderr)
        raise SystemExit(1)
