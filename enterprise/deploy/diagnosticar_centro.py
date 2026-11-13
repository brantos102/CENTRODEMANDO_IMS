#!/usr/bin/env python3
"""Revisa metadatos administrativos ya guardados; no consulta Google ni modifica SQL."""
import json
import os
from pathlib import Path
import pwd
import socket
import subprocess
import sys
import zipfile
from copiar_abiertos_mysql import APP, privado, configuracion, exigir

def main():
 os.umask(0o077);exigir(socket.gethostname()=='apps' and pwd.getpwuid(os.geteuid()).pw_name=='enicolalde','SERVIDOR_INCOMPATIBLE')
 datos=APP.parent/'centro_mando_ims_datos';privado(datos,True);repo=Path(__file__).resolve().parents[2]
 revision=subprocess.run(['git','-C',str(repo),'rev-parse','HEAD'],capture_output=True,text=True,check=True).stdout.strip();exigir(repo==datos/'preparaciones'/revision/'codigo','REVISION_INCOMPATIBLE')
 r=subprocess.run(['/usr/bin/node',str(repo/'enterprise/tools/diagnosticar-centro.mjs')],input=json.dumps({'config':configuracion(datos)}),capture_output=True,text=True,timeout=60,env={k:v for k,v in os.environ.items() if k not in ('NODE_OPTIONS','NODE_PATH')});d=json.loads(r.stdout)
 exigir(r.returncode==0 and d.get('ok') is True,'DIAGNOSTICO_NO_CONFIRMADO')
 z=privado(datos/'entrada/ims-abiertos-f0799052d8b942138c0ac3106980d740.zip')
 with zipfile.ZipFile(z) as archivo:
  entradas=[x for x in archivo.infolist() if Path(x.filename).name=='plan_abiertos_privado.json'];exigir(len(entradas)==1 and entradas[0].file_size<=8388608,'PLAN_INCOMPATIBLE');p=json.loads(archivo.read(entradas[0]));exigir(p['corte_id']=='07e58bf9-6fe1-4bf0-b93e-d1a89cb66764','CORTE_INCOMPATIBLE')
  maestro=next(f for f in p['fuentes'] if f['tipo']=='MAESTRO');d['maestro_del_corte']=[{'hoja':h['nombre'],'filas':h['filas'],'columnas':h['columnas'],'filas_capturadas':sum(x['filas'] for x in maestro['partes'] if x['hoja_id']==h['id'])} for h in maestro['hojas']]
 print(json.dumps(d,ensure_ascii=False))

if __name__=='__main__':
 try:main()
 except Exception:print(json.dumps({'ok':False,'codigo_error':'DIAGNOSTICO_CENTRO_NO_CONFIRMADO','base_de_datos_modificada':False,'servicios_reiniciados':False}));raise SystemExit(1)
