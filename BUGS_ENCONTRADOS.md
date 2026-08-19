# Bugs encontrados durante FIX FASE 8.33

## 1. (CORREGIDO) Consolidación no procesaba el 100 % con 250+ archivos
**Severidad:** Alta — pérdida de datos en INVENTARIOS (Power BI quedaba incompleto).

`consolidarConAuditoria` acumulaba todo en memoria en una sola corrida, hacía
`clearContent()` de INVENTARIOS y reescribía solo lo parcial al hacer timeout.
Re-ejecutar reiniciaba desde el archivo 1 → timeout en el mismo punto → los
últimos ~80 archivos nunca se consolidaban.

**Corrección:** consolidación por lotes con checkpoint por archivo (snapshot en
`__CACHE_CONSOLIDACION`), escritura **append** (no clear-and-rewrite) y trigger
one-time `_continuarConsolidacion` que reanuda hasta el 100 %. Ver
`DISEÑO_LOTES.md`.

---

## 2. (DOCUMENTADO, no corregido este ciclo) "Líder de Conteo" ve el botón Consolidar pero recibe "sin permiso"
**Severidad:** Media — UX confusa para el rol Líder de Conteo.

- El frontend llama `dash_consolidarAuditoria` → `consolidarConAuditoria` →
  `_requiereRol(["Coordinador"])`. Solo Coordinador pasa.
- Pero `_permisosDeRol` da `consolidar:true` a **"Líder de Conteo"** (FIX 8.32),
  así que el frontend le muestra el botón.
- El wrapper correcto `dash_consolidarAuditoriaWeb` (que sí admite Líder de
  Conteo) **no lo llama nadie**.

**Resultado:** un Líder de Conteo ve "Consolidar con auditoría", hace clic y
recibe "Tu rol (Líder de Conteo) no tiene permiso para esta acción."

**Decisión del operador:** NO corregir el gate legacy en este ciclo (riesgo de
tocar permisos en producción). Los wrappers nuevos de control de lotes
(`dash_continuarConsolidacion`, `dash_cancelarConsolidacion`) **sí** admiten
`["Coordinador","Líder de Conteo"]`, coherente con `_permisosDeRol`.

**Corrección sugerida (futura, 1 línea):** en `dash_consolidarAuditoria` cambiar
la llamada para enrutar por `dash_consolidarAuditoriaWeb`, **o** ampliar el gate
de `consolidarConAuditoria` a `["Coordinador","Líder de Conteo"]`. Validar antes
con el operador por ser cambio de permisos en producción.

---

## 3. (DOCUMENTADO, fuera de alcance) Conector ERP es un stub
**Severidad:** Baja — funcionalidad no usada actualmente.

`obtenerTokenItsanet()` se invoca en `ejecutarCreacionArchivo` pero **no está
definido** (igual `extraerDatosInventario(token)`). El flujo de creación desde
ERP está incompleto. Documentado en el ROADMAP (FASE 4); sin implementación en
este ciclo.
