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
function previsualizarStockRouter(base, cliente, listaCodigos, incluirVariantes) {
  return _baseEsGYE(base)
    ? previsualizarStockItsanet_GYE(cliente, listaCodigos, incluirVariantes)
    : previsualizarStockItsanet(cliente, listaCodigos, incluirVariantes);
}

/* ── Cronograma de códigos ───────────────────────────────────────────────── */
function obtenerCodigosProgramadosRouter(base, cliente, mes) {
  return _baseEsGYE(base)
    ? obtenerCodigosProgramados_GYE(cliente, mes)
    : obtenerCodigosProgramados(cliente, mes);
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
