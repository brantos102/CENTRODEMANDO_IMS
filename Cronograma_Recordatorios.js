/* ==========================================================================
   CRONOGRAMA + RECORDATORIOS + DASHBOARD INTEGRAL   —   v3 FASE 1
   --------------------------------------------------------------------------
   Reemplaza por completo a Cronograma_Recordatorios.gs v2.
   Incluye:
   - Constantes (CRON_CFG)
   - Setup, recordatorios y sync v2 (mantenido)
   - NUEVO: API para dashboard integral (KPIs + chart anual + cronograma)
   - NUEVO: API para wizard de creación (eventos sugeridos, asignación)
   - NUEVO: API para formulario de evento (creación de fila cronograma)
   
   El Código.gs viejo solo recibe 2 microcambios (ver README_FASE1.md).
   ========================================================================== */
function auditarCeldas() {
  var ss = (typeof _getSS === "function") ? _getSS() : SpreadsheetApp.getActiveSpreadsheet();
  var total = 0, r = [];
  ss.getSheets().forEach(function(sh){
    var mR=sh.getMaxRows(), mC=sh.getMaxColumns(), lR=sh.getLastRow(), lC=sh.getLastColumn();
    total += mR*mC;
    r.push([sh.getName(), mR, mC, mR*mC, lR, lC, (mR-lR)*mC]);
  });
  r.sort(function(a,b){ return b[3]-a[3]; });
  r.forEach(function(x){ Logger.log(x[0]+" | "+x[1]+"x"+x[2]+" = "+x[3].toLocaleString()+
    " celdas | datos hasta ("+x[4]+","+x[5]+") | VACÍAS abajo≈"+x[6].toLocaleString()); });
  Logger.log("──────── TOTAL: "+total.toLocaleString()+" / 10.000.000");
  return total;
}


function compactarLibro() {
  var ss = (typeof _getSS === "function") ? _getSS() : SpreadsheetApp.getActiveSpreadsheet();
  var MARGEN_FILAS = 200, MARGEN_COLS = 4, liberadas = 0;
  ss.getSheets().forEach(function(sh){
    var lR=Math.max(sh.getLastRow(),1), lC=Math.max(sh.getLastColumn(),1);
    var keepR=lR+MARGEN_FILAS, mR=sh.getMaxRows();
    if (mR>keepR){ var n=mR-keepR; sh.deleteRows(keepR+1,n); liberadas+=n*sh.getMaxColumns(); }
    var keepC=lC+MARGEN_COLS, mC=sh.getMaxColumns();
    if (mC>keepC){ var m=mC-keepC; sh.deleteColumns(keepC+1,m); liberadas+=m*sh.getMaxRows(); }
    Logger.log(sh.getName()+" → "+sh.getMaxRows()+"x"+sh.getMaxColumns());
  });
  Logger.log("≈ Celdas liberadas: "+liberadas.toLocaleString());
  return liberadas;
}


function autorizarPermisos() {
  // SIN try/catch: obliga a Google a pedir autorización.
  const correo = Session.getActiveUser().getEmail();
  Logger.log('Correo autorizado: ' + correo);
  return correo;
}

const CRON_CFG = {
  HOJA_CRONOGRAMA: "CRONOGRAMA - 2026",
  HOJA_EQUIPO:     "EQUIPO_OPERATIVO",
  HOJA_PANEL:      "PANEL DE CONTROL",
  HOJA_MOVS:       "MOVIMIENTOS",

  // ---- Cronograma (1-indexado) ----
  CR_FILA_CAB:    8,
  CR_FILA_INI:    9,
  CR_COL_NUMERO:  2,   // B
  CR_COL_ANIO:    3,   // C
  CR_COL_TITULO:  4,   // D
  CR_COL_CLIENTE: 5,   // E
  CR_COL_CATEG:   6,   // F
  CR_COL_MES:     7,   // G
  CR_COL_FREC:    8,   // H
  CR_COL_RESP:    9,   // I
  CR_COL_PRIO:   10,   // J
  CR_COL_OBS:    11,   // K
  CR_COL_FECHA:  12,   // L
  CR_COL_ESTADO: 13,   // M
  CR_COL_FECHA_ENT: 14,// N
  CR_COL_DURAC:  15,   // O
  CR_COL_PCT:    16,   // P
  CR_COL_ARCH:   17,   // Q
  // ---- Nuevas (auto-crea setup) ----
  CR_COL_EMAILX: 18,   // R
  CR_COL_DAVISO: 19,   // S
  CR_COL_NOTIF:  20,   // T

  // ---- Panel de Control ----
  PA_COL_CLIENTE: 1,   // A
  PA_COL_LINK:    2,   // B
  PA_COL_ID:      3,   // C
  PA_COL_FECHA_I: 4,   // D
  PA_COL_FECHA_F: 5,   // E
  PA_COL_BD:      6,   // F
  PA_COL_AVANCE:  7,   // G
  PA_COL_ORDEN:   8,   // H
  PA_COL_RESP:    9,   // I
  PA_COL_UNID:   10,   // J
  PA_COL_REFS:   11,   // K
  PA_COL_POS:    12,   // L
  PA_COL_EFEC_U: 13,   // M
  PA_COL_EFEC_R: 14,   // N
  PA_COL_EFEC_P: 15,   // O

  VENTANA_SUGERENCIA_DIAS: 7,
  DIAS_AVISO_DEFAULT: 3,
  ASUNTO_EMAIL: "📦 Recordatorio Inventario Físico",
  REMITENTE: "Sistema de Inventarios UIO"
};


/* ==========================================================================
   0. RESOLVER SPREADSHEET (funciona en hoja Y en Web App)
   --------------------------------------------------------------------------
   En contexto de hoja (menús/triggers) usa getActiveSpreadsheet y guarda el
   ID. En contexto Web App (doGet como dueño) no hay hoja activa, así que lee
   el ID guardado en ScriptProperties. Si nunca se guardó, lanza error claro.
   ========================================================================== */
function _getSS() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    try {
      PropertiesService.getScriptProperties().setProperty("MAIN_SS_ID", active.getId());
    } catch (e) {}
    return active;
  }
  var id = PropertiesService.getScriptProperties().getProperty("MAIN_SS_ID");
  if (id) return SpreadsheetApp.openById(id);
  throw new Error("No se pudo determinar el libro. Abre la hoja una vez (para registrar su ID) o ejecuta setupWebApp().");
}

// Registra el ID del libro manualmente (ejecutar 1 vez desde el editor con la hoja abierta,
// o pasar el ID como argumento si el script es standalone).
function setupWebApp(spreadsheetIdOpcional) {
  var id = spreadsheetIdOpcional;
  if (!id) {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) id = active.getId();
  }
  if (!id) {
    _alert("No se pudo determinar el ID. Ejecuta esta función con la hoja abierta, " +
           "o llama setupWebApp('TU_SPREADSHEET_ID').");
    return;
  }
  PropertiesService.getScriptProperties().setProperty("MAIN_SS_ID", id);
  _alert("✓ Web App configurada. ID del libro guardado:\n" + id);
}


/* ==========================================================================
   1. SETUP
   ========================================================================== */

function setupOptimizaciones() {
  var ss = _getSS();
  var log = [];

  var eq = ss.getSheetByName(CRON_CFG.HOJA_EQUIPO);
  if (!eq) {
    eq = ss.insertSheet(CRON_CFG.HOJA_EQUIPO);
    eq.getRange(1,1,1,5).setValues([[
      "Nombre (igual al cronograma)", "Email", "Rol", "Teléfono", "Activo"
    ]]);
    eq.getRange(1,1,1,5).setFontWeight("bold")
      .setBackground("#1a73e8").setFontColor("#ffffff");
    eq.setColumnWidths(1, 5, 180);
    var seeds = [
      ["ESPINOSA BRYAN",  "bespinoza@itsanet.com",  "Coordinador",     "", true],
      ["EDWIN NARVAEZ",   "ingresosuio4@itsanet.com","Líder de Conteo", "", true],
      ["MONROY LEONARDO", "",                       "Líder de Conteo", "", true],
      ["OCHOA DANNY",     "",                       "Líder de Conteo", "", true],
      ["DIAZ BRYAN",      "",                       "Líder de Conteo", "", true],
      ["MELENDEZ DIEGO",  "",                       "Líder de Conteo", "", true],
      ["MALES DENNIS",    "",                       "Líder de Conteo", "", true],
      ["MARLON LOACHAMIN","",                       "Líder de Conteo", "", true]
    ];
    eq.getRange(2,1,seeds.length,5).setValues(seeds);
    eq.getRange(2,2,seeds.length,1).setBackground("#fff3cd");
    log.push("✅ EQUIPO_OPERATIVO creada con 8 responsables.");
  } else {
    log.push("ℹ️ EQUIPO_OPERATIVO ya existe.");
  }

  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  if (cron) {
    var nuevas = [
      [CRON_CFG.CR_COL_EMAILX, "Email Extra"],
      [CRON_CFG.CR_COL_DAVISO, "Días Aviso"],
      [CRON_CFG.CR_COL_NOTIF,  "Última Notif."]
    ];
    nuevas.forEach(function(p){
      var c = cron.getRange(CRON_CFG.CR_FILA_CAB, p[0]);
      if (!c.getValue()) {
        c.setValue(p[1]).setFontWeight("bold")
         .setBackground("#0f9d58").setFontColor("#ffffff");
      }
    });
    log.push("✅ Columnas R, S, T verificadas.");
  }

  _alert("Setup completo:\n\n" + log.join("\n"));
  return log;
}


/* ==========================================================================
   2. UTILIDADES INTERNAS
   ========================================================================== */

function _cargarEquipoMap() {
  var ss = _getSS();
  var sh = ss.getSheetByName(CRON_CFG.HOJA_EQUIPO);
  var map = {};
  if (!sh || sh.getLastRow() < 2) return map;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
  v.forEach(function(r){
    var nombre = String(r[0] || "").trim().toUpperCase();
    var email  = String(r[1] || "").trim();
    var activo = (r[4] === "" || r[4] === true || String(r[4]).toUpperCase() === "TRUE");
    if (nombre && email && activo) map[nombre] = email;
  });
  return map;
}

/* FIX FASE 7.6: Listar responsables del cronograma combinando 3 fuentes:
   USUARIOS (excluyendo Auditores) + EQUIPO_OPERATIVO + USUARIOS_BASE_WMS
   Como pidió Bryan: "los responsables deben ser todos los usuarios menos auditores". */
/* FASE 8.63 (R3): clave canónica de un nombre = tokens en MAYÚSCULA ordenados.
   Así "ALMACHI DANILO" y "DANILO ALMACHI" comparten clave y NO se duplican. */
function _claveNombre(nombre) {
  return String(nombre || "").trim().toUpperCase()
    .replace(/\s+/g, " ").split(" ").filter(Boolean).sort().join(" ");
}

/* FASE 8.63 (R3): mapa clave-canónica → nombre oficial (el de la hoja USUARIOS).
   Cacheado por invocación de request (ligero). */
var _CANON_CACHE = null;
function _mapaCanonNombres() {
  if (_CANON_CACHE) return _CANON_CACHE;
  var mapa = {};
  try {
    var shU = _getSS().getSheetByName(USR_CFG.HOJA);
    if (shU && shU.getLastRow() >= 2) {
      var vu = shU.getRange(2, 2, shU.getLastRow() - 1, 1).getValues(); // col B (Nombre)
      vu.forEach(function(r){
        var nom = String(r[0] || "").trim();
        if (nom) mapa[_claveNombre(nom)] = nom; // la hoja manda como nombre oficial
      });
    }
  } catch (e) {}
  _CANON_CACHE = mapa;
  return mapa;
}
/* Devuelve el nombre oficial (hoja USUARIOS) para cualquier variante de orden. */
function _canonNombre(nombre) {
  if (!nombre) return "";
  var m = _mapaCanonNombres();
  return m[_claveNombre(nombre)] || String(nombre).trim();
}

function _listarEquipoActivo() {
  var ss = _getSS();
  var mapa = {};        // claveNombre → nombre oficial (dedup por orden de tokens)
  var emailsHoja = {};  // emails ya registrados en la hoja USUARIOS (dedup por identidad)

  // 1. Hoja USUARIOS (todos los activos menos Auditores) — fuente CANÓNICA
  try {
    var shU = ss.getSheetByName(USR_CFG.HOJA);
    if (shU && shU.getLastRow() >= 2) {
      var vu = shU.getRange(2, 1, shU.getLastRow() - 1, 5).getValues();
      vu.forEach(function(r){
        var email = String(r[0] || "").trim().toLowerCase();
        var nombre = String(r[1] || "").trim();
        var rol = String(r[2] || "").trim().toLowerCase();
        var activo = (r[4] === "" || r[4] === true || String(r[4]).toUpperCase() === "TRUE");
        if (email) emailsHoja[email] = true;
        if (activo && nombre && rol !== "auditor") {
          mapa[_claveNombre(nombre)] = nombre;
        }
      });
    }
  } catch (e) {}

  // 2. Hoja EQUIPO_OPERATIVO (legacy) — solo si no está ya por clave de nombre
  try {
    var sh = ss.getSheetByName(CRON_CFG.HOJA_EQUIPO);
    if (sh && sh.getLastRow() >= 2) {
      var v = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
      v.forEach(function(r){
        var nombre = String(r[0] || "").trim();
        var activo = (r[4] === "" || r[4] === true || String(r[4]).toUpperCase() === "TRUE");
        if (activo && nombre && !mapa[_claveNombre(nombre)]) mapa[_claveNombre(nombre)] = nombre;
      });
    }
  } catch (e) {}

  // 3. USUARIOS_BASE_WMS — SOLO si su EMAIL no está ya en la hoja (evita el
  //    duplicado tipo "ALMACHI DANILO" (hoja) vs "Danilo Almachi" (base WMS)).
  try {
    for (var em in USUARIOS_BASE_WMS) {
      if (emailsHoja[String(em).trim().toLowerCase()]) continue; // ya está por identidad
      var info = USUARIOS_BASE_WMS[em];
      var rolW = String(info.rol || "").toUpperCase();
      if (rolW !== "AUDITOR" && info.nombre) {
        var k = _claveNombre(info.nombre);
        if (!mapa[k]) mapa[k] = info.nombre;
      }
    }
  } catch (e) {}

  return Object.keys(mapa).map(function(k){ return mapa[k]; }).sort();
}

/* FIX FASE 8.24: Devuelve lista de emails únicos del equipo activo
   (USUARIOS hoja con activo=TRUE + USUARIOS_BASE_WMS), normalizados.
   Excluye Auditores. Usado para compartir archivos creados. */
/* FIX FASE 8.28: detector ROBUSTO de "activo" — acepta variantes comunes
   que aparecen en hojas multi-idioma o con entradas manuales. Antes solo
   aceptaba vacío, true, "TRUE" — y dejaba fuera entradas como "VERDADERO"
   (locale es-EC), "Sí", "SI", "Activo", "X", "1", etc. */
function _esCeldaActiva(valor) {
  // Caso 1: celda vacía → activo (default, comportamiento histórico)
  if (valor === "" || valor === null || valor === undefined) return true;
  // Caso 2: booleano true (checkbox marcado)
  if (valor === true) return true;
  // Caso 3: número 1
  if (valor === 1) return true;
  // Caso 4: string normalizado
  var s = String(valor).trim().toUpperCase();
  if (s === "") return true; // espacios en blanco también activo
  // Variantes positivas reconocidas (varios idiomas/formatos)
  var POSITIVOS = ["TRUE", "VERDADERO", "VERDADEIRO", "YES", "Y",
                   "SI", "SÍ", "S", "ACTIVO", "ACTIVE", "ACTIV",
                   "X", "1", "✓", "OK", "ON"];
  return POSITIVOS.indexOf(s) !== -1;
}

function _listarEmailsEquipoActivo() {
  var ss = _getSS();
  var set = {};
  // FIX 8.28: lista de descartados para diagnóstico (se devuelve solo si se pide)
  _listarEmailsEquipoActivo._ultimoDescartados = [];

  try {
    var shU = ss.getSheetByName(USR_CFG.HOJA);
    if (shU && shU.getLastRow() >= 2) {
      // FIX 8.28: leer hasta 8 columnas por si la hoja tiene columnas extra
      var anchoCols = Math.min(shU.getLastColumn(), 8);
      var vu = shU.getRange(2, 1, shU.getLastRow() - 1, anchoCols).getValues();
      vu.forEach(function(r, idx){
        var email = String(r[0] || "").trim().toLowerCase();
        var rol = String(r[2] || "").trim().toLowerCase();
        var activo = _esCeldaActiva(r[4]);
        var fila = idx + 2;

        if (!email || email.indexOf("@") === -1) {
          if (email) _listarEmailsEquipoActivo._ultimoDescartados.push(
            {fila: fila, email: email, motivo: "sin @ válido"});
          return;
        }
        if (!activo) {
          _listarEmailsEquipoActivo._ultimoDescartados.push(
            {fila: fila, email: email, motivo: "inactivo (col E=" + JSON.stringify(r[4]) + ")"});
          return;
        }
        if (rol === "auditor") {
          _listarEmailsEquipoActivo._ultimoDescartados.push(
            {fila: fila, email: email, motivo: "rol Auditor (solo lectura)"});
          return;
        }
        set[email] = true;
      });
    }
  } catch (e) {
    Logger.log("FIX 8.28 _listarEmailsEquipoActivo: error leyendo USUARIOS: " + e.message);
  }

  try {
    for (var em in USUARIOS_BASE_WMS) {
      var rolW = String(USUARIOS_BASE_WMS[em].rol || "").toUpperCase();
      if (rolW !== "AUDITOR") {
        set[String(em).trim().toLowerCase()] = true;
      }
    }
  } catch (e) {}

  return Object.keys(set);
}

// FIX FASE 8.37: comparte como EDITOR sin enviar correo de notificación
// (Drive API v3, sendNotificationEmail=false). Elimina los avisos
// "Se compartió una hoja de cálculo…". Usa scopes ya presentes (drive + external_request).
function _addEditorSilencioso(fileId, email) {
  try {
    var url = "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(fileId) +
              "/permissions?sendNotificationEmail=false&supportsAllDrives=true&fields=id";
    var resp = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      payload: JSON.stringify({ role: "writer", type: "user", emailAddress: String(email).trim() }),
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    if (code >= 200 && code < 300) return { ok: true };
    return { ok: false, error: code + ": " + resp.getContentText() };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

function _compartirArchivoConEquipo(file) {
  var resultado = {
    dominio: false,
    dominioModo: "",
    editoresAgregados: 0,
    editoresFallidos: 0,
    emailsAgregados: [],          // FIX 8.28: lista de emails efectivamente agregados
    emailsFallidos: [],            // FIX 8.28: lista con motivo de falla por email
    errores: []
  };

  // 1) Dominio Itsanet en modo LECTURA — solo si aún no está (evita ops redundantes)
  try {
    var accActual = null;
    try { accActual = file.getSharingAccess(); } catch (eAcc) {}
    if (accActual !== DriveApp.Access.DOMAIN_WITH_LINK && accActual !== DriveApp.Access.DOMAIN) {
      file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    }
    resultado.dominio = true;
    resultado.dominioModo = "view";
  } catch (e1) {
    try {
      file.setSharing(DriveApp.Access.DOMAIN, DriveApp.Permission.VIEW);
      resultado.dominio = true;
      resultado.dominioModo = "view";
    } catch (e2) {
      resultado.errores.push("setSharing dominio (VIEW) falló: " + e2.message);
    }
  }

  // 2) Agregar editores del equipo — SILENCIOSO (sin correos) e IDEMPOTENTE
  //    (no re-comparte a quien ya tiene acceso; así una consolidación no re-envía nada)
  try {
    var fileId = file.getId();
    var emails = _listarEmailsEquipoActivo();

    var ownerReal = "";  // EFFECTIVE — quien ejecuta el script y queda como owner
    var operario  = "";  // ACTIVE   — quien usó la WebApp e hizo clic en crear
    try { ownerReal = String(Session.getEffectiveUser().getEmail() || "").toLowerCase(); } catch(eO) {}
    try { operario  = String(Session.getActiveUser().getEmail()    || "").toLowerCase(); } catch(eA) {}

    // Quién YA tiene acceso (editores + owner) → se respeta y NO se re-comparte.
    var yaTiene = {};
    try { file.getEditors().forEach(function(u){ var e = String(u.getEmail()||"").toLowerCase(); if (e) yaTiene[e] = true; }); } catch(eEd) {}
    try { var ow = file.getOwner(); if (ow) { var oe = String(ow.getEmail()||"").toLowerCase(); if (oe) yaTiene[oe] = true; } } catch(eOw) {}
    if (ownerReal) yaTiene[ownerReal] = true;

    // Cola sin duplicados ni los que ya tienen acceso
    var aAgregar = [];
    function _encolar(em, tag) {
      em = String(em || "").trim().toLowerCase();
      if (!em || em.indexOf("@") === -1 || yaTiene[em]) return;
      yaTiene[em] = true;
      aAgregar.push({ email: em, tag: tag });
    }
    _encolar(operario, "creador");
    emails.forEach(function(em){ _encolar(em, "equipo"); });

    aAgregar.forEach(function(it){
      var r = _addEditorSilencioso(fileId, it.email);
      if (r.ok) {
        resultado.editoresAgregados++;
        resultado.emailsAgregados.push(it.email + (it.tag === "creador" ? " (creador)" : ""));
      } else {
        resultado.editoresFallidos++;
        resultado.emailsFallidos.push({ email: it.email, error: r.error });
      }
    });
  } catch (e3) {
    resultado.errores.push("addEditores (silencioso) falló: " + e3.message);
  }

  // FIX 8.29: log también muestra quién es active vs effective para diagnóstico
  try {
    var nombre = "";
    try { nombre = file.getName(); } catch (eN) {}
    var aUser = "", eUser = "";
    try { aUser = String(Session.getActiveUser().getEmail()    || "")  ; } catch(eA){}
    try { eUser = String(Session.getEffectiveUser().getEmail() || "")  ; } catch(eE){}
    Logger.log("FIX 8.29 _compartirArchivoConEquipo [" + nombre + "]: " +
               "active=" + (aUser || "(vacío)") + " · effective=" + (eUser || "(vacío)") +
               " · dominio=" + resultado.dominioModo +
               " · agregados=" + resultado.editoresAgregados +
               " · fallidos=" + resultado.editoresFallidos +
               (resultado.emailsAgregados.length ? "\n  ✓ " + resultado.emailsAgregados.join(", ") : "") +
               (resultado.emailsFallidos.length ? "\n  ✗ " + resultado.emailsFallidos.map(function(f){return f.email + " (" + f.error + ")";}).join("; ") : ""));
  } catch (eLog) {}

  return resultado;
}

/* ==========================================================================
   FASE 8.62 (R1): GARANTÍA PERMANENTE DE ACCESOS — solución final
   --------------------------------------------------------------------------
   · El equipo activo queda como EDITOR individual de cada archivo hijo
     (inmune a cambios de "acceso por link": nunca pierden edición).
   · El dominio ITSANET queda como LECTOR por link (modo auditor).
   · Todo SILENCIOSO (sin correos) y ADITIVO (nunca quita ni degrada).
   · Al consolidar NO se re-comparte salvo que el EQUIPO haya cambiado
     (hash), evitando trabajo/redundancia; hay botón para forzar reparación.
   ========================================================================== */

// Hash del conjunto de emails del equipo activo (para detectar altas/bajas).
function _equipoHashActivo() {
  try {
    var em = _listarEmailsEquipoActivo().map(function(e){ return String(e).toLowerCase(); }).sort();
    return em.join("|");
  } catch (e) { return ""; }
}

// Garantiza accesos de UN archivo (aditivo + silencioso). Reutiliza la lógica
// probada de _compartirArchivoConEquipo (dominio VIEW + editores del equipo).
function _garantizarAccesoArchivo(fileId) {
  try {
    var file = DriveApp.getFileById(String(fileId).trim());
    return _compartirArchivoConEquipo(file);
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

// Recorre una lista de fileIds y garantiza accesos, con tope de tiempo.
// Devuelve {aplicados, fallos, completo}.
function _garantizarAccesosLote(fileIds, deadlineMs) {
  var aplicados = 0, fallos = 0, completo = true;
  for (var i = 0; i < fileIds.length; i++) {
    if (deadlineMs && Date.now() > deadlineMs) { completo = false; break; }
    var fid = String(fileIds[i] || "").trim();
    if (!fid) continue;
    var r = _garantizarAccesoArchivo(fid);
    if (r && r.dominio !== false && !r.error) aplicados++; else fallos++;
  }
  return { aplicados: aplicados, fallos: fallos, completo: completo };
}

/* FASE 8.64 (R1): garantía de accesos POR LOTES con CHECKPOINT y CONTINUACIÓN
   AUTOMÁTICA (trigger .after 60s), igual que la consolidación. Ya NO se queda a
   medias: cada corrida retoma donde quedó y se re-lanza sola hasta el 100%. */
function dash_garantizarAccesosTodos() {
  _requiereRol(["Admin", "Coordinador"]);
  return _garantiaAccesosNucleo();
}

function _garantiaAccesosNucleo() {
  var p = _consolProps();
  var ss = _getSS();
  var pan = ss.getSheetByName(CRON_CFG.HOJA_PANEL);
  if (!pan || pan.getLastRow() < 2) {
    p.setProperty("ACCESOS_STATUS", "COMPLETADO");
    return { ok: false, mensaje: "Panel vacío." };
  }
  var d = pan.getRange(2, 1, pan.getLastRow() - 1, 7).getValues();
  var ids = [];
  for (var i = 0; i < d.length; i++) {
    var fid = extractIdFromUrl(d[i][CRON_CFG.PA_COL_ID - 1]);
    if (fid) ids.push(fid);
  }
  var total = ids.length;

  // Reanudar desde el checkpoint si hay corrida EN_CURSO; si no, empezar de 0.
  var start = 0;
  if ((p.getProperty("ACCESOS_STATUS") || "") === "EN_CURSO") {
    start = parseInt(p.getProperty("ACCESOS_NEXT_IDX") || "0", 10);
    if (isNaN(start) || start < 0 || start >= total) start = (start >= total ? total : 0);
  } else {
    p.setProperties({ ACCESOS_STATUS: "EN_CURSO", ACCESOS_NEXT_IDX: "0",
                      ACCESOS_OK: "0", ACCESOS_FAIL: "0" }, false);
  }

  var okAcum   = parseInt(p.getProperty("ACCESOS_OK")   || "0", 10);
  var failAcum = parseInt(p.getProperty("ACCESOS_FAIL") || "0", 10);
  var deadline = Date.now() + 270 * 1000;   // lote de ~4.5 min (bajo el límite web)

  var i2 = start;
  for (; i2 < total; i2++) {
    if (Date.now() > deadline) break;
    var r = _garantizarAccesoArchivo(ids[i2]);
    if (r && r.dominio !== false && !r.error) okAcum++; else failAcum++;
    if ((i2 % 10) === 0) {
      p.setProperties({ ACCESOS_NEXT_IDX: String(i2 + 1),
                        ACCESOS_OK: String(okAcum), ACCESOS_FAIL: String(failAcum) }, false);
    }
  }
  p.setProperties({ ACCESOS_NEXT_IDX: String(i2),
                    ACCESOS_OK: String(okAcum), ACCESOS_FAIL: String(failAcum) }, false);

  if (i2 < total) {
    _programarContinuacionAccesos();   // se re-lanza SOLA hasta terminar
    return {
      ok: true, enCurso: true, procesados: i2, total: total,
      mensaje: "🔒 Accesos: " + i2 + " / " + total + " archivos procesados.\n\n" +
               "CONTINÚA AUTOMÁTICAMENTE en segundo plano (un lote cada ~1 min) " +
               "hasta cubrir el 100%. No necesitas volver a ejecutar ni dejar la " +
               "ventana abierta. Vuelve a abrir este botón para ver el avance."
    };
  }

  // COMPLETADO
  p.setProperty("ACCESOS_STATUS", "COMPLETADO");
  try { p.setProperty("ACCESOS_TEAM_HASH", _equipoHashActivo()); } catch (e) {}
  _borrarTriggersAccesos();
  return {
    ok: true, aplicados: okAcum, fallos: failAcum, total: total, completo: true,
    mensaje: "🔒 COMPLETADO: accesos garantizados en " + okAcum + " de " + total + " archivos" +
             (failAcum ? " (" + failAcum + " sin acceso del dueño — revisar ARCHIVOS_INACCESIBLES)" : "") +
             ".\nEquipo = editores · ITSANET = lector por link (auditor). Sin correos."
  };
}

function _programarContinuacionAccesos() {
  _borrarTriggersAccesos();
  ScriptApp.newTrigger("_continuarGarantiaAccesos").timeBased().after(60 * 1000).create();
}
function _borrarTriggersAccesos() {
  try {
    ScriptApp.getProjectTriggers().forEach(function(t){
      if (t.getHandlerFunction() === "_continuarGarantiaAccesos") ScriptApp.deleteTrigger(t);
    });
  } catch (e) {}
}
function _continuarGarantiaAccesos() {
  _borrarTriggersAccesos();
  var p = _consolProps();
  if ((p.getProperty("ACCESOS_STATUS") || "") !== "EN_CURSO") return;
  try {
    _garantiaAccesosNucleo();   // reprograma sola si aún quedan pendientes
  } catch (e) {
    Logger.log("FASE 8.64 _continuarGarantiaAccesos error: " + e.message);
    try { _programarContinuacionAccesos(); } catch (e2) {}  // reintentar
  }
}

/* ==========================================================================
   FIX FASE 8.28: HERRAMIENTAS DE DIAGNÓSTICO Y REPARACIÓN
   - diagnosticarUsuarioEquipo(email): explica si un email entra en el equipo
   - repararPermisosArchivo(fileId): re-aplica permisos a UN solo archivo
   ========================================================================== */

/**
 * Diagnóstico de un email específico — explica si está siendo incluido
 * o no como editor automático en archivos nuevos.
 * Uso desde editor de Apps Script o pasando email como string.
 *
 * Ejecutar desde editor:
 *   1) Selecciona la función diagnosticarUsuarioEquipo
 *   2) Reemplaza temporalmente el "dmelendez@itsanet.com" abajo por el email a probar
 *   3) Ejecutar y revisar el log
 */
function diagnosticarUsuarioEquipo(emailDiag) {
  emailDiag = emailDiag || "dmelendez@itsanet.com"; // default para test rápido
  var emailN = String(emailDiag).trim().toLowerCase();
  var ss = _getSS();
  var resultado = {
    emailConsultado: emailN,
    enHojaUsuarios: false,
    fila: null,
    valorBruto: {},
    activoDetectado: false,
    rolDetectado: "",
    consideradoEquipo: false,
    motivoExclusion: "",
    enListaFinal: false,
    totalEmailsEquipo: 0,
    primerosEmails: []
  };

  try {
    var shU = ss.getSheetByName(USR_CFG.HOJA);
    if (shU && shU.getLastRow() >= 2) {
      var ancho = Math.min(shU.getLastColumn(), 8);
      var vu = shU.getRange(2, 1, shU.getLastRow() - 1, ancho).getValues();
      for (var i = 0; i < vu.length; i++) {
        var r = vu[i];
        var em = String(r[0] || "").trim().toLowerCase();
        if (em === emailN) {
          resultado.enHojaUsuarios = true;
          resultado.fila = i + 2;
          resultado.valorBruto = {
            colA_email: r[0],
            colB_nombre: r[1],
            colC_rol: r[2],
            colD: r[3],
            colE_activo: r[4],
            colE_tipo: typeof r[4]
          };
          resultado.activoDetectado = _esCeldaActiva(r[4]);
          resultado.rolDetectado = String(r[2] || "").trim();
          if (!resultado.activoDetectado) {
            resultado.motivoExclusion = "Columna E (activo) tiene valor no reconocido: " +
              JSON.stringify(r[4]) + " (tipo: " + typeof r[4] +
              "). Valores aceptados: vacío, TRUE, VERDADERO, SI, SÍ, ACTIVO, 1, X, ✓";
          } else if (resultado.rolDetectado.toLowerCase() === "auditor") {
            resultado.motivoExclusion = "Rol es Auditor — excluido del listado de editores automáticos.";
          } else {
            resultado.consideradoEquipo = true;
          }
          break;
        }
      }
    }
  } catch (e) {
    resultado.motivoExclusion = "Error leyendo USUARIOS: " + e.message;
  }

  // Verificar si aparece en la lista final que usa _compartirArchivoConEquipo
  var listaFinal = _listarEmailsEquipoActivo();
  resultado.totalEmailsEquipo = listaFinal.length;
  resultado.primerosEmails = listaFinal.slice(0, 15);
  resultado.enListaFinal = listaFinal.indexOf(emailN) !== -1;

  if (!resultado.enHojaUsuarios && !resultado.motivoExclusion) {
    resultado.motivoExclusion = "Email no encontrado en hoja USUARIOS. " +
      "Agrégalo: A=" + emailN + ", B=nombre, C=rol (Coordinador/Líder de Conteo/Operario), E=TRUE";
  }

  Logger.log("════════════════════════════════════════════════");
  Logger.log("FIX 8.28 DIAGNÓSTICO — " + emailN);
  Logger.log("════════════════════════════════════════════════");
  Logger.log("En hoja USUARIOS: " + (resultado.enHojaUsuarios ? "SÍ (fila " + resultado.fila + ")" : "NO"));
  if (resultado.enHojaUsuarios) {
    Logger.log("  Valores brutos: " + JSON.stringify(resultado.valorBruto));
    Logger.log("  Activo detectado: " + resultado.activoDetectado);
    Logger.log("  Rol detectado: '" + resultado.rolDetectado + "'");
  }
  Logger.log("¿Considerado equipo activo?: " + (resultado.consideradoEquipo ? "SÍ" : "NO"));
  if (!resultado.consideradoEquipo) Logger.log("  Motivo: " + resultado.motivoExclusion);
  Logger.log("¿Aparece en lista final de editores?: " + (resultado.enListaFinal ? "SÍ" : "NO"));
  Logger.log("Total emails en equipo: " + resultado.totalEmailsEquipo);
  Logger.log("Primeros 15: " + resultado.primerosEmails.join(", "));
  Logger.log("════════════════════════════════════════════════");

  return resultado;
}

/**
 * Repara permisos de UN solo archivo — re-aplica _compartirArchivoConEquipo
 * sin tener que correr la migración masiva. Útil para archivos ya creados
 * donde un usuario quedó fuera.
 *
 * Uso desde editor de Apps Script:
 *   1) Selecciona la función repararPermisosArchivo
 *   2) Reemplaza temporalmente el fileId abajo por el del archivo a reparar
 *   3) Ejecutar y revisar el log
 */
function repararPermisosArchivo(fileIdParam) {
  // Si no se pasa parámetro, intentar usar el último creado (fallback útil)
  var fileId = fileIdParam || PropertiesService.getScriptProperties().getProperty("ULTIMO_ARCHIVO_CREADO");
  if (!fileId) {
    throw new Error("Pásame el fileId del archivo a reparar. " +
                    "Lo encuentras en la URL del archivo: docs.google.com/spreadsheets/d/<<FILE_ID>>/edit");
  }
  var file = DriveApp.getFileById(fileId);
  var nombre = file.getName();
  var res = _compartirArchivoConEquipo(file);

  Logger.log("════════════════════════════════════════════════");
  Logger.log("FIX 8.28 REPARAR PERMISOS — " + nombre);
  Logger.log("════════════════════════════════════════════════");
  Logger.log("Archivo: " + nombre + " (" + fileId + ")");
  Logger.log("Dominio: " + (res.dominio ? res.dominioModo.toUpperCase() : "FALLO"));
  Logger.log("Editores agregados: " + res.editoresAgregados);
  Logger.log("Editores fallidos: " + res.editoresFallidos);
  if (res.emailsAgregados.length) Logger.log("  ✓ Agregados: " + res.emailsAgregados.join(", "));
  if (res.emailsFallidos.length) {
    Logger.log("  ✗ Fallidos:");
    res.emailsFallidos.forEach(function(f){ Logger.log("    - " + f.email + " → " + f.error); });
  }
  if (res.errores.length) Logger.log("Errores: " + res.errores.join(" | "));
  Logger.log("════════════════════════════════════════════════");

  return {
    archivo: nombre,
    fileId: fileId,
    resultado: res
  };
}

/* Wrapper Web App con validación de rol */
function dash_diagnosticarUsuario(email) {
  _requiereRol(["Coordinador"]);
  return diagnosticarUsuarioEquipo(email);
}
function dash_repararPermisos(fileId) {
  _requiereRol(["Coordinador"]);
  return repararPermisosArchivo(fileId);
}

/* ==========================================================================
   FIX FASE 8.31: HERRAMIENTAS DE OPERACIÓN MASIVA
   - consolidarTodoDesdeEditor: ejecutable directamente desde editor Apps Script
     con timeout extendido (25 min), procesa TODOS los archivos del PANEL.
   - repararPermisosLote: itera ARCHIVOS_INACCESIBLES e intenta reparar cada uno.
   - dash_consolidarAuditoriaWeb / dash_consolidarAuditoriaEditor: variantes
     según contexto de ejecución (timeout 5 min vs 25 min).
   ========================================================================== */

/**
 * Ejecutable desde el editor de Apps Script con timeout extendido.
 * Procesa TODO el panel (modo tolerante, INV+REG) hasta 25 minutos.
 * Si se requieren más iteraciones, simplemente vuelve a correr la función
 * — la dedup global por hash evita duplicados, y la hoja ARCHIVOS_INACCESIBLES
 * acumula los problemas para reparación posterior.
 */
function consolidarTodoDesdeEditor() {
  Logger.log("════════════════════════════════════════════════");
  Logger.log("FIX 8.31 CONSOLIDACIÓN MASIVA DESDE EDITOR");
  Logger.log("Modo: TOLERANTE · Incluir: ALL · Timeout: 25 min");
  Logger.log("════════════════════════════════════════════════");
  var resultado = consolidarConAuditoria({
    modo: "tolerante",
    incluir: "ALL",
    contexto: "editor"
  });
  Logger.log("Resultado: " + (resultado && resultado.mensaje || JSON.stringify(resultado)));
  return resultado;
}

/**
 * Wrapper para consolidación desde la WebApp (timeout limitado a 5 min).
 * El frontend ya llama dash_consolidarAuditoria — esta versión solo asegura
 * que el contexto correcto se pase.
 */
function dash_consolidarAuditoriaWeb(opciones) {
  _requiereRol(["Coordinador", "Líder de Conteo"]);
  opciones = opciones || {};
  opciones.contexto = "web";
  return consolidarConAuditoria(opciones);
}

/**
 * Repara permisos de TODOS los archivos en ARCHIVOS_INACCESIBLES.
 * Intenta abrir cada uno con _compartirArchivoConEquipo: si el effective user
 * (dueño del script) tiene acceso, se aplica la política de permisos completa
 * (equipo activo como editores, dominio Itsanet como lector).
 * Si no se puede abrir (sin acceso), queda marcado como "🔒 No accesible" y
 * requiere intervención manual (pedir al owner actual que comparta).
 *
 * Ejecutable desde el editor de Apps Script o desde frontend.
 */
function repararPermisosLote() {
  var ss = _getSS();
  var hInac = ss.getSheetByName("ARCHIVOS_INACCESIBLES");
  if (!hInac || hInac.getLastRow() < 2) {
    Logger.log("FIX 8.31 repararPermisosLote: no hay archivos para reparar");
    return { ok: true, mensaje: "No hay archivos en la lista de inaccesibles.",
             procesados: 0, reparados: 0, sinAcceso: 0 };
  }

  var ultRow = hInac.getLastRow();
  var datos = hInac.getRange(2, 1, ultRow - 1, 7).getValues();
  var procesados = 0, reparados = 0, sinAcceso = 0;
  var ahora = new Date();

  for (var i = 0; i < datos.length; i++) {
    var estado = String(datos[i][5] || "");
    if (estado === "✅ Resuelto") continue; // ya está bien
    var fid = String(datos[i][2] || "").trim();
    if (!fid) continue;
    procesados++;
    var filaSheet = i + 2;

    try {
      var f = DriveApp.getFileById(fid);
      var res = _compartirArchivoConEquipo(f);
      // Verificar que efectivamente se aplicó algo
      if (res.editoresAgregados > 0 || res.dominio) {
        reparados++;
        hInac.getRange(filaSheet, 6).setValue("✅ Reparado");
        hInac.getRange(filaSheet, 7).setValue(ahora);
        Logger.log("✓ Reparado [" + datos[i][1] + "]: " + fid +
                   " (editores=" + res.editoresAgregados + ", dominio=" + res.dominioModo + ")");
      } else {
        hInac.getRange(filaSheet, 6).setValue("⚠️ Parcial");
        hInac.getRange(filaSheet, 7).setValue(ahora);
      }
    } catch (e) {
      // El effective user no tiene acceso al archivo — no se puede reparar automático.
      sinAcceso++;
      hInac.getRange(filaSheet, 5).setValue(e.message);
      hInac.getRange(filaSheet, 6).setValue("🔒 No accesible");
      hInac.getRange(filaSheet, 7).setValue(ahora);
      Logger.log("✗ Sin acceso [" + datos[i][1] + "]: " + fid + " → " + e.message);
    }
  }

  Logger.log("════════════════════════════════════════════════");
  Logger.log("FIX 8.31 repararPermisosLote: procesados=" + procesados +
             " · reparados=" + reparados + " · sin acceso=" + sinAcceso);
  Logger.log("════════════════════════════════════════════════");

  return {
    ok: true,
    procesados: procesados,
    reparados: reparados,
    sinAcceso: sinAcceso,
    mensaje: "Reparación masiva:\n\n" +
             "• Procesados: " + procesados + "\n" +
             "• ✅ Reparados (vuelta a accesibles): " + reparados + "\n" +
             "• 🔒 Sin acceso del script (requieren intervención manual): " + sinAcceso + "\n\n" +
             (sinAcceso > 0
                ? "Para los 'sin acceso', el dueño del script no tiene permisos al archivo. " +
                  "Pide al owner actual de cada archivo que comparta con el script."
                : "Todos los archivos accesibles fueron reparados correctamente.")
  };
}

function dash_repararPermisosLote() {
  _requiereRol(["Coordinador"]);
  return repararPermisosLote();
}

/* FIX FASE 8.25: Re-aplicar permisos a archivos existentes ya creados.
   Útil cuando: (a) se agrega un miembro al equipo (necesita acceso a archivos
   históricos), (b) cambia la política (antes EDIT al dominio, ahora VIEW).

   Recorre HISTORIAL_REPORTES + PANEL DE CONTROL y aplica
   _compartirArchivoConEquipo a cada archivo accesible.

   FIX FASE 8.26: la versión "core" NO valida rol — esta se ejecuta desde el
   editor de Apps Script (donde Session.getActiveUser() puede fallar). La
   validación de rol se hace en dash_migrarPermisos (versión Web App).
*/
function migrarPermisosArchivosExistentes() {
  var ss = _getSS();
  var procesados = 0, exitosos = 0, fallidos = 0;
  var detalles = [];

  function _aplicar(fileId, etiqueta) {
    if (!fileId) return;
    procesados++;
    try {
      var f = DriveApp.getFileById(fileId);
      _compartirArchivoConEquipo(f);
      exitosos++;
    } catch (e) {
      fallidos++;
      detalles.push("✗ " + etiqueta + " (" + fileId + "): " + e.message);
    }
  }

  // 1) Archivos de PANEL DE CONTROL (inventarios físicos / hijos)
  try {
    var pan = ss.getSheetByName(CRON_CFG.HOJA_PANEL);
    if (pan && pan.getLastRow() >= 2) {
      var d = pan.getRange(2, 1, pan.getLastRow() - 1, 3).getValues();
      for (var i = 0; i < d.length; i++) {
        var fid = extractIdFromUrl(d[i][CRON_CFG.PA_COL_ID - 1]);
        if (!fid) fid = extractIdFromUrl(d[i][CRON_CFG.PA_COL_LINK - 1]);
        _aplicar(fid, "Inventario " + (d[i][0] || ""));
      }
    }
  } catch (e) { detalles.push("Error leyendo PANEL: " + e.message); }

  // 2) Archivos de HISTORIAL_REPORTES (reportes por cliente)
  try {
    var hHist = ss.getSheetByName("HISTORIAL_REPORTES");
    if (hHist && hHist.getLastRow() >= 2) {
      var dh = hHist.getRange(2, 1, hHist.getLastRow() - 1, 3).getValues();
      var rt = hHist.getRange(2, 3, hHist.getLastRow() - 1, 1).getRichTextValues();
      for (var j = 0; j < dh.length; j++) {
        var fid2 = resolverIdArchivoExtremo(dh[j][2], rt[j][0]);
        _aplicar(fid2, "Reporte " + (dh[j][0] || ""));
      }
    }
  } catch (e) { detalles.push("Error leyendo HISTORIAL: " + e.message); }

  // FIX FASE 8.26: registrar quién ejecutó (best-effort, no falla si no hay email)
  try {
    var who = "";
    try { who = Session.getActiveUser().getEmail() || ""; } catch(e1) {}
    if (!who) try { who = Session.getEffectiveUser().getEmail() || ""; } catch(e2) {}
    _registrarActividad(who || "editor", "migrar_permisos",
      "Procesados:" + procesados,
      "Exitosos:" + exitosos + " · Fallidos:" + fallidos);
  } catch (eAud) {}

  Logger.log("MIGRACIÓN PERMISOS — Procesados: " + procesados +
             " | Exitosos: " + exitosos + " | Fallidos: " + fallidos);

  return {
    ok: true,
    mensaje: "Migración completada:\n\n" +
             "• Archivos procesados: " + procesados + "\n" +
             "• Exitosos: " + exitosos + "\n" +
             "• Fallidos: " + fallidos + "\n\n" +
             (detalles.length > 0 ? "Detalles:\n" + detalles.slice(0, 20).join("\n") : ""),
    procesados: procesados,
    exitosos: exitosos,
    fallidos: fallidos
  };
}

/* FIX FASE 8.26: wrapper para llamada desde Web App (con validación de rol). */
function dash_migrarPermisos() {
  _requiereRol(["Coordinador"]);
  return migrarPermisosArchivosExistentes();
}

/* ==========================================================================
   FIX FASE 8.15: Normalización de fechas a PRUEBA DE FALLOS.
   --------------------------------------------------------------------------
   Por qué falló v8.14: aunque pasábamos displayValues, en algunos casos los
   Date objects "se escapaban" hacia el setValues final porque:
   1. El archivo origen tenía timezone distinto al script (Sheets cambia el Date)
   2. El displayValue puede venir vacío en ciertas celdas
   3. v instanceof Date a veces falla en V8 cuando viene de openById

   Estrategia v8.15 (TRES capas de defensa):
   - Capa 1: usar displayValue del origen (cadena tal cual la ve el operario)
   - Capa 2: si displayValue vacío, formatear el Date con el TZ del ARCHIVO ORIGEN
             (NO el del script — esa es la clave que faltaba)
   - Capa 3: verificación final justo antes de setValues, GARANTIZA 0 Dates
   ========================================================================== */
function _esDate(v) {
  if (v == null) return false;
  if (v instanceof Date) return !isNaN(v.getTime());
  // Detectar Date "huérfano" que perdió su prototype tras serialización
  if (typeof v === 'object' && typeof v.getTime === 'function' &&
      typeof v.getUTCFullYear === 'function') {
    var t = v.getTime();
    return typeof t === 'number' && !isNaN(t);
  }
  return false;
}

function _normalizarFechasMatriz(matriz, displayMatriz, tzOrigen) {
  if (!matriz || !matriz.length) return matriz;
  // Si no se pasó tzOrigen, usar el del script (fallback)
  var tz = tzOrigen || Session.getScriptTimeZone() || "America/Guayaquil";
  for (var i = 0; i < matriz.length; i++) {
    var fila = matriz[i];
    var disp = displayMatriz ? (displayMatriz[i] || null) : null;
    if (!fila || !fila.length) continue;
    for (var j = 0; j < fila.length; j++) {
      var v = fila[j];
      if (_esDate(v)) {
        // Capa 1: displayValue del archivo origen
        if (disp && j < disp.length && disp[j] != null && String(disp[j]).trim() !== "") {
          fila[j] = String(disp[j]);
        } else {
          // Capa 2: formatear con TZ del ARCHIVO ORIGEN (no del script)
          var h = v.getHours(), m = v.getMinutes(), s = v.getSeconds();
          if (h === 0 && m === 0 && s === 0) {
            fila[j] = Utilities.formatDate(v, tz, "dd/MM/yyyy");
          } else {
            fila[j] = Utilities.formatDate(v, tz, "dd/MM/yyyy HH:mm:ss");
          }
        }
      }
    }
  }
  return matriz;
}

/* CAPA 3: Verificación final antes del setValues. Garantiza que NINGÚN Date
   escape al pegado, sin importar cómo llegó. Si encuentra un Date que pasó
   las capas 1 y 2, lo convierte usando el TZ pasado (o America/Guayaquil). */
function _stringificarFechasFinales(matriz, tzForzado) {
  if (!matriz || !matriz.length) return matriz;
  var tz = tzForzado || "America/Guayaquil";
  var dateEscapados = 0;
  for (var i = 0; i < matriz.length; i++) {
    var fila = matriz[i];
    if (!fila || !fila.length) continue;
    for (var j = 0; j < fila.length; j++) {
      var v = fila[j];
      if (_esDate(v)) {
        dateEscapados++;
        var h = v.getHours(), m = v.getMinutes(), s = v.getSeconds();
        if (h === 0 && m === 0 && s === 0) {
          fila[j] = Utilities.formatDate(v, tz, "dd/MM/yyyy");
        } else {
          fila[j] = Utilities.formatDate(v, tz, "dd/MM/yyyy HH:mm:ss");
        }
      }
    }
  }
  if (dateEscapados > 0) {
    Logger.log("[FIX 8.15] _stringificarFechasFinales: " + dateEscapados +
               " Date objects escapados — capa 3 los convirtió.");
  }
  return matriz;
}

function _extraerUrlSmartChip(richVal, valorPlano) {
  if (richVal) {
    var runs = richVal.getRuns();
    for (var i = 0; i < runs.length; i++) {
      var u = runs[i].getLinkUrl();
      if (u && u.indexOf("spreadsheets") !== -1) return u;
    }
  }
  if (valorPlano && String(valorPlano).indexOf("http") !== -1) return String(valorPlano);
  return "";
}

function _idDeUrl(url) {
  if (!url) return "";
  var m = String(url).match(/[-\w]{25,50}/);
  return m ? m[0] : "";
}

// FIX FASE 8.36: normaliza a SOLO FECHA (medianoche local, sin hora) para que
// los cálculos de cronograma/duración/slotting no se vean afectados por la hora.
function _soloFecha(d) {
  if (!(d instanceof Date)) d = new Date(d);
  if (!d || isNaN(d.getTime())) d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// FIX FASE 8.36: fecha de creación (solo fecha) del archivo asociado a un evento.
// Coordina la fecha de inicio del cronograma con la creación real del archivo.
function _fechaCreacionArchivo(fileId) {
  if (!fileId) return null;
  try { return _soloFecha(DriveApp.getFileById(String(fileId).trim()).getDateCreated()); }
  catch (e) { return null; }
}

// FIX FASE 8.34: ¿la categoría contiene 'slotting'? (ignora mayúsculas y tildes)
function _contieneSlotting(txt) {
  if (!txt) return false;
  var s = String(txt).toLowerCase();
  try { s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
  return s.indexOf("slotting") !== -1;
}

function _esManual() {
  try { SpreadsheetApp.getUi(); return true; } catch(e) { return false; }
}

// Alert tolerante: usa UI si está disponible (menú/hoja), si no escribe a Logger
// (cuando se ejecuta directamente desde el editor de Apps Script).
function _alert(msg) {
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    Logger.log("[ALERT] " + msg);
  }
}

function _fmtFecha(d) {
  if (!(d instanceof Date)) return "";
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy");
}


/* ==========================================================================
   3. RECORDATORIOS POR EMAIL
   ========================================================================== */

function enviarRecordatoriosCronograma() {
  var ss = _getSS();
  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  if (!cron) return;

  var ultima = cron.getLastRow();
  if (ultima < CRON_CFG.CR_FILA_INI) return;
  var n = ultima - CRON_CFG.CR_FILA_INI + 1;

  var datos = cron.getRange(CRON_CFG.CR_FILA_INI, 1, n, CRON_CFG.CR_COL_NOTIF).getValues();
  var richQ = cron.getRange(CRON_CFG.CR_FILA_INI, CRON_CFG.CR_COL_ARCH, n, 1).getRichTextValues();
  var equipoMap = _cargarEquipoMap();
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var enviados = 0, saltados = 0, sinEmail = 0;

  for (var i = 0; i < datos.length; i++) {
    var r = datos[i];
    var cliente   = r[CRON_CFG.CR_COL_CLIENTE - 1];
    var responsable = r[CRON_CFG.CR_COL_RESP - 1];
    var fechaIni  = r[CRON_CFG.CR_COL_FECHA - 1];
    var estado    = String(r[CRON_CFG.CR_COL_ESTADO - 1] || "").toLowerCase();
    var emailExtra = r[CRON_CFG.CR_COL_EMAILX - 1];
    var diasAviso = parseInt(r[CRON_CFG.CR_COL_DAVISO - 1], 10) || CRON_CFG.DIAS_AVISO_DEFAULT;
    var ultNotif  = r[CRON_CFG.CR_COL_NOTIF - 1];

    if (!cliente || !fechaIni || !(fechaIni instanceof Date)) continue;
    if (estado.indexOf("entregado") !== -1) continue;
    if (!responsable && !emailExtra) continue;

    var fechaProg = new Date(fechaIni); fechaProg.setHours(0,0,0,0);
    var diffDias = Math.round((fechaProg - hoy) / 86400000);
    if (diffDias > diasAviso) continue;
    if (diffDias < -7) continue;

    if (ultNotif instanceof Date) {
      var u = new Date(ultNotif); u.setHours(0,0,0,0);
      if (u.getTime() === hoy.getTime()) { saltados++; continue; }
    }

    var emails = [];
    if (responsable) {
      var e = equipoMap[String(responsable).toUpperCase().trim()];
      if (e) emails.push(e);
    }
    if (emailExtra) {
      String(emailExtra).split(/[,;\n]+/).forEach(function(t){
        t = t.trim(); if (t && t.indexOf("@") !== -1) emails.push(t);
      });
    }
    emails = Array.from(new Set(emails));
    if (emails.length === 0) { sinEmail++; continue; }

    var urlArchivo = _extraerUrlSmartChip(richQ[i][0], r[CRON_CFG.CR_COL_ARCH - 1]);
    var urgencia = diffDias < 0 ? "VENCIDO" : (diffDias === 0 ? "HOY" : diffDias + " día(s)");
    var html = _construirEmailHTML({
      cliente: cliente, responsable: responsable, fechaProg: fechaProg,
      diffDias: diffDias, urgencia: urgencia, urlArchivo: urlArchivo,
      titulo: r[CRON_CFG.CR_COL_TITULO - 1]
    });

    try {
      MailApp.sendEmail({
        to: emails.join(","),
        subject: CRON_CFG.ASUNTO_EMAIL + " — " + cliente + " (" + urgencia + ")",
        htmlBody: html, name: CRON_CFG.REMITENTE
      });
      cron.getRange(CRON_CFG.CR_FILA_INI + i, CRON_CFG.CR_COL_NOTIF).setValue(new Date());
      enviados++;
    } catch (err) {
      Logger.log("Fallo envío " + cliente + ": " + err.message);
    }
  }

  if (_esManual()) {
    SpreadsheetApp.getUi().alert(
      "📧 Recordatorios:\n• Enviados: " + enviados +
      "\n• Saltados (ya notif hoy): " + saltados +
      "\n• Sin email configurado: " + sinEmail
    );
  }
  return { enviados: enviados, saltados: saltados, sinEmail: sinEmail };
}


function _construirEmailHTML(d) {
  var color = "#0f9d58";
  if (d.diffDias <= 1) color = "#f4b400";
  if (d.diffDias < 0)  color = "#db4437";

  var fechaFmt = Utilities.formatDate(d.fechaProg, Session.getScriptTimeZone(),
                                      "EEEE dd 'de' MMMM, yyyy");
  var botonArchivo = d.urlArchivo
    ? '<p style="margin:22px 0;">' +
        '<a href="' + d.urlArchivo + '" style="background:#1a73e8;color:#fff;' +
        'padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;' +
        'display:inline-block;">📂 Abrir Archivo de Inventario</a></p>'
    : '<p style="color:#888;font-size:13px;margin:22px 0;">' +
      '⚠️ Archivo de inventario aún no creado.</p>';

  return '<div style="font-family:Inter,Arial,sans-serif;max-width:580px;margin:0 auto;' +
    'background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e0e0e0;">' +
      '<div style="background:' + color + ';color:#fff;padding:22px 26px;">' +
        '<div style="font-size:12px;letter-spacing:1px;opacity:0.85;">RECORDATORIO DE INVENTARIO</div>' +
        '<div style="font-size:24px;font-weight:700;margin-top:4px;">' + d.cliente + '</div>' +
        (d.titulo ? '<div style="font-size:13px;opacity:0.9;margin-top:6px;">' + d.titulo + '</div>' : '') +
      '</div>' +
      '<div style="padding:24px 26px;color:#202124;line-height:1.55;font-size:14px;">' +
        (d.responsable ? '<p>Hola <b>' + d.responsable + '</b>,</p>' : '<p>Hola,</p>') +
        '<p>Tienes un inventario asignado próximamente:</p>' +
        '<table style="width:100%;border-collapse:collapse;margin:16px 0;">' +
          '<tr><td style="padding:6px 0;color:#5f6368;width:140px;">Cliente:</td>' +
              '<td style="font-weight:600;">' + d.cliente + '</td></tr>' +
          '<tr><td style="padding:6px 0;color:#5f6368;">Fecha programada:</td>' +
              '<td style="font-weight:600;">' + fechaFmt + '</td></tr>' +
          '<tr><td style="padding:6px 0;color:#5f6368;">Tiempo restante:</td>' +
              '<td style="font-weight:700;color:' + color + ';">' + d.urgencia + '</td></tr>' +
        '</table>' + botonArchivo +
        '<p style="font-size:11px;color:#888;margin-top:24px;border-top:1px solid #eee;padding-top:14px;">' +
        'Mensaje automático. No respondas a este correo.</p>' +
      '</div></div>';
}


function enviarRecordatorioManual(cliente) {
  var ss = _getSS();
  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  var ult = cron.getLastRow();
  var n = ult - CRON_CFG.CR_FILA_INI + 1;
  var datos = cron.getRange(CRON_CFG.CR_FILA_INI, 1, n, CRON_CFG.CR_COL_NOTIF).getValues();
  var richQ = cron.getRange(CRON_CFG.CR_FILA_INI, CRON_CFG.CR_COL_ARCH, n, 1).getRichTextValues();
  var equipoMap = _cargarEquipoMap();
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var clienteN = String(cliente).toUpperCase();

  for (var i = 0; i < n; i++) {
    var r = datos[i];
    if (String(r[CRON_CFG.CR_COL_CLIENTE - 1]).toUpperCase() !== clienteN) continue;
    var responsable = r[CRON_CFG.CR_COL_RESP - 1];
    var fechaIni = r[CRON_CFG.CR_COL_FECHA - 1];
    var emailExtra = r[CRON_CFG.CR_COL_EMAILX - 1];

    var emails = [];
    if (responsable) {
      var e = equipoMap[String(responsable).toUpperCase().trim()];
      if (e) emails.push(e);
    }
    if (emailExtra) {
      String(emailExtra).split(/[,;\n]+/).forEach(function(t){
        t = t.trim(); if (t && t.indexOf("@") !== -1) emails.push(t);
      });
    }
    emails = Array.from(new Set(emails));
    if (emails.length === 0) return "⚠️ Sin email para " + cliente;

    var fechaProg = fechaIni instanceof Date ? new Date(fechaIni) : new Date();
    fechaProg.setHours(0,0,0,0);
    var diffDias = Math.round((fechaProg - hoy) / 86400000);
    var urgencia = diffDias < 0 ? "VENCIDO" : (diffDias === 0 ? "HOY" : diffDias + " día(s)");

    MailApp.sendEmail({
      to: emails.join(","),
      subject: CRON_CFG.ASUNTO_EMAIL + " — " + cliente + " (" + urgencia + ")",
      htmlBody: _construirEmailHTML({
        cliente: cliente, titulo: r[CRON_CFG.CR_COL_TITULO - 1],
        responsable: responsable, fechaProg: fechaProg,
        diffDias: diffDias, urgencia: urgencia,
        urlArchivo: _extraerUrlSmartChip(richQ[i][0], r[CRON_CFG.CR_COL_ARCH - 1])
      }),
      name: CRON_CFG.REMITENTE
    });
    cron.getRange(CRON_CFG.CR_FILA_INI + i, CRON_CFG.CR_COL_NOTIF).setValue(new Date());
    return "✅ Enviado a: " + emails.join(", ");
  }
  return "Cliente no encontrado: " + cliente;
}


/* ==========================================================================
   4. SINCRONIZACIÓN Cronograma <- Panel
   ========================================================================== */

function sincronizarEstadoCronogramaConPanel() {
  var ss = _getSS();
  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  var pan  = ss.getSheetByName(CRON_CFG.HOJA_PANEL);
  if (!cron || !pan) return 0;

  var idx = {};
  if (pan.getLastRow() >= 2) {
    var pdat = pan.getRange(2, 1, pan.getLastRow() - 1, 7).getValues();
    pdat.forEach(function(r){
      var id = String(r[CRON_CFG.PA_COL_ID - 1] || "").trim();
      if (id) idx[id] = {
        avance: String(r[CRON_CFG.PA_COL_AVANCE - 1] || ""),
        fechaF: r[CRON_CFG.PA_COL_FECHA_F - 1]
      };
    });
  }

  var ult = cron.getLastRow();
  if (ult < CRON_CFG.CR_FILA_INI) return 0;
  var n = ult - CRON_CFG.CR_FILA_INI + 1;
  var richQ = cron.getRange(CRON_CFG.CR_FILA_INI, CRON_CFG.CR_COL_ARCH, n, 1).getRichTextValues();
  var estados = cron.getRange(CRON_CFG.CR_FILA_INI, CRON_CFG.CR_COL_ESTADO, n, 1).getValues();
  var pcts    = cron.getRange(CRON_CFG.CR_FILA_INI, CRON_CFG.CR_COL_PCT, n, 1).getValues();
  var fEntr   = cron.getRange(CRON_CFG.CR_FILA_INI, CRON_CFG.CR_COL_FECHA_ENT, n, 1).getValues();

  var act = 0;
  for (var i = 0; i < n; i++) {
    var url = _extraerUrlSmartChip(richQ[i][0], null);
    if (!url) continue;
    var id = _idDeUrl(url);
    if (!id) continue;
    var hit = idx[id];
    if (!hit) continue;
    if (hit.avance.toLowerCase().indexOf("entregado") !== -1 &&
        String(estados[i][0]).toLowerCase().indexOf("entregado") === -1) {
      estados[i][0] = "Entregado";
      pcts[i][0] = 1;
      if (hit.fechaF instanceof Date) fEntr[i][0] = hit.fechaF;
      act++;
    }
  }
  if (act > 0) {
    cron.getRange(CRON_CFG.CR_FILA_INI, CRON_CFG.CR_COL_ESTADO, n, 1).setValues(estados);
    cron.getRange(CRON_CFG.CR_FILA_INI, CRON_CFG.CR_COL_PCT, n, 1).setValues(pcts);
    cron.getRange(CRON_CFG.CR_FILA_INI, CRON_CFG.CR_COL_FECHA_ENT, n, 1).setValues(fEntr);
  }
  if (_esManual()) SpreadsheetApp.getUi().alert("Sincronización completada.\nFilas actualizadas: " + act);
  return act;
}


/* ==========================================================================
   5. WIZARD CREACIÓN — eventos sugeridos del cronograma
   ========================================================================== */

/* FIX FASE 8.23: filtros flexibles para sugerencias del wizard.
   Recibe opciones = { rango: 'prox7'|'mes'|'atrasados'|'todos_pendientes'|'entregados',
                       incluirEntregados: bool, incluirConArchivo: bool }
   Default: 'prox7' (comportamiento histórico, próximos 7 días sin archivo). */
function obtenerEventosCronogramaPorCliente(cliente, opciones) {
  // Compatibilidad histórica: si recibe un número, lo trata como ventanaDias (modo legacy 'prox7')
  if (typeof opciones === "number") opciones = { rango: "prox7", ventanaDias: opciones };
  opciones = opciones || {};
  var rango = String(opciones.rango || "prox7").toLowerCase();
  var incluirEntregados = opciones.incluirEntregados === true;
  var incluirConArchivo = opciones.incluirConArchivo === true;
  var ventanaDias = opciones.ventanaDias || CRON_CFG.VENTANA_SUGERENCIA_DIAS;

  var ss = _getSS();
  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  if (!cron) return [];

  var ult = cron.getLastRow();
  if (ult < CRON_CFG.CR_FILA_INI) return [];
  var n = ult - CRON_CFG.CR_FILA_INI + 1;
  var datos = cron.getRange(CRON_CFG.CR_FILA_INI, 1, n, CRON_CFG.CR_COL_NOTIF).getValues();
  var richQ = cron.getRange(CRON_CFG.CR_FILA_INI, CRON_CFG.CR_COL_ARCH, n, 1).getRichTextValues();
  var clienteN = String(cliente || "").trim().toUpperCase();
  if (!clienteN) return [];

  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var hoyTs = hoy.getTime();
  var finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getTime();
  var resultado = [];

  for (var i = 0; i < n; i++) {
    var r = datos[i];
    if (String(r[CRON_CFG.CR_COL_CLIENTE - 1] || "").trim().toUpperCase() !== clienteN) continue;

    var estadoTxt = String(r[CRON_CFG.CR_COL_ESTADO - 1] || "").toLowerCase();
    var esEntregado = estadoTxt.indexOf("entregado") !== -1;

    // Si NO se pidieron entregados (default) y este lo es → skip
    if (!incluirEntregados && esEntregado) continue;
    // En el rango 'entregados' SOLO interesan los entregados
    if (rango === "entregados" && !esEntregado) continue;

    var urlExistente = _extraerUrlSmartChip(richQ[i][0], r[CRON_CFG.CR_COL_ARCH - 1]);
    // Si ya tiene archivo y no se pidió incluir esos → skip
    if (urlExistente && !incluirConArchivo) continue;

    var fIni = r[CRON_CFG.CR_COL_FECHA - 1];
    if (!(fIni instanceof Date)) continue;
    var fIniTs = new Date(fIni).setHours(0,0,0,0);
    var diff = Math.round((fIniTs - hoyTs) / 86400000);

    // FIX 8.23: filtro por rango
    var pasa = false;
    if (rango === "prox7") {
      // Próximos 7 días + tolerancia de hasta 7 días vencidos (histórico)
      pasa = (diff >= -7 && diff <= ventanaDias);
    } else if (rango === "mes") {
      // Eventos del mes actual (desde hoy hasta fin de mes) + vencidos del mes
      pasa = (fIniTs >= new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime() &&
              fIniTs <= finMes);
    } else if (rango === "atrasados") {
      // Vencidos (fecha pasó y NO entregado)
      pasa = (diff < 0 && !esEntregado);
    } else if (rango === "todos_pendientes") {
      // TODO el año, pendientes
      pasa = (!esEntregado);
    } else if (rango === "entregados") {
      pasa = (esEntregado);
    } else {
      pasa = true; // default sin filtro
    }
    if (!pasa) continue;

    // Calcular fechaFin desde duración
    var duracionNum = parseInt(r[CRON_CFG.CR_COL_DURAC - 1], 10);
    if (isNaN(duracionNum) || duracionNum < 1) duracionNum = 1;
    var fFinTs = fIniTs + (duracionNum - 1) * 86400000;

    resultado.push({
      fila: CRON_CFG.CR_FILA_INI + i,
      titulo: r[CRON_CFG.CR_COL_TITULO - 1] || "",
      categoria: r[CRON_CFG.CR_COL_CATEG - 1] || "",
      responsable: r[CRON_CFG.CR_COL_RESP - 1] || "",
      prioridad: r[CRON_CFG.CR_COL_PRIO - 1] || "",
      fechaInicio: fIniTs,
      fechaFin: fFinTs,
      duracion: duracionNum,
      fechaFmt: _fmtFecha(fIni),
      diasRestantes: diff,
      estado: r[CRON_CFG.CR_COL_ESTADO - 1] || "",
      entregado: esEntregado,
      tieneArchivo: !!urlExistente
    });
  }
  return resultado.sort(function(a,b){ return a.fechaInicio - b.fechaInicio; });
}


/* ==========================================================================
   6. ASIGNAR archivo recién creado a evento existente del cronograma
   ========================================================================== */

/* ==========================================================================
   FIX FASE 8.9: SINCRONIZACIÓN automática Cronograma Q ← PANEL DE CONTROL
   Para cada fila del cronograma sin archivo en Q pero con cliente en PANEL DE CONTROL,
   busca el archivo más cercano en fecha y lo asigna como Smart Chip a la columna Q.
   Esta función es idempotente: si ya tiene archivo, NO sobrescribe.
   ========================================================================== */
function sincronizarArchivosCronogramaConPanel() {
  _requiereRol(["Coordinador", "Líder de Conteo"]);
  var ss = _getSS();
  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  var pan  = ss.getSheetByName(CRON_CFG.HOJA_PANEL);
  if (!cron || !pan) throw new Error("Faltan hojas CRONOGRAMA o PANEL DE CONTROL");

  // Cargar PANEL DE CONTROL por cliente
  var panelPorCliente = {};
  if (pan.getLastRow() >= 2) {
    var pdat = pan.getRange(2, 1, pan.getLastRow() - 1, Math.min(pan.getLastColumn(), 30)).getValues();
    // FIX FASE 8.11: leer también RichText de Col B por si tiene Smart Chip
    var richLinkColS;
    try {
      richLinkColS = pan.getRange(2, CRON_CFG.PA_COL_LINK, pan.getLastRow() - 1, 1).getRichTextValues();
    } catch(eRl) { richLinkColS = null; }

    pdat.forEach(function(pr, idx){
      var cli = String(pr[CRON_CFG.PA_COL_CLIENTE - 1] || "").trim().toUpperCase();
      if (!cli) return;
      var rawLink = pr[CRON_CFG.PA_COL_LINK - 1];
      var rawId   = pr[CRON_CFG.PA_COL_ID - 1];

      // FIX FASE 8.11: extraer ID limpio (de col C, col B plano o Smart Chip)
      var idLimpio = _idDeUrl(String(rawId || "").trim());
      if (!idLimpio) idLimpio = _idDeUrl(String(rawLink || "").trim());
      if (!idLimpio && richLinkColS && richLinkColS[idx] && richLinkColS[idx][0]) {
        try {
          var runs = richLinkColS[idx][0].getRuns();
          for (var rk = 0; rk < runs.length; rk++) {
            var u = runs[rk].getLinkUrl();
            if (u) { idLimpio = _idDeUrl(u); if (idLimpio) break; }
          }
        } catch(e2) {}
      }
      if (!idLimpio) return;

      var urlCanonica = "https://docs.google.com/spreadsheets/d/" + idLimpio + "/edit";
      var fechaIni = pr[CRON_CFG.PA_COL_FECHA_I - 1];
      panelPorCliente[cli] = panelPorCliente[cli] || [];
      panelPorCliente[cli].push({
        link: urlCanonica,
        id: idLimpio,
        fechaInicio: (fechaIni instanceof Date) ? fechaIni.getTime() : 0,
        fila: idx + 2
      });
    });
    Object.keys(panelPorCliente).forEach(function(c){
      panelPorCliente[c].sort(function(a,b){ return b.fechaInicio - a.fechaInicio; });
    });
  }

  var sincronizados = 0, yaTenian = 0, sinMatchPanel = 0;
  if (cron.getLastRow() < CRON_CFG.CR_FILA_INI) {
    return { ok:true, sincronizados:0, yaTenian:0, sinMatchPanel:0, mensaje:"Cronograma vacío" };
  }
  var n = cron.getLastRow() - CRON_CFG.CR_FILA_INI + 1;
  var dat = cron.getRange(CRON_CFG.CR_FILA_INI, 1, n, CRON_CFG.CR_COL_NOTIF).getValues();
  var rQ = cron.getRange(CRON_CFG.CR_FILA_INI, CRON_CFG.CR_COL_ARCH, n, 1).getRichTextValues();

  for (var i = 0; i < n; i++) {
    var r = dat[i];
    if (!r[CRON_CFG.CR_COL_CLIENTE - 1]) continue;

    // FIX: Evitar auto-vincular archivos viejos a eventos que son futuros / pendientes.
    var estadoFila = String(r[CRON_CFG.CR_COL_ESTADO - 1] || "").toLowerCase();
    if (estadoFila.indexOf("pendiente") !== -1 || estadoFila === "") continue;

    // Skip si ya tiene archivo en Q
    var urlExistente = _extraerUrlSmartChip(rQ[i][0], r[CRON_CFG.CR_COL_ARCH - 1]);
  /*for (var i = 0; i < n; i++) {
    var r = dat[i];
    if (!r[CRON_CFG.CR_COL_CLIENTE - 1]) continue;

    // Skip si ya tiene archivo en Q
    var urlExistente = _extraerUrlSmartChip(rQ[i][0], r[CRON_CFG.CR_COL_ARCH - 1]);*/
    if (urlExistente) { yaTenian++; continue; }

    var cliCron = String(r[CRON_CFG.CR_COL_CLIENTE - 1]).trim().toUpperCase();
    var candidatos = panelPorCliente[cliCron] || [];
    if (candidatos.length === 0) { sinMatchPanel++; continue; }

    var fIni = r[CRON_CFG.CR_COL_FECHA - 1];
    var ts = (fIni instanceof Date) ? fIni.getTime() : 0;
    var elegido = candidatos[0];
    if (ts) {
      var menorDif = Math.abs(elegido.fechaInicio - ts);
      for (var k = 1; k < candidatos.length; k++) {
        var dif = Math.abs(candidatos[k].fechaInicio - ts);
        if (dif < menorDif) { elegido = candidatos[k]; menorDif = dif; }
      }
    }

    // Escribir Smart Chip
    var urlFinal = elegido.link || ("https://docs.google.com/spreadsheets/d/" + elegido.id + "/edit");
    var idFinal  = elegido.id || _idDeUrl(urlFinal);
    var visible  = cliCron + (elegido.fechaInicio ? " · " + _fmtFecha(new Date(elegido.fechaInicio)) : "");
    try {
      var rich = SpreadsheetApp.newRichTextValue().setText(visible).setLinkUrl(urlFinal).build();
      cron.getRange(CRON_CFG.CR_FILA_INI + i, CRON_CFG.CR_COL_ARCH).setRichTextValue(rich);
      sincronizados++;
    } catch(e) {
      Logger.log("Error sincronizando fila " + (CRON_CFG.CR_FILA_INI + i) + ": " + e.message);
    }
  }

  _registrarActividad(_usuarioActual(), "sincronizar_archivos_Q", "",
    "Sincronizados: " + sincronizados + " · Ya tenían: " + yaTenian + " · Sin match: " + sinMatchPanel);

  return {
    ok: true,
    sincronizados: sincronizados,
    yaTenian: yaTenian,
    sinMatchPanel: sinMatchPanel,
    mensaje: "✓ " + sincronizados + " filas actualizadas en columna Q. " +
             yaTenian + " ya tenían archivo. " +
             sinMatchPanel + " sin match en PANEL DE CONTROL."
  };
}

function asignarArchivoAEvento(filaCronograma, fileId, fileUrl, fileName) {
  if (!filaCronograma || !fileId) throw new Error("Faltan datos para asignar archivo.");
  var ss = _getSS();
  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  if (!cron) throw new Error("No se encontró " + CRON_CFG.HOJA_CRONOGRAMA);

  // VALIDACIÓN DURA: bloquear si Q ya tiene archivo
  var richExistente = cron.getRange(filaCronograma, CRON_CFG.CR_COL_ARCH).getRichTextValue();
  var valorExistente = cron.getRange(filaCronograma, CRON_CFG.CR_COL_ARCH).getValue();
  if (_extraerUrlSmartChip(richExistente, valorExistente)) {
    throw new Error("Bloqueado: la fila " + filaCronograma +
      " ya tiene un archivo asignado en la columna Q. No se permite sobrescribir.");
  }

  var url = fileUrl || ("https://docs.google.com/spreadsheets/d/" + fileId + "/edit");
  var nombreVisible = fileName || cron.getRange(filaCronograma, CRON_CFG.CR_COL_CLIENTE).getValue();

  // 1. Smart Chip en Q
  var rich = SpreadsheetApp.newRichTextValue()
    .setText(nombreVisible).setLinkUrl(url).build();
  cron.getRange(filaCronograma, CRON_CFG.CR_COL_ARCH).setRichTextValue(rich);

  // 2. FASE 8.60 (antes 8.36): al vincular el archivo la actividad ARRANCA HOY:
  //    · Fecha de Inicio (col L) = fecha de creación del archivo — SIEMPRE se
  //      reemplaza (una fecha planificada lejana ya no aplica si arrancó hoy).
  //    · Fecha de Entrega tentativa (col N) = inicio + 1 día (plazo estándar
  //      de cierre de inventario; editable a mano después).
  var fIniArch = _fechaCreacionArchivo(fileId) || _soloFecha(new Date());
  cron.getRange(filaCronograma, CRON_CFG.CR_COL_FECHA)
      .setValue(fIniArch).setNumberFormat("dd/MM/yyyy");
  var fEntTent = _soloFecha(new Date(fIniArch.getTime() + 86400000));
  cron.getRange(filaCronograma, CRON_CFG.CR_COL_FECHA_ENT)
      .setValue(fEntTent).setNumberFormat("dd/MM/yyyy");

  // 3. Estado = "En Proceso" si estaba "Pendiente" o vacío
  var estadoActual = String(cron.getRange(filaCronograma, CRON_CFG.CR_COL_ESTADO).getValue() || "").toLowerCase();
  if (estadoActual === "" || estadoActual.indexOf("pendiente") !== -1) {
    cron.getRange(filaCronograma, CRON_CFG.CR_COL_ESTADO).setValue("En Proceso");
  }

  // 4. FASE 8.67: registrar RESPONSABLE (col I) si el evento aún no tiene uno.
  //    Al VINCULAR el archivo, el usuario que lo vincula queda como responsable.
  //    Si el evento ya traía responsable (de su creación), se respeta.
  try {
    var respEvt = String(cron.getRange(filaCronograma, CRON_CFG.CR_COL_RESP).getValue() || "").trim();
    if (!respEvt) {
      var nomVinc = _nombreUsuarioActual();
      if (nomVinc) cron.getRange(filaCronograma, CRON_CFG.CR_COL_RESP).setValue(String(nomVinc).toUpperCase());
    }
  } catch (eResp) {}

  return { ok: true, fila: filaCronograma };
}


/* ==========================================================================
   7. CREAR evento nuevo en cronograma (con o sin archivo asociado)
   ========================================================================== */

function _proximaFilaCronograma(cron) {
  var ult = cron.getLastRow();
  return (ult < CRON_CFG.CR_FILA_INI) ? CRON_CFG.CR_FILA_INI : ult + 1;
}

function _proximoNumeroCronograma(cron) {
  var ult = cron.getLastRow();
  if (ult < CRON_CFG.CR_FILA_INI) return 1;
  var n = ult - CRON_CFG.CR_FILA_INI + 1;
  var nums = cron.getRange(CRON_CFG.CR_FILA_INI, CRON_CFG.CR_COL_NUMERO, n, 1).getValues();
  var max = 0;
  nums.forEach(function(r){ var v = parseInt(r[0], 10); if (!isNaN(v) && v > max) max = v; });
  return max + 1;
}

function crearEventoCronograma(datos) {
  datos = datos || {};
  // FASE 8.63 (R5): si no se indica responsable, se registra el USUARIO LOGEADO
  // que crea el evento (autor). Se canoniza el nombre (R3).
  if (!datos.responsable) datos.responsable = _nombreUsuarioActual();
  if (datos.responsable) datos.responsable = _canonNombre(datos.responsable);
  // Validación dura: campos obligatorios
  if (!datos.cliente || !datos.titulo || !datos.responsable || !datos.fechaInicio) {
    throw new Error("Campos obligatorios faltantes: Cliente, Título, Responsable, Fecha Inicio.");
  }
  var ss = _getSS();
  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  if (!cron) throw new Error("No se encontró " + CRON_CFG.HOJA_CRONOGRAMA);

  var fila = _proximaFilaCronograma(cron);
  
  // FIX: Parsear fechas YYYY-MM-DD separando por guiones para evitar desfase de Timezone (1 día menos)
  function parsearFechaLocal(fechaStr) {
    if (!fechaStr) return null;
    var parts = String(fechaStr).split("-");
    if (parts.length === 3) return new Date(parseInt(parts[0],10), parseInt(parts[1],10)-1, parseInt(parts[2],10));
    return new Date(fechaStr);
  }
  
  var fechaIni = _soloFecha(parsearFechaLocal(datos.fechaInicio));
  var fechaEnt = datos.fechaEntrega ? _soloFecha(parsearFechaLocal(datos.fechaEntrega)) : null;
  // FASE 8.60: la fecha fin tentativa es OPCIONAL — si no se indica, se ASIGNA
  // inicio + 1 día (plazo estándar de cierre; editable después en la hoja).
  if (!fechaEnt) fechaEnt = _soloFecha(new Date(fechaIni.getTime() + 86400000));
  var anio = fechaIni.getFullYear();
  var mesNum = fechaIni.getMonth();
  var meses = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO",
               "JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];

  // Escribir fila completa
  cron.getRange(fila, CRON_CFG.CR_COL_NUMERO).setValue(_proximoNumeroCronograma(cron));
  cron.getRange(fila, CRON_CFG.CR_COL_ANIO).setValue(anio);
  cron.getRange(fila, CRON_CFG.CR_COL_TITULO).setValue(datos.titulo);
  cron.getRange(fila, CRON_CFG.CR_COL_CLIENTE).setValue(String(datos.cliente).toUpperCase());
  cron.getRange(fila, CRON_CFG.CR_COL_CATEG).setValue(datos.categoria || "Inventario Programado");
  cron.getRange(fila, CRON_CFG.CR_COL_MES).setValue(meses[mesNum]);
  cron.getRange(fila, CRON_CFG.CR_COL_FREC).setValue(datos.frecuencia || "MENSUAL");
  cron.getRange(fila, CRON_CFG.CR_COL_RESP).setValue(datos.responsable);
  cron.getRange(fila, CRON_CFG.CR_COL_PRIO).setValue(datos.prioridad || "Media");
  if (datos.observaciones) cron.getRange(fila, CRON_CFG.CR_COL_OBS).setValue(datos.observaciones);
  cron.getRange(fila, CRON_CFG.CR_COL_FECHA).setValue(fechaIni).setNumberFormat("dd/MM/yyyy");
  cron.getRange(fila, CRON_CFG.CR_COL_ESTADO).setValue("Pendiente");
  if (fechaEnt) cron.getRange(fila, CRON_CFG.CR_COL_FECHA_ENT).setValue(fechaEnt).setNumberFormat("dd/MM/yyyy");
  cron.getRange(fila, CRON_CFG.CR_COL_PCT).setValue(0);

  // FASE 8.58: registrar el EQUIPO de la tarea (responsable + apoyos) en
  // EQUIPOS_TAREA para el analytics de apoyos/exclusiones. Best-effort.
  try {
    registrarEquipoTarea(fila, datos.cliente, datos.titulo, datos.responsable, datos.apoyos || []);
  } catch (eEq) {}

  // FASE 8.65 (A): sincronizar AUTOMÁTICAMENTE con Google Calendar (best-effort).
  try {
    _calUpsertEvento({ fila: fila, cliente: datos.cliente, titulo: datos.titulo,
      responsable: datos.responsable, categoria: datos.categoria,
      fechaInicioMs: fechaIni.getTime(), fileUrl: "" });
  } catch (eCal) {}

  return { ok: true, fila: fila };
}


function crearEventoYAsignarArchivo(datosEvento, fileId, fileUrl, fileName) {
  var res = crearEventoCronograma(datosEvento);
  // Después de crear, asignar archivo (re-usa la lógica de asignación)
  // Como acaba de crearse, no tiene archivo: pasa la validación.
  asignarArchivoAEvento(res.fila, fileId, fileUrl, fileName);
  return res;
}


/* ==========================================================================
   8. CREACIÓN DE ARCHIVO INTEGRAL (wizard) — wrapper sobre procesarCreacionArchivo
   --------------------------------------------------------------------------
   datos.eventoAsignacion = {
     modo: "asignar" | "crear" | "ninguno",
     filaEvento: <int>           // si modo=asignar
     datosEvento: {...}          // si modo=crear
   }
   ========================================================================== */

/* ==========================================================================
   FIX FASE 8.4: procesarCreacionArchivo — Función NUCLEAR del wizard.
   Crea el archivo físico en Drive a partir de la plantilla, escribe los datos
   del CSV en la PLANILLA DE CONTEO FISICO y registra en PANEL DE CONTROL.
   Esta es la función original del wizard histórico, restaurada porque
   procesarCreacionArchivoIntegral la llama internamente.
   ========================================================================== */
function procesarCreacionArchivo(datos) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error("El sistema está ocupado por otro operador. Intenta de nuevo en unos segundos.");
  }

  try {
    var ss = _getSS();
    var sheet = ss.getSheetByName("PANEL DE CONTROL");

    if (!datos.folderId || datos.folderId === "VIRTUAL_ROOT") {
      throw new Error("Carpeta destino inválida.");
    }
    var folder = DriveApp.getFolderById(datos.folderId);

    // 1. Crear archivo copia de la plantilla
    var newFile = DriveApp.getFileById(CONFIG.TEMPLATE_ID).makeCopy(datos.fileName, folder);

    // FIX FASE 8.24: compartir solo con dominio Itsanet + equipo activo
    // (antes era ANYONE_WITH_LINK = cualquiera con link, incluso externos).
    var resCompartir;
    try {
      resCompartir = _compartirArchivoConEquipo(newFile);
      // FIX FASE 8.28: guardar ID para que repararPermisosArchivo() sin parámetro
      // pueda usarlo en caso de necesitar reparar el último archivo creado
      try {
        PropertiesService.getScriptProperties().setProperty(
          "ULTIMO_ARCHIVO_CREADO", newFile.getId());
      } catch (eP) {}
    } catch (permError) {
      // Si la política del dominio bloquea totalmente, se mantienen permisos heredados
      resCompartir = { dominio:false, editoresAgregados:0, editoresFallidos:0, errores:[String(permError && permError.message || permError)] };
    }

    // 2. Procesar fuente de datos
    if (datos.dataSource === 'CSV' && datos.csvData && datos.csvData.length > 0) {
      var ssNuevo = SpreadsheetApp.openById(newFile.getId());
      var hojaConteo = ssNuevo.getSheetByName("PLANILLA DE CONTEO FISICO");

      if (hojaConteo) {
        var numFilas = datos.csvData.length;

        // El array de cada fila tiene 17 posiciones (índices 0..16).
        // Índice 4 = Columna E (CLIENTE)
        // Índices 6..16 = Columnas G..Q (Producto, Lote, Cantidad, etc.)
        var matrizCliente = datos.csvData.map(function(r){ return [r[4] || ""]; });
        var matrizGQ      = datos.csvData.map(function(r){ return r.slice(6, 17); });

        // Escribir CLIENTE en Columna 5 (E) sin tocar cabecera
        hojaConteo.getRange(2, 5, numFilas, 1).setValues(matrizCliente);
        // Escribir métricas en Columnas 7..17 (G..Q)
        hojaConteo.getRange(2, 7, numFilas, 11).setValues(matrizGQ);
      }
    }

    // 3. Buscar última fila real en PANEL DE CONTROL usando Columna A (CLIENTE)
    var datosColA = sheet.getRange("A:A").getValues();
    var newRow = 1;
    for (var i = 0; i < datosColA.length; i++) {
      if (datosColA[i][0] !== "") newRow = i + 1;
    }
    newRow = newRow + 1;

    // 4. Registrar en PANEL DE CONTROL
    var fechaFormateada = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
    sheet.getRange(newRow, 1).setValue(datos.clientName.toUpperCase());
    sheet.getRange(newRow, 2).setValue(newFile.getUrl());
    sheet.getRange(newRow, 3).setValue(newFile.getId());
    sheet.getRange(newRow, 4).setValue(fechaFormateada);

    // FIX FASE 8.55: estado inicial "En Proceso" (col G) + responsable = usuario
    // creador/vinculador (col I). Best-effort: nunca bloquea la creación.
    try {
      sheet.getRange(newRow, 7).setValue("En Proceso");
      var _emailCr = _usuarioActual();
      var _uCr = _emailCr ? _obtenerUsuario(_emailCr) : null;
      var _nomCr = (_uCr && _uCr.nombre) ? String(_uCr.nombre).toUpperCase() : (_emailCr || "");
      if (_nomCr) sheet.getRange(newRow, 9).setValue(_nomCr);
    } catch (eResp) {}

    return {
      folderName: folder.getName(),
      fileUrl: newFile.getUrl()
    };

  } catch (e) {
    throw new Error("Error: " + e.message);
  } finally {
    lock.releaseLock();
  }
}

/* ==========================================================================
   FIX FASE 8.5: FALLBACK INLINE — Garantiza que la creación de archivo SIEMPRE
   funcione, incluso si por algún motivo procesarCreacionArchivo no está cargada
   (caché del deploy, redeploy incompleto, etc). Lógica IDÉNTICA al wizard
   histórico. Esta función NO depende de ninguna otra del backend.
   ========================================================================== */
function _procesarCreacionArchivoInline(datos) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error("El sistema está ocupado por otro operador. Intenta de nuevo en unos segundos.");
  }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    // Si no hay spreadsheet activo (Web App context), usar _getSS
    if (!ss) ss = _getSS();
    var sheet = ss.getSheetByName("PANEL DE CONTROL");
    if (!sheet) throw new Error("No se encontró la hoja PANEL DE CONTROL.");

    if (!datos.folderId || datos.folderId === "VIRTUAL_ROOT") {
      throw new Error("Carpeta destino inválida.");
    }
    var folder = DriveApp.getFolderById(datos.folderId);

    // 1. Crear archivo copia de la plantilla
    var newFile = DriveApp.getFileById(CONFIG.TEMPLATE_ID).makeCopy(datos.fileName, folder);
    // FIX FASE 8.24: compartir solo con dominio Itsanet + equipo activo
    try { _compartirArchivoConEquipo(newFile); } catch (e) {}

    // 2. Procesar fuente de datos
    if (datos.dataSource === 'CSV' && datos.csvData && datos.csvData.length > 0) {
      var ssNuevo = SpreadsheetApp.openById(newFile.getId());
      var hojaConteo = ssNuevo.getSheetByName("PLANILLA DE CONTEO FISICO");
      if (hojaConteo) {
        var numFilas = datos.csvData.length;
        var matrizCliente = datos.csvData.map(function(r){ return [r[4] || ""]; });
        var matrizGQ      = datos.csvData.map(function(r){ return r.slice(6, 17); });
        hojaConteo.getRange(2, 5, numFilas, 1).setValues(matrizCliente);
        hojaConteo.getRange(2, 7, numFilas, 11).setValues(matrizGQ);
      }
    }

    // 3. Buscar última fila en PANEL DE CONTROL
    var datosColA = sheet.getRange("A:A").getValues();
    var newRow = 1;
    for (var i = 0; i < datosColA.length; i++) {
      if (datosColA[i][0] !== "") newRow = i + 1;
    }
    newRow = newRow + 1;

    // 4. Registrar en PANEL DE CONTROL
    var fechaFormateada = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
    sheet.getRange(newRow, 1).setValue(datos.clientName.toUpperCase());
    sheet.getRange(newRow, 2).setValue(newFile.getUrl());
    sheet.getRange(newRow, 3).setValue(newFile.getId());
    sheet.getRange(newRow, 4).setValue(fechaFormateada);

    // FIX FASE 8.55: estado inicial "En Proceso" (col G) + responsable = usuario
    // creador/vinculador (col I). Best-effort: nunca bloquea la creación.
    try {
      sheet.getRange(newRow, 7).setValue("En Proceso");
      var _emailCr = _usuarioActual();
      var _uCr = _emailCr ? _obtenerUsuario(_emailCr) : null;
      var _nomCr = (_uCr && _uCr.nombre) ? String(_uCr.nombre).toUpperCase() : (_emailCr || "");
      if (_nomCr) sheet.getRange(newRow, 9).setValue(_nomCr);
    } catch (eResp) {}

    return {
      folderName: folder.getName(),
      fileUrl: newFile.getUrl()
    };
  } catch (e) {
    throw new Error("Error al crear archivo: " + e.message);
  } finally {
    lock.releaseLock();
  }
}

function procesarCreacionArchivoIntegral(datos) {
  // Validación opcional: si modo=asignar, verificar ANTES de crear el archivo
  // que la fila destino siga libre (para no crear un archivo huérfano si está ocupada).
  if (datos.eventoAsignacion && datos.eventoAsignacion.modo === "asignar") {
    var ss = _getSS();
    var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
    var fila = datos.eventoAsignacion.filaEvento;
    var rich = cron.getRange(fila, CRON_CFG.CR_COL_ARCH).getRichTextValue();
    var val  = cron.getRange(fila, CRON_CFG.CR_COL_ARCH).getValue();
    if (_extraerUrlSmartChip(rich, val)) {
      throw new Error("El evento en fila " + fila + " ya tiene un archivo asignado. " +
        "Refresca la lista y vuelve a intentarlo.");
    }
  }

  // FIX FASE 8.5: Verificación defensiva — si por algún motivo `procesarCreacionArchivo`
  // no está disponible en el scope (caché del deploy, archivo no cargado, etc.),
  // ejecutamos la lógica inline en su lugar, en vez de fallar con ReferenceError.
  var resultado;
  if (typeof procesarCreacionArchivo === "function") {
    resultado = procesarCreacionArchivo(datos);
  } else {
    // Fallback inline: misma lógica histórica del wizard
    resultado = _procesarCreacionArchivoInline(datos);
  }
  // resultado = { folderName, fileUrl }
  var fileUrl = resultado.fileUrl;
  var fileId  = _idDeUrl(fileUrl);
  var fileName = datos.fileName;

  // Post-proceso: vincular al cronograma según el modo
  var ev = datos.eventoAsignacion || { modo: "ninguno" };
  try {
    if (ev.modo === "asignar" && ev.filaEvento) {
      asignarArchivoAEvento(ev.filaEvento, fileId, fileUrl, fileName);
      resultado.vinculo = { tipo: "asignado", fila: ev.filaEvento };
    } else if (ev.modo === "crear" && ev.datosEvento) {
      var resEv = crearEventoYAsignarArchivo(ev.datosEvento, fileId, fileUrl, fileName);
      resultado.vinculo = { tipo: "creado", fila: resEv.fila };
    }
    // modo "ninguno" → no se vincula, queda como en el flujo viejo
  } catch (e) {
    // El archivo SÍ se creó. Solo la vinculación falló.
    resultado.vinculoError = e.message;
  }

  return resultado;
}


/* ==========================================================================
   9. DASHBOARD INTEGRAL — todo en una sola llamada
   ========================================================================== */

/* HOTFIX 8.66.5: función LIGERA para el wizard — solo clientes + equipo.
   El wizard llamaba a obtenerEstadoIntegralDashboard() (pesada: lee cronograma,
   panel, apoyos, presencia, chart…) solo para poblar 2 listas → se colgaba y
   mostraba "El wizard está tardando demasiado". Esto es rápido (2 columnas). */
function obtenerClientesEquipoWizard() {
  var ss = _getSS();
  var clientesSet = {};
  try {
    var pan = ss.getSheetByName(CRON_CFG.HOJA_PANEL);
    if (pan && pan.getLastRow() >= 2) {
      pan.getRange(2, 1, pan.getLastRow() - 1, 1).getValues()
        .forEach(function(r){ if (r[0]) clientesSet[String(r[0]).trim().toUpperCase()] = true; });
    }
  } catch (e) {}
  try {
    var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
    if (cron && cron.getLastRow() >= CRON_CFG.CR_FILA_INI) {
      var n = cron.getLastRow() - CRON_CFG.CR_FILA_INI + 1;
      cron.getRange(CRON_CFG.CR_FILA_INI, CRON_CFG.CR_COL_CLIENTE, n, 1).getValues()
        .forEach(function(r){ if (r[0]) clientesSet[String(r[0]).trim().toUpperCase()] = true; });
    }
  } catch (e) {}
  var equipo = [];
  try { equipo = _listarEquipoActivo(); } catch (e) {}
  // FASE 8.67: nombre CANÓNICO del usuario logeado → el wizard lo usa como
  // PRIMERA SUGERENCIA (responsable por defecto) en "Nuevo evento".
  var yo = "";
  try { yo = _canonNombre(_nombreUsuarioActual()); } catch (e) {}
  return { clientes: Object.keys(clientesSet).sort(), equipo: equipo, yo: yo };
}

/* ==========================================================================
   FASE 8.69: CIERRE FIABLE DE LA VENTANA FLOTANTE DEL ASISTENTE
   --------------------------------------------------------------------------
   El asistente (web app) corre dentro de un IFRAME sandbox de Apps Script, por
   eso NO puede cerrar su propia ventana superior (window.close / host.close no
   funcionan de forma fiable en un web app independiente). La ÚNICA vía robusta
   es que el PANEL (que abrió la ventana con window.open) la cierre con
   win.close(). Para avisarle usamos un buzón en CacheService por TOKEN:
     · El panel genera un token y lo pasa en la URL (?wtok=).
     · El asistente, al terminar, marca el token con dash_wizardPedirCierre.
     · El panel poll-ea dash_wizardDebeCerrar(token); cuando devuelve true,
       cierra la ventana y refresca. El token evita colisiones entre usuarios.
   ========================================================================== */
function dash_wizardPedirCierre(token) {
  token = String(token || "").replace(/[^A-Za-z0-9_]/g, "");
  if (!token) return false;
  try { CacheService.getScriptCache().put("WIZCLOSE::" + token, "1", 300); } catch (e) {}
  return true;
}
function dash_wizardDebeCerrar(token) {
  token = String(token || "").replace(/[^A-Za-z0-9_]/g, "");
  if (!token) return false;
  try {
    var c = CacheService.getScriptCache();
    if (c.get("WIZCLOSE::" + token)) { c.remove("WIZCLOSE::" + token); return true; }
  } catch (e) {}
  return false;
}

function obtenerEstadoIntegralDashboard() {
  try { _marcarPresencia(); } catch (e) {}   // FASE 8.65 (R5): presencia "activo ahora"
  var ss = _getSS();
  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  var pan  = ss.getSheetByName(CRON_CFG.HOJA_PANEL);
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var anioActual = hoy.getFullYear();
  var mesActual = hoy.getMonth();

  // -------- Cronograma --------
  var cronograma = [];
  var cargaResp = {};

  // FASE 8.59: apoyos ACTIVOS por evento (hoja EQUIPOS_TAREA) — una sola lectura.
  // Visibilidad para jefes: quién apoya cada tarea, en cronograma y carga.
  var apoyosPorFila = {};
  var apoyosDesdePorFila = {};   // FASE 8.60: NOMBRE → timestamp de registro (desde cuándo apoya)
  try {
    var shEqD = ss.getSheetByName(EQT_CFG.HOJA);
    if (shEqD && shEqD.getLastRow() >= 2) {
      var vEqD = shEqD.getRange(2, 1, shEqD.getLastRow() - 1, 10).getValues();
      vEqD.forEach(function(rq){
        var fe = String(rq[1] || "").trim();
        if (!fe) return;
        // FASE 8.63 (R2): SOLO apoyos ACTIVOS aparecen en los módulos; los
        // RETIRADO/EXCLUIDO quedan en la hoja para trazabilidad pero se ocultan.
        if (String(rq[7] || "").toUpperCase() !== "ACTIVO") return;
        if (String(rq[6] || "").toUpperCase() !== "APOYO") return;
        var nomAp = _canonNombre(String(rq[5] || "").trim());  // FASE 8.63 R3
        if (!nomAp) return;
        if (!apoyosPorFila[fe]) apoyosPorFila[fe] = [];
        if (apoyosPorFila[fe].indexOf(nomAp) === -1) apoyosPorFila[fe].push(nomAp);
        var tsReg = (rq[0] instanceof Date) ? rq[0].getTime() : null;
        if (tsReg) {
          if (!apoyosDesdePorFila[fe]) apoyosDesdePorFila[fe] = {};
          if (!apoyosDesdePorFila[fe][nomAp.toUpperCase()]) apoyosDesdePorFila[fe][nomAp.toUpperCase()] = tsReg;
        }
      });
    }
  } catch (eEqD) {}
  // FIX FASE 8.34: serie "Trabajos Slotting" del gráfico — se cuentan los
  // eventos del CRONOGRAMA cuya CATEGORIA (col F) contenga 'slotting',
  // entregados, agrupados por MES DE ENTREGA (col N) del año actual.
  var chartSlotting = []; for (var ms0 = 0; ms0 < 12; ms0++) chartSlotting.push(0);

  // FIX FASE 8.9: Pre-cargar índice PANEL DE CONTROL por cliente (para resolver
  // urlArchivo cuando la columna Q del cronograma está vacía o apunta a archivo
  // antiguo que NO es el archivo activo del cliente).
  // Estructura: panelPorCliente[CLIENTE.toUpperCase()] = [{ link, id, fechaInicio, fila }, ...]
  // ordenado por fechaInicio descendente (más reciente primero).
  var panelPorCliente = {};
  if (pan && pan.getLastRow() >= 2) {
    var pdatFull = pan.getRange(2, 1, pan.getLastRow() - 1, Math.min(pan.getLastColumn(), 30)).getValues();
    // FIX FASE 8.11: Leer también RichText de Col B (link) por si tiene Smart Chip
    var richLinkCol;
    try {
      richLinkCol = pan.getRange(2, CRON_CFG.PA_COL_LINK, pan.getLastRow() - 1, 1).getRichTextValues();
    } catch (e) { richLinkCol = null; }

    pdatFull.forEach(function(pr, idx) {
      var cli = String(pr[CRON_CFG.PA_COL_CLIENTE - 1] || "").trim().toUpperCase();
      if (!cli) return;
      var rawLink = pr[CRON_CFG.PA_COL_LINK - 1];
      var rawId   = pr[CRON_CFG.PA_COL_ID - 1];

      // FIX FASE 8.11: Sanitización completa del ID.
      // 1) Primero intenta el ID puro de col C
      // 2) Si no, extrae del link plano de col B
      // 3) Si no, intenta el RichText link URL de col B (Smart Chip)
      var idLimpio = _idDeUrl(String(rawId || "").trim());
      if (!idLimpio) idLimpio = _idDeUrl(String(rawLink || "").trim());
      if (!idLimpio && richLinkCol && richLinkCol[idx] && richLinkCol[idx][0]) {
        try {
          var runs = richLinkCol[idx][0].getRuns();
          for (var rk = 0; rk < runs.length; rk++) {
            var u = runs[rk].getLinkUrl();
            if (u) {
              idLimpio = _idDeUrl(u);
              if (idLimpio) break;
            }
          }
        } catch (eRl) {}
      }
      if (!idLimpio) return; // Sin ID válido → skip

      // URL canónica reconstruida desde el ID limpio (garantiza formato válido)
      var urlCanonica = "https://docs.google.com/spreadsheets/d/" + idLimpio + "/edit";
      var fechaIni = pr[CRON_CFG.PA_COL_FECHA_I - 1];
      panelPorCliente[cli] = panelPorCliente[cli] || [];
      panelPorCliente[cli].push({
        link: urlCanonica,
        id: idLimpio,
        fechaInicio: (fechaIni instanceof Date) ? fechaIni.getTime() : 0,
        fila: idx + 2
      });
    });
    // Ordenar cada lista por fecha descendente
    Object.keys(panelPorCliente).forEach(function(cli){
      panelPorCliente[cli].sort(function(a,b){ return b.fechaInicio - a.fechaInicio; });
    });
  }

  if (cron && cron.getLastRow() >= CRON_CFG.CR_FILA_INI) {
    var n = cron.getLastRow() - CRON_CFG.CR_FILA_INI + 1;
    var dat = cron.getRange(CRON_CFG.CR_FILA_INI, 1, n, CRON_CFG.CR_COL_NOTIF).getValues();
    var rQ = cron.getRange(CRON_CFG.CR_FILA_INI, CRON_CFG.CR_COL_ARCH, n, 1).getRichTextValues();

    for (var i = 0; i < n; i++) {
      var r = dat[i];
      if (!r[CRON_CFG.CR_COL_CLIENTE - 1]) continue;
      var fIni = r[CRON_CFG.CR_COL_FECHA - 1];
      var ts = (fIni instanceof Date) ? fIni.getTime() : null;
      var diff = ts ? Math.round((ts - hoy.getTime()) / 86400000) : null;
      var estado = r[CRON_CFG.CR_COL_ESTADO - 1] || "Pendiente";
      var entregado = String(estado).toLowerCase().indexOf("entregado") !== -1;
      var responsable = r[CRON_CFG.CR_COL_RESP - 1] || "";
      var categoria = r[CRON_CFG.CR_COL_CATEG - 1] || "";

      // FIX FASE 8.34: serie Slotting — entregados por mes de entrega (col N).
      if (entregado && _contieneSlotting(categoria)) {
        var fEntSlot = r[CRON_CFG.CR_COL_FECHA_ENT - 1];
        if (fEntSlot instanceof Date && fEntSlot.getFullYear() === anioActual) {
          chartSlotting[fEntSlot.getMonth()]++;
        }
      }

      var urlArchivoExtraida = _extraerUrlSmartChip(rQ[i][0], r[CRON_CFG.CR_COL_ARCH - 1]);
      var fileIdExtraido = _idDeUrl(urlArchivoExtraida);

      if (urlArchivoExtraida && !fileIdExtraido) {
        urlArchivoExtraida = "";
      } else if (urlArchivoExtraida && fileIdExtraido) {
        urlArchivoExtraida = "https://docs.google.com/spreadsheets/d/" + fileIdExtraido + "/edit";
      }

      var fuenteArchivo = urlArchivoExtraida ? "cronograma_Q" : "ninguno";
      var archivoSugeridoUrl = "";
      var archivoSugeridoId = "";
      
      // FIX: NUNCA inyectar un archivo "fantasma" al evento. 
      // Si no tiene archivo en la columna Q, se queda vacío. Solo pre-calculamos una sugerencia.
      var estadoLower = String(estado).toLowerCase();
      if (!urlArchivoExtraida) {
        var cliCron = String(r[CRON_CFG.CR_COL_CLIENTE - 1] || "").trim().toUpperCase();
        var candidatos = panelPorCliente[cliCron] || [];
        if (candidatos.length > 0) {
          var elegido = candidatos[0];
          if (ts) {
            var menorDif = Math.abs(elegido.fechaInicio - ts);
            for (var k = 1; k < candidatos.length; k++) {
              var dif = Math.abs(candidatos[k].fechaInicio - ts);
              if (dif < menorDif) { elegido = candidatos[k]; menorDif = dif; }
            }
          }
          if (elegido && elegido.id) {
            archivoSugeridoUrl = elegido.link;
            archivoSugeridoId = elegido.id;
          }
        }
      }

      

      // FIX FASE 8.68: el calendario operativo debe pintar TODO el lapso del
      // evento (los auditores necesitan ver TODOS los días trabajados, no solo
      // el inicio). El fin del rango = el MÁS TARDÍO de estas señales:
      //   · FECHA DE ENTREGA (col N) — la que fija el usuario (ej. 1→31 jul)
      //   · fechaInicio + (duración col O − 1) — plazo por duración
      //   · fechaInicio — mínimo (evento de 1 día)
      // ANTES sólo usaba la duración (col O); si estaba vacía marcaba 1 solo día,
      // por eso Telefónica (inicio 1/jul, entrega 31/jul, sin duración) sólo
      // mostraba el 1 de julio.
      var duracionRaw = r[CRON_CFG.CR_COL_DURAC - 1];
      var duracionNum = parseInt(duracionRaw, 10);
      if (isNaN(duracionNum) || duracionNum < 1) duracionNum = 1;
      var fechaFinTs = null;
      if (ts) {
        // Base: plazo por duración (inicio + duración − 1, último día inclusive).
        fechaFinTs = new Date(ts).getTime() + (duracionNum - 1) * 86400000;
        // Si la FECHA DE ENTREGA (col N) es válida y POSTERIOR, ella manda:
        // define el fin real del lapso (inicio → entrega), inclusive.
        var fEntCol = r[CRON_CFG.CR_COL_FECHA_ENT - 1];
        if (fEntCol instanceof Date) {
          var fEntMid = new Date(fEntCol.getFullYear(), fEntCol.getMonth(), fEntCol.getDate()).getTime();
          if (fEntMid > fechaFinTs) fechaFinTs = fEntMid;
        }
      }

      cronograma.push({
        fila: CRON_CFG.CR_FILA_INI + i,
        cliente:      r[CRON_CFG.CR_COL_CLIENTE - 1],
        titulo:       r[CRON_CFG.CR_COL_TITULO - 1] || "",
        categoria:    categoria,
        responsable:  responsable,
        apoyos:       apoyosPorFila[String(CRON_CFG.CR_FILA_INI + i)] || [], // FASE 8.59
        apoyosDesde:  apoyosDesdePorFila[String(CRON_CFG.CR_FILA_INI + i)] || {}, // FASE 8.60
        prioridad:    r[CRON_CFG.CR_COL_PRIO - 1] || "Media", // FIX: Enviamos la prioridad
        fechaInicio:  ts,
        fechaFin:     fechaFinTs,
        duracion:     duracionNum,
        fechaEntrega: (r[CRON_CFG.CR_COL_FECHA_ENT - 1] instanceof Date) ? r[CRON_CFG.CR_COL_FECHA_ENT - 1].getTime() : null,
        estado:       estado,
        pct:          r[CRON_CFG.CR_COL_PCT - 1] || 0,
        urlArchivo:   urlArchivoExtraida, // Esto ahora es 100% REAL. Sin fantasmas.
        fileId:       fileIdExtraido,
        urlSugerida:  archivoSugeridoUrl, // Se pasa la sugerencia aparte
        idSugerido:   archivoSugeridoId,
        wmsUrl:       _obtenerWmsUrl() || "",
        fuenteArchivo: fuenteArchivo,
        ultimaNotif:  (r[CRON_CFG.CR_COL_NOTIF - 1] instanceof Date) ? r[CRON_CFG.CR_COL_NOTIF - 1].getTime() : null,
        diasRestantes: diff
      });

      // Defensa: si el "responsable" parece ser una frecuencia (mal mapeo
      // en la hoja), no lo cuenta como operario. Validamos contra una lista
      // de palabras-frecuencia conocidas.
      var FREC_BLOCK = ["MENSUAL","SEMANAL","QUINCENAL","EMERGENTE",
                        "ÚNICA","UNICA","DIARIA","BIMESTRAL","TRIMESTRAL",
                        "ANUAL","SEMESTRAL"];
      var respUp = String(responsable).toUpperCase().trim();
      var esResponsableReal = responsable && FREC_BLOCK.indexOf(respUp) === -1;
      if (!entregado && esResponsableReal) {
        cargaResp[_canonNombre(responsable)] = (cargaResp[_canonNombre(responsable)] || 0) + 1;  // FASE 8.63 R3
      }
      // FASE 8.59: los APOYOS activos también suman en la carga por operario
      // (los jefes ven dónde está cada usuario, sea responsable o apoyo).
      if (!entregado) {
        var apsC = apoyosPorFila[String(CRON_CFG.CR_FILA_INI + i)] || [];
        var respCanonUp = _canonNombre(responsable).toUpperCase();
        for (var ac = 0; ac < apsC.length; ac++) {
          var apn = apsC[ac];   // ya viene canónico
          if (apn && apn.toUpperCase() !== respCanonUp) {
            cargaResp[apn] = (cargaResp[apn] || 0) + 1;
          }
        }
      }
    }
    cronograma.sort(function(a,b){
      if (a.fechaInicio === null) return 1;
      if (b.fechaInicio === null) return -1;
      return a.fechaInicio - b.fechaInicio;
    });
  }

  // -------- Panel: últimos N, KPIs anuales, chart mensual --------
  var panelUltimos = [];
  var unidTot = 0, refsTot = 0, posTot = 0;
  var entregadosAnio = 0;
  var clientesActivosMes = {};
  var pendientesMes = 0, entregadosMes = 0;

  // Para chart anual: por mes (0-11) → {invent: count, unid: suma, slotting: count}
  // FIX FASE 8.34: slotting viene del CRONOGRAMA (calculado arriba); invent/unid del PANEL.
  var chart = [];
  for (var m = 0; m < 12; m++) chart.push({ mes: m, invent: 0, unid: 0, slotting: chartSlotting[m] });

  if (pan && pan.getLastRow() >= 2) {
    // FIX FASE 8.36 (render): reutiliza pdatFull (ya leído arriba) en vez de releer
    // el PANEL — una lectura menos por refresco del dashboard. Fallback defensivo.
    var pdat = (typeof pdatFull !== "undefined" && pdatFull && pdatFull.length && pdatFull[0].length >= 15)
             ? pdatFull
             : pan.getRange(2, 1, pan.getLastRow() - 1, 15).getValues();
    for (var j = 0; j < pdat.length; j++) {
      var pr = pdat[j];
      var avance = String(pr[CRON_CFG.PA_COL_AVANCE - 1] || "");
      var entreg = avance.toLowerCase().indexOf("entregado") !== -1;
      var fechaI = pr[CRON_CFG.PA_COL_FECHA_I - 1];
      var fechaF = pr[CRON_CFG.PA_COL_FECHA_F - 1];
      var unid = parseFloat(pr[CRON_CFG.PA_COL_UNID - 1]) || 0;
      var refs = parseFloat(pr[CRON_CFG.PA_COL_REFS - 1]) || 0;
      var pos  = parseFloat(pr[CRON_CFG.PA_COL_POS - 1]) || 0;
      var cliente = pr[CRON_CFG.PA_COL_CLIENTE - 1];

      // KPIs anuales (filas con fecha inicio del año actual)
      if (fechaI instanceof Date && fechaI.getFullYear() === anioActual) {
        unidTot += unid; refsTot += refs; posTot += pos;
        if (entreg) entregadosAnio++;
        if (fechaI.getMonth() === mesActual && cliente) {
          clientesActivosMes[cliente] = true;
          if (entreg) entregadosMes++;
          else pendientesMes++;
        }
      }

      // Chart anual: usar FECHA FINAL del año actual (cuando se entregó)
      if (entreg && fechaF instanceof Date && fechaF.getFullYear() === anioActual) {
        var m2 = fechaF.getMonth();
        chart[m2].invent++;
        chart[m2].unid += unid;
      }
    }

    // Últimos 5 del panel ordenados por fecha inicio desc
    var orden = pdat.slice().sort(function(a,b){
      var ai = a[CRON_CFG.PA_COL_FECHA_I - 1];
      var bi = b[CRON_CFG.PA_COL_FECHA_I - 1];
      var at = ai instanceof Date ? ai.getTime() : 0;
      var bt = bi instanceof Date ? bi.getTime() : 0;
      return bt - at;
    });
    // FIX FASE 8.34: wms base + fileId/urlArchivo limpios para el botón de acceso.
    var wmsBasePanel = _obtenerWmsUrl() || "";
    // FIX: Filtrar para que muestre SOLO actividades de la semana actual
    var inicioSemana = new Date(hoy);
    var dow = inicioSemana.getDay();
    inicioSemana.setDate(inicioSemana.getDate() - (dow === 0 ? 6 : dow - 1));
    inicioSemana.setHours(0,0,0,0);

    var actividadesSemana = orden.filter(function(r) {
      var d = r[CRON_CFG.PA_COL_FECHA_I - 1];
      return (d instanceof Date && d.getTime() >= inicioSemana.getTime());
    });

    var wmsBasePanel = _obtenerWmsUrl() || "";
    panelUltimos = actividadesSemana.slice(0, 8).map(function(r){



      var idLimpioPan = _idDeUrl(String(r[CRON_CFG.PA_COL_ID - 1] || "").trim()) ||
                        _idDeUrl(String(r[CRON_CFG.PA_COL_LINK - 1] || "").trim());
      return {
        cliente: r[CRON_CFG.PA_COL_CLIENTE - 1],
        link: r[CRON_CFG.PA_COL_LINK - 1],
        id: r[CRON_CFG.PA_COL_ID - 1],
        // FIX FASE 8.34: acceso al archivo (Excel + WMS) desde "Actividades actuales"
        fileId: idLimpioPan,
        urlArchivo: idLimpioPan ? "https://docs.google.com/spreadsheets/d/" + idLimpioPan + "/edit" : "",
        wmsUrl: wmsBasePanel,
        fechaInicio: (r[CRON_CFG.PA_COL_FECHA_I - 1] instanceof Date) ?
                     r[CRON_CFG.PA_COL_FECHA_I - 1].getTime() : null,
        avance: r[CRON_CFG.PA_COL_AVANCE - 1],
        responsable: r[CRON_CFG.PA_COL_RESP - 1],
        unidades: parseFloat(r[CRON_CFG.PA_COL_UNID - 1]) || 0,
        efectividad: parseFloat(r[CRON_CFG.PA_COL_EFEC_U - 1]) || 0
      };
    });
  }

  // KPIs del cronograma
  var venc = 0, hoyCnt = 0, prox7 = 0, entregCronos = 0;
  cronograma.forEach(function(d){
    var entr = String(d.estado).toLowerCase().indexOf("entregado") !== -1;
    if (entr) { entregCronos++; return; }
    if (d.diasRestantes === null) return;
    if (d.diasRestantes < 0) venc++;
    else if (d.diasRestantes === 0) hoyCnt++;
    else if (d.diasRestantes <= 7) prox7++;
  });

  var totalMes = entregadosMes + pendientesMes;
  var avanceGlobalMes = totalMes > 0 ? (entregadosMes / totalMes) : 0;
  var clientesActivosCount = Object.keys(clientesActivosMes).length;

  // Lista única de clientes (para autocomplete del wizard)
  var clientesSet = {};
  if (pan && pan.getLastRow() >= 2) {
    // FIX FASE 8.36 (render): reutiliza pdatFull en vez de releer la columna A.
    var _cliSrc = (typeof pdatFull !== "undefined" && pdatFull && pdatFull.length)
                ? pdatFull
                : pan.getRange(2, 1, pan.getLastRow() - 1, 1).getValues();
    _cliSrc.forEach(function(r){ if (r[0]) clientesSet[String(r[0]).trim().toUpperCase()] = true; });
  }
  cronograma.forEach(function(d){ if (d.cliente) clientesSet[String(d.cliente).trim().toUpperCase()] = true; });
  var clientesLista = Object.keys(clientesSet).sort();

  return {
    fecha: new Date().getTime(),
    kpis: {
      vencidos: venc, hoy: hoyCnt, proximos7: prox7, entregadosCronos: entregCronos,
      unidades: unidTot, referencias: refsTot, posiciones: posTot,
      entregadosAnio: entregadosAnio,
      avanceGlobalMes: avanceGlobalMes, clientesActivosMes: clientesActivosCount
    },
    chartAnual: chart,
    cronograma: cronograma,
    panelUltimos: panelUltimos,
    cargaResp: cargaResp,
    usuariosActivos: (function(){ try { return obtenerUsuariosActivos(); } catch(e){ return {count:0,nombres:[]}; } })(),  // FASE 8.65 R5
    equipo: _listarEquipoActivo(),
    clientes: clientesLista,
    // FIX FASE 8.33: estado de la consolidación por lotes (para el indicador del
    // dashboard). Costo casi nulo: solo lee ScriptProperties.
    consolidacion: (function(){
      try {
        var st = _consolEstadoLeer();
        return {
          enCurso:    st.STATUS === "EN_CURSO",
          status:     st.STATUS || "IDLE",
          procesados: st.PROCESADOS || 0,
          total:      st.TOTAL || 0,
          modo:       st.MODO || ""
        };
      } catch (e) {
        return { enCurso:false, status:"IDLE", procesados:0, total:0, modo:"" };
      }
    })()
  };
}


/* ==========================================================================
   10. onEdit OPTIMIZADO  (reemplaza al de Código.gs)
   ========================================================================== */

function onEditOptimizado(e) {
  if (!e || !e.source) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) return;
  try {
    var sheet = e.source.getActiveSheet();
    var name = sheet.getName();

    if (name === "INVENTARIOS" || name === "REGISTRO") {
      try {
        if (e.oldValue !== undefined) e.range.setValue(e.oldValue);
        else e.range.setValue("");
        e.source.toast("⚠️ Hoja protegida", "Bloqueado", 2);
      } catch(er){}
      return;
    }

    if (name === CRON_CFG.HOJA_PANEL) {
      var fila = e.range.getRow();
      var col  = e.range.getColumn();
      if (col === CRON_CFG.PA_COL_ID && fila >= 2 && e.range.getValue()) {
        _actualizarFilaPanel(sheet, fila, String(e.range.getValue()).trim());
      }
      return;
    }

    if (name === CRON_CFG.HOJA_CRONOGRAMA) {
      var fila = e.range.getRow();
      var col  = e.range.getColumn();
      if (col === CRON_CFG.CR_COL_ESTADO && fila >= CRON_CFG.CR_FILA_INI) {
        var v = String(e.range.getValue() || "").toLowerCase();
        if (v.indexOf("entregado") !== -1) {
          sheet.getRange(fila, CRON_CFG.CR_COL_PCT).setValue(1);
          if (!sheet.getRange(fila, CRON_CFG.CR_COL_FECHA_ENT).getValue()) {
            sheet.getRange(fila, CRON_CFG.CR_COL_FECHA_ENT).setValue(new Date());
          }
        }
      }
    }
  } finally { lock.releaseLock(); }

  // Encadenar al handler del WMS (consolidado en este proyecto).
  // Si la hoja editada es propia del WMS (PLANILLA DE CONTEO FISICO en archivo
  // de inventario individual), la lógica del WMS aplica sus protecciones.
  try { onEditWMS(e); } catch (errWms) { Logger.log("onEditWMS: " + errWms.message); }
}

function _actualizarFilaPanel(sheet, fila, idRaw) {
  try {
    var id = (typeof extractIdFromUrl === "function") ? extractIdFromUrl(idRaw) : idRaw;
    var ssA = SpreadsheetApp.openById(id);
    var an = ssA.getSheetByName("ANALISIS");
    if (an) {
      sheet.getRange(fila, 10, 1, 6).setValues([[
        an.getRange("C23").getValue(), an.getRange("H23").getValue(),
        an.getRange("M23").getValue(), an.getRange("C25").getValue(),
        an.getRange("H25").getValue(), an.getRange("M25").getValue()
      ]]);
    }
    var reg = ssA.getSheetByName("REGISTRO");
    if (reg && reg.getLastRow() >= 1) {
      sheet.getRange(fila, 5).setValue(reg.getRange(reg.getLastRow(), 1).getValue());
    }
  } catch (err) {
    Logger.log("_actualizarFilaPanel falló fila " + fila + ": " + err.message);
  }
}


/* ==========================================================================
   11. MENÚ, TRIGGERS Y APERTURAS DE DIÁLOGOS
   ========================================================================== */

function anadirMenuOptimizaciones() {
  SpreadsheetApp.getUi()
    .createMenu("🎯 Centro de Mando")
    .addItem("Abrir Centro de Mando Integral", "abrirCentroDeMandoIntegral")
    .addSeparator()
    .addItem("⚙️ Setup inicial (1 sola vez)", "setupOptimizaciones")
    .addItem("🔒 Setup + protección hojas", "setupCompletoConProteccion")
    .addItem("⏰ Instalar triggers automáticos", "instalarTriggersRecordatorios")
    .addToUi();

  // FIX FASE 7.6: Menú COMPLETO de operaciones disponibles desde el libro
  // (replica las funciones del panel Web App para acceso directo de Coordinadores)
  SpreadsheetApp.getUi()
    .createMenu("🚀 Operaciones")
    .addItem("📦 Crear nuevo inventario (wizard)", "generarArchivoDesdeTabla")
    .addItem("📅 Nuevo evento del cronograma", "lanzarFormularioEvento")
    .addItem("🔄 Actualizar métricas del panel", "llenarDatosDesdeAnalisis")
    .addSeparator()
    .addItem("✅ Consolidar con auditoría", "dash_consolidarAuditoria")
    .addItem("⚠️ Pre-validar errores", "reportarErroresPrevio")
    .addItem("🧹 Limpiar duplicados y vacíos", "limpiarHojaConsolidada")
    .addSeparator()
    .addItem("📄 Exportar reporte por cliente", "exportarReporteDeUnClienteArchivo")
    .addItem("📧 Enviar recordatorios pendientes", "enviarRecordatoriosCronograma")
    .addItem("⇄ Sincronizar cronograma↔panel", "sincronizarEstadoCronogramaConPanel")
    .addToUi();

  // Menú adicional para la Web App / roles
  try { anadirMenuWebApp(); } catch (e) {}
}

function anadirMenuWebApp() {
  SpreadsheetApp.getUi()
    .createMenu("🌐 Web App & Roles")
    .addItem("👥 Setup Usuarios y Roles (Fase 3)", "setupFase3")
    .addItem("🔗 Ver URL de la Web App", "mostrarUrlWebApp")
    .addSeparator()
    .addItem("📦 Selector de inventarios para ZIP", "lanzarSelectorZip")
    .addSeparator()
    .addItem("📧 Probar reporte semanal (a mí)", "probarReporteSemanal")
    .addItem("⏰ Instalar trigger semanal (lunes 6 AM)", "instalarTriggerReporteSemanal")
    .addToUi();

  // Menú adicional del Terminal WMS (consolidado en este proyecto)
  SpreadsheetApp.getUi()
    .createMenu("📦 Terminal WMS")
    .addItem("Abrir Terminal WMS (modal)", "abrirInventarioCiego")
    .addItem("Mostrar QR de acceso", "mostrarQR")
    .addSeparator()
    .addItem("Actualizar Análisis", "actualizarAnalisis")
    .addItem("Actualizar ABC (ABC2025.txt)", "consolidarDatosWMS")
    .addItem("Actualizar Registro", "actualizarRegistro")
    .addSeparator()
    .addItem("Gatillo Automático (06:00 AM)", "crearTriggerAutomatico")
    .addToUi();
}

function mostrarUrlWebApp() {
  var url;
  try { url = ScriptApp.getService().getUrl(); } catch (e) { url = null; }
  if (url) {
    _alert("URL de la Web App:\n\n" + url +
           "\n\nCompártela solo con tu equipo registrado en USUARIOS.");
  } else {
    _alert("Aún no has desplegado la Web App.\n\n" +
           "Implementar → Nueva implementación → Aplicación web\n" +
           "· Ejecutar como: Yo (el dueño)\n" +
           "· Acceso: Cualquier usuario con cuenta de Google");
  }
}

function abrirCentroDeMandoIntegral() {
  var html = HtmlService.createHtmlOutputFromFile("CentroDeMandoIntegral")
    .setWidth(1180).setHeight(750);
  SpreadsheetApp.getUi().showModalDialog(html, "🎯 Centro de Mando Integral");
}

// Compatibilidad: los menús viejos llaman a estos nombres
function mostrarCentroDeMando() { abrirCentroDeMandoIntegral(); }
function mostrarCentroDeMandoV2() { abrirCentroDeMandoIntegral(); }

function lanzarAsistenteCreacion() {
  var html = HtmlService.createHtmlOutputFromFile("AsistenteCreacionV2")
    .setWidth(1100).setHeight(780);
  SpreadsheetApp.getUi().showModalDialog(html, "📦 Crear Inventario");
}

function lanzarFormularioEvento() {
  var html = HtmlService.createHtmlOutputFromFile("FormularioEvento")
    .setWidth(520).setHeight(620);
  SpreadsheetApp.getUi().showModalDialog(html, "📅 Nuevo Evento en Cronograma");
}

function instalarTriggersRecordatorios() {
  var triggers = ScriptApp.getProjectTriggers();
  var borrados = 0;
  triggers.forEach(function(t){
    var f = t.getHandlerFunction();
    if (f === "enviarRecordatoriosCronograma" ||
        f === "sincronizarEstadoCronogramaConPanel") {
      ScriptApp.deleteTrigger(t); borrados++;
    }
  });
  ScriptApp.newTrigger("enviarRecordatoriosCronograma")
    .timeBased().everyDays(1).atHour(6).create();
  ScriptApp.newTrigger("sincronizarEstadoCronogramaConPanel")
    .timeBased().everyDays(1).atHour(19).create();
  _alert("Triggers instalados:\n• 06:00 → Recordatorios\n• 19:00 → Sincronización" +
    "\n\n(Se eliminaron " + borrados + " triggers antiguos.)");
}


/* ==========================================================================
   12. Wrappers para acciones del dashboard (llaman a funciones existentes)
   ==========================================================================
   Estos wrappers son necesarios porque el dashboard llama desde HTML por
   nombre. Llaman a las funciones del Código.gs viejo sin modificarlas.
   ========================================================================== */

function dash_consolidarTodo()     { consolidarDatosFinal(false, "ALL"); return "ok"; }
function dash_consolidarInv()      { consolidarDatosFinal(false, "INV"); return "ok"; }
function dash_consolidarReg()      { consolidarDatosFinal(false, "REG"); return "ok"; }
function dash_preValidar()         { reportarErroresPrevio(); return "ok"; }
function dash_limpiarDuplicados()  { limpiarHojaConsolidada(); return "ok"; }
function dash_actualizarMetricas() { llenarDatosDesdeAnalisis(); return "ok"; }
/* FIX FASE 8.4: dash_descargarZip ANTES llamaba a lanzarSelectorZip que usa
   SpreadsheetApp.getUi() — incompatible con Web App. Ahora devuelve datos
   para que el frontend abra su propio selector. */
function dash_descargarZip()       {
  _requiereRol(["Coordinador", "Líder de Conteo", "Auditor"]);
  return dash_listarInventariosParaZip();
}

/* Lista los inventarios disponibles para descargar como ZIP, sin abrir UI del Sheet */
function dash_listarInventariosParaZip() {
  _requiereRol(["Coordinador", "Líder de Conteo", "Auditor"]);
  var ss = _getSS();
  var p = ss.getSheetByName("PANEL DE CONTROL");
  if (!p || p.getLastRow() < 2) return [];
  var data = p.getRange(2, 1, p.getLastRow() - 1, 7).getValues();
  var lista = [];
  for (var i = 0; i < data.length; i++) {
    var cliente = String(data[i][0] || "").trim();
    var fileUrl = String(data[i][1] || "").trim();
    var fileId  = String(data[i][2] || "").trim();
    var fecha   = data[i][3];
    var estado  = String(data[i][6] || "").trim();
    if (!cliente || !fileId) continue;
    lista.push({
      fila: i + 2,
      cliente: cliente,
      fileUrl: fileUrl,
      fileId: fileId,
      fecha: fecha instanceof Date ? fecha.getTime() : (fecha ? String(fecha) : null),
      estado: estado
    });
  }
  return lista;
}

/* Genera el ZIP a partir de IDs específicos seleccionados por el usuario */
function dash_generarZipDesdeIDs(arrayDeFileIds) {
  _requiereRol(["Coordinador", "Líder de Conteo", "Auditor"]);
  if (!arrayDeFileIds || arrayDeFileIds.length === 0) {
    throw new Error("Selecciona al menos un inventario.");
  }
  var blobs = [];
  var erroresLog = [];
  var nombresUsados = {};
  var token = ScriptApp.getOAuthToken();

  for (var i = 0; i < arrayDeFileIds.length; i++) {
    var fileId = String(arrayDeFileIds[i] || "").trim();
    if (fileId.length < 10) continue;
    try {
      var url = "https://docs.google.com/spreadsheets/export?id=" + fileId + "&exportFormat=xlsx";
      var response = UrlFetchApp.fetch(url, {
        headers: { 'Authorization': 'Bearer ' + token },
        muteHttpExceptions: true
      });
      if (response.getResponseCode() === 200) {
        var blob = response.getBlob();
        var nombre = "inv_" + fileId.substring(0, 8);
        try {
          var file = DriveApp.getFileById(fileId);
          nombre = file.getName().replace(/[\\\/:*?"<>|]/g, "_");
        } catch (eN) {}
        if (nombresUsados[nombre]) { nombresUsados[nombre]++; nombre += "_" + nombresUsados[nombre]; }
        else nombresUsados[nombre] = 1;
        blob.setName(nombre + ".xlsx");
        blobs.push(blob);
      } else {
        erroresLog.push({ fileId: fileId, motivo: "HTTP " + response.getResponseCode() });
      }
    } catch (e) {
      erroresLog.push({ fileId: fileId, motivo: e.message });
    }
  }

  if (blobs.length === 0) throw new Error("No se pudo descargar ningún archivo. Detalles: " + JSON.stringify(erroresLog));

  var zipBlob = Utilities.zip(blobs, "Export_Inventarios_" +
    Utilities.formatDate(new Date(), "GMT-5", "yyyyMMdd_HHmm") + ".zip");
  var base64Zip = Utilities.base64Encode(zipBlob.getBytes());

  _registrarActividad(_usuarioActual(), "descargar_zip", "",
    "Archivos: " + blobs.length + " · Errores: " + erroresLog.length);

  return {
    ok: true,
    base64: base64Zip,
    fileName: zipBlob.getName(),
    procesados: blobs.length,
    errores: erroresLog
  };
}

/* FIX FASE 7.4: La función original exportarReporteDeUnClienteArchivo() usa
   SpreadsheetApp.getUi().showModalDialog() que NO funciona desde Web App.
   Estas dos funciones reemplazan ese flujo para el frontend SPA:
   1) dash_listarClientesParaExportar() devuelve la lista única de clientes
   2) dash_exportarCliente(cliente) ejecuta la actualización del archivo
      EXISTENTE del cliente (NO crea uno nuevo si ya existe — esa lógica
      histórica está en exportarReporteAHojaExistente del bloque legacy). */
function dash_listarClientesParaExportar() {
  _requiereRol(["Coordinador", "Líder de Conteo"]);
  var ss = _getSS();
  var p = ss.getSheetByName("PANEL DE CONTROL");
  if (!p) return [];
  var d = p.getRange("A2:A" + p.getLastRow()).getValues();
  var clientes = {};
  d.forEach(function(r){ var c = String(r[0] || "").trim(); if (c) clientes[c] = true; });
  return Object.keys(clientes).sort();
}

function dash_exportarCliente(cliente) {
  _requiereRol(["Coordinador", "Líder de Conteo"]);
  if (!cliente) {
    // Si no se pasa cliente, mantener comportamiento legacy (formulario modal del Sheet)
    return exportarReporteDeUnClienteArchivo();
  }
  // Web App: invocar directamente la función histórica que actualiza el archivo
  // existente del cliente en HISTORIAL_REPORTES (NO crea uno nuevo si ya existe)
  var resultado = exportarReporteAHojaExistente(cliente);
  _registrarActividad(_usuarioActual(), "exportar_reporte_cliente", "",
    "Cliente: " + cliente + " · Resultado: " + resultado);
  return resultado;
}


/* ==========================================================================
   ↪  GANCHOS al Código.gs antiguo  (ver README_FASE1.md)
   ==========================================================================
   1) En tu onOpen() reemplaza los dos menús viejos por:
        anadirMenuOptimizaciones();
   
   2) Reemplaza el cuerpo de onEdit por:
        function onEdit(e) { onEditOptimizado(e); }
   
   3) (Opcional pero recomendado) en generarArchivoDesdeTabla() apunta al wizard nuevo:
        function generarArchivoDesdeTabla() { lanzarAsistenteCreacion(); }
   ========================================================================== */


/* ==========================================================================
   ====   FASE 2 — EXTENSIÓN INCREMENTAL                                 ====
   ====   Iniciar/Fin · Validación CSV avanzada · Auditoría consolidación ====
   ========================================================================== */


/* ==========================================================================
   13. INICIAR / FINALIZAR EVENTO DEL CRONOGRAMA
   --------------------------------------------------------------------------
   iniciarEventoCronograma(filaCronograma, nombreOperario)
     - Si CR_COL_RESP vacío → escribe operario
     - CR_COL_FECHA = hoy (si vacío)
     - CR_COL_ESTADO = "En Proceso"
   finalizarEventoCronograma(filaCronograma)
     - CR_COL_ESTADO = "Entregado"
     - CR_COL_FECHA_ENT = hoy (si vacío)
     - CR_COL_PCT = 1 (100%)
   ========================================================================== */

function iniciarEventoCronograma(filaCronograma, nombreOperario) {
  _requiereRol(["Coordinador", "Líder de Conteo"]);
  if (!filaCronograma) throw new Error("Falta fila del cronograma.");
  if (!nombreOperario) throw new Error("Debes indicar el operario responsable.");
  var ss = _getSS();
  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  if (!cron) throw new Error("No se encontró " + CRON_CFG.HOJA_CRONOGRAMA);

  var f = filaCronograma;
  var estadoActual = String(cron.getRange(f, CRON_CFG.CR_COL_ESTADO).getValue() || "").toLowerCase();
  if (estadoActual.indexOf("entregado") !== -1) {
    throw new Error("Este evento ya está Entregado, no se puede iniciar.");
  }

  // Responsable: si está vacío lo escribimos. Si tiene algo, no sobrescribimos.
  var respActual = String(cron.getRange(f, CRON_CFG.CR_COL_RESP).getValue() || "").trim();
  if (!respActual) {
    cron.getRange(f, CRON_CFG.CR_COL_RESP).setValue(String(nombreOperario).trim().toUpperCase());
  }

  // Fecha de inicio: hoy si está vacía
  if (!cron.getRange(f, CRON_CFG.CR_COL_FECHA).getValue()) {
    cron.getRange(f, CRON_CFG.CR_COL_FECHA).setValue(new Date());
  }

  cron.getRange(f, CRON_CFG.CR_COL_ESTADO).setValue("En Proceso");
  _registrarActividad(_usuarioActual(), "iniciar", f,
    "Operario: " + nombreOperario + " · Cliente: " + cron.getRange(f, CRON_CFG.CR_COL_CLIENTE).getValue());
  return { ok: true, fila: f };
}

/* ==========================================================================
   FIX FASE 8.8: iniciarEventoConOpciones — versión enriquecida del iniciar.
   Permite al Coordinador/Líder controlar:
     - responsable (operario / líder / coordinador del equipo activo)
     - fechaInicio (default hoy, editable)
     - asignarArchivo opcional ({ fileId, fileUrl, fileName })
     - sobrescribirResponsable (true: forzar reescribir aunque ya tenga)
   Sincroniza con CRONOGRAMA-2026: si ya está "En Proceso" o "Entregado",
   solo actualiza campos vacíos en lugar de pisar.
   ========================================================================== */
function iniciarEventoConOpciones(filaCronograma, opciones) {
  _requiereRol(["Coordinador", "Líder de Conteo"]);
  if (!filaCronograma) throw new Error("Falta fila del cronograma.");
  opciones = opciones || {};
  // FASE 8.62 (R5): si no se indica responsable, se usa el USUARIO QUE INICIA
  // (autor) como responsable — antes lanzaba error y no registraba nada.
  var respIn = String(opciones.responsable || "").trim();
  if (!respIn) respIn = _nombreUsuarioActual();
  if (!respIn) throw new Error("No se pudo determinar el responsable (usuario no registrado).");

  var ss = _getSS();
  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  if (!cron) throw new Error("No se encontró " + CRON_CFG.HOJA_CRONOGRAMA);

  var f = filaCronograma;
  var estadoActual = String(cron.getRange(f, CRON_CFG.CR_COL_ESTADO).getValue() || "").toLowerCase();
  if (estadoActual.indexOf("entregado") !== -1) {
    throw new Error("Este evento ya está Entregado, no se puede reiniciar.");
  }
  var yaEnProceso = estadoActual.indexOf("proceso") !== -1;

  // Responsable (col I): se registra si está vacío o si se pide sobrescribir.
  // FASE 8.62 (R5): garantiza que SIEMPRE quede autor cuando se inicia.
  var respActual = String(cron.getRange(f, CRON_CFG.CR_COL_RESP).getValue() || "").trim();
  if (!respActual || opciones.sobrescribirResponsable) {
    cron.getRange(f, CRON_CFG.CR_COL_RESP).setValue(respIn.toUpperCase());
    respActual = respIn.toUpperCase();
  }
  opciones.responsable = respIn; // para el log y el retorno

  // Fecha de inicio
  // Fecha de inicio
  var fechaActual = cron.getRange(f, CRON_CFG.CR_COL_FECHA).getValue();
  if (!fechaActual || opciones.fechaInicio) {
    var fechaUsar = new Date(); // Por defecto hoy
    if (opciones.fechaInicio) {
      // FIX: Evitar desfase de 1 día al parsear string enviado desde el frontend
      var parts = String(opciones.fechaInicio).split("-");
      if (parts.length === 3) {
        fechaUsar = new Date(parseInt(parts[0],10), parseInt(parts[1],10)-1, parseInt(parts[2],10));
      } else {
        fechaUsar = new Date(opciones.fechaInicio);
      }
    }
    if (!isNaN(fechaUsar.getTime())) cron.getRange(f, CRON_CFG.CR_COL_FECHA).setValue(_soloFecha(fechaUsar));
  }

  // Asignar archivo (opcional)
  var archivoAsignado = false;
  if (opciones.fileId && opciones.fileUrl) {
    // Verifica primero si ya tiene archivo
    var rich = cron.getRange(f, CRON_CFG.CR_COL_ARCH).getRichTextValue();
    var valArch = cron.getRange(f, CRON_CFG.CR_COL_ARCH).getValue();
    var archActual = _extraerUrlSmartChip(rich, valArch);
    if (!archActual || opciones.reemplazarArchivo) {
      asignarArchivoAEvento(f, opciones.fileId, opciones.fileUrl, opciones.fileName || "archivo");
      archivoAsignado = true;
    }
  }

  // Estado: a "En Proceso" si no lo estaba
  if (!yaEnProceso) cron.getRange(f, CRON_CFG.CR_COL_ESTADO).setValue("En Proceso");

  var cliente = cron.getRange(f, CRON_CFG.CR_COL_CLIENTE).getValue();
  _registrarActividad(_usuarioActual(),
    yaEnProceso ? "actualizar_inicio" : "iniciar",
    f,
    "Responsable: " + opciones.responsable +
    " · Cliente: " + cliente +
    (archivoAsignado ? " · Archivo asignado" : "") +
    (yaEnProceso ? " · YA estaba en Proceso, solo se actualizaron campos vacíos" : ""));

  return {
    ok: true,
    fila: f,
    yaEnProceso: yaEnProceso,
    archivoAsignado: archivoAsignado,
    responsable: opciones.responsable
  };
}


function finalizarEventoCronograma(filaCronograma) {
  if (!filaCronograma) throw new Error("Falta fila del cronograma.");
  var ss = _getSS();
  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  if (!cron) throw new Error("No se encontró " + CRON_CFG.HOJA_CRONOGRAMA);

  var f = filaCronograma;
  cron.getRange(f, CRON_CFG.CR_COL_ESTADO).setValue("Entregado");
  if (!cron.getRange(f, CRON_CFG.CR_COL_FECHA_ENT).getValue()) {
    cron.getRange(f, CRON_CFG.CR_COL_FECHA_ENT).setValue(new Date());
  }
  cron.getRange(f, CRON_CFG.CR_COL_PCT).setValue(1);
  return { ok: true, fila: f };
}


/* ==========================================================================
   14. SERIES ÚNICAS GLOBALES — caché del año en MATRIZ_INVENTARIOS_UIO
   --------------------------------------------------------------------------
   Convención del CSV: en el array enviado desde el wizard,
   índice 6 = SKU, índice 8 = NRO_SERIE (cuando aplica), índice 9 = LOTE.
   ========================================================================== */

function obtenerSeriesUnicasDelAnio() {
  var cache = CacheService.getScriptCache();
  var key = "series_anio_" + new Date().getFullYear();
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  var series = {};
  try {
    // Fuente principal: MATRIZ_INVENTARIOS_UIO
    var ssMat = SpreadsheetApp.openById(CONFIG.INVENTARIO_GLOBAL_ID);
    var sh = ssMat.getSheetByName("Inventarios");
    if (sh && sh.getLastRow() > 1) {
      var lastCol = sh.getLastColumn();
      var hdrs = sh.getRange(1, 1, 1, lastCol).getValues()[0]
                   .map(function(h){ return String(h).toUpperCase(); });
      var idxSerie = -1;
      for (var i = 0; i < hdrs.length; i++) {
        if (hdrs[i].indexOf("SERIE") !== -1 && hdrs[i].indexOf("DESC") === -1) {
          idxSerie = i; break;
        }
      }
      if (idxSerie !== -1) {
        var data = sh.getRange(2, idxSerie + 1, sh.getLastRow() - 1, 1).getValues();
        data.forEach(function(r){
          var s = String(r[0] || "").trim();
          if (s && s !== "0" && s !== "N/A") {
            series[s.toUpperCase()] = true;
          }
        });
      }
    }
  } catch (e) {
    Logger.log("obtenerSeriesUnicasDelAnio falló: " + e.message);
  }

  // Cachear por 30 min
  try { cache.put(key, JSON.stringify(series), 1800); } catch(e){}
  return series;
}


function invalidarCacheSeries() {
  var cache = CacheService.getScriptCache();
  cache.remove("series_anio_" + new Date().getFullYear());
  return "Cache de series invalidada.";
}


/* ==========================================================================
   15. VALIDACIÓN CSV AVANZADA
   --------------------------------------------------------------------------
   Llamada desde el wizard. Recibe csvData (array 17 col) + cliente seleccionado.
   Devuelve { datosLimpios, reporte } con métricas y advertencias.
   ========================================================================== */

function validarCSVAvanzado(csvData, clienteSeleccionado) {
  if (!Array.isArray(csvData)) throw new Error("csvData inválido.");

  var TOPE_FILAS = 50000;
  if (csvData.length > TOPE_FILAS) {
    throw new Error("El CSV excede el tope de " + TOPE_FILAS +
      " filas (" + csvData.length + " filas detectadas). " +
      "Por favor parte el archivo en lotes y vuelve a subirlo.");
  }

  var cliN = String(clienteSeleccionado || "").trim().toUpperCase();
  var seriesHist = obtenerSeriesUnicasDelAnio();   // {} si no hay
  var seriesEnCSV = {};                            // duplicados dentro del propio CSV

  // FIX FASE 7.7: Validaciones reforzadas para asegurar datos limpios al inventario físico
  var REGEX_SKU_CHARS_VALIDOS = /^[A-Z0-9_\-./]+$/i;   // chars permitidos para SKU
  var SKU_MIN_LEN = 3;                                  // longitud mínima razonable de SKU

  var datosLimpios = [];
  var rep = {
    totalLeidas: csvData.length,
    incluidas: 0,
    excluidas: 0,
    filtradasPorCliente: 0,
    cantidadInvalidas: 0,
    cantidadCero: 0,                       // warning, no exclusión
    skuVacio: 0,
    skuConCharsExtranios: [],              // SKUs con chars sospechosos (excluidos)
    skuSospechosamenteCortos: [],          // SKUs < 3 chars (warning)
    seriesDuplicadasHistorico: [],
    seriesDuplicadasEnCSV: [],
    filasIdenticasDuplicadas: 0,           // duplicados exactos (mismo SKU+lote+serie+pos)
    sumaCantidad: 0,
    skusUnicos: {},
    clientesEncontrados: {}
  };

  // Cache de claves para detectar duplicados exactos
  var clavesVistas = {};

  for (var i = 0; i < csvData.length; i++) {
    var r = csvData[i];
    var skuRaw = String(r[6]  || "").trim();
    var sku   = skuRaw.toUpperCase();
    var serie = String(r[8]  || "").trim().toUpperCase();
    var cli   = String(r[4]  || "").trim().toUpperCase();
    var cant  = r[16];
    // FIX FASE 8.54: índices corregidos al formato rM (17 col) que envían
    // AMBOS flujos del wizard (parsearCSV y extraerDesdeAPI):
    // [7]=Descripción · [9]=Lote · [10]=Despacho · [11]=Partida · [14]=Posición.
    // Antes se leían índices del CSV crudo → el contador de duplicados exactos
    // (solo advertencia, no excluye) podía contar mal.
    var lote  = String(r[9] || "").trim();
    var despacho = String(r[10] || "").trim();
    var partida = String(r[11] || "").trim();
    var posicion = String(r[14] || "").trim();

    // Cliente: registramos para reporte
    if (cli) rep.clientesEncontrados[cli] = (rep.clientesEncontrados[cli] || 0) + 1;

    // 1. SKU vacío → excluye
    if (!sku) {
      rep.skuVacio++; rep.excluidas++;
      continue;
    }

    // 1b. FIX FASE 7.7: SKU con chars de control (Tab, etc.) o muy extraños → EXCLUYE
    // Esto evita que datos basura entren al inventario físico.
    var skuLimpio = sku.replace(/[\u0000-\u001F\u007F-\u009F\uFEFF\u200B]/g, "");
    if (skuLimpio !== sku) {
      if (rep.skuConCharsExtranios.length < 30) {
        rep.skuConCharsExtranios.push({ sku: skuRaw, fila: i + 2 });
      }
      rep.excluidas++;
      continue;
    }

    // 1c. FIX FASE 7.7: SKU sospechosamente corto (< 3 chars) → WARNING (no excluye)
    if (sku.length < SKU_MIN_LEN) {
      if (rep.skuSospechosamenteCortos.length < 20) {
        rep.skuSospechosamenteCortos.push({ sku: sku, fila: i + 2 });
      }
      // No excluimos: dejamos que el usuario decida en la vista previa
    }

    // 2. Cliente: filtrar al seleccionado (si CSV trae clientes mezclados)
    // FIX FASE 8.7: Match flexible — HYCITE2/HYCITE3 cuentan como HYCITE.
    // Si el cliente del CSV empieza igual al seleccionado y solo difiere en sufijo numérico,
    // se acepta. Mismo trato para casos al revés (CSV=HYCITE, seleccionado=HYCITE2).
    if (cli && cliN && cli !== cliN) {
      var coincide = false;
      // Caso A: CSV es variante con sufijo numérico del seleccionado
      // Ej: seleccionado=HYCITE, csv=HYCITE2 → coincide
      var reSufijoNum = new RegExp("^" + cliN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "[0-9]+$");
      if (reSufijoNum.test(cli)) coincide = true;
      // Caso B: seleccionado es variante del CSV (al revés)
      var reSufijoNum2 = new RegExp("^" + cli.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "[0-9]+$");
      if (reSufijoNum2.test(cliN)) coincide = true;
      // Caso C: ambos comparten raíz alfabética y solo difieren en sufijo numérico
      // Ej: HYCITE2 y HYCITE3 → ambos pertenecen a HYCITE
      var raizCli = cli.replace(/[0-9]+$/, "");
      var raizSel = cliN.replace(/[0-9]+$/, "");
      if (raizCli && raizCli === raizSel) coincide = true;

      if (!coincide) {
        rep.filtradasPorCliente++; rep.excluidas++;
        continue;
      }
    }

    // 3. Cantidad: numérica y >= 0
    var cantNum = parseFloat(cant);
    if (isNaN(cantNum)) {
      cantNum = 0;
    }
    if (cantNum < 0) {
      rep.cantidadInvalidas++; rep.excluidas++;
      continue;
    }
    if (cantNum === 0) {
      rep.cantidadCero++;
      // No excluimos cantidades 0 — pueden ser legítimas
    }

    // 4. Series duplicadas
    if (serie && serie !== "0" && serie !== "N/A") {
      if (seriesEnCSV[serie]) {
        if (rep.seriesDuplicadasEnCSV.length < 50) {
          rep.seriesDuplicadasEnCSV.push({ sku: sku, serie: serie, fila: i + 2 });
        }
      } else {
        seriesEnCSV[serie] = true;
      }
      if (seriesHist[serie]) {
        if (rep.seriesDuplicadasHistorico.length < 50) {
          rep.seriesDuplicadasHistorico.push({ sku: sku, serie: serie });
        }
      }
    }

    // 5. FIX FASE 7.7: Detectar filas exactamente duplicadas (mismo SKU+lote+serie+pos+despacho+partida)
    // Estas son las que la consolidación frontend ya está agrupando. Sirve como cross-check.
    var claveUnica = sku + '|' + lote + '|' + serie + '|' + despacho + '|' + partida + '|' + posicion;
    if (clavesVistas[claveUnica]) {
      rep.filasIdenticasDuplicadas++;
    } else {
      clavesVistas[claveUnica] = true;
    }

    // OK → incluir
    rep.incluidas++;
    rep.sumaCantidad += cantNum;
    rep.skusUnicos[sku] = true;
    r[16] = cantNum;
    datosLimpios.push(r);
  }

  rep.skusUnicosCount = Object.keys(rep.skusUnicos).length;
  delete rep.skusUnicos;

  rep.clientesDetalle = Object.keys(rep.clientesEncontrados)
    .map(function(k){ return { cliente: k, filas: rep.clientesEncontrados[k] }; })
    .sort(function(a,b){ return b.filas - a.filas; });
  delete rep.clientesEncontrados;

  if (datosLimpios.length === 0) {
    var todasFiltradasPorCliente = (
      rep.filtradasPorCliente === rep.totalLeidas &&
      rep.cantidadInvalidas === 0 && rep.skuVacio === 0
    );
    if (todasFiltradasPorCliente && cliN) {
      var clientesDelCsv = rep.clientesDetalle.map(function(c){ return c.cliente + " (" + c.filas + ")"; }).join(", ");
      throw new Error("CLIENTE_NO_MATCHEA||" +
        "Ninguna fila del CSV pertenece al cliente '" + clienteSeleccionado + "'.\n" +
        "Clientes encontrados en el CSV: " + (clientesDelCsv || "ninguno") + ".\n\n" +
        "¿Deseas procesar TODAS las filas sin filtrar por cliente?");
    }
    throw new Error("Tras la validación no quedó ninguna fila válida.\n\n" +
      "Detalle: " + rep.totalLeidas + " leídas · " +
      rep.filtradasPorCliente + " filtradas por cliente · " +
      rep.cantidadInvalidas + " cantidad inválida · " +
      rep.skuVacio + " sin SKU · " +
      rep.skuConCharsExtranios.length + " con chars inválidos.");
  }

  return { datosLimpios: datosLimpios, reporte: rep };
}


/* ---------- Variante: validar SIN filtrar por cliente (para reintento) ---------- */
function validarCSVSinFiltroCliente(csvData) {
  return validarCSVAvanzado(csvData, ""); // cliente vacío → no filtra
}


/* ==========================================================================
   16. AUDITORÍA DE CONSOLIDACIÓN
   --------------------------------------------------------------------------
   Reemplaza el flujo viejo de consolidación con uno auditable.
   Por cada archivo procesado escribe en hoja AUDITORIA_CONSOLIDACION una
   fila con: fecha, cliente, ID, filas leídas, incluidas, excluidas, motivo
   principal, suma cantidad, count SKUs únicos, count posiciones, status.
   ========================================================================== */

/* ==========================================================================
   FIX FASE 8.16: CONSOLIDACIÓN ROBUSTA CON DEPURACIÓN AVANZADA
   --------------------------------------------------------------------------
   Mejoras respecto a versión histórica (sin tocar funcionalidad existente):

   1. DEDUPLICACIÓN INTRA-ARCHIVO: detecta y excluye filas idénticas que
      aparecen repetidas en el mismo archivo hijo (típico cuando el operario
      paga el dedo en el escáner y registra la misma serie 2 veces).

   2. VALIDACIÓN GRANULAR con ubicación exacta del problema:
      - cliente / id archivo / fila origen / columna afectada / valor
      - hoja "ERRORES_VALIDACION_DETALLE" con un row por incidencia
      - link clickeable al archivo origen para ir directo a corregir

   3. CATÁLOGO DE MOTIVOS específico (no más "Mixto"):
      - FILA_VACIA          → toda la fila sin contenido
      - DUPLICADO_INTRA     → misma fila ya estaba en este mismo archivo
      - SKU_VACIO           → campo SKU sin valor
      - CANTIDAD_INVALIDA   → cantidad alfanumérica o NaN
      - CANTIDAD_CERO       → cantidad es 0 (conteo no realizado)
      - ERROR_ABRIR_ARCHIVO → archivo no accesible

   4. MODOS DE EJECUCIÓN:
      - 'tolerante' (default): consolida ignorando filas problemáticas
      - 'estricto': si hay errores críticos (SKU vacío / cantidad inválida)
                    DETIENE el proceso y devuelve reporte sin escribir nada
      - 'reporte_solo': SOLO genera reporte de errores, no escribe INVENTARIOS
                        (útil para pre-validar antes de consolidar)

   Compatible con: v8.13 (sin espejo a archivos externos), v8.15 (3 capas TZ),
   sistema de permisos por rol, AUDITORIA_CONSOLIDACION, reportes por cliente.
   ========================================================================== */

/* Genera hash determinístico de una fila para detectar duplicados intra-archivo.
   Usa TODOS los valores significativos de la fila (excluye nulls/vacíos al final).
   Si dos filas del mismo archivo generan el mismo hash, son duplicado exacto. */
function _hashFilaConsolidacion(fila) {
  if (!fila || !fila.length) return "";
  // Trim de la fila: ignorar trailing empties
  var last = fila.length - 1;
  while (last >= 0 && !valueNotEmpty(fila[last])) last--;
  if (last < 0) return "";
  var partes = [];
  for (var k = 0; k <= last; k++) {
    var v = fila[k];
    if (v === null || v === undefined) { partes.push(""); continue; }
    // Date object → ISO normalizado
    if (_esDate(v)) {
      partes.push(v.getTime().toString());
    } else {
      partes.push(String(v).trim().toUpperCase());
    }
  }
  return partes.join("§");
}

/* Detecta índices clave en los headers de PLANILLA DE CONTEO FISICO.
   Si no encuentra, devuelve null y usa convenciones por defecto.
   Robusto a variaciones de mayúsculas, espacios, tildes. */
function _detectarColumnasClave(headers) {
  if (!headers || !headers.length) return { sku: 0, posicion: 2, lote: 3, cant: null };
  var idx = { sku: -1, posicion: -1, lote: -1, cant: -1 };
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || "").toUpperCase()
      .replace(/[ÁÀÄ]/g, "A").replace(/[ÉÈË]/g, "E").replace(/[ÍÌÏ]/g, "I")
      .replace(/[ÓÒÖ]/g, "O").replace(/[ÚÙÜ]/g, "U").trim();
    if (idx.sku < 0 && /^(SKU|COD\.?\s*PRODUCTO|CODIGO\s*PRODUCTO|PRODUCTO|REFERENCIA)$/.test(h)) idx.sku = i;
    if (idx.posicion < 0 && /(POSICION|UBICACION)/.test(h)) idx.posicion = i;
    if (idx.lote < 0 && /(LOTE)/.test(h)) idx.lote = i;
    if (idx.cant < 0 && /(CONTEO\s*FINAL|CANTIDAD|TOTAL|SALDO)/.test(h)) idx.cant = i;
  }
  // Defaults históricos si no se detectaron
  if (idx.sku < 0) idx.sku = 0;
  if (idx.posicion < 0) idx.posicion = 2;
  if (idx.lote < 0) idx.lote = 3;
  return idx;
}

function consolidarConAuditoria(opciones) {
  _requiereRol(["Coordinador"]);
  // FIX FASE 8.33: el gate de rol vive en el punto de entrada público.
  // El trabajo real se delega al núcleo, que también invoca el trigger de
  // continuación (_continuarConsolidacion) — ese contexto NO tiene usuario
  // y por eso no puede pasar por _requiereRol.
  return _consolidarNucleo(opciones || {});
}

/* ==========================================================================
   FIX FASE 8.33 — NÚCLEO DE CONSOLIDACIÓN POR LOTES (checkpoint + trigger)
   --------------------------------------------------------------------------
   Problema corregido: con 250+ archivos "Entregado", una sola ejecución se
   quedaba sin tiempo, limpiaba INVENTARIOS y escribía solo lo parcial; al
   re-ejecutar arrancaba desde el archivo 1 → nunca llegaba a los últimos.

   Solución:
   • Snapshot inmutable de la lista de archivos en la hoja oculta
     __CACHE_CONSOLIDACION (orden del PANEL), inmune a ediciones a mitad.
   • Checkpoint por archivo en ScriptProperties (CONSOL_NEXT_IDX).
   • Modo "tolerante"/"reporte_solo": APPEND por lote (no clear-and-rewrite);
     si se agota el presupuesto de tiempo, se programa un trigger one-time
     (_continuarConsolidacion, .after(90s)) que reanuda desde el checkpoint.
   • Modo "estricto": pasada única (no apila); si no alcanza, NO escribe nada
     y pide usar tolerante o el editor (más seguro que el parcial anterior).
   • Cada archivo se procesa una sola vez por corrida → totales idénticos a
     una pasada única; cero duplicados nuevos; cero impacto Power BI.
   La lógica de validación por archivo se mantiene byte a byte.
   ========================================================================== */
/* ==========================================================================
   FIX FASE 8.37: LOG_CONSOLIDACION — un solo resumen legible de la consolidación
   --------------------------------------------------------------------------
   Reúne en UNA hoja lo necesario para revisar de un vistazo:
     1) Archivos con incidencias (filas excluidas / no consolidadas) y su motivo.
     2) Validaciones por fila (duplicados y demás) con severidad.
   Lee las hojas de auditoría que YA genera la consolidación (no cambia su lógica).
   Se regenera al terminar cada consolidación; también se puede ejecutar a mano. */
function generarLogConsolidacion() {
  var ss = _getSS();
  var aud = ss.getSheetByName("AUDITORIA_CONSOLIDACION");
  var det = ss.getSheetByName("ERRORES_VALIDACION_DETALLE");

  // 1) Archivos con incidencias (excluidas > 0 o status no-OK)
  var incid = [];
  if (aud && aud.getLastRow() > 1) {
    aud.getRange(2, 1, aud.getLastRow() - 1, 11).getValues().forEach(function(r){
      if (String(r[0]) === "TOTAL") return;
      var excl = Number(r[5]) || 0;
      var status = String(r[10] || "");
      var statusMalo = status && status.toUpperCase().indexOf("OK") === -1 && status.indexOf("📊") === -1;
      if (excl > 0 || statusMalo) incid.push([r[1], r[2], r[3], r[4], r[5], r[6], r[10]]);
    });
  }
  // 2) Validaciones por fila (duplicados y demás)
  var vals = [], nDup = 0;
  if (det && det.getLastRow() > 1) {
    det.getRange(2, 1, det.getLastRow() - 1, 9).getValues().forEach(function(r){
      vals.push([r[0], r[1], r[3], r[4], r[5], r[6], r[7], r[8]]);
      if (String(r[6] || "").toLowerCase().indexOf("duplic") !== -1) nDup++;
    });
  }

  var log = ss.getSheetByName("LOG_CONSOLIDACION") || ss.insertSheet("LOG_CONSOLIDACION");
  log.clear();
  var out = [], titulos = [], secciones = [], cabeceras = [];
  function add(arr, tipo) {
    while (arr.length < 8) arr.push("");
    out.push(arr);
    if (tipo === "titulo") titulos.push(out.length);
    else if (tipo === "seccion") secciones.push(out.length);
    else if (tipo === "col") cabeceras.push(out.length);
  }
  var fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
  add(["LOG DE CONSOLIDACIÓN — " + fecha], "titulo");
  add(["Resumen: " + incid.length + " archivo(s) con incidencias · " + vals.length +
       " validación(es) · " + nDup + " duplicado(s)"]);
  add([""]);
  add(["1) ARCHIVOS CON INCIDENCIAS (filas excluidas / no consolidadas)"], "seccion");
  add(["Cliente", "ID Archivo", "Filas leídas", "Filas incluidas", "Filas excluidas", "Motivo principal", "Status"], "col");
  if (incid.length) incid.forEach(function(r){ add(r); });
  else add(["(Sin archivos con incidencias — todos consolidados)"]);
  add([""]);
  add(["2) VALIDACIONES POR FILA (duplicados y demás)"], "seccion");
  add(["Cliente", "ID Archivo", "Fila", "Columna", "Valor", "Motivo", "Acción", "Severidad"], "col");
  if (vals.length) vals.forEach(function(r){ add(r); });
  else add(["(Sin incidencias de validación)"]);

  log.getRange(1, 1, out.length, 8).setValues(out);
  titulos.forEach(function(n){ log.getRange(n,1,1,8).setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff"); });
  secciones.forEach(function(n){ log.getRange(n,1,1,8).setFontWeight("bold").setBackground("#b45309").setFontColor("#ffffff"); });
  cabeceras.forEach(function(n){ log.getRange(n,1,1,8).setFontWeight("bold").setBackground("#374151").setFontColor("#ffffff"); });
  try { log.autoResizeColumns(1, 8); } catch(e) {}
  try { log.setFrozenRows(2); } catch(e) {}

  return { ok: true, archivosConIncidencias: incid.length, validaciones: vals.length, duplicados: nDup };
}

function _consolidarNucleo(opciones) {
  // FIX FASE 8.16: acepta opciones = { modo: 'tolerante'|'estricto'|'reporte_solo' }
  // FIX FASE 8.17: acepta opciones = { incluir: 'INV'|'REG'|'ALL' } (default 'ALL')
  opciones = opciones || {};
  var esContinuacion = !!opciones._continuacion;
  var modo = (opciones.modo || "tolerante").toLowerCase();
  if (["tolerante", "estricto", "reporte_solo"].indexOf(modo) === -1) modo = "tolerante";
  var incluir = (opciones.incluir || "ALL").toUpperCase();
  if (["INV", "REG", "ALL"].indexOf(incluir) === -1) incluir = "ALL";
  var procInv = (incluir === "INV" || incluir === "ALL");
  var procReg = (incluir === "REG" || incluir === "ALL");

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) {
    return { ok:false, mensaje:"Sistema ocupado, intenta más tarde." };
  }
  try {
    var ss = _getSS();
    var pan = ss.getSheetByName(CRON_CFG.HOJA_PANEL);
    var inv = ss.getSheetByName("INVENTARIOS");
    var reg = ss.getSheetByName("REGISTRO");
    var aud = ss.getSheetByName("AUDITORIA_CONSOLIDACION") || ss.insertSheet("AUDITORIA_CONSOLIDACION");
    // FIX FASE 8.16: hoja nueva con detalle por incidencia (no rompe AUDITORIA existente)
    var detErr = ss.getSheetByName("ERRORES_VALIDACION_DETALLE") || ss.insertSheet("ERRORES_VALIDACION_DETALLE");
    // FIX FASE 8.17: hoja auditoría específica para REGISTRO (separada de INVENTARIOS)
    var audReg = ss.getSheetByName("AUDITORIA_REGISTRO") || ss.insertSheet("AUDITORIA_REGISTRO");

    // ── FIX FASE 8.33: determinar arranque fresco vs. reanudación ────────────
    var estPrev = _consolEstadoLeer();
    var debeReanudar = false;
    if (estPrev.STATUS === "EN_CURSO") {
      if (esContinuacion) {
        // El trigger reanuda desde el checkpoint.
        debeReanudar = true;
      } else if (_consolHeartbeatVivo(estPrev.TS)) {
        // Corrida viva: no permitir doble arranque manual. El dashboard ya
        // muestra el progreso y el trigger la terminará automáticamente.
        return { ok:false, enCurso:true, procesados: estPrev.PROCESADOS, total: estPrev.TOTAL,
          mensaje: "⏳ Ya hay una consolidación en curso (" + estPrev.PROCESADOS + "/" +
                   estPrev.TOTAL + "). Terminará automáticamente; espera unos minutos " +
                   "o usa \"Cancelar consolidación\" si quieres detenerla." };
      } else {
        // Cadena muerta (sin latido) + llamada manual → arrancar fresco con el
        // modo pedido. El arranque fresco limpia INVENTARIOS desde la fila 2,
        // así que no hay riesgo de duplicar lo parcial de la corrida abandonada.
        _consolEstadoReset();
      }
    } else if (esContinuacion) {
      // El trigger disparó pero el estado ya no está EN_CURSO (completado/cancelado).
      return { ok:true, noop:true, mensaje:"Sin consolidación activa." };
    }

    // En reanudación, modo/incluir/contexto provienen del estado persistido.
    if (debeReanudar) {
      modo    = estPrev.MODO || modo;
      incluir = estPrev.INCLUIR || incluir;
      procInv = (incluir === "INV" || incluir === "ALL");
      procReg = (incluir === "REG" || incluir === "ALL");
    }
    var esFresh = !debeReanudar;
    // estricto = pasada única (no apila); tolerante/reporte_solo = por lotes.
    var esBatch = (modo === "tolerante" || modo === "reporte_solo");

    // FIX FASE 8.31/8.33: contexto de ejecución (presupuesto de tiempo).
    // En reanudación viene del estado persistido; en fresco, del caller.
    var ctx = debeReanudar
      ? (estPrev.CTX || "editor")
      : String(opciones && opciones.contexto || "editor").toLowerCase();

    // Encabezados de auditoría: limpiar/escribir SOLO en arranque fresco.
    // En reanudación se APILA sobre lo ya escrito por los lotes previos.
    if (esFresh) {
      aud.clear();
      aud.appendRow([
        "Fecha", "Cliente", "ID Archivo", "Filas leídas",
        "Filas incluidas", "Filas excluidas", "Motivo principal exclusión",
        "Suma Cantidad", "SKUs únicos", "Posiciones únicas", "Status"
      ]);
      aud.getRange(1, 1, 1, 11).setFontWeight("bold")
         .setBackground("#1a73e8").setFontColor("#ffffff");

      detErr.clear();
      detErr.appendRow([
        "Cliente", "ID Archivo", "Link", "Fila", "Columna",
        "Valor encontrado", "Motivo", "Acción tomada", "Severidad"
      ]);
      detErr.getRange(1, 1, 1, 9).setFontWeight("bold")
            .setBackground("#d93025").setFontColor("#ffffff");
    }

    // ── Construir (fresco) o cargar (reanudar) la lista inmutable de archivos ─
    var entries, startIdx;
    if (esFresh) {
      if (pan.getLastRow() < 2) {
        _consolEstadoReset();
        return { ok:false, mensaje:"Panel vacío." };
      }
      var pData = pan.getRange(2, 1, pan.getLastRow() - 1, 7).getValues();
      entries = [];
      for (var i = 0; i < pData.length; i++) {
        if (String(pData[i][CRON_CFG.PA_COL_AVANCE - 1] || "").toLowerCase().indexOf("entregado") !== -1) {
          entries.push({
            cliente: pData[i][CRON_CFG.PA_COL_CLIENTE - 1],
            id: extractIdFromUrl(pData[i][CRON_CFG.PA_COL_ID - 1])
          });
        }
      }
      if (entries.length === 0) {
        _consolEstadoReset();
        return { ok:false, mensaje:"No hay archivos 'Entregado' en el Panel." };
      }
      startIdx = 0;
      if (esBatch) {
        _consolSnapshotCrear(entries);
        _consolEstadoIniciar({ total: entries.length, modo: modo, incluir: incluir, ctx: ctx });
      }
    } else {
      entries = _consolSnapshotLeer();
      startIdx = estPrev.NEXT_IDX || 0;
      if (!entries.length) {
        _consolEstadoReset();
        return { ok:false, mensaje:"No hay snapshot de consolidación para reanudar." };
      }
    }

    // FIX FASE 8.32: auto-reparación proactiva de archivos inaccesibles previos.
    // Si en ejecuciones anteriores quedaron archivos en ARCHIVOS_INACCESIBLES,
    // intentamos repararlos AHORA antes del bucle principal. Así los que se
    // hayan resuelto naturalmente (alguien compartió el archivo, cambió permiso,
    // etc.) entran a la consolidación de este ciclo.
    // FIX FASE 8.33: solo en arranque fresco (no en cada lote de continuación).
    var reparadosAuto = 0;
    if (esFresh) try {
      var hInacPre = ss.getSheetByName("ARCHIVOS_INACCESIBLES");
      if (hInacPre && hInacPre.getLastRow() >= 2) {
        var dPre = hInacPre.getRange(2, 1, hInacPre.getLastRow() - 1, 7).getValues();
        for (var iP = 0; iP < dPre.length; iP++) {
          var estadoPrev = String(dPre[iP][5] || "");
          if (estadoPrev === "✅ Resuelto" || estadoPrev === "✅ Reparado") continue;
          var fidPrev = String(dPre[iP][2] || "").trim();
          if (!fidPrev) continue;
          try {
            var fPrev = DriveApp.getFileById(fidPrev);
            _compartirArchivoConEquipo(fPrev);
            reparadosAuto++;
          } catch (eRP) {
            // Sin acceso → quedará marcado igual durante el bucle principal
          }
        }
        if (reparadosAuto > 0) {
          Logger.log("FIX 8.32 auto-reparación previa: " + reparadosAuto +
                     " archivos re-compartidos antes de consolidar");
        }
      }
    } catch (eAR) {
      Logger.log("FIX 8.32 auto-reparación previa falló: " + eAR.message);
    }

    var sumTotalCant = 0, sumTotalFilas = 0, todosLosDatos = [];
    var headersInv = null;
    var auditRows = [];
    var erroresDetalle = [];   // [Cliente, ID, Link, Fila, Columna, Valor, Motivo, Acción, Severidad]
    var totalDuplicados = 0;
    var totalCriticos = 0;     // SKU vacío + Cantidad inválida (modo estricto detiene si > 0)
    // FIX FASE 8.17: acumuladores para REGISTRO
    var todosLosRegistros = [];
    var headersReg = null;
    var auditRegRows = [];
    var totalDuplicadosReg = 0;
    var totalFilasRegIncluidas = 0;
    var totalFilasRegVacias = 0;
    var hashesGlobalesReg = {}; // dedup entre archivos (registro suele tener id único por evento)

    // FIX FASE 8.31/8.33: presupuesto de tiempo por lote.
    // - Continuación por trigger: 5 min (seguro bajo el límite duro; la cadena
    //   .after(90s) cubre cualquier volumen sin riesgo de timeout abrupto).
    // - Web App fresco: 5 min · Editor fresco: 25 min (cuenta Workspace).
    var tInicio = Date.now();
    var LIMITE_MS = esContinuacion
      ? (5 * 60 * 1000)
      : ((ctx === "web") ? 5 * 60 * 1000 : 25 * 60 * 1000);
    var archivosOmitidosPorTiempo = 0;
    var archivoActual = 0;
    // FIX 8.31: progreso visible en log cada N archivos
    var LOG_CADA = 10;
    // FIX 8.31: lista de archivos inaccesibles para registrar en hoja persistente
    var inaccesiblesArray = [];
    // FIX FASE 8.33: control de lote — dónde reanudar si se agota el tiempo.
    var seAgotoTiempo = false;
    var nextIdx = entries.length;   // por defecto: se procesó todo

    entries.forEach(function(ent, idxEnt){
      archivoActual = idxEnt + 1;
      // FIX FASE 8.33: saltar lo ya procesado en lotes previos.
      if (idxEnt < startIdx) return;
      // FIX FASE 8.33: presupuesto agotado → el resto va al siguiente lote.
      if (seAgotoTiempo) return;
      if (!ent.id) return;

      // FIX 8.31: log de progreso cada N archivos para ver avance en Logger
      if (archivoActual % LOG_CADA === 0 || archivoActual === 1) {
        var transcurridoSeg = Math.floor((Date.now() - tInicio) / 1000);
        Logger.log("FIX 8.31 progreso consolidación: " + archivoActual + "/" + entries.length +
                   " · " + transcurridoSeg + "s transcurridos · " +
                   "incluidas=" + sumTotalFilas + " · excluidas=" + erroresDetalle.length);
      }

      // FIX FASE 8.33: si excedimos el presupuesto de tiempo, cortar el lote.
      // El archivo actual (idxEnt) y los siguientes se procesarán en el próximo
      // lote vía el trigger _continuarConsolidacion. NADA se pierde ni duplica:
      // INVENTARIOS es append-only dentro de la corrida y el checkpoint marca
      // exactamente dónde retomar.
      if (Date.now() - tInicio > LIMITE_MS) {
        seAgotoTiempo = true;
        nextIdx = idxEnt;
        return;
      }

      // FIX FASE 8.30: barrera defensiva — si CUALQUIER operación falla dentro
      // del procesamiento de este archivo (permisos, hoja eliminada, formato
      // corrupto, timeout intermedio en una getValues, etc.), atrapamos el error,
      // lo registramos en la auditoría, y CONTINUAMOS con los demás archivos.
      // Antes una sola excepción no atrapada cortaba TODA la consolidación
      // (causa del error "No cuentas con el permiso necesario..." visto en log).
      try {

      var op = safeOpenSpreadsheet(ent.id);
      if (!op.ss) {
        auditRows.push([new Date(), ent.cliente, ent.id, 0, 0, 0,
          "ERROR_ABRIR_ARCHIVO", 0, 0, 0, "❌ Error"]);
        erroresDetalle.push([ent.cliente, ent.id, "", "—", "—", "",
          "ERROR_ABRIR_ARCHIVO: " + (op.error || "sin acceso"),
          "Archivo saltado", "ALTA"]);
        // FIX FASE 8.31: registrar también en lista persistente para reparación
        inaccesiblesArray.push({
          cliente: ent.cliente,
          id: ent.id,
          motivo: op.error || "sin acceso",
          fecha: new Date()
        });
        return;
      }
      var linkArchivo = "https://docs.google.com/spreadsheets/d/" + ent.id + "/edit";
      // FIX FASE 8.17: TZ del archivo origen (usado tanto para INVENTARIOS como REGISTRO)
      var tzOrigen;
      try { tzOrigen = op.ss.getSpreadsheetTimeZone(); } catch(eTz) {}

      // ════════════════════════════════════════════════════════════════════
      // BLOQUE INVENTARIOS (procesar solo si procInv === true)
      // ════════════════════════════════════════════════════════════════════
      if (procInv) {
        var shConteo = op.ss.getSheetByName("PLANILLA DE CONTEO FISICO");
        if (!shConteo || shConteo.getLastRow() < 2) {
          auditRows.push([new Date(), ent.cliente, ent.id, 0, 0, 0,
            "Hoja conteo vacía", 0, 0, 0, "⚠️ Vacío"]);
        } else {
          // FIX FASE 8.32: OPTIMIZACIÓN CRÍTICA DE PERFORMANCE
          // Antes: 4 llamadas a getRange (headers values, headers display, datos values, datos display).
          // Ahora: 2 llamadas — leemos todo el rango (headers + datos) en una sola operación
          //        y luego separamos en memoria con slice(0,1) y slice(1).
          // Reduce ~50% el tiempo por archivo (cada llamada API tiene latencia base ~0.3-0.5s).
          var lastCol = shConteo.getLastColumn();
          var lastRow = shConteo.getLastRow();
          var rangoCompleto = shConteo.getRange(1, 1, lastRow, lastCol);
          var todosValues  = rangoCompleto.getValues();
          var todosDisplay = rangoCompleto.getDisplayValues();

          // Separar headers de datos en memoria (sin nueva llamada API)
          var headersFila = todosValues[0];
          var headersDispOrigen = [todosDisplay[0]];
          var raw     = todosValues.slice(1);
          var rawDisp = todosDisplay.slice(1);

          if (!headersInv) headersInv = headersFila;
          raw = _normalizarFechasMatriz(raw, rawDisp, tzOrigen);
          headersInv = _normalizarFechasMatriz([headersInv], headersDispOrigen, tzOrigen)[0];
      var colCnt = detectColumnCantidadSmart(headersInv, raw, lastCol);
      if (colCnt === null) colCnt = detectColumnCantidadFromDisplay(rawDisp, lastCol);

      var colsClave = _detectarColumnasClave(headersInv);
      // Resolver índice de cantidad: preferir el detectado por nombre, luego smart
      var colCant = (colsClave.cant !== null && colsClave.cant >= 0) ? colsClave.cant : colCnt;

      var inc = 0, exc = 0, motivoPrincipal = "", sumCant = 0;
      var skus = {}, poss = {};
      var hashesArchivo = {}; // dedup intra-archivo
      var conteoMotivos = {}; // para "motivo principal" en auditoría

      raw.forEach(function(row, idxRow){
        var filaOrigen = idxRow + 2; // fila en PLANILLA DE CONTEO FISICO

        // ── Check 1: fila completamente vacía
        if (!row.some(function(c){ return valueNotEmpty(c); })) {
          exc++; conteoMotivos["FILA_VACIA"] = (conteoMotivos["FILA_VACIA"]||0) + 1;
          return; // no se reporta como error individual (es ruido limpio)
        }

        // ── Check 2: SKU vacío
        var sku = colsClave.sku >= 0 ? row[colsClave.sku] : null;
        if (!valueNotEmpty(sku)) {
          exc++; totalCriticos++;
          conteoMotivos["SKU_VACIO"] = (conteoMotivos["SKU_VACIO"]||0) + 1;
          erroresDetalle.push([ent.cliente, ent.id, linkArchivo, filaOrigen,
            columnLetter(colsClave.sku + 1), "", "SKU_VACIO",
            "EXCLUIDA", "CRÍTICA"]);
          return;
        }

        // ── Check 3: Cantidad
        if (colCant !== null && colCant >= 0) {
          var v = row[colCant];
          if (valueNotEmpty(v) && !esNumeroValido(v)) {
            exc++; totalCriticos++;
            conteoMotivos["CANTIDAD_INVALIDA"] = (conteoMotivos["CANTIDAD_INVALIDA"]||0) + 1;
            erroresDetalle.push([ent.cliente, ent.id, linkArchivo, filaOrigen,
              columnLetter(colCant + 1), String(v), "CANTIDAD_INVALIDA",
              "EXCLUIDA", "CRÍTICA"]);
            return;
          }
          var numCant = esNumeroValido(v) ? parseFloat(String(v).replace(",", ".")) : 0;
          if (esNumeroValido(v) && numCant === 0) {
            exc++; conteoMotivos["CANTIDAD_CERO"] = (conteoMotivos["CANTIDAD_CERO"]||0) + 1;
            erroresDetalle.push([ent.cliente, ent.id, linkArchivo, filaOrigen,
              columnLetter(colCant + 1), "0", "CANTIDAD_CERO",
              "EXCLUIDA (conteo no realizado)", "MEDIA"]);
            return;
          }
          sumCant += numCant;
        }

        // ── Check 4: Deduplicación intra-archivo
        var hash = _hashFilaConsolidacion(row);
        if (hash && hashesArchivo[hash]) {
          exc++; totalDuplicados++;
          conteoMotivos["DUPLICADO_INTRA"] = (conteoMotivos["DUPLICADO_INTRA"]||0) + 1;
          erroresDetalle.push([ent.cliente, ent.id, linkArchivo, filaOrigen,
            columnLetter(colsClave.sku + 1), String(sku) + " ya estaba en fila " + hashesArchivo[hash],
            "DUPLICADO_INTRA_ARCHIVO", "EXCLUIDA (copia)", "MEDIA"]);
          return;
        }
        hashesArchivo[hash] = filaOrigen;

        // ── Fila válida → incluir
        skus[String(sku).trim().toUpperCase()] = true;
        if (row[colsClave.posicion]) poss[String(row[colsClave.posicion]).trim().toUpperCase()] = true;
        inc++;
        todosLosDatos.push(row);
      });

      // Determinar motivo principal por archivo (el de mayor frecuencia)
      var motivoTop = "—", maxCnt = 0;
      Object.keys(conteoMotivos).forEach(function(k){
        if (conteoMotivos[k] > maxCnt) { motivoTop = k; maxCnt = conteoMotivos[k]; }
      });

      sumTotalCant += sumCant;
      sumTotalFilas += inc;
      auditRows.push([
        new Date(), ent.cliente, ent.id, raw.length, inc, exc,
        motivoTop,
        sumCant, Object.keys(skus).length, Object.keys(poss).length,
        inc > 0 ? "✅ OK" : "⚠️ Sin datos"
      ]);
        } // cierre if (shConteo válido)
      } // cierre if (procInv)

      // ════════════════════════════════════════════════════════════════════
      // FIX FASE 8.17 — BLOQUE REGISTRO (procesar solo si procReg === true)
      // Lógica simétrica a INVENTARIOS: lee REGISTRO, deduplica por archivo,
      // filtra filas vacías, registra incidencias en ERRORES_VALIDACION_DETALLE,
      // y guarda auditoría por archivo en AUDITORIA_REGISTRO.
      // ════════════════════════════════════════════════════════════════════
      if (procReg) {
        var shRegOrigen = op.ss.getSheetByName("REGISTRO");
        if (!shRegOrigen || shRegOrigen.getLastRow() < 2) {
          auditRegRows.push([new Date(), ent.cliente, ent.id, 0, 0, 0,
            "Sin REGISTRO o vacío", 0, "⚠️ Vacío"]);
        } else {
          // FIX FASE 8.32: misma optimización en REGISTRO (4 lecturas → 2)
          var lastColReg = shRegOrigen.getLastColumn();
          var lastRowReg = shRegOrigen.getLastRow();
          var rangoReg = shRegOrigen.getRange(1, 1, lastRowReg, lastColReg);
          var regValues  = rangoReg.getValues();
          var regDisplay = rangoReg.getDisplayValues();
          var headersRegFila = regValues[0];
          var headersRegDisp = [regDisplay[0]];
          var rawReg     = regValues.slice(1);
          var rawRegDisp = regDisplay.slice(1);

          if (!headersReg) headersReg = headersRegFila;
          rawReg = _normalizarFechasMatriz(rawReg, rawRegDisp, tzOrigen);
          headersReg = _normalizarFechasMatriz([headersReg], headersRegDisp, tzOrigen)[0];

          var incReg = 0, excReg = 0, motivoRegTop = "—";
          var conteoMotivosReg = {};
          var hashesArchivoReg = {}; // dedup intra-archivo para REGISTRO

          rawReg.forEach(function(rowReg, idxRowReg){
            var filaOrigenReg = idxRowReg + 2;

            // Check 1: fila vacía
            if (!rowReg.some(function(c){ return valueNotEmpty(c); })) {
              excReg++; totalFilasRegVacias++;
              conteoMotivosReg["FILA_VACIA"] = (conteoMotivosReg["FILA_VACIA"]||0) + 1;
              return;
            }

            // Check 2: dedup intra-archivo
            var hashR = _hashFilaConsolidacion(rowReg);
            if (hashR && hashesArchivoReg[hashR]) {
              excReg++; totalDuplicadosReg++;
              conteoMotivosReg["DUPLICADO_INTRA"] = (conteoMotivosReg["DUPLICADO_INTRA"]||0) + 1;
              erroresDetalle.push([ent.cliente, ent.id, linkArchivo, filaOrigenReg,
                "—", "Fila ya estaba en " + hashesArchivoReg[hashR],
                "DUPLICADO_INTRA_ARCHIVO_REGISTRO", "EXCLUIDA (copia)", "MEDIA"]);
              return;
            }
            hashesArchivoReg[hashR] = filaOrigenReg;

            // Check 3: dedup global (entre archivos) — en REGISTRO, un mismo evento
            // no debería repetirse en varios archivos hijo. Reportar pero NO excluir
            // (el operario decide).
            if (hashR && hashesGlobalesReg[hashR]) {
              erroresDetalle.push([ent.cliente, ent.id, linkArchivo, filaOrigenReg,
                "—", "Fila también en archivo " + hashesGlobalesReg[hashR],
                "DUPLICADO_ENTRE_ARCHIVOS_REGISTRO", "INCLUIDA con advertencia", "BAJA"]);
            } else {
              hashesGlobalesReg[hashR] = ent.id;
            }

            // Fila válida
            incReg++;
            todosLosRegistros.push(rowReg);
          });

          // Motivo principal
          var mxR = 0;
          Object.keys(conteoMotivosReg).forEach(function(k){
            if (conteoMotivosReg[k] > mxR) { motivoRegTop = k; mxR = conteoMotivosReg[k]; }
          });

          totalFilasRegIncluidas += incReg;
          auditRegRows.push([
            new Date(), ent.cliente, ent.id, rawReg.length, incReg, excReg,
            motivoRegTop, Object.keys(hashesArchivoReg).length,
            incReg > 0 ? "✅ OK" : "⚠️ Sin datos"
          ]);
        }
      }

      // FIX FASE 8.30: cierre del try/catch defensivo por archivo
      } catch (errArchivo) {
        // CUALQUIER fallo no controlado dentro del procesamiento de este archivo
        // (permisos, hoja borrada, timeout intermedio en una llamada, formato corrupto)
        // se registra y se sigue con el siguiente — la consolidación NUNCA se aborta
        // por culpa de UN archivo problemático.
        var msgErr = String(errArchivo && errArchivo.message || errArchivo || "Error desconocido");
        auditRows.push([new Date(), ent.cliente, ent.id, 0, 0, 0,
          "ERROR_INTERNO: " + msgErr.substring(0, 80),
          0, 0, 0, "❌ Error"]);
        erroresDetalle.push([ent.cliente, ent.id,
          "https://docs.google.com/spreadsheets/d/" + ent.id + "/edit",
          "—", "—", "",
          "ERROR_PROCESAR_ARCHIVO: " + msgErr,
          "Archivo saltado completo", "ALTA"]);
        Logger.log("FIX 8.30 archivo saltado: " + ent.cliente + " (" + ent.id + ") → " + msgErr);
      }
    });

    // ── FIX FASE 8.33: contadores de auditoría de ESTE lote ──────────────────
    var leidasLote = auditRows.reduce(function(a,r){ return a + (Number(r[3])||0); }, 0);
    var excAudLote = auditRows.reduce(function(a,r){ return a + (Number(r[5])||0); }, 0);

    // Pintar reporte de errores con hipervínculos al archivo origen (APPEND por lote)
    if (erroresDetalle.length > 0) {
      var baseDet = Math.max(detErr.getLastRow() + 1, 2);
      detErr.getRange(baseDet, 1, erroresDetalle.length, 9).setValues(erroresDetalle);
      // Pintar columna severidad por color
      for (var er = 0; er < erroresDetalle.length; er++) {
        var sev = erroresDetalle[er][8];
        var color = sev === "CRÍTICA" ? "#fce8e6" :
                    (sev === "MEDIA" ? "#fef7e0" :
                    (sev === "BAJA" ? "#e8f0fe" : "#e6f4ea"));
        detErr.getRange(baseDet + er, 9).setBackground(color);
      }
      detErr.autoResizeColumns(1, 9);
      detErr.setFrozenRows(1);
    }

    // FIX FASE 8.17: escribir AUDITORIA_REGISTRO si se procesó REG (APPEND por lote)
    if (procReg) {
      if (esFresh) {
        audReg.clear();
        audReg.appendRow([
          "Fecha", "Cliente", "ID Archivo", "Filas leídas",
          "Filas incluidas", "Filas excluidas", "Motivo principal exclusión",
          "Hashes únicos archivo", "Status"
        ]);
        audReg.getRange(1, 1, 1, 9).setFontWeight("bold")
              .setBackground("#e37400").setFontColor("#ffffff");
      }
      if (auditRegRows.length > 0) {
        var baseAudReg = Math.max(audReg.getLastRow() + 1, 2);
        audReg.getRange(baseAudReg, 1, auditRegRows.length, 9).setValues(auditRegRows);
        audReg.autoResizeColumns(1, 9);
        audReg.setFrozenRows(1);
      }
    }

    // ── MODO ESTRICTO (pasada única): si no alcanzó a validar todo en una sola
    //    ejecución, NO escribe nada (más seguro que el parcial anterior).
    if (modo === "estricto" && seAgotoTiempo) {
      return {
        ok: false,
        modo: modo,
        mensaje: "❌ MODO ESTRICTO no pudo validar los " + entries.length +
                 " archivos en una sola ejecución (límite de tiempo).\n\n" +
                 "El modo estricto es 'todo o nada' y no se ejecuta por lotes.\n" +
                 "Usa modo TOLERANTE (procesa automáticamente por lotes hasta\n" +
                 "terminar el 100%) o ejecuta consolidarTodoDesdeEditor() desde\n" +
                 "el editor de Apps Script. No se escribió nada en INVENTARIOS."
      };
    }

    // ── MODO ESTRICTO: si hay errores críticos, DETIENE sin escribir INVENTARIOS
    if (modo === "estricto" && totalCriticos > 0) {
      return {
        ok: false,
        mensaje: "❌ MODO ESTRICTO bloqueó la consolidación.\n\n" +
                 "Errores críticos encontrados: " + totalCriticos + "\n" +
                 "Duplicados intra-archivo: " + totalDuplicados + "\n\n" +
                 "Revisa la hoja ERRORES_VALIDACION_DETALLE — tiene la ubicación\n" +
                 "exacta de cada problema (cliente / archivo / fila / columna).\n\n" +
                 "Resuelve los errores en los archivos hijos y vuelve a consolidar,\n" +
                 "o cambia a modo 'Tolerante' para ignorar las filas problemáticas.",
        criticos: totalCriticos,
        duplicados: totalDuplicados,
        detalle: erroresDetalle.length,
        modo: modo
      };
    }

    // ── FIX FASE 8.33: acumular contadores de ESTE lote en el estado persistido
    //    (batch) y marcar los archivos del lote como PROCESADO en el snapshot.
    if (esBatch) {
      _consolAccSumar({
        filas: sumTotalFilas, cant: sumTotalCant, criticos: totalCriticos,
        dups: totalDuplicados, erroresDet: erroresDetalle.length,
        excAud: excAudLote, leidas: leidasLote,
        regIncl: totalFilasRegIncluidas, regDup: totalDuplicadosReg, regVacias: totalFilasRegVacias
      }, esFresh ? reparadosAuto : null);
      _consolSnapshotMarcarRango(startIdx, nextIdx, "PROCESADO");
    }

    // ── Escribir INVENTARIOS — tolerante/estricto (reporte_solo nunca escribe) ─
    //    FIX FASE 8.33: APPEND por lote. Solo el arranque fresco limpia la fila 2+.
    if (modo !== "reporte_solo" && procInv) {
      if (esFresh && inv.getLastRow() > 1) {
        inv.getRange(2, 1, inv.getLastRow() - 1, inv.getLastColumn()).clearContent();
      }
      // Capa 3: stringificar cualquier Date que aún quede
      todosLosDatos = _stringificarFechasFinales(todosLosDatos);

      if (headersInv && inv.getLastRow() === 0) {
        inv.getRange(1, 1, 1, headersInv.length).setValues([headersInv])
           .setFontWeight("bold");
      }
      if (todosLosDatos.length > 0) {
        ensureColumns(inv, todosLosDatos[0].length);
        var destInv = Math.max(inv.getLastRow() + 1, 2);
        inv.getRange(destInv, 1, todosLosDatos.length, todosLosDatos[0].length)
           .setNumberFormat("@")
           .setValues(todosLosDatos);
      }
    }

    // ── FIX FASE 8.17 — Escribir REGISTRO (APPEND por lote) ───────────────────
    if (modo !== "reporte_solo" && procReg && reg) {
      if (esFresh && reg.getLastRow() > 1) {
        reg.getRange(2, 1, reg.getLastRow() - 1, reg.getLastColumn()).clearContent();
      }
      todosLosRegistros = _stringificarFechasFinales(todosLosRegistros);

      // Normalizar ancho de columnas (las hojas REGISTRO pueden tener filas con
      // ancho desigual). Calculamos el máximo y rellenamos con vacíos.
      if (todosLosRegistros.length > 0) {
        var maxColsReg = headersReg ? headersReg.length : 0;
        todosLosRegistros.forEach(function(r){ if (r.length > maxColsReg) maxColsReg = r.length; });
        // FIX FASE 8.33: máximo corrido entre lotes para ancho consistente.
        if (esBatch) maxColsReg = _consolMaxColsReg(maxColsReg);
        var regNormalizado = todosLosRegistros.map(function(r){
          while (r.length < maxColsReg) r.push("");
          return r.slice(0, maxColsReg);
        });

        if (headersReg && reg.getLastRow() === 0) {
          // Pad headers a maxColsReg
          while (headersReg.length < maxColsReg) headersReg.push("");
          reg.getRange(1, 1, 1, headersReg.length).setValues([headersReg])
             .setFontWeight("bold");
        }
        ensureColumns(reg, maxColsReg);
        var destReg = Math.max(reg.getLastRow() + 1, 2);
        reg.getRange(destReg, 1, regNormalizado.length, maxColsReg)
           .setNumberFormat("@")
           .setValues(regNormalizado);
      }
    }

    // Escribir AUDITORÍA INVENTARIOS de este lote (APPEND, sin fila TOTAL aún).
    // reporte_solo no escribe auditoría INV (comportamiento histórico).
    if (modo !== "reporte_solo" && procInv && auditRows.length > 0) {
      var baseAud = Math.max(aud.getLastRow() + 1, 2);
      aud.getRange(baseAud, 1, auditRows.length, auditRows[0].length).setValues(auditRows);
    }

    // FIX FASE 8.13: REMOVIDO el espejo automático a MATRIZ_INVENTARIOS_UIO.

    // FIX FASE 8.31: actualizar hoja persistente ARCHIVOS_INACCESIBLES.
    // Esta hoja mantiene la lista actualizada de archivos cuyo acceso falla,
    // para que el operador pueda repararlos (usando repararPermisosArchivo de v8.28
    // o repararPermisosLote de v8.31). Si en una consolidación posterior algún
    // archivo ya se abrió bien, se quita automáticamente de la lista.
    // FIX FASE 8.33: reporte_solo es dry-run → no muta esta hoja (igual que antes).
    if (modo !== "reporte_solo") try {
      var hInac = ss.getSheetByName("ARCHIVOS_INACCESIBLES") ||
                  ss.insertSheet("ARCHIVOS_INACCESIBLES");

      // Si la hoja está vacía, inicializar
      if (hInac.getLastRow() === 0) {
        hInac.appendRow(["Fecha detección", "Cliente", "File ID", "Link",
                         "Motivo", "Estado", "Última verificación"]);
        hInac.getRange(1, 1, 1, 7).setFontWeight("bold")
             .setBackground("#d93025").setFontColor("#ffffff");
        hInac.setFrozenRows(1);
      }

      // Leer lista actual para merge inteligente
      var inacExistentes = {};
      if (hInac.getLastRow() >= 2) {
        var vex = hInac.getRange(2, 1, hInac.getLastRow() - 1, 7).getValues();
        for (var iE = 0; iE < vex.length; iE++) {
          var idEx = String(vex[iE][2] || "").trim();
          if (idEx) inacExistentes[idEx] = { fila: iE + 2, datos: vex[iE] };
        }
      }

      // IDs que se intentaron en ESTA ejecución (omitidos por tiempo no cuentan
      // como "verificados") — útil para limpiar los que ya se resolvieron
      var idsIntentadosOk = {};
      auditRows.forEach(function(rA){
        var motivo = String(rA[6] || "");
        if (motivo.indexOf("OMITIDO_POR_TIEMPO") === -1 &&
            motivo.indexOf("ERROR_ABRIR_ARCHIVO") === -1) {
          idsIntentadosOk[String(rA[2] || "").trim()] = true;
        }
      });

      // 1) Agregar/actualizar inaccesibles encontrados ahora
      var ahora = new Date();
      inaccesiblesArray.forEach(function(inac){
        var idIn = String(inac.id).trim();
        var link = "https://docs.google.com/spreadsheets/d/" + idIn + "/edit";
        if (inacExistentes[idIn]) {
          // Ya estaba — actualizar última verificación y motivo
          var f = inacExistentes[idIn].fila;
          hInac.getRange(f, 5).setValue(inac.motivo);
          hInac.getRange(f, 6).setValue("⚠️ Persiste");
          hInac.getRange(f, 7).setValue(ahora);
        } else {
          // Nuevo — agregar fila
          hInac.appendRow([ahora, inac.cliente, idIn, link, inac.motivo,
                           "🆕 Nuevo", ahora]);
        }
      });

      // 2) Marcar como RESUELTO los que estaban en lista y ahora se abrieron bien
      Object.keys(inacExistentes).forEach(function(idEx){
        if (idsIntentadosOk[idEx]) {
          var f2 = inacExistentes[idEx].fila;
          hInac.getRange(f2, 6).setValue("✅ Resuelto");
          hInac.getRange(f2, 7).setValue(ahora);
        }
      });
    } catch (eInac) {
      Logger.log("FIX 8.31 ARCHIVOS_INACCESIBLES: " + eInac.message);
    }

    // ── FIX FASE 8.33: ¿quedan archivos pendientes? → checkpoint + trigger ────
    //    Solo en modo batch (tolerante/reporte_solo). Persistimos dónde retomar
    //    y programamos un trigger one-time que reanuda automáticamente.
    if (esBatch && seAgotoTiempo && nextIdx < entries.length) {
      _consolEstadoCheckpoint(nextIdx);
      _programarContinuacionConsolidacion();
      return {
        ok: true, enCurso: true, procesados: nextIdx, total: entries.length,
        modo: modo, incluir: incluir,
        mensaje: "⏳ Consolidación en progreso: " + nextIdx + " / " + entries.length +
                 " archivos procesados.\n\n" +
                 "Continuará automáticamente en segundo plano (un lote cada ~1-2 min) " +
                 "hasta terminar el 100%. El dashboard mostrará el avance.\n" +
                 "No vuelvas a ejecutar mientras esté en curso."
      };
    }

    // ════════════════════════════════════════════════════════════════════════
    // COMPLETADO — se procesaron todos los archivos del snapshot.
    // ════════════════════════════════════════════════════════════════════════
    invalidarCacheSeries();
    // FIX FASE 8.37: regenerar el LOG único de consolidación (nunca rompe el flujo).
    try { generarLogConsolidacion(); } catch (eLog) {}

    // ── FASE 8.62 (R1): garantía de accesos al COMPLETAR ──────────────────────
    // Solo re-comparte si el EQUIPO cambió (altas/bajas) desde la última vez.
    // Así una consolidación normal NO re-comparte ni envía correos, y cuando se
    // incorpora un operario, la siguiente consolidación le da acceso a todo.
    try {
      var _teamHashNow = _equipoHashActivo();
      var _teamHashOld = _consolProps().getProperty("ACCESOS_TEAM_HASH") || "";
      if (_teamHashNow && _teamHashNow !== _teamHashOld) {
        var _idsAcc = [];
        for (var _ea = 0; _ea < entries.length; _ea++) {
          if (entries[_ea] && entries[_ea].id) _idsAcc.push(entries[_ea].id);
        }
        var _rAcc = _garantizarAccesosLote(_idsAcc, Date.now() + 90 * 1000);
        if (_rAcc.completo) _consolProps().setProperty("ACCESOS_TEAM_HASH", _teamHashNow);
        Logger.log("FASE 8.62 R1 accesos: aplicados=" + _rAcc.aplicados +
                   " fallos=" + _rAcc.fallos + " completo=" + _rAcc.completo +
                   " (equipo cambió)");
      }
    } catch (eAcc62) { Logger.log("FASE 8.62 R1 garantía accesos: " + eAcc62.message); }

    // Totales GRANDES: en batch vienen del estado acumulado entre lotes;
    // en estricto (pasada única) son los locales de esta ejecución.
    var G = esBatch ? _consolAccLeer() : {
      filas: sumTotalFilas, cant: sumTotalCant, criticos: totalCriticos,
      dups: totalDuplicados, erroresDet: erroresDetalle.length,
      excAud: excAudLote, leidas: leidasLote,
      regIncl: totalFilasRegIncluidas, regDup: totalDuplicadosReg,
      regVacias: totalFilasRegVacias, reparados: reparadosAuto
    };

    // ── MODO REPORTE_SOLO: no escribe INVENTARIOS ni REGISTRO, sólo reporta ───
    if (modo === "reporte_solo") {
      if (esBatch) _consolEstadoFinalizar("COMPLETADO");
      return {
        ok: true,
        mensaje: "📋 Pre-validación completa (no se escribió nada):\n\n" +
                 "Incluir: " + incluir + "\n" +
                 "Archivos analizados: " + entries.length + " / " + entries.length + "\n" +
                 (procInv ?
                   "\n[INVENTARIOS]\n" +
                   "  • Filas que SE consolidarían: " + G.filas + "\n" +
                   "  • Errores críticos: " + G.criticos + "\n" +
                   "  • Duplicados intra-archivo: " + G.dups + "\n"
                 : "") +
                 (procReg ?
                   "\n[REGISTRO]\n" +
                   "  • Filas que SE consolidarían: " + G.regIncl + "\n" +
                   "  • Filas vacías excluidas: " + G.regVacias + "\n" +
                   "  • Duplicados intra-archivo: " + G.regDup + "\n"
                 : "") +
                 "\nRevisa ERRORES_VALIDACION_DETALLE para detalle por fila.",
        modo: modo,
        incluir: incluir,
        sinEscribir: true,
        archivosProcesados: entries.length,
        filasIncluidasEstimadas: G.filas,
        filasExcluidas: G.erroresDet,
        criticos: G.criticos,
        duplicados: G.dups,
        registroIncluidas: G.regIncl,
        registroDuplicados: G.regDup,
        registroVacias: G.regVacias
      };
    }

    // ── Fila TOTALES de AUDITORIA_CONSOLIDACION (con grandes totales) ─────────
    if (procInv) {
      var totalRow = ["TOTAL", "—", "—",
        G.leidas, G.filas, G.excAud,
        "—", G.cant, "—", "—", "📊"];
      var rowTotal = Math.max(aud.getLastRow() + 1, 2);
      aud.getRange(rowTotal, 1, 1, totalRow.length)
         .setValues([totalRow])
         .setBackground("#fff3cd").setFontWeight("bold");
      aud.autoResizeColumns(1, 11);
    }

    if (esBatch) _consolEstadoFinalizar("COMPLETADO");

    // FIX FASE 8.16 + 8.17: mensaje detallado por sección
    var partes = ["✅ Consolidación finalizada (modo " + modo.toUpperCase() + ", incluir " + incluir + "):",
                  "",
                  "• Archivos procesados: " + entries.length + " / " + entries.length];
    // FIX FASE 8.32: avisar si la auto-reparación previa rescató archivos
    if (G.reparados > 0) {
      partes.push("🔧 Auto-reparación previa: " + G.reparados + " archivo(s) re-compartidos");
    }
    if (procInv) {
      partes.push("");
      partes.push("[INVENTARIOS]");
      partes.push("  • Filas incluidas: " + G.filas);
      partes.push("  • Filas excluidas: " + G.excAud);
      partes.push("  • Críticos (SKU vacío / Cant. inválida): " + G.criticos);
      partes.push("  • Duplicados intra-archivo: " + G.dups);
      partes.push("  • Suma total cantidad: " + (Number(G.cant) || 0).toLocaleString());
    }
    if (procReg) {
      partes.push("");
      partes.push("[REGISTRO]");
      partes.push("  • Filas incluidas: " + G.regIncl);
      partes.push("  • Filas vacías excluidas: " + G.regVacias);
      partes.push("  • Duplicados intra-archivo: " + G.regDup);
    }
    partes.push("");
    partes.push(G.erroresDet > 0
      ? "📋 Revisa ERRORES_VALIDACION_DETALLE para ubicación exacta."
      : "🎯 Sin incidencias detectadas.");
    if (procInv) partes.push("📊 Revisa AUDITORIA_CONSOLIDACION para detalle INVENTARIOS.");
    if (procReg) partes.push("📒 Revisa AUDITORIA_REGISTRO para detalle REGISTRO.");

    return {
      ok: true,
      mensaje: partes.join("\n"),
      archivosProcesados: entries.length,
      filasIncluidas: G.filas,
      filasExcluidas: G.erroresDet,
      criticos: G.criticos,
      duplicados: G.dups,
      sumaCantidad: G.cant,
      registroIncluidas: G.regIncl,
      registroDuplicados: G.regDup,
      registroVacias: G.regVacias,
      modo: modo,
      incluir: incluir
    };

  } catch (e) {
    // FIX FASE 8.10: no usar getUi en catch, lanzar para que dash_ lo capture
    Logger.log("Error consolidarConAuditoria: " + e.message);
    throw new Error("Error en consolidación: " + e.message);
  } finally {
    lock.releaseLock();
  }
}


/* ==========================================================================
   FIX FASE 8.33 — ESTADO DE CONSOLIDACIÓN POR LOTES (helpers)
   --------------------------------------------------------------------------
   Estado ligero en ScriptProperties + snapshot inmutable de archivos en la
   hoja oculta __CACHE_CONSOLIDACION. Los ~250 IDs no caben en una propiedad
   de 9 KB, por eso el snapshot va en la hoja; los contadores van en props.
   ========================================================================== */

var CONSOL_HOJA_CACHE = "__CACHE_CONSOLIDACION";

function _consolProps() { return PropertiesService.getScriptProperties(); }

/* Lee el estado de control (sin acumuladores). */
function _consolEstadoLeer() {
  var p = _consolProps();
  return {
    RUN_TOKEN:  p.getProperty("CONSOL_RUN_TOKEN") || "",
    STATUS:     p.getProperty("CONSOL_STATUS") || "IDLE",
    NEXT_IDX:   parseInt(p.getProperty("CONSOL_NEXT_IDX") || "0", 10),
    TOTAL:      parseInt(p.getProperty("CONSOL_TOTAL") || "0", 10),
    PROCESADOS: parseInt(p.getProperty("CONSOL_PROCESADOS") || "0", 10),
    MODO:       p.getProperty("CONSOL_MODO") || "",
    INCLUIR:    p.getProperty("CONSOL_INCLUIR") || "",
    CTX:        p.getProperty("CONSOL_CTX") || "",
    TS:         parseInt(p.getProperty("CONSOL_TS") || "0", 10)
  };
}

/* Una corrida se considera viva si latió hace < 12 min (lotes ≤5 min + 90 s gap). */
function _consolHeartbeatVivo(ts) {
  if (!ts) return false;
  return (Date.now() - ts) < (12 * 60 * 1000);
}

function _consolEstadoIniciar(o) {
  _consolProps().setProperties({
    CONSOL_RUN_TOKEN: Utilities.getUuid(),
    CONSOL_STATUS:    "EN_CURSO",
    CONSOL_NEXT_IDX:  "0",
    CONSOL_TOTAL:     String(o.total),
    CONSOL_PROCESADOS:"0",
    CONSOL_MODO:      o.modo,
    CONSOL_INCLUIR:   o.incluir,
    CONSOL_CTX:       o.ctx,
    CONSOL_TS:        String(Date.now()),
    CONSOL_STALLS:    "0",
    CONSOL_ACC: JSON.stringify({ filas:0, cant:0, criticos:0, dups:0, erroresDet:0,
      excAud:0, leidas:0, regIncl:0, regDup:0, regVacias:0, reparados:0, maxColsReg:0 })
  }, false);
  // FASE 8.63 (R1): watchdog recurrente — garantiza el 100% aunque un trigger
  // one-time se pierda. Se autodestruye al COMPLETAR/CANCELAR.
  try { _programarWatchdogConsolidacion(); } catch (e) {}
}

/* FASE 8.63 (R1): red de seguridad. Cada 5 min revisa la corrida; si sigue
   EN_CURSO con pendientes y el heartbeat está frío (>4 min sin avanzar), relanza
   la continuación. Si ya no está EN_CURSO, borra los watchdogs. */
function _programarWatchdogConsolidacion() {
  try {
    ScriptApp.getProjectTriggers().forEach(function(t){
      if (t.getHandlerFunction() === "_watchdogConsolidacion") ScriptApp.deleteTrigger(t);
    });
  } catch (e) {}
  ScriptApp.newTrigger("_watchdogConsolidacion").timeBased().everyMinutes(5).create();
}
function _borrarWatchdogConsolidacion() {
  try {
    ScriptApp.getProjectTriggers().forEach(function(t){
      if (t.getHandlerFunction() === "_watchdogConsolidacion") ScriptApp.deleteTrigger(t);
    });
  } catch (e) {}
}
function _watchdogConsolidacion() {
  var st = _consolEstadoLeer();
  if (st.STATUS !== "EN_CURSO") { _borrarWatchdogConsolidacion(); return; }
  if (st.NEXT_IDX >= st.TOTAL) return; // el ciclo COMPLETADO lo cerrará
  // ¿heartbeat frío? (nadie avanzó en >4 min → el trigger one-time se perdió)
  if ((Date.now() - st.TS) < (4 * 60 * 1000)) return;
  var yaProg = false;
  try {
    ScriptApp.getProjectTriggers().forEach(function(t){
      if (t.getHandlerFunction() === "_continuarConsolidacion") yaProg = true;
    });
  } catch (e) {}
  if (!yaProg) {
    try { _programarContinuacionConsolidacion(); } catch (e) {}
    Logger.log("FASE 8.63 R1 watchdog: relanzó la continuación (heartbeat frío).");
  }
}

function _consolEstadoCheckpoint(nextIdx) {
  _consolProps().setProperties({
    CONSOL_NEXT_IDX:  String(nextIdx),
    CONSOL_PROCESADOS:String(nextIdx),
    CONSOL_STATUS:    "EN_CURSO",
    CONSOL_TS:        String(Date.now())
  }, false);
}

function _consolEstadoFinalizar(status) {
  var p = _consolProps();
  var tot = parseInt(p.getProperty("CONSOL_TOTAL") || "0", 10);
  p.setProperties({
    CONSOL_STATUS:    status,
    CONSOL_PROCESADOS:String(tot),
    CONSOL_NEXT_IDX:  String(tot),
    CONSOL_TS:        String(Date.now())
  }, false);
  try { _borrarWatchdogConsolidacion(); } catch (e) {}   // FASE 8.63 (R1)
}

function _consolEstadoReset() {
  var p = _consolProps();
  ["CONSOL_RUN_TOKEN","CONSOL_STATUS","CONSOL_NEXT_IDX","CONSOL_TOTAL",
   "CONSOL_PROCESADOS","CONSOL_MODO","CONSOL_INCLUIR","CONSOL_CTX","CONSOL_TS",
   "CONSOL_ACC","CONSOL_STALLS"].forEach(function(k){
    try { p.deleteProperty(k); } catch(e){}
  });
}

function _consolAccLeer() {
  var raw = _consolProps().getProperty("CONSOL_ACC");
  var d = { filas:0, cant:0, criticos:0, dups:0, erroresDet:0, excAud:0,
            leidas:0, regIncl:0, regDup:0, regVacias:0, reparados:0, maxColsReg:0 };
  if (!raw) return d;
  try { var o = JSON.parse(raw); for (var k in d) if (o[k] != null) d[k] = o[k]; } catch(e){}
  return d;
}

function _consolAccSumar(delta, reparados) {
  var a = _consolAccLeer();
  a.filas      += delta.filas      || 0;
  a.cant       += delta.cant       || 0;
  a.criticos   += delta.criticos   || 0;
  a.dups       += delta.dups       || 0;
  a.erroresDet += delta.erroresDet || 0;
  a.excAud     += delta.excAud     || 0;
  a.leidas     += delta.leidas     || 0;
  a.regIncl    += delta.regIncl    || 0;
  a.regDup     += delta.regDup     || 0;
  a.regVacias  += delta.regVacias  || 0;
  if (reparados != null) a.reparados = reparados;
  _consolProps().setProperty("CONSOL_ACC", JSON.stringify(a));
}

/* Devuelve el máximo corrido de columnas de REGISTRO entre lotes. */
function _consolMaxColsReg(n) {
  var a = _consolAccLeer();
  if (n > (a.maxColsReg || 0)) {
    a.maxColsReg = n;
    _consolProps().setProperty("CONSOL_ACC", JSON.stringify(a));
  }
  return a.maxColsReg;
}

/* ── Snapshot inmutable de la lista de archivos (hoja oculta) ─────────────── */
function _consolHojaCache(crear) {
  var ss = _getSS();
  var sh = ss.getSheetByName(CONSOL_HOJA_CACHE);
  if (!sh && crear) {
    sh = ss.insertSheet(CONSOL_HOJA_CACHE);
    try { sh.hideSheet(); } catch(e){}
  }
  return sh;
}

function _consolSnapshotCrear(entries) {
  var sh = _consolHojaCache(true);
  sh.clear();
  var ahora = new Date();
  var rows = [["idx","cliente","fileId","estado","timestamp"]];
  for (var i = 0; i < entries.length; i++) {
    rows.push([i, entries[i].cliente, entries[i].id || "", "PENDIENTE", ahora]);
  }
  sh.getRange(1, 1, rows.length, 5).setValues(rows);
}

function _consolSnapshotLeer() {
  var sh = _consolHojaCache(false);
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
  return v.map(function(r){ return { cliente: r[1], id: String(r[2] || "") }; });
}

/* Marca el rango [desde, hasta) de índices con un estado (idx i → fila i+2). */
function _consolSnapshotMarcarRango(desde, hasta, estado) {
  var sh = _consolHojaCache(false);
  if (!sh || sh.getLastRow() < 2) return;
  var n = hasta - desde;
  if (n <= 0) return;
  var vals = [];
  for (var k = 0; k < n; k++) vals.push([estado]);
  sh.getRange(desde + 2, 4, n, 1).setValues(vals);
}

/* ── Trigger de continuación (one-time, .after) ───────────────────────────── */
function _programarContinuacionConsolidacion() {
  try {
    ScriptApp.getProjectTriggers().forEach(function(t){
      if (t.getHandlerFunction() === "_continuarConsolidacion") ScriptApp.deleteTrigger(t);
    });
  } catch(e){}
  ScriptApp.newTrigger("_continuarConsolidacion").timeBased().after(90 * 1000).create();
}

/* Reanuda la consolidación desde el checkpoint. Se auto-borra (patrón one-time)
   y reprograma sólo si quedó trabajo pendiente y la cadena no avanzó. */
function _continuarConsolidacion() {
  try {
    ScriptApp.getProjectTriggers().forEach(function(t){
      if (t.getHandlerFunction() === "_continuarConsolidacion") ScriptApp.deleteTrigger(t);
    });
  } catch(e){}

  var st = _consolEstadoLeer();
  if (st.STATUS !== "EN_CURSO") return;  // completado/cancelado → autodestrucción

  try {
    _consolidarNucleo({ _continuacion: true });
  } catch(e) {
    Logger.log("FIX 8.33 _continuarConsolidacion error: " + e.message);
  }

  // Salvaguarda: si sigue EN_CURSO con pendientes y nadie reprogramó, reintentar.
  var st2 = _consolEstadoLeer();
  if (st2.STATUS === "EN_CURSO" && st2.NEXT_IDX < st2.TOTAL) {
    var avanzo = st2.NEXT_IDX > st.NEXT_IDX;
    var p = _consolProps();
    var stalls = avanzo ? 0 : (parseInt(p.getProperty("CONSOL_STALLS") || "0", 10) + 1);
    p.setProperty("CONSOL_STALLS", String(stalls));
    if (stalls >= 4) {
      p.setProperty("CONSOL_STATUS", "ERROR");
      Logger.log("FIX 8.33: consolidación detenida por estancamiento (4 intentos sin avance).");
      return;
    }
    var yaProg = false;
    try {
      ScriptApp.getProjectTriggers().forEach(function(t){
        if (t.getHandlerFunction() === "_continuarConsolidacion") yaProg = true;
      });
    } catch(e){}
    if (!yaProg) { try { _programarContinuacionConsolidacion(); } catch(e){} }
  }
}

/* ── Wrappers del dashboard para estado / control de la consolidación ──────── */
function dash_estadoConsolidacion() {
  var st = _consolEstadoLeer();
  return {
    enCurso:    st.STATUS === "EN_CURSO",
    status:     st.STATUS || "IDLE",
    procesados: st.PROCESADOS || 0,
    total:      st.TOTAL || 0,
    modo:       st.MODO || "",
    incluir:    st.INCLUIR || ""
  };
}

function dash_continuarConsolidacion() {
  _requiereRol(["Coordinador", "Líder de Conteo"]);
  var st = _consolEstadoLeer();
  if (st.STATUS !== "EN_CURSO") {
    return { ok:false, mensaje:"No hay una consolidación pendiente para continuar." };
  }
  // Reprograma el trigger por si la cadena se detuvo; devuelve el progreso actual.
  _programarContinuacionConsolidacion();
  return {
    ok: true, enCurso: true, procesados: st.PROCESADOS, total: st.TOTAL,
    mensaje: "▶️ Continuación reprogramada (" + st.PROCESADOS + "/" + st.TOTAL +
             "). Terminará automáticamente en segundo plano."
  };
}

function dash_cancelarConsolidacion() {
  _requiereRol(["Coordinador", "Líder de Conteo"]);
  try {
    ScriptApp.getProjectTriggers().forEach(function(t){
      if (t.getHandlerFunction() === "_continuarConsolidacion") ScriptApp.deleteTrigger(t);
    });
  } catch(e){}
  var st = _consolEstadoLeer();
  _consolProps().setProperties({ CONSOL_STATUS:"CANCELADO", CONSOL_TS:String(Date.now()) }, false);
  return {
    ok: true,
    mensaje: "🛑 Consolidación cancelada. Se conservó lo ya consolidado (" +
             (st.PROCESADOS || 0) + "/" + (st.TOTAL || 0) + " archivos). " +
             "Vuelve a ejecutar 'Consolidar' para reprocesar el 100%."
  };
}


/* ==========================================================================
   17. INTEGRACIÓN procesarCreacionArchivoIntegral CON VALIDACIÓN CSV
   --------------------------------------------------------------------------
   Si datos.dataSource === "CSV" → validar antes de escribir.
   ========================================================================== */

function procesarCreacionArchivoConValidacion(datos) {
  _requiereRol(["Coordinador", "Líder de Conteo"]);
  // FASE 8.65 (R9): evitar archivos DUPLICADOS por nombre en la carpeta destino.
  if (!datos.ignorarNombreDup && datos.folderId && datos.fileName) {
    var dup = verificarNombreArchivo(datos.folderId, datos.fileName);
    if (dup.existe) {
      throw new Error("NOMBRE_DUPLICADO||Ya existe un archivo llamado \"" + datos.fileName +
        "\" en esa carpeta.\nSi continúas se creará OTRO con el mismo nombre (puede confundir al equipo).\n\n¿Crear de todas formas?");
    }
  }
  var resultadoFinal;
  if (datos.dataSource === "CSV") {
    // Si el frontend pidió omitir filtro cliente (tras confirmar), pasamos "" como cliente.
    var clienteParaFiltrar = datos.ignorarFiltroCliente ? "" : datos.clientName;
    var resVal = validarCSVAvanzado(datos.csvData, clienteParaFiltrar);
    datos.csvData = resVal.datosLimpios;   // pasa solo lo limpio al motor antiguo
    resultadoFinal = procesarCreacionArchivoIntegral(datos);
    resultadoFinal.validacionCSV = resVal.reporte;
    if (datos.ignorarFiltroCliente) {
      resultadoFinal.validacionCSV.filtroOmitido = true;
    }
  } else {
    resultadoFinal = procesarCreacionArchivoIntegral(datos);
  }
  _registrarActividad(_usuarioActual(), "crear_archivo", "",
    "Cliente: " + datos.clientName + " · Archivo: " + datos.fileName);

  // Enriquecer respuesta con datos para modal post-creación
  var fileId = _idDeUrl(resultadoFinal.fileUrl);
  resultadoFinal.fileId = fileId;
  resultadoFinal.fileName = datos.fileName;
  resultadoFinal.cliente = datos.clientName;
  resultadoFinal.wmsUrl = obtenerLinkDirectoWMS(fileId, datos.clientName);
  resultadoFinal.wmsConfigurado = !!_obtenerWmsUrl();
  // FIX FASE 7.3: Pasar al frontend los SKUs solicitados que no quedaron en CSV
  resultadoFinal.codigosNoEncontrados = datos.codigosNoEncontrados || [];

  // Si pidió crear evento → intentar crear evento en Calendar también
  try {
    if (datos.eventoAsignacion && datos.eventoAsignacion.modo === "crear" &&
        datos.eventoAsignacion.datosEvento && datos.crearCalendar !== false) {
      var de = datos.eventoAsignacion.datosEvento;
      var emailResp = "";
      // Si el responsable está en USUARIOS, buscar su email
      try {
        var sh = _getSS().getSheetByName(USR_CFG.HOJA);
        if (sh && sh.getLastRow() > 1) {
          var vu = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
          for (var i = 0; i < vu.length; i++) {
            if (String(vu[i][1]).toUpperCase().trim() === String(de.responsable).toUpperCase().trim()) {
              emailResp = vu[i][0]; break;
            }
          }
        }
      } catch (e) {}
      var calRes = crearEventoEnCalendar({
        titulo: de.titulo,
        cliente: de.cliente,
        responsable: de.responsable,
        fechaInicio: de.fechaInicio,
        emailResp: emailResp,
        fileUrl: resultadoFinal.fileUrl,
        wmsUrl: resultadoFinal.wmsUrl
      });
      resultadoFinal.calendar = calRes;
    }
  } catch (calErr) {
    resultadoFinal.calendarError = calErr.message;
  }

  return resultadoFinal;
}


/* ==========================================================================
   18. WRAPPERS PARA DASHBOARD (botones nuevos)
   ========================================================================== */

function dash_consolidarAuditoria(opciones) {
  // FIX FASE 8.16: acepta { modo: 'tolerante'|'estricto'|'reporte_solo' }
  // Si no se pasa nada, queda en tolerante (comportamiento histórico).
  // FIX FASE 8.31: forzar contexto WEB (timeout 5 min) — el frontend siempre
  // llama por aquí. Para procesamientos grandes desde editor, usar
  // consolidarTodoDesdeEditor() con timeout 25 min.
  opciones = opciones || {};
  opciones.contexto = "web";
  var res = consolidarConAuditoria(opciones);
  return res || { ok:false, mensaje:"Sin respuesta de consolidación." };
}
function dash_verAuditoria() {
  var ss = _getSS();
  var aud = ss.getSheetByName("AUDITORIA_CONSOLIDACION");
  if (!aud) {
    SpreadsheetApp.getUi().alert("No hay auditoría aún. Ejecuta primero 'Consolidar datos'.");
    return;
  }
  ss.setActiveSheet(aud);
  return "ok";
}


/* ==========================================================================
   FIN FASE 2
   ========================================================================== */


/* ==========================================================================
   ====   FASE 2 HOTFIX — Finalización mejorada · Libro · Protección      ====
   ========================================================================== */


/* ---------- 19. URL del libro (para botón "Abrir libro") ---------- */
function obtenerUrlLibro() {
  return _getSS().getUrl();
}


/* ---------- 20. Listar archivos de un cliente en Drive ---------- */
function listarArchivosDelCliente(cliente) {
  var resultado = [];
  var cliN = String(cliente || "").toUpperCase().trim();
  if (!cliN) return resultado;
  if (!CONFIG || !CONFIG.ROOT_FOLDER_IDS) return resultado;

  CONFIG.ROOT_FOLDER_IDS.forEach(function(rootId){
    try {
      var root = DriveApp.getFolderById(rootId);
      _buscarArchivosRecursivo(root, cliN, resultado, 3);
    } catch (e) {
      Logger.log("listarArchivosDelCliente falló en " + rootId + ": " + e.message);
    }
  });

  // Ordenar por fecha modificación descendente
  resultado.sort(function(a, b){ return b.modificado - a.modificado; });
  return resultado.slice(0, 50);
}

function _buscarArchivosRecursivo(folder, cliN, resultado, profundidad) {
  if (profundidad <= 0 || resultado.length >= 50) return;
  try {
    var files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
    while (files.hasNext() && resultado.length < 50) {
      var f = files.next();
      var n = f.getName().toUpperCase();
      if (n.indexOf(cliN) !== -1) {
        resultado.push({
          id: f.getId(),
          name: f.getName(),
          url: f.getUrl(),
          modificado: f.getLastUpdated().getTime(),
          carpeta: folder.getName()
        });
      }
    }
  } catch (e) {}
  if (resultado.length >= 50) return;
  try {
    var subs = folder.getFolders();
    while (subs.hasNext() && resultado.length < 50) {
      _buscarArchivosRecursivo(subs.next(), cliN, resultado, profundidad - 1);
    }
  } catch (e) {}
}


/* ---------- 21. Finalizar con fecha custom + archivo opcional ---------- */
function finalizarEventoConOpciones(filaCronograma, opciones) {
  _requiereRol(["Coordinador", "Líder de Conteo"]);
  if (!filaCronograma) throw new Error("Falta fila del cronograma.");
  var ss = _getSS();
  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  if (!cron) throw new Error("No se encontró " + CRON_CFG.HOJA_CRONOGRAMA);

  var f = filaCronograma;

  // Fecha culminación: la del usuario o hoy — FIX FASE 8.36: SOLO FECHA (sin hora).
  var fechaCulm;
  if (opciones && opciones.fechaCulminacion) {
    // Formato esperado: "YYYY-MM-DD"
    var parts = String(opciones.fechaCulminacion).split("-");
    if (parts.length === 3) {
      fechaCulm = new Date(parseInt(parts[0],10), parseInt(parts[1],10)-1, parseInt(parts[2],10));
    } else {
      fechaCulm = new Date(opciones.fechaCulminacion);
    }
  } else {
    fechaCulm = new Date();
  }
  fechaCulm = _soloFecha(fechaCulm);

  // FIX FASE 8.36: resolver el fileId del evento (opciones o Smart Chip Q) UNA vez,
  // para coordinar la fecha de inicio con la creación del archivo y el espejo a PANEL.
  var fidEvento = (opciones && opciones.fileId) ? String(opciones.fileId).trim() : "";
  if (!fidEvento) {
    var richQ0 = cron.getRange(f, CRON_CFG.CR_COL_ARCH).getRichTextValue();
    var valQ0  = cron.getRange(f, CRON_CFG.CR_COL_ARCH).getValue();
    fidEvento = _idDeUrl(_extraerUrlSmartChip(richQ0, valQ0) || "");
  }

  cron.getRange(f, CRON_CFG.CR_COL_ESTADO).setValue("Entregado");
  cron.getRange(f, CRON_CFG.CR_COL_FECHA_ENT).setValue(fechaCulm).setNumberFormat("dd/MM/yyyy");
  cron.getRange(f, CRON_CFG.CR_COL_PCT).setValue(1);

  // FASE 8.63 (R2): cerrar (fin) los apoyos que quedaron hasta el final del
  // evento — quedan como FINALIZADO con inicio+fin para trazabilidad.
  try { _cerrarApoyosDeEvento(f, "FINALIZADO"); } catch (eCA) {}

  // FIX FASE 8.36: fecha de inicio (col L) coordinada y SOLO FECHA.
  //  • Si falta: usar la fecha de creación del archivo asociado; si no hay archivo, la entrega.
  //  • Si existe: normalizar a solo-fecha y garantizar inicio ≤ entrega.
  var celIni = cron.getRange(f, CRON_CFG.CR_COL_FECHA);
  var fIniAct = celIni.getValue();
  var fIniNueva;
  if (!(fIniAct instanceof Date)) {
    fIniNueva = _fechaCreacionArchivo(fidEvento) || fechaCulm;
  } else {
    fIniNueva = _soloFecha(fIniAct);
    if (fIniNueva.getTime() > fechaCulm.getTime()) fIniNueva = fechaCulm;
  }
  celIni.setValue(fIniNueva).setNumberFormat("dd/MM/yyyy");

  // Adjuntar archivo (Smart Chip en Q) — solo si Q estaba vacío
  var archivoAdjuntado = false;
  if (opciones && opciones.fileId && opciones.fileUrl) {
    var rich = cron.getRange(f, CRON_CFG.CR_COL_ARCH).getRichTextValue();
    var val  = cron.getRange(f, CRON_CFG.CR_COL_ARCH).getValue();
    if (!_extraerUrlSmartChip(rich, val)) {
      var newRich = SpreadsheetApp.newRichTextValue()
        .setText(opciones.fileName || "Archivo del inventario")
        .setLinkUrl(opciones.fileUrl).build();
      cron.getRange(f, CRON_CFG.CR_COL_ARCH).setRichTextValue(newRich);
      archivoAdjuntado = true;
    }
  }

  // FIX FASE 8.36: espejo a PANEL DE CONTROL (sincronización inversa cronograma→panel).
  // Solo se actualiza si hay un match SEGURO por fileId (evita tocar la fila equivocada).
  // Alinea fecha fin (col E) = fecha de entrega y marca avance = "Entregado".
  var panelSincronizado = false;
  try {
    var fidPanel = fidEvento;   // FIX FASE 8.36: ya resuelto arriba
    if (fidPanel) {
      var pan = ss.getSheetByName(CRON_CFG.HOJA_PANEL);
      if (pan && pan.getLastRow() >= 2) {
        var pd = pan.getRange(2, 1, pan.getLastRow() - 1, 7).getValues();
        for (var pi = 0; pi < pd.length; pi++) {
          var idP = _idDeUrl(String(pd[pi][CRON_CFG.PA_COL_ID - 1] || "")) ||
                    _idDeUrl(String(pd[pi][CRON_CFG.PA_COL_LINK - 1] || ""));
          if (idP && idP === fidPanel) {
            var filaP = pi + 2;
            pan.getRange(filaP, CRON_CFG.PA_COL_FECHA_F).setValue(fechaCulm).setNumberFormat("dd/MM/yyyy");
            if (String(pd[pi][CRON_CFG.PA_COL_AVANCE - 1] || "").toLowerCase().indexOf("entregado") === -1) {
              pan.getRange(filaP, CRON_CFG.PA_COL_AVANCE).setValue("Entregado");
            }
            panelSincronizado = true;
            break;
          }
        }
      }
    }
  } catch (eSync) { Logger.log("FIX 8.36 espejo PANEL: " + eSync.message); }

  _registrarActividad(_usuarioActual(), "finalizar", f,
    "Cliente: " + cron.getRange(f, CRON_CFG.CR_COL_CLIENTE).getValue());
  return { ok: true, fila: f, archivoAdjuntado: archivoAdjuntado, panelSincronizado: panelSincronizado };
}


/* ---------- 22. Protección formal de hojas críticas ---------- */
function _protegerHojasCriticas() {
  var ss = _getSS();
  var hojas = ["INVENTARIOS", "REGISTRO"];
  var resultado = [];
  hojas.forEach(function(nombre){
    var sh = ss.getSheetByName(nombre);
    if (!sh) { resultado.push("⚠️ " + nombre + " no existe"); return; }
    var ya = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    if (ya && ya.length > 0) {
      resultado.push("✓ " + nombre + " ya estaba protegida");
      return;
    }
    try {
      var p = sh.protect()
        .setDescription("Protegida por sistema · solo el script puede modificar");
      // Warning only = los usuarios ven advertencia pero pueden continuar.
      // Cambia a setUnprotectedRanges([]) y restricción dura si quieres bloqueo total.
      p.setWarningOnly(true);
      resultado.push("✓ " + nombre + " protegida (modo aviso)");
    } catch (e) {
      resultado.push("❌ " + nombre + ": " + e.message);
    }
  });
  return resultado;
}


/* ---------- 23. Modificar setupOptimizaciones para incluir protección ---------- */
// (No reemplaza la función original — añade una variante extendida)
function setupCompletoConProteccion() {
  var logSetup = setupOptimizaciones();
  var protRes = _protegerHojasCriticas();
  _alert("Setup + Protección:\n\n" + protRes.join("\n"));
  return { setup: logSetup, proteccion: protRes };
}


/* ==========================================================================
   ===========   FASE 3 — WEB APP · ROLES · USUARIOS · ANALYTICS  ===========
   ==========================================================================
   Arquitectura: A1 (Web App reemplaza) · B1 (cuenta Google) · C1 (corre como
   dueño). La base de datos permanece en Google Sheets. Acceso protegido:
   solo emails registrados en la hoja USUARIOS pueden entrar, y cada acción
   valida el rol en backend.
   ========================================================================== */

var USR_CFG = {
  HOJA: "USUARIOS",
  HOJA_LOG: "LOG_ACTIVIDAD",
  ROLES: ["Admin", "Coordinador", "Líder de Conteo", "Auditor"]
};


/* ---------- doGet: punto de entrada de la Web App UNIFICADA ----------
   Routing:
   - ?vista=wms  o  ?fileId=...     → BlindInventory (Terminal WMS)
   - sin params  o  ?vista=panel    → WebApp (Panel de Control)
   ----------------------------------------------------------------------- */
function doGet(e) {
  // === RUTA WMS ===
  if (e && e.parameter && (e.parameter.vista === "wms" || e.parameter.fileId)) {
    var tplWms = HtmlService.createTemplateFromFile("BlindInventory");
    tplWms.paramFileId  = e.parameter.fileId  || "";
    tplWms.paramCliente = e.parameter.cliente || "";
    // FIX FASE 8.24: aceptar 'rol' como sinónimo de 'modo' (mapeo)
    // operario → op | auditor → auditor | coordinador → admin | líder → admin
    var modoRaw = String(e.parameter.modo || e.parameter.rol || "").toLowerCase().trim();
    var modoFinal = "";
    if (modoRaw === "op" || modoRaw === "operario") modoFinal = "op";
    else if (modoRaw === "auditor" || modoRaw === "audit") modoFinal = "auditor";
    else if (modoRaw === "admin" || modoRaw === "coordinador" || modoRaw === "lider" ||
             modoRaw === "líder" || modoRaw.indexOf("líder") === 0 || modoRaw.indexOf("lider") === 0) modoFinal = "admin";
    tplWms.paramModo = modoFinal;
    return tplWms.evaluate()
      .setTitle("ITSANET IMS — CONTROL DE INVENTARIO")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag("viewport", "width=device-width, initial-scale=1");
  }

  // === RUTA WIZARD (servido como iframe modal dentro del Panel) ===
  // El wizard se invoca desde abrirWizard() en WebApp_JS, que lo embebe
  // como iframe dentro de un modal fullscreen del Panel. Por eso ya no
  // se abre en pestaña nueva (eso causaba pantalla blanca por sandbox).
  if (e && e.parameter && e.parameter.vista === "wizard") {
    var emailW = _usuarioActual();
    var uW = emailW ? _obtenerUsuario(emailW) : null;

    // FASE 8.66 FIX CRÍTICO: validar por PERMISO crearInventario (cubre Admin,
    // Coordinador y Líder de Conteo) — antes el check hardcodeaba solo
    // coordinador/líder y DEJABA FUERA a Admin → los Admin no podían crear
    // archivos. Además, las pantallas de denegado ahora llevan ALLOWALL para
    // que se muestren dentro del iframe (si no, el navegador dice "rechazó la
    // conexión" en vez de mostrar el mensaje).
    if (!uW || !uW.activo) {
      var denW = HtmlService.createTemplateFromFile("AccesoDenegado");
      denW.email = emailW || "(sin sesión)";
      denW.diagnostico = "No autorizado para crear inventarios";
      denW.recomendacion = "Solo Admin, Coordinadores y Líderes de Conteo pueden crear inventarios.";
      return denW.evaluate()
        .setTitle("Acceso Denegado · Itsanet")
        .addMetaTag("viewport", "width=device-width, initial-scale=1")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    var permW = _permisosDeRol(uW.rol);
    if (!permW.crearInventario) {
      var denW2 = HtmlService.createTemplateFromFile("AccesoDenegado");
      denW2.email = emailW + " · " + uW.rol;
      denW2.diagnostico = "Tu rol no permite crear inventarios";
      denW2.recomendacion = "Solo <b>Admin</b>, <b>Coordinadores</b> y <b>Líderes de Conteo</b> pueden crear inventarios. Solicita el cambio a un administrador.";
      return denW2.evaluate()
        .setTitle("Sin permisos · Itsanet")
        .addMetaTag("viewport", "width=device-width, initial-scale=1")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    return HtmlService.createHtmlOutputFromFile("AsistenteCreacionV2")
      .setTitle("Crear Inventario · Itsanet UIO")
      .addMetaTag("viewport", "width=device-width, initial-scale=1")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // === RUTA PANEL DE CONTROL ===
  var email = _usuarioActual();
  var usuario = email ? _obtenerUsuario(email) : null;

  // FIX FASE 7.5: ?debug=1 → diagnóstico web sin requerir sesión
  if (e && e.parameter && e.parameter.debug === "1") {
    return _renderDiagnostico(email, usuario);
  }

  if (!usuario || !usuario.activo) {
    // FIX FASE 7.5: pantalla de Acceso Denegado MEJORADA con diagnóstico inline.
    // Detecta el escenario y muestra el mensaje correcto.
    var diagnostico = _diagnosticarFalloAcceso(email, usuario);
    var den = HtmlService.createTemplateFromFile("AccesoDenegado");
    den.email = email || "(sin sesión)";
    den.diagnostico = diagnostico.titulo;
    den.recomendacion = diagnostico.recomendacion;
    return den.evaluate()
      .setTitle("Acceso Denegado · Itsanet")
      .addMetaTag("viewport", "width=device-width, initial-scale=1");
  }

  _registrarActividad(email, "login", "", "Ingreso a la Web App");

  // FIX FASE 7.2: Inyectar permisos del rol en el usuario antes de serializar.
  usuario.permisos = _permisosDeRol(usuario.rol);

  // FIX FASE 8.3: pasar la URL CANÓNICA del Web App al frontend.
  // Necesaria para construir links a ?vista=wizard sin caer en el dominio sandbox.
  var webAppUrlPanel = "";
  try { webAppUrlPanel = ScriptApp.getService().getUrl(); } catch (e) {}

  var t = HtmlService.createTemplateFromFile("WebApp");
  t.usuarioJSON = JSON.stringify(usuario);
  t.webAppUrl = webAppUrlPanel;
  return t.evaluate()
    .setTitle("Centro de Mando · Itsanet UIO")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------- Diagnóstico del fallo de acceso ---------- */
function _diagnosticarFalloAcceso(email, usuario) {
  // Caso 1: el script no detectó email (deployment como "Yo" + acceso "Cualquiera")
  if (!email) {
    return {
      titulo: "El sistema no pudo identificar tu cuenta",
      recomendacion:
        "El despliegue actual no entrega tu identidad al script. " +
        "Pide al administrador que vaya a <b>Implementar → Gestionar implementaciones → ✏ Editar</b> " +
        "y cambie <b>'Ejecutar como'</b> a <b>'Usuario que accede a la aplicación web'</b>, " +
        "y <b>'Quién tiene acceso'</b> a <b>'Cualquier persona dentro de itsanet.com'</b>. " +
        "Luego implementar nueva versión."
    };
  }
  // Caso 2: detectó email pero el usuario no existe en hoja USUARIOS
  if (!usuario) {
    return {
      titulo: "Tu cuenta " + email + " no está en la hoja USUARIOS",
      recomendacion:
        "Pide a un <b>Coordinador</b> que abra el libro maestro, " +
        "vaya a la hoja <b>USUARIOS</b> y agregue una fila con tu email, " +
        "nombre, rol y <b>Activo = TRUE</b>."
    };
  }
  // Caso 3: existe pero está inactivo
  return {
    titulo: "Tu cuenta " + email + " está inactiva",
    recomendacion:
      "Tu usuario existe en el sistema pero está marcado como <b>Inactivo</b>. " +
      "Pide a un Coordinador que cambie tu columna <b>Activo</b> a <b>TRUE</b> en la hoja USUARIOS."
  };
}

/* ---------- Diagnóstico WEB (sin login) accesible vía ?debug=1 ---------- */
function _renderDiagnostico(email, usuario) {
  var rows = [];
  var add = function(label, val, cls) {
    rows.push('<tr><td style="padding:6px 10px;border-bottom:1px solid #283352;color:#94a3b8;">' + label +
      '</td><td style="padding:6px 10px;border-bottom:1px solid #283352;color:' + (cls || '#e8ecf3') +
      ';font-family:ui-monospace,monospace;font-size:11px;">' + val + '</td></tr>');
  };

  add("URL solicitada", "?debug=1");

  var getA = "(error)";
  try { getA = Session.getActiveUser().getEmail() || "(VACÍO ← problema)"; }
  catch (e) { getA = "ERROR: " + e.message; }
  add("Session.getActiveUser()", getA, getA.indexOf("VACÍO") !== -1 || getA.indexOf("ERROR") !== -1 ? "#ef4444" : "#22c55e");

  var getE = "(error)";
  try { getE = Session.getEffectiveUser().getEmail() || "(VACÍO)"; }
  catch (e) { getE = "ERROR: " + e.message; }
  add("Session.getEffectiveUser()", getE);

  add("_usuarioActual()", email || "(VACÍO)", !email ? "#ef4444" : "#22c55e");
  add("Usuario en hoja USUARIOS", usuario ? (usuario.email + " · " + usuario.rol + " · activo=" + usuario.activo) : "(no encontrado)",
       usuario ? "#22c55e" : "#fbbf24");

  try {
    var ss = _getSS();
    add("Libro abierto", ss.getName());
    var sh = ss.getSheetByName(USR_CFG.HOJA);
    add("Hoja USUARIOS existe", sh ? "Sí (" + (sh.getLastRow() - 1) + " usuarios)" : "NO", sh ? "#22c55e" : "#ef4444");
  } catch (e) { add("Libro", "ERROR: " + e.message, "#ef4444"); }

  var dx = _diagnosticarFalloAcceso(email, usuario);
  var diagBlock = (!usuario || !usuario.activo) ?
    '<div style="margin-top:20px;background:#7f1d1d;color:#fecaca;padding:14px;border-radius:8px;border-left:4px solid #ef4444;">' +
    '<div style="font-weight:600;font-size:14px;margin-bottom:6px;">⚠ ' + dx.titulo + '</div>' +
    '<div style="font-size:12px;line-height:1.5;">' + dx.recomendacion + '</div></div>' :
    '<div style="margin-top:20px;background:#064e3b;color:#bbf7d0;padding:14px;border-radius:8px;border-left:4px solid #22c55e;">' +
    '<div style="font-weight:600;font-size:14px;">✓ Acceso autorizado</div>' +
    '<div style="font-size:12px;margin-top:4px;">El sistema te identifica correctamente.</div></div>';

  var html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Diagnóstico Web</title>' +
    '<style>body{margin:0;background:#0b1220;color:#e8ecf3;font-family:system-ui,sans-serif;padding:24px;}' +
    'table{width:100%;border-collapse:collapse;background:#131c2e;border-radius:8px;overflow:hidden;}' +
    'h1{margin:0 0 18px;font-size:18px;color:#3b82f6;}</style></head>' +
    '<body><h1>🔍 Diagnóstico Web · Centro de Mando</h1>' +
    '<table>' + rows.join("") + '</table>' + diagBlock +
    '<p style="margin-top:24px;color:#64748b;font-size:11px;">Itsanet UIO · Para soporte, comparte esta página con quien administra el sistema.</p>' +
    '</body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle("Diagnóstico · Itsanet")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


/* ---------- Identidad ---------- */
function _usuarioActual() {
  try {
    var email = Session.getActiveUser().getEmail();
    if (email) return email;
  } catch (e) {}
  try {
    return Session.getEffectiveUser().getEmail();
  } catch (e) {}
  return "";
}


/* ---------- Setup hoja USUARIOS ---------- */
function setupUsuarios() {
  var ss = _getSS();
  var sh = ss.getSheetByName(USR_CFG.HOJA);
  if (sh) { _alert("La hoja USUARIOS ya existe."); return; }

  sh = ss.insertSheet(USR_CFG.HOJA);
  sh.getRange(1, 1, 1, 7).setValues([[
    "Email", "Nombre", "Rol", "Teléfono", "Activo", "Fecha Ingreso", "Notas"
  ]]);
  sh.getRange(1, 1, 1, 7).setFontWeight("bold")
    .setBackground("#1a73e8").setFontColor("#ffffff");
  sh.setColumnWidths(1, 7, 160);

  // Sembrar desde EQUIPO_OPERATIVO si existe
  var eq = ss.getSheetByName(CRON_CFG.HOJA_EQUIPO);
  var seeds = [];
  if (eq && eq.getLastRow() > 1) {
    var v = eq.getRange(2, 1, eq.getLastRow() - 1, 5).getValues();
    v.forEach(function(r){
      var nombre = String(r[0] || "").trim();
      var email  = String(r[1] || "").trim();
      var rolEq  = String(r[2] || "").trim();
      var rol = rolEq.toLowerCase().indexOf("coordinador") !== -1 ? "Coordinador" : "Líder de Conteo";
      if (email) {
        seeds.push([email, nombre, rol, "", true, new Date(), "Importado de EQUIPO_OPERATIVO"]);
      }
    });
  }
  // Asegurar que el dueño esté como Coordinador
  var owner = _usuarioActual();
  if (owner && !seeds.some(function(s){ return s[0].toLowerCase() === owner.toLowerCase(); })) {
    seeds.unshift([owner, "Coordinador Principal", "Coordinador", "", true, new Date(), "Dueño del sistema"]);
  }

  if (seeds.length > 0) {
    sh.getRange(2, 1, seeds.length, 7).setValues(seeds);
  }
  // Validación de datos en columna Rol
  var ruleRol = SpreadsheetApp.newDataValidation()
    .requireValueInList(USR_CFG.ROLES, true).build();
  sh.getRange(2, 3, 500, 1).setDataValidation(ruleRol);

  _alert("✓ Hoja USUARIOS creada con " + seeds.length + " usuarios.\n\n" +
         "Roles disponibles: " + USR_CFG.ROLES.join(", "));
}


/* ---------- Leer un usuario ---------- */
function _obtenerUsuario(email) {
  if (!email) return null;
  var ss = _getSS();
  var sh = ss.getSheetByName(USR_CFG.HOJA);
  if (!sh || sh.getLastRow() < 2) return null;
  var emailN = String(email).trim().toLowerCase();
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0]).trim().toLowerCase() === emailN) {
      return {
        email: v[i][0],
        nombre: v[i][1],
        rol: v[i][2],
        telefono: v[i][3],
        activo: (v[i][4] === true || String(v[i][4]).toUpperCase() === "TRUE" || v[i][4] === ""),
        fechaIngreso: (v[i][5] instanceof Date) ? v[i][5].getTime() : null,
        notas: v[i][6],
        fila: i + 2
      };
    }
  }
  return null;
}


/* ---------- Validación de rol ---------- */
function _requiereRol(rolesPermitidos) {
  var ss = _getSS();
  var sh = ss.getSheetByName(USR_CFG.HOJA);
  // Modo legacy: sin hoja USUARIOS, permitir todo (retrocompatible con modales)
  if (!sh) return { email: "legacy", rol: "Coordinador", nombre: "Sistema (legacy)" };

  var email = _usuarioActual();
  var u = _obtenerUsuario(email);
  if (!u || !u.activo) {
    throw new Error("Acceso denegado: " + (email || "usuario") + " no está registrado o está inactivo.");
  }
  // FIX FASE 7.2: comparación normalizada (trim + lowercase)
  var rolN = String(u.rol || "").trim().toLowerCase();
  // FASE 8.62 (R4): Admin es súper-usuario — pasa CUALQUIER control de rol.
  if (rolN === "admin") return u;
  var permitidosN = rolesPermitidos.map(function(r){ return String(r).trim().toLowerCase(); });
  if (permitidosN.indexOf(rolN) === -1) {
    throw new Error("Tu rol (" + u.rol + ") no tiene permiso para esta acción.");
  }
  return u;
}


/* ---------- Contexto para el frontend ---------- */
function obtenerContextoUsuario() {
  var email = _usuarioActual();
  var u = _obtenerUsuario(email);
  if (!u) {
    // legacy o no registrado
    return { email: email, nombre: "Invitado", rol: "Coordinador", legacy: true,
             permisos: _permisosDeRol("Coordinador") };
  }
  u.permisos = _permisosDeRol(u.rol);
  u.foto = _obtenerFotoUsuario(email);   // FASE 8.65 (R7)
  return u;
}

/* ---------- URL del libro maestro (para el botón "Abrir libro") ---------- */
function obtenerUrlLibroMaestro() {
  try { return _getSS().getUrl(); } catch (e) { return ""; }
}

/* ---------- FIX FASE 8.37: diagnóstico — ejecútalo en el editor y mira el REGISTRO.
   Imprime con Logger.log (el valor de retorno NO sale solo en el log). ---------- */
function diagnosticoWMS() {
  var L = [];
  L.push("===== DIAGNÓSTICO ITSANET / WMS =====");
  try { L.push("Correo ACTIVO (usuario): " + (Session.getActiveUser().getEmail() || "(vacío)")); }
  catch (e) { L.push("Correo ACTIVO: ERROR " + e.message); }
  try { L.push("Correo EFECTIVO (dueño): " + (Session.getEffectiveUser().getEmail() || "(vacío)")); } catch (e) {}
  try { L.push("Libro maestro: " + obtenerUrlLibroMaestro()); } catch (e) { L.push("Libro maestro: ERROR " + e.message); }
  try { L.push("WMS URL (_obtenerWmsUrl): " + _obtenerWmsUrl()); } catch (e) { L.push("WMS URL: ERROR (¿función no existe?) " + e.message); }
  try { L.push("URL de ESTA app (ScriptApp): " + ScriptApp.getService().getUrl()); } catch (e) { L.push("ScriptApp URL: " + e.message); }
  try { L.push("Sesión WMS actual: " + JSON.stringify(obtenerSesionWMSActual())); }
  catch (e) { L.push("obtenerSesionWMSActual: NO EXISTE/ERROR → falta desplegar el código nuevo. " + e.message); }
  var p = PropertiesService.getScriptProperties();
  L.push("ITSANET_API_BASE: " + (p.getProperty("ITSANET_API_BASE") || "(no configurado)"));
  L.push("ITSANET_API_KEY:  " + (p.getProperty("ITSANET_API_KEY") ? "(configurada)" : "(no)"));
  L.push("ITSANET_TOKEN_URL:" + (p.getProperty("ITSANET_TOKEN_URL") || "(no)"));
  var msg = L.join("\n");
  Logger.log(msg);   // ← esto SÍ aparece en el Registro de ejecución
  return msg;
}

function _permisosDeRol(rol) {
  // FIX FASE 7.2: Sanitizar rol para no caer en default por espacios o mayúsculas.
  var rolN = String(rol || "").trim().toLowerCase();

  // FASE 8.63 (R6): flag nuevo `baseDatos` = acceso al MÓDULO Base de datos
  // (Consolidar, Cronograma de códigos, Credenciales API, Garantizar accesos).
  // Se separa de gestionUsuarios (pestaña Usuarios) para poder darlos aparte.

  // FASE 8.65: flags nuevos:
  //  · verArchivoHijo → ver/abrir el archivo hijo (Drive controla lectura/edición)
  //  · crearUsuarios  → puede dar de alta usuarios (rango < al propio)
  //  · editarUsuarios → puede editar/desactivar usuarios existentes (solo Admin)

  // Admin — dueño de todos los poderes.
  if (rolN === "admin") {
    return { verDashboard:true, crearInventario:true, iniciarFin:true,
             consolidar:true, limpiar:true, recordatorios:true, exportar:true,
             abrirLibro:true, gestionUsuarios:true, verAnalytics:true,
             baseDatos:true, verArchivoHijo:true, crearUsuarios:true,
             editarUsuarios:true, admin:true };
  }

  // Coordinador — Operación COMPLETA + Reportes/notif COMPLETO. Base de datos NO.
  // Puede CREAR usuarios (rango inferior) pero NO editar existentes.
  if (rolN === "coordinador") {
    return { verDashboard:true, crearInventario:true, iniciarFin:true,
             consolidar:false, limpiar:false, recordatorios:true, exportar:true,
             abrirLibro:true, gestionUsuarios:true, verAnalytics:true,
             baseDatos:false, verArchivoHijo:true, crearUsuarios:true,
             editarUsuarios:false };
  }

  // Líder de Conteo — crear archivo/evento, WMS, métricas. Base de datos y
  // Reportes NO. Gestiona SUS eventos (apoyos/pausa/borrar) por ser responsable.
  // Puede CREAR usuarios (solo Operario/Auditor) pero NO editar.
  if (rolN === "líder de conteo" || rolN === "lider de conteo") {
    return { verDashboard:true, crearInventario:true, iniciarFin:true,
             consolidar:false, limpiar:false, recordatorios:false, exportar:false,
             abrirLibro:false, gestionUsuarios:true, verAnalytics:true,
             baseDatos:false, verArchivoHijo:true, crearUsuarios:true,
             editarUsuarios:false };
  }

  // Auditor — Abrir Terminal WMS + filtros del dashboard + LECTURA del archivo hijo.
  if (rolN === "auditor") {
    return { verDashboard:true, crearInventario:false, iniciarFin:false,
             consolidar:false, limpiar:false, recordatorios:false, exportar:false,
             abrirLibro:false, gestionUsuarios:false, verAnalytics:false,
             baseDatos:false, verArchivoHijo:true, crearUsuarios:false,
             editarUsuarios:false };
  }

  // Operario — ejecuta trabajos y tiene el MISMO acceso a archivos hijos que un
  // Coordinador (editor). Sin módulos de gestión.
  if (rolN === "operario") {
    return { verDashboard:true, crearInventario:false, iniciarFin:true,
             consolidar:false, limpiar:false, recordatorios:false, exportar:false,
             abrirLibro:false, gestionUsuarios:false, verAnalytics:false,
             baseDatos:false, verArchivoHijo:true, crearUsuarios:false,
             editarUsuarios:false };
  }
  // Por defecto, mínimo acceso de vista
  return { verDashboard:true, baseDatos:false, verArchivoHijo:true };
}

/* FASE 8.65 (R4): jerarquía de roles. Un usuario solo puede CREAR cuentas con
   nivel ESTRICTAMENTE inferior al suyo. */
function _nivelRol(rol) {
  var r = String(rol || "").trim().toLowerCase();
  if (r === "admin") return 4;
  if (r === "coordinador") return 3;
  if (r === "líder de conteo" || r === "lider de conteo") return 2;
  if (r === "operario") return 1;
  if (r === "auditor") return 1;
  return 0;
}
/* Roles que el usuario ACTUAL puede asignar al crear (nivel < el suyo). */
function rolesAsignables() {
  var u = _obtenerUsuario(_usuarioActual());
  var miNivel = u ? _nivelRol(u.rol) : 0;
  if (u && String(u.rol).toLowerCase() === "admin") miNivel = 99; // Admin asigna cualquiera
  return USR_CFG.ROLES.filter(function(r){ return _nivelRol(r) < miNivel; });
}


/* ---------- CRUD Usuarios (solo Coordinador) ---------- */
function listarUsuarios() {
  _requiereRol(["Admin", "Coordinador", "Líder de Conteo"]);  // FASE 8.65 (R4)
  var ss = _getSS();
  var sh = ss.getSheetByName(USR_CFG.HOJA);
  if (!sh || sh.getLastRow() < 2) return [];
  // FIX FASE 8.37: incluye Rol WMS (col 8) y Contraseña (col 9) — listado ÚNICO Panel+WMS
  var nc = Math.max(7, sh.getLastColumn());
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, nc).getValues();
  return v.map(function(r, i){
    return {
      email: r[0], nombre: r[1], rol: r[2], telefono: r[3],
      activo: (r[4] === true || String(r[4]).toUpperCase() === "TRUE" || r[4] === ""),
      fechaIngreso: (r[5] instanceof Date) ? r[5].getTime() : null,
      notas: r[6],
      rolWms: nc >= 8 ? String(r[7] || "").trim().toUpperCase() : "",
      pass:   nc >= 9 ? String(r[8] || "").trim() : "",
      fila: i + 2
    };
  }).filter(function(u){ return u.email; });
}

function crearUsuario(datos) {
  // FASE 8.65 (R4): Admin, Coordinador y Líder pueden CREAR; el rol asignado
  // debe ser de nivel inferior al del creador.
  var creador = _requiereRol(["Admin", "Coordinador", "Líder de Conteo"]);
  if (!datos.email || !datos.nombre || !datos.rol) {
    throw new Error("Email, Nombre y Rol son obligatorios.");
  }
  if (USR_CFG.ROLES.indexOf(datos.rol) === -1) {
    throw new Error("Rol inválido. Debe ser: " + USR_CFG.ROLES.join(", "));
  }
  var nivelCreador = String(creador.rol).toLowerCase() === "admin" ? 99 : _nivelRol(creador.rol);
  if (_nivelRol(datos.rol) >= nivelCreador) {
    throw new Error("Solo puedes crear usuarios con un rango INFERIOR al tuyo (" + creador.rol + ").");
  }
  if (_obtenerUsuario(datos.email)) {
    throw new Error("Ya existe un usuario con ese email.");
  }
  // FASE 8.63 (R3): bloquear NOMBRE duplicado (aunque esté en otro orden) para
  // evitar "ALMACHI DANILO" vs "DANILO ALMACHI" como dos personas distintas.
  try {
    var _claveNueva = _claveNombre(datos.nombre);
    var _dupNom = false;
    var _shDup = _getSS().getSheetByName(USR_CFG.HOJA);
    if (_shDup && _shDup.getLastRow() > 1) {
      var _vDup = _shDup.getRange(2, 2, _shDup.getLastRow() - 1, 1).getValues();
      for (var _iD = 0; _iD < _vDup.length; _iD++) {
        if (_claveNombre(_vDup[_iD][0]) === _claveNueva) { _dupNom = true; break; }
      }
    }
    if (_dupNom) throw new Error("Ya existe un usuario con ese nombre (aunque el orden difiera). Usa un nombre distinto o edita el existente.");
  } catch (eDup) { if (String(eDup.message).indexOf("Ya existe un usuario con ese nombre") !== -1) throw eDup; }
  var ss = _getSS();
  var sh = ss.getSheetByName(USR_CFG.HOJA);
  // FIX FASE 8.37: garantizar encabezados de Rol WMS (H) y Contraseña (I)
  if (sh.getLastColumn() < 9) {
    if (!String(sh.getRange(1,8).getValue()).trim()) sh.getRange(1,8).setValue("Rol WMS");
    if (!String(sh.getRange(1,9).getValue()).trim()) sh.getRange(1,9).setValue("Contraseña");
  }
  // Rol WMS y Contraseña: si no se especifican, se derivan del rol del panel.
  var rolWms = String(datos.rolWms || "").trim().toUpperCase();
  if (!rolWms) rolWms = (datos.rol === "Admin" || datos.rol === "Coordinador" || datos.rol === "Líder de Conteo") ? "ADMIN" : "AUDITOR";
  var pass = String(datos.pass || "").trim() || "1234";
  sh.appendRow([
    datos.email.trim(), datos.nombre.trim(), datos.rol,
    datos.telefono || "", true, new Date(), datos.notas || "",
    rolWms, pass
  ]);
  _registrarActividad(_usuarioActual(), "crear_usuario", "", "Creó: " + datos.email);
  return { ok: true };
}

function actualizarUsuario(fila, datos) {
  _requiereRol(["Admin"]);   // FASE 8.65 (R4): editar usuarios = SOLO Admin
  var ss = _getSS();
  var sh = ss.getSheetByName(USR_CFG.HOJA);
  if (datos.nombre  !== undefined) sh.getRange(fila, 2).setValue(datos.nombre);
  if (datos.rol     !== undefined) {
    if (USR_CFG.ROLES.indexOf(datos.rol) === -1) throw new Error("Rol inválido.");
    sh.getRange(fila, 3).setValue(datos.rol);
  }
  if (datos.telefono !== undefined) sh.getRange(fila, 4).setValue(datos.telefono);
  if (datos.activo   !== undefined) sh.getRange(fila, 5).setValue(!!datos.activo);
  if (datos.notas    !== undefined) sh.getRange(fila, 7).setValue(datos.notas);
  // FIX FASE 8.37: Rol WMS (col 8) y Contraseña (col 9) — listado único Panel+WMS
  if (datos.rolWms !== undefined && String(datos.rolWms).trim() !== "")
    sh.getRange(fila, 8).setValue(String(datos.rolWms).trim().toUpperCase());
  if (datos.pass !== undefined && String(datos.pass).trim() !== "")
    sh.getRange(fila, 9).setValue(String(datos.pass).trim());
  _registrarActividad(_usuarioActual(), "editar_usuario", "", "Editó fila " + fila);
  return { ok: true };
}

function desactivarUsuario(fila) {
  _requiereRol(["Admin"]);   // FASE 8.65 (R4): desactivar = SOLO Admin
  var ss = _getSS();
  var sh = ss.getSheetByName(USR_CFG.HOJA);
  sh.getRange(fila, 5).setValue(false);
  _registrarActividad(_usuarioActual(), "desactivar_usuario", "", "Desactivó fila " + fila);
  return { ok: true };
}


/* ---------- Perfil propio (cualquier usuario edita SUS datos) ---------- */
function obtenerMiPerfil() {
  var email = _usuarioActual();
  var u = _obtenerUsuario(email);
  if (!u) throw new Error("Tu usuario no está registrado.");
  u.permisos = _permisosDeRol(u.rol);
  u.analytics = obtenerAnalyticsUsuario(email);
  return u;
}

function actualizarMiPerfil(datos) {
  var email = _usuarioActual();
  var u = _obtenerUsuario(email);
  if (!u) throw new Error("Tu usuario no está registrado.");
  var ss = _getSS();
  var sh = ss.getSheetByName(USR_CFG.HOJA);
  // El usuario solo puede cambiar nombre y teléfono (NO su rol)
  if (datos.nombre   !== undefined) sh.getRange(u.fila, 2).setValue(datos.nombre);
  if (datos.telefono !== undefined) sh.getRange(u.fila, 4).setValue(datos.telefono);
  _registrarActividad(email, "editar_perfil", "", "Actualizó su perfil");
  return { ok: true };
}

/* FASE 8.65 (R7): cambiar la propia CONTRASEÑA (col I — la misma del WMS). */
function cambiarMiPassword(passActual, passNueva) {
  var email = _usuarioActual();
  var u = _obtenerUsuario(email);
  if (!u) throw new Error("Tu usuario no está registrado.");
  var sh = _getSS().getSheetByName(USR_CFG.HOJA);
  if (!sh || sh.getLastColumn() < 9) {
    if (sh.getLastColumn() < 9) { sh.getRange(1,8).setValue("Rol WMS"); sh.getRange(1,9).setValue("Contraseña"); }
  }
  var actualGuardada = String(sh.getRange(u.fila, 9).getValue() || "").trim();
  var nueva = String(passNueva || "").trim();
  if (nueva.length < 4) throw new Error("La nueva contraseña debe tener al menos 4 caracteres.");
  // Si ya había contraseña, validar la actual (los que tienen "1234" por defecto igual la validan)
  if (actualGuardada && actualGuardada !== String(passActual || "").trim()) {
    throw new Error("La contraseña actual no coincide.");
  }
  sh.getRange(u.fila, 9).setValue(nueva);
  // Invalidar caché del WMS para que tome la nueva de inmediato
  try { CacheService.getScriptCache().remove('WMS_USUARIOS_HOJA'); } catch (e) {}
  _registrarActividad(email, "cambiar_password", "", "Cambió su contraseña");
  return { ok: true };
}

/* FASE 8.65 (R7): foto de perfil (opcional). Se guarda como URL o data-uri
   ligero en ScriptProperties por email. No afecta nada si no se usa. */
function guardarMiFoto(urlOrData) {
  var email = _usuarioActual();
  if (!email) throw new Error("Sesión no identificada.");
  var v = String(urlOrData || "").trim();
  if (v && v.length > 200000) throw new Error("La imagen es muy grande (usa una URL o una foto pequeña).");
  var key = "FOTO::" + email.toLowerCase();
  if (v) PropertiesService.getScriptProperties().setProperty(key, v);
  else PropertiesService.getScriptProperties().deleteProperty(key);
  return { ok: true };
}
function _obtenerFotoUsuario(email) {
  try { return PropertiesService.getScriptProperties().getProperty("FOTO::" + String(email).toLowerCase()) || ""; }
  catch (e) { return ""; }
}

/* ==========================================================================
   FASE 8.65 (R5): PRESENCIA — usuarios activos ahora mismo.
   Cada carga del dashboard marca "visto" al usuario; activo = visto < 5 min.
   ========================================================================== */
function _marcarPresencia() {
  try {
    var email = _usuarioActual();
    if (!email) return;
    PropertiesService.getScriptProperties().setProperty("PRES::" + email.toLowerCase(), String(Date.now()));
  } catch (e) {}
}
function obtenerUsuariosActivos() {
  var out = { count: 0, nombres: [] };
  try {
    var props = PropertiesService.getScriptProperties().getProperties();
    var ahora = Date.now(), lim = 5 * 60 * 1000;
    var emails = [];
    for (var k in props) {
      if (k.indexOf("PRES::") !== 0) continue;
      var ts = parseInt(props[k] || "0", 10);
      if (ahora - ts <= lim) emails.push(k.substring(6));
    }
    var nombres = emails.map(function(em){
      var u = _obtenerUsuario(em);
      return (u && u.nombre) ? u.nombre : em;
    }).sort();
    out.count = nombres.length; out.nombres = nombres;
  } catch (e) {}
  return out;
}

/* ==========================================================================
   FASE 8.65 (R8): eventos SIMILARES (mismo cliente + título parecido) NO
   entregados — para ofrecer "unirme como apoyo" en vez de inflar filas.
   ========================================================================== */
function _normTitulo(s) {
  return String(s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // sin tildes
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
function buscarEventosSimilares(cliente, titulo) {
  var ss = _getSS();
  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  if (!cron || cron.getLastRow() < CRON_CFG.CR_FILA_INI) return [];
  var n = cron.getLastRow() - CRON_CFG.CR_FILA_INI + 1;
  if (n <= 0) return [];
  var dat = cron.getRange(CRON_CFG.CR_FILA_INI, 1, n, CRON_CFG.CR_COL_RESP).getValues();
  var cliN = String(cliente || "").trim().toUpperCase();
  var titN = _normTitulo(titulo);
  var titTokens = titN.split(" ").filter(function(w){ return w.length >= 4; });
  var out = [];
  for (var i = 0; i < dat.length; i++) {
    var r = dat[i];
    var estado = String(r[CRON_CFG.CR_COL_ESTADO - 1] || "").toLowerCase();
    if (estado.indexOf("entregado") !== -1) continue;
    var cli = String(r[CRON_CFG.CR_COL_CLIENTE - 1] || "").trim().toUpperCase();
    if (cliN && cli !== cliN) continue;
    var tit = _normTitulo(r[CRON_CFG.CR_COL_TITULO - 1]);
    // Similar si comparte ≥2 tokens largos o el título normalizado coincide.
    var comparte = (tit === titN);
    if (!comparte && titTokens.length) {
      var hits = 0;
      titTokens.forEach(function(w){ if (tit.indexOf(w) !== -1) hits++; });
      comparte = hits >= Math.min(2, titTokens.length);
    }
    if (comparte) {
      out.push({
        fila: CRON_CFG.CR_FILA_INI + i,
        cliente: r[CRON_CFG.CR_COL_CLIENTE - 1],
        titulo: r[CRON_CFG.CR_COL_TITULO - 1],
        responsable: r[CRON_CFG.CR_COL_RESP - 1],
        estado: r[CRON_CFG.CR_COL_ESTADO - 1]
      });
    }
  }
  return out;
}

/* FASE 8.65 (R8): unirse como APOYO a un evento existente (desde el aviso). */
function unirmeComoApoyo(filaEvento) {
  var nombre = _nombreUsuarioActual();
  if (!nombre) throw new Error("Usuario no identificado.");
  var ss = _getSS();
  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  var cliente = String(cron.getRange(filaEvento, CRON_CFG.CR_COL_CLIENTE).getValue() || "");
  var titulo  = String(cron.getRange(filaEvento, CRON_CFG.CR_COL_TITULO).getValue() || "");
  var respFila = String(cron.getRange(filaEvento, CRON_CFG.CR_COL_RESP).getValue() || "").trim().toUpperCase();
  if (_claveNombre(nombre) === _claveNombre(respFila)) {
    return { ok: true, yaEra: true, mensaje: "Ya eres el responsable de ese evento." };
  }
  // ¿ya está como apoyo activo?
  var sh = _asegurarHojaEquiposTarea();
  if (sh.getLastRow() >= 2) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues();
    for (var i = 0; i < v.length; i++) {
      if (String(v[i][1]) === String(filaEvento) &&
          _claveNombre(v[i][5]) === _claveNombre(nombre) &&
          String(v[i][6]).toUpperCase() === "APOYO" &&
          String(v[i][7]).toUpperCase() === "ACTIVO") {
        return { ok: true, yaEra: true, mensaje: "Ya estás como apoyo de ese evento." };
      }
    }
  }
  var em = _usuarioActual();
  sh.appendRow([new Date(), filaEvento, String(cliente).toUpperCase(), titulo,
                em, _canonNombre(nombre), "APOYO", "ACTIVO", "", em]);
  _registrarActividad(em, "unirse_apoyo", String(filaEvento), "Se unió como apoyo");
  return { ok: true, mensaje: "Te uniste como apoyo del evento (" + cliente + ")." };
}

/* ==========================================================================
   FASE 8.65 (R9): validar NOMBRE de archivo duplicado en la carpeta destino.
   ========================================================================== */
function verificarNombreArchivo(folderId, nombre) {
  try {
    if (!folderId || !nombre) return { existe: false };
    var folder = DriveApp.getFolderById(folderId);
    var it = folder.getFilesByName(String(nombre).trim());
    if (it.hasNext()) {
      var f = it.next();
      return { existe: true, url: f.getUrl(), id: f.getId() };
    }
  } catch (e) {}
  return { existe: false };
}

/* ==========================================================================
   FASE 8.65 (R6): DETALLE de Analytics — eventos/archivos de un usuario según
   la métrica elegida (iniciados/finalizados/creados/apoyos/pausados/excluidos).
   ========================================================================== */
function detalleAnalyticsUsuario(email, tipo) {
  var ss = _getSS();
  var emailN = String(email || "").trim().toLowerCase();
  var res = [];

  if (tipo === "apoyos" || tipo === "excluidos") {
    var shE = ss.getSheetByName(EQT_CFG.HOJA);
    if (shE && shE.getLastRow() >= 2) {
      var ve = shE.getRange(2, 1, shE.getLastRow() - 1, 10).getValues();
      // Resolver nombre del email para comparar (EQUIPOS_TAREA guarda nombre)
      var uu = _obtenerUsuario(emailN);
      var claveNom = uu ? _claveNombre(uu.nombre) : "";
      ve.forEach(function(r){
        var okEmail = String(r[4] || "").trim().toLowerCase() === emailN;
        var okNombre = claveNom && _claveNombre(r[5]) === claveNom;
        if (!okEmail && !okNombre) return;
        if (String(r[6] || "").toUpperCase() !== "APOYO") return;
        var est = String(r[7] || "").toUpperCase();
        if (tipo === "excluidos" && est !== "EXCLUIDO") return;
        if (tipo === "apoyos" && est === "EXCLUIDO") return;
        var ini = (r[0] instanceof Date) ? r[0] : null;
        var fin = (r[8] instanceof Date) ? r[8] : null;
        var mins = (ini && fin) ? Math.round((fin.getTime() - ini.getTime()) / 60000) : null;
        res.push({
          cliente: r[2], titulo: r[3], estado: est,
          inicio: ini ? ini.getTime() : null, fin: fin ? fin.getTime() : null,
          minutos: mins, filaEvento: r[1]
        });
      });
    }
    return res;
  }

  // iniciados / finalizados / creados / pausados → desde LOG_ACTIVIDAD
  var accMap = { iniciados:["iniciar"], finalizados:["finalizar"], creados:["crear_archivo"],
                 pausados:["pausar"], reanudados:["reanudar"] };
  var accs = accMap[tipo] || [];
  var shL = ss.getSheetByName(USR_CFG.HOJA_LOG);
  if (shL && shL.getLastRow() >= 2 && accs.length) {
    var vl = shL.getRange(2, 1, shL.getLastRow() - 1, 5).getValues();
    vl.forEach(function(r){
      if (String(r[1] || "").trim().toLowerCase() !== emailN) return;
      if (accs.indexOf(String(r[2])) === -1) return;
      res.push({ fecha: (r[0] instanceof Date) ? r[0].getTime() : null,
                 accion: r[2], detalle: r[4] });
    });
  }
  res.sort(function(a,b){ return (b.fecha||b.inicio||0) - (a.fecha||a.inicio||0); });
  return res;
}


/* ---------- LOG de actividad ---------- */
function _registrarActividad(email, accion, fila, detalle) {
  try {
    var ss = _getSS();
    var sh = ss.getSheetByName(USR_CFG.HOJA_LOG);
    if (!sh) {
      sh = ss.insertSheet(USR_CFG.HOJA_LOG);
      sh.getRange(1, 1, 1, 5).setValues([["Fecha/Hora", "Email", "Acción", "Fila", "Detalle"]]);
      sh.getRange(1, 1, 1, 5).setFontWeight("bold")
        .setBackground("#5f6368").setFontColor("#ffffff");
    }
    sh.appendRow([new Date(), email || "?", accion, fila || "", detalle || ""]);
  } catch (e) {
    Logger.log("No se pudo registrar actividad: " + e.message);
  }
}


/* ==========================================================================
   FASE 8.58 — EQUIPOS POR TAREA (multi-operario)
   --------------------------------------------------------------------------
   Hoja EQUIPOS_TAREA: un registro por PARTICIPACIÓN en una tarea.
   Columnas: Fecha Registro | Fila Evento | Cliente | Título | Email |
             Nombre | Rol (RESPONSABLE/APOYO) | Estado (ACTIVO/EXCLUIDO) |
             Fecha Cambio | Registrado Por
   · Se alimenta al crear el evento (responsable + apoyos elegidos).
   · Al FINALIZAR la tarea, el responsable puede EXCLUIR a quienes no
     participaron; queda el historial (no se borra la fila).
   · El Analytics cuenta desde aquí los apoyos y exclusiones por persona.
   ========================================================================== */
var EQT_CFG = { HOJA: "EQUIPOS_TAREA" };

function _asegurarHojaEquiposTarea() {
  var ss = _getSS();
  var sh = ss.getSheetByName(EQT_CFG.HOJA);
  if (!sh) {
    sh = ss.insertSheet(EQT_CFG.HOJA);
    sh.getRange(1, 1, 1, 10).setValues([[
      "Fecha Registro", "Fila Evento", "Cliente", "Título",
      "Email", "Nombre", "Rol", "Estado", "Fecha Cambio", "Registrado Por"
    ]]);
    sh.getRange(1, 1, 1, 10).setFontWeight("bold")
      .setBackground("#5f6368").setFontColor("#ffffff");
    sh.setFrozenRows(1);
  }
  return sh;
}

/* Registra responsable + apoyos de una tarea. Resuelve el email de cada
   nombre desde USUARIOS (si existe). Nombres duplicados se registran una vez. */
function registrarEquipoTarea(filaEvento, cliente, titulo, responsable, apoyos) {
  var sh = _asegurarHojaEquiposTarea();
  var quien = _usuarioActual();
  var ahora = new Date();

  // Mapa nombre(MAYÚSC) → email desde USUARIOS (una sola lectura)
  var emailPorNombre = {};
  try {
    var shU = _getSS().getSheetByName(USR_CFG.HOJA);
    if (shU && shU.getLastRow() > 1) {
      var vu = shU.getRange(2, 1, shU.getLastRow() - 1, 2).getValues();
      vu.forEach(function(r){
        var nom = String(r[1] || "").trim().toUpperCase();
        if (nom && !emailPorNombre[nom]) emailPorNombre[nom] = String(r[0] || "").trim();
      });
    }
  } catch (eU) {}

  var filas = [], agregados = {};
  function _push(nombre, rol) {
    var n = String(nombre || "").trim();
    if (!n) return;
    var key = n.toUpperCase();
    if (agregados[key]) return;
    agregados[key] = true;
    filas.push([ahora, filaEvento || "", String(cliente || "").toUpperCase(),
                titulo || "", emailPorNombre[key] || "", key, rol, "ACTIVO", "", quien]);
  }
  _push(responsable, "RESPONSABLE");
  (apoyos || []).forEach(function(a){ _push(a, "APOYO"); });

  if (filas.length) {
    sh.getRange(sh.getLastRow() + 1, 1, filas.length, 10).setValues(filas);
  }
  return { ok: true, registrados: filas.length };
}

/* FASE 8.63 (R2): cierra los apoyos ACTIVOS de un evento fijando su fin
   (col Fecha Cambio) y estado (FINALIZADO por defecto). Para trazabilidad:
   deja registrado inicio (Fecha Registro) y fin, sin borrar la fila. */
function _cerrarApoyosDeEvento(filaEvento, estadoFin) {
  var ss = _getSS();
  var sh = ss.getSheetByName(EQT_CFG.HOJA);
  if (!sh || sh.getLastRow() < 2) return { cerrados: 0 };
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues();
  var ahora = new Date(), n = 0;
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][1]) !== String(filaEvento)) continue;
    if (String(v[i][6] || "").toUpperCase() !== "APOYO") continue;
    if (String(v[i][7] || "").toUpperCase() !== "ACTIVO") continue;
    sh.getRange(i + 2, 8).setValue(estadoFin || "FINALIZADO");
    sh.getRange(i + 2, 9).setValue(ahora);
    n++;
  }
  return { cerrados: n };
}

/* Equipo registrado de un evento (para el modal de finalización). */
function obtenerEquipoTarea(filaEvento) {
  var ss = _getSS();
  var sh = ss.getSheetByName(EQT_CFG.HOJA);
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues();
  var out = [];
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][1]) !== String(filaEvento)) continue;
    out.push({ filaHoja: i + 2, email: v[i][4], nombre: v[i][5],
               rol: v[i][6], estado: v[i][7] });
  }
  return out;
}

/* Al finalizar la tarea: marca EXCLUIDO a los desmarcados por el responsable.
   exclusiones = array de filaHoja devueltas por obtenerEquipoTarea. */
function actualizarEquipoTareaFinal(filaEvento, exclusiones) {
  var ss = _getSS();
  var sh = ss.getSheetByName(EQT_CFG.HOJA);
  if (!sh || !exclusiones || !exclusiones.length) return { ok: true, excluidos: 0 };
  var ahora = new Date(), n = 0;
  exclusiones.forEach(function(fh){
    var f = parseInt(fh, 10);
    if (!f || f < 2 || f > sh.getLastRow()) return;
    // Seguridad: la fila debe pertenecer al evento indicado
    if (String(sh.getRange(f, 2).getValue()) !== String(filaEvento)) return;
    sh.getRange(f, 8).setValue("EXCLUIDO");
    sh.getRange(f, 9).setValue(ahora);
    n++;
  });
  try {
    _registrarActividad(_usuarioActual(), "excluir_operarios", "",
      "Evento fila " + filaEvento + ": " + n + " excluido(s)");
  } catch (eL) {}
  return { ok: true, excluidos: n };
}

/* FASE 8.62: nombre visible del usuario actual (desde USUARIOS; fallback email). */
function _nombreUsuarioActual() {
  try {
    var em = _usuarioActual();
    var u = em ? _obtenerUsuario(em) : null;
    if (u && u.nombre) return String(u.nombre).trim();
    return em || "";
  } catch (e) { return ""; }
}

/* FASE 8.62 (R3): ¿el usuario actual es el RESPONSABLE de la fila? (o Admin).
   Devuelve {ok, esResp, esAdmin, responsable}. */
function _puedeControlarTarea(cron, f) {
  var respFila = String(cron.getRange(f, CRON_CFG.CR_COL_RESP).getValue() || "").trim().toUpperCase();
  var miNombre = String(_nombreUsuarioActual() || "").trim().toUpperCase();
  var esAdmin = false;
  try {
    var u = _obtenerUsuario(_usuarioActual());
    esAdmin = u && String(u.rol || "").trim().toLowerCase() === "admin";
  } catch (e) {}
  // FASE 8.63 (R3): comparación insensible al ORDEN de nombres (tokens ordenados)
  var esResp = !!(miNombre && respFila && _claveNombre(miNombre) === _claveNombre(respFila));
  return { esResp: esResp, esAdmin: esAdmin, ok: (esResp || esAdmin), responsable: respFila };
}

/* FASE 8.59/8.62: PAUSAR un evento — vuelve a "Pendiente" para retomarlo luego.
   R3: SOLO el responsable de la tarea (o Admin) puede pausar. */
function dash_pausarEvento(filaCronograma) {
  var ss = _getSS();
  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  if (!cron) throw new Error("No se encontró " + CRON_CFG.HOJA_CRONOGRAMA);
  var f = parseInt(filaCronograma, 10);
  if (!f || f < CRON_CFG.CR_FILA_INI) throw new Error("Fila inválida.");
  var ctrl = _puedeControlarTarea(cron, f);
  if (!ctrl.ok) throw new Error("Solo el responsable de la tarea (" + (ctrl.responsable || "—") + ") o un Admin pueden pausar/reanudar este evento.");
  var est = String(cron.getRange(f, CRON_CFG.CR_COL_ESTADO).getValue() || "").toLowerCase();
  if (est.indexOf("entregado") !== -1) {
    throw new Error("El evento ya está Entregado; no se puede pausar.");
  }
  if (est.indexOf("proceso") === -1 && est.indexOf("curso") === -1) {
    return { ok: true, sinCambio: true, estado: est || "Pendiente" };
  }
  cron.getRange(f, CRON_CFG.CR_COL_ESTADO).setValue("Pendiente");
  try {
    _registrarActividad(_usuarioActual(), "pausar", String(f),
      "Evento pausado (vuelve a Pendiente)");
  } catch (eL) {}
  return { ok: true, estado: "Pendiente" };
}

/* FASE 8.62 (R3): REANUDAR (play) un evento pausado → "En Proceso".
   SOLO el responsable de la tarea (o Admin). No pide responsable (ya lo tiene). */
function dash_reanudarEvento(filaCronograma) {
  var ss = _getSS();
  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  if (!cron) throw new Error("No se encontró " + CRON_CFG.HOJA_CRONOGRAMA);
  var f = parseInt(filaCronograma, 10);
  if (!f || f < CRON_CFG.CR_FILA_INI) throw new Error("Fila inválida.");
  var est = String(cron.getRange(f, CRON_CFG.CR_COL_ESTADO).getValue() || "").toLowerCase();
  if (est.indexOf("entregado") !== -1) throw new Error("El evento ya está Entregado.");
  var ctrl = _puedeControlarTarea(cron, f);
  // Si la fila NO tiene responsable aún, el usuario que reanuda pasa a serlo (autor).
  if (!ctrl.responsable) {
    var miNom = _nombreUsuarioActual();
    if (miNom) { cron.getRange(f, CRON_CFG.CR_COL_RESP).setValue(String(miNom).toUpperCase()); ctrl.esResp = true; ctrl.ok = true; }
  }
  if (!ctrl.ok) throw new Error("Solo el responsable de la tarea (" + (ctrl.responsable || "—") + ") o un Admin pueden reanudar este evento.");
  cron.getRange(f, CRON_CFG.CR_COL_ESTADO).setValue("En Proceso");
  // Fecha de inicio si estaba vacía
  if (!cron.getRange(f, CRON_CFG.CR_COL_FECHA).getValue()) {
    cron.getRange(f, CRON_CFG.CR_COL_FECHA).setValue(_soloFecha(new Date())).setNumberFormat("dd/MM/yyyy");
  }
  try { _registrarActividad(_usuarioActual(), "reanudar", String(f), "Evento reanudado (En Proceso)"); } catch (eL) {}
  return { ok: true, estado: "En Proceso" };
}

/* FASE 8.63 (R4): ELIMINAR un evento del cronograma.
   Solo el RESPONSABLE registrado o un Admin pueden borrarlo. Si la fila NO tiene
   responsable, cualquier miembro con permiso de crear (Coordinador/Líder) puede
   limpiarla. NO borra el archivo físico de Drive — solo la fila del cronograma. */
function dash_eliminarEvento(filaCronograma) {
  var ss = _getSS();
  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  if (!cron) throw new Error("No se encontró " + CRON_CFG.HOJA_CRONOGRAMA);
  var f = parseInt(filaCronograma, 10);
  if (!f || f < CRON_CFG.CR_FILA_INI) throw new Error("Fila inválida.");

  var ctrl = _puedeControlarTarea(cron, f);
  if (ctrl.responsable) {
    // Con responsable: SOLO responsable o Admin
    if (!ctrl.ok) throw new Error("Solo el responsable (" + ctrl.responsable + ") o un Admin pueden eliminar este evento.");
  } else {
    // Sin responsable: requiere permiso de crear (Coordinador/Líder) o Admin
    var u = _obtenerUsuario(_usuarioActual());
    var rol = u ? String(u.rol || "").trim().toLowerCase() : "";
    if (["admin","coordinador","líder de conteo","lider de conteo"].indexOf(rol) === -1) {
      throw new Error("No tienes permiso para eliminar eventos.");
    }
  }

  var titulo = String(cron.getRange(f, CRON_CFG.CR_COL_TITULO).getValue() || "");
  var cliente = String(cron.getRange(f, CRON_CFG.CR_COL_CLIENTE).getValue() || "");
  // FASE 8.65 (A): borrar también de Google Calendar (antes de perder la fila).
  try {
    var fIniDel = cron.getRange(f, CRON_CFG.CR_COL_FECHA).getValue();
    if (fIniDel instanceof Date) _calBorrarEvento(cliente, fIniDel.getTime(), titulo);
  } catch (eCalDel) {}
  // Cerrar apoyos (trazabilidad) antes de borrar la fila
  try { _cerrarApoyosDeEvento(f, "EVENTO_ELIMINADO"); } catch (eCA) {}
  cron.deleteRow(f);
  try {
    _registrarActividad(_usuarioActual(), "eliminar_evento", String(f),
      "Eliminó evento: " + cliente + " · " + titulo);
  } catch (eL) {}
  return { ok: true, mensaje: "Evento eliminado: " + cliente + " · " + titulo };
}

/* FASE 8.62 (R3): el RESPONSABLE (o Admin/Coordinador) agrega/quita APOYOS de un
   evento YA CREADO. apoyosDeseados = lista de NOMBRES que deben quedar activos. */
function gestionarApoyosEvento(filaEvento, apoyosDeseados) {
  var ss = _getSS();
  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  if (!cron) throw new Error("No se encontró " + CRON_CFG.HOJA_CRONOGRAMA);
  var f = parseInt(filaEvento, 10);
  if (!f || f < CRON_CFG.CR_FILA_INI) throw new Error("Fila inválida.");

  // Permiso: responsable de la tarea, Admin o Coordinador
  var ctrl = _puedeControlarTarea(cron, f);
  var esCoord = false;
  try { var uu = _obtenerUsuario(_usuarioActual()); esCoord = uu && String(uu.rol||"").trim().toLowerCase() === "coordinador"; } catch(e){}
  if (!ctrl.ok && !esCoord) {
    throw new Error("Solo el responsable de la tarea (" + (ctrl.responsable || "—") + "), un Coordinador o un Admin pueden editar los apoyos.");
  }

  var cliente = String(cron.getRange(f, CRON_CFG.CR_COL_CLIENTE).getValue() || "");
  var titulo  = String(cron.getRange(f, CRON_CFG.CR_COL_TITULO).getValue() || "");
  var respFila = ctrl.responsable;

  var deseados = {};
  (apoyosDeseados || []).forEach(function(n){
    var k = String(n || "").trim().toUpperCase();
    if (k && k !== respFila) deseados[k] = true;   // el responsable no es "apoyo"
  });

  var sh = _asegurarHojaEquiposTarea();
  var quien = _usuarioActual();
  var ahora = new Date();
  var actuales = {};   // NOMBRE -> {fila, estado}
  if (sh.getLastRow() >= 2) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues();
    for (var i = 0; i < v.length; i++) {
      if (String(v[i][1]) !== String(f)) continue;
      if (String(v[i][6] || "").toUpperCase() !== "APOYO") continue;
      var nom = String(v[i][5] || "").trim().toUpperCase();
      if (nom) actuales[nom] = { fila: i + 2, estado: String(v[i][7] || "").toUpperCase() };
    }
  }

  // Mapa nombre->email (para altas)
  var emailPorNombre = {};
  try {
    var shU = ss.getSheetByName(USR_CFG.HOJA);
    if (shU && shU.getLastRow() > 1) {
      var vu = shU.getRange(2, 1, shU.getLastRow() - 1, 2).getValues();
      vu.forEach(function(r){ var nm = String(r[1]||"").trim().toUpperCase(); if (nm && !emailPorNombre[nm]) emailPorNombre[nm] = String(r[0]||"").trim(); });
    }
  } catch (eU) {}

  var agregados = 0, quitados = 0, reactivados = 0;
  // Altas / reactivaciones
  Object.keys(deseados).forEach(function(nom){
    if (actuales[nom]) {
      if (actuales[nom].estado !== "ACTIVO") {
        sh.getRange(actuales[nom].fila, 8).setValue("ACTIVO");
        sh.getRange(actuales[nom].fila, 9).setValue(ahora);
        reactivados++;
      }
    } else {
      sh.appendRow([ahora, f, String(cliente).toUpperCase(), titulo, emailPorNombre[nom] || "", nom, "APOYO", "ACTIVO", "", quien]);
      agregados++;
    }
  });
  // Bajas (quitar = marcar RETIRADO)
  Object.keys(actuales).forEach(function(nom){
    if (!deseados[nom] && actuales[nom].estado === "ACTIVO") {
      sh.getRange(actuales[nom].fila, 8).setValue("RETIRADO");
      sh.getRange(actuales[nom].fila, 9).setValue(ahora);
      quitados++;
    }
  });

  try {
    _registrarActividad(quien, "editar_apoyos", String(f),
      "Apoyos evento " + f + ": +" + agregados + " / -" + quitados + " / react " + reactivados);
  } catch (eL) {}
  return { ok: true, agregados: agregados, quitados: quitados, reactivados: reactivados };
}


/* ---------- Analytics por usuario ---------- */
function obtenerAnalyticsUsuario(email) {
  var ss = _getSS();
  var sh = ss.getSheetByName(USR_CFG.HOJA_LOG);
  var res = { iniciados: 0, finalizados: 0, creados: 0, ultimaActividad: null };
  if (!sh || sh.getLastRow() < 2) return res;
  var emailN = String(email).trim().toLowerCase();
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
  v.forEach(function(r){
    if (String(r[1]).trim().toLowerCase() !== emailN) return;
    var acc = String(r[2]);
    if (acc === "iniciar") res.iniciados++;
    else if (acc === "finalizar") res.finalizados++;
    else if (acc === "crear_archivo") res.creados++;
    if (r[0] instanceof Date) {
      var t = r[0].getTime();
      if (!res.ultimaActividad || t > res.ultimaActividad) res.ultimaActividad = t;
    }
  });
  return res;
}

function obtenerAnalyticsGlobal() {
  _requiereRol(["Coordinador", "Líder de Conteo", "Auditor"]);
  var ss = _getSS();
  var sh = ss.getSheetByName(USR_CFG.HOJA_LOG);
  var porUsuario = {};
  var totalAcciones = 0;

  if (sh && sh.getLastRow() >= 2) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
    totalAcciones = v.length;
    v.forEach(function(r){
      // FASE 8.58: clave normalizada en minúsculas para no duplicar usuarios
      var em = String(r[1] || "").trim().toLowerCase();
      if (!em) return;
      var acc = String(r[2]);
      if (!porUsuario[em]) porUsuario[em] = { email: em, nombre: "", iniciados:0, finalizados:0, creados:0, apoyos:0, exclusiones:0, total:0 };
      if (acc === "iniciar") porUsuario[em].iniciados++;
      else if (acc === "finalizar") porUsuario[em].finalizados++;
      else if (acc === "crear_archivo") porUsuario[em].creados++;
      porUsuario[em].total++;
    });
  }

  // FASE 8.58: nombre visible desde USUARIOS (validación efectiva de identidad)
  var nombrePorEmail = {}, emailPorNombre = {};
  try {
    var shU = ss.getSheetByName(USR_CFG.HOJA);
    if (shU && shU.getLastRow() > 1) {
      var vu = shU.getRange(2, 1, shU.getLastRow() - 1, 2).getValues();
      vu.forEach(function(r){
        var em = String(r[0] || "").trim().toLowerCase();
        var nom = String(r[1] || "").trim();
        if (em && nom) { nombrePorEmail[em] = nom; emailPorNombre[nom.toUpperCase()] = em; }
      });
    }
  } catch (eU) {}

  // FASE 8.58: apoyos operativos y exclusiones desde EQUIPOS_TAREA
  try {
    var shE = ss.getSheetByName(EQT_CFG.HOJA);
    if (shE && shE.getLastRow() >= 2) {
      var ve = shE.getRange(2, 1, shE.getLastRow() - 1, 10).getValues();
      ve.forEach(function(r){
        var em  = String(r[4] || "").trim().toLowerCase();
        var nom = String(r[5] || "").trim();
        var rol = String(r[6] || "").trim().toUpperCase();
        var est = String(r[7] || "").trim().toUpperCase();
        // Resolver email por nombre si la fila no lo trae
        if (!em && nom) em = emailPorNombre[nom.toUpperCase()] || "";
        var key = em || ("(sin correo) " + nom.toUpperCase());
        if (!key.trim()) return;
        if (!porUsuario[key]) porUsuario[key] = { email: em || "", nombre: nom, iniciados:0, finalizados:0, creados:0, apoyos:0, exclusiones:0, total:0 };
        if (est === "EXCLUIDO") porUsuario[key].exclusiones++;
        else if (rol === "APOYO") porUsuario[key].apoyos++;
      });
    }
  } catch (eE) {}

  // Completar nombres faltantes
  Object.keys(porUsuario).forEach(function(k){
    var u = porUsuario[k];
    if (!u.nombre) u.nombre = nombrePorEmail[u.email] || "";
    if (u.apoyos === undefined) u.apoyos = 0;
    if (u.exclusiones === undefined) u.exclusiones = 0;
  });

  return {
    porUsuario: Object.keys(porUsuario).map(function(k){ return porUsuario[k]; })
                  .sort(function(a,b){ return b.total - a.total; }),
    totalAcciones: totalAcciones
  };
}


/* ---------- Setup completo de fase 3 ---------- */
function setupFase3() {
  setupUsuarios();
  // Asegurar el ID del libro guardado para Web App
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) PropertiesService.getScriptProperties().setProperty("MAIN_SS_ID", active.getId());
  } catch (e) {}
  _alert("✓ Fase 3 lista.\n\n" +
         "1. Revisa la hoja USUARIOS y ajusta roles.\n" +
         "2. Implementa la Web App: Implementar → Nueva implementación → Aplicación web.\n" +
         "3. Ejecutar como: Yo (el dueño).\n" +
         "4. Quién tiene acceso: Cualquier usuario con cuenta de Google.\n" +
         "5. Comparte la URL solo con tu equipo.");
}


/* ==========================================================================
   ====== FASE 4 — Integración WMS · Correo semanal · Calendar · ZIP ========
   ========================================================================== */

// FIX FASE 8.5: URL del Terminal WMS configurada por defecto.
// Bryan pidió usar este link externo del BlindInventory en lugar del consolidado.
var WMS_CFG = {
  // FIX FASE 8.37 (Opción B): el WMS es ESTE proyecto (?vista=wms). Este DEPLOY_URL
  // queda solo como ÚLTIMO respaldo (deployment standalone), por si ScriptApp no
  // pudiera resolver la URL de esta app. Para forzar un WMS externo: setWmsUrl(url);
  // para volver a este proyecto: usarWmsDeEstaApp().
  DEPLOY_URL: "https://script.google.com/macros/s/AKfycbwBwuTEaaxpf3IWWt1iAT0DzI8QIqZSXm2SnA1otqttURsUi2mEwnvNU1a1xn-vu2N2/exec",
  AUTO_REFRESH_SEGUNDOS: 60
};

function setWmsUrl(url) {
  // FIX FASE 7.5: Las funciones de SETUP no requieren rol porque se ejecutan
  // UNA VEZ desde el editor Apps Script (el dueño del script), no desde la Web App.
  // _requiereRol depende de Session.getActiveUser() que no es confiable en ese contexto.
  if (!url || url.indexOf("http") !== 0) throw new Error("URL inválida (debe empezar con http/https).");
  PropertiesService.getScriptProperties().setProperty("WMS_DEPLOY_URL", url.trim());
  // Registrar quien la ejecutó para auditoría (best-effort)
  try {
    var who = "";
    try { who = Session.getActiveUser().getEmail() || ""; } catch(e) {}
    if (!who) try { who = Session.getEffectiveUser().getEmail() || ""; } catch(e) {}
    _registrarActividad(who || "editor", "config_wms_url", "", "URL: " + url.trim());
  } catch(e) {}
  return { ok: true, url: url.trim() };
}

function _obtenerWmsUrl() {
  // FIX FASE 8.37 (dos códigos): el WMS es el proyecto STANDALONE (link /exec).
  // Prioridad: 1) override explícito (setWmsUrl) · 2) constante DEPLOY_URL (standalone).
  // OJO: NO usar ScriptApp.getService().getUrl() — en el editor devuelve /dev y
  // genera links rotos para los operarios (esa era la falla del modo "un solo código").
  var prop = PropertiesService.getScriptProperties().getProperty("WMS_DEPLOY_URL");
  if (prop) return prop;
  return WMS_CFG.DEPLOY_URL || "";
}

// Devuelve la URL base del Terminal WMS (para el botón "Abrir Terminal WMS").
function obtenerWmsUrlBase() {
  return _obtenerWmsUrl();
}

// FIX FASE 8.37: fija el WMS al proyecto STANDALONE (link /exec estable).
function usarWmsStandalone() {
  var url = "https://script.google.com/macros/s/AKfycbwBwuTEaaxpf3IWWt1iAT0DzI8QIqZSXm2SnA1otqttURsUi2mEwnvNU1a1xn-vu2N2/exec";
  PropertiesService.getScriptProperties().setProperty("WMS_DEPLOY_URL", url);
  try { _alert("✓ Terminal WMS fijado al standalone:\n" + url); } catch (e) {}
  return { ok: true, url: url };
}


/* ---------- LINK DEEP-LINK AL WMS ---------- */
function obtenerLinkDirectoWMS(fileId, cliente, rol) {
  var base = _obtenerWmsUrl();
  if (!base) return null;
  // FIX FASE 8.24: agregar vista=wms y rol opcional para abrir directo al archivo
  // sin pasar por pantalla principal. El BlindInventory detecta estos parámetros
  // y salta a la vista del archivo usando la cuenta Gmail logueada.
  var params = "?vista=wms&fileId=" + encodeURIComponent(fileId);
  if (cliente) params += "&cliente=" + encodeURIComponent(cliente);
  if (rol) params += "&rol=" + encodeURIComponent(rol);
  return base + params;
}

/* ---------- Modal post-creación: devuelve metadata para el frontend ---------- */
function obtenerDatosPostCreacion(fileId, cliente, fileUrl, fileName) {
  // FIX FASE 8.24: devolver links por rol para que el frontend muestre cada uno
  return {
    fileId: fileId,
    cliente: cliente,
    fileUrl: fileUrl,
    fileName: fileName,
    wmsUrl: obtenerLinkDirectoWMS(fileId, cliente),                    // genérico
    wmsUrlOperario: obtenerLinkDirectoWMS(fileId, cliente, "operario"),
    wmsUrlAuditor: obtenerLinkDirectoWMS(fileId, cliente, "auditor"),
    wmsConfigurado: !!_obtenerWmsUrl()
  };
}

/* ---------- Auditar acceso al WMS (cuando alguien usa un link) ---------- */
function registrarAccesoWMS(fileId, cliente, viaCorreo) {
  _registrarActividad(_usuarioActual(), "acceso_wms",
    "fileId:" + fileId,
    "Cliente: " + cliente + (viaCorreo ? " · vía correo" : " · directo"));
  return { ok: true };
}


/* ==========================================================================
   CORREO SEMANAL DE LUNES
   ========================================================================== */

function enviarReporteSemanalLunes() {
  var ss = _getSS();
  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  if (!cron) { Logger.log("No hay cronograma"); return; }

  // Calcular rango de la semana (lunes -> domingo)
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var dow = hoy.getDay(); // 0=dom, 1=lun...
  var diasAtras = (dow === 0) ? 6 : dow - 1;
  var lunes = new Date(hoy.getTime() - diasAtras * 86400000);
  var domingo = new Date(lunes.getTime() + 7 * 86400000 - 1000);

  // Leer cronograma
  var lastRow = cron.getLastRow();
  if (lastRow < CRON_CFG.CR_FILA_INI) { Logger.log("Cronograma vacío"); return; }
  var rng = cron.getRange(CRON_CFG.CR_FILA_INI, 1, lastRow - CRON_CFG.CR_FILA_INI + 1, 20);
  var datos = rng.getValues();
  var richArch = cron.getRange(CRON_CFG.CR_FILA_INI, CRON_CFG.CR_COL_ARCH,
                               lastRow - CRON_CFG.CR_FILA_INI + 1, 1).getRichTextValues();

  var eventosSemana = [];
  for (var i = 0; i < datos.length; i++) {
    var fi = datos[i][CRON_CFG.CR_COL_FECHAI - 1];
    if (!(fi instanceof Date)) continue;
    var fiDay = new Date(fi); fiDay.setHours(0,0,0,0);
    if (fiDay < lunes || fiDay > domingo) continue;
    var estado = String(datos[i][CRON_CFG.CR_COL_ESTADO - 1] || "").toLowerCase();
    var entregado = estado.indexOf("entregado") !== -1;
    var urlArch = _extraerUrlSmartChip(richArch[i][0], datos[i][CRON_CFG.CR_COL_ARCH - 1]);
    var fileId = urlArch ? _extraerIdDesdeUrl(urlArch) : "";
    var cliente = String(datos[i][CRON_CFG.CR_COL_CLIENTE - 1] || "").trim();
    eventosSemana.push({
      fila: CRON_CFG.CR_FILA_INI + i,
      titulo: String(datos[i][CRON_CFG.CR_COL_TITULO - 1] || "").trim(),
      cliente: cliente,
      responsable: String(datos[i][CRON_CFG.CR_COL_RESP - 1] || "").trim(),
      fechaInicio: fi.getTime(),
      estado: entregado ? "Entregado" : (estado.indexOf("proceso") !== -1 ? "En Proceso" : "Pendiente"),
      prioridad: String(datos[i][CRON_CFG.CR_COL_PRIO - 1] || "Media").trim(),
      urlArchivo: urlArch || "",
      wmsUrl: fileId ? obtenerLinkDirectoWMS(fileId, cliente) : null
    });
  }

  // Ordenar por fecha
  eventosSemana.sort(function(a, b) { return a.fechaInicio - b.fechaInicio; });

  // Destinatarios: usuarios activos con email
  var usuarios = ss.getSheetByName(USR_CFG.HOJA);
  var emails = [];
  if (usuarios && usuarios.getLastRow() > 1) {
    var vu = usuarios.getRange(2, 1, usuarios.getLastRow() - 1, 5).getValues();
    vu.forEach(function(r) {
      var em = String(r[0] || "").trim();
      var activo = (r[4] === true || String(r[4]).toUpperCase() === "TRUE" || r[4] === "");
      if (em && activo && em.indexOf("@") !== -1) emails.push(em);
    });
  }
  // Fallback: si no hay usuarios, usar EQUIPO_OPERATIVO
  if (emails.length === 0) {
    var eq = ss.getSheetByName(CRON_CFG.HOJA_EQUIPO);
    if (eq && eq.getLastRow() > 1) {
      var ve = eq.getRange(2, 2, eq.getLastRow() - 1, 1).getValues();
      ve.forEach(function(r) { if (r[0] && String(r[0]).indexOf("@") !== -1) emails.push(String(r[0]).trim()); });
    }
  }

  if (emails.length === 0) { Logger.log("Sin destinatarios"); return; }

  // Armar HTML
  var html = _construirHtmlReporteSemanal(eventosSemana, lunes, domingo);
  var asunto = "📋 Inventarios de la semana " + _fmtFecha(lunes) + " — " + _fmtFecha(domingo);

  try {
    MailApp.sendEmail({
      bcc: emails.join(","),
      subject: asunto,
      htmlBody: html,
      name: "Centro de Mando · Itsanet UIO"
    });
    Logger.log("Reporte semanal enviado a " + emails.length + " destinatarios.");
    _registrarActividad("SISTEMA", "reporte_semanal", "",
      "Enviado a " + emails.length + " · " + eventosSemana.length + " eventos");
  } catch (e) {
    Logger.log("Error enviando reporte semanal: " + e.message);
  }
}

function _extraerIdDesdeUrl(url) {
  if (!url) return "";
  var m = String(url).match(/[-\w]{25,50}/);
  return m ? m[0] : "";
}

/* ==========================================================================
   FASE 8.65 (R10): SINCRONIZAR CRONOGRAMA ↔ GOOGLE CALENDAR
   Crea/actualiza eventos de Calendar (con recordatorios popup + email) para
   los eventos NO entregados de esta semana + los VENCIDOS. Idempotente: usa
   una etiqueta [IMS#fila] en la descripción para no duplicar. Requiere los
   scopes de Calendar (ya presentes en appsscript.json).
   ========================================================================== */
function dash_sincronizarCalendario() {
  _requiereRol(["Admin", "Coordinador"]);
  return _sincronizarCronogramaCalendar();
}

function _sincronizarCronogramaCalendar() {
  var ss = _getSS();
  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  if (!cron || cron.getLastRow() < CRON_CFG.CR_FILA_INI) return { ok:false, mensaje:"Cronograma vacío." };
  var cal = _obtenerCalendarioIMS();
  if (!cal) return { ok:false, mensaje:"No se pudo acceder a Google Calendar." };

  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var finSemana = new Date(hoy.getTime() + 8 * 86400000);
  var n = cron.getLastRow() - CRON_CFG.CR_FILA_INI + 1;
  var dat = cron.getRange(CRON_CFG.CR_FILA_INI, 1, n, CRON_CFG.CR_COL_FECHA_ENT).getValues();

  var creados = 0, actualizados = 0, revisados = 0;
  var deadline = Date.now() + 250 * 1000;
  for (var i = 0; i < dat.length; i++) {
    if (Date.now() > deadline) break;
    var r = dat[i];
    var estado = String(r[CRON_CFG.CR_COL_ESTADO - 1] || "").toLowerCase();
    if (estado.indexOf("entregado") !== -1) continue;
    var fIni = r[CRON_CFG.CR_COL_FECHA - 1];
    if (!(fIni instanceof Date)) continue;
    var dIni = new Date(fIni.getFullYear(), fIni.getMonth(), fIni.getDate());
    var vencido = dIni < hoy;
    // Solo esta semana o vencidos (no futuros lejanos)
    if (!vencido && dIni > finSemana) continue;
    revisados++;

    var filaReal = CRON_CFG.CR_FILA_INI + i;
    var cliente = String(r[CRON_CFG.CR_COL_CLIENTE - 1] || "");
    var titulo = String(r[CRON_CFG.CR_COL_TITULO - 1] || "Inventario");
    var resp = String(r[CRON_CFG.CR_COL_RESP - 1] || "");
    var tag = "[IMS#" + filaReal + "]";
    var tituloCal = (vencido ? "⚠ VENCIDO · " : "📦 ") + cliente + " — " + titulo;
    var desc = "Responsable: " + resp + "\nEstado: " + (r[CRON_CFG.CR_COL_ESTADO-1]||"Pendiente") +
               "\nCliente: " + cliente + "\n" + tag +
               "\n(Sincronizado desde el Centro de Mando Itsanet)";

    // Buscar evento existente ese día con la etiqueta
    var existentes = cal.getEventsForDay(dIni);
    var found = null;
    for (var k = 0; k < existentes.length; k++) {
      if (String(existentes[k].getDescription() || "").indexOf(tag) !== -1) { found = existentes[k]; break; }
    }
    if (found) {
      if (found.getTitle() !== tituloCal) found.setTitle(tituloCal);
      found.setDescription(desc);
      actualizados++;
    } else {
      var ev = cal.createAllDayEvent(tituloCal, dIni, { description: desc });
      try { ev.addPopupReminder(600); } catch (e) {}     // 10 h antes (all-day)
      try { ev.addEmailReminder(1440); } catch (e) {}     // 1 día antes
      creados++;
    }
  }
  try {
    _registrarActividad(_usuarioActual(), "sync_calendar", "",
      "Creados " + creados + " · actualizados " + actualizados);
  } catch (e) {}
  var calId = ""; try { calId = cal.getId(); } catch(e){}
  return { ok:true, creados:creados, actualizados:actualizados, revisados:revisados, calId: calId,
    mensaje: "📅 Calendar sincronizado: " + creados + " nuevos, " + actualizados +
             " actualizados (de " + revisados + " eventos de la semana/vencidos).\n" +
             "El responsable y los apoyos reciben invitación con recordatorio (popup 10 h + email 1 día antes).\n\n" +
             "👥 Para que TODO el equipo vea los eventos: cada uno se suscribe UNA vez al calendario\n" +
             "\"Inventarios Itsanet\" (Google Calendar → Otros calendarios → Suscribirse → pega este ID):\n" +
             calId };
}

/* ══════════════════════════════════════════════════════════════════════════
   FASE 8.65 (A): SINCRONIZACIÓN AUTOMÁTICA POR EVENTO (crear / borrar).
   · Un evento del cronograma ⇄ un evento en el calendario "Inventarios Itsanet".
   · Invitados = responsable + apoyos (reciben el evento en SU calendario y sus
     recordatorios). El equipo completo puede SUSCRIBIRSE al calendario una vez
     (ver dash_infoCalendario) para ver TODO sin invitación.
   · Mapa estable en ScriptProperties CALMAP::<clave> = eventId (no depende de la
     fila, así sobrevive a borrados/reordenamientos).
   ══════════════════════════════════════════════════════════════════════════ */
function _calClaveEvento(cliente, fechaInicioMs, titulo) {
  var f = fechaInicioMs ? Utilities.formatDate(new Date(fechaInicioMs), "GMT-5", "yyyyMMdd") : "nofecha";
  return "CALMAP::" + String(cliente || "").trim().toUpperCase() + "|" + f + "|" + _normTitulo(titulo);
}
function _emailsResponsableYApoyos(nombreResp, filaEvento) {
  var set = {};
  // Mapa nombre(clave)→email desde USUARIOS
  var nom2mail = {};
  try {
    var shU = _getSS().getSheetByName(USR_CFG.HOJA);
    if (shU && shU.getLastRow() > 1) {
      var vu = shU.getRange(2, 1, shU.getLastRow() - 1, 2).getValues();
      vu.forEach(function(r){ var k=_claveNombre(r[1]); if(k) nom2mail[k]=String(r[0]||"").trim(); });
    }
  } catch (e) {}
  var em = nom2mail[_claveNombre(nombreResp)];
  if (em && em.indexOf("@") !== -1) set[em.toLowerCase()] = true;
  // Apoyos activos del evento
  try {
    var shE = _getSS().getSheetByName(EQT_CFG.HOJA);
    if (shE && shE.getLastRow() >= 2) {
      var ve = shE.getRange(2, 1, shE.getLastRow() - 1, 10).getValues();
      ve.forEach(function(r){
        if (String(r[1]) !== String(filaEvento)) return;
        if (String(r[6]||"").toUpperCase() !== "APOYO") return;
        if (String(r[7]||"").toUpperCase() !== "ACTIVO") return;
        var e2 = String(r[4]||"").trim() || nom2mail[_claveNombre(r[5])] || "";
        if (e2 && e2.indexOf("@") !== -1) set[e2.toLowerCase()] = true;
      });
    }
  } catch (e) {}
  return Object.keys(set);
}

/* Upsert de UN evento del cronograma en Calendar (crear o actualizar). */
function _calUpsertEvento(datos) {
  try {
    var cal = _obtenerCalendarioIMS();
    if (!cal) return { ok:false };
    var fIniMs = datos.fechaInicioMs;
    if (!fIniMs) return { ok:false };
    var dIni = new Date(fIniMs); dIni.setHours(0,0,0,0);
    var clave = _calClaveEvento(datos.cliente, fIniMs, datos.titulo);
    var props = PropertiesService.getScriptProperties();
    var evId = props.getProperty(clave);
    var titulo = "📦 " + String(datos.cliente||"") + " — " + String(datos.titulo||"Inventario");
    var invitados = _emailsResponsableYApoyos(datos.responsable, datos.fila);
    var desc = "Responsable: " + (datos.responsable||"") +
               "\nCliente: " + (datos.cliente||"") +
               "\nCategoría: " + (datos.categoria||"") +
               (datos.fileUrl ? "\nArchivo: " + datos.fileUrl : "") +
               "\n(Sincronizado desde el Centro de Mando Itsanet)";
    var ev = null;
    if (evId) { try { ev = cal.getEventById(evId); } catch(e){} }
    if (ev) {
      ev.setTitle(titulo); ev.setDescription(desc);
      try { ev.setAllDayDate(dIni); } catch(e){}
    } else {
      ev = cal.createAllDayEvent(titulo, dIni, { description: desc, guests: invitados.join(","), sendInvites: true });
      try { ev.addPopupReminder(600); } catch(e){}
      try { ev.addEmailReminder(1440); } catch(e){}
      props.setProperty(clave, ev.getId());
    }
    // Añadir invitados nuevos (no quita a nadie)
    try {
      var yaInv = {}; ev.getGuestList().forEach(function(g){ yaInv[String(g.getEmail()).toLowerCase()]=true; });
      invitados.forEach(function(e2){ if(!yaInv[e2]) try{ ev.addGuest(e2); }catch(_){} });
    } catch(e){}
    return { ok:true, id: ev.getId() };
  } catch (e) {
    Logger.log("FASE 8.65 _calUpsertEvento: " + e.message);
    return { ok:false, error:String(e.message||e) };
  }
}

/* Borra de Calendar el evento asociado (al eliminar del cronograma). */
function _calBorrarEvento(cliente, fechaInicioMs, titulo) {
  try {
    var clave = _calClaveEvento(cliente, fechaInicioMs, titulo);
    var props = PropertiesService.getScriptProperties();
    var evId = props.getProperty(clave);
    if (!evId) return { ok:true, sinMapa:true };
    var cal = _obtenerCalendarioIMS();
    var ev = cal ? cal.getEventById(evId) : null;
    if (ev) ev.deleteEvent();
    props.deleteProperty(clave);
    return { ok:true };
  } catch (e) { return { ok:false, error:String(e.message||e) }; }
}

/* Info para que el equipo se SUSCRIBA una vez al calendario compartido. */
function dash_infoCalendario() {
  _requiereRol(["Admin", "Coordinador"]);
  var cal = _obtenerCalendarioIMS();
  if (!cal) return { ok:false, mensaje:"No se pudo acceder al calendario." };
  return { ok:true, id: cal.getId(), nombre: cal.getName(),
    mensaje: "Calendario compartido: \"" + cal.getName() + "\"\nID: " + cal.getId() +
      "\n\nCADA miembro del equipo (una sola vez): en Google Calendar → 'Otros calendarios' → " +
      "'Suscribirse a un calendario' → pega este ID. A partir de ahí verá TODOS los eventos, " +
      "actualizaciones y borrados automáticamente. Además, el responsable y apoyos reciben invitación directa." };
}

/* Calendario dedicado "Inventarios Itsanet" (se crea 1 vez); fallback al default. */
function _obtenerCalendarioIMS() {
  try {
    var id = PropertiesService.getScriptProperties().getProperty("IMS_CALENDAR_ID");
    if (id) { var c = CalendarApp.getCalendarById(id); if (c) return c; }
    var existentes = CalendarApp.getCalendarsByName("Inventarios Itsanet");
    if (existentes && existentes.length) {
      PropertiesService.getScriptProperties().setProperty("IMS_CALENDAR_ID", existentes[0].getId());
      return existentes[0];
    }
    var nuevo = CalendarApp.createCalendar("Inventarios Itsanet", { color: CalendarApp.Color.BLUE });
    PropertiesService.getScriptProperties().setProperty("IMS_CALENDAR_ID", nuevo.getId());
    return nuevo;
  } catch (e) {
    try { return CalendarApp.getDefaultCalendar(); } catch (e2) { return null; }
  }
}

/* Trigger diario opcional para mantener Calendar al día (7:00 AM). */
function instalarTriggerCalendarioDiario() {
  _requiereRol(["Admin", "Coordinador"]);
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === "_sincronizarCronogramaCalendar") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("_sincronizarCronogramaCalendar").timeBased().atHour(7).everyDays(1).create();
  return { ok:true, mensaje:"Sincronización diaria de Calendar instalada (7:00 AM)." };
}

function _construirHtmlReporteSemanal(eventos, lunes, domingo) {
  var fechaTxt = _fmtFecha(lunes) + " — " + _fmtFecha(domingo);
  var webAppUrl = "";
  try { webAppUrl = ScriptApp.getService().getUrl(); } catch (e) {}

  var pendientes = eventos.filter(function(e) { return e.estado === "Pendiente" || e.estado === "En Proceso"; });
  var entregados = eventos.filter(function(e) { return e.estado === "Entregado"; });

  function pill(estado, prio) {
    var c = "#94a3b8", bg = "#f1f5f9";
    if (estado === "Entregado") { c = "#16a34a"; bg = "#dcfce7"; }
    else if (estado === "En Proceso") { c = "#2563eb"; bg = "#dbeafe"; }
    else if (prio === "Alta") { c = "#dc2626"; bg = "#fee2e2"; }
    else { c = "#ca8a04"; bg = "#fef9c3"; }
    return '<span style="background:' + bg + ';color:' + c + ';padding:3px 9px;border-radius:11px;font-size:11px;font-weight:600;">' + estado + '</span>';
  }

  function filaEvento(e) {
    var dt = new Date(e.fechaInicio);
    var diaTxt = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"][dt.getDay()] + " " +
                 String(dt.getDate()).padStart(2,'0') + "/" + String(dt.getMonth()+1).padStart(2,'0');
    var enlaces = [];
    if (e.wmsUrl) enlaces.push('<a href="' + e.wmsUrl + '" style="color:#2563eb;text-decoration:none;font-weight:600;">→ WMS</a>');
    if (e.urlArchivo) enlaces.push('<a href="' + e.urlArchivo + '" style="color:#64748b;text-decoration:none;">📊 Excel</a>');
    return '<tr style="border-bottom:1px solid #e2e8f0;">' +
      '<td style="padding:10px 8px;font-size:12px;color:#475569;white-space:nowrap;">' + diaTxt + '</td>' +
      '<td style="padding:10px 8px;font-size:13px;font-weight:600;color:#0f172a;">' + _esc(e.cliente) + '</td>' +
      '<td style="padding:10px 8px;font-size:11px;color:#64748b;">' + _esc(e.titulo) + '</td>' +
      '<td style="padding:10px 8px;font-size:11px;color:#475569;">' + _esc(e.responsable || "—") + '</td>' +
      '<td style="padding:10px 8px;">' + pill(e.estado, e.prioridad) + '</td>' +
      '<td style="padding:10px 8px;font-size:11px;">' + (enlaces.join(" · ") || "—") + '</td>' +
      '</tr>';
  }

  var tablaEventos = eventos.length === 0
    ? '<tr><td colspan="6" style="padding:24px;text-align:center;color:#94a3b8;">Sin inventarios programados esta semana.</td></tr>'
    : eventos.map(filaEvento).join("");

  return ['<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;">',
    '<div style="max-width:760px;margin:0 auto;padding:20px;background:#ffffff;">',
    '<div style="background:linear-gradient(135deg,#1e40af 0%,#3b82f6 100%);padding:24px;border-radius:12px;color:white;margin-bottom:20px;">',
    '<h1 style="margin:0;font-size:22px;font-weight:600;">📋 Inventarios de la semana</h1>',
    '<p style="margin:6px 0 0;opacity:0.9;font-size:13px;">' + fechaTxt + ' · Itsanet UIO</p>',
    '</div>',
    '<div style="display:flex;gap:8px;margin-bottom:20px;">',
    '<div style="flex:1;background:#fef9c3;padding:14px;border-radius:8px;border-left:3px solid #ca8a04;">',
    '<div style="font-size:11px;color:#854d0e;text-transform:uppercase;letter-spacing:0.5px;">Pendientes</div>',
    '<div style="font-size:28px;font-weight:700;color:#854d0e;line-height:1;margin-top:4px;">' + pendientes.length + '</div>',
    '</div>',
    '<div style="flex:1;background:#dcfce7;padding:14px;border-radius:8px;border-left:3px solid #16a34a;">',
    '<div style="font-size:11px;color:#14532d;text-transform:uppercase;letter-spacing:0.5px;">Entregados</div>',
    '<div style="font-size:28px;font-weight:700;color:#14532d;line-height:1;margin-top:4px;">' + entregados.length + '</div>',
    '</div>',
    '<div style="flex:1;background:#e0e7ff;padding:14px;border-radius:8px;border-left:3px solid #4f46e5;">',
    '<div style="font-size:11px;color:#312e81;text-transform:uppercase;letter-spacing:0.5px;">Total semana</div>',
    '<div style="font-size:28px;font-weight:700;color:#312e81;line-height:1;margin-top:4px;">' + eventos.length + '</div>',
    '</div>',
    '</div>',
    '<table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">',
    '<thead style="background:#f1f5f9;"><tr>',
    '<th style="padding:10px 8px;text-align:left;font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">Fecha</th>',
    '<th style="padding:10px 8px;text-align:left;font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">Cliente</th>',
    '<th style="padding:10px 8px;text-align:left;font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">Tarea</th>',
    '<th style="padding:10px 8px;text-align:left;font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">Responsable</th>',
    '<th style="padding:10px 8px;text-align:left;font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">Estado</th>',
    '<th style="padding:10px 8px;text-align:left;font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">Accesos</th>',
    '</tr></thead><tbody>' + tablaEventos + '</tbody></table>',
    (webAppUrl ?
      '<div style="margin-top:24px;text-align:center;">' +
      '<a href="' + webAppUrl + '" style="background:#3b82f6;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;">Abrir Centro de Mando</a>' +
      '</div>' : ''),
    '<p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:24px;">Este correo se envía automáticamente cada lunes. Para dejar de recibirlo solicita al Coordinador desactivar tu cuenta.</p>',
    '</div></body></html>'].join("");
}

function _esc(s) { return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

/* ---------- Instalar trigger lunes 6:30 AM ---------- */
function instalarTriggerReporteSemanal() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "enviarReporteSemanalLunes") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("enviarReporteSemanalLunes")
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
  _alert("✅ Trigger semanal instalado: lunes ~6:00 AM");
}

/* ---------- Probar el correo ahora (envío a quien ejecuta) ---------- */
function probarReporteSemanal() {
  var email = _usuarioActual();
  if (!email) { _alert("Sin email de sesión"); return; }
  var ss = _getSS();
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var dow = hoy.getDay();
  var diasAtras = (dow === 0) ? 6 : dow - 1;
  var lunes = new Date(hoy.getTime() - diasAtras * 86400000);
  var domingo = new Date(lunes.getTime() + 7 * 86400000 - 1000);

  var cron = ss.getSheetByName(CRON_CFG.HOJA_CRONOGRAMA);
  var lastRow = cron.getLastRow();
  var datos = cron.getRange(CRON_CFG.CR_FILA_INI, 1, lastRow - CRON_CFG.CR_FILA_INI + 1, 20).getValues();
  var richArch = cron.getRange(CRON_CFG.CR_FILA_INI, CRON_CFG.CR_COL_ARCH,
                               lastRow - CRON_CFG.CR_FILA_INI + 1, 1).getRichTextValues();
  var eventos = [];
  for (var i = 0; i < datos.length; i++) {
    var fi = datos[i][CRON_CFG.CR_COL_FECHAI - 1];
    if (!(fi instanceof Date)) continue;
    var fiDay = new Date(fi); fiDay.setHours(0,0,0,0);
    if (fiDay < lunes || fiDay > domingo) continue;
    var urlArch = _extraerUrlSmartChip(richArch[i][0], datos[i][CRON_CFG.CR_COL_ARCH - 1]);
    var fileId = urlArch ? _extraerIdDesdeUrl(urlArch) : "";
    var cliente = String(datos[i][CRON_CFG.CR_COL_CLIENTE - 1] || "");
    eventos.push({
      titulo: String(datos[i][CRON_CFG.CR_COL_TITULO - 1] || ""),
      cliente: cliente,
      responsable: String(datos[i][CRON_CFG.CR_COL_RESP - 1] || ""),
      fechaInicio: fi.getTime(),
      estado: (String(datos[i][CRON_CFG.CR_COL_ESTADO - 1] || "").toLowerCase().indexOf("entregado") !== -1) ? "Entregado"
            : (String(datos[i][CRON_CFG.CR_COL_ESTADO - 1] || "").toLowerCase().indexOf("proceso") !== -1) ? "En Proceso" : "Pendiente",
      prioridad: String(datos[i][CRON_CFG.CR_COL_PRIO - 1] || "Media"),
      urlArchivo: urlArch || "",
      wmsUrl: fileId ? obtenerLinkDirectoWMS(fileId, cliente) : null
    });
  }
  eventos.sort(function(a, b) { return a.fechaInicio - b.fechaInicio; });
  var html = _construirHtmlReporteSemanal(eventos, lunes, domingo);
  MailApp.sendEmail({
    to: email,
    subject: "[TEST] Reporte semanal — " + _fmtFecha(lunes) + " a " + _fmtFecha(domingo),
    htmlBody: html, name: "Centro de Mando · Itsanet UIO"
  });
  _alert("Correo de prueba enviado a " + email);
}


/* ==========================================================================
   GOOGLE CALENDAR INTEGRATION
   ========================================================================== */

function _calendarioOperativo() {
  // Usa el calendario principal del dueño. Si quieres uno dedicado, crea uno
  // con CalendarApp.createCalendar("Inventarios Itsanet") y guarda su ID.
  return CalendarApp.getDefaultCalendar();
}

function crearEventoEnCalendar(datos) {
  // datos = { titulo, cliente, responsable, fechaInicio:'YYYY-MM-DD', duracion:8 (horas), emailResp, fileUrl }
  try {
    var cal = _calendarioOperativo();
    if (!cal) return { ok: false, mensaje: "Sin calendario" };
    var f = new Date(datos.fechaInicio + "T08:00:00");
    var dur = parseInt(datos.duracion || 8, 10);
    var fin = new Date(f.getTime() + dur * 3600 * 1000);
    var desc = "Inventario para " + datos.cliente + "\n" +
               "Responsable: " + datos.responsable + "\n" +
               (datos.fileUrl ? "Archivo: " + datos.fileUrl + "\n" : "") +
               (datos.wmsUrl ? "Terminal WMS: " + datos.wmsUrl + "\n" : "");
    var ev = cal.createEvent("📦 " + datos.titulo, f, fin, {
      description: desc,
      guests: datos.emailResp || "",
      sendInvites: true
    });
    return { ok: true, eventId: ev.getId(), htmlLink: "https://calendar.google.com/calendar/u/0/r/eventedit/" + ev.getId() };
  } catch (e) {
    return { ok: false, mensaje: e.message };
  }
}


/* ==========================================================================
   SELECTOR ZIP HTML — reemplazo de prepararDescargaZip basado en filas
   ========================================================================== */

function lanzarSelectorZip() {
  _requiereRol(["Coordinador", "Líder de Conteo", "Auditor"]);
  var html = HtmlService.createHtmlOutputFromFile("SelectorZip")
    .setWidth(800).setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, "📦 Seleccionar inventarios a descargar");
}

function obtenerListadoParaSelectorZip() {
  _requiereRol(["Coordinador", "Líder de Conteo", "Auditor"]);
  var ss = _getSS();
  var p = ss.getSheetByName(CRON_CFG.HOJA_PANEL || "PANEL DE CONTROL");
  if (!p) p = ss.getSheetByName("PANEL DE CONTROL");
  if (!p || p.getLastRow() < 2) return [];
  var data = p.getRange(2, 1, p.getLastRow() - 1, 7).getValues();
  var resultado = [];
  for (var i = 0; i < data.length; i++) {
    var cliente = String(data[i][0] || "").trim();
    var nombreFile = String(data[i][1] || "").trim(); // Smart chip muestra título
    var fileId = extractIdFromUrl(data[i][2]);
    if (!fileId) continue;
    var fechaIni = data[i][3];
    var avance = String(data[i][6] || "").trim();
    resultado.push({
      fila: i + 2,
      cliente: cliente,
      nombre: nombreFile,
      fileId: fileId,
      fecha: fechaIni instanceof Date ? Utilities.formatDate(fechaIni, Session.getScriptTimeZone(), "yyyy-MM-dd") : "",
      avance: avance
    });
  }
  // Más recientes primero
  resultado.sort(function(a, b) { return (b.fecha || "").localeCompare(a.fecha || ""); });
  return resultado;
}

function procesarSelectorZip(idsSeleccionados) {
  _requiereRol(["Coordinador", "Líder de Conteo", "Auditor"]);
  if (!idsSeleccionados || idsSeleccionados.length === 0) throw new Error("No seleccionaste inventarios.");
  var token = ScriptApp.getOAuthToken();
  var blobs = [];
  var errores = [];
  var usados = {};
  idsSeleccionados.forEach(function(item) {
    try {
      var url = "https://docs.google.com/spreadsheets/export?id=" + item.fileId + "&exportFormat=xlsx";
      var resp = UrlFetchApp.fetch(url, {
        headers: { Authorization: "Bearer " + token },
        muteHttpExceptions: true
      });
      if (resp.getResponseCode() === 200) {
        var blob = resp.getBlob();
        var nombre = (item.nombre || item.cliente || item.fileId).replace(/[^A-Za-z0-9_\-]/g, "_");
        if (usados[nombre]) { usados[nombre]++; nombre += "_" + usados[nombre]; } else { usados[nombre] = 1; }
        blob.setName(nombre + ".xlsx");
        blobs.push(blob);
      } else {
        errores.push({ nombre: item.nombre, motivo: "HTTP " + resp.getResponseCode() });
      }
    } catch (e) {
      errores.push({ nombre: item.nombre, motivo: e.message });
    }
  });
  if (blobs.length === 0) throw new Error("No se pudo descargar ningún archivo. " + JSON.stringify(errores));
  var zipName = "Inventarios_" + Utilities.formatDate(new Date(), "GMT-5", "yyyyMMdd_HHmm") + ".zip";
  var zipBlob = Utilities.zip(blobs, zipName);
  return {
    base64: Utilities.base64Encode(zipBlob.getBytes()),
    fileName: zipName,
    procesados: blobs.length,
    errores: errores
  };
}


/* ==========================================================================
   ======== FASE 5 — Correo editable · QR · Plantilla con preview ===========
   ========================================================================== */

/* ---------- URL del QR del deep-link WMS (vía quickchart, gratis) ---------- */
function _qrUrl(text, size) {
  if (!text) return "";
  size = size || 220;
  return "https://quickchart.io/qr?text=" + encodeURIComponent(text) +
         "&size=" + size + "&margin=2&dark=1e293b&light=ffffff";
}

/* ---------- USUARIOS_BASE_WMS: réplica del USUARIOS_BASE del proyecto WMS ----------
   Sincronizar manualmente con el USUARIOS_BASE en el Código.gs del proyecto WMS.
   Cuando se consoliden los proyectos esto desaparece. */
var USUARIOS_BASE_WMS = {
  "aquiroz@itsanet.com":          { nombre: "Quiroz Andres",     rol: "ADMIN" },
  "bespinoza@itsanet.com":        { nombre: "Espinosa Bryan",    rol: "ADMIN" },
  "ingresosuio4@itsanet.com":     { nombre: "Suquilanda Ruben",  rol: "OPERADOR" },
  "ingresosuio1@itsanet.com":     { nombre: "Ochoa Danny",       rol: "ADMIN" },
  "ingresosuio6@itsanet.com":     { nombre: "Males Dennis",      rol: "ADMIN" },
  "inventarioopuio@itsanet.com":  { nombre: "Danilo Almachi",    rol: "ADMIN" },
  "ingresosuio2@itsanet.com":     { nombre: "Villegas Kevin",    rol: "OPERADOR" },
  "fmorales@itsanet.com":         { nombre: "Morales Fabian",    rol: "OPERADOR" },
  "bodegafarma@itsanet.com":      { nombre: "Monroy Leonardo",   rol: "OPERADOR" },
  "ccarrera@itsanet.com":         { nombre: "Carrera Cristian",  rol: "OPERADOR" }
};


/* ---------- Lista de emails del equipo (combina hoja USUARIOS + USUARIOS_BASE_WMS) ---------- */
function listarEmailsEquipo() {
  var ss = _getSS();
  var mapa = {};

  // 1. USUARIOS_BASE_WMS (siempre disponible)
  for (var em in USUARIOS_BASE_WMS) {
    mapa[em.toLowerCase()] = {
      email: em, nombre: USUARIOS_BASE_WMS[em].nombre,
      rol: USUARIOS_BASE_WMS[em].rol, fuente: "WMS"
    };
  }

  // 2. Hoja USUARIOS (sobrescribe / agrega)
  var sh = ss.getSheetByName(USR_CFG.HOJA);
  if (sh && sh.getLastRow() > 1) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
    v.forEach(function(r) {
      var em = String(r[0] || "").trim();
      var nm = String(r[1] || "").trim();
      var activo = (r[4] === true || String(r[4]).toUpperCase() === "TRUE" || r[4] === "");
      if (em && activo && em.indexOf("@") !== -1) {
        mapa[em.toLowerCase()] = {
          email: em, nombre: nm || em.split("@")[0],
          rol: String(r[2] || "").trim(), fuente: "USUARIOS"
        };
      }
    });
  }

  // 3. EQUIPO_OPERATIVO como fallback adicional
  try {
    var eq = ss.getSheetByName(CRON_CFG.HOJA_EQUIPO);
    if (eq && eq.getLastRow() > 1) {
      var ve = eq.getRange(2, 1, eq.getLastRow() - 1, 3).getValues();
      ve.forEach(function(r) {
        var em = String(r[1] || "").trim();
        if (em && em.indexOf("@") !== -1 && !mapa[em.toLowerCase()]) {
          mapa[em.toLowerCase()] = {
            email: em, nombre: String(r[0] || "").trim() || em.split("@")[0],
            rol: String(r[2] || "").trim(), fuente: "EQUIPO"
          };
        }
      });
    }
  } catch (e) {}

  // Convertir a array ordenado por nombre
  return Object.keys(mapa).map(function(k){ return mapa[k]; })
    .sort(function(a, b) { return a.nombre.localeCompare(b.nombre); });
}

/* ---------- Plantilla profesional para correo de inicio de inventario ---------- */
function obtenerPlantillaCorreoInventario(datos) {
  // datos = { fileId, cliente, fileName, fileUrl, wmsUrl, responsable,
  //           totalCodigos, codigosSinStock:[...] (array de SKUs) }
  var hoy = new Date();
  var fechaTxt = Utilities.formatDate(hoy, Session.getScriptTimeZone(), "dd/MM/yyyy");
  var horaTxt  = Utilities.formatDate(hoy, Session.getScriptTimeZone(), "HH:mm");
  var cliente  = datos.cliente || "—";
  var asunto = "Inicio de Inventario · " + cliente + " · " + (datos.fileName || "");

  var totalCod   = datos.totalCodigos != null ? datos.totalCodigos : "—";
  var sinStock   = Array.isArray(datos.codigosSinStock) ? datos.codigosSinStock : [];
  var sinStockCnt = sinStock.length;
  var totalContar = (typeof totalCod === "number" && typeof sinStockCnt === "number")
    ? Math.max(0, totalCod - sinStockCnt) : "—";

  // Cuerpo en texto plano (lo que ve el operario para editar)
  var lineas = [
    "Estimados,",
    "",
    "Por medio de la presente, se comunica el inicio formal del Inventario del cliente " + cliente + ", conforme a la planificación previamente establecida.",
    "",
    "El día de hoy, " + fechaTxt + ", a las " + horaTxt + ", se realizó la extracción de la base de datos desde el sistema, la cual será considerada como la base oficial para la elaboración de la plantilla de conteo y control. Dicho archivo será compartido con los equipos responsables para su correcta utilización durante el proceso de inventario.",
    "",
    "Es importante indicar que la base de datos contempla la información actualizada y validada hasta el momento de su extracción, garantizando que el conteo físico se ejecute de manera precisa y alineada con los registros del sistema.",
    "",
    "Durante la ejecución del inventario, se aplicarán los procedimientos establecidos para el levantamiento de información, validación de diferencias y registro de novedades, asegurando la trazabilidad y transparencia del proceso.",
    "",
    "Quedamos atentos para atender cualquier inquietud o requerimiento adicional que se presente durante el desarrollo de las actividades.",
    "",
    "Códigos considerados: " + totalCod,
    "Códigos sin stock: " + sinStockCnt,
    ""
  ];

  if (sinStockCnt > 0 && sinStockCnt <= 50) {
    lineas.push("Listado de códigos sin stock:");
    sinStock.forEach(function(sku){ lineas.push("  • " + sku + " — NO STOCK"); });
    lineas.push("");
  } else if (sinStockCnt > 50) {
    lineas.push("(Lista de " + sinStockCnt + " códigos sin stock disponible en el archivo Excel)");
    lineas.push("");
  }

  lineas.push("Total a contar: " + totalContar);
  lineas.push("");
  lineas.push("Link de acceso ITSANET IMS:");
  lineas.push(datos.wmsUrl || "(URL no configurada)");
  lineas.push("");
  if (datos.fileUrl) {
    lineas.push("Archivo Excel del operativo:");
    lineas.push(datos.fileUrl);
    lineas.push("");
  }
  lineas.push("Quedamos atentos a cualquier requerimiento adicional durante la ejecución del proceso.");
  lineas.push("");
  lineas.push("Saludos cordiales,");

  return {
    asunto: asunto,
    cuerpo: lineas.join("\n"),
    qrUrl: datos.wmsUrl ? _qrUrl(datos.wmsUrl, 240) : "",
    sinStockTabla: sinStock // para que el frontend pueda renderizar la tabla bonita en HTML
  };
}

/* ---------- Enviar el correo desde el sistema (con QR adjunto inline) ---------- */
function enviarCorreoInventarioIniciado(payload) {
  // payload = { destinatarios:[...], asunto, cuerpo, datos:{cliente,fileName,fileUrl,wmsUrl,sinStock:[...],totalCodigos} }
  if (!payload.destinatarios || payload.destinatarios.length === 0) {
    throw new Error("Indica al menos un destinatario.");
  }
  if (!payload.asunto || !payload.cuerpo) {
    throw new Error("Asunto y cuerpo son obligatorios.");
  }

  var d = payload.datos || {};
  var qrUrl = d.wmsUrl ? _qrUrl(d.wmsUrl, 220) : "";
  var sinStock = Array.isArray(d.codigosSinStock) ? d.codigosSinStock : [];

  // El cuerpo de texto del usuario se respeta. Convertimos saltos y URLs a HTML.
  var cuerpoHtml = String(payload.cuerpo || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>")
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1a73e8;text-decoration:none;">$1</a>');

  // Tabla de códigos sin stock (estilo profesional como imagen referencia)
  var tablaHtml = "";
  if (sinStock.length > 0 && sinStock.length <= 50) {
    tablaHtml = '<table style="border-collapse:collapse;margin:8px 0 16px 0;width:280px;font-size:12px;">' +
      '<thead><tr>' +
      '<th style="background:#1f4e78;color:#ffffff;padding:6px 10px;text-align:left;border:1px solid #1f4e78;">LISTA</th>' +
      '<th style="background:#1f4e78;color:#ffffff;padding:6px 10px;text-align:left;border:1px solid #1f4e78;">STOCK</th>' +
      '</tr></thead><tbody>';
    sinStock.forEach(function(sku, i) {
      var bg = i % 2 === 0 ? "#dbe5f1" : "#ffffff";
      tablaHtml += '<tr>' +
        '<td style="background:' + bg + ';padding:5px 10px;border:1px solid #b4c7e7;font-family:ui-monospace,monospace;">' + _esc(sku) + '</td>' +
        '<td style="background:' + bg + ';padding:5px 10px;border:1px solid #b4c7e7;color:#c00;font-weight:600;">NO STOCK</td>' +
      '</tr>';
    });
    tablaHtml += '</tbody></table>';
  }

  // Si el cuerpo del usuario menciona "Códigos sin stock:" y hay tabla, la insertamos justo después.
  if (tablaHtml && /Códigos sin stock:/i.test(payload.cuerpo)) {
    cuerpoHtml = cuerpoHtml.replace(/(Códigos sin stock:[^<]*<br>)/i, "$1" + tablaHtml);
  } else if (tablaHtml) {
    cuerpoHtml += "<br>" + tablaHtml;
  }

  var html = [
    '<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#ffffff;color:#202124;">',
    '<div style="max-width:720px;margin:0 auto;padding:18px;">',
    '<table style="width:100%;border-collapse:collapse;"><tr>',
    '<td style="vertical-align:top;padding:0 14px 0 0;font-size:13px;line-height:1.55;color:#202124;">',
    cuerpoHtml,
    '</td>'
  ];
  if (qrUrl) {
    html.push(
      '<td style="vertical-align:top;width:220px;text-align:center;background:#f8f9fa;padding:14px;border-radius:6px;">',
      '<div style="font-size:11px;color:#5f6368;text-transform:uppercase;letter-spacing:0.5px;font-weight:bold;margin-bottom:8px;">QR · ITSANET IMS</div>',
      '<img src="' + qrUrl + '" alt="QR del inventario" style="width:180px;height:180px;display:block;margin:0 auto;background:#ffffff;padding:6px;border:1px solid #dadce0;">',
      '<div style="font-size:10px;color:#5f6368;margin-top:6px;line-height:1.4;">Escanear desde móvil<br>para entrar como Auditor</div>',
      '</td>'
    );
  }
  html.push(
    '</tr></table>',
    '</div></body></html>'
  );

  try {
    // FIX FASE 8.36: el envío fallaba con bcc y sin 'to'. Ahora enviamos a los
    // destinatarios en 'to' (estilo correo normal), con el remitente vinculado al
    // usuario actual (name + replyTo) ya que MailApp envía desde la cuenta dueña.
    var yo = "", nombreYo = "";
    try { yo = String(_usuarioActual() || "").trim(); } catch (eu) {}
    try { var uYo = yo ? _obtenerUsuario(yo) : null; if (uYo && uYo.nombre) nombreYo = uYo.nombre; } catch (eu2) {}

    var opts = {
      to: payload.destinatarios.join(","),
      subject: payload.asunto,
      htmlBody: html.join(""),
      name: (payload.remitenteNombre || nombreYo || "Centro de Mando · Itsanet UIO")
    };
    if (yo && yo.indexOf("@") !== -1) opts.replyTo = yo;

    MailApp.sendEmail(opts);
    _guardarDestinatariosRecientes(payload.destinatarios);   // FIX 8.36: recordar recientes
    _registrarActividad(_usuarioActual(), "correo_inicio_inventario", "",
      "Cliente: " + (d.cliente || "") +
      " · Destinatarios: " + payload.destinatarios.length);
    return { ok: true, enviados: payload.destinatarios.length };
  } catch (e) {
    throw new Error("Falló el envío: " + e.message);
  }
}

/* ==========================================================================
   FIX FASE 8.36: destinatarios recientes por usuario (autocompletado estilo Gmail
   entre compañeros, sin permisos nuevos). Se guardan en ScriptProperties con
   clave por usuario activo, porque en una Web App "ejecutar como dueño" los
   UserProperties son del dueño (no del operario que usa la app).
   ========================================================================== */
function _mailRecientesKey() {
  var u = "";
  try { u = String(Session.getActiveUser().getEmail() || "").toLowerCase(); } catch (e) {}
  if (!u) { try { u = String(_usuarioActual() || "").toLowerCase(); } catch (e) {} }
  return "MAIL_RECIENTES_" + (u || "anon");
}

function obtenerDestinatariosRecientes() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_mailRecientesKey());
    var arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

/* ==========================================================================
   FIX FASE 8.37: contactos de Google DESACTIVADO.
   Los scopes directory.readonly / contacts.other.readonly obligaban a RE-AUTORIZAR
   el script y eso CONGELABA el WMS ("Error de permisos. Autoriza el script…").
   Para que todo funcione sin fricción se retiran esos scopes y esta función
   devuelve [] (el autocompletado del correo sigue con equipo + recientes).
   Si en el futuro se quieren contactos de Google, hay que volver a añadir los
   scopes y RE-AUTORIZAR la cuenta dueña una vez.
   ========================================================================== */
function buscarContactosGoogle(query) {
  return [];
}

function _buscarContactosGoogle_DESACTIVADO(query) {
  query = String(query || "").trim();
  if (query.length < 2) return [];
  var token;
  try { token = ScriptApp.getOAuthToken(); } catch (e) { return []; }
  var headers = { Authorization: "Bearer " + token };
  var seen = {}, out = [];
  function add(nm, em, tag) {
    em = String(em || "").trim().toLowerCase();
    if (!em || em.indexOf("@") === -1 || seen[em]) return;
    seen[em] = true; out.push({ nombre: nm || em, email: em, rol: tag });
  }
  // 1) Directorio del dominio (colegas)
  try {
    var u1 = "https://people.googleapis.com/v1/people:searchDirectoryPeople" +
      "?query=" + encodeURIComponent(query) +
      "&readMask=names,emailAddresses" +
      "&sources=DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE&pageSize=12";
    var r1 = UrlFetchApp.fetch(u1, { headers: headers, muteHttpExceptions: true });
    if (r1.getResponseCode() === 200) {
      var d1 = JSON.parse(r1.getContentText());
      (d1.people || []).forEach(function (p) {
        var em = (p.emailAddresses && p.emailAddresses[0] && p.emailAddresses[0].value) || "";
        var nm = (p.names && p.names[0] && p.names[0].displayName) || em;
        add(nm, em, "directorio");
      });
    }
  } catch (e) {}
  // 2) Otros contactos (personas a las que se ha escrito)
  try {
    var u2 = "https://people.googleapis.com/v1/otherContacts:search" +
      "?query=" + encodeURIComponent(query) +
      "&readMask=names,emailAddresses&pageSize=10";
    var r2 = UrlFetchApp.fetch(u2, { headers: headers, muteHttpExceptions: true });
    if (r2.getResponseCode() === 200) {
      var d2 = JSON.parse(r2.getContentText());
      (d2.results || []).forEach(function (rr) {
        var p = rr.person || {};
        var em = (p.emailAddresses && p.emailAddresses[0] && p.emailAddresses[0].value) || "";
        var nm = (p.names && p.names[0] && p.names[0].displayName) || em;
        add(nm, em, "contacto");
      });
    }
  } catch (e) {}
  return out.slice(0, 20);
}

function _guardarDestinatariosRecientes(lista) {
  try {
    if (!lista || !lista.length) return;
    var props = PropertiesService.getScriptProperties();
    var key = _mailRecientesKey();
    var raw = props.getProperty(key);
    var prev = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(prev)) prev = [];
    var set = {}, merged = [];
    lista.concat(prev).forEach(function (e) {
      e = String(e || "").trim().toLowerCase();
      if (e && e.indexOf("@") !== -1 && !set[e]) { set[e] = true; merged.push(e); }
    });
    props.setProperty(key, JSON.stringify(merged.slice(0, 30)));
  } catch (e) {}
}


/* ==========================================================================
   ╔════════════════════════════════════════════════════════════════════════╗
   ║   SECCIÓN WMS — TERMINAL DE INVENTARIO CIEGO                           ║
   ║   Consolidado desde el proyecto independiente original.                ║
   ║   Mantiene toda la lógica histórica + fixes de fases 4 y 5.            ║
   ╚════════════════════════════════════════════════════════════════════════╝
   ========================================================================== */

/* ---------- CONFIGURACIÓN WMS ---------- */

// USUARIOS_BASE_WMS ya está definido arriba (en sección fase 6).
// Para compatibilidad con código WMS legado, alias:
var USUARIOS_BASE = USUARIOS_BASE_WMS;

// ID del libro maestro (compatibilidad con código WMS legado).
// _getSS() resuelve dinámicamente, así que esto es solo referencia.
var MASTER_DB_ID = "1Cq2AqRVAZJYmj_zs_zg8C63FPrgRBtJHaNcHWXygaPk";


/* ---------- Abrir Terminal WMS como modal en el libro ---------- */
function abrirInventarioCiego() {
  const html = HtmlService.createHtmlOutputFromFile("BlindInventory")
                .setTitle("TERMINAL WMS").setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, "TERMINAL DE INVENTARIO");
}


/* ---------- Mostrar QR de acceso a la Web App WMS ---------- */
function mostrarQR() {
  var url;
  try { url = ScriptApp.getService().getUrl(); } catch (e) { url = null; }
  if (!url) {
    SpreadsheetApp.getUi().alert("Primero implementa el proyecto como Aplicación Web.");
    return;
  }
  url = url.split("?")[0].replace(/\/dev$/, "/exec");
  const qrUrl = "https://quickchart.io/qr?text=" + encodeURIComponent(url) + "&size=300";
  const html = HtmlService.createHtmlOutput(
    '<div style="text-align:center;font-family:sans-serif;">' +
      '<img src="' + qrUrl + '" width="220"/><br><br>' +
      '<b>Escanea para abrir el sistema</b><br><br>' +
      '<a href="' + url + '" target="_blank">' + url + '</a><br><br>' +
      '<div style="background:#fef9c3;padding:10px;border-radius:5px;font-size:11px;color:#854d0e;">' +
      'Si sale "No se pudo abrir el archivo", usa pestaña Incógnito o revisa cuentas Google.</div>' +
    '</div>'
  ).setWidth(320).setHeight(480);
  SpreadsheetApp.getUi().showModalDialog(html, "Acceso permanente WMS");
}


/* ---------- Resolver spreadsheet objetivo (libro maestro o inventario) ---------- */
function getTargetSS(fileId) {
  if (fileId && fileId !== "LOCAL" && String(fileId).trim() !== "") {
    return SpreadsheetApp.openById(String(fileId).trim());
  }
  return _getSS();
}


/* ---------- Lista combinada de usuarios (base + temporales) ---------- */
function getTodosLosUsuarios() {
  var usuarios = JSON.parse(JSON.stringify(USUARIOS_BASE_WMS));  // respaldo (sin pass)
  // Los usuarios temporales del WMS se guardan en ScriptProperties
  var props = PropertiesService.getScriptProperties().getProperty("WMS_TEMP_USERS");
  if (props) {
    var tempUsers = JSON.parse(props);
    for (var em0 in tempUsers) usuarios[em0] = tempUsers[em0];
  }
  // FIX FASE 8.37 (consolidación): la HOJA USUARIOS es la FUENTE ÚNICA y SOBRESCRIBE
  // base/temp. Lee "Rol WMS" (col 8) y "Contraseña" (col 9) si existen; si no, mapea
  // desde el rol del panel y usa el pass previo (temp) o "1234". 100% retrocompatible:
  // hojas con 5-7 columnas se comportan igual que antes.
  try {
    var ss = _getSS();
    var sh = ss.getSheetByName(USR_CFG.HOJA);
    if (sh && sh.getLastRow() > 1) {
      var nc = Math.max(5, sh.getLastColumn());
      var v = sh.getRange(2, 1, sh.getLastRow() - 1, nc).getValues();
      v.forEach(function(r) {
        var em = String(r[0] || "").trim().toLowerCase();
        var nm = String(r[1] || "").trim();
        var rolHoja = String(r[2] || "").trim();
        var activo = (r[4] === true || String(r[4]).toUpperCase() === "TRUE" || r[4] === "");
        if (!em || em.indexOf("@") === -1 || !activo) return;
        var rolWms = (nc >= 8 && String(r[7] || "").trim())
          ? String(r[7]).trim().toUpperCase()
          : ((rolHoja === "Coordinador" || rolHoja === "Líder de Conteo") ? "ADMIN" : "OPERADOR");
        var pass = (nc >= 9 && String(r[8] || "").trim())
          ? String(r[8]).trim()
          : ((usuarios[em] && usuarios[em].pass) ? usuarios[em].pass : "1234");
        usuarios[em] = {
          nombre: nm || (usuarios[em] && usuarios[em].nombre) || em.split("@")[0],
          rol: rolWms, pass: pass, rolPanel: rolHoja
        };
      });
    }
  } catch (e) {}
  return usuarios;
}


/* ==========================================================================
   FIX FASE 8.37 — CONSOLIDACIÓN DE USUARIOS EN UNA SOLA LISTA (hoja USUARIOS)
   ==========================================================================
   La hoja USUARIOS del libro maestro pasa a ser la FUENTE ÚNICA para ambos
   sistemas (Centro de Control + Terminal WMS). Esquema único:
     A Email · B Nombre · C Rol (panel) · D Teléfono · E Activo ·
     F Fecha Ingreso · G Notas · H Rol WMS · I Contraseña
   consolidarUsuarios() es ADITIVO e IDEMPOTENTE: no borra ni cambia filas
   existentes; solo añade columnas/usuarios que falten. */
function consolidarUsuarios() {
  var ss = _getSS();
  var sh = ss.getSheetByName(USR_CFG.HOJA);
  if (!sh) { setupUsuarios(); sh = ss.getSheetByName(USR_CFG.HOJA); }
  if (!sh) throw new Error("No se pudo crear/abrir la hoja USUARIOS.");

  // 1) Esquema: encabezados de col 8 (Rol WMS) y col 9 (Contraseña) si faltan
  var anchoLeer = Math.max(9, sh.getLastColumn());
  var headers = sh.getRange(1, 1, 1, anchoLeer).getValues()[0];
  if (!String(headers[7] || "").trim()) sh.getRange(1, 8).setValue("Rol WMS");
  if (!String(headers[8] || "").trim()) sh.getRange(1, 9).setValue("Contraseña");
  sh.getRange(1, 1, 1, 9).setFontWeight("bold").setBackground("#1a73e8").setFontColor("#ffffff");
  var ruleW = SpreadsheetApp.newDataValidation()
    .requireValueInList(["ADMIN", "OPERADOR", "AUDITOR", "TEMPORAL"], true).build();
  sh.getRange(2, 8, 500, 1).setDataValidation(ruleW);

  // 2) Emails ya presentes (no se tocan)
  var existentes = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function(r){
      var e = String(r[0] || "").trim().toLowerCase(); if (e) existentes[e] = true;
    });
  }
  var nuevos = [];
  function añadir(email, nombre, rolPanel, rolWms, pass, nota) {
    var e = String(email || "").trim().toLowerCase();
    if (!e || e.indexOf("@") === -1 || existentes[e]) return;
    existentes[e] = true;
    nuevos.push([email, nombre, rolPanel, "", true, new Date(), nota, rolWms, pass]);
  }
  // 2a) Hardcodeados del WMS → a la hoja. CONTRASEÑA VACÍA a propósito: así el
  // Terminal WMS usa su contraseña REAL (de su USUARIOS_BASE) y NO se pisa nada.
  for (var em in USUARIOS_BASE_WMS) {
    var u = USUARIOS_BASE_WMS[em];
    var rolW = String(u.rol || "OPERADOR").toUpperCase();
    var rolPanel = (rolW === "ADMIN") ? "Líder de Conteo" : "Auditor";
    añadir(em, u.nombre, rolPanel, rolW, "", "Importado de USUARIOS_BASE_WMS");
  }
  // 2b) EQUIPO_OPERATIVO → a la hoja (contraseña vacía; se asigna solo si hace falta)
  try {
    var eq = ss.getSheetByName(CRON_CFG.HOJA_EQUIPO);
    if (eq && eq.getLastRow() > 1) {
      eq.getRange(2, 1, eq.getLastRow() - 1, 3).getValues().forEach(function(r){
        var nombre = String(r[0] || "").trim(), email = String(r[1] || "").trim();
        var rolEq = String(r[2] || "").trim();
        var rolPanel = rolEq.toLowerCase().indexOf("coordinador") !== -1 ? "Coordinador" : "Líder de Conteo";
        añadir(email, nombre, rolPanel, "ADMIN", "", "Importado de EQUIPO_OPERATIVO");
      });
    }
  } catch (e) {}

  if (nuevos.length) sh.getRange(sh.getLastRow() + 1, 1, nuevos.length, 9).setValues(nuevos);
  var msg = "✓ Consolidación lista. Usuarios añadidos: " + nuevos.length + ".\n\n" +
            "La hoja USUARIOS es ahora la lista única:\n" +
            "  • Rol panel = columna C\n  • Rol WMS = columna H\n  • Contraseña = columna I\n\n" +
            "Contraseñas: se dejaron VACÍAS a propósito → el Terminal WMS sigue usando las " +
            "contraseñas reales actuales (no se pisó ninguna). Solo llena la columna I si " +
            "quieres asignar/cambiar una contraseña para un usuario.";
  try { _alert(msg); } catch (e) {}
  return { ok: true, agregados: nuevos.length };
}

/* ---------- Listado unificado (solo lectura) para verlo en un solo lugar ---------- */
function obtenerListadoConsolidadoUsuarios() {
  _requiereRol(["Coordinador", "Líder de Conteo"]);
  var mapa = {};
  function put(email, nombre, rolPanel, rolWms, activo, fuente) {
    var e = String(email || "").trim().toLowerCase();
    if (!e || e.indexOf("@") === -1) return;
    if (!mapa[e]) mapa[e] = { email: e, nombre: "", rolPanel: "", rolWms: "", activo: activo !== false, fuentes: {} };
    var m = mapa[e];
    if (nombre && !m.nombre) m.nombre = nombre;
    if (rolPanel && !m.rolPanel) m.rolPanel = rolPanel;
    if (rolWms && !m.rolWms) m.rolWms = rolWms;
    m.fuentes[fuente] = true;
  }
  for (var em in USUARIOS_BASE_WMS)
    put(em, USUARIOS_BASE_WMS[em].nombre, "", String(USUARIOS_BASE_WMS[em].rol || "").toUpperCase(), true, "WMS_BASE");
  try {
    var tp = PropertiesService.getScriptProperties().getProperty("WMS_TEMP_USERS");
    if (tp) { var t = JSON.parse(tp); for (var e2 in t) put(e2, t[e2].nombre, "", String(t[e2].rol || "").toUpperCase(), true, "TEMP"); }
  } catch (e) {}
  try {
    var ss = _getSS(), sh = ss.getSheetByName(USR_CFG.HOJA);
    if (sh && sh.getLastRow() > 1) {
      var nc = Math.max(5, sh.getLastColumn());
      sh.getRange(2, 1, sh.getLastRow() - 1, nc).getValues().forEach(function(r){
        var activo = (r[4] === true || String(r[4]).toUpperCase() === "TRUE" || r[4] === "");
        var rolWms = nc >= 8 ? String(r[7] || "").trim().toUpperCase() : "";
        put(r[0], String(r[1] || "").trim(), String(r[2] || "").trim(), rolWms, activo, "USUARIOS");
      });
    }
  } catch (e) {}
  try {
    var ss2 = _getSS(), eq = ss2.getSheetByName(CRON_CFG.HOJA_EQUIPO);
    if (eq && eq.getLastRow() > 1)
      eq.getRange(2, 1, eq.getLastRow() - 1, 3).getValues().forEach(function(r){
        put(r[1], String(r[0] || "").trim(), String(r[2] || "").trim(), "", true, "EQUIPO");
      });
  } catch (e) {}
  return Object.keys(mapa).map(function(k){ var m = mapa[k]; m.fuentes = Object.keys(m.fuentes); return m; })
    .sort(function(a, b){ return (a.nombre || a.email).localeCompare(b.nombre || b.email); });
}


/* ---------- Configuración inicial de la app WMS (carga inventarios) ----------
   FIX FASE 8.37: BLINDADO para no congelar el WMS. Si algo falla (hoja, parseo,
   permisos parciales), devuelve igualmente una config válida con los usuarios
   base, de modo que el login del WMS SIEMPRE pueda mostrarse. */
function obtenerConfiguracionApp() {
  // Usuarios: nunca lanzar. Si getTodosLosUsuarios falla, caer a la base hardcodeada.
  var usersDb;
  try { usersDb = getTodosLosUsuarios(); }
  catch (e) { usersDb = JSON.parse(JSON.stringify(USUARIOS_BASE_WMS)); }
  var usuarios = Object.keys(usersDb).map(function(em){
    return { email: em, nombre: (usersDb[em] && usersDb[em].nombre) || em };
  }).sort(function(a,b){ return String(a.nombre).localeCompare(String(b.nombre)); });

  // Responsables: solo los del USUARIOS_BASE_WMS (no temporales)
  var responsables = Object.keys(USUARIOS_BASE_WMS).map(function(em){
    return { email: em, nombre: USUARIOS_BASE_WMS[em].nombre };
  }).sort(function(a,b){ return a.nombre.localeCompare(b.nombre); });

  var inventarios = [];
  try {
    var ss = _getSS(); // libro maestro
    var panel = ss.getSheetByName("PANEL DE CONTROL");
    if (panel) {
      var lastRow = panel.getLastRow();
      if (lastRow > 1) {
        var data = panel.getRange(2, 1, lastRow - 1, 7).getDisplayValues();
        inventarios = data.filter(function(r){ return r[2] && String(r[2]).length > 20; })
          .map(function(r){
            return {
              cliente: String(r[0]).trim() || "SIN CLIENTE",
              link:    String(r[1]).trim(),
              id:      String(r[2]).trim(),
              fecha:   String(r[3]).trim(),
              avance:  String(r[6]).trim() || "0%"
            };
          });
      }
    }
  } catch (e) { Logger.log("obtenerConfiguracionApp: " + e.message); }

  if (inventarios.length === 0) {
    inventarios = [{ cliente: "LOCAL", link: "Inventario Actual", id: "LOCAL", fecha: "", avance: "" }];
  }
  return { usuarios: usuarios, responsables: responsables, inventarios: inventarios };
}


/* ==========================================================================
   INTEGRACIÓN API ITSANET (FIX FASE 8.37) — andamiaje listo para conectar
   --------------------------------------------------------------------------
   ► DÓNDE VAN LAS CREDENCIALES (NO se escriben en el código; van en Propiedades):
     Apps Script  →  ⚙ Configuración del proyecto  →  "Propiedades del script"  →
     Agregar propiedad, según cómo autentique la API de ITSANET:
       • Si usa API KEY:
           ITSANET_API_BASE = https://api.itsanet.com        (URL base, sin / final)
           ITSANET_API_KEY  = <tu_api_key>
       • Si usa OAuth2 (client_credentials / token):
           ITSANET_API_BASE      = https://api.itsanet.com
           ITSANET_TOKEN_URL     = https://api.itsanet.com/oauth/token
           ITSANET_CLIENT_ID     = <client_id>
           ITSANET_CLIENT_SECRET = <client_secret>
     (Alternativa: completar y ejecutar UNA vez setupCredencialesItsanet(), luego
      borrar los valores del código para no dejar secretos en el repositorio.)
   ► El permiso de red (script.external_request) YA está habilitado en appsscript.json.
   ► CÓMO USARLA: llama itsanetApi('/ruta', 'get'|'post', body). Ejemplos abajo.
   ========================================================================== */

function setupCredencialesItsanet() {
  // Completa SOLO lo que use tu API, ejecútalo una vez desde el editor y luego
  // vuelve a vaciar los valores (quedan guardados en Propiedades del script).
  PropertiesService.getScriptProperties().setProperties({
    "ITSANET_API_BASE": "",        // p.ej. https://api.itsanet.com
    "ITSANET_API_KEY": "",         // si la API usa API key
    "ITSANET_TOKEN_URL": "",       // si usa OAuth2
    "ITSANET_CLIENT_ID": "",
    "ITSANET_CLIENT_SECRET": ""
  }, false);
  return "Credenciales ITSANET guardadas en Propiedades del script.";
}

// Obtiene (y cachea) el token OAuth2. Devuelve null si la API usa API key.
function _itsanetToken() {
  var p = PropertiesService.getScriptProperties();
  var tokenUrl = p.getProperty("ITSANET_TOKEN_URL");
  if (!tokenUrl) return null;                       // → se usará API key
  var cache = CacheService.getScriptCache();
  var cached = cache.get("ITSANET_TOKEN");
  if (cached) return cached;
  var resp = UrlFetchApp.fetch(tokenUrl, {
    method: "post",
    payload: {
      grant_type: "client_credentials",
      client_id: p.getProperty("ITSANET_CLIENT_ID") || "",
      client_secret: p.getProperty("ITSANET_CLIENT_SECRET") || ""
    },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200)
    throw new Error("ITSANET token " + resp.getResponseCode() + ": " + resp.getContentText());
  var data = JSON.parse(resp.getContentText());
  var ttl = Math.max(60, (data.expires_in || 3600) - 60);
  cache.put("ITSANET_TOKEN", data.access_token, ttl);
  return data.access_token;
}

// Llamada genérica a la API ITSANET. Maneja Bearer (OAuth2) o x-api-key.
function itsanetApi(path, method, body) {
  var p = PropertiesService.getScriptProperties();
  var base = p.getProperty("ITSANET_API_BASE");
  if (!base) throw new Error("Falta ITSANET_API_BASE en Propiedades del script (ver setupCredencialesItsanet).");
  var headers = {};
  var token = _itsanetToken();
  if (token) headers["Authorization"] = "Bearer " + token;            // OAuth2
  else if (p.getProperty("ITSANET_API_KEY")) headers["x-api-key"] = p.getProperty("ITSANET_API_KEY"); // API key
  var opt = { method: method || "get", headers: headers, muteHttpExceptions: true, contentType: "application/json" };
  if (body) opt.payload = JSON.stringify(body);
  var resp = UrlFetchApp.fetch(base + path, opt);
  var code = resp.getResponseCode();
  if (code < 200 || code >= 300) throw new Error("ITSANET API " + code + ": " + resp.getContentText());
  var txt = resp.getContentText();
  try { return JSON.parse(txt); } catch (e) { return txt; }
}

// Prueba rápida desde el editor: cambia '/health' por un endpoint real.
function itsanetProbar() { return itsanetApi("/health", "get"); }


/* ---------- Base de códigos EAN13 (lectura del CSV en Drive) ---------- */
function obtenerBaseEAN(clienteActual) {
  // FIX FASE 8.37: si hay API ITSANET configurada (Propiedades del script), se usa
  // la API por token; si no, se mantiene el CSV de Drive (comportamiento actual).
  try {
    if (PropertiesService.getScriptProperties().getProperty("ITSANET_API_BASE")) {
      var apiRes = _obtenerBaseEAN_desdeItsanet(clienteActual);
      if (apiRes && !apiRes.error && apiRes.data && Object.keys(apiRes.data).length) return apiRes;
      // si la API falla o viene vacía, NO rompemos: caemos al CSV de respaldo.
    }
  } catch (eApi) {}
  try {
    var iter = DriveApp.searchFiles("title contains 'RL_PRODUCTO_CODIGOS EAN13'");
    if (!iter.hasNext()) return { error: "Archivo EAN no encontrado en Drive." };

    var file = null, lastUpdated = 0;
    while (iter.hasNext()) {
      var f = iter.next();
      if (f.getLastUpdated().getTime() > lastUpdated) { file = f; lastUpdated = f.getLastUpdated().getTime(); }
    }

    var csvContent = file.getBlob().getDataAsString();
    var delimiter = csvContent.indexOf(";") > -1 ? ";" : ",";
    var lines = csvContent.split(/\r?\n/);
    var eanMap = {};
    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var parts = line.split(delimiter);
      if (parts.length >= 3) {
        var clienteDB = String(parts[0]).trim().toUpperCase();
        if (!clienteActual || clienteActual === "TODOS" || clienteDB === String(clienteActual).trim().toUpperCase()) {
          var realSku = String(parts[1]).trim().toUpperCase();
          var codigoEAN = String(parts[2]).trim().toUpperCase();
          if (codigoEAN && realSku) eanMap[codigoEAN] = realSku;
        }
      }
    }
    return { data: eanMap };
  } catch (e) { return { error: "Error leyendo EAN: " + e.message }; }
}

/* ---------- FIX FASE 8.37: base EAN→SKU desde la API de ITSANET (por token) ----------
   👉 ADAPTA dos cosas a tu API real:
      (1) la RUTA del endpoint que devuelve productos con EAN y SKU,
      (2) los NOMBRES de campo (ean / sku) según el JSON que regrese tu API.
   Devuelve { data: { "EAN": "SKU", ... } } igual que el CSV. */
function _obtenerBaseEAN_desdeItsanet(clienteActual) {
  try {
    // (1) 👇 CAMBIA la ruta por el endpoint real de ITSANET:
    var resp = itsanetApi("/productos?cliente=" + encodeURIComponent(clienteActual || ""), "get");
    // La respuesta puede venir como array directo o dentro de data/items/productos:
    var lista = (resp && (resp.data || resp.items || resp.productos)) || resp || [];
    if (!Array.isArray(lista)) lista = [];
    var eanMap = {};
    lista.forEach(function(p){
      // (2) 👇 AJUSTA los nombres de campo a los de tu API:
      var ean = String(p.ean || p.codigoEAN || p.barcode || p.EAN || "").trim().toUpperCase();
      var sku = String(p.sku || p.codigo || p.realSku || p.SKU || "").trim().toUpperCase();
      if (ean && sku) eanMap[ean] = sku;
    });
    return { data: eanMap };
  } catch (e) { return { error: "API ITSANET: " + e.message }; }
}


/* ---------- Validar credenciales WMS ---------- */
function validarCredenciales(email, password) {
  var usersDb = getTodosLosUsuarios();
  var user = usersDb[String(email).trim().toLowerCase()] || usersDb[email];
  if (user && user.pass === password) {
    return { exito: true, nombre: user.nombre, rol: user.rol, email: email };
  }
  return { exito: false, mensaje: "Contraseña incorrecta o usuario no encontrado." };
}

/* ---------- FIX FASE 8.37: sesión del WMS con el GMAIL ACTUAL (igual que el Panel) ----------
   Permite que el Terminal WMS entre SIN pedir correo+contraseña cuando se abre con la
   cuenta Google ya logueada (la misma sesión del Panel de Control). Devuelve la
   identidad y el rol WMS. Si el Gmail no está registrado, entra como AUDITOR (lectura).
   La Web App corre como dueño con acceso de DOMINIO, por lo que getActiveUser() es el
   correo del usuario que accede. */
function obtenerSesionWMSActual() {
  var email = "";
  try { email = Session.getActiveUser().getEmail() || ""; } catch (e) {}
  if (!email) { try { email = Session.getEffectiveUser().getEmail() || ""; } catch (e) {} }
  if (!email) return { autenticado: false };
  var emailN = String(email).trim().toLowerCase();
  var db = {};
  try { db = getTodosLosUsuarios(); } catch (e) {}
  var u = db[emailN] || db[email] || null;
  var rol = (u && u.rol) ? String(u.rol).toUpperCase() : "AUDITOR";
  var nombre = (u && u.nombre) ? u.nombre : emailN.split("@")[0];
  return { autenticado: true, email: emailN, nombre: nombre, rol: rol, registrado: !!u };
}


/* ---------- Registrar operario temporal ---------- */
function registrarNuevoUsuario(data) {
  var usersDb = getTodosLosUsuarios();
  var responsable = usersDb[data.responsable];
  if (!responsable || responsable.pass !== data.passResponsable) {
    return { exito: false, mensaje: "Contraseña del Responsable Incorrecta. Creación denegada." };
  }
  if (usersDb[data.email]) {
    return { exito: false, mensaje: "El correo ya está registrado." };
  }
  var props = PropertiesService.getScriptProperties();
  var tempUsersStr = props.getProperty("WMS_TEMP_USERS");
  var tempUsers = tempUsersStr ? JSON.parse(tempUsersStr) : {};
  tempUsers[data.email] = {
    nombre: data.nombre, rol: "TEMPORAL", pass: data.pass,
    responsable: data.responsable, inventario_apoyo: data.inventario
  };
  props.setProperty("WMS_TEMP_USERS", JSON.stringify(tempUsers));
  var updatedUsers = getTodosLosUsuarios();
  var usuariosArr = Object.keys(updatedUsers).map(function(em){
    return { email: em, nombre: updatedUsers[em].nombre };
  }).sort(function(a,b){ return a.nombre.localeCompare(b.nombre); });
  return { exito: true, mensaje: "Operario temporal creado con éxito. Ya puedes iniciar sesión.", usuarios: usuariosArr };
}


/* ---------- Visibilidad global Depot por archivo ---------- */
function toggleGlobalDepot(fileId, isVisible) {
  PropertiesService.getScriptProperties().setProperty("DEPOT_VIS_" + fileId, isVisible ? "1" : "0");
  notificarCambioBD(fileId);
}


/* ---------- Notificar cambio en BD para invalidar caches del cliente ---------- */
function notificarCambioBD(fileId) {
  CacheService.getScriptCache().put("WMS_UPDATE_" + fileId, Date.now().toString(), 21600);
}


/* ==========================================================================
   onEditWMS — handler de edición sobre archivos de inventario individuales
   FIX FASE 5: bloqueo de A/B/C desde fila 3 + mensaje correcto FECHA FINAL
   ========================================================================== */
function onEditWMS(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    var name  = sheet.getName();
    var row   = e.range.getRow();
    var col   = e.range.getColumn();
    if (row < 2) return;

    // REGISTRO inalterable
    if (name === "REGISTRO") {
      try {
        SpreadsheetApp.getActiveSpreadsheet().toast(
          "⛔ El registro de auditoría es INALTERABLE.", "Bloqueado", 3);
        if (e.oldValue !== undefined) e.range.setValue(e.oldValue);
        else e.range.clearContent();
      } catch (er) {}
      return;
    }

    if (name === "PLANILLA DE CONTEO FISICO") {

      // ───── FIX FASE 5: Bloquear A, B, C desde fila 3 ─────
      // Fila 2 = maestra (sí editable, propaga A y C; D se autogenera).
      // Fila 3+ en A/B/C → solo el sistema escribe ahí.
      if (row >= 3 && (col === 1 || col === 2 || col === 3)) {
        var nombreCol = col === 1 ? "FECHA INICIO" : col === 2 ? "FECHA FINAL" : "ID";
        try {
          SpreadsheetApp.getActiveSpreadsheet().toast(
            "⛔ " + nombreCol + " se genera automáticamente desde la fila 2.",
            "Edición bloqueada", 3);
          if (e.oldValue !== undefined) e.range.setValue(e.oldValue);
          else e.range.clearContent();
        } catch (er) {}
        return;
      }

      // Fila 2 col B (FECHA FINAL) siempre bloqueada
      if (row === 2 && col === 2) {
        if (e.value !== "" && e.value !== null) {
          try {
            SpreadsheetApp.getActiveSpreadsheet().toast(
              "⛔ FECHA FINAL es automática (se calcula al cerrar inventario).",
              "Bloqueado", 3);
            e.range.setValue(e.oldValue || "");
          } catch (er) {}
        }
        return;
      }

      // Conteos cerrados (cols V/W/X = 22/23/24)
      if ([22, 23, 24].indexOf(col) !== -1) {
        if (e.oldValue !== undefined && e.oldValue !== "" && e.value !== e.oldValue) {
          try {
            SpreadsheetApp.getActiveSpreadsheet().toast(
              "⛔ Conteo cerrado. Solicite RECONTEO o AJUSTE.", "Bloqueado", 3);
            e.range.setValue(e.oldValue);
          } catch (er) {}
          return;
        }
        verificarYActualizarColumnaB(sheet);
        registrarAccionManual(e, sheet, row, col);
      }

      // Fila 2 col A o C → propaga hacia abajo y regenera secuencia D
      if (row === 2 && (col === 1 || col === 3)) {
        actualizarColumnasAC(sheet);
        generarSecuenciaColumnaD(sheet);
      }

      // Edición de SKU (col G=7) → re-consolidar ABC
      if (col === 7) consolidarDatosWMS();
    }
  } catch (error) {
    Logger.log("onEditWMS error: " + error.message);
  }
}


/* ==========================================================================
   pollRealTime — polling cliente↔servidor para sincronización en tiempo real
   ========================================================================== */
function pollRealTime(posicionActual, emailUsuario, reqType, clientLastUpdate, fileId) {
  var cache = CacheService.getScriptCache();
  var activeUsers = [];
  var allUsers = getTodosLosUsuarios();

  if (emailUsuario && emailUsuario !== "INVITADO") {
    var usersObj = {};
    try { var cached = cache.get("WMS_USERS_" + fileId); if (cached) usersObj = JSON.parse(cached); } catch (e) {}
    usersObj[emailUsuario] = Date.now();
    var now = Date.now();
    for (var em in usersObj) {
      if (now - usersObj[em] < 35000) {
        activeUsers.push(allUsers[em] ? allUsers[em].nombre : em.split("@")[0]);
      } else delete usersObj[em];
    }
    cache.put("WMS_USERS_" + fileId, JSON.stringify(usersObj), 60);
  }

  var serverLastUpdateStr = cache.get("WMS_UPDATE_" + fileId);
  var serverLastUpdate = serverLastUpdateStr ? parseInt(serverLastUpdateStr) : null;
  if (serverLastUpdate === null) {
    serverLastUpdate = Date.now();
    cache.put("WMS_UPDATE_" + fileId, serverLastUpdate.toString(), 21600);
  }

  var payload = { activeUsers: activeUsers, serverLastUpdate: serverLastUpdate };
  payload.depotVisible = PropertiesService.getScriptProperties().getProperty("DEPOT_VIS_" + fileId) === "1";

  if (clientLastUpdate !== 0 && serverLastUpdate <= clientLastUpdate) {
    payload.unchanged = true;
    return payload;
  }
  payload.unchanged = false;

  try {
    var ss = getTargetSS(fileId);
    var sheet = ss.getSheetByName("PLANILLA DE CONTEO FISICO");
    if (!sheet) throw new Error("Falta hoja PLANILLA DE CONTEO FISICO");

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      payload.avance = 0; payload.textoAvance = "0/0 Refs";
      if (reqType === "HOME") payload.data = { exito: true, posiciones: [] };
      else if (reqType === "COUNT") payload.data = { exito: true, items: [], posicion: posicionActual };
      else if (reqType === "ANALYSIS") payload.data = {
        exito: true,
        kpis: { efectividadUnidades:0, efectividadRef:0, efectividadPos:0,
                uniValidadas:0, uniTotal:0, refValidadas:0, refTotal:0,
                posValidadas:0, posTotal:0 },
        discrepancias: []
      };
      return payload;
    }

    var fullData = sheet.getRange(2, 1, lastRow - 1, 28).getValues();

    // Avance global
    var tRef = 0, cRef = 0;
    for (var i = 0; i < fullData.length; i++) {
      var sku = String(fullData[i][6]).trim();
      var catLog = String(fullData[i][12]).trim().toUpperCase();
      var estadoFinal = String(fullData[i][19]).trim().toUpperCase();
      if (!sku || catLog === "DIF_INV") continue;
      tRef++;
      if (fullData[i][21] !== "" || fullData[i][22] !== "" || fullData[i][23] !== "" || estadoFinal === "CORRECTO") cRef++;
    }
    payload.avance = tRef === 0 ? 0 : Math.round((cRef / tRef) * 100);
    payload.textoAvance = cRef + " / " + tRef + " Refs";

    if (reqType === "HOME") payload.data = parseHomeData(fullData);
    else if (reqType === "COUNT" && posicionActual) payload.data = parseCountData(fullData, posicionActual);
    else if (reqType === "ANALYSIS") payload.data = parseAnalysisData(fullData);

  } catch (e) { payload.data = { exito: false, error: e.message }; }

  return payload;
}


/* ---------- Parser HOME (mapa de posiciones) ---------- */
function parseHomeData(data) {
  var mapaPos = {};
  for (var i = 0; i < data.length; i++) {
    var sku = String(data[i][6]).trim();
    var catLog = String(data[i][12]).trim().toUpperCase();
    var pos = String(data[i][14]).trim().toUpperCase();
    if (!pos || catLog === "DIF_INV" || !sku) continue;

    var estadoFinal = String(data[i][19]).trim().toUpperCase();
    var c1 = data[i][21], c2 = data[i][22], c3 = data[i][23];

    if (!mapaPos[pos]) {
      mapaPos[pos] = { nombre: pos, hasPendiente: false, hasCorrecto: false,
                       hasFaltante: false, hasSobrante: false, totalItems: 0, validadosItems: 0 };
    }
    mapaPos[pos].totalItems++;
    if (c1 !== "" || c2 !== "" || c3 !== "" || estadoFinal === "CORRECTO") mapaPos[pos].validadosItems++;
    if (estadoFinal === "PENDIENTE" || estadoFinal === "") mapaPos[pos].hasPendiente = true;
    else if (estadoFinal === "CORRECTO") mapaPos[pos].hasCorrecto = true;
    else if (estadoFinal === "FALTANTE") mapaPos[pos].hasFaltante = true;
    else if (estadoFinal === "SOBRANTE") mapaPos[pos].hasSobrante = true;
  }

  var posicionesArray = [];
  for (var p in mapaPos) {
    var m = mapaPos[p];
    var classColor = "", catName = "", priority = 99;
    var pctPos = m.totalItems === 0 ? 0 : Math.round((m.validadosItems / m.totalItems) * 100);
    if (m.hasFaltante && m.hasSobrante) { catName = "MIXTO (Falt/Sob)"; classColor = "var(--orange)"; priority = 1; }
    else if (m.hasFaltante) { catName = "FALTANTES"; classColor = "var(--danger)"; priority = 2; }
    else if (m.hasSobrante) { catName = "SOBRANTES"; classColor = "var(--warning)"; priority = 3; }
    else if (pctPos < 100 || m.hasPendiente) { catName = "EN PROCESO"; classColor = "var(--secondary)"; priority = 4; }
    else { catName = "COMPLETADAS"; classColor = "var(--success)"; priority = 5; }
    posicionesArray.push({ nombre: p, categoria: catName, color: classColor, prioridad: priority, avance: pctPos });
  }
  return {
    exito: true,
    posiciones: posicionesArray.sort(function(a,b){
      return a.prioridad - b.prioridad || a.nombre.localeCompare(b.nombre);
    })
  };
}


/* ---------- Parser COUNT (items de una posición) ---------- */
function parseCountData(data, target) {
  var items = [];
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][14]).trim().toUpperCase() === target) {
      var step = 1;
      if (data[i][21] !== "") step = 2;
      if (data[i][22] !== "") step = 3;
      if (data[i][23] !== "") step = 4;
      items.push({
        row: i + 2, codigo: data[i][6], desc: data[i][7], serie: data[i][8], lote: data[i][9],
        nDespacho: data[i][10], nPartida: data[i][11], cat: data[i][12], est: data[i][13],
        depot: data[i][16], c1: data[i][21], c2: data[i][22], c3: data[i][23],
        nextStep: step, estado: data[i][19], obs: data[i][27]
      });
    }
  }
  return { exito: true, items: items, posicion: target };
}


/* ---------- Datos de ANÁLISIS por archivo (lo llama el WMS: obtenerDatosAnalisis) ----------
   FIX FASE 8.37: faltaba en este backend (la INTERFAZ BlindInventory lo invoca y
   antes fallaba en silencio dejando el análisis girando). Devuelve exactamente lo
   que produce parseAnalysisData sobre la PLANILLA del archivo, igual que la ruta
   ANALYSIS de pollRealTime. Nunca lanza. */
function obtenerDatosAnalisis(fileId) {
  var vacio = {
    exito: true,
    kpis: { efectividadUnidades:0, efectividadRef:0, efectividadPos:0,
            uniValidadas:0, uniTotal:0, refValidadas:0, refTotal:0,
            posValidadas:0, posTotal:0 },
    discrepancias: []
  };
  try {
    var ss = getTargetSS(fileId);
    var sheet = ss.getSheetByName("PLANILLA DE CONTEO FISICO");
    if (!sheet || sheet.getLastRow() < 2) return vacio;
    var fullData = sheet.getRange(2, 1, sheet.getLastRow() - 1, 28).getValues();
    return parseAnalysisData(fullData);
  } catch (e) {
    vacio.exito = false; vacio.error = e.message;
    return vacio;
  }
}

/* ---------- Parser ANALYSIS (KPIs de efectividad — LÓGICA VALIDADA POR BRYAN) ---------- */
function parseAnalysisData(data) {
  var qFisicaTotal = 0, qTeoricaTotal = 0, uCorrectas = 0, uContadasTeoricas = 0;
  var allRefs = {}, allPos = {};
  var refsCounted = {}, refsCorrect = {}, refsError = {};
  var posCounted = {}, posCorrect = {}, posError = {};
  var discrepancias = [];

  for (var idx = 0; idx < data.length; idx++) {
    var r = data[idx];
    var sku = String(r[6]).trim();
    var desc = String(r[7]).trim();
    var pos = String(r[14]).trim();
    var qTeo = parseFloat(r[16]) || 0; // Q (DEPOT)        — sistema
    var qFis = parseFloat(r[17]) || 0; // R (CONTEO FISICO) — físico
    var qDif = parseFloat(r[18]) || 0; // S (DESFASE)       — diferencia
    var estado = String(r[19]).trim().toUpperCase();
    var categoria = String(r[12]).trim().toUpperCase();

    if (!sku || categoria === "DIF_INV") continue;

    allRefs[sku] = true; allPos[pos] = true;
    qTeoricaTotal += qTeo; qFisicaTotal += qFis;

    if (estado !== "PENDIENTE" && estado !== "") {
      refsCounted[sku] = true; posCounted[pos] = true;
      uContadasTeoricas += qTeo;

      // FIX FASE 8.36: reconciliación con el WMS independiente — el reporte de
      // discrepancias incluye trazabilidad completa (conteos, ajuste, motivo,
      // justificación, obs, nueva posición). BlindInventory.html ya consume
      // estos campos y "CORR. AJUSTADO"; sin esto el análisis salía incompleto.
      var conteo1 = String(r[21]).trim(), conteo2 = String(r[22]).trim(), conteo3 = String(r[23]).trim();
      var ajuste  = String(r[24]).trim(), motivo  = String(r[25]).trim(), justif = String(r[26]).trim();
      var obs     = String(r[27]).trim(), nuevaPos = String(r[28]).trim();
      var itemData = {
        sku: sku, desc: desc, pos: pos, qTeo: qTeo, qFis: qFis, dif: qDif, estado: estado,
        conteo1: conteo1, conteo2: conteo2, conteo3: conteo3, ajuste: ajuste,
        motivo: motivo, justificacion: justif, obs: obs, nuevaPos: nuevaPos
      };

      if (estado === "CORRECTO") {
        uCorrectas += qFis; refsCorrect[sku] = true; posCorrect[pos] = true;
        // Correcto pero con ajuste/justificación/obs → al reporte como "CORR. AJUSTADO"
        if (ajuste !== "" || motivo !== "" || justif !== "" || obs !== "") {
          itemData.estado = "CORR. AJUSTADO";
          discrepancias.push(itemData);
        }
      } else if (estado === "FALTANTE" || estado === "SOBRANTE") {
        refsError[sku] = true; posError[pos] = true;
        if (estado === "SOBRANTE") uCorrectas += qTeo;
        if (estado === "FALTANTE") uCorrectas += qFis;
        discrepancias.push(itemData);
      }
    }
  }

  for (var skE in refsError) delete refsCorrect[skE];
  for (var poE in posError)  delete posCorrect[poE];

  function _cnt(o){ return Object.keys(o).length; }

  return {
    exito: true,
    kpis: {
      efectividadUnidades: qTeoricaTotal === 0 ? 0 : ((uCorrectas / qTeoricaTotal) * 100).toFixed(1),
      efectividadRef:      _cnt(refsCounted) === 0 ? 0 : ((_cnt(refsCorrect) / _cnt(refsCounted)) * 100).toFixed(1),
      efectividadPos:      _cnt(posCounted)  === 0 ? 0 : ((_cnt(posCorrect)  / _cnt(posCounted))  * 100).toFixed(1),
      uniValidadas: uContadasTeoricas, uniTotal: qTeoricaTotal,
      refValidadas: _cnt(refsCounted),  refTotal: _cnt(allRefs),
      posValidadas: _cnt(posCounted),   posTotal: _cnt(allPos)
    },
    discrepancias: discrepancias.sort(function(a,b){ return a.pos.localeCompare(b.pos); })
  };
}


/* ---------- Búsqueda de ubicaciones por SKU ---------- */
function buscarUbicacionesPorSku(sku, fileId) {
  try {
    var ss = getTargetSS(fileId);
    var sheet = ss.getSheetByName("PLANILLA DE CONTEO FISICO");
    var finder = sheet.getRange("G:G").createTextFinder(String(sku).trim().toUpperCase()).matchEntireCell(true).findAll();
    var map = {};
    finder.forEach(function(cell){
      var row = cell.getRow();
      if (row < 2) return;
      var vals = sheet.getRange(row, 15, 1, 6).getValues()[0];
      var p = String(vals[0]).trim().toUpperCase();
      if (p) {
        var dif = parseFloat(vals[4]) || 0;
        var est = String(vals[5]).trim().toUpperCase();
        if (!map[p]) map[p] = { pos: p, dif: 0, est: est };
        map[p].dif += dif;
        if (est !== "CORRECTO" && est !== "PENDIENTE" && est !== "") map[p].est = est;
      }
    });
    return Object.keys(map).map(function(k){ return map[k]; });
  } catch (e) { return []; }
}

/* ---------- Catálogo de SKUs para autocompletado del WMS ----------
   FIX FASE 8.35: reconciliación con el proyecto WMS independiente — esta
   función existía solo en el Codigo.gs standalone y BlindInventory.html la
   invoca (cargarAutocompletadoSKU). Se incorpora tal cual (solo lectura). */
function obtenerCatalogoSKUs(fileId) {
  try {
    var ss = getTargetSS(fileId);
    var sheet = ss.getSheetByName("PLANILLA DE CONTEO FISICO");
    if (!sheet) return [];
    var lr = sheet.getLastRow();
    if (lr < 2) return [];
    var skus = sheet.getRange(2, 7, lr - 1, 1).getValues(); // columna G
    var unicos = {};
    skus.forEach(function(r){
      var sku = String(r[0]).trim().toUpperCase();
      if (sku) unicos[sku] = true;
    });
    return Object.keys(unicos).sort();
  } catch (e) { return []; }
}

/* ---------- Avance EN VIVO del WMS por archivo (batch, ligero) ----------
   FIX FASE 8.36: para el drilldown "Carga por operario". Devuelve el % real de
   conteo (refs validadas / total) leyendo solo lo necesario de cada PLANILLA.
   Es una ÚNICA llamada para varias tareas (mapa fileId → {avance, texto}); el
   frontend pinta primero el % del cronograma (instantáneo) y luego refresca con
   este valor en vivo, sin bloquear (cero tiempos muertos). Cap de seguridad: 15. */
function obtenerAvancesWMS(fileIds) {
  var res = {};
  if (!fileIds || !fileIds.length) return res;
  try { _requiereRol(["Coordinador", "Líder de Conteo", "Auditor"]); } catch (e) { return res; }
  var vistos = {}, procesados = 0;
  for (var k = 0; k < fileIds.length; k++) {
    if (procesados >= 15) break;
    var fid = String(fileIds[k] || "").trim();
    if (!fid || vistos[fid]) continue;
    vistos[fid] = true; procesados++;
    try {
      var ss = getTargetSS(fid);
      var sheet = ss.getSheetByName("PLANILLA DE CONTEO FISICO");
      if (!sheet || sheet.getLastRow() < 2) { res[fid] = { avance: 0, texto: "0/0" }; continue; }
      var lr = sheet.getLastRow();
      var data = sheet.getRange(2, 1, lr - 1, 24).getValues();
      var tRef = 0, cRef = 0;
      for (var i = 0; i < data.length; i++) {
        var sku = String(data[i][6]).trim();
        var catLog = String(data[i][12]).trim().toUpperCase();
        var estadoFinal = String(data[i][19]).trim().toUpperCase();
        if (!sku || catLog === "DIF_INV") continue;
        tRef++;
        if (data[i][21] !== "" || data[i][22] !== "" || data[i][23] !== "" || estadoFinal === "CORRECTO") cRef++;
      }
      res[fid] = { avance: tRef === 0 ? 0 : Math.round((cRef / tRef) * 100), texto: cRef + "/" + tRef };
    } catch (e) { res[fid] = { avance: null, texto: "—" }; }
  }
  return res;
}


/* ---------- Guardar conteo en una fila ---------- */
function guardarConteoFila(row, cantidad, observacion, nuevaPosicion, usuarioManual, fileId) {
  // FIX FASE 8.37: la INTERFAZ (BlindInventory) llama con 6 argumentos:
  // (row, cantidad, observacion, nuevaPosicion, usuarioManual, fileId). El backend
  // tenía 5 (sin nuevaPosicion) y mapeaba mal fileId=email → guardaba en el sitio
  // equivocado y se perdía la "nueva posición". Corregido.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(12000);
    var ss = getTargetSS(fileId);
    var sheet = ss.getSheetByName("PLANILLA DE CONTEO FISICO");
    var resConteo = { c1:"", c2:"", c3:"", nextStep: 1, exito: true, estado: "PENDIENTE" };

    if (cantidad !== null && cantidad !== undefined && cantidad !== "") {
      var vals = sheet.getRange(row, 22, 1, 3).getValues()[0];
      var targetCol = 0, conteoNum = 1;
      if (vals[0] === "" || vals[0] === null) { targetCol = 22; conteoNum = 1; }
      else if (vals[1] === "" || vals[1] === null) { targetCol = 23; conteoNum = 2; }
      else if (vals[2] === "" || vals[2] === null) { targetCol = 24; conteoNum = 3; }
      else { return { exito: false, requiereAjuste: true }; }

      sheet.getRange(row, targetCol).setValue(cantidad);
      var usuarioFinal = usuarioManual || Session.getActiveUser().getEmail();
      registrarAuditoria(sheet, row, cantidad, targetCol, "Conteo " + conteoNum, usuarioFinal, fileId);
      SpreadsheetApp.flush();

      var newVals = sheet.getRange(row, 22, 1, 3).getValues()[0];
      if (newVals[0] !== "") resConteo.nextStep = 2;
      if (newVals[1] !== "") resConteo.nextStep = 3;
      if (newVals[2] !== "") resConteo.nextStep = 4;
      resConteo.c1 = newVals[0]; resConteo.c2 = newVals[1]; resConteo.c3 = newVals[2];
      resConteo.estado = String(sheet.getRange(row, 20).getValue()).trim().toUpperCase();
    }
    if (observacion !== undefined && observacion !== null) sheet.getRange(row, 28).setValue(observacion);
    // FIX FASE 8.37: nueva posición → columna 29 (igual que la lee parseHomeData).
    if (nuevaPosicion !== undefined && nuevaPosicion !== null && String(nuevaPosicion).trim() !== "")
      sheet.getRange(row, 29).setValue(nuevaPosicion);

    notificarCambioBD(fileId);
    return resConteo;
  } catch (e) { return { exito: false, mensaje: "Celda ocupada, reintente." }; }
  finally { lock.releaseLock(); }
}


/* ---------- Guardar conteos masivos ---------- */
function guardarConteoMasivo(listaCambios, emailOperario, fileId) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var ss = getTargetSS(fileId);
    var sheet = ss.getSheetByName("PLANILLA DE CONTEO FISICO");
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { exito: false, mensaje: "Hoja vacía" };

    var emailFinal = emailOperario || Session.getActiveUser().getEmail();
    var todos = getTodosLosUsuarios();
    var nombreOperario = todos[emailFinal] ? todos[emailFinal].nombre : (emailFinal.split("@")[0] || "Operador");

    var rangoConteos = sheet.getRange(2, 22, lastRow - 1, 3);
    var valoresMatriz = rangoConteos.getValues();
    var auditoria = []; var timestamp = new Date();

    listaCambios.forEach(function(item){
      var arrayIdx = item.row - 2;
      if (arrayIdx >= 0 && arrayIdx < valoresMatriz.length) {
        var rowVals = valoresMatriz[arrayIdx];
        var targetColIndex = -1, conteoNum = 1;
        if (rowVals[0] === "" || rowVals[0] === null) { targetColIndex = 0; conteoNum = 1; }
        else if (rowVals[1] === "" || rowVals[1] === null) { targetColIndex = 1; conteoNum = 2; }
        else if (rowVals[2] === "" || rowVals[2] === null) { targetColIndex = 2; conteoNum = 3; }
        if (targetColIndex !== -1 && item.val !== "") {
          valoresMatriz[arrayIdx][targetColIndex] = item.val;
          if (item.obs) sheet.getRange(item.row, 28).setValue(item.obs);
          // FIX FASE 8.37: nueva posición (col 29) — antes se ignoraba en el masivo.
          if (item.nueva_posicion && String(item.nueva_posicion).trim() !== "")
            sheet.getRange(item.row, 29).setValue(item.nueva_posicion);
          var metaData = sheet.getRange(item.row, 3, 1, 13).getValues()[0];
          auditoria.push([
            timestamp, "", "", "", emailFinal,
            metaData[0], metaData[4], metaData[4], metaData[12], "", "",
            (targetColIndex === 0 ? item.val : ""),
            (targetColIndex === 1 ? item.val : ""),
            (targetColIndex === 2 ? item.val : ""),
            "Masivo App (" + conteoNum + ")"
          ]);
        }
      }
    });
    rangoConteos.setValues(valoresMatriz);

    if (auditoria.length > 0) {
      var regSheet = ss.getSheetByName("REGISTRO");
      if (regSheet) {
        var startRow = regSheet.getLastRow() + 1;
        regSheet.getRange(startRow, 1, auditoria.length, 15).setValues(auditoria);
        regSheet.getRange(startRow, 4, auditoria.length, 1).setValues(auditoria.map(function(){ return [nombreOperario]; }));
      }
    }
    SpreadsheetApp.flush();
    notificarCambioBD(fileId);
    return { exito: true, procesados: listaCambios.length };
  } catch (e) { return { exito: false, mensaje: "Sistema ocupado." }; }
  finally { lock.releaseLock(); }
}


/* ==========================================================================
   validarSerieCompleta — FIX FASE 5: comparación EXACTA + detección sub-equipo
   ========================================================================== */
function validarSerieCompleta(serie, fileId) {
  try {
    var ss = getTargetSS(fileId);
    var shSeries = ss.getSheetByName("PLANILLA DE SERIES FISICAS") || ss.getSheetByName("PLANILLA SERIES");
    var shFisico = ss.getSheetByName("PLANILLA DE CONTEO FISICO");
    var serieBuscada = String(serie).trim().toUpperCase();

    var duplicadoExacto = false;
    var posibleSubEquipo = null;   // ← detección de sub-equipos (NO bloquea)
    var filaDup = 0;

    // 1. Comparación ESTRICTA contra series ya registradas
    if (shSeries && shSeries.getLastRow() > 1) {
      var dataSeries = shSeries.getRange(2, 2, shSeries.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < dataSeries.length; i++) {
        var dbVal = String(dataSeries[i][0]).trim().toUpperCase();
        if (!dbVal) continue;
        if (dbVal === serieBuscada) {
          duplicadoExacto = true; filaDup = i + 2; break;
        }
        if (!posibleSubEquipo && _esSerieParecida(serieBuscada, dbVal)) {
          posibleSubEquipo = { fila: i + 2, serie: dbVal };
        }
      }
    }

    var datos = { sku: "SIN_DATOS", desc: "No registrado", pos: "---" };
    var encontrado = false;

    // 2. Buscar metadata en PLANILLA DE CONTEO FISICO (también EXACTO)
    if (!duplicadoExacto && shFisico && shFisico.getLastRow() > 1) {
      var dataFis = shFisico.getRange(2, 7, shFisico.getLastRow() - 1, 9).getValues();
      for (var j = 0; j < dataFis.length; j++) {
        var dbSerie = String(dataFis[j][2]).trim().toUpperCase();
        if (dbSerie === serieBuscada) {
          encontrado = true;
          datos = {
            sku:  String(dataFis[j][0]).trim(),
            desc: String(dataFis[j][1]).trim(),
            pos:  String(dataFis[j][8]).trim()
          };
          break;
        }
      }
    }

    return {
      duplicado: duplicadoExacto, fila: filaDup, encontrado: encontrado,
      datos: datos, serieReal: serieBuscada, posibleSubEquipo: posibleSubEquipo
    };
  } catch (e) {
    return { duplicado: false, encontrado: false, datos: {}, serieReal: serie };
  }
}


/* ---------- Detectar series PARECIDAS para alertar potencial sub-equipo ----------
   Reglas conservadoras para no relentizar:
   · mínimo 6 chars
   · misma raíz con sufijo distinto de 1-2 chars (sub-equipo)
   · misma longitud con 1 sola diferencia (posible typo o sub-equipo) */
function _esSerieParecida(a, b) {
  if (!a || !b || a === b) return false;
  if (a.length < 6 || b.length < 6) return false;
  var corta = a.length < b.length ? a : b;
  var larga = a.length < b.length ? b : a;
  if (larga.length - corta.length <= 2 && larga.indexOf(corta) === 0) return true;
  if (a.length === b.length) {
    var diffs = 0;
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) { diffs++; if (diffs > 1) return false; }
    }
    return diffs === 1;
  }
  return false;
}


/* ---------- Historial de series por posición ---------- */
function obtenerHistorialSeries(pos, fileId) {
  try {
    var ss = getTargetSS(fileId);
    var shSeries = ss.getSheetByName("PLANILLA DE SERIES FISICAS") || ss.getSheetByName("PLANILLA SERIES");
    if (!shSeries) return [];
    var targetPos = String(pos || "").trim().toUpperCase();
    var historial = [];

    if (!targetPos) {
      var lastRow = shSeries.getLastRow();
      if (lastRow < 2) return [];
      var startRow = Math.max(2, lastRow - 50);
      var dataAll = shSeries.getRange(startRow, 1, lastRow - startRow + 1, 5).getValues();
      for (var i = dataAll.length - 1; i >= 0; i--) {
        if (dataAll[i][1]) {
          historial.push({ serie: dataAll[i][1], sku: dataAll[i][3], pos: dataAll[i][4], desc: "Histórico" });
        }
      }
      return historial;
    }

    var finder = shSeries.getRange("E:E").createTextFinder(targetPos).matchEntireCell(true).findAll();
    finder.reverse().slice(0, 50).forEach(function(cell){
      var row = cell.getRow(); if (row < 2) return;
      historial.push({
        serie: cell.offset(0, -3).getValue(),
        sku:   cell.offset(0, -1).getValue(),
        pos:   targetPos, desc: "Registrado"
      });
    });
    return historial;
  } catch (e) { return []; }
}


/* ---------- Última fila real (por columna B) ---------- */
function getLastRowByColumnB(sheet) {
  var lr = sheet.getLastRow();
  if (lr < 1) return 1;
  var data = sheet.getRange(1, 2, lr, 1).getValues();
  for (var i = data.length - 1; i >= 0; i--) {
    if (data[i][0] !== "" && data[i][0] !== null) return i + 1;
  }
  return 1;
}


/* ---------- Guardar inventario procesado (series + hallazgos) ---------- */
function procesarGuardadoInventario(datos, datosHallazgo, usuarioOperador, fileId) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var ss = getTargetSS(fileId);
    var shFisico = ss.getSheetByName("PLANILLA DE CONTEO FISICO");
    var shSeries = ss.getSheetByName("PLANILLA DE SERIES FISICAS") || ss.getSheetByName("PLANILLA SERIES");
    var shRegistro = ss.getSheetByName("REGISTRO");
    var shAlterna = ss.getSheetByName("PLANILLA ALTERNA");

    var realLastRow = getLastRowByColumnB(shSeries);
    var maxSeq = 0;
    if (realLastRow > 1) {
      var ids = shSeries.getRange(2, 1, realLastRow - 1, 1).getValues();
      ids.forEach(function(r){ var s = Number(r[0]); if (!isNaN(s) && s > maxSeq) maxSeq = s; });
    }

    var seriesExistentes = {};
    var dataSeries = shSeries.getRange(2, 2, realLastRow || 1, 1).getValues();
    dataSeries.forEach(function(r){ if (r[0]) seriesExistentes[String(r[0]).trim().toUpperCase()] = true; });

    var mapaSeriesRow = {};
    if (shFisico.getLastRow() > 1) {
      var dataFisico = shFisico.getRange(2, 3, shFisico.getLastRow() - 1, 18).getValues();
      dataFisico.forEach(function(r, i){
        if (r[6]) {
          mapaSeriesRow[String(r[6]).trim().toUpperCase()] = {
            fila: i + 2, id: r[0], cliente: r[2], sku: r[4], pos: r[12], estado: r[17]
          };
        }
      });
    }

    var registrosAB = [], registrosDEF = [];
    var registrosAlterna = [], logAuditoria = [], conteosSumar = {}, duplicados = [];
    var user = usuarioOperador || Session.getActiveUser().getEmail();
    var timestamp = new Date();

    datos.forEach(function(item){
      var serie = String(item.serie).trim().toUpperCase();
      var pos   = String(item.posicion).trim();
      var sku   = item.producto;

      if (seriesExistentes[serie]) {
        duplicados.push(serie);
      } else {
        maxSeq++; seriesExistentes[serie] = true;
        var logId = "SERIE_ADD", logCliente = "APP_WMS", logSku = sku, logPos = pos, logEstado = "PENDIENTE";

        // FIX FASE 5: si el item viene marcado como sub-equipo, lo anotamos en la observación
        var obsSubEquipo = item.subEquipoDe ? " [SUB-EQUIPO de " + item.subEquipoDe + "]" : "";

        registrosAB.push([maxSeq, serie]);
        registrosDEF.push([sku, pos, user]);

        if (mapaSeriesRow[serie]) {
          var info = mapaSeriesRow[serie];
          conteosSumar[info.fila] = (conteosSumar[info.fila] || 0) + 1;
          logId = info.id; logCliente = info.cliente; logSku = info.sku;
          logPos = info.pos; logEstado = info.estado; sku = info.sku;
        } else if (item.esDesconocido && datosHallazgo && shAlterna) {
          registrosAlterna.push([
            timestamp, user, "", datosHallazgo.sku, datosHallazgo.desc, serie, "",
            pos, 1, "", "", datosHallazgo.obs || "Hallazgo", datosHallazgo.justificacion
          ]);
          logEstado = "HALLAZGO"; sku = datosHallazgo.sku;
        }
        logAuditoria.push([
          timestamp, "", "", "", user, logId, logCliente, logSku, logPos, 1, logEstado,
          1, "", "", serie + obsSubEquipo
        ]);
      }
    });

    if (registrosAB.length > 0) {
      if (realLastRow + registrosAB.length > shSeries.getMaxRows()) {
        shSeries.insertRowsAfter(shSeries.getMaxRows(), registrosAB.length + 20);
      }
      shSeries.getRange(realLastRow + 1, 1, registrosAB.length, 2).setValues(registrosAB);
      shSeries.getRange(realLastRow + 1, 4, registrosDEF.length, 3).setValues(registrosDEF);
    }
    if (registrosAlterna.length > 0) {
      shAlterna.getRange(shAlterna.getLastRow() + 1, 1, registrosAlterna.length, 13).setValues(registrosAlterna);
    }
    if (logAuditoria.length > 0) {
      shRegistro.getRange(shRegistro.getLastRow() + 1, 1, logAuditoria.length, 15).setValues(logAuditoria);
    }

    if (Object.keys(conteosSumar).length > 0) {
      for (var filaStr in conteosSumar) {
        var fila = Number(filaStr);
        var vals = shFisico.getRange(fila, 22, 1, 3).getValues()[0];
        var targetCol = 22;
        if (vals[0] === "") targetCol = 22;
        else if (vals[1] === "") targetCol = 23;
        else targetCol = 24;
        shFisico.getRange(fila, targetCol).setValue(1);
      }
    }

    SpreadsheetApp.flush();
    notificarCambioBD(fileId);
    return { exito: true, guardados: registrosAB.length, alternaGuardados: registrosAlterna.length, duplicados: duplicados };

  } catch (e) {
    return { exito: false, mensaje: "Servidor ocupado." };
  } finally { lock.releaseLock(); }
}


/* ---------- Guardar entrada en planilla alterna completa ---------- */
function guardarPlanillaAlternaCompleta(data, usuarioOperador, fileId) {
  var ss = getTargetSS(fileId);
  var shAlt = ss.getSheetByName("PLANILLA ALTERNA");
  var user = usuarioOperador || Session.getActiveUser().getEmail();
  shAlt.getRange(shAlt.getLastRow() + 1, 1, 1, 13).setValues([[
    new Date(), user, "", data.codigo, data.desc, data.serie, data.lote,
    data.posicion, data.cantidad, "", "", data.obs, data.justificacion
  ]]);
  notificarCambioBD(fileId);
  return { mensaje: "Alterna guardada correctamente" };
}


/* ---------- Registrar ajuste de inventario ---------- */
function registrarAjusteInventario(row, motivo, justif, cantidadAjuste, usuarioOperador, fileId) {
  var ss = getTargetSS(fileId);
  var sheet = ss.getSheetByName("PLANILLA DE CONTEO FISICO");
  if (cantidadAjuste !== "") sheet.getRange(row, 25).setValue(cantidadAjuste);
  if (motivo !== "")         sheet.getRange(row, 26).setValue(motivo);
  if (justif !== "")         sheet.getRange(row, 27).setValue(justif);
  registrarAuditoria(sheet, row, 0, 99,
    "AJUSTE [" + cantidadAjuste + "]: " + motivo + " - " + justif, usuarioOperador, fileId);
  notificarCambioBD(fileId);
}


function registrarAccionManual(e, sheet, row, col) {
  if (e.range.getValue() !== "") registrarAuditoria(sheet, row, e.range.getValue(), col, "Manual UI", null, null);
}


/* ---------- Registrar evento en hoja REGISTRO ---------- */
function registrarAuditoria(sheet, row, cantidad, colIndex, obs, usuarioForzado, fileId) {
  var ss = fileId ? getTargetSS(fileId) : sheet.getParent();
  var regSheet = ss.getSheetByName("REGISTRO");
  if (!regSheet) return;
  var vals = sheet.getRange(row, 1, 1, 20).getValues()[0];
  var nextRow = regSheet.getLastRow() + 1;
  var user = usuarioForzado || Session.getActiveUser().getEmail() || "USUARIO_DESCONOCIDO";
  regSheet.getRange(nextRow, 1, 1, 15).setValues([[
    new Date(), "", "", "", user, vals[2], vals[4], vals[6], vals[14], vals[17], vals[19],
    (colIndex === 22 ? cantidad : ""), (colIndex === 23 ? cantidad : ""), (colIndex === 24 ? cantidad : ""), obs
  ]]);
  procesarEdicionRegistro(regSheet, nextRow);
}


function procesarEdicionRegistro(sheet, row) {
  var vals = sheet.getRange(row, 1, 1, 5).getValues()[0];
  var ts = vals[0], email = vals[4];
  if (ts instanceof Date) {
    var tz = sheet.getParent().getSpreadsheetTimeZone();
    sheet.getRange(row, 2).setValue(Utilities.formatDate(ts, tz, "dd/MM/yy"));
    sheet.getRange(row, 3).setValue(Utilities.formatDate(ts, tz, "HH:mm:ss"));
  }
  var todos = getTodosLosUsuarios();
  if (email && todos[email]) sheet.getRange(row, 4).setValue(todos[email].nombre);
}


/* ---------- Auxiliares de hoja PLANILLA DE CONTEO FISICO ---------- */
function actualizarColumnasAC(s) {
  var d = s.getRange("A2:C2").getValues()[0];
  var lr = s.getLastRow();
  if (lr > 2 && (d[0] || d[2])) {
    s.getRange(3, 1, lr - 2, 1).setValue(d[0]);
    s.getRange(3, 3, lr - 2, 1).setValue(d[2]);
  }
}

function generarSecuenciaColumnaD(s) {
  var lr = s.getLastRow();
  if (lr < 2) return;
  var d = s.getRange("G2:G" + lr).getValues();
  var x = 1;
  s.getRange(2, 4, d.length, 1).setValues(d.map(function(r){ return r[0] ? [x++] : [""]; }));
}


/* ---------- Consolidar datos ABC (renombrado para no chocar con panel) ---------- */
function consolidarDatosWMS() {
  var s = _getSS().getSheetByName("PLANILLA DE CONTEO FISICO");
  if (!s) return;
  var f = DriveApp.getFilesByName("ABC2025.txt");
  if (!f.hasNext()) return;
  try {
    var json = JSON.parse(
      f.next().getBlob().getDataAsString("UTF-8").replace(/^\uFEFF/, "")
    );
    var vals = s.getRange(2, 7, s.getLastRow() - 1, 1).getValues()
                .map(function(r){ return [json[String(r[0]).trim()] || ""]; });
    s.getRange(2, 6, vals.length, 1).setValues(vals);
  } catch (e) { Logger.log("consolidarDatosWMS: " + e.message); }
}


function verificarYActualizarColumnaB(s) { /* hook reservado */ }


function actualizarRegistro() {
  var s = _getSS().getSheetByName("REGISTRO");
  if (!s) return;
  for (var i = 2; i <= s.getLastRow(); i++) procesarEdicionRegistro(s, i);
}


function actualizarAnalisis() { /* hook reservado, KPIs se calculan en parseAnalysisData */ }


function crearTriggerAutomatico() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === "PROCESO_AUTOMATICO") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("PROCESO_AUTOMATICO").timeBased().everyDays(1).atHour(6).create();
  _alert("✅ Trigger automático WMS configurado para 06:00 AM.");
}


function PROCESO_AUTOMATICO() {
  try { actualizarRegistro(); consolidarDatosWMS(); actualizarAnalisis(); } catch (e) {}
}


/* ====================== FIN SECCIÓN WMS ====================== */


/* ==========================================================================
   ╔══════════════════════════════════════════════════════════════════════════╗
   ║   SECCIÓN LEGACY — funciones del Código.gs original                      ║
   ║   Restauradas para que el wizard cargue carpetas, los menús legacy       ║
   ║   funcionen y la consolidación histórica siga operativa.                 ║
   ║   No tocar salvo para añadir nuevas ROOT_FOLDER_IDS si abres clientes.   ║
   ╚══════════════════════════════════════════════════════════════════════════╝
   ========================================================================== */

/* ---------- CONFIG GLOBAL DEL PROYECTO ORIGINAL ---------- */
const CONFIG = {
  TEMPLATE_ID: "1Y2VZpr-fy6iuZyfX-96N1r9l3WdZOBfFnEV6Y2BHWog",
  INVENTARIO_GLOBAL_NAME: "MATRIZ_INVENTARIOS_UIO",
  INVENTARIO_GLOBAL_ID: "1npxaCwfbwTJ-c8qpcw7qAhVT_CAXi4gUduPe2WuFXK4",
  ROOT_FOLDER_IDS: [
    "12QkkKJ61AisU7vsNDqSuw03LGd4MSZFY",   // Quito · INT
    "1HAqPpumvBKREO8vLeKp2kD-5WIoNdAsV",   // Quito · SLOT
    "1vClQh7AOD1oeVaThMH-4H6eTROVv3HJr"    // Guayaquil (GYE)
    // Agrega aquí más IDs de raíz cuando abras nuevos clientes/operativos
  ]
};

function obtenerEstructuraInicial() {
  return { id: "VIRTUAL_ROOT", name: " Itsanet (UIO)" };
}

// Backend: Obtiene subcarpetas

function obtenerSubcarpetas(parentId) {
  var list = [];

  // CASO A: Si estamos en el inicio, mostramos las carpetas configuradas en CONFIG
  if (parentId === "VIRTUAL_ROOT") {
    var ids = CONFIG.ROOT_FOLDER_IDS; // Leemos el Array de IDs
    for (var i = 0; i < ids.length; i++) {
      try {
        var f = DriveApp.getFolderById(ids[i]);
        list.push({ id: f.getId(), name: "📁 " + f.getName() });
      } catch (e) {
        list.push({ id: "ERROR", name: " Error ID: " + ids[i] });
      }
    }
    return list; // No ordenamos para respetar tu orden de configuración
  }

  // CASO B: Navegación normal dentro de una carpeta real
  try {
    var parent = DriveApp.getFolderById(parentId);
    var folders = parent.getFolders();
    while (folders.hasNext()) {
      var f = folders.next();
      list.push({ id: f.getId(), name: f.getName() });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    return [];
  }
}

// Backend: Crear carpeta

function crearSubcarpeta(parentId, name) {
  if (parentId === "VIRTUAL_ROOT") {
    throw new Error("Por seguridad, no puedes crear carpetas en la Raíz Virtual. Entra en una de las carpetas azules primero.");
  }
  var parent = DriveApp.getFolderById(parentId);
  var newFolder = parent.createFolder(name);
  return { id: newFolder.getId(), name: newFolder.getName() };
}

function ejecutarCreacionArchivo(folderId) {
  if (folderId === "VIRTUAL_ROOT") throw new Error("Selecciona una carpeta específica.");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("PANEL DE CONTROL");
  const ui = SpreadsheetApp.getUi(); // Para lanzar mensajes de error en pantalla
  
  // Buscar última fila con Cliente en Columna A
  const datosColA = sheet.getRange("A:A").getValues();
  let row = datosColA.length;
  while (row > 0 && datosColA[row - 1][0] == "") row--;
  
  if (!folderId || typeof folderId !== 'string') throw new Error("ID de carpeta inválido.");
  
  const nombreCliente = datosColA[row - 1][0].toString().trim().toUpperCase();
  const folder = DriveApp.getFolderById(folderId);

  try {
    const newFile = DriveApp.getFileById(CONFIG.TEMPLATE_ID).makeCopy(nombreCliente, folder);
    // FIX FASE 8.24: compartir solo con dominio Itsanet + equipo activo
    try { _compartirArchivoConEquipo(newFile); } catch (e) {}
    
    // === CONEXIÓN A LA API CON DIAGNÓSTICO ===
    try {
      let token = obtenerTokenItsanet();
      
      if (!token) {
        ui.alert(" ERROR DE API: No se pudo obtener el Token. Verifica el usuario y la contraseña en la función obtenerTokenItsanet().");
      } else {
        
        let datosStock = extraerDatosInventario(token);
        
        if (!datosStock || datosStock.length === 0) {
          ui.alert(" ADVERTENCIA API: Nos conectamos bien, pero la API de ITSANET no devolvió ningún artículo. El inventario parece estar vacío.");
        } else {
          
          let codigosRaw = sheet.getRange(row, 26).getValue().toString(); 
          let codigosSeleccionados = codigosRaw ? codigosRaw.split(",").map(c => c.trim().toUpperCase()) : [];

          // 1. APLICAR FILTROS (Cliente y SKUs)
          let datosFiltrados = datosStock.filter(item => {
            let clienteItem = (item["COD. CLIENTE"] || "").toString().trim().toUpperCase();
            // ¡OJO AQUÍ! Comparamos el "COD. CLIENTE" de la API con lo que escribiste en Columna A
            let cumpleCliente = (clienteItem === nombreCliente);
            
            let cumpleCodigo = true;
            if (codigosSeleccionados.length > 0) {
                let codigoItem = (item["COD. PRODUCTO"] || "").toString().trim().toUpperCase();
                cumpleCodigo = codigosSeleccionados.includes(codigoItem);
            }
            return cumpleCliente && cumpleCodigo;
          });

          // 2. VERIFICACIÓN DE FILTROS
          if (datosFiltrados.length === 0) {
            ui.alert("⚠️ ADVERTENCIA FILTRO: La API trajo " + datosStock.length + " artículos en total, pero NINGUNO pertenece al cliente '" + nombreCliente + "'. Revisa si el código de cliente en la API es exactamente igual a lo que escribiste en la Columna A.");
          } else {
            
            // 3. PREPARAR MATRIZ PARA HOJA DE CONTEO
            let matrizDatos = datosFiltrados.map(item => {
              let nave = item["NAVE"] || "";
              let calle = item["CALLE"] || "";
              let columna = item["COLUMNA"] || "";
              let nivel = item["NIVEL"] || "";
              let posicionFisica = nave + "-" + calle + "-" + columna + "-" + nivel;

              return [
                item["COD. PRODUCTO"] || "",        // A: SKU
                item["DESCRIPCION"] || "",          // B: Descripción
                posicionFisica,                     // C: Ubicación Consolidada
                item["LOTE.PROVEEDOR"] || "",       // D: Lote
                parseFloat(item["CANTIDAD"]) || 0   // E: Cantidad Teórica
              ];
            });

            let ssNuevo = SpreadsheetApp.openById(newFile.getId());
            let hojaConteo = ssNuevo.getSheetByName("PLANILLA DE CONTEO FISICO");
            
            if (!hojaConteo) {
              ui.alert("❌ ERROR DE PLANTILLA: No se encontró una pestaña llamada EXACTAMENTE 'PLANILLA DE CONTEO FISICO' en tu archivo nuevo.");
            } else {
              hojaConteo.getRange(2, 1, matrizDatos.length, matrizDatos[0].length).setValues(matrizDatos);
              ui.alert("✅ ÉXITO: Se importaron " + matrizDatos.length + " artículos desde la API para el cliente " + nombreCliente + ".");
            }
          }
        }
      }
    } catch (apiError) {
      ui.alert("❌ ERROR CRÍTICO API: " + apiError.message);
    }

    // === ESCRIBIR DATOS EN PANEL DE CONTROL ===
    var fechaFormateada = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
    sheet.getRange(row, 2).setValue(newFile.getUrl()); 
    sheet.getRange(row, 3).setValue(newFile.getId());  
    sheet.getRange(row, 4).setValue(fechaFormateada);  
    
    // Cerramos el panel lateral HTML
    return "OK";
  } catch (e) {
    throw new Error("Error general al crear archivo: " + e.message);
  }
}





// Función backend llamada desde el HTML al dar clic en "Crear Archivo"

function mostrarMenuConsolidacion() {
  var html = '<style>body{font-family:sans-serif;text-align:center;padding:10px}button{width:100%;padding:12px;margin:5px 0;cursor:pointer;background:#1a73e8;color:#fff;border:none;border-radius:4px;font-weight:bold}.reg{background:#e37400}.all{background:#188038}</style>' +
             '<h3>Consolidación</h3><p>Seleccione qué procesar:</p>' +
             '<button onclick="r(\'INV\')">Solo INVENTARIOS</button>' +
             '<button class="reg" onclick="r(\'REG\')">Solo REGISTRO</button>' +
             '<button class="all" onclick="r(\'ALL\')">TODO (Ambos)</button>' +
             '<script>function r(t){google.script.run.withSuccessHandler(google.script.host.close).consolidarDatosFinal(false,t)}</script>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(280).setHeight(300), 'Opciones de Base de Datos');
}

function consolidarDatosFinal(soloReporte, tipo) {
  tipo = tipo || 'ALL';
  var procInv = (tipo==='ALL'||tipo==='INV'), procReg = (tipo==='ALL'||tipo==='REG');
  var lock = LockService.getScriptLock(); 
  if(!lock.tryLock(45000)) { SpreadsheetApp.getUi().alert("Sistema ocupado."); return; }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), ui = SpreadsheetApp.getUi();
    var p = ss.getSheetByName("PANEL DE CONTROL"), inv = ss.getSheetByName("INVENTARIOS"), reg = ss.getSheetByName("REGISTRO");
    var errSh = ss.getSheetByName("ERRORES_VALIDACION") || ss.insertSheet("ERRORES_VALIDACION");
    
    errSh.clear(); errSh.appendRow(["Fecha","Cliente","ID","Fila","Valor","Col","Nota"]);
    errSh.getRange("A1:G1").setFontWeight("bold").setBackground("#f4cccc");

    if(!soloReporte) {
      if(procInv && inv.getLastRow()>1) inv.getRange(2,1,inv.getLastRow()-1,inv.getLastColumn()).clearContent();
      if(procReg && reg.getLastRow()>1) reg.getRange(2,1,reg.getLastRow()-1,reg.getLastColumn()).clearContent();
    }

    var data = p.getRange("A2:G"+p.getLastRow()).getValues();
    var entries = [];
    for(var i=0; i<data.length; i++) {
      if(String(data[i][6]).toLowerCase().trim() === "entregado") {
        entries.push({ cliente: data[i][0], id: extractIdFromUrl(data[i][2]) });
      }
    }

    if(entries.length===0) { ui.alert("No hay archivos 'Entregado'."); return; }

    var dInv=[], dReg=[], errs=[], headers=null;

    for(var idx=0; idx<entries.length; idx++) {
      var ent = entries[idx];
      if(!ent.id) continue;
      
      var ap = safeOpenSpreadsheet(ent.id);
      if(!ap.ss) { errs.push([new Date(), ent.cliente, ent.id, "-", "Error abrir: "+ap.error, "-", "-"]); continue; }
      var ssFile = ap.ss;

      if(procInv || soloReporte) {
        var shC = ssFile.getSheetByName("PLANILLA DE CONTEO FISICO");
        if(shC && shC.getLastRow()>0) {
          var lastCol = shC.getLastColumn();
          if(!headers) headers = shC.getRange(1,1,1,lastCol).getValues()[0];
          
          if(shC.getLastRow()>1) {
            var vRaw = shC.getRange(2,1,shC.getLastRow()-1,lastCol).getValues();
            // FIX FASE 8.14: usar displayValues del origen para evitar shift TZ
            var vRawDisp = shC.getRange(2,1,shC.getLastRow()-1,lastCol).getDisplayValues();
            vRaw = _normalizarFechasMatriz(vRaw, vRawDisp);
            if (headers) {
              var headersDisp = shC.getRange(1,1,1,lastCol).getDisplayValues();
              headers = _normalizarFechasMatriz([headers], headersDisp)[0];
            }
            var colCnt = detectColumnCantidadSmart(headers, vRaw, lastCol);
            
            if (colCnt === null) {
               var vDisp = shC.getRange(2,1,shC.getLastRow()-1,lastCol).getDisplayValues();
               colCnt = detectColumnCantidadFromDisplay(vDisp, lastCol);
            }

            if(colCnt !== null) {
              for(var r=0; r<vRaw.length; r++) {
                var rowData = vRaw[r];
                if(!rowData.some(c=>valueNotEmpty(c))) continue;
                
                var valC = rowData[colCnt];
                if(valueNotEmpty(valC) && !esNumeroValido(valC)) {
                  errs.push([new Date(), ent.cliente, ent.id, r+2, valC, columnLetter(colCnt+1), "EXCLUIDO (Alfanumérico)"]);
                } else if(!soloReporte) {
                  dInv.push(rowData);
                }
              }
            } else { errs.push([new Date(), ent.cliente, ent.id, "-", "No Col Cantidad", "-", "-"]); }
          }
        }
      }

      if((procReg || soloReporte) && !soloReporte) {
        var shR = ssFile.getSheetByName("REGISTRO");
        if(shR && shR.getLastRow()>1) {
          var vr = shR.getRange(2,1,shR.getLastRow()-1,shR.getLastColumn()).getValues();
          dReg = dReg.concat(vr.filter(r=>r.some(c=>valueNotEmpty(c))));
        }
      }
    }

    if(errs.length) errSh.getRange(2,1,errs.length,errs[0].length).setValues(errs);
    if(soloReporte) { ui.alert("Errores encontrados: "+errs.length); return; }

    if(procInv) {
      if(inv.getLastRow()===0 && headers) {
         inv.getRange(1,1,1,headers.length).setValues([headers]);
         inv.getRange(1,1,1,headers.length).setFontWeight("bold");
      }
      if(dInv.length) {
        ensureColumns(inv, dInv[0].length);
        // FIX FASE 8.12: formato texto para preservar dd/MM/yyyy literal
        inv.getRange(2,1,dInv.length,dInv[0].length)
           .setNumberFormat("@")
           .setValues(dInv);
      }
      // FIX FASE 8.13: REMOVIDO espejo a MATRIZ_INVENTARIOS_UIO (archivo externo).
      // Consolidación queda SOLO en hoja INVENTARIOS del libro base.
    }

    if(procReg && dReg.length) {
      var max=0; dReg.forEach(r=>max=Math.max(max,r.length));
      var nReg=dReg.map(r=>{while(r.length<max)r.push("");return r;});
      ensureColumns(reg, max);
      reg.getRange(2,1,nReg.length,max).setValues(nReg);
    }

    ui.alert("Proceso ("+tipo+") Finalizado.\nInv: "+dInv.length+" | Reg: "+dReg.length+" | Errores: "+errs.length);

  } catch(e) { SpreadsheetApp.getUi().alert("Error fatal: "+e.message); }
  finally { lock.releaseLock(); }
}

function reportarErroresPrevio() { consolidarDatosFinal(true, 'INV'); }

/* ============================
   4. REPORTES HISTÓRICOS Y ACTUALIZACIÓN MENSUAL
   ============================ */

function exportarReporteDeUnClienteArchivo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), p = ss.getSheetByName("PANEL DE CONTROL");
  var d = p.getRange("A2:A"+p.getLastRow()).getValues();
  var clients = [...new Set(d.map(r=>r[0]).filter(c=>c!==""))];
  var t = HtmlService.createTemplateFromFile("ExportarReporteForm");
  t.clientes = clients;
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(400).setHeight(300), "Exportar Reporte");
}




/* ==========================================================================
   ACTUALIZACIÓN DIARIA DE REPORTES EXISTENTES (SOLUCIÓN BLINDADA SMART CHIPS)
   ========================================================================== */

function actualizarTodosLosReportesMensuales() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hHist = ss.getSheetByName("HISTORIAL_REPORTES");
  
  if (!hHist || hHist.getLastRow() < 2) return;

  var lastRow = hHist.getLastRow();
  // Extraemos textos y links ocultos
  var datos = hHist.getRange(2, 1, lastRow - 1, 3).getValues();
  var richTextUrls = hHist.getRange(2, 3, lastRow - 1, 1).getRichTextValues();

  for (var i = 0; i < datos.length; i++) {
    var cliente = datos[i][0];
    var textoCelda = datos[i][2]; 
    var richText = richTextUrls[i][0];

    if (cliente && textoCelda) {
      try {
        var fileId = resolverIdArchivoExtremo(textoCelda, richText);

        if (fileId) {
          actualizarReporteExistente(cliente, fileId, i + 2, hHist);
          Logger.log("✅ Actualizado correctamente: " + cliente);
        } else {
          Logger.log("❌ No se encontró ID válido ni archivo activo en Drive para: " + cliente);
        }
      } catch (e) {
        Logger.log("Error al actualizar " + cliente + ": " + e.message);
      }
    }
  }
}

// Función conectada a tu botón de Menú (Exportación Manual)
/*function exportarReporteAHojaExistente(cliente) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hHist = ss.getSheetByName("HISTORIAL_REPORTES");
  var lastRow = hHist.getLastRow();
  
  if (lastRow < 2) return "El historial está vacío.";
  
  var datos = hHist.getRange(2, 1, lastRow - 1, 3).getValues();
  var richTextUrls = hHist.getRange(2, 3, lastRow - 1, 1).getRichTextValues();
  
  for (var i = 0; i < datos.length; i++) {
    if (datos[i][0] === cliente) {
      var textoCelda = datos[i][2];
      var richText = richTextUrls[i][0];
      
      try {
        var fileId = resolverIdArchivoExtremo(textoCelda, richText);
        if (fileId) {
          actualizarReporteExistente(cliente, fileId, i + 2, hHist);
          return "✅ Reporte de " + cliente + " ACTUALIZADO correctamente.";
        } else {
          return "❌ Error: El archivo '" + textoCelda + "' no se encuentra activo en Drive.";
        }
      } catch(e) {
        return "❌ Error en " + cliente + ": " + e.message;
      }
    }
  }
  return "Error: No se encontró el registro de " + cliente + " en Historial.";
}*/

// Función conectada a tu botón de Menú (Exportación Manual)

function exportarReporteAHojaExistente(cliente) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hHist = ss.getSheetByName("HISTORIAL_REPORTES");
  if (!hHist) {
    hHist = ss.insertSheet("HISTORIAL_REPORTES");
    hHist.appendRow(["Cliente", "Última actualización", "Link/Archivo"]);
    hHist.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#1a73e8").setFontColor("#ffffff");
  }
  var lastRow = hHist.getLastRow();

  // FIX FASE 8.20: helper para formatear el mensaje con stats
  function _formatearMensaje(prefijo, cliente, stats) {
    var msg = prefijo + " — " + cliente + "\n\n";
    if (stats) {
      msg += "• Archivos procesados: " + (stats.archivos || 0) + "\n";
      msg += "• Filas escritas en reporte: " + (stats.filasEscritas || 0) + "\n";
      if (stats.incidencias > 0) {
        msg += "• Incidencias detectadas: " + stats.incidencias + "\n";
        if (stats.criticos > 0) msg += "  - Críticas (SKU vacío / Cant. inválida): " + stats.criticos + "\n";
        if (stats.duplicados > 0) msg += "  - Duplicados intra-archivo: " + stats.duplicados + "\n";
        msg += "\n📋 Revisa la hoja ERRORES_REPORTES_CLIENTE en este libro base\n   para ver la ubicación exacta de cada incidencia (uso interno).";
      } else {
        msg += "\n🎯 Sin incidencias detectadas.";
      }
    }
    return msg;
  }

  // 1. BUSCAMOS SI EL CLIENTE YA EXISTE EN EL HISTORIAL
  if (lastRow >= 2) {
    var datos = hHist.getRange(2, 1, lastRow - 1, 3).getValues();
    var richTextUrls = hHist.getRange(2, 3, lastRow - 1, 1).getRichTextValues();

    for (var i = 0; i < datos.length; i++) {
      if (datos[i][0] === cliente) {
        var textoCelda = datos[i][2];
        var richText = richTextUrls[i][0];

        try {
          var fileId = resolverIdArchivoExtremo(textoCelda, richText);
          if (fileId) {
            var stats = actualizarReporteExistente(cliente, fileId, i + 2, hHist);
            return _formatearMensaje("✅ Reporte ACTUALIZADO", cliente, stats);
          } else {
            return "❌ Error: El archivo '" + textoCelda + "' no se encuentra activo en Drive.";
          }
        } catch(e) {
          return "❌ Error en " + cliente + ": " + e.message;
        }
      }
    }
  }

  // 2. SI LLEGA AQUÍ, EL CLIENTE ES NUEVO (NO ESTÁ EN EL HISTORIAL).
  // Creamos su archivo maestro por primera vez.
  try {
    // Validar que realmente tenga datos antes de crear un archivo en blanco en el Drive
    var cons = obtenerDatosConsolidadosCliente(cliente);
    if (!cons || cons.datos.length === 0) {
      // FIX FASE 8.20: si hubo incidencias críticas que vaciaron el set, informarlo
      if (cons && cons.incidencias && cons.incidencias.length > 0) {
        return "❌ No se puede crear el reporte. Todos los datos fueron excluidos por incidencias:\n" +
               "• Críticos: " + cons.criticos + "\n" +
               "• Duplicados: " + cons.duplicados + "\n" +
               "• Total incidencias: " + cons.incidencias.length + "\n\n" +
               "Corrige los archivos hijos antes de exportar.";
      }
      return "❌ Error: No se puede crear el reporte. No hay inventarios 'Entregados' para " + cliente + " en el Panel de Control.";
    }

    var anio = new Date().getFullYear();
    var nombreArchivo = cliente + " - " + anio;

    // Crear el nuevo archivo en Google Drive
    var nuevoSpreadsheet = SpreadsheetApp.create(nombreArchivo);
    var nuevoFileId = nuevoSpreadsheet.getId();
    var nuevaUrl = nuevoSpreadsheet.getUrl();

    // FIX FASE 8.25: aplicar permisos diferenciados (equipo=EDITOR, dominio=LECTOR)
    try {
      _compartirArchivoConEquipo(DriveApp.getFileById(nuevoFileId));
    } catch (ePerm) {
      Logger.log("FIX 8.25: no se pudieron aplicar permisos al reporte de " + cliente + ": " + ePerm.message);
    }

    var fechaActual = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");

    // Añadir el nuevo cliente al final de HISTORIAL_REPORTES
    hHist.appendRow([cliente, fechaActual, nuevaUrl]);
    var nuevaFila = hHist.getLastRow();

    // Inyectar los datos consolidados en el nuevo archivo
    var stats2 = actualizarReporteExistente(cliente, nuevoFileId, nuevaFila, hHist);

    return _formatearMensaje("✨ Reporte CREADO", cliente, stats2) +
           "\n\n🔗 " + nuevaUrl;

  } catch (e) {
    return "❌ Error al crear nuevo reporte para " + cliente + ": " + e.message;
  }
}


// === MOTOR INTELIGENTE EXTREMO DE BÚSQUEDA ===

function resolverIdArchivoExtremo(textoCelda, richText) {
  // 1. Extraer de los "Runs" del Smart Chip 
  if (richText) {
    var runs = richText.getRuns();
    for (var i = 0; i < runs.length; i++) {
      var url = runs[i].getLinkUrl();
      if (url) {
        var match = url.match(/[-\w]{25,50}/);
        if (match) return match[0];
      }
    }
  }
  
  // 2. Si la celda es texto crudo con URL tradicional
  var txt = (textoCelda || "").toString().trim();
  if (txt.indexOf("http") !== -1) {
    var matchTxt = txt.match(/[-\w]{25,50}/);
    if (matchTxt) return matchTxt[0];
  }
  
  // 3. BÚSQUEDA ESTRICTA EN DRIVE
  if (txt) {
    var safeName = txt.replace(/"/g, '\\"');
    var query = 'title = "' + safeName + '" and trashed = false and mimeType = "application/vnd.google-apps.spreadsheet"';
    var archivos = DriveApp.searchFiles(query);
    if (archivos.hasNext()) {
      return archivos.next().getId();
    }
  }
  
  return null;
}

// === FUNCIÓN QUIRÚRGICA DE INYECCIÓN DE DATOS ===

function actualizarReporteExistente(cliente, fileId, filaHistorial, hHist) {
  var ssRep;
  try {
    ssRep = SpreadsheetApp.openById(fileId);
  } catch (e) {
    throw new Error("No tienes permisos o el archivo fue eliminado. ID: " + fileId);
  }

  var cons = obtenerDatosConsolidadosCliente(cliente);
  if (!cons || cons.datos.length === 0) {
    throw new Error("No hay datos 'Entregados' en la matriz para este cliente.");
  }

  var sh = ssRep.getSheetByName("Inventarios");
  if (!sh) {
    sh = ssRep.insertSheet("Inventarios");
  }

  // FIX FASE 8.20: Capa 3 — stringificar cualquier Date que aún quede
  // (garantiza cero objetos Date en la matriz que se escribe)
  var datosLimpios = _stringificarFechasFinales(cons.datos);
  var headersLimpios = _stringificarFechasFinales([cons.headers])[0];

  // Limpiamos y pegamos
  sh.clear();

  if (headersLimpios.length > 0) {
    sh.getRange(1, 1, 1, headersLimpios.length)
      .setValues([headersLimpios])
      .setFontWeight("bold");
  }

  if (datosLimpios.length > 0) {
    if (sh.getMaxColumns() < datosLimpios[0].length) {
      sh.insertColumnsAfter(sh.getMaxColumns(), datosLimpios[0].length - sh.getMaxColumns());
    }
    // FIX FASE 8.20: formato texto para que Power BI lea dd/MM/yyyy literal
    sh.getRange(2, 1, datosLimpios.length, datosLimpios[0].length)
      .setNumberFormat("@")
      .setValues(datosLimpios);
  }

  // FIX FASE 8.21: las incidencias se escriben EXCLUSIVAMENTE en el LIBRO BASE
  // (interno) — NUNCA dentro del archivo del cliente, porque ese archivo se
  // entrega/comparte al cliente final y no debe contener información de errores
  // internos. Usamos hoja "ERRORES_REPORTES_CLIENTE" separada de la consolidación
  // global para no mezclar contextos.
  if (cons.incidencias && cons.incidencias.length > 0) {
    try {
      var ssBase = _getSS();
      var hAud = ssBase.getSheetByName("ERRORES_REPORTES_CLIENTE")
                 || ssBase.insertSheet("ERRORES_REPORTES_CLIENTE");

      // Si la hoja está vacía, crear encabezado
      if (hAud.getLastRow() === 0) {
        hAud.appendRow(["Fecha proceso", "Cliente", "Archivo origen ID", "Link",
                        "Fila", "Columna", "Valor encontrado",
                        "Motivo", "Acción", "Severidad"]);
        hAud.getRange(1, 1, 1, 10).setFontWeight("bold")
            .setBackground("#d93025").setFontColor("#ffffff");
        hAud.setFrozenRows(1);
      }

      var fechaProceso = Utilities.formatDate(new Date(),
                          Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
      var rowsAud = cons.incidencias.map(function(inc) {
        var link = "https://docs.google.com/spreadsheets/d/" + inc.archivo + "/edit";
        return [fechaProceso, cliente, inc.archivo, link,
                inc.fila, inc.columna, inc.valor,
                inc.motivo, inc.accion, inc.severidad];
      });

      // Append: agregar al final de las filas existentes (mantener histórico)
      var nextRow = hAud.getLastRow() + 1;
      hAud.getRange(nextRow, 1, rowsAud.length, 10).setValues(rowsAud);

      // Pintar columna severidad por color
      for (var er = 0; er < rowsAud.length; er++) {
        var sev = rowsAud[er][9];
        var color = sev === "CRÍTICA" ? "#fce8e6" :
                    (sev === "MEDIA" ? "#fef7e0" :
                    (sev === "BAJA" ? "#e8f0fe" : "#e6f4ea"));
        hAud.getRange(nextRow + er, 10).setBackground(color);
      }
    } catch (eAud) {
      Logger.log("FIX 8.21: No se pudo escribir ERRORES_REPORTES_CLIENTE: " + eAud.message);
      // No relanzar — el reporte del cliente se generó correctamente,
      // la auditoría es información interna complementaria.
    }
  }

  // FIX FASE 8.21: Si alguna ejecución previa de v8.20 creó la hoja
  // AUDITORIA_CLIENTE dentro del archivo del cliente, la eliminamos para
  // que el archivo no contenga información interna de errores.
  try {
    var hojaInternaAntigua = ssRep.getSheetByName("AUDITORIA_CLIENTE");
    if (hojaInternaAntigua) ssRep.deleteSheet(hojaInternaAntigua);
  } catch (eDel) {}

  // Actualizamos Fecha
  var fechaActual = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
  hHist.getRange(filaHistorial, 2).setValue(fechaActual);

  // FIX FASE 8.20: devolver estadísticas para que el caller pueda mostrar
  // un resumen útil al usuario (cuántas filas, errores, duplicados, etc.)
  return {
    filasEscritas: datosLimpios.length,
    archivos: cons.archivos,
    incidencias: cons.incidencias.length,
    criticos: cons.criticos,
    duplicados: cons.duplicados
  };
}

// === AQUÍ ESTÁ LA FUNCION HISTÓRICA QUE FALTABA (EXTRACCIÓN DE DATOS) ===

/* ==========================================================================
   FIX FASE 8.20: obtenerDatosConsolidadosCliente con misma depuración que
   la consolidación global (v8.17). Aplica:
   - Normalización de fechas con displayValues + TZ del archivo origen
   - Deduplicación intra-archivo (mismo hash → excluida)
   - Validación: SKU vacío, cantidad inválida, fila vacía, cantidad cero
   - Devuelve estadísticas de incidencias para reportar al usuario
   - Headers normalizados con displayValues del primer archivo

   Mantiene compatibilidad: la firma de retorno conserva {headers, datos}
   y AGREGA campos opcionales {incidencias, criticos, duplicados, archivos}
   que el caller puede usar o ignorar.
   ========================================================================== */
function obtenerDatosConsolidadosCliente(cliente) {
  var ss = _getSS();
  var p = ss.getSheetByName("PANEL DE CONTROL") || ss.getSheetByName(CRON_CFG.HOJA_PANEL);
  if (!p) return { headers: [], datos: [], incidencias: [], criticos: 0, duplicados: 0, archivos: 0 };

  var d = p.getRange("A2:G" + p.getLastRow()).getValues();
  var acc = [], head = [], headDisp = [];
  var incidencias = [];
  var totalCriticos = 0, totalDuplicados = 0, totalArchivos = 0;
  var hashesGlobales = {}; // dedup entre archivos (mismo cliente, distintos eventos)

  for (var i = 0; i < d.length; i++) {
    // Comparación case-insensitive y trim para tolerancia
    var cliRow = String(d[i][0] || "").trim();
    var estado = String(d[i][6] || "").toLowerCase().trim();
    if (cliRow !== String(cliente).trim()) continue;
    if (estado !== "entregado") continue;

    var id = extractIdFromUrl(d[i][2]);
    if (!id) continue;
    var op = safeOpenSpreadsheet(id);
    if (!op.ss) {
      incidencias.push({
        archivo: id, fila: "—", columna: "—", valor: "",
        motivo: "ERROR_ABRIR_ARCHIVO", severidad: "ALTA",
        accion: "Archivo saltado"
      });
      continue;
    }

    var sh = op.ss.getSheetByName("PLANILLA DE CONTEO FISICO");
    if (!sh || sh.getLastRow() === 0) continue;

    var lastCol = sh.getLastColumn();
    var tzOrigen;
    try { tzOrigen = op.ss.getSpreadsheetTimeZone(); } catch (eTz) {}

    // Headers — normalizados desde el primer archivo encontrado
    if (!head.length) {
      head = sh.getRange(1, 1, 1, lastCol).getValues()[0];
      headDisp = sh.getRange(1, 1, 1, lastCol).getDisplayValues();
      head = _normalizarFechasMatriz([head], headDisp, tzOrigen)[0];
    }

    if (sh.getLastRow() < 2) continue;

    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, lastCol).getValues();
    var disp = sh.getRange(2, 1, sh.getLastRow() - 1, lastCol).getDisplayValues();
    // CAPA 1+2: normalizar fechas con displayValue + TZ del archivo origen
    vals = _normalizarFechasMatriz(vals, disp, tzOrigen);

    // Detectar columnas clave para validación
    var colsClave = _detectarColumnasClave(head);
    var colCant = detectColumnCantidadSmart(head, vals, lastCol);
    if (colCant === null) colCant = detectColumnCantidadFromDisplay(disp, lastCol);
    var colCantFinal = (colsClave.cant !== null && colsClave.cant >= 0) ? colsClave.cant : colCant;

    var hashesArchivo = {}; // dedup intra-archivo
    totalArchivos++;

    vals.forEach(function(row, idxRow) {
      var filaOrigen = idxRow + 2;

      // Check 1: fila vacía
      if (!row.some(function(c) { return valueNotEmpty(c); })) return;

      // Check 2: SKU vacío → crítico, excluir
      var sku = colsClave.sku >= 0 ? row[colsClave.sku] : null;
      if (!valueNotEmpty(sku)) {
        totalCriticos++;
        incidencias.push({
          archivo: id, fila: filaOrigen,
          columna: columnLetter(colsClave.sku + 1),
          valor: "", motivo: "SKU_VACIO", severidad: "CRÍTICA",
          accion: "EXCLUIDA"
        });
        return;
      }

      // Check 3: cantidad inválida o cero
      if (colCantFinal !== null && colCantFinal >= 0) {
        var v = row[colCantFinal];
        if (valueNotEmpty(v) && !esNumeroValido(v)) {
          totalCriticos++;
          incidencias.push({
            archivo: id, fila: filaOrigen,
            columna: columnLetter(colCantFinal + 1),
            valor: String(v), motivo: "CANTIDAD_INVALIDA",
            severidad: "CRÍTICA", accion: "EXCLUIDA"
          });
          return;
        }
        var numCant = esNumeroValido(v) ? parseFloat(String(v).replace(",", ".")) : 0;
        if (esNumeroValido(v) && numCant === 0) {
          incidencias.push({
            archivo: id, fila: filaOrigen,
            columna: columnLetter(colCantFinal + 1),
            valor: "0", motivo: "CANTIDAD_CERO",
            severidad: "MEDIA", accion: "EXCLUIDA (conteo no realizado)"
          });
          return;
        }
      }

      // Check 4: deduplicación intra-archivo (misma fila repetida)
      var hash = _hashFilaConsolidacion(row);
      if (hash && hashesArchivo[hash]) {
        totalDuplicados++;
        incidencias.push({
          archivo: id, fila: filaOrigen,
          columna: columnLetter(colsClave.sku + 1),
          valor: String(sku) + " ya estaba en fila " + hashesArchivo[hash],
          motivo: "DUPLICADO_INTRA_ARCHIVO",
          severidad: "MEDIA", accion: "EXCLUIDA (copia)"
        });
        return;
      }
      hashesArchivo[hash] = filaOrigen;

      // Check 5: dedup entre archivos (mismo cliente, varios inventarios)
      // Solo reportar como ADVERTENCIA (no excluir) — puede ser conteo legítimo
      // de inventarios distintos del mismo cliente
      if (hash && hashesGlobales[hash]) {
        incidencias.push({
          archivo: id, fila: filaOrigen,
          columna: columnLetter(colsClave.sku + 1),
          valor: "También en " + hashesGlobales[hash],
          motivo: "DUPLICADO_ENTRE_ARCHIVOS_CLIENTE",
          severidad: "BAJA", accion: "INCLUIDA con advertencia"
        });
      } else {
        hashesGlobales[hash] = id;
      }

      // Fila válida → incluir
      acc.push(row);
    });
  }

  return {
    headers: head,
    datos: acc,
    incidencias: incidencias,
    criticos: totalCriticos,
    duplicados: totalDuplicados,
    archivos: totalArchivos
  };
}





/**
 * Ejecuta la actualización de todos los archivos existentes.
 * Se recomienda programar este activador para las 01:00 AM.
 */

function instalarActivador() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'actualizarTodosLosReportesMensuales') {
      SpreadsheetApp.getUi().alert("Activador diario ya instalado.");
      return;
    }
  }
  ScriptApp.newTrigger('actualizarTodosLosReportesMensuales').timeBased().everyDays(1).atHour(18).create();
  SpreadsheetApp.getUi().alert("Activador diario instalado (Día 1, 6:00 AM).");
}

function instalarActivadorMetricas() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'llenarDatosDesdeAnalisis') {
      SpreadsheetApp.getUi().alert("Activador DIARIO de métricas ya instalado.");
      return;
    }
  }
  // Ejecuta llenarDatosDesdeAnalisis cada día a las 5 AM
  ScriptApp.newTrigger('llenarDatosDesdeAnalisis').timeBased().everyDays(1).atHour(5).create();
  SpreadsheetApp.getUi().alert("Activador DIARIO instalado (5:00 AM).");
}

/* ============================
   UTILIDADES
   ============================ */

function valueNotEmpty(v){return v!==null&&v!==undefined&&(typeof v!=='string'||v.trim()!=='');}

function esNumeroValido(v){if(!valueNotEmpty(v))return false;var s=String(v).trim().replace(",",".");if(/[a-zA-Z]/.test(s))return false;return !isNaN(parseFloat(s))&&isFinite(s);}

function extractIdFromUrl(t){if(!t)return"";var s=String(t).trim(),m=s.match(/[-\w]{25,50}/g);return m?m[m.length-1]:s;}

function safeOpenSpreadsheet(id){try{return{ss:SpreadsheetApp.openById(id),error:null}}catch(e){return{ss:null,error:e.message}}}

function tryOpenSpreadsheetWithRetries(id,r,d){while(r>0){var res=safeOpenSpreadsheet(id);if(res.ss)return res;r--;Utilities.sleep(d);}return{ss:null};}

function ensureColumns(s,n){if(s.getMaxColumns()<n)s.insertColumnsAfter(s.getMaxColumns(),n-s.getMaxColumns());}

function columnLetter(n){var s='',t;while(n>0){t=(n-1)%26;s=String.fromCharCode(65+t)+s;n=Math.floor((n-1)/26);}return s;}

function detectColumnCantidadSmart(h,d,l){if(h)for(var i=0;i<h.length;i++){if(String(h[i]).toUpperCase().match(/CONTEO FINAL|CANTIDAD|TOTAL|SALDO/))return i;}return detectColumnCantidadFromDisplay(d,l);}

function detectColumnCantidadFromDisplay(d,l){if(!d)return null;var p=[21,20,22];for(var k=0;k<p.length;k++)if(p[k]<l)for(var r=0;r<d.length;r++)if(valueNotEmpty(d[r][p[k]]))return p[k];for(var c=0;c<Math.min(l,60);c++)for(var rr=0;rr<d.length;rr++)if(valueNotEmpty(d[rr][c]))return c;return null;}

function importarDatosIniciales(s,r,id){try{var f=SpreadsheetApp.openById(id).getSheetByName("PLANILLA DE CONTEO FISICO");if(f&&f.getLastRow()>1){var v=f.getRange(2,1,f.getLastRow()-1,f.getLastColumn()).getValues(),inv=s.getSheetByName("INVENTARIOS");if(inv){ensureColumns(inv,v[0].length);inv.getRange(inv.getLastRow()+1,1,v.length,v[0].length).setValues(v);}}}catch(e){}}

/* ============================================================
   FUNCIÓN DE ACTUALIZACIÓN DE MÉTRICAS (LÓGICA ORIGINAL + SEGURIDAD)
   ============================================================ */

function llenarDatosDesdeAnalisis() {
  var lock = LockService.getScriptLock();
  // Espera corta para no bloquear, si está ocupado salimos para no chocar con consolidación
  if (!lock.tryLock(10000)) return; 

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var hojaActual = ss.getSheetByName("PANEL DE CONTROL");
    if (!hojaActual) return;

    var lastRow = hojaActual.getLastRow();
    if (lastRow < 2) return;

    // 1. CARGAMOS LOS DATOS ACTUALES (Para no perderlos si falla la conexión)
    // IDs en Columna C (Índice 3)
    var datosIDs = hojaActual.getRange(2, 3, lastRow - 1, 1).getValues();
    
    // Columna E (Dato Extra Registro) - Leemos lo que ya existe
    var rangoColE = hojaActual.getRange(2, 5, lastRow - 1, 1);
    var valoresColE = rangoColE.getValues();
    
    // Columnas J a O (Métricas Análisis) - Leemos lo que ya existe
    var rangoMetricas = hojaActual.getRange(2, 10, lastRow - 1, 6);
    var valoresMetricas = rangoMetricas.getValues();

    var huboCambios = false;

    // 2. PROCESAMOS FILA POR FILA (Respetando lógica original)
    for (var i = 0; i < datosIDs.length; i++) {
      var idRaw = datosIDs[i][0];
      
      if (idRaw) {
        var id = extractIdFromUrl(idRaw);
        
        try {
          // Intentamos abrir. Si falla, va al 'catch' y NO borra los datos existentes en los arrays
          var ssArchivo = SpreadsheetApp.openById(id);
          
          // --- LOGICA ORIGINAL DE LECTURA ---
          var hojaAnalisis = ssArchivo.getSheetByName("ANALISIS");
          var hojaRegistro = ssArchivo.getSheetByName("REGISTRO");

          // A. Lógica ANALISIS (Celdas específicas)
          if (hojaAnalisis) {
            // Actualizamos el array en memoria SOLO si leemos con éxito
            valoresMetricas[i][0] = hojaAnalisis.getRange("C23").getValue(); // Unidades
            valoresMetricas[i][1] = hojaAnalisis.getRange("H23").getValue(); // Referencias
            valoresMetricas[i][2] = hojaAnalisis.getRange("M23").getValue(); // Posiciones
            valoresMetricas[i][3] = hojaAnalisis.getRange("C25").getValue(); // Extra 1
            valoresMetricas[i][4] = hojaAnalisis.getRange("H25").getValue(); // Extra 2
            valoresMetricas[i][5] = hojaAnalisis.getRange("M25").getValue(); // Extra 3
            huboCambios = true;
          }

          // B. Lógica REGISTRO (Última fila, Columna 1)
          if (hojaRegistro) {
            var ultimaFila = hojaRegistro.getLastRow();
            if (ultimaFila >= 1) {
              valoresColE[i][0] = hojaRegistro.getRange(ultimaFila, 1).getValue();
              huboCambios = true;
            }
          }

        } catch (error) {
          // Si falla abrir el archivo, NO hacemos nada.
          // El array 'valoresMetricas' mantiene el dato antiguo que leímos al principio.
          // Así evitamos que se ponga en blanco.
          Logger.log("Saltando archivo " + id + " (Mantiene dato anterior): " + error.message);
        }
      }
    }

    // 3. GUARDAMOS RESULTADOS (Solo si hubo lecturas exitosas)
    if (huboCambios) {
      rangoMetricas.setValues(valoresMetricas); // Escribe J-O
      rangoColE.setValues(valoresColE);         // Escribe E
      // Opcional: Timestamp de ejecución en celda K1 para control
      // hojaActual.getRange("K1").setNote("Actualizado: " + new Date());
    }

  } catch (e) {
    Logger.log("Error crítico en actualización: " + e.message);
  } finally {
    lock.releaseLock();
  }
}

function limpiarHojaConsolidada(){var s=SpreadsheetApp.getActiveSpreadsheet();['INVENTARIOS','REGISTRO'].forEach(function(n){var h=s.getSheetByName(n);if(h&&h.getLastRow()>1){var d=h.getRange(2,1,h.getLastRow()-1,h.getLastColumn()).getValues(),c=[],u=new Set();d.forEach(function(r){if(r.some(function(x){return valueNotEmpty(x)})){var k=JSON.stringify(r);if(!u.has(k)){u.add(k);c.push(r)}}});h.getRange(2,1,h.getLastRow(),h.getLastColumn()).clear({contentsOnly:true});if(c.length)h.getRange(2,1,c.length,c[0].length).setValues(c);}});}

function exportarConsolidadoAInventario(datosOpcionales) {
  try {
    var ssActual = SpreadsheetApp.getActiveSpreadsheet();
    var hojaOrigen = ssActual.getSheetByName("INVENTARIOS");
    var datosParaExportar = datosOpcionales;

    // 1. Si no se reciben datos (ej. ejecución manual), leer de la hoja actual
    if (!datosParaExportar) {
      if (hojaOrigen && hojaOrigen.getLastRow() > 1) {
        // Leemos desde la fila 2 hasta el final
        datosParaExportar = hojaOrigen.getRange(2, 1, hojaOrigen.getLastRow() - 1, hojaOrigen.getLastColumn()).getValues();
      } else {
        Logger.log("⚠️ No hay datos en INVENTARIOS para exportar a la Matriz.");
        return; // Salimos si no hay nada
      }
    }
    // FIX FASE 8.12: normalizar Date objects en TODA la matriz antes de
    // escribirla en la MATRIZ_INVENTARIOS_UIO (que puede estar en otro timezone).
    datosParaExportar = _normalizarFechasMatriz(datosParaExportar);

    // 2. Conexión Directa a la Matriz (Usando el ID fijo)
    var idMatriz = CONFIG.INVENTARIO_GLOBAL_ID; 
    var ssDestino;
    
    try {
      ssDestino = SpreadsheetApp.openById(idMatriz);
    } catch (err) {
      // Fallback: Si falla el ID, intentar buscar por nombre como respaldo
      var archivos = DriveApp.getFilesByName(CONFIG.INVENTARIO_GLOBAL_NAME);
      if (archivos.hasNext()) {
        ssDestino = SpreadsheetApp.open(archivos.next());
      } else {
        throw new Error("No se encuentra el archivo Matriz con ID: " + idMatriz);
      }
    }

    // 3. Gestión de la Hoja Destino
    var nombreHojaDestino = "Inventarios"; // O el nombre que tenga tu hoja en la matriz
    var hojaDestino = ssDestino.getSheetByName(nombreHojaDestino);
    
    if (!hojaDestino) {
      hojaDestino = ssDestino.insertSheet(nombreHojaDestino);
    }

    // 4. Escritura de Datos (Sobrescritura Mensual)
    hojaDestino.clearContents(); // Limpiamos datos viejos para poner el corte del mes

    // A. Copiar Encabezados (Vital para que se entienda la data)
    // Los tomamos de la hoja origen actual para asegurar consistencia
    if (hojaOrigen) {
      var encabezados = hojaOrigen.getRange(1, 1, 1, hojaOrigen.getLastColumn()).getValues();
      encabezados = _normalizarFechasMatriz(encabezados);
      hojaDestino.getRange(1, 1, 1, encabezados[0].length).setValues(encabezados);
      hojaDestino.getRange(1, 1, 1, encabezados[0].length).setFontWeight("bold").setBackground("#f3f3f3");
    }

    // B. Pegar los Datos del Cuerpo
    if (datosParaExportar && datosParaExportar.length > 0) {
      // Asegurar que la matriz tenga suficientes columnas
      if (hojaDestino.getMaxColumns() < datosParaExportar[0].length) {
        hojaDestino.insertColumnsAfter(hojaDestino.getMaxColumns(), datosParaExportar[0].length - hojaDestino.getMaxColumns());
      }

      // FIX FASE 8.12: forzar formato texto en columnas de fecha de la matriz destino,
      // para que Power BI las parsee como dd/MM/yyyy sin confusión con la zona horaria
      // del archivo destino (que puede diferir del origen).
      hojaDestino.getRange(2, 1, datosParaExportar.length, datosParaExportar[0].length)
        .setNumberFormat("@")  // formato texto explícito
        .setValues(datosParaExportar);

      // Nota de auditoría
      hojaDestino.getRange("A1").setNote("Última Carga Automática: " + new Date());
    }

    Logger.log("✅ Exportación exitosa a Matriz UIO (" + datosParaExportar.length + " filas).");

  } catch (e) {
    Logger.log("❌ Error en exportarConsolidadoAInventario: " + e.message);
    // Opcional: Avisar al usuario si es una ejecución manual
    if (!datosOpcionales) SpreadsheetApp.getUi().alert("Error al exportar a Matriz: " + e.message);
  }
}

/* ============================
   CONFIGURACIÓN DE HORARIOS (3 VECES AL DÍA)
   ============================ */

function exportarReporteDeUnCliente(){exportarReporteDeUnClienteArchivo();}

function testCronogramaManual(){SpreadsheetApp.getUi().alert("Logística OK");}



/* ==========================================================================
   FUNCIÓN DE EXPORTACIÓN A MATRIZ (CONECTADA AL ID ESPECÍFICO)
   ========================================================================== */

function instalarActivadoresDiarios() {
  var ui = SpreadsheetApp.getUi();
  
  // 1. Limpieza: Borrar triggers anteriores de esta función para no duplicar
  var triggers = ScriptApp.getProjectTriggers();
  var borrados = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'llenarDatosDesdeAnalisis') {
      ScriptApp.deleteTrigger(triggers[i]);
      borrados++;
    }
  }

  // 2. Crear los 3 horarios (Aprox 8am, 1pm, 6pm)
  // Nota: Google maneja ventanas de +/- 15 min
  
  // Mañana (08:00)
  ScriptApp.newTrigger('llenarDatosDesdeAnalisis')
      .timeBased().everyDays(1).atHour(8).create();

  // Tarde (13:00)
  ScriptApp.newTrigger('llenarDatosDesdeAnalisis')
      .timeBased().everyDays(1).atHour(13).create();

  // Noche (18:00)
  ScriptApp.newTrigger('llenarDatosDesdeAnalisis')
      .timeBased().everyDays(1).atHour(18).create();

  ui.alert("✅ Programación Exitosa:\n\n" +
           "- Se eliminaron " + borrados + " configuraciones antiguas.\n" +
           "- Se activó la actualización automática para:\n" +
           "  🕒 08:00 AM\n  🕒 01:00 PM\n  🕒 06:00 PM");
}


// ==========================================
// FUNCIONES DEL CENTRO DE MANDO GERENCIAL
// ==========================================

function obtenerDatosCronograma() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Usamos el nombre exacto de tu pestaña según la imagen
  const sheet = ss.getSheetByName("CRONOGRAMA - 2026"); 
  if (!sheet) throw new Error("No se encontró la hoja CRONOGRAMA - 2026");

  // Según tu imagen, los datos empiezan en la fila 9. Leemos desde la Columna C hasta la O.
  const data = sheet.getRange("C9:O" + sheet.getLastRow()).getValues();

  let resultados = [];
  
  data.forEach(row => {
    // Índices del array (basado en rango C-O):
    // C=0(Titulo), D=1(Cliente), E=2(Cat), F=3(Mes), G=4(Frec), H=5(Resp), I=6(Prio), J=7(Fecha Inicio), K=8(Estado)
    let cliente = row[1];
    let fechaInicioRaw = row[7];
    let estado = row[8] || 'Pendiente';

    if (cliente && cliente !== "") {
      resultados.push({
        cliente: cliente,
        fechaInicio: fechaInicioRaw ? new Date(fechaInicioRaw).getTime() : null, // Convertimos a timestamp para ordenar
        estado: estado
      });
    }
  });

  return resultados;
}


/**
 * Procesa la selección del usuario y genera un ZIP con los archivos correspondientes en formato Excel.
 * Genera una hoja temporal con el reporte de fallos indicando el nombre de la Columna B.
 */

function prepararDescargaZip() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet(); 
  const range = sheet.getActiveRange();
  const startRow = range.getRow();
  const numRows = range.getNumRows();
  
  if (startRow < 2) {
    SpreadsheetApp.getUi().alert("Por favor, selecciona filas de datos (de la fila 2 en adelante).");
    return;
  }

  // Obtenemos las columnas A (0), B (1) y C (2)
  const data = sheet.getRange(startRow, 1, numRows, 3).getValues();
  
  let blobs = [];
  let nombresUsados = {};
  let erroresLog = []; // Guardará objetos: {archivo: "NombreColB", motivo: "Error..."}
  
  let token = ScriptApp.getOAuthToken();

  for (let i = 0; i < data.length; i++) {
    // Tomamos el nombre desde la Columna B (índice 1 en el array)
    let nombreColB = data[i][1] ? data[i][1].toString().trim() : "Fila " + (startRow + i);
    let nombreCliente = data[i][0] ? data[i][0].toString().trim() : "Sin_Nombre";
    
    let fileIdRaw = data[i][2]; 
    let fileId = fileIdRaw ? fileIdRaw.toString().trim() : "";

    if (fileId.length > 10) {
      try {
        let url = "https://docs.google.com/spreadsheets/export?id=" + fileId + "&exportFormat=xlsx";
        let response = UrlFetchApp.fetch(url, {
          headers: { 'Authorization': 'Bearer ' + token },
          muteHttpExceptions: true
        });
        
        let statusCode = response.getResponseCode();
        
        if (statusCode === 200) {
          let blob = response.getBlob();
          // Usamos el nombre de la Columna B para el archivo Excel
          let nombreFinal = nombreColB; 
          
          if (nombresUsados[nombreFinal]) {
            nombresUsados[nombreFinal]++;
            nombreFinal += "_" + nombresUsados[nombreFinal];
          } else {
            nombresUsados[nombreFinal] = 1;
          }
          
          blob.setName(nombreFinal + ".xlsx");
          blobs.push(blob);
        } else {
          erroresLog.push({archivo: nombreColB, motivo: "Error HTTP " + statusCode + " (El ID puede estar corrupto o no tienes permiso para leer ese archivo específico)"});
        }
        
      } catch (e) {
        erroresLog.push({archivo: nombreColB, motivo: "Fallo de conexión: " + e.message});
      }
    } else if (fileId !== "") {
       erroresLog.push({archivo: nombreColB, motivo: "El texto en la columna C no es un ID válido de Google Drive."});
    }
  }

  // ==========================================
  // CREACIÓN DE HOJA TEMPORAL DE ERRORES
  // ==========================================
  if (erroresLog.length > 0) {
    let tempSheetName = "Reporte_Descargas_Fallidas";
    let tempSheet = ss.getSheetByName(tempSheetName);
    
    // Si la hoja ya existe, la limpiamos. Si no, la creamos.
    if (tempSheet) {
      tempSheet.clear();
    } else {
      tempSheet = ss.insertSheet(tempSheetName);
    }
    
    // Cabeceras
    tempSheet.appendRow(["Archivo (Columna B)", "Motivo del Fallo"]);
    tempSheet.getRange("A1:B1").setFontWeight("bold").setBackground("#f4cccc");
    
    // Llenar datos de error
    erroresLog.forEach(err => {
      tempSheet.appendRow([err.archivo, err.motivo]);
    });
    
    // Autoajustar tamaño de columnas
    tempSheet.autoResizeColumns(1, 2);
  } else {
    // Si no hubo errores y la hoja existe de un proceso anterior, la podemos borrar o limpiar
    let tempSheet = ss.getSheetByName("Reporte_Descargas_Fallidas");
    if (tempSheet) ss.deleteSheet(tempSheet);
  }

  // ==========================================
  // MANEJO FINAL DE INTERFAZ Y DESCARGA
  // ==========================================
  if (blobs.length === 0) {
    SpreadsheetApp.getUi().alert("No se pudo descargar ningún archivo.\n\nSe ha generado/actualizado la pestaña 'Reporte_Descargas_Fallidas' con los motivos exactos.");
    return;
  }

  if (erroresLog.length > 0) {
    SpreadsheetApp.getUi().alert("Atención: Se empaquetarán " + blobs.length + " archivos, pero " + erroresLog.length + " fallaron.\n\nPor favor, revisa la pestaña 'Reporte_Descargas_Fallidas' para ver qué archivos no se pudieron procesar.");
  }

  // Creamos el archivo ZIP
  const zipBlob = Utilities.zip(blobs, "Export_Inventarios_" + Utilities.formatDate(new Date(), "GMT-5", "yyyyMMdd_HHmm") + ".zip");
  const base64Zip = Utilities.base64Encode(zipBlob.getBytes());
  const fileName = zipBlob.getName();

  // Abrimos el diálogo de descarga
  const htmlTemplate = HtmlService.createTemplateFromFile('DescargarZipUI');
  htmlTemplate.base64 = base64Zip;
  htmlTemplate.fileName = fileName;
  
  const html = htmlTemplate.evaluate().setWidth(300).setHeight(150);
  SpreadsheetApp.getUi().showModalDialog(html, "Descarga Lista");
}

/* ====================== FIN SECCIÓN LEGACY ====================== */