-- Solo el administrador del esquema propio instala estos triggers.
-- USER() identifica la cuenta de conexión; CURRENT_USER() aquí sería el DEFINER.
-- La cuenta de migración puede seguir importando/verificando otros cortes.
DELIMITER $$
CREATE TRIGGER ims_nat_guard_inv BEFORE UPDATE ON ims_op_inventario FOR EACH ROW
BEGIN
 IF SUBSTRING_INDEX(USER(),'@',1)='ims_cm_operacion' AND NOT EXISTS(SELECT 1 FROM ims_nat_inventario WHERE inventario_id=OLD.id) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Historico protegido';
 END IF;
END$$
CREATE TRIGGER ims_nat_guard_adopcion BEFORE INSERT ON ims_nat_inventario FOR EACH ROW
BEGIN
 IF EXISTS(SELECT 1 FROM ims_mig_conteo_aporte WHERE inventario_id=NEW.inventario_id) OR EXISTS(SELECT 1 FROM ims_op_linea WHERE inventario_id=NEW.inventario_id) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='No adoptar historico como nativo';
 END IF;
END$$
CREATE TRIGGER ims_nat_guard_linea_insert BEFORE INSERT ON ims_op_linea FOR EACH ROW
BEGIN
 IF SUBSTRING_INDEX(USER(),'@',1)='ims_cm_operacion' AND NOT EXISTS(SELECT 1 FROM ims_nat_inventario WHERE inventario_id=NEW.inventario_id AND borrador=1) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Stock protegido';
 END IF;
END$$
CREATE TRIGGER ims_nat_guard_linea_update BEFORE UPDATE ON ims_op_linea FOR EACH ROW
BEGIN
 IF SUBSTRING_INDEX(USER(),'@',1)='ims_cm_operacion' THEN
  IF NOT EXISTS(SELECT 1 FROM ims_nat_inventario WHERE inventario_id=OLD.inventario_id) THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Historico protegido';
  END IF;
  IF (OLD.conteo_1 IS NOT NULL AND NOT(OLD.conteo_1 <=> NEW.conteo_1)) OR
     (OLD.conteo_2 IS NOT NULL AND NOT(OLD.conteo_2 <=> NEW.conteo_2)) OR
     (OLD.conteo_final IS NOT NULL AND NOT(OLD.conteo_final <=> NEW.conteo_final)) THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Conteo registrado protegido';
  END IF;
  IF NOT(OLD.conteo_1 <=> NEW.conteo_1) OR NOT(OLD.conteo_2 <=> NEW.conteo_2) OR NOT(OLD.conteo_final <=> NEW.conteo_final) THEN
   IF NOT EXISTS(SELECT 1 FROM ims_op_inventario i JOIN ims_nat_inventario n ON n.inventario_id=i.id WHERE i.id=OLD.inventario_id AND i.estado='EN_PROCESO' AND n.borrador=0) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventario cerrado';
   END IF;
  END IF;
 END IF;
END$$
CREATE TRIGGER ims_nat_guard_permiso_insert BEFORE INSERT ON ims_op_permiso FOR EACH ROW
BEGIN
 IF SUBSTRING_INDEX(USER(),'@',1)='ims_cm_operacion' AND NOT EXISTS(SELECT 1 FROM ims_nat_inventario WHERE inventario_id=NEW.inventario_id) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Permiso historico protegido';
 END IF;
END$$
CREATE TRIGGER ims_nat_guard_permiso_update BEFORE UPDATE ON ims_op_permiso FOR EACH ROW
BEGIN
 IF SUBSTRING_INDEX(USER(),'@',1)='ims_cm_operacion' AND NOT EXISTS(SELECT 1 FROM ims_nat_inventario WHERE inventario_id=OLD.inventario_id) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Permiso historico protegido';
 END IF;
END$$
CREATE TRIGGER ims_nat_guard_permiso_delete BEFORE DELETE ON ims_op_permiso FOR EACH ROW
BEGIN
 IF SUBSTRING_INDEX(USER(),'@',1)='ims_cm_operacion' AND NOT EXISTS(SELECT 1 FROM ims_nat_inventario WHERE inventario_id=OLD.inventario_id) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Permiso historico protegido';
 END IF;
END$$
CREATE TRIGGER ims_nat_guard_control BEFORE UPDATE ON ims_nat_inventario FOR EACH ROW
BEGIN
 IF OLD.borrador=0 AND NEW.borrador=1 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Stock activado protegido';
 END IF;
END$$
CREATE TRIGGER ims_nat_guard_ajuste BEFORE UPDATE ON ims_nat_linea FOR EACH ROW
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ims_op_inventario WHERE id=OLD.inventario_id AND estado IN ('EN_PROCESO','EN_VALIDACION')) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventario cerrado';
 END IF;
END$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER ims_nat_guard_cliente_insert BEFORE INSERT ON ims_op_inventario_cliente FOR EACH ROW
BEGIN
 IF SUBSTRING_INDEX(USER(),'@',1)='ims_cm_operacion' AND NOT EXISTS(SELECT 1 FROM ims_nat_inventario WHERE inventario_id=NEW.inventario_id) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Clientes historicos protegidos';
 END IF;
END$$
CREATE TRIGGER ims_nat_guard_detalle_insert BEFORE INSERT ON ims_op_detalle_linea FOR EACH ROW
BEGIN
 IF SUBSTRING_INDEX(USER(),'@',1)='ims_cm_operacion' AND NOT EXISTS(SELECT 1 FROM ims_op_linea l JOIN ims_nat_inventario n ON n.inventario_id=l.inventario_id WHERE l.id=NEW.linea_id AND n.borrador=1) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Detalle historico protegido';
 END IF;
END$$
DELIMITER ;
