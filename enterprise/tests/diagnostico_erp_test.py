import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class DiagnosticoERPTests(unittest.TestCase):
    def test_script_remoto_sin_servicios_sql_ni_instalaciones(self):
        text = (ROOT/'tools/diagnosticar-erp-servidor.ps1').read_text()
        scripts = re.findall(r"@'\n(.*?)\n'@", text, re.S)
        self.assertEqual(len(scripts), 1)
        script = scripts[0].replace('__REVISION__', 'a'*40).replace('__PLAN__', '/home/enicolalde/bryan/centro_mando_ims_datos/ERP_ASOCIACIONES_'+'b'*32+'/asociaciones_erp_NO_COMPARTIR.json').replace('__PENDIENTES__', "'--datos-pendientes-de' '/home/enicolalde/bryan/centro_mando_ims_datos/ERP_LECTURA_"+'c'*32+"/conexiones_erp_para_compartir.json'")
        run = subprocess.run(['bash', '-n'], input=script, text=True, capture_output=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        for word in ['sudo ', 'systemctl ', 'apache2ctl ', 'npm ', 'mysql ', 'git checkout', 'git pull', 'rm -', 'StrictHostKeyChecking=no']:
            self.assertNotIn(word, script)
        self.assertIn('git worktree add --quiet --detach', script)
        self.assertIn('test "$(hostname)" = apps', script)
        for name in ['conexiones_erp_para_compartir.json', 'revision_asociaciones_erp_para_compartir.json']:
            self.assertIn(name, text)
    def test_arranque_exige_servidor_worktree_privado_y_lectura_explicita(self):
        script = ROOT/'deploy/diagnosticar_erp_lectura.sh'
        self.assertEqual(subprocess.run(['bash','-n',str(script)],capture_output=True).returncode, 0)
        text = script.read_text()
        for part in ['set -euo pipefail', '--verificar-lectura-erp', '--max-old-space-size=256', '$imsBase/preparaciones/$imsRevision/codigo', 'env -u NODE_OPTIONS -u NODE_PATH']:
            self.assertIn(part, text)
        for word in ['sudo ', 'systemctl ', 'apache2ctl ', 'npm ', 'mysql ', 'curl ', 'rm -']:
            self.assertNotIn(word, text)

if __name__ == '__main__':
    unittest.main()
