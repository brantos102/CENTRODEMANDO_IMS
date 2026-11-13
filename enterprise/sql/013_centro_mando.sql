-- Centro de Mando: ampliación exclusiva y aditiva. No modifica existencias.
CREATE TABLE IF NOT EXISTS ims_cm_perfil (
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 rol VARCHAR(30) NOT NULL, rol_wms VARCHAR(20) NOT NULL DEFAULT 'AUDITOR', telefono VARCHAR(80) NOT NULL DEFAULT '',
 cambiar_clave BOOLEAN NOT NULL DEFAULT FALSE, activacion_pendiente BOOLEAN NOT NULL DEFAULT FALSE, ultimo_acceso DATETIME(6) NULL,
 version BIGINT UNSIGNED NOT NULL DEFAULT 0,
 FOREIGN KEY(actor_id) REFERENCES ims_op_actor(id),
 CHECK(rol IN ('ADMIN','COORDINADOR','LIDER','OPERARIO','AUDITOR'))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ims_cm_evento (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 sede VARCHAR(50) NOT NULL, cliente VARCHAR(255) NOT NULL, titulo VARCHAR(500) NOT NULL,
 categoria VARCHAR(255) NOT NULL DEFAULT '', frecuencia VARCHAR(100) NOT NULL DEFAULT '',
 prioridad VARCHAR(30) NOT NULL DEFAULT 'Media', observacion TEXT NOT NULL,
 fecha_inicio DATE NOT NULL, fecha_fin DATE NULL, duracion INT UNSIGNED NOT NULL DEFAULT 1,
 estado VARCHAR(30) NOT NULL DEFAULT 'Pendiente', avance DECIMAL(6,3) NOT NULL DEFAULT 0,
 responsable_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 responsable_nombre VARCHAR(255) NOT NULL DEFAULT '', archivo_drive VARCHAR(120) NOT NULL DEFAULT '',
 origen VARCHAR(255) NOT NULL, origen_fila INT UNSIGNED NULL,
 eliminado BOOLEAN NOT NULL DEFAULT FALSE, version BIGINT UNSIGNED NOT NULL DEFAULT 0,
 creado_por CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 FOREIGN KEY(responsable_id) REFERENCES ims_op_actor(id), FOREIGN KEY(creado_por) REFERENCES ims_op_actor(id),
 KEY ix_cm_evento_fecha(sede,fecha_inicio,eliminado), KEY ix_cm_evento_cliente(cliente),
 CHECK(sede IN ('UIO','GYE')), CHECK(duracion BETWEEN 1 AND 3660), CHECK(avance BETWEEN 0 AND 100),
 CHECK(estado IN ('Pendiente','En curso','Pausado','Entregado'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS ims_cm_equipo (
 evento_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 papel VARCHAR(20) NOT NULL, estado VARCHAR(25) NOT NULL DEFAULT 'ACTIVO',
 PRIMARY KEY(evento_id,actor_id), FOREIGN KEY(evento_id) REFERENCES ims_cm_evento(id),
 FOREIGN KEY(actor_id) REFERENCES ims_op_actor(id), CHECK(papel IN ('RESPONSABLE','APOYO')),
 CHECK(estado IN ('ACTIVO','FINALIZADO','EXCLUIDO','EVENTO_ELIMINADO'))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ims_cm_vinculo (
 evento_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 inventario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY(evento_id,inventario_id), FOREIGN KEY(evento_id) REFERENCES ims_cm_evento(id),
 FOREIGN KEY(inventario_id) REFERENCES ims_op_inventario(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ims_cm_carpeta (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 padre_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 sede VARCHAR(50) NOT NULL, nombre VARCHAR(255) NOT NULL,
 FOREIGN KEY(padre_id) REFERENCES ims_cm_carpeta(id), CHECK(sede IN ('UIO','GYE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS ims_cm_documento (
 inventario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 carpeta_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 FOREIGN KEY(inventario_id) REFERENCES ims_op_inventario(id), FOREIGN KEY(carpeta_id) REFERENCES ims_cm_carpeta(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ims_cm_panel (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 archivo_drive VARCHAR(120) NOT NULL, cliente VARCHAR(255) NOT NULL, sede VARCHAR(50) NOT NULL,
 fecha_inicio DATE NULL, fecha_fin DATE NULL, estado VARCHAR(255) NOT NULL,
 responsable VARCHAR(255) NOT NULL DEFAULT '', unidades DECIMAL(30,9) NULL,
 referencias BIGINT UNSIGNED NULL, posiciones BIGINT UNSIGNED NULL,
 datos LONGTEXT NOT NULL, origen VARCHAR(255) NOT NULL, origen_fila INT UNSIGNED NOT NULL,
 KEY ix_cm_panel_drive(archivo_drive), CHECK(JSON_VALID(datos)), CHECK(sede IN ('UIO','GYE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS ims_cm_codigo (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, sede VARCHAR(50) NOT NULL,
 cliente VARCHAR(255) NOT NULL, sku VARCHAR(255) NOT NULL, abc VARCHAR(50) NOT NULL DEFAULT '',
 meses LONGTEXT NOT NULL, origen VARCHAR(255) NOT NULL,
 UNIQUE KEY uq_cm_codigo(sede,cliente,sku), CHECK(JSON_VALID(meses)), CHECK(sede IN ('UIO','GYE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS ims_cm_fuente (
 clave VARCHAR(255) PRIMARY KEY, sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 metadatos LONGTEXT NOT NULL, filas INT UNSIGNED NOT NULL, importado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CHECK(JSON_VALID(metadatos))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS ims_cm_legado (
 fuente VARCHAR(255) NOT NULL, fila INT UNSIGNED NOT NULL, clase VARCHAR(100) NOT NULL,
 contenido LONGTEXT NOT NULL, PRIMARY KEY(fuente,fila), FOREIGN KEY(fuente) REFERENCES ims_cm_fuente(clave),
 CHECK(JSON_VALID(contenido))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS ims_cm_auditoria (
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 operacion_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, tipo VARCHAR(60) NOT NULL,
 hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 resultado LONGTEXT NOT NULL, antes LONGTEXT NOT NULL, despues LONGTEXT NOT NULL,
 creado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(actor_id,operacion_id), FOREIGN KEY(actor_id) REFERENCES ims_op_actor(id),
 CHECK(JSON_VALID(resultado) AND JSON_VALID(antes) AND JSON_VALID(despues))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS ims_cm_trabajo (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 tipo VARCHAR(30) NOT NULL, estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
 parametros LONGTEXT NOT NULL, resultado LONGTEXT NOT NULL, progreso INT UNSIGNED NOT NULL DEFAULT 0,
 creado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), actualizado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(actor_id) REFERENCES ims_op_actor(id), CHECK(JSON_VALID(parametros) AND JSON_VALID(resultado)),
 CHECK(estado IN ('PENDIENTE','EJECUTANDO','COMPLETO','ERROR','CANCELADO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS ims_cm_publicacion (
 inventario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 firma CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, resultado LONGTEXT NOT NULL,
 publicado_por CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 publicado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(inventario_id) REFERENCES ims_op_inventario(id), FOREIGN KEY(publicado_por) REFERENCES ims_op_actor(id),
 CHECK(JSON_VALID(resultado))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ims_cm_acceso (
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, sede VARCHAR(50) NOT NULL,
 PRIMARY KEY(actor_id,sede), FOREIGN KEY(actor_id) REFERENCES ims_cm_perfil(actor_id), CHECK(sede IN ('UIO','GYE'))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ims_cm_linea_historica (
 linea_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 depot DECIMAL(30,9) NULL, ajuste DECIMAL(30,9) NULL,
 fecha_inicio DATE NULL, fecha_fin DATE NULL, datos LONGTEXT NOT NULL,
 FOREIGN KEY(linea_id) REFERENCES ims_op_linea(id), CHECK(JSON_VALID(datos))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ims_cm_archivo_legado (
 archivo_drive VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 hoja VARCHAR(100) NOT NULL, fila INT UNSIGNED NOT NULL, contenido LONGTEXT NOT NULL,
 serie VARCHAR(255) NULL, KEY ix_cm_serie_legado(archivo_drive,serie),
 PRIMARY KEY(archivo_drive,hoja,fila), CHECK(JSON_VALID(contenido))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS ims_cm_conector (
 tipo VARCHAR(30) PRIMARY KEY, cifrado LONGTEXT NOT NULL,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 actualizado_en TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(actor_id) REFERENCES ims_op_actor(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ims_cm_archivo (
 trabajo_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 parte INT UNSIGNED NOT NULL, contenido MEDIUMBLOB NOT NULL,
 PRIMARY KEY(trabajo_id,parte), FOREIGN KEY(trabajo_id) REFERENCES ims_cm_trabajo(id)
) ENGINE=InnoDB;
