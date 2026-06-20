# FIX FASE 8.33 — Consolidación por lotes (diseño)

## Problema
`consolidarConAuditoria` no procesaba el 100 % del PANEL con 250+ archivos
"Entregado". Causa raíz (confirmada leyendo el código):

1. No había dedup global de filas para INVENTARIOS — solo intra-archivo
   (`hashesArchivo`, reiniciado por archivo). Todo se acumulaba en
   `todosLosDatos` de **una sola** corrida.
2. Al final se hacía `INVENTARIOS!A2:…clearContent()` y se reescribía **solo**
   lo acumulado en esa corrida.
3. El chequeo de tiempo (FIX 8.30) solo hacía `return` del `forEach`, pero igual
   limpiaba y escribía el set parcial. **Re-ejecutar reiniciaba desde el
   archivo 1** (mismo orden del PANEL) → volvía a hacer timeout en el mismo
   punto → los últimos archivos **nunca** se alcanzaban.

## Solución (checkpoint por archivo + append + trigger encadenado)

### Punto de entrada
- `consolidarConAuditoria(opciones)` conserva su firma y su gate de rol
  (`_requiereRol(["Coordinador"])`) y delega en `_consolidarNucleo(opciones)`.
- El núcleo está separado del gate para que el **trigger de continuación**
  (`_continuarConsolidacion`) — que corre sin contexto de usuario — pueda
  reanudar sin pasar por `_requiereRol`.

### Estado persistente
- **Hoja oculta `__CACHE_CONSOLIDACION`**: snapshot inmutable de la lista de
  archivos capturada al INICIO de la corrida, en el orden del PANEL. Columnas
  `[idx, cliente, fileId, estado, timestamp]`. Hace la corrida **inmune a
  ediciones del PANEL** a mitad de cadena. Los ~250 IDs no caben en una
  propiedad de 9 KB, por eso van en la hoja.
- **`ScriptProperties`** (control ligero): `CONSOL_RUN_TOKEN`, `CONSOL_STATUS`
  (`IDLE|EN_CURSO|COMPLETADO|CANCELADO|ERROR`), `CONSOL_NEXT_IDX`, `CONSOL_TOTAL`,
  `CONSOL_PROCESADOS`, `CONSOL_MODO`, `CONSOL_INCLUIR`, `CONSOL_CTX`, `CONSOL_TS`
  (heartbeat), `CONSOL_STALLS` y `CONSOL_ACC` (JSON con los acumuladores del
  mensaje final: filas, cant, criticos, dups, erroresDet, excAud, leidas,
  regIncl, regDup, regVacias, reparados, maxColsReg).

### Lote y append
- **Fresco** (`reiniciar`): crea `RUN_TOKEN`, limpia **una sola vez**
  INVENTARIOS/REGISTRO (fila 2+) y las hojas de auditoría, construye snapshot,
  `NEXT_IDX=0`, `ACC=0`.
- **Continuación**: NO limpia; arranca en `CONSOL_NEXT_IDX` y **apenda** filas en
  `inv.getLastRow()+1` (y REGISTRO). Auditorías se apilan por lote; la fila
  TOTAL solo se escribe al COMPLETAR (con los grandes totales de `ACC`).
- **Garantía de dedup (Opción A)**: cada archivo se procesa una sola vez por
  corrida (checkpoint). INVENTARIOS append-only → **no se introduce** dedup de
  fila entre archivos → totales idénticos a una pasada única de hoy. El
  `hashesArchivo` intra-archivo se mantiene byte a byte.

### Trigger de continuación (one-time)
- Al exceder `LIMITE_MS` con pendientes: `_consolEstadoCheckpoint(nextIdx)` +
  `ScriptApp.newTrigger("_continuarConsolidacion").timeBased().after(90*1000).create()`,
  y se sale limpio devolviendo un mensaje de progreso.
- `_continuarConsolidacion` se **auto-borra** (patrón one-time ya usado en el
  repo), valida `CONSOL_STATUS===EN_CURSO` (si no, se autodestruye), reanuda en
  modo continuación y, como salvaguarda, reprograma si quedó trabajo y nadie
  agendó el siguiente lote. Protección anti-estancamiento: tras 4 lotes sin
  avance marca `ERROR` y detiene la cadena.
- `LIMITE_MS`: 5 min por lote de trigger (seguro bajo el límite duro), 5 min web
  fresco, 25 min editor fresco. La cadena `.after(90s)` cubre cualquier volumen.

### Modos
- **tolerante / reporte_solo** → por lotes (encadenan). `reporte_solo` nunca
  escribe INVENTARIOS/REGISTRO ni muta `ARCHIVOS_INACCESIBLES`/`AUDITORIA_
  CONSOLIDACION` (dry-run, igual que antes); sí escribe `ERRORES_VALIDACION_
  DETALLE` y `AUDITORIA_REGISTRO`.
- **estricto** → pasada única (no apila). Si no alcanza en una ejecución, **no
  escribe nada** y pide usar tolerante o `consolidarTodoDesdeEditor()` (más
  seguro que el parcial anterior). Si hay críticos > 0, bloquea como siempre.

### Concurrencia / seguridad
- `LockService.getScriptLock()` por ejecución (sin cambios).
- Guard por `CONSOL_STATUS` + heartbeat: un arranque manual con una corrida
  **viva** se bloquea; con una corrida **muerta** (sin latido > 12 min) arranca
  fresco (el fresco limpia, así que no duplica). El trigger siempre reanuda.

### Estado visible + controles
- `obtenerEstadoIntegralDashboard` añade `consolidacion:{enCurso, status,
  procesados, total, modo}` (lee ScriptProperties; costo casi nulo).
- Frontend: banner flotante con barra de progreso + botones **Reanudar**
  (`dash_continuarConsolidacion`) y **Cancelar** (`dash_cancelarConsolidacion`).
- `dash_estadoConsolidacion()` para polling ligero opcional.

## Casos límite
| Caso | Comportamiento |
|------|----------------|
| Timeout a mitad | Trigger continúa; nada se pierde ni duplica. |
| Archivo corrupto / sin acceso | Barrera 8.30 lo salta y lo marca ERROR/inaccesible; el checkpoint lo da por procesado. |
| Re-ejecución manual sobre corrida viva | Bloqueada por `EN_CURSO` + heartbeat. |
| Cancelar | Triggers borrados; INVENTARIOS conserva lo consolidado hasta ese punto. |
| Cadena muerta + clic manual | Arranque fresco (limpia y reprocesa el 100 %, sin duplicar). |
| Cadena estancada | `Reanudar` manual, o auto-reintento; tras 4 sin avance → `ERROR`. |
| PANEL editado a mitad | Snapshot inmutable protege la corrida. |

## Compatibilidad
Firma y forma de retorno de `consolidarConAuditoria` preservadas. Una corrida que
cabe en el presupuesto se comporta como hoy (procesa todo, COMPLETADO, sin
trigger). No se tocan: nombres de hojas, encabezados de INVENTARIOS, formato
`dd/MM/yyyy` texto (`setNumberFormat("@")`), espejo a MATRIZ_INVENTARIOS_UIO
(sigue desactivado), ni se añade `ANYONE_WITH_LINK`.

## Archivos tocados
- `Cronograma_Recordatorios.gs`: `consolidarConAuditoria` → wrapper +
  `_consolidarNucleo`; helpers de estado/snapshot/trigger; `_continuarConsolidacion`;
  `dash_estadoConsolidacion` / `dash_continuarConsolidacion` /
  `dash_cancelarConsolidacion`; bloque `consolidacion` en
  `obtenerEstadoIntegralDashboard`.
- `WebApp_JS.html`: `pintarConsolidacion()` (banner) + manejo de respuesta de
  progreso en el handler de `dash_consolidarAuditoria`.
