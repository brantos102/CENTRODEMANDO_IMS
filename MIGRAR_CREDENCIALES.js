/**
 * MIGRAR_CREDENCIALES.gs — Copia credenciales API entre proyectos Apps Script.
 * ---------------------------------------------------------------------------
 * Las credenciales viven en las Propiedades del Script, que NO se copian al
 * duplicar un archivo de Drive. Por eso la copia de desarrollo aparece sin
 * credenciales aunque el código sea el mismo.
 *
 * USO (una sola vez, desde el editor):
 *   1. En el proyecto de PRODUCCIÓN → ejecuta  exportarCredenciales()
 *      y copia el texto que aparece en el registro de ejecución.
 *   2. En el proyecto de DESARROLLO → pega ese texto en PEGAR_AQUI (abajo)
 *      y ejecuta  importarCredenciales().
 *
 * ⚠ El registro muestra las claves en claro mientras dura la operación. Son tus
 *   credenciales y tus dos proyectos, así que es correcto, pero:
 *   · no compartas ese registro,
 *   · borra este archivo del proyecto cuando termines,
 *   · y NO lo subas a producción (basta con desarrollo).
 *
 * Copia las llaves de AMBAS sedes:
 *   CRED_API_<CLIENTE>     → Quito      (q_apidepot)
 *   CREDGYE_API_<CLIENTE>  → Guayaquil  (g_apidepot)
 */

/** Prefijos que se consideran credenciales de API. */
var MIGRA_PREFIJOS = ["CRED_API_", "CREDGYE_API_"];

/**
 * PRODUCCIÓN: muestra en el registro las credenciales para copiarlas.
 * No modifica nada.
 */
function exportarCredenciales() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var out = {}, cuenta = { CRED_API_: 0, CREDGYE_API_: 0 };

  for (var k in props) {
    for (var i = 0; i < MIGRA_PREFIJOS.length; i++) {
      var pre = MIGRA_PREFIJOS[i];
      // CREDGYE_API_ empieza por "CRED", así que se compara el prefijo completo.
      if (k.indexOf(pre) === 0 && (pre !== "CRED_API_" || k.indexOf("CREDGYE_API_") !== 0)) {
        out[k] = props[k];
        cuenta[pre]++;
        break;
      }
    }
  }

  var json = JSON.stringify(out);
  Logger.log("Credenciales encontradas: " + cuenta["CRED_API_"] + " de Quito, " +
             cuenta["CREDGYE_API_"] + " de Guayaquil.\n\n" +
             "Copia TODO el bloque siguiente y pégalo en PEGAR_AQUI del proyecto de desarrollo:\n\n" +
             json);
  return json;
}

/**
 * DESARROLLO: pega arriba el texto exportado y ejecuta.
 * Las credenciales existentes con el mismo nombre se reemplazan.
 */
function importarCredenciales() {
  var PEGAR_AQUI = '';   // <-- pega aquí el JSON que devolvió exportarCredenciales()

  var texto = String(PEGAR_AQUI || "").trim();
  if (!texto) {
    throw new Error("Pega primero el JSON exportado en la variable PEGAR_AQUI.");
  }

  var obj;
  try { obj = JSON.parse(texto); }
  catch (e) { throw new Error("El texto pegado no es un JSON válido: " + e.message); }

  var sp = PropertiesService.getScriptProperties();
  var n = 0, uio = 0, gye = 0, ignoradas = 0;

  for (var k in obj) {
    var esGye = k.indexOf("CREDGYE_API_") === 0;
    var esUio = !esGye && k.indexOf("CRED_API_") === 0;
    if (!esGye && !esUio) { ignoradas++; continue; }   // solo credenciales
    sp.setProperty(k, obj[k]);
    n++; if (esGye) gye++; else uio++;
  }

  // Los tokens del día se invalidan para que se renueven con estas credenciales.
  var todas = sp.getProperties();
  var tokensBorrados = 0;
  for (var t in todas) {
    if (t.indexOf("ITSANET_TOKEN_") === 0 || t.indexOf("FECHA_TOKEN_") === 0) {
      sp.deleteProperty(t); tokensBorrados++;
    }
  }

  Logger.log("✓ Importadas " + n + " credenciales (" + uio + " Quito, " + gye + " Guayaquil)." +
             (ignoradas ? "\n  Ignoradas " + ignoradas + " llaves que no son credenciales." : "") +
             "\n  Tokens en caché borrados: " + tokensBorrados + " (se renovarán al primer uso).");
  return { ok: true, importadas: n, uio: uio, gye: gye };
}

/**
 * Comprueba qué credenciales hay en ESTE proyecto, sin mostrar las claves.
 * Útil para verificar antes y después de importar.
 */
function verificarCredenciales() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var uio = [], gye = [];
  for (var k in props) {
    if (k.indexOf("CREDGYE_API_") === 0) gye.push(k.substring("CREDGYE_API_".length));
    else if (k.indexOf("CRED_API_") === 0) uio.push(k.substring("CRED_API_".length));
  }
  uio.sort(); gye.sort();
  Logger.log("QUITO (" + uio.length + "): " + (uio.join(", ") || "—") +
             "\n\nGUAYAQUIL (" + gye.length + "): " + (gye.join(", ") || "—"));
  return { uio: uio, gye: gye };
}
