# Cantidades y traslado de inventarios abiertos

El usuario confirmó que la migración completa debe incluir inventarios abiertos y en validación. No se declaran trasladados a partir del consolidado: ese origen solo incluye Entregado. Esta entrega corrige la presentación de cantidades y prepara una copia privada verificable de los archivos hijos actuales, la plantilla, Interfaz y datos administrativos necesarios del maestro de producción.

## Cantidades exactas y actualización de la aplicación

`2.000000000` en la respuesta SQL representa dos unidades. La web ahora presenta `2`; `17171.080000000` se presenta como `17.171,08`. Quita únicamente ceros decimales finales, conserva fracciones reales, ceros contados, ausencia de conteo y diferencias negativas. No redondea, convierte a Number, altera el parser de entrada, reescribe el stock ni migra columnas numéricas. El formato se comparte entre ERP, Operación, capturas e historial.

Antes de cambiar de versión, el actualizador compara filas, unidades de stock y procedencia de cada inventario creado desde ERP con su corte persistido. Usa el perfil SQL operativo propio y solo SELECT. Si no coinciden, detiene la actualización; nunca cambia cantidades para hacerlas coincidir. El resumen agrupa cortes ERP, no representa un KPI de stock físico actual de todos los clientes.

La revisión publicada se aplica mediante `deploy/aplicar_revision.sh`, pasando el SHA completo. El lanzador verifica servidor, usuario, rutas canónicas, revisión y árbol limpio; prepara un worktree privado y llama a `actualizar_operacion.sh`. La release nueva conserva los perfiles ya preparados, histórico y conteos nuevos. No ejecuta los inicializadores de tablas, usuarios o catálogo. Reinicia brevemente solo `centro-mando-ims-ensayo.service`, manteniendo `127.0.0.1:3003` y el HTTPS de Apache en `8445`.

## Obtener el corte actual de Google

1. Abrir el proyecto de producción del Centro de Mando: `https://script.google.com/home/projects/1QPDNLYYqLXkOjNyWoL49JepzxW32XaTskLWfSYOfCdE10Dt62FAfhlsD/edit`.
2. Crear un archivo **nuevo** llamado `IMS_Corte_Abiertos_Privado`. Copiar completo [EXPORTAR_ABIERTOS_PRIVADO.gs.txt](tools/EXPORTAR_ABIERTOS_PRIVADO.gs.txt). No reemplazar archivos, hacer clasp push o publicar un despliegue.
3. Guardar y ejecutar **IMSPrepararCorteAbiertos20261110** una vez. Usar la misma cuenta autorizada de las exportaciones anteriores. El registro muestra un resumen y el enlace de una carpeta privada propia.
4. Ejecutar **IMSContinuarCorteAbiertos20261110**. Si `fuentes_pendientes` sigue siendo mayor que cero, repetir esa función. Cada ejecución trabaja hasta aproximadamente dos minutos y medio y guarda progreso por fragmento. No ejecutar dos continuaciones simultáneas ni volver a Preparar mientras el corte está en curso.
5. Al aparecer `extraccion_terminada: true`, descargar la carpeta privada completa desde Drive como ZIP. Guardar bajo `C:\Users\IMORETA\IMS_DATOS_PRIVADOS`, fuera de Git. No adjuntar el ZIP, el plan o los fragmentos al chat. Las fuentes con `fuentes_revision > 0` siguen preservadas en Google y requieren revisión; no son inventarios vacíos ni datos descartados.

El alcance es el maestro de producción `1Cq2AqRVAZJYmj_zs_zg8C63FPrgRBtJHaNcHWXygaPk`, sus archivos de panel no catalogados exactamente Entregado y los dos documentos de plantilla/Interfaz ya aportados. Conserva todas las referencias de panel que comparten un archivo físico. Da prioridad a los archivos de inventario. Si falta el ID de C, solo recupera un enlace explícito y único de Sheets/Drive de B; no busca archivos por un nombre parecido. Referencias contradictorias se informan para revisión.

Exporta valores tipados, texto visible, formatos, fórmulas como texto, notas, posiciones de fila/columna y zona horaria del libro. Preserva SKU con ceros, números cero y etapas vacías. No evalúa fórmulas ni escribe en hojas originales. Los usuarios del maestro se copian sin sus columnas conocidas de contraseña; las hojas de credenciales/configuración y las columnas reconocidas de secretos se excluyen. No lee ScriptProperties, cambia estados, reemplaza permisos originales o instala disparadores. Cada archivo de salida se comprueba privado y propio antes de escribir su contenido.

Se compara dos veces cada fragmento y se controla la modificación del archivo durante la captura. Una fuente que cambia se marca para revisión. Esto no equivale a congelar transaccionalmente varios libros mientras otros usuarios trabajan. `corte_final_aprobado: false` es deliberado: esta copia permite preparar y conciliar el traslado. No pausar todavía la operación para este diagnóstico ni desconectar Sheets; el corte definitivo requiere una ventana coordinada una vez preparado el importador y conciliado el delta.

## Enviar el ZIP al servidor y compartir solo su resumen

En **PowerShell del PC Windows**, actualizar la candidata local y ejecutar:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location 'C:\Users\IMORETA\IMS_MYSQL_CANDIDATA_20261104_170059_087'
    if ((git branch --show-current) -ne 'migracion/mysql-candidata-20261104') {
        throw 'La carpeta no esta en la rama candidata.'
    }
    if (git status --porcelain) { throw 'Hay cambios locales; conservarlos y revisar.' }
    git pull --ff-only origin migracion/mysql-candidata-20261104
    if ($LASTEXITCODE -ne 0) { throw 'Actualizacion detenida.' }
    & '.\enterprise\tools\enviar-abiertos-servidor.ps1' -Enviar
}
```

Se abrirá un selector para elegir **el ZIP de la carpeta completa**, evitando confundir una carpeta con un archivo. La contraseña que pueda solicitar SSH es la del usuario Linux `enicolalde`; no introducir claves ERP o MySQL ni compartirlas en el chat. El transporte conserva la verificación de identidad SSH y los archivos originales.

El script sube a la entrada privada existente, compara SHA-256, comprueba la revisión y ejecuta el validador en un worktree propio. No instala dependencias, llama a APIs ERP, importa datos SQL o reinicia servicios. Produce `resumen_envio_abiertos_para_compartir.json` en `IMS_DATOS_PRIVADOS\ENVIO_ABIERTOS_<id>`. **Compartir únicamente ese resumen.**

El validador lee el ZIP sin extraer sus rutas. Rechaza enlaces, rutas escapadas, archivos ajenos, datos alterados, fragmentos ausentes/repetidos, huecos, fuentes de panel omitidas y columnas incompatibles. Informa estructura de campos y presencia de capturas, incluidos ceros, sin publicar valores de filas, credenciales o nombres de clientes. No interpreta comas como miles o decimales y no declara inválida una cantidad solo por su presentación. Los informes con `lista_para_plan: true` permiten preparar el plan; no autorizan ni ejecutan el corte.

La corrección visual y los recorridos de creación/conteo se probaron contra MySQL sintético y Chromium. La exportación se probó con servicios simulados y mediante ida y vuelta real Apps Script simulado → ZIP → validador Python. PowerShell se revisó y se comprobó sintaxis Bash de sus dos scripts remotos; su ejecución real Windows/SSH y el acceso de Google requieren la cuenta del usuario.

La publicación completa sigue pendiente del traslado y conciliación de los abiertos, sus cuentas/permisos, maestros y flujos restantes de Centro de Mando. La copia del histórico y los originales de Drive continúan conservados. FINI sigue pendiente por HTTP 401; WTW permanece aplazado.
