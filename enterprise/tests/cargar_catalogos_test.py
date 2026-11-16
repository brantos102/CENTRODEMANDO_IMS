import hashlib
import io
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import zipfile
sys.path.insert(0,str(Path(__file__).parents[1]/'deploy'))
import cargar_catalogos as carga
sys.path.pop(0)
class CatalogosPrivadosTests(unittest.TestCase):
    def zip(self,entries):
        b=io.BytesIO()
        with zipfile.ZipFile(b,'w') as z:
            for nombre,contenido in entries:z.writestr(nombre,contenido)
        b.seek(0)
        return b
    def test_solo_acepta_los_originales_con_huella_no_un_manifiesto_modificado(self):
        contenidos={'POS_ITSANET.csv':b'posiciones sinteticas','RELACION_EAN13_UIO.csv':b'ean sinteticos'}
        hashes={k:{'sha256':hashlib.sha256(v).hexdigest()} for k,v in contenidos.items()}
        with patch.object(carga,'ARCHIVOS',hashes):
            self.assertEqual(carga.comprobar_zip(self.zip(contenidos.items())),contenidos)
            with self.assertRaises(Exception):carga.comprobar_zip(self.zip([('POS_ITSANET.csv',b'alterado'),('RELACION_EAN13_UIO.csv',contenidos['RELACION_EAN13_UIO.csv'])]))
    def test_entradas_fuera_de_carpeta_o_archivos_extra_no_se_extraen(self):
        with self.assertRaises(Exception):carga.comprobar_zip(self.zip([('../POS_ITSANET.csv',b'1'),('RELACION_EAN13_UIO.csv',b'2')]))
        with self.assertRaises(Exception):carga.comprobar_zip(self.zip([('POS_ITSANET.csv',b'1'),('RELACION_EAN13_UIO.csv',b'2'),('ejecutar.sh',b'3')]))
