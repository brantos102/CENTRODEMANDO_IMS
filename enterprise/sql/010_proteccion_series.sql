-- Nuevos triggers; no reemplaza los once ya instalados.
DELIMITER $$
CREATE TRIGGER ims_nat_guard_hallazgo BEFORE INSERT ON ims_nat_hallazgo FOR EACH ROW
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ims_nat_inventario n JOIN ims_op_inventario i ON i.id=n.inventario_id JOIN ims_nat_evento e ON e.inventario_id=i.id
  WHERE i.id=NEW.inventario_id AND n.borrador=0 AND i.estado='EN_PROCESO' AND e.actor_id=NEW.actor_id AND e.operacion_id=NEW.operacion_id AND e.tipo IN ('serie','hallazgo')) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Hallazgo fuera de inventario abierto u operacion';
 END IF;
 IF NEW.serie IS NOT NULL AND EXISTS(SELECT 1 FROM ims_op_linea l JOIN ims_op_detalle_linea d ON d.linea_id=l.id
  WHERE l.inventario_id=NEW.inventario_id AND l.cliente_id=NEW.cliente_id AND UPPER(TRIM(d.serie)) COLLATE utf8mb4_0900_bin=NEW.serie) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='La serie existe en stock';
 END IF;
END$$
CREATE TRIGGER ims_nat_guard_serie BEFORE INSERT ON ims_nat_serie FOR EACH ROW
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ims_nat_inventario n JOIN ims_op_inventario i ON i.id=n.inventario_id JOIN ims_nat_evento e ON e.inventario_id=i.id
  WHERE i.id=NEW.inventario_id AND n.borrador=0 AND i.estado='EN_PROCESO' AND e.actor_id=NEW.actor_id AND e.operacion_id=NEW.operacion_id AND e.tipo='serie') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Serie fuera de inventario abierto u operacion';
 END IF;
 IF NEW.linea_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ims_op_linea l JOIN ims_op_detalle_linea d ON d.linea_id=l.id
  WHERE l.id=NEW.linea_id AND l.inventario_id=NEW.inventario_id AND l.cliente_id=NEW.cliente_id AND UPPER(TRIM(d.serie)) COLLATE utf8mb4_0900_bin=NEW.serie) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='La serie no corresponde a la linea y cliente';
 END IF;
 IF NEW.hallazgo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ims_nat_hallazgo h WHERE h.id=NEW.hallazgo_id AND h.inventario_id=NEW.inventario_id
  AND h.cliente_id=NEW.cliente_id AND h.serie=NEW.serie AND h.actor_id=NEW.actor_id AND h.operacion_id=NEW.operacion_id) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='La serie no corresponde al hallazgo';
 END IF;
END$$
DELIMITER ;
