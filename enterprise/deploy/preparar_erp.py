#!/usr/bin/env python3
"""Prepara un entorno ERP privado por revisión. No accede a SQL ni activa servicios."""
import argparse
import base64
import hashlib
import json
import os
import re
import socket
import subprocess
from pathlib import Path
import preparar_piloto as p


def validar_node(repo, datos, entorno=False):
    env = {k:v for k,v in os.environ.items() if k not in ('NODE_OPTIONS','NODE_PATH')}
    args = ['/usr/bin/node', str(Path(repo)/'enterprise/tools/validar-erp-runtime.mjs')]
    if entorno:
        args.append('--entorno')
    r = subprocess.run(args, input=json.dumps(datos), capture_output=True, text=True, timeout=15, env=env)
    p.exigir(r.returncode == 0, 'No se confirmó el perfil privado ERP.')
    meta = json.loads(r.stdout)
    p.exigir(meta.get('ok') is True and meta.get('solo_previsualizacion') is True, 'Perfil ERP incompatible.')
    return meta


def validar_entorno(repo, datos, revision, validar=validar_node, creacion=False):
    carpeta = p.privado(Path(datos)/'erp', True)
    body = p.privado(carpeta/(revision+'.env')).read_text()
    manifest = json.loads(p.privado(carpeta/(revision+'.json')).read_text())
    p.exigir(manifest.get('revision') == revision and manifest.get('sha256_env') == hashlib.sha256(body.encode()).hexdigest(), 'El perfil privado ERP cambió.')
    lineas = body.splitlines()
    p.exigir(len(lineas) == (3 if creacion else 2) and lineas[0] == 'IMS_ERP_HABILITADO=1' and lineas[1].startswith('IMS_ERP_REGISTRO_BASE64=') and (not creacion or lineas[2] == 'IMS_ERP_CREACION=1'), 'Entorno ERP incompatible.')
    return validar(repo, dict(line.split('=',1) for line in lineas), True)


def preparar(repo, datos, revision, registro, validar=validar_node, creacion=False):
    datos = p.privado(datos, True)
    registro = Path(registro)
    p.exigir(bool(re.fullmatch('[a-f0-9]{40}',revision)), 'Revisión incompatible.')
    p.exigir(registro.parent.parent == datos and re.fullmatch('ERP_LECTURA_[a-f0-9]{32}',registro.parent.name) and registro.name == 'registro_erp_runtime_NO_COMPARTIR.json', 'Usa el registro privado preparado en el servidor.')
    p.privado(registro.parent, True)
    raw = p.privado(registro).read_bytes()
    p.exigir(len(raw) <= 65536, 'Perfil ERP demasiado grande.')
    meta = validar(repo, json.loads(raw))
    carpeta = datos/'erp'
    if not carpeta.exists():
        p.exigir(not os.path.lexists(carpeta), 'Ruta privada enlazada.')
        carpeta.mkdir(mode=0o700)
    p.privado(carpeta,True)
    body = 'IMS_ERP_HABILITADO=1\nIMS_ERP_REGISTRO_BASE64='+base64.b64encode(raw).decode()+'\n'+('IMS_ERP_CREACION=1\n' if creacion else '')
    manifest = json.dumps({'revision':revision,'sha256_env':hashlib.sha256(body.encode()).hexdigest()})+'\n'
    for destino,contenido in [(carpeta/(revision+'.env'),body),(carpeta/(revision+'.json'),manifest)]:
        if destino.exists():
            p.exigir(p.privado(destino).read_text() == contenido, 'El perfil preparado difiere; no se sobrescribe.')
        else:
            p.escribir(destino,contenido)
    validar_entorno(repo,datos,revision,validar,creacion=creacion)
    return {**meta,'solo_previsualizacion':not creacion,'creacion_nativa_preparada':creacion,'perfil_erp_preparado':True,'aplicacion_activada':False,'base_de_datos_modificada':False,'apache_modificado':False,'puertos_abiertos':[]}


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--registro',required=True)
    ap.add_argument('--creacion',action='store_true')
    args=ap.parse_args()
    os.umask(0o077)
    p.exigir(socket.gethostname() == 'apps' and __import__('pwd').getpwuid(os.geteuid()).pw_name == 'enicolalde','Ejecutar en apps como enicolalde.')
    repo=Path(__file__).resolve().parents[2]
    revision=subprocess.run(['git','-C',str(repo),'rev-parse','HEAD'],check=True,capture_output=True,text=True).stdout.strip()
    datos=p.APP.parent/'centro_mando_ims_datos'
    p.exigir(repo == datos/'preparaciones'/revision/'codigo' and not subprocess.run(['git','-C',str(repo),'status','--porcelain'],check=True,capture_output=True,text=True).stdout.strip(),'Requiere una preparación Git aislada y limpia.')
    print(json.dumps(preparar(repo,datos,revision,args.registro,creacion=args.creacion),ensure_ascii=False,indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Preparación ERP detenida. No se muestran credenciales; el servicio y los perfiles anteriores se conservan.')
        raise SystemExit(1)
