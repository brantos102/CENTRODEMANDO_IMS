import hashlib
import importlib.util
import json
import os
import stat
import tempfile
import unittest
import zipfile
import warnings
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('paquete', Path(__file__).parents[1] / 'tools/paquete_traslado.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class PaqueteTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / 'fuentes'
        self.source.mkdir()
        payload = {'corte/manifest.json': b'{}', 'corte/fuente.xlsx': b'original binario', 'corte/estilos.xml': b'<styles/>',
                   'corte/hoja_001.jsonl': b'{"fila":1}\n', 'plan/manifest.json': b'{}', 'plan/catalogo.jsonl': b'cliente original\n',
                   'plan/incidencias.jsonl': b'', 'plan/lineas_preparadas.jsonl': '000123,0,2.125,nota humana ñ\n'.encode(),
                   'evidencia/fuente_original.xlsx': b'respaldo original'}
        files = []
        for i, (name, body) in enumerate(payload.items()):
            f = self.source / str(i)
            f.write_bytes(body)
            files.append({'nombre': name, 'ruta_local': str(f), 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()})
        self.payload = payload
        self.snapshot = next(a['sha256'] for a in files if a['nombre'] == 'corte/fuente.xlsx')
        self.plan = hashlib.sha256(b'plan').hexdigest()
        self.manifest = {'version': 1, 'snapshot_id': self.snapshot, 'plan_id': self.plan, 'archivos': files}
        self.lista = self.root / 'lista.json'
        self.lista.write_text(json.dumps(self.manifest))
        self.zip = self.root / 'paquete.zip'
        self.dest = self.root / 'recibido'

    def tearDown(self):
        self.temp.cleanup()

    def recibir(self, archivo=None, sha=None, **kwargs):
        archivo = archivo or self.zip
        return m.recibir(archivo, sha or m.digest(archivo), self.dest,
                         kwargs.get('snapshot', self.snapshot), kwargs.get('plan', self.plan))

    def alterar(self, extra=None, replace=None):
        f = self.root / 'alterado.zip'
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            with zipfile.ZipFile(self.zip) as src, zipfile.ZipFile(f, 'w') as dst:
                for info in src.infolist():
                    dst.writestr(info, replace[1] if replace and info.filename == replace[0] else src.read(info))
                if extra:
                    dst.writestr(*extra)
        return f

    def test_ida_y_vuelta_conserva_bytes_ceros_notas_y_evidencia_sin_rutas_locales(self):
        r = m.empaquetar(self.lista, self.zip)
        self.assertNotIn('cliente original', json.dumps(r))
        with zipfile.ZipFile(self.zip) as z:
            self.assertNotIn('ruta_local', z.read('paquete.json').decode())
        out = self.recibir()
        self.assertFalse(out['datos_importados'])
        self.assertTrue(out['validacion_semantica_pendiente'])
        for name, body in self.payload.items():
            self.assertEqual((self.dest / name).read_bytes(), body)
        if os.name == 'posix':
            self.assertEqual(stat.S_IMODE(self.dest.stat().st_mode), 0o700)
            self.assertEqual(stat.S_IMODE((self.dest / 'corte/fuente.xlsx').stat().st_mode), 0o600)

    def test_hash_corte_o_plan_incorrectos_no_extraen(self):
        m.empaquetar(self.lista, self.zip)
        for args in [{'sha': '0'*64}, {'snapshot': '0'*64}, {'plan': '0'*64}]:
            with self.assertRaises(ValueError):
                self.recibir(**args)
            self.assertFalse(self.dest.exists())

    def test_contenido_alterado_falla_aunque_se_recalcule_hash_del_zip_y_limpia_solo_su_salida(self):
        m.empaquetar(self.lista, self.zip)
        f = self.alterar(replace=('plan/catalogo.jsonl', b'otra cuenta xxxx\n'))
        with self.assertRaises(ValueError):
            self.recibir(f)
        self.assertFalse(self.dest.exists())
        self.assertTrue(self.zip.is_file())
        self.assertTrue(self.source.is_dir())

    def test_rutas_fuera_del_contrato_enlaces_y_duplicados_no_se_extraen(self):
        m.empaquetar(self.lista, self.zip)
        for extra in [('../otro_proyecto/dato.txt', b'no'), ('config/migracion.env', b'no'), ('corte/manifest.json', b'otro')]:
            f = self.alterar(extra=extra)
            with self.assertRaises(ValueError):
                self.recibir(f)
            self.assertFalse(self.dest.exists())
            f.unlink()
        info = zipfile.ZipInfo('corte/hoja_999.jsonl')
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        f = self.alterar(extra=(info, b'/otro_proyecto'))
        with self.assertRaises(ValueError):
            self.recibir(f)
        self.assertFalse(self.dest.exists())

    def test_salidas_existentes_no_se_sobrescriben(self):
        self.zip.write_bytes(b'archivo preexistente')
        with self.assertRaises(ValueError):
            m.empaquetar(self.lista, self.zip)
        self.assertEqual(self.zip.read_bytes(), b'archivo preexistente')
        self.zip.unlink()
        m.empaquetar(self.lista, self.zip)
        self.dest.mkdir()
        (self.dest / 'conservar').write_text('otro dato')
        with self.assertRaises(ValueError):
            self.recibir()
        self.assertEqual((self.dest / 'conservar').read_text(), 'otro dato')

    def test_fuente_cambiada_durante_preparacion_no_deja_paquete_aparentemente_valido(self):
        fuente = Path(self.manifest['archivos'][0]['ruta_local'])
        fuente.write_text('cambio posterior')
        with self.assertRaises(ValueError):
            m.empaquetar(self.lista, self.zip)
        self.assertFalse(self.zip.exists())
        self.assertEqual(fuente.read_text(), 'cambio posterior')

    def test_falta_de_espacio_o_archivo_configurado_ajeno_detienen_la_operacion(self):
        m.empaquetar(self.lista, self.zip)
        with patch.object(m.shutil, 'disk_usage') as disk:
            disk.return_value.free = 0
            with self.assertRaises(ValueError):
                self.recibir()
        self.assertFalse(self.dest.exists())
        self.zip.unlink()
        self.manifest['archivos'][0]['nombre'] = 'config/migracion.env'
        self.lista.write_text(json.dumps(self.manifest))
        with self.assertRaises(ValueError):
            m.empaquetar(self.lista, self.zip)
        self.assertFalse(self.zip.exists())


if __name__ == '__main__':
    unittest.main()
