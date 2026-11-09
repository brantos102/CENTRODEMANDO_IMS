#!/usr/bin/env python3
"""Publica el piloto de lectura en 8445, sin reiniciar otros aplicativos."""
import argparse
import fcntl
import hashlib
import http.client
import json
import os
import re
import socket
import ssl
import subprocess
import sys
import time
import uuid
from pathlib import Path

import preparar_piloto as p
from apache_piloto_root import ARCHIVOS, PROPIOS

HOST = 'apps.flexnetuio.com'
CERTIFICADO = Path('/etc/ssl/certs/apps.flexnetuio.com.crt')
SERVICIO = 'centro-mando-ims-ensayo.service'
PROTEGIDOS = {80, 443, 8443, 8444, 3000, 3001, 3002, 8000, 8010, 8080, 3306}


class PublicacionError(Exception):
    pass


def exigir(ok, mensaje):
    if not ok:
        raise PublicacionError(mensaje)


def ejecutar(args, entrada=None, binario=False):
    try:
        r = subprocess.run(args, input=entrada, capture_output=True, text=not binario, timeout=45)
    except (OSError, subprocess.TimeoutExpired):
        raise PublicacionError('No se pudo confirmar un comando del piloto.')
    exigir(r.returncode == 0, 'Comando rechazado: ' + ' '.join(args[:3]) + '. No se muestran datos privados.')
    return r.stdout


class TransporteTLS:
    def __init__(self, certificado, puerto=8445):
        self.contexto = ssl.create_default_context(cafile=str(certificado))
        self.contexto.verify_flags |= ssl.VERIFY_X509_PARTIAL_CHAIN
        der = ejecutar(['openssl', 'x509', '-in', str(certificado), '-outform', 'DER'], binario=True)
        self.fingerprint = hashlib.sha256(der).digest()
        self.puerto = puerto

    def __call__(self, metodo, ruta, body=None, headers=None):
        exigir(ruta.startswith('/') and not ruta.startswith('//'), 'Ruta de prueba inválida.')
        conn = http.client.HTTPSConnection(HOST, self.puerto, timeout=10, context=self.contexto)
        try:
            # TCP local, SNI/nombre público y verificación TLS activa. Sin proxies ni redirecciones.
            raw = socket.create_connection(('127.0.0.1', self.puerto), timeout=10)
            try:
                conn.sock = self.contexto.wrap_socket(raw, server_hostname=HOST)
            except BaseException:
                raw.close()
                raise
            exigir(hashlib.sha256(conn.sock.getpeercert(binary_form=True)).digest() == self.fingerprint,
                   'El certificado servido no coincide con el configurado.')
            h = {'Origin': p.URL, **(headers or {})}
            data = None
            if body is not None:
                h['Content-Type'] = 'application/json'
                data = json.dumps(body).encode()
            conn.request(metodo, ruta, body=data, headers=h)
            r = conn.getresponse()
            datos = r.read(262145)
            exigir(len(datos) <= 262144, 'Respuesta de prueba demasiado grande.')
            return r.status, dict((k.lower(), v) for k, v in r.getheaders()), datos
        finally:
            conn.close()


def comprobar_acceso(request, lector, esperados):
    cookie = csrf = None
    def consulta(metodo, ruta, body=None, sesion=False):
        headers = {'Cookie': cookie, 'X-IMS-CSRF': csrf} if sesion else {}
        status, h, raw = request(metodo, ruta, body, headers)
        try:
            data = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            raise PublicacionError('La respuesta de la API no es JSON válido.')
        return status, h, data
    status, _, data = consulta('GET', '/salud')
    exigir(status == 200 and data.get('ok') is True and data.get('servicio') == 'centro-mando-ims-candidata', 'HTTPS no llega al backend del piloto.')
    status, _, _ = consulta('GET', '/api/inventarios')
    exigir(status == 401, 'La consulta anónima no está bloqueada.')
    try:
        status, h, data = consulta('POST', '/api/sesion', {'correo': lector['correo'], 'contrasena': lector['contrasena']})
        exigir(status == 200, 'El lector no pudo iniciar sesión por HTTPS.')
        ck = h.get('set-cookie', '')
        cookie = ck.split(';')[0]
        csrf = data.get('csrf')
        exigir(bool(re.fullmatch('__Host-ims_cm_session=[A-Za-z0-9_-]{43}', cookie))
               and all(x in ck.lower() for x in ('httponly', 'secure', 'samesite=strict', 'path=/'))
               and bool(re.fullmatch('[A-Za-z0-9_-]{43}', csrf or '')), 'La cookie/CSRF no corresponde al piloto.')
        exigir(data.get('soloLectura') is True and data.get('usuario', {}).get('actorId') == lector['actorId']
               and data['usuario'].get('correo') == lector['correo'], 'La sesión no corresponde al lector configurado.')
        ids, cursor, primero = set(), '', None
        while True:
            status, _, data = consulta('GET', '/api/inventarios?limite=100' + ('&cursor=' + cursor if cursor else ''), sesion=True)
            exigir(status == 200 and isinstance(data.get('datos'), list) and len(data['datos']) <= 100, 'No se pudieron consultar los inventarios.')
            for inv in data['datos']:
                ident = inv.get('id', '')
                exigir(bool(re.fullmatch('[a-f0-9-]{36}', ident)) and ident not in ids
                       and inv.get('estado') == 'ENTREGADO', 'Inventarios visibles incompatibles con el plan entregado.')
                ids.add(ident)
                primero = primero or ident
            exigir(len(ids) <= esperados, 'La cuenta tiene más inventarios de los previstos.')
            siguiente = data.get('siguiente')
            if siguiente is None:
                break
            exigir(bool(data['datos']) and siguiente == data['datos'][-1]['id'] and siguiente != cursor,
                   'Paginación de inventarios inválida.')
            cursor = siguiente
        exigir(len(ids) == esperados and primero, 'El acceso visible no coincide con los conteos esperados.')
        status, _, data = consulta('GET', '/api/inventarios/' + primero + '/lineas?limite=1', sesion=True)
        exigir(status == 200 and isinstance(data.get('datos'), list) and len(data['datos']) == 1
               and data['datos'][0].get('puede_contar') is False, 'La primera línea no es consultable en modo de lectura.')
        status, _, data = consulta('POST', '/api/conteos', {}, sesion=True)
        exigir(status == 403 and data.get('error') == 'SOLO_LECTURA', 'La API no bloquea la captura del piloto.')
    finally:
        if cookie and csrf:
            status, _, data = consulta('POST', '/api/sesion/cerrar', {}, sesion=True)
            exigir(status == 200 and data.get('ok') is True, 'No se confirmó el cierre de la sesión de prueba.')
    status, _, _ = consulta('GET', '/api/sesion', sesion=True)
    exigir(status == 401, 'La sesión de prueba continúa activa después del cierre.')
    return {'login_https': True, 'logout_verificado': True, 'solo_lectura_verificado': True,
            'conteos_visibles': len(ids), 'primera_linea_consultada': True}


class Sistema:
    def root(self, accion, **datos):
        raw = ejecutar(['sudo', '-n', '/usr/bin/python3', '-I', str(p.APP / 'enterprise/deploy/apache_piloto_root.py')],
                       json.dumps({'accion': accion, **datos}))
        r = json.loads(raw)
        exigir(r.get('ok') is True, 'La operación sobre archivos propios de Apache no se confirmó.')
        return r

    def foto(self):
        return self.root('fotografia')['configuraciones']

    def configtest(self):
        ejecutar(['sudo', '-n', 'apache2ctl', 'configtest'])

    def recargar(self):
        ejecutar(['sudo', '-n', 'systemctl', 'reload', 'apache2'])

    def pid_apache(self):
        return ejecutar(['sudo', '-n', 'systemctl', 'show', 'apache2', '--property=MainPID', '--value']).strip()

    def puertos(self):
        rows = ejecutar(['ss', '-H', '-lnt']).splitlines()
        return {r.split()[3] for r in rows if int(r.split()[3].rsplit(':', 1)[1]) in PROTEGIDOS}


def publicar(sistema, cuerpos, probar):
    sistema.root('ausentes')
    sistema.configtest()
    antes, pid, puertos = sistema.foto(), sistema.pid_apache(), sistema.puertos()
    exigir(bool(re.fullmatch('[1-9][0-9]*', pid)), 'Apache no tiene un proceso principal activo.')
    mutando = recarga_solicitada = False
    try:
        mutando = True
        for rel in PROPIOS:
            sistema.root('crear', ruta=rel, cuerpos=cuerpos)
        sistema.configtest()
        exigir(sistema.foto() == antes, 'Otra configuración de Apache cambió; detener y revisar.')
        recarga_solicitada = True
        sistema.recargar()
        resultado = probar()
        exigir(sistema.foto() == antes and sistema.pid_apache() == pid
               and puertos <= sistema.puertos(), 'No se confirmó la conservación de configuraciones, proceso y puertos anteriores.')
        return {**resultado, 'configuraciones_previas_conservadas': True, 'pid_apache_conservado': True}
    except BaseException as causa:
        recuperado = False
        if mutando:
            try:
                sistema.root('retirar', cuerpos=cuerpos)
                sistema.configtest()
                if recarga_solicitada:
                    sistema.recargar()
                recuperado = sistema.foto() == antes and sistema.pid_apache() == pid and puertos <= sistema.puertos()
            except Exception:
                pass
        detalle = str(causa) if isinstance(causa, PublicacionError) else type(causa).__name__
        raise PublicacionError('HTTPS no se confirmó (' + detalle + '). Retirada de configuración propia: '
                               + ('verificada' if recuperado else 'requiere revisar el resultado; no sobrescribir archivos')
                               + '. El backend local y los datos se conservan.') from causa


def preflight(carpeta):
    exigir(sys.platform.startswith('linux') and socket.gethostname() == 'apps' and os.geteuid() != 0
           and __import__('pwd').getpwuid(os.geteuid()).pw_name == 'enicolalde'
           and Path(__file__).resolve() == p.APP / 'enterprise/deploy/publicar_piloto_https.py',
           'Ejecutar en apps como enicolalde, sin sudo delante de python3.')
    p.privado(p.APP.parent / 'centro_mando_ims_datos', True)
    p.privado(carpeta, True)
    s = json.loads(p.privado(carpeta / 'solicitud.json').read_text())
    exigir(s.get('version') == 1 and bool(re.fullmatch('[a-f0-9]{64}', s.get('clave_mysql', ''))), 'Solicitud privada incompatible.')
    plantillas = p.plantillas(p.APP, carpeta)
    for nombre in ('piloto.env', SERVICIO, *(Path(a).name for a in ARCHIVOS)):
        exigir(p.privado(carpeta / nombre).read_text() == plantillas[nombre].replace('{clave}', s['clave_mysql']), 'Un borrador privado cambió; conservar y revisar.')
    instalada = Path('/etc/systemd/system') / SERVICIO
    info = instalada.lstat()
    exigir(not instalada.is_symlink() and info.st_uid == 0
           and instalada.read_text() == plantillas[SERVICIO], 'La unidad instalada no corresponde al piloto.')
    ejecutar(['sudo', '-n', 'systemctl', 'is-active', SERVICIO])
    pid = ejecutar(['sudo', '-n', 'systemctl', 'show', SERVICIO, '--property=MainPID', '--value']).strip()
    escucha = ejecutar(['ss', '-H', '-lntp', '( sport = :3003 )']).splitlines()
    exigir(len(escucha) == 1 and escucha[0].split()[3] == '127.0.0.1:3003'
           and bool(re.fullmatch('[1-9][0-9]*', pid)) and 'pid=' + pid + ',' in escucha[0], 'El backend no escucha con su PID en 127.0.0.1:3003.')
    exigir(not ejecutar(['ss', '-H', '-lnt', '( sport = :8445 )']).strip(), '8445 ya está ocupado; no se libera.')
    mods = ejecutar(['sudo', '-n', 'apache2ctl', '-M'])
    exigir(all(m + '_module' in mods for m in ('ssl', 'headers', 'proxy', 'proxy_http')), 'Faltan módulos de Apache; no se instalan automáticamente.')
    refs = subprocess.run(['sudo', '-n', 'grep', '-RIlE', '--include=*.conf', '--include=*.service', '--include=*.socket',
                           '(^|[^0-9])8445([^0-9]|$)', '/etc/apache2', '/etc/systemd/system', '/lib/systemd/system'],
                          capture_output=True, text=True, timeout=30)
    exigir(refs.returncode == 1 and not refs.stdout.strip(), 'Hay referencias a 8445 o la comprobación está incompleta.')
    ejecutar(['openssl', 'verify', '-partial_chain', '-CAfile', str(CERTIFICADO), '-purpose', 'sslserver',
              '-verify_hostname', HOST, str(CERTIFICADO)])
    return s, {a: plantillas[Path(a).name] for a in ARCHIVOS}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--activar', action='store_true', required=True)
    parser.add_argument('--conteos-esperados', type=int, required=True)
    args = parser.parse_args()
    exigir(0 < args.conteos_esperados <= 10000, 'Cantidad esperada inválida.')
    os.umask(0o077)
    carpeta = p.APP.parent / 'centro_mando_ims_datos/piloto'
    solicitud, cuerpos = preflight(carpeta)
    fd = os.open(carpeta / 'publicacion_https.lock', os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as lock:
        p.privado(carpeta / 'publicacion_https.lock')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        nonce = uuid.uuid4().hex
        cuerpos = {rel: '# IMS_PUBLICACION=' + nonce + '\n' + body for rel, body in cuerpos.items()}
        sistema = Sistema()
        # Resguardo privado de hashes y contenido de los dos archivos propios, sin claves.
        p.escribir(carpeta / ('publicacion_https_' + nonce + '.json'), json.dumps({
            'cuerpos_propios': cuerpos, 'configuraciones_previas': sistema.foto()}, ensure_ascii=False, indent=2) + '\n')
        transporte = TransporteTLS(CERTIFICADO)
        def probar():
            # apachectl puede retornar antes de abrir la nueva escucha. Reintentar
            # solo salud; no repetir contraseñas ni agotar el límite de login.
            for intento in range(20):
                try:
                    status, _, raw = transporte('GET', '/salud')
                    data = json.loads(raw)
                    if status == 200 and data.get('ok') is True and data.get('servicio') == 'centro-mando-ims-candidata':
                        break
                except ssl.SSLCertVerificationError:
                    raise PublicacionError('El certificado HTTPS no superó la verificación.')
                except (OSError, http.client.HTTPException, ValueError):
                    pass
                time.sleep(0.5)
            else:
                raise PublicacionError('HTTPS no respondió con la salud del piloto después de la recarga.')
            return comprobar_acceso(transporte, solicitud['lector'], args.conteos_esperados)
        r = publicar(sistema, cuerpos, probar)
        print(json.dumps({'ok': True, **r, 'url': p.URL, 'https_local_verificado': True,
                          'certificado_configurado_verificado': True, 'acceso_externo_verificado': False,
                          'recarga_gradual_apache': True, 'backend_reiniciado': False,
                          'datos_inventario_modificados': False, 'publicacion_kpi': False,
                          'migracion_operativa_completa': False}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as exc:
        mensaje = str(exc) if isinstance(exc, (PublicacionError, p.PilotoError)) else 'No se confirmó la publicación; conservar los informes privados para revisión.'
        print('Detenido: ' + mensaje, file=sys.stderr)
        raise SystemExit(1)
