#!/usr/bin/env bash
set -euo pipefail
umask 077
test "$(hostname)" = apps
test "$(id -un)" = enicolalde
test "$#" -eq 1
imsRepo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
imsRevision="$(git -C "$imsRepo" rev-parse HEAD)"
imsDatos='/home/enicolalde/bryan/centro_mando_ims_datos'
test "$imsRepo" = "$imsDatos/preparaciones/$imsRevision/codigo"
test -z "$(git -C "$imsRepo" status --porcelain)"
cd "$imsRepo/enterprise"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund --cache "$imsDatos/cache/npm"
npm test
python3 -m unittest discover -s tests -p '*_test.py'
python3 deploy/preparar_erp.py --registro "$1" --creacion
sudo -v
python3 deploy/preparar_creacion_erp.py
python3 deploy/actualizar_piloto.py --revision "$imsRevision" \
  --conteos-esperados 352 --filas-esperadas 97822 --operacion-nativa --erp-consulta --erp-creacion
