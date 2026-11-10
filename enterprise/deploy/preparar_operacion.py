#!/usr/bin/env python3
"""Prepara un perfil operativo propio; no reinicia servicios ni modifica Apache."""
import argparse
import json
import os
import re
import secrets
import socket
import subprocess
from pathlib import Path
import preparar_piloto as p

DB = p.DATABASE
USER = 'ims_cm_operacion'
ACCOUNT = "'ims_cm_operacion'@'127.0.0.1'"
TABLES = {
 'ims_op_actor': 'SELECT, INSERT', 'ims_op_cliente': 'SELECT',
 'ims_op_inventario': 'SELECT, INSERT', 'ims_op_inventario_cliente': 'SELECT, INSERT',
 'ims_op_permiso': 'SELECT, INSERT, UPDATE, DELETE', 'ims_op_linea': 'SELECT, INSERT',
 'ims_op_detalle_linea': 'SELECT, INSERT', 'ims_op_operacion': 'SELECT, INSERT', 'ims_op_auditoria': 'SELECT, INSERT',
 'ims_auth_usuario': 'SELECT, INSERT', 'ims_auth_sesion': 'SELECT, INSERT, UPDATE', 'ims_auth_limite': 'SELECT, INSERT, UPDATE, DELETE',
 'ims_nat_ambito': 'SELECT', 'ims_nat_inventario': 'SELECT, INSERT', 'ims_nat_perfil': 'SELECT, INSERT, UPDATE, DELETE',
 'ims_nat_linea': 'SELECT, INSERT', 'ims_nat_evento': 'SELECT, INSERT'}
COLUMNS = {'ims_op_inventario': ['estado'], 'ims_op_linea': ['version','conteo_1','conteo_2','conteo_final','observacion','nueva_posicion'],
 'ims_nat_inventario': ['version','borrador','fecha_entrega','mostrar_depot'], 'ims_nat_linea':['ajuste','motivo','justificacion']}


def sql_cuenta(clave, db=DB, host='127.0.0.1'):
    p.exigir(bool(re.fullmatch('[a-f0-9]{64}', clave)) and bool(re.fullmatch(r'centromando_ims_(?:ensayo|pruebas(?:_[a-z0-9]+)?)', db))
             and host in ('127.0.0.1', '%'), 'Cuenta o base incompatible.')
    cuenta = "'" + USER + "'@'" + host + "'"
    lines = [f"CREATE USER {cuenta} IDENTIFIED BY '{clave}' WITH MAX_USER_CONNECTIONS 5;"]
    for tabla, grants in TABLES.items():
        lines.append(f'GRANT {grants} ON `{db}`.`{tabla}` TO {cuenta};')
    for tabla, columnas in COLUMNS.items():
        lines.append(f"GRANT UPDATE ({','.join('`'+c+'`' for c in columnas)}) ON `{db}`.`{tabla}` TO {cuenta};")
    return '\n'.join(lines)


def entorno(clave):
    p.exigir(bool(re.fullmatch('[a-f0-9]{64}', clave)), 'Clave incompatible.')
    return (f'MYSQL_HOST=127.0.0.1\nMYSQL_PORT=3306\nMYSQL_DATABASE={DB}\nMYSQL_USER={USER}\nMYSQL_PASSWORD={clave}\n'
            f'IMS_MIGRACION_OPERATIVA=0\nIMS_API_HABILITADA=1\nIMS_SOLO_LECTURA=0\nIMS_OPERACION_NATIVA=1\n'
            f'IMS_HOST=127.0.0.1\nIMS_PORT=3003\nIMS_PUBLIC_URL={p.URL}\n')


def node(repo, modo, solicitud):
    r = subprocess.run(['/usr/bin/node', str(repo / 'enterprise/tools/preparar-operacion.mjs'), modo],
                       input=json.dumps(solicitud), capture_output=True, text=True, timeout=90)
    p.exigir(r.returncode == 0, 'No se confirmó el perfil de operación. El piloto actual se conserva.')
    data = json.loads(r.stdout)
    p.exigir(data.get('ok') is True, 'Respuesta incompatible.')
    return data


def triggers(repo, admin=p.admin_mysql):
    sql = (repo / 'enterprise/sql/008_proteccion_nativa.sql').read_text()
    definitions = re.findall(r'CREATE TRIGGER (ims_nat_[a-z_]+) (.*?)END\$\$', sql, re.S)
    p.exigir(len(definitions) == 11, 'Protecciones SQL incompletas.')
    for nombre, resto in definitions:
        resto = resto + 'END'
        m = re.fullmatch(r'(BEFORE) (INSERT|UPDATE|DELETE) ON ([a-z_]+) FOR EACH ROW\s+(BEGIN.*END)', resto, re.S)
        p.exigir(m is not None, 'Trigger incompatible.')
        rows = admin(f"SELECT ACTION_TIMING,EVENT_MANIPULATION,EVENT_OBJECT_TABLE,HEX(ACTION_STATEMENT) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='{DB}' AND TRIGGER_NAME='{nombre}';")
        if rows:
            esperado = [m[1], m[2], m[3]]
            p.exigir(len(rows) == 1 and rows[0][:3] == esperado and bytes.fromhex(rows[0][3]).decode() == m[4],
                     'Ya existe otra protección con ese nombre; no se sobrescribe.')
        else:
            admin(f'USE `{DB}`;\nDELIMITER $$\nCREATE TRIGGER {nombre} {resto}$$\nDELIMITER ;\n')


def grants(admin=p.admin_mysql):
    tables = admin(f"SELECT TABLE_NAME,PRIVILEGE_TYPE FROM information_schema.TABLE_PRIVILEGES WHERE GRANTEE=CONCAT(CHAR(39),'{USER}',CHAR(39),'@',CHAR(39),'127.0.0.1',CHAR(39)) AND TABLE_SCHEMA='{DB}';")
    expected = {(t, g) for t, gs in TABLES.items() for g in gs.split(', ')}
    p.exigir(set(map(tuple, tables)) == expected, 'Privilegios de tablas incompatibles.')
    cols = admin(f"SELECT TABLE_NAME,COLUMN_NAME,PRIVILEGE_TYPE FROM information_schema.COLUMN_PRIVILEGES WHERE GRANTEE=CONCAT(CHAR(39),'{USER}',CHAR(39),'@',CHAR(39),'127.0.0.1',CHAR(39)) AND TABLE_SCHEMA='{DB}';")
    p.exigir(set(map(tuple, cols)) == {(t, c, 'UPDATE') for t, cs in COLUMNS.items() for c in cs}, 'Privilegios de columnas incompatibles.')
    globales = admin(f"SELECT PRIVILEGE_TYPE FROM information_schema.USER_PRIVILEGES WHERE GRANTEE=CONCAT(CHAR(39),'{USER}',CHAR(39),'@',CHAR(39),'127.0.0.1',CHAR(39));")
    esquemas = admin(f"SELECT TABLE_SCHEMA FROM information_schema.SCHEMA_PRIVILEGES WHERE GRANTEE=CONCAT(CHAR(39),'{USER}',CHAR(39),'@',CHAR(39),'127.0.0.1',CHAR(39));")
    p.exigir(globales == [['USAGE']] and not esquemas, 'La cuenta tiene privilegios globales o por esquema.')
    todos = admin(f"SHOW GRANTS FOR {ACCOUNT};")
    p.exigir(len(todos) == len(TABLES)+1 and all(('`'+DB+'`.') in r[0] or r[0].startswith('GRANT USAGE ON *.*') for r in todos), 'Privilegios fuera de la base propia.')


def preparar(repo, datos, admin=p.admin_mysql):
    repo, datos = Path(repo), p.privado(datos, True)
    piloto = json.loads(p.privado(datos / 'piloto/solicitud.json').read_text())
    cfg = piloto['migracion']
    p.exigir(cfg.get('MYSQL_DATABASE') == DB and cfg.get('MYSQL_USER') == 'ims_cm_migracion', 'Perfil de migración incompatible.')
    carpeta = datos / 'operacion'
    if not carpeta.exists():
        p.exigir(not os.path.lexists(carpeta), 'Ruta enlazada.')
        p.exigir(not admin(f"SELECT User FROM mysql.user WHERE User='{USER}';"), 'La cuenta ya existe; no se adopta.')
        carpeta.mkdir(mode=0o700)
        p.escribir(carpeta / 'solicitud.json', json.dumps({'version': 1, 'clave_mysql': secrets.token_hex(32),
                  'actorId': piloto['lector']['actorId'], 'correo': piloto['lector']['correo']})+'\n')
    p.privado(carpeta, True)
    s = json.loads(p.privado(carpeta / 'solicitud.json').read_text())
    p.exigir(s.get('version') == 1 and s['actorId'] == piloto['lector']['actorId'] and s['correo'] == piloto['lector']['correo'], 'Solicitud incompatible.')
    result = node(repo, '--preparar', {'config': cfg, 'actorId': s['actorId'], 'correo': s['correo']})
    triggers(repo, admin)
    cuenta = admin(f"SELECT User,Host,max_user_connections FROM mysql.user WHERE User='{USER}';")
    if not cuenta:
        admin(sql_cuenta(s['clave_mysql']))
    p.exigir(admin(f"SELECT User,Host,max_user_connections FROM mysql.user WHERE User='{USER}';") == [[USER,'127.0.0.1','5']], 'Cuenta incompatible.')
    grants(admin)
    content = entorno(s['clave_mysql'])
    archivo = carpeta / 'operacion.env'
    if archivo.exists():
        p.exigir(p.privado(archivo).read_text() == content, 'Entorno modificado; no se reemplaza.')
    else:
        p.escribir(archivo, content)
    runtime = dict(line.split('=', 1) for line in content.splitlines())
    validado = node(repo, '--verificar', {'config': runtime})
    return {**result, **validado, 'perfil_preparado': True, 'aplicacion_activada': False,
            'apache_modificado': False, 'puertos_abiertos': [], 'otros_proyectos_modificados': False}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--preparar', action='store_true', required=True)
    ap.parse_args()
    os.umask(0o077)
    p.exigir(socket.gethostname() == 'apps' and __import__('pwd').getpwuid(os.geteuid()).pw_name == 'enicolalde', 'Ejecutar en apps como enicolalde.')
    repo = Path(__file__).resolve().parents[2]
    datos = p.APP.parent / 'centro_mando_ims_datos'
    revision = subprocess.run(['git','-C',str(repo),'rev-parse','HEAD'],capture_output=True,text=True,check=True).stdout.strip()
    p.exigir(repo == datos / 'preparaciones' / revision / 'codigo' and not subprocess.run(['git','-C',str(repo),'status','--porcelain'],capture_output=True,text=True,check=True).stdout.strip(), 'Preparación fuera de revisión aislada o con cambios.')
    import fcntl
    with open(p.privado(datos / 'piloto/actualizacion.lock'), 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        print(json.dumps(preparar(repo, datos), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Detenido: preparación operativa no confirmada. El servicio actual y Apache no se modifican; conserva los archivos privados para revisión.',file=__import__('sys').stderr)
        raise SystemExit(1)
