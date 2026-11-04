-- Candidata: autenticación local, sesiones opacas y límite de intentos.
-- Requiere SQL 002; no importa ni activa usuarios históricos automáticamente.
CREATE TABLE IF NOT EXISTS ims_auth_usuario (
  actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  correo VARCHAR(254) NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  UNIQUE KEY uq_ims_auth_correo (correo),
  FOREIGN KEY (actor_id) REFERENCES ims_op_actor(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS ims_auth_sesion (
  sesion_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  usuario_version BIGINT UNSIGNED NOT NULL,
  csrf_token CHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expira_en DATETIME(6) NOT NULL,
  revocada BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en DATETIME(6) NOT NULL,
  KEY ix_ims_auth_sesion_actor (actor_id,expira_en),
  KEY ix_ims_auth_sesion_expira (expira_en),
  FOREIGN KEY (actor_id) REFERENCES ims_auth_usuario(actor_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ims_auth_limite (
  clave CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  intentos INT UNSIGNED NOT NULL,
  vence_en DATETIME(6) NOT NULL,
  KEY ix_ims_auth_limite_expira (vence_en)
) ENGINE=InnoDB;
