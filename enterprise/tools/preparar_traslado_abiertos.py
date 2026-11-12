#!/usr/bin/env python3
"""Preparación privada de datos Google en operación; no importa ni activa SQL."""
import argparse
from collections import Counter
from decimal import Decimal, InvalidOperation, localcontext
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import zipfile
from validar_corte_abiertos import (ALIAS_STOCK, CorteInvalido, buscar_base, cargar,
    exigir, normal, origen_panel, panel_valor, validar_zip)

CANTIDADES=('depot','c1','c2','c3','ajuste','fisico')
CATALOGO={'correo':['CORREO','EMAIL','CORREOELECTRONICO'],
    'rol':['ROL','ROLWMS','PERFIL','TIPOUSUARIO'], 'cliente':['CLIENTE','CODCLIENTE','NOMBRECLIENTE'],
    'sede':['SEDE','BASE','CIUDAD'], 'activo':['ACTIVO','HABILITADO'], 'estado':['ESTADO','STATUS'],
    'usuario':['USUARIO','NOMBREUSUARIO'], 'sku':['SKU','PRODUCTO','CODPRODUCTO'],
    'ean':['EAN','CODIGOBARRAS','CODIGODEBARRAS'], 'posicion':['POSICION','UBICACION'],
    'fecha':['FECHA','FECHAHORA','TIMESTAMP'], 'fecha_entrega':['FECHAENTREGA'],
    'responsable':['RESPONSABLE'], 'cantidad':['CANTIDAD','UNIDADES'], 'serie':['SERIE','NUMEROSERIE']}

def sha_archivo(archivo):
    h=hashlib.sha256()
    with Path(archivo).open('rb') as f:
        for bloque in iter(lambda:f.read(1048576),b''):h.update(bloque)
    return h.hexdigest()

def escribir_json(archivo,valor):
    with open(archivo,'x',encoding='utf-8') as f:
        os.fchmod(f.fileno(),0o600);json.dump(valor,f,ensure_ascii=False,indent=2);f.write('\n')

def cantidad(celda):
    if celda is None:return {'estado':'SIN_COLUMNA','valor_decimal':None}
    valor=celda['valor'];tipo=celda['tipo']
    if tipo=='z' or tipo=='s' and not valor.strip():return {'estado':'VACIO','valor_decimal':None}
    if tipo not in ('n','s'):return {'estado':'TIPO_REQUIERE_REVISION','valor_decimal':None}
    texto=valor.strip()
    if len(texto)>128:return {'estado':'FUERA_PRECISION','valor_decimal':None}
    # Un texto con separadores necesita una regla de su origen; no se adivina
    # si el punto/coma son miles o decimales. El valor original se conserva.
    if tipo=='s' and not re.fullmatch(r'-?\d+',texto):return {'estado':'REQUIERE_REGLA_FORMATO','valor_decimal':None}
    if not re.fullmatch(r'-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?',texto):return {'estado':'FORMATO_REQUIERE_REVISION','valor_decimal':None}
    try:
        with localcontext() as ctx:
            ctx.prec=100
            d=Decimal(texto)
            if not d.is_finite() or not d.is_zero() and (d.adjusted()>20 or d.adjusted()<-9):raise InvalidOperation()
            exacto=d.quantize(Decimal('0.000000001'))
            if exacto!=d:raise InvalidOperation()
            if exacto.is_zero():exacto=abs(exacto)
            return {'estado':'EXACTA','valor_decimal':format(exacto,'f')}
    except (InvalidOperation,ValueError,OverflowError):return {'estado':'FUERA_PRECISION','valor_decimal':None}

def identificador(celda):
    if celda is None or celda['valor'] is None:return None
    if celda['tipo'] not in ('n','s'):return None
    raw=celda['valor'].strip()
    if not raw:return None
    visible=celda.get('visible','').strip()
    if celda['tipo']=='n' and re.fullmatch(r'0\d+',visible) and re.fullmatch(r'\d+',raw) and (visible.lstrip('0') or '0')==(raw.lstrip('0') or '0'):return visible
    return raw

def campos(cabecera,aliases):
    return {k:[c['columna'] for c in cabecera['celdas'] if normal(c['valor']) in nombres] for k,nombres in aliases.items()}

def clase_hoja(nombre):
    n=normal(nombre)
    if n=='PANELDECONTROL':return 'PANEL'
    if n in ('USUARIOS','USUARIO'):return 'USUARIOS'
    if n.startswith('CRONOGRAMA'):return 'CRONOGRAMA'
    if n=='CLIENTES':return 'CLIENTES'
    if 'EAN' in n:return 'MAESTRO_EAN'
    if 'UBICACION' in n or 'POSICION' in n:return 'UBICACIONES'
    if n=='PLANILLADECONTEOFISICO':return 'PLANILLA_CONTEO'
    if n=='REGISTRO':return 'REGISTRO'
    return 'OTRA'

def analizar_fuente(z,entradas,fuente,indice,ambito,corte_origen,panel,productos,auxiliares,esquemas):
    clientes=sorted(set(panel_valor(r,1).strip() for r in panel if panel_valor(r,1).strip()))
    resumen={'fuente_en_corte':indice,'tipo':fuente['tipo'],'ambito':ambito,
        'estado_captura':fuente['estado'],'filas_panel_referencia':[r['fila'] for r in panel],
        'hojas_identificadas':len(fuente.get('hojas') or []),'hojas_completas_por_cobertura':0,
        'filas_producto':0,'filas_auxiliares_conservadas':0,'lineas_con_observaciones':0,
        'incidencias':{},'cantidades':{k:Counter() for k in CANTIDADES}}
    incidencias=Counter();codigos=set();esquemas_publicos=[]
    for nh,h in enumerate(fuente.get('hojas') or [],1):
        partes=[x for x in fuente['partes'] if x['hoja_id']==h['id']];copiadas=sum(x['filas'] for x in partes)
        if copiadas==h['filas'] or not h['columnas']:resumen['hojas_completas_por_cobertura']+=1
        cab=None
        if partes:
            primero=cargar(z.read(entradas[partes[0]['nombre']]))
            if primero['filas'][0]['fila']==1:cab=primero['filas'][0]
        stock=fuente['tipo']=='INVENTARIO' and clase_hoja(h['nombre'])=='PLANILLA_CONTEO'
        mapa=campos(cab,ALIAS_STOCK if stock else CATALOGO) if cab else {}
        estructura={'fuente_en_corte':indice,'ambito':ambito,'tipo_fuente':fuente['tipo'],
            'hoja_en_fuente':nh,'clase':clase_hoja(h['nombre']),'columnas':h['columnas'],
            'filas_previstas':h['filas'],'filas_copiadas':copiadas,'cabecera_copiada':cab is not None,'campos':mapa}
        esquemas_publicos.append(estructura)
        esquemas.append({**estructura,'origen_drive':fuente['id'],'hoja_id':h['id'],'hoja':h['nombre'],
            'zona_horaria':fuente.get('zona_horaria'),'cabecera_original':cab})
        if not stock:continue
        if not cab or len(mapa.get('producto',[]))!=1:
            incidencias['CABECERA_SKU_NO_UNICA']+=1
        for parte in partes:
            datos=cargar(z.read(entradas[parte['nombre']]))
            for row in datos['filas']:
                if row['fila']==1:continue
                cells={c['columna']:c for c in row['celdas']}
                def celda(campo):
                    cols=mapa.get(campo,[]);return cells.get(cols[0]) if len(cols)==1 else None
                origen={'corte_id':corte_origen,'origen_drive':fuente['id'],'hoja_id':h['id'],
                    'fila':row['fila'],'zona_horaria':fuente.get('zona_horaria')}
                sku=identificador(celda('producto'))
                if sku is None:
                    if any(c['valor'] is not None and c['valor']!='' or c.get('formula') or c.get('nota') for c in row['celdas']):
                        auxiliares.write(json.dumps({'ambito':ambito,'origen':origen,'fila_original':row},ensure_ascii=False,separators=(',',':'))+'\n');resumen['filas_auxiliares_conservadas']+=1
                    continue
                observaciones=[];qs={k:cantidad(celda(k)) for k in CANTIDADES}
                for k,q in qs.items():
                    if k in ('depot','c1','c2','c3') and len(mapa.get(k,[]))!=1:observaciones.append('CABECERA_'+k.upper()+'_NO_UNICA')
                    resumen['cantidades'][k][q['estado']]+=1
                    if q['estado']=='EXACTA' and q['valor_decimal']=='0.000000000':resumen['cantidades'][k]['CEROS_CONTADOS' if k in ('c1','c2','c3') else 'CEROS_PRESENTES']+=1
                    if q['estado'] not in ('EXACTA','VACIO','SIN_COLUMNA'):observaciones.append(k.upper()+'_'+q['estado'])
                    if k in ('c1','c2','c3') and q['estado']=='EXACTA' and q['valor_decimal'].startswith('-'):observaciones.append(k.upper()+'_NEGATIVO')
                for antes,despues in [('c1','c2'),('c2','c3')]:
                    if qs[antes]['estado']=='VACIO' and qs[despues]['estado']=='EXACTA':observaciones.append('CAPTURA_'+despues.upper()+'_SIN_'+antes.upper())
                codigo=identificador(celda('codigo'))
                if codigo:codigos.add(codigo)
                else:observaciones.append('CODIGO_OPERATIVO_NO_DEFINIDO')
                if len(sku)>255:observaciones.append('SKU_FUERA_LONGITUD')
                if codigo and len(codigo)>255:observaciones.append('CODIGO_FUERA_LONGITUD')
                if len(clientes)!=1:observaciones.append('CLIENTE_PANEL_NO_UNICO')
                referencia=hashlib.sha256(json.dumps([ambito,corte_origen,fuente['id'],h['id'],row['fila']],separators=(',',':')).encode()).hexdigest()
                candidato={'referencia_copia':referencia,'ambito':ambito,'origen':origen,
                    'estado_captura':fuente['estado'],'sku_propuesto':sku,'codigo_operativo_original':codigo,
                    'clientes_panel_referencia':clientes,'cantidades':qs,'observaciones_preparacion':observaciones,
                    'fila_original':row,'aprobado_para_importar':False}
                productos.write(json.dumps(candidato,ensure_ascii=False,separators=(',',':'))+'\n')
                resumen['filas_producto']+=1;resumen['lineas_con_observaciones']+=bool(observaciones);incidencias.update(observaciones)
    resumen['codigos_operativos_distintos']=len(codigos)
    if len(codigos)>1:incidencias['ARCHIVO_CON_VARIOS_CODIGOS_REQUIERE_MAPEO']+=1
    if fuente['tipo']=='INVENTARIO' and not resumen['filas_producto']:incidencias['INVENTARIO_SIN_LINEAS_CANDIDATAS']+=1
    resumen['incidencias']=dict(incidencias)
    resumen['cantidades']={k:dict(v) for k,v in resumen['cantidades'].items()}
    resumen['estructuras']=esquemas_publicos
    return resumen

def preparar(archivo,salida,base_dir=None):
    validacion,privado=validar_zip(archivo,base_dir)
    exigir(validacion['fuentes_pendientes']==0,'Termina las fuentes pendientes antes de preparar los datos.')
    out=Path(salida).absolute();exigir(out.resolve()==out and not out.exists() and not out.is_symlink(),'La salida debe ser nueva y sin enlaces.')
    resultados=[];esquemas=[]
    with zipfile.ZipFile(archivo) as z:
        entradas={PurePosixPath(i.filename).name:i for i in z.infolist() if not i.is_dir()};p=cargar(z.read(entradas['plan_abiertos_privado.json']))
        base=buscar_base(p['recuperacion'],base_dir) if p['formato']=='ims-abiertos-corte-v2' else None
        out.mkdir(mode=0o700,parents=False)
        with open(out/'lineas_candidatas_NO_IMPORTAR.jsonl','x',encoding='utf-8') as productos,open(out/'filas_auxiliares_NO_IMPORTAR.jsonl','x',encoding='utf-8') as auxiliares:
            os.fchmod(productos.fileno(),0o600);os.fchmod(auxiliares.fileno(),0o600)
            for indice,f in enumerate(p['fuentes'],1):resultados.append(analizar_fuente(z,entradas,f,indice,'SELECCION_ACTUAL',p['corte_id'],f['panel'],productos,auxiliares,esquemas))
            if base:
                retiradas=p['recuperacion']['fuentes_retiradas']
                for indice,f in enumerate(base['fuentes'],1):
                    if f['id'] not in retiradas:continue
                    refs=[r for r in p['panel'][1:] if origen_panel(r)==f['id']]
                    resultados.append(analizar_fuente(z,entradas,f,indice,'FUERA_SELECCION_CONSERVADO',base['corte_id'],refs,productos,auxiliares,esquemas))
    exigir(sha_archivo(archivo)==privado['sha256_zip'],'El ZIP cambió durante la preparación; conserva la salida privada para revisión.')
    actuales=[r for r in resultados if r['ambito']=='SELECCION_ACTUAL'];retirados=[r for r in resultados if r['ambito']=='FUERA_SELECCION_CONSERVADO']
    informe={'ok':True,'formato':'ims-abiertos-preparacion-v1','corte_id':p['corte_id'],
        'preparacion_de_copia_completada':True,'requiere_delta_final':True,'aprobado_para_importar':False,
        'seleccion_actual':{'fuentes':len(actuales),'inventarios':sum(r['tipo']=='INVENTARIO' for r in actuales),
            'lineas_candidatas':sum(r['filas_producto'] for r in actuales)},
        'fuera_seleccion_conservado':{'inventarios':len(retirados),'lineas_candidatas':sum(r['filas_producto'] for r in retirados)},
        'fuentes':resultados,'validacion_captura':validacion,'corte_final_aprobado':False,
        'datos_importados':False,'base_de_datos_modificada':False,'servicios_reiniciados':False}
    escribir_json(out/'esquemas_NO_COMPARTIR.json',esquemas)
    archivos={name:sha_archivo(out/name) for name in ['lineas_candidatas_NO_IMPORTAR.jsonl','filas_auxiliares_NO_IMPORTAR.jsonl','esquemas_NO_COMPARTIR.json']}
    escribir_json(out/'preparacion_NO_IMPORTAR.json',{'formato':'ims-abiertos-preparacion-privada-v1',
        'corte_id':p['corte_id'],'archivo_zip':str(Path(archivo).absolute()),'sha256_zip':privado['sha256_zip'],
        'archivos_sha256':archivos,'aprobado_para_importar':False})
    escribir_json(out/'resumen_preparacion_abiertos_para_compartir.json',informe)
    return informe

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--zip',required=True);ap.add_argument('--base-dir');ap.add_argument('--salida',required=True);args=ap.parse_args()
    print(json.dumps(preparar(args.zip,args.salida,args.base_dir),ensure_ascii=False))

if __name__=='__main__':
    try:main()
    except Exception as error:
        informe={'ok':False,'codigo_error':'PREPARACION_NO_CONFIRMADA','motivo':str(error) if isinstance(error,CorteInvalido) else 'No se confirmó la preparación. Conserva el corte y la salida privados; no se muestran valores de filas.','datos_importados':False,'base_de_datos_modificada':False,'servicios_reiniciados':False}
        if isinstance(error,CorteInvalido) and error.detalle is not None:informe['detalle']=error.detalle
        print(json.dumps(informe,ensure_ascii=False));raise SystemExit(1)
