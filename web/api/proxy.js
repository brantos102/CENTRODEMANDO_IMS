/**
 * Proxy serverless (Vercel) → API de Railway.
 * ---------------------------------------------------------------------------
 * El navegador llama a /api/proxy?ruta=<destino>&... de este mismo dominio;
 * esta función añade el token y reenvía a Railway. Así API_TOKEN vive SOLO en
 * el servidor de Vercel y nunca viaja al cliente.
 *
 * Se usa una función simple con parámetro `ruta` (en vez de una ruta comodín)
 * porque es la forma que Vercel resuelve sin ambigüedad.
 *
 * Variables de entorno (Vercel → Settings → Environment Variables):
 *   API_BASE_URL  https://centrodemandoims-production.up.railway.app
 *   API_TOKEN     el mismo token configurado en Railway
 */

const { API_BASE_URL, API_TOKEN } = process.env;

// El token viaja en una cabecera HTTP: se limpian espacios y saltos de línea
// (un pegado accidental duplicado o con espacios invalida toda la petición).
const TOKEN = String(API_TOKEN || "").trim().split(/\s+/)[0];

const TABLAS = new Set(["panel_de_control", "inventarios", "registro", "clientes", "cronograma", "equipo"]);

/** Traduce la ruta pedida a la de Railway; null si no está permitida. */
function destinoDe(ruta) {
  if (ruta === "resumen") return "/resumen";
  if (ruta === "analitica") return "/analitica";
  const [tabla, id] = String(ruta).split("/");
  if (!TABLAS.has(tabla)) return null;
  if (id !== undefined && !/^\d+$/.test(id)) return null;
  return `/api/${tabla}${id ? "/" + id : ""}`;
}

export default async function handler(req, res) {
  // Diagnóstico: compara la longitud del token de Vercel con la de Railway.
  // No revela el valor; si los números difieren, las variables no coinciden.
  if ((req.query || {}).ruta === "diag") {
    let salud = null;
    try {
      const base0 = String(API_BASE_URL || "").trim().replace(/\/+$/, "");
      const b = /^https?:\/\//i.test(base0) ? base0 : "https://" + base0;
      salud = await (await fetch(b + "/health")).json();
    } catch (e) { salud = { error: e.message }; }
    return res.json({
      vercel: { apiBaseUrl: API_BASE_URL || null, tokenConfigurado: !!TOKEN, tokenLen: TOKEN.length },
      railway: salud,
      coinciden: !!salud && salud.tokenLen === TOKEN.length
    });
  }

  if (!API_BASE_URL) {
    return res.status(500).json({ error: "Falta API_BASE_URL en el servidor." });
  }

  const { ruta = "", ...resto } = req.query || {};
  const destino = destinoDe(String(ruta));
  if (!destino) return res.status(404).json({ error: `Ruta no permitida: ${ruta}` });

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(resto)) qs.append(k, v);
  // Tolera que la variable venga sin protocolo o con barra final.
  let base = String(API_BASE_URL).trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) base = "https://" + base;
  const url = `${base}${destino}${qs.toString() ? "?" + qs : ""}`;

  const metodo = req.method || "GET";
  if (!["GET", "POST", "PATCH"].includes(metodo)) {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const r = await fetch(url, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
      },
      body: metodo === "GET" ? undefined : JSON.stringify(req.body ?? {})
    });
    const texto = await r.text();
    res.status(r.status);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.send(texto);
  } catch (e) {
    // El destino es el dominio público de Railway: incluirlo ayuda a ver de
    // inmediato si la variable API_BASE_URL está mal escrita.
    return res.status(502).json({
      error: `No se pudo contactar la API (${e.message}) al llamar ${url}`
    });
  }
}
