#!/usr/bin/env python3
"""Crea únicamente el espacio de ensayo y un usuario MySQL de migración."""
import json
import os
import platform
import re
import secrets
import socket
import stat
import subprocess
import sys
from pathlib import Path

APP = Path('/home/enicolalde/bryan/centro_mando_ims')
DATABASE = 'centromando_ims_ensayo'
USER = 'ims_cm_migracion'
ACCOUNT = "'ims_cm_migracion'@'127.0.0.1'"


class PreparacionError(Exception):
    pass


def exigir(condicion, mensaje):
    if not condicion:
        raise PreparacionError(mensaje)


def ejecutar_mysql(args, sql, env=None):
    result = subprocess.run(args, input=sql, text=True, capture_output=True, env=env)
    if result.returncode:
        # No repetir SQL ni mensajes que puedan contener datos de autenticación.
        codigo = re.search(r'ERROR (\d+)', result.stderr or '')
        raise PreparacionError('MySQL local rechazó la operación' +
                               (' (código ' + codigo.group(1) + ')' if codigo else '') + '.')
    return [line.split('\t') for line in result.stdout.splitlines() if line]


def admin_mysql(sql):
    return ejecutar_mysql(['sudo', '-n', 'mysql', '--protocol=SOCKET', '--host=localhost',
                           '--batch', '--skip-column-names', '--raw'], sql)


def verificar_conexion(clave):
    rows = ejecutar_mysql(['mysql', '--protocol=TCP', '--host=127.0.0.1', '--port=3306',
                           '--user=' + USER, '--database=' + DATABASE, '--batch',
                           '--skip-column-names', '--raw'],
                          'SELECT DATABASE(), CURRENT_USER();',
                          env={**os.environ, 'MYSQL_PWD': clave})
    exigir(rows == [[DATABASE, USER + '@127.0.0.1']], 'La conexión no utiliza la cuenta exclusiva.')


def preparar(app, admin=admin_mysql, verificar=verificar_conexion):
    app = Path(app)
    exigir(app.is_absolute() and app.resolve() == app and app.is_dir(), 'Ruta de código incompatible o con enlaces simbólicos.')
    exigir(app.stat().st_uid == os.geteuid(), 'El código debe pertenecer al usuario que ejecuta la preparación.')
    exigir((app / 'enterprise/package.json').is_file(), 'Falta el código candidato de enterprise.')
    privado = app.parent / 'centro_mando_ims_datos'
    exigir(not os.path.lexists(privado), 'La carpeta privada ya existe; no se modifica ni se reutiliza automáticamente.')
    for padre in [privado.parent, *privado.parent.parents]:
        git = padre / '.git'
        exigir(not (git.is_file() or git.is_symlink() or os.path.lexists(git / 'HEAD')),
               'Los datos privados deben quedar fuera de cualquier repositorio Git.')

    version = admin('SELECT VERSION();')
    exigir(len(version) == 1 and version[0][0].startswith('8.0.'), 'Se requiere MySQL 8.0 local.')
    exigir(not admin("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='" + DATABASE + "';"),
           'La base de ensayo ya existe; no se modifica.')
    exigir(not admin("SELECT User FROM mysql.user WHERE User='" + USER + "';"),
           'El nombre de usuario MySQL ya existe; no se cambian contraseñas ni permisos.')

    # Todo lo creado es hijo de una carpeta nueva. No chmod/chown sobre padres,
    # proyectos existentes, Apache, systemd o configuraciones globales.
    privado.mkdir(mode=0o700)
    for name in ('config', 'entrada', 'respaldos'):
        (privado / name).mkdir(mode=0o700)
    clave = secrets.token_hex(32)
    configuracion = privado / 'config/migracion.env'
    fd = os.open(configuracion, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write('MYSQL_HOST=127.0.0.1\nMYSQL_PORT=3306\nMYSQL_DATABASE=' + DATABASE +
                '\nMYSQL_USER=' + USER + '\nMYSQL_PASSWORD=' + clave +
                '\nIMS_MIGRACION_OPERATIVA=0\nIMS_API_HABILITADA=0\nIMS_HOST=127.0.0.1\n'
                'IMS_PORT=3003\nIMS_PUBLIC_URL=https://apps.flexnetuio.com:8445\n')
    exigir(stat.S_IMODE(configuracion.stat().st_mode) == 0o600, 'Permisos del archivo privado incompatibles.')

    # Sin IF NOT EXISTS: una colisión detiene el lote en vez de adoptar una base
    # o cuenta ajenas. No hay DROP, ALTER, FLUSH ni operaciones sobre otros datos.
    admin('CREATE DATABASE `' + DATABASE + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;\n'
          'CREATE USER ' + ACCOUNT + " IDENTIFIED BY '" + clave + "' WITH MAX_USER_CONNECTIONS 2;\n"
          'GRANT SELECT, INSERT, UPDATE, CREATE, INDEX, REFERENCES ON `' + DATABASE + '`.* TO ' + ACCOUNT + ';\n')
    grants = admin('SHOW GRANTS FOR ' + ACCOUNT + ';')
    exigir(grants and all((line[0].startswith('GRANT USAGE ON *.* TO ') or
                           (' ON `' + DATABASE + '`.* TO ') in line[0]) for line in grants),
           'La cuenta tiene permisos distintos de los previstos; revisar sin modificar otras cuentas.')
    verificar(clave)
    resumen = {'ok': True, 'mysql_version': version[0][0], 'base_creada': DATABASE,
               'usuario_creado': USER, 'host_usuario_mysql': '127.0.0.1', 'max_conexiones_usuario': 2,
               'conexion_mysql_verificada': True, 'directorio_privado': str(privado),
               'configuracion_privada': str(configuracion), 'datos_importados': False,
               'aplicacion_activada': False, 'apache_modificado': False, 'puertos_abiertos': [],
               'otros_proyectos_modificados': False}
    reporte = privado / 'preparacion_para_compartir.json'
    with reporte.open('x', encoding='utf-8') as f:
        json.dump(resumen, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.chmod(reporte, 0o600)
    return resumen


def main():
    exigir(sys.argv[1:] == ['--crear-ensayo'], 'Uso: python3 enterprise/deploy/inicializar_ensayo.py --crear-ensayo')
    exigir(platform.system() == 'Linux' and socket.gethostname() == 'apps', 'Ejecutar únicamente en el servidor Linux apps.')
    import pwd
    exigir(pwd.getpwuid(os.geteuid()).pw_name == 'enicolalde', 'Ejecutar como enicolalde; sudo se usa solo para MySQL.')
    exigir(Path(__file__).resolve().parents[2] == APP, 'El código debe estar en ' + str(APP))
    print(json.dumps(preparar(APP), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (PreparacionError, OSError) as error:
        # Si falla después de crear recursos propios, se conservan para revisión.
        # No borrar una base/cuenta ni reemplazar el archivo privado al reintentar.
        print('Preparación detenida. Conserva los recursos propios que se hayan creado; '
              'no borres ni compartas migracion.env.', file=sys.stderr)
        # Los mensajes de PreparacionError son controlados y no incluyen SQL/clave.
        if isinstance(error, PreparacionError):
            print(str(error), file=sys.stderr)
        sys.exit(1)
