# Implantación paso a paso — Panel de Control + Terminal WMS (dos códigos coordinados)

> Regla de oro: **NO tocar el Panel de Control verídico** (`1Cq2Aq…`) hasta validar
> todo en la **copia** (`1_-tI6…`). Cada paso indica sobre qué libro se trabaja.

## Libros (spreadsheets)
- **Producción (real, en uso):** `1Cq2AqRVAZJYmj_zs_zg8C63FPrgRBtJHaNcHWXygaPk`
- **Copia de pruebas:** `1_-tI6nvzofHRVZKJTU55AeLgEpkaUoXhtHbMakNGOt8`

---

## FASE 1 — VALIDAR EN LA COPIA (sin tocar producción)

Aquí usas el **WMS integrado de este repo (Opción B)**: no toca el standalone real.

1. En el proyecto **Panel (este repo)**, abre el editor y ejecuta:
   - `setupWebApp('1_-tI6nvzofHRVZKJTU55AeLgEpkaUoXhtHbMakNGOt8')`  ← apunta a la COPIA.
   - Verifica con `obtenerUrlLibroMaestro()` (debe devolver el link de la copia).
   - `consolidarUsuarios()`  ← crea/normaliza la hoja USUARIOS (Rol Panel, Rol WMS, Contraseña) en la copia.
2. **Publica** este proyecto como App Web (Implementar → Gestionar implementaciones → Editar → Nueva versión).
   - Ejecutar como: **Yo (dueño)**
   - Quién tiene acceso: **Cualquier usuario de itsanet.com**
3. Prueba el flujo completo en la copia:
   - Crear inventario → botón **“▶ Ir a contar ahora (WMS)”** → debe abrir el WMS,
     entrar con TU Gmail y cargar el archivo (sin “Cargando…”).
   - Contar, ajustar, registrar series.
   - Consolidar → revisar la hoja **`LOG_CONSOLIDACION`** (no consolidados, duplicados, validaciones).
   - Gestionar usuarios (pestaña Usuarios → Nuevo/Editar): define **Rol Panel + Rol WMS + PIN**.
4. Cuando todo funcione en la copia, pasa a la Fase 2.

---

## FASE 2 — PASAR A PRODUCCIÓN (dos códigos coordinados)

### 2.A — Panel de Control verídico (este repo)
1. En el proyecto Panel, ejecuta `setupWebApp('1Cq2AqRVAZJYmj_zs_zg8C63FPrgRBtJHaNcHWXygaPk')`.
2. Ejecuta `consolidarUsuarios()` (crea/normaliza USUARIOS en el libro real, sin borrar nada).
3. Publica **Nueva versión** de la App Web.

### 2.B — Terminal WMS standalone (proyecto aparte)
1. Abre el proyecto del **Terminal WMS** (el del link `…/AKfycbwBwuTE…/exec`).
2. En su **`Codigo.gs`** aplica `PATCH_Codigo.gs.txt`:
   - Reemplaza `getTodosLosUsuarios()` por la versión del parche.
   - Añade `obtenerSesionWMSActual()` y `obtenerDatosAnalisis()`.
   - Confirma `MASTER_DB_ID = "1Cq2AqRVAZJYmj_zs_zg8C63FPrgRBtJHaNcHWXygaPk"` (producción).
3. En su **`BlindInventory.html`** aplica `PATCH_BlindInventory.txt` (reemplaza el bloque del deep-link).
4. Publica **Nueva versión** de la App Web del WMS:
   - Ejecutar como: **Yo (dueño)**
   - Quién tiene acceso: **Cualquier usuario de itsanet.com**  ← así todos los operarios pueden entrar.
5. En el Panel, deja el link del WMS apuntando al standalone:
   - `setWmsUrl('https://script.google.com/macros/s/AKfycbwBwuTEaaxpf3IWWt1iAT0DzI8QIqZSXm2SnA1otqttURsUi2mEwnvNU1a1xn-vu2N2/exec')`
   - (forma genérica, sin forzar login de dominio).

### 2.C — Verificación final en producción
- Crear inventario en el Panel real → “Ir a contar” → abre el WMS standalone en el archivo, con tu Gmail.
- Otro operario abre el mismo link → entra con SU Gmail (rol según USUARIOS) o con PIN.

---

## Accesibilidad del link WMS (varios operarios)
- La App Web del WMS se publica **Ejecutar como: dueño** + **Acceso: dominio itsanet.com**.
  Así **cualquier** operario del dominio abre el link sin que tú compartas el archivo:
  el backend lee/escribe el inventario **como dueño** (no depende de permisos del operario).
- El **rol** (ADMIN / OPERADOR / AUDITOR) se decide al entrar:
  - **Con Gmail** (auto): toma el rol de la hoja USUARIOS; si no está, entra como AUDITOR (lectura).
  - **Con PIN**: el operario elige su usuario y pone su contraseña (USUARIOS / temporales).
- Por eso **no hay que volver a compartir** cada archivo con cada persona.

## Usuarios en un solo listado (Panel + WMS)
- Hoja única **USUARIOS** (en el libro maestro): `Email | Nombre | Rol Panel | Tel | Activo | Fecha | Notas | Rol WMS | Contraseña`.
- Se administra desde el **Panel** (pestaña Usuarios → Nuevo/Editar): defines Rol Panel **y** Rol WMS **y** PIN.
- El WMS (tras el parche) lee esa MISMA hoja → **mismos usuarios y mismos rangos** en ambos sistemas.
- `consolidarUsuarios()` vuelca los hardcodeados + EQUIPO_OPERATIVO a la hoja (una sola vez), sin borrar.
