#!/usr/bin/env python3
"""Agrega dos tablas propias y los tres grupos confirmados; no activa servicios."""
import json
import os
import socket
import subprocess
from pathlib import Path
import preparar_piloto as p
import preparar_operacion as op


def ampliar(admin=p.admin_mysql):
    for existentes in [set(op.ERP_TABLES),set(),{'ims_erp_inventario'},{'ims_erp_linea'}]:
        try:
            op.grants(admin,erp_extras=existentes)
        except p.PilotoError:
            continue
        faltantes=set(op.ERP_TABLES)-existentes
        if faltantes:
            admin('\n'.join(f'GRANT {op.ERP_TABLES[t]} ON `{op.DB}`.`{t}` TO {op.ACCOUNT};' for t in sorted(faltantes)))
        op.grants(admin,erp_extras=op.ERP_TABLES)
        return
    raise p.PilotoError('El perfil SQL tiene otros privilegios; no se modifica.')


def preparar(repo,datos,admin=p.admin_mysql):
    datos=p.privado(datos,True)
    s=json.loads(p.privado(datos/'piloto/solicitud.json').read_text())
    cfg=s['migracion']
    p.exigir(cfg.get('MYSQL_DATABASE')==op.DB and cfg.get('MYSQL_USER')=='ims_cm_migracion','Perfil incompatible.')
    # Comprobar el perfil antes de crear tablas. Solo se admiten estados parciales
    # de ESTA ampliación, nunca privilegios globales o de aplicaciones vecinas.
    compatible=False
    for existentes in [set(op.ERP_TABLES),set(),{'ims_erp_inventario'},{'ims_erp_linea'}]:
        try:
            op.grants(admin,erp_extras=existentes)
            compatible=True
            break
        except p.PilotoError:
            pass
    p.exigir(compatible,'El perfil SQL no coincide; revisar antes de preparar.')
    env={k:v for k,v in os.environ.items() if k not in ('NODE_OPTIONS','NODE_PATH')}
    r=subprocess.run(['/usr/bin/node',str(repo/'enterprise/tools/preparar-creacion-erp.mjs'),'--preparar'],input=json.dumps({'config':cfg,'actorId':s['lector']['actorId']}),capture_output=True,text=True,timeout=120,env=env)
    p.exigir(r.returncode==0,'La preparación de tablas o catálogo no se confirmó. El servicio actual se conserva.')
    meta=json.loads(r.stdout)
    p.exigir(meta.get('ok') is True and meta.get('tablas_erp_verificadas')==2,'Preparación incompatible.')
    ampliar(admin)
    return {**meta,'perfil_sql_ampliado_solo_select_insert':True,'historico_modificado':False,'aplicacion_activada':False,'apache_modificado':False,'puertos_abiertos':[]}


def main():
    os.umask(0o077)
    p.exigir(socket.gethostname()=='apps' and __import__('pwd').getpwuid(os.geteuid()).pw_name=='enicolalde','Ejecutar en apps como enicolalde.')
    repo=Path(__file__).resolve().parents[2]
    revision=subprocess.run(['git','-C',str(repo),'rev-parse','HEAD'],check=True,capture_output=True,text=True).stdout.strip()
    datos=p.APP.parent/'centro_mando_ims_datos'
    p.exigir(repo==datos/'preparaciones'/revision/'codigo' and not subprocess.run(['git','-C',str(repo),'status','--porcelain'],check=True,capture_output=True,text=True).stdout.strip(),'Preparación fuera de revisión aislada o con cambios.')
    import fcntl
    with open(p.privado(datos/'piloto/actualizacion.lock'),'w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        print(json.dumps(preparar(repo,datos),ensure_ascii=False,indent=2))


if __name__=='__main__':
    try:
        main()
    except Exception:
        print('Preparación de creación ERP detenida. Conserva los archivos privados; no se muestran credenciales ni se reinician servicios.')
        raise SystemExit(1)
