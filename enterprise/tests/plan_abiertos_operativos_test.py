import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import uuid

BASE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(BASE/'tools'))
import preparar_abiertos_test as fixture
from preparar_traslado_abiertos import preparar, cantidad
from planificar_abiertos_operativos import planificar, proyectar_linea, fecha_celda, estado_panel, id_estable, resolver_reglas, REGLAS_CONFIRMADAS

class PlanAbiertosOperativosTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  fixture.PrepararAbiertosTests.setUpClass();cls.f=fixture.PrepararAbiertosTests()

 def paquete(self,t,retirado=False):
  _,z=self.f.entradas(t,self.f.retirado if retirado else None);p=Path(t)/'preparacion';preparar(z,p,t)
  m=json.loads((p/'preparacion_NO_IMPORTAR.json').read_bytes());r={'formato':'ims-abiertos-contexto-sql-v1','copia_id':hashlib.sha256((p/'preparacion_NO_IMPORTAR.json').read_bytes()).hexdigest(),'corte_id':m['corte_id'],'integridad_sql_verificada':True,'clientes':[{'id':str(uuid.uuid4()),'nombre':'BELIA'}],'existentes':[],'productos':len((p/'lineas_candidatas_NO_IMPORTAR.jsonl').read_text().splitlines()),'auxiliares':len((p/'filas_auxiliares_NO_IMPORTAR.jsonl').read_text().splitlines())}
  return p,r

 def filas(self,p):return [json.loads(s) for s in (p/'lineas_candidatas_NO_IMPORTAR.jsonl').read_text().splitlines()]
 def esquema(self,p,row):return next(s for s in json.loads((p/'esquemas_NO_COMPARTIR.json').read_bytes()) if s['origen_drive']==row['origen']['origen_drive'] and s['hoja_id']==row['origen']['hoja_id'])
 def resellar(self,p,rows,c):
  (p/'lineas_candidatas_NO_IMPORTAR.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows));m=json.loads((p/'preparacion_NO_IMPORTAR.json').read_text());m['archivos_sha256']['lineas_candidatas_NO_IMPORTAR.jsonl']=hashlib.sha256((p/'lineas_candidatas_NO_IMPORTAR.jsonl').read_bytes()).hexdigest();(p/'preparacion_NO_IMPORTAR.json').write_text(json.dumps(m));c['copia_id']=hashlib.sha256((p/'preparacion_NO_IMPORTAR.json').read_bytes()).hexdigest()
 def test_proyeccion_preserva_cero_ausencia_decimales_ajuste_y_sku_duplicado_sin_rellenar_etapas(self):
  with tempfile.TemporaryDirectory() as t:
   p,c=self.paquete(t);rows=[r for r in self.filas(p) if r['codigo_operativo_original']=='121126_BELIA'];a=proyectar_linea(rows[0],self.esquema(p,rows[0]),1);b=proyectar_linea(rows[1],self.esquema(p,rows[1]),2)
   self.assertEqual(a['sku'],b['sku']);self.assertNotEqual(a['linea_id'],b['linea_id']);self.assertEqual(a['conteo_1'],'0.000000000');self.assertEqual(a['depot'],'0.100000000');self.assertEqual(a['ajuste'],'-0.125000000');self.assertIsNone(b['conteo_1']);self.assertEqual(b['conteo_2'],'2.000000000');self.assertIn('CAPTURA_C2_SIN_C1',b['avisos']);self.assertIsNone(b['depot']);self.assertIn('DEPOT_REQUIERE_REGLA_FORMATO',b['bloqueos']);self.assertFalse(a['aprobado_para_importar'])
   enorme=proyectar_linea(rows[2],self.esquema(p,rows[2]),3);self.assertEqual(enorme['depot'],'9007199254740993.000000000');self.assertIsNone(enorme['conteo_1']);self.assertIn('C1_REQUIERE_REGLA_FORMATO',enorme['bloqueos'])

 def test_fechas_usan_zona_original_y_no_nomenclatura_o_texto_ambiguo(self):
  self.assertEqual(fecha_celda({'tipo':'d','valor':'2026-11-12T02:00:00.000Z'},'America/Guayaquil'),'2026-11-11')
  self.assertEqual(fecha_celda({'tipo':'s','valor':'2026-11-12'},None),'2026-11-12')
  self.assertEqual(fecha_celda({'tipo':'s','valor':'12/11/2026'},'America/Guayaquil'),'2026-11-12')
  for texto in ('121126_BELIA','2026-02-30','11/31/2026','12-11-26'):
   with self.assertRaises(ValueError):fecha_celda({'tipo':'s','valor':texto},'America/Guayaquil')
  self.assertIsNone(estado_panel('NO ENTREGADO'));self.assertIsNone(estado_panel('PENDIENTE'));self.assertEqual(estado_panel('En validación'),'EN_VALIDACION')

 def test_archivo_estructuralmente_valido_se_proyecta_completo_aunque_siga_pendiente_el_delta(self):
  with tempfile.TemporaryDirectory() as t:
   p,c=self.paquete(t);rows=self.filas(p)
   for x in rows:
    if x['codigo_operativo_original']!='121126_BELIA':continue
    next(v for v in x['fila_original']['celdas'] if v['columna']==1).update(tipo='s',valor='12/11/26 17:30:00')
    next(v for v in x['fila_original']['celdas'] if v['columna']==2).update(tipo='s',valor='12/11/2026 18:30:00')
    for k,col in [('depot',17),('c1',22)]:
     cell=next(v for v in x['fila_original']['celdas'] if v['columna']==col)
     if cell['tipo']=='s' or cell['valor'] and cell['valor'].startswith('-'):cell.update(tipo='n',valor='2')
     x['cantidades'][k]=cantidad(cell)
   self.resellar(p,rows,c);r=planificar(p,c,Path(t)/'plan',t);f=next(f for f in r['fuentes'] if f['productos']==4)
   self.assertTrue(f['sin_bloqueos_estructurales']);self.assertFalse(f['listo_para_activar']);self.assertTrue(f['requiere_delta_final']);self.assertEqual(f['capturas_presentes']['conteo_2'],1);self.assertEqual(f['ceros_contados']['conteo_1'],1)
   self.assertEqual(f['perfiles_fecha']['fecha_inicio'],{'TEXTO_DMA_ANO2_HORA:INTERPRETADA':4});self.assertEqual(f['perfiles_fecha']['fecha_fin'],{'TEXTO_DMA_ANO4_HORA:INTERPRETADA':4})

 def test_plan_real_conserva_todos_los_productos_notas_y_cobertura_del_maestro_sin_sql_o_activacion(self):
  with tempfile.TemporaryDirectory() as t:
   p,c=self.paquete(t);out=Path(t)/'plan';r=planificar(p,c,out,t);self.assertEqual(r['productos'],6);self.assertEqual(r['filas_auxiliares_conservadas'],1);self.assertFalse(r['base_de_datos_modificada']);self.assertFalse(r['listo_para_activar']);self.assertTrue(r['requiere_delta_final']);self.assertEqual(len((out/'lineas_operativas_NO_ACTIVAR.jsonl').read_text().splitlines()),6)
   publico=json.dumps(r)
   for secreto in ('BELIA','121126_BELIA','OBSERVACION_PRIVADA_NUNCA_PUBLICAR','SOLO_NOTA_PRIVADA','ARCHIVO_ABIERTO_SINTETICO_00001'):self.assertNotIn(secreto,publico)
   self.assertTrue(r['maestro_hojas']);self.assertEqual(out.stat().st_mode&0o777,0o700)
   for f in out.iterdir():self.assertEqual(f.stat().st_mode&0o777,0o600)
   self.assertIn('OBSERVACION_PRIVADA_NUNCA_PUBLICAR',(out/'lineas_operativas_NO_ACTIVAR.jsonl').read_text());self.assertTrue((p/'filas_auxiliares_NO_IMPORTAR.jsonl').exists())

 def test_codigos_mezclados_o_vacios_retienen_archivo_entero_sin_ocultar_filas(self):
  for modo in ('mezclados','vacios'):
   with self.subTest(modo=modo),tempfile.TemporaryDirectory() as t:
    p,c=self.paquete(t);rows=self.filas(p);x=next(r for r in rows if r['codigo_operativo_original']=='121126_BELIA');x['codigo_operativo_original']='131126_BELIA' if modo=='mezclados' else None;next(k for k in x['fila_original']['celdas'] if k['columna']==3).update(tipo='s' if modo=='mezclados' else 'z',valor=x['codigo_operativo_original']);self.resellar(p,rows,c)
    r=planificar(p,c,Path(t)/'plan',t);fuente=next(f for f in r['fuentes'] if f['productos']==4);self.assertFalse(fuente['sin_bloqueos_estructurales']);self.assertEqual(r['productos'],6);self.assertIn('ARCHIVO_CON_VARIOS_CODIGOS_REQUIERE_MAPEO' if modo=='mezclados' else 'CODIGO_OPERATIVO_NO_DEFINIDO',fuente['bloqueos'])

 def test_fuera_de_seleccion_permanece_conservado_y_se_detecta_origen_presente(self):
  with tempfile.TemporaryDirectory() as t:
   p,c=self.paquete(t,True);rows=self.filas(p);x=next(r for r in rows if r['ambito']=='FUERA_SELECCION_CONSERVADO');c['existentes']=[{'origen_drive':x['origen']['origen_drive'],'inventario_id':str(uuid.uuid4())}];r=planificar(p,c,Path(t)/'plan',t);fuente=next(f for f in r['fuentes'] if f['ambito']=='FUERA_SELECCION_CONSERVADO');self.assertIn('FUERA_SELECCION_REQUIERE_CONCILIACION',fuente['bloqueos']);self.assertIn('ORIGEN_YA_PRESENTE_REQUIERE_DELTA',fuente['bloqueos']);self.assertEqual(r['productos'],3)

 def test_catalogo_ambiguo_y_contexto_ajeno_se_rechazan_sin_adivinar_identidad(self):
  with tempfile.TemporaryDirectory() as t:
   p,c=self.paquete(t);c['clientes'].append({'id':str(uuid.uuid4()),'nombre':'BELIA'});r=planificar(p,c,Path(t)/'plan',t);self.assertIn('CLIENTE_CATALOGO_AMBIGUO',r['bloqueos'])
   c['copia_id']='0'*64
   with self.assertRaises(ValueError):planificar(p,c,Path(t)/'otro',t)
   self.assertFalse((Path(t)/'otro').exists())

 def test_proyeccion_alterada_cantidad_sku_o_fecha_no_se_aprueba(self):
  with tempfile.TemporaryDirectory() as t:
   p,c=self.paquete(t);x=next(r for r in self.filas(p) if r['codigo_operativo_original']=='121126_BELIA');s=self.esquema(p,x);x['cantidades']['c1']['valor_decimal']='999.000000000';x['sku_propuesto']='CAMBIADO';a=proyectar_linea(x,s,1);self.assertIn('CANTIDAD_PREPARADA_DIFERENTE_C1',a['bloqueos']);self.assertIn('IDENTIFICADOR_PREPARADO_DIFERENTE',a['bloqueos']);self.assertFalse(a['aprobado_para_importar'])
   next(k for k in x['fila_original']['celdas'] if k['columna']==1).update(tipo='z',valor=None);self.assertIn('FECHA_INICIO_NO_DEFINIDA',proyectar_linea(x,s,1)['bloqueos'])

 def test_identidades_no_dependen_del_corte_sku_o_numero_escrito_y_lanzador_no_activa_servicios(self):
  self.assertEqual(id_estable('linea',['origen',1,2]),id_estable('linea',['origen',1,2]));self.assertNotEqual(id_estable('linea',['origen',1,2]),id_estable('linea',['origen',1,3]))
  script=BASE/'deploy/planificar_abiertos_operativos.sh';subprocess.run(['bash','-n',str(script)],check=True)
  for prohibido in ('sudo','systemctl','a2ensite','git checkout','git pull','mysql -e'):
   self.assertNotIn(prohibido,script.read_text())

 def test_regla_confirmada_separa_mismo_codigo_por_fecha_y_no_reune_series_de_conteos_distintos(self):
  with tempfile.TemporaryDirectory() as t:
   p,c=self.paquete(t);rows=self.filas(p);propias=[r for r in rows if r['codigo_operativo_original']=='121126_BELIA']
   for i,x in enumerate(propias):
    next(k for k in x['fila_original']['celdas'] if k['columna']==1).update(tipo='s',valor=('12/11/2026' if i%2==0 else '13/11/2026')+' 17:30:00')
    if i<2:
     next(k for k in x['fila_original']['celdas'] if k['columna']==9).update(tipo='s',valor='SERIE_PRIVADA_NO_PUBLICAR')
     cell=next(k for k in x['fila_original']['celdas'] if k['columna']==17);cell.update(tipo='n',valor='1');x['cantidades']['depot']=cantidad(cell)
   self.resellar(p,rows,c);reglas={'copia_id':c['copia_id'],'separar_codigo_fecha':[{'fila_panel_corte':2,'productos':4,'codigos':1}]}
   out=Path(t)/'plan';r=planificar(p,c,out,t,reglas);f=next(f for f in r['fuentes'] if f['productos']==4)
   self.assertEqual(f['conteos_planificados'],2);self.assertEqual(f['series_repetidas']['grupos'],0);self.assertNotIn('ARCHIVO_CON_VARIAS_FECHAS_INICIO',f['bloqueos'])
   lineas=[json.loads(s) for s in (out/'lineas_operativas_NO_ACTIVAR.jsonl').read_text().splitlines() if json.loads(s)['origen']['origen_drive']==propias[0]['origen']['origen_drive']]
   self.assertEqual(len(lineas),4);self.assertEqual(len({l['inventario_id'] for l in lineas}),2);self.assertEqual(len({l['linea_id'] for l in lineas}),4)
   for inv in {l['inventario_id'] for l in lineas}:self.assertEqual([l['numero'] for l in lineas if l['inventario_id']==inv],[1,2])
   self.assertNotIn('SERIE_PRIVADA_NO_PUBLICAR',json.dumps(r));self.assertFalse(r['inventarios_activados'])

 def test_pendiente_confirmado_conserva_vacios_y_stock_sin_crear_codigo_fecha_o_inventario_nativo(self):
  with tempfile.TemporaryDirectory() as t:
   p,c=self.paquete(t);rows=self.filas(p);propias=[r for r in rows if r['codigo_operativo_original']=='121126_BELIA']
   for x in propias:
    x['codigo_operativo_original']=None
    for col in (1,3,22,23,24):next(k for k in x['fila_original']['celdas'] if k['columna']==col).update(tipo='z',valor=None)
    cell=next(k for k in x['fila_original']['celdas'] if k['columna']==17);cell.update(tipo='n',valor='1')
    for nombre,col in [('depot',17),('c1',22),('c2',23),('c3',24)]:x['cantidades'][nombre]=cantidad(next(k for k in x['fila_original']['celdas'] if k['columna']==col))
   self.resellar(p,rows,c);reglas={'copia_id':c['copia_id'],'pendientes_inicio':[{'fila_panel_corte':2,'productos':4,'codigos':0}]};out=Path(t)/'plan';r=planificar(p,c,out,t,reglas)
   f=next(f for f in r['fuentes'] if f['productos']==4);self.assertTrue(f['pendiente_de_iniciar']);self.assertFalse(f['bloqueos']);self.assertEqual(f['conteos_planificados'],0);self.assertEqual(r['productos_pendientes_de_inicio'],4);self.assertEqual(r['inventarios_pendientes_de_iniciar'],1)
   lineas=[json.loads(s) for s in (out/'lineas_operativas_NO_ACTIVAR.jsonl').read_text().splitlines() if json.loads(s).get('pendiente_de_iniciar')]
   self.assertEqual(len(lineas),4)
   for l in lineas:self.assertIsNone(l['inventario_id']);self.assertIsNone(l['codigo_original']);self.assertIsNone(l['fecha_inicio']);self.assertIsNone(l['conteo_1']);self.assertIsNone(l['conteo_2']);self.assertIsNone(l['conteo_final'])

 def test_reglas_no_se_aplican_a_otra_copia_ni_ocultan_un_cero_contado_en_un_pendiente(self):
  with tempfile.TemporaryDirectory() as t:
   p,c=self.paquete(t)
   with self.assertRaises(ValueError):planificar(p,c,Path(t)/'otro',t,{'copia_id':'0'*64})
   with self.assertRaises(ValueError):planificar(p,c,Path(t)/'otro',t,{'copia_id':c['copia_id'],'separar_codigo_fecha':[{'fila_panel_corte':2,'productos':999,'codigos':1}]})
   rows=self.filas(p);propias=[r for r in rows if r['codigo_operativo_original']=='121126_BELIA']
   for x in propias:
    x['codigo_operativo_original']=None
    for col in (1,3):next(k for k in x['fila_original']['celdas'] if k['columna']==col).update(tipo='z',valor=None)
   self.resellar(p,rows,c)
   with self.assertRaises(ValueError):planificar(p,c,Path(t)/'otro',t,{'copia_id':c['copia_id'],'pendientes_inicio':[{'fila_panel_corte':2,'productos':4,'codigos':0}]})
   self.assertFalse((Path(t)/'otro').exists())

 def test_fecha_desconocida_no_se_diagnostica_como_ausente_y_serie_repetida_localiza_filas_sin_valores(self):
  with tempfile.TemporaryDirectory() as t:
   p,c=self.paquete(t);rows=self.filas(p);propias=[r for r in rows if r['codigo_operativo_original']=='121126_BELIA']
   next(k for k in propias[0]['fila_original']['celdas'] if k['columna']==1).update(tipo='s',valor='FECHA_PRIVADA_NO_PUBLICAR')
   l=proyectar_linea(propias[0],self.esquema(p,propias[0]),1);self.assertIn('FECHA_INICIO_REQUIERE_REGLA',l['bloqueos']);self.assertNotIn('FECHA_INICIO_NO_DEFINIDA',l['bloqueos'])
   for x in propias[:2]:next(k for k in x['fila_original']['celdas'] if k['columna']==9).update(tipo='s',valor='SERIE_PRIVADA_NO_PUBLICAR')
   self.resellar(p,rows,c);r=planificar(p,c,Path(t)/'plan',t);f=next(f for f in r['fuentes'] if f['productos']==4);self.assertEqual(f['series_repetidas']['grupos'],1);self.assertEqual(f['series_repetidas']['lineas'],2);self.assertEqual([v['fila_planilla'] for v in f['series_repetidas']['muestras'][0]['filas']],[2,3]);self.assertNotIn('FECHA_PRIVADA_NO_PUBLICAR',json.dumps(r));self.assertNotIn('SERIE_PRIVADA_NO_PUBLICAR',json.dumps(r))

 def test_decisiones_del_usuario_se_resuelven_en_su_copia_exacta_y_no_en_otro_corte_por_numero_de_fila(self):
  corte=str(uuid.uuid4());a='ORIGEN_SINTETICO_A';b='ORIGEN_SINTETICO_B';fuentes=[('SELECCION_ACTUAL',corte,1,{'id':a,'panel':[{'fila':317}]}),('SELECCION_ACTUAL',corte,2,{'id':b,'panel':[{'fila':334}]})]
  filas={('SELECCION_ACTUAL',corte,a):[{'codigo_operativo_original':'CODIGO_'+str(i%12)} for i in range(44)],('SELECCION_ACTUAL',corte,b):[{'codigo_operativo_original':None} for _ in range(630)]}
  r=resolver_reglas({'copia_id':REGLAS_CONFIRMADAS['copia_id']},fuentes,filas);self.assertEqual(r[('SELECCION_ACTUAL',corte,a)],'separar_codigo_fecha');self.assertEqual(r[('SELECCION_ACTUAL',corte,b)],'pendientes_inicio')
  self.assertEqual(resolver_reglas({'copia_id':'0'*64},fuentes,filas),{})
  filas[('SELECCION_ACTUAL',corte,a)].pop()
  with self.assertRaises(ValueError):resolver_reglas({'copia_id':REGLAS_CONFIRMADAS['copia_id']},fuentes,filas)

 def test_dia_visible_resuelve_proyeccion_sin_zona_y_sin_cambiar_instantes_o_cantidades_originales(self):
  with tempfile.TemporaryDirectory() as t:
   p,c=self.paquete(t);rows=self.filas(p);propias=[r for r in rows if r['codigo_operativo_original']=='121126_BELIA']
   for x in propias:
    x['origen']['zona_horaria']=None
    for col in (1,2):next(k for k in x['fila_original']['celdas'] if k['columna']==col).update(tipo='d',valor='2026-11-12T02:30:00.000Z',visible='11/11/26 21:30:00',formato='dd/MM/yy HH:mm:ss')
   self.resellar(p,rows,c);out=Path(t)/'plan';r=planificar(p,c,out,t);f=next(f for f in r['fuentes'] if f['productos']==4)
   self.assertNotIn('FECHA_INICIO_REQUIERE_REGLA',f['bloqueos']);self.assertNotIn('FECHA_FIN_REQUIERE_REGLA',f['bloqueos']);self.assertEqual(f['origen_dia_fecha']['fecha_inicio'],{'DIA_VISIBLE_DE_SHEETS':4});self.assertEqual(f['zonas_fuente_fecha'],{'AUSENTE':8})
   lineas=[json.loads(s) for s in (out/'lineas_operativas_NO_ACTIVAR.jsonl').read_text().splitlines() if json.loads(s)['origen']['origen_drive']==propias[0]['origen']['origen_drive']];self.assertEqual(len(lineas),4);self.assertTrue(all(l['fecha_inicio']=='2026-11-11' for l in lineas));self.assertEqual(lineas[0]['conteo_1'],'0.000000000')
   self.assertTrue(all(next(k for k in x['fila_original']['celdas'] if k['columna']==1)['valor']=='2026-11-12T02:30:00.000Z' for x in propias))

 def test_serie_teorica_repetida_es_aviso_conserva_ambas_lineas_y_no_bloquea_importacion_del_stock(self):
  with tempfile.TemporaryDirectory() as t:
   p,c=self.paquete(t);rows=self.filas(p);propias=[r for r in rows if r['codigo_operativo_original']=='121126_BELIA']
   for i,x in enumerate(propias):
    cell=next(k for k in x['fila_original']['celdas'] if k['columna']==17);cell.update(tipo='n',valor='1');x['cantidades']['depot']=cantidad(cell)
    cell=next(k for k in x['fila_original']['celdas'] if k['columna']==22);cell.update(tipo='n',valor='0');x['cantidades']['c1']=cantidad(cell)
    if i<2:next(k for k in x['fila_original']['celdas'] if k['columna']==9).update(tipo='s',valor='sn-repetida' if i==0 else 'SN-REPETIDA')
   self.resellar(p,rows,c);out=Path(t)/'plan';r=planificar(p,c,out,t);f=next(f for f in r['fuentes'] if f['productos']==4)
   self.assertTrue(f['sin_bloqueos_estructurales']);self.assertFalse(f['series_repetidas']['bloquea_importacion_stock']);self.assertEqual(f['series_repetidas']['grupos'],1);self.assertIn('SERIE_TEORICA_REPETIDA_REQUIERE_SELECCION_DE_LINEA',f['avisos']);self.assertEqual(f['productos'],4);self.assertFalse(f['listo_para_activar'])

 def test_un_codigo_con_fechas_distintas_usa_cabecera_a2_sin_reescribir_fechas_de_lineas_o_tomar_minimo(self):
  with tempfile.TemporaryDirectory() as t:
   p,c=self.paquete(t);rows=self.filas(p);propias=[r for r in rows if r['codigo_operativo_original']=='121126_BELIA']
   next(k for k in propias[1]['fila_original']['celdas'] if k['columna']==1).update(tipo='s',valor='11/11/2026 10:00:00')
   self.resellar(p,rows,c);out=Path(t)/'plan';r=planificar(p,c,out,t);f=next(f for f in r['fuentes'] if f['productos']==4)
   self.assertNotIn('ARCHIVO_CON_VARIAS_FECHAS_INICIO',f['bloqueos']);self.assertEqual(f['criterio_inicio'],'CABECERA_A2_LEGADO');self.assertEqual(f['conteos_planificados'],1);self.assertEqual(f['avisos']['FECHAS_POR_LINEA_DISTINTAS_DE_CABECERA_CONSERVADAS'],1)
   plan=json.loads((out/'plan_operativo_NO_ACTIVAR.json').read_bytes());inv=next(i for i in plan['inventarios'] if i['codigo_operativo']=='121126_BELIA');self.assertEqual(inv['fecha_inicio'],'2026-11-12')
   lineas=[json.loads(s) for s in (out/'lineas_operativas_NO_ACTIVAR.jsonl').read_text().splitlines() if json.loads(s)['inventario_id']==inv['inventario_id']];self.assertEqual(len(lineas),4);self.assertEqual(lineas[1]['fecha_inicio'],'2026-11-11');self.assertIsNone(lineas[1]['conteo_1']);self.assertEqual(lineas[0]['conteo_1'],'0.000000000')

 def test_inicio_a2_no_elige_fecha_si_su_codigo_o_valor_no_concuerda(self):
  with tempfile.TemporaryDirectory() as t:
   p,c=self.paquete(t);rows=self.filas(p);propias=[r for r in rows if r['codigo_operativo_original']=='121126_BELIA']
   next(k for k in propias[1]['fila_original']['celdas'] if k['columna']==1).update(tipo='s',valor='11/11/2026')
   propias[0]['codigo_operativo_original']=None;next(k for k in propias[0]['fila_original']['celdas'] if k['columna']==3).update(tipo='z',valor=None)
   self.resellar(p,rows,c);r=planificar(p,c,Path(t)/'plan',t);f=next(f for f in r['fuentes'] if f['productos']==4);self.assertIn('ARCHIVO_CON_VARIAS_FECHAS_INICIO',f['bloqueos']);self.assertNotEqual(f['criterio_inicio'],'CABECERA_A2_LEGADO')
