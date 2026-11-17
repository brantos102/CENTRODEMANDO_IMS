-- Estructura física propia y cortes de ocupación: no toca las tablas de conteo.
CREATE TABLE IF NOT EXISTS ims_cm_layout (
 id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 sede VARCHAR(50) NOT NULL, almacen VARCHAR(255) NOT NULL,
 nombre VARCHAR(255) NOT NULL, datos LONGTEXT NOT NULL,
 sha256_pdf CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 creado_por CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(creado_por) REFERENCES ims_op_actor(id), CHECK(JSON_VALID(datos))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS ims_cm_layout_actual (
 sede VARCHAR(50) NOT NULL, almacen VARCHAR(255) NOT NULL,
 layout_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY(sede,almacen), FOREIGN KEY(layout_id) REFERENCES ims_cm_layout(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS ims_cm_ocupacion_corte (
 id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 sede VARCHAR(50) NOT NULL, filas INT UNSIGNED NOT NULL,
 creado_por CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 obtenido_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(creado_por) REFERENCES ims_op_actor(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ims_cm_ocupacion_fila (
 corte_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 numero INT UNSIGNED NOT NULL, posicion VARCHAR(255) NOT NULL,
 almacen VARCHAR(255) NOT NULL, bodega VARCHAR(255) NOT NULL,
 cliente_codigo VARCHAR(255) NOT NULL, estado VARCHAR(30) NOT NULL,
 bloqueada BOOLEAN NOT NULL, datos LONGTEXT NOT NULL,
 PRIMARY KEY(corte_id,numero), FOREIGN KEY(corte_id) REFERENCES ims_cm_ocupacion_corte(id),
 CHECK(JSON_VALID(datos)), KEY ix_cm_ocupacion_posicion(corte_id,almacen(120),bodega(80),posicion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS ims_cm_ocupacion_actual (
 sede VARCHAR(50) PRIMARY KEY,
 corte_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 actualizado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(corte_id) REFERENCES ims_cm_ocupacion_corte(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ims_cm_presencia (
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 inventario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 posicion VARCHAR(255) NOT NULL DEFAULT '', actualizado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(actor_id,inventario_id), FOREIGN KEY(actor_id) REFERENCES ims_op_actor(id),
 FOREIGN KEY(inventario_id) REFERENCES ims_op_inventario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS ims_cm_codigo_origen (
 id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 proyecto VARCHAR(255) NOT NULL, archivos INT UNSIGNED NOT NULL,
 cifrado LONGTEXT NOT NULL, actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 obtenido_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(actor_id) REFERENCES ims_op_actor(id), KEY ix_cm_codigo_proyecto(proyecto,obtenido_en)
) ENGINE=InnoDB;
