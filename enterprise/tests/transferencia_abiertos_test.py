import re
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

BASE=Path(__file__).resolve().parents[1]

class TransferenciaAbiertosTests(unittest.TestCase):
 def test_fallo_del_bash_remoto_identifica_etapa_sin_acceder_a_rutas_corporativas(self):
  texto=(BASE/'tools/enviar-abiertos-servidor.ps1').read_text();remoto=re.findall(r"@'\n(.*?)\n'@",texto,re.S)[1]
  with tempfile.TemporaryDirectory() as t:
   host=Path(t)/'hostname';host.write_text('#!/bin/sh\nprintf "otro-host\\n"\n');host.chmod(0o700)
   r=subprocess.run(['bash'],input=remoto,text=True,capture_output=True,env={**os.environ,'PATH':t+os.pathsep+os.environ['PATH']})
  self.assertNotEqual(r.returncode,0);d=json.loads(r.stdout);self.assertEqual(d['codigo_error'],'ETAPA_REMOTA');self.assertEqual(d['etapa'],'VERIFICAR_HOST');self.assertFalse(d['datos_importados']);self.assertFalse(d['servicios_reiniciados']);self.assertNotIn('/home/',r.stdout)

 def test_zip_se_inspecciona_antes_de_enviar_y_fallo_remoto_se_conserva_en_resumen(self):
  texto=(BASE/'tools/enviar-abiertos-servidor.ps1').read_text()
  self.assertLess(texto.index('[IO.Compression.ZipFile]::OpenRead'),texto.index('& $imsScp'))
  for guard in ['ZIP_INCOMPLETO_O_ILEGIBLE','plan_abiertos_privado.json','imsFragmentos -lt 1',"$imsResumen['diagnostico_remoto']=$imsDiagnostico; Save-ImsInforme"]:self.assertIn(guard,texto)
  self.assertNotIn('ExtractToDirectory',texto)

 def test_bash_remoto_se_limita_a_entrada_y_preparacion_propias_sin_sql_o_servicios(self):
  texto=(BASE/'tools/enviar-abiertos-servidor.ps1').read_text();bloques=re.findall(r"@'\n(.*?)\n'@",texto,re.S);self.assertEqual(len(bloques),2)
  for b in bloques:
   b=b.replace('__ARCHIVO__','ims-abiertos-'+'a'*32+'.zip').replace('__SHA__','b'*64).replace('__REVISION__','c'*40).replace('__TOKEN__','a'*32)
   self.assertEqual(subprocess.run(['bash','-n'],input=b,text=True,capture_output=True).returncode,0)
   for prohibido in ['systemctl ','a2ensite','mysql ','mysqldump','chmod -R','/home/enicolalde/bryan/IV_ITSANET']:
    self.assertNotIn(prohibido,b)
  self.assertIn('validar_corte_abiertos.py',texto);self.assertIn('Get-FileHash',texto);self.assertNotIn('StrictHostKeyChecking=no',texto);self.assertNotIn('UserKnownHostsFile=/dev/null',texto)
 def test_actualizacion_visual_no_vuelve_a_preparar_catalogo_o_cuentas(self):
  texto=(BASE/'deploy/actualizar_operacion.sh').read_text()
  self.assertEqual(subprocess.run(['bash','-n'],input=texto,text=True,capture_output=True).returncode,0)
  self.assertNotIn('preparar_creacion_erp.py',texto);self.assertNotIn('preparar_operacion.py',texto);self.assertNotIn('inicializar_ensayo',texto)
  self.assertIn('--erp-creacion',texto);self.assertIn('--conteos-esperados 352',texto)
 def test_lanzador_fijado_no_reemplaza_fuentes_en_uso_y_exige_revision_limpia(self):
  texto=(BASE/'deploy/aplicar_revision.sh').read_text()
  self.assertEqual(subprocess.run(['bash','-n'],input=texto,text=True,capture_output=True).returncode,0)
  for guard in ['^[a-f0-9]{40}$','merge-base --is-ancestor','status --porcelain','realpath -m','worktree add --detach']:self.assertIn(guard,texto)
  for forbidden in ['git checkout','git pull','sudo bash','rm -r','/etc/apache2','a2ensite','systemctl restart mysql']:self.assertNotIn(forbidden,texto)
