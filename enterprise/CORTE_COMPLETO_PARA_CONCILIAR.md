# Capturar el estado completo para conciliar la migración

El plan `53b13ebc1e15e0eacb9e9e80ef2b750c0aade14c8586748f65721a9f4adef3de` confirmó que las 8.682 filas ya tienen sus fechas interpretadas. Conserva 22 conteos de la selección, 630 productos pendientes de iniciar, 984 filas auxiliares y un archivo entregado de 147 productos separado para conciliación. La aplicación actual y el histórico permanecen operativos.

La revisión de la cabecera replica `marcarInicioInventario_` y `actualizarColumnasAC` de COD_INVENTARIOS: si un archivo tiene un único código y distintas fechas por línea, puede usar la fecha de A2 como inicio del inventario cuando C2 coincide con ese código y A2 se interpreta correctamente. Las fechas individuales permanecen intactas. No elige el mínimo de fechas, deduce la fecha del nombre ni aplica esta regla a la separación por código/fecha confirmada para la fila 317.

## Qué falta obtener

El maestro anterior tenía completas solo una de cinco hojas administrativas. Para conciliar el estado actual se necesita una captura nueva con:

- Todos los archivos del panel que todavía no estén exactamente Entregado, incluidos los que siguen en validación. También conserva las referencias con ID y cliente vacío para evitar perder sus capturas; no infiere ni asigna su cliente.
- Panel, Usuarios sin sus contraseñas, cronogramas y demás maestros permitidos.
- **INVENTARIOS y REGISTRO del libro maestro**, que contienen el consolidado actualizado y su auditoría. Permiten conciliar también los inventarios que pasaron a Entregado y dejaron de figurar entre los abiertos.
- La plantilla INVENTARIOS_UIO e Interfaz, conservando sus hojas de datos permitidas.

La nueva función `IMSPrepararCorteCompleto20261112` crea una carpeta privada independiente y conserva íntegra la carpeta anterior. La captura admite 512 columnas y mantiene fragmentos de hasta 10.000 celdas, 250 filas y 8 MiB. El ZIP de entrada sigue limitado a 512 MiB comprimidos; la suma descomprimida se limita a 1 GiB únicamente en este modo completo, leyendo fragmentos acotados. El modo antiguo conserva su límite de 512 MiB. No instala dependencias, consulta APIs ERP, lee ScriptProperties ni cambia hojas, estados, permisos originales, disparadores o despliegues.

## Momento de captura

Los operadores terminan a las **17:30, hora de Ecuador**. `dash_consolidarAuditoria` comienza a las **18:30**. Obtener la captura para el corte después de **confirmar en el registro de ejecuciones que esa consolidación terminó correctamente**, sin nuevas capturas durante la extracción. Las 18:30 son la hora de inicio, no una confirmación de finalización.

La herramienta no suspende Google ni declara aprobado el corte. Si un origen o el panel cambia durante la captura, queda señalado para revisión. Mantener la operación vigente mientras se concilian las copias; la habilitación de los inventarios migrados requiere el paso operativo posterior.

Puede ejecutarse antes de la consolidación como revisión previa. Que no se hayan creado archivos hoy no confirma que las capturas de los archivos existentes y el consolidado estén al día; esa revisión no sustituye la conciliación del corte final.

## 1. Actualizar el auxiliar desde Windows

En **PowerShell del PC**, usar la candidata existente:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location 'C:\Users\IMORETA\IMS_MYSQL_CANDIDATA_20261104_170059_087'
    if ((git branch --show-current) -ne 'migracion/mysql-candidata-20261104') {
        throw 'La carpeta no esta en la rama candidata.'
    }
    if (git status --porcelain) { throw 'Hay cambios locales; conservarlos y revisar.' }
    git pull --ff-only origin migracion/mysql-candidata-20261104
    if ($LASTEXITCODE -ne 0) { throw 'Actualizacion detenida.' }
    Get-Content -LiteralPath '.\enterprise\tools\EXPORTAR_ABIERTOS_PRIVADO.gs.txt' -Raw -Encoding UTF8 |
        Set-Clipboard
}
```

El código público del auxiliar queda copiado al portapapeles. En [el proyecto de Centro de Mando](https://script.google.com/home/projects/1QPDNLYYqLXkOjNyWoL49JepzxW32XaTskLWfSYOfCdE10Dt62FAfhlsD/edit), abrir **solo `IMS_Corte_Abiertos_Privado`**, el archivo que agregamos para la migración. Reemplazar su contenido con ese código y guardar. Conservar los demás archivos. No publicar un despliegue ni usar clasp push. Usar la misma cuenta autorizada que creó las carpetas privadas anteriores.

## 2. Preparar y terminar una sola captura

1. Ejecutar **`IMSPrepararCorteCompleto20261112` una vez**. Usar esta nueva función, que incluye el consolidado y el registro del maestro.
2. Ejecutar **`IMSContinuarCorteAbiertos20261110`** y esperar a que termine. Repetir Continuar mientras `fuentes_pendientes` sea mayor que cero. Cada ejecución guarda su progreso; no prepara otros archivos de inventario ni necesita descargar un ZIP por ejecución.
3. Al terminar, comprobar `captura_completa: true`, `extraccion_terminada: true`, `fuentes_pendientes: 0`, `fuentes_revision: 0`, `maestro_completo: true` y `panel_cambio: false`.
4. Si quedan fuentes en revisión, conservar la carpeta y compartir solo el JSON del registro. No editar los datos para eliminar el aviso, repetir Preparar o usar Recuperar sobre el modo completo. `lista_para_revision: false` también puede señalar una referencia del panel sin archivo; debe revisarse conservando esa fila.
5. Descargar **una sola vez la carpeta nueva completa** desde el enlace que muestra el registro. Esperar a que Drive termine de formar el ZIP. Conservar todos los ZIP anteriores.

El resumen del maestro comprueba por separado Panel, Usuarios, INVENTARIOS y REGISTRO. Un maestro que omite alguna de esas hojas no se acepta como completo.

### Si Preparar informa «PREPARACION»

La versión corregida permite pasar de un corte legado pendiente al modo completo en una carpeta nueva, conservando sin cambios el plan y todos los fragmentos anteriores. Si ya hay un corte **completo** pendiente, exige usar Continuar; repetir Preparar no lo reinicia. El archivo privado de control apunta a la nueva carpeta solo después de guardar su plan correctamente.

Los errores muestran un JSON `ims-abiertos-error-v1` con `etapa`, `paso` y `codigo_error`, sin el mensaje original de Google ni valores privados. Compartir solo ese JSON si vuelve a fallar. `CONTINUAR_ANTES` indica un corte completo pendiente; `PRIVACIDAD`, `PROPIETARIO` o `CUENTA` requieren revisar la cuenta y el acceso, sin compartir la carpeta. `SERVICIO_O_FORMATO` identifica un error de Google o formato no clasificado: su `paso` permite localizar dónde ocurrió sin exponer su contenido. El mensaje genérico de la versión anterior no demuestra cuál de estas condiciones falló.

`fuentes` es el total de orígenes de la captura, no la cantidad procesada en esa ejecución. El maestro completo puede requerir varias continuaciones aunque los archivos hijos ya hayan terminado; `fragmentos` muestra el progreso acumulado.

## 3. Enviar el ZIP nuevo al servidor

En la misma PowerShell de Windows:

```powershell
& '.\enterprise\tools\enviar-abiertos-servidor.ps1' -Enviar
```

Elegir en el selector **el ZIP nuevo de la carpeta completa**. Se conserva en la entrada privada con un nombre nuevo, se comprueba SHA-256 y se valida en un worktree fijado a la revisión de Windows. El código activo del servicio, MySQL, Apache, puertos y los demás proyectos permanecen sin cambios.

Compartir únicamente **`resumen_envio_abiertos_para_compartir.json`**, cuya carpeta se abre al terminar. No adjuntar el ZIP, fragmentos, planes privados o credenciales. `corte_final_aprobado` y `datos_importados` permanecen en false: la copia completa se concilia antes de importar las capturas y habilitar sus accesos.
