# Actualizar codigo-en-vivo en el proyecto real desde terminal

## Qué se actualiza

GitHub, el código editable de Apps Script y la versión publicada de la Web App son estados distintos. Git pull no importa nada a Google. Clasp push no actualiza automáticamente una implementación versionada /exec. Los triggers instalados ejecutan el código guardado del proyecto, por lo que un push al proyecto real ya afecta a la operación aunque todavía no se actualice /exec.

La herramienta para el PC es @google/clasp. El usuario debe usar la cuenta de Google con permisos sobre CONSOLIDADO_HISTORICO. Activar la Apps Script API en https://script.google.com/home/usersettings. No copiar tokens ni .clasprc.json al repositorio o al chat.

El usuario confirmó el Script ID 1QPDNLYYqLXkOjNyWoL49JepzxW32XaTskLWfSYOfCdE10Dt62FAfhlsD, la terminal PowerShell, el binding de C:\Users\IMORETA\CENTRO_DE_MANDO y la implementación de producción en versión 92. El ID del libro y el ID AKfy… de una implementación no sustituyen al Script ID. La URL de producción ya proporcionada identifica la implementación que se desea conservar:

    AKfycbxNdKUWUdtCV6vuDgoH8BRYI34__5rfrDndsjug9Ottc_ohtLtJnhQy1QwylbBCWFHZ

Confirmar que clasp deployments lista ese ID dentro del proyecto antes de actualizarlo. No crear otra implementación por defecto: cambiaría la URL.

## Prerrequisito: la corrección debe estar en la rama que se va a importar

La corrección se publica en codigo-en-vivo. Confirmar el commit descargado: 50f0cea es la base anterior, sin la corrección. No ejecutar git reset --hard ni sobrescribir cambios locales para forzar el proceso.

Comprobar desde el checkout del PC:

    git status --short
    git branch --show-current
    git log -1 --oneline
    git diff -- Cronograma_Recordatorios.js SUPABASE.js .claspignore

Después de publicar la corrección en la rama y con el checkout sin cambios pendientes:

    git fetch origin
    git switch codigo-en-vivo
    git pull --ff-only origin codigo-en-vivo

Si esa rama local todavía no existe, usar git switch --track origin/codigo-en-vivo en lugar de git switch codigo-en-vivo. No repetir esta creación si ya existe.

## Comandos de clasp

Una sola vez, instalar la herramienta y autorizar la cuenta del PC:

    npm install --global @google/clasp
    clasp --version
    clasp --help
    clasp login

Comprobar los comandos de la versión instalada: las versiones de clasp pueden mostrar nombres como create-version/update-deployment en lugar de los alias clásicos version/deploy. La sintaxis de abajo utiliza los alias clásicos; consultar clasp <comando> --help antes del paso correspondiente si no está disponible. Este entorno no pudo instalar/consultar clasp por bloqueo de red, por lo que estos comandos no se presentan como ejecutados aquí.

## Copia previa en una carpeta distinta (PowerShell)

Sustituir únicamente el Script ID por el de Configuración del proyecto. No usar la URL /exec.

    $scriptId = 'SCRIPT_ID_REAL'
    $repo = (Get-Location).Path
    $backup = Join-Path $env:TEMP ('ims-apps-script-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path $backup | Out-Null
    Push-Location $backup
    try {
        clasp clone $scriptId
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo descargar el proyecto real. No continuar con push.' }
        clasp deployments
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron consultar las implementaciones.' }
    } finally {
        Pop-Location
    }

Esta copia contiene el código editable actual, no necesariamente el código exacto de la versión publicada. Conservar también el número de versión anterior que aparece junto al deployment de producción para poder volver a apuntarlo a ella. Clasp clone/pull no exporta ScriptProperties, triggers ni datos de Sheets; no recrearlos ni reemplazarlos con valores inventados. La copia del libro se conserva aparte.

## Binding y revisión antes de importar

Volver a la raíz del repositorio. Si ya existe .clasp.json, comprobar su scriptId y rootDir localmente. No reemplazarlo si apunta a otro proyecto: podría ser el binding de pruebas. Usar el binding de producción verificado o una carpeta separada de preparación. Si no existe, después de confirmar el Script ID:

    @{ scriptId = $scriptId; rootDir = '.' } | ConvertTo-Json | Set-Content -Encoding utf8 .clasp.json

El archivo está ignorado por Git. .claspignore excluye api/, web/, tests/, supabase/ y archivos de documentación; ninguno pertenece al runtime de Apps Script.

    clasp open
    clasp status
    node --check Cronograma_Recordatorios.js
    node --check SUPABASE.js
    node --test tests/consolidacion.test.cjs tests/supabase.test.cjs

Comparar los archivos que se van a subir con la copia recién descargada. Un push envía el conjunto local del proyecto y puede retirar archivos remotos que no estén incluidos: si hay diferencias no previstas, resolverlas antes de importar. El material de GitHub debe contener también el resto del proyecto operativo, no solamente los dos archivos corregidos. No ejecutar clasp pull dentro del checkout corregido para hacer una copia: podría reemplazar la corrección local con el código anterior.

Antes del push, detener una consolidación antigua desde su control de cancelación, esperar a que no haya ejecución activa y pausar la sincronización horaria mediante desinstalarSyncSupabase. Guardar qué triggers se retiraron. Probar el cambio primero en la copia existente del proyecto/libro. El push al proyecto real afecta al código utilizado por los triggers.

## Importar y conservar la URL de producción

Con destino, diferencias y pruebas comprobados:

    clasp push
    clasp deployments
    clasp version 'Correccion consolidacion: reintentos, origenes y control KPI'

Guardar el número N devuelto. Actualizar el deployment EXISTENTE, no crear uno nuevo:

    clasp deploy --deploymentId AKfycbxNdKUWUdtCV6vuDgoH8BRYI34__5rfrDndsjug9Ottc_ohtLtJnhQy1QwylbBCWFHZ --versionNumber N --description 'Correccion consolidacion y control KPI'

N es un marcador: sustituir por el número real. La implementación debe pertenecer al Script ID verificado. La alternativa equivalente desde el editor es editar esa implementación y elegir una nueva versión. Consultar la ayuda local si la versión de clasp instalada usa update-deployment.

Para verificar el push, descargar nuevamente el HEAD de Google en otra carpeta vacía y comparar el código con el que se acaba de subir. Clasp deployments permite verificar el número publicado; la comprobación funcional se hace accediendo a la URL original con la cuenta autorizada. No confundir pantalla de login con prueba de funcionamiento.

## Datos y KPI después de importar

Importar código no limpia INVENTARIOS ni corrige por sí mismo Supabase. Ejecutar una corrida nueva mediante consolidarTodoDesdeEditor; no reanudar el estado creado por el código antiguo. Revisar el resultado y la auditoría.

Decisiones actuales: IBM se mantiene como dos inventarios separados con ORIGEN_DRIVE. VENTURA fue habilitado por nueva indicación del usuario: se conservan sus dos fuentes con ORIGEN_DRIVE distinto. Permanecen las validaciones generales de integridad.

Antes de sincronizar las columnas nuevas a Supabase, ejecutar supabase/20261015_origen_drive.sql en el proyecto correcto. Después de resolver los bloqueos y completar la validación global, ejecutar sincronizarTodoSupabase hasta ok:true y completo:true; conciliar y refrescar Power BI al final. Reinstalar el trigger horario solo cuando el flujo esté verificado. Para contar ambos IBM, Power BI debe distinguir origen_drive/ORIGEN_DRIVE en lugar de contar únicamente el código repetido.

## Volver a la versión anterior

Conservar el número publicado anterior permite volver a apuntar el deployment existente a esa versión. Esto no restaura el HEAD que ejecutan los triggers ni los datos de Sheets/Supabase. Si también se necesita volver al código editable anterior, restaurar explícitamente el respaldo verificado al mismo Script ID. No utilizar operaciones de borrado/reset masivo como sustituto de ese respaldo.

## Estado de esta revisión

Se revisaron los archivos y el procedimiento del repositorio. No hay .clasp.json ni .clasprc.json en las ubicaciones normales de este entorno. Existe una variable de credenciales Google de la plataforma, pero no demuestra autorización Apps Script ni equivale a una sesión clasp; no se extrajeron valores. El proxy no permitió consultar el registro npm ni probar Google. No se hizo push a Google ni se modificó la implementación real. El usuario confirmó el Script ID, PowerShell y el deployment en versión 92; la publicación en GitHub es un paso separado de la importación a Google.
