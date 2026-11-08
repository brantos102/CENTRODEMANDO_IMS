param(
    [Parameter(Mandatory=$true)][string]$DirectorioCorte,
    [Parameter(Mandatory=$true)][string]$SnapshotId,
    [Parameter(Mandatory=$true)][string]$PlanId,
    [string]$ArchivoOriginal,
    [string]$ShaOriginal,
    [switch]$Enviar
)

# Solo empaqueta y envía a entrada privada. No ejecuta SQL ni inicia servicios.
$ErrorActionPreference = 'Stop'
if (!$env:USERPROFILE) { throw 'Ejecuta en PowerShell de tu PC Windows.' }
$imsPython = Get-Command py -ErrorAction SilentlyContinue
$imsPythonArgs = @('-3')
if (!$imsPython) { $imsPython = Get-Command python -ErrorAction SilentlyContinue; $imsPythonArgs = @() }
if (!$imsPython) { throw 'Se necesita Python 3, como en los diagnosticos anteriores.' }

function Get-ImsOpenSsh([string]$Nombre) {
    $imsComando = Get-Command $Nombre -CommandType Application -ErrorAction SilentlyContinue
    if (!$imsComando -and $env:WINDIR) {
        $imsRuta = Join-Path $env:WINDIR ('Sysnative\OpenSSH\' + $Nombre + '.exe')
        if (Test-Path -LiteralPath $imsRuta) { $imsComando = Get-Command $imsRuta }
    }
    if (!$imsComando) { throw "No se encontro $Nombre de OpenSSH. Usa PowerShell de 64 bits con el cliente SSH disponible." }
    return $imsComando.Source
}
if ($Enviar) { $imsSsh = Get-ImsOpenSsh 'ssh'; $imsScp = Get-ImsOpenSsh 'scp' }

$imsSalida = Join-Path (Split-Path -Parent $DirectorioCorte) ('ENVIO_SERVIDOR_' + (Get-Date -Format 'yyyyMMdd_HHmmss_fff'))
$imsArgumentos = @('--listar', $DirectorioCorte, $imsSalida, $SnapshotId, $PlanId)
if ($ArchivoOriginal -or $ShaOriginal) { $imsArgumentos += @($ArchivoOriginal, $ShaOriginal) }
$imsDatos = & node (Join-Path $PSScriptRoot 'preparar-traslado.mjs') @imsArgumentos
if ($LASTEXITCODE -ne 0) { throw 'Corte o plan no verificados; envio detenido.' }
$imsLista = ($imsDatos -join [Environment]::NewLine) | ConvertFrom-Json
$imsNombre = 'ims-traslado-' + [guid]::NewGuid().ToString('N') + '.zip'
$imsZip = Join-Path $imsSalida $imsNombre
$imsDatos = & $imsPython.Source @imsPythonArgs (Join-Path $PSScriptRoot 'paquete_traslado.py') empaquetar --lista $imsLista.archivo_lista --salida $imsZip
if ($LASTEXITCODE -ne 0) { throw 'Empaquetado detenido; los originales siguen intactos.' }
$imsPaquete = ($imsDatos -join [Environment]::NewLine) | ConvertFrom-Json
$imsResumen = [ordered]@{
    ok = $true
    snapshot_id = $SnapshotId
    plan_id = $PlanId
    archivo_paquete = $imsZip
    nombre_paquete = $imsNombre
    sha256_paquete = $imsPaquete.sha256_paquete
    bytes_paquete = $imsPaquete.bytes_paquete
    hojas = $imsLista.hojas
    filas_inventarios = $imsLista.filas_inventarios
    filas_registro = $imsLista.filas_registro
    filas_preparadas = $imsLista.filas_preparadas
    filas_conservadas_para_revision = $imsLista.filas_conservadas_para_revision
    original_evidencia_sha256 = $imsLista.original_evidencia_sha256
    archivo_enviado = $false
    destino_servidor = '/home/enicolalde/bryan/centro_mando_ims_datos/entrada/' + $imsNombre
    datos_importados = $false
    verificacion_remota_pendiente = $true
}
$imsUtf8 = [System.Text.UTF8Encoding]::new($false)
$imsInforme = Join-Path $imsSalida 'resumen_envio_para_compartir.json'
function Save-ImsInforme {
    [System.IO.File]::WriteAllText($imsInforme, ($imsResumen | ConvertTo-Json -Depth 10), $imsUtf8)
}
Save-ImsInforme
if ($Enviar) {
    $imsComprobacion = @'
test "$(hostname)" = apps && test "$(id -un)" = enicolalde && test "$(readlink -f /home/enicolalde/bryan/centro_mando_ims_datos/entrada)" = /home/enicolalde/bryan/centro_mando_ims_datos/entrada && test -O /home/enicolalde/bryan/centro_mando_ims_datos/entrada && test "$(stat -c %a /home/enicolalde/bryan/centro_mando_ims_datos)" = 700 && test "$(stat -c %a /home/enicolalde/bryan/centro_mando_ims_datos/entrada)" = 700 && test ! -e /home/enicolalde/bryan/centro_mando_ims_datos/entrada/__ARCHIVO__ && test ! -L /home/enicolalde/bryan/centro_mando_ims_datos/entrada/__ARCHIVO__
'@
    $imsComprobacion = $imsComprobacion.Replace('__ARCHIVO__', $imsNombre)
    & $imsSsh 'enicolalde@192.168.4.94' $imsComprobacion
    if ($LASTEXITCODE -ne 0) { throw 'Entrada privada no verificada; no se envio el paquete.' }
    & $imsScp $imsZip 'enicolalde@192.168.4.94:/home/enicolalde/bryan/centro_mando_ims_datos/entrada/'
    if ($LASTEXITCODE -ne 0) { throw 'Transferencia incompleta. Conserva el paquete local; no se importaron datos.' }
    $imsResumen.archivo_enviado = $true
    Save-ImsInforme
}
$imsResumen | ConvertTo-Json -Depth 10
Write-Output 'Comparte solo resumen_envio_para_compartir.json. El ZIP, la lista y el corte son privados.'
Invoke-Item -LiteralPath $imsSalida
