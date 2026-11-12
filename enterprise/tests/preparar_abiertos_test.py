import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

BASE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(BASE/'tools'))
from preparar_traslado_abiertos import preparar,cantidad,identificador


class PrepararAbiertosTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  code="""
import{simular,ABIERTO,recuperacionDePrueba}from'./tests/fixtures/corte-abiertos.mjs';
const f=simular({ancho:true}),master='1Cq2AqRVAZJYmj_zs_zg8C63FPrgRBtJHaNcHWXygaPk';
const cab=['FECHA INICIO','FECHA FINAL','ID','N DE LINEA','CLIENTE','ABC','SKU','DESCRIPCION','SERIE','LOTE','N DESPACHO','N PARTIDA','CAT LOG','EST MER','POSICION','UNI','DEPOT','CONTEO FISICO','X','Y','Z','CONTEO No. 1','CONTEO No. 2','CONTEO FINAL','AJUSTE','MOTIVO','JUSTIFICACION','OBSERVACION','NUEVA POSICION','OTRO'];
function row(sku,pos,depot,c1,c2=''){const a=Array(30).fill('');a[0]=new Date('2026-11-12T15:00:00Z');a[2]='121126_BELIA';a[3]=1;a[4]='BELIA';a[6]=sku;a[14]=pos;a[16]=depot;a[21]=c1;a[22]=c2;a[24]=-0.125;a[27]='OBSERVACION_PRIVADA_NUNCA_PUBLICAR';return a;}
const nota=Array(30).fill('');nota[27]='SOLO_NOTA_PRIVADA';
f.reemplazarPlanilla(ABIERTO,[cab,row('00001','A',0.1,0),row('00001','B','2,000','',2),row('00002','C','9007199254740993','2.000'),row('00003','D',1,-1),nota]);
const fin=()=>{for(let i=0;i<100;i++)if(f.continuar().extraccion_terminada)return;throw Error('Pendiente');};
f.preparar();fin();const base=f.archivosCorte();f.recuperar();fin();f.cambiarOrigen(ABIERTO);f.cambiarOrigen(master);f.continuar();
console.log(JSON.stringify({caso:{base,actual:f.archivosCorte()},retirado:recuperacionDePrueba(true)}));
"""
  r=subprocess.run(['node','--input-type=module','-e',code],cwd=BASE,capture_output=True,text=True,check=True);datos=json.loads(r.stdout);cls.caso=datos['caso'];cls.retirado=datos['retirado']

 def paquete(self,raiz,archivos,nombre):
  ruta=Path(raiz)/nombre
  with zipfile.ZipFile(ruta,'w',zipfile.ZIP_DEFLATED) as z:
   for f in archivos:z.writestr('IMS_ABIERTOS/'+f['nombre'],f['content'])
  ruta.chmod(0o600);return ruta

 def entradas(self,raiz,caso=None):
  caso=caso or self.caso
  base=self.paquete(raiz,caso['base'],'ims-abiertos-'+'a'*32+'.zip');actual=self.paquete(raiz,caso['actual'],'actual.zip');return base,actual

 def test_preparacion_admite_copia_en_operacion_sin_aprobarla_y_preserva_filas_notas_y_ceros(self):
  with tempfile.TemporaryDirectory() as t:
   base,actual=self.entradas(t);antes={p.name:p.read_bytes() for p in [base,actual]};out=Path(t)/'salida';r=preparar(actual,out,t)
   self.assertTrue(r['preparacion_de_copia_completada']);self.assertTrue(r['requiere_delta_final']);self.assertFalse(r['aprobado_para_importar']);self.assertFalse(r['datos_importados']);self.assertFalse(r['base_de_datos_modificada']);self.assertEqual(r['validacion_captura']['fuentes_revision'],2);self.assertEqual(r['seleccion_actual']['lineas_candidatas'],6)
   filas=[json.loads(s) for s in (out/'lineas_candidatas_NO_IMPORTAR.jsonl').read_text().splitlines()];propias=[f for f in filas if f['codigo_operativo_original']=='121126_BELIA'];self.assertEqual(len(propias),4);self.assertEqual(len(set(f['referencia_copia'] for f in propias)),4);self.assertEqual([f['sku_propuesto'] for f in propias[:2]],['00001','00001'])
   self.assertEqual(propias[0]['cantidades']['c1']['valor_decimal'],'0.000000000');self.assertEqual(propias[1]['cantidades']['c1']['estado'],'VACIO');self.assertIn('CAPTURA_C2_SIN_C1',propias[1]['observaciones_preparacion']);self.assertEqual(propias[2]['cantidades']['depot']['valor_decimal'],'9007199254740993.000000000');self.assertEqual(propias[2]['cantidades']['c1']['estado'],'REQUIERE_REGLA_FORMATO');self.assertIn('C1_NEGATIVO',propias[3]['observaciones_preparacion']);self.assertEqual(propias[0]['cantidades']['ajuste']['valor_decimal'],'-0.125000000')
   self.assertTrue(all(not f['aprobado_para_importar'] for f in filas));self.assertIn('SOLO_NOTA_PRIVADA',(out/'filas_auxiliares_NO_IMPORTAR.jsonl').read_text());self.assertEqual(propias[0]['fila_original']['celdas'][0]['tipo'],'d');self.assertEqual(propias[0]['origen']['zona_horaria'],'America/Guayaquil')
   for p in [base,actual]:self.assertEqual(p.read_bytes(),antes[p.name])
   self.assertEqual(out.stat().st_mode&0o777,0o700)
   for p in out.iterdir():self.assertEqual(p.stat().st_mode&0o777,0o600)
   privado=json.loads((out/'preparacion_NO_IMPORTAR.json').read_text())
   for nombre,huella in privado['archivos_sha256'].items():self.assertEqual(hashlib.sha256((out/nombre).read_bytes()).hexdigest(),huella)
   publico=json.dumps(r)
   for secreto in ['BELIA','121126_BELIA','OBSERVACION_PRIVADA_NUNCA_PUBLICAR','SOLO_NOTA_PRIVADA','ARCHIVO_ABIERTO_SINTETICO_00001']:self.assertNotIn(secreto,publico)

 def test_archivo_que_paso_a_entregado_se_prepara_aparte_sin_sumarlo_a_los_abiertos(self):
  with tempfile.TemporaryDirectory() as t:
   _,actual=self.entradas(t,self.retirado);out=Path(t)/'salida';r=preparar(actual,out,t)
   self.assertEqual(r['seleccion_actual']['inventarios'],2);self.assertEqual(r['seleccion_actual']['lineas_candidatas'],2);self.assertEqual(r['fuera_seleccion_conservado']['inventarios'],1);self.assertEqual(r['fuera_seleccion_conservado']['lineas_candidatas'],1)
   filas=[json.loads(s) for s in (out/'lineas_candidatas_NO_IMPORTAR.jsonl').read_text().splitlines()];retiradas=[f for f in filas if f['ambito']=='FUERA_SELECCION_CONSERVADO'];self.assertEqual(len(retiradas),1);self.assertEqual(retiradas[0]['estado_captura'],'REVISION');self.assertFalse(retiradas[0]['aprobado_para_importar'])

 def test_lanzador_prepara_el_zip_existente_con_git_y_permisos_privados_sin_cambiar_capturas(self):
  with tempfile.TemporaryDirectory() as t:
   raiz=Path(t);repo=raiz/'codigo';datos=raiz/'datos';entrada=datos/'entrada';repo.mkdir();entrada.mkdir(parents=True);datos.chmod(0o700);entrada.chmod(0o700);tool=repo/'enterprise/tools';tool.mkdir(parents=True)
   for nombre in ['validar_corte_abiertos.py','preparar_traslado_abiertos.py']:(tool/nombre).write_bytes((BASE/'tools'/nombre).read_bytes())
   (repo/'.gitignore').write_text('__pycache__/\n')
   def git(*args):return subprocess.run(['git','-C',str(repo),*args],capture_output=True,text=True,check=True).stdout.strip()
   git('init','--quiet');git('config','user.name','Pruebas');git('config','user.email','pruebas@sintetico.invalid');git('add','.');git('commit','--quiet','-m','Fixture');revision=git('rev-parse','HEAD');(repo/'.git/FETCH_HEAD').write_text(revision+'\t\tfixture\n')
   self.paquete(entrada,self.caso['base'],'ims-abiertos-'+'a'*32+'.zip');actual=self.paquete(entrada,self.caso['actual'],'ims-abiertos-'+'b'*32+'.zip');antes=actual.read_bytes();fake=raiz/'bin';fake.mkdir()
   for nombre,valor in [('hostname','apps'),('id','enicolalde')]:
    cmd=fake/nombre;cmd.write_text('#!/bin/sh\nprintf "'+valor+'\\n"\n');cmd.chmod(0o700)
   script=(BASE/'deploy/revalidar_abiertos.sh').read_text().replace('/home/enicolalde/bryan/centro_mando_ims_datos',str(datos)).replace('/home/enicolalde/bryan/centro_mando_ims',str(repo))
   r=subprocess.run(['bash','-s','--',revision,str(actual),'--preparar'],input=script,text=True,capture_output=True,env={**os.environ,'PATH':str(fake)+os.pathsep+os.environ['PATH']})
   self.assertEqual(r.returncode,0,r.stderr);informes=list(datos.glob('PREPARACION_ABIERTOS_*/resumen_preparacion_abiertos_para_compartir.json'));self.assertEqual(len(informes),1);d=json.loads(informes[0].read_text());self.assertTrue(d['ok']);self.assertFalse(d['datos_importados']);self.assertEqual(d['seleccion_actual']['lineas_candidatas'],6);self.assertEqual(informes[0].stat().st_mode&0o777,0o600);self.assertEqual(actual.read_bytes(),antes);self.assertEqual(git('rev-parse','HEAD'),revision);self.assertEqual(git('status','--porcelain'),'');self.assertNotIn('OBSERVACION_PRIVADA_NUNCA_PUBLICAR',r.stdout)

 def test_cantidades_no_adivinan_miles_redondean_o_convierten_ausencia_en_cero(self):
  def c(tipo,valor):return cantidad({'tipo':tipo,'valor':valor})
  self.assertEqual(c('z',None)['estado'],'VACIO');self.assertEqual(c('n','0')['valor_decimal'],'0.000000000');self.assertEqual(c('n','1.25')['valor_decimal'],'1.250000000');self.assertEqual(c('n','2e3')['valor_decimal'],'2000.000000000');self.assertEqual(c('n','999999999999999999999.999999999')['valor_decimal'],'999999999999999999999.999999999')
  for v in ['2,000','2.000','1.25','2e3']:self.assertEqual(c('s',v)['estado'],'REQUIERE_REGLA_FORMATO')
  for v in ['1e21','0.0000000001','1.2345678912']:self.assertEqual(c('n',v)['estado'],'FUERA_PRECISION')
  self.assertEqual(c('b','false')['estado'],'TIPO_REQUIERE_REVISION');self.assertEqual(c('n','-0')['valor_decimal'],'0.000000000');self.assertEqual(identificador({'tipo':'n','valor':'1','visible':'00001'}),'00001')

 def test_archivo_alterado_pendiente_o_salida_existente_no_producen_preparacion_aprobada(self):
  for modo in ('alterado','pendiente','salida'):
   with self.subTest(modo=modo),tempfile.TemporaryDirectory() as t:
    caso=copy.deepcopy(self.caso)
    if modo=='alterado':next(f for f in caso['actual'] if f['nombre'].startswith('fuente_'))['content']+=' '
    if modo=='pendiente':
     f=next(f for f in caso['actual'] if f['nombre']=='plan_abiertos_privado.json');p=json.loads(f['content']);p['fuentes'][0]['estado']='PENDIENTE';f['content']=json.dumps(p,ensure_ascii=False,separators=(',',':'))
    _,actual=self.entradas(t,caso);out=Path(t)/'salida'
    if modo=='salida':out.mkdir();(out/'conservar.txt').write_text('EXISTENTE')
    with self.assertRaises(ValueError):preparar(actual,out,t)
    if modo=='salida':self.assertEqual((out/'conservar.txt').read_text(),'EXISTENTE')
    else:self.assertFalse(out.exists())
