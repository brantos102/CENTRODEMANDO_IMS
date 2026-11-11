import re
import json
import os
import subprocess
import tempfile
import zipfile
import unittest
from pathlib import Path

BASE=Path(__file__).resolve().parents[1]

class TransferenciaAbiertosTests(unittest.TestCase):
 def test_revalidacion_reutiliza_zip_y_guarda_error_sin_cambiar_repo_o_datos(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);repo=root/'codigo';datos=root/'datos';entrada=datos/'entrada';repo.mkdir();entrada.mkdir(parents=True);datos.chmod(0o700);entrada.chmod(0o700)
   tool=repo/'enterprise/tools';tool.mkdir(parents=True);(tool/'validar_corte_abiertos.py').write_bytes((BASE/'tools/validar_corte_abiertos.py').read_bytes())
   def git(*args):return subprocess.run(['git','-C',str(repo),*args],capture_output=True,text=True,check=True).stdout.strip()
   git('init','--quiet');git('config','user.name','Pruebas');git('config','user.email','pruebas@sintetico.invalid');git('add','.');git('commit','--quiet','-m','Fixture');revision=git('rev-parse','HEAD');(repo/'.git/FETCH_HEAD').write_text(revision+'\t\tfixture\n')
   archivo=entrada/('ims-abiertos-'+'a'*32+'.zip')
   with zipfile.ZipFile(archivo,'w') as z:z.writestr('resumen_abiertos_para_compartir.json','SECRETO_NO_PUBLICAR')
   archivo.chmod(0o600);antes=archivo.read_bytes();fake=root/'bin';fake.mkdir()
   for nombre,valor in [('hostname','apps'),('id','enicolalde')]:
    cmd=fake/nombre;cmd.write_text('#!/bin/sh\nprintf "'+valor+'\\n"\n');cmd.chmod(0o700)
   script=(BASE/'deploy/revalidar_abiertos.sh').read_text().replace('/home/enicolalde/bryan/centro_mando_ims_datos',str(datos)).replace('/home/enicolalde/bryan/centro_mando_ims',str(repo))
   r=subprocess.run(['bash','-s','--',revision,str(archivo)],input=script,text=True,capture_output=True,env={**os.environ,'PATH':str(fake)+os.pathsep+os.environ['PATH']})
   self.assertEqual(r.returncode,1,r.stderr);informes=list(datos.glob('REVALIDACION_ABIERTOS_*/resumen_revalidacion_para_compartir.json'));self.assertEqual(len(informes),1);self.assertEqual(informes[0].stat().st_mode&0o777,0o600)
   d=json.loads(informes[0].read_text());self.assertEqual(d['codigo_error'],'CORTE_INVALIDO');self.assertEqual(d['motivo'],'Falta el plan privado.');self.assertFalse(d['datos_importados']);self.assertNotIn('SECRETO_NO_PUBLICAR',r.stdout+r.stderr);self.assertEqual(archivo.read_bytes(),antes);self.assertEqual(git('rev-parse','HEAD'),revision);self.assertEqual(git('status','--porcelain'),'')

 def test_revalidacion_limita_ruta_y_revision_sin_activar_servicios(self):
  texto=(BASE/'deploy/revalidar_abiertos.sh').read_text();self.assertEqual(subprocess.run(['bash','-n'],input=texto,text=True,capture_output=True).returncode,0)
  for guard in ['^[a-f0-9]{40}$','ims-abiertos-[a-f0-9]{32}','merge-base --is-ancestor','realpath -m','stat -c %a','worktree add --quiet --detach']:self.assertIn(guard,texto)
  for prohibido in ['sudo ','systemctl ','mysql ','a2ensite','git checkout','git pull','scp ','rm -r']:self.assertNotIn(prohibido,texto)

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
