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
 def test_catalogos_versionados_no_admiten_sobrescribir_ni_borrar_originales(self):
  self.assertEqual(cm.CM_TABLES['ims_cm_catalogo_archivo'],'SELECT, INSERT')
  self.assertEqual(cm.CM_TABLES['ims_cm_catalogo'],'SELECT, INSERT')
  self.assertEqual(cm.CM_TABLES['ims_cm_catalogo_fila'],'SELECT, INSERT')
  self.assertEqual(cm.CM_TABLES['ims_cm_catalogo_actual'],'SELECT, INSERT, UPDATE')
 def test_ampliacion_de_estados_es_idempotente_y_no_cambia_datos(self):
  anterior="(`estado` in (_utf8mb4'EN_PROCESO',_utf8mb4'EN_VALIDACION',_utf8mb4'ENTREGADO',_utf8mb4'CANCELADO'))"
  ampliada=anterior.replace("'CANCELADO'", "'CANCELADO',_utf8mb4'CERRADO_SIN_CONSOLIDAR'")
  llamadas=[];estado=[anterior]
  def admin(q):
   llamadas.append(q)
   if q.startswith('SELECT'):return [[estado[0],'YES']]
   estado[0]=ampliada
   return []
  cm.preparar_estado_sin_consolidar(admin)
  self.assertEqual(len(llamadas),3);self.assertIn('DROP CHECK',llamadas[1]);self.assertNotIn('UPDATE ',llamadas[1])
  self.assertIn("t.TABLE_NAME='ims_op_inventario'",llamadas[0])
  llamadas.clear();cm.preparar_estado_sin_consolidar(admin);self.assertEqual(len(llamadas),1)
  estado[0]="estado IN ('OTRO_ESTADO')"
  with self.assertRaises(op.p.PilotoError):cm.preparar_estado_sin_consolidar(admin)
 def test_representaciones_reales_de_mysql_con_comillas_escapadas(self):
  esperados={'EN_PROCESO','EN_VALIDACION','ENTREGADO','CANCELADO'}
  for prefijo in ['', '_latin1', '_utf8mb4', '_utf8mb3', '_ascii', '_binary']:
   for comilla in ["'", "\\'"]:
    with self.subTest(prefijo=prefijo,comilla=comilla):
     valores=','.join(prefijo+comilla+x+comilla for x in sorted(esperados))
     self.assertEqual(cm.estados_restriccion('((`estado` in ('+valores+')))'),esperados)
 def test_no_admite_condiciones_adicionales_otra_columna_o_literals_ambiguos(self):
  base="estado IN ('EN_PROCESO','EN_VALIDACION','ENTREGADO','CANCELADO')"
  for clausula in [base+' OR 1=1',base+' AND estado IS NOT NULL',base.replace('estado','otra_columna'),base.replace("'CANCELADO'", "'CANCELADO\\\\'"),base+'; SELECT 1']:
   with self.subTest(clausula=clausula):
    with self.assertRaises(op.p.PilotoError):cm.estados_restriccion(clausula)
 def test_no_modifica_restriccion_desactivada_o_ausente_ni_confirma_un_alter_no_aplicado(self):
  anterior="estado IN ('EN_PROCESO','EN_VALIDACION','ENTREGADO','CANCELADO')"
  for filas in [[],[[anterior,'NO']],[[anterior,'YES'],[anterior,'YES']]]:
   llamadas=[]
   def admin(q):llamadas.append(q);return filas
   with self.assertRaises(op.p.PilotoError):cm.preparar_estado_sin_consolidar(admin)
   self.assertTrue(all(q.startswith('SELECT') for q in llamadas))
  with self.assertRaises(op.p.PilotoError):cm.preparar_estado_sin_consolidar(lambda q:[[anterior,'YES']] if q.startswith('SELECT') else [])
