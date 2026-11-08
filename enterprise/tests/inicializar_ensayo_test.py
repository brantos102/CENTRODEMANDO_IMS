import importlib.util
import json
import os
import stat
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

spec = importlib.util.spec_from_file_location('inicializar_ensayo', Path(__file__).parents[1] / 'deploy/inicializar_ensayo.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


@unittest.skipUnless(os.name == 'posix', 'Preparación exclusiva del servidor Linux.')
class PrepararEnsayoTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.parent = Path(self.temp.name) / 'bryan'
        self.parent.mkdir(mode=0o750)
        self.app = self.parent / 'centro_mando_ims'
        (self.app / 'enterprise').mkdir(parents=True)
        (self.app / 'enterprise/package.json').write_text('{}')
        self.otro = self.parent / 'otro_proyecto'
        self.otro.mkdir(mode=0o755)
        (self.otro / 'conservar.txt').write_text('dato ajeno inalterable')
        self.queries = []
        self.clave = None

    def tearDown(self):
        self.temp.cleanup()

    def admin(self, sql):
        self.queries.append(sql)
        if sql.startswith('SHOW GRANTS'):
            return [['GRANT USAGE ON *.* TO ' + m.ACCOUNT], ['GRANT SELECT ON `' + m.DATABASE + '`.* TO ' + m.ACCOUNT]]
        return [['8.0.46']] if sql == 'SELECT VERSION();' else []

    def verificar(self, clave):
        self.clave = clave

    def test_crea_solo_espacio_propio_y_no_expone_clave(self):
        antes = (self.parent.stat().st_mode, self.otro.stat().st_mode)
        r = m.preparar(self.app, self.admin, self.verificar)
        privado = self.parent / 'centro_mando_ims_datos'
        self.assertEqual(stat.S_IMODE(privado.stat().st_mode), 0o700)
        config = privado / 'config/migracion.env'
        self.assertEqual(stat.S_IMODE(config.stat().st_mode), 0o600)
        self.assertIn('MYSQL_PASSWORD=' + self.clave, config.read_text())
        self.assertIn('IMS_API_HABILITADA=0', config.read_text())
        self.assertNotIn(self.clave, json.dumps(r))
        self.assertEqual((self.parent.stat().st_mode, self.otro.stat().st_mode), antes)
        self.assertEqual((self.otro / 'conservar.txt').read_text(), 'dato ajeno inalterable')
        self.assertEqual(r['puertos_abiertos'], [])
        ddl = next(sql for sql in self.queries if sql.startswith('CREATE '))
        self.assertIn('MAX_USER_CONNECTIONS 2', ddl)
        self.assertIn('`centromando_ims_ensayo`.*', ddl)
        for palabra in ['DROP ', 'ALTER ', 'FLUSH ', 'ALL PRIVILEGES', 'SUPER']:
            self.assertNotIn(palabra, ddl)

    def test_base_o_usuario_existentes_no_se_modifican_ni_crean_carpetas(self):
        for token in ('information_schema', 'mysql.user'):
            queries = []
            def admin(sql):
                queries.append(sql)
                if sql == 'SELECT VERSION();':
                    return [['8.0.46']]
                return [['ya_existe']] if token in sql else []
            with self.assertRaises(m.PreparacionError):
                m.preparar(self.app, admin, self.verificar)
            self.assertFalse((self.parent / 'centro_mando_ims_datos').exists())
            self.assertTrue(all(sql.startswith('SELECT ') for sql in queries))

    def test_carpeta_privada_existente_o_enlace_se_rechazan_antes_de_mysql(self):
        privado = self.parent / 'centro_mando_ims_datos'
        privado.symlink_to(self.otro, target_is_directory=True)
        with self.assertRaises(m.PreparacionError):
            m.preparar(self.app, self.admin, self.verificar)
        self.assertEqual(self.queries, [])
        self.assertEqual((self.otro / 'conservar.txt').read_text(), 'dato ajeno inalterable')
        privado.unlink()
        privado.mkdir()
        with self.assertRaises(m.PreparacionError):
            m.preparar(self.app, self.admin, self.verificar)
        self.assertEqual(self.queries, [])

    def test_fallo_mysql_conserva_configuracion_propia_sin_borrar_recursos(self):
        def admin(sql):
            if sql.startswith('CREATE '):
                raise m.PreparacionError('Fallo simulado de SQL.')
            return self.admin(sql)
        with self.assertRaises(m.PreparacionError):
            m.preparar(self.app, admin, self.verificar)
        self.assertTrue((self.parent / 'centro_mando_ims_datos/config/migracion.env').is_file())
        self.assertIsNone(self.clave)
        self.assertEqual((self.otro / 'conservar.txt').read_text(), 'dato ajeno inalterable')

    def test_no_sigue_enlaces_del_codigo(self):
        alias = self.parent / 'codigo_enlace'
        alias.symlink_to(self.app, target_is_directory=True)
        with self.assertRaises(m.PreparacionError):
            m.preparar(alias, self.admin, self.verificar)
        self.assertEqual(self.queries, [])

    def test_no_crea_datos_privados_bajo_un_repositorio_padre(self):
        (self.parent / '.git').mkdir()
        (self.parent / '.git/HEAD').write_text('ref: refs/heads/main\n')
        with self.assertRaises(m.PreparacionError):
            m.preparar(self.app, self.admin, self.verificar)
        self.assertEqual(self.queries, [])
        self.assertFalse((self.parent / 'centro_mando_ims_datos').exists())

    def test_cli_fuera_del_servidor_o_sin_bandera_no_prepara_recursos(self):
        with patch.object(m, 'preparar') as preparar:
            with patch.object(m.sys, 'argv', ['inicializar_ensayo.py']):
                with self.assertRaises(m.PreparacionError):
                    m.main()
            with patch.object(m.sys, 'argv', ['inicializar_ensayo.py', '--crear-ensayo']), \
                    patch.object(m.platform, 'system', return_value='Linux'), \
                    patch.object(m.socket, 'gethostname', return_value='otro-servidor'):
                with self.assertRaises(m.PreparacionError):
                    m.main()
            preparar.assert_not_called()


if __name__ == '__main__':
    unittest.main()
