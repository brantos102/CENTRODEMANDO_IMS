#!/usr/bin/env python3
"""Carga una preparación privada en tablas de revisión propias, sin activarla."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import socket
import subprocess
import uuid
from preparar_piloto import APP, privado

class CopiaRechazada(Exception):
    pass

def exigir(ok,codigo):
    if not ok:raise CopiaRechazada(codigo)

def huella(archivo):
    h=hashlib.sha256()
    with archivo.open('rb') as f:
        for bloque in iter(lambda:f.read(1048576),b''):h.update(bloque)
    return h.hexdigest()

def seleccionar_preparacion(datos,archivo):
    datos=Path(datos);archivo=Path(archivo);esperada=huella(archivo);coincidencias=[]
    carpetas=sorted(datos.glob('PREPARACION_ABIERTOS_*'));exigir(len(carpetas)<=128,'DEMASIADAS_PREPARACIONES')
    for carpeta in carpetas:
        if not re.fullmatch(r'PREPARACION_ABIERTOS_[a-f0-9]{32}',carpeta.name):continue
        directorio=carpeta/'datos';manifest=directorio/'preparacion_NO_IMPORTAR.json'
        if not manifest.exists():continue
        try:
            privado(carpeta,True);privado(directorio,True);raw=privado(manifest).read_bytes();m=json.loads(raw)
            if m.get('formato')=='ims-abiertos-preparacion-privada-v1' and m.get('aprobado_para_importar') is False and m.get('archivo_zip')==str(archivo) and m.get('sha256_zip')==esperada:
                coincidencias.append((hashlib.sha256(raw).hexdigest(),directorio))
        except (OSError,ValueError):continue
    exigir(coincidencias,'PREPARACION_NO_ENCONTRADA')
    exigir(len(set(h for h,_ in coincidencias))==1,'PREPARACIONES_DIFERENTES_REQUIEREN_REVISION')
    return coincidencias[0][1]

def configuracion(datos):
    texto=privado(datos/'config/migracion.env').read_text();pares=[line.split('=',1) for line in texto.splitlines() if line]
    exigir(all(len(p)==2 for p in pares) and len({p[0] for p in pares})==len(pares),'CONFIGURACION_INCOMPATIBLE');cfg=dict(pares)
    exigir(cfg.get('MYSQL_HOST')=='127.0.0.1' and cfg.get('MYSQL_PORT')=='3306' and cfg.get('MYSQL_DATABASE')=='centromando_ims_ensayo' and cfg.get('MYSQL_USER')=='ims_cm_migracion' and re.fullmatch('[a-f0-9]{64}',cfg.get('MYSQL_PASSWORD','')),'CONFIGURACION_INCOMPATIBLE')
    return {k:cfg[k] for k in ('MYSQL_HOST','MYSQL_PORT','MYSQL_DATABASE','MYSQL_USER','MYSQL_PASSWORD')}

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--zip',required=True);args=ap.parse_args();os.umask(0o077)
    exigir(socket.gethostname()=='apps' and pwd.getpwuid(os.geteuid()).pw_name=='enicolalde','SERVIDOR_INCOMPATIBLE')
    datos=APP.parent/'centro_mando_ims_datos';privado(datos,True);archivo=Path(args.zip)
    exigir(re.fullmatch(re.escape(str(datos))+r'/entrada/ims-abiertos-[a-f0-9]{32}\.zip',str(archivo)),'ENTRADA_INCOMPATIBLE');privado(datos/'entrada',True);privado(archivo)
    repo=Path(__file__).resolve().parents[2];revision=subprocess.run(['git','-C',str(repo),'rev-parse','HEAD'],capture_output=True,text=True,check=True).stdout.strip()
    exigir(repo==datos/'preparaciones'/revision/'codigo','REVISION_INCOMPATIBLE')
    preparacion=seleccionar_preparacion(datos,archivo);cfg=configuracion(datos)
    salida=datos/('COPIA_ABIERTOS_MYSQL_'+uuid.uuid4().hex);salida.mkdir(mode=0o700)
    env={k:v for k,v in os.environ.items() if k not in ('NODE_OPTIONS','NODE_PATH')}
    r=subprocess.run(['/usr/bin/node','--max-old-space-size=256',str(repo/'enterprise/tools/copiar-preparacion-abiertos-mysql.mjs')],input=json.dumps({'config':cfg,'preparacion':str(preparacion)}),capture_output=True,text=True,timeout=300,env=env)
    try:informe=json.loads(r.stdout)
    except ValueError:informe={'ok':False,'codigo_error':'RESPUESTA_NO_CONFIRMADA','copia_mysql_confirmada':False,'datos_operativos_importados':False,'inventarios_activados':False,'servicios_reiniciados':False}
    exigir(isinstance(informe,dict) and informe.get('datos_operativos_importados') is False and informe.get('inventarios_activados') is False,'RESPUESTA_INCOMPATIBLE')
    destino=salida/'resumen_copia_abiertos_mysql_para_compartir.json'
    with destino.open('x',encoding='utf-8') as f:os.fchmod(f.fileno(),0o600);json.dump(informe,f,ensure_ascii=False,indent=2);f.write('\n')
    print(json.dumps(informe,ensure_ascii=False));print('Resumen para compartir: '+str(destino))
    raise SystemExit(0 if r.returncode==0 and informe.get('ok') is True else 1)

if __name__=='__main__':
    try:main()
    except CopiaRechazada as e:
        print(json.dumps({'ok':False,'codigo_error':str(e),'copia_mysql_confirmada':False,'datos_operativos_importados':False,'inventarios_activados':False,'servicios_reiniciados':False}));raise SystemExit(1)
    except Exception:
        print(json.dumps({'ok':False,'codigo_error':'COPIA_NO_CONFIRMADA','copia_mysql_confirmada':False,'reintentar_mismo_paquete_verifica_copia':True,'datos_operativos_importados':False,'inventarios_activados':False,'servicios_reiniciados':False}));raise SystemExit(1)
