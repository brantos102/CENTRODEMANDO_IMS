from datetime import date
import sys
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
  for fmt in ('dd/MM/yyyy HH:mm:ss','dd/mm/yy','yyyy-MM-dd','dd"/"mm"/"yyyy'):
   self.assertEqual(self.c(str(serial)+'.999999999',tipo='n',formato=fmt)['fecha'],'2026-11-12')
  for fmt in ('General','0.00','0','@','mm/dd/yyyy'):
   self.assertEqual(self.c(str(serial),tipo='n',formato=fmt)['estado'],'REQUIERE_REGLA')
  for v in ('NaN','Infinity','1e99','-1','0'):
   self.assertEqual(self.c(v,tipo='n',formato='dd/mm/yyyy')['estado'],'REQUIERE_REGLA')

 def test_vacio_y_formato_desconocido_son_casos_distintos_sin_divulgar_el_valor(self):
  for valor in (None,'',' '):self.assertEqual(self.c(valor)['estado'],'VACIA')
  self.assertEqual(self.c('12/11/2026',formato='mm/dd/yyyy')['motivo'],'FORMATO_FECHA_CONTRADICTORIO')
  valor='NO_PUBLICAR_FECHA_PRIVADA';r=self.c(valor);self.assertEqual(r['estado'],'REQUIERE_REGLA');self.assertNotIn(valor,str(r))
  self.assertEqual(self.c('true',tipo='b')['estado'],'REQUIERE_REGLA')
