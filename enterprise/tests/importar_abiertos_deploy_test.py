import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

BASE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(BASE/'deploy'))
from importar_abiertos import seleccionar_plan
from copiar_abiertos_mysql import CopiaRechazada

class ImportarAbiertosDeployTests(unittest.TestCase):
 def test_plan_se_selecciona_por_hash_y_conserva_los_originales(self):
  with tempfile.TemporaryDirectory() as t:
   datos=Path(t);d=datos/('CORTE_ELEGIDO_'+'a'*32);p=d/'plan';p.mkdir(parents=True);d.chmod(0o700);p.chmod(0o700);f=p/'plan_operativo_NO_ACTIVAR.json';raw=b'{"dato":"SINTETICO"}';f.write_bytes(raw);f.chmod(0o600);h=hashlib.sha256(raw).hexdigest()
   self.assertEqual(seleccionar_plan(datos,h),p);self.assertEqual(f.read_bytes(),raw)
   with self.assertRaises(CopiaRechazada):seleccionar_plan(datos,'0'*64)
   f.chmod(0o644)
   with self.assertRaises(Exception):seleccionar_plan(datos,h)
 def test_carpeta_enlazada_no_se_adopta_como_plan(self):
  with tempfile.TemporaryDirectory() as t:
   datos=Path(t);real=datos/'original';p=real/'plan';p.mkdir(parents=True);f=p/'plan_operativo_NO_ACTIVAR.json';f.write_bytes(b'{}');f.chmod(0o600);real.chmod(0o700);p.chmod(0o700);(datos/('CORTE_ELEGIDO_'+'b'*32)).symlink_to(real,target_is_directory=True)
   with self.assertRaises(Exception):seleccionar_plan(datos,hashlib.sha256(b'{}').hexdigest())
 def test_lanzador_fija_plan_y_prueba_antes_de_importar_y_solo_actualiza_backend_propio(self):
  s=(BASE/'deploy/habilitar_corte_elegido.sh').read_text();subprocess.run(['bash','-n'],input=s,text=True,check=True)
  self.assertLess(s.index('npm test'),s.index('python3 deploy/importar_abiertos.py'))
  self.assertLess(s.index("-p '*_test.py'"),s.index('python3 deploy/importar_abiertos.py'))
  self.assertIn('2c00275f02bde5699a2c0b121d6a8a1c633b16002a83d8494fcf942b201d29ba',s)
  self.assertIn('--conteos-esperados 352 --filas-esperadas 97822',s)
  for texto in ('git checkout','git pull','a2ensite','systemctl restart apache','systemctl restart mysql','GRANT ','ALTER ','rm -r'):self.assertNotIn(texto,s)

if __name__=='__main__':unittest.main()
