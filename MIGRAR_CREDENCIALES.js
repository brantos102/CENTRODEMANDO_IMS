/**
 * MIGRAR_CREDENCIALES.gs — Copia credenciales API entre proyectos Apps Script.
 * ---------------------------------------------------------------------------
 * Las credenciales viven en las Propiedades del Script, que NO se copian al
 * duplicar un archivo de Drive. Por eso la copia de desarrollo aparece sin
 * credenciales aunque el código sea idéntico.
 *
 * El traspaso va por un archivo TEMPORAL en tu Drive, no por copiar y pegar:
 * el registro de ejecución trunca los textos largos y pegar claves dentro del
 * código las deja escritas en el proyecto. Aquí nunca se ven en pantalla.
 *
 * USO (una sola vez):
 *   1. PRODUCCIÓN  → ejecuta  exportarCredenciales()
 *                    y copia el ID que muestra el registro (solo el ID).
 *   2. DESARROLLO  → pon ese ID en ARCHIVO_ID (abajo) y ejecuta
 *                    importarCredenciales(). Al terminar borra el archivo.
 *
 * Cubre las dos sedes:
 *   CRED_API_<CLIENTE>     → Quito      (q_apidepot)
 *   CREDGYE_API_<CLIENTE>  → Guayaquil  (g_apidepot)
 */

/** ¿La llave es una credencial de API? */
function _esCredencial(k) {
  return k.indexOf("CREDGYE_API_") === 0 || k.indexOf("CRED_API_") === 0;
}

/**
 * PRODUCCIÓN: guarda las credenciales en un archivo temporal de Drive.
 * No las muestra en el registro; solo devuelve el ID del archivo.
 */
function exportarCredenciales() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var out = {}, uio = 0, gye = 0;

  for (var k in props) {
    if (!_esCredencial(k)) continue;
    out[k] = props[k];
    if (k.indexOf("CREDGYE_API_") === 0) gye++; else uio++;
  }
  if (!uio && !gye) throw new Error("Este proyecto no tiene credenciales guardadas.");

  var archivo = DriveApp.createFile(
    "TRASPASO_CREDENCIALES_" + new Date().getTime() + ".json",
    JSON.stringify(out),
    MimeType.PLAIN_TEXT
  );

  Logger.log(
    "Credenciales listas para el traspaso: " + uio + " de Quito, " + gye + " de Guayaquil.\n\n" +
    "Copia SOLO este ID y ponlo en ARCHIVO_ID del proyecto de desarrollo:\n\n" +
    archivo.getId() + "\n\n" +
    "El archivo queda en tu Drive y se borra solo al importar.\n" +
    "Si cancelas el traspaso, bórralo a mano: " + archivo.getUrl()
  );
  return archivo.getId();
}

/**
 * DESARROLLO: lee el archivo temporal, importa las credenciales y lo borra.
 * Las existentes con el mismo nombre se reemplazan.
 */
function importarCredenciales() {
  var ARCHIVO_ID = '';   // <-- pega aquí SOLO el ID que devolvió exportarCredenciales()

  var id = String(ARCHIVO_ID || "").trim();
  if (!id) throw new Error("Pon en ARCHIVO_ID el identificador que devolvió exportarCredenciales().");
  // Por si pegan la URL completa en vez del ID.
  var m = id.match(/[-\w]{25,}/);
  if (m) id = m[0];

  var texto;
  try { texto = DriveApp.getFileById(id).getBlob().getDataAsString(); }
  catch (e) { throw new Error("No pude abrir el archivo " + id + ": " + e.message); }

  var obj;
  try { obj = JSON.parse(texto); }
  catch (e) { throw new Error("El archivo no contiene un JSON válido: " + e.message); }

  var sp = PropertiesService.getScriptProperties();
  var uio = 0, gye = 0, ignoradas = 0;

  for (var k in obj) {
    if (!_esCredencial(k)) { ignoradas++; continue; }
    sp.setProperty(k, obj[k]);
    if (k.indexOf("CREDGYE_API_") === 0) gye++; else uio++;
  }

  // Los tokens del día se invalidan para que se renueven con estas credenciales.
  var todas = sp.getProperties(), tokens = 0;
  for (var t in todas) {
    if (t.indexOf("ITSANET_TOKEN_") === 0 || t.indexOf("FECHA_TOKEN_") === 0) {
      sp.deleteProperty(t); tokens++;
    }
  }

  // El archivo ya cumplió su función: no debe quedarse en Drive.
  var borrado = true;
  try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { borrado = false; }

  Logger.log(
    "✓ Importadas " + (uio + gye) + " credenciales (" + uio + " Quito, " + gye + " Guayaquil)." +
    (ignoradas ? "\n  Ignoradas " + ignoradas + " llaves que no eran credenciales." : "") +
    "\n  Tokens en caché borrados: " + tokens + " (se renovarán al primer uso)." +
    (borrado ? "\n  Archivo de traspaso enviado a la papelera."
             : "\n  ⚠ No pude borrar el archivo de traspaso: bórralo a mano.")
  );
  return { ok: true, uio: uio, gye: gye };
}

/**
 * Lista qué credenciales hay en ESTE proyecto, sin mostrar las claves.
 * Úsala antes y después de importar para confirmar.
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
