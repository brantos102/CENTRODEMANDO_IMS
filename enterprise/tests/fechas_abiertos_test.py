from datetime import date
import sys
import subprocess
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from fechas_abiertos import analizar_fecha,fecha_celda,REGLA_FECHAS

class FechasAbiertosTests(unittest.TestCase):
 def c(self,v,tipo='s',formato='@',zona='America/Guayaquil'):
  return analizar_fecha({'tipo':tipo,'valor':v,'formato':formato},zona)

 def test_dma_literal_del_legado_no_se_interpreta_como_mes_dia(self):
  for texto,esperado in [('12/11/2026','2026-11-12'),('1/2/2026','2026-02-01'),('12/11/2026 17:30','2026-11-12'),('12/11/2026 17:30:59','2026-11-12'),('12/11/2026 17:30:59.123456789','2026-11-12')]:
   with self.subTest(texto=texto):r=self.c(texto);self.assertEqual(r['estado'],'INTERPRETADA');self.assertEqual(r['fecha'],esperado)
  self.assertEqual(self.c('11/12/26 23:59:59',formato='dd/MM/yy HH:mm:ss')['fecha'],'2026-12-11')
  self.assertEqual(self.c('01/01/69')['fecha'],'2069-01-01')
  self.assertEqual(self.c('01/01/99')['fecha'],'2099-01-01')
  self.assertIn('2000-2099',REGLA_FECHAS)

 def test_calendario_y_horas_invalidos_no_se_normalizan_a_otro_dia(self):
  for texto in ('31/02/2026','29/02/2026','00/11/2026','11/00/2026','12/11/2026 24:00:00','12/11/2026 10:60:00','12/11/2026 10:00:60','11/12/1999','01/01/2100'):
   with self.subTest(texto=texto):self.assertEqual(self.c(texto)['estado'],'REQUIERE_REGLA')
  self.assertEqual(self.c('29/02/2024')['fecha'],'2024-02-29')

 def test_iso_con_zona_se_contrasta_en_la_zona_original_sin_doble_desplazamiento(self):
  self.assertEqual(self.c('2026-11-12T02:00:00.000Z',tipo='d')['fecha'],'2026-11-11')
  self.assertEqual(self.c('2026-11-12T02:00:00+00:00')['fecha'],'2026-11-11')
  self.assertEqual(self.c('2026-11-12T23:59:59-05:00')['fecha'],'2026-11-12')
  self.assertEqual(self.c('2026-11-12 00:00:00')['fecha'],'2026-11-12')
  self.assertEqual(self.c('2026-11-12')['fecha'],'2026-11-12')
  self.assertEqual(self.c('2026-11-12T02:00:00Z',tipo='d',zona=None)['estado'],'REQUIERE_REGLA')
  self.assertEqual(self.c('2026-11-12',tipo='d')['motivo'],'FECHA_TIPADA_SIN_ZONA')
  for zona in ('America/Guayaquil','Etc/GMT+5','GMT-5','GMT-05:00','UTC-05:00'):
   self.assertEqual(self.c('2026-11-12T02:00:00.000Z',tipo='d',zona=zona)['fecha'],'2026-11-11')
  self.assertEqual(self.c('2026-11-11T23:00:00Z',tipo='d',zona='GMT+05:30')['fecha'],'2026-11-12')
  for zona in ('GMT-25','GMT+14:30','ZONA_INEXISTENTE'):
   self.assertEqual(self.c('2026-11-12T02:00:00Z',tipo='d',zona=zona)['estado'],'REQUIERE_REGLA')

 def test_serial_sheets_exige_formato_fecha_y_no_redondea_fraccion_al_dia_siguiente(self):
  serial=(date(2026,11,12)-date(1899,12,30)).days
  for fmt in ('dd/MM/yyyy HH:mm:ss','dd/mm/yy','yyyy-MM-dd','dd"/"mm"/"yyyy','mm/dd/yyyy'):
   self.assertEqual(self.c(str(serial)+'.999999999',tipo='n',formato=fmt)['fecha'],'2026-11-12')
  for fmt in ('General','0.00','0','@'):
   self.assertEqual(self.c(str(serial),tipo='n',formato=fmt)['estado'],'REQUIERE_REGLA')
  for v in ('NaN','Infinity','1e99','-1','0'):
   self.assertEqual(self.c(v,tipo='n',formato='dd/mm/yyyy')['estado'],'REQUIERE_REGLA')

 def test_vacio_y_formato_desconocido_son_casos_distintos_sin_divulgar_el_valor(self):
  for valor in (None,'',' '):self.assertEqual(self.c(valor)['estado'],'VACIA')
  self.assertEqual(self.c('12/11/2026',formato='mm/dd/yyyy')['motivo'],'FORMATO_FECHA_CONTRADICTORIO')
  valor='NO_PUBLICAR_FECHA_PRIVADA';r=self.c(valor);self.assertEqual(r['estado'],'REQUIERE_REGLA');self.assertNotIn(valor,str(r))
  self.assertEqual(self.c('true',tipo='b')['estado'],'REQUIERE_REGLA')

 def test_fecha_tipada_con_zona_ausente_o_no_disponible_conserva_dia_visible_de_sheets(self):
  for zona in (None,'','ZONA_INEXISTENTE'):
   c={'tipo':'d','valor':'2026-11-12T02:30:45.000Z','visible':'11/11/26 21:30:45','formato':'dd/MM/yy HH:mm:ss'}
   r=analizar_fecha(c,zona);self.assertEqual(r['fecha'],'2026-11-11');self.assertEqual(r['origen_dia'],'DIA_VISIBLE_DE_SHEETS');self.assertEqual(r['estado'],'INTERPRETADA');self.assertIn(r['zona_fuente_estado'],('AUSENTE','NO_DISPONIBLE'))
  c={'tipo':'d','valor':'2026-11-13T02:30:45.000Z','visible':'11/12/2026 21:30:45','formato':'M/d/yyyy h:mm:ss'}
  self.assertEqual(analizar_fecha(c,None)['fecha'],'2026-11-12')
  c.update(visible='2026-11-12 21:30:45',formato='yyyy-MM-dd HH:mm:ss')
  self.assertEqual(analizar_fecha(c,None)['fecha'],'2026-11-12')

 def test_dia_visible_exige_formato_explicito_coherencia_con_utc_y_no_ignora_una_zona_contradictoria(self):
  base={'tipo':'d','valor':'2026-11-12T02:30:45.000Z','visible':'11/11/26 21:30:45','formato':'dd/MM/yy HH:mm:ss'}
  for patch in ({'formato':'@'},{'visible':'FECHA_PRIVADA_DESCONOCIDA'},{'visible':'11/10/26 21:30:45'},{'visible':'31/02/26 21:30:45'}):
   r=analizar_fecha({**base,**patch},None);self.assertEqual(r['estado'],'REQUIERE_REGLA');self.assertNotIn('FECHA_PRIVADA_DESCONOCIDA',str(r))
  r=analizar_fecha(base,'UTC');self.assertEqual(r['motivo'],'DIA_VISIBLE_DIFIERE_DE_ZONA')
  r=analizar_fecha({**base,'visible':'11/10/26 21:30:45'},'GMT-5');self.assertEqual(r['motivo'],'VISIBLE_INCOMPATIBLE_CON_INSTANTE')
  r=analizar_fecha({**base,'visible':''},None);self.assertEqual(r['motivo'],'ZONA_AUSENTE_VISIBLE_NO_INTERPRETABLE')

 def test_precision_del_visible_respeta_limites_de_zona_y_cambio_de_dia_sin_redondeo(self):
  c={'tipo':'d','valor':'2026-11-12T14:00:59.999Z','visible':'12/11/2026 00:00','formato':'dd/MM/yyyy HH:mm'}
  self.assertEqual(analizar_fecha(c,None)['fecha'],'2026-11-12')
  c.update(visible='11/11/2026',formato='dd/MM/yyyy')
  self.assertEqual(analizar_fecha(c,None)['estado'],'REQUIERE_REGLA')
  c.update(valor='2027-01-01T01:00:00.000Z',visible='31/12/26',formato='dd/MM/yy')
  self.assertEqual(analizar_fecha(c,None)['fecha'],'2026-12-31')

 def test_python_sin_base_iana_ni_paquetes_de_sitio_recupera_el_dia_desde_el_visible(self):
  script="""
import sys
from zoneinfo import reset_tzpath,ZoneInfo
reset_tzpath(())
ZoneInfo.clear_cache()
sys.path.insert(0,sys.argv[1])
from fechas_abiertos import analizar_fecha
c={'tipo':'d','valor':'2026-11-12T02:30:00.000Z','visible':'11/11/26 21:30:00','formato':'dd/MM/yy HH:mm:ss'}
r=analizar_fecha(c,'America/Guayaquil')
assert r['fecha']=='2026-11-11' and r['zona_fuente_estado']=='NO_DISPONIBLE' and r['origen_dia']=='DIA_VISIBLE_DE_SHEETS',r
print('OK_SIN_TZDATA')
"""
  r=subprocess.run([sys.executable,'-S','-c',script,str(Path(__file__).resolve().parents[1]/'tools')],capture_output=True,text=True,check=True)
  self.assertEqual(r.stdout.strip(),'OK_SIN_TZDATA')
