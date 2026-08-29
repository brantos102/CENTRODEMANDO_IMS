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

/* ═══════════════════════════════════════════════════════════════════════════
   MIGRACIÓN DE HOJAS GRANDES (INVENTARIOS / REGISTRO) — REANUDABLE
   Apps Script corta a los ~6 min. Estas funciones guardan el progreso y
   continúan donde quedaron: vuelve a ejecutarlas hasta ver "COMPLETADO".
   Solo LEEN la hoja; nunca la modifican.
   ═══════════════════════════════════════════════════════════════════════════ */

var SB_LOTE      = 500;      // filas por request a Supabase
var SB_MAX_SEG   = 280;      // ~4.6 min: corta antes del límite de 6 min

/** Detecta el índice de una columna por palabras clave en el encabezado. */
function _sbCol(head, keys) {
  for (var i = 0; i < head.length; i++) {
    for (var k = 0; k < keys.length; k++) {
      if (head[i].indexOf(keys[k]) !== -1) return i;
    }
  }
  return -1;
}
function _sbTxt(x) { var s = String(x === null || x === undefined ? "" : x).trim(); return s ? s : null; }
function _sbNum(x) { var n = parseFloat(String(x).replace(",", ".")); return isNaN(n) ? null : n; }
function _sbFecha(x) {
  if (x instanceof Date) return x.toISOString();
  var s = String(x || "").trim(); if (!s) return null;
  var d = new Date(s); return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Motor genérico reanudable.
 * mapFn(row, head, cols) -> objeto para Supabase (o null para saltar la fila).
 */
function _sbMigrarHoja(nombreHoja, tabla, propProgreso, colsFn, mapFn) {
  var t0 = new Date().getTime();
  var sp = PropertiesService.getScriptProperties();
  var ss = (typeof _getSS === "function") ? _getSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(nombreHoja);
  if (!sh) throw new Error("No existe la hoja " + nombreHoja + ".");

  var ultima = sh.getLastRow(), ancho = sh.getLastColumn();
  if (ultima < 2) return { ok: true, mensaje: nombreHoja + " vacía." };

  var head = sh.getRange(1, 1, 1, ancho).getValues()[0]
               .map(function (h) { return String(h || "").trim().toUpperCase(); });
  var cols = colsFn(head);

  var desde = parseInt(sp.getProperty(propProgreso) || "2", 10);
  if (desde <= 2) {  // primera pasada: limpia la tabla destino
    var del = _supabaseFetch(tabla + "?id=gt.0", "delete", null, "return=minimal");
    if (del.code >= 300) return { ok: false, error: "DELETE HTTP " + del.code + " " + del.body.substring(0, 150) };
    desde = 2;
  }

  var enviadas = 0, errores = [];
  while (desde <= ultima) {
    if ((new Date().getTime() - t0) / 1000 > SB_MAX_SEG) {
      sp.setProperty(propProgreso, String(desde));
      Logger.log("PAUSA " + nombreHoja + ": va por la fila " + desde + " de " + ultima +
                 ". Vuelve a EJECUTAR esta misma función para continuar.");
      return { ok: true, parcial: true, siguienteFila: desde, ultima: ultima, enviadas: enviadas };
    }
    var n = Math.min(SB_LOTE, ultima - desde + 1);
    var vals = sh.getRange(desde, 1, n, ancho).getValues();
    var lote = [];
    for (var i = 0; i < vals.length; i++) {
      var obj = mapFn(vals[i], head, cols);
      if (obj) { obj.fila_origen = desde + i; lote.push(obj); }
    }
    if (lote.length) {
      var res = _supabaseFetch(tabla, "post", lote, "return=minimal");
      if (res.code >= 200 && res.code < 300) enviadas += lote.length;
      else {
        errores.push("Fila " + desde + ": HTTP " + res.code + " " + res.body.substring(0, 120));
        if (errores.length >= 3) {
          sp.setProperty(propProgreso, String(desde));
          Logger.log("ERRORES en " + nombreHoja + ":\n" + errores.join("\n"));
          return { ok: false, errores: errores, siguienteFila: desde };
        }
      }
    }
    desde += n;
  }
  sp.deleteProperty(propProgreso);
  Logger.log("COMPLETADO " + nombreHoja + " -> " + tabla + ": " + enviadas + " filas enviadas." +
             (errores.length ? ("\nAvisos:\n" + errores.join("\n")) : ""));
  return { ok: errores.length === 0, completado: true, enviadas: enviadas, errores: errores };
}

/** Hoja INVENTARIOS (17 col formato rM) -> tabla inventarios_detalle. */
function migrarInventariosASupabase() {
  return _sbMigrarHoja("INVENTARIOS", "inventarios_detalle", "SB_PROG_INV",
    function (head) {
      return {
        archivo: _sbCol(head, ["ARCHIVO", "ID ARCHIVO"]),
        cli: _sbCol(head, ["CLIENTE"]), sku: _sbCol(head, ["COD. PRODUCTO", "SKU", "CODIGO", "PRODUCTO"]),
        desc: _sbCol(head, ["DESCRIPCION"]), serie: _sbCol(head, ["SERIE"]), lote: _sbCol(head, ["LOTE"]),
        desp: _sbCol(head, ["DESPACHO"]), part: _sbCol(head, ["PARTIDA"]), cat: _sbCol(head, ["CAT"]),
        est: _sbCol(head, ["EST"]), pos: _sbCol(head, ["POSICION", "UBICACION"]),
        uni: _sbCol(head, ["UNIDAD"]), cant: _sbCol(head, ["CANTIDAD"])
      };
    },
    function (r, head, c) {
      // Formato rM por posición cuando los encabezados no se reconocen.
      var usarRm = (c.sku < 0 && r.length >= 17);
      var o = usarRm ? {
        cliente: _sbTxt(r[4]), sku: _sbTxt(r[6]), descripcion: _sbTxt(r[7]), serie: _sbTxt(r[8]),
        lote: _sbTxt(r[9]), despacho: _sbTxt(r[10]), partida: _sbTxt(r[11]), categoria: _sbTxt(r[12]),
        estado: _sbTxt(r[13]), posicion: _sbTxt(r[14]), unidad: _sbTxt(r[15]), cantidad: _sbNum(r[16])
      } : {
        archivo_id: c.archivo >= 0 ? _sbTxt(r[c.archivo]) : null,
        cliente: c.cli >= 0 ? _sbTxt(r[c.cli]) : null, sku: c.sku >= 0 ? _sbTxt(r[c.sku]) : null,
        descripcion: c.desc >= 0 ? _sbTxt(r[c.desc]) : null, serie: c.serie >= 0 ? _sbTxt(r[c.serie]) : null,
        lote: c.lote >= 0 ? _sbTxt(r[c.lote]) : null, despacho: c.desp >= 0 ? _sbTxt(r[c.desp]) : null,
        partida: c.part >= 0 ? _sbTxt(r[c.part]) : null, categoria: c.cat >= 0 ? _sbTxt(r[c.cat]) : null,
        estado: c.est >= 0 ? _sbTxt(r[c.est]) : null, posicion: c.pos >= 0 ? _sbTxt(r[c.pos]) : null,
        unidad: c.uni >= 0 ? _sbTxt(r[c.uni]) : null, cantidad: c.cant >= 0 ? _sbNum(r[c.cant]) : null
      };
      if (!o.sku && !o.serie && !o.cliente) return null;   // fila vacía
      o.base = "UIO";
      return o;
    });
}

/** Hoja REGISTRO (bitácora) -> tabla registro. */
function migrarRegistroASupabase() {
  return _sbMigrarHoja("REGISTRO", "registro", "SB_PROG_REG",
    function (head) {
      return {
        archivo: _sbCol(head, ["ARCHIVO", "ID ARCHIVO"]), cli: _sbCol(head, ["CLIENTE"]),
        usr: _sbCol(head, ["USUARIO", "OPERARIO", "RESPONSABLE"]), acc: _sbCol(head, ["ACCION", "EVENTO", "TIPO"]),
        sku: _sbCol(head, ["COD. PRODUCTO", "SKU", "CODIGO", "PRODUCTO"]), serie: _sbCol(head, ["SERIE"]),
        pos: _sbCol(head, ["POSICION", "UBICACION"]), cant: _sbCol(head, ["CANTIDAD"]),
        fec: _sbCol(head, ["FECHA", "TIMESTAMP", "HORA"]), det: _sbCol(head, ["DETALLE", "OBSERV", "NOTA"])
      };
    },
    function (r, head, c) {
      var o = {
        archivo_id: c.archivo >= 0 ? _sbTxt(r[c.archivo]) : null,
        cliente: c.cli >= 0 ? _sbTxt(r[c.cli]) : null, usuario: c.usr >= 0 ? _sbTxt(r[c.usr]) : null,
        accion: c.acc >= 0 ? _sbTxt(r[c.acc]) : null, sku: c.sku >= 0 ? _sbTxt(r[c.sku]) : null,
        serie: c.serie >= 0 ? _sbTxt(r[c.serie]) : null, posicion: c.pos >= 0 ? _sbTxt(r[c.pos]) : null,
        cantidad: c.cant >= 0 ? _sbNum(r[c.cant]) : null, fecha: c.fec >= 0 ? _sbFecha(r[c.fec]) : null,
        detalle: c.det >= 0 ? _sbTxt(r[c.det]) : null, base: "UIO"
      };
      var vacio = true;
      for (var k in o) { if (k !== "base" && o[k] !== null) { vacio = false; break; } }
      return vacio ? null : o;
    });
}

/** Reinicia el progreso si quieres volver a migrar desde cero. */
function reiniciarProgresoMigracion() {
  var sp = PropertiesService.getScriptProperties();
  sp.deleteProperty("SB_PROG_INV"); sp.deleteProperty("SB_PROG_REG");
  Logger.log("Progreso reiniciado. La próxima ejecución empieza desde la fila 2.");
}

/** Diagnóstico: tamaño de las hojas y encabezados detectados. */
function diagnosticoHojasSupabase() {
  var ss = (typeof _getSS === "function") ? _getSS() : SpreadsheetApp.getActiveSpreadsheet();
  ["PANEL DE CONTROL", "INVENTARIOS", "REGISTRO"].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (!sh) { Logger.log(n + ": NO EXISTE"); return; }
    var head = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    Logger.log(n + ": filas con datos=" + sh.getLastRow() + " columnas=" + sh.getLastColumn() +
               "\n   encabezados: " + head.join(" | "));
  });
}
