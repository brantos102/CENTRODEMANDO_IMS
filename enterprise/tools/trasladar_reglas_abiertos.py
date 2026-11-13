"""Reutiliza decisiones confirmadas por archivo físico, nunca por la fila actual."""
import json
from pathlib import Path, PurePosixPath
import zipfile
from planificar_abiertos_operativos import REGLAS_CONFIRMADAS
from preparar_traslado_abiertos import sha_archivo
from validar_corte_abiertos import validar_zip, cargar, exigir

def plan_archivo(archivo,entrada):
    validar_zip(archivo,entrada)
    with zipfile.ZipFile(archivo) as z:
        nombre=next(x.filename for x in z.infolist() if PurePosixPath(x.filename).name=='plan_abiertos_privado.json')
        return cargar(z.read(nombre))

def trasladar_reglas(datos,preparacion,contexto,confirmadas=REGLAS_CONFIRMADAS):
    reglas={'copia_id':contexto['copia_id']};resultado=[]
    candidatos=[]
    carpetas=list(datos.glob('PREPARACION_ABIERTOS_*/datos/preparacion_NO_IMPORTAR.json'))
    exigir(len(carpetas)<=128,'Demasiadas preparaciones para trasladar reglas.')
    for f in carpetas:
        if f.is_file() and not f.is_symlink() and f.resolve()==f and sha_archivo(f)==confirmadas['copia_id']:candidatos.append(f)
    if not candidatos:return reglas,[{'estado':'COPIA_ANTERIOR_NO_LOCALIZADA','reglas_aplicadas':0}]
    anterior=json.loads(candidatos[0].read_bytes());archivo=Path(anterior['archivo_zip'])
    exigir(archivo.parent==datos/'entrada' and archivo.resolve()==archivo and sha_archivo(archivo)==anterior['sha256_zip'],'Copia de reglas anterior incompatible.')
    viejo=plan_archivo(archivo,datos/'entrada')
    m=json.loads((preparacion/'preparacion_NO_IMPORTAR.json').read_bytes());actual=plan_archivo(Path(m['archivo_zip']),datos/'entrada')
    exigir(contexto['corte_id']==actual['corte_id'] and anterior['corte_id']==viejo['corte_id'],'Cortes de reglas incompatibles.')
    filas={}
    for linea in (preparacion/'lineas_candidatas_NO_IMPORTAR.jsonl').read_text(encoding='utf-8').splitlines():
        r=json.loads(linea);filas.setdefault(r['origen']['origen_drive'],[]).append(r)
    esquemas=json.loads((preparacion/'esquemas_NO_COMPARTIR.json').read_bytes())
    for tipo in ('separar_codigo_fecha','pendientes_inicio'):
        for regla in confirmadas.get(tipo,[]):
            origenes=[f for f in viejo['fuentes'] if f['tipo']=='INVENTARIO' and any(r['fila']==regla['fila_panel_corte'] for r in f['panel'])]
            exigir(len(origenes)==1,'La regla anterior no tiene un archivo físico único.')
            origen=origenes[0]['id'];fuentes=[f for f in actual['fuentes'] if f['tipo']=='INVENTARIO' and f['id']==origen]
            estado='ARCHIVO_NO_PRESENTE_EN_CORTE'
            if fuentes:
                rows=filas.get(origen,[]);codigos={r['codigo_operativo_original'] for r in rows if r['codigo_operativo_original']}
                admisible=len(rows)==regla['productos'] and len(codigos)==regla['codigos']
                if admisible and tipo=='pendientes_inicio':
                    ss=[s for s in esquemas if s['origen_drive']==origen and s['clase']=='PLANILLA_CONTEO']
                    admisible=len(ss)==1 and len(ss[0]['campos'].get('fecha_inicio',[]))==1
                    if admisible:
                        col=ss[0]['campos']['fecha_inicio'][0]
                        for r in rows:
                            c=next((c for c in r['fila_original']['celdas'] if c['columna']==col),None)
                            admisible=admisible and c is not None and (c['tipo']=='z' or c['tipo']=='s' and not c['valor'].strip()) and all(r['cantidades'][k]['estado']=='VACIO' for k in ('c1','c2','c3'))
                estado='APLICADA_POR_ARCHIVO_FISICO' if admisible else 'DATOS_ACTUALES_DIFIEREN_REGLA_CONSERVADA'
                if admisible:reglas.setdefault(tipo,[]).append({**regla,'origen_drive':origen})
            resultado.append({'regla':tipo,'fila_panel_copia_anterior':regla['fila_panel_corte'],'estado':estado})
    return reglas,resultado
