"""Fechas del legado ITSANET: día/mes/año, ISO y valores tipados de Sheets.

El perfil DMA está documentado en COD_INVENTARIOS (dd/MM/yy HH:mm:ss),
en WMS V124 (dd/MM/yyyy) y en el consolidador (dd/MM/yyyy HH:mm:ss).
No usa nombres de archivo, fechas del sistema ni la configuración regional del PC.
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_FLOOR
from functools import lru_cache
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

REGLA_FECHAS='itsanet-dia-original-2000-2099-v2'
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

@lru_cache(maxsize=128)
def contexto_zona(zona):
    if zona is None or zona=='':return None,'AUSENTE'
    try:return zona_original(zona),'DISPONIBLE'
    except ZoneInfoNotFoundError:return None,'NO_DISPONIBLE'
    except (ValueError,TypeError):return None,'INVALIDA'

def dia_visible(celda,instante):
    """Día mostrado por Sheets, con formato explícito y coherencia con UTC.

    No inventa una zona. Comprueba que el intervalo de precisión del texto
    visible sea compatible con el instante UTC y un desplazamiento de ±14 h.
    """
    texto=str(celda.get('visible','')).strip();fmt=clase_formato(celda.get('formato'))
    if len(texto)>128:return None,'VISIBLE_NO_INTERPRETABLE'
    dma=DMA.fullmatch(texto) if fmt in ('DMA','MES_PRIMERO') else None
    iso=ISO.fullmatch(texto) if fmt=='ISO' else None
    try:
        if dma:
            d,m,y,h,mi,s,frac=dma.groups()
            if fmt=='MES_PRIMERO':d,m=m,d
            ano=int(y)+(2000 if len(y)==2 else 0)
            inicio=datetime(ano,int(m),int(d),int(h or 0),int(mi or 0),int(s or 0),int((frac or '').ljust(6,'0')[:6]))
            paso=timedelta(days=1) if h is None else timedelta(minutes=1) if s is None else timedelta(seconds=1) if not frac else timedelta(microseconds=10**(6-min(6,len(frac))))
        elif iso:
            inicio=datetime.fromisoformat(texto.replace('Z','+00:00')).replace(tzinfo=None)
            frac=re.search(r'\.(\d+)',texto)
            paso=timedelta(days=1) if iso[2] is None else timedelta(seconds=1) if not frac else timedelta(microseconds=10**(6-min(6,len(frac[1]))))
        else:return None,'VISIBLE_NO_INTERPRETABLE'
    except (ValueError,TypeError):return None,'VISIBLE_NO_INTERPRETABLE'
    utc=instante.astimezone(timezone.utc).replace(tzinfo=None)
    if not (inicio<=utc+timedelta(hours=14) and inicio+paso>utc-timedelta(hours=14)):
        return None,'VISIBLE_INCOMPATIBLE_CON_INSTANTE'
    return inicio.date(),None

def analizar_fecha(celda,zona):
    tipo=celda.get('tipo') if celda else None;v=celda.get('valor') if celda else None
    if not celda or v is None or tipo=='s' and not str(v).strip():
        return {'fecha':None,'perfil':'VACIA','estado':'VACIA','motivo':None}
    raw=str(v).strip();perfil='TIPO_NO_FECHA';motivo='FORMATO_NO_RECONOCIDO';zona_estado=None;origen_dia=None
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
                motivo='FECHA_ISO_INVALIDA'
                instante=datetime.fromisoformat(raw.replace('Z','+00:00'))
                if instante.tzinfo:
                    tz,zona_estado=contexto_zona(zona if isinstance(zona,(str,type(None))) else None)
                    visible,motivo_visible=dia_visible(celda,instante)
                    if tz is not None:
                        resultado=instante.astimezone(tz).date();origen_dia='ZONA_LIBRO'
                        if visible is not None and visible!=resultado:motivo='DIA_VISIBLE_DIFIERE_DE_ZONA';raise ValueError()
                        if motivo_visible=='VISIBLE_INCOMPATIBLE_CON_INSTANTE':motivo=motivo_visible;raise ValueError()
                    elif visible is not None:
                        resultado=visible;origen_dia='DIA_VISIBLE_DE_SHEETS'
                    else:motivo='ZONA_'+zona_estado+'_'+motivo_visible;raise ValueError()
                else:resultado=instante.date()
            else:resultado=date.fromisoformat(raw)
            if tipo=='d' and not iso[5]:motivo='FECHA_TIPADA_SIN_ZONA';raise ValueError()
        elif tipo=='n':
            perfil='NUMERO_CON_FORMATO_'+clase_formato(celda.get('formato'))
            if clase_formato(celda.get('formato')) not in ('DMA','ISO','MES_PRIMERO'):motivo='NUMERO_SIN_FORMATO_FECHA';raise ValueError()
            serial=Decimal(raw)
            if not serial.is_finite() or not Decimal(0)<=serial<Decimal(100000):raise ValueError()
            # Sheets representa el día local desde 1899-12-30. La fracción no
            # se redondea al día siguiente y no se convierte como epoch UTC.
            resultado=date(1899,12,30)+timedelta(days=int(serial.to_integral_value(rounding=ROUND_FLOOR)))
        else:
            perfil='TEXTO_OTRO' if tipo=='s' else 'TIPO_'+str(tipo).upper()
            raise ValueError()
        if not 2000<=resultado.year<=2099:motivo='FECHA_FUERA_RANGO_NATIVO';raise ValueError()
        return {'fecha':resultado.isoformat(),'perfil':perfil,'estado':'INTERPRETADA','motivo':None,**({'origen_dia':origen_dia,'zona_fuente_estado':zona_estado,'visible_formato':clase_formato(celda.get('formato')),'visible_presente':bool(str(celda.get('visible','')).strip())} if zona_estado else {})}
    except (ValueError,TypeError,KeyError,InvalidOperation,OverflowError):
        return {'fecha':None,'perfil':perfil,'estado':'REQUIERE_REGLA','motivo':motivo,**({'zona_fuente_estado':zona_estado,'visible_formato':clase_formato(celda.get('formato')),'visible_presente':bool(str(celda.get('visible','')).strip())} if zona_estado else {})}

def fecha_celda(celda,zona):
    resultado=analizar_fecha(celda,zona)
    if resultado['estado']=='REQUIERE_REGLA':raise ValueError(resultado['motivo'])
    return resultado['fecha']
