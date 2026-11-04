# Continuar por terminal sin descargar archivos del chat

Esta rama es una **candidata aislada** de Centro de Mando. Parte de codigo-en-vivo @04fdb88, incorpora desarrollo @69f602f (Guayaquil) y conserva el esquema Power BI de 30/15 columnas. Incluye los ajustes revisados y el núcleo MySQL probado. No se ha fusionado con codigo-en-vivo ni publicado en Apps Script o en el servidor empresarial.

WTW queda pendiente por instrucción del usuario. Su aplicación y enlaces actuales continúan; su extracción no bloquea esta fase.

## PowerShell en el PC Windows

Usar una carpeta nueva, separada de CENTRO_DE_MANDO y de la candidata anterior:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    $imsDestino = Join-Path $env:USERPROFILE (
        'IMS_MYSQL_CANDIDATA_' + (Get-Date -Format 'yyyyMMdd_HHmmss_fff')
    )
    git clone --branch migracion/mysql-candidata-20261104 --single-branch `
        https://github.com/brantos102/CENTRODEMANDO_IMS.git $imsDestino
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo obtener la candidata.' }

    Set-Location -LiteralPath $imsDestino
    git log -1 --oneline
    Set-Location 'enterprise'
    npm ci --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias.' }
    npm test
    if ($LASTEXITCODE -ne 0) { throw 'Las pruebas no terminaron correctamente.' }
    Write-Output "CANDIDATA PREPARADA: $imsDestino"
}
```

Estos comandos clonan y ejecutan pruebas unitarias. No inician servicios, no conectan a MySQL ni necesitan contraseñas. El directorio no contiene .clasp.json y no debe asociarse al proyecto productivo mediante clasp push/deploy durante esta preparación. Git no transporta datos de clientes ni credenciales.

Si aparece un error, conservar su salida para revisarlo; no ejecutar comandos de publicación para intentar resolverlo. Los comandos son PowerShell para Windows, no Bash de la terminal SSH Linux.

## Contenido y evidencia

- `enterprise/CONTEO_TRANSACCIONAL.md`: contrato y alcance del núcleo.
- `enterprise/sql/001_snapshot_staging.sql`: conservación del corte crudo.
- `enterprise/sql/002_conteo_operativo.sql`: tablas del núcleo candidato; no es la migración final de todas las entidades.
- `docs/VALIDACION_MYSQL_20261104.json`: resultados locales; MySQL 8.0.46 y Node 22.23.3 comprobados.
- `docs/COTEJO_WMS_V124_20261104.md`: comparación de fuentes del WMS actual.
- `docs/WTW_PENDIENTE_20261104.md`: alcance diferido del visor.

Se conserva Supabase en el código heredado para no cambiar todavía la operación. La nueva base empresarial será MySQL; el origen del traslado es Google Sheets y sus archivos hijo vigentes, no Supabase desactualizado.

## Qué sigue pendiente

El backend candidato ya tiene autenticación/sesiones, lectura por cliente y conteo HTTP, con arranque deshabilitado por defecto. Todavía faltan frontend WMS, administración/migración de usuarios, los demás escritores, carga de entidades operativas y conciliación del delta antes del corte. Los inventarios en curso y validación deben conservarse completos. Solo Entregado es elegible para KPI. La definición de indicadores y los históricos requieren aceptación antes de sustituir el aplicativo. Consulte enterprise/AUTENTICACION_API.md.

Las configuraciones del servidor se prepararán aparte, con carpeta/base/usuarios propios y sin modificar IV_ITSANET, RRHH o Data Sync. La propuesta de puertos 127.0.0.1:3003 y HTTPS :8445 requiere revalidación al desplegar; clonar esta rama no los activa.
