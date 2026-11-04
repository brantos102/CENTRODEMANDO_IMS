/**
 * DIAGNOSTICO_ERP.gs — Ver qué devuelve realmente la API antes de filtrar.
 * ---------------------------------------------------------------------------
 * Cuando una extracción "no trae datos" puede ser por tres motivos muy
 * distintos, y estas funciones los separan:
 *   · la API no responde o rechaza las credenciales  → HTTP != 200
 *   · la bodega devuelve vacío                        → 0 filas
 *   · sí hay filas, pero el filtro de cliente las descarta → códigos distintos
 *
 * Solo consultan; no escriben nada.
 */

/**
 * Muestra la respuesta CRUDA de la sede indicada, sin filtrar por cliente.
 * Uso: cambia las dos constantes y ejecuta.
 */
function diagnosticarERP() {
  var SEDE    = "GYE";     // "UIO" (q_apidepot) o "GYE" (g_apidepot)
  var CLIENTE = "NOKIA";   // cliente con el que se pide el token

  var esGye = String(SEDE).toUpperCase() === "GYE";
  var base  = esGye ? ITSANET_BASE_GYE : ITSANET_BASE;
  var out   = ["── DIAGNÓSTICO " + SEDE + " · " + base + " ──"];

  // 1) Token
  var token;
  try {
    token = esGye ? obtenerORenovarTokenWMS_GYE(CLIENTE) : obtenerORenovarTokenWMS(CLIENTE);
    out.push("Token: OK (" + String(token).substring(0, 12) + "…)");
  } catch (e) {
    out.push("Token: FALLÓ → " + e.message);
    Logger.log(out.join("\n"));
    return { ok: false, etapa: "token", error: e.message };
  }

  // 2) Stock crudo
  var r = esGye ? consultarStockItsanet_GYE(CLIENTE) : consultarStockItsanet(CLIENTE);
  out.push("HTTP: " + r.code + " · tamaño del cuerpo: " + (r.body ? r.body.length : 0) + " caracteres");

  if (r.code !== 200) {
    out.push("Respuesta: " + String(r.body).substring(0, 400));
    Logger.log(out.join("\n"));
    return { ok: false, etapa: "http", code: r.code };
  }

  var j = null;
  try { j = JSON.parse(r.body); }
  catch (e) {
    out.push("El cuerpo no es JSON válido. Primeros 400 caracteres:\n" + String(r.body).substring(0, 400));
    Logger.log(out.join("\n"));
    return { ok: false, etapa: "json" };
  }

  var arr = Array.isArray(j) ? j : (j.Result || j.result || j.data || []);
  out.push("Filas recibidas: " + arr.length);

  if (!arr.length) {
    out.push("La bodega no devolvió filas para este cliente/credencial.");
    Logger.log(out.join("\n"));
    return { ok: true, filas: 0 };
  }

  // 3) Qué códigos de cliente vienen realmente (esto revela por qué el filtro descarta)
  var porCliente = {};
  for (var i = 0; i < arr.length; i++) {
    var c = String((arr[i] || {})["COD. CLIENTE"] || "").trim().toUpperCase() || "(vacío)";
    porCliente[c] = (porCliente[c] || 0) + 1;
  }
  var lista = Object.keys(porCliente).sort(function (a, b) { return porCliente[b] - porCliente[a]; });
  out.push("\nCÓDIGOS DE CLIENTE PRESENTES (" + lista.length + "):");
  lista.forEach(function (c) {
    var pasa = _clienteCoincideItsanet(c, CLIENTE);
    out.push("  " + (pasa ? "✓" : "✕") + " " + c + " → " + porCliente[c] + " filas" +
             (pasa ? "" : "   (el filtro lo DESCARTA con \"" + CLIENTE + "\")"));
  });

  out.push("\nCampos de la primera fila:\n  " + Object.keys(arr[0]).join(" | "));
  out.push("\nEjemplo:\n  " + JSON.stringify(arr[0]).substring(0, 500));

  Logger.log(out.join("\n"));
  return { ok: true, filas: arr.length, clientes: lista };
}

/**
 * Lista los códigos de cliente disponibles en una sede, con su número de filas.
 * Útil para saber con qué nombre exacto pedir la extracción.
 */
function listarClientesConStock() {
  var SEDE    = "GYE";     // "UIO" o "GYE"
  var CLIENTE = "NOKIA";   // cualquier cliente con credencial en esa sede

  var esGye = String(SEDE).toUpperCase() === "GYE";
  var r = esGye ? consultarStockItsanet_GYE(CLIENTE) : consultarStockItsanet(CLIENTE);
  if (r.code !== 200) throw new Error("HTTP " + r.code + ": " + String(r.body).substring(0, 200));

  var j = JSON.parse(r.body);
  var arr = Array.isArray(j) ? j : (j.Result || j.result || j.data || []);

  var cnt = {};
  arr.forEach(function (o) {
    var c = String((o || {})["COD. CLIENTE"] || "").trim().toUpperCase() || "(vacío)";
    cnt[c] = (cnt[c] || 0) + 1;
  });

  var filas = Object.keys(cnt).sort().map(function (c) { return c + "  →  " + cnt[c] + " filas"; });
  Logger.log("CLIENTES CON STOCK EN " + SEDE + " (" + filas.length + "):\n  " + filas.join("\n  "));
  return cnt;
}
