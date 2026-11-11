#!/usr/bin/env python3
"""Comprueba cantidades reales con el perfil SQL operativo propio; no escribe datos."""
import json
import os
import socket
import subprocess
from pathlib import Path
import preparar_piloto as p

def main():
    p.exigir(socket.gethostname()=='apps' and __import__('pwd').getpwuid(os.geteuid()).pw_name=='enicolalde','Ejecutar en apps como enicolalde.')
    repo=Path(__file__).resolve().parents[2];datos=p.APP.parent/'centro_mando_ims_datos'
    revision=subprocess.run(['git','-C',str(repo),'rev-parse','HEAD'],check=True,capture_output=True,text=True).stdout.strip()
    p.exigir(repo==datos/'preparaciones'/revision/'codigo','Se requiere la preparación aislada.')
    cfg=dict(line.split('=',1) for line in p.privado(datos/'operacion/operacion.env').read_text().splitlines())
    p.exigir(cfg.get('MYSQL_DATABASE')=='centromando_ims_ensayo' and cfg.get('MYSQL_USER')=='ims_cm_operacion','Perfil SQL incompatible.')
    env={k:v for k,v in os.environ.items() if k not in ('NODE_OPTIONS','NODE_PATH')}
    r=subprocess.run(['/usr/bin/node',str(repo/'enterprise/tools/verificar-unidades-erp.mjs')],input=json.dumps({'config':cfg}),text=True,capture_output=True,timeout=90,env=env)
    p.exigir(r.returncode==0,'Las unidades guardadas no se pudieron conciliar. No se modifica el servicio ni se redondean datos.')
    print(r.stdout.strip())

if __name__=='__main__':
    try:main()
    except Exception:
        print('Comprobación de unidades detenida. Conserva los datos y la versión activa; no se muestran credenciales.');raise SystemExit(1)
