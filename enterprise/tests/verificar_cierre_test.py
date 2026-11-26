import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'deploy'))
import verificar_cierre as cierre


class CierreTests(unittest.TestCase):
    def test_tamano_completo_usa_config_privada_por_stdin_y_publica_solo_mediciones(self):
        llamadas = []
        def run(args, **kwargs):
            llamadas.append((args, kwargs))
            return SimpleNamespace(returncode=0, stdout=json.dumps({'ok': True, 'datosBytes': 123,
                'indicesBytes': 45, 'tablas': 8, 'medicion': 'TAMANO_ASIGNADO_DATOS_E_INDICES_MYSQL',
                'baseDeDatosModificada': False, 'privado': 'NO_PUBLICAR'}))
        with patch.object(cierre, 'configuracion', return_value={'MYSQL_PASSWORD': 'CLAVE_SINTETICA'}), patch.object(cierre.subprocess, 'run', side_effect=run):
            r = cierre.medir_base(Path('/tmp/codigo'), Path('/tmp/datos'))
        self.assertEqual(r['datosBytes'], 123)
        self.assertNotIn('NO_PUBLICAR', json.dumps(r))
        self.assertNotIn('CLAVE_SINTETICA', json.dumps(llamadas[0][0]))
        self.assertEqual(json.loads(llamadas[0][1]['input'])['config']['MYSQL_PASSWORD'], 'CLAVE_SINTETICA')

    def test_consumo_distingue_memoria_medida_limite_y_muestra_cpu(self):
        a = {'CPUUsageNSec': '1000000000'}
        b = {'CPUUsageNSec': '1250000000', 'MemoryCurrent': '100000000', 'MemoryPeak': '120000000',
             'MemoryHigh': '402653184', 'MemoryMax': '536870912', 'ActiveState': 'active',
             'SubState': 'running', 'CPUQuotaPerSecUSec': '500ms', 'TasksCurrent': '9'}
        r = cierre.consumo(a, b, 1)
        self.assertEqual(r['memoriaActualBytes'], 100000000)
        self.assertEqual(r['limiteMemoriaBytes'], 536870912)
        self.assertEqual(r['cpuPorcentajeUnNucleoMuestra'], 25)
        self.assertEqual(r['cuotaCPUFraccionNucleo'], .5)
        self.assertTrue(r['servicioActivo'])
        self.assertIsNone(cierre.consumo(b, a, 1)['cpuPorcentajeUnNucleoMuestra'])
        self.assertIsNone(cierre.consumo({}, {'MemoryCurrent': '[not set]', 'MemoryMax': 'infinity'}, 0)['memoriaActualBytes'])

    def test_consulta_solo_propiedades_fijas_sin_reflejar_otras_variables(self):
        llamadas = []
        def ejecutar(args):
            llamadas.append(args)
            return 'MemoryCurrent=123\nEnvironment=NO_PUBLICAR_SECRETO\nActiveState=active\n'
        r = cierre.estado_servicio(ejecutar)
        self.assertEqual(r, {'MemoryCurrent': '123', 'ActiveState': 'active'})
        self.assertNotIn('NO_PUBLICAR_SECRETO', json.dumps(r))
        self.assertEqual(llamadas[0][:3], ['systemctl', 'show', cierre.SERVICIO])
        self.assertNotIn('--property=Environment', llamadas[0])

    def request(self, actor='ACTOR', revision='a'*40, fallo=False):
        llamadas = []
        def req(method, ruta, body=None, headers=None):
            llamadas.append((method, ruta))
            h = {}
            if ruta == '/salud':
                status, r = 200, {'ok': True, 'servicio': 'centro-mando-ims-candidata', 'revision': revision}
            elif method == 'POST' and ruta == '/api/sesion':
                status, r = 200, {'operacionNativa': True, 'soloLectura': False, 'usuario': {'actorId': actor}, 'csrf': 'b'*43}
                h = {'set-cookie': '__Host-ims_cm_session=' + 'c'*43 + '; Secure; HttpOnly; SameSite=Strict; Path=/'}
            elif ruta == '/api/centro/cierre' and headers:
                status, r = (500, {'secreto': 'NO_PUBLICAR'}) if fallo else (200, {'formato': 'ims-cierre-operativo-v1', 'datosInventarioModificados': False, 'fuentesGoogleModificadas': False, 'notificacionesEnviadas': False})
            elif ruta == '/api/sesion/cerrar':
                status, r = 200, {'ok': True}
            else:
                status, r = 401, {'error': 'SIN_SESION'}
            return status, h, json.dumps(r).encode()
        return req, llamadas

    def test_https_verifica_revision_consulta_admin_y_cierra_sesion_sin_capturas(self):
        req, llamadas = self.request()
        r = cierre.consultar_https(req, {'actorId': 'ACTOR', 'correo': 'a@sintetico.invalid', 'contrasena': 'SOLO_SINTETICO'}, 'a'*40)
        self.assertFalse(r['datosInventarioModificados'])
        self.assertEqual(llamadas, [('GET', '/salud'), ('GET', '/api/centro/cierre'), ('POST', '/api/sesion'), ('GET', '/api/centro/cierre'), ('POST', '/api/sesion/cerrar'), ('GET', '/api/sesion')])
        for opts in ({'actor': 'OTRO'}, {'fallo': True}):
            req, llamadas = self.request(**opts)
            with self.assertRaises(Exception) as e:
                cierre.consultar_https(req, {'actorId': 'ACTOR', 'correo': 'a@sintetico.invalid', 'contrasena': 'SOLO_SINTETICO'}, 'a'*40)
            self.assertIn(('POST', '/api/sesion/cerrar'), llamadas)
            self.assertNotIn('NO_PUBLICAR', str(e.exception))
        req, llamadas = self.request(revision='b'*40)
        with self.assertRaises(Exception):
            cierre.consultar_https(req, {}, 'a'*40)
        self.assertEqual(llamadas, [('GET', '/salud')])

    def test_guarda_informes_privados_sin_sobrescribir_y_rechaza_destino_enlazado(self):
        with tempfile.TemporaryDirectory() as tmp:
            datos = Path(tmp)
            a = cierre.guardar_resumen(datos, {'ok': True})
            b = cierre.guardar_resumen(datos, {'ok': False})
            self.assertNotEqual(a, b)
            self.assertEqual(json.loads(a.read_text()), {'ok': True})
            self.assertEqual(a.stat().st_mode & 0o777, 0o600)
            self.assertEqual(a.parent.stat().st_mode & 0o777, 0o700)
        with tempfile.TemporaryDirectory() as tmp:
            datos = Path(tmp)
            destino = datos / 'otro'
            destino.mkdir(mode=0o700)
            (datos / 'cierres').symlink_to(destino, target_is_directory=True)
            with self.assertRaises(Exception):
                cierre.guardar_resumen(datos, {})
            self.assertEqual(list(destino.iterdir()), [])
