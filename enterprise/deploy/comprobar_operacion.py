"""Prueba HTTPS del perfil nativo. No crea inventarios ni captura cantidades."""
import json
import re
import uuid
from publicar_piloto_https import exigir


def comprobar(request, usuario, conteos, filas, erp_conexiones=None):
    cookie = csrf = None

    def consultar(method, path, body=None, auth=True):
        headers = {'Cookie': cookie, 'X-IMS-CSRF': csrf} if auth else {}
        status, h, raw = request(method, path, body, headers)
        return status, h, json.loads(raw)

    status, _, _ = consultar('GET', '/api/operacion', auth=False)
    exigir(status == 401, 'La operación anónima no está bloqueada.')
    try:
        status, h, s = consultar('POST', '/api/sesion', {'correo': usuario['correo'], 'contrasena': usuario['contrasena']}, False)
        exigir(status == 200 and s.get('operacionNativa') is True and s.get('soloLectura') is False
               and s.get('usuario', {}).get('actorId') == usuario['actorId'], 'La sesión no corresponde al perfil nativo preparado.')
        ck = h.get('set-cookie', '')
        cookie, csrf = ck.split(';')[0], s.get('csrf')
        exigir(bool(re.fullmatch('__Host-ims_cm_session=[A-Za-z0-9_-]{43}', cookie))
               and all(v in ck.lower() for v in ('secure','httponly','samesite=strict','path=/'))
               and bool(re.fullmatch('[A-Za-z0-9_-]{43}', csrf or '')), 'Cookie o CSRF incompatibles.')
        status, _, contexto = consultar('GET', '/api/operacion')
        exigir(status == 200 and isinstance(contexto.get('inventarios'), list) and len(contexto['inventarios']) < 500
               and {(r.get('sede'), r.get('rol')) for r in contexto.get('ambitos', [])} == {('UIO','ADMIN'),('GYE','ADMIN')}, 'Ámbitos o contexto nativo incompatibles.')
        natives = {r['id'] for r in contexto['inventarios']}
        if erp_conexiones is not None:
            exigir(s.get('erpDisponible') is True,'ERP no está habilitado en la sesión.')
            status, _, erp=consultar('GET','/api/erp/conexiones')
            exigir(status == 200 and erp.get('soloPrevisualizacion') is True and set(erp.get('sedes',[])) == {'UIO','GYE'}
                   and len(erp.get('conexiones',[])) == erp_conexiones
                   and all(set(c) == {'referencia','sede','etiqueta','clienteId','clienteNombre','codigosCliente'} for c in erp['conexiones']), 'El catálogo ERP no coincide o expone campos privados.')
        lineas_nativas = sum(int(r['lineas']) for r in contexto['inventarios'])
        ids, historicos, cursor = set(), [], ''
        while True:
            status, _, r = consultar('GET', '/api/inventarios?limite=100' + ('&cursor='+cursor if cursor else ''))
            exigir(status == 200 and isinstance(r.get('datos'), list), 'No se confirmó el listado autorizado.')
            for inv in r['datos']:
                exigir(inv['id'] not in ids, 'Inventario repetido en la paginación.')
                ids.add(inv['id'])
                if inv['id'] not in natives:
                    exigir(inv['estado'] == 'ENTREGADO', 'El histórico dejó su estado de entrega.')
                    historicos.append(inv['id'])
            exigir(len(ids) <= conteos+len(natives), 'El listado excede los permisos esperados.')
            nxt = r.get('siguiente')
            if nxt is None:
                break
            exigir(r['datos'] and nxt == r['datos'][-1]['id'] and nxt != cursor, 'Paginación incompatible.')
            cursor = nxt
        exigir(len(historicos) == conteos and len(ids) == conteos+len(natives), 'El histórico visible no coincide con el traslado.')
        status, _, resumen = consultar('GET', '/api/resumen')
        exigir(status == 200 and resumen.get('totales', {}).get('conteos') == str(len(ids))
               and resumen['totales'].get('lineas') == str(filas+lineas_nativas), 'El resumen no conserva el histórico y los nuevos conteos.')
        status, _, lineas = consultar('GET', '/api/inventarios/'+historicos[0]+'/lineas?limite=1')
        exigir(status == 200 and len(lineas.get('datos', [])) == 1 and lineas['datos'][0]['puede_contar'] is False, 'Permiso histórico incompatible.')
        l = lineas['datos'][0]
        status, _, r = consultar('POST', '/api/conteos', {'operacionId':str(uuid.uuid4()),'inventarioId':historicos[0],
                                 'lineaId':l['id'],'versionEsperada':l['version'],'etapa':1,'cantidad':'0'})
        exigir(status == 403 and r.get('error') == 'SIN_PERMISO', 'La captura histórica no está bloqueada.')
    finally:
        if cookie and csrf:
            status, _, r = consultar('POST', '/api/sesion/cerrar', {})
            exigir(status == 200 and r.get('ok') is True, 'No se confirmó el logout.')
    status, _, _ = consultar('GET', '/api/sesion')
    exigir(status == 401, 'La sesión continúa vigente tras salir.')
    return {**({'erp_consulta':True,'conexiones_erp':erp_conexiones} if erp_conexiones is not None else {}),'login_https':True, 'logout_verificado':True, 'operacion_nativa':True, 'historico_protegido':True,
            'conteos_historicos':conteos,'filas_historicas':filas,'conteos_nativos':len(natives),'publicacion_kpi':False}
