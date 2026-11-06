-- Trazabilidad del traslado. No modifica permisos ni usuarios.
CREATE TABLE IF NOT EXISTS ims_mig_plan (
  plan_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  snapshot_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  manifiesto LONGTEXT NOT NULL,
  creado_en DATETIME(6) NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES ims_snapshot(snapshot_id),
  CONSTRAINT ck_ims_mig_plan_json CHECK (JSON_VALID(manifiesto))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS ims_mig_catalogo (
  plan_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  snapshot_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  hoja VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  fila_panel INT UNSIGNED NOT NULL,
  contenido LONGTEXT NOT NULL,
  PRIMARY KEY (plan_id,fila_panel),
  FOREIGN KEY (plan_id) REFERENCES ims_mig_plan(plan_id),
  FOREIGN KEY (snapshot_id,hoja,fila_panel) REFERENCES ims_snapshot_fila(snapshot_id,hoja,numero_fila),
  CONSTRAINT ck_ims_mig_catalogo_json CHECK (JSON_VALID(contenido))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS ims_mig_aporte (
  inventario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  origen_drive VARCHAR(256) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  plan_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  snapshot_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  filas INT UNSIGNED NOT NULL,
  UNIQUE KEY uq_ims_mig_origen (origen_drive),
  FOREIGN KEY (inventario_id) REFERENCES ims_op_inventario(id),
  FOREIGN KEY (plan_id) REFERENCES ims_mig_plan(plan_id),
  FOREIGN KEY (snapshot_id) REFERENCES ims_snapshot(snapshot_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ims_mig_linea (
  linea_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  snapshot_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  hoja VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  fila_consolidado INT UNSIGNED NOT NULL,
  contenido_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  FOREIGN KEY (linea_id) REFERENCES ims_op_linea(id),
  FOREIGN KEY (snapshot_id,hoja,fila_consolidado) REFERENCES ims_snapshot_fila(snapshot_id,hoja,numero_fila),
  UNIQUE KEY uq_ims_mig_fila (snapshot_id,hoja,fila_consolidado)
) ENGINE=InnoDB;
