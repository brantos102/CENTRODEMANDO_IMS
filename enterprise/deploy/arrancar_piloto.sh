#!/usr/bin/env bash
# Arranque local del lector ya preparado. No instala ni recarga Apache.
set -euo pipefail
umask 077

imsApp='/home/enicolalde/bryan/centro_mando_ims'
imsPiloto='/home/enicolalde/bryan/centro_mando_ims_datos/piloto'
imsServicio='centro-mando-ims-ensayo.service'
imsDestino="/etc/systemd/system/$imsServicio"
imsSolicitado=0

imsAlSalir() {
  imsSalida=$?
  trap - EXIT
  if [ "$imsSalida" -ne 0 ]; then
    if [ "$imsSolicitado" -eq 1 ]; then
      if ! sudo -n systemctl stop "$imsServicio"; then
        echo 'No se pudo confirmar la detención del servicio propio; revisar su estado.' >&2
      fi
    fi
    echo 'Arranque detenido. Se conservan datos, cuenta y archivos propios para revisión. Apache no se modificó.' >&2
  fi
  exit "$imsSalida"
}
trap imsAlSalir EXIT

if [ "$(hostname)" != 'apps' ] || [ "$(id -un)" != 'enicolalde' ] ||
   [ "$(readlink -f "${BASH_SOURCE[0]}")" != "$imsApp/enterprise/deploy/arrancar_piloto.sh" ]; then
  echo 'Ejecuta esta revisión dentro del proyecto exclusivo en apps como enicolalde, sin sudo delante de bash.' >&2
  exit 1
fi

# Comparar los borradores con la plantilla revisada, sin mostrar sus secretos.
imsHash=$(/usr/bin/python3 - <<'PY'
import hashlib,json,re,sys
from pathlib import Path
sys.path.insert(0, '/home/enicolalde/bryan/centro_mando_ims/enterprise/deploy')
import preparar_piloto as p
try:
    carpeta=p.privado(p.APP.parent/'centro_mando_ims_datos', True)
    carpeta=p.privado(carpeta/'piloto', True)
    s=json.loads(p.privado(carpeta/'solicitud.json').read_text())
    p.exigir(s.get('version')==1 and bool(re.fullmatch('[a-f0-9]{64}',s.get('clave_mysql',''))), 'Solicitud incompatible.')
    p.exigir(s['migracion'].get('MYSQL_DATABASE')==p.DATABASE and s['migracion'].get('MYSQL_USER')=='ims_cm_migracion', 'Ensayo incompatible.')
    archivos=p.plantillas(p.APP,carpeta)
    for nombre in ('piloto.env','centro-mando-ims-ensayo.service'):
        esperado=archivos[nombre].replace('{clave}',s['clave_mysql'])
        p.exigir(p.privado(carpeta/nombre).read_text()==esperado, 'Configuración privada modificada; revisar antes de arrancar.')
    print(hashlib.sha256((carpeta/'centro-mando-ims-ensayo.service').read_bytes()).hexdigest())
except Exception:
    sys.exit('El piloto privado no coincide con los archivos preparados. No se muestran credenciales.')
PY
)

sudo -v
if [ -n "$(ss -H -lnt '( sport = :3003 or sport = :8445 )')" ]; then
  echo '3003 o 8445 están ocupados; no se libera ningún puerto.' >&2
  exit 1
fi

for imsRaiz in /etc/systemd/system /run/systemd/system /lib/systemd/system /usr/lib/systemd/system; do
  for imsRuta in "$imsRaiz/$imsServicio" "$imsRaiz/$imsServicio.d"; do
    if sudo -n test -e "$imsRuta" || sudo -n test -L "$imsRuta"; then
      echo 'Ya existe una unidad o complemento con este nombre. Se conserva; revisar antes de continuar.' >&2
      exit 1
    fi
  done
done
imsCarga=$(sudo -n systemctl show "$imsServicio" --property=LoadState --value) || true
if [ "$imsCarga" != 'not-found' ]; then
  echo 'La unidad ya existe o no se pudo consultar systemd; no se sustituye.' >&2
  exit 1
fi

# Un puerto libre puede estar reservado por un servicio detenido.
if sudo -n grep -RIlE --include='*.conf' --include='*.service' --include='*.socket' \
  '(^|[^0-9])(3003|8445)([^0-9]|$)' /etc/apache2 /etc/systemd/system /lib/systemd/system; then
  echo 'Hay referencias a los puertos del piloto; revisar sin modificar esas configuraciones.' >&2
  exit 1
else
  imsGrep=$?
  if [ "$imsGrep" -ne 1 ]; then
    echo 'No se pudo completar la comprobación de referencias de puertos.' >&2
    exit 1
  fi
fi

sudo -n systemd-analyze verify "$imsPiloto/$imsServicio"

# Creación exclusiva: ni siquiera una colisión concurrente sobrescribe una unidad.
sudo -n /usr/bin/python3 -c '
import hashlib,os,sys
contenido=sys.stdin.buffer.read(16384)
if hashlib.sha256(contenido).hexdigest()!=sys.argv[1]:
    sys.exit("La unidad cambió durante la comprobación; no se instala.")
fd=os.open("/etc/systemd/system/centro-mando-ims-ensayo.service",os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o644)
with os.fdopen(fd,"wb") as f:
    os.fchmod(f.fileno(),0o644)
    f.write(contenido)
    f.flush()
    os.fsync(f.fileno())
' "$imsHash" < "$imsPiloto/$imsServicio"

sudo -n systemctl daemon-reload
imsSolicitado=1
sudo -n systemctl start "$imsServicio"

imsListo=0
for imsIntento in {1..15}; do
  if curl --noproxy '*' --fail --silent --max-time 2 http://127.0.0.1:3003/salud |
    /usr/bin/python3 -c 'import json,sys; r=json.load(sys.stdin); sys.exit(0 if r.get("ok") is True and r.get("servicio")=="centro-mando-ims-candidata" else 1)' 2>/dev/null; then
    imsListo=1
    break
  fi
  sleep 1
done
if [ "$imsListo" -ne 1 ]; then
  echo 'El backend propio no respondió; se detendrá solo su servicio.' >&2
  exit 1
fi
imsPid=$(sudo -n systemctl show "$imsServicio" --property=MainPID --value)
imsEscucha=$(ss -H -lntp '( sport = :3003 )')
if [[ ! "$imsPid" =~ ^[1-9][0-9]*$ ]] ||
   [ "$(awk '{print $4}' <<< "$imsEscucha")" != '127.0.0.1:3003' ] ||
   [[ "$imsEscucha" != *"pid=$imsPid,"* ]]; then
  echo 'La escucha no corresponde al PID propio en 127.0.0.1:3003.' >&2
  exit 1
fi

echo '{"ok":true,"backend_activo":true,"escucha":"127.0.0.1:3003","salud_http":true,"modo_configurado":"solo_lectura","apache_modificado":false,"https_8445_activado":false,"habilitado_al_reiniciar":false,"publicacion_kpi":false}'
