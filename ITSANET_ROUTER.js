/**
 * ITSANET_ROUTER.gs — ENRUTADOR por sede/bodega (Quito ↔ Guayaquil).
 * ---------------------------------------------------------------------------
 * El frontend (asistente/panel) llama a estas funciones pasando `base`
 * ("UIO"/"QUITO" o "GYE"/"GUAYAQUIL"). El router decide a qué módulo llamar:
 *   - Guayaquil -> funciones _GYE (endpoint g_apidepot)  [ITSANET_API_GYE.gs]
 *   - Cualquier otra cosa (por defecto) -> funciones de Quito (q_apidepot)
 *
 * NO modifica ninguna función existente: Quito queda EXACTAMENTE igual.
 * Si `base` no es Guayaquil, se llama al flujo de Quito de siempre.
 */

function _baseEsGYE(base) {
  var b = String(base || "").trim().toUpperCase();
  return (b === "GYE" || b === "GUAYAQUIL" || b === "G");
}

/* ── Extracción de stock ─────────────────────────────────────────────────── */

/**
 * Un solo cliente. Se pasa por _extraerStockConAlias para que también aquí
 * funcione el caso en que el ERP publica el stock bajo otro COD. CLIENTE
 * (credencial NOKIACNTLTE → código NOKIACNT). Si ese módulo no estuviera
 * cargado, se llama al flujo de siempre.
 */
function previsualizarStockRouter(base, cliente, listaCodigos, incluirVariantes) {
  var esGye = _baseEsGYE(base);
  if (typeof _extraerStockConAlias === "function") {
    return _extraerStockConAlias(esGye, cliente, listaCodigos, incluirVariantes, null);
  }
  return esGye
    ? previsualizarStockItsanet_GYE(cliente, listaCodigos, incluirVariantes)
    : previsualizarStockItsanet(cliente, listaCodigos, incluirVariantes);
}

/* ── Cronograma de códigos ───────────────────────────────────────────────── */

/**
 * Quién puede CARGAR el cronograma de códigos: el permiso `baseDatos`, que es
 * el que abre Panel → Base de datos (donde vive esa pantalla). Hoy lo tiene
 * solo Admin; los demás roles deben pedírselo.
 *
 * Nunca lanza: si el rol no se puede resolver se responde `false`, que es el
 * mensaje conservador ("solicítalo a un administrador").
 */
function _puedeCargarCronogramaCodigos() {
  try {
    var ctx = obtenerContextoUsuario();
    return !!(ctx && ctx.permisos && ctx.permisos.baseDatos);
  } catch (e) {
    return false;
  }
}

/**
 * Clientes que SÍ tienen códigos cargados en la sede. Sirve para orientar
 * cuando el pedido viene vacío: se ve de un vistazo si el cronograma está
 * cargado para otros clientes o si no hay ninguno todavía.
 */
function _clientesConCodigos(base) {
  try {
    var res = obtenerResumenCronCodigosRouter(base) || [];
    return res
      .map(function (r) { return String((r && r.cliente) || "").trim().toUpperCase(); })
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}

/**
 * Completa un resultado del cronograma con el contexto que el asistente
 * necesita para explicar qué hacer cuando no hay códigos: a quién pedirlos y
 * qué clientes sí los tienen. Si hay códigos, el resultado pasa intacto.
 */
function _conContextoCronograma(res, base, cliente, mes) {
  res = res || {};
  if (res.cliente == null) res.cliente = String(cliente || "").trim().toUpperCase();
  if (res.mes == null)     res.mes     = String(mes || "").trim().toUpperCase();
  if (res.existe) return res;

  res.puedeCargar        = _puedeCargarCronogramaCodigos();
  res.clientesConCodigos = _clientesConCodigos(base);
  return res;
}

function obtenerCodigosProgramadosRouter(base, cliente, mes) {
  var res = _baseEsGYE(base)
    ? obtenerCodigosProgramados_GYE(cliente, mes)
    : obtenerCodigosProgramados(cliente, mes);
  return _conContextoCronograma(res, base, cliente, mes);
}

function obtenerMesesDeCodigosRouter(base, cliente, listaSkus) {
  return _baseEsGYE(base)
    ? obtenerMesesDeCodigos_GYE(cliente, listaSkus)
    : obtenerMesesDeCodigos(cliente, listaSkus);
}

function actualizarCronogramaCodigosRouter(base, cliente, textoPegado) {
  return _baseEsGYE(base)
    ? actualizarCronogramaCodigos_GYE(cliente, textoPegado)
    : actualizarCronogramaCodigos(cliente, textoPegado);
}

function obtenerResumenCronCodigosRouter(base) {
  return _baseEsGYE(base)
    ? obtenerResumenCronCodigos_GYE()
    : obtenerResumenCronCodigos();
}

/* ── Credenciales API ────────────────────────────────────────────────────── */
function guardarCredencialAPIRouter(base, cliente, usuario, password) {
  return _baseEsGYE(base)
    ? guardarCredencialAPI_GYE(cliente, usuario, password)
    : guardarCredencialAPI(cliente, usuario, password);
}

function eliminarCredencialAPIRouter(base, cliente) {
  return _baseEsGYE(base)
    ? eliminarCredencialAPI_GYE(cliente)
    : eliminarCredencialAPI(cliente);
}

function listarClientesAPIRouter(base) {
  return _baseEsGYE(base)
    ? listarClientesAPI_GYE()
    : listarClientesAPI();
}
