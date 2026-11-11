import hashlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'deploy'))
import preparar_erp as erp
import actualizar_piloto as actualizar
import preparar_creacion_erp as creacion
from unittest.mock import patch

class ERPDeployTests(unittest.TestCase):
 def validar(self,repo,data,entorno=False):
  if entorno:self.assertEqual(set(data),{'IMS_ERP_HABILITADO','IMS_ERP_REGISTRO_BASE64'})
  return {'ok':True,'conexiones':24,'sedes':['GYE','UIO'],'solo_previsualizacion':True}
 def test_perfil_por_revision_privado_no_sobrescribe_y_huella_no_es_publica(self):
  with tempfile.TemporaryDirectory() as tmp:
   base=Path(tmp);os.chmod(base,0o700);origen=base/('ERP_LECTURA_'+'a'*32);origen.mkdir(mode=0o700);f=origen/'registro_erp_runtime_NO_COMPARTIR.json';f.write_text(json.dumps({'password':'NO_PUBLICAR'}));f.chmod(0o600)
   r=erp.preparar(Path('/tmp'),base,'b'*40,f,self.validar);self.assertTrue(r['perfil_erp_preparado']);self.assertNotIn('NO_PUBLICAR',json.dumps(r));self.assertNotIn('sha256',json.dumps(r))
   env=base/'erp'/('b'*40+'.env');self.assertEqual(env.stat().st_mode&0o777,0o600);antes=env.read_text();erp.preparar(Path('/tmp'),base,'b'*40,f,self.validar);self.assertEqual(env.read_text(),antes)
   f.write_text('{}')
   with self.assertRaises(Exception):erp.preparar(Path('/tmp'),base,'b'*40,f,self.validar)
   self.assertEqual(env.read_text(),antes)
 def test_perfil_alterado_o_enlazado_no_se_acepta(self):
  with tempfile.TemporaryDirectory() as tmp:
   base=Path(tmp);os.chmod(base,0o700);origen=base/('ERP_LECTURA_'+'a'*32);origen.mkdir(mode=0o700);f=origen/'registro_erp_runtime_NO_COMPARTIR.json';f.write_text('{}');f.chmod(0o600)
   erp.preparar(Path('/tmp'),base,'b'*40,f,self.validar);env=base/'erp'/('b'*40+'.env');env.write_text(env.read_text()+'EXTRA=1\n')
   with self.assertRaises(Exception):erp.validar_entorno(Path('/tmp'),base,'b'*40,self.validar)
   env.chmod(0o644)
   with self.assertRaises(Exception):erp.validar_entorno(Path('/tmp'),base,'b'*40,self.validar)
 def test_unidad_erp_preserva_perfil_base_puertos_y_limites(self):
  base=Path('/home/enicolalde/bryan/centro_mando_ims_datos');release=base/'releases'/('a'*40);carpeta=base/'piloto'
  antigua=actualizar.unidad_release(release,carpeta,'a'*40,operacion=True)
  nueva=actualizar.unidad_release(release,carpeta,'a'*40,operacion=True,erp=True)
  linea='EnvironmentFile='+str(base/'erp'/('a'*40+'.env'))+'\n';self.assertEqual(nueva.replace(linea,''),antigua)
  self.assertNotIn('NO_PUBLICAR',nueva)
  for item in ['CPUQuota=50%','MemoryMax=512M','ProtectHome=tmpfs','User=enicolalde']:self.assertIn(item,nueva)
  with self.assertRaises(Exception):actualizar.unidad_release(release,carpeta,'a'*40,erp=True)
 def test_creacion_tiene_perfil_nuevo_sin_cambiar_el_de_consulta_anterior(self):
  with tempfile.TemporaryDirectory() as tmp:
   base=Path(tmp);os.chmod(base,0o700);origen=base/('ERP_LECTURA_'+'a'*32);origen.mkdir(mode=0o700);f=origen/'registro_erp_runtime_NO_COMPARTIR.json';f.write_text('{}');f.chmod(0o600)
   def validar(repo,data,entorno=False):
    if entorno:self.assertEqual(data.get('IMS_ERP_CREACION'),'1')
    return {'ok':True,'conexiones':24,'sedes':['GYE','UIO'],'solo_previsualizacion':True}
   erp.preparar(Path('/tmp'),base,'b'*40,f,self.validar);antes=(base/'erp'/('b'*40+'.env')).read_text()
   r=erp.preparar(Path('/tmp'),base,'c'*40,f,validar,creacion=True);self.assertFalse(r['solo_previsualizacion']);self.assertTrue(r['creacion_nativa_preparada'])
   self.assertEqual((base/'erp'/('b'*40+'.env')).read_text(),antes)
   with self.assertRaises(Exception):erp.validar_entorno(Path('/tmp'),base,'c'*40,validar)
 def test_ampliacion_erp_solo_completa_sus_dos_tablas_sin_update_delete_o_grants_globales(self):
  calls=[]
  def verificar(admin,series=True,extras=None,erp_extras=()):
   if set(erp_extras)!={'ims_erp_inventario'} and not (calls and set(erp_extras)==set(creacion.op.ERP_TABLES)):raise creacion.p.PilotoError('Otro perfil')
  with patch.object(creacion.op,'grants',side_effect=verificar):creacion.ampliar(lambda sql:calls.append(sql))
  self.assertEqual(len(calls),1);self.assertIn('SELECT, INSERT',calls[0]);self.assertIn('ims_erp_linea',calls[0]);self.assertNotIn('UPDATE',calls[0]);self.assertNotIn('DELETE',calls[0]);self.assertNotIn('*.*',calls[0]);self.assertNotIn('ims_erp_inventario',calls[0])
 def test_perfil_sql_ajeno_bloquea_ampliacion_erp_sin_ejecutar_grants(self):
  calls=[]
  with patch.object(creacion.op,'grants',side_effect=creacion.p.PilotoError('Otro perfil')):
   with self.assertRaises(creacion.p.PilotoError):creacion.ampliar(lambda sql:calls.append(sql))
  self.assertEqual(calls,[])
