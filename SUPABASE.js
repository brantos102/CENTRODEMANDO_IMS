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
        id: _sbCol(head, ["ID"]), origen: _sbCol(head, ["ORIGEN_DRIVE"]), linea: _sbCol(head, ["N DE LINEA"]),
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
  if (c.origen >= 0) o.origen_drive = T(c.origen);
  if (!o.sku && !o.serie && !o.cliente) return null;
  return o;
}

function _sbColsRegistro(head) {
      return {
        act: _sbCol(head, ["ACTUADOR"]), fec: _sbCol(head, ["FECHA"]), hora: _sbCol(head, ["HORA"]),
        usr: _sbCol(head, ["USUARIO"]), mail: _sbCol(head, ["CORREO"]), id: _sbCol(head, ["ID"]),
        cli: _sbCol(head, ["CLIENTE"]), origen: _sbCol(head, ["ORIGEN_DRIVE"]), cod: _sbCol(head, ["CODIGO"]),
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
  return reconciliarInventariosSupabase();
}

/** Hoja REGISTRO (16 col reales) -> tabla registro. */
function migrarRegistroASupabase() {
  return reconciliarRegistroSupabase();
}

/** Reinicia el progreso si quieres volver a migrar desde cero. */
function reiniciarProgresoMigracion() {
  var sp = PropertiesService.getScriptProperties();
  sp.deleteProperty("SB_PROG_INV"); sp.deleteProperty("SB_PROG_REG");
  reiniciarReconciliacionSupabase();
  Logger.log("Progreso reiniciado. La próxima ejecución reconcilia desde el primer archivo.");
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

/* ═══════════════════════════════════════════════════════════════════════════
   SINCRONIZACIÓN POR ARCHIVO — la que sí aguanta una consolidación
   ---------------------------------------------------------------------------
   _sbSyncIncremental recuerda "hasta qué FILA envié" y manda de ahí en
   adelante. Eso funciona mientras la hoja solo crezca por abajo, pero
   INVENTARIOS y REGISTRO no crecen: la consolidación los vacía y los reescribe
   enteros. Después de consolidar, el puntero queda apuntando a un contenido
   que ya no existe, y pasa una de dos:

     · la hoja quedó con MENOS filas  -> ultima <= yaVisto -> no envía nunca
       más nada, y Supabase se queda congelado en los datos viejos;
     · la hoja quedó con MÁS filas    -> envía solo la cola, y Supabase termina
       con las filas viejas MÁS las nuevas, mezcladas.

   En los dos casos Power BI lee algo que no es lo que dice la hoja. Por eso la
   sincronización se hace por ARCHIVO, no por posición: para cada archivo
   presente en la hoja se borra lo suyo en Supabase y se vuelve a insertar, así
   la tabla refleja exactamente lo consolidado.

   Lo que NO está en la hoja no se toca: Supabase conserva los años ya
   archivados. Es a propósito — es lo que lo convierte en el histórico.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Bloques contiguos por archivo: [{id, fila, n}]. Lee solo la columna ID. */
function _sbBloquesPorArchivo(sh, colId) {
  var ultima = sh.getLastRow();
  if (ultima < 2) return [];
  var col = sh.getRange(2, colId + 1, ultima - 1, 1).getValues();
  var grupos = Object.create(null), orden = [];
  for (var i = 0; i < col.length; i++) {
    var id = String(col[i][0] || "").trim();
    if (!grupos[id]) {
      grupos[id] = { id: id, n: 0, bloques: [] };
      orden.push(grupos[id]);
    }
    var grupo = grupos[id], bloques = grupo.bloques, anterior = bloques[bloques.length - 1];
    if (anterior && anterior.fila + anterior.n === i + 2) anterior.n++;
    else bloques.push({ fila: i + 2, n: 1 });
    grupo.n++;
  }
  return orden;
}

/* Mismo lock que el consolidador: no leer un lote parcial ni sincronizar dos
   veces en paralelo. La marca se emite solo tras conciliar fuentes y filas. */
function _sbExigirConsolidadoVerificado(nombreHoja) {
  var sp = PropertiesService.getScriptProperties();
  var run = sp.getProperty("CONSOL_RUN_TOKEN");
  if (!run || sp.getProperty("CONSOL_KPI_RUN") !== run || sp.getProperty("CONSOL_STATUS") !== "COMPLETADO") {
    throw new Error("Supabase pausado: ejecuta y completa una consolidación con validación KPI.");
  }
  var sh = _getSS().getSheetByName("INVENTARIOS");
  if (!sh || Math.max(0, sh.getLastRow() - 1) !== Number(sp.getProperty("CONSOL_KPI_FILAS"))) {
    throw new Error("Supabase pausado: las filas de INVENTARIOS cambiaron después de la validación.");
  }
  if (nombreHoja === "REGISTRO") {
    var reg = _getSS().getSheetByName("REGISTRO");
    if (sp.getProperty("CONSOL_KPI_REG_RUN") !== run || !reg || Math.max(0, reg.getLastRow() - 1) !== Number(sp.getProperty("CONSOL_KPI_REG_FILAS"))) {
      throw new Error("Supabase pausado: REGISTRO requiere consolidación y validación de esta corrida.");
    }
  }
  return run;
}

function _sbConFuenteVerificada(trabajo) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { ok: false, mensaje: "Consolidación o sincronización en curso; reintenta más tarde." };
  try { _sbExigirConsolidadoVerificado(); return trabajo(); }
  finally { lock.releaseLock(); }
}

/**
 * Reemplaza en Supabase, archivo por archivo, lo que la hoja tiene ahora.
 * Reanudable: si se acaba el tiempo guarda por dónde iba y sigue en la
 * siguiente corrida. Volver a pasar por un archivo es inofensivo (borra e
 * inserta), así que una interrupción nunca deja filas duplicadas.
 */
function _sbReconciliarPorArchivo(nombreHoja, tabla, propProg, colsFn, mapFn, limiteHasta) {
  var run = _sbExigirConsolidadoVerificado(nombreHoja);
  var t0 = new Date().getTime();
  var LIMITE_MS = 4.5 * 60 * 1000;
  var sp = PropertiesService.getScriptProperties();
  if (sp.getProperty(propProg + "_DONE_RUN") === run) {
    return { ok: true, completo: true, filas: 0, yaSincronizado: true, hoja: nombreHoja };
  }
  var ss = (typeof _getSS === "function") ? _getSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(nombreHoja);
  if (!sh) return { ok: false, mensaje: nombreHoja + " no existe." };
  if (sh.getLastRow() < 2) { sp.deleteProperty(propProg); return { ok: true, archivos: 0, filas: 0, mensaje: nombreHoja + " está vacía." }; }

  var ancho = sh.getLastColumn();
  var head = sh.getRange(1, 1, 1, ancho).getValues()[0]
               .map(function (h) { return String(h || "").trim().toUpperCase(); });
  var cols = colsFn(head);
  var colId = _sbCol(head, ["ID"]);
  if (colId < 0) return { ok: false, mensaje: nombreHoja + " no tiene columna ID; sin ella no se puede sincronizar por archivo." };

  var bloques = _sbBloquesPorArchivo(sh, colId);
  if (sp.getProperty(propProg + "_RUN") !== run) {
    sp.setProperties((function() { var p = {}; p[propProg] = "0"; p[propProg + "_RUN"] = run; return p; })(), false);
  }
  var desdeIdx = parseInt(sp.getProperty(propProg) || "0", 10);
  if (isNaN(desdeIdx) || desdeIdx < 0 || desdeIdx >= bloques.length) desdeIdx = 0;

  var archivos = 0, filas = 0, sinId = 0, fallidos = [];
  var i = desdeIdx;
  for (; i < bloques.length; i++) {
    if (new Date().getTime() - t0 > LIMITE_MS || (limiteHasta && Date.now() >= limiteHasta)) break;
    var b = bloques[i];

    // Las filas sin ID de archivo también viajan: se tratan como un grupo
    // propio (archivo_id nulo). Si se saltaran, REGISTRO perdería las que
    // no vienen de un archivo hijo — hoy son miles.
    var filtro = b.id
      ? "archivo_id=eq." + encodeURIComponent(b.id)
      : "archivo_id=is.null";
    if (!b.id) sinId += b.n;

    // 1) Fuera lo que Supabase tenga de este archivo
    var del = _supabaseFetch(tabla + "?" + filtro, "delete", null, "return=minimal");
    if (del.code < 200 || del.code >= 300) { fallidos.push((b.id || "(sin id)") + " (borrado HTTP " + del.code + ")"); break; }

    // Un DELETE por ID; reunir TODOS sus tramos, aunque no sean contiguos.
    var lote = [], enviadas = 0, esperadas = 0;
    b.bloques.forEach(function(tramo) {
      var vals = sh.getRange(tramo.fila, 1, tramo.n, ancho).getValues();
      for (var r = 0; r < vals.length; r++) {
        var obj = mapFn(vals[r], head, cols);
        if (!obj) continue;
        obj.fila_origen = tramo.fila + r;
        lote.push(obj); esperadas++;
        if (lote.length >= SB_LOTE) {
          enviadas += _sbEnviarLote(tabla, lote, fallidos, b.id || "(sin id)");
          lote = [];
        }
      }
    });
    if (lote.length) enviadas += _sbEnviarLote(tabla, lote, fallidos, b.id || "(sin id)");
    filas += enviadas;
    if (enviadas !== esperadas) break; // reintentar este archivo desde DELETE

    archivos++;
    sp.setProperty(propProg, String(i + 1));
  }

  var completo = (i >= bloques.length);
  if (completo) {
    sp.deleteProperty(propProg);
    sp.setProperty(propProg + "_DONE_RUN", run);
  }

  return {
    ok: fallidos.length === 0, hoja: nombreHoja, archivos: archivos, filas: filas,
    totalArchivos: bloques.length, sinId: sinId,
    fallidos: fallidos.slice(0, 10), completo: completo,
    mensaje: fallidos.length ? ("Error de reconciliación: " + fallidos.join("; ")) : completo
      ? ("✓ " + nombreHoja + ": " + archivos + " archivo(s) y " + filas + " fila(s) reconciliados.")
      : ("⏳ " + nombreHoja + ": " + i + " de " + bloques.length + " archivos. Continúa en la próxima corrida.")
  };
}

/** Envía un lote; si falla, reintenta fila a fila para no perder el resto. */
function _sbEnviarLote(tabla, lote, fallidos, idArchivo) {
  var res = _supabaseFetch(tabla, "post", lote, "return=minimal");
  if (res.code >= 200 && res.code < 300) return lote.length;
  var okN = 0;
  for (var j = 0; j < lote.length; j++) {
    var r1 = _supabaseFetch(tabla, "post", [lote[j]], "return=minimal");
    if (r1.code >= 200 && r1.code < 300) okN++;
  }
  if (okN < lote.length) {
    fallidos.push(idArchivo + " (" + (lote.length - okN) + " fila(s) rechazadas)");
  }
  return okN;
}

/** INVENTARIOS -> Supabase, reemplazando archivo por archivo. */
function reconciliarInventariosSupabase() {
  return _sbConFuenteVerificada(function() {
    return _sbReconciliarPorArchivo("INVENTARIOS", "inventarios", "SB_RECON_INV", _sbColsInventarios, _sbMapInventarios);
  });
}

/** REGISTRO -> Supabase, reemplazando archivo por archivo. */
function reconciliarRegistroSupabase() {
  return _sbConFuenteVerificada(function() {
    return _sbReconciliarPorArchivo("REGISTRO", "registro", "SB_RECON_REG", _sbColsRegistro, _sbMapRegistro);
  });
}

/** Vuelve a empezar la reconciliación desde el primer archivo. */
function reiniciarReconciliacionSupabase() {
  var sp = PropertiesService.getScriptProperties();
  sp.deleteProperty("SB_RECON_INV");
  sp.deleteProperty("SB_RECON_REG");
  sp.deleteProperty("SB_RECON_INV_DONE_RUN");
  sp.deleteProperty("SB_RECON_REG_DONE_RUN");
  Logger.log("Reconciliación reiniciada: la próxima corrida empieza desde el primer archivo.");
  return { ok: true };
}

/** Sincroniza INVENTARIOS (solo filas nuevas). */
function sincronizarInventariosSupabase() {
  return reconciliarInventariosSupabase();
}

/** Sincroniza REGISTRO (solo filas nuevas). */
function sincronizarRegistroSupabase() {
  return reconciliarRegistroSupabase();
}

/**
 * TAREA HORARIA: sincroniza todo. La ejecuta el disparador.
 * PANEL completo (cambia en filas existentes) + INVENTARIOS/REGISTRO incremental.
 */
function sincronizarTodoSupabase() {
  return _sbConFuenteVerificada(function() {
  var res = { hora: new Date().toISOString() };
  var limiteHasta = Date.now() + 3.5 * 60 * 1000;
  try { res.panel = migrarPanelASupabase(); }           catch (e) { res.panel = { error: e.message }; }
  // INVENTARIOS y REGISTRO van por ARCHIVO, no por posición de fila: la
  // consolidación los vacía y reescribe, y el puntero de "última fila enviada"
  // quedaba apuntando a un contenido que ya no existe. Las funciones viejas
  // Los nombres de entrada antiguos también delegan en esta reconciliación.
  try { res.inventarios = _sbReconciliarPorArchivo("INVENTARIOS", "inventarios", "SB_RECON_INV", _sbColsInventarios, _sbMapInventarios, limiteHasta); } catch (e) { res.inventarios = { error: e.message }; }
  try { res.registro = _sbReconciliarPorArchivo("REGISTRO", "registro", "SB_RECON_REG", _sbColsRegistro, _sbMapRegistro, limiteHasta); } catch (e) { res.registro = { error: e.message }; }
  // El cronograma cambia en filas existentes (estado, entrega, %), así que va completo.
  try { res.cronograma = migrarCronogramaASupabase(); } catch (e) { res.cronograma = { error: e.message }; }
  try { migrarEquipoASupabase(); } catch (e) {}
  try { migrarClientesASupabase(); } catch (e) {}
  Logger.log("SYNC: " + JSON.stringify(res));
  res.ok = [res.panel, res.inventarios, res.registro, res.cronograma].every(function(r) { return r && r.ok !== false && !r.error; });
  res.completo = res.ok && !!res.inventarios.completo && !!res.registro.completo;
  return res;
  });
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


/**
 * DIAGNÓSTICO: lista TODAS las hojas del libro con su tamaño y primera fila.
 * Sirve para confirmar el nombre exacto de una hoja antes de migrarla.
 */
function listarHojasSupabase() {
  var ss = (typeof _getSS === "function") ? _getSS() : SpreadsheetApp.getActiveSpreadsheet();
  var out = ["── HOJAS DEL LIBRO ──"];
  ss.getSheets().forEach(function (sh) {
    var n = sh.getName(), f = sh.getLastRow(), c = sh.getLastColumn();
    var cab = "";
    if (f >= 1 && c >= 1) {
      cab = sh.getRange(1, 1, 1, Math.min(c, 8)).getValues()[0]
              .map(function (x) { return String(x || "").trim(); })
              .filter(String).join(" | ");
    }
    out.push('"' + n + '"  filas=' + f + " cols=" + c + (cab ? ("\n      fila1: " + cab) : ""));
  });
  Logger.log(out.join("\n"));
  return out.length - 1;
}

/**
 * Hoja USUARIOS → tabla equipo. Estructura real del libro:
 *   A Email · B Nombre · C Rol · D Fecha Ingreso · G Notas · H Rol WMS · I Contraseña
 * La columna Contraseña NO se migra (no debe salir del libro).
 */
function migrarEquipoASupabase() {
  var ss = (typeof _getSS === "function") ? _getSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("USUARIOS") ||
           ss.getSheetByName("EQUIPO_OPERATIVO");   // respaldo por si se renombra
  if (!sh) return { ok: false, mensaje: 'No existe la hoja "USUARIOS".' };
  if (sh.getLastRow() < 2) return { ok: true, migradas: 0, mensaje: "Hoja sin filas de datos." };

  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var cMail = _sbCol(head, ["EMAIL", "CORREO"]);
  var cNom  = _sbCol(head, ["NOMBRE"]);
  var cRol  = _sbCol(head, ["ROL"]);
  var cIng  = _sbCol(head, ["FECHA INGRESO"]);
  var cNot  = _sbCol(head, ["NOTAS"]);
  var cWms  = _sbCol(head, ["ROL WMS"]);
  if (cNom < 0) return { ok: false, mensaje: "No encontré la columna NOMBRE en USUARIOS." };

  var v = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  var filas = [];
  for (var i = 0; i < v.length; i++) {
    var n = _sbTxt(v[i][cNom]);
    if (!n) continue;
    filas.push({
      nombre:   n,
      email:    cMail >= 0 ? _sbTxt(v[i][cMail]) : null,
      rol:      cRol  >= 0 ? _sbTxt(v[i][cRol])  : null,
      rol_wms:  cWms  >= 0 ? _sbTxt(v[i][cWms])  : null,
      fecha_ingreso: cIng >= 0 ? _sbFecha(v[i][cIng]) : null,
      notas:    cNot  >= 0 ? _sbTxt(v[i][cNot])  : null,
      activo:   true,
      base: "UIO",
      fila_origen: i + 2
    });
  }
  if (!filas.length) return { ok: true, migradas: 0, mensaje: "Sin usuarios con nombre." };

  var del = _supabaseFetch("equipo?id=gt.0", "delete", null, "return=minimal");
  if (del.code >= 300) return { ok: false, error: "DELETE HTTP " + del.code + " " + del.body.substring(0, 150) };
  var res = _supabaseFetch("equipo", "post", filas, "return=minimal");
  Logger.log("EQUIPO (USUARIOS) -> HTTP " + res.code + " (" + filas.length + " personas)" +
             (res.code >= 300 ? ("\n" + res.body.substring(0, 250)) : ""));
  return { ok: res.code >= 200 && res.code < 300, migradas: filas.length, code: res.code };
}


/* ═══════════════════════════════════════════════════════════════════════════
   ¿QUÉ TIENE SUPABASE AHORA MISMO?
   ---------------------------------------------------------------------------
   Cuando una verificación dice "Supabase: 0 filas" hay que separar tres cosas
   muy distintas antes de actuar: que la tabla esté vacía, que tenga filas pero
   sin fecha (y entonces ningún filtro por año las encuentra), o que la fecha
   esté guardada de una forma que el filtro no reconoce. Solo lee.
   ═══════════════════════════════════════════════════════════════════════════ */
function diagnosticarSupabaseTablas() {
  var L = ["═══ CONTENIDO ACTUAL DE SUPABASE ═══\n"];
  var tablas = [
    { t: "inventarios",      f: "fecha_inicio" },
    { t: "registro",         f: "fecha" },
    { t: "panel_de_control", f: "fecha_inicio" },
    { t: "cronograma",       f: "fecha" }
  ];

  function contar(path) {
    var c = _supabaseCfg();
    var res = UrlFetchApp.fetch(c.url + "/rest/v1/" + path, {
      method: "head",
      headers: { "apikey": c.key, "Authorization": "Bearer " + c.key, "Prefer": "count=exact" },
      muteHttpExceptions: true
    });
    var h = res.getAllHeaders() || {};
    var cr = String(h["content-range"] || h["Content-Range"] || "");
    var m = cr.match(/\/(\d+)$/);
    return { code: res.getResponseCode(), total: m ? parseInt(m[1], 10) : null };
  }

  var salida = {};
  tablas.forEach(function (x) {
    var tot  = contar(x.t + "?select=" + x.f);
    if (tot.code >= 300) {
      L.push(x.t + ": ✗ HTTP " + tot.code + " (¿la tabla existe? ¿el nombre de la columna " + x.f + " es correcto?)\n");
      salida[x.t] = { error: tot.code };
      return;
    }
    var nulos = contar(x.t + "?select=" + x.f + "&" + x.f + "=is.null");
    var anio  = new Date().getFullYear();
    var esteA = contar(x.t + "?select=" + x.f + "&" + x.f + "=gte." + anio + "-01-01&" + x.f + "=lt." + (anio + 1) + "-01-01");

    L.push(x.t);
    L.push("   total            : " + tot.total);
    L.push("   con " + x.f + " vacía : " + nulos.total);
    L.push("   de " + anio + "          : " + esteA.total);

    // Una fila de muestra dice cómo está guardada la fecha realmente.
    var r = _supabaseFetch(x.t + "?select=archivo_id," + x.f + "&limit=1", "get");
    if (r.code >= 200 && r.code < 300 && r.body && r.body !== "[]") {
      L.push("   muestra          : " + String(r.body).substring(0, 160));
    } else if (tot.total === 0) {
      L.push("   (tabla vacía)");
    }
    L.push("");
    salida[x.t] = { total: tot.total, nulos: nulos.total, anioActual: esteA.total };
  });

  L.push("CÓMO LEERLO:");
  L.push("  total 0                      -> la tabla está vacía: hay que cargarla.");
  L.push("  total alto y de " + new Date().getFullYear() + " en 0    -> hay datos pero la fecha no los");
  L.push("                                  clasifica; mira 'con fecha vacía' y la muestra.");
  Logger.log(L.join("\n"));
  return salida;
}
