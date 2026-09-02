/**
 * ITSANET_API_GYE.gs — CONEXIÓN INDEPENDIENTE con la API de ITSANET GUAYAQUIL.
 * ---------------------------------------------------------------------------
 * MÓDULO SEPARADO del de Quito (ITSANET_API.gs). Tiene su PROPIO endpoint,
 * credenciales, token y cronograma de códigos. NO comparte estado con Quito;
 * solo reutiliza helpers PUROS (sin estado) del módulo de Quito:
 *   _filaRmDesdeStock, _setCodigos, _clienteCoincideItsanet, _ssCronCod, CRONCOD_MESES.
 * El wizard/panel llaman a estas funciones (_GYE) SOLO cuando se selecciona la
 * sede Guayaquil. Si NO se selecciona Guayaquil, nada de aquí se ejecuta y el
 * flujo de Quito queda EXACTAMENTE igual.
 *
 * ÚNICA diferencia de fondo con Quito: la base es g_apidepot.
 */

var ITSANET_BASE_GYE   = "https://ec.itsanet.com/g_apidepot"; // Endpoint GUAYAQUIL
var CRED_API_PREFIX_GYE = "CREDGYE_API_";            // credenciales GYE (llave separada)
var CRONCOD_HOJA_GYE    = "CRONOGRAMA_CODIGOS_GYE";  // cronograma de códigos GYE (hoja separada)

function _credKeyGYE(cliente) {
  return CRED_API_PREFIX_GYE + String(cliente || "").trim().toUpperCase();
}

/* Credenciales de GUAYAQUIL — solo almacén interno del script (llave propia). */
function _obtenerCredencialesGYE(cliente) {
  var cliStr = String(cliente).trim().toUpperCase();
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_credKeyGYE(cliStr));
    if (raw) {
      var j = JSON.parse(raw);
      if (j && j.user && j.pass) return { user: String(j.user), pass: String(j.pass) };
    }
  } catch (eP) {}
  throw new Error("No hay credenciales API para '" + cliStr + "' en GUAYAQUIL (GYE). " +
    "Pídele al Coordinador registrarlas (Panel → 🔐 Credenciales API, sede Guayaquil).");
}

/** COORDINADOR: crea o REEMPLAZA la credencial GYE de un cliente. */
function guardarCredencialAPI_GYE(cliente, usuario, password) {
  _requiereRol(["Coordinador"]);
  var cliN = String(cliente || "").trim().toUpperCase();
  if (!cliN || !String(usuario || "").trim() || !String(password || "").trim()) {
    throw new Error("Cliente, usuario y contraseña son obligatorios.");
  }
  PropertiesService.getScriptProperties().setProperty(
    _credKeyGYE(cliN),
    JSON.stringify({ user: String(usuario).trim(), pass: String(password).trim() })
  );
  // Invalida el token del día GYE para renovar con la clave nueva.
  try {
    var sp = PropertiesService.getScriptProperties();
    sp.deleteProperty("ITSANET_TOKEN_GYE_" + cliN);
    sp.deleteProperty("FECHA_TOKEN_GYE_" + cliN);
  } catch (eT) {}
  try {
    if (typeof _registrarActividad === "function" && typeof _usuarioActual === "function") {
      _registrarActividad(_usuarioActual(), "guardar_cred_api_gye", "", cliN);
    }
  } catch (eL) {}
  return { ok: true, cliente: cliN };
}

/** COORDINADOR: elimina la credencial GYE de un cliente. */
function eliminarCredencialAPI_GYE(cliente) {
  _requiereRol(["Coordinador"]);
  var cliN = String(cliente || "").trim().toUpperCase();
  var sp = PropertiesService.getScriptProperties();
  sp.deleteProperty(_credKeyGYE(cliN));
  try {
    sp.deleteProperty("ITSANET_TOKEN_GYE_" + cliN);
    sp.deleteProperty("FECHA_TOKEN_GYE_" + cliN);
  } catch (eT) {}
  try {
    if (typeof _registrarActividad === "function" && typeof _usuarioActual === "function") {
      _registrarActividad(_usuarioActual(), "eliminar_cred_api_gye", "", cliN);
    }
  } catch (eL) {}
  return { ok: true, cliente: cliN };
}

/** COORDINADOR: lista clientes GYE configurados (SIN devolver claves). */
function listarClientesAPI_GYE() {
  _requiereRol(["Coordinador"]);
  var props = PropertiesService.getScriptProperties().getProperties();
  var out = [];
  for (var k in props) {
    if (k.indexOf(CRED_API_PREFIX_GYE) === 0) {
      var usuario = "";
      try { usuario = (JSON.parse(props[k]) || {}).user || ""; } catch (e) {}
      out.push({ cliente: k.substring(CRED_API_PREFIX_GYE.length), usuario: usuario });
    }
  }
  out.sort(function(a, b) { return a.cliente < b.cliente ? -1 : 1; });
  return { clientes: out };
}

/**
 * Token GUAYAQUIL — un token por día por cliente, caché separado del de Quito.
 */
function obtenerORenovarTokenWMS_GYE(cliente) {
  var creds = _obtenerCredencialesGYE(cliente);
  var sp = PropertiesService.getScriptProperties();
  var hoy = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd");

  var tokenKey = 'ITSANET_TOKEN_GYE_' + cliente;
  var dateKey  = 'FECHA_TOKEN_GYE_' + cliente;

  var tokenGuardado = sp.getProperty(tokenKey);
  var fechaGuardada = sp.getProperty(dateKey);

  if (tokenGuardado && fechaGuardada === hoy) {
    return tokenGuardado;
  }

  var resToken = UrlFetchApp.fetch(ITSANET_BASE_GYE + "/gettoken", {
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
    throw new Error("Error token GYE " + cliente + ". HTTP " + code + " -> " + body.substring(0, 100));
  }
}

/* Consulta el STOCK en GUAYAQUIL con el token del cliente. */
function consultarStockItsanet_GYE(cliente) {
  var token = obtenerORenovarTokenWMS_GYE(cliente);
  var res = UrlFetchApp.fetch(ITSANET_BASE_GYE + "/getstock", {
    "method": "get",
    "headers": { "token": String(token).trim() },
    "muteHttpExceptions": true
  });
  return { code: res.getResponseCode(), body: res.getContentText() };
}

/* === EJECUTA ESTA desde el editor para probar la conexión de GUAYAQUIL === */
function probarConexionItsanet_GYE() {
  var clientePrueba = "BELIA"; // <-- cámbialo por un cliente con credencial GYE
  try {
    var tok = obtenerORenovarTokenWMS_GYE(clientePrueba);
    Logger.log("OK TOKEN GYE (" + clientePrueba + "): " + String(tok).substring(0, 16) + "...");
    var r = consultarStockItsanet_GYE(clientePrueba);
    Logger.log("getstock GYE -> HTTP " + r.code);
    var arr = null;
    if (r.body && String(r.body).trim() !== "") {
      try {
        var j = JSON.parse(r.body);
        arr = Array.isArray(j) ? j : (j && Array.isArray(j.Result)) ? j.Result
            : (j && Array.isArray(j.result)) ? j.result : (j && Array.isArray(j.data)) ? j.data : null;
      } catch (e) { Logger.log("Aviso: Guayaquil no devolvió JSON válido."); }
    }
    Logger.log(arr ? ("OK Filas de stock GYE: " + arr.length) : "Cuerpo vacío o sin formato arreglo.");
    if (arr && arr.length) Logger.log("Ejemplo[0]: " + JSON.stringify(arr[0]));
    return r;
  } catch (e) {
    Logger.log("ERROR de conexión ITSANET GYE: " + e.message);
    return { error: e.message };
  }
}

/**
 * ORQUESTADOR para el wizard — GUAYAQUIL. MISMA lógica que Quito (reutiliza los
 * helpers puros _setCodigos / _clienteCoincideItsanet / _filaRmDesdeStock del
 * módulo de Quito), sólo que consulta el stock de g_apidepot. Devuelve el mismo
 * formato { datosLimpios, reporte } que el flujo de Quito.
 */
function previsualizarStockItsanet_GYE(clienteSeleccionado, listaCodigos, incluirVariantes, codigosCliente) {
  var r = consultarStockItsanet_GYE(clienteSeleccionado);
  if (r.code !== 200) throw new Error('El servidor de Guayaquil reporta HTTP ' + r.code);

  var j = [];
  if (r.body && String(r.body).trim() !== "") {
    try { j = JSON.parse(r.body); }
    catch (e) { throw new Error('La respuesta del servidor de Guayaquil no es válida para ' + clienteSeleccionado + '. (¿Bodega inactiva?)'); }
  }

  var arr = Array.isArray(j) ? j : (j.Result || j.result || j.data || []);
  var setCods = _setCodigos(listaCodigos);

  var rep = { totalLeidas: arr.length, incluidas:0, excluidas:0, filtradasPorCliente:0,
              cantidadInvalidas:0, cantidadCero:0, skuVacio:0, skuConCharsExtranios:[],
              skuSospechosamenteCortos:[], seriesDuplicadasHistorico:[], seriesDuplicadasEnCSV:[],
              filasIdenticasDuplicadas:0, sumaCantidad:0, skusUnicosCount:0, clientesDetalle:[],
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

    // REGLA 1 SERIE = 1 UNIDAD (idéntica a Quito).
    var serie = String(f[8]||"").trim().toUpperCase();
    var tieneSerie = !!(serie && serie!=="0" && serie!=="N/A");
    var key;

    if (tieneSerie){
      if (cant !== 1){ rep.cantidadAjustada++; cant = 1; }
      if (seriesVistas[serie]){ if (rep.seriesDuplicadasEnCSV.length<50) rep.seriesDuplicadasEnCSV.push({sku:sku, serie:serie}); }
      else seriesVistas[serie]=true;
      key = 'S§'+f[6]+'|'+serie+'|'+f[9]+'|'+f[14];
      if (grupos[key]){ rep.seriesDuplicadas++; continue; }
      rep.filasConSerie++;
      f[16]=cant; grupos[key]=f; orden.push(key);
      rep.incluidas++; skusUnicos[sku]=true;
      rep.sumaCantidad += cant;
      continue;
    }

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
    var _vacio = new Error('No hay stock para el cliente "'+clienteSeleccionado+'" en la bodega de Guayaquil.');
    _vacio.reporte = rep;
    throw _vacio;
  }

  return { datosLimpios: datosLimpios, reporte: rep };
}

/* ===========================================================================
   CRONOGRAMA DE CÓDIGOS — GUAYAQUIL (hoja SEPARADA CRONOGRAMA_CODIGOS_GYE)
   Misma mecánica que Quito, en su propia hoja. Reutiliza CRONCOD_MESES y
   _clienteCoincideItsanet del módulo de Quito.
   =========================================================================== */
function _asegurarHojaCronCodigos_GYE() {
  var ss = _ssCronCod();
  var sh = ss.getSheetByName(CRONCOD_HOJA_GYE);
  if (!sh) {
    sh = ss.insertSheet(CRONCOD_HOJA_GYE);
    var head = ["CLIENTE","CODIGO","ABC"].concat(CRONCOD_MESES);
    sh.getRange(1,1,1,head.length).setValues([head]);
    sh.getRange(1,1,1,head.length).setFontWeight("bold")
      .setBackground("#0b8043").setFontColor("#ffffff");
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 120); sh.setColumnWidth(2, 160); sh.setColumnWidth(3, 50);
  }
  try {
    var prots = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    var prot = prots.length ? prots[0] : sh.protect();
    prot.setDescription("Solo editable vía Centro de Mando (Coordinador) — GYE");
    try { prot.removeEditors(prot.getEditors()); } catch (e1) {}
    try { if (prot.canDomainEdit()) prot.setDomainEdit(false); } catch (e2) {}
  } catch (eP) {}
  return sh;
}

function _leerCronCodigosClienteGYE(cliente) {
  var ss = _ssCronCod();
  var sh = ss.getSheetByName(CRONCOD_HOJA_GYE);
  if (!sh || sh.getLastRow() < 2) return { existe:false, filas:[] };
  var v = sh.getRange(2, 1, sh.getLastRow()-1, 15).getValues();
  var filas = [];
  for (var i=0;i<v.length;i++){
    var cli = String(v[i][0]||"").trim().toUpperCase();
    if (!cli || !_clienteCoincideItsanet(cli, cliente)) continue;
    var cod = String(v[i][1]||"").trim().toUpperCase();
    if (!cod) continue;
    var meses = {};
    for (var m=0;m<12;m++){ if (String(v[i][3+m]||"").trim() !== "") meses[CRONCOD_MESES[m]] = true; }
    filas.push({ codigo: cod, abc: String(v[i][2]||"").trim().toUpperCase(), meses: meses });
  }
  return { existe: filas.length>0, filas: filas };
}

function obtenerCodigosProgramados_GYE(cliente, mes) {
  var mesN = String(mes||"").trim().toUpperCase();
  if (CRONCOD_MESES.indexOf(mesN) === -1) throw new Error("Mes inválido: " + mes);
  var data = _leerCronCodigosClienteGYE(cliente);
  if (!data.existe) return { existe:false, mes:mesN, codigos:[], total:0, abc:{}, totalCliente:0 };
  var cods = [], abc = {};
  data.filas.forEach(function(f){
    if (f.meses[mesN]) { cods.push(f.codigo); var k = f.abc || "?"; abc[k] = (abc[k]||0) + 1; }
  });
  return { existe:true, mes:mesN, codigos:cods, total:cods.length, abc:abc, totalCliente:data.filas.length };
}

function obtenerMesesDeCodigos_GYE(cliente, listaSkus) {
  var out = {};
  var data = _leerCronCodigosClienteGYE(cliente);
  if (!data.existe) return out;
  var idx = {};
  data.filas.forEach(function(f){ idx[f.codigo] = f; });
  (listaSkus||[]).forEach(function(s){
    var k = String(s||"").trim().toUpperCase();
    if (k && idx[k]) out[k] = Object.keys(idx[k].meses);
  });
  return out;
}

function actualizarCronogramaCodigos_GYE(cliente, textoPegado) {
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
    if (c0.indexOf("ABC")!==-1 || c1.indexOf("PRODUCTO")!==-1 ||
        c1.indexOf("CODIGO")!==-1 || CRONCOD_MESES.indexOf(c0)!==-1 ||
        c0.indexOf("QTY")!==-1 || c0.indexOf("SEMESTRE")!==-1) continue;
    var abc = "", cod = "", mesesArr = [];
    if (/^[ABC]$/i.test(c0) && c1) { abc = c0; cod = c1; mesesArr = c.slice(2, 14); }
    else if (c0) { cod = c0; mesesArr = c.slice(1, 13); }
    if (!cod) continue;
    var fila = [cliN, cod, abc];
    for (var m=0;m<12;m++){ fila.push(String(mesesArr[m]||"").trim() ? "X" : ""); }
    nuevas.push(fila);
  }
  if (!nuevas.length) throw new Error("No se reconoció ningún código en el texto pegado. " +
    "Copia desde el Excel las columnas ABC + producto_id + los 12 meses.");
  var sh = _asegurarHojaCronCodigos_GYE();
  var last = sh.getLastRow(), borradas = 0;
  if (last >= 2) {
    var todo = sh.getRange(2, 1, last-1, 15).getValues();
    var restantes = todo.filter(function(r){ var c = String(r[0]||"").trim().toUpperCase(); return c !== "" && c !== cliN; });
    borradas = todo.filter(function(r){ return String(r[0]||"").trim().toUpperCase() === cliN; }).length;
    sh.getRange(2, 1, last-1, 15).clearContent();
    if (restantes.length) sh.getRange(2, 1, restantes.length, 15).setValues(restantes);
    sh.getRange(2 + restantes.length, 1, nuevas.length, 15).setValues(nuevas);
  } else {
    sh.getRange(2, 1, nuevas.length, 15).setValues(nuevas);
  }
  try {
    if (typeof _registrarActividad === "function" && typeof _usuarioActual === "function") {
      _registrarActividad(_usuarioActual(), "actualizar_cron_codigos_gye", "",
        cliN + ": " + nuevas.length + " códigos (reemplazó " + borradas + ")");
    }
  } catch (eL) {}
  var porMes = {};
  CRONCOD_MESES.forEach(function(mn, mi){ porMes[mn] = nuevas.filter(function(f){ return f[3+mi] === "X"; }).length; });
  return { ok:true, cliente:cliN, codigos:nuevas.length, reemplazadas:borradas, porMes:porMes };
}

function obtenerResumenCronCodigos_GYE() {
  var ss = _ssCronCod();
  var sh = ss.getSheetByName(CRONCOD_HOJA_GYE);
  var out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow()-1, 2).getValues();
  var cnt = {};
  v.forEach(function(r){ var c = String(r[0]||"").trim().toUpperCase(); if (c) cnt[c] = (cnt[c]||0) + 1; });
  for (var k in cnt) out.push({ cliente:k, codigos:cnt[k] });
  out.sort(function(a,b){ return a.cliente < b.cliente ? -1 : 1; });
  return out;
}
