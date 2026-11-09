#!/usr/bin/env python3
"""Operaciones limitadas a cuatro rutas nuevas de Apache para el piloto."""
import hashlib
import json
import os
import re
import socket
import stat
import sys
from pathlib import Path

ARCHIVOS = ('conf-available/centro-mando-ims-8445.conf',
            'sites-available/centro-mando-ims-ensayo-ssl.conf')
ENLACES = {'conf-enabled/centro-mando-ims-8445.conf': '../' + ARCHIVOS[0],
           'sites-enabled/centro-mando-ims-ensayo-ssl.conf': '../' + ARCHIVOS[1]}
PROPIOS = (*ARCHIVOS, *ENLACES)


def exigir(ok):
    if not ok:
        raise ValueError('Operación de configuración no confirmada.')


def comprobar_cuerpos(cuerpos):
    exigir(set(cuerpos) == set(ARCHIVOS))
    for texto in cuerpos.values():
        exigir(isinstance(texto, str) and len(texto.encode()) < 16384
               and re.match(r'^# IMS_PUBLICACION=[a-f0-9]{32}\n', texto))


def propio(path, texto):
    try:
        info = path.lstat()
        return (stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid()
                and stat.S_IMODE(info.st_mode) == 0o644 and path.read_bytes() == texto.encode())
    except FileNotFoundError:
        return False


def operar(solicitud, raiz=Path('/etc/apache2')):
    raiz = Path(raiz)
    exigir(raiz.resolve() == raiz and raiz.is_dir())
    accion = solicitud['accion']
    if accion == 'fotografia':
        estado = {}
        for path in sorted(raiz.rglob('*')):
            rel = path.relative_to(raiz).as_posix()
            if rel in PROPIOS or path.suffix not in ('.conf', '.load') or path.is_dir():
                continue
            estado[rel] = {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                           'enlace': os.readlink(path) if path.is_symlink() else None}
        return {'ok': True, 'configuraciones': estado}
    exigir(accion in ('ausentes', 'crear', 'retirar'))
    for rel in PROPIOS:
        padre = (raiz / rel).parent
        exigir(padre.resolve() == padre and padre.is_dir() and padre.stat().st_uid == os.geteuid())
    if accion == 'ausentes':
        exigir(all(not os.path.lexists(raiz / rel) for rel in PROPIOS))
        return {'ok': True}
    cuerpos = solicitud['cuerpos']
    comprobar_cuerpos(cuerpos)
    if accion == 'crear':
        rel = solicitud['ruta']
        exigir(rel in PROPIOS)
        destino = raiz / rel
        if rel in ENLACES:
            objetivo = raiz / ENLACES[rel][3:]
            exigir(propio(objetivo, cuerpos[ENLACES[rel][3:]]))
            os.symlink(ENLACES[rel], destino)
        else:
            fd = os.open(destino, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
            info = os.fstat(fd)
            try:
                with os.fdopen(fd, 'wb') as f:
                    os.fchmod(f.fileno(), 0o644)
                    f.write(cuerpos[rel].encode())
                    f.flush()
                    os.fsync(f.fileno())
            except BaseException:
                if destino.exists() and destino.lstat().st_ino == info.st_ino and destino.lstat().st_dev == info.st_dev:
                    destino.unlink()
                raise
        return {'ok': True}
    no_retirados = []
    for rel in (*ENLACES, *ARCHIVOS):
        path = raiz / rel
        if not os.path.lexists(path):
            continue
        if rel in ENLACES:
            valido = (path.is_symlink() and path.lstat().st_uid == os.geteuid()
                      and os.readlink(path) == ENLACES[rel]
                      and propio(raiz / ENLACES[rel][3:], cuerpos[ENLACES[rel][3:]]))
        else:
            valido = propio(path, cuerpos[rel])
        if valido:
            path.unlink()
        else:
            no_retirados.append(rel)
    return {'ok': not no_retirados, 'no_retirados': no_retirados}


if __name__ == '__main__':
    try:
        exigir(os.geteuid() == 0 and socket.gethostname() == 'apps'
               and Path(__file__).resolve() == Path('/home/enicolalde/bryan/centro_mando_ims/enterprise/deploy/apache_piloto_root.py'))
        body = sys.stdin.buffer.read(65537)
        exigir(len(body) <= 65536)
        print(json.dumps(operar(json.loads(body))))
    except Exception:
        print(json.dumps({'ok': False, 'error': 'OPERACION_APACHE_NO_CONFIRMADA'}))
        raise SystemExit(1)
