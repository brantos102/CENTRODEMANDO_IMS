#!/usr/bin/env python3
"""Publica una versión inmutable y reinicia únicamente el backend del piloto."""
import argparse
import fcntl
import hashlib
import http.client
import json
import os
import re
import shutil
import socket
import ssl
import subprocess
import sys
import time
import uuid
from pathlib import Path, PurePosixPath

import preparar_piloto as p
import publicar_piloto_https as https

SERVICIO = 'centro-mando-ims-ensayo.service'


def sha(body):
    return hashlib.sha256(body.encode() if isinstance(body, str) else body).hexdigest()


def exigir(ok, mensaje):
    if not ok:
        raise p.PilotoError(mensaje)


def guardar(path, data):
    path = Path(path)
    if os.path.lexists(path):
        p.privado(path)
    tmp = path.with_name(path.name + '.' + uuid.uuid4().hex)
    p.escribir(tmp, json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    os.replace(tmp, path)


def preparar_release(repo, revision, destino, instalar):
    exigir(bool(re.fullmatch('[a-f0-9]{40}', revision)), 'Revisión inválida.')
    repo, destino = Path(repo), Path(destino)
    exigir(destino.resolve() == destino, 'Destino de versión enlazado.')
    if destino.exists():
        p.privado(destino, True)
    else:
        destino.mkdir(mode=0o700)
    manifest_path = destino / 'version.json'
    raw = subprocess.run(['git', '-C', str(repo), 'ls-tree', '-rz', '--full-tree', revision, 'enterprise/'], capture_output=True, check=True).stdout
    entries = []
    for item in raw.split(b'\x00'):
        if not item:
            continue
        metadata, nombre = item.split(b'\t', 1)
        modo, tipo, objeto = metadata.split()
        name = nombre.decode('utf-8')
        rel = PurePosixPath(name)
        exigir(modo in (b'100644', b'100755') and tipo == b'blob' and rel.parts[0] == 'enterprise'
               and all(x not in ('.', '..', '.git', 'node_modules') for x in rel.parts), 'Archivo de versión incompatible.')
        entries.append((name, objeto.decode()))
    exigir(entries and 'enterprise/package-lock.json' in [n for n, _ in entries], 'Versión sin lockfile.')
    anterior = None
    if manifest_path.exists():
        anterior = json.loads(p.privado(manifest_path).read_text())
        exigir(anterior.get('revision') == revision, 'La carpeta pertenece a otra versión.')
    else:
        exigir(not any(destino.iterdir()), 'No se adopta una carpeta de código preexistente.')
    hashes = {}
    for name, objeto in entries:
        body = subprocess.run(['git', '-C', str(repo), 'cat-file', 'blob', objeto], capture_output=True, check=True).stdout
        target = destino / name
        hashes[name] = sha(body)
        if anterior:
            exigir(target.resolve() == target and target.is_file() and not target.is_symlink()
                   and sha(target.read_bytes()) == hashes[name], 'Una fuente preparada cambió; no se sobrescribe.')
        else:
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'wb') as f:
                f.write(body)
    exigir(not anterior or anterior.get('archivos') == hashes, 'Manifiesto de fuentes incompatible.')
    manifest = {'revision': revision, 'archivos': hashes, 'listo': False}
    if not anterior or anterior.get('listo') is not True:
        guardar(manifest_path, manifest)
        instalar(destino / 'enterprise')
        manifest['listo'] = True
        guardar(manifest_path, manifest)
    return destino


def unidad_release(release, carpeta, revision, operacion=False, erp=False):
    body = p.plantillas(release, carpeta)[SERVICIO]
    if operacion:
        body = body.replace(str(carpeta / 'piloto.env'), str(carpeta.parent / 'operacion/operacion.env'))
    if erp:
        exigir(operacion, 'ERP requiere operación nativa.')
        body = body.replace('\nExecStart=', '\nEnvironmentFile='+str(carpeta.parent/'erp'/(revision+'.env'))+'\nExecStart=', 1)
    return body.replace('EnvironmentFile=', 'Environment=IMS_RELEASE=' + revision + '\nEnvironmentFile=', 1)


class Sistema:
    def __init__(self, helper):
        self.helper = helper

    def root(self, accion, **datos):
        raw = https.ejecutar(['sudo', '-n', '/usr/bin/python3', '-I', str(self.helper)], json.dumps({'accion': accion, **datos}))
        r = json.loads(raw)
        exigir(r.get('ok') is True, 'No se confirmó la operación sobre la unidad propia.')
        return r

    def recargar(self):
        https.ejecutar(['sudo', '-n', 'systemctl', 'daemon-reload'])

    def reiniciar(self):
        https.ejecutar(['sudo', '-n', 'systemctl', 'restart', SERVICIO])

    def habilitado(self):
        exigir(https.ejecutar(['sudo', '-n', 'systemctl', 'is-enabled', SERVICIO]).strip() == 'enabled', 'No se confirmó el inicio automático propio.')


def activar(sistema, anterior, nueva, probar, recuperar, confirmar):
    cambiado = cambio_solicitado = False
    actual_sha = sha(anterior)
    estado_previo = sistema.root('leer')
    exigir(estado_previo['sha256'] == actual_sha, 'La unidad cambió antes de aplicar la actualización.')
    try:
        if nueva != anterior:
            cambio_solicitado = True
            sistema.root('poner', esperado=actual_sha, contenido=nueva)
            cambiado = True
            actual_sha = sha(nueva)
            sistema.recargar()
            sistema.reiniciar()
        resultado = probar()
        sistema.root('auto', esperado=actual_sha)
        sistema.habilitado()
        confirmar(actual_sha)
        return {**resultado, 'inicio_automatico': True, 'unidad_actualizada': cambiado}
    except BaseException as exc:
        restaurado = False
        try:
            estado_actual = sistema.root('leer')
            actual_sha = estado_actual['sha256']
            exigir(actual_sha in (sha(anterior), sha(nueva)), 'La unidad contiene un cambio externo; no se sobrescribe.')
            if not estado_previo['inicio_automatico'] and estado_actual['inicio_automatico']:
                sistema.root('quitar_auto', esperado=actual_sha)
            if actual_sha != sha(anterior):
                sistema.root('poner', esperado=actual_sha, contenido=anterior)
            if cambio_solicitado:
                sistema.recargar()
                sistema.reiniciar()
            recuperar()
            restaurado = True
        except Exception:
            pass
        detalle = str(exc) if isinstance(exc, (p.PilotoError, https.PublicacionError)) else type(exc).__name__
        raise p.PilotoError('Actualización no confirmada (' + detalle + '). Versión anterior: '
                            + ('restaurada/verificada' if restaurado else 'requiere revisar su estado')
                            + '. No se cambian datos ni Apache.') from exc


def esperar(transporte, revision=None):
    for _ in range(30):
        try:
            status, _, raw = transporte('GET', '/salud')
            r = json.loads(raw)
            if status == 200 and r.get('ok') is True and r.get('servicio') == 'centro-mando-ims-candidata' and (revision is None or r.get('revision') == revision):
                return
        except ssl.SSLCertVerificationError:
            raise p.PilotoError('El certificado HTTPS no superó la verificación.')
        except (OSError, ValueError, http.client.HTTPException):
            pass
        time.sleep(0.5)
    raise p.PilotoError('No respondió la revisión esperada por HTTPS.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--operacion-nativa', action='store_true', help='Usa el perfil propio preparado; solo inventarios nuevos, histórico protegido.')
    parser.add_argument('--erp-consulta', action='store_true', help='Habilita consulta ERP sin importación ni cambios de inventario.')
    parser.add_argument('--conteos-esperados', type=int, required=True)
    parser.add_argument('--filas-esperadas', type=int, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    exigir(bool(re.fullmatch('[a-f0-9]{40}', args.revision)) and 0 < args.conteos_esperados <= 10000
           and args.filas_esperadas > 0, 'Revisión o cantidades inválidas.')
    exigir(sys.platform.startswith('linux') and socket.gethostname() == 'apps' and os.geteuid() != 0
           and __import__('pwd').getpwuid(os.geteuid()).pw_name == 'enicolalde', 'Ejecutar en apps como enicolalde.')
    datos = p.privado(p.APP.parent / 'centro_mando_ims_datos', True)
    carpeta = p.privado(datos / 'piloto', True)
    repo = Path(__file__).resolve().parents[2]
    exigir(repo == datos / 'preparaciones' / args.revision / 'codigo', 'Ejecutar desde la preparación aislada de esa revisión.')
    exigir(https.ejecutar(['git', '-C', str(repo), 'rev-parse', 'HEAD']).strip() == args.revision
           and not https.ejecutar(['git', '-C', str(repo), 'status', '--porcelain']).strip(), 'La preparación contiene otra revisión o cambios locales.')
    s = json.loads(p.privado(carpeta / 'solicitud.json').read_text())
    exigir(p.privado(carpeta / 'piloto.env').read_text() == p.plantillas(p.APP, carpeta)['piloto.env'].replace('{clave}', s['clave_mysql']), 'El entorno no coincide con el lector preparado.')
    fd = os.open(carpeta / 'actualizacion.lock', os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as lock:
        p.privado(carpeta / 'actualizacion.lock')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        sistema = Sistema(repo / 'enterprise/deploy/unidad_piloto_root.py')
        actual = sistema.root('leer')
        estado_path = carpeta / 'estado_despliegue.json'
        estado = json.loads(p.privado(estado_path).read_text()) if estado_path.exists() else None
        if estado:
            previa = estado['revision']
            exigir(bool(re.fullmatch('[a-f0-9]{40}', previa)), 'Estado de versión anterior inválido.')
            esperado = unidad_release(datos / 'releases' / previa, carpeta, previa, operacion=estado.get('modo') == 'operacion_nativa_ensayo', erp=estado.get('erp_consulta',False))
        else:
            previa = None
            esperado = p.plantillas(p.APP, carpeta)[SERVICIO]
        exigir(actual['contenido'] == esperado and actual['sha256'] == sha(esperado), 'La unidad propia cambió; no se sobrescribe.')
        transporte = https.TransporteTLS(https.CERTIFICADO)
        esperar(transporte, previa)
        releases = datos / 'releases'
        if releases.exists():
            p.privado(releases, True)
        else:
            releases.mkdir(mode=0o700)
        cache = datos / 'cache/npm'
        exigir(cache.resolve() == cache and cache.is_dir(), 'Falta la caché privada de dependencias.')
        def instalar(directorio):
            exigir(shutil.disk_usage(datos).free >= 200 * 1024 * 1024, 'Espacio insuficiente para preparar código sin tocar la versión actual.')
            try:
                r = subprocess.run(['npm', 'ci', '--omit=dev', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund', '--cache', str(cache)],
                                   cwd=directorio, capture_output=True, text=True, timeout=180)
                exigir(r.returncode == 0, 'No se instalaron las dependencias de la versión preparada; el piloto actual se conserva.')
            except (OSError, subprocess.TimeoutExpired):
                raise p.PilotoError('No se completaron las dependencias; el piloto actual se conserva.')
        release = preparar_release(repo, args.revision, releases / args.revision, instalar)
        modulos = subprocess.run(['/usr/bin/node', '--input-type=module', '-e',
                                  "await import('mysql2/promise'); await import('./src/http/api.mjs');"],
                                 cwd=release / 'enterprise', capture_output=True, text=True, timeout=30)
        exigir(modulos.returncode == 0, 'No se pudieron cargar los módulos de la versión preparada; el piloto actual se conserva.')
        if args.operacion_nativa:
            import preparar_operacion as operacion
            op = p.privado(datos / 'operacion', True)
            solicitud = json.loads(p.privado(op / 'solicitud.json').read_text())
            entorno = p.privado(op / 'operacion.env').read_text()
            exigir(solicitud.get('actorId') == s['lector']['actorId'] and entorno == operacion.entorno(solicitud['clave_mysql']), 'Perfil operativo modificado.')
            operacion.grants()
            operacion.triggers(repo, series=True)
            verificado = operacion.node(release, '--verificar', {'config': dict(l.split('=',1) for l in entorno.splitlines())})
            exigir(verificado.get('historico') == {'conteos': args.conteos_esperados, 'filas': args.filas_esperadas}, 'El histórico no coincide con los totales esperados.')
        erp_meta=None
        if args.erp_consulta:
            exigir(args.operacion_nativa, 'ERP requiere el perfil operativo propio.')
            from preparar_erp import validar_entorno
            erp_meta=validar_entorno(repo,datos,args.revision)
        nueva = unidad_release(release, carpeta, args.revision, operacion=args.operacion_nativa, erp=args.erp_consulta)
        validar = carpeta / ('unidad_validar_' + args.revision + '.service')
        if validar.exists():
            exigir(p.privado(validar).read_text() == nueva, 'Borrador de unidad modificado.')
        else:
            p.escribir(validar, nueva)
        https.ejecutar(['sudo', '-n', 'systemd-analyze', 'verify', str(validar)])
        copia_anterior = carpeta / ('unidad_anterior_' + actual['sha256'] + '.service')
        if copia_anterior.exists():
            exigir(p.privado(copia_anterior).read_text() == actual['contenido'], 'La copia de la unidad anterior cambió.')
        else:
            p.escribir(copia_anterior, actual['contenido'])
        def probar():
            esperar(transporte, args.revision)
            if args.operacion_nativa:
                from comprobar_operacion import comprobar
                return comprobar(transporte, s['lector'], args.conteos_esperados, args.filas_esperadas, erp_conexiones=erp_meta['conexiones'] if erp_meta else None)
            return https.comprobar_acceso(transporte, s['lector'], args.conteos_esperados,
                                         filas_esperadas=args.filas_esperadas)
        def recuperar():
            esperar(transporte, previa)
        def confirmar(unit_sha):
            if estado and estado.get('revision') == args.revision and estado.get('unidad_sha256') == unit_sha:
                return
            guardar(estado_path, {'revision': args.revision, 'unidad_sha256': unit_sha, 'modo': 'operacion_nativa_ensayo' if args.operacion_nativa else 'solo_lectura',
                                 'erp_consulta':args.erp_consulta,
                                 'revision_anterior': previa, 'copia_unidad_anterior': copia_anterior.name,
                                 'inicio_automatico_anterior': actual['inicio_automatico']})
        r = activar(sistema, actual['contenido'], nueva, probar, recuperar, confirmar)
        print(json.dumps({'ok': True, **r, 'revision': args.revision, 'versiones_separadas': True,
                          'apache_modificado': False, 'otros_servicios_reiniciados': False,
                          'datos_inventario_modificados': False, 'publicacion_kpi': False}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as exc:
        print('Detenido: ' + (str(exc) if isinstance(exc, (p.PilotoError, https.PublicacionError)) else 'No se confirmó la actualización; conservar los archivos privados para revisión.'), file=sys.stderr)
        raise SystemExit(1)
