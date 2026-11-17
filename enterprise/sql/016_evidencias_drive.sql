-- Evidencias privadas. Ampliación propia, sin modificar capturas ni existencias.
CREATE TABLE IF NOT EXISTS ims_cm_evidencia (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 inventario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 linea_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 carpeta_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 mime VARCHAR(30) NOT NULL, sha256 CHAR(64) NOT NULL, nota VARCHAR(2000) NOT NULL,
 contenido MEDIUMBLOB NOT NULL, creado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(actor_id) REFERENCES ims_op_actor(id), FOREIGN KEY(inventario_id) REFERENCES ims_op_inventario(id),
 FOREIGN KEY(linea_id) REFERENCES ims_op_linea(id), FOREIGN KEY(carpeta_id) REFERENCES ims_cm_carpeta(id),
 KEY ix_evidencia_linea(inventario_id,linea_id), CHECK(mime IN ('image/jpeg','image/png')),
 CHECK(OCTET_LENGTH(contenido) BETWEEN 32 AND 3145728)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS ims_cm_drive_objeto (
 cuenta VARCHAR(254) NOT NULL, clave VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 drive_id VARCHAR(200) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
 PRIMARY KEY(cuenta,clave), UNIQUE KEY uq_drive_objeto(cuenta,drive_id),
 CHECK(estado IN ('PENDIENTE','SUBIDO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
