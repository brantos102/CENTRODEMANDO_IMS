#!/usr/bin/env bash
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
test -z "$(git -C "$imsCodigo" status --porcelain)"
git -C "$imsCodigo" merge-base --is-ancestor "$imsRevision" FETCH_HEAD
imsTrabajo="$imsDatos/preparaciones/$imsRevision/codigo"
test "$(realpath -m "$imsTrabajo")" = "$imsTrabajo"
if [ ! -e "$imsTrabajo" ]; then git -C "$imsCodigo" worktree add --quiet --detach "$imsTrabajo" "$imsRevision"; fi
test "$(git -C "$imsTrabajo" rev-parse HEAD)" = "$imsRevision"
test -z "$(git -C "$imsTrabajo" status --porcelain)"
test ! -L "$imsTrabajo/enterprise/node_modules"
test "$(realpath -m "$imsDatos/cache/npm")" = "$imsDatos/cache/npm"
cd "$imsTrabajo/enterprise"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund --cache "$imsDatos/cache/npm" >&2
python3 deploy/diagnosticar_centro.py
