/**
 * SUPABASE.gs — Cliente + migrador Sheets → Supabase (REST/Data API).
 * ---------------------------------------------------------------------------
 * Lee la URL y la llave desde Script Properties (NO en código ni en git):
 *   SUPABASE_URL       = https://pssgqoyemglauyzntzwl.supabase.co   (base, sin /rest/v1)
 *   SUPABASE_ANON_KEY  = <anon public key>
 *
 * Seguridad: usa la llave anon directo (fase DEV / migración inicial).
 * Antes de producción-permanente pondremos Railway/Edge Function delante.
 */

function _supabaseCfg() {
  var sp  = PropertiesService.getScriptProperties();
  var url = sp.getProperty("SUPABASE_URL");
  var key = sp.getProperty("SUPABASE_ANON_KEY");
  if (!url || !key) {
    throw new Error("Faltan SUPABASE_URL y/o SUPABASE_ANON_KEY en las Propiedades del Script.");
  }
  return { url: url.replace(/\/+$/, ""), key: key };
}

/** Llamada genérica a la REST API. path ej: "inventarios?select=*" */
function _supabaseFetch(path, method, body, prefer) {
  var c = _supabaseCfg();
  var opt = {
    method: method || "get",
    headers: {
      "apikey": c.key,
      "Authorization": "Bearer " + c.key,
      "Content-Type": "application/json",
      "Prefer": prefer || "return=representation"
    },
    muteHttpExceptions: true
  };
  if (body) opt.payload = JSON.stringify(body);
  var res = UrlFetchApp.fetch(c.url + "/rest/v1/" + path, opt);
  return { code: res.getResponseCode(), body: res.getContentText() };
}

/* ── PRUEBAS DE CONECTIVIDAD ──────────────────────────────────────────────── */
function probarSupabase() {
  var r = _supabaseFetch("inventarios", "post",
    { cliente: "PRUEBA_CONEXION", responsable: "bespinoza", avance: "test", base: "UIO" });
  Logger.log("INSERT -> HTTP " + r.code + "\n" + r.body);
  return r;
}
function leerInventariosSupabase() {
  var r = _supabaseFetch("inventarios?select=*&order=creado_en.desc", "get");
  Logger.log("SELECT -> HTTP " + r.code + "\n" + r.body);
  return r;
}

/* ── MIGRACIÓN: CLIENTES (distintos del PANEL) → tabla clientes ───────────── */
function migrarClientesASupabase() {
  var ss = (typeof _getSS === "function") ? _getSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("PANEL DE CONTROL");
  if (!sh) throw new Error("No existe la hoja PANEL DE CONTROL.");
  var v = sh.getDataRange().getValues();
  var head = v[0].map(function (h) { return String(h || "").trim().toUpperCase(); });
  var cCli = -1;
  for (var i = 0; i < head.length; i++) { if (head[i].indexOf("CLIENTE") !== -1) { cCli = i; break; } }
  if (cCli < 0) throw new Error("No encontré la columna CLIENTE en el PANEL.");
  var set = {};
  for (var r = 1; r < v.length; r++) { var c = String(v[r][cCli] || "").trim().toUpperCase(); if (c) set[c] = true; }
  var filas = Object.keys(set).map(function (n) { return { nombre: n, base: "UIO" }; });
  if (!filas.length) return { ok: true, migrados: 0, mensaje: "Sin clientes." };
  // upsert por (nombre, base) → re-ejecutable sin duplicar
  var res = _supabaseFetch("clientes?on_conflict=nombre,base", "post", filas,
    "return=minimal,resolution=merge-duplicates");
  Logger.log("CLIENTES -> HTTP " + res.code + " (" + filas.length + " únicos)\n" + res.body.substring(0, 200));
  return { ok: res.code >= 200 && res.code < 300, migrados: filas.length, code: res.code, body: res.body };
}

/* ── MIGRACIÓN: PANEL DE CONTROL → tabla inventarios (refresco completo) ──── */
function migrarPanelASupabase() {
  var ss = (typeof _getSS === "function") ? _getSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("PANEL DE CONTROL");
  if (!sh) throw new Error("No existe la hoja PANEL DE CONTROL.");
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return { ok: true, migradas: 0, mensaje: "Panel vacío." };

  var head = v[0].map(function (h) { return String(h || "").trim().toUpperCase(); });
  function col(keys) { for (var i = 0; i < head.length; i++) { for (var k = 0; k < keys.length; k++) { if (head[i].indexOf(keys[k]) !== -1) return i; } } return -1; }
  var cCli = col(["CLIENTE"]), cLink = col(["LINK", "ENLACE", "URL"]), cId = col(["ID"]),
      cIni = col(["INICIO"]), cFin = col(["FIN", "ENTREGA"]), cBase = col(["BASE", "BODEGA", "SEDE"]),
      cAva = col(["AVANCE", "ESTADO"]), cResp = col(["RESPONSABLE"]);
  if (cCli < 0) throw new Error("No encontré la columna CLIENTE en el PANEL.");

  function fecha(x) { return (x instanceof Date) ? Utilities.formatDate(x, "GMT-5", "yyyy-MM-dd") : null; }
  function txt(x) { var s = String(x || "").trim(); return s ? s : null; }

  var filas = [];
  for (var r = 1; r < v.length; r++) {
    var row = v[r]; var cli = txt(row[cCli]); if (!cli) continue;
    filas.push({
      cliente: cli,
      link:        cLink >= 0 ? txt(row[cLink]) : null,
      archivo_id:  cId   >= 0 ? txt(row[cId])   : null,
      fecha_inicio:cIni  >= 0 ? fecha(row[cIni]): null,
      fecha_fin:   cFin  >= 0 ? fecha(row[cFin]): null,
      base:       (cBase >= 0 ? txt(row[cBase]) : null) || "UIO",
      avance:      cAva  >= 0 ? txt(row[cAva])  : null,
      responsable: cResp >= 0 ? txt(row[cResp]) : null
    });
  }
  if (!filas.length) return { ok: true, migradas: 0, mensaje: "No hay filas con cliente." };

  // Refresco completo: borra todo y reinserta (re-ejecutable sin duplicar)
  var del = _supabaseFetch("inventarios?id=gt.0", "delete", null, "return=minimal");
  if (del.code >= 300) return { ok: false, error: "DELETE HTTP " + del.code + " " + del.body.substring(0, 150) };

  var total = 0, errores = [];
  for (var i = 0; i < filas.length; i += 200) {
    var lote = filas.slice(i, i + 200);
    var res = _supabaseFetch("inventarios", "post", lote, "return=minimal");
    if (res.code >= 200 && res.code < 300) total += lote.length;
    else errores.push("Lote " + i + ": HTTP " + res.code + " " + res.body.substring(0, 120));
  }
  Logger.log("PANEL migrado: " + total + "/" + filas.length + (errores.length ? ("\nERRORES:\n" + errores.join("\n")) : ""));
  return { ok: errores.length === 0, migradas: total, total: filas.length, errores: errores };
}
