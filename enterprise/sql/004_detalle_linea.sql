-- Campos originales de la planilla para distinguir líneas de un mismo SKU.
-- No agrega columnas al Google Sheets ni cambia el contrato Power BI.
CREATE TABLE IF NOT EXISTS ims_op_detalle_linea (
  linea_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  posicion VARCHAR(255) NULL,
  descripcion TEXT NULL,
  serie VARCHAR(255) NULL,
  lote VARCHAR(255) NULL,
  unidad VARCHAR(50) NULL,
  FOREIGN KEY (linea_id) REFERENCES ims_op_linea(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
