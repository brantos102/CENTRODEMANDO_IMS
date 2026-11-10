param(
    [Parameter(Mandatory=$true)][string]$RevisionCodigo,
    [Parameter(Mandatory=$true)][string]$PlanPrivado,
    [switch]$VerificarLectura
)
# Windows: solicita el diagnóstico GET en el servidor y descarga solo informes sin claves.
$ErrorActionPreference = 'Stop'
if (!$env:USERPROFILE) { throw 'Ejecuta en PowerShell del PC Windows.' }
if (!$VerificarLectura) { throw 'Indica VerificarLectura para consultar autenticacion y stock ERP.' }
if ($RevisionCodigo -notmatch '^[a-f0-9]{40}$') { throw 'Revision de codigo incompatible.' }
if ($PlanPrivado -notmatch '^/home/enicolalde/bryan/centro_mando_ims_datos/ERP_ASOCIACIONES_[a-f0-9]{32}/asociaciones_erp_NO_COMPARTIR\.json$') { throw 'Ruta del plan privado incompatible.' }
function Get-ImsOpenSsh([string]$Nombre) {
    $imsComando = Get-Command $Nombre -CommandType Application -ErrorAction SilentlyContinue
    if (!$imsComando -and $env:WINDIR) {
        $imsRuta = Join-Path $env:WINDIR ('Sysnative\OpenSSH\' + $Nombre + '.exe')
        if (Test-Path -LiteralPath $imsRuta) { $imsComando = Get-Command $imsRuta }
    }
    if (!$imsComando) { throw "No se encontro $Nombre de OpenSSH; usa PowerShell con el cliente SSH disponible." }
    return $imsComando.Source
}
$imsSsh = Get-ImsOpenSsh 'ssh'
$imsScp = Get-ImsOpenSsh 'scp'
$imsScript = @'
set -eu
umask 077
test "$(hostname)" = apps
test "$(id -un)" = enicolalde
cd /home/enicolalde/bryan/centro_mando_ims
test -z "$(git status --porcelain)"
git fetch --quiet origin migracion/mysql-candidata-20261104
git merge-base --is-ancestor __REVISION__ FETCH_HEAD
imsTrabajo='/home/enicolalde/bryan/centro_mando_ims_datos/preparaciones/__REVISION__/codigo'
test "$(realpath -m "$imsTrabajo")" = "$imsTrabajo"
if [ ! -e "$imsTrabajo" ]; then
  git worktree add --quiet --detach "$imsTrabajo" __REVISION__
fi
test "$(git -C "$imsTrabajo" rev-parse HEAD)" = __REVISION__
test -z "$(git -C "$imsTrabajo" status --porcelain)"
bash "$imsTrabajo/enterprise/deploy/diagnosticar_erp_lectura.sh" '__PLAN__'
'@
$imsCmd = $imsScript.Replace('__REVISION__', $RevisionCodigo).Replace('__PLAN__', $PlanPrivado).Replace("`r", '')
$imsB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($imsCmd))
$imsResumen = $null
& $imsSsh 'enicolalde@192.168.4.94' ("printf %s $imsB64 | base64 -d | env -u BASH_ENV -u ENV bash") | ForEach-Object {
    try { $imsMensaje = $_ | ConvertFrom-Json } catch { throw 'Respuesta del diagnostico incompatible.' }
    if ($imsMensaje.tipo -eq 'progreso_erp') {
        Write-Host ('ERP {0}/{1} {2} {3}: {4}' -f $imsMensaje.conexion, $imsMensaje.total, $imsMensaje.sede, $imsMensaje.etiqueta_credencial, $imsMensaje.estado)
    } elseif ($imsMensaje.tipo -eq 'resultado_erp' -and !$imsResumen) {
        $imsResumen = $imsMensaje.resumen
    } else {
        throw 'Secuencia de diagnostico incompatible.'
    }
}
if ($LASTEXITCODE -ne 0) { throw 'Diagnostico detenido. Conserva el plan y los originales privados; no se importaron datos ni se cambiaron servicios.' }
if (!$imsResumen) { throw 'El servidor no devolvio un resumen final del diagnostico.' }
if ($imsResumen.base_de_datos_modificada -ne $false -or
    $imsResumen.credenciales_publicadas -ne $false -or
    $imsResumen.aplicacion_reiniciada -ne $false -or
    $imsResumen.apache_modificado -ne $false -or
    $imsResumen.clientes_asignados -ne 0 -or
    $imsResumen.conexiones -lt 1 -or $imsResumen.conexiones -gt 64) { throw 'Resumen de diagnostico incompatible.' }
if ($imsResumen.archivo_para_compartir -notmatch '^(/home/enicolalde/bryan/centro_mando_ims_datos/ERP_LECTURA_[a-f0-9]{32})/conexiones_erp_para_compartir\.json$') { throw 'Ruta del informe incompatible.' }
$imsDirectorioRemoto = $Matches[1]
$imsSalida = Join-Path (Join-Path $env:USERPROFILE 'IMS_DATOS_PRIVADOS') ('CONEXIONES_ERP_' + [guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $imsSalida) { throw 'La carpeta local ya existe; no se sobrescribe.' }
$null = New-Item -ItemType Directory -Path $imsSalida
foreach ($imsInforme in @('conexiones_erp_para_compartir.json', 'revision_asociaciones_erp_para_compartir.json')) {
    & $imsScp ('enicolalde@192.168.4.94:' + $imsDirectorioRemoto + '/' + $imsInforme) (Join-Path $imsSalida $imsInforme)
    if ($LASTEXITCODE -ne 0) { throw 'El diagnostico quedo en el servidor, pero la descarga del informe no termino.' }
}
$imsResumen | ConvertTo-Json -Depth 6
Write-Output 'Comparte conexiones_erp_para_compartir.json y revision_asociaciones_erp_para_compartir.json. No adjuntes planes ni credenciales.'
Invoke-Item -LiteralPath $imsSalida
