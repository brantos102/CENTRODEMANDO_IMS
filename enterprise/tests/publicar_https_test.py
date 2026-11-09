import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

DEPLOY = Path(__file__).parents[1] / 'deploy'
sys.path.insert(0, str(DEPLOY))
import apache_piloto_root as root
import publicar_piloto_https as pub
sys.path.remove(str(DEPLOY))


class FakeSistema:
    def __init__(self, path):
        self.path = path
        self.recargas = 0
        self.tests = 0
        self.fallo_config = 0
        self.fallo_reload = False
        self.calls = []

    def root(self, accion, **kwargs):
        self.calls.append((accion, kwargs.get('ruta')))
        r = root.operar({'accion': accion, **kwargs}, self.path)
        pub.exigir(r['ok'], 'No se retiraron archivos modificados.')
        return r

    def foto(self):
        return self.root('fotografia')['configuraciones']

    def pid_apache(self):
        return '123'

    def puertos(self):
        return {'*:443', '*:8443', '*:8444', '127.0.0.1:8080'}

    def configtest(self):
        self.tests += 1
        if self.tests == self.fallo_config:
            raise pub.PublicacionError('Configuración rechazada.')

    def recargar(self):
        self.recargas += 1
        if self.fallo_reload and self.recargas == 1:
            raise pub.PublicacionError('Recarga no confirmada.')


class PublicacionTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.temp.name)
        for name in ('conf-available', 'sites-available', 'conf-enabled', 'sites-enabled'):
            (self.raiz / name).mkdir()
        self.ajeno = self.raiz / 'sites-available/iv-itsanet.conf'
        self.ajeno.write_text('Configuración original intacta')
        (self.raiz / 'sites-enabled/iv-itsanet.conf').symlink_to('../sites-available/iv-itsanet.conf')
        self.s = FakeSistema(self.raiz)
        self.cuerpos = {rel: '# IMS_PUBLICACION=' + 'a'*32 + '\nConfiguración de prueba\n' for rel in root.ARCHIVOS}

    def tearDown(self):
        self.temp.cleanup()

    def test_publica_solo_cuatro_rutas_nuevas_y_conserva_preexistentes(self):
        antes = self.s.foto()
        r = pub.publicar(self.s, self.cuerpos, lambda: {'login_https': True})
        self.assertTrue(r['pid_apache_conservado'])
        self.assertEqual(self.s.recargas, 1)
        self.assertEqual(self.s.foto(), antes)
        self.assertEqual(self.ajeno.read_text(), 'Configuración original intacta')
        self.assertEqual(set(path for accion, path in self.s.calls if accion == 'crear'), set(root.PROPIOS))

    def test_configtest_inicial_fallido_no_crea_archivos_ni_recarga(self):
        self.s.fallo_config = 1
        with self.assertRaises(pub.PublicacionError):
            pub.publicar(self.s, self.cuerpos, lambda: {})
        self.assertEqual(self.s.recargas, 0)
        self.assertFalse(any((self.raiz / rel).exists() for rel in root.PROPIOS))

    def test_config_nueva_invalida_retira_solo_el_piloto_sin_recargar(self):
        self.s.fallo_config = 2
        with self.assertRaisesRegex(pub.PublicacionError, 'verificada'):
            pub.publicar(self.s, self.cuerpos, lambda: {})
        self.assertEqual(self.s.recargas, 0)
        self.assertTrue(all(not os.path.lexists(self.raiz / rel) for rel in root.PROPIOS))
        self.assertEqual(self.ajeno.read_text(), 'Configuración original intacta')

    def test_fallo_reload_o_login_recupera_configuracion_previa_con_recarga_gradual(self):
        for fallo in ('recarga', 'login'):
            with self.subTest(fallo=fallo):
                self.s = FakeSistema(self.raiz)
                self.s.fallo_reload = fallo == 'recarga'
                def probar():
                    raise pub.PublicacionError('Login no confirmado.')
                with self.assertRaisesRegex(pub.PublicacionError, 'verificada'):
                    pub.publicar(self.s, self.cuerpos, probar)
                self.assertEqual(self.s.recargas, 2)
                self.assertTrue(all(not os.path.lexists(self.raiz / rel) for rel in root.PROPIOS))
                self.assertEqual(self.ajeno.read_text(), 'Configuración original intacta')

    def test_ruta_preexistente_o_enlace_colgante_no_se_adoptan(self):
        path = self.raiz / root.ARCHIVOS[0]
        path.symlink_to('no-existe.conf')
        with self.assertRaises(ValueError):
            pub.publicar(self.s, self.cuerpos, lambda: {})
        self.assertTrue(path.is_symlink())
        self.assertEqual(self.s.recargas, 0)

    def test_no_borra_configuracion_modificada_o_archivos_ajenos(self):
        for rel in root.PROPIOS:
            self.s.root('crear', ruta=rel, cuerpos=self.cuerpos)
        cambiado = self.raiz / root.ARCHIVOS[0]
        cambiado.write_text('Cambio externo que se debe conservar')
        r = root.operar({'accion': 'retirar', 'cuerpos': self.cuerpos}, self.raiz)
        self.assertFalse(r['ok'])
        self.assertEqual(cambiado.read_text(), 'Cambio externo que se debe conservar')
        self.assertEqual(self.ajeno.read_text(), 'Configuración original intacta')
        self.assertFalse((self.raiz / root.ARCHIVOS[1]).exists())

    def test_helper_no_permite_rutas_fuera_de_la_lista_ni_sobrescritura(self):
        for rel in ('../../passwd', 'apache2.conf', 'sites-available/iv-itsanet.conf'):
            with self.assertRaises(ValueError):
                self.s.root('crear', ruta=rel, cuerpos=self.cuerpos)
        self.s.root('crear', ruta=root.ARCHIVOS[0], cuerpos=self.cuerpos)
        with self.assertRaises(FileExistsError):
            self.s.root('crear', ruta=root.ARCHIVOS[0], cuerpos=self.cuerpos)


class PruebaAccesoTest(unittest.TestCase):
    def setUp(self):
        self.lector = {'correo': 'cuenta@prueba.invalid', 'actorId': 'a'*36, 'contrasena': 'SECRETO_SINTETICO_NO_PUBLICAR'}
        self.inventario = 'b'*36
        self.calls = []
        self.fail = None
        self.cerrada = False

    def request(self, method, path, body, headers):
        self.calls.append((method, path))
        h = {}
        if path == '/salud':
            data, status = {'ok': True, 'servicio': 'centro-mando-ims-candidata'}, 200
        elif path == '/api/sesion' and method == 'POST':
            data, status = {'usuario': {k: self.lector[k] for k in ('correo', 'actorId')}, 'soloLectura': self.fail != 'escritura', 'csrf': 'c'*43}, 200
            h = {'set-cookie': '__Host-ims_cm_session=' + 'd'*43 + '; Secure; HttpOnly; SameSite=Strict; Path=/'}
        elif path.startswith('/api/inventarios?'):
            data, status = {'datos': [{'id': self.inventario, 'estado': 'ENTREGADO'}], 'siguiente': None}, 200
        elif '/lineas?' in path:
            data, status = {'datos': [{'puede_contar': False}]}, 200
        elif path == '/api/conteos':
            data, status = {'error': 'SOLO_LECTURA'}, 403
        elif path == '/api/sesion/cerrar':
            self.cerrada = True
            data, status = {'ok': True}, 200
        else:
            data, status = {'error': 'NO_AUTENTICADO'}, 401
        return status, h, json.dumps(data).encode()

    def test_prueba_login_lectura_rechazo_escritura_y_revocacion_sin_publicar_secretos(self):
        r = pub.comprobar_acceso(self.request, self.lector, 1)
        self.assertEqual(r['conteos_visibles'], 1)
        self.assertTrue(self.cerrada)
        self.assertNotIn(self.lector['contrasena'], json.dumps(r))
        self.assertNotIn('d'*43, json.dumps(r))

    def test_estado_editable_o_acceso_incompleto_no_se_aprueba_y_cierra_sesion(self):
        self.fail = 'escritura'
        with self.assertRaises(pub.PublicacionError):
            pub.comprobar_acceso(self.request, self.lector, 1)
        self.assertTrue(self.cerrada)
        self.fail = None
        with self.assertRaises(pub.PublicacionError):
            pub.comprobar_acceso(self.request, self.lector, 2)
        self.assertTrue(self.cerrada)


if __name__ == '__main__':
    unittest.main()
