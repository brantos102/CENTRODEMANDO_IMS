-- Aditivo, exclusivamente en centromando_ims_ensayo. No modifica el histórico.
CREATE TABLE IF NOT EXISTS ims_erp_inventario (
 inventario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 operacion_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 consulta_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 payload_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 contenido_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 consulta_en DATETIME(3) NOT NULL,
 filas INT UNSIGNED NOT NULL,
 unidades DECIMAL(40,9) NOT NULL,
 seleccion LONGTEXT NOT NULL,
 cuentas LONGTEXT NOT NULL,
 creado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_ims_erp_operacion(actor_id,operacion_id),
 UNIQUE KEY uq_ims_erp_consulta(actor_id,consulta_id),
 FOREIGN KEY(inventario_id) REFERENCES ims_nat_inventario(inventario_id),
 FOREIGN KEY(actor_id,operacion_id) REFERENCES ims_nat_evento(actor_id,operacion_id),
 CHECK(JSON_VALID(seleccion) AND JSON_VALID(cuentas)),
 CHECK(filas>0 AND filas<=100000 AND unidades>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS ims_erp_linea (
 linea_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 inventario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 referencia CHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 etiqueta VARCHAR(255) NOT NULL,
 codigo_cliente_erp VARCHAR(255) NOT NULL,
 cliente_nombre VARCHAR(255) NOT NULL,
 FOREIGN KEY(linea_id,inventario_id) REFERENCES ims_op_linea(id,inventario_id),
 FOREIGN KEY(inventario_id) REFERENCES ims_erp_inventario(inventario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
