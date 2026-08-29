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
  var r = _supabaseFetch("panel_de_control", "post",
    { cliente: "PRUEBA_CONEXION", responsable: "bespinoza", avance: "test", base: "UIO" });
  Logger.log("INSERT -> HTTP " + r.code + "\n" + r.body);
  return r;
}
function leerInventariosSupabase() {
  var r = _supabaseFetch("panel_de_control?select=*&order=creado_en.desc", "get");
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
      cIni = col(["INICIO"]), cFin = col(["FINAL", "FIN", "ENTREGA"]), cBase = col(["SEDE", "BASE", "BODEGA"]),
      cAva = col(["AVANCE", "ESTADO"]), cResp = col(["RESPONSABLE"]),
      cOrd = col(["ORDEN"]), cUC = col(["UNIDADES CONTADAS"]), cRC = col(["REFERENCIAS CONTADAS"]),
      cPC = col(["POSICIONES CONTADAS"]), cEU = col(["EFECTIVIDAD UNIDADES"]),
      cER = col(["EFECTIVIDAD REFERENCIAS"]), cEP = col(["EFECTIVIDAD POSICIONES"]),
      cObs = col(["OBSERVACIONES"]);
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
      responsable: cResp >= 0 ? txt(row[cResp]) : null,
      orden_email: cOrd >= 0 ? txt(row[cOrd]) : null,
      unidades_contadas:       cUC >= 0 ? _sbNum(row[cUC]) : null,
      referencias_contadas:    cRC >= 0 ? _sbNum(row[cRC]) : null,
      posiciones_contadas:     cPC >= 0 ? _sbNum(row[cPC]) : null,
      efectividad_unidades:    cEU >= 0 ? _sbNum(row[cEU]) : null,
      efectividad_referencias: cER >= 0 ? _sbNum(row[cER]) : null,
      efectividad_posiciones:  cEP >= 0 ? _sbNum(row[cEP]) : null,
      observaciones: cObs >= 0 ? txt(row[cObs]) : null,
      fila_origen: r + 1
    });
  }
  if (!filas.length) return { ok: true, migradas: 0, mensaje: "No hay filas con cliente." };

  // Refresco completo: borra todo y reinserta (re-ejecutable sin duplicar)
  var del = _supabaseFetch("panel_de_control?id=gt.0", "delete", null, "return=minimal");
  if (del.code >= 300) return { ok: false, error: "DELETE HTTP " + del.code + " " + del.body.substring(0, 150) };

  var total = 0, errores = [];
  for (var i = 0; i < filas.length; i += 200) {
    var lote = filas.slice(i, i + 200);
    var res = _supabaseFetch("panel_de_control", "post", lote, "return=minimal");
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

/** Índice de columna por nombre EXACTO de encabezado (normalizado). */
function _sbNorm(t) {
  return String(t === null || t === undefined ? "" : t)
    .toUpperCase().replace(/\s+/g, " ").trim()
    .replace(/[ÁÀÄÂ]/g, "A").replace(/[ÉÈËÊ]/g, "E").replace(/[ÍÌÏÎ]/g, "I")
    .replace(/[ÓÒÖÔ]/g, "O").replace(/[ÚÙÜÛ]/g, "U").replace(/Ñ/g, "N");
}
function _sbCol(head, keys) {
  var H = head.map(_sbNorm);
  for (var k = 0; k < keys.length; k++) {          // 1) coincidencia EXACTA
    var K = _sbNorm(keys[k]);
    for (var i = 0; i < H.length; i++) if (H[i] === K) return i;
  }
  for (var k2 = 0; k2 < keys.length; k2++) {       // 2) respaldo: empieza por
    var K2 = _sbNorm(keys[k2]);
    for (var j = 0; j < H.length; j++) if (H[j].indexOf(K2) === 0) return j;
  }
  return -1;
}
function _sbTxt(x) { var s = String(x === null || x === undefined ? "" : x).trim(); return s ? s : null; }
function _sbNum(x) {
  if (x === null || x === undefined || x === "") return null;
  if (typeof x === "number") return isNaN(x) ? null : x;
  var s = String(x).trim(); if (!s) return null;
  s = s.replace(/[%\s]/g, "");
  if (s.indexOf(",") !== -1 && s.indexOf(".") !== -1) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.indexOf(",") !== -1) s = s.replace(",", ".");
  var n = parseFloat(s); return isNaN(n) ? null : n;
}
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
      if (res.code >= 200 && res.code < 300) {
        enviadas += lote.length;
      } else {
        // El lote falló por alguna fila puntual: reintenta en sub-lotes y luego
        // fila a fila, para no perder 500 filas por un solo dato inválido.
        var rescatadas = 0, fallidas = [];
        for (var s1 = 0; s1 < lote.length; s1 += 50) {
          var sub = lote.slice(s1, s1 + 50);
          var r2 = _supabaseFetch(tabla, "post", sub, "return=minimal");
          if (r2.code >= 200 && r2.code < 300) { rescatadas += sub.length; continue; }
          for (var s2 = 0; s2 < sub.length; s2++) {
            var r3 = _supabaseFetch(tabla, "post", [sub[s2]], "return=minimal");
            if (r3.code >= 200 && r3.code < 300) rescatadas++;
            else {
              fallidas.push(sub[s2].fila_origen);
              if (errores.length < 10) {
                errores.push("Fila " + sub[s2].fila_origen + ": HTTP " + r3.code + " " +
                             r3.body.substring(0, 140));
              }
            }
          }
        }
        enviadas += rescatadas;
        if (fallidas.length) {
          Logger.log("Filas NO migradas de " + nombreHoja + " (" + fallidas.length + "): " +
                     fallidas.slice(0, 40).join(", ") + (fallidas.length > 40 ? " ..." : ""));
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

/* Mapeos compartidos por la migración y la sincronización automática. */
function _sbColsInventarios(head) {
      return {
        fIni: _sbCol(head, ["FECHA INICIO"]), fFin: _sbCol(head, ["FECHA FINAL"]),
        id: _sbCol(head, ["ID"]), linea: _sbCol(head, ["N DE LINEA"]),
        cli: _sbCol(head, ["CLIENTE"]), abc: _sbCol(head, ["ABC"]),
        sku: _sbCol(head, ["PRODUCTO"]), desc: _sbCol(head, ["DESCRIPCION DEL PRODUCTO"]),
        serie: _sbCol(head, ["SERIE"]), lote: _sbCol(head, ["LOTE"]),
        desp: _sbCol(head, ["N DESPACHO"]), part: _sbCol(head, ["N PARTIDA"]),
        cat: _sbCol(head, ["CAT_LOG"]), est: _sbCol(head, ["EST_MER"]),
        pos: _sbCol(head, ["POSICION"]), uni: _sbCol(head, ["UNI"]), depot: _sbCol(head, ["DEPOT"]),
        cFis: _sbCol(head, ["CONTEO FISICO"]), desf: _sbCol(head, ["DESFASE"]),
        rUni: _sbCol(head, ["RESULTADO UNIDADES"]), rSer: _sbCol(head, ["RESULTADO SERIES"]),
        c1: _sbCol(head, ["CONTEO NO. 1"]), c2: _sbCol(head, ["CONTEO NO. 2"]),
        cFin2: _sbCol(head, ["CONTEO FINAL"]), aju: _sbCol(head, ["AJUSTE"]),
        mot: _sbCol(head, ["MOTIVO"]), jus: _sbCol(head, ["JUSTIFICACION"]),
        obs: _sbCol(head, ["OBSERVACION"]), nPos: _sbCol(head, ["NUEVA POSICION"]),
        aDep: _sbCol(head, ["ACTUALIZACION DEPOT"])
      };
    }

function _sbMapInventarios(r, head, c) {
      function T(i) { return i >= 0 ? _sbTxt(r[i]) : null; }
      function N(i) { return i >= 0 ? _sbNum(r[i]) : null; }
      function F(i) { return i >= 0 ? _sbFecha(r[i]) : null; }
      var o = {
        fecha_inicio: F(c.fIni), fecha_final: F(c.fFin), archivo_id: T(c.id),
        n_linea: N(c.linea), cliente: T(c.cli), abc: T(c.abc), sku: T(c.sku),
        descripcion: T(c.desc), serie: T(c.serie), lote: T(c.lote), despacho: T(c.desp),
        partida: T(c.part), categoria: T(c.cat), estado: T(c.est), posicion: T(c.pos),
        unidad: T(c.uni), depot: T(c.depot), conteo_fisico: N(c.cFis), desfase: N(c.desf),
        resultado_unidades: T(c.rUni), resultado_series: T(c.rSer),
        conteo_n1: N(c.c1), conteo_n2: N(c.c2), conteo_final: N(c.cFin2), ajuste: N(c.aju),
        motivo: T(c.mot), justificacion: T(c.jus), observacion: T(c.obs),
        nueva_posicion: T(c.nPos), actualizacion_depot: T(c.aDep), base: "UIO"
      };
  if (!o.sku && !o.serie && !o.cliente) return null;
  return o;
}

function _sbColsRegistro(head) {
      return {
        act: _sbCol(head, ["ACTUADOR"]), fec: _sbCol(head, ["FECHA"]), hora: _sbCol(head, ["HORA"]),
        usr: _sbCol(head, ["USUARIO"]), mail: _sbCol(head, ["CORREO"]), id: _sbCol(head, ["ID"]),
        cli: _sbCol(head, ["CLIENTE"]), cod: _sbCol(head, ["CODIGO"]),
        pos: _sbCol(head, ["POSICION"]), cFis: _sbCol(head, ["CONTEO FISICO"]),
        rCon: _sbCol(head, ["RESULTADO CONTEO"]), c1: _sbCol(head, ["CONTEO N1"]),
        c2: _sbCol(head, ["CONTEO N2"]), c3: _sbCol(head, ["CONTEO N3"]), link: _sbCol(head, ["LINK"])
      };
    }

function _sbMapRegistro(r, head, c) {
      function T(i) { return i >= 0 ? _sbTxt(r[i]) : null; }
      function N(i) { return i >= 0 ? _sbNum(r[i]) : null; }
      var o = {
        actuador: T(c.act), fecha: c.fec >= 0 ? _sbFecha(r[c.fec]) : null, hora: T(c.hora),
        usuario: T(c.usr), correo: T(c.mail), archivo_id: T(c.id), cliente: T(c.cli),
        sku: T(c.cod), posicion: T(c.pos), conteo_fisico: N(c.cFis),
        resultado_conteo: T(c.rCon), conteo_n1: N(c.c1), conteo_n2: N(c.c2), conteo_n3: N(c.c3),
        link: T(c.link), base: "UIO"
      };
      var vacio = true;
      for (var k in o) { if (k !== "base" && o[k] !== null) { vacio = false; break; } }
  return vacio ? null : o;
}

/** Hoja INVENTARIOS (30 col reales) -> tabla inventarios. */
function migrarInventariosASupabase() {
  return _sbMigrarHoja("INVENTARIOS", "inventarios", "SB_PROG_INV",
    _sbColsInventarios, _sbMapInventarios);
}

/** Hoja REGISTRO (16 col reales) -> tabla registro. */
function migrarRegistroASupabase() {
  return _sbMigrarHoja("REGISTRO", "registro", "SB_PROG_REG",
    _sbColsRegistro, _sbMapRegistro);
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

/**
 * VERIFICADOR: muestra a qué columna real quedó apuntando cada campo y un
 * valor de ejemplo (fila 2). Ejecútalo ANTES de migrar para confirmar el mapeo.
 */
function verificarMapeoSupabase() {
  var ss = (typeof _getSS === "function") ? _getSS() : SpreadsheetApp.getActiveSpreadsheet();

  function chequear(hoja, mapa) {
    var sh = ss.getSheetByName(hoja);
    if (!sh) { Logger.log(hoja + ": NO EXISTE"); return; }
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var ej   = sh.getLastRow() > 1 ? sh.getRange(2, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    var out = ["── " + hoja + " ──"];
    for (var campo in mapa) {
      var i = _sbCol(head, mapa[campo]);
      out.push("  " + campo + ": " + (i < 0 ? "*** NO ENCONTRADA ***"
        : ('col ' + (i + 1) + ' "' + head[i] + '" | ej: ' + JSON.stringify(ej[i]))));
    }
    Logger.log(out.join("\n"));
  }

  chequear("INVENTARIOS", {
    fecha_inicio: ["FECHA INICIO"], fecha_final: ["FECHA FINAL"], archivo_id: ["ID"],
    n_linea: ["N DE LINEA"], cliente: ["CLIENTE"], abc: ["ABC"], sku: ["PRODUCTO"],
    descripcion: ["DESCRIPCION DEL PRODUCTO"], serie: ["SERIE"], lote: ["LOTE"],
    despacho: ["N DESPACHO"], partida: ["N PARTIDA"], categoria: ["CAT_LOG"],
    estado: ["EST_MER"], posicion: ["POSICION"], unidad: ["UNI"], depot: ["DEPOT"],
    conteo_fisico: ["CONTEO FISICO"], desfase: ["DESFASE"],
    resultado_unidades: ["RESULTADO UNIDADES"], resultado_series: ["RESULTADO SERIES"],
    conteo_n1: ["CONTEO NO. 1"], conteo_n2: ["CONTEO NO. 2"], conteo_final: ["CONTEO FINAL"],
    ajuste: ["AJUSTE"], motivo: ["MOTIVO"], justificacion: ["JUSTIFICACION"],
    observacion: ["OBSERVACION"], nueva_posicion: ["NUEVA POSICION"],
    actualizacion_depot: ["ACTUALIZACION DEPOT"]
  });

  chequear("REGISTRO", {
    actuador: ["ACTUADOR"], fecha: ["FECHA"], hora: ["HORA"], usuario: ["USUARIO"],
    correo: ["CORREO"], archivo_id: ["ID"], cliente: ["CLIENTE"], sku: ["CODIGO"],
    posicion: ["POSICION"], conteo_fisico: ["CONTEO FISICO"],
    resultado_conteo: ["RESULTADO CONTEO"], conteo_n1: ["CONTEO N1"],
    conteo_n2: ["CONTEO N2"], conteo_n3: ["CONTEO N3"], link: ["LINK"]
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   SINCRONIZACIÓN AUTOMÁTICA (INCREMENTAL) — Sheets → Supabase
   ---------------------------------------------------------------------------
   NO modifica ninguna función existente del sistema. Un disparador horario
   revisa si las hojas crecieron y envía SOLO las filas nuevas.
   El PANEL (313 filas) se refresca completo porque también cambia en filas
   existentes (avance, efectividad, fechas).
   ═══════════════════════════════════════════════════════════════════════════ */

/** Envía a Supabase solo las filas añadidas desde la última sincronización. */
function _sbSyncIncremental(nombreHoja, tabla, propUltimaFila, colsFn, mapFn) {
  var sp = PropertiesService.getScriptProperties();
  var ss = (typeof _getSS === "function") ? _getSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(nombreHoja);
  if (!sh) return { ok: false, mensaje: nombreHoja + " no existe." };

  var ultima = sh.getLastRow(), ancho = sh.getLastColumn();
  var yaVisto = parseInt(sp.getProperty(propUltimaFila) || "1", 10);
  if (ultima <= yaVisto) return { ok: true, nuevas: 0 };   // nada nuevo

  var head = sh.getRange(1, 1, 1, ancho).getValues()[0]
               .map(function (h) { return String(h || "").trim().toUpperCase(); });
  var cols = colsFn(head);

  var desde = yaVisto + 1, enviadas = 0, fallidas = 0;
  while (desde <= ultima) {
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
        for (var j = 0; j < lote.length; j++) {   // rescate fila a fila
          var r1 = _supabaseFetch(tabla, "post", [lote[j]], "return=minimal");
          if (r1.code >= 200 && r1.code < 300) enviadas++; else fallidas++;
        }
      }
    }
    desde += n;
  }
  sp.setProperty(propUltimaFila, String(ultima));
  return { ok: true, nuevas: enviadas, fallidas: fallidas, hasta: ultima };
}

/** Sincroniza INVENTARIOS (solo filas nuevas). */
function sincronizarInventariosSupabase() {
  return _sbSyncIncremental("INVENTARIOS", "inventarios", "SB_SYNC_INV",
    _sbColsInventarios, _sbMapInventarios);
}

/** Sincroniza REGISTRO (solo filas nuevas). */
function sincronizarRegistroSupabase() {
  return _sbSyncIncremental("REGISTRO", "registro", "SB_SYNC_REG",
    _sbColsRegistro, _sbMapRegistro);
}

/**
 * TAREA HORARIA: sincroniza todo. La ejecuta el disparador.
 * PANEL completo (cambia en filas existentes) + INVENTARIOS/REGISTRO incremental.
 */
function sincronizarTodoSupabase() {
  var res = { hora: new Date().toISOString() };
  try { res.panel = migrarPanelASupabase(); }           catch (e) { res.panel = { error: e.message }; }
  try { res.inventarios = sincronizarInventariosSupabase(); } catch (e) { res.inventarios = { error: e.message }; }
  try { res.registro = sincronizarRegistroSupabase(); } catch (e) { res.registro = { error: e.message }; }
  // El cronograma cambia en filas existentes (estado, entrega, %), así que va completo.
  try { res.cronograma = migrarCronogramaASupabase(); } catch (e) { res.cronograma = { error: e.message }; }
  try { migrarEquipoASupabase(); } catch (e) {}
  try { migrarClientesASupabase(); } catch (e) {}
  Logger.log("SYNC: " + JSON.stringify(res));
  return res;
}

/** Instala el disparador horario (ejecutar UNA vez desde el editor). */
function instalarSyncSupabase() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "sincronizarTodoSupabase") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sincronizarTodoSupabase").timeBased().everyHours(1).create();
  // Punto de partida: lo ya migrado, para no reenviar el histórico.
  var sp = PropertiesService.getScriptProperties();
  var ss = (typeof _getSS === "function") ? _getSS() : SpreadsheetApp.getActiveSpreadsheet();
  ["INVENTARIOS", "REGISTRO"].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh) sp.setProperty(n === "INVENTARIOS" ? "SB_SYNC_INV" : "SB_SYNC_REG", String(sh.getLastRow()));
  });
  Logger.log("✓ Sincronización automática instalada (cada hora).");
  return { ok: true };
}

/** Desinstala el disparador horario. */
function desinstalarSyncSupabase() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "sincronizarTodoSupabase") { ScriptApp.deleteTrigger(t); n++; }
  });
  Logger.log("Disparadores eliminados: " + n);
  return { ok: true, eliminados: n };
}

/** Estado de la sincronización: hasta qué fila se envió y cuántas faltan. */
function estadoSyncSupabase() {
  var sp = PropertiesService.getScriptProperties();
  var ss = (typeof _getSS === "function") ? _getSS() : SpreadsheetApp.getActiveSpreadsheet();
  var activo = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === "sincronizarTodoSupabase";
  });
  Logger.log("Disparador horario: " + (activo ? "ACTIVO" : "NO instalado"));
  [["INVENTARIOS", "SB_SYNC_INV"], ["REGISTRO", "SB_SYNC_REG"]].forEach(function (p) {
    var sh = ss.getSheetByName(p[0]);
    var vis = parseInt(sp.getProperty(p[1]) || "1", 10);
    if (sh) Logger.log("  " + p[0] + ": hoja=" + sh.getLastRow() + " sincronizado=" + vis +
                       " pendientes=" + Math.max(0, sh.getLastRow() - vis));
  });
  return { activo: activo };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CRONOGRAMA Y EQUIPO OPERATIVO → Supabase
   ---------------------------------------------------------------------------
   El cronograma es la fuente de las mediciones de cumplimiento (programado vs
   ejecutado, atrasos, carga por operario). Se lee por POSICIÓN de columna
   porque su cabecera está en la fila 8 y los datos empiezan en la 9.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Hoja CRONOGRAMA - 2026 → tabla cronograma (refresco completo). */
function migrarCronogramaASupabase() {
  var ss = (typeof _getSS === "function") ? _getSS() : SpreadsheetApp.getActiveSpreadsheet();
  var nombre = (typeof CRON_CFG === "object" && CRON_CFG.HOJA_CRONOGRAMA) || "CRONOGRAMA - 2026";
  var sh = ss.getSheetByName(nombre);
  if (!sh) throw new Error("No existe la hoja " + nombre + ".");

  var filaIni = (typeof CRON_CFG === "object" && CRON_CFG.CR_FILA_INI) || 9;
  var ultima = sh.getLastRow();
  if (ultima < filaIni) return { ok: true, migradas: 0, mensaje: "Cronograma vacío." };

  var v = sh.getRange(filaIni, 1, ultima - filaIni + 1, 20).getValues();
  var filas = [];
  for (var i = 0; i < v.length; i++) {
    var r = v[i];
    var cli = _sbTxt(r[4]);                       // E cliente
    var tit = _sbTxt(r[3]);                       // D título
    if (!cli && !tit) continue;                   // fila vacía
    filas.push({
      numero:      _sbNum(r[1]),                  // B
      anio:        _sbNum(r[2]),                  // C
      titulo:      tit,                           // D
      cliente:     cli,                           // E
      categoria:   _sbTxt(r[5]),                  // F
      mes:         _sbTxt(r[6]),                  // G
      frecuencia:  _sbTxt(r[7]),                  // H
      responsable: _sbTxt(r[8]),                  // I
      prioridad:   _sbTxt(r[9]),                  // J
      observacion: _sbTxt(r[10]),                 // K
      fecha:       _sbFecha(r[11]),               // L programada
      estado:      _sbTxt(r[12]),                 // M
      fecha_entrega: _sbFecha(r[13]),             // N
      duracion:    _sbNum(r[14]),                 // O
      porcentaje:  _sbNum(r[15]),                 // P
      archivo_id:  _sbTxt(r[16]),                 // Q
      base: "UIO",
      fila_origen: filaIni + i
    });
  }
  if (!filas.length) return { ok: true, migradas: 0, mensaje: "Sin eventos." };

  var del = _supabaseFetch("cronograma?id=gt.0", "delete", null, "return=minimal");
  if (del.code >= 300) return { ok: false, error: "DELETE HTTP " + del.code + " " + del.body.substring(0, 150) };

  var total = 0, errores = [];
  for (var k = 0; k < filas.length; k += 200) {
    var lote = filas.slice(k, k + 200);
    var res = _supabaseFetch("cronograma", "post", lote, "return=minimal");
    if (res.code >= 200 && res.code < 300) total += lote.length;
    else errores.push("Lote " + k + ": HTTP " + res.code + " " + res.body.substring(0, 140));
  }
  Logger.log("CRONOGRAMA migrado: " + total + "/" + filas.length +
             (errores.length ? ("\nERRORES:\n" + errores.join("\n")) : ""));
  return { ok: errores.length === 0, migradas: total, total: filas.length, errores: errores };
}

/** Hoja EQUIPO_OPERATIVO → tabla equipo (refresco completo). */
function migrarEquipoASupabase() {
  var ss = (typeof _getSS === "function") ? _getSS() : SpreadsheetApp.getActiveSpreadsheet();
  var nombre = (typeof CRON_CFG === "object" && CRON_CFG.HOJA_EQUIPO) || "EQUIPO_OPERATIVO";
  var sh = ss.getSheetByName(nombre);
  if (!sh) return { ok: true, migradas: 0, mensaje: "No existe " + nombre + "." };
  if (sh.getLastRow() < 2) return { ok: true, migradas: 0, mensaje: "Equipo vacío." };

  var v = sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(5, sh.getLastColumn())).getValues();
  var filas = [];
  for (var i = 0; i < v.length; i++) {
    var n = _sbTxt(v[i][0]);
    if (!n) continue;
    filas.push({
      nombre: n, email: _sbTxt(v[i][1]), rol: _sbTxt(v[i][2]),
      telefono: _sbTxt(v[i][3]),
      activo: !/^(no|false|0)$/i.test(String(v[i][4] || "").trim()),
      base: "UIO", fila_origen: i + 2
    });
  }
  if (!filas.length) return { ok: true, migradas: 0, mensaje: "Sin integrantes." };

  var del = _supabaseFetch("equipo?id=gt.0", "delete", null, "return=minimal");
  if (del.code >= 300) return { ok: false, error: "DELETE HTTP " + del.code };
  var res = _supabaseFetch("equipo", "post", filas, "return=minimal");
  Logger.log("EQUIPO migrado -> HTTP " + res.code + " (" + filas.length + ")");
  return { ok: res.code >= 200 && res.code < 300, migradas: filas.length, code: res.code };
}
