// Referencia original del WMS desplegado @124. Solo se ejecuta en pruebas.
function parseAnalysisData(data) {
  let qFisicaTotal = 0, qTeoricaTotal = 0, uCorrectas = 0, uContadasTeoricas = 0;
  let allRefs = new Set(), allPos = new Set();
  let refsCounted = new Set(), refsCorrect = new Set(), refsError = new Set();
  let posCounted = new Set(), posCorrect = new Set(), posError = new Set();
  let discrepancias = [];

  for(let r of data) {
    let sku = String(r[6]).trim(), desc = String(r[7]).trim(), pos = String(r[14]).trim();
    let qTeo = parseFloat(r[16]) || 0, qFis = parseFloat(r[17]) || 0, qDif = parseFloat(r[18]) || 0;
    let estado = String(r[19]).trim().toUpperCase(), categoria = String(r[12]).trim().toUpperCase();

    if(!sku || categoria === "DIF_INV") continue;

    // EXTRACCIÓN DE DATOS DE TRAZABILIDAD (Columnas V a la AC de tu Excel)
    let conteo1 = String(r[21]).trim();
    let conteo2 = String(r[22]).trim();
    let conteo3 = String(r[23]).trim();
    let ajuste = String(r[24]).trim();
    let motivo = String(r[25]).trim();
    let justif = String(r[26]).trim();
    let obs = String(r[27]).trim();
    let nuevaPos = String(r[28]).trim();

    allRefs.add(sku); allPos.add(pos);
    qTeoricaTotal += qTeo; qFisicaTotal += qFis;

    if (estado !== "PENDIENTE" && estado !== "") {
       refsCounted.add(sku); posCounted.add(pos);
       uContadasTeoricas += qTeo;

       // Empaquetamos toda la historia del artículo
       let itemData = {
           sku: sku, desc: desc, pos: pos, qTeo: qTeo, qFis: qFis, dif: qDif, estado: estado,
           conteo1: conteo1, conteo2: conteo2, conteo3: conteo3, ajuste: ajuste,
           motivo: motivo, justificacion: justif, obs: obs, nuevaPos: nuevaPos
       };

       if (estado === "CORRECTO") {
           uCorrectas += qFis; refsCorrect.add(sku); posCorrect.add(pos);

           // REGLA NUEVA: Si está correcto pero fue por un ajuste o justificación, se va al reporte
           if (ajuste !== "" || motivo !== "" || justif !== "" || obs !== "") {
               itemData.estado = "CORR. AJUSTADO"; // Etiqueta especial para que no se confunda con un faltante real
               discrepancias.push(itemData);
           }
       }
       else if (estado === "FALTANTE" || estado === "SOBRANTE") {
         refsError.add(sku); posError.add(pos);
         if (estado === "SOBRANTE") uCorrectas += qTeo;
         if (estado === "FALTANTE") uCorrectas += qFis;
         discrepancias.push(itemData);
       }
    }
  }

  refsError.forEach(sku => refsCorrect.delete(sku));
  posError.forEach(pos => posCorrect.delete(pos));

  return {
    exito: true,
    kpis: {
      efectividadUnidades: qTeoricaTotal === 0 ? 0 : ((uCorrectas / qTeoricaTotal) * 100).toFixed(1),
      efectividadRef: refsCounted.size === 0 ? 0 : ((refsCorrect.size / refsCounted.size) * 100).toFixed(1),
      efectividadPos: posCounted.size === 0 ? 0 : ((posCorrect.size / posCounted.size) * 100).toFixed(1),
      uniValidadas: uContadasTeoricas, uniTotal: qTeoricaTotal,
      refValidadas: refsCounted.size, refTotal: allRefs.size,
      posValidadas: posCounted.size, posTotal: allPos.size
    },
    discrepancias: discrepancias.sort((a,b) => a.pos.localeCompare(b.pos))
  };
}
