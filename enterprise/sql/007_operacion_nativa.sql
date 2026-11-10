-- Aditivo. Solo en la base exclusiva de Centro de Mando.
-- Ningún inventario trasladado adquiere por esto permisos de escritura.
CREATE TABLE IF NOT EXISTS ims_nat_ambito (
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 sede VARCHAR(50) NOT NULL,
 rol VARCHAR(20) NOT NULL,
 PRIMARY KEY(actor_id,sede),
 FOREIGN KEY(actor_id) REFERENCES ims_op_actor(id),
 CHECK(sede IN ('UIO','GYE')),
 CHECK(rol IN ('ADMIN','SUPERVISOR'))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ims_nat_inventario (
 inventario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 creador_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 version BIGINT UNSIGNED NOT NULL DEFAULT 0,
 borrador BOOLEAN NOT NULL DEFAULT TRUE,
 fecha_inicio DATE NOT NULL,
 fecha_entrega DATE NULL,
 mostrar_depot BOOLEAN NOT NULL DEFAULT FALSE,
 fecha_programada DATE NULL,
 responsable VARCHAR(255) NOT NULL DEFAULT '',
 creado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(inventario_id) REFERENCES ims_op_inventario(id),
 FOREIGN KEY(creador_id) REFERENCES ims_op_actor(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS ims_nat_perfil (
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 inventario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 cliente_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 rol VARCHAR(20) NOT NULL,
 PRIMARY KEY(actor_id,inventario_id,cliente_id),
 FOREIGN KEY(actor_id,inventario_id,cliente_id) REFERENCES ims_op_permiso(actor_id,inventario_id,cliente_id),
 FOREIGN KEY(inventario_id) REFERENCES ims_nat_inventario(inventario_id),
 CHECK(rol IN ('SUPERVISOR','OPERADOR','AUDITOR','LECTOR'))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ims_nat_linea (
 linea_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 inventario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 numero INT UNSIGNED NOT NULL,
 depot DECIMAL(30,9) NOT NULL,
 ajuste DECIMAL(30,9) NULL,
 motivo VARCHAR(255) NOT NULL DEFAULT '',
 justificacion TEXT NOT NULL,
 abc VARCHAR(50) NOT NULL DEFAULT '',
 despacho VARCHAR(255) NOT NULL DEFAULT '',
 partida VARCHAR(255) NOT NULL DEFAULT '',
 categoria VARCHAR(255) NOT NULL DEFAULT '',
 estado_mercancia VARCHAR(255) NOT NULL DEFAULT '',
 UNIQUE KEY uq_ims_nat_numero(inventario_id,numero),
 FOREIGN KEY(linea_id,inventario_id) REFERENCES ims_op_linea(id,inventario_id),
 FOREIGN KEY(inventario_id) REFERENCES ims_nat_inventario(inventario_id),
 CHECK(depot>=0 AND numero>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS ims_nat_evento (
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 operacion_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 tipo VARCHAR(30) NOT NULL,
 inventario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 payload_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 resultado LONGTEXT NOT NULL,
 antes LONGTEXT NOT NULL,
 despues LONGTEXT NOT NULL,
 creado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(actor_id,operacion_id),
 FOREIGN KEY(actor_id) REFERENCES ims_op_actor(id),
 FOREIGN KEY(inventario_id) REFERENCES ims_nat_inventario(inventario_id),
 CHECK(JSON_VALID(resultado) AND JSON_VALID(antes) AND JSON_VALID(despues))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
