# ITSANET IMS — API (Railway)

Capa intermedia entre el frontend/Apps Script y Supabase. Aquí vive la llave
`service_role`: el navegador nunca la ve.

## Endpoints

| Método | Ruta | Para qué |
|---|---|---|
| GET | `/health` | Estado del servicio (sin token) |
| GET | `/resumen` | Conteo de filas por tabla |
| GET | `/api/:tabla` | Leer con filtros, orden y paginación |
| POST | `/api/:tabla` | Insertar una fila o un arreglo |
| PATCH | `/api/:tabla/:id` | Actualizar por id |

Tablas permitidas: `panel_de_control`, `inventarios`, `registro`, `clientes`.

### Ejemplos
```
GET /api/inventarios?cliente=FLUKE&limit=50&order=creado_en.desc
GET /api/panel_de_control?base=UIO
POST /api/registro     (cuerpo: {...} o [{...}, {...}])
PATCH /api/panel_de_control/12   (cuerpo: { "avance": "Entregado" })
```

## Autenticación
Toda ruta bajo `/api` y `/resumen` exige el token propio:
```
Authorization: Bearer <API_TOKEN>
```

## Variables de entorno (Railway → Variables)
| Variable | Valor |
|---|---|
| `SUPABASE_URL` | URL del proyecto |
| `SUPABASE_SERVICE_ROLE_KEY` | llave service_role (SECRETA) |
| `API_TOKEN` | token largo y aleatorio, inventado por ti |
| `CORS_ORIGINS` | orígenes del frontend, separados por coma |

## Despliegue
Railway → New Project → Deploy from GitHub → este repo, rama `codigo-en-vivo`,
**Root Directory: `api`**. Railway detecta Node y ejecuta `npm start`.
