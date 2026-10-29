/**
 * INVENTARIO_CREDENCIALES.gs — Qué credenciales API hay registradas. Solo lee.
 * ---------------------------------------------------------------------------
 * Genera un TXT en tu Drive con el inventario completo: qué clientes tienen
 * credencial, en qué sede, con qué usuario, si su token está vigente y qué
 * clientes faltan en una sede respecto de la otra.
 *
 * NO incluye contraseñas, y es deliberado. Un inventario sirve para planificar
 * y auditar, y para eso basta saber QUÉ hay. Un archivo con las claves dentro
 * se reenvía, se respalda y se queda en descargas; una vez que sale del almacén
 * del proyecto ya no se sabe dónde está.
 *
 * Si lo que necesitas es MOVER las credenciales a otro proyecto —por ejemplo
 * llevar las de Guayaquil a producción— eso no se hace con un TXT: se hace con
 * exportarCredenciales() e importarCredenciales() de MIGRAR_CREDENCIALES.gs,
 * que pasan las claves por un archivo temporal y lo destruyen al terminar.
 *
 * Ejecutar con el botón ▶ del editor y abrir el enlace que deja en el registro.
 */

var INVCRED_PREFIJOS = [
  { sede: "QUITO",      base: "q_apidepot", cred: "CRED_API_",    tok: "ITSANET_TOKEN_",     fec: "FECHA_TOKEN_" },
  { sede: "GUAYAQUIL",  base: "g_apidepot", cred: "CREDGYE_API_", tok: "ITSANET_TOKEN_GYE_", fec: "FECHA_TOKEN_GYE_" }
];

/** Lee una credencial sin exponer la clave: solo usuario y si está completa. */
function _invCredLeer(raw) {
  try {
    var j = JSON.parse(raw);
    if (!j) return { ok: false, motivo: "vacía" };
    var u = String(j.user || "").trim();
    var p = String(j.pass || "").trim();
    if (!u && !p) return { ok: false, motivo: "sin usuario ni clave" };
    if (!u)  return { ok: false, motivo: "sin usuario", usuario: "" };
    if (!p)  return { ok: false, motivo: "SIN CLAVE", usuario: u };
    return { ok: true, usuario: u };
  } catch (e) {
    return { ok: false, motivo: "no es JSON válido" };
  }
}

function _invCredPad(s, n) {
  s = String(s == null ? "" : s);
  while (s.length < n) s += " ";
  return s;
}

function generarInventarioCredenciales() {
  var sp    = PropertiesService.getScriptProperties();
  var props = sp.getProperties();
  var tz    = Session.getScriptTimeZone() || "America/Guayaquil";
  var hoy   = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  var sello = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm");

  var quien = "";
  try { quien = Session.getEffectiveUser().getEmail() || ""; } catch (e) {}

  var L = [];
  L.push("INVENTARIO DE CREDENCIALES API — ITSANET IMS");
  L.push("Generado: " + sello + "  (" + tz + ")");
  if (quien) L.push("Generado por: " + quien);
  L.push("");
  L.push("Este inventario NO contiene contraseñas. Ver nota al final.");
  L.push(new Array(76).join("="));
  L.push("");

  // ── Recorrer cada sede ──────────────────────────────────────────────────
  var porSede = {}, incidencias = [];

  INVCRED_PREFIJOS.forEach(function (S) {
    var filas = [];
    for (var k in props) {
      if (k.indexOf(S.cred) !== 0) continue;
      // CRED_API_ es prefijo de nada más, pero CREDGYE_API_ no debe contarse
      // dos veces: su llave no empieza por CRED_API_, así que no hay cruce.
      var cli = k.substring(S.cred.length);
      if (!cli) continue;

      var info = _invCredLeer(props[k]);
      var tokFecha = props[S.fec + cli] || "";
      var tokHay   = !!props[S.tok + cli];
      var tokEstado = !tokHay ? "—"
                    : (tokFecha === hoy ? "vigente · " + tokFecha
                                        : "caducado · " + (tokFecha || "sin fecha"));

      filas.push({ cliente: cli, usuario: info.usuario || "—",
                   estado: info.ok ? "OK" : info.motivo, token: tokEstado });

      if (!info.ok) incidencias.push(S.sede + " · " + cli + " → " + info.motivo);
    }
    filas.sort(function (a, b) { return a.cliente < b.cliente ? -1 : 1; });
    porSede[S.sede] = filas;
  });

  // ── Resumen ─────────────────────────────────────────────────────────────
  L.push("RESUMEN");
  INVCRED_PREFIJOS.forEach(function (S) {
    L.push("  " + _invCredPad(S.sede + " (" + S.base + ")", 32) +
           _invCredPad(porSede[S.sede].length, 4) + "cliente(s)");
  });
  var total = INVCRED_PREFIJOS.reduce(function (a, S) { return a + porSede[S.sede].length; }, 0);
  L.push("  " + _invCredPad("TOTAL", 32) + total);
  L.push("");

  // ── Detalle por sede ────────────────────────────────────────────────────
  INVCRED_PREFIJOS.forEach(function (S) {
    L.push(new Array(76).join("-"));
    L.push(S.sede + "  —  llaves " + S.cred + "*  —  " + S.base);
    L.push(new Array(76).join("-"));
    if (!porSede[S.sede].length) {
      L.push("  (ninguna credencial registrada en esta sede)");
      L.push("");
      return;
    }
    L.push("  " + _invCredPad("CLIENTE", 22) + _invCredPad("USUARIO", 24) +
           _invCredPad("ESTADO", 14) + "TOKEN DEL DÍA");
    porSede[S.sede].forEach(function (f) {
      L.push("  " + _invCredPad(f.cliente, 22) + _invCredPad(f.usuario, 24) +
             _invCredPad(f.estado, 14) + f.token);
    });
    L.push("");
  });

  // ── Cobertura entre sedes: lo que falta por migrar ──────────────────────
  var setQ = {}, setG = {};
  (porSede["QUITO"] || []).forEach(function (f) { setQ[f.cliente] = true; });
  (porSede["GUAYAQUIL"] || []).forEach(function (f) { setG[f.cliente] = true; });

  var soloQ = Object.keys(setQ).filter(function (c) { return !setG[c]; }).sort();
  var soloG = Object.keys(setG).filter(function (c) { return !setQ[c]; }).sort();
  var ambas = Object.keys(setQ).filter(function (c) { return setG[c]; }).sort();

  L.push(new Array(76).join("-"));
  L.push("COBERTURA ENTRE SEDES");
  L.push(new Array(76).join("-"));
  L.push("  En ambas sedes (" + ambas.length + "): " + (ambas.join(", ") || "—"));
  L.push("");
  L.push("  Solo en Quito (" + soloQ.length + "): " + (soloQ.join(", ") || "—"));
  L.push("");
  L.push("  Solo en Guayaquil (" + soloG.length + "): " + (soloG.join(", ") || "—"));
  L.push("");
  L.push("  Un cliente solo en una sede no es un error: puede no operar en la otra.");
  L.push("  Pero si debe contarse en ambas, le falta la credencial de la que no aparece.");
  L.push("");

  // ── Incidencias ─────────────────────────────────────────────────────────
  L.push(new Array(76).join("-"));
  L.push("INCIDENCIAS");
  L.push(new Array(76).join("-"));
  if (!incidencias.length) L.push("  Ninguna: todas las credenciales tienen usuario y clave.");
  else incidencias.forEach(function (x) { L.push("  ✗ " + x); });
  L.push("");

  // ── Nota ────────────────────────────────────────────────────────────────
  L.push(new Array(76).join("="));
  L.push("NOTA SOBRE LAS CONTRASEÑAS");
  L.push("");
  L.push("  Este archivo no las lleva, a propósito. Un inventario sirve para");
  L.push("  planificar y auditar, y para eso basta saber qué hay registrado.");
  L.push("");
  L.push("  Para MOVER credenciales a otro proyecto (por ejemplo llevar las de");
  L.push("  Guayaquil a producción) usa MIGRAR_CREDENCIALES.gs:");
  L.push("      1. En el proyecto origen : exportarCredenciales()");
  L.push("      2. En el proyecto destino: importarCredenciales() con ese ID");
  L.push("  Pasan por un archivo temporal que se destruye al terminar.");
  L.push("");
  L.push("  Para CAMBIAR una clave: Panel → Credenciales API. Al guardarla se");
  L.push("  invalida el token del día y se renueva con la nueva en el primer uso.");

  var texto = L.join("\n");
  var archivo = DriveApp.createFile(
    "INVENTARIO_CREDENCIALES_" + Utilities.formatDate(new Date(), tz, "yyyyMMdd_HHmm") + ".txt",
    texto, MimeType.PLAIN_TEXT);

  try {
    if (typeof _registrarActividad === "function" && typeof _usuarioActual === "function") {
      _registrarActividad(_usuarioActual(), "inventario_credenciales", "",
        total + " credenciales inventariadas (sin claves)");
    }
  } catch (e) {}

  Logger.log(texto + "\n\n" + new Array(76).join("=") +
             "\nArchivo TXT creado en tu Drive:\n" + archivo.getUrl());

  return { ok: true, total: total,
           quito: (porSede["QUITO"] || []).length,
           guayaquil: (porSede["GUAYAQUIL"] || []).length,
           incidencias: incidencias.length,
           url: archivo.getUrl() };
}
