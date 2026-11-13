#!/usr/bin/env bash
# Recupera datos administrativos y publica solo el servicio propio, con reversión.
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
cd "$imsTrabajo/enterprise"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund --cache "$imsDatos/cache/npm"
npm test
python3 -m unittest discover -s tests -p '*_test.py'
python3 deploy/preparar_erp.py --registro "$imsDatos/ERP_LECTURA_5b24e0016a134b1e9aae96f878faf9ff/registro_erp_runtime_NO_COMPARTIR.json" --creacion
sudo -v
python3 deploy/preparar_centro.py
python3 deploy/actualizar_piloto.py --revision "$imsRevision" --conteos-esperados 352 --filas-esperadas 97822 --operacion-nativa --erp-consulta --erp-creacion --centro
python3 deploy/activar_usuarios_centro.py
