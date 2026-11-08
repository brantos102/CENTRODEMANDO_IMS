-- Libro de aportes para conteos lógicos con un mismo archivo físico.
-- Aditivo: no modifica ni elimina el registro de migraciones anteriores.
CREATE TABLE IF NOT EXISTS ims_mig_conteo_aporte (
  inventario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  origen_drive VARCHAR(256) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  codigo_operativo VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  plan_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  snapshot_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  filas INT UNSIGNED NOT NULL,
  UNIQUE KEY uq_ims_mig_conteo_origen (origen_drive,codigo_operativo),
  FOREIGN KEY (inventario_id) REFERENCES ims_op_inventario(id),
  FOREIGN KEY (plan_id) REFERENCES ims_mig_plan(plan_id),
  FOREIGN KEY (snapshot_id) REFERENCES ims_snapshot(snapshot_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
