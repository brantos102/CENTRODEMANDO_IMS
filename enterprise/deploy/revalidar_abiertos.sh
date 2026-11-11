#!/usr/bin/env bash
# Revisa un ZIP ya enviado. No arranca la aplicación ni accede a MySQL.
set -euo pipefail
umask 077
test "$(hostname)" = apps
test "$(id -un)" = enicolalde
test "$#" -eq 2
imsRevision="$1"
imsArchivo="$2"
[[ "$imsRevision" =~ ^[a-f0-9]{40}$ ]]
imsCodigo='/home/enicolalde/bryan/centro_mando_ims'
imsDatos='/home/enicolalde/bryan/centro_mando_ims_datos'
[[ "$imsArchivo" =~ ^"$imsDatos"/entrada/ims-abiertos-[a-f0-9]{32}\.zip$ ]]
test "$(realpath -m "$imsCodigo")" = "$imsCodigo"
test "$(realpath -m "$imsDatos/entrada")" = "$imsDatos/entrada"
test "$(realpath -m "$imsArchivo")" = "$imsArchivo"
test -O "$imsDatos"
test -O "$imsDatos/entrada"
test -O "$imsArchivo"
test -f "$imsArchivo"
test "$(stat -c %a "$imsDatos")" = 700
test "$(stat -c %a "$imsDatos/entrada")" = 700
test "$(stat -c %a "$imsArchivo")" = 600
test -z "$(git -C "$imsCodigo" status --porcelain)"
git -C "$imsCodigo" merge-base --is-ancestor "$imsRevision" FETCH_HEAD
imsTrabajo="$imsDatos/preparaciones/$imsRevision/codigo"
test "$(realpath -m "$imsTrabajo")" = "$imsTrabajo"
if [ ! -e "$imsTrabajo" ]; then
  git -C "$imsCodigo" worktree add --quiet --detach "$imsTrabajo" "$imsRevision"
fi
test "$(git -C "$imsTrabajo" rev-parse HEAD)" = "$imsRevision"
test -z "$(git -C "$imsTrabajo" status --porcelain)"
read -r imsNonce < /proc/sys/kernel/random/uuid
imsSalida="$imsDatos/REVALIDACION_ABIERTOS_${imsNonce//-/}"
mkdir -- "$imsSalida"
imsInforme="$imsSalida/resumen_revalidacion_para_compartir.json"
imsEstado=0
if python3 "$imsTrabajo/enterprise/tools/validar_corte_abiertos.py" \
  --zip "$imsArchivo" --salida "$imsSalida/validacion" > "$imsInforme"; then
  :
else
  imsEstado=$?
fi
cat -- "$imsInforme"
printf '\nResumen para compartir: %s\n' "$imsInforme"
exit "$imsEstado"
