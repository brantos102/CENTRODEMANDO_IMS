#!/usr/bin/env python3
"""Valida el ZIP privado de abiertos sin extraer sus rutas ni acceder a SQL."""
import argparse
import hashlib
import json
import os
import re
import stat
import zipfile
from pathlib import Path, PurePosixPath

PROYECTO='1QPDNLYYqLXkOjNyWoL49JepzxW32XaTskLWfSYOfCdE10Dt62FAfhlsD'
MAESTRO='1Cq2AqRVAZJYmj_zs_zg8C63FPrgRBtJHaNcHWXygaPk'
PLANTILLA='1Y2VZpr-fy6iuZyfX-96N1r9l3WdZOBfFnEV6Y2BHWog'
INTERFAZ='1DTNYkDGdkTbMsAyUa2xeaMeY3zgk77cgua0Gd7_rJSk'
UUID=r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
ALIAS_STOCK={
 'producto':['PRODUCTO','SKU','CODPRODUCTO','CODIGOPRODUCTO'], 'codigo':['ID','IDARCHIVO','CODIGOARCHIVO'], 'cliente':['CLIENTE'],
 'c1':['CONTEONO1','CONTEO1','C1'], 'c2':['CONTEONO2','CONTEO2','C2'], 'c3':['CONTEOFINAL','CONTEONO3','CONTEO3','C3'],
 'depot':['DEPOT','STOCKTEORICO'], 'fisico':['CONTEOFISICO'], 'posicion':['POSICION','UBICACION'], 'serie':['SERIE'], 'lote':['LOTE'],
 'fecha_inicio':['FECHAINICIO'], 'fecha_fin':['FECHAFINAL'], 'ajuste':['AJUSTE'], 'motivo':['MOTIVO'], 'justificacion':['JUSTIFICACION'],
 'observacion':['OBSERVACION','OBSERVACIONES'], 'nueva_posicion':['NUEVAPOSICION'], 'unidad':['UNI','UNIDAD'], 'descripcion':['DESCRIPCIONDELPRODUCTO','DESCRIPCION'],
 'abc':['ABC'], 'despacho':['NDESPACHO'], 'partida':['NPARTIDA'], 'categoria':['CATLOG','CATEGORIA'], 'estado_mercancia':['ESTMER'], 'numero':['NDELINEA','NUMERODELINEA']
}

class CorteInvalido(ValueError):
    """Solo mensajes estáticos de validación, sin valores del ZIP."""
    def __init__(self,mensaje,detalle=None):
        super().__init__(mensaje);self.detalle=detalle

def exigir(ok,msg):
    if not ok:raise CorteInvalido(msg)

def normal(s):
    import unicodedata
    return re.sub('[^A-Z0-9]','',unicodedata.normalize('NFD',str(s)).upper())

def objeto(pares):
    r={}
    for k,v in pares:
        exigir(k not in r,'Clave JSON repetida.');r[k]=v
    return r

def cargar(raw):
    exigir(len(raw)<=8388608,'Fragmento demasiado grande.')
    return json.loads(raw.decode('utf-8'),object_pairs_hook=objeto)

def verificar_celdas(celdas,columnas,permitidas=None):
    exigir(isinstance(celdas,list),'Celdas incompatibles.')
    cols=[]
    for c in celdas:
        exigir(isinstance(c,dict) and set(c)<=set(['columna','tipo','valor','visible','formato','formula','nota']),'Celda incompatible.')
        col=c.get('columna');exigir(type(col) is int and 1<=col<=columnas,'Columna inválida.');cols.append(col)
        tipo=c.get('tipo');v=c.get('valor')
        exigir(tipo in ('z','s','n','d','b') and (v is None if tipo=='z' else isinstance(v,str)),'Tipo de celda incompatible.')
        if tipo=='n':exigir(bool(re.fullmatch(r'-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?',v)),'Número no finito o incompatible.')
        if tipo=='b':exigir(v in ('true','false'),'Booleano incompatible.')
        if tipo=='d':exigir(bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z',v)),'Fecha incompatible.')
        exigir(all(isinstance(c[k],str) for k in ('visible','formato','formula','nota') if k in c),'Texto de celda incompatible.')
    exigir(cols==sorted(set(cols)),'Columnas repetidas o desordenadas.')
    if permitidas is not None:exigir(cols==permitidas,'Columnas incompletas o no autorizadas.')

def panel_valor(row,col):
    return next((str(c['valor']) for c in row['celdas'] if c['columna']==col and c['valor'] is not None),'')

def verificar_metadatos(h,meta,estado,fuente,tipo,indice,max_columnas=200):
    """Una descripción de hoja no implica que su contenido haya sido capturado."""
    problemas=[];d=h if isinstance(h,dict) else {}
    if not isinstance(h,dict):problemas.append('FORMATO_NO_OBJETO')
    if type(d.get('id')) is not int:problemas.append('ID_NO_ENTERO')
    elif d['id'] in meta:problemas.append('ID_REPETIDO')
    if not isinstance(d.get('nombre'),str):problemas.append('NOMBRE_NO_TEXTO')
    for campo in ('filas','columnas'):
        if type(d.get(campo)) is not int:problemas.append(campo.upper()+'_NO_ENTERO')
        elif not 0<=d[campo]<=2147483647:problemas.append(campo.upper()+'_FUERA_RANGO')
    detalle={'fuente_en_corte':fuente,'tipo':tipo,'hoja_en_fuente':indice,'problemas':problemas}
    if problemas:raise CorteInvalido('Metadatos de hoja incompatibles.',detalle)
    fuera=d['filas']>1000000 or d['columnas']>max_columnas
    if fuera and estado=='COMPLETO':
        detalle['problemas']=['DIMENSION_FUERA_LIMITE_DE_CAPTURA'];raise CorteInvalido('Una fuente completa describe una hoja fuera del límite de captura.',detalle)
    return fuera

def buscar_base(rec,directorio):
    exigir(isinstance(rec,dict) and bool(re.fullmatch(UUID,rec.get('corte_anterior',''))) and bool(re.fullmatch('[a-f0-9]{64}',rec.get('plan_anterior_sha256',''))),'Linaje de recuperación incompatible.')
    exigir(directorio is not None,'Para revisar la recuperación hace falta la carpeta privada con el ZIP anterior.')
    raiz=Path(directorio).absolute();exigir(raiz.resolve()==raiz and raiz.is_dir(),'La carpeta privada de cortes anteriores debe ser regular y sin enlaces.')
    candidatos=sorted(raiz.glob('ims-abiertos-*.zip'));exigir(len(candidatos)<=128,'Hay demasiados cortes candidatos; revisar la entrada privada.')
    for candidato in candidatos:
        if not re.fullmatch(r'ims-abiertos-[a-f0-9]{32}\.zip',candidato.name) or candidato.is_symlink() or not candidato.is_file() or candidato.stat().st_uid!=os.geteuid() or candidato.stat().st_size>536870912:continue
        try:
            with zipfile.ZipFile(candidato) as z:
                planes=[i for i in z.infolist() if PurePosixPath(i.filename).name=='plan_abiertos_privado.json']
                if len(planes)!=1 or planes[0].file_size>8388608:continue
                raw=z.read(planes[0])
                if hashlib.sha256(raw).hexdigest()!=rec['plan_anterior_sha256']:continue
                base=cargar(raw)
                if base.get('formato')!='ims-abiertos-corte-v1' or base.get('corte_id')!=rec['corte_anterior']:continue
            validar_zip(candidato)
            exigir(base.get('panel_sha256')==rec.get('panel_anterior_sha256') and all(f.get('estado') in ('COMPLETO','REVISION') for f in base['fuentes']),'El corte anterior no coincide o sigue pendiente.')
            return base
        except (ValueError,OSError,zipfile.BadZipFile,KeyError,TypeError):continue
    raise CorteInvalido('No se encontró un ZIP anterior íntegro con el ID y la huella de plan esperados. Conserva los cortes privados anteriores.')

def origen_panel(row):
    id=panel_valor(row,3).strip()
    if re.fullmatch('[A-Za-z0-9_-]{20,120}',id):return id
    links=row.get('ids_archivo_b',[])
    return links[0] if len(links)==1 else None

def detalle_retiradas(base,panel,retiradas):
    detalles=[]
    for indice,f in enumerate(base['fuentes'],1):
        if f['id'] not in retiradas:continue
        coincidencias=[r for r in panel[1:] if origen_panel(r)==f['id']]
        alternativas=[r['fila'] for r in panel[1:] if origen_panel(r)!=f['id'] and f['id'] in r.get('ids_archivo_b',[])]
        estados=sorted(set('ENTREGADO' if panel_valor(r,7).strip().upper()=='ENTREGADO' else 'SIN_ESTADO' if not panel_valor(r,7).strip() else 'OTRO_ESTADO' for r in coincidencias))
        cliente_vacio=any(not panel_valor(r,1).strip() for r in coincidencias)
        motivo='SIN_REFERENCIA_ACTUAL' if not coincidencias else 'CLIENTE_PANEL_VACIO' if cliente_vacio else 'ENTREGADO_EN_PANEL_ACTUAL' if estados==['ENTREGADO'] else 'REQUIERE_REVISION'
        detalles.append({'fuente_en_corte_anterior':indice,'filas_panel_anterior':[r['fila'] for r in f['panel']],'filas_panel_actual':[r['fila'] for r in coincidencias],'referencias_alternativas_panel':alternativas,'estados_panel_actual':estados,'cliente_panel_vacio':cliente_vacio,'motivo_salida':motivo,'estado_captura_anterior':f['estado'],'fragmentos_conservados':len(f['partes']),'filas_guardadas_corte_anterior':sum(x['filas'] for x in f['partes']),'reconciliacion_pendiente':True})
    return detalles

def verificar_recuperacion(p,base,z,entradas,usados):
    rec=p['recuperacion'];previas={f['id']:f for f in base['fuentes']};actuales={f['id']:f for f in p['fuentes']};anteriores={};activos={};archivos={}
    exigir(type(rec.get('fuentes_recapturadas')) is int and type(rec.get('fuentes_agregadas')) is int and type(rec.get('panel_anterior_cambio')) is bool,'Tipos del resumen de recuperación incompatibles.')
    campos=['sha256','bytes','hoja','hoja_id','inicio','filas']
    for f in base['fuentes']:
        for parte in f['partes']:
            exigir(parte['nombre'] not in anteriores,'El corte anterior repite fragmentos.');anteriores[parte['nombre']]=(f['id'],parte)
    for f in p['fuentes']:
        for parte in f['partes']:activos[parte['nombre']]=(f['id'],parte)
        if f.get('reutilizada_de') is not None:
            antes=previas.get(f['id']);exigir(antes is not None and antes['estado']=='COMPLETO' and f['tipo']!='MAESTRO' and f['reutilizada_de']==base['corte_id'] and f.get('version_origen')==antes.get('version_origen') and f.get('hojas')==antes.get('hojas') and f['partes']==antes['partes'],'Una fuente reutilizada no coincide con su corte anterior.')
    conservadas=p.get('partes_conservadas_revision');exigir(isinstance(conservadas,list),'Falta el inventario de fragmentos conservados para revisión.')
    for parte in conservadas:
        nombre=parte.get('nombre');anterior=anteriores.get(nombre);exigir(anterior is not None and nombre not in usados and nombre not in archivos and parte.get('fuente_id')==anterior[0] and all(parte.get(k)==anterior[1].get(k) for k in campos),'Fragmento conservado ajeno o alterado.')
        exigir(nombre in entradas,'Falta un fragmento conservado del corte anterior.');raw=z.read(entradas[nombre]);exigir(len(raw)==parte['bytes'] and hashlib.sha256(raw).hexdigest()==parte['sha256'],'El contenido conservado del corte anterior fue alterado.');archivos[nombre]=True;usados.add(nombre)
    for nombre,(fuente,parte) in anteriores.items():
        if nombre in activos:
            exigir(activos[nombre][0]==fuente and actuales[fuente].get('reutilizada_de')==base['corte_id'] and all(activos[nombre][1].get(k)==parte.get(k) for k in campos),'Un fragmento anterior se presenta como una captura nueva.')
        else:exigir(nombre in archivos,'Se perdió un fragmento del corte anterior durante la recuperación.')
    retiradas=[f['id'] for f in base['fuentes'] if f['tipo']=='INVENTARIO' and f['id'] not in actuales]
    reutilizadas=sum(f.get('reutilizada_de') is not None for f in p['fuentes']);recapturadas=sum(f['id'] in previas and f.get('reutilizada_de') is None for f in p['fuentes']);agregadas=sum(f['id'] not in previas for f in p['fuentes'])
    exigir(rec.get('fuentes_retiradas')==retiradas and rec.get('fuentes_recapturadas')==recapturadas and rec.get('fuentes_agregadas')==agregadas and rec.get('panel_anterior_cambio')==(p['panel_sha256']!=base['panel_sha256']),'El resumen de recuperación no concilia con ambos cortes.')
    return {'corte_anterior':base['corte_id'],'linaje_respaldo_verificado':True,'fuentes_reutilizadas':reutilizadas,'fuentes_recapturadas':recapturadas,'fuentes_agregadas':agregadas,'fuentes_retiradas_panel_actual':len(retiradas),'detalle_fuentes_retiradas':detalle_retiradas(base,p['panel'],retiradas),'fragmentos_conservados_revision':len(archivos),'panel_anterior_cambio':rec['panel_anterior_cambio']}

def validar_zip(archivo,base_dir=None):
    archivo=Path(archivo).absolute();exigir(archivo.resolve()==archivo and archivo.is_file() and archivo.suffix.lower()=='.zip','Usa un ZIP local regular, sin enlaces.')
    exigir(archivo.stat().st_size<=536870912,'ZIP demasiado grande.')
    with zipfile.ZipFile(archivo) as z:
        entradas={};total=0;carpetas=set()
        exigir(len(z.infolist())<=10000,'Demasiadas entradas ZIP.')
        for info in z.infolist():
            path=PurePosixPath(info.filename)
            exigir(not path.is_absolute() and not any(c in ('..','.') for c in path.parts) and '\\' not in info.filename and not info.flag_bits&1,'Ruta ZIP o cifrado no permitido.')
            exigir(not stat.S_ISLNK(info.external_attr>>16),'ZIP con enlace no permitido.')
            if info.is_dir():continue
            exigir(len(path.parts)<=2 and path.name not in entradas,'Nombres ZIP ambiguos.')
            carpetas.add(str(path.parent));exigir(len(carpetas)==1,'ZIP con varias carpetas raíz.')
            total+=info.file_size;exigir(info.file_size<=8388608 and total<=536870912,'Contenido ZIP demasiado grande.');entradas[path.name]=info
        exigir('plan_abiertos_privado.json' in entradas,'Falta el plan privado.')
        p=cargar(z.read(entradas['plan_abiertos_privado.json']))
        exigir(p.get('formato') in ('ims-abiertos-corte-v1','ims-abiertos-corte-v2') and p.get('proyecto')==PROYECTO and p.get('maestro')==MAESTRO and p.get('propietario') in ('brantos102@gmail.com','bespinoza@itsanet.com') and re.fullmatch(UUID,p.get('corte_id','')),'Origen o formato de corte incompatible.')
        v2=p['formato']=='ims-abiertos-corte-v2';base=None;max_columnas=512 if v2 else 200
        if v2:
            exigir(p.get('limites')=={'filas':1000000,'columnas':512,'celdas_fragmento':10000},'Límites de recuperación incompatibles.');base=buscar_base(p.get('recuperacion'),base_dir);exigir(base['corte_id']!=p['corte_id'],'La recuperación debe tener una identidad nueva.')
        exigir(p.get('corte_final_aprobado') is False and isinstance(p.get('fuentes'),list) and 3<=len(p['fuentes'])<=10000,'Plan incompatible.')
        panel=p.get('panel');exigir(isinstance(panel,list) and 1<=len(panel)<=10001,'Panel incompatible.')
        exigir(hashlib.sha256(json.dumps(panel,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()==p.get('panel_sha256'),'Panel alterado.')
        for i,r in enumerate(panel):
            exigir(r.get('fila')==i+1,'Panel desordenado.');verificar_celdas(r.get('celdas'),200,[1,2,3,4,6,7,9])
            links=r.get('ids_archivo_b',[]);exigir(isinstance(links,list) and links==sorted(set(links)) and len(links)<=20 and all(isinstance(x,str) and re.fullmatch('[A-Za-z0-9_-]{20,120}',x) for x in links),'Enlaces de panel incompatibles.')
        esperadas={};sin=0;discordantes=[]
        for row in panel[1:]:
            if not panel_valor(row,1).strip() or panel_valor(row,7).strip().upper()=='ENTREGADO':continue
            id=panel_valor(row,3).strip()
            valido=bool(re.fullmatch('[A-Za-z0-9_-]{20,120}',id));links=row.get('ids_archivo_b',[])
            if valido and any(x!=id for x in links):discordantes.append(row['fila'])
            if not valido and len(links)==1:id=links[0]
            if not re.fullmatch('[A-Za-z0-9_-]{20,120}',id):sin+=1;continue
            esperadas.setdefault(id,[]).append(row)
        exigir(p.get('referencias_discordantes',[])==discordantes,'Cambió el control de referencias de panel.')
        especiales={'MAESTRO':MAESTRO,'PLANTILLA':PLANTILLA,'INTERFAZ':INTERFAZ};ids=set();tipos=set();usados=set();filas=0;fragmentos=0;completas=0;revision=0;hojas=0;estructuras={};revision_fuentes=[];pendientes_fuentes=[];hojas_fuera_limite=[]
        for indice,f in enumerate(p['fuentes'],1):
            tipo=f.get('tipo');id=f.get('id');exigir(tipo in ('INVENTARIO',*especiales) and isinstance(id,str) and id not in ids,'Fuente duplicada o incompatible.');ids.add(id)
            if tipo=='INVENTARIO':exigir(id in esperadas and f.get('panel')==esperadas[id],'Referencias de panel incompletas.')
            else:exigir(id==especiales[tipo] and tipo not in tipos and f.get('panel')==[],'Fuente auxiliar incompatible.');tipos.add(tipo)
            estado=f.get('estado');exigir(estado in ('PENDIENTE','REVISION','COMPLETO'),'Estado de exportación incompatible.');completas+=estado=='COMPLETO';revision+=estado=='REVISION'
            hs=f.get('hojas') or [];exigir(isinstance(hs,list) and len(hs)<=200,'Hojas incompatibles.');meta={};cobertura={};omisiones={};stock={}
            for nh,h in enumerate(hs,1):
                fuera=verificar_metadatos(h,meta,estado,indice,tipo,nh,max_columnas)
                if fuera:hojas_fuera_limite.append({'fuente_en_corte':indice,'tipo':tipo,'hoja_en_fuente':nh,'filas':h['filas'],'columnas':h['columnas'],'limite_filas_captura':1000000,'limite_columnas_captura':max_columnas,'contenido_capturado':False})
                nombre=normal(h['nombre']);exigir(not re.search('CREDENCIAL|CREDENTIAL|CONTRASENA|PASSWORD|SECRET|TOKEN|PROPIEDAD|CONEXION|CONFIG|^API$',nombre),'El corte incluye una hoja de configuración sensible.')
                exigir(tipo=='MAESTRO' or nombre not in ('USUARIO','USUARIOS'),'El corte incluye usuarios del archivo hijo.')
                meta[h['id']]=h;cobertura[h['id']]=1;hojas+=1
            partes=f.get('partes');exigir(isinstance(partes,list),'Partes incompatibles.')
            for parte in partes:
                name=parte.get('nombre','');exigir(re.fullmatch('fuente_'+hashlib.sha256(id.encode()).hexdigest()[:16]+r'_\d+_\d+_'+UUID+r'\.json',name) and name in entradas and name not in usados,'Fragmento repetido, ausente o ajeno.');usados.add(name)
                raw=z.read(entradas[name]);exigir(len(raw)==parte.get('bytes') and hashlib.sha256(raw).hexdigest()==parte.get('sha256'),'Contenido de fragmento alterado.')
                d=cargar(raw);h=meta.get(d.get('hoja_id'));exigir(h is not None and d.get('formato')=='ims-abiertos-fragmento-v1' and d.get('hoja')==h['nombre'] and d.get('columnas')==h['columnas'] and parte.get('hoja')==h['nombre'] and parte.get('hoja_id')==h['id'],'Fragmento incompatible con su hoja.')
                exigir(h['filas']<=1000000 and h['columnas']<=max_columnas,'Un fragmento describe contenido fuera del límite de captura.')
                rows=d.get('filas');exigir(isinstance(rows,list) and 1<=len(rows)<=250 and len(rows)==parte.get('filas') and d.get('inicio')==parte.get('inicio')==cobertura[h['id']],'Fragmentos con huecos o solapamientos.')
                exigir(len(rows)*h['columnas']<=10000,'El fragmento supera el límite de celdas de captura.')
                omit=d.get('columnas_omitidas');exigir(isinstance(omit,list) and all(type(i) is int and 1<=i<=h['columnas'] for i in omit) and omit==sorted(set(omit)),'Omisiones incompatibles.')
                if h['id'] in omisiones:exigir(omit==omisiones[h['id']],'Cambió la política de columnas entre fragmentos.')
                omisiones[h['id']]=omit
                if tipo=='MAESTRO' and normal(h['nombre'])=='USUARIOS':exigir(all(i in omit for i in (4,9) if i<=h['columnas']),'No se excluyeron las columnas de contraseña conocidas.')
                permitidas=[i for i in range(1,h['columnas']+1) if i not in omit]
                for i,r in enumerate(rows):
                    exigir(r.get('fila')==d['inicio']+i,'Fila fuera de secuencia.');verificar_celdas(r.get('celdas'),h['columnas'],permitidas)
                    if tipo=='INVENTARIO' and normal(h['nombre'])=='PLANILLADECONTEOFISICO':
                        if r['fila']==1:
                            campos={k:[c['columna'] for c in r['celdas'] if normal(c['valor']) in aliases] for k,aliases in ALIAS_STOCK.items()}
                            stock[h['id']]={'campos':campos,'filas_producto':0,'capturas_presentes':{'c1':0,'c2':0,'c3':0},'textos_con_coma_en_cantidades':0}
                        elif h['id'] in stock:
                            st=stock[h['id']];vals={c['columna']:c for c in r['celdas']};prods=st['campos']['producto']
                            if len(prods)==1 and vals[prods[0]]['valor'] is not None and str(vals[prods[0]]['valor']).strip():
                                st['filas_producto']+=1
                                for campo in ['c1','c2','c3','depot']:
                                    pos=st['campos'][campo]
                                    if len(pos)!=1:continue
                                    c=vals[pos[0]];presente=c['valor'] is not None and str(c['valor']).strip()!=''
                                    if campo!='depot':st['capturas_presentes'][campo]+=int(presente)
                                    if presente and c['tipo']=='s' and ',' in c['valor']:st['textos_con_coma_en_cantidades']+=1
                cobertura[h['id']]+=len(rows);exigir(cobertura[h['id']]<=h['filas']+1,'Demasiadas filas.');filas+=len(rows);fragmentos+=1
            if estado=='COMPLETO':exigir(hs and all(cobertura[h['id']]==h['filas']+1 or h['columnas']==0 for h in hs),'Una fuente completa tiene hojas incompletas.')
            if estado=='PENDIENTE':pendientes_fuentes.append({'fuente_en_corte':indice,'tipo':tipo,'filas_panel_corte':[r['fila'] for r in f['panel']],'hojas_identificadas':len(hs),'fragmentos_guardados':len(partes),'filas_guardadas':sum(cobertura[h['id']]-1 for h in hs)})
            if estado=='REVISION':
                # Solo etiquetas controladas y posiciones del corte; nunca mensajes
                # de excepción, nombres, enlaces, ID de Drive o valores de celdas.
                motivo=f.get('motivo')
                revision_fuentes.append({'fuente_en_corte':indice,'tipo':tipo,
                    'motivo':motivo if motivo in ('FUENTE_CAMBIO','LECTURA_O_LIMITE') else 'NO_ESPECIFICADO',
                    'filas_panel_corte':[r['fila'] for r in f['panel']],
                    'hojas_identificadas':len(hs),'fragmentos_guardados':len(partes),
                    'filas_guardadas':sum(cobertura[h['id']]-1 for h in hs)})
            for st in stock.values():
                key=json.dumps(st['campos'],sort_keys=True,separators=(',',':'))
                if key not in estructuras:estructuras[key]={'campos':st['campos'],'archivos':0,'archivos_completos':0,'filas_producto':0,'capturas_presentes':{'c1':0,'c2':0,'c3':0},'textos_con_coma_en_cantidades':0}
                grupo=estructuras[key];grupo['archivos']+=1;grupo['archivos_completos']+=estado=='COMPLETO';grupo['filas_producto']+=st['filas_producto'];grupo['textos_con_coma_en_cantidades']+=st['textos_con_coma_en_cantidades']
                for c in ['c1','c2','c3']:grupo['capturas_presentes'][c]+=st['capturas_presentes'][c]
        exigir(tipos==set(especiales) and ids-set(especiales.values())==set(esperadas),'Faltan fuentes o archivos del panel.')
        recuperacion=verificar_recuperacion(p,base,z,entradas,usados) if v2 else None
        extras=set(entradas)-usados-{'plan_abiertos_privado.json','resumen_abiertos_para_compartir.json'}
        exigir(all(re.fullmatch(r'fuente_[a-f0-9]{16}_\d+_\d+_'+UUID+r'\.json',name) for name in extras),'ZIP con archivos ajenos al corte.')
        r={'ok':True,'formato':'ims-abiertos-validacion-v1','corte_id':p['corte_id'],'fuentes':len(p['fuentes']),'inventarios_en_panel':len(esperadas),'fuentes_completas':completas,'fuentes_revision':revision,'fuentes_pendientes':len(p['fuentes'])-completas-revision,'revision_fuentes':revision_fuentes,'hojas_fuera_limite':hojas_fuera_limite,'hojas':hojas,'filas':filas,'fragmentos':fragmentos,'fragmentos_no_referenciados':len(extras),'panel_cambio':bool(p.get('panel_cambio')),'filas_panel_sin_archivo':sin,'referencias_discordantes':len(discordantes),'estructuras_stock':list(estructuras.values()),'cantidades_interpretadas':False,'lista_para_plan':completas==len(p['fuentes']) and not p.get('panel_cambio') and not extras and not discordantes,'corte_final_aprobado':False,'datos_importados':False,'base_de_datos_modificada':False,'servicios_reiniciados':False}
        r['pendientes_fuentes']=pendientes_fuentes
        if recuperacion:
            r['recuperacion']=recuperacion;r['lista_para_plan']=r['lista_para_plan'] and not sin and not recuperacion['fuentes_retiradas_panel_actual']
        huella=hashlib.sha256()
        with archivo.open('rb') as stream:
            for bloque in iter(lambda:stream.read(1048576),b''):huella.update(bloque)
        return r,{'corte_id':p['corte_id'],'sha256_zip':huella.hexdigest(),'archivo_zip':str(archivo),'validacion':r}

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--zip',required=True);ap.add_argument('--salida',required=True);ap.add_argument('--base-dir');args=ap.parse_args();os.umask(0o077)
    out=Path(args.salida).absolute();exigir(out.resolve()==out and not out.exists() and not out.is_symlink(),'La carpeta de salida debe ser nueva y sin enlaces.')
    r,privado=validar_zip(args.zip,args.base_dir);out.mkdir(mode=0o700,parents=False)
    for name,value in [('resumen_abiertos_para_compartir.json',r),('validacion_abiertos_NO_COMPARTIR.json',privado)]:
        with open(out/name,'x',encoding='utf-8') as f:os.chmod(f.name,0o600);json.dump(value,f,ensure_ascii=False,indent=2);f.write('\n')
    print(json.dumps(r,ensure_ascii=False))

if __name__=='__main__':
    try:main()
    except Exception as error:
        codigo='VALIDACION_NO_CONFIRMADA';motivo='No se pudo completar la validación; conserva el ZIP y los originales privados.'
        if isinstance(error,CorteInvalido):codigo='CORTE_INVALIDO';motivo=str(error)
        elif isinstance(error,zipfile.BadZipFile):codigo='ZIP_ILEGIBLE';motivo='El archivo no es un ZIP íntegro o compatible.'
        elif isinstance(error,(json.JSONDecodeError,UnicodeDecodeError)):codigo='JSON_ILEGIBLE';motivo='Un documento del corte no contiene JSON UTF-8 compatible.'
        elif isinstance(error,OSError):codigo='ACCESO_LOCAL';motivo='No se pudo leer el ZIP o crear el informe privado en el servidor.'
        informe={'ok':False,'codigo_error':codigo,'motivo':motivo,'datos_importados':False,'base_de_datos_modificada':False,'servicios_reiniciados':False}
        if isinstance(error,CorteInvalido) and error.detalle is not None:informe['detalle']=error.detalle
        print(json.dumps(informe,ensure_ascii=False));raise SystemExit(1)
