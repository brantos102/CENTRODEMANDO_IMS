-- ============================================================================
-- VISTAS DE CALIDAD — equivalentes a los tableros de Power BI
-- ----------------------------------------------------------------------------
-- Agregan en la base (no en el navegador ni en Railway): la API lee unas pocas
-- filas ya calculadas en vez de traerse las 125k de inventarios.
--
-- Ejecutar completo en Supabase → SQL Editor. Es re-ejecutable.
--
-- CRITERIO DE DISCREPANCIA: una línea es correcta cuando `desfase` es 0 o nulo.
-- Si en tu operación la regla es otra, cambia la condición `es_ok` de abajo y
-- vuelve a ejecutar: todas las vistas se recalculan solas.
-- ============================================================================

-- Base común: una fila por línea contada, ya normalizada.
create or replace view v_lineas as
select
  id,
  cliente,
  archivo_id,
  sku,
  posicion,
  motivo,
  justificacion,
  observacion,
  base,
  coalesce(fecha_inicio, fecha_final)                    as fecha,
  date_trunc('month', coalesce(fecha_inicio, fecha_final)) as mes,
  extract(year  from coalesce(fecha_inicio, fecha_final))::int as anio,
  extract(month from coalesce(fecha_inicio, fecha_final))::int as num_mes,
  coalesce(conteo_final, conteo_fisico, cantidad, 0)     as unidades,
  coalesce(desfase, 0)                                   as desfase,
  (coalesce(desfase, 0) = 0)                             as es_ok
from inventarios
where sku is not null;

-- 1) Exactitud mensual: códigos, unidades y ubicaciones (vs meta 99.5%).
create or replace view v_calidad_mensual as
select
  anio, num_mes, base,
  count(*)                                        as lineas,
  count(*) filter (where es_ok)                   as lineas_ok,
  count(distinct sku)                             as codigos,
  count(distinct sku) filter (where es_ok)        as codigos_ok,
  count(distinct posicion)                        as posiciones,
  count(distinct posicion) filter (where es_ok)   as posiciones_ok,
  sum(abs(unidades))                              as unidades,
  sum(abs(unidades)) filter (where es_ok)         as unidades_ok,
  sum(abs(desfase))                               as desfase_total
from v_lineas
where anio is not null
group by anio, num_mes, base
order by anio, num_mes;

-- 2) Matriz cliente × mes (la vista "Conteo Cíclico Detalle").
create or replace view v_calidad_cliente_mes as
select
  cliente, anio, num_mes, base,
  count(*)                                  as lineas,
  count(*) filter (where es_ok)             as lineas_ok,
  count(distinct sku)                       as codigos,
  count(distinct sku) filter (where es_ok)  as codigos_ok,
  sum(abs(unidades))                        as unidades,
  sum(abs(unidades)) filter (where es_ok)   as unidades_ok
from v_lineas
where anio is not null and cliente is not null
group by cliente, anio, num_mes, base
order by cliente, anio, num_mes;

-- 3) Acumulado por cliente (matriz de confiabilidad).
create or replace view v_calidad_cliente as
select
  cliente, base,
  count(*)                                  as lineas,
  count(*) filter (where es_ok)             as lineas_ok,
  count(distinct sku)                       as codigos,
  count(distinct sku) filter (where es_ok)  as codigos_ok,
  count(distinct posicion)                  as posiciones,
  sum(abs(unidades))                        as unidades,
  sum(abs(unidades)) filter (where es_ok)   as unidades_ok,
  count(*) filter (where not es_ok)         as discrepancias
from v_lineas
where cliente is not null
group by cliente, base
order by unidades desc;

-- 4) Causas de discrepancia (análisis histórico de motivos).
create or replace view v_motivos as
select
  coalesce(nullif(trim(motivo), ''), 'SIN MOTIVO') as motivo,
  base,
  count(*)          as incidencias,
  sum(abs(desfase)) as unidades_desfase
from v_lineas
where not es_ok
group by 1, base
order by incidencias desc;

-- 5) Estado de gestión (justificaciones).
create or replace view v_justificaciones as
select
  coalesce(nullif(trim(justificacion), ''), 'SIN JUSTIFICAR') as justificacion,
  base,
  count(*) as incidencias
from v_lineas
where not es_ok
group by 1, base
order by incidencias desc;

-- 6) Detalle de líneas con discrepancia (monitor de incidencias).
create or replace view v_discrepancias as
select
  anio, num_mes, archivo_id, cliente, sku, posicion,
  desfase,
  case when desfase < 0 then 'FALTANTE' else 'SOBRANTE' end as tipo,
  motivo, justificacion, observacion, base, fecha
from v_lineas
where not es_ok
order by fecha desc nulls last, abs(desfase) desc;

-- Índices que aceleran estas agregaciones.
create index if not exists idx_inv_fecha_inicio on inventarios(fecha_inicio);
create index if not exists idx_inv_desfase      on inventarios(desfase);
create index if not exists idx_inv_motivo       on inventarios(motivo);

-- Las vistas heredan el RLS de la tabla base; se dejan legibles igual que ella.
grant select on v_lineas, v_calidad_mensual, v_calidad_cliente_mes,
                v_calidad_cliente, v_motivos, v_justificaciones, v_discrepancias
  to anon, authenticated, service_role;
