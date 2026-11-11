param([string]$ArchivoZip, [switch]$Enviar)
# Selecciona un ZIP privado de Drive y valida su copia en el servidor. No SQL.
$ErrorActionPreference = 'Stop'
if (!$env:USERPROFILE) { throw 'Ejecuta en PowerShell del PC Windows.' }
if (!$ArchivoZip) {
    Add-Type -AssemblyName System.Windows.Forms
    $imsDialogo = New-Object System.Windows.Forms.OpenFileDialog
    $imsDialogo.Title = 'Seleccionar el ZIP privado IMS_ABIERTOS descargado de Drive'
    $imsDialogo.Filter = 'Paquete ZIP (*.zip)|*.zip'
    $imsDialogo.Multiselect = $false
    if ($imsDialogo.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw 'No se selecciono un ZIP; no se enviaron datos.' }
    $ArchivoZip = $imsDialogo.FileName
}
$imsArchivo = Get-Item -LiteralPath $ArchivoZip.Trim().Trim('"')
if ($imsArchivo.PSIsContainer -or $imsArchivo.Extension -ine '.zip' -or $imsArchivo.Length -lt 1 -or $imsArchivo.Length -gt 536870912) { throw 'Usa el ZIP privado completo de Drive, de hasta 512 MiB.' }
$imsRepo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
if ((git -C $imsRepo branch --show-current) -ne 'migracion/mysql-candidata-20261104' -or (git -C $imsRepo status --porcelain)) { throw 'Se necesita la rama candidata actualizada y sin cambios locales.' }
$imsRevision = git -C $imsRepo rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $imsRevision -notmatch '^[a-f0-9]{40}$') { throw 'Revision de codigo incompatible.' }
$imsToken = [guid]::NewGuid().ToString('N')
$imsNombre = 'ims-abiertos-' + $imsToken + '.zip'
$imsBase = '/home/enicolalde/bryan/centro_mando_ims_datos'
$imsDestino = $imsBase + '/entrada/' + $imsNombre
$imsSalida = Join-Path (Join-Path $env:USERPROFILE 'IMS_DATOS_PRIVADOS') ('ENVIO_ABIERTOS_' + $imsToken)
$null = New-Item -ItemType Directory -Path $imsSalida
$imsInforme = Join-Path $imsSalida 'resumen_envio_abiertos_para_compartir.json'
$imsResumen = [ordered]@{ok=$false; archivo_enviado=$false; validacion_completada=$false; datos_importados=$false; base_de_datos_modificada=$false; servicios_reiniciados=$false; bytes=$imsArchivo.Length; destino_privado=$imsDestino; revision_codigo=$imsRevision}
$imsUtf8 = [Text.UTF8Encoding]::new($false)
function Save-ImsInforme { [IO.File]::WriteAllText($imsInforme, ($imsResumen | ConvertTo-Json -Depth 10), $imsUtf8) }
Save-ImsInforme
function Get-ImsOpenSsh([string]$Nombre) {
    $imsCmd = Get-Command $Nombre -CommandType Application -ErrorAction SilentlyContinue
    if (!$imsCmd -and $env:WINDIR) {
        $imsRuta = Join-Path $env:WINDIR ('Sysnative\OpenSSH\' + $Nombre + '.exe')
        if (Test-Path -LiteralPath $imsRuta) { $imsCmd = Get-Command $imsRuta }
    }
    if (!$imsCmd) { throw "No se encontro $Nombre de OpenSSH. Usa la terminal SSH de VS Code o PowerShell con OpenSSH." }
    return $imsCmd.Source
}
if ($Enviar) {
    $imsSsh=Get-ImsOpenSsh 'ssh'; $imsScp=Get-ImsOpenSsh 'scp'
    $imsSha=(Get-FileHash -LiteralPath $imsArchivo.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $imsPrevio=@'
set -euo pipefail
umask 077
test "$(hostname)" = apps
test "$(id -un)" = enicolalde
imsBase='/home/enicolalde/bryan/centro_mando_ims_datos'
test "$(readlink -f "$imsBase/entrada")" = "$imsBase/entrada"
test -O "$imsBase/entrada"
test "$(stat -c %a "$imsBase")" = 700
test "$(stat -c %a "$imsBase/entrada")" = 700
test ! -e "$imsBase/entrada/__ARCHIVO__"
test ! -L "$imsBase/entrada/__ARCHIVO__"
'@
    $imsB64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($imsPrevio.Replace('__ARCHIVO__',$imsNombre).Replace("`r",'')))
    & $imsSsh 'enicolalde@192.168.4.94' ("printf %s $imsB64 | base64 -d | env -u BASH_ENV -u ENV bash")
    if ($LASTEXITCODE -ne 0) { throw 'Entrada privada no confirmada. No se envio el ZIP.' }
    & $imsScp $imsArchivo.FullName ('enicolalde@192.168.4.94:'+$imsDestino)
    if ($LASTEXITCODE -ne 0) { throw 'Envio incompleto; conserva el ZIP original privado.' }
    $imsResumen.archivo_enviado=$true; Save-ImsInforme
    $imsRemoto=@'
set -euo pipefail
umask 077
test "$(hostname)" = apps
test "$(id -un)" = enicolalde
imsBase='/home/enicolalde/bryan/centro_mando_ims_datos'
imsArchivo="$imsBase/entrada/__ARCHIVO__"
test "$(readlink -f "$imsArchivo")" = "$imsArchivo"
test -f "$imsArchivo"
test -O "$imsArchivo"
test "$(stat -c %a "$imsBase")" = 700
test "$(stat -c %a "$imsBase/entrada")" = 700
chmod 600 "$imsArchivo"
test "$(sha256sum "$imsArchivo" | cut -d ' ' -f 1)" = '__SHA__'
cd /home/enicolalde/bryan/centro_mando_ims
test -z "$(git status --porcelain)"
git fetch --quiet origin migracion/mysql-candidata-20261104
git merge-base --is-ancestor __REVISION__ FETCH_HEAD
imsTrabajo="$imsBase/preparaciones/__REVISION__/codigo"
test "$(realpath -m "$imsTrabajo")" = "$imsTrabajo"
if [ ! -e "$imsTrabajo" ]; then git worktree add --quiet --detach "$imsTrabajo" __REVISION__; fi
test "$(git -C "$imsTrabajo" rev-parse HEAD)" = __REVISION__
test -z "$(git -C "$imsTrabajo" status --porcelain)"
python3 "$imsTrabajo/enterprise/tools/validar_corte_abiertos.py" --zip "$imsArchivo" --salida "$imsBase/REVISION_ABIERTOS___TOKEN__"
'@
    $imsCmd=$imsRemoto.Replace('__ARCHIVO__',$imsNombre).Replace('__SHA__',$imsSha).Replace('__REVISION__',$imsRevision).Replace('__TOKEN__',$imsToken).Replace("`r",'')
    $imsB64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($imsCmd))
    $imsJson=& $imsSsh 'enicolalde@192.168.4.94' ("printf %s $imsB64 | base64 -d | env -u BASH_ENV -u ENV bash")
    if ($LASTEXITCODE -ne 0) { throw 'Validacion detenida. Conserva el ZIP y el corte privado; no se importaron datos ni se reiniciaron servicios.' }
    $imsValidacion=($imsJson -join [Environment]::NewLine) | ConvertFrom-Json
    if ($imsValidacion.ok -ne $true -or $imsValidacion.datos_importados -ne $false -or $imsValidacion.base_de_datos_modificada -ne $false) { throw 'Respuesta de validacion incompatible.' }
    $imsResumen.ok=$true; $imsResumen.validacion_completada=$true; $imsResumen['validacion']=$imsValidacion; Save-ImsInforme
}
$imsResumen | ConvertTo-Json -Depth 10
Write-Output 'Comparte solo resumen_envio_abiertos_para_compartir.json. No adjuntes el ZIP, fragmentos o plan privado.'
Invoke-Item -LiteralPath $imsSalida
