"""TLS local con certificado sintético: respuesta real mayor que el límite antiguo."""
import http.server
import json
from pathlib import Path
import ssl
import subprocess
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / 'deploy'))
import publicar_piloto_https as pub
sys.path.pop(0)


class TransporteCentroTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        raiz = Path(cls.temp.name)
        cls.certificado, clave = raiz / 'certificado.pem', raiz / 'clave.pem'
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
                        '-keyout', str(clave), '-out', str(cls.certificado), '-days', '1',
                        '-subj', '/CN=' + pub.HOST, '-addext', 'subjectAltName=DNS:' + pub.HOST],
                       capture_output=True, check=True, timeout=15)
        clave.chmod(0o600)
        cls.cuerpo = json.dumps({'eventos': [{'titulo': 'Tarea sintética ' + str(i),
                                             'observacion': 'detalle ' * 100} for i in range(411)]}).encode()
        cuerpo = cls.cuerpo

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(cuerpo)))
                self.end_headers()
                try:
                    self.wfile.write(cuerpo)
                except (BrokenPipeError, ConnectionResetError, ssl.SSLEOFError):
                    # El cliente cierra al rechazar una respuesta demasiado grande.
                    pass

            def log_message(self, *args):
                pass

        cls.servidor = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        contexto = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        contexto.load_cert_chain(cls.certificado, clave)
        cls.servidor.socket = contexto.wrap_socket(cls.servidor.socket, server_side=True)
        cls.hilo = threading.Thread(target=cls.servidor.serve_forever, daemon=True)
        cls.hilo.start()

    @classmethod
    def tearDownClass(cls):
        cls.servidor.shutdown()
        cls.servidor.server_close()
        cls.hilo.join(timeout=3)
        cls.temp.cleanup()

    def test_panel_completo_supera_256_kb_y_se_verifica_con_tls(self):
        t = pub.TransporteTLS(self.certificado, self.servidor.server_port,
                             tiempo_espera=30, limite_respuesta=8 * 1024 * 1024)
        status, _, raw = t('GET', '/api/centro/dashboard')
        self.assertEqual(status, 200)
        self.assertGreater(len(raw), 262144)
        self.assertEqual(len(json.loads(raw)['eventos']), 411)
        self.assertEqual(raw, self.cuerpo)

    def test_limite_anterior_y_un_limite_menor_continuan_rechazando_excesos(self):
        for limite in [262144, 1024]:
            with self.subTest(limite=limite), self.assertRaisesRegex(pub.PublicacionError, 'demasiado grande'):
                pub.TransporteTLS(self.certificado, self.servidor.server_port,
                                 limite_respuesta=limite)('GET', '/api/centro/dashboard')

    def test_limites_invalidos_no_abren_una_conexion(self):
        for opciones in [{'tiempo_espera': 0}, {'tiempo_espera': 61},
                         {'limite_respuesta': 0}, {'limite_respuesta': 8 * 1024 * 1024 + 1}]:
            with self.subTest(opciones=opciones), self.assertRaises(pub.PublicacionError):
                pub.TransporteTLS('/certificado_inexistente', **opciones)
