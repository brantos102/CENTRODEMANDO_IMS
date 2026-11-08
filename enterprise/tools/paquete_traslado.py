#!/usr/bin/env python3
"""Paquete privado de corte/plan: allowlist, hashes y extracción sin sobrescrituras."""
import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import sys
import zipfile
from pathlib import Path

SHA = re.compile(r'^[a-f0-9]{64}$')
NOMBRE = re.compile(r'^(?:corte/(?:manifest\.json|fuente\.xlsx|estilos\.xml|hoja_[0-9]{3,4}\.jsonl)|plan/(?:manifest\.json|catalogo\.jsonl|incidencias\.jsonl|lineas_preparadas\.jsonl)|evidencia/fuente_original\.xlsx)$')
MAX_TOTAL = 8 * 1024**3


def exigir(ok, texto):
    if not ok:
        raise ValueError(texto)


def digest(file):
    h = hashlib.sha256()
    with Path(file).open('rb') as f:
        for b in iter(lambda: f.read(1024**2), b''):
            h.update(b)
    return h.hexdigest()


def validar_manifest(m):
    exigir(isinstance(m, dict) and m.get('version') == 1 and isinstance(m.get('snapshot_id'), str) and isinstance(m.get('plan_id'), str) and SHA.fullmatch(m['snapshot_id']) and SHA.fullmatch(m['plan_id']), 'Identidad de paquete inválida.')
    archivos = m.get('archivos')
    exigir(isinstance(archivos, list) and 8 <= len(archivos) <= 1100, 'Lista de archivos incompatible.')
    names = set()
    for a in archivos:
        exigir(isinstance(a, dict) and isinstance(a.get('nombre'), str) and NOMBRE.fullmatch(a['nombre']) and a['nombre'] not in names, 'Nombre ajeno al contrato o repetido.')
        exigir(isinstance(a.get('bytes'), int) and not isinstance(a['bytes'], bool) and 0 <= a['bytes'] <= MAX_TOTAL and isinstance(a.get('sha256'), str) and SHA.fullmatch(a['sha256']), 'Metadatos incompatibles.')
        names.add(a['nombre'])
    exigir({'corte/manifest.json', 'corte/fuente.xlsx', 'corte/estilos.xml', 'plan/manifest.json', 'plan/catalogo.jsonl', 'plan/incidencias.jsonl', 'plan/lineas_preparadas.jsonl'} <= names, 'Faltan archivos requeridos.')
    exigir(sum(a['bytes'] for a in archivos) <= MAX_TOTAL, 'Paquete superior al límite de recepción.')
    exigir(next(a['sha256'] for a in archivos if a['nombre'] == 'corte/fuente.xlsx') == m['snapshot_id'], 'El XLSX no coincide con el corte.')
    return archivos


def empaquetar(lista, salida):
    m = json.loads(Path(lista).read_text(encoding='utf-8-sig'))
    archivos = validar_manifest(m)
    salida = Path(salida)
    exigir(not os.path.lexists(salida), 'La salida ya existe.')
    publico = {k: m[k] for k in ('version', 'snapshot_id', 'plan_id')}
    publico['archivos'] = [{k: a[k] for k in ('nombre', 'bytes', 'sha256')} for a in archivos]
    creado = False
    try:
        fd = os.open(salida, os.O_CREAT | os.O_EXCL | os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0), 0o600)
        creado = True
        with os.fdopen(fd, 'w+b') as out, zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as z:
            z.writestr('paquete.json', json.dumps(publico, ensure_ascii=False, separators=(',', ':')))
            for a in archivos:
                p = Path(a['ruta_local'])
                exigir(p.is_file() and not p.is_symlink(), 'Fuente no regular.')
                h = hashlib.sha256()
                count = 0
                with p.open('rb') as f, z.open(a['nombre'], 'w', force_zip64=True) as target:
                    for b in iter(lambda: f.read(1024**2), b''):
                        h.update(b)
                        count += len(b)
                        target.write(b)
                exigir(count == a['bytes'] and h.hexdigest() == a['sha256'], 'Una fuente cambió durante el empaquetado.')
        return {'ok': True, 'archivo_paquete': str(salida), 'sha256_paquete': digest(salida), 'bytes_paquete': salida.stat().st_size,
                'snapshot_id': m['snapshot_id'], 'plan_id': m['plan_id'], 'fuentes_modificadas': False, 'datos_importados': False}
    except BaseException:
        if creado:
            salida.unlink(missing_ok=True)
        raise


def recibir(paquete, sha_paquete, destino, snapshot_id, plan_id):
    paquete, destino = Path(paquete), Path(destino)
    exigir(SHA.fullmatch(sha_paquete) and SHA.fullmatch(snapshot_id) and SHA.fullmatch(plan_id), 'Identidades esperadas inválidas.')
    exigir(paquete.is_file() and not paquete.is_symlink() and paquete.stat().st_size <= MAX_TOTAL + 16*1024**2 and digest(paquete) == sha_paquete, 'El paquete recibido no coincide con el SHA-256 esperado.')
    exigir(not os.path.lexists(destino) and destino.parent.is_dir() and destino.parent.resolve() == destino.parent, 'Destino existente o incompatible.')
    temp = None
    try:
        with zipfile.ZipFile(paquete) as z:
            infos = z.infolist()
            exigir(len(infos) <= 1101 and len({i.filename for i in infos}) == len(infos), 'Entradas repetidas o excesivas.')
            exigir(all(i.filename == 'paquete.json' or NOMBRE.fullmatch(i.filename) for i in infos), 'Ruta ajena al contrato de recepción.')
            exigir(all(not i.is_dir() and stat.S_IFMT(i.external_attr >> 16) in (0, stat.S_IFREG) and not (i.flag_bits & 1) and i.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED) for i in infos), 'Tipo, compresión o cifrado ZIP no admitidos.')
            header = z.getinfo('paquete.json')
            exigir(header.file_size <= 1024**2, 'Manifiesto excesivo.')
            m = json.loads(z.read(header))
            archivos = validar_manifest(m)
            exigir(m['snapshot_id'] == snapshot_id and m['plan_id'] == plan_id, 'El paquete pertenece a otro corte o plan.')
            exigir({i.filename for i in infos} == {'paquete.json', *(a['nombre'] for a in archivos)}, 'Hay archivos omitidos o no declarados.')
            exigir(all(z.getinfo(a['nombre']).file_size == a['bytes'] for a in archivos), 'Tamaños incompatibles.')
            total = sum(a['bytes'] for a in archivos)
            exigir(shutil.disk_usage(destino.parent).free >= total + 1024**3, 'Espacio libre insuficiente para recepción segura.')
            # mkdir exclusivo evita reemplazar incluso un directorio vacío
            # creado por otra ejecución entre la comprobación y la escritura.
            destino.mkdir(mode=0o700)
            temp = destino
            for a in archivos:
                p = temp / a['nombre']
                p.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                fd = os.open(p, os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, 'O_NOFOLLOW', 0), 0o600)
                h, count = hashlib.sha256(), 0
                with os.fdopen(fd, 'wb') as out, z.open(a['nombre']) as f:
                    for b in iter(lambda: f.read(1024**2), b''):
                        count += len(b)
                        exigir(count <= a['bytes'], 'Tamaño descomprimido excesivo.')
                        h.update(b)
                        out.write(b)
                exigir(count == a['bytes'] and h.hexdigest() == a['sha256'], 'Integridad de archivo incompatible.')
            (temp / 'paquete.json').write_text(json.dumps(m, indent=2) + '\n', encoding='utf-8')
            os.chmod(temp / 'paquete.json', 0o600)
        # El llamador valida también corte y plan con Node antes de importar.
        temp = None
        return {'ok': True, 'directorio_recibido': str(destino), 'snapshot_id': snapshot_id, 'plan_id': plan_id,
                'archivos_verificados': len(archivos), 'sha256_paquete': sha_paquete, 'datos_importados': False,
                'validacion_semantica_pendiente': True, 'base_de_datos_modificada': False}
    finally:
        if temp is not None:
            shutil.rmtree(temp)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest='modo', required=True)
    e = sub.add_parser('empaquetar')
    e.add_argument('--lista', required=True)
    e.add_argument('--salida', required=True)
    r = sub.add_parser('recibir')
    for arg in ('paquete', 'sha256', 'destino', 'snapshot-id', 'plan-id'):
        r.add_argument('--' + arg, required=True)
    a = p.parse_args()
    if a.modo == 'recibir':
        import platform
        import socket
        exigir(platform.system() == 'Linux' and socket.gethostname() == 'apps', 'Recepción solo en el servidor Linux apps.')
        import pwd
        exigir(pwd.getpwuid(os.geteuid()).pw_name == 'enicolalde', 'Recibir como enicolalde, sin sudo.')
        base = Path('/home/enicolalde/bryan/centro_mando_ims_datos')
        exigir(base.is_dir() and base.resolve() == base and base.stat().st_uid == os.geteuid() and stat.S_IMODE(base.stat().st_mode) == 0o700, 'Directorio privado incompatible.')
        exigir(Path(__file__).resolve().parents[2] == Path('/home/enicolalde/bryan/centro_mando_ims'), 'Copia de código incompatible.')
        exigir(Path(a.paquete).parent == base / 'entrada' and Path(a.paquete).resolve().parent == base / 'entrada', 'Paquete fuera de entrada privada.')
        recibidos = base / 'recibidos'
        exigir(not recibidos.is_symlink(), 'Carpeta de recepción incompatible.')
        recibidos.mkdir(mode=0o700, exist_ok=True)
        exigir(recibidos.resolve() == recibidos and recibidos.stat().st_uid == os.geteuid() and stat.S_IMODE(recibidos.stat().st_mode) == 0o700 and Path(a.destino).parent == recibidos, 'Salida fuera del espacio privado previsto.')
    result = empaquetar(a.lista, a.salida) if a.modo == 'empaquetar' else recibir(a.paquete, a.sha256, a.destino, a.snapshot_id, a.plan_id)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, zipfile.BadZipFile):
        print('Traslado detenido: comprueba identidades, integridad y rutas privadas. No se muestran datos de filas.', file=sys.stderr)
        sys.exit(1)
