#!/usr/bin/env python3
"""Carga los dos CSV ya entregados, desde un ZIP privado verificado; no toca stock."""
import hashlib
import json
import os
from pathlib import Path
import pwd
import socket
import subprocess
import zipfile
from copiar_abiertos_mysql import configuracion
from preparar_piloto import privado,exigir
ARCHIVOS={
 'POS_ITSANET.csv':{'sha256':'1bab34bf817a591043ec1a2fb5d81c643715b0bbcb91f92ac8ac48591fd7ea48','tipo':'WTW','sedes':['UIO','GYE']},
 'RELACION_EAN13_UIO.csv':{'sha256':'c9ff4617bd8c9dcbb61963bdb00856f4324add5e29b81833a23c2d7b8d542de5','tipo':'EAN','sedes':['UIO']},
}
def comprobar_zip(archivo):
    with zipfile.ZipFile(archivo) as z:
        infos=z.infolist()
        exigir(len(infos)==2 and {i.filename for i in infos}==set(ARCHIVOS),'ZIP_DE_CATALOGOS_INCOMPATIBLE')
        out={}
        for i in infos:
            exigir(not i.is_dir() and not i.flag_bits&1 and 0<i.file_size<=16*1024*1024,'ARCHIVO_DE_CATALOGO_INCOMPATIBLE')
            contenido=z.read(i)
            exigir(hashlib.sha256(contenido).hexdigest()==ARCHIVOS[i.filename]['sha256'],'HUELLA_DE_CATALOGO_INCOMPATIBLE')
            out[i.filename]=contenido
        return out

def main():
    os.umask(0o077)
    exigir(socket.gethostname()=='apps' and pwd.getpwuid(os.geteuid()).pw_name=='enicolalde','SERVIDOR_INCOMPATIBLE')
    datos=Path('/home/enicolalde/bryan/centro_mando_ims_datos');privado(datos,True)
    entrada=datos/'entrada';privado(entrada,True)
    archivo=entrada/'catalogos_ims_privados_20261116.zip';privado(archivo)
    contenidos=comprobar_zip(archivo);carpeta=entrada/'catalogos_ims_20261116'
    if not carpeta.exists():carpeta.mkdir(mode=0o700)
    privado(carpeta,True)
    fs=[]
    for nombre,contenido in contenidos.items():
        destino=carpeta/nombre
        if destino.exists():
            privado(destino);exigir(hashlib.sha256(destino.read_bytes()).hexdigest()==ARCHIVOS[nombre]['sha256'],'CATALOGO_PREVIO_DISTINTO_CONSERVADO')
        else:
            with destino.open('xb') as f:f.write(contenido)
        fs.append({'ruta':str(destino),'nombre':nombre,**ARCHIVOS[nombre]})
    actor=json.loads(privado(datos/'piloto/solicitud.json').read_text())['lector']['actorId']
    repo=Path(__file__).resolve().parents[2]
    registro=json.loads(privado(datos/'ERP_LECTURA_5b24e0016a134b1e9aae96f878faf9ff/registro_erp_runtime_NO_COMPARTIR.json').read_text())
    cuentas=[{k:c.get(k) for k in ('sede','clienteId','clienteNombre','codigosCliente')} for c in registro['conexiones']]
    payload={'config':configuracion(datos),'actorId':actor,'archivos':fs,'cuentasERP':cuentas}
    r=subprocess.run(['/usr/bin/node','--max-old-space-size=512',str(repo/'enterprise/tools/cargar-catalogos-privados.mjs')],input=json.dumps(payload),capture_output=True,text=True,timeout=600,env={k:v for k,v in os.environ.items() if k not in ('NODE_OPTIONS','NODE_PATH')})
    exigir(r.stdout and len(r.stdout)<32768,'CARGA_DE_CATALOGOS_SIN_RESPUESTA')
    resultado=json.loads(r.stdout);print(json.dumps(resultado,ensure_ascii=False))
    exigir(r.returncode==0 and resultado.get('ok') is True,'CARGA_DE_CATALOGOS_NO_CONFIRMADA')
if __name__=='__main__':
    try:main()
    except Exception as e:
        codigo=str(e) if __import__('re').fullmatch('[A-Z_]{1,80}',str(e)) else 'CARGA_CATALOGOS_DETENIDA'
        print(json.dumps({'ok':False,'codigo':codigo,'stock_modificado':False,'servicios_reiniciados':False}))
        raise SystemExit(1)
