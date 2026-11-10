#!/usr/bin/env bash
# Ejecutar desde un worktree privado de la revisión aprobada. No activa servicios.
set -euo pipefail
umask 077
test "$(hostname)" = apps
test "$(id -un)" = enicolalde
if [ "$#" -ne 1 ] && [ "$#" -ne 3 ]; then
  echo 'Uso: diagnosticar_erp_lectura.sh /ruta/privada/asociaciones_erp_NO_COMPARTIR.json' >&2
  exit 1
fi
imsBase='/home/enicolalde/bryan/centro_mando_ims_datos'
imsEnterprise="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
imsCodigo="$(dirname -- "$imsEnterprise")"
imsRevision="$(git -C "$imsCodigo" rev-parse HEAD)"
[[ "$imsRevision" =~ ^[a-f0-9]{40}$ ]]
test "$imsCodigo" = "$imsBase/preparaciones/$imsRevision/codigo"
test "$(realpath -m "$imsCodigo")" = "$imsCodigo"
test -z "$(git -C "$imsCodigo" status --porcelain)"
test "$(stat -c %a "$imsBase")" = 700
read -r imsNonce < /proc/sys/kernel/random/uuid
imsSalida="$imsBase/ERP_LECTURA_${imsNonce//-/}"
env -u NODE_OPTIONS -u NODE_PATH /usr/bin/node --max-old-space-size=256 \
  "$imsEnterprise/tools/diagnosticar-erp-lectura.mjs" \
  --verificar-lectura-erp --plan "$1" --salida "$imsSalida" "${@:2}"
