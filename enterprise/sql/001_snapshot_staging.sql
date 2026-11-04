-- MySQL 8.0: área aislada de copia y conciliación. No activa la aplicación.
-- El importador exige una base exclusiva centromando_ims o centromando_ims_*.
-- No crea bases, usuarios, permisos ni modifica configuraciones globales.
CREATE TABLE IF NOT EXISTS ims_snapshot (
  snapshot_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  archivo VARCHAR(255) NOT NULL,
  estado VARCHAR(20) NOT NULL,
  manifiesto LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  creado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (snapshot_id),
  CONSTRAINT ck_ims_snapshot_json CHECK (JSON_VALID(manifiesto)),
  CONSTRAINT ck_ims_snapshot_estado CHECK (estado IN ('IMPORTANDO', 'VERIFICADO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS ims_snapshot_hoja (
  snapshot_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  hoja VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  archivo_jsonl VARCHAR(100) NOT NULL,
  sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  filas BIGINT UNSIGNED NOT NULL,
  metadatos LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  PRIMARY KEY (snapshot_id, hoja),
  CONSTRAINT fk_ims_hoja_snapshot FOREIGN KEY (snapshot_id) REFERENCES ims_snapshot(snapshot_id),
  CONSTRAINT ck_ims_hoja_json CHECK (JSON_VALID(metadatos))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS ims_snapshot_fila (
  snapshot_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  hoja VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  numero_fila INT UNSIGNED NOT NULL,
  origen_drive VARCHAR(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NULL,
  contenido LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  PRIMARY KEY (snapshot_id, hoja, numero_fila),
  KEY ix_ims_fila_origen (snapshot_id, hoja, origen_drive),
  CONSTRAINT fk_ims_fila_hoja FOREIGN KEY (snapshot_id, hoja) REFERENCES ims_snapshot_hoja(snapshot_id, hoja),
  CONSTRAINT ck_ims_fila_json CHECK (JSON_VALID(contenido)),
  CONSTRAINT ck_ims_fila_numero CHECK (numero_fila > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
