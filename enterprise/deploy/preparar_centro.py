#!/usr/bin/env python3
"""Recupera el Centro de Mando desde los respaldos existentes; no consulta Google."""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import zipfile
import preparar_piloto as p
import preparar_operacion as op
from copiar_abiertos_mysql import configuracion
import importlib.util
_spec=importlib.util.spec_from_file_location('ims_cm_validacion_corte',Path(__file__).resolve().parents[1]/'tools/validar_corte_abiertos.py')
_validacion=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(_validacion)
validar_zip,normal=_validacion.validar_zip,_validacion.normal

CM_TABLES={
 'ims_cm_conector':'SELECT, INSERT, UPDATE','ims_cm_archivo':'SELECT, INSERT, DELETE',
 'ims_cm_perfil':'SELECT, INSERT, UPDATE','ims_cm_acceso':'SELECT, INSERT, DELETE',
 'ims_cm_evento':'SELECT, INSERT, UPDATE','ims_cm_equipo':'SELECT, INSERT, UPDATE',
 'ims_cm_vinculo':'SELECT, INSERT','ims_cm_carpeta':'SELECT, INSERT','ims_cm_documento':'SELECT, INSERT, UPDATE',
 'ims_cm_panel':'SELECT','ims_cm_codigo':'SELECT, INSERT, UPDATE','ims_cm_fuente':'SELECT','ims_cm_legado':'SELECT',
 'ims_cm_auditoria':'SELECT, INSERT','ims_cm_trabajo':'SELECT, INSERT, UPDATE','ims_cm_publicacion':'SELECT, INSERT, UPDATE',
 'ims_cm_linea_historica':'SELECT','ims_cm_archivo_legado':'SELECT'}
CM_COLUMNS={'ims_op_actor':['activo'],'ims_auth_usuario':['nombre','password_hash']}
CM_BASE_OVERRIDES={'ims_nat_ambito':'SELECT, INSERT, DELETE'}

def validar_privilegios(admin=p.admin_mysql,completo=False):
    grantee="CONCAT(CHAR(39),'ims_cm_operacion',CHAR(39),'@',CHAR(39),'127.0.0.1',CHAR(39))"
    original={**op.TABLES,**op.SERIES_TABLES,**op.ERP_TABLES}
    minimo={(t,g) for t,gs in original.items() for g in gs.split(', ')}
    ampliado={**original,**CM_BASE_OVERRIDES,**CM_TABLES}
    maximo={(t,g) for t,gs in ampliado.items() for g in gs.split(', ')}
    actual=set(map(tuple,admin(f"SELECT TABLE_NAME,PRIVILEGE_TYPE FROM information_schema.TABLE_PRIVILEGES WHERE GRANTEE={grantee} AND TABLE_SCHEMA='{op.DB}';")))
    p.exigir(minimo<=actual<=maximo and (not completo or actual==maximo),'El perfil SQL contiene otros privilegios; no se modifica.')
    cols=set(map(tuple,admin(f"SELECT TABLE_NAME,COLUMN_NAME,PRIVILEGE_TYPE FROM information_schema.COLUMN_PRIVILEGES WHERE GRANTEE={grantee} AND TABLE_SCHEMA='{op.DB}';")))
    mincols={(t,c,'UPDATE') for t,cs in op.COLUMNS.items() for c in cs};maxcols=mincols|{(t,c,'UPDATE') for t,cs in CM_COLUMNS.items() for c in cs}
    p.exigir(mincols<=cols<=maxcols and (not completo or cols==maxcols),'Privilegios de columnas incompatibles.')
    globales=admin(f"SELECT PRIVILEGE_TYPE FROM information_schema.USER_PRIVILEGES WHERE GRANTEE={grantee};")
    esquemas=admin(f"SELECT TABLE_SCHEMA FROM information_schema.SCHEMA_PRIVILEGES WHERE GRANTEE={grantee};")
    todos=admin(f'SHOW GRANTS FOR {op.ACCOUNT};')
    p.exigir(globales==[['USAGE']] and not esquemas and all(('`'+op.DB+'`.') in r[0] or r[0].startswith('GRANT USAGE ON *.*') for r in todos),'Privilegios fuera de la base propia.')

def preparar(repo,datos,revision):
    validar_privilegios()
    cfg=configuracion(datos);sol=json.loads(p.privado(datos/'piloto/solicitud.json').read_text());actor=sol['lector']['actorId']
    # DDL aditivo en la base propia; no cambia tablas operativas existentes.
    sql=(repo/'enterprise/sql/013_centro_mando.sql').read_text()
    p.exigir(all(t.startswith('ims_cm_') for t in re.findall(r'CREATE TABLE IF NOT EXISTS (\w+)',sql)),'Esquema incompatible.')
    p.admin_mysql('USE `'+op.DB+'`;\n'+sql)
    archivo=p.privado(datos/'entrada/ims-abiertos-f0799052d8b942138c0ac3106980d740.zip')
    validar_zip(archivo,datos/'entrada')
    carpeta=datos/'centro'
    if not carpeta.exists():carpeta.mkdir(mode=0o700)
    p.privado(carpeta,True)
    with zipfile.ZipFile(archivo) as z:
        nombres={Path(i.filename).name:i for i in z.infolist() if not i.is_dir()};plan=json.loads(z.read(nombres['plan_abiertos_privado.json']))
        p.exigir(plan['corte_id']=='07e58bf9-6fe1-4bf0-b93e-d1a89cb66764','Corte incompatible.')
        fuentes=[];archivos=[]
        for f in plan['fuentes']:
            if f['tipo'] not in ('MAESTRO','INVENTARIO'):continue
            for h in f['hojas']:
                if f['tipo']=='MAESTRO' and h['nombre'].upper() in ('INVENTARIOS','REGISTRO'):continue
                if f['tipo']=='INVENTARIO' and re.search('USUARIOS|CREDENCIAL|CONFIG|PASSWORD|TOKEN|SECRET',h['nombre'].upper()):continue
                if f['tipo']=='INVENTARIO' and normal(h['nombre'])=='PLANILLADECONTEOFISICO':continue
                partes=[x for x in f['partes'] if x['hoja_id']==h['id']];rows=[];huella=hashlib.sha256()
                for parte in partes:
                    raw=z.read(nombres[parte['nombre']]);p.exigir(hashlib.sha256(raw).hexdigest()==parte['sha256'],'Fragmento alterado.');huella.update(raw);rows.extend(json.loads(raw)['filas'])
                if f['tipo']=='MAESTRO':fuentes.append({'clave':'corte:'+plan['corte_id']+':'+h['nombre'],'nombre':h['nombre'],'completa':len(rows)==h['filas'],'sha256':huella.hexdigest(),'prioridad':2,'filas':rows})
                elif rows:archivos.append({'archivo':f['id'],'hoja':h['nombre'],'filas':rows})
    paquete=carpeta/('paquete_'+revision+'.json')
    contenido=json.dumps({'corte_id':plan['corte_id'],'fuentes':fuentes,'archivos':archivos},ensure_ascii=False,separators=(',',':'))
    if paquete.exists():p.exigir(p.privado(paquete).read_text()==contenido,'Paquete administrativo distinto; no se reemplaza.')
    else:p.escribir(paquete,contenido)
    r=subprocess.run(['/usr/bin/node','--max-old-space-size=512',str(repo/'enterprise/tools/importar-centro.mjs')],input=json.dumps({'config':cfg,'actorInicial':actor,'paquete':str(paquete)}),capture_output=True,text=True,timeout=900,env={k:v for k,v in os.environ.items() if k not in ('NODE_OPTIONS','NODE_PATH')})
    try:result=json.loads(r.stdout)
    except ValueError:result={}
    if r.returncode!=0 or result.get('ok') is not True:print(json.dumps(result))
    p.exigir(r.returncode==0 and result.get('ok') is True,'No se confirmó la recuperación administrativa. El servicio actual se conserva.')
    for t,gs in {**CM_TABLES,**CM_BASE_OVERRIDES}.items():p.admin_mysql(f'GRANT {gs} ON `{op.DB}`.`{t}` TO {op.ACCOUNT};')
    for t,cs in CM_COLUMNS.items():p.admin_mysql(f"GRANT UPDATE ({','.join('`'+c+'`' for c in cs)}) ON `{op.DB}`.`{t}` TO {op.ACCOUNT};")
    validar_privilegios(completo=True)
    clave=carpeta/'clave_propia'
    if not clave.exists():p.escribir(clave,secrets.token_hex(32)+'\n')
    k=p.privado(clave).read_text().strip();p.exigir(bool(re.fullmatch('[a-f0-9]{64}',k)),'Clave de conexiones incompatible.')
    env=carpeta/(revision+'.env');texto='IMS_CENTRO_HABILITADO=1\nIMS_CENTRO_CLAVE='+k+'\nIMS_CENTRO_ADMIN_ID='+actor+'\n'
    if env.exists():p.exigir(p.privado(env).read_text()==texto,'Entorno del Centro incompatible.')
    else:p.escribir(env,texto)
    resumen=carpeta/('resumen_'+revision+'.json')
    if not resumen.exists():p.escribir(resumen,json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    return {**result,'apache_modificado':False,'puertos_abiertos':[],'otros_proyectos_modificados':False}

def validar_entorno(datos,revision):
    texto=p.privado(datos/'centro'/(revision+'.env')).read_text();lineas=texto.splitlines()
    p.exigir(len(lineas)==3 and lineas[0]=='IMS_CENTRO_HABILITADO=1' and bool(re.fullmatch('IMS_CENTRO_CLAVE=[a-f0-9]{64}',lineas[1])) and bool(re.fullmatch('IMS_CENTRO_ADMIN_ID=[a-f0-9-]{36}',lineas[2])),'Entorno del Centro incompatible.')
    p.exigir(lineas[1].split('=',1)[1]==p.privado(datos/'centro/clave_propia').read_text().strip(),'Clave privada distinta; no se activa.')
    return True

def main():
    os.umask(0o077);p.exigir(socket.gethostname()=='apps' and __import__('pwd').getpwuid(os.geteuid()).pw_name=='enicolalde','Ejecuta en apps como enicolalde.')
    repo=Path(__file__).resolve().parents[2];revision=subprocess.run(['git','-C',str(repo),'rev-parse','HEAD'],capture_output=True,text=True,check=True).stdout.strip();datos=p.privado(p.APP.parent/'centro_mando_ims_datos',True)
    p.exigir(repo==datos/'preparaciones'/revision/'codigo','Revisión no aislada.')
    import fcntl
    with open(p.privado(datos/'piloto/actualizacion.lock'),'w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);print(json.dumps(preparar(repo,datos,revision),ensure_ascii=False,indent=2))

if __name__=='__main__':
    try:main()
    except Exception as e:
        print('Detenido: '+(str(e) if isinstance(e,p.PilotoError) else 'preparación del Centro no confirmada; conserva los respaldos privados.'),file=__import__('sys').stderr);raise SystemExit(1)
