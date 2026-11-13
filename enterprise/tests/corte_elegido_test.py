import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import uuid

BASE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(BASE/'deploy'))
import procesar_corte_elegido as proceso
from copiar_abiertos_mysql import CopiaRechazada
import captura_completa_test as completa_fixture
import plan_abiertos_operativos_test as plan_fixture
from planificar_abiertos_operativos import planificar, resolver_reglas
from trasladar_reglas_abiertos import trasladar_reglas

class CorteElegidoTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  completa_fixture.CapturaCompletaTests.setUpClass();cls.fixture=completa_fixture.CapturaCompletaTests()

 def entrada(self,t,revision=False):
  datos=Path(t);entrada=datos/'entrada';entrada.mkdir();entrada.chmod(0o700)
  files=copy.deepcopy(self.fixture.files)
  pf=next(f for f in files if f['nombre']=='plan_abiertos_privado.json');p=json.loads(pf['content'])
  if revision:
   for tipo in ('MAESTRO','INVENTARIO'):
    f=next(f for f in p['fuentes'] if f['tipo']==tipo);f.update(estado='REVISION',motivo='FUENTE_CAMBIO')
   pf['content']=json.dumps(p,ensure_ascii=False,separators=(',',':'))
  archivo=self.fixture.paquete(entrada,files);out=datos/'salida';out.mkdir(mode=0o700)
  return datos,archivo,p,out

 def sql_falso(self,solicitudes,fallar=False):
  def ejecutar(repo,herramienta,s):
   solicitudes.append(herramienta);prep=Path(s['preparacion']);m=json.loads((prep/'preparacion_NO_IMPORTAR.json').read_bytes());copia=hashlib.sha256((prep/'preparacion_NO_IMPORTAR.json').read_bytes()).hexdigest()
   if fallar:raise CopiaRechazada('RESPUESTA_SQL_NO_CONFIRMADA')
   productos=len((prep/'lineas_candidatas_NO_IMPORTAR.jsonl').read_text().splitlines());aux=len((prep/'filas_auxiliares_NO_IMPORTAR.jsonl').read_text().splitlines())
   if herramienta=='copiar-preparacion-abiertos-mysql.mjs':return {'ok':True,'integridad_sql_verificada':True,'copia_id':copia,'corte_id':m['corte_id'],'productos':productos,'filas_auxiliares':aux,'datos_operativos_importados':False,'inventarios_activados':False}
   return {'formato':'ims-abiertos-contexto-sql-v1','integridad_sql_verificada':True,'copia_id':copia,'corte_id':m['corte_id'],'productos':productos,'auxiliares':aux,'clientes':[{'id':str(uuid.uuid4()),'nombre':n} for n in ('BELIA','NOKIA','OTRO')],'existentes':[]}
  return ejecutar

 def test_corte_con_dos_fuentes_en_revision_se_conserva_y_proyecta_sin_exigir_otra_captura(self):
  with tempfile.TemporaryDirectory() as t,patch.object(proceso,'configuracion',return_value={'MYSQL_PASSWORD':'NO_PUBLICAR'}):
   datos,z,p,out=self.entrada(t,True);antes=z.read_bytes();estado={};sql=[]
   r=proceso.procesar(z,datos,BASE.parent,p['corte_id'],out,estado,self.sql_falso(sql))
   self.assertTrue(r['ok']);self.assertEqual(r['productos_guardados'],3);self.assertFalse(r['solicitar_nueva_extraccion_google']);self.assertFalse(r['maestro_completo']);self.assertEqual(len(r['fuentes_revision_conservadas']),2)
   self.assertFalse(r['plan_operativo']['requiere_delta_final']);self.assertFalse(r['plan_operativo']['listo_para_activar']);self.assertFalse(r['datos_operativos_importados']);self.assertFalse(r['permisos_creados']);self.assertEqual(z.read_bytes(),antes)
   self.assertEqual(sql,['copiar-preparacion-abiertos-mysql.mjs','leer-contexto-abiertos-mysql.mjs']);self.assertTrue(estado['copia_mysql_confirmada']);self.assertNotIn('NO_PUBLICAR',json.dumps(r));self.assertNotIn('operador@sintetico.invalid',json.dumps(r))
   self.assertTrue(list(datos.glob('PREPARACION_ABIERTOS_*/datos/lineas_candidatas_NO_IMPORTAR.jsonl')))

 def test_corte_distinto_rechaza_antes_de_preparar_o_adquirir_conexion(self):
  with tempfile.TemporaryDirectory() as t:
   datos,z,p,out=self.entrada(t);sql=[]
   with self.assertRaisesRegex(CopiaRechazada,'CORTE_DISTINTO'):proceso.procesar(z,datos,BASE.parent,str(uuid.uuid4()),out,{},self.sql_falso(sql))
   self.assertFalse(sql);self.assertFalse(list(datos.glob('PREPARACION_ABIERTOS_*')))

 def test_reintento_reutiliza_preparacion_y_no_confunde_copia_mysql_con_activacion(self):
  with tempfile.TemporaryDirectory() as t,patch.object(proceso,'configuracion',return_value={}):
   datos,z,p,out=self.entrada(t);uno=proceso.procesar(z,datos,BASE.parent,p['corte_id'],out,{},self.sql_falso([]))
   otro=datos/'otro';otro.mkdir(mode=0o700);dos=proceso.procesar(z,datos,BASE.parent,p['corte_id'],otro,{},self.sql_falso([]))
   self.assertEqual(uno['copia_id'],dos['copia_id']);self.assertEqual(len(list(datos.glob('PREPARACION_ABIERTOS_*'))),1);self.assertFalse(dos['inventarios_activados'])

 def test_error_despues_de_intentar_sql_no_se_declara_como_base_intacta(self):
  with tempfile.TemporaryDirectory() as t,patch.object(proceso,'configuracion',return_value={}):
   datos,z,p,out=self.entrada(t);estado={'copia_mysql_confirmada':False}
   with self.assertRaisesRegex(CopiaRechazada,'RESPUESTA_SQL'):proceso.procesar(z,datos,BASE.parent,p['corte_id'],out,estado,self.sql_falso([],True))
   self.assertTrue(estado['copia_mysql_intentada']);self.assertFalse(estado['copia_mysql_confirmada']);self.assertFalse('base_de_datos_modificada' in estado)

 def test_aceptacion_exige_identidad_y_sha_del_paquete_sin_quitar_bloqueos_estructurales(self):
  f=plan_fixture.PlanAbiertosOperativosTests();f.setUpClass()
  with tempfile.TemporaryDirectory() as t:
   p,c=f.paquete(t);m=json.loads((p/'preparacion_NO_IMPORTAR.json').read_bytes());a={'formato':'ims-abiertos-corte-elegido-v1','corte_id':c['corte_id'],'copia_id':c['copia_id'],'sha256_zip':m['sha256_zip'],'usar_capturas_guardadas':True,'solicitar_nueva_extraccion_google':False}
   r=planificar(p,c,Path(t)/'plan',t,aceptacion=a);self.assertFalse(r['requiere_delta_final']);self.assertTrue(r['bloqueos']);self.assertFalse(r['listo_para_activar'])
   for campo in ('corte_id','copia_id','sha256_zip'):
    malo={**a,campo:'alterado'}
    with self.assertRaisesRegex(ValueError,'Aceptación'):planificar(p,c,Path(t)/('otro_'+campo),t,aceptacion=malo)

 def test_regla_trasladada_elige_id_fisico_en_vez_de_la_fila_actual(self):
  corte=str(uuid.uuid4());f=[('SELECCION_ACTUAL',corte,1,{'id':'FISICO_A','panel':[{'fila':9}]}),('SELECCION_ACTUAL',corte,2,{'id':'FISICO_B','panel':[{'fila':317}]})]
  rows={('SELECCION_ACTUAL',corte,'FISICO_A'):[{'codigo_operativo_original':'A'}],('SELECCION_ACTUAL',corte,'FISICO_B'):[{'codigo_operativo_original':'B'}]}
  r=resolver_reglas({'copia_id':'a'*64},f,rows,{'copia_id':'a'*64,'separar_codigo_fecha':[{'origen_drive':'FISICO_A','fila_panel_corte':317,'productos':1,'codigos':1}]})
  self.assertEqual(r,{('SELECCION_ACTUAL',corte,'FISICO_A'):'separar_codigo_fecha'})

 def test_reutiliza_decision_solo_desde_manifesto_anterior_por_hash_y_zip_original(self):
  import shutil
  f=plan_fixture.PlanAbiertosOperativosTests();f.setUpClass()
  with tempfile.TemporaryDirectory() as t:
   datos=Path(t);entrada=datos/'entrada';entrada.mkdir();prep,c=f.paquete(entrada)
   d=datos/('PREPARACION_ABIERTOS_'+'a'*32);d.mkdir();anterior=d/'datos';shutil.copytree(prep,anterior)
   original=json.loads((anterior/'preparacion_NO_IMPORTAR.json').read_bytes());actualzip=entrada/'nuevo.zip';shutil.copyfile(original['archivo_zip'],actualzip)
   m=json.loads((prep/'preparacion_NO_IMPORTAR.json').read_bytes());m['archivo_zip']=str(actualzip);(prep/'preparacion_NO_IMPORTAR.json').write_text(json.dumps(m));c['copia_id']=hashlib.sha256((prep/'preparacion_NO_IMPORTAR.json').read_bytes()).hexdigest()
   confirmadas={'copia_id':hashlib.sha256((anterior/'preparacion_NO_IMPORTAR.json').read_bytes()).hexdigest(),'separar_codigo_fecha':[{'fila_panel_corte':2,'productos':4,'codigos':1}]}
   reglas,resumen=trasladar_reglas(datos,prep,c,confirmadas)
   self.assertEqual(reglas['copia_id'],c['copia_id']);self.assertTrue(reglas['separar_codigo_fecha'][0]['origen_drive']);self.assertEqual(resumen[0]['estado'],'APLICADA_POR_ARCHIVO_FISICO');self.assertNotIn('ARCHIVO_ABIERTO_SINTETICO',json.dumps(resumen))
   reglas,resumen=trasladar_reglas(datos,prep,c,{**confirmadas,'copia_id':'0'*64});self.assertEqual(reglas,{'copia_id':c['copia_id']});self.assertEqual(resumen[0]['estado'],'COPIA_ANTERIOR_NO_LOCALIZADA')

 def test_lanzador_solo_usa_entrada_privada_worktree_y_cuenta_existente(self):
  s=(BASE/'deploy/procesar_corte_elegido.sh').read_text();subprocess.run(['bash','-n'],input=s,text=True,check=True)
  for guard in ('07e58bf9-6fe1-4bf0-b93e-d1a89cb66764','merge-base --is-ancestor','worktree add --quiet --detach','realpath -m','--ignore-scripts','stat -c %a'):self.assertIn(guard,s)
  for prohibido in ('sudo ','systemctl ','a2ensite','git checkout','git pull','rm -r','GRANT ','ALTER '):self.assertNotIn(prohibido,s)

if __name__=='__main__':unittest.main()
