import base64
import re
import subprocess
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PS=ROOT/'tools/enviar-erp-privado.ps1'

class TransferenciaERPTests(unittest.TestCase):
 def test_scripts_remotos_solo_rutas_propias_y_sintaxis_bash_valida(self):
  text=PS.read_text()
  scripts=re.findall(r"@'\n(.*?)\n'@",text,re.S)
  self.assertEqual(len(scripts),3)
  for script in scripts:
   script=script.replace('__ARCHIVO__','erp-privado-'+'a'*32+'.json').replace('__REVISION__','b'*40).replace('__NONCE__','c'*32)
   r=subprocess.run(['bash','-n'],input=script,text=True,capture_output=True)
   self.assertEqual(r.returncode,0,r.stderr)
   for word in ['sudo ','mysql ','systemctl ','apache2ctl ','clasp ','git checkout','git pull','rm -','curl ']:self.assertNotIn(word,script)
   self.assertIn('test "$(hostname)" = apps',script)
  self.assertIn('git worktree add --quiet --detach',scripts[2]);self.assertNotIn('servir.mjs',scripts[2])
 def test_transporte_no_pone_claves_en_comandos_ni_desactiva_host_keys(self):
  text=PS.read_text()
  for word in ['StrictHostKeyChecking=no','ConvertFrom-SecureString','SUPABASE_SERVICE_ROLE_KEY','MYSQL_PASSWORD','CRED_API_']:self.assertNotIn(word,text)
  self.assertIn('ToBase64String',text);self.assertIn('sha256sum',text)
  self.assertIn('RevisionCodigo -notmatch',text);self.assertIn("NO_COMPARTIR_ERP_PRIVADO_*.json",text)
  self.assertIn('chmod 600 /home/enicolalde/bryan/centro_mando_ims_datos/entrada/',text)
 def test_exportador_sin_escritura_a_fuentes_ni_cambios_de_despliegue(self):
  text=(ROOT/'tools/EXPORTAR_ERP_PRIVADO.gs.txt').read_text()
  for word in ['setProperty(', 'setProperties(', 'deleteProperty(', 'deleteSheet(', 'setValues(', 'newTrigger(', 'UrlFetchApp', 'deployments']:
   self.assertNotIn(word,text)
  self.assertLess(len(text),3000)

if __name__=='__main__':unittest.main()
