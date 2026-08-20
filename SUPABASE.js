/**
 * SUPABASE.gs — Cliente mínimo para hablar con Supabase (REST/Data API).
 * ---------------------------------------------------------------------------
 * DEV / PRUEBA DE CONECTIVIDAD. Lee la URL y la llave desde Script Properties
 * (NO se ponen en el código ni se suben a git):
 *   SUPABASE_URL       = https://pssgqoyemglauyzntzwl.supabase.co   (base, sin /rest/v1)
 *   SUPABASE_ANON_KEY  = <anon public key>
 *
 * Nota de seguridad: esto usa la llave anon directo (DEV). Antes de producción
 * pondremos Railway/Edge Function delante para que Apps Script NUNCA tenga la
 * llave de base de datos.
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

/** Llamada genérica a la REST API de Supabase. path ej: "inventarios?select=*" */
function _supabaseFetch(path, method, body) {
  var c = _supabaseCfg();
  var opt = {
    method: method || "get",
    headers: {
      "apikey": c.key,
      "Authorization": "Bearer " + c.key,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    muteHttpExceptions: true
  };
  if (body) opt.payload = JSON.stringify(body);
  var res = UrlFetchApp.fetch(c.url + "/rest/v1/" + path, opt);
  return { code: res.getResponseCode(), body: res.getContentText() };
}

/** PRUEBA 1 (ejecutar desde el editor): inserta una fila en `inventarios`. */
function probarSupabase() {
  var r = _supabaseFetch("inventarios", "post", {
    cliente: "PRUEBA_CONEXION",
    responsable: "bespinoza",
    avance: "test",
    base: "UIO"
  });
  Logger.log("INSERT -> HTTP " + r.code + "\n" + r.body);
  return r;
}

/** PRUEBA 2 (ejecutar desde el editor): lee todo lo que hay en `inventarios`. */
function leerInventariosSupabase() {
  var r = _supabaseFetch("inventarios?select=*&order=creado_en.desc", "get");
  Logger.log("SELECT -> HTTP " + r.code + "\n" + r.body);
  return r;
}
