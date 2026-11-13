import sys
import unittest
from pathlib import Path
from unittest.mock import patch
DEPLOY=Path(__file__).parents[1]/'deploy'
sys.path.insert(0,str(DEPLOY))
import preparar_centro as cm
import actualizar_piloto as up
import preparar_operacion as op
sys.path.remove(str(DEPLOY))

class CentroDeployTest(unittest.TestCase):
 def datos(self,completo=False):
  ts={**op.TABLES,**op.SERIES_TABLES,**op.ERP_TABLES}
  if completo:ts.update(cm.CM_BASE_OVERRIDES);ts.update(cm.CM_TABLES)
  tablas=[[t,g] for t,gs in ts.items() for g in gs.split(', ')]
  cols=[[t,c,'UPDATE'] for t,cs in {**op.COLUMNS,**(cm.CM_COLUMNS if completo else {})}.items() for c in cs]
  def admin(sql):
   if 'TABLE_PRIVILEGES' in sql:return tablas
   if 'COLUMN_PRIVILEGES' in sql:return cols
   if 'USER_PRIVILEGES' in sql:return [['USAGE']]
   if 'SCHEMA_PRIVILEGES' in sql:return []
   return [['GRANT USAGE ON *.*'],['GRANT SELECT ON `'+op.DB+'`.`ims_op_actor`']]
  return admin,tablas,cols
 def test_perfil_anterior_y_ampliacion_estan_limitados_a_base_propia(self):
  a,_,_=self.datos();cm.validar_privilegios(a)
  with self.assertRaises(op.p.PilotoError):cm.validar_privilegios(a,completo=True)
  a,_,_=self.datos(True);cm.validar_privilegios(a,completo=True)
 def test_rechaza_privilegios_extras_y_actualizar_cantidades_fuera_del_perfil(self):
  a,tablas,cols=self.datos(True);tablas.append(['ims_cm_fuente','DELETE'])
  with self.assertRaises(op.p.PilotoError):cm.validar_privilegios(a)
  a,_,cols=self.datos(True);cols.append(['ims_op_linea','sku','UPDATE'])
  with self.assertRaises(op.p.PilotoError):cm.validar_privilegios(a)
 def test_entorno_del_centro_solo_se_agrega_a_unidad_propia_y_conserva_limites(self):
  base=Path('/home/enicolalde/bryan/centro_mando_ims_datos');rev='a'*40
  u=up.unidad_release(base/'releases'/rev,base/'piloto',rev,operacion=True,erp=True,centro=True)
  self.assertIn('EnvironmentFile='+str(base/'centro'/(rev+'.env')),u)
  self.assertIn('MemoryMax=512M',u);self.assertIn('CPUQuota=50%',u)
  self.assertNotIn('8443',u);self.assertNotIn('apache',u.lower())
 def test_lector_no_recibe_escritura_sobre_historia_o_fuentes(self):
  for t in ['ims_cm_panel','ims_cm_legado','ims_cm_fuente','ims_cm_linea_historica','ims_cm_archivo_legado']:
   self.assertEqual(cm.CM_TABLES[t],'SELECT')
  self.assertNotIn('ims_snapshot_fila',cm.CM_TABLES)
  self.assertNotIn('DELETE',cm.CM_TABLES['ims_cm_auditoria'])
  self.assertNotIn('UPDATE',cm.CM_TABLES['ims_cm_auditoria'])
