/**
 * PUENTE_ACCIONES.gs — Ejecuta acciones del Centro de Mando por HTTP.
 * ---------------------------------------------------------------------------
 * Permite que el panel de Vercel dispare acciones que SOLO pueden correr aquí
 * (Drive, Calendar, Gmail, Spreadsheet). El flujo es:
 *
 *   Vercel (botón) → Railway (guarda el secreto) → ESTE endpoint → dash_*
 *
 * Requisitos de despliegue (Implementar → Nueva implementación → Aplicación web):
 *   · Ejecutar como:  Yo (bespinoza@itsanet.com)  ← usa TUS permisos
 *   · Quién tiene acceso:  Cualquier usuario
 * El acceso queda protegido por PUENTE_SECRETO (Propiedades del Script), no por
 * la sesión de Google: sin el secreto correcto, no se ejecuta nada.
 *
 * IMPORTANTE: este archivo define SOLO doPost. El doGet del proyecto (el que
 * sirve el Centro de Mando y el Terminal WMS) NO se toca: sigue igual. En Apps
 * Script todos los archivos comparten el mismo ámbito, así que definir aquí un
 * doGet lo habría sobrescrito y roto la operación.
 */

/** Acciones permitidas. Solo estas pueden dispararse desde fuera. */
var PUENTE_ACCIONES = {
  actualizar_metricas:   function () { return dash_actualizarMetricas(); },
  consolidar_todo:       function () { return dash_consolidarTodo(); },
  consolidar_inventarios:function () { return dash_consolidarInv(); },
  consolidar_registro:   function () { return dash_consolidarReg(); },
  estado_consolidacion:  function () { return dash_estadoConsolidacion(); },
  continuar_consolidacion:function(){ return dash_continuarConsolidacion(); },
  limpiar_duplicados:    function () { return dash_limpiarDuplicados(); },
  sincronizar_calendario:function () { return dash_sincronizarCalendario(); },
  enviar_recordatorios:  function () { return enviarRecordatoriosCronograma(); },
  sincronizar_panel:     function () { return sincronizarEstadoCronogramaConPanel(); },
  garantizar_accesos:    function () { return dash_garantizarAccesosTodos(); },
  // Sincronización con Supabase (definidas en SUPABASE.gs)
  sync_supabase:         function () { return sincronizarTodoSupabase(); },
  estado_sync:           function () { return estadoSyncSupabase(); }
};

/** Comprueba el secreto compartido con Railway. */
function _puenteAutorizado(p) {
  var esperado = PropertiesService.getScriptProperties().getProperty("PUENTE_SECRETO");
  if (!esperado) return false;                       // sin secreto configurado: cerrado
  return String((p && p.secreto) || "").trim() === String(esperado).trim();
}

function _puenteJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Punto de entrada HTTP. Railway envía:
 *   { "secreto": "...", "accion": "actualizar_metricas" }
 */
function doPost(e) {
  var cuerpo = {};
  try { cuerpo = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (err) {}

  if (!_puenteAutorizado(cuerpo)) {
    return _puenteJson({ ok: false, error: "No autorizado" });
  }

  var nombre = String(cuerpo.accion || "").trim();
  if (nombre === "acciones") {
    return _puenteJson({ ok: true, acciones: Object.keys(PUENTE_ACCIONES) });
  }
  var fn = PUENTE_ACCIONES[nombre];
  if (!fn) {
    return _puenteJson({ ok: false, error: 'Acción no permitida: "' + nombre + '"',
                         acciones: Object.keys(PUENTE_ACCIONES) });
  }

  var t0 = new Date().getTime();
  try {
    var r = fn();
    try {
      if (typeof _registrarActividad === "function") {
        _registrarActividad("panel-web", "accion_remota", "", nombre);
      }
    } catch (eL) {}
    return _puenteJson({ ok: true, accion: nombre, ms: new Date().getTime() - t0, resultado: r });
  } catch (err) {
    return _puenteJson({ ok: false, accion: nombre, error: String(err && err.message || err) });
  }
}

/**
 * Ejecutar UNA vez desde el editor: genera y guarda el secreto del puente.
 * Copia el valor que aparece en el registro y ponlo en Railway como
 * variable PUENTE_SECRETO (y la URL /exec como PUENTE_URL).
 */
function generarSecretoPuente() {
  var abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var s = "";
  for (var i = 0; i < 48; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
  PropertiesService.getScriptProperties().setProperty("PUENTE_SECRETO", s);
  Logger.log("PUENTE_SECRETO generado (cópialo a Railway):\n" + s +
             "\n\nY la URL del Web App (/exec) va en Railway como PUENTE_URL.");
  return s;
}
