-- Política operativa editable por administración, separada de existencias y capturas.
CREATE TABLE IF NOT EXISTS ims_cm_politica_ui (
 id TINYINT UNSIGNED PRIMARY KEY,
 version BIGINT UNSIGNED NOT NULL DEFAULT 0,
 datos LONGTEXT NOT NULL,
 actualizado_por CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 actualizado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CHECK(id=1), CHECK(JSON_VALID(datos)),
 FOREIGN KEY(actualizado_por) REFERENCES ims_op_actor(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
INSERT IGNORE INTO ims_cm_politica_ui(id,datos) VALUES (1,'{}');
