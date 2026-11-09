import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

DEPLOY = Path(__file__).parents[1] / 'deploy'
sys.path.insert(0, str(DEPLOY))
import actualizar_piloto as up
import unidad_piloto_root as root
sys.path.remove(str(DEPLOY))


class VersionesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.raiz = self.base / 'systemd'
        self.raiz.mkdir()
        (self.raiz / 'multi-user.target.wants').mkdir()
        self.anterior = '[Unit]\nDescription=Anterior\n'
        self.nueva = '[Unit]\nDescription=Nueva\n'
        self.unidad = self.raiz / root.NOMBRE
        self.unidad.write_text(self.anterior)
        self.unidad.chmod(0o644)
        self.ajeno = self.raiz / 'iv-itsanet.service'
        self.ajeno.write_text('Unidad ajena sin cambios')
        self.calls = []
        outer = self
        class Sistema:
            def root(self, accion, **kwargs):
                outer.calls.append(accion)
                return root.operar({'accion': accion, **kwargs}, outer.raiz)
            def recargar(self):
                outer.calls.append('daemon-reload')
            def reiniciar(self):
                outer.calls.append('restart:' + root.NOMBRE)
            def habilitado(self):
                outer.calls.append('is-enabled:' + root.NOMBRE)
        self.s = Sistema()

    def tearDown(self):
        self.temp.cleanup()

    def test_actualiza_solo_unidad_propia_y_crea_su_unico_enlace_de_inicio(self):
        r = up.activar(self.s, self.anterior, self.nueva, lambda: {'resumen_verificado': True}, lambda: None, lambda _: None)
        self.assertTrue(r['inicio_automatico'])
        self.assertEqual(self.unidad.read_text(), self.nueva)
        self.assertEqual(os.readlink(self.raiz / 'multi-user.target.wants' / root.NOMBRE), '../' + root.NOMBRE)
        self.assertEqual(self.ajeno.read_text(), 'Unidad ajena sin cambios')
        self.assertEqual(self.calls.count('restart:' + root.NOMBRE), 1)

    def test_fallo_de_resumen_recupera_version_anterior_sin_habilitar_inicio(self):
        def fallo():
            raise up.p.PilotoError('Conteos no coinciden.')
        with self.assertRaisesRegex(up.p.PilotoError, 'restaurada/verificada'):
            up.activar(self.s, self.anterior, self.nueva, fallo, lambda: None, lambda _: None)
        self.assertEqual(self.unidad.read_text(), self.anterior)
        self.assertFalse((self.raiz / 'multi-user.target.wants' / root.NOMBRE).exists())
        self.assertEqual(self.calls.count('restart:' + root.NOMBRE), 2)
        self.assertEqual(self.ajeno.read_text(), 'Unidad ajena sin cambios')

    def test_fallo_al_confirmar_restaura_unidad_y_retira_solo_el_enlace_nuevo(self):
        def fallo(_):
            raise OSError('Fallo simulado del archivo de estado.')
        with self.assertRaises(up.p.PilotoError):
            up.activar(self.s, self.anterior, self.nueva, lambda: {}, lambda: None, fallo)
        self.assertEqual(self.unidad.read_text(), self.anterior)
        self.assertFalse(os.path.lexists(self.raiz / 'multi-user.target.wants' / root.NOMBRE))

    def test_reintento_misma_unidad_no_reinicia_y_no_duplica_enlace(self):
        for _ in range(2):
            r = up.activar(self.s, self.anterior, self.anterior, lambda: {}, lambda: None, lambda _: None)
            self.assertFalse(r['unidad_actualizada'])
        self.assertFalse(any(x.startswith('restart:') for x in self.calls))

    def test_hash_unidad_modificada_y_enlace_ajeno_no_se_sobrescriben(self):
        with self.assertRaises(ValueError):
            root.operar({'accion': 'poner', 'esperado': '0'*64, 'contenido': self.nueva}, self.raiz)
        enlace = self.raiz / 'multi-user.target.wants' / root.NOMBRE
        enlace.symlink_to('../iv-itsanet.service')
        with self.assertRaises(ValueError):
            root.operar({'accion': 'auto', 'esperado': up.sha(self.anterior)}, self.raiz)
        self.assertEqual(os.readlink(enlace), '../iv-itsanet.service')
        self.assertEqual(self.unidad.read_text(), self.anterior)

    def test_respuesta_perdida_despues_de_cambiar_unidad_o_enlace_no_deja_estado_incierto(self):
        for accion_perdida in ('poner', 'auto'):
            with self.subTest(accion=accion_perdida):
                real = self.s.root
                perdido = [False]
                def root_con_corte(accion, **kwargs):
                    r = real(accion, **kwargs)
                    if accion == accion_perdida and not perdido[0]:
                        perdido[0] = True
                        raise OSError('Respuesta perdida después de guardar.')
                    return r
                self.s.root = root_con_corte
                try:
                    with self.assertRaisesRegex(up.p.PilotoError, 'restaurada/verificada'):
                        up.activar(self.s, self.anterior, self.nueva, lambda: {}, lambda: None, lambda _: None)
                finally:
                    self.s.root = real
                self.assertEqual(self.unidad.read_text(), self.anterior)
                self.assertFalse(os.path.lexists(self.raiz / 'multi-user.target.wants' / root.NOMBRE))


class ReleaseGitTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.repo = self.base / 'codigo'
        self.repo.mkdir()
        self.git('init', '-q')
        (self.repo / 'enterprise/src').mkdir(parents=True)
        (self.repo / 'enterprise/package.json').write_text('{}')
        (self.repo / 'enterprise/package-lock.json').write_text('{}')
        self.fuente = self.repo / 'enterprise/src/servir.mjs'
        self.fuente.write_text('version anterior')
        self.git('add', '.')
        self.git('-c', 'user.name=Prueba', '-c', 'user.email=prueba@invalid.test', 'commit', '-qm', 'Anterior')
        self.old = self.git('rev-parse', 'HEAD').strip()
        self.fuente.write_text('version nueva')
        self.git('add', '.')
        self.git('-c', 'user.name=Prueba', '-c', 'user.email=prueba@invalid.test', 'commit', '-qm', 'Nueva')
        self.new = self.git('rev-parse', 'HEAD').strip()
        self.git('checkout', '--detach', self.old)
        (self.repo / 'enterprise/.env').write_text('SECRETO_NO_COPIAR')
        self.destino = self.base / self.new

    def tearDown(self):
        self.temp.cleanup()

    def git(self, *args):
        return subprocess.run(['git', '-C', str(self.repo), *args], capture_output=True, text=True, check=True).stdout

    def test_extrae_commit_sin_cambiar_fuentes_en_uso_ni_copiar_env_privado(self):
        instalaciones = []
        up.preparar_release(self.repo, self.new, self.destino, lambda path: instalaciones.append(path))
        self.assertEqual(self.fuente.read_text(), 'version anterior')
        self.assertEqual((self.destino / 'enterprise/src/servir.mjs').read_text(), 'version nueva')
        self.assertFalse((self.destino / 'enterprise/.env').exists())
        up.preparar_release(self.repo, self.new, self.destino, lambda _: self.fail('No reinstalar una versión lista.'))
        self.assertEqual(len(instalaciones), 1)

    def test_dependencia_fallida_permite_reintentar_sin_tocar_fuente_actual(self):
        def fallar(_):
            raise RuntimeError('Fallo sintético de instalación.')
        with self.assertRaises(RuntimeError):
            up.preparar_release(self.repo, self.new, self.destino, fallar)
        self.assertFalse(json.loads((self.destino / 'version.json').read_text())['listo'])
        up.preparar_release(self.repo, self.new, self.destino, lambda _: None)
        self.assertEqual(self.fuente.read_text(), 'version anterior')
        self.assertTrue(json.loads((self.destino / 'version.json').read_text())['listo'])

    def test_release_alterada_o_enlazada_no_se_sobrescribe(self):
        up.preparar_release(self.repo, self.new, self.destino, lambda _: None)
        copia = self.destino / 'enterprise/src/servir.mjs'
        copia.write_text('alterada')
        with self.assertRaises(up.p.PilotoError):
            up.preparar_release(self.repo, self.new, self.destino, lambda _: None)
        self.assertEqual(copia.read_text(), 'alterada')
        enlace = self.base / 'enlace'
        enlace.symlink_to(self.destino, target_is_directory=True)
        with self.assertRaises(up.p.PilotoError):
            up.preparar_release(self.repo, self.new, enlace, lambda _: None)


if __name__ == '__main__':
    unittest.main()
