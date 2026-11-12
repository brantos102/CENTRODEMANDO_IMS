#!/usr/bin/env python3
"""Comprueba la copia SQL existente y prepara su plan operativo sin activarlo."""
import argparse
import json
import os
from pathlib import Path
import pwd
import re
import socket
import subprocess
import sys
import uuid
from copiar_abiertos_mysql import APP, privado, seleccionar_preparacion, configuracion, exigir, CopiaRechazada

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--zip',required=True);ap.add_argument('--copia-id',required=True);args=ap.parse_args();os.umask(0o077)
    exigir(socket.gethostname()=='apps' and pwd.getpwuid(os.geteuid()).pw_name=='enicolalde','SERVIDOR_INCOMPATIBLE')
    exigir(re.fullmatch('[a-f0-9]{64}',args.copia_id),'COPIA_ID_INCOMPATIBLE')
    datos=APP.parent/'centro_mando_ims_datos';privado(datos,True);archivo=Path(args.zip)
    exigir(re.fullmatch(re.escape(str(datos))+r'/entrada/ims-abiertos-[a-f0-9]{32}\.zip',str(archivo)),'ENTRADA_INCOMPATIBLE');privado(datos/'entrada',True);privado(archivo)
    repo=Path(__file__).resolve().parents[2];revision=subprocess.run(['git','-C',str(repo),'rev-parse','HEAD'],capture_output=True,text=True,check=True).stdout.strip()
    exigir(repo==datos/'preparaciones'/revision/'codigo','REVISION_INCOMPATIBLE')
    preparacion=seleccionar_preparacion(datos,archivo);cfg=configuracion(datos)
    salida=datos/('PLAN_ABIERTOS_OPERATIVOS_'+uuid.uuid4().hex);salida.mkdir(mode=0o700)
    env={k:v for k,v in os.environ.items() if k not in ('NODE_OPTIONS','NODE_PATH')}
    r=subprocess.run(['/usr/bin/node','--max-old-space-size=256',str(repo/'enterprise/tools/leer-contexto-abiertos-mysql.mjs')],input=json.dumps({'config':cfg,'preparacion':str(preparacion),'copiaId':args.copia_id}),capture_output=True,text=True,timeout=300,env=env)
    try:contexto=json.loads(r.stdout)
    except ValueError:raise CopiaRechazada('CONTEXTO_SQL_NO_CONFIRMADO')
    if r.returncode or contexto.get('ok') is False:
        codigo=contexto.get('codigo_error');raise CopiaRechazada(codigo if isinstance(codigo,str) and re.fullmatch('[A-Z_]+',codigo) else 'CONTEXTO_SQL_NO_CONFIRMADO')
    with (salida/'contexto_sql_NO_COMPARTIR.json').open('x',encoding='utf-8') as f:os.fchmod(f.fileno(),0o600);json.dump(contexto,f,ensure_ascii=False)
    sys.path.insert(0,str(repo/'enterprise/tools'))
    from planificar_abiertos_operativos import planificar
    resultado=planificar(preparacion,contexto,salida/'plan',datos/'entrada')
    print(json.dumps(resultado,ensure_ascii=False))
    print('Resumen para compartir: '+str(salida/'plan/resumen_plan_abiertos_para_compartir.json'))

if __name__=='__main__':
    try:main()
    except Exception as error:
        codigo=str(error) if isinstance(error,CopiaRechazada) and re.fullmatch('[A-Z_]+',str(error)) else 'PLAN_OPERATIVO_NO_CONFIRMADO'
        print(json.dumps({'ok':False,'codigo_error':codigo,'base_de_datos_modificada':False,'inventarios_activados':False,'servicios_reiniciados':False}));raise SystemExit(1)
