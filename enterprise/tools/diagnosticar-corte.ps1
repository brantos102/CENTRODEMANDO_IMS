param([string]$ArchivoXlsx)

# Solo lectura del Excel. No ejecuta clasp, SQL ni llamadas al servidor.
$ErrorActionPreference = 'Stop'
if (!$env:USERPROFILE) { throw 'Ejecuta este archivo en PowerShell de tu PC Windows.' }
if (!(Get-Command node -ErrorAction SilentlyContinue)) { throw 'Se necesita Node.js 22 o superior.' }
& node -e 'process.exit(parseInt(process.versions.node,10) >= 22 ? 0 : 1)'
if ($LASTEXITCODE -ne 0) { throw 'Se necesita Node.js 22 o superior.' }

if (!$ArchivoXlsx) {
    $ArchivoXlsx = Read-Host 'Pega la ruta completa del Excel .xlsx recien descargado de Centro de Mando'
}
$ArchivoXlsx = $ArchivoXlsx.Trim().Trim('"')
if (!(Test-Path -LiteralPath $ArchivoXlsx -PathType Leaf) -or
    [System.IO.Path]::GetExtension($ArchivoXlsx) -ine '.xlsx') {
    throw 'No se encontro el archivo .xlsx. No uses ZIP, XLSB ni una URL.'
}
$imsFuente = (Resolve-Path -LiteralPath $ArchivoXlsx).Path

$imsPython = Get-Command py -ErrorAction SilentlyContinue
$imsPythonArgs = @('-3')
if (!$imsPython) {
    $imsPython = Get-Command python -ErrorAction SilentlyContinue
    $imsPythonArgs = @()
}
if (!$imsPython) { throw 'Se necesita Python 3 para leer el XLSX. No se instalo ni cambio ningun programa.' }
& $imsPython.Source @imsPythonArgs -c 'import sys; sys.exit(0 if sys.version_info >= (3,9) else 1)'
if ($LASTEXITCODE -ne 0) { throw 'No hay Python 3.9 o superior disponible; el Excel sigue intacto.' }

$imsPrivado = Join-Path $env:USERPROFILE 'IMS_DATOS_PRIVADOS'
$imsAncestro = [System.IO.DirectoryInfo]::new($imsPrivado)
while ($null -ne $imsAncestro) {
    if (Test-Path -LiteralPath (Join-Path $imsAncestro.FullName '.git')) {
        throw 'IMS_DATOS_PRIVADOS debe estar fuera de cualquier repositorio Git.'
    }
    $imsAncestro = $imsAncestro.Parent
}
$imsTrabajo = Join-Path $imsPrivado ('DIAGNOSTICO_' + (Get-Date -Format 'yyyyMMdd_HHmmss_fff'))
if (Test-Path -LiteralPath $imsTrabajo) { throw 'El destino ya existe; no se sobrescribe.' }
New-Item -ItemType Directory -Path $imsTrabajo | Out-Null
$imsCorte = Join-Path $imsTrabajo 'corte'
$imsPlan = Join-Path $imsTrabajo 'plan'

& $imsPython.Source @imsPythonArgs (Join-Path $PSScriptRoot 'exportar_snapshot.py') $imsFuente $imsCorte
if ($LASTEXITCODE -ne 0) { throw 'Extraccion detenida. No se modifico el Excel ni la base de datos.' }

$imsResultado = & node (Join-Path $PSScriptRoot 'planificar-operacion.mjs') $imsCorte $imsPlan
if ($LASTEXITCODE -ne 0) { throw 'Plan detenido. Conserva el corte privado para revisar el contrato de datos.' }
$imsResumen = ($imsResultado -join [Environment]::NewLine) | ConvertFrom-Json
if (!$imsResumen.ok -or $imsResumen.base_de_datos_modificada -ne $false) {
    throw 'Respuesta de diagnostico inesperada.'
}
$imsSalida = Join-Path $imsTrabajo 'resumen_para_compartir.json'
[System.IO.File]::WriteAllText($imsSalida, ($imsResumen | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
$imsResumen | ConvertTo-Json -Depth 10
Write-Output "Resumen sin datos de filas: $imsSalida"
Write-Output "Corte y plan privados: $imsTrabajo"
Write-Output 'Comparte solo el resumen. No adjuntes el corte, el plan completo ni credenciales.'
