#!/usr/bin/env bash
# Solo lectura. Ejecutar en la terminal Linux del servidor empresarial.
ss -lnt '( sport = :3003 or sport = :8445 )'
python3 - <<'PY'
from pathlib import Path
import re
pattern=re.compile(r'(?<!\d)(3003|8445)(?!\d)')
seen=set()
for root in ('/etc/apache2','/etc/systemd/system','/run/systemd/system','/lib/systemd/system','/etc/default','/etc/supervisor'):
 base=Path(root)
 if not base.exists():continue
 for p in base.rglob('*'):
  try:
   if not p.is_file() or p.stat().st_size>1000000:continue
   real=p.resolve()
   if real in seen:continue
   seen.add(real)
   ports=sorted(set(pattern.findall(p.read_text(errors='replace'))),key=int)
   if ports:print(str(p)+': '+', '.join(ports))
  except OSError:print('NO LEGIBLE: '+str(p))
PY
if command -v ufw >/dev/null 2>&1; then
  ufw status
fi
df -h .
free -h
