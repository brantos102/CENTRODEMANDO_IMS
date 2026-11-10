#!/usr/bin/env bash
# Solo en una preparación Git aislada. No utiliza repositorios de otros proyectos.
set -euo pipefail
umask 077
if [[ "$(hostname)" != apps || "$(id -un)" != enicolalde ]]; then
  echo 'Detenido: ejecutar en apps como enicolalde.' >&2
  exit 1
fi
imsRepo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
imsRevision="$(git -C "$imsRepo" rev-parse HEAD)"
imsDatos='/home/enicolalde/bryan/centro_mando_ims_datos'
if [[ "$imsRepo" != "$imsDatos/preparaciones/$imsRevision/codigo" ]] ||
   [[ -n "$(git -C "$imsRepo" status --porcelain)" ]]; then
  echo 'Detenido: se requiere la preparación aislada y limpia de esta revisión.' >&2
  exit 1
fi
cd "$imsRepo/enterprise"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund --cache "$imsDatos/cache/npm"
npm test
python3 -m unittest discover -s tests -p '*_test.py'
sudo -v
python3 deploy/preparar_operacion.py --preparar
python3 deploy/actualizar_piloto.py --revision "$imsRevision" \
  --conteos-esperados 352 --filas-esperadas 97822 --operacion-nativa
