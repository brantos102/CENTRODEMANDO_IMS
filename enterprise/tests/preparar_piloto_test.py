import importlib.util
import json
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('piloto', Path(__file__).parents[1] / 'deploy/preparar_piloto.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class PilotoTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.app = self.base / 'centro_mando_ims'
        self.app.mkdir(mode=0o700)
        self.datos = self.base / 'centro_mando_ims_datos'
        self.datos.mkdir(mode=0o700)
        (self.datos / 'config').mkdir(mode=0o700)
        m.escribir(self.datos / 'config/migracion.env', 'MYSQL_HOST=127.0.0.1\nMYSQL_PORT=3306\nMYSQL_DATABASE=centromando_ims_ensayo\nMYSQL_USER=ims_cm_migracion\nMYSQL_PASSWORD=' + 'a'*64 + '\n')
        self.otro = self.base / 'RRHH_ITSANET'
        self.otro.mkdir()
        (self.otro / 'conservar').write_text('no alterar')
        self.plan = 'b'*64
        self.cuenta = False
        self.sql = []
        self.nodos = []

    def tearDown(self):
        self.temp.cleanup()

    def admin(self, sql):
        self.sql.append(sql)
        if sql.startswith('SELECT User,Host'):
            return [[m.DB_USER, '127.0.0.1', '5']] if self.cuenta else []
        if sql.startswith('CREATE USER'):
            self.cuenta = True
        if sql.startswith('SHOW GRANTS'):
            return [[f'GRANT USAGE ON *.* TO {m.ACCOUNT} WITH MAX_USER_CONNECTIONS 5']] + [
                [f"GRANT {', '.join(sorted(permisos))} ON `{m.DATABASE}`.`{tabla}` TO {m.ACCOUNT}"]
                for tabla, permisos in m.PRIVILEGIOS.items()]
        return []

    def node(self, app, solicitud, aplicar):
        self.nodos.append(aplicar)
        return {'ok': True, 'solo_lectura': True, 'conteos': 352, 'filas': 97822}

    def preparar(self, reanudar=False):
        return m.preparar(self.app, 'lector@prueba.invalid', self.plan, reanudar,
                          admin=self.admin, node=self.node, conectar=lambda _: None)

    def test_prepara_solo_recursos_propios_y_guarda_secretos_fuera_del_resumen(self):
        antes = self.base.stat().st_mode, self.otro.stat().st_mode
        result = self.preparar()
        carpeta = self.datos / 'piloto'
        self.assertEqual(stat.S_IMODE(carpeta.stat().st_mode), 0o700)
        for f in carpeta.iterdir():
            self.assertEqual(stat.S_IMODE(f.stat().st_mode), 0o600)
        request = json.loads((carpeta / 'solicitud.json').read_text())
        for secreto in [request['clave_mysql'], request['lector']['contrasena'], 'a'*64]:
            self.assertNotIn(secreto, json.dumps(result))
        env = (carpeta / 'piloto.env').read_text()
        self.assertIn('IMS_SOLO_LECTURA=1', env)
        self.assertIn('IMS_MIGRACION_OPERATIVA=0', env)
        self.assertEqual(result['puertos_abiertos'], [])
        self.assertFalse(result['apache_modificado'])
        self.assertFalse(result['aplicacion_activada'])
        self.assertEqual((self.base.stat().st_mode, self.otro.stat().st_mode), antes)
        self.assertEqual((self.otro / 'conservar').read_text(), 'no alterar')
        ddl = next(q for q in self.sql if q.startswith('CREATE USER'))
        self.assertNotIn('.* TO', ddl)
        for word in ('DROP ', 'ALTER ', 'ALL PRIVILEGES', 'FLUSH ', 'UPDATE ON `centromando_ims_ensayo`.`ims_op_'):
            self.assertNotIn(word, ddl)

    def test_reanudar_verifica_misma_identidad_sin_rotar_claves_ni_recrear_cuenta(self):
        self.preparar()
        before = {f.name: f.read_bytes() for f in (self.datos / 'piloto').iterdir()}
        self.preparar(True)
        after = {f.name: f.read_bytes() for f in (self.datos / 'piloto').iterdir()}
        self.assertEqual(before, after)
        self.assertEqual(sum(q.startswith('CREATE USER') for q in self.sql), 1)
        with self.assertRaises(m.PilotoError):
            m.preparar(self.app, 'otro@prueba.invalid', self.plan, True, self.admin, self.node)

    def test_no_adopta_cuenta_ni_carpeta_preexistentes(self):
        self.cuenta = True
        with self.assertRaises(m.PilotoError):
            self.preparar()
        self.assertFalse((self.datos / 'piloto').exists())
        self.assertEqual(self.nodos, [])

    def test_fallo_prevalidacion_no_crea_archivos_cuentas_o_permisos(self):
        def fallo(*_):
            raise m.PilotoError('Plan no verificado.')
        with self.assertRaises(m.PilotoError):
            m.preparar(self.app, 'lector@prueba.invalid', self.plan, admin=self.admin, node=fallo)
        self.assertFalse((self.datos / 'piloto').exists())
        self.assertTrue(all(q.startswith('SELECT ') for q in self.sql))

    def test_configuracion_ajena_enlace_o_archivo_publico_bloquean(self):
        config = self.datos / 'config/migracion.env'
        config.write_text(config.read_text().replace(m.DATABASE, 'rrhh_itsanet'))
        with self.assertRaises(m.PilotoError):
            self.preparar()
        self.assertEqual(self.sql, [])
        config.unlink()
        config.symlink_to(self.otro / 'conservar')
        with self.assertRaises(m.PilotoError):
            self.preparar()
        self.assertEqual((self.otro / 'conservar').read_text(), 'no alterar')

    def test_reserva_de_puertos_o_servidor_equivocado_detienen_antes_de_crear(self):
        with patch.object(m.socket, 'gethostname', return_value='PC_WINDOWS'):
            with self.assertRaises(m.PilotoError):
                m.preflight_servidor()

    def test_no_acepta_grant_global_escritura_operativa_o_delegacion(self):
        rows = self.admin('SHOW GRANTS')
        m.verificar_grants(rows)
        mysql8 = [[r[0].replace(m.ACCOUNT, '`ims_cm_lector`@`127.0.0.1`').replace(' WITH MAX_USER_CONNECTIONS 5', '')] for r in rows]
        m.verificar_grants(mysql8)
        for extra in [f'GRANT SELECT ON `{m.DATABASE}`.* TO {m.ACCOUNT}',
                      f'GRANT UPDATE ON `{m.DATABASE}`.`ims_op_linea` TO {m.ACCOUNT}',
                      f'GRANT SELECT ON `{m.DATABASE}`.`ims_op_cliente` TO {m.ACCOUNT} WITH GRANT OPTION']:
            with self.assertRaises(m.PilotoError):
                m.verificar_grants(rows + [[extra]])

    def test_enlace_de_lock_no_toca_archivo_ajeno(self):
        self.preparar()
        lock = self.datos / 'piloto/preparacion.lock'
        lock.unlink()
        before = (self.otro / 'conservar').stat().st_mode
        lock.symlink_to(self.otro / 'conservar')
        with self.assertRaises(OSError):
            self.preparar(True)
        self.assertEqual((self.otro / 'conservar').stat().st_mode, before)
        self.assertEqual((self.otro / 'conservar').read_text(), 'no alterar')


if __name__ == '__main__':
    unittest.main()
