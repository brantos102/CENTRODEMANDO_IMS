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
    tablas: ["panel_de_control", "inventarios", "registro", "clientes"]
  });
});

/* ── Salud (sin token: Railway la usa para saber si el servicio vive) ─────── */
app.get("/health", async (_req, res) => {
  const { error } = await db.from("panel_de_control").select("id").limit(1);
  res.json({ ok: !error, servicio: "itsanet-ims-api", error: error?.message ?? null });
});

app.use("/api", requireToken);

/* ── Lectura genérica con filtros, orden y paginación ─────────────────────
   GET /api/:tabla?cliente=FLUKE&limit=100&offset=0&order=creado_en.desc
   Cualquier otro parámetro se aplica como filtro de igualdad.            */
const TABLAS = new Set(["panel_de_control", "inventarios", "registro", "clientes"]);

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
  const [panel, inventarios, registro, clientes] = await Promise.all(
    ["panel_de_control", "inventarios", "registro", "clientes"].map(cuenta)
  );
  res.json({ panel, inventarios, registro, clientes, actualizado: new Date().toISOString() });
});

app.use((_req, res) => res.status(404).json({ error: "Ruta no encontrada" }));

app.listen(PORT, () => console.log(`ITSANET IMS API escuchando en :${PORT}`));
