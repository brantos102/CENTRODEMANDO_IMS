param(
    [Parameter(Mandatory=$true)][string]$ArchivoPrivado,
    [string]$RevisionCodigo,
    [switch]$CompararCatalogo,
    [string[]]$RevisionERPAdicional = @(),
    [switch]$Enviar
)
# Copia privada y verificación SHA. CompararCatalogo añade únicamente lectura SQL.
$ErrorActionPreference = 'Stop'
if (!$env:USERPROFILE) { throw 'Ejecuta este archivo en PowerShell de tu PC Windows.' }
$ArchivoPrivado = $ArchivoPrivado.Trim().Trim('"')
if ($Enviar -and $RevisionCodigo -notmatch '^[a-f0-9]{40}$') { throw 'Indica la revision Git aprobada con -RevisionCodigo (40 caracteres).' }
if ($CompararCatalogo -and !$Enviar) { throw 'CompararCatalogo requiere Enviar para verificar primero la copia privada.' }
if ($RevisionERPAdicional.Count -gt 9 -or ($RevisionERPAdicional.Count -gt 0 -and !$CompararCatalogo)) { throw 'Las revisiones adicionales requieren CompararCatalogo y admiten hasta nueve rutas.' }
foreach ($imsRutaRevision in $RevisionERPAdicional) {
    if ($imsRutaRevision -notmatch '^/home/enicolalde/bryan/centro_mando_ims_datos/ERP_REVISION_[a-f0-9]{32}$') { throw 'Ruta de revision ERP incompatible.' }
}
$imsFichero = Get-Item -LiteralPath $ArchivoPrivado
if ($imsFichero.PSIsContainer -or $imsFichero.Extension -ine '.json' -or
    $imsFichero.Name -notlike 'NO_COMPARTIR_ERP_PRIVADO_*.json' -or
    $imsFichero.Length -gt 2097152) {
    throw 'Selecciona el JSON privado generado por el exportador ERP de UIO o GYE; no uses ZIP ni otros archivos.'
}
function Get-ImsOpenSsh([string]$Nombre) {
    $imsComando = Get-Command $Nombre -CommandType Application -ErrorAction SilentlyContinue
    if (!$imsComando -and $env:WINDIR) {
        $imsRuta = Join-Path $env:WINDIR ('Sysnative\OpenSSH\' + $Nombre + '.exe')
        if (Test-Path -LiteralPath $imsRuta) { $imsComando = Get-Command $imsRuta }
    }
    if (!$imsComando) { throw "No se encontro $Nombre de OpenSSH. Usa PowerShell de 64 bits con el cliente SSH disponible." }
    return $imsComando.Source
}
$imsBasePrivada = Join-Path $env:USERPROFILE 'IMS_DATOS_PRIVADOS'
$imsSalida = Join-Path $imsBasePrivada ('ENVIO_ERP_' + [guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $imsSalida) { throw 'La salida ya existe; no se sobrescribe.' }
$null = New-Item -ItemType Directory -Path $imsSalida
$imsNombre = 'erp-privado-' + [guid]::NewGuid().ToString('N') + '.json'
$imsSha = (Get-FileHash -LiteralPath $imsFichero.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$imsDestino = '/home/enicolalde/bryan/centro_mando_ims_datos/entrada/' + $imsNombre
$imsResumen = [ordered]@{
    ok = (-not [bool]$Enviar)
    bytes = $imsFichero.Length
    archivo_enviado = $false
    verificacion_remota = $false
    destino_privado = $imsDestino
    datos_importados = $false
    conexiones_modificadas = $false
    aplicacion_reiniciada = $false
    credenciales_publicadas = $false
    revision_codigo = $RevisionCodigo
    diagnostico_completado = $false
    asociaciones_revisadas = $false
}
$imsInforme = Join-Path $imsSalida 'resumen_envio_erp_para_compartir.json'
$imsUtf8 = [System.Text.UTF8Encoding]::new($false)
function Save-ImsInforme { [System.IO.File]::WriteAllText($imsInforme, ($imsResumen | ConvertTo-Json -Depth 5), $imsUtf8) }
Save-ImsInforme
if ($Enviar) {
    $imsSsh = Get-ImsOpenSsh 'ssh'
    $imsScp = Get-ImsOpenSsh 'scp'
    $imsComprobar = @'
set -eu
test "$(hostname)" = apps
test "$(id -un)" = enicolalde
test "$(readlink -f /home/enicolalde/bryan/centro_mando_ims_datos/entrada)" = /home/enicolalde/bryan/centro_mando_ims_datos/entrada
test -O /home/enicolalde/bryan/centro_mando_ims_datos/entrada
test "$(stat -c %a /home/enicolalde/bryan/centro_mando_ims_datos)" = 700
test "$(stat -c %a /home/enicolalde/bryan/centro_mando_ims_datos/entrada)" = 700
test ! -e /home/enicolalde/bryan/centro_mando_ims_datos/entrada/__ARCHIVO__
test ! -L /home/enicolalde/bryan/centro_mando_ims_datos/entrada/__ARCHIVO__
'@
    $imsCmd = $imsComprobar.Replace('__ARCHIVO__', $imsNombre).Replace("`r", '')
    $imsB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($imsCmd))
    & $imsSsh 'enicolalde@192.168.4.94' ("printf %s $imsB64 | base64 -d | env -u BASH_ENV -u ENV bash")
    if ($LASTEXITCODE -ne 0) { throw 'Entrada privada no verificada; no se enviaron credenciales.' }
    & $imsScp $imsFichero.FullName ('enicolalde@192.168.4.94:' + $imsDestino)
    if ($LASTEXITCODE -ne 0) { throw 'Transferencia incompleta. Conserva el original privado; no se importaron datos.' }
    $imsResumen.archivo_enviado = $true
    Save-ImsInforme
    $imsVerificar = @'
set -eu
test "$(hostname)" = apps
test "$(id -un)" = enicolalde
test "$(readlink -f /home/enicolalde/bryan/centro_mando_ims_datos/entrada)" = /home/enicolalde/bryan/centro_mando_ims_datos/entrada
test -f /home/enicolalde/bryan/centro_mando_ims_datos/entrada/__ARCHIVO__
test ! -L /home/enicolalde/bryan/centro_mando_ims_datos/entrada/__ARCHIVO__
test -O /home/enicolalde/bryan/centro_mando_ims_datos/entrada/__ARCHIVO__
chmod 600 /home/enicolalde/bryan/centro_mando_ims_datos/entrada/__ARCHIVO__
sha256sum /home/enicolalde/bryan/centro_mando_ims_datos/entrada/__ARCHIVO__
'@
    $imsCmd = $imsVerificar.Replace('__ARCHIVO__', $imsNombre).Replace("`r", '')
    $imsB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($imsCmd))
    $imsRemoto = & $imsSsh 'enicolalde@192.168.4.94' ("printf %s $imsB64 | base64 -d | env -u BASH_ENV -u ENV bash")
    if ($LASTEXITCODE -ne 0) { throw 'La copia aun no se confirmo; no se ejecutaron conexiones ni SQL.' }
    $imsLineasSha = @($imsRemoto | Where-Object { $_ -match '^[a-f0-9]{64}\s+' })
    if ($imsLineasSha.Count -ne 1 -or $imsLineasSha[0] -notmatch '^([a-f0-9]{64})\s+') { throw 'Respuesta SHA incompatible; no se importaron datos.' }
    $imsShaRemoto = ($imsLineasSha[0] -split '\s+')[0]
    if ($imsShaRemoto -ne $imsSha) { throw 'SHA remoto diferente; conservar originales y revisar. No se importaron datos.' }
    $imsResumen.verificacion_remota = $true
    Save-ImsInforme
    $imsDiagnosticar = @'
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
env -u NODE_OPTIONS -u NODE_PATH /usr/bin/node "$imsTrabajo/enterprise/tools/revisar-erp-privado.mjs" --archivo /home/enicolalde/bryan/centro_mando_ims_datos/entrada/__ARCHIVO__ --salida /home/enicolalde/bryan/centro_mando_ims_datos/ERP_REVISION___NONCE__
'@
    $imsCmd = $imsDiagnosticar.Replace('__ARCHIVO__', $imsNombre).Replace('__REVISION__', $RevisionCodigo).Replace('__NONCE__', [guid]::NewGuid().ToString('N')).Replace("`r", '')
    $imsB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($imsCmd))
    $imsDatos = & $imsSsh 'enicolalde@192.168.4.94' ("printf %s $imsB64 | base64 -d | env -u BASH_ENV -u ENV bash")
    if ($LASTEXITCODE -ne 0) { throw 'Copia enviada y verificada, pero el diagnostico no se completo. Las fuentes y los servicios se conservan.' }
    try { $imsDiagnostico = ($imsDatos -join [Environment]::NewLine) | ConvertFrom-Json } catch { throw 'Respuesta de diagnostico incompatible. No compartas el archivo privado.' }
    if ($imsDiagnostico.ok -ne $true -or
        $imsDiagnostico.base_de_datos_modificada -ne $false -or $imsDiagnostico.credenciales_publicadas -ne $false) {
        throw 'Diagnostico no confirmado; no se activaron conexiones.'
    }
    $imsResumen.ok = $true
    $imsResumen.diagnostico_completado = $true
    $imsResumen['diagnostico'] = $imsDiagnostico
    Save-ImsInforme
    if ($CompararCatalogo) {
        $imsCarpetaRevision = [string]$imsDiagnostico.archivo_para_compartir
        if ($imsCarpetaRevision -notmatch '^(/home/enicolalde/bryan/centro_mando_ims_datos/ERP_REVISION_[a-f0-9]{32})/resumen_erp_para_compartir.json$') { throw 'Directorio del diagnostico incompatible; no se consulto el catalogo.' }
        $imsRevisiones = @($Matches[1]) + @($RevisionERPAdicional)
        if (@($imsRevisiones | Select-Object -Unique).Count -ne $imsRevisiones.Count) { throw 'No repitas una revision ERP.' }
        $imsArgumentosRevision = ($imsRevisiones | ForEach-Object { "'$_'" }) -join ' '
        $imsNombreAsociaciones = 'ERP_ASOCIACIONES_' + [guid]::NewGuid().ToString('N')
        $imsAsociar = @'
set -eu
umask 077
test "$(hostname)" = apps
test "$(id -un)" = enicolalde
imsBase='/home/enicolalde/bryan/centro_mando_ims_datos'
imsTrabajo="$imsBase/preparaciones/__REVISION__/codigo"
test "$(realpath -m "$imsTrabajo")" = "$imsTrabajo"
test "$(git -C "$imsTrabajo" rev-parse HEAD)" = __REVISION__
test -z "$(git -C "$imsTrabajo" status --porcelain)"
test "$(stat -c %a "$imsBase")" = 700
cd "$imsTrabajo/enterprise"
for imsDir in "$imsBase/cache" "$imsBase/cache/npm-erp"; do
  test ! -L "$imsDir"
  if [ ! -e "$imsDir" ]; then mkdir "$imsDir"; fi
  test -d "$imsDir"
  test -O "$imsDir"
  test "$(stat -c %a "$imsDir")" = 700
done
test ! -L node_modules
env -u NODE_OPTIONS -u NODE_PATH npm ci --omit=dev --ignore-scripts --no-audit --no-fund --cache "$imsBase/cache/npm-erp" >/dev/null
env -u NODE_OPTIONS -u NODE_PATH /usr/bin/node tools/revisar-asociaciones-erp.mjs --salida "$imsBase/__ASOCIACIONES__" --revisiones __REVISIONES__
'@
        $imsCmd = $imsAsociar.Replace('__REVISION__', $RevisionCodigo).Replace('__ASOCIACIONES__', $imsNombreAsociaciones).Replace('__REVISIONES__', $imsArgumentosRevision).Replace("`r", '')
        $imsB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($imsCmd))
        $imsDatos = & $imsSsh 'enicolalde@192.168.4.94' ("printf %s $imsB64 | base64 -d | env -u BASH_ENV -u ENV bash")
        if ($LASTEXITCODE -ne 0) { throw 'Credenciales copiadas; la revision del catalogo no termino. Los servicios y los datos se conservan.' }
        try { $imsAsociaciones = ($imsDatos -join [Environment]::NewLine) | ConvertFrom-Json } catch { throw 'Respuesta de asociaciones incompatible.' }
        if ($imsAsociaciones.ok -ne $true -or $imsAsociaciones.base_de_datos_modificada -ne $false -or $imsAsociaciones.clientes_asignados -ne 0) { throw 'La revision de asociaciones no se confirmo.' }
        $imsInformeRevision = '/home/enicolalde/bryan/centro_mando_ims_datos/' + $imsNombreAsociaciones + '/revision_asociaciones_erp_para_compartir.json'
        if ($imsAsociaciones.archivo_para_compartir -ne $imsInformeRevision) { throw 'Ruta del informe incompatible.' }
        & $imsScp ('enicolalde@192.168.4.94:' + $imsInformeRevision) (Join-Path $imsSalida 'revision_asociaciones_erp_para_compartir.json')
        if ($LASTEXITCODE -ne 0) { throw 'Revision terminada en el servidor; no se pudo descargar el informe sin claves.' }
        $imsResumen.asociaciones_revisadas = $true
        $imsResumen['asociaciones'] = $imsAsociaciones
        Save-ImsInforme
    }
}
$imsResumen | ConvertTo-Json -Depth 5
Write-Output 'Comparte resumen_envio_erp_para_compartir.json y, si se genero, revision_asociaciones_erp_para_compartir.json. Nunca adjuntes el JSON de credenciales.'
Invoke-Item -LiteralPath $imsSalida
