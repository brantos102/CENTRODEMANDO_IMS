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

/* ═══════════════════════════════════════════════════════════════════════════
   CLIENTES RELACIONADOS
   ---------------------------------------------------------------------------
   En el ERP conviven códigos parecidos que son clientes DISTINTOS, cada uno con
   sus propias credenciales: NOKIA5G, NOKIACNT3G, NOKIACNTLTE… Al escribir uno,
   el asistente ofrece los demás del mismo grupo para contarlos juntos.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Raíz de un código de cliente: las letras iniciales antes del primer dígito,
 * acotadas a 5 caracteres. El tope es lo que hace que NOKIA5G, NOKIACNT3G y
 * NOKIACNTLTE caigan en el mismo grupo (todos → "NOKIA"); sin él, cada uno
 * formaría su propia raíz y no se ofrecerían juntos.
 *
 * Puede juntar códigos que solo se parezcan en las primeras letras, pero el
 * grupo es una SUGERENCIA: el usuario marca cuáles quiere contar.
 */
var RAIZ_MAX = 5;

function _raizCliente(nombre) {
  var n = String(nombre || "").trim().toUpperCase();
  var m = n.match(/^[A-ZÑ]+/);
  var raiz = m ? m[0] : n;
  if (raiz.length > RAIZ_MAX) raiz = raiz.substring(0, RAIZ_MAX);
  return raiz.length >= 3 ? raiz : n;   // raíces muy cortas no agrupan bien
}

/**
 * Clientes CON CREDENCIAL en la sede que comparten raíz con el indicado.
 * @param {string} base    "UIO" o "GYE"
 * @param {string} cliente el que escribió el usuario (p.ej. NOKIA o NOKIA5G)
 * @return {{raiz, cliente, relacionados:[{cliente,usuario}], hayGrupo}}
 */
function sugerirClientesRelacionados(base, cliente) {
  var esGye = (typeof _baseEsGYE === "function")
    ? _baseEsGYE(base)
    : String(base || "").trim().toUpperCase().indexOf("G") === 0;

  var reg;
  try { reg = esGye ? listarClientesAPI_GYE() : listarClientesAPI(); }
  catch (e) { return { raiz: "", cliente: cliente, relacionados: [], hayGrupo: false,
                       error: String(e && e.message || e) }; }

  var todos = (reg && reg.clientes) || [];
  var raiz  = _raizCliente(cliente);
  var pedido = String(cliente || "").trim().toUpperCase();

  var grupo = todos.filter(function (c) {
    var n = String(c.cliente || "").trim().toUpperCase();
    return n && (n === pedido || n.indexOf(raiz) === 0);
  }).sort(function (a, b) {
    // El que escribió el usuario va primero; el resto alfabético.
    var an = String(a.cliente).toUpperCase(), bn = String(b.cliente).toUpperCase();
    if (an === pedido) return -1;
    if (bn === pedido) return 1;
    return an < bn ? -1 : 1;
  });

  return {
    raiz: raiz,
    cliente: pedido,
    relacionados: grupo,
    // Solo tiene sentido preguntar si hay MÁS de uno en el grupo.
    hayGrupo: grupo.length > 1,
    exacto: grupo.some(function (c) { return String(c.cliente).toUpperCase() === pedido; })
  };
}

/**
 * Todos los clientes con credencial en la sede, agrupados por raíz.
 * Sirve para un selector general "por grupo de cliente".
 */
function listarGruposDeClientes(base) {
  var esGye = (typeof _baseEsGYE === "function")
    ? _baseEsGYE(base)
    : String(base || "").trim().toUpperCase().indexOf("G") === 0;

  var reg = esGye ? listarClientesAPI_GYE() : listarClientesAPI();
  var todos = (reg && reg.clientes) || [];

  var grupos = {};
  todos.forEach(function (c) {
    var n = String(c.cliente || "").trim().toUpperCase();
    if (!n) return;
    var r = _raizCliente(n);
    (grupos[r] = grupos[r] || []).push(n);
  });

  var out = Object.keys(grupos).sort().map(function (r) {
    return { raiz: r, clientes: grupos[r].sort(), total: grupos[r].length };
  });
  return { base: esGye ? "GYE" : "UIO", grupos: out, totalClientes: todos.length };
}
