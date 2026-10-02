/**
 * ARCHIVO_HISTORICO.gs — Comprobar ANTES de archivar. Solo lee.
 * ---------------------------------------------------------------------------
 * Nada de aquí borra, escribe ni mueve un solo dato. Son las comprobaciones que
 * tienen que salir en verde antes de retirar un año de las hojas, para que el
 * histórico no dependa de que "parecía estar" en Supabase.
 *
 * Se comprueba archivo por archivo, no por totales: dos números iguales pueden
 * esconder un archivo de más y otro de menos. La llave es la columna ID de la
 * hoja, que es el archivo origen y en Supabase es archivo_id.
 *
 * AVISO QUE CAMBIA EL ORDEN DE LAS COSAS
 * --------------------------------------
 * Retirar filas de INVENTARIOS no archiva nada por sí solo: la consolidación
 * arranca limpiando la hoja y vuelve a importar TODOS los archivos marcados
 * "Entregado" en el PANEL, sin mirar el año. La siguiente consolidación
 * devolvería 2024 y 2025 a la hoja.
 *
 * Por eso el archivado son dos piezas, y esta es solo la primera:
 *   1. comprobar que Supabase tiene el año completo        ← este archivo
 *   2. que la consolidación deje de reimportar ese año     ← decisión pendiente
 * Hacer el paso 1 sin el 2 es trabajo que se deshace solo.
 */

var AH_CFG = {
  INVENTARIOS: { hoja: "INVENTARIOS", tabla: "inventarios", fechaSB: "fecha_inicio",
                 colsFecha: ["FECHA INICIO"] },
  REGISTRO:    { hoja: "REGISTRO",    tabla: "registro",    fechaSB: "fecha",
                 colsFecha: ["FECHA"] }
};

/** Año de una celda, venga como Date o como texto en cualquier formato. */
function _ahAnio(x) {
  if (x instanceof Date && !isNaN(x.getTime())) return x.getFullYear();
  var s = String(x == null ? "" : x).trim();
  if (!s) return null;
  var m = s.match(/(19|20)\d{2}/);        // el año es lo único que se necesita
  return m ? parseInt(m[0], 10) : null;
}

/** GET a Supabase devolviendo también el total exacto (cabecera Content-Range). */
function _ahFetchSB(path, soloConteo) {
  var c = _supabaseCfg();
  var res = UrlFetchApp.fetch(c.url + "/rest/v1/" + path, {
    method: soloConteo ? "head" : "get",
    headers: {
      "apikey": c.key, "Authorization": "Bearer " + c.key,
      "Prefer": "count=exact", "Range-Unit": "items"
    },
    muteHttpExceptions: true
  });
  var h = res.getAllHeaders() || {};
  var cr = String(h["content-range"] || h["Content-Range"] || "");
  var total = null;
  var mm = cr.match(/\/(\d+)$/);
  if (mm) total = parseInt(mm[1], 10);
  return { code: res.getResponseCode(), body: res.getContentText(), total: total };
}

/** Rango del año en formato que entiende PostgREST. */
function _ahRangoAnio(campo, anio) {
  return campo + "=gte." + anio + "-01-01&" + campo + "=lt." + (anio + 1) + "-01-01";
}

/** Cuántas filas tiene Supabase de ese año (conteo exacto, sin bajar datos). */
function _ahConteoSB(tabla, campoFecha, anio) {
  var r = _ahFetchSB(tabla + "?select=archivo_id&" + _ahRangoAnio(campoFecha, anio), true);
  if (r.code < 200 || r.code >= 300) {
    throw new Error("Supabase respondió HTTP " + r.code + " al contar " + tabla +
                    ": " + String(r.body).substring(0, 160));
  }
  return r.total;
}

/** Filas por archivo en Supabase para ese año. Pagina para no pedirlo todo de golpe. */
function _ahPorArchivoSB(tabla, campoFecha, anio, tope) {
  var porArchivo = {}, offset = 0, PAG = 10000, leidas = 0;
  tope = tope || 400000;
  while (offset < tope) {
    var r = _ahFetchSB(tabla + "?select=archivo_id&" + _ahRangoAnio(campoFecha, anio) +
                       "&limit=" + PAG + "&offset=" + offset, false);
    if (r.code < 200 || r.code >= 300) {
      throw new Error("Supabase respondió HTTP " + r.code + " al leer " + tabla +
                      ": " + String(r.body).substring(0, 160));
    }
    var arr;
    try { arr = JSON.parse(r.body); } catch (e) { throw new Error("Supabase no devolvió JSON válido."); }
    if (!arr.length) break;
    for (var i = 0; i < arr.length; i++) {
      var id = String((arr[i] || {}).archivo_id || "").trim() || "(sin id)";
      porArchivo[id] = (porArchivo[id] || 0) + 1;
    }
    leidas += arr.length;
    if (arr.length < PAG) break;
    offset += PAG;
  }
  return { porArchivo: porArchivo, leidas: leidas };
}

/** Filas por archivo y por año en la HOJA. Lee solo las dos columnas que hacen falta. */
function _ahPorArchivoHoja(cfg) {
  var sh = _getSS().getSheetByName(cfg.hoja);
  if (!sh || sh.getLastRow() < 2) {
    return { existe: !!sh, porAnio: {}, sinFecha: 0, sinId: 0, total: 0 };
  }
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var cId = _sbCol(head, ["ID"]);
  var cFe = _sbCol(head, cfg.colsFecha);
  if (cId < 0) throw new Error("La hoja " + cfg.hoja + " no tiene columna ID; sin ella no se puede comprobar archivo por archivo.");
  if (cFe < 0) throw new Error("La hoja " + cfg.hoja + " no tiene columna " + cfg.colsFecha[0] + "; sin ella no se puede separar por año.");

  var n = sh.getLastRow() - 1;
  var ids    = sh.getRange(2, cId + 1, n, 1).getValues();
  var fechas = sh.getRange(2, cFe + 1, n, 1).getValues();

  var porAnio = {}, sinFecha = 0, sinId = 0, total = 0;
  for (var i = 0; i < n; i++) {
    var id = String(ids[i][0] || "").trim();
    var anio = _ahAnio(fechas[i][0]);
    if (!id && !anio) continue;              // fila vacía de relleno
    total++;
    if (!id) sinId++;
    if (!anio) { sinFecha++; continue; }     // sin año no se puede clasificar
    var k = String(anio);
    if (!porAnio[k]) porAnio[k] = {};
    var kid = id || "(sin id)";
    porAnio[k][kid] = (porAnio[k][kid] || 0) + 1;
  }
  return { existe: true, porAnio: porAnio, sinFecha: sinFecha, sinId: sinId, total: total };
}

/* ═══════════════════════════════════════════════════════════════════════════
   1) ¿QUÉ AÑOS HAY EN LAS HOJAS? — primera foto, sin tocar Supabase
   ═══════════════════════════════════════════════════════════════════════════ */
function inventarioPorAnio() {
  var L = ["═══ AÑOS PRESENTES EN LAS HOJAS ═══\n"];
  var out = {};
  ["INVENTARIOS", "REGISTRO"].forEach(function (k) {
    var cfg = AH_CFG[k];
    var h;
    try { h = _ahPorArchivoHoja(cfg); }
    catch (e) { L.push(cfg.hoja + ": " + e.message + "\n"); return; }
    if (!h.existe) { L.push(cfg.hoja + ": la hoja no existe.\n"); return; }

    L.push(cfg.hoja + " — " + h.total + " fila(s)");
    var anios = Object.keys(h.porAnio).sort();
    out[k] = {};
    anios.forEach(function (a) {
      var archivos = Object.keys(h.porAnio[a]);
      var filas = 0;
      archivos.forEach(function (f) { filas += h.porAnio[a][f]; });
      out[k][a] = { filas: filas, archivos: archivos.length };
      L.push("   " + a + ":  " + filas + " fila(s)  ·  " + archivos.length + " archivo(s)");
    });
    if (h.sinFecha) L.push("   ⚠ " + h.sinFecha + " fila(s) SIN fecha legible — no se pueden clasificar ni archivar.");
    if (h.sinId)    L.push("   ⚠ " + h.sinId + " fila(s) SIN ID de archivo — no se pueden comprobar una a una.");
    L.push("");
  });
  L.push("Siguiente paso: verificarArchivoHistorico(2024) para comprobar ese año contra Supabase.");
  Logger.log(L.join("\n"));
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   2) ¿SUPABASE TIENE ESE AÑO COMPLETO? — la comprobación que habilita archivar
   ═══════════════════════════════════════════════════════════════════════════ */
function verificarArchivoHistorico(anio) {
  anio = parseInt(anio, 10);
  if (!anio || anio < 2000 || anio > 2100) throw new Error("Indica el año, por ejemplo verificarArchivoHistorico(2024).");
  var actual = new Date().getFullYear();
  var L = ["═══ VERIFICACIÓN DEL AÑO " + anio + " ═══\n"];
  if (anio >= actual) {
    L.push("⚠ " + anio + " es el año en curso (o futuro). El año vivo NO debe archivarse.\n");
  }

  var veredicto = { anio: anio, apto: true, hojas: {} };

  ["INVENTARIOS", "REGISTRO"].forEach(function (k) {
    var cfg = AH_CFG[k];
    L.push("── " + cfg.hoja + "  ⇄  Supabase." + cfg.tabla + " ──");

    var hoja;
    try { hoja = _ahPorArchivoHoja(cfg); }
    catch (e) { L.push("   ✗ " + e.message + "\n"); veredicto.apto = false; return; }

    var enHoja = hoja.porAnio[String(anio)] || {};
    var archivosHoja = Object.keys(enHoja);
    var filasHoja = 0;
    archivosHoja.forEach(function (f) { filasHoja += enHoja[f]; });

    if (!archivosHoja.length) {
      L.push("   La hoja no tiene filas de " + anio + ": nada que archivar aquí.\n");
      veredicto.hojas[k] = { filasHoja: 0, apto: true, nota: "sin datos de ese año" };
      return;
    }

    var sb;
    try { sb = _ahPorArchivoSB(cfg.tabla, cfg.fechaSB, anio); }
    catch (e) { L.push("   ✗ " + e.message + "\n"); veredicto.apto = false; return; }

    var faltan = [], difieren = [], sobran = [], okN = 0;
    archivosHoja.forEach(function (f) {
      var a = enHoja[f], b = sb.porArchivo[f] || 0;
      if (!b) faltan.push({ archivo: f, filas: a });
      else if (a !== b) difieren.push({ archivo: f, hoja: a, supabase: b });
      else okN++;
    });
    Object.keys(sb.porArchivo).forEach(function (f) {
      if (!enHoja[f]) sobran.push({ archivo: f, filas: sb.porArchivo[f] });
    });

    L.push("   Hoja     : " + filasHoja + " fila(s) en " + archivosHoja.length + " archivo(s)");
    L.push("   Supabase : " + sb.leidas + " fila(s) en " + Object.keys(sb.porArchivo).length + " archivo(s)");
    L.push("   Cuadran exacto: " + okN + " de " + archivosHoja.length + " archivo(s)");

    var apto = true;
    if (faltan.length) {
      apto = false;
      L.push("   ✗ NO están en Supabase (" + faltan.length + "):");
      faltan.slice(0, 10).forEach(function (x) { L.push("        " + x.archivo + "  (" + x.filas + " filas)"); });
      if (faltan.length > 10) L.push("        … y " + (faltan.length - 10) + " más");
    }
    if (difieren.length) {
      apto = false;
      L.push("   ✗ Con distinto número de filas (" + difieren.length + "):");
      difieren.slice(0, 10).forEach(function (x) {
        L.push("        " + x.archivo + "  hoja " + x.hoja + " / supabase " + x.supabase);
      });
      if (difieren.length > 10) L.push("        … y " + (difieren.length - 10) + " más");
    }
    if (sobran.length) {
      L.push("   ℹ Solo en Supabase (" + sobran.length + ") — no estorba, suele ser histórico ya retirado de la hoja.");
    }
    if (hoja.sinFecha) L.push("   ⚠ " + hoja.sinFecha + " fila(s) de la hoja sin fecha legible: se quedarían donde están.");

    L.push(apto ? "   ✓ " + cfg.hoja + ": el año " + anio + " está respaldado archivo por archivo.\n"
                : "   ✗ " + cfg.hoja + ": NO archivar todavía.\n");
    if (!apto) veredicto.apto = false;
    veredicto.hojas[k] = { filasHoja: filasHoja, archivosHoja: archivosHoja.length,
                           filasSB: sb.leidas, faltan: faltan.length,
                           difieren: difieren.length, sobran: sobran.length, apto: apto };
  });

  L.push("═══ VEREDICTO ═══");
  if (veredicto.apto) {
    L.push("✓ Supabase tiene " + anio + " completo, comprobado archivo por archivo.");
    L.push("");
    L.push("Aun así FALTA una pieza antes de retirar nada de las hojas:");
    L.push("la consolidación arranca limpiando INVENTARIOS y reimporta TODOS los");
    L.push("archivos 'Entregado' del PANEL sin mirar el año. Si se retira " + anio);
    L.push("ahora, la siguiente consolidación lo devuelve. Primero hay que decidir");
    L.push("cómo deja de reimportarlo.");
  } else {
    L.push("✗ NO archivar " + anio + ". Hay archivos sin respaldo o con distinto número");
    L.push("de filas. Corre primero los migradores de Supabase y vuelve a verificar.");
  }
  Logger.log(L.join("\n"));
  return veredicto;
}
