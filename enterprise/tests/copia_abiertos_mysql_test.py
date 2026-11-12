import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
BASE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(BASE/'deploy'))
from copiar_abiertos_mysql import seleccionar_preparacion,configuracion,CopiaRechazada

class CopiaAbiertosMysqlTests(unittest.TestCase):
 def paquete(self,datos,archivo,sufijo,extra=None):
  d=datos/('PREPARACION_ABIERTOS_'+sufijo*32)/'datos';d.mkdir(parents=True);d.parent.chmod(0o700);d.chmod(0o700)
  m={'formato':'ims-abiertos-preparacion-privada-v1','aprobado_para_importar':False,'archivo_zip':str(archivo),'sha256_zip':hashlib.sha256(archivo.read_bytes()).hexdigest(),**(extra or {})};f=d/'preparacion_NO_IMPORTAR.json';f.write_text(json.dumps(m));f.chmod(0o600);return d
 def test_elije_paquete_por_zip_y_huella_sin_inferir_por_fecha(self):
  with tempfile.TemporaryDirectory() as t:
   datos=Path(t);archivo=datos/'fuente.zip';archivo.write_bytes(b'SINTETICO');d=self.paquete(datos,archivo,'a');self.paquete(datos,archivo,'b');self.assertEqual(seleccionar_preparacion(datos,archivo),d)
 def test_paquetes_diferentes_o_zip_distinto_se_detienen(self):
  with tempfile.TemporaryDirectory() as t:
   datos=Path(t);archivo=datos/'fuente.zip';archivo.write_bytes(b'SINTETICO');self.paquete(datos,archivo,'a');self.paquete(datos,archivo,'b',{'campo_diferente':1})
   with self.assertRaises(CopiaRechazada):seleccionar_preparacion(datos,archivo)
   otro=datos/'otro.zip';otro.write_bytes(b'OTRO')
   with self.assertRaises(CopiaRechazada):seleccionar_preparacion(datos,otro)
 def test_configuracion_solo_admite_cuenta_y_base_de_migracion_propias(self):
  with tempfile.TemporaryDirectory() as t:
   datos=Path(t);cfg=datos/'config';cfg.mkdir();env=cfg/'migracion.env';texto='MYSQL_HOST=127.0.0.1\nMYSQL_PORT=3306\nMYSQL_DATABASE=centromando_ims_ensayo\nMYSQL_USER=ims_cm_migracion\nMYSQL_PASSWORD='+'a'*64+'\n';env.write_text(texto);env.chmod(0o600);self.assertEqual(configuracion(datos)['MYSQL_USER'],'ims_cm_migracion');env.write_text(texto.replace('centromando_ims_ensayo','rrhh_itsanet'))
   with self.assertRaises(CopiaRechazada):configuracion(datos)
 def test_lanzador_no_activa_servicios_ni_amplia_permisos(self):
  s=(BASE/'deploy/copiar_abiertos_mysql.sh').read_text();self.assertEqual(subprocess.run(['bash','-n'],input=s,text=True,capture_output=True).returncode,0)
  for prohibido in ['sudo ','systemctl ','a2ensite','GRANT ','ALTER ','git checkout','git pull','rm -r']:self.assertNotIn(prohibido,s)
  self.assertIn('worktree add --quiet --detach',s);self.assertIn('--ignore-scripts',s);self.assertIn('copiar_abiertos_mysql.py',s)
