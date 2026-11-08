#!/usr/bin/env python3
"""Corrige únicamente marcadores de notas en una NUEVA copia XLSX privada.
La receta y las huellas son privadas; nunca modifica el original ni Google.
"""
import argparse,gzip,hashlib,json,os,re
from copy import copy
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET
import exportar_snapshot as e

SHA=re.compile(r'^[a-f0-9]{64}$')
MARK=re.compile(r'^IMS_ORIGEN_DRIVE=([^\r\n]*)',re.M)
def check(ok,message):
    if not ok:raise ValueError(message)
def canon(x):return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def sha(b):return hashlib.sha256(b if isinstance(b,bytes) else b.encode('utf-8')).hexdigest()
def private_parent(dest):
    for p in [dest.parent,*dest.parent.parents]:
        g=p/'.git'
        check(not g.is_file() and not (g/'HEAD').exists(),'La copia privada debe estar fuera de Git')
def huella(cells):
    d={c['columna']:c['valor'] for c in cells}
    return sha(canon([d.get(i) or '' for i in range(1,31)]))
def recipe_load(file,expected):
    check(SHA.fullmatch(expected),'Falta SHA-256 de receta')
    check(file.stat().st_size<2*1024*1024,'Receta demasiado grande')
    r=json.loads(file.read_text(encoding='utf-8-sig'))
    check(sha(canon(r))==expected,'La receta no coincide con la verificada')
    check(r.get('version') in [1,2] and all(SHA.fullmatch(r.get(k,'')) for k in ['snapshot_id','huellas_sha256','referencia_snapshot_id']),'Receta incompatible')
    todo={}
    if r['version']==2:
        span=r.get('rango_verificado',[]);d=r.get('desplazamiento_notas')
        check(len(span)==2 and all(type(x) is int for x in span) and 2<=span[0]<=span[1]<=1048576 and type(d) is int and 0<abs(d)<=100 and SHA.fullmatch(r.get('expansion_sha256','')) and 0<r.get('cambios_esperados',0)<=10000,'Rango verificado incompatible')
        return r,todo
    for block in r.get('bloques',[]):
        check(isinstance(block,list) and len(block)==4 and all(type(x) is int for x in block),'Bloque inválido')
        lo,hi,before,after=block
        check(2<=lo<=hi<=1048576 and hi-lo<10000 and 2<=before<=1048576 and 2<=after<=1048576 and before!=after,'Rango inválido')
        for row in range(lo,hi+1):
            check(row not in todo,'Fila repetida en receta');todo[row]=(before,after)
    check(0<len(todo)==r.get('cambios_esperados')<=10000,'Cantidad de correcciones incompatible')
    return r,todo
def fingerprints(file,r,todo):
    check(e.digest(file)==r['huellas_sha256'],'Las huellas no corresponden a la evidencia verificada')
    head=None;control=hashlib.sha256();n=0;last=1;selected={};total=0;done=False;window={}
    with gzip.open(file,'rb') as f:
        while True:
            line=f.readline(4*1024*1024+1)
            if not line:break
            total+=len(line);check(len(line)<=4*1024*1024 and total<=128*1024*1024,'Huellas excesivas')
            x=json.loads(line)
            if x.get('tipo')=='fin':
                check(x.get('filas')==n and x.get('sha256_contenido')==control.hexdigest() and not f.read(1),'Cierre de huellas inválido');done=True;break
            control.update(line)
            if head is None:
                head=x;check(x.get('version')==1 and x.get('tipo')=='cabecera' and x.get('algoritmo')=='sha256-array30-valores-v1' and x.get('snapshot_id')==r['snapshot_id'],'Cabecera de huellas incompatible')
            else:
                check(set(x)=={'f','h','o','c'} and type(x['f']) is int and last<x['f']<=1048576 and all(SHA.fullmatch(x[k]) for k in ['h','o','c']),'Fila de huellas inválida')
                last=x['f'];n+=1
                if last in todo:selected[last]=x
                if r['version']==2:
                    lo,hi=r['rango_verificado'];d=r['desplazamiento_notas']
                    if lo+min(d,0)<=last<=hi+max(d,0):window[last]=x
    check(done and head and n==head['filas']==r['filas_esperadas'],'Huellas incompletas')
    panels={}
    for p in head.get('origenes',[]):
        check(p['fila_panel'] not in panels,'Panel duplicado en evidencia');panels[p['fila_panel']]=p['origen_sha256']
    if r['version']==2:
        by_origin={}
        for p,o in panels.items():by_origin.setdefault(o,[]).append(p)
        lo,hi=r['rango_verificado'];d=r['desplazamiento_notas'];expanded=[]
        for f in sorted(window):
            if not lo<=f<=hi:continue
            row=window[f];target=window.get(f+d);check(target,'Falta una nota de referencia en el rango')
            if row['o']==target['o']:continue
            check(len(by_origin.get(row['o'],[]))==len(by_origin.get(target['o'],[]))==1,'Archivo ambiguo en el panel')
            todo[f]=(by_origin[row['o']][0],by_origin[target['o']][0]);selected[f]=row
            expanded.append({'f':f,'h':row['h'],'antes':row['o'],'despues':target['o']})
        check(sha(canon(expanded))==r['expansion_sha256'],'La expansión no coincide con las filas verificadas')
    check(len(selected)==len(todo)==r['cambios_esperados'],'Cantidad de notas distinta de la verificada')
    return selected,panels,todo
def strings(z):
    result=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        with z.open('xl/sharedStrings.xml') as f:
            for _,el in ET.iterparse(f,events=('end',)):
                if el.tag==e.S+'si':result.append(''.join(t.text or '' for t in el.findall('.//'+e.S+'t')));el.clear()
    return result
def sheets(z):
    rels={r.attrib['Id']:r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    return {s.attrib['name']:e.resolve('xl/workbook.xml',rels[s.attrib[e.R+'id']]) for s in ET.fromstring(z.read('xl/workbook.xml')).find(e.S+'sheets')}
def notes_text(root):return {c.attrib['ref']:''.join(t.text or '' for t in c.findall('.//'+e.S+'t')) for c in root.findall('.//'+e.S+'comment')}
def patch_text(comment,before,after):
    nodes=comment.findall('.//'+e.S+'t');text=''.join(n.text or '' for n in nodes);marks=list(MARK.finditer(text))
    check(len(marks)==1 and marks[0][1].strip()==before,'Nota no coincide con la procedencia esperada')
    m=marks[0];start=m.start(1)+m[1].find(before);end=start+len(before);pos=0;inserted=False
    for node in nodes:
        old=node.text or '';a,b=pos,pos+len(old);pos=b
        if b<=start or a>=end:continue
        left=old[:max(0,start-a)];right=old[max(0,end-a):] if end<b else ''
        node.text=left+(after if not inserted else '')+right;inserted=True
    expected=text[:start]+after+text[end:]
    check(inserted and ''.join(n.text or '' for n in nodes)==expected,'La nota humana no se pudo conservar')
    return expected
def correct(source,huellas,recipe,recipe_sha,dest):
    source,huellas,recipe,dest=map(lambda p:Path(p).resolve(),[source,huellas,recipe,dest])
    check(dest.suffix.lower()=='.xlsx' and dest!=source and not dest.exists(),'La salida debe ser un XLSX nuevo')
    private_parent(dest);r,todo=recipe_load(recipe,recipe_sha)
    check(e.digest(source)==r['snapshot_id'],'El XLSX original no coincide con la receta')
    fp,panels,todo=fingerprints(huellas,r,todo)
    with ZipFile(source) as z:
        names=z.namelist();check(len(names)==len(set(names)) and not any(n.lower().startswith('_xmlsignatures/') for n in names) and sum(i.file_size for i in z.infolist())<=1024**3,'Paquete XLSX incompatible')
        sh=sheets(z);check({'INVENTARIOS','PANEL DE CONTROL'}<=set(sh),'Faltan hojas')
        ss=strings(z);needed={p for pair in todo.values() for p in pair};drives={}
        for row,cells in e.read_rows(z,sh['PANEL DE CONTROL'],ss):
            if row in needed:
                drive=next((c['valor'] for c in cells if c['columna']==3),None)
                check(isinstance(drive,str) and re.fullmatch(r'[A-Za-z0-9_-]{20,256}',drive) and sha(drive)==panels.get(row),'El panel no coincide con la evidencia');drives[row]=drive
        check(set(drives)==needed,'Falta un archivo del panel')
        checked=set();count=0
        for row,cells in e.read_rows(z,sh['INVENTARIOS'],ss):
            meaningful=any(c['valor'] not in (None,'') or 'formula' in c for c in cells)
            if row==1:
                d={c['columna']:c['valor'] for c in cells};check([e.norm(d.get(i)) for i in range(1,31)]==list(map(e.norm,e.INV)),'Encabezados incompatibles')
            elif meaningful:
                count+=1
                if row in todo:check(huella(cells)==fp[row]['h'],'Cambió el contenido de una fila');checked.add(row)
        check(count==r['filas_esperadas'] and checked==set(todo),'Filas incompletas')
        sheet=sh['INVENTARIOS'];rel=sheet.rsplit('/',1)[0]+'/_rels/'+sheet.rsplit('/',1)[1]+'.rels'
        parts=[e.resolve(sheet,x.attrib['Target']) for x in ET.fromstring(z.read(rel)) if x.get('Type','').endswith('/comments')]
        check(len(parts)==1,'Comentarios de inventario ambiguos');part=parts[0];root=ET.fromstring(z.read(part));expected=notes_text(root)
        check(not any(k.endswith('}Ignorable') for node in root.iter() for k in node.attrib),'Comentarios con extensiones de compatibilidad no soportadas')
        check(len(expected)==len(root.findall('.//'+e.S+'comment')),'Notas duplicadas')
        patched=set()
        for comment in root.findall('.//'+e.S+'comment'):
            ref=comment.attrib['ref'];m=re.fullmatch(r'C([0-9]+)',ref)
            if not m or int(m[1]) not in todo:continue
            row=int(m[1]);before,after=todo[row]
            check(fp[row]['o']==sha(drives[before]),'El origen actual difiere del plan')
            expected[ref]=patch_text(comment,drives[before],drives[after]);patched.add(row)
        check(patched==set(todo),'No se encontraron todas las notas')
        updated=ET.tostring(root,encoding='utf-8',xml_declaration=True)
        dest.parent.mkdir(parents=True,exist_ok=True,mode=0o700);created=False
        try:
            with dest.open('xb') as raw:
                created=True;os.chmod(dest,0o600)
                with ZipFile(raw,'w') as out:
                    for item in z.infolist():out.writestr(copy(item),updated if item.filename==part else z.read(item.filename))
            with ZipFile(dest) as out:
                check(out.namelist()==names,'Cambió la estructura del libro')
                for name in names:
                    if name!=part:check(sha(out.read(name))==sha(z.read(name)),'Se modificó una parte ajena a las notas')
                check(notes_text(ET.fromstring(out.read(part)))==expected,'Cambió otra nota o su texto humano')
            check(e.digest(source)==r['snapshot_id'],'El archivo original cambió durante el proceso')
        except BaseException:
            if created:dest.unlink(missing_ok=True)
            raise
    return {'ok':True,'snapshot_original':r['snapshot_id'],'snapshot_copia':e.digest(dest),'huellas_sha256':r['huellas_sha256'],
        'receta_sha256':recipe_sha,'referencia_snapshot_id':r['referencia_snapshot_id'],'tipo_evidencia':r.get('tipo_evidencia','corte_anterior'),
        'archivos_verificados':r.get('archivos_verificados',[]),'firmas_evidencia_sha256':r.get('firmas_evidencia_sha256'),'notas_corregidas':len(todo),
        'filas_inventarios':count,'partes_ajenas_a_notas_identicas':True,'archivo_copia':str(dest),'original_modificado':False,'google_modificado':False,'mysql_modificado':False}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['original','huellas','receta','sha-receta','salida']:p.add_argument('--'+name,required=True)
    a=p.parse_args()
    try:print(json.dumps(correct(a.original,a.huellas,a.receta,a.sha_receta,a.salida),ensure_ascii=False))
    except (ValueError,OSError,KeyError,TypeError,ET.ParseError):p.exit(1,'Corrección detenida: no coinciden la receta, las huellas, el original o la carpeta privada. No se sustituyó el original.\n')
