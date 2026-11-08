param(
    [Parameter(Mandatory=$true)][string]$Diagnostico,
    [Parameter(Mandatory=$true)][string]$ArchivoHuellas,
    [Parameter(Mandatory=$true)][string]$Receta,
    [Parameter(Mandatory=$true)][string]$ShaReceta,
    [string]$DirectorioCorte
)

# Solo crea una copia local verificada, su corte derivado y otro plan.
# No llama a clasp ni conecta a Google, MySQL o Supabase.
$ErrorActionPreference = 'Stop'
$imsPython = Get-Command py -ErrorAction SilentlyContinue
$imsPythonArgs = @('-3')
if (!$imsPython) {
    $imsPython = Get-Command python -ErrorAction SilentlyContinue
    $imsPythonArgs = @()
}
if (!$imsPython) { throw 'Se necesita Python 3, como en el diagnostico anterior.' }

$imsDestino = Join-Path $Diagnostico ('COPIA_PROCEDENCIA_' + (Get-Date -Format 'yyyyMMdd_HHmmss_fff'))
if (Test-Path -LiteralPath $imsDestino) { throw 'La carpeta de salida ya existe.' }
if (!$DirectorioCorte) { $DirectorioCorte = Join-Path $Diagnostico 'corte' }
$imsOriginal = Join-Path $DirectorioCorte 'fuente.xlsx'
$imsCopia = Join-Path $imsDestino 'fuente_corregida.xlsx'

$imsRespuesta = & $imsPython.Source @imsPythonArgs (Join-Path $PSScriptRoot 'corregir_procedencia_copia.py') --original $imsOriginal --huellas $ArchivoHuellas --receta $Receta --sha-receta $ShaReceta --salida $imsCopia
if ($LASTEXITCODE -ne 0) { throw 'No se completo la copia verificada. Se conserva el original.' }
$imsCorreccion = ($imsRespuesta -join [Environment]::NewLine) | ConvertFrom-Json
if (!$imsCorreccion.ok -or !$imsCorreccion.partes_ajenas_a_notas_identicas) { throw 'Verificacion de copia incompleta.' }

$imsCorte = Join-Path $imsDestino 'corte_corregido'
$imsPlan = Join-Path $imsDestino 'plan_corregido'
& $imsPython.Source @imsPythonArgs (Join-Path $PSScriptRoot 'exportar_snapshot.py') $imsCopia $imsCorte
if ($LASTEXITCODE -ne 0) { throw 'Extraccion de la copia detenida.' }

$imsResultado = & node (Join-Path $PSScriptRoot 'planificar-operacion.mjs') $imsCorte $imsPlan
if ($LASTEXITCODE -ne 0) { throw 'Plan de la copia detenido.' }
$imsResumen = ($imsResultado -join [Environment]::NewLine) | ConvertFrom-Json
$imsUtf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText((Join-Path $imsDestino 'resumen_correccion.json'), ($imsCorreccion | ConvertTo-Json -Depth 10), $imsUtf8)
[System.IO.File]::WriteAllText((Join-Path $imsDestino 'resumen_para_compartir.json'), ($imsResumen | ConvertTo-Json -Depth 10), $imsUtf8)
$imsCorreccion | ConvertTo-Json -Depth 10
$imsResumen | ConvertTo-Json -Depth 10
Write-Output "COPIA PRIVADA Y RESUMENES: $imsDestino"
Write-Output 'Comparte solo resumen_correccion.json y resumen_para_compartir.json. El Excel y los cortes completos siguen siendo privados.'
Invoke-Item -LiteralPath $imsDestino
