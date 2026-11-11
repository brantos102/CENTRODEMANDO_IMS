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

def validar_zip(archivo):
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
        exigir(p.get('formato')=='ims-abiertos-corte-v1' and p.get('proyecto')==PROYECTO and p.get('maestro')==MAESTRO and p.get('propietario') in ('brantos102@gmail.com','bespinoza@itsanet.com') and re.fullmatch(UUID,p.get('corte_id','')),'Origen o formato de corte incompatible.')
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
        especiales={'MAESTRO':MAESTRO,'PLANTILLA':PLANTILLA,'INTERFAZ':INTERFAZ};ids=set();tipos=set();usados=set();filas=0;fragmentos=0;completas=0;revision=0;hojas=0;estructuras={};revision_fuentes=[]
        for indice,f in enumerate(p['fuentes'],1):
            tipo=f.get('tipo');id=f.get('id');exigir(tipo in ('INVENTARIO',*especiales) and isinstance(id,str) and id not in ids,'Fuente duplicada o incompatible.');ids.add(id)
            if tipo=='INVENTARIO':exigir(id in esperadas and f.get('panel')==esperadas[id],'Referencias de panel incompletas.')
            else:exigir(id==especiales[tipo] and tipo not in tipos and f.get('panel')==[],'Fuente auxiliar incompatible.');tipos.add(tipo)
            estado=f.get('estado');exigir(estado in ('PENDIENTE','REVISION','COMPLETO'),'Estado de exportación incompatible.');completas+=estado=='COMPLETO';revision+=estado=='REVISION'
            hs=f.get('hojas') or [];exigir(isinstance(hs,list) and len(hs)<=200,'Hojas incompatibles.');meta={};cobertura={};omisiones={};stock={}
            for h in hs:
                exigir(type(h.get('id')) is int and h['id'] not in meta and isinstance(h.get('nombre'),str) and type(h.get('filas')) is int and 0<=h['filas']<=1000000 and type(h.get('columnas')) is int and 0<=h['columnas']<=200,'Metadatos de hoja incompatibles.')
                nombre=normal(h['nombre']);exigir(not re.search('CREDENCIAL|CREDENTIAL|CONTRASENA|PASSWORD|SECRET|TOKEN|PROPIEDAD|CONEXION|CONFIG|^API$',nombre),'El corte incluye una hoja de configuración sensible.')
                exigir(tipo=='MAESTRO' or nombre not in ('USUARIO','USUARIOS'),'El corte incluye usuarios del archivo hijo.')
                meta[h['id']]=h;cobertura[h['id']]=1;hojas+=1
            partes=f.get('partes');exigir(isinstance(partes,list),'Partes incompatibles.')
            for parte in partes:
                name=parte.get('nombre','');exigir(re.fullmatch('fuente_'+hashlib.sha256(id.encode()).hexdigest()[:16]+r'_\d+_\d+_'+UUID+r'\.json',name) and name in entradas and name not in usados,'Fragmento repetido, ausente o ajeno.');usados.add(name)
                raw=z.read(entradas[name]);exigir(len(raw)==parte.get('bytes') and hashlib.sha256(raw).hexdigest()==parte.get('sha256'),'Contenido de fragmento alterado.')
                d=cargar(raw);h=meta.get(d.get('hoja_id'));exigir(h is not None and d.get('formato')=='ims-abiertos-fragmento-v1' and d.get('hoja')==h['nombre'] and d.get('columnas')==h['columnas'] and parte.get('hoja')==h['nombre'] and parte.get('hoja_id')==h['id'],'Fragmento incompatible con su hoja.')
                rows=d.get('filas');exigir(isinstance(rows,list) and 1<=len(rows)<=250 and len(rows)==parte.get('filas') and d.get('inicio')==parte.get('inicio')==cobertura[h['id']],'Fragmentos con huecos o solapamientos.')
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
        extras=set(entradas)-usados-{'plan_abiertos_privado.json','resumen_abiertos_para_compartir.json'}
        exigir(all(re.fullmatch(r'fuente_[a-f0-9]{16}_\d+_\d+_'+UUID+r'\.json',name) for name in extras),'ZIP con archivos ajenos al corte.')
        r={'ok':True,'formato':'ims-abiertos-validacion-v1','corte_id':p['corte_id'],'fuentes':len(p['fuentes']),'inventarios_en_panel':len(esperadas),'fuentes_completas':completas,'fuentes_revision':revision,'fuentes_pendientes':len(p['fuentes'])-completas-revision,'revision_fuentes':revision_fuentes,'hojas':hojas,'filas':filas,'fragmentos':fragmentos,'fragmentos_no_referenciados':len(extras),'panel_cambio':bool(p.get('panel_cambio')),'filas_panel_sin_archivo':sin,'referencias_discordantes':len(discordantes),'estructuras_stock':list(estructuras.values()),'cantidades_interpretadas':False,'lista_para_plan':completas==len(p['fuentes']) and not p.get('panel_cambio') and not extras and not discordantes,'corte_final_aprobado':False,'datos_importados':False,'base_de_datos_modificada':False,'servicios_reiniciados':False}
        huella=hashlib.sha256()
        with archivo.open('rb') as stream:
            for bloque in iter(lambda:stream.read(1048576),b''):huella.update(bloque)
        return r,{'corte_id':p['corte_id'],'sha256_zip':huella.hexdigest(),'archivo_zip':str(archivo),'validacion':r}

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--zip',required=True);ap.add_argument('--salida',required=True);args=ap.parse_args();os.umask(0o077)
    out=Path(args.salida).absolute();exigir(out.resolve()==out and not out.exists() and not out.is_symlink(),'La carpeta de salida debe ser nueva y sin enlaces.')
    r,privado=validar_zip(args.zip);out.mkdir(mode=0o700,parents=False)
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
        print(json.dumps({'ok':False,'codigo_error':codigo,'motivo':motivo,'datos_importados':False,'base_de_datos_modificada':False,'servicios_reiniciados':False},ensure_ascii=False));raise SystemExit(1)
