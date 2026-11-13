#!/usr/bin/env python3
"""Conserva el corte elegido en MySQL y proyecta sus capturas, sin activar permisos."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import socket
import subprocess
import sys
import uuid
from copiar_abiertos_mysql import APP, CopiaRechazada, configuracion, exigir, privado, seleccionar_preparacion

TOOLS=Path(__file__).resolve().parents[1]/'tools'
sys.path.insert(0,str(TOOLS))
from preparar_traslado_abiertos import preparar, escribir_json, sha_archivo
from validar_corte_abiertos import validar_zip
from planificar_abiertos_operativos import planificar
from trasladar_reglas_abiertos import trasladar_reglas

CORTE_ELEGIDO='07e58bf9-6fe1-4bf0-b93e-d1a89cb66764'

def ejecutar_node(repo,herramienta,solicitud):
    env={k:v for k,v in os.environ.items() if k not in ('NODE_OPTIONS','NODE_PATH')}
    r=subprocess.run(['/usr/bin/node','--max-old-space-size=256',str(repo/'enterprise/tools'/herramienta)],input=json.dumps(solicitud),capture_output=True,text=True,timeout=300,env=env)
    try:d=json.loads(r.stdout)
    except ValueError:raise CopiaRechazada('RESPUESTA_SQL_NO_CONFIRMADA')
    exigir(isinstance(d,dict),'RESPUESTA_SQL_NO_CONFIRMADA')
    if r.returncode or d.get('ok') is False:
        codigo=d.get('codigo_error','RESPUESTA_SQL_NO_CONFIRMADA')
        raise CopiaRechazada(codigo if isinstance(codigo,str) and re.fullmatch('[A-Z_]{1,80}',codigo) else 'RESPUESTA_SQL_NO_CONFIRMADA')
    return d

def procesar(archivo,datos,repo,corte_id,salida,estado,ejecutar=ejecutar_node):
    """Las llamadas SQL conservan los contratos existentes de copia e integridad."""
    estado['etapa']='VALIDAR_CORTE_ELEGIDO'
    validacion,v=validar_zip(archivo,datos/'entrada')
    exigir(v['corte_id']==corte_id,'CORTE_DISTINTO_DEL_ELEGIDO')
    exigir(validacion.get('captura_completa') is True and validacion['fuentes_pendientes']==0 and not validacion['panel_cambio'] and not validacion['filas_panel_sin_archivo'] and not validacion['referencias_discordantes'],'CORTE_ELEGIDO_INCOMPATIBLE')
    estado['etapa']='PREPARAR_CAPTURAS_GUARDADAS'
    try:prep=seleccionar_preparacion(datos,archivo)
    except CopiaRechazada as error:
        if str(error)!='PREPARACION_NO_ENCONTRADA':raise
        padre=datos/('PREPARACION_ABIERTOS_'+uuid.uuid4().hex);padre.mkdir(mode=0o700);prep=padre/'datos'
        preparar(archivo,prep,datos/'entrada')
    manifest=prep/'preparacion_NO_IMPORTAR.json';privado(manifest);m=json.loads(manifest.read_bytes());copia=sha_archivo(manifest)
    exigir(m['corte_id']==corte_id and m['sha256_zip']==v['sha256_zip'],'PREPARACION_DE_OTRO_CORTE')
    aceptacion={'formato':'ims-abiertos-corte-elegido-v1','corte_id':corte_id,'copia_id':copia,'sha256_zip':v['sha256_zip'],'usar_capturas_guardadas':True,'solicitar_nueva_extraccion_google':False,'fuentes_revision_conservadas':validacion['revision_fuentes'],'maestro_incompleto_aceptado_como_copia':not validacion.get('maestro',{}).get('completo',False),'activar_datos_incompletos_automaticamente':False}
    escribir_json(salida/'corte_elegido_NO_COMPARTIR.json',aceptacion)
    cfg=configuracion(datos)
    estado['etapa']='COPIAR_CAPTURAS_MYSQL';estado['copia_mysql_intentada']=True
    c=ejecutar(repo,'copiar-preparacion-abiertos-mysql.mjs',{'config':cfg,'preparacion':str(prep)})
    exigir(c.get('ok') is True and c.get('integridad_sql_verificada') is True and c.get('copia_id')==copia and c.get('corte_id')==corte_id and c.get('datos_operativos_importados') is False and c.get('inventarios_activados') is False,'COPIA_SQL_NO_CONFIRMADA')
    estado.update(copia_mysql_confirmada=True,copia_id=copia)
    escribir_json(salida/'resumen_copia_mysql_para_compartir.json',c)
    estado['etapa']='VERIFICAR_CONTEXTO_MYSQL'
    contexto=ejecutar(repo,'leer-contexto-abiertos-mysql.mjs',{'config':cfg,'preparacion':str(prep),'copiaId':copia})
    escribir_json(salida/'contexto_sql_NO_COMPARTIR.json',contexto)
    estado['etapa']='PROYECTAR_CAPTURAS_OPERATIVAS'
    reglas,transferencia=trasladar_reglas(datos,prep,contexto)
    escribir_json(salida/'reglas_por_origen_NO_COMPARTIR.json',reglas)
    p=planificar(prep,contexto,salida/'plan',datos/'entrada',reglas=reglas,aceptacion=aceptacion)
    exigir(sha_archivo(archivo)==v['sha256_zip'],'ZIP_ALTERADO')
    return {'ok':True,'formato':'ims-abiertos-corte-elegido-resumen-v1','corte_id':corte_id,'corte_elegido_por_usuario':True,'solicitar_nueva_extraccion_google':False,'copia_revision_mysql':True,'base_de_datos_modificada':not c.get('ya_copiada',False),'requiere_delta_final':False,'copia_id':copia,'ya_copiada':c.get('ya_copiada',False),'integridad_sql_verificada':True,'productos_guardados':c['productos'],'filas_auxiliares_guardadas':c['filas_auxiliares'],'fuentes_revision_conservadas':validacion['revision_fuentes'],'maestro_completo':validacion['maestro']['completo'],'reglas_operativas_anteriores':transferencia,'plan_operativo':p,'datos_operativos_importados':False,'inventarios_activados':False,'permisos_creados':False,'publicacion_kpi':False,'historico_modificado':False,'operacion_nativa_modificada':False,'servicios_reiniciados':False,'apache_modificado':False,'puertos_abiertos':[]}

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--zip',required=True);ap.add_argument('--corte-id',required=True);args=ap.parse_args();os.umask(0o077)
    estado={'etapa':'VERIFICAR_ENTORNO','copia_mysql_intentada':False,'copia_mysql_confirmada':False};salida=None
    try:
        exigir(socket.gethostname()=='apps' and pwd.getpwuid(os.geteuid()).pw_name=='enicolalde','SERVIDOR_INCOMPATIBLE')
        exigir(args.corte_id==CORTE_ELEGIDO,'CORTE_NO_AUTORIZADO_EN_ESTE_PROCESO')
        datos=APP.parent/'centro_mando_ims_datos';privado(datos,True);archivo=Path(args.zip)
        exigir(re.fullmatch(re.escape(str(datos))+r'/entrada/ims-abiertos-[a-f0-9]{32}\.zip',str(archivo)),'ENTRADA_INCOMPATIBLE');privado(datos/'entrada',True);privado(archivo)
        repo=Path(__file__).resolve().parents[2];revision=subprocess.run(['git','-C',str(repo),'rev-parse','HEAD'],capture_output=True,text=True,check=True).stdout.strip()
        exigir(repo==datos/'preparaciones'/revision/'codigo','REVISION_INCOMPATIBLE')
        lock=datos/'procesar-corte-elegido.lock'
        with os.fdopen(os.open(lock,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600),'r+') as f:
            privado(lock);fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
            salida=datos/('CORTE_ELEGIDO_'+uuid.uuid4().hex);salida.mkdir(mode=0o700)
            r=procesar(archivo,datos,repo,args.corte_id,salida,estado)
    except Exception as error:
        codigo=str(error) if isinstance(error,CopiaRechazada) and re.fullmatch('[A-Z_]{1,80}',str(error)) else 'PROCESO_CORTE_NO_CONFIRMADO'
        r={'ok':False,'codigo_error':codigo,**estado,'datos_operativos_importados':False,'inventarios_activados':False,'servicios_reiniciados':False,'apache_modificado':False,'puertos_abiertos':[]}
    if salida:
        informe=salida/'resumen_corte_elegido_para_compartir.json';escribir_json(informe,r)
    print(json.dumps(r,ensure_ascii=False))
    if salida:print('Resumen para compartir: '+str(informe))
    return 0 if r['ok'] else 1

if __name__=='__main__':raise SystemExit(main())
