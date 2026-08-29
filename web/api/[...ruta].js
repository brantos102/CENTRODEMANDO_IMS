/**
 * Proxy serverless (Vercel) → API de Railway.
 * ---------------------------------------------------------------------------
 * El navegador llama a /api/... de este mismo dominio; esta función añade el
 * token y reenvía a Railway. Así API_TOKEN vive SOLO en el servidor de Vercel
 * y nunca viaja al cliente.
 *
 * Variables de entorno (Vercel → Settings → Environment Variables):
 *   API_BASE_URL  https://centrodemandoims-production.up.railway.app
 *   API_TOKEN     el mismo token configurado en Railway
 */

const { API_BASE_URL, API_TOKEN } = process.env;

// Solo se permiten estas rutas: el proxy no es un pasamanos abierto.
const RUTAS = /^(resumen|api\/(panel_de_control|inventarios|registro|clientes)(\/\d+)?)$/;

export default async function handler(req, res) {
  if (!API_BASE_URL) {
    return res.status(500).json({ error: "Falta API_BASE_URL en el servidor." });
  }

  const partes = Array.isArray(req.query.ruta) ? req.query.ruta : [req.query.ruta];
  // El front llama /api/resumen y /api/api/<tabla>; Vercel entrega la ruta ya
  // sin su propio prefijo /api, pero se normaliza por si viniera incluido.
  let ruta = partes.filter(Boolean).join("/").replace(/^api\//, "");
  if (ruta !== "resumen") ruta = "api/" + ruta;
  if (!RUTAS.test(ruta)) {
    return res.status(404).json({ error: "Ruta no permitida: " + ruta });
  }

  // Reconstruye la query string sin el parámetro interno de la ruta.
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (k !== "ruta") qs.append(k, v);
  }
  const url = `${API_BASE_URL.replace(/\/+$/, "")}/${ruta}${qs.toString() ? "?" + qs : ""}`;

  const metodo = req.method || "GET";
  if (!["GET", "POST", "PATCH"].includes(metodo)) {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const r = await fetch(url, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {})
      },
      body: metodo === "GET" ? undefined : JSON.stringify(req.body ?? {})
    });
    const texto = await r.text();
    res.status(r.status);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.send(texto);
  } catch (e) {
    return res.status(502).json({ error: "No se pudo contactar la API", detalle: e.message });
  }
}
