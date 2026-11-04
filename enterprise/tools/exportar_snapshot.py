#!/usr/bin/env python3
"""Copia local de XLSX a JSONL verificable. Solo lectura del archivo fuente.
No evalúa fórmulas, no sigue enlaces y conserva el XLSX original y sus estilos.
Los paquetes contienen datos privados; no se deben subir a Git ni al chat.
"""
import argparse, datetime, hashlib, json, os, posixpath, re, shutil, tempfile, unicodedata
from pathlib import Path, PurePosixPath
from zipfile import ZipFile
import xml.etree.ElementTree as ET

S='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
INV=['FECHA INICIO','FECHA FINAL','ID','N de línea','CLIENTE','ABC','PRODUCTO','DESCRIPCIÓN DEL PRODUCTO','SERIE','LOTE','N DESPACHO','N PARTIDA','CAT_LOG','EST_MER','POSICIÓN','UNI','DEPOT','CONTEO FISICO','DESFASE','RESULTADO UNIDADES','RESULTADO SERIES','CONTEO No. 1','CONTEO No. 2','CONTEO FINAL','AJUSTE','MOTIVO','JUSTIFICACION','OBSERVACION','NUEVA POSICION','ACTUALIZACION DEPOT']
REG=['ACTUADOR','FECHA','HORA','USUARIO','CORREO','ID','CLIENTE','CODIGO','POSICION','CONTEO FISICO','RESULTADO CONTEO','CONTEO N1','CONTEO N2','CONTEO N3','LINK']

def norm(s): return re.sub('[^A-Z0-9]','',unicodedata.normalize('NFD',str(s or '')).encode('ascii','ignore').decode().upper())
def digest(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
    return h.hexdigest()
def resolve(base,target):
    p=posixpath.normpath(posixpath.join(posixpath.dirname(base),target)) if not target.startswith('/') else target.lstrip('/')
    if '..' in PurePosixPath(p).parts: raise ValueError('Referencia fuera del XLSX')
    return p

def column(ref):
    m=re.fullmatch(r'([A-Z]+)([1-9][0-9]*)',ref)
    if not m: raise ValueError('Referencia de celda inválida')
    n=0
    for c in m[1]: n=n*26+ord(c)-64
    return n

def notes_for(z,path):
    rp=posixpath.dirname(path)+'/_rels/'+posixpath.basename(path)+'.rels';notes={}
    if rp not in z.namelist():return notes
    for rel in ET.fromstring(z.read(rp)):
        if rel.get('Type','').endswith('/comments'):
            with z.open(resolve(path,rel.attrib['Target'])) as f:
                for _,el in ET.iterparse(f,events=('end',)):
                    if el.tag==S+'comment':
                        notes[el.attrib['ref']]=''.join(t.text or '' for t in el.findall('.//'+S+'t'));el.clear()
    return notes

def read_rows(z,path,strings):
    with z.open(path) as f:
        last=0
        for _,el in ET.iterparse(f,events=('end',)):
            if el.tag!=S+'row':continue
            number=int(el.attrib['r'])
            if number<=last:raise ValueError('Filas fuera de orden o repetidas')
            last=number;cells=[]
            for cell in el.findall(S+'c'):
                typ=cell.get('t','n');v=cell.find(S+'v');value=v.text if v is not None else None;formula=cell.find(S+'f')
                if typ=='s' and value is not None:value=strings[int(value)]
                elif typ=='inlineStr':value=''.join(t.text or '' for t in cell.findall('.//'+S+'t'))
                if value is not None or formula is not None:
                    item={'columna':column(cell.attrib['r']),'tipo':typ,'valor':value,'estilo':cell.get('s','0')}
                    if formula is not None:item['formula']={'texto':formula.text,'atributos':dict(formula.attrib)}
                    cells.append(item)
            yield number,cells
            el.clear()

def export(source,destination):
    source=Path(source).resolve();destination=Path(destination).absolute()
    if destination.exists():raise ValueError('El destino ya existe; no se sobrescribe un corte anterior')
    before=digest(source);destination.parent.mkdir(parents=True,exist_ok=True)
    tmp=Path(tempfile.mkdtemp(prefix='.ims-corte-',dir=destination.parent));os.chmod(tmp,0o700)
    try:
        manifest={'version':1,'snapshot_id':before,'archivo':source.name,'exportado_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'origen':'Google Sheets XLSX','original':'fuente.xlsx','estilos':'estilos.xml','hojas':[]}
        with ZipFile(source) as z:
            if sum(x.file_size for x in z.infolist())>1024**3:raise ValueError('XLSX supera 1 GiB descomprimido; revisar tamaño antes de exportar')
            strings=[]
            if 'xl/sharedStrings.xml' in z.namelist():
                with z.open('xl/sharedStrings.xml') as f:
                    for _,el in ET.iterparse(f,events=('end',)):
                        if el.tag==S+'si':strings.append(''.join(x.text or '' for x in el.findall('.//'+S+'t')));el.clear()
            workbook=ET.fromstring(z.read('xl/workbook.xml'));pr=workbook.find(S+'workbookPr')
            manifest['fecha1904']=pr is not None and pr.get('date1904') in ('1','true')
            rels={r.attrib['Id']:r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
            sheets=workbook.find(S+'sheets');names=[s.attrib['name'] for s in sheets]
            if len(set(names))!=len(names) or not {'INVENTARIOS','REGISTRO'}<=set(names):raise ValueError('Faltan hojas obligatorias o hay nombres repetidos')
            for index,sh in enumerate(sheets,1):
                name=sh.attrib['name'];path=resolve('xl/workbook.xml',rels[sh.attrib[R+'id']]);notes=notes_for(z,path)
                filename=f'hoja_{index:03d}.jsonl';stored=0;data_rows=0;origins={};h=hashlib.sha256();head=None
                notes_by_row={}
                for ref,value in notes.items():notes_by_row.setdefault(int(re.search(r'[0-9]+$',ref)[0]),{})[ref]=value
                width=30 if name=='INVENTARIOS' else 15 if name=='REGISTRO' else None
                idcol=3 if name=='INVENTARIOS' else 6;note_rows={int(re.search(r'[0-9]+$',ref)[0]) for ref in notes};seen_note_rows=set()
                with (tmp/filename).open('wb') as output:
                    os.chmod(tmp/filename,0o600)
                    def write(record):
                        nonlocal stored
                        line=(json.dumps(record,ensure_ascii=False,separators=(',',':'))+'\n').encode('utf-8');output.write(line);h.update(line);stored+=1
                    for row,cells in read_rows(z,path,strings):
                        row_notes={}
                        # Índice por fila evita recorrer todas las notas para cada registro.
                        if row in notes_by_row:row_notes=notes_by_row[row];seen_note_rows.add(row)
                        meaningful=[cell for cell in cells if cell['valor'] not in (None,'') or 'formula' in cell]
                        if not meaningful and not row_notes:continue
                        if width and any(cell['columna']>width for cell in meaningful):raise ValueError(f'{name}: datos fuera del contrato {width} columnas en fila {row}')
                        if width and row==1:
                            values={cell['columna']:cell['valor'] for cell in cells};head=[values.get(i,'') for i in range(1,width+1)]
                            wanted=INV if name=='INVENTARIOS' else REG
                            if list(map(norm,head))!=list(map(norm,wanted)):raise ValueError(f'{name}: encabezados distintos al contrato 30/15')
                        origin=None
                        if width and row>1 and meaningful:
                            data_rows+=1;idref=('C' if idcol==3 else 'F')+str(row)
                            marks=re.findall(r'^IMS_ORIGEN_DRIVE=([^\r\n]*)',row_notes.get(idref,''),re.M)
                            if len(marks)!=1 or not marks[0].strip() or len(marks[0].strip())>256:raise ValueError(f'{name}: procedencia ausente o ambigua en fila {row}')
                            origin=marks[0].strip();origins[origin]=origins.get(origin,0)+1
                        write({'fila':row,'origen_drive':origin,'celdas':cells,'notas':row_notes})
                    if width and head is None:raise ValueError(f'{name}: falta fila de encabezados')
                manifest['hojas'].append({'nombre':name,'estado':sh.get('state','visible'),'archivo':filename,'sha256':h.hexdigest(),'filas_almacenadas':stored,'filas_datos_contrato':data_rows if width else None,'encabezados':head,'filas_por_origen':origins,'notas_sin_fila':{str(row):notes_by_row[row] for row in sorted(note_rows-seen_note_rows)}})
            styles=z.read('xl/styles.xml') if 'xl/styles.xml' in z.namelist() else b''
            (tmp/'estilos.xml').write_bytes(styles);os.chmod(tmp/'estilos.xml',0o600);manifest['estilos_sha256']=hashlib.sha256(styles).hexdigest()
        shutil.copyfile(source,tmp/'fuente.xlsx');os.chmod(tmp/'fuente.xlsx',0o600)
        if digest(source)!=before or digest(tmp/'fuente.xlsx')!=before:raise ValueError('El archivo cambió durante la extracción')
        (tmp/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');os.chmod(tmp/'manifest.json',0o600)
        tmp.rename(destination)
        return manifest
    except BaseException:
        shutil.rmtree(tmp);raise

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('xlsx');p.add_argument('destino');a=p.parse_args()
    try:
        m=export(a.xlsx,a.destino)
        print(json.dumps({'snapshot_id':m['snapshot_id'],'hojas':len(m['hojas']),'filas':{h['nombre']:h['filas_datos_contrato'] for h in m['hojas'] if h['filas_datos_contrato'] is not None}},ensure_ascii=False))
    except (ValueError,OSError,KeyError,ET.ParseError) as e:p.exit(1,f'Exportación detenida: {e}\n')
