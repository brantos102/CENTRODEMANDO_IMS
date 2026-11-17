import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'deploy'))
import preparar_operacion as op
import actualizar_piloto as actualizar
from comprobar_operacion import comprobar
from unittest.mock import patch
import io
from contextlib import redirect_stdout
from types import SimpleNamespace

class OperacionDeployTests(unittest.TestCase):
 def test_limite_de_conexiones_se_difiere_sin_ocultar_otros_errores(self):
  fallo=SimpleNamespace(returncode=1,stdout=json.dumps({'ok':False,'etapa':'CONEXION','codigo_error':'ER_USER_LIMIT_REACHED','recurso_limite':'max_user_connections'}),stderr='CLAVE_PRIVADA_NO_MOSTRAR')
  with patch.object(op.subprocess,'run',return_value=fallo):
   with self.assertRaises(op.PerfilOperativoOcupado):op.node(Path('/repo'),'--verificar',{'config':{'MYSQL_PASSWORD':'CLAVE_PRIVADA_NO_MOSTRAR'}})
  fallo.stdout=json.dumps({'ok':False,'etapa':'CONEXION','codigo_error':'ER_ACCESS_DENIED_ERROR','mensaje':'CLAVE_PRIVADA_NO_MOSTRAR'})
  out=io.StringIO()
  with patch.object(op.subprocess,'run',return_value=fallo),redirect_stdout(out):
   with self.assertRaisesRegex(op.p.PilotoError,'ER_ACCESS_DENIED_ERROR'):op.node(Path('/repo'),'--verificar',{})
  self.assertNotIn('CLAVE_PRIVADA_NO_MOSTRAR',out.getvalue())
  for recurso in ['max_connections',None]:
   fallo.stdout=json.dumps({'ok':False,'etapa':'CONEXION','codigo_error':'ER_USER_LIMIT_REACHED','recurso_limite':recurso})
   with patch.object(op.subprocess,'run',return_value=fallo),redirect_stdout(out):
    with self.assertRaises(op.p.PilotoError) as err:op.node(Path('/repo'),'--verificar',{})
   self.assertNotIsInstance(err.exception,op.PerfilOperativoOcupado)

 def test_comprobacion_diferida_es_obligatoria_y_conserva_totales(self):
  calls=[]
  def verificar(*args):
   calls.append(args)
   if len(calls)==1:raise op.PerfilOperativoOcupado('ER_USER_LIMIT_REACHED')
   return {'ok':True,'historico':{'conteos':352,'filas':97822}}
  with redirect_stdout(io.StringIO()):pendiente=actualizar.preparar_verificacion_operativa(Path('/repo'),'MYSQL_USER=ims_cm_operacion\n',352,97822,verificar)
  self.assertEqual(len(calls),1)
  self.assertTrue(pendiente()['ok']);self.assertEqual(len(calls),2)
  self.assertEqual(calls[1][1],'--verificar')
 def test_cuenta_invalida_no_se_difiere_y_comprobacion_exitosa_no_se_repite(self):
  def fallo(*_):raise op.p.PilotoError('ER_ACCESS_DENIED_ERROR')
  with self.assertRaises(op.p.PilotoError):actualizar.preparar_verificacion_operativa(Path('/repo'),'',352,97822,fallo)
  calls=[]
  def correcto(*_):calls.append(1);return {'historico':{'conteos':352,'filas':97822}}
  hecho=actualizar.preparar_verificacion_operativa(Path('/repo'),'',352,97822,correcto)
  hecho();self.assertEqual(calls,[1])
 def test_perfil_fijo_y_unidad_limitada(self):
  env=op.entorno('a'*64)
  for item in ['IMS_PORT=3003\n','IMS_OPERACION_NATIVA=1\n','MYSQL_DATABASE=centromando_ims_ensayo\n','IMS_SOLO_LECTURA=0\n']:self.assertIn(item,env)
  release=Path('/home/enicolalde/bryan/centro_mando_ims_datos/releases')/('a'*40);folder=Path('/home/enicolalde/bryan/centro_mando_ims_datos/piloto')
  old=actualizar.unidad_release(release,folder,'a'*40);new=actualizar.unidad_release(release,folder,'a'*40,True)
  self.assertEqual(old.replace('/piloto/piloto.env','/operacion/operacion.env'),new)
  for item in ['MemoryMax=512M','ProtectHome=tmpfs','CPUQuota=50%']:self.assertIn(item,new)
 def test_sin_ddl_privilegios_globales_edicion_de_sku_o_staging(self):
  sql=op.sql_cuenta('a'*64)
  for item in ['DROP ','ALTER ','TRIGGER ','GRANT ALL','ims_snapshot','mysql.user','UPDATE (`sku`']:self.assertNotIn(item,sql)
  self.assertNotIn('DELETE ON `centromando_ims_ensayo`.`ims_op_linea`',sql)
  self.assertNotIn('UPDATE ON `centromando_ims_ensayo`.`ims_auth_usuario`',sql)
  self.assertIn('UPDATE (`version`,`conteo_1`',sql)
  with self.assertRaises(Exception):op.sql_cuenta('a'*64,'rrhh')
  with self.assertRaises(Exception):op.sql_cuenta('a'*64,host='0.0.0.0')
 def test_protecciones_no_sobrescriben_triggers_ajenos(self):
  repo=Path(__file__).resolve().parents[2];calls=[]
  def crear(sql):calls.append(sql);return []
  op.triggers(repo,crear)
  self.assertEqual(sum('CREATE TRIGGER' in s for s in calls),11)
  for s in calls:self.assertNotIn('DROP ',s);self.assertNotIn('ALTER ',s)
  def otro(sql):return [['BEFORE','UPDATE','otra_tabla','424547494e20454e44']]
  with self.assertRaises(Exception):op.triggers(repo,otro)
 def transporte(self,escribe=False,erp=False,privado=False,creacion=False,centro=False):
  actor='11111111-1111-1111-1111-111111111111';inv='22222222-2222-2222-2222-222222222222';linea='33333333-3333-3333-3333-333333333333';calls=[]
  def request(method,path,body=None,headers=None):
   calls.append((method,path,body));status,h,data=200,{},{}
   if path=='/api/operacion' and not(headers or {}).get('Cookie'):status=401
   elif path=='/api/sesion' and method=='POST':
    h={'set-cookie':'__Host-ims_cm_session='+'a'*43+'; Secure; HttpOnly; SameSite=Strict; Path=/'};data={'usuario':{'actorId':actor},'csrf':'b'*43,'operacionNativa':True,'soloLectura':False,'erpDisponible':erp,'erpCreacionDisponible':creacion,'centroDisponible':centro}
   elif path=='/api/erp/conexiones':data={'soloPrevisualizacion':True,'sedes':['UIO','GYE'],'conexiones':[{'referencia':'a'*24,'sede':'UIO','etiqueta':'BELIA','clienteId':None,'clienteNombre':'BELIA','codigosCliente':['BELIA'],**({'password':'NO_PUBLICAR'} if privado else {})}]}
   elif path=='/api/operacion':data={'ambitos':[{'sede':s,'rol':'ADMIN'} for s in ['UIO','GYE']],'inventarios':[]}
   elif path in ['/api/centro/'+x for x in ['contexto','dashboard','eventos','usuarios','analitica']]:data={dict(contexto='perfil',dashboard='indicadores',eventos='eventos',usuarios='usuarios',analitica='usuarios')[path.rsplit('/',1)[1]]:[]}
   elif path.startswith('/api/inventarios?'):data={'datos':[{'id':inv,'estado':'ENTREGADO'}],'siguiente':None}
   elif path=='/api/resumen':data={'totales':{'conteos':'1','lineas':'1'}}
   elif '/lineas?' in path:data={'datos':[{'id':linea,'version':'0','puede_contar':False}]}
   elif path=='/api/conteos':status,data=(200,{'ok':True}) if escribe else (403,{'error':'SIN_PERMISO'})
   elif path=='/api/sesion/cerrar':data={'ok':True}
   elif path=='/api/sesion':status=401
   else:raise AssertionError(path)
   return status,h,json.dumps(data).encode()
  return request,calls,{'actorId':actor,'correo':'sintetico@prueba.invalid','contrasena':'sintetica'}
 def test_comprobacion_centro_identifica_timeout_sin_exponer_datos_y_logout_no_oculta_el_fallo(self):
  request,_,user=self.transporte(centro=True);progreso=[]
  def lento(method,path,body=None,headers=None):
   if path in ['/api/centro/dashboard','/api/sesion/cerrar']:raise TimeoutError('SECRETO_SINTETICO_NO_REGISTRAR')
   return request(method,path,body,headers)
  with self.assertRaisesRegex(actualizar.https.PublicacionError,'CENTRO_DASHBOARD') as fallo:
   comprobar(lento,user,1,1,centro=True,progreso=progreso.append)
  self.assertNotIn('SECRETO',str(fallo.exception));self.assertNotIn('SECRETO',json.dumps(progreso));self.assertNotIn(user['correo'],json.dumps(progreso))
  self.assertTrue(any(p['etapa']=='CENTRO_DASHBOARD' and p['estado']=='INICIO' for p in progreso))
 def test_progreso_de_centro_recorre_todas_las_funciones_y_no_incluye_solicitudes(self):
  request,_,user=self.transporte(centro=True);progreso=[]
  self.assertTrue(comprobar(request,user,1,1,centro=True,progreso=progreso.append)['centro_mando'])
  etapas={x['etapa'] for x in progreso if x['estado']=='RESPUESTA'}
  self.assertTrue({'CENTRO_DASHBOARD','CENTRO_EVENTOS','CENTRO_USUARIOS','CENTRO_ANALITICA','LOGOUT'}<=etapas)
  self.assertTrue(all(set(x)<= {'etapa','estado','http','milisegundos'} for x in progreso))
 def test_https_exige_proteccion_del_historico_y_revoca_sesion(self):
  request,calls,user=self.transporte();r=comprobar(request,user,1,1)
  self.assertTrue(r['historico_protegido']);self.assertEqual(calls[-1][:2],('GET','/api/sesion'))
  self.assertFalse(any(p.startswith('/api/operacion/') and m=='POST' for m,p,b in calls))
  request,_,user=self.transporte(True)
  with self.assertRaises(Exception):comprobar(request,user,1,1)
 def test_https_erp_exige_habilitacion_y_rechaza_campos_privados_antes_de_aprobar(self):
  request,calls,user=self.transporte(erp=True);r=comprobar(request,user,1,1,erp_conexiones=1)
  self.assertTrue(r['erp_consulta']);self.assertEqual(r['conexiones_erp'],1)
  self.assertEqual(calls[-1][:2],('GET','/api/sesion'))
  for habilitado,privado in [(False,False),(True,True)]:
   request,calls,user=self.transporte(erp=habilitado,privado=privado)
   with self.assertRaises(Exception):comprobar(request,user,1,1,erp_conexiones=1)
   self.assertIn(('POST','/api/sesion/cerrar'),[(m,p) for m,p,_ in calls])
 def test_https_creacion_erp_exige_flag_y_no_crea_inventarios_durante_despliegue(self):
  request,calls,user=self.transporte(erp=True,creacion=True);r=comprobar(request,user,1,1,erp_conexiones=1,erp_creacion=True);self.assertTrue(r['erp_creacion'])
  self.assertFalse(any(m=='POST' and p=='/api/erp/inventarios' for m,p,_ in calls))
  request,_,user=self.transporte(erp=True)
  with self.assertRaises(Exception):comprobar(request,user,1,1,erp_conexiones=1,erp_creacion=True)

if __name__=='__main__':unittest.main()

class AmpliacionSeriesTests(unittest.TestCase):
 def test_trece_triggers_conservan_los_once_anteriores(self):
  repo=Path(__file__).resolve().parents[2];calls=[]
  op.triggers(repo,lambda sql:(calls.append(sql) or []),series=True)
  self.assertEqual(sum('CREATE TRIGGER' in s for s in calls),13)
  self.assertFalse(any('DROP ' in s or 'ALTER ' in s for s in calls))
 def test_perfil_ajeno_no_provoca_ampliacion(self):
  from unittest.mock import patch
  calls=[]
  with patch.object(op,'grants',side_effect=op.p.PilotoError('Perfil diferente')):
   with self.assertRaises(op.p.PilotoError):op.ampliar_series(lambda sql:calls.append(sql))
  self.assertEqual(calls,[])
 def test_corte_entre_grants_solo_completa_la_tabla_faltante(self):
  from unittest.mock import patch
  calls=[]
  def verificar(admin,series=True,extras=None):
   if extras is not None and extras!={'ims_nat_serie'}:raise op.p.PilotoError('Perfil no coincide')
  with patch.object(op,'grants',side_effect=verificar):op.ampliar_series(lambda sql:calls.append(sql))
  self.assertEqual(len(calls),1)
  self.assertIn('`ims_nat_hallazgo`',calls[0]);self.assertNotIn('`ims_nat_serie`',calls[0]);self.assertNotIn('UPDATE',calls[0])
