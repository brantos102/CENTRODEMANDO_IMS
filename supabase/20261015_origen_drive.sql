-- Aditivo: ejecutar antes de sincronizar el consolidado con ORIGEN_DRIVE.
-- Conserva archivo_id (código operativo) y distingue archivos físicos como IBM.
-- No borra ni modifica filas existentes.
begin;
alter table public.inventarios add column if not exists origen_drive text;
alter table public.registro add column if not exists origen_drive text;
create index if not exists idx_inventarios_origen_drive on public.inventarios(origen_drive);
create index if not exists idx_registro_origen_drive on public.registro(origen_drive);
commit;
