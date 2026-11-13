#!/usr/bin/env python3
"""Habilita las identidades recuperadas después de comprobar la versión nueva."""
import json
import os
from pathlib import Path
import socket
import subprocess
import preparar_piloto as p
from copiar_abiertos_mysql import configuracion

def main():
 os.umask(0o077);p.exigir(socket.gethostname()=='apps' and __import__('pwd').getpwuid(os.geteuid()).pw_name=='enicolalde','Ejecuta en apps como enicolalde.')
 repo=Path(__file__).resolve().parents[2];revision=subprocess.run(['git','-C',str(repo),'rev-parse','HEAD'],capture_output=True,text=True,check=True).stdout.strip();datos=p.privado(p.APP.parent/'centro_mando_ims_datos',True);p.exigir(repo==datos/'preparaciones'/revision/'codigo','Revisión no aislada.')
 r=subprocess.run(['/usr/bin/node',str(repo/'enterprise/tools/activar-usuarios-centro.mjs')],input=json.dumps({'config':configuracion(datos),'revision':revision}),capture_output=True,text=True,timeout=60,env={k:v for k,v in os.environ.items() if k not in ('NODE_OPTIONS','NODE_PATH')});d=json.loads(r.stdout);print(json.dumps(d));p.exigir(r.returncode==0 and d.get('ok') is True,'No se confirmó la activación de usuarios recuperados.')

if __name__=='__main__':
 try:main()
 except Exception:print('Las cuentas previas se conservan. Revisa la activación de las cuentas recuperadas.',file=__import__('sys').stderr);raise SystemExit(1)
