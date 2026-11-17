#!/usr/bin/env python3
"""Resguarda PDF y carga el perfil físico privado, sin actualizar inventarios."""
import hashlib
import json
import os
from pathlib import Path
import pwd
import socket
import subprocess
import zipfile
from copiar_abiertos_mysql import configuracion
from preparar_piloto import privado, exigir

ARCHIVOS = {
    'layout_bm_quito_20261117.json': '3462f6414814eb72f325ed174742cfe3e1a16427f8424b2a17aefae3f1aa428d',
    'Layout_CD_Quito1.pdf': 'be49197624b6308b84d223d3d470bfa3edd588dff8fa4491c9c1b611968cecd3',
}

def comprobar_zip(archivo):
    with zipfile.ZipFile(archivo) as z:
        infos = z.infolist()
        exigir(len(infos) == 2 and {i.filename for i in infos} == set(ARCHIVOS), 'LAYOUT_ZIP_INCOMPATIBLE')
        contenidos = {}
        for i in infos:
            exigir(not i.is_dir() and not i.flag_bits & 1 and 0 < i.file_size <= 8 * 1024 * 1024, 'LAYOUT_ARCHIVO_INCOMPATIBLE')
            b = z.read(i)
            exigir(hashlib.sha256(b).hexdigest() == ARCHIVOS[i.filename], 'LAYOUT_HUELLA_INCOMPATIBLE')
            contenidos[i.filename] = b
        perfil = json.loads(contenidos['layout_bm_quito_20261117.json'])
        exigir(perfil['sha256Pdf'] == ARCHIVOS['Layout_CD_Quito1.pdf'], 'LAYOUT_PDF_INCOMPATIBLE')
        return contenidos, perfil

def main():
    os.umask(0o077)
    exigir(socket.gethostname() == 'apps' and pwd.getpwuid(os.geteuid()).pw_name == 'enicolalde', 'SERVIDOR_INCOMPATIBLE')
    datos = Path('/home/enicolalde/bryan/centro_mando_ims_datos')
    privado(datos, True)
    entrada = datos / 'entrada'
    privado(entrada, True)
    contenidos, perfil = comprobar_zip(privado(entrada / 'layout_bm_privado_20261117.zip'))
    carpeta = entrada / 'layout_bm_20261117'
    if not carpeta.exists():
        carpeta.mkdir(mode=0o700)
    privado(carpeta, True)
    for nombre, contenido in contenidos.items():
        destino = carpeta / nombre
        if destino.exists():
            exigir(hashlib.sha256(privado(destino).read_bytes()).hexdigest() == ARCHIVOS[nombre], 'LAYOUT_PREVIO_DISTINTO_CONSERVADO')
        else:
            with destino.open('xb') as f:
                f.write(contenido)
    actor = json.loads(privado(datos / 'piloto/solicitud.json').read_text())['lector']['actorId']
    herramienta = Path(__file__).resolve().parents[1] / 'tools/cargar-layout-privado.mjs'
    r = subprocess.run(['/usr/bin/node', str(herramienta)], input=json.dumps({'config': configuracion(datos), 'actorId': actor, 'perfil': perfil}), capture_output=True, text=True, timeout=90, env={k: v for k, v in os.environ.items() if k not in ('NODE_OPTIONS', 'NODE_PATH')})
    exigir(r.stdout and len(r.stdout) < 32768, 'LAYOUT_SIN_RESPUESTA')
    resultado = json.loads(r.stdout)
    print(json.dumps(resultado, ensure_ascii=False))
    exigir(r.returncode == 0 and resultado.get('ok') is True, 'CARGA_LAYOUT_NO_CONFIRMADA')

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        codigo = str(e) if __import__('re').fullmatch('[A-Z_]{1,80}', str(e)) else 'CARGA_LAYOUT_DETENIDA'
        print(json.dumps({'ok': False, 'codigo': codigo, 'stock_modificado': False, 'servicios_reiniciados': False}))
        raise SystemExit(1)
