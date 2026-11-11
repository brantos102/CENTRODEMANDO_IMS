import copy
import hashlib
import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ENTERPRISE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ENTERPRISE/'tools'))
from validar_corte_abiertos import validar_zip


class CorteAbiertosTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  code="import{simular}from'./tests/fixtures/corte-abiertos.mjs';function datos(opts){const f=simular(opts);f.preparar();for(let i=0;i<50;i++){if(f.continuar().extraccion_terminada)break;}return f.files.filter(x=>!x.nombre.startsWith('IMS_ABIERTOS_CONTROL_')).map(x=>({nombre:x.nombre,content:x.content}));}console.log(JSON.stringify({normal:datos({}),enlaces:datos({enlace:'rico'})}));"
  r=subprocess.run(['node','--input-type=module','-e',code],cwd=ENTERPRISE,capture_output=True,text=True,check=True)
  datos=json.loads(r.stdout);cls.archivos=datos['normal'];cls.archivos_enlaces=datos['enlaces']

 def paquete(self,base,archivos=None,extra=None):
  p=Path(base)/'abiertos.zip'
  with zipfile.ZipFile(p,'w',zipfile.ZIP_DEFLATED) as z:
   for f in archivos or self.archivos:z.writestr('IMS_ABIERTOS_PRIVADO/'+f['nombre'],f['content'])
   if extra:
    name,mode=extra;i=zipfile.ZipInfo(name);i.create_system=3;i.external_attr=mode<<16;z.writestr(i,'NO_USAR')
  p.chmod(0o600);return p

 def test_exportador_apps_script_y_zip_tienen_contrato_integro_y_no_declararan_corte_final(self):
  with tempfile.TemporaryDirectory() as t:
   p=self.paquete(t);antes=p.read_bytes();r,priv=validar_zip(p)
   self.assertTrue(r['lista_para_plan']);self.assertEqual(r['inventarios_en_panel'],3);self.assertEqual(r['fuentes_completas'],6);self.assertEqual(r['filas_panel_sin_archivo'],1);self.assertFalse(r['corte_final_aprobado']);self.assertFalse(r['base_de_datos_modificada']);self.assertEqual(p.read_bytes(),antes)
   self.assertNotIn('archivo_zip',r);self.assertEqual(priv['sha256_zip'],hashlib.sha256(antes).hexdigest());self.assertNotIn('NO_EXPORTAR_CLAVE_SINTETICA',antes.decode('latin1'))
   self.assertFalse(r['cantidades_interpretadas']);self.assertEqual(r['estructuras_stock'][0]['campos']['producto'],[1]);self.assertEqual(r['estructuras_stock'][0]['campos']['c1'],[2]);self.assertEqual(r['estructuras_stock'][0]['capturas_presentes']['c1'],3);self.assertEqual(r['estructuras_stock'][0]['capturas_presentes']['c2'],0)

 def test_fragmento_alterado_o_ausente_no_se_valida(self):
  for modo in ('alterado','ausente'):
   with self.subTest(modo=modo),tempfile.TemporaryDirectory() as t:
    files=copy.deepcopy(self.archivos);idx=next(i for i,f in enumerate(files) if f['nombre'].startswith('fuente_'))
    if modo=='alterado':files[idx]['content']+=' '
    else:files.pop(idx)
    with self.assertRaises(ValueError):validar_zip(self.paquete(t,files))

 def test_revision_explica_motivo_y_ubica_panel_sin_exponer_identidad_o_celdas(self):
  for motivo in ('FUENTE_CAMBIO','LECTURA_O_LIMITE','SECRETO_NO_PUBLICAR'):
   with self.subTest(motivo=motivo),tempfile.TemporaryDirectory() as t:
    files=copy.deepcopy(self.archivos);pf=next(f for f in files if f['nombre']=='plan_abiertos_privado.json');p=json.loads(pf['content'])
    fuente=next(f for f in p['fuentes'] if f['tipo']=='INVENTARIO');fuente['estado']='REVISION';fuente['motivo']=motivo;p['panel_cambio']=True
    pf['content']=json.dumps(p,ensure_ascii=False,separators=(',',':'));archivo=self.paquete(t,files);antes=archivo.read_bytes();r,priv=validar_zip(archivo)
    self.assertEqual(r['fuentes_revision'],1);self.assertFalse(r['lista_para_plan']);self.assertTrue(r['panel_cambio']);self.assertFalse(r['datos_importados']);self.assertFalse(r['base_de_datos_modificada']);self.assertEqual(archivo.read_bytes(),antes)
    detalle=r['revision_fuentes'];self.assertEqual(len(detalle),1);self.assertEqual(detalle[0]['tipo'],'INVENTARIO');self.assertEqual(detalle[0]['filas_panel_corte'],[x['fila'] for x in fuente['panel']]);self.assertEqual(detalle[0]['motivo'],motivo if motivo!='SECRETO_NO_PUBLICAR' else 'NO_ESPECIFICADO');self.assertGreater(detalle[0]['filas_guardadas'],0)
    publico=json.dumps(r);self.assertNotIn(fuente['id'],publico);self.assertNotIn('BELIA',publico);self.assertNotIn('SECRETO_NO_PUBLICAR',publico);self.assertNotIn('operador@sintetico.invalid',publico);self.assertEqual(priv['validacion'],r)

 def test_los_enlaces_ricos_del_panel_son_conciliados_tambien_en_servidor(self):
  with tempfile.TemporaryDirectory() as t:
   r,_=validar_zip(self.paquete(t,self.archivos_enlaces));self.assertEqual(r['inventarios_en_panel'],3);self.assertEqual(r['filas_panel_sin_archivo'],1);self.assertTrue(r['lista_para_plan'])

 def test_rutas_escapadas_y_enlaces_no_se_extraen_ni_se_aceptan(self):
  for extra in [('../fuera.json',stat.S_IFREG|0o600),('IMS_ABIERTOS_PRIVADO/enlace',stat.S_IFLNK|0o777)]:
   with self.subTest(extra=extra),tempfile.TemporaryDirectory() as t:
    p=self.paquete(t,extra=extra)
    with self.assertRaises(ValueError):validar_zip(p)
    self.assertEqual(list(Path(t).iterdir()),[p])

 def test_fuente_omitida_del_plan_y_panel_alterado_se_rechazan(self):
  for modo in ('fuente','panel'):
   with self.subTest(modo=modo),tempfile.TemporaryDirectory() as t:
    files=copy.deepcopy(self.archivos);f=next(f for f in files if f['nombre']=='plan_abiertos_privado.json');p=json.loads(f['content'])
    if modo=='fuente':p['fuentes'].pop()
    else:p['panel'][1]['celdas'][0]['valor']='CLIENTE_ALTERADO'
    f['content']=json.dumps(p,ensure_ascii=False,separators=(',',':'))
    with self.assertRaises(ValueError):validar_zip(self.paquete(t,files))

 def test_una_hoja_completa_no_oculta_huecos_o_redaccion_cambiada_entre_fragmentos(self):
  with tempfile.TemporaryDirectory() as t:
   files=copy.deepcopy(self.archivos);pf=next(f for f in files if f['nombre']=='plan_abiertos_privado.json');p=json.loads(pf['content']);fuente=next(f for f in p['fuentes'] if f['partes']);parte=fuente['partes'][0];f=next(f for f in files if f['nombre']==parte['nombre']);d=json.loads(f['content']);d['filas'][0]['fila']+=1;f['content']=json.dumps(d,ensure_ascii=False,separators=(',',':'));parte['bytes']=len(f['content'].encode());parte['sha256']=hashlib.sha256(f['content'].encode()).hexdigest();pf['content']=json.dumps(p,ensure_ascii=False,separators=(',',':'))
   with self.assertRaises(ValueError):validar_zip(self.paquete(t,files))
