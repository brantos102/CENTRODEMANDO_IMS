/**
 * ITSANET_MULTI.gs — Un solo inventario con varios clientes.
 * ---------------------------------------------------------------------------
 * Motivo: un mismo proveedor aparece en el ERP con varios códigos (NOKIA,
 * NOKIA5G, …) y a veces se quiere contar juntos varios clientes en un mismo
 * archivo. En vez de adivinar variantes, aquí se piden explícitamente.
 *
 * Cada cliente se consulta con SUS credenciales y SU token en la sede indicada;
 * los resultados se combinan conservando la regla 1 SERIE = 1 UNIDAD y sin
 * duplicar filas entre clientes.
 *
 * Devuelve el mismo formato { datosLimpios, reporte } que la extracción de un
 * solo cliente, más `reporte.porCliente` con el detalle de cada uno.
 */

/**
 * @param {string}   base      "UIO" (q_apidepot) o "GYE" (g_apidepot)
 * @param {string[]} clientes  códigos EXACTOS del ERP, p.ej. ["NOKIA","NOKIA5G"]
 * @param {string[]} codigos   SKUs a filtrar (opcional; vacío = todo el stock)
 * @param {boolean}  variantes incluir SKUs con sufijo
 */
function previsualizarStockMulti(base, clientes, codigos, variantes) {
  var lista = (clientes || [])
    .map(function (c) { return String(c || "").trim().toUpperCase(); })
    .filter(Boolean);
  // Sin duplicados: pedir dos veces el mismo cliente duplicaría su stock.
  var vistos = {}, unicos = [];
  lista.forEach(function (c) { if (!vistos[c]) { vistos[c] = true; unicos.push(c); } });
  if (!unicos.length) throw new Error("Indica al menos un cliente.");

  var esGye = (typeof _baseEsGYE === "function")
    ? _baseEsGYE(base)
    : String(base || "").trim().toUpperCase().indexOf("G") === 0;

  var filas = [], porCliente = [], errores = [];
  var repTotal = {
    totalLeidas: 0, incluidas: 0, excluidas: 0, filtradasPorCliente: 0,
    cantidadInvalidas: 0, cantidadCero: 0, skuVacio: 0,
    filasConSerie: 0, filasSinSerie: 0, seriesDuplicadas: 0,
    filasIdenticasDuplicadas: 0, cantidadAjustada: 0, sumaCantidad: 0,
    skusUnicosCount: 0, clientesDetalle: [], seriesDuplicadasEnCSV: [],
    skuConCharsExtranios: [], skuSospechosamenteCortos: [], seriesDuplicadasHistorico: []
  };
  var skusUnicos = {}, clavesVistas = {};

  unicos.forEach(function (cli) {
    var r;
    try {
      r = esGye
        ? previsualizarStockItsanet_GYE(cli, codigos || null, !!variantes)
        : previsualizarStockItsanet(cli, codigos || null, !!variantes);
    } catch (e) {
      // Un cliente sin stock o sin credencial no debe tumbar a los demás.
      errores.push(cli + ": " + (e && e.message ? e.message : e));
      porCliente.push({ cliente: cli, filas: 0, unidades: 0, error: String(e && e.message || e) });
      return;
    }

    var dl = (r && r.datosLimpios) || [], rep = (r && r.reporte) || {};
    var nuevas = 0, unidades = 0;

    for (var i = 0; i < dl.length; i++) {
      var f = dl[i];
      // Clave por SKU + serie + lote + posición: evita repetir una misma fila
      // si dos códigos de cliente comparten stock.
      var clave = String(f[6]) + "|" + String(f[8]) + "|" + String(f[9]) + "|" + String(f[14]);
      if (clavesVistas[clave]) { repTotal.filasIdenticasDuplicadas++; continue; }
      clavesVistas[clave] = true;
      filas.push(f);
      nuevas++;
      var c = parseFloat(f[16]); if (!isNaN(c)) unidades += c;
      if (f[6]) skusUnicos[String(f[6])] = true;
    }

    ["totalLeidas","excluidas","filtradasPorCliente","cantidadInvalidas","cantidadCero",
     "skuVacio","filasConSerie","filasSinSerie","seriesDuplicadas","cantidadAjustada"
    ].forEach(function (k) { repTotal[k] += (rep[k] || 0); });

    repTotal.incluidas += nuevas;
    repTotal.sumaCantidad += unidades;
    porCliente.push({ cliente: cli, filas: nuevas, unidades: unidades });
  });

  if (!filas.length) {
    throw new Error("Ningún cliente devolvió filas." +
      (errores.length ? "\n· " + errores.join("\n· ") : ""));
  }

  repTotal.skusUnicosCount = Object.keys(skusUnicos).length;
  repTotal.porCliente = porCliente;
  repTotal.clientesPedidos = unicos;
  repTotal.erroresPorCliente = errores;
  repTotal.clientesDetalle = porCliente.map(function (p) {
    return { cliente: p.cliente, filas: p.filas };
  });

  return { datosLimpios: filas, reporte: repTotal };
}

/**
 * Códigos programados combinados de varios clientes (sin repetir).
 * Sirve para sugerir la lista de SKUs de un inventario multi-cliente.
 */
function obtenerCodigosProgramadosMulti(base, clientes, mes) {
  var lista = (clientes || [])
    .map(function (c) { return String(c || "").trim().toUpperCase(); })
    .filter(Boolean);
  if (!lista.length) throw new Error("Indica al menos un cliente.");

  var esGye = (typeof _baseEsGYE === "function")
    ? _baseEsGYE(base)
    : String(base || "").trim().toUpperCase().indexOf("G") === 0;

  var vistos = {}, codigos = [], detalle = [], abc = {};
  lista.forEach(function (cli) {
    var r;
    try {
      r = esGye ? obtenerCodigosProgramados_GYE(cli, mes) : obtenerCodigosProgramados(cli, mes);
    } catch (e) {
      detalle.push({ cliente: cli, total: 0, error: String(e && e.message || e) });
      return;
    }
    var cods = (r && r.codigos) || [], nuevos = 0;
    cods.forEach(function (c) {
      var k = String(c || "").trim().toUpperCase();
      if (k && !vistos[k]) { vistos[k] = true; codigos.push(k); nuevos++; }
    });
    for (var a in (r && r.abc) || {}) abc[a] = (abc[a] || 0) + r.abc[a];
    detalle.push({ cliente: cli, total: cods.length, nuevos: nuevos });
  });

  return {
    existe: codigos.length > 0, mes: mes, codigos: codigos,
    total: codigos.length, abc: abc, detallePorCliente: detalle
  };
}
