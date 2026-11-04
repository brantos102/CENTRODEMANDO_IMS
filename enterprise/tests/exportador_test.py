import importlib.util,json,tempfile,unittest,zipfile
from pathlib import Path
from xml.sax.saxutils import escape
spec=importlib.util.spec_from_file_location('exporter',Path(__file__).parents[1]/'tools'/'exportar_snapshot.py');e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
S=e.S[1:-1];R=e.R[1:-1]
def letter(n):
 s=''
 while n:n,r=divmod(n-1,26);s=chr(65+r)+s
 return s
def make_book(p,header=None,missing_origin=False,extra=False):
 inv=e.INV.copy() if header is None else header;reg=e.REG.copy()
 def xml(head,inv=True):
  cells=''.join(f'<c r="{letter(i)}1" t="inlineStr"><is><t>{escape(h)}</t></is></c>' for i,h in enumerate(head,1))
  data=[]
  for row in [2,3]:
   values={3:'MISMO_CODIGO',5:'IBM',7:'000123',17:'0',18:'1.005'} if inv else {6:'',7:'IBM',8:'000123',10:'BM-G-07-1'}
   body=''.join(f'<c r="{letter(col)}{row}" t="inlineStr"><is><t>{escape(v)}</t></is></c>' for col,v in values.items())
   if extra and inv and row==2:body+='<c r="AE2" t="inlineStr"><is><t>EXTRA</t></is></c>'
   data.append(f'<row r="{row}">{body}</row>')
  return f'<worksheet xmlns="{S}"><sheetData><row r="1">{cells}</row>{"".join(data)}</sheetData></worksheet>'
 def comments(inv):
  marks=[]
  for row in [2,3]:
   if missing_origin and inv and row==2:continue
   ref=('C' if inv else 'F')+str(row);marks.append(f'<comment ref="{ref}" authorId="0"><text><t>Nota humana\nIMS_ORIGEN_DRIVE=fuente-{row}</t></text></comment>')
  return f'<comments xmlns="{S}"><authors><author>Fixture</author></authors><commentList>{"".join(marks)}</commentList></comments>'
 with zipfile.ZipFile(p,'w') as z:
  z.writestr('xl/workbook.xml',f'<workbook xmlns="{S}" xmlns:r="{R}"><sheets><sheet name="INVENTARIOS" sheetId="1" r:id="rId1"/><sheet name="REGISTRO" sheetId="2" r:id="rId2"/></sheets></workbook>')
  z.writestr('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>')
  for i in [1,2]:
   z.writestr(f'xl/worksheets/sheet{i}.xml',xml(inv if i==1 else reg,i==1))
   z.writestr(f'xl/worksheets/_rels/sheet{i}.xml.rels',f'<Relationships><Relationship Type="{R}/comments" Target="../comments{i}.xml"/></Relationships>')
   z.writestr(f'xl/comments{i}.xml',comments(i==1))
  z.writestr('xl/styles.xml',f'<styleSheet xmlns="{S}"/>')
class ExportTests(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.book=self.root/'fuente.xlsx';self.out=self.root/'corte'
 def tearDown(self):self.tmp.cleanup()
 def test_valores_notas_multiplicidad_y_original_sin_cambios(self):
  make_book(self.book);before=e.digest(self.book);m=e.export(self.book,self.out)
  self.assertEqual(m['snapshot_id'],before);self.assertEqual(e.digest(self.book),before);self.assertEqual(e.digest(self.out/'fuente.xlsx'),before)
  self.assertEqual([x['filas_datos_contrato'] for x in m['hojas']],[2,2])
  rows=[json.loads(x) for x in (self.out/'hoja_001.jsonl').read_text().splitlines()][1:]
  self.assertEqual([x['origen_drive'] for x in rows],['fuente-2','fuente-3']);self.assertIn('Nota humana',rows[0]['notas']['C2'])
  values={c['columna']:c['valor'] for c in rows[0]['celdas']};self.assertEqual(values[7],'000123');self.assertEqual(values[17],'0');self.assertEqual(values[18],'1.005')
 def test_procedencia_ausente_no_deja_un_corte_parcial(self):
  make_book(self.book,missing_origin=True)
  with self.assertRaisesRegex(ValueError,'procedencia'):e.export(self.book,self.out)
  self.assertFalse(self.out.exists());self.assertEqual(list(self.root.glob('.ims-corte-*')),[])
 def test_cabecera_incompatible_no_publica_la_extraccion(self):
  head=e.INV.copy();head[6]='PRODUCTOS';make_book(self.book,header=head)
  with self.assertRaisesRegex(ValueError,'encabezados'):e.export(self.book,self.out)
  self.assertFalse(self.out.exists())
 def test_columna_extra_con_datos_no_se_descarta(self):
  make_book(self.book,extra=True)
  with self.assertRaisesRegex(ValueError,'fuera del contrato'):e.export(self.book,self.out)
  self.assertFalse(self.out.exists())
 def test_destino_existente_no_se_sobrescribe(self):
  make_book(self.book);self.out.mkdir();(self.out/'testigo').write_text('conservar')
  with self.assertRaisesRegex(ValueError,'ya existe'):e.export(self.book,self.out)
  self.assertEqual((self.out/'testigo').read_text(),'conservar')
if __name__=='__main__':unittest.main()
