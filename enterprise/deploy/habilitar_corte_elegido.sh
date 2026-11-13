#!/usr/bin/env bash
# Importa solo el plan elegido y actualiza únicamente el backend propio.
set -euo pipefail
umask 077
test "$(hostname)" = apps
test "$(id -un)" = enicolalde
test "$#" -eq 3
imsRevision="$1"
imsArchivo="$2"
imsPlan="$3"
[[ "$imsRevision" =~ ^[a-f0-9]{40}$ ]]
test "$imsPlan" = '2c00275f02bde5699a2c0b121d6a8a1c633b16002a83d8494fcf942b201d29ba'
imsCodigo='/home/enicolalde/bryan/centro_mando_ims'
imsDatos='/home/enicolalde/bryan/centro_mando_ims_datos'
[[ "$imsArchivo" =~ ^"$imsDatos"/entrada/ims-abiertos-[a-f0-9]{32}\.zip$ ]]
test "$(realpath -m "$imsCodigo")" = "$imsCodigo"
test "$(realpath -m "$imsDatos")" = "$imsDatos"
test "$(realpath -m "$imsArchivo")" = "$imsArchivo"
test -O "$imsArchivo"
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
npm test
python3 -m unittest discover -s tests -p '*_test.py'
python3 deploy/preparar_erp.py --registro "$imsDatos/ERP_LECTURA_5b24e0016a134b1e9aae96f878faf9ff/registro_erp_runtime_NO_COMPARTIR.json" --creacion
python3 deploy/verificar_unidades.py
sudo -v
python3 deploy/importar_abiertos.py --importar --zip "$imsArchivo" --plan-id "$imsPlan"
python3 deploy/actualizar_piloto.py --revision "$imsRevision" --conteos-esperados 352 --filas-esperadas 97822 --operacion-nativa --erp-consulta --erp-creacion
