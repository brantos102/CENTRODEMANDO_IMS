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

/* ═══════════════════════════════════════════════════════════════════════════
   EL CÓDIGO DEL ERP NO SIEMPRE ES EL NOMBRE DE LA CREDENCIAL
   ---------------------------------------------------------------------------
   En el maestro de clientes, COD. CLIENTE y RAZÓN SOCIAL son campos distintos:

       COD. CLIENTE   RAZÓN SOCIAL
       NOKIACNT       NOKIACNTLTE      ← la credencial se llama NOKIACNTLTE
       NOKIACNT3G     NOKIACNT3G
       NOKIA5G        NOKIA 5G

   La credencial NOKIACNTLTE devuelve su stock etiquetado como NOKIACNT, y el
   filtro por nombre lo descartaba entero: el archivo salía sin ese cliente
   aunque la extracción sí había traído sus filas.

   Aquí se detecta ese caso — la credencial respondió filas y TODAS se
   descartaron por el nombre — y se repite aceptando el código real. Siempre
   queda registrado en `reporte.aliasERP` para que se vea en el asistente.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Códigos del ERP que corresponden a la credencial pedida.
 *
 * Se prefiere el parentesco por prefijo (NOKIACNT ⊂ NOKIACNTLTE), que es un
 * alias real del mismo cliente. Solo si no hay ninguno se admite la familia
 * por raíz. Nunca se toman los códigos que ya se piden aparte con su propia
 * credencial: eso duplicaría stock y metería clientes no seleccionados.
 */
function _aliasClienteERP(cliPedido, clientesDetalle, yaSeleccionados) {
  var pedido = String(cliPedido || "").trim().toUpperCase();
  if (!pedido) return [];
  var conRaiz = (typeof _raizCliente === "function");
  var raizPedido = conRaiz ? _raizCliente(pedido) : pedido;

  var porPrefijo = [], porFamilia = [];
  (clientesDetalle || []).forEach(function (d) {
    var c = String((d && d.cliente) || "").trim().toUpperCase();
    if (!c || c === pedido) return;
    if (yaSeleccionados && yaSeleccionados[c]) return;
    if (c.indexOf(pedido) === 0 || pedido.indexOf(c) === 0) porPrefijo.push(c);
    else if (conRaiz && _raizCliente(c) === raizPedido) porFamilia.push(c);
  });

  return porPrefijo.length ? porPrefijo : porFamilia;
}

/**
 * Extrae el stock de UN cliente y, si el filtro por nombre lo dejó en cero,
 * reintenta con el código real del ERP. Si de verdad no hay stock, el error
 * original se propaga tal cual.
 *
 * @param {Object} yaSeleccionados mapa {CLIENTE:true} de los que se piden aparte
 */
function _extraerStockConAlias(esGye, cli, codigos, variantes, yaSeleccionados) {
  var extraer = function (okCli) {
    return esGye
      ? previsualizarStockItsanet_GYE(cli, codigos || null, !!variantes, okCli)
      : previsualizarStockItsanet(cli, codigos || null, !!variantes, okCli);
  };

  var r = null, rep = null, fallo = null;
  try {
    r = extraer(null);
    rep = (r && r.reporte) || null;
  } catch (e) {
    fallo = e;
    rep = (e && e.reporte) || null;   // el informe viaja con el error
  }

  if (r && r.datosLimpios && r.datosLimpios.length) {
    if (r.reporte) r.reporte.clientesEfectivos = [String(cli || "").trim().toUpperCase()];
    return r;
  }

  // Solo se reintenta si la credencial SÍ trajo filas y el nombre las descartó.
  var alias = (rep && rep.filtradasPorCliente > 0)
    ? _aliasClienteERP(cli, rep.clientesDetalle, yaSeleccionados)
    : [];
  if (!alias.length) {
    if (fallo) throw fallo;
    return r;
  }

  var r2 = extraer(alias);
  if (r2 && r2.reporte) {
    r2.reporte.aliasERP = alias;
    r2.reporte.clientePedido = String(cli || "").trim().toUpperCase();
    r2.reporte.clientesEfectivos = alias.slice();
  }
  return r2;
}

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

  // Los códigos pedidos no se aceptan como alias de otro: cada uno viene con
  // SU credencial y colarlo dos veces duplicaría su stock.
  var pedidos = {};
  unicos.forEach(function (c) { pedidos[c] = true; });

  // Códigos con los que realmente quedaron etiquetadas las filas: es lo que
  // hay que usar después para validar, si no la validación los descartaría.
  var efectivos = {}, alias = [];

  unicos.forEach(function (cli) {
    var r;
    try {
      r = _extraerStockConAlias(esGye, cli, codigos, variantes, pedidos);
    } catch (e) {
      // Un cliente sin stock o sin credencial no debe tumbar a los demás.
      errores.push(cli + ": " + (e && e.message ? e.message : e));
      porCliente.push({ cliente: cli, filas: 0, unidades: 0, error: String(e && e.message || e) });
      return;
    }

    var dl = (r && r.datosLimpios) || [], rep = (r && r.reporte) || {};
    var nuevas = 0, unidades = 0;

    (rep.clientesEfectivos || [cli]).forEach(function (c) { efectivos[c] = true; });
    if (rep.aliasERP && rep.aliasERP.length) {
      alias.push({ cliente: cli, codigosERP: rep.aliasERP.slice() });
    }

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
    porCliente.push({
      cliente: cli, filas: nuevas, unidades: unidades,
      codigoERP: (rep.aliasERP && rep.aliasERP.length) ? rep.aliasERP.join(", ") : null
    });
  });

  if (!filas.length) {
    throw new Error("Ningún cliente devolvió filas." +
      (errores.length ? "\n· " + errores.join("\n· ") : ""));
  }

  repTotal.skusUnicosCount = Object.keys(skusUnicos).length;
  repTotal.porCliente = porCliente;
  repTotal.clientesPedidos = unicos;
  repTotal.clientesEfectivos = Object.keys(efectivos);
  repTotal.aliasERP = alias;
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

  // Clientes del grupo que no aportaron ni un código: se nombran tal cual para
  // que el usuario sepa cuáles faltan por cargar, no solo que "faltan".
  var sinCodigos = detalle
    .filter(function (d) { return !d.total; })
    .map(function (d) { return d.cliente; });

  var out = {
    existe: codigos.length > 0, mes: mes, codigos: codigos,
    total: codigos.length, abc: abc, detallePorCliente: detalle,
    sinCodigos: sinCodigos
  };

  // Mismo contexto que el flujo de un solo cliente (quién puede cargar el
  // cronograma y qué clientes ya lo tienen), si el enrutador está presente.
  return (typeof _conContextoCronograma === "function")
    ? _conContextoCronograma(out, base, lista.join(", "), mes)
    : out;
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
    exacto: grupo.some(function (c) { return String(c.cliente).toUpperCase() === pedido; }),
    // Todos los de la sede: permite combinar clientes que no se parecen
    // (por ejemplo SG y HYCITE, de una misma zona de la bodega).
    todos: todos.map(function (c) {
      return { cliente: String(c.cliente || "").trim().toUpperCase(), usuario: c.usuario || "" };
    }).sort(function (a, b) { return a.cliente < b.cliente ? -1 : 1; })
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

/**
 * Eventos del cronograma de VARIOS clientes, combinados y ordenados por fecha.
 * Mantiene el mismo formato que obtenerEventosCronogramaPorCliente, así que el
 * asistente los pinta con la lista de siempre.
 *
 * @param {string[]} clientes  códigos de cliente
 * @param {Object}   opciones  mismas que la versión de un solo cliente
 */
function obtenerEventosCronogramaMulti(clientes, opciones) {
  var lista = (clientes || [])
    .map(function (c) { return String(c || "").trim().toUpperCase(); })
    .filter(Boolean);
  if (!lista.length) return [];

  var vistos = {}, todos = [];
  lista.forEach(function (cli) {
    var evs;
    try { evs = obtenerEventosCronogramaPorCliente(cli, opciones) || []; }
    catch (e) { return; }        // un cliente sin eventos no corta a los demás
    evs.forEach(function (ev) {
      // La fila del cronograma identifica al evento: evita repetirlo si dos
      // clientes comparten la misma fila.
      var k = String(ev.filaEvento || ev.fila || "") + "|" + String(ev.cliente || cli);
      if (vistos[k]) return;
      vistos[k] = true;
      todos.push(ev);
    });
  });

  todos.sort(function (a, b) {
    var fa = a.fechaISO || a.fecha || "", fb = b.fechaISO || b.fecha || "";
    return fa < fb ? -1 : (fa > fb ? 1 : 0);
  });
  return todos;
}
