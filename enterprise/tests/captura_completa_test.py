import copy
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

BASE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(BASE/'tools'))
from validar_corte_abiertos import validar_zip
from preparar_traslado_abiertos import preparar

class CapturaCompletaTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  code="""
import{simular}from'./tests/fixtures/corte-abiertos.mjs';
function caso(vacio){const f=simular({ancho:true});f.panel.pop();
if(vacio){f.panel[1][0]='';f.panel[4][0]='';}
f.agregarHojaMaestro('INVENTARIOS',[['PRODUCTO','DEPOT','PASSWORD'],['0001',0,'SECRETO_NO_EXPORTAR']],20);
f.agregarHojaMaestro('REGISTRO',[['USUARIO','CONTEO'],['operador@sintetico.invalid',0]],21);
f.prepararCompleto();for(let i=0;i<200;i++)if(f.continuar().extraccion_terminada)break;
return f.archivosCorteActual();}
console.log(JSON.stringify({normal:caso(false),vacio:caso(true)}));
"""
  r=subprocess.run(['node','--input-type=module','-e',code],cwd=BASE,capture_output=True,text=True,check=True);d=json.loads(r.stdout);cls.files=d['normal'];cls.vacio=d['vacio']

 def paquete(self,t,files=None):
  p=Path(t)/'completo.zip'
  with zipfile.ZipFile(p,'w',zipfile.ZIP_DEFLATED) as z:
   for f in files or self.files:z.writestr('IMS_TEST/'+f['nombre'],f['content'])
  p.chmod(0o600);return p

 def test_maestro_ancho_completo_incluye_consolidado_registro_panel_y_usuarios_sin_secretos(self):
  with tempfile.TemporaryDirectory() as t:
   z=self.paquete(t);antes=z.read_bytes();r,_=validar_zip(z)
   self.assertTrue(r['captura_completa']);self.assertTrue(r['lista_para_plan']);self.assertEqual(r['fuentes_revision'],0);self.assertFalse(r['hojas_fuera_limite']);self.assertTrue(all(r['maestro'][k] for k in ('completo','consolidado_inventarios_presente','registro_presente','panel_presente','usuarios_presente')));self.assertEqual(z.read_bytes(),antes);self.assertFalse(r['corte_final_aprobado']);self.assertFalse(r['base_de_datos_modificada'])
   self.assertNotIn('SECRETO_NO_EXPORTAR',json.dumps(self.files));self.assertNotIn('operador@sintetico.invalid',json.dumps(r))

 def test_limites_modo_y_falta_de_hoja_obligatoria_no_se_aprueban(self):
  for caso in ('limites','modo','registro','panel'):
   with self.subTest(caso=caso),tempfile.TemporaryDirectory() as t:
    files=copy.deepcopy(self.files);pf=next(f for f in files if f['nombre']=='plan_abiertos_privado.json');p=json.loads(pf['content'])
    if caso=='limites':p['limites']['columnas']=513
    elif caso=='modo':p['modo_captura']='DESCONOCIDO'
    elif caso=='registro':
     m=next(f for f in p['fuentes'] if f['tipo']=='MAESTRO');id=next(h['id'] for h in m['hojas'] if h['nombre']=='REGISTRO');m['hojas']=[h for h in m['hojas'] if h['id']!=id];m['partes']=[x for x in m['partes'] if x['hoja_id']!=id]
    else:
     fuente=next(f for f in p['fuentes'] if f['tipo']=='INVENTARIO');refs={r['fila'] for r in fuente['panel']}
     for fila in [*[r for r in p['panel'] if r['fila'] in refs],*fuente['panel']]:
      next(c for c in fila['celdas'] if c['columna']==1)['valor']='CLIENTE_ALTERADO'
     p['panel_sha256']=__import__('hashlib').sha256(json.dumps(p['panel'],ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
    pf['content']=json.dumps(p,ensure_ascii=False,separators=(',',':'))
    if caso=='panel':
     with self.assertRaisesRegex(ValueError,'panel maestro no coincide'):validar_zip(self.paquete(t,files))
    else:
     with self.assertRaises(ValueError):validar_zip(self.paquete(t,files))

 def test_corte_completo_se_prepara_con_cada_origen_sin_importar_el_consolidado_como_abiertos(self):
  with tempfile.TemporaryDirectory() as t:
   z=self.paquete(t);r=preparar(z,Path(t)/'datos',t)
   self.assertTrue(r['validacion_captura']['captura_completa']);self.assertTrue(r['validacion_captura']['maestro']['completo']);self.assertEqual(r['seleccion_actual']['inventarios'],3);self.assertEqual(r['seleccion_actual']['lineas_candidatas'],3);self.assertFalse(r['datos_importados']);self.assertFalse(r['base_de_datos_modificada']);self.assertNotIn('operador@sintetico.invalid',json.dumps(r))

 def test_cliente_vacio_con_archivo_permanece_en_captura_y_en_candidatos_para_revision(self):
  with tempfile.TemporaryDirectory() as t:
   z=self.paquete(t,self.vacio);r,_=validar_zip(z);self.assertEqual(r['inventarios_en_panel'],3);self.assertEqual(r['referencias_cliente_vacio_con_archivo'],2);self.assertTrue(r['maestro']['panel_conciliado_con_catalogo'])
   prep=preparar(z,Path(t)/'datos',t);self.assertEqual(prep['seleccion_actual']['lineas_candidatas'],3);self.assertFalse(prep['datos_importados'])

 def test_presupuesto_total_sigue_acotado_y_el_modo_antiguo_conserva_su_limite(self):
  for completo in (True,False):
   with self.subTest(completo=completo),tempfile.TemporaryDirectory() as t:
    files=copy.deepcopy(self.files)
    if not completo:
     pf=next(f for f in files if f['nombre']=='plan_abiertos_privado.json');p=json.loads(pf['content']);p.pop('modo_captura');pf['content']=json.dumps(p,ensure_ascii=False,separators=(',',':'))
    archivo=self.paquete(t,files);metodo=zipfile.ZipFile.infolist
    def sobredimensionado(z):
     entradas=list(metodo(z))
     for i in range(129 if completo else 65):
      x=zipfile.ZipInfo('IMS_TEST/extra_'+str(i)+'.json');x.file_size=8388608;entradas.append(x)
     return entradas
    with patch.object(zipfile.ZipFile,'infolist',sobredimensionado):
     with self.assertRaisesRegex(ValueError,'Contenido ZIP demasiado grande'):validar_zip(archivo)
