/**
 * ITSANET IMS — API intermedia (Railway → Supabase)
 * ---------------------------------------------------------------------------
 * Rol: única puerta de entrada a los datos. El navegador y Apps Script NUNCA
 * ven la llave de la base: aquí vive la service_role, del lado servidor.
 *
 * Variables de entorno (Railway → Variables):
 *   SUPABASE_URL               URL del proyecto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY  llave service_role (SECRETA)
 *   API_TOKEN                  token propio que exigimos a quien llame
 *   CORS_ORIGINS               orígenes permitidos, separados por coma
 */

import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  API_TOKEN,
  CORS_ORIGINS = "",
  PORT = 3000
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

// Node 20 no trae WebSocket nativo y supabase-js lo exige al construir el
// cliente (aunque esta API no usa Realtime): se le pasa el paquete `ws`.
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws }
});

const app = express();
app.use(express.json({ limit: "10mb" }));

// CORS: si no se configuran orígenes, se permite cualquiera (útil al inicio).
const origins = CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true }));

/** Exige el token propio en las rutas de datos (no en /health). */
const TOKEN = String(API_TOKEN || "").trim().split(/\s+/)[0];

function requireToken(req, res, next) {
  if (!TOKEN) return next();                   // sin token configurado: abierto
  const h = req.get("authorization") || "";
  const tok = (h.startsWith("Bearer ") ? h.slice(7) : req.get("x-api-token") || "").trim();
  if (tok !== TOKEN) return res.status(401).json({ error: "No autorizado" });
  next();
}

/* ── Raíz: pequeño índice para saber que el servicio responde ────────────── */
app.get("/", (_req, res) => {
  res.json({
    servicio: "itsanet-ims-api",
    rutas: ["/health", "/resumen", "/api/:tabla"],
    tablas: ["panel_de_control", "inventarios", "registro", "clientes", "cronograma", "equipo"]
  });
});

/* ── Salud (sin token: Railway la usa para saber si el servicio vive) ─────── */
app.get("/health", async (_req, res) => {
  const { error } = await db.from("panel_de_control").select("id").limit(1);
  // tokenLen permite comparar con el del proxy sin revelar el valor.
  res.json({
    ok: !error, servicio: "itsanet-ims-api",
    tokenConfigurado: !!TOKEN, tokenLen: TOKEN.length,
    error: error?.message ?? null
  });
});

app.use("/api", requireToken);

/* ── Lectura genérica con filtros, orden y paginación ─────────────────────
   GET /api/:tabla?cliente=FLUKE&limit=100&offset=0&order=creado_en.desc
   Cualquier otro parámetro se aplica como filtro de igualdad.            */
const TABLAS = new Set(["panel_de_control", "inventarios", "registro", "clientes", "cronograma", "equipo"]);

app.get("/api/:tabla", async (req, res) => {
  const { tabla } = req.params;
  if (!TABLAS.has(tabla)) return res.status(404).json({ error: "Tabla no disponible" });

  const { limit = "100", offset = "0", order, select, ...filtros } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 100, 5000);
  const off = parseInt(offset, 10) || 0;

  let q = db.from(tabla).select(select || "*", { count: "exact" });
  for (const [campo, valor] of Object.entries(filtros)) {
    q = String(valor).includes("%") ? q.ilike(campo, valor) : q.eq(campo, valor);
  }
  if (order) {
    const [campo, dir] = String(order).split(".");
    q = q.order(campo, { ascending: dir !== "desc" });
  }
  q = q.range(off, off + lim - 1);

  const { data, error, count } = await q;
  if (error) return res.status(400).json({ error: error.message });
  res.json({ datos: data, total: count, limit: lim, offset: off });
});

/* ── Inserción (una fila o un arreglo) ───────────────────────────────────── */
app.post("/api/:tabla", async (req, res) => {
  const { tabla } = req.params;
  if (!TABLAS.has(tabla)) return res.status(404).json({ error: "Tabla no disponible" });

  const filas = Array.isArray(req.body) ? req.body : [req.body];
  if (!filas.length) return res.status(400).json({ error: "Sin datos" });

  const { data, error } = await db.from(tabla).insert(filas).select();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ insertadas: data.length, datos: data });
});

/* ── Actualización por id ─────────────────────────────────────────────────── */
app.patch("/api/:tabla/:id", async (req, res) => {
  const { tabla, id } = req.params;
  if (!TABLAS.has(tabla)) return res.status(404).json({ error: "Tabla no disponible" });

  const { data, error } = await db.from(tabla).update(req.body).eq("id", id).select();
  if (error) return res.status(400).json({ error: error.message });
  if (!data.length) return res.status(404).json({ error: "No encontrado" });
  res.json({ datos: data[0] });
});

/* ── Resumen para el tablero del frontend ────────────────────────────────── */
app.get("/resumen", requireToken, async (_req, res) => {
  const cuenta = async (t) => {
    const { count } = await db.from(t).select("id", { count: "exact", head: true });
    return count ?? 0;
  };
  const [panel, inventarios, registro, clientes, cronograma] = await Promise.all(
    ["panel_de_control", "inventarios", "registro", "clientes", "cronograma"].map(cuenta)
  );
  res.json({ panel, inventarios, registro, clientes, cronograma, actualizado: new Date().toISOString() });
});

/* ── Analítica: indicadores calculados en el servidor ─────────────────────
   Se agrega aquí (y no en el navegador) para no bajar 125k filas al cliente. */
app.get("/analitica", requireToken, async (req, res) => {
  const base = req.query.base;
  const filtra = (q) => (base ? q.eq("base", base) : q);

  const { data: panel, error: e1 } = await filtra(
    db.from("panel_de_control").select(
      "cliente, avance, responsable, fecha_inicio, fecha_fin, unidades_contadas," +
      "referencias_contadas, posiciones_contadas, efectividad_unidades," +
      "efectividad_referencias, efectividad_posiciones")
  );
  if (e1) return res.status(400).json({ error: e1.message });

  const { data: crono } = await filtra(
    db.from("cronograma").select(
      "cliente, categoria, responsable, estado, fecha, fecha_entrega, porcentaje, titulo")
  );

  const nOr0 = (x) => (typeof x === "number" && !isNaN(x) ? x : 0);
  const prom = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const dia = (d) => (d ? new Date(d) : null);

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const finHoy = new Date(hoy); finHoy.setHours(23, 59, 59, 999);
  const en7 = new Date(hoy); en7.setDate(en7.getDate() + 7);
  const anio = hoy.getFullYear();
  const mesAct = hoy.getMonth();
  const entregado = (e) => /entregad|complet|finaliz/i.test(String(e || ""));

  /* ── KPIs operativos (equivalentes a los del Centro de Mando) ── */
  let vencidos = 0, deHoy = 0, prox7 = 0, entregadosAnio = 0,
      progMes = 0, entrMes = 0, progAnio = 0, sinResponsable = 0;
  const atrasadosDetalle = [];

  for (const r of crono || []) {
    const f = dia(r.fecha);
    const est = String(r.estado || "");
    const ent = entregado(est);
    if (!r.responsable) sinResponsable++;
    if (f && f.getFullYear() === anio) {
      progAnio++;
      if (f.getMonth() === mesAct) { progMes++; if (ent) entrMes++; }
    }
    if (ent) {
      const fe = dia(r.fecha_entrega) || f;
      if (fe && fe.getFullYear() === anio) entregadosAnio++;
      continue;
    }
    if (!f) continue;
    if (f < hoy) {
      vencidos++;
      atrasadosDetalle.push({
        cliente: r.cliente, titulo: r.titulo, responsable: r.responsable || "Sin asignar",
        fecha: r.fecha, dias: Math.floor((hoy - f) / 86400000)
      });
    } else if (f <= finHoy) deHoy++;
    else if (f <= en7) prox7++;
  }
  atrasadosDetalle.sort((a, b) => b.dias - a.dias);

  /* ── Por cliente (volumen y efectividad) ── */
  const porCliente = {};
  let unidadesAnio = 0, referenciasAnio = 0, posicionesAnio = 0;
  for (const r of panel || []) {
    const k = r.cliente || "—";
    const c = (porCliente[k] ||= { cliente: k, inventarios: 0, unidades: 0, referencias: 0, posiciones: 0, efec: [] });
    c.inventarios++;
    c.unidades += nOr0(r.unidades_contadas);
    c.referencias += nOr0(r.referencias_contadas);
    c.posiciones += nOr0(r.posiciones_contadas);
    if (typeof r.efectividad_unidades === "number") c.efec.push(r.efectividad_unidades);
    const fi = dia(r.fecha_inicio);
    if (fi && fi.getFullYear() === anio) {
      unidadesAnio += nOr0(r.unidades_contadas);
      referenciasAnio += nOr0(r.referencias_contadas);
      posicionesAnio += nOr0(r.posiciones_contadas);
    }
  }
  const clientes = Object.values(porCliente)
    .map((c) => ({ ...c, efectividad: prom(c.efec), efec: undefined }))
    .sort((a, b) => b.unidades - a.unidades);

  /* ── Tendencia mensual del año (inventarios y unidades) ── */
  const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const tendencia = MESES.map((m) => ({ mes: m, inventarios: 0, unidades: 0, programados: 0, entregados: 0 }));
  for (const r of panel || []) {
    const f = dia(r.fecha_inicio);
    if (f && f.getFullYear() === anio) {
      tendencia[f.getMonth()].inventarios++;
      tendencia[f.getMonth()].unidades += nOr0(r.unidades_contadas);
    }
  }
  for (const r of crono || []) {
    const f = dia(r.fecha);
    if (f && f.getFullYear() === anio) {
      tendencia[f.getMonth()].programados++;
      if (entregado(r.estado)) tendencia[f.getMonth()].entregados++;
    }
  }

  const cuentaPor = (arr, campo) => {
    const o = {};
    for (const r of arr || []) { const k = String(r[campo] || "—").trim() || "—"; o[k] = (o[k] || 0) + 1; }
    return Object.entries(o).map(([nombre, n]) => ({ nombre, n })).sort((a, b) => b.n - a.n);
  };

  /* ── Carga y cumplimiento por responsable ── */
  const porResp = {};
  for (const r of crono || []) {
    const k = r.responsable || "Sin asignar";
    const p = (porResp[k] ||= { responsable: k, total: 0, entregados: 0, atrasados: 0, pendientes: 0 });
    p.total++;
    if (entregado(r.estado)) p.entregados++;
    else {
      p.pendientes++;
      const f = dia(r.fecha);
      if (f && f < hoy) p.atrasados++;
    }
  }
  const responsables = Object.values(porResp)
    .map((p) => ({ ...p, cumplimiento: p.total ? Math.round((p.entregados / p.total) * 100) : null }))
    .sort((a, b) => b.total - a.total);

  res.json({
    kpis: {
      vencidos, hoy: deHoy, prox7, entregadosAnio, sinResponsable,
      clientesActivos: clientes.length,
      unidadesAnio, referenciasAnio, posicionesAnio,
      avanceMes: progMes ? Math.round((entrMes / progMes) * 100) : null,
      cumplimientoAnio: progAnio ? Math.round((entregadosAnio / progAnio) * 100) : null,
      efectividadMedia: prom((panel || []).map((r) => r.efectividad_unidades).filter((x) => typeof x === "number"))
    },
    tendencia,
    clientes,
    atrasados: atrasadosDetalle.slice(0, 25),
    estadosPanel: cuentaPor(panel, "avance"),
    estadosCronograma: cuentaPor(crono, "estado"),
    categorias: cuentaPor(crono, "categoria"),
    responsables,
    totales: {
      inventarios: (panel || []).length,
      eventos: (crono || []).length,
      unidades: (panel || []).reduce((s, r) => s + nOr0(r.unidades_contadas), 0)
    },
    actualizado: new Date().toISOString()
  });
});

app.use((_req, res) => res.status(404).json({ error: "Ruta no encontrada" }));

app.listen(PORT, () => console.log(`ITSANET IMS API escuchando en :${PORT}`));
