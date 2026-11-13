#!/usr/bin/env python3
"""Transporte SMTP TLS. Recibe secretos por stdin; no escribe archivos ni registros."""
import base64
import json
import re
import smtplib
import ssl
import sys
from email.message import EmailMessage

def main():
 raw=sys.stdin.buffer.read(15000001)
 if len(raw)>15000000:raise ValueError()
 s=json.loads(raw);c=s['config'];m=s['mensaje']
 if c['puerto'] not in (465,587) or not re.fullmatch(r'(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,63}',c['host']):raise ValueError()
 if not 1<=len(m['destinatarios'])<=30 or any('\n' in x or '\r' in x for x in m['destinatarios']):raise ValueError()
 email=EmailMessage();email['From']=c['remitente'];email['To']=', '.join(m['destinatarios']);email['Subject']=m['asunto'];email['Message-ID']='<'+m['id']+'@centromando.itsanet>';email.set_content(m['texto'])
 if m.get('adjunto'):
  a=m['adjunto'];b=base64.b64decode(a['base64'],validate=True)
  if len(b)>10*1024*1024 or a['nombre']!='inventarios.zip':raise ValueError()
  email.add_attachment(b,maintype='application',subtype='zip',filename=a['nombre'])
 ctx=ssl.create_default_context()
 if c['puerto']==465:server=smtplib.SMTP_SSL(c['host'],465,timeout=20,context=ctx)
 else:
  server=smtplib.SMTP(c['host'],587,timeout=20);server.ehlo();server.starttls(context=ctx);server.ehlo()
 try:
  server.login(c['usuario'],c['password']);rechazados=server.send_message(email)
  if rechazados:raise ValueError()
 finally:
  try:server.quit()
  except Exception:pass
 print('OK')

if __name__=='__main__':
 try:main()
 except Exception:print('NO_CONFIRMADO');raise SystemExit(1)
