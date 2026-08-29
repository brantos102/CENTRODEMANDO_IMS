# ITSANET IMS — Frontend (Vercel)

Panel web que consume la API de Railway. El navegador **nunca** ve el token:
llama a `/api/...` de este mismo dominio y una función serverless de Vercel
añade `Authorization: Bearer <API_TOKEN>` y reenvía a Railway.

```
Navegador → /api/... (Vercel serverless) → Railway API → Supabase
                        ↑ aquí vive API_TOKEN
```

## Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Valor |
|---|---|
| `API_BASE_URL` | `https://centrodemandoims-production.up.railway.app` |
| `API_TOKEN` | el mismo token configurado en Railway |

## Despliegue
Vercel → Add New Project → importar el repo → **Root Directory: `web`**.
Framework preset: **Other**. No hace falta build.

## Rutas del proxy
El front llama `/api/proxy?ruta=resumen` o `?ruta=<tabla>`; solo se permiten
esas rutas,
cualquier otra devuelve 404 (el proxy no es un pasamanos abierto).
