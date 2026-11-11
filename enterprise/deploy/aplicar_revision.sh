#!/usr/bin/env bash
# Lanzador de una revisión Git fijada. Funciona también mediante git show | bash.
set -euo pipefail
umask 077
test "$(hostname)" = apps
test "$(id -un)" = enicolalde
test "$#" -eq 1
imsRevision="$1"
[[ "$imsRevision" =~ ^[a-f0-9]{40}$ ]]
imsCodigo='/home/enicolalde/bryan/centro_mando_ims'
imsDatos='/home/enicolalde/bryan/centro_mando_ims_datos'
test "$(realpath -m "$imsCodigo")" = "$imsCodigo"
test "$(realpath -m "$imsDatos")" = "$imsDatos"
test -O "$imsDatos"
test "$(stat -c %a "$imsDatos")" = 700
test -z "$(git -C "$imsCodigo" status --porcelain)"
git -C "$imsCodigo" merge-base --is-ancestor "$imsRevision" FETCH_HEAD
imsTrabajo="$imsDatos/preparaciones/$imsRevision/codigo"
test "$(realpath -m "$imsTrabajo")" = "$imsTrabajo"
if [ ! -e "$imsTrabajo" ]; then
  git -C "$imsCodigo" worktree add --detach "$imsTrabajo" "$imsRevision"
fi
test "$(git -C "$imsTrabajo" rev-parse HEAD)" = "$imsRevision"
test -z "$(git -C "$imsTrabajo" status --porcelain)"
bash "$imsTrabajo/enterprise/deploy/actualizar_operacion.sh" \
  "$imsDatos/ERP_LECTURA_5b24e0016a134b1e9aae96f878faf9ff/registro_erp_runtime_NO_COMPARTIR.json"
