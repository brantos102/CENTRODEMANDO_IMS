param(
    [Parameter(Mandatory=$true)][string]$DirectorioCorte,
    [switch]$ClientePanel,
    [string[]]$ConteosMiles = @(),
    [string[]]$SepararConteos = @()
)

# Auditoria completa y otro plan local. No llama a Google, clasp o MySQL.
$ErrorActionPreference = 'Stop'
if (!(Test-Path -LiteralPath (Join-Path $DirectorioCorte 'manifest.json') -PathType Leaf)) {
    throw 'Indica la carpeta del corte que contiene manifest.json.'
}
$imsTrabajo = Join-Path (Split-Path -Parent $DirectorioCorte) (
    'VALIDACION_REGLAS_' + (Get-Date -Format 'yyyyMMdd_HHmmss_fff')
)
if (Test-Path -LiteralPath $imsTrabajo) { throw 'La salida ya existe; no se sobrescribe.' }
$imsAuditoria = Join-Path $imsTrabajo 'auditoria'
$imsPlan = Join-Path $imsTrabajo 'plan'
$imsRevision = Join-Path $imsTrabajo 'revision'

& node (Join-Path $PSScriptRoot 'auditar-formatos-conteo.mjs') $DirectorioCorte $imsAuditoria
if ($LASTEXITCODE -ne 0) { throw 'Auditoria detenida; el corte sigue intacto.' }

$imsArgumentos = @($DirectorioCorte, $imsPlan)
if ($ClientePanel) { $imsArgumentos += '--cliente-panel' }
foreach ($imsControl in $ConteosMiles) { $imsArgumentos += @('--miles-conteo', $imsControl) }
foreach ($imsSeparacion in $SepararConteos) { $imsArgumentos += @('--separar-conteos', $imsSeparacion) }
$imsRespuesta = & node (Join-Path $PSScriptRoot 'planificar-operacion.mjs') @imsArgumentos
if ($LASTEXITCODE -ne 0) {
    throw 'Plan detenido. Comprueba el control total y la integridad; no se cambiaron datos.'
}
$imsResumen = ($imsRespuesta -join [Environment]::NewLine) | ConvertFrom-Json
if (!$imsResumen.ok -or $imsResumen.base_de_datos_modificada -ne $false) { throw 'Respuesta inesperada.' }

& node (Join-Path $PSScriptRoot 'revisar-incidencias.mjs') $DirectorioCorte $imsPlan $imsRevision
if ($LASTEXITCODE -ne 0) { throw 'Revision detenida; conserva el corte original.' }

$imsUtf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText((Join-Path $imsTrabajo 'resumen_para_compartir.json'), ($imsResumen | ConvertTo-Json -Depth 12), $imsUtf8)
Copy-Item -LiteralPath (Join-Path $imsAuditoria 'auditoria_formatos_para_compartir.json') -Destination $imsTrabajo
Copy-Item -LiteralPath (Join-Path $imsRevision 'revision_para_compartir.json') -Destination $imsTrabajo
$imsResumen | ConvertTo-Json -Depth 12
Write-Output "PLAN NUEVO Y TRES INFORMES: $imsTrabajo"
Write-Output 'Comparte solo los tres JSON de la raiz. El plan y el corte siguen privados.'
Invoke-Item -LiteralPath $imsTrabajo
