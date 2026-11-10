// Equivalencias de grupos confirmadas por el usuario el 2026-11-10.
// Son nombres de negocio: NO autorizan códigos ERP, altas SQL ni importaciones.
export const GRUPOS_ERP_CONFIRMADOS=Object.freeze([
 ['GYE','ALU','ALU','GRUPO'],
 ['GYE','ALU SWAP','ALU','GRUPO'],
 ['GYE','ALULTE','ALU','GRUPO'],
 ['GYE','NOKIA5G','NOKIA','GRUPO'],
 ['GYE','NOKIACNT3G','NOKIA','GRUPO'],
 ['GYE','NOKIACNTLTE','NOKIA','GRUPO'],
 ['GYE','FOC 5G','FOC 5G','INDEPENDIENTE'],
 ['GYE','MOD 2024','MOD 2024','INDEPENDIENTE']
].map(([sede,etiqueta,cliente,tipo])=>Object.freeze({sede,etiqueta,cliente,tipo})));
