-- Copia de preparación aislada. Estas tablas no activan inventarios operativos.
CREATE TABLE IF NOT EXISTS ims_abiertos_copia (
  copia_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  corte_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  estado VARCHAR(20) NOT NULL,
  activa TINYINT UNSIGNED NOT NULL DEFAULT 0,
  productos INT UNSIGNED NOT NULL,
  auxiliares INT UNSIGNED NOT NULL,
  preparacion LONGTEXT NOT NULL,
  esquemas LONGTEXT NOT NULL,
  creado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (copia_id),
  CONSTRAINT ck_ims_ab_copia_estado CHECK (estado IN ('CARGANDO','VERIFICADO')),
  CONSTRAINT ck_ims_ab_copia_inactiva CHECK (activa=0),
  CONSTRAINT ck_ims_ab_copia_json CHECK (JSON_VALID(preparacion) AND JSON_VALID(esquemas))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS ims_abiertos_copia_fila (
  copia_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  tipo_registro VARCHAR(16) NOT NULL,
  numero_fila INT UNSIGNED NOT NULL,
  referencia_copia CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  ambito VARCHAR(40) NOT NULL,
  contenido_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  contenido LONGTEXT NOT NULL,
  PRIMARY KEY (copia_id,tipo_registro,numero_fila),
  UNIQUE KEY uq_ims_ab_copia_ref (copia_id,referencia_copia),
  CONSTRAINT fk_ims_ab_fila_copia FOREIGN KEY (copia_id) REFERENCES ims_abiertos_copia(copia_id),
  CONSTRAINT ck_ims_ab_fila_tipo CHECK (tipo_registro IN ('PRODUCTO','AUXILIAR')),
  CONSTRAINT ck_ims_ab_fila_numero CHECK (numero_fila>0),
  CONSTRAINT ck_ims_ab_fila_ambito CHECK (ambito IN ('SELECCION_ACTUAL','FUERA_SELECCION_CONSERVADO')),
  CONSTRAINT ck_ims_ab_fila_json CHECK (JSON_VALID(contenido))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
