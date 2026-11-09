#!/usr/bin/env python3
"""Modifica exclusivamente la unidad del piloto y su enlace de inicio automático."""
import hashlib
import json
import os
import re
import socket
import stat
import sys
import uuid
from pathlib import Path

NOMBRE = 'centro-mando-ims-ensayo.service'


def exigir(ok):
    if not ok:
        raise ValueError('Unidad propia no confirmada.')


def operar(s, raiz=Path('/etc/systemd/system')):
    raiz = Path(raiz)
    exigir(raiz.resolve() == raiz and raiz.stat().st_uid == os.geteuid())
    unidad = raiz / NOMBRE
    info = unidad.lstat()
    exigir(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and stat.S_IMODE(info.st_mode) == 0o644)
    anterior = unidad.read_bytes()
    if s['accion'] == 'leer':
        enlace = raiz / 'multi-user.target.wants' / NOMBRE
        auto = os.path.lexists(enlace)
        if auto:
            exigir(enlace.is_symlink() and enlace.lstat().st_uid == os.geteuid()
                   and os.readlink(enlace) in ('../' + NOMBRE, str(unidad)))
        return {'ok': True, 'contenido': anterior.decode(), 'sha256': hashlib.sha256(anterior).hexdigest(), 'inicio_automatico': auto}
    exigir(s['accion'] in ('poner', 'auto', 'quitar_auto'))
    exigir(hashlib.sha256(anterior).hexdigest() == s['esperado'])
    if s['accion'] == 'poner':
        body = s['contenido'].encode()
        exigir(len(body) < 16384 and body.startswith(b'[Unit]\n'))
        tmp = raiz / ('.' + NOMBRE + '.' + uuid.uuid4().hex)
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
        try:
            with os.fdopen(fd, 'wb') as f:
                os.fchmod(f.fileno(), 0o644)
                f.write(body)
                f.flush()
                os.fsync(f.fileno())
            actual = unidad.lstat()
            exigir((actual.st_dev, actual.st_ino) == (info.st_dev, info.st_ino)
                   and unidad.read_bytes() == anterior)
            os.replace(tmp, unidad)
        finally:
            if tmp.exists():
                tmp.unlink()
        return {'ok': True, 'sha256': hashlib.sha256(body).hexdigest()}
    carpeta = raiz / 'multi-user.target.wants'
    exigir(carpeta.resolve() == carpeta and carpeta.is_dir() and carpeta.stat().st_uid == os.geteuid())
    enlace = carpeta / NOMBRE
    if os.path.lexists(enlace):
        exigir(enlace.is_symlink() and enlace.lstat().st_uid == os.geteuid()
               and os.readlink(enlace) in ('../' + NOMBRE, str(unidad)))
        if s['accion'] == 'quitar_auto':
            enlace.unlink()
        return {'ok': True, 'creado': False}
    if s['accion'] == 'auto':
        os.symlink('../' + NOMBRE, enlace)
        return {'ok': True, 'creado': True}
    return {'ok': True, 'creado': False}


if __name__ == '__main__':
    try:
        ruta = str(Path(__file__).resolve())
        permitido = ruta == '/home/enicolalde/bryan/centro_mando_ims/enterprise/deploy/unidad_piloto_root.py' or bool(re.fullmatch(
            r'/home/enicolalde/bryan/centro_mando_ims_datos/preparaciones/[a-f0-9]{40}/codigo/enterprise/deploy/unidad_piloto_root\.py', ruta))
        exigir(os.geteuid() == 0 and socket.gethostname() == 'apps' and permitido)
        raw = sys.stdin.buffer.read(32769)
        exigir(len(raw) <= 32768)
        print(json.dumps(operar(json.loads(raw))))
    except Exception:
        print(json.dumps({'ok': False, 'error': 'UNIDAD_PROPIA_NO_CONFIRMADA'}))
        raise SystemExit(1)
