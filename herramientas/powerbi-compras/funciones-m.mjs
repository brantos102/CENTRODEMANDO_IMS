export const prepararBase = `(Datos as table, Cabeceras as list) as table =>
let
 Limpiar = (s as text) as text => Text.Trim(Text.Replace(Text.Replace(s, Character.FromNumber(160), " "), Character.FromNumber(8239), " ")),
 Originales = Table.ColumnNames(Datos),
 Nombres = List.Transform(Originales, Limpiar),
 Unicos = if List.Count(Nombres)=List.Count(List.Distinct(Nombres)) then Datos else error "Encabezados repetidos al quitar espacios; revise la hoja de origen",
 Normalizada = Table.TransformColumnNames(Unicos, Limpiar),
 Seleccion = Table.SelectColumns(Normalizada, Cabeceras, MissingField.Error),
 Numeradas = Table.AddIndexColumn(Seleccion, "FilaOrigen", 2, 1, Int64.Type)
in Numeradas`;

export const leerFecha = `(Valor as any, Hoja as text, Fila as number) as nullable date =>
let
 Fallar = () => error Error.Record("FechaNoInterpretable", "Revise la fecha publicada en Google Sheets", [Hoja=Hoja, FilaOrigen=Fila, ValorOriginal=Valor]),
 Texto = if Value.Is(Valor,type text) then Text.Trim(Valor) else "",
 Partes = Text.Split(Text.Lower(Text.Replace(Texto,".","")),"-"),
 Meses = {"ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"},
 Abreviatura = if List.Count(Partes)=2 then Text.Start(Text.Trim(Partes{0}),3) else "",
 Mes = List.PositionOf(Meses, if Abreviatura="set" then "sep" else Abreviatura)+1,
 AnioTexto = if List.Count(Partes)=2 then Text.Trim(Partes{1}) else "",
 EsPeriodo = Mes>0 and List.Contains({2,4},Text.Length(AnioTexto)) and Text.Select(AnioTexto,{"0".."9"})=AnioTexto,
 Periodo = () => let
  NumeroAnio = Number.FromText(AnioTexto,"en-US"),
  Anio = if Text.Length(AnioTexto)=2 then 2000+NumeroAnio else NumeroAnio
 in #date(Anio,Mes,1),
 Resultado = if Valor=null or (Value.Is(Valor,type text) and Texto="") then null
 else if Value.Is(Valor,type date) or Value.Is(Valor,type datetime) or Value.Is(Valor,type datetimezone) then Date.From(Valor)
 else if Value.Is(Valor,type text) then let
  Intento = try (if EsPeriodo then Periodo() else Date.FromText(Texto,[Culture="es-EC"]))
 in if Intento[HasError] then Fallar() else Intento[Value]
 else Fallar()
in Resultado`;
