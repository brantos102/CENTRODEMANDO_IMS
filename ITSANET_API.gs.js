/**
 * ITSANET_API.gs — CONEXIÓN MULTI-CLIENTE con la API de ITSANET (Quito).
 * Objetivo: Conectar y OBTENER DATOS (stock) de forma efectiva y escalable.
 * * MEJORAS INTEGRADAS:
 * 1. Base URL actualizada a Quito (q_apidepot).
 * 2. Módulo multi-cliente: Lee credenciales dinámicamente de la pestaña CREDENCIALES_API.
 * 3. Blindaje JSON: Protege la app contra el "Unexpected end of JSON input" cuando Quito devuelve vacío.
 * 4. Funciones de prueba intactas para validación en el editor.
 */

var ITSANET_BASE = "https://ec.itsanet.com/q_apidepot"; // Endpoint QUITO

/**
 * (0) LEGACY — la pestaña ya NO es el almacén oficial (ver FASE 8.57).
 * Se conserva solo por compatibilidad; usa el panel → 🔐 Credenciales API.
 */
function crearHojaCredencialesAPI() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("CREDENCIALES_API");

  if (!sh) {
    sh = ss.insertSheet("CREDENCIALES_API");
    sh.getRange(1, 1, 1, 3).setValues([["CLIENTE (Igual al Panel)", "USUARIO_API", "PASSWORD_API"]]);
    sh.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#1a73e8").setFontColor("#ffffff");

    // Ejemplo (placeholder — NUNCA claves reales aquí: usa el panel)
    sh.appendRow(["EJEMPLO", "USUARIO_API", "TU_CLAVE_AQUI"]);

    sh.setColumnWidth(1, 200); sh.setColumnWidth(2, 150); sh.setColumnWidth(3, 200);
    SpreadsheetApp.getUi().alert("⚠ AVISO: esta pestaña es LEGACY. Registra las credenciales desde el Panel → 🔐 Credenciales API (quedan fuera de la vista).");
  } else {
    sh.showSheet();
    SpreadsheetApp.getUi().alert("ℹ️ La pestaña 'CREDENCIALES_API' ya existe. Recomendado: migra al almacenamiento interno (Panel → 🔐 Credenciales API → Migrar).");
  }
}

/* ===========================================================================
   FASE 8.57 — CREDENCIALES EN SCRIPTPROPERTIES (fuera de la vista del libro)
   ---------------------------------------------------------------------------
   · Las claves viven en el almacenamiento interno del script (Properties):
     NINGÚN usuario del libro puede verlas; solo el dueño del proyecto.
   · El Coordinador las gestiona desde el panel (añadir/editar/eliminar por
     cliente) sin exponer las guardadas.
   · Lectura con fallback a la pestaña legacy mientras no se migre.
   =========================================================================== */

var CRED_API_PREFIX = "CRED_API_";

function _credKey(cliente) {
  return CRED_API_PREFIX + String(cliente || "").trim().toUpperCase();
}

/**
 * Busca las credenciales del cliente: ScriptProperties primero (seguro),
 * pestaña CREDENCIALES_API como fallback legacy si aún existe.
 */
function _obtenerCredencialesAPI(cliente) {
  var cliStr = String(cliente).trim().toUpperCase();

  // 1) Almacenamiento interno (FASE 8.57)
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_credKey(cliStr));
    if (raw) {
      var j = JSON.parse(raw);
      if (j && j.user && j.pass) return { user: String(j.user), pass: String(j.pass) };
    }
  } catch (eP) {}

  // 2) Fallback legacy: pestaña (si aún no se migró)
  var ss = _ssCronCod();
  var sh = ss.getSheetByName("CREDENCIALES_API");
  if (sh) {
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toUpperCase() === cliStr) {
        return { user: String(data[i][1]).trim(), pass: String(data[i][2]).trim() };
      }
    }
  }
  throw new Error("No hay credenciales API para '" + cliStr +
    "'. Pídele al Coordinador registrarlas (Panel → 🔐 Credenciales API).");
}

/** COORDINADOR: crea o REEMPLAZA la credencial de un cliente. */
function guardarCredencialAPI(cliente, usuario, password) {
  _requiereRol(["Coordinador"]);
  var cliN = String(cliente || "").trim().toUpperCase();
  if (!cliN || !String(usuario || "").trim() || !String(password || "").trim()) {
    throw new Error("Cliente, usuario y contraseña son obligatorios.");
  }
  PropertiesService.getScriptProperties().setProperty(
    _credKey(cliN),
    JSON.stringify({ user: String(usuario).trim(), pass: String(password).trim() })
  );
  // Invalida el token del día para forzar renovación con la clave nueva
  try {
    var sp = PropertiesService.getScriptProperties();
    sp.deleteProperty("ITSANET_TOKEN_" + cliN);
    sp.deleteProperty("FECHA_TOKEN_" + cliN);
  } catch (eT) {}
  try {
    if (typeof _registrarActividad === "function" && typeof _usuarioActual === "function") {
      _registrarActividad(_usuarioActual(), "guardar_cred_api", "", cliN);
    }
  } catch (eL) {}
  return { ok: true, cliente: cliN };
}

/** COORDINADOR: elimina la credencial de un cliente. */
function eliminarCredencialAPI(cliente) {
  _requiereRol(["Coordinador"]);
  var cliN = String(cliente || "").trim().toUpperCase();
  PropertiesService.getScriptProperties().deleteProperty(_credKey(cliN));
  try {
    if (typeof _registrarActividad === "function" && typeof _usuarioActual === "function") {
      _registrarActividad(_usuarioActual(), "eliminar_cred_api", "", cliN);
    }
  } catch (eL) {}
  return { ok: true, cliente: cliN };
}

/** COORDINADOR: lista clientes configurados (SIN devolver claves). */
function listarClientesAPI() {
  _requiereRol(["Coordinador"]);
  var props = PropertiesService.getScriptProperties().getProperties();
  var out = [];
  for (var k in props) {
    if (k.indexOf(CRED_API_PREFIX) === 0) {
      var usuario = "";
      try { usuario = (JSON.parse(props[k]) || {}).user || ""; } catch (e) {}
      out.push({ cliente: k.substring(CRED_API_PREFIX.length), usuario: usuario });
    }
  }
  out.sort(function(a, b) { return a.cliente < b.cliente ? -1 : 1; });
  var hojaLegacy = false;
  try { hojaLegacy = !!_ssCronCod().getSheetByName("CREDENCIALES_API"); } catch (e2) {}
  return { clientes: out, hojaLegacyExiste: hojaLegacy };
}

/** COORDINADOR: migra la pestaña legacy a Properties y LA ELIMINA. */
function migrarCredencialesAScriptProperties() {
  _requiereRol(["Coordinador"]);
  var ss = _ssCronCod();
  var sh = ss.getSheetByName("CREDENCIALES_API");
  if (!sh) {
    return { ok: true, migradas: 0, mensaje: "La pestaña CREDENCIALES_API ya no existe (nada que migrar)." };
  }
  var data = sh.getDataRange().getValues();
  var sp = PropertiesService.getScriptProperties(), n = 0;
  for (var i = 1; i < data.length; i++) {
    var cli = String(data[i][0] || "").trim().toUpperCase();
    var usr = String(data[i][1] || "").trim();
    var pas = String(data[i][2] || "").trim();
    if (!cli || !usr || !pas) continue;
    if (cli === "EJEMPLO" || pas.indexOf("TU_CLAVE") !== -1) continue; // placeholders
    sp.setProperty(_credKey(cli), JSON.stringify({ user: usr, pass: pas }));
    n++;
  }
  ss.deleteSheet(sh); // elimina la pestaña con claves a la vista
  try {
    if (typeof _registrarActividad === "function" && typeof _usuarioActual === "function") {
      _registrarActividad(_usuarioActual(), "migrar_cred_api", "", n + " credenciales");
    }
  } catch (eL) {}
  return { ok: true, migradas: n,
           mensaje: "Migradas " + n + " credenciales al almacenamiento interno. La pestaña CREDENCIALES_API fue eliminada." };
}

/**
 * Centraliza el control y caché del token.
 * REGLA: un solo token por día POR CLIENTE.
 */
function obtenerORenovarTokenWMS(cliente) {
  var creds = _obtenerCredencialesAPI(cliente);
  var sp = PropertiesService.getScriptProperties();
  var hoy = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd");
  
  var tokenKey = 'ITSANET_TOKEN_' + cliente;
  var dateKey = 'FECHA_TOKEN_' + cliente;
  
  var tokenGuardado = sp.getProperty(tokenKey);
  var fechaGuardada = sp.getProperty(dateKey);

  if (tokenGuardado && fechaGuardada === hoy) {
    return tokenGuardado; 
  }

  var resToken = UrlFetchApp.fetch(ITSANET_BASE + "/gettoken", {
    "method": "get",
    "headers": { "userid": creds.user, "password": creds.pass },
    "muteHttpExceptions": true
  });
  var code = resToken.getResponseCode();
  var body = resToken.getContentText();
  var json = {}; try { json = JSON.parse(body); } catch (e) {}
  var nuevoToken = json.token || json.Token || json.Result || json.result;

  if (nuevoToken) {
    sp.setProperty(tokenKey, String(nuevoToken).trim());
    sp.setProperty(dateKey, hoy);
    return String(nuevoToken).trim();
  } else {
    throw new Error("Error token " + cliente + ". HTTP " + code + " -> " + body.substring(0, 100));
  }
}

// (2) Consulta el STOCK con el token del cliente.
function consultarStockItsanet(cliente) {
  var token = obtenerORenovarTokenWMS(cliente);
  var res = UrlFetchApp.fetch(ITSANET_BASE + "/getstock", {
    "method": "get",
    "headers": { "token": String(token).trim() },
    "muteHttpExceptions": true
  });
  return { code: res.getResponseCode(), body: res.getContentText() };
}

// (3) === EJECUTA ESTA para probar. Revisa: Ver -> Registro de ejecución ===
function probarConexionItsanet() {
  var clientePrueba = "BELIA"; // <-- Cambia a "FINI" o "BELIA" para probar
  try {
    var tok = obtenerORenovarTokenWMS(clientePrueba);
    Logger.log("OK TOKEN ("+clientePrueba+"): " + String(tok).substring(0, 16) + "...");
    var r = consultarStockItsanet(clientePrueba);
    Logger.log("getstock -> HTTP " + r.code);
    
    // Blindaje de prueba
    var arr = null;
    if (r.body && String(r.body).trim() !== "") {
      try {
        var j = JSON.parse(r.body);
        arr = Array.isArray(j) ? j
            : (j && Array.isArray(j.Result)) ? j.Result
            : (j && Array.isArray(j.result)) ? j.result
            : (j && Array.isArray(j.data)) ? j.data : null;
      } catch (e) { Logger.log("Aviso: La API no devolvió JSON válido."); }
    }
    
    if (arr) {
      Logger.log("OK Filas de stock: " + arr.length);
      if(arr.length > 0) Logger.log("Ejemplo[0]: " + JSON.stringify(arr[0]));
    } else {
      Logger.log("Cuerpo de respuesta vacío o sin formato arreglo.");
    }
    return r;
  } catch (e) {
    Logger.log("ERROR de conexión ITSANET: " + e.message);
    return { error: e.message };
  }
}

/**
 * (4) EXTRACCIÓN para crear inventario
 */
function extraerStockItsanet(codClienteFiltro, listaCodigos) {
  var cliF = String(codClienteFiltro || '').trim().toUpperCase();
  var r = consultarStockItsanet(cliF);
  if (r.code !== 200) return { ok: false, code: r.code, error: 'getstock HTTP ' + r.code, filas: [] };
  
  var j = []; 
  if (r.body && String(r.body).trim() !== "") {
    try { j = JSON.parse(r.body); } catch (e) { return { ok:false, error:'JSON inválido', filas:[] }; }
  }
  var arr = Array.isArray(j) ? j : (j.Result || j.result || j.data || []);

  var setCods = null;
  if (listaCodigos) {
    var raw = Array.isArray(listaCodigos) ? listaCodigos.join(',') : String(listaCodigos);
    var lista = raw.split(/[\s,;\n\r\t]+/).map(function(s){ return String(s).trim().toUpperCase(); }).filter(function(s){ return s.length > 0; });
    if (lista.length) { setCods = {}; lista.forEach(function(c){ setCods[c] = true; }); }
  }

  function val(o, k) { return (o[k] === null || o[k] === undefined) ? '' : String(o[k]).trim(); }

  var filas = [];
  for (var i = 0; i < arr.length; i++) {
    var o = arr[i] || {};
    var cod = val(o, 'COD. PRODUCTO');
    if (!cod) continue;
    if (cliF && val(o, 'COD. CLIENTE').toUpperCase() !== cliF) continue;
    if (setCods && !setCods[cod.toUpperCase()]) continue;

    var pos = [val(o,'NAVE'), val(o,'CALLE'), val(o,'COLUMNA'), val(o,'NIVEL')].filter(function(x){ return x !== ''; }).join('-');

    filas.push({
      sku:        cod,
      desc:       val(o, 'DESCRIPCION'),
      unidad:     val(o, 'UNIDAD'),
      cantidad:   parseFloat(val(o, 'CANTIDAD')) || 0,
      posicion:   pos,
      serie:      val(o, 'NRO. SERIE'),
      lote:       val(o, 'NRO. LOTE'),
      nDespacho:  val(o, 'NRO. DESPACHO'),
      nPartida:   val(o, 'NRO. PARTIDA'),
      catLog:     val(o, 'CAT. LOG.'),
      estMerc:    val(o, 'EST. MERC.'),
      cliente:    val(o, 'COD. CLIENTE'),
      familia:    val(o, 'FAMILIA')
    });
  }
  return { ok: true, total: filas.length, filas: filas };
}

// (5) Prueba de extracción (revisa el Registro de ejecución)
function probarExtraccionItsanet() {
  var res = extraerStockItsanet('BELIA', ''); // <-- Prueba BELIA
  Logger.log('Filas extraídas: ' + res.total);
  if (res.filas && res.filas.length) Logger.log('Fila[0] mapeada: ' + JSON.stringify(res.filas[0]));
  return res;
}

/* ===========================================================================
   PUENTE CON LA CREACIÓN DE INVENTARIO
   =========================================================================== */

function _filaRmDesdeStock(o) {
  function v(k){ return (o[k]===null||o[k]===undefined) ? "" : String(o[k]).trim(); }
  var f = []; for (var n=0;n<17;n++) f.push("");
  f[4]  = v('COD. CLIENTE');
  f[6]  = v('COD. PRODUCTO');
  f[7]  = v('DESCRIPCION');
  f[8]  = v('NRO. SERIE');
  f[9]  = v('NRO. LOTE');
  f[10] = v('NRO. DESPACHO');
  f[11] = v('NRO. PARTIDA');
  f[12] = v('CAT. LOG.');
  f[13] = v('EST. MERC.');
  f[14] = [v('NAVE'),v('CALLE'),v('COLUMNA'),v('NIVEL')].filter(function(x){return x!=="";}).join('-');
  f[15] = v('UNIDAD');
  f[16] = parseFloat(v('CANTIDAD')) || 0;
  return f;
}

function _setCodigos(listaCodigos) {
  if (!listaCodigos) return null;
  var raw = Array.isArray(listaCodigos) ? listaCodigos.join(',') : String(listaCodigos);
  var lista = raw.split(/[\s,;\n\r\t]+/).map(function(s){ return String(s).trim().toUpperCase(); }).filter(function(s){ return s.length>0; });
  if (!lista.length) return null;
  var set = {}; lista.forEach(function(c){ set[c]=true; }); return set;
}

function _clienteCoincideItsanet(cliFila, cliSel) {
  var cli = String(cliFila||"").trim().toUpperCase();
  var sel = String(cliSel||"").trim().toUpperCase();
  if (!sel || !cli || cli===sel) return true;
  var esc = function(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); };
  if (new RegExp("^"+esc(sel)+"[0-9]+$").test(cli)) return true;
  if (new RegExp("^"+esc(cli)+"[0-9]+$").test(sel)) return true;
  var rC=cli.replace(/[0-9]+$/,""), rS=sel.replace(/[0-9]+$/,"");
  return !!(rC && rC===rS);
}

/**
 * ¿Se acepta esta fila para el cliente pedido?
 *
 * Sin `codigosCliente` se aplica el criterio de siempre. Con lista, se aceptan
 * SOLO esos códigos: hace falta porque en el ERP el "COD. CLIENTE" no siempre
 * coincide con el nombre de la credencial — la credencial NOKIACNTLTE devuelve
 * su stock bajo el código NOKIACNT (su razón social es la que dice "LTE").
 */
function _aceptaClienteItsanet(cliFila, cliSel, codigosCliente) {
  if (codigosCliente && codigosCliente.length) {
    var c = String(cliFila || "").trim().toUpperCase();
    for (var i = 0; i < codigosCliente.length; i++) {
      if (c === String(codigosCliente[i] || "").trim().toUpperCase()) return true;
    }
    return false;
  }
  return _clienteCoincideItsanet(cliFila, cliSel);
}

// ORQUESTADOR para el wizard
// `codigosCliente` (opcional) fuerza qué COD. CLIENTE se aceptan; si no se pasa,
// el comportamiento es exactamente el de siempre.
function previsualizarStockItsanet(clienteSeleccionado, listaCodigos, incluirVariantes, codigosCliente) {
  var r = consultarStockItsanet(clienteSeleccionado);
  if (r.code !== 200) throw new Error('El servidor reporta HTTP ' + r.code);
  
  // FIX CRÍTICO: Manejar respuesta vacía de q_apidepot
  var j = [];
  if (r.body && String(r.body).trim() !== "") {
    try { 
      j = JSON.parse(r.body); 
    } catch (e) { 
      throw new Error('La respuesta del servidor no es válida para ' + clienteSeleccionado + '. (¿Bodega inactiva?)'); 
    }
  }

  var arr = Array.isArray(j) ? j : (j.Result || j.result || j.data || []);
  var setCods = _setCodigos(listaCodigos);

  var rep = { totalLeidas: arr.length, incluidas:0, excluidas:0, filtradasPorCliente:0,
              cantidadInvalidas:0, cantidadCero:0, skuVacio:0, skuConCharsExtranios:[],
              skuSospechosamenteCortos:[], seriesDuplicadasHistorico:[], seriesDuplicadasEnCSV:[],
              filasIdenticasDuplicadas:0, sumaCantidad:0, skusUnicosCount:0, clientesDetalle:[],
              // FIX FASE 8.54: métricas de la regla 1 SERIE = 1 UNIDAD (paridad con carga CSV 8.22)
              filasConSerie:0, filasSinSerie:0, seriesDuplicadas:0, cantidadAjustada:0 };
  var skusUnicos={}, clientes={}, seriesVistas={}, grupos={}, orden=[];

  for (var i=0;i<arr.length;i++){
    var o = arr[i]||{};
    var sku = String(o['COD. PRODUCTO']||"").trim().toUpperCase();
    var cliRow = String(o['COD. CLIENTE']||"").trim().toUpperCase();
    if (cliRow) clientes[cliRow] = (clientes[cliRow]||0)+1;
    if (!sku){ rep.skuVacio++; rep.excluidas++; continue; }
    if (!_aceptaClienteItsanet(cliRow, clienteSeleccionado, codigosCliente)){ rep.filtradasPorCliente++; rep.excluidas++; continue; }
    if (setCods){
      var m = !!setCods[sku];
      if (!m && incluirVariantes){ for (var kk in setCods){ if (sku.indexOf(kk)===0){ m=true; break; } } }
      if (!m){ rep.excluidas++; continue; }
    }
    var f = _filaRmDesdeStock(o);
    var cant = parseFloat(f[16]); if (isNaN(cant)) cant=0;
    if (cant<0){ rep.cantidadInvalidas++; rep.excluidas++; continue; }
    if (cant===0) rep.cantidadCero++;

    /* ══════════════════════════════════════════════════════════════════
       FIX FASE 8.54: REGLA 1 SERIE = 1 UNIDAD — MISMA LEY que la carga
       CSV (FIX FASE 8.22 de AsistenteCreacionV2):
       · Fila CON serie → es un ítem físico ÚNICO: cantidad forzada a 1 y
         NUNCA se agrupa con otras. Duplicado exacto (misma serie+sku+
         lote+posición) → se conserva la 1ª y se omite el resto.
       · Fila SIN serie → consolidación histórica (agrupa por SKU+lote+
         despacho+partida+posición y suma cantidades), igual que antes.
       Series "0"/"N/A" se tratan como SIN serie (placeholders del ERP).
       ══════════════════════════════════════════════════════════════════ */
    var serie = String(f[8]||"").trim().toUpperCase();
    var tieneSerie = !!(serie && serie!=="0" && serie!=="N/A");
    var key;

    if (tieneSerie){
      if (cant !== 1){ rep.cantidadAjustada++; cant = 1; }
      // Aviso de serie repetida en el lote extraído (misma semántica que el CSV)
      if (seriesVistas[serie]){ if (rep.seriesDuplicadasEnCSV.length<50) rep.seriesDuplicadasEnCSV.push({sku:sku, serie:serie}); }
      else seriesVistas[serie]=true;

      key = 'S§'+f[6]+'|'+serie+'|'+f[9]+'|'+f[14];
      if (grupos[key]){ rep.seriesDuplicadas++; continue; } // duplicado exacto → omitir
      rep.filasConSerie++;
      f[16]=cant; grupos[key]=f; orden.push(key);
      rep.incluidas++; skusUnicos[sku]=true;
      rep.sumaCantidad += cant;
      continue;
    }

    // Sin serie → consolidación histórica (comportamiento previo intacto)
    rep.filasSinSerie++;
    key = 'N§'+f[6]+'|'+f[9]+'|'+f[10]+'|'+f[11]+'|'+f[14];
    if (grupos[key]){ grupos[key][16] = (parseFloat(grupos[key][16])||0) + cant; rep.filasIdenticasDuplicadas++; }
    else { f[16]=cant; grupos[key]=f; orden.push(key); rep.incluidas++; skusUnicos[sku]=true; }
    rep.sumaCantidad += cant;
  }
  var datosLimpios = orden.map(function(k){ return grupos[k]; });
  rep.skusUnicosCount = Object.keys(skusUnicos).length;
  rep.clientesDetalle = Object.keys(clientes).map(function(k){ return {cliente:k, filas:clientes[k]}; }).sort(function(a,b){ return b.filas-a.filas; });
  
  if (!datosLimpios.length) {
    // El informe viaja CON el error: quien llama puede ver bajo qué
    // COD. CLIENTE respondió la credencial sin repetir la consulta al ERP.
    var _vacio = new Error('No hay stock para el cliente "'+clienteSeleccionado+'" en la bodega de Quito.');
    _vacio.reporte = rep;
    throw _vacio;
  }

  return { datosLimpios: datosLimpios, reporte: rep };
}


/* ===========================================================================
   FASE 8.56 — CRONOGRAMA DE CÓDIGOS POR MES (conteos cíclicos por cliente)
   ---------------------------------------------------------------------------
   Hoja única CRONOGRAMA_CODIGOS: CLIENTE | CODIGO | ABC | ENERO … DICIEMBRE
   · Multi-cliente (20+ y crecederos) en UNA sola hoja del maestro.
   · Actualización por REEMPLAZO del bloque del cliente (solo Coordinador,
     desde el panel — gate _requiereRol en el servidor).
   · La hoja queda PROTEGIDA: nadie la edita a mano; el sistema escribe como
     dueño del proyecto (executeAs USER_DEPLOYING).
   =========================================================================== */

var CRONCOD_HOJA  = "CRONOGRAMA_CODIGOS";
var CRONCOD_MESES = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO",
                     "JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];

function _ssCronCod() {
  // _getSS() (del Centro de Mando) si existe; fallback al libro activo.
  return (typeof _getSS === "function") ? _getSS() : SpreadsheetApp.getActiveSpreadsheet();
}

function _asegurarHojaCronCodigos() {
  var ss = _ssCronCod();
  var sh = ss.getSheetByName(CRONCOD_HOJA);
  if (!sh) {
    sh = ss.insertSheet(CRONCOD_HOJA);
    var head = ["CLIENTE","CODIGO","ABC"].concat(CRONCOD_MESES);
    sh.getRange(1,1,1,head.length).setValues([head]);
    sh.getRange(1,1,1,head.length).setFontWeight("bold")
      .setBackground("#1a73e8").setFontColor("#ffffff");
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 120); sh.setColumnWidth(2, 160); sh.setColumnWidth(3, 50);
  }
  // Protección de ediciones manuales (idempotente): solo el dueño queda como
  // editor → el panel (que corre como dueño) escribe; los demás solo leen.
  try {
    var prots = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    var prot = prots.length ? prots[0] : sh.protect();
    prot.setDescription("Solo editable vía Centro de Mando (Coordinador)");
    try { prot.removeEditors(prot.getEditors()); } catch (e1) {}
    try { if (prot.canDomainEdit()) prot.setDomainEdit(false); } catch (e2) {}
  } catch (eP) {}
  return sh;
}

/* Lee las filas del cliente (match flexible: DEGSO ≈ DEGSO2, misma raíz). */
function _leerCronCodigosCliente(cliente) {
  var ss = _ssCronCod();
  var sh = ss.getSheetByName(CRONCOD_HOJA);
  if (!sh || sh.getLastRow() < 2) return { existe:false, filas:[] };
  var v = sh.getRange(2, 1, sh.getLastRow()-1, 15).getValues();
  var filas = [];
  for (var i=0;i<v.length;i++){
    var cli = String(v[i][0]||"").trim().toUpperCase();
    if (!cli || !_clienteCoincideItsanet(cli, cliente)) continue;
    var cod = String(v[i][1]||"").trim().toUpperCase();
    if (!cod) continue;
    var meses = {};
    for (var m=0;m<12;m++){
      if (String(v[i][3+m]||"").trim() !== "") meses[CRONCOD_MESES[m]] = true;
    }
    filas.push({ codigo: cod, abc: String(v[i][2]||"").trim().toUpperCase(), meses: meses });
  }
  return { existe: filas.length>0, filas: filas };
}

/* WIZARD: códigos programados del cliente para un MES (sugerencia editable). */
function obtenerCodigosProgramados(cliente, mes) {
  var mesN = String(mes||"").trim().toUpperCase();
  if (CRONCOD_MESES.indexOf(mesN) === -1) throw new Error("Mes inválido: " + mes);
  var data = _leerCronCodigosCliente(cliente);
  if (!data.existe) {
    return { existe:false, mes:mesN, codigos:[], total:0, abc:{}, totalCliente:0 };
  }
  var cods = [], abc = {};
  data.filas.forEach(function(f){
    if (f.meses[mesN]) {
      cods.push(f.codigo);
      var k = f.abc || "?";
      abc[k] = (abc[k]||0) + 1;
    }
  });
  return { existe:true, mes:mesN, codigos:cods, total:cods.length,
           abc:abc, totalCliente:data.filas.length };
}

/* VENTANA DE VARIANTES: meses programados de una lista de SKUs.
   → { "DG100GR": ["JULIO"], ... } (solo los que existen en el cronograma). */
function obtenerMesesDeCodigos(cliente, listaSkus) {
  var out = {};
  var data = _leerCronCodigosCliente(cliente);
  if (!data.existe) return out;
  var idx = {};
  data.filas.forEach(function(f){ idx[f.codigo] = f; });
  (listaSkus||[]).forEach(function(s){
    var k = String(s||"").trim().toUpperCase();
    if (k && idx[k]) out[k] = Object.keys(idx[k].meses);
  });
  return out;
}

/* COORDINADOR: REEMPLAZA el bloque completo del cliente con lo pegado desde
   su Excel (columnas ABC | producto_id | ENERO…DICIEMBRE con X; también
   acepta sin la columna ABC). Acepta TSV (pegado directo), ';' o ','. */
function actualizarCronogramaCodigos(cliente, textoPegado) {
  _requiereRol(["Coordinador"]);
  var cliN = String(cliente||"").trim().toUpperCase();
  if (!cliN) throw new Error("Indica el cliente.");
  if (!textoPegado || !String(textoPegado).trim()) {
    throw new Error("Pega el bloque de códigos (ABC | CÓDIGO | ENERO…DICIEMBRE).");
  }

  var lineas = String(textoPegado).split(/\r?\n/);
  var nuevas = [];
  for (var i=0;i<lineas.length;i++){
    var ln = lineas[i];
    if (!ln || !ln.trim()) continue;
    var sep = (ln.indexOf("\t")!==-1) ? "\t" : (ln.indexOf(";")!==-1 ? ";" : ",");
    var c = ln.split(sep).map(function(x){ return String(x||"").trim(); });
    var c0 = (c[0]||"").toUpperCase(), c1 = (c[1]||"").toUpperCase();
    // Saltar encabezados / líneas de meses / títulos
    if (c0.indexOf("ABC")!==-1 || c1.indexOf("PRODUCTO")!==-1 ||
        c1.indexOf("CODIGO")!==-1 || CRONCOD_MESES.indexOf(c0)!==-1 ||
        c0.indexOf("QTY")!==-1 || c0.indexOf("SEMESTRE")!==-1) continue;

    var abc = "", cod = "", mesesArr = [];
    if (/^[ABC]$/i.test(c0) && c1) {           // formato: ABC | CODIGO | 12 meses
      abc = c0; cod = c1; mesesArr = c.slice(2, 14);
    } else if (c0) {                            // formato: CODIGO | 12 meses
      cod = c0; mesesArr = c.slice(1, 13);
    }
    if (!cod) continue;
    var fila = [cliN, cod, abc];
    for (var m=0;m<12;m++){ fila.push(String(mesesArr[m]||"").trim() ? "X" : ""); }
    nuevas.push(fila);
  }
  if (!nuevas.length) throw new Error("No se reconoció ningún código en el texto pegado. " +
    "Copia desde el Excel las columnas ABC + producto_id + los 12 meses.");

  var sh = _asegurarHojaCronCodigos();
  var last = sh.getLastRow(), borradas = 0;
  if (last >= 2) {
    // Releer todo, quitar el bloque del cliente (match EXACTO del registrado) y reescribir.
    var todo = sh.getRange(2, 1, last-1, 15).getValues();
    var restantes = todo.filter(function(r){
      var c = String(r[0]||"").trim().toUpperCase();
      return c !== "" && c !== cliN;
    });
    borradas = todo.filter(function(r){
      return String(r[0]||"").trim().toUpperCase() === cliN;
    }).length;
    sh.getRange(2, 1, last-1, 15).clearContent();
    if (restantes.length) sh.getRange(2, 1, restantes.length, 15).setValues(restantes);
    sh.getRange(2 + restantes.length, 1, nuevas.length, 15).setValues(nuevas);
  } else {
    sh.getRange(2, 1, nuevas.length, 15).setValues(nuevas);
  }

  try {
    if (typeof _registrarActividad === "function" && typeof _usuarioActual === "function") {
      _registrarActividad(_usuarioActual(), "actualizar_cron_codigos", "",
        cliN + ": " + nuevas.length + " códigos (reemplazó " + borradas + ")");
    }
  } catch (eL) {}

  var porMes = {};
  CRONCOD_MESES.forEach(function(mn, mi){
    porMes[mn] = nuevas.filter(function(f){ return f[3+mi] === "X"; }).length;
  });
  return { ok:true, cliente:cliN, codigos:nuevas.length, reemplazadas:borradas, porMes:porMes };
}

/* PANEL: resumen de clientes cargados en el cronograma de códigos. */
function obtenerResumenCronCodigos() {
  var ss = _ssCronCod();
  var sh = ss.getSheetByName(CRONCOD_HOJA);
  var out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow()-1, 2).getValues();
  var cnt = {};
  v.forEach(function(r){
    var c = String(r[0]||"").trim().toUpperCase();
    if (c) cnt[c] = (cnt[c]||0) + 1;
  });
  for (var k in cnt) out.push({ cliente:k, codigos:cnt[k] });
  out.sort(function(a,b){ return a.cliente < b.cliente ? -1 : 1; });
  return out;
}