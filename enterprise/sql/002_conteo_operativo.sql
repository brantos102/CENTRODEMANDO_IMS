-- Núcleo candidato de conteo. Ejecutar únicamente en la base exclusiva de ensayo.
-- No migra datos, no publica KPI y no cambia ninguna salida Power BI.
CREATE TABLE IF NOT EXISTS ims_op_actor (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  activo BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ims_op_cliente (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS ims_op_inventario (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  sede VARCHAR(50) NOT NULL,
  codigo_operativo VARCHAR(255) NOT NULL,
  estado VARCHAR(30) NOT NULL,
  CONSTRAINT ck_ims_op_estado CHECK (estado IN ('EN_PROCESO','EN_VALIDACION','ENTREGADO','CANCELADO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS ims_op_inventario_cliente (
  inventario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  cliente_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (inventario_id,cliente_id),
  FOREIGN KEY (inventario_id) REFERENCES ims_op_inventario(id),
  FOREIGN KEY (cliente_id) REFERENCES ims_op_cliente(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ims_op_permiso (
  actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  inventario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  cliente_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  puede_contar BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (actor_id,inventario_id,cliente_id),
  FOREIGN KEY (actor_id) REFERENCES ims_op_actor(id),
  FOREIGN KEY (inventario_id,cliente_id) REFERENCES ims_op_inventario_cliente(inventario_id,cliente_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ims_op_linea (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  inventario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  cliente_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  sku VARCHAR(255) NOT NULL,
  origen_drive VARCHAR(256) NULL,
  fila_origen INT UNSIGNED NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  conteo_1 DECIMAL(30,9) NULL,
  conteo_2 DECIMAL(30,9) NULL,
  conteo_final DECIMAL(30,9) NULL,
  observacion TEXT NOT NULL,
  nueva_posicion VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uq_ims_op_linea_inventario (id,inventario_id),
  KEY ix_ims_op_linea_cliente (inventario_id,cliente_id,id),
  FOREIGN KEY (inventario_id,cliente_id) REFERENCES ims_op_inventario_cliente(inventario_id,cliente_id),
  CONSTRAINT ck_ims_op_cantidades CHECK (
    (conteo_1 IS NULL OR conteo_1>=0) AND
    (conteo_2 IS NULL OR conteo_2>=0) AND
    (conteo_final IS NULL OR conteo_final>=0)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS ims_op_operacion (
  actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  operacion_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  inventario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  linea_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  resultado LONGTEXT NOT NULL,
  creado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (actor_id,operacion_id),
  FOREIGN KEY (actor_id) REFERENCES ims_op_actor(id),
  FOREIGN KEY (linea_id,inventario_id) REFERENCES ims_op_linea(id,inventario_id),
  CONSTRAINT ck_ims_op_resultado CHECK (JSON_VALID(resultado))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS ims_op_auditoria (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  operacion_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  antes LONGTEXT NOT NULL,
  despues LONGTEXT NOT NULL,
  creado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_ims_op_auditoria_operacion (actor_id,operacion_id),
  FOREIGN KEY (actor_id,operacion_id) REFERENCES ims_op_operacion(actor_id,operacion_id),
  CONSTRAINT ck_ims_op_antes CHECK (JSON_VALID(antes)),
  CONSTRAINT ck_ims_op_despues CHECK (JSON_VALID(despues))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
