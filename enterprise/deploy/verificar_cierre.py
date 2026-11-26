#!/usr/bin/env python3
"""Informe del servicio publicado, datos, accesos y consumo; no captura ni envía avisos."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import socket
import subprocess
import time
import uuid

import preparar_piloto as p
import publicar_piloto_https as https
from copiar_abiertos_mysql import configuracion

SERVICIO = 'centro-mando-ims-ensayo.service'
PROPIEDADES = ('ActiveState', 'SubState', 'MainPID', 'MemoryCurrent', 'MemoryPeak',
               'MemoryHigh', 'MemoryMax', 'CPUUsageNSec', 'CPUQuotaPerSecUSec', 'TasksCurrent')


def ejecutar(args):
    r = subprocess.run(args, capture_output=True, text=True, timeout=30)
    p.exigir(r.returncode == 0, 'No se confirmó una consulta del servicio IMS.')
    return r.stdout


def estado_servicio(ejecutar=ejecutar):
    raw = ejecutar(['systemctl', 'show', SERVICIO, '--no-pager',
                    *['--property=' + k for k in PROPIEDADES]])
    return {k: v for k, v in (line.split('=', 1) for line in raw.splitlines() if '=' in line)
            if k in PROPIEDADES}


def natural(v):
    return int(v) if isinstance(v, str) and re.fullmatch(r'\d{1,24}', v) else None


def consumo(a, b, segundos):
    antes, despues = natural(a.get('CPUUsageNSec')), natural(b.get('CPUUsageNSec'))
    cpu = (100 * (despues - antes) / (segundos * 1e9)
           if antes is not None and despues is not None and despues >= antes and segundos > 0 else None)
    quota = b.get('CPUQuotaPerSecUSec', '')
    m = re.fullmatch(r'(\d+(?:\.\d+)?)\s*(us|ms|s)', quota)
    cuota = float(m[1]) * {'us': 1e-6, 'ms': 1e-3, 's': 1}[m[2]] if m else None
    return {'servicioActivo': b.get('ActiveState') == 'active' and b.get('SubState') == 'running',
            'memoriaActualBytes': natural(b.get('MemoryCurrent')),
            'memoriaPicoBytes': natural(b.get('MemoryPeak')),
            'umbralMemoriaBytes': natural(b.get('MemoryHigh')),
            'limiteMemoriaBytes': natural(b.get('MemoryMax')),
            'cpuPorcentajeUnNucleoMuestra': round(cpu, 2) if cpu is not None else None,
            'duracionMuestraSegundos': round(segundos, 3),
            'cuotaCPUFraccionNucleo': cuota, 'tareasActuales': natural(b.get('TasksCurrent')),
            'alcance': 'Proceso y grupo de control del servicio IMS. MySQL y Apache se miden por separado; no están incluidos.'}


def consultar_https(request, lector, revision):
    cookie = csrf = None

    def consulta(metodo, ruta, body=None, auth=False):
        headers = {'Cookie': cookie, 'X-IMS-CSRF': csrf} if auth else {}
        status, h, raw = request(metodo, ruta, body, headers)
        return status, h, json.loads(raw)

    status, _, salud = consulta('GET', '/salud')
    p.exigir(status == 200 and salud.get('ok') is True
             and salud.get('servicio') == 'centro-mando-ims-candidata'
             and salud.get('revision') == revision, 'La revisión esperada no está publicada.')
    status, _, _ = consulta('GET', '/api/centro/cierre')
    p.exigir(status == 401, 'El informe administrativo no está protegido.')
    try:
        status, h, login = consulta('POST', '/api/sesion',
                                   {'correo': lector['correo'], 'contrasena': lector['contrasena']})
        ck = h.get('set-cookie', '')
        cookie, csrf = ck.split(';')[0], login.get('csrf')
        p.exigir(bool(re.fullmatch('__Host-ims_cm_session=[A-Za-z0-9_-]{43}', cookie))
                 and all(v in ck.lower() for v in ('secure', 'httponly', 'samesite=strict', 'path=/'))
                 and bool(re.fullmatch('[A-Za-z0-9_-]{43}', csrf or '')), 'Sesión de diagnóstico incompatible.')
        p.exigir(status == 200 and login.get('operacionNativa') is True
                 and login.get('soloLectura') is False
                 and login.get('usuario', {}).get('actorId') == lector['actorId'],
                 'No se confirmó la cuenta operativa preparada.')
        status, _, informe = consulta('GET', '/api/centro/cierre', auth=True)
        p.exigir(status == 200 and informe.get('formato') == 'ims-cierre-operativo-v1'
                 and informe.get('datosInventarioModificados') is False
                 and informe.get('fuentesGoogleModificadas') is False
                 and informe.get('notificacionesEnviadas') is False, 'No se confirmó el informe de cierre.')
    finally:
        if cookie and csrf:
            status, _, salida = consulta('POST', '/api/sesion/cerrar', {}, True)
            p.exigir(status == 200 and salida.get('ok') is True, 'No se confirmó el cierre de la sesión de diagnóstico.')
    status, _, _ = consulta('GET', '/api/sesion', auth=True)
    p.exigir(status == 401, 'La sesión de diagnóstico continúa vigente.')
    return informe


def guardar_resumen(datos, informe):
    carpeta = datos / 'cierres'
    if not carpeta.exists():
        carpeta.mkdir(mode=0o700)
    p.privado(carpeta, True)
    archivo = carpeta / ('cierre_' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
                          + '_' + uuid.uuid4().hex[:8] + '.json')
    with archivo.open('x', encoding='utf-8') as f:
        os.fchmod(f.fileno(), 0o600)
        json.dump(informe, f, ensure_ascii=False, indent=2)
        f.write('\n')
    return archivo


def medir_base(repo, datos):
    env = {k: v for k, v in os.environ.items() if k not in ('NODE_OPTIONS', 'NODE_PATH')}
    r = subprocess.run(['/usr/bin/node', str(repo / 'enterprise/tools/medir-base-cierre.mjs')],
                       input=json.dumps({'config': configuracion(datos)}), capture_output=True,
                       text=True, timeout=45, env=env)
    d = json.loads(r.stdout)
    p.exigir(r.returncode == 0 and d.get('ok') is True and d.get('baseDeDatosModificada') is False,
             'No se confirmó el tamaño de la base.')
    p.exigir(all(type(d.get(k)) is int and d[k] >= 0 for k in ('datosBytes', 'indicesBytes', 'tablas')),
             'Tamaño de base incompatible.')
    return {k: d[k] for k in ('datosBytes', 'indicesBytes', 'tablas', 'medicion')}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--revision', required=True)
    args = ap.parse_args()
    os.umask(0o077)
    p.exigir(re.fullmatch('[a-f0-9]{40}', args.revision) is not None, 'Revisión incompatible.')
    p.exigir(socket.gethostname() == 'apps' and pwd.getpwuid(os.geteuid()).pw_name == 'enicolalde',
             'Ejecutar en apps como enicolalde.')
    datos = p.privado(p.APP.parent / 'centro_mando_ims_datos', True)
    carpeta = p.privado(datos / 'piloto', True)
    repo = Path(__file__).resolve().parents[2]
    p.exigir(repo == datos / 'preparaciones' / args.revision / 'codigo', 'Usar la preparación aislada de esa revisión.')
    p.exigir(ejecutar(['git', '-C', str(repo), 'rev-parse', 'HEAD']).strip() == args.revision
             and not ejecutar(['git', '-C', str(repo), 'status', '--porcelain']).strip(), 'Código de revisión incompatible.')
    estado = json.loads(p.privado(carpeta / 'estado_despliegue.json').read_text())
    solicitud = json.loads(p.privado(carpeta / 'solicitud.json').read_text())
    p.exigir(estado.get('revision') == args.revision, 'La instalación de esta revisión no está confirmada.')
    transporte = https.TransporteTLS(https.CERTIFICADO, tiempo_espera=30, limite_respuesta=8 * 1024 * 1024)
    informe = consultar_https(transporte, solicitud['lector'], args.revision)
    informe['baseDatos'] = {**medir_base(repo, datos),
                           'nota': 'Esquema completo, incluidas las copias importadas. No incluye binlogs, archivos externos ni memoria de MySQL.'}
    inicio = time.monotonic()
    a = estado_servicio()
    time.sleep(1)
    b = estado_servicio()
    medido = consumo(a, b, time.monotonic() - inicio)
    unit = Path('/etc/systemd/system') / SERVICIO
    unidad_verificada = not unit.is_symlink() and hashlib.sha256(unit.read_bytes()).hexdigest() == estado.get('unidad_sha256')
    automatico = subprocess.run(['systemctl', 'is-enabled', SERVICIO], capture_output=True, text=True, timeout=15)
    espacio = shutil.disk_usage(datos)
    informe.update({'ok': True, 'revisionPublicada': args.revision, 'httpsVerificado': True,
                    'sesionDiagnosticoCerrada': True, 'unidadVerificada': unidad_verificada,
                    'inicioAutomatico': automatico.returncode == 0 and automatico.stdout.strip() == 'enabled',
                    'infraestructura': {**medido, 'particionDatosTotalBytes': espacio.total,
                                        'particionDatosLibreBytes': espacio.free},
                    'serviciosReiniciados': False, 'apacheModificado': False,
                    'notaInfraestructura': '512 MiB es el límite configurado del servicio; el tamaño de la base se informa en baseDatos.'})
    if not medido['servicioActivo'] or not unidad_verificada or not informe['inicioAutomatico']:
        informe['evaluacion'] = 'PENDIENTES_DE_SERVICIO'
        informe['pendientes'].append({'codigo': 'SERVICIO_POR_VERIFICAR', 'accion': 'Revisar servicio, unidad y arranque automático de IMS.'})
    archivo = guardar_resumen(datos, informe)
    print(json.dumps(informe, ensure_ascii=False, indent=2))
    print('Informe de cierre para compartir: ' + str(archivo))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'ok': False, 'codigo_error': 'CIERRE_OPERATIVO_NO_CONFIRMADO',
                          'datosInventarioModificados': False, 'serviciosReiniciados': False,
                          'accion': 'Conservar la salida de instalación y revisar la comprobación; no repetir capturas ni envíos.'}))
        raise SystemExit(1)
