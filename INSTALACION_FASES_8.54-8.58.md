# 📦 Instalación y validación — FASES 8.54 → 8.58
**Rama:** `claude/dazzling-knuth-nv0sxt` · **Commits:** `0c7bbc4` → `9c5e60b` · Julio 2026

---

## PARTE 1 — Instalar el código (10 min)

### 1.1 Abrir el proyecto
Abre el maestro **CONTEOS CICLICOS ITSANET** → menú **Extensiones → Apps Script**
(el proyecto del Centro de Mando).

### 1.2 Reemplazar estos 6 archivos (copiar TODO el contenido desde el repo y pegar encima)

| # | Archivo en Apps Script | Archivo en el repo (GitHub) |
|---|---|---|
| 1 | `Cronograma_Recordatorios.gs` | `Cronograma_Recordatorios.gs` |
| 2 | `ITSANET_API.gs` | `ITSANET_API.gs.txt` *(es el mismo código; en el repo lleva .txt)* |
| 3 | `AsistenteCreacionV2.html` | `AsistenteCreacionV2.html` |
| 4 | `WebApp.html` | `WebApp.html` |
| 5 | `WebApp_JS.html` | `WebApp_JS.html` |
| 6 | `CentroDeMandoIntegral.html` | `CentroDeMandoIntegral.html` |

**NO tocar:** `appsscript.json`, `BlindInventory.html`, `FormularioEvento.html`,
`ExportarReporteForm.html`, `SelectorZip.html`, `AccesoDenegado.html`,
`DescargarZipUI.html` — no cambiaron. **El Terminal WMS (proyecto aparte) no se toca.**

En cada archivo: seleccionar todo (Ctrl+A) → pegar → **Guardar (Ctrl+S)**.

### 1.3 Publicar la versión nueva (SIN esto no se ven los cambios)
**Implementar → Gestionar implementaciones → ✏️ (lápiz) → Versión: "Nueva versión" → Implementar.**
Verificar que siga: *Ejecutar como: Yo* · *Acceso: itsanet.com*.
Luego en el navegador: **Ctrl+F5** sobre el panel (o cerrar y volver a abrir).

### 1.4 Hojas nuevas — NO crear nada a mano ✋
| Hoja | Cómo aparece |
|---|---|
| `CRONOGRAMA_CODIGOS` | Se crea SOLA (con encabezados y **protección**) la primera vez que el Coordinador carga códigos desde el panel |
| `EQUIPOS_TAREA` | Se crea SOLA al crear el primer evento con equipo |
| `CREDENCIALES_API` | La existente **se elimina** al usar "Migrar" (las claves pasan al almacenamiento interno ANTES de borrar; cero riesgo de pérdida) |

---

## PARTE 2 — Configuración inicial (una sola vez, como Coordinador)

### 2.1 Migrar credenciales API 🔐
1. Panel → botón **🔐 Credenciales API** (sección Base de datos).
2. Aparece el aviso amarillo → clic en **"Migrar y eliminar la pestaña ahora"**.
3. Toast esperado: *"Migradas N credenciales… La pestaña CREDENCIALES_API fue eliminada."*
4. La pestaña desaparece del libro. Desde ahora las claves se gestionan solo aquí
   (añadir cliente / reemplazar / eliminar — nunca se muestran las guardadas).
5. ⚠️ **Recomendado:** rotar con ITSANET la clave de BELIA (estuvo visible en la
   pestaña) y actualizarla desde este mismo botón.

### 2.2 Cargar el cronograma de códigos del primer cliente 📅
1. Abre el Excel del cliente (ej. DEGSO) → hoja `CRONOGRAMA CONTEO x COD (A+B)`.
2. Selecciona **desde la primera fila de datos** (sin encabezados) las columnas
   **ABC + producto_id + los 12 meses** (ej. `A4:N603`) → Copiar.
3. Panel → **📅 Cronograma de códigos** → Cliente: `DEGSO` → pegar en el cuadro →
   **Actualizar cronograma**.
4. Toast esperado: *"✓ DEGSO: 600 códigos cargados (reemplazó 0)"*.
5. Repetir por cada cliente (BELIA, HYCITE, …). Para actualizar un cliente más
   adelante: mismo botón → **reemplaza solo el bloque de ese cliente**.

---

## PARTE 3 — Checklist de validación por requerimiento ✅

### R1 · Regla 1 SERIE = 1 UNIDAD (API = CSV)
- [ ] Wizard → fuente **API** → cliente con series → Extraer → aparece chip
  **"🔢 N con serie (1 serie = 1 und)"**; si el ERP traía cantidades ≠1 en series,
  chip **"⚙ N cantidades ajustadas a 1"**.
- [ ] Crear el archivo → en la PLANILLA cada fila con serie tiene **cantidad 1**.
- [ ] Regresión: cargar un CSV → se comporta igual que siempre.

### R2 · Candado de la fuente API
- [ ] Fuente API sin extraer → botón Procesar **bloqueado**, estado
  *"Pendiente: extraer stock API"*.
- [ ] Alternar API↔CSV → los datos cargados se **limpian** (no quedan datos viejos).

### R3 · Mes sugiere códigos
- [ ] Wizard → API → cliente DEGSO → Mes **JUNIO** → **📅 Sugerir códigos** →
  el cuadro se llena (~98 códigos) + mensaje *"✓ 98 códigos programados de JUNIO (A:… B:… C:…)"*.
- [ ] La lista es **editable**: añade/quita códigos antes de extraer.
- [ ] Cliente sin cronograma cargado → aviso *"no tiene cronograma de códigos cargado"* (no bloquea: puedes escribir códigos a mano).

### R4 · Ventana de variantes (códigos de otro mes)
- [ ] Con la sugerencia de JUNIO (incluye `DG100`, `DG1003H`) y "Incluir variantes"
  activo → Extraer → se abre la subventana con `DG100GR` mostrando **📅 JULIO ⚠**
  y **desmarcado**.
- [ ] Aplicar sin marcarlo → nota *"(1 código(s) excluidos · N fila(s))"* y ese SKU
  **no entra** al archivo.
- [ ] Si lo marcas → sí entra. Los que pertenecen al mes se marcan **solos**.

### R5 · Credenciales protegidas
- [ ] Tras migrar: extraer stock de un cliente migrado → **funciona igual**.
- [ ] Añadir un cliente nuevo (cliente/usuario/clave) → Guardar → extraer → OK.
- [ ] Un usuario NO Coordinador no ve los botones 🔐/📅 (y el servidor rechaza
  las funciones aunque las llamen).

### R6 · Categoría + registros automáticos
- [ ] Panel → **Nuevo evento** → elegir Categoría (ej. *Trabajo Slotting*) → crear →
  en CRONOGRAMA-2026: **col F**=categoría, **col I**=responsable, **col L**=fecha
  inicio, **col M**=Pendiente.
- [ ] Wizard → crear archivo vinculando evento (crear o asignar) → **col M pasa a
  "En Proceso"** + chip del archivo en **col Q**.
- [ ] En PANEL DE CONTROL, la fila nueva del archivo trae **col G="En Proceso"** y
  **col I = nombre de quien lo creó**.

### R7 · Equipos multi-operario + Analytics
- [ ] Nuevo evento → marcar **2 apoyos** en "👥 Equipo de apoyo" → crear → la hoja
  `EQUIPOS_TAREA` aparece con 3 filas ACTIVO (1 RESPONSABLE + 2 APOYO).
- [ ] **Finalizar** ese evento → el modal muestra el equipo → desmarcar 1 →
  confirmar → esa persona queda **EXCLUIDO** con fecha (la fila no se borra).
- [ ] Pestaña **Analytics** → cada operario con **NOMBRE** (correo pequeño debajo) +
  columnas nuevas **Apoyos** y **Excl.** con los conteos correctos.

### R8 · Centro de Mando Integral (reparado)
- [ ] Menú de la hoja → *Abrir Centro de Mando Integral* → **carga datos** (estaba
  muerto por el error de sintaxis).
- [ ] Filtros **Hoy / Esta Semana / Este Mes / Todos** + selects de cliente y
  operario **filtran** la lista del cronograma; "Mostrar Todos" restaura.

---

## Si algo falla
1. ¿Guardaste TODOS los archivos y creaste **versión nueva** del deploy? (causa #1)
2. Ctrl+F5 (caché del navegador).
3. El error exacto del toast/consola indica el archivo: compárt*e*lo tal cual.
