#!/usr/bin/env python3
"""Importa el plan elegido y conserva pendientes; no cambia cuentas ni servicios."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import pwd
import re
import socket
import subprocess
import sys
import uuid
from copiar_abiertos_mysql import APP, privado, configuracion, seleccionar_preparacion, exigir, huella, CopiaRechazada

CORTE='07e58bf9-6fe1-4bf0-b93e-d1a89cb66764'
COPIA='0f35ea9a0565483d03bd66519ba6cb3a144c5c8e4fdbbe386e3468237e1fd75b'
PLAN='2c00275f02bde5699a2c0b121d6a8a1c633b16002a83d8494fcf942b201d29ba'

def seleccionar_plan(datos,plan_id):
    exigir(re.fullmatch('[a-f0-9]{64}',plan_id),'PLAN_ID_INCOMPATIBLE');carpetas=sorted(datos.glob('CORTE_ELEGIDO_*'));exigir(len(carpetas)<=128,'DEMASIADOS_PLANES')
    encontrados=[]
    for d in carpetas:
        if not re.fullmatch('CORTE_ELEGIDO_[a-f0-9]{32}',d.name):continue
        archivo=d/'plan/plan_operativo_NO_ACTIVAR.json'
        if not archivo.exists():continue
        privado(d,True);privado(d/'plan',True);privado(archivo)
        exigir(archivo.stat().st_size<=16*1024*1024,'PLAN_EXCESIVO')
        if huella(archivo)==plan_id:encontrados.append(d/'plan')
    exigir(encontrados,'PLAN_ELEGIDO_NO_ENCONTRADO');return encontrados[0]

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--importar',action='store_true',required=True);ap.add_argument('--zip',required=True);ap.add_argument('--plan-id',required=True);args=ap.parse_args();os.umask(0o077)
    informe=None;intentada=False
    try:
        exigir(socket.gethostname()=='apps' and pwd.getpwuid(os.geteuid()).pw_name=='enicolalde','SERVIDOR_INCOMPATIBLE');exigir(args.plan_id==PLAN,'PLAN_NO_ELEGIDO')
        datos=APP.parent/'centro_mando_ims_datos';privado(datos,True);archivo=Path(args.zip)
        exigir(re.fullmatch(re.escape(str(datos))+r'/entrada/ims-abiertos-[a-f0-9]{32}\.zip',str(archivo)),'ENTRADA_INCOMPATIBLE');privado(datos/'entrada',True);privado(archivo)
        repo=Path(__file__).resolve().parents[2];revision=subprocess.run(['git','-C',str(repo),'rev-parse','HEAD'],capture_output=True,text=True,check=True).stdout.strip();exigir(repo==datos/'preparaciones'/revision/'codigo','REVISION_INCOMPATIBLE')
        with os.fdopen(os.open(datos/'procesar-corte-elegido.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600),'r+') as lock:
            privado(datos/'procesar-corte-elegido.lock');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            prep=seleccionar_preparacion(datos,archivo);plan=seleccionar_plan(datos,args.plan_id)
            m=json.loads(privado(prep/'preparacion_NO_IMPORTAR.json').read_bytes());exigir(m['corte_id']==CORTE and huella(prep/'preparacion_NO_IMPORTAR.json')==COPIA,'COPIA_NO_ELEGIDA')
            actor=json.loads(privado(datos/'operacion/solicitud.json').read_bytes());piloto=json.loads(privado(datos/'piloto/solicitud.json').read_bytes())
            exigir(actor['actorId']==piloto['lector']['actorId'] and actor['correo']==piloto['lector']['correo'],'CUENTA_EXISTENTE_NO_CONFIRMADA')
            salida=datos/('IMPORTACION_ABIERTOS_'+uuid.uuid4().hex);salida.mkdir(mode=0o700);informe=salida/'resumen_importacion_abiertos_para_compartir.json'
            solicitud={'config':configuracion(datos),'directorio':str(plan),'preparacion':str(prep),'planId':args.plan_id,'copiaId':COPIA,'corteId':CORTE,'actorId':actor['actorId'],'correo':actor['correo']}
            env={k:v for k,v in os.environ.items() if k not in ('NODE_OPTIONS','NODE_PATH')};intentada=True
            r=subprocess.run(['/usr/bin/node','--max-old-space-size=256',str(repo/'enterprise/tools/importar-abiertos-operativos.mjs')],input=json.dumps(solicitud),capture_output=True,text=True,timeout=600,env=env)
            try:d=json.loads(r.stdout)
            except ValueError:raise CopiaRechazada('RESPUESTA_IMPORTACION_NO_CONFIRMADA')
            exigir(isinstance(d,dict),'RESPUESTA_IMPORTACION_NO_CONFIRMADA')
            if r.returncode==0:exigir(d.get('ok') is True and d.get('datos_operativos_importados') is True and d.get('corte_id')==CORTE and d.get('plan_id')==PLAN,'RESPUESTA_IMPORTACION_NO_CONFIRMADA')
    except Exception as e:
        codigo=str(e) if isinstance(e,CopiaRechazada) and re.fullmatch('[A-Z_]{1,80}',str(e)) else 'IMPORTACION_NO_CONFIRMADA'
        d={'ok':False,'codigo_error':codigo,'importacion_puede_estar_confirmada':intentada,'reintentar_mismo_plan_sin_duplicar':True}
    d.update(servicios_reiniciados=False,apache_modificado=False,puertos_abiertos=[])
    if informe:
        with informe.open('x',encoding='utf-8') as f:os.fchmod(f.fileno(),0o600);json.dump(d,f,ensure_ascii=False,indent=2);f.write('\n')
    print(json.dumps(d,ensure_ascii=False))
    if informe:print('Resumen para compartir: '+str(informe))
    return 0 if d.get('ok') is True else 1

if __name__=='__main__':raise SystemExit(main())
