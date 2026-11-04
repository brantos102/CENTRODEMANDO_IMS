/** Regla heredada verificada: el estado se obtiene de la base, no del navegador.
 * La existencia/preservación de un inventario es independiente de su publicación.
 */
export function estadoPermiteConsolidar(estado) {
  return String(estado ?? '').trim().toUpperCase() === 'ENTREGADO';
}
