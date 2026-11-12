"""Fechas del legado ITSANET: día/mes/año, ISO y valores tipados de Sheets.

El perfil DMA está documentado en COD_INVENTARIOS (dd/MM/yy HH:mm:ss),
en WMS V124 (dd/MM/yyyy) y en el consolidador (dd/MM/yyyy HH:mm:ss).
No usa nombres de archivo, fechas del sistema ni la configuración regional del PC.
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_FLOOR
import re
from zoneinfo import ZoneInfo

REGLA_FECHAS='itsanet-dma-2000-2099-v1'
DMA=re.compile(r'(\d{1,2})/(\d{1,2})/(\d{4}|\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?')
ISO=re.compile(r'(20\d{2}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})?)?')

def zona_original(zona):
    if zona in ('UTC','GMT','Z'):return timezone.utc
    m=re.fullmatch(r'(?:GMT|UTC)([+-])(\d{1,2})(?::(\d{2}))?',zona or '')
    if m:
        signo,horas,minutos=m.groups();h=int(horas);mi=int(minutos or 0)
        if h>14 or mi>59 or h==14 and mi:raise ValueError('ZONA_NO_RECONOCIDA')
        return timezone(timedelta(minutes=(h*60+mi)*(1 if signo=='+' else -1)))
    return ZoneInfo(zona)

def clase_formato(formato):
    f=str(formato or '').lower().strip()
    f=re.sub(r'"([^"\n]*)"',lambda m:m[1],f)
    f=re.sub(r'\[[^\]]*\]','',f)
    if re.match(r'^d{1,2}/m{1,2}/y{2}(?:y{2})?(?:$|[ ;t])',f):return 'DMA'
    if re.match(r'^yyyy-m{1,2}-d{1,2}(?:$|[ ;t])',f):return 'ISO'
    if re.match(r'^m{1,2}/d{1,2}/y{2}(?:y{2})?(?:$|[ ;t])',f):return 'MES_PRIMERO'
    return 'OTRO'

def analizar_fecha(celda,zona):
    tipo=celda.get('tipo') if celda else None;v=celda.get('valor') if celda else None
    if not celda or v is None or tipo=='s' and not str(v).strip():
        return {'fecha':None,'perfil':'VACIA','estado':'VACIA','motivo':None}
    raw=str(v).strip();perfil='TIPO_NO_FECHA';motivo='FORMATO_NO_RECONOCIDO'
    try:
        if len(raw)>128:raise ValueError()
        dma=DMA.fullmatch(raw) if tipo=='s' else None
        iso=ISO.fullmatch(raw) if tipo in ('s','d') else None
        if dma:
            d,m,y,h,mi,s,frac=dma.groups();perfil='TEXTO_DMA_ANO'+str(len(y))+('_HORA' if h is not None else '')
            if clase_formato(celda.get('formato'))=='MES_PRIMERO':motivo='FORMATO_FECHA_CONTRADICTORIO';raise ValueError()
            ano=int(y)+(2000 if len(y)==2 else 0);resultado=date(ano,int(m),int(d))
            if h is not None:datetime(ano,int(m),int(d),int(h),int(mi),int(s or 0))
        elif iso:
            perfil=('FECHA_TIPADA' if tipo=='d' else 'TEXTO_ISO')+('_CON_ZONA' if iso[5] else '_LOCAL' if iso[2] else '_DIA')
            if iso[2]:
                instante=datetime.fromisoformat(raw.replace('Z','+00:00'))
                if instante.tzinfo:resultado=instante.astimezone(zona_original(zona)).date()
                else:resultado=instante.date()
            else:resultado=date.fromisoformat(raw)
            if tipo=='d' and not iso[5]:motivo='FECHA_TIPADA_SIN_ZONA';raise ValueError()
        elif tipo=='n':
            perfil='NUMERO_CON_FORMATO_'+clase_formato(celda.get('formato'))
            if clase_formato(celda.get('formato')) not in ('DMA','ISO'):motivo='NUMERO_SIN_FORMATO_FECHA';raise ValueError()
            serial=Decimal(raw)
            if not serial.is_finite() or not Decimal(0)<=serial<Decimal(100000):raise ValueError()
            # Sheets representa el día local desde 1899-12-30. La fracción no
            # se redondea al día siguiente y no se convierte como epoch UTC.
            resultado=date(1899,12,30)+timedelta(days=int(serial.to_integral_value(rounding=ROUND_FLOOR)))
        else:
            perfil='TEXTO_OTRO' if tipo=='s' else 'TIPO_'+str(tipo).upper()
            raise ValueError()
        if not 2000<=resultado.year<=2099:motivo='FECHA_FUERA_RANGO_NATIVO';raise ValueError()
        return {'fecha':resultado.isoformat(),'perfil':perfil,'estado':'INTERPRETADA','motivo':None}
    except (ValueError,TypeError,KeyError,InvalidOperation,OverflowError):
        return {'fecha':None,'perfil':perfil,'estado':'REQUIERE_REGLA','motivo':motivo}

def fecha_celda(celda,zona):
    resultado=analizar_fecha(celda,zona)
    if resultado['estado']=='REQUIERE_REGLA':raise ValueError(resultado['motivo'])
    return resultado['fecha']
