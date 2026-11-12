#!/usr/bin/env python3
"""Proyecta cada línea conservada al núcleo nativo; no importa ni activa SQL."""
from collections import Counter, defaultdict
from datetime import datetime, date
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import uuid
import zipfile
from zoneinfo import ZoneInfo
from preparar_traslado_abiertos import cantidad, identificador, escribir_json, sha_archivo
from validar_corte_abiertos import validar_zip, buscar_base, cargar, panel_valor, origen_panel, exigir, normal

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def id_estable(tipo,clave):
    # No depende del SKU, número escrito por el operador ni del orden del panel.
    raw=json.dumps(['ims-abiertos-operativos-v1',tipo,clave],ensure_ascii=False,separators=(',',':')).encode()
    b=bytearray(hashlib.sha256(raw).digest()[:16]);b[6]=(b[6]&15)|128;b[8]=(b[8]&63)|128
    return str(uuid.UUID(bytes=bytes(b)))

def fecha_celda(celda,zona):
    if not celda or celda['valor'] is None or not str(celda['valor']).strip():return None
    raw=celda['valor']
    if celda['tipo']=='d':
        return datetime.fromisoformat(raw.replace('Z','+00:00')).astimezone(ZoneInfo(zona)).date().isoformat()
    if celda['tipo']=='s' and re.fullmatch(r'20\d\d-\d\d-\d\d',raw):return date.fromisoformat(raw).isoformat()
    raise ValueError('FECHA_REQUIERE_REGLA')

def estado_panel(valor):
    # Equivalencias explícitas. Una negación o estado desconocido queda retenido.
    return {'ENPROCESO':'EN_PROCESO','ENVALIDACION':'EN_VALIDACION',
            'ENTREGADO':'ENTREGADO','CANCELADO':'CANCELADO'}.get(normal(valor))

TEXTOS={'posicion':(255,False),'descripcion':(65535,True),'serie':(255,False),
    'lote':(255,False),'unidad':(50,False),'observacion':(65535,True),
    'nueva_posicion':(255,False),'motivo':(255,False),'justificacion':(65535,True),
    'abc':(50,False),'despacho':(255,False),'partida':(255,False),
    'categoria':(255,False),'estado_mercancia':(255,False)}

def proyectar_linea(row,esquema,numero):
    mapa=esquema['campos'];cells={c['columna']:c for c in row['fila_original']['celdas']};errores=[];avisos=[]
    def celda(k):
        cols=mapa.get(k,[])
        if len(cols)>1:errores.append('CABECERA_'+k.upper()+'_NO_UNICA')
        return cells.get(cols[0]) if len(cols)==1 else None
    def texto(k):
        c=celda(k)
        if not c or c['valor'] is None:return ''
        if c['tipo'] not in ('s','n'):errores.append('TIPO_'+k.upper()+'_REQUIERE_REVISION')
        valor=identificador(c) if k in ('serie','lote','despacho','partida') else str(c['valor'])
        return valor or ''
    sku=identificador(celda('producto'));codigo=identificador(celda('codigo'))
    if sku!=row['sku_propuesto'] or codigo!=row['codigo_operativo_original']:errores.append('IDENTIFICADOR_PREPARADO_DIFERENTE')
    if not sku or len(sku)>255:errores.append('SKU_NO_ADMITIDO')
    if not codigo:errores.append('CODIGO_OPERATIVO_NO_DEFINIDO')
    elif len(codigo)>255:errores.append('CODIGO_FUERA_LONGITUD')
    qs={}
    for k in ('depot','c1','c2','c3','ajuste','fisico'):
        c=celda(k);q=cantidad(c);qs[k]=q['valor_decimal']
        if q!=row['cantidades'].get(k):errores.append('CANTIDAD_PREPARADA_DIFERENTE_'+k.upper())
        if k in ('depot','c1','c2','c3') and len(mapa.get(k,[]))!=1:errores.append('CABECERA_'+k.upper()+'_NO_UNICA')
        if q['estado'] not in ('EXACTA','VACIO','SIN_COLUMNA'):errores.append(k.upper()+'_'+q['estado'])
        if k=='depot' and q['estado']!='EXACTA':errores.append('DEPOT_NO_DEFINIDO')
        if k in ('depot','c1','c2','c3') and qs[k] and qs[k].startswith('-'):errores.append(k.upper()+'_NEGATIVO')
    for a,b in [('c1','c2'),('c2','c3')]:
        if qs[a] is None and qs[b] is not None:avisos.append('CAPTURA_'+b.upper()+'_SIN_'+a.upper())
    campos={k:texto(k) for k in TEXTOS}
    for k,(limite,bytes_) in TEXTOS.items():
        v=campos[k]
        if (len(v.encode('utf-8')) if bytes_ else len(v))>limite or '\x00' in v:errores.append('LONGITUD_O_TEXTO_'+k.upper())
    fechas={}
    for k in ('fecha_inicio','fecha_fin'):
        try:fechas[k]=fecha_celda(celda(k),row['origen'].get('zona_horaria'))
        except (ValueError,TypeError,KeyError):fechas[k]=None;errores.append(k.upper()+'_REQUIERE_REGLA')
    if not fechas['fecha_inicio']:errores.append('FECHA_INICIO_NO_DEFINIDA')
    if fechas['fecha_inicio'] and not re.fullmatch(r'20\d\d-\d\d-\d\d',fechas['fecha_inicio']):errores.append('FECHA_INICIO_FUERA_RANGO')
    # La serie literal queda preservada. 0 y N/A son ausencia en el WMS.
    serie=campos['serie'].strip()
    if serie.upper() not in ('','0','N/A') and qs['depot']!='1.000000000':errores.append('SERIE_CON_STOCK_DISTINTO_DE_UNO')
    origen=row['origen'];linea_id=id_estable('linea',[origen['origen_drive'],origen['hoja_id'],origen['fila']])
    return {'linea_id':linea_id,'referencia_copia':row['referencia_copia'],'origen':origen,
        'numero':numero,'numero_original':identificador(celda('numero')),'sku':sku,'codigo_original':codigo,
        'conteo_1':qs['c1'],'conteo_2':qs['c2'],'conteo_final':qs['c3'],
        'depot':qs['depot'],'ajuste':qs['ajuste'],'fisico_original':qs['fisico'],
        **fechas,**campos,'bloqueos':sorted(set(errores)),'avisos':sorted(set(avisos)),
        'aprobado_para_importar':False}

def proyectar_paquete(preparacion,contexto,plan,base,salida):
    """Contexto SQL ya verificado; conserva todas las líneas, incluidas retenidas."""
    prep=Path(preparacion);salida=Path(salida)
    m=json.loads((prep/'preparacion_NO_IMPORTAR.json').read_bytes());raw=(prep/'preparacion_NO_IMPORTAR.json').read_bytes()
    exigir(contexto.get('formato')=='ims-abiertos-contexto-sql-v1' and contexto.get('integridad_sql_verificada') is True and contexto.get('copia_id')==sha(raw) and contexto.get('corte_id')==m['corte_id']==plan['corte_id'],'Contexto y copia incompatibles.')
    for name,h in m['archivos_sha256'].items():exigir(sha_archivo(prep/name)==h,'Preparación alterada.')
    fuentes=[('SELECCION_ACTUAL',plan['corte_id'],i,f) for i,f in enumerate(plan['fuentes'],1) if f['tipo']=='INVENTARIO']
    if base:
        retiradas=plan['recuperacion']['fuentes_retiradas']
        fuentes.extend(('FUERA_SELECCION_CONSERVADO',base['corte_id'],i,{**f,'panel':[r for r in plan['panel'][1:] if origen_panel(r)==f['id']]}) for i,f in enumerate(base['fuentes'],1) if f['id'] in retiradas)
    esquemas=json.loads((prep/'esquemas_NO_COMPARTIR.json').read_bytes());por_fuente=defaultdict(list)
    exigir(type(contexto['productos']) is int and 0<=contexto['productos']<=100000,'Demasiados productos para este plan.')
    with (prep/'lineas_candidatas_NO_IMPORTAR.jsonl').open(encoding='utf-8') as f:
        for linea in f:
            r=json.loads(linea);o=r['origen'];por_fuente[(r['ambito'],o['corte_id'],o['origen_drive'])].append(r)
    exigir(sum(map(len,por_fuente.values()))==contexto['productos'],'Número de productos incompatible.')
    catalogo=defaultdict(list)
    for c in contexto['clientes']:catalogo[c['nombre']].append(c['id'])
    existentes=defaultdict(list)
    for e in contexto['existentes']:existentes[e['origen_drive']].append(e)
    publicos=[];privados=[];proyecciones=[];vistos=set()
    for ambito,corte,indice,f in fuentes:
        clave=(ambito,corte,f['id']);exigir(clave not in vistos,'Fuente repetida.');vistos.add(clave)
        filas=por_fuente.get(clave,[]);bloqueos=Counter();avisos=Counter();refs=[r['fila'] for r in f['panel']]
        clientes=sorted(set(panel_valor(r,1).strip() for r in f['panel']));sedes=sorted(set(panel_valor(r,6).strip().upper() for r in f['panel']));estados=sorted(set(estado_panel(panel_valor(r,7)) or 'NO_MAPEADO' for r in f['panel']))
        if len(clientes)!=1 or not clientes[0]:bloqueos['CLIENTE_PANEL_NO_UNICO']=1
        cliente=clientes[0] if len(clientes)==1 else None;ids=catalogo.get(cliente,[])
        if len(ids)!=1:bloqueos['CLIENTE_NO_CATALOGADO' if not ids else 'CLIENTE_CATALOGO_AMBIGUO']=1
        if len(sedes)!=1 or sedes[0] not in ('UIO','GYE'):bloqueos['SEDE_PANEL_NO_UNICA']=1
        if len(estados)!=1 or estados[0]=='NO_MAPEADO':bloqueos['ESTADO_PANEL_REQUIERE_MAPEO']=1
        if estados==['CANCELADO']:bloqueos['CANCELADO_REQUIERE_CONCILIACION']=1
        if ambito!='SELECCION_ACTUAL':bloqueos['FUERA_SELECCION_REQUIERE_CONCILIACION']=1
        elif estados==['ENTREGADO']:bloqueos['ENTREGADO_EN_SELECCION_ABIERTA']=1
        if existentes[f['id']]:bloqueos['ORIGEN_YA_PRESENTE_REQUIERE_DELTA']=1
        if not filas:bloqueos['ARCHIVO_SIN_PRODUCTOS']=1
        codigos=set();fechas=set();hojas=set();series=Counter();lineas=[]
        for numero,row in enumerate(filas,1):
            o=row['origen'];hojas.add(o['hoja_id'])
            ss=[s for s in esquemas if s['ambito']==ambito and s['origen_drive']==f['id'] and s['hoja_id']==o['hoja_id'] and s['clase']=='PLANILLA_CONTEO']
            exigir(len(ss)==1,'Esquema de producto no único.')
            linea=proyectar_linea(row,ss[0],numero);bloqueos.update(linea['bloqueos']);avisos.update(linea['avisos'])
            if linea['codigo_original']:codigos.add(linea['codigo_original'])
            if linea['fecha_inicio']:fechas.add(linea['fecha_inicio'])
            serie=linea['serie'].strip()
            if serie.upper() not in ('','0','N/A'):series[serie]+=1
            lineas.append(linea)
        if len(codigos)>1:bloqueos['ARCHIVO_CON_VARIOS_CODIGOS_REQUIERE_MAPEO']=1
        if len(fechas)>1:bloqueos['ARCHIVO_CON_VARIAS_FECHAS_INICIO']=1
        if len(hojas)>1:bloqueos['VARIAS_PLANILLAS_REQUIEREN_MAPEO']=1
        if any(n>1 for n in series.values()):bloqueos['SERIE_REPETIDA_REQUIERE_REVISION']=sum(n-1 for n in series.values() if n>1)
        for s in esquemas:
            if s['ambito']==ambito and s['origen_drive']==f['id'] and s['clase']=='PLANILLA_CONTEO' and s['filas_copiadas']!=s['filas_previstas']:bloqueos['PLANILLA_COPIADA_PARCIALMENTE']=1
        inv_id=id_estable('inventario',f['id'])
        for l in lineas:proyecciones.append({**l,'inventario_id':inv_id,'cliente_id':ids[0] if len(ids)==1 else None,'ambito':ambito})
        publico={'fuente_en_corte':indice,'ambito':ambito,'filas_panel_corte':refs,'productos':len(filas),
            'codigos_distintos':len(codigos),'estado_captura':f['estado'],'estado_destino':estados[0] if len(estados)==1 else None,
            'sin_bloqueos_estructurales':not bool(bloqueos),'bloqueos':dict(sorted(bloqueos.items())),
            'avisos':dict(sorted(avisos.items())),'capturas_presentes':{k:sum(l[k] is not None for l in lineas) for k in ('conteo_1','conteo_2','conteo_final')},
            'ceros_contados':{k:sum(l[k]=='0.000000000' for l in lineas) for k in ('conteo_1','conteo_2','conteo_final')},
            'requiere_delta_final':True,'listo_para_activar':False}
        publicos.append(publico);privados.append({**publico,'inventario_id':inv_id,'origen_drive':f['id'],
            'cliente_panel':cliente,'cliente_id':ids[0] if len(ids)==1 else None,'sede':sedes[0] if len(sedes)==1 else None,
            'codigos_originales':sorted(codigos),'fechas_inicio_originales':sorted(fechas),
            'panel_original':f['panel'],'inventarios_existentes':existentes[f['id']]})
    exigir(set(por_fuente)<=vistos,'Hay productos fuera del catálogo de fuentes.')
    exigir(not salida.exists() and salida.resolve()==salida,'Salida nueva y sin enlaces requerida.');salida.mkdir(mode=0o700)
    with (salida/'lineas_operativas_NO_ACTIVAR.jsonl').open('x',encoding='utf-8') as out:
        __import__('os').fchmod(out.fileno(),0o600)
        for r in proyecciones:out.write(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n')
    auxiliares=prep/'filas_auxiliares_NO_IMPORTAR.jsonl'
    with auxiliares.open(encoding='utf-8') as f:exigir(sum(1 for _ in f)==contexto['auxiliares'],'Número de auxiliares incompatible.')
    # Permanecen en la copia MySQL íntegra. El plan solo referencia su hash.
    plan_privado={'formato':'ims-abiertos-plan-operativo-v1','copia_id':contexto['copia_id'],'corte_id':plan['corte_id'],
        'inventarios':privados,'esquemas':esquemas,'productos':len(proyecciones),'auxiliares_conservados':contexto['auxiliares'],
        'auxiliares_sha256':sha_archivo(auxiliares),'proyecciones_sha256':sha_archivo(salida/'lineas_operativas_NO_ACTIVAR.jsonl'),
        'requiere_delta_final':True,'aprobado_para_importar':False}
    escribir_json(salida/'plan_operativo_NO_ACTIVAR.json',plan_privado)
    totales=Counter()
    for p in publicos:totales.update(p['bloqueos'])
    resumen={'ok':True,'formato':'ims-abiertos-plan-operativo-resumen-v1','copia_id':contexto['copia_id'],
        'plan_id':sha_archivo(salida/'plan_operativo_NO_ACTIVAR.json'),'corte_id':plan['corte_id'],
        'integridad_sql_verificada':True,'inventarios':len(publicos),'productos':len(proyecciones),
        'filas_auxiliares_conservadas':contexto['auxiliares'],'inventarios_sin_bloqueos_estructurales':sum(p['sin_bloqueos_estructurales'] for p in publicos),
        'inventarios_con_bloqueos_estructurales':sum(not p['sin_bloqueos_estructurales'] for p in publicos),
        'fuentes':publicos,'bloqueos':dict(sorted(totales.items())),
        'maestro_hojas':[{'hoja_en_fuente':s['hoja_en_fuente'],'clase':s['clase'],'completa':s['filas_copiadas']==s['filas_previstas'],'filas_previstas':s['filas_previstas'],'filas_copiadas':s['filas_copiadas']} for s in esquemas if s['tipo_fuente']=='MAESTRO' and s['ambito']=='SELECCION_ACTUAL'],
        'requiere_delta_final':True,'listo_para_activar':False,'datos_operativos_importados':False,
        'base_de_datos_modificada':False,'inventarios_activados':False,'permisos_creados':False,'publicacion_kpi':False,
        'servicios_reiniciados':False,'apache_modificado':False,'puertos_abiertos':[]}
    exigir((prep/'preparacion_NO_IMPORTAR.json').read_bytes()==raw and sha_archivo(m['archivo_zip'])==m['sha256_zip'],'La preparación cambió durante el plan.')
    for name,h in m['archivos_sha256'].items():exigir(sha_archivo(prep/name)==h,'La preparación cambió durante el plan.')
    escribir_json(salida/'resumen_plan_abiertos_para_compartir.json',resumen)
    return resumen

def planificar(preparacion,contexto,salida,base_dir):
    prep=Path(preparacion);m=json.loads((prep/'preparacion_NO_IMPORTAR.json').read_bytes())
    validacion,privado=validar_zip(m['archivo_zip'],base_dir)
    exigir(privado['sha256_zip']==m['sha256_zip'],'ZIP diferente de la preparación.')
    with zipfile.ZipFile(m['archivo_zip']) as z:
        entradas={PurePosixPath(i.filename).name:i for i in z.infolist() if not i.is_dir()}
        p=cargar(z.read(entradas['plan_abiertos_privado.json']))
    base=buscar_base(p['recuperacion'],base_dir) if p['formato']=='ims-abiertos-corte-v2' else None
    return proyectar_paquete(prep,contexto,p,base,Path(salida))
