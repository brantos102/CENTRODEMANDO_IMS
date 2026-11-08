import gzip,hashlib,importlib.util,json,sys,tempfile,unittest,zipfile
from pathlib import Path
from xml.sax.saxutils import escape
sys.path.insert(0,str(Path(__file__).parents[1]/'tools'))
import corregir_procedencia_copia as c
import exportar_snapshot as e

S=e.S[1:-1];R=e.R[1:-1];A='A'*43;B='B'*43
def letter(n):
    s=''
    while n:n,r=divmod(n-1,26);s=chr(65+r)+s
    return s
def sheet(rows):
    data=[]
    for row,cells in rows:
        text=''.join(f'<c r="{letter(col)}{row}" t="inlineStr"><is><t>{escape(value)}</t></is></c>' for col,value in cells.items())
        data.append(f'<row r="{row}">{text}</row>')
    return f'<worksheet xmlns="{S}"><sheetData>{"".join(data)}</sheetData></worksheet>'
def make(root,rich=True,second=B,compat=False):
    book=root/'original.xlsx'
    rows=[{3:'260101_IBM',5:'IBM',7:'000123',22:'0',28:'Observación original'},{3:'260102_IBM',5:'IBM',7:'000124',22:'2.125'}]
    mark=f'IMS_ORIGEN_DRIVE={B}'
    comment=(f'<r><rPr><b/></rPr><t>Mi nota humana\nIMS_ORIGEN_DRIVE={B[:12]}</t></r><r><t>{B[12:]}\nOtro texto</t></r>' if rich else f'<t>Mi nota humana\n{mark}\nOtro texto</t>')
    with zipfile.ZipFile(book,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('xl/workbook.xml',f'<workbook xmlns="{S}" xmlns:r="{R}"><sheets><sheet name="INVENTARIOS" sheetId="1" r:id="rId1"/><sheet name="PANEL DE CONTROL" sheetId="2" r:id="rId2"/></sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>')
        z.writestr('xl/worksheets/sheet1.xml',sheet([(1,{i:h for i,h in enumerate(e.INV,1)}),(2,rows[0]),(3,rows[1])]))
        z.writestr('xl/worksheets/sheet2.xml',sheet([(1,{1:'CLIENTE',2:'LINK',3:'ID'}),(2,{1:'IBM',2:'260102_IBM',3:B}),(3,{1:'IBM',2:'260101_IBM',3:A})]))
        z.writestr('xl/worksheets/_rels/sheet1.xml.rels',f'<Relationships><Relationship Type="{R}/comments" Target="../comments1.xml"/></Relationships>')
        ext=' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:xr="http://schemas.microsoft.com/office/spreadsheetml/2014/revision" mc:Ignorable="xr"' if compat else ''
        z.writestr('xl/comments1.xml',f'<comments xmlns="{S}"{ext}><authors><author>Fixture</author></authors><commentList><comment ref="C2" authorId="0"><text>{comment}</text></comment><comment ref="C3" authorId="0"><text><t>NO CAMBIAR\nIMS_ORIGEN_DRIVE={second}</t></text></comment></commentList></comments>')
        z.writestr('xl/hoja_administrativa_privada.xml','VALOR_SENSIBLE_SINTETICO')
        z.writestr('xl/styles.xml',f'<styleSheet xmlns="{S}"/>')
    snapshot=e.digest(book)
    head={'tipo':'cabecera','version':1,'algoritmo':'sha256-array30-valores-v1','snapshot_id':snapshot,'filas':2,'origenes':[{'fila_panel':2,'origen_sha256':c.sha(B)},{'fila_panel':3,'origen_sha256':c.sha(A)}]}
    body=json.dumps(head,separators=(',',':'))+'\n'
    for i,row in enumerate(rows,2):
        body+=json.dumps({'f':i,'h':c.sha(c.canon([row.get(j,'') for j in range(1,31)])),'o':c.sha(B if i==2 else second),'c':c.sha(row[3])},separators=(',',':'))+'\n'
    body+=json.dumps({'tipo':'fin','filas':2,'sha256_contenido':c.sha(body)},separators=(',',':'))+'\n'
    gz=root/'huellas.gz';gz.write_bytes(gzip.compress(body.encode()))
    recipe={'version':1,'snapshot_id':snapshot,'huellas_sha256':e.digest(gz),'referencia_snapshot_id':'a'*64,'filas_esperadas':2,'cambios_esperados':1,'bloques':[[2,2,2,3]]}
    rp=root/'receta.json';rp.write_text(json.dumps(recipe));return book,gz,rp,c.sha(c.canon(recipe)),recipe

class CopyTests(unittest.TestCase):
    def setUp(self):self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
    def tearDown(self):self.temp.cleanup()
    def test_corrige_solo_marcador_conserva_rich_text_y_todas_las_otras_partes(self):
        for rich in [True,False]:
            root=self.root/str(rich);root.mkdir();book,gz,rp,rs,recipe=make(root,rich);before=e.digest(book);out=root/'copia.xlsx'
            r=c.correct(book,gz,rp,rs,out);self.assertEqual(r['notas_corregidas'],1);self.assertEqual(e.digest(book),before)
            with zipfile.ZipFile(book) as z,zipfile.ZipFile(out) as n:
                self.assertEqual(z.namelist(),n.namelist())
                for name in z.namelist():
                    if name!='xl/comments1.xml':self.assertEqual(z.read(name),n.read(name))
                notes=e.notes_for(n,'xl/worksheets/sheet1.xml')
                self.assertEqual(notes['C2'],f'Mi nota humana\nIMS_ORIGEN_DRIVE={A}\nOtro texto')
                self.assertEqual(notes['C3'],f'NO CAMBIAR\nIMS_ORIGEN_DRIVE={B}')
                self.assertEqual(n.read('xl/comments1.xml').count(b'rPr'),2 if rich else 0)
    def test_receta_alterada_y_salida_existente_no_modifican_archivos(self):
        book,gz,rp,rs,recipe=make(self.root);recipe['bloques'][0][3]=2;rp.write_text(json.dumps(recipe));out=self.root/'copia.xlsx'
        with self.assertRaisesRegex(ValueError,'receta'):c.correct(book,gz,rp,rs,out)
        self.assertFalse(out.exists());out.write_bytes(b'CONSERVAR')
        with self.assertRaises(ValueError):c.correct(book,gz,rp,rs,out)
        self.assertEqual(out.read_bytes(),b'CONSERVAR')
    def test_original_alterado_no_genera_copia(self):
        book,gz,rp,rs,recipe=make(self.root);book.write_bytes(book.read_bytes()+b'CAMBIO');out=self.root/'copia.xlsx'
        with self.assertRaisesRegex(ValueError,'original'):c.correct(book,gz,rp,rs,out)
        self.assertFalse(out.exists())
    def test_valor_falso_en_huellas_aun_recalculadas_se_rechaza_contra_excel(self):
        book,gz,rp,rs,recipe=make(self.root);lines=gzip.decompress(gz.read_bytes()).decode().splitlines();row=json.loads(lines[1]);row['h']='0'*64;lines[1]=json.dumps(row,separators=(',',':'))
        body='\n'.join(lines[:-1])+'\n';lines[-1]=json.dumps({'tipo':'fin','filas':2,'sha256_contenido':c.sha(body)});gz.write_bytes(gzip.compress(('\n'.join(lines)+'\n').encode()))
        recipe['huellas_sha256']=e.digest(gz);rp.write_text(json.dumps(recipe));out=self.root/'copia.xlsx'
        with self.assertRaisesRegex(ValueError,'contenido'):c.correct(book,gz,rp,c.sha(c.canon(recipe)),out)
        self.assertFalse(out.exists())
    def test_origen_actual_distinto_no_se_reasigna(self):
        book,gz,rp,rs,recipe=make(self.root);recipe['bloques']=[[2,2,3,2]];rp.write_text(json.dumps(recipe));out=self.root/'copia.xlsx'
        with self.assertRaisesRegex(ValueError,'origen actual'):c.correct(book,gz,rp,c.sha(c.canon(recipe)),out)
        self.assertFalse(out.exists())
    def test_rango_verificado_exige_hash_de_expansion_y_no_cambia_otra_fila(self):
        book,gz,rp,rs,recipe=make(self.root,second=A)
        rows=[json.loads(s) for s in gzip.decompress(gz.read_bytes()).decode().splitlines()][1:-1]
        recipe.pop('bloques');recipe.update(version=2,rango_verificado=[2,2],desplazamiento_notas=1,
          expansion_sha256=c.sha(c.canon([{'f':2,'h':rows[0]['h'],'antes':c.sha(B),'despues':c.sha(A)}])))
        rp.write_text(json.dumps(recipe));out=self.root/'copia.xlsx'
        r=c.correct(book,gz,rp,c.sha(c.canon(recipe)),out);self.assertEqual(r['notas_corregidas'],1)
        recipe['expansion_sha256']='0'*64;rp.write_text(json.dumps(recipe))
        with self.assertRaisesRegex(ValueError,'expansión'):c.correct(book,gz,rp,c.sha(c.canon(recipe)),self.root/'no_crear.xlsx')
        self.assertFalse((self.root/'no_crear.xlsx').exists())
    def test_extensiones_xml_no_soportadas_se_rechazan_sin_copia(self):
        book,gz,rp,rs,recipe=make(self.root,compat=True);out=self.root/'copia.xlsx'
        with self.assertRaisesRegex(ValueError,'compatibilidad'):c.correct(book,gz,rp,rs,out)
        self.assertFalse(out.exists())

if __name__=='__main__':unittest.main()
