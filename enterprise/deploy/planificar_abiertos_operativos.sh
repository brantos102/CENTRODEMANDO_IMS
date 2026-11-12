#!/usr/bin/env bash
# Lee la copia SQL ya verificada y genera archivos privados; no activa servicios.
set -euo pipefail
umask 077
test "$(hostname)" = apps
test "$(id -un)" = enicolalde
test "$#" -eq 3
imsRevision="$1"
imsArchivo="$2"
imsCopia="$3"
[[ "$imsRevision" =~ ^[a-f0-9]{40}$ ]]
[[ "$imsCopia" =~ ^[a-f0-9]{64}$ ]]
imsCodigo='/home/enicolalde/bryan/centro_mando_ims'
imsDatos='/home/enicolalde/bryan/centro_mando_ims_datos'
[[ "$imsArchivo" =~ ^"$imsDatos"/entrada/ims-abiertos-[a-f0-9]{32}\.zip$ ]]
test "$(realpath -m "$imsCodigo")" = "$imsCodigo"
test "$(realpath -m "$imsDatos/entrada")" = "$imsDatos/entrada"
test "$(realpath -m "$imsArchivo")" = "$imsArchivo"
test -O "$imsDatos"
test -O "$imsArchivo"
test -f "$imsArchivo"
test "$(stat -c %a "$imsDatos")" = 700
test "$(stat -c %a "$imsDatos/entrada")" = 700
test "$(stat -c %a "$imsArchivo")" = 600
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
npm ci --omit=dev --ignore-scripts --no-audit --no-fund --cache "$imsDatos/cache/npm"
node --test tests/copia-abiertos.test.mjs
python3 -m unittest discover -s tests -p 'plan_abiertos_operativos_test.py'
python3 deploy/planificar_abiertos_operativos.py --zip "$imsArchivo" --copia-id "$imsCopia"
