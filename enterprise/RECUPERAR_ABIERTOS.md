# Recuperar el corte terminado sin perder el anterior

El informe recibido identifica un inventario en revisión por cambio de fuente (referenciado en la fila 370 del panel del corte) y el maestro en revisión por hojas de 385 y 384 columnas. Las filas de referencia pertenecen al panel anterior; si se reordenó, pueden haber cambiado de posición. No recortar hojas ni modificar estados o cantidades para superar el diagnóstico.

## En Apps Script

1. Abrir [el proyecto de Centro de Mando](https://script.google.com/home/projects/1QPDNLYYqLXkOjNyWoL49JepzxW32XaTskLWfSYOfCdE10Dt62FAfhlsD/edit).
2. Abrir **solo el archivo `IMS_Corte_Abiertos_Privado` que agregamos para esta migración**. Reemplazar su contenido completo por [EXPORTAR_ABIERTOS_PRIVADO.gs.txt](tools/EXPORTAR_ABIERTOS_PRIVADO.gs.txt) actualizado. Guardar. Conservar los demás archivos del proyecto. No publicar un despliegue ni usar clasp push.
3. Elegir y ejecutar **`IMSRecuperarCorteAbiertos20261111` una sola vez**. Debe partir del corte v1 ya terminado. La función rechaza un corte pendiente o una recuperación ya iniciada antes de modificar el plan.
4. Ejecutar **`IMSContinuarCorteAbiertos20261110`** hasta que `fuentes_pendientes` sea cero y `extraccion_terminada` sea true. Esperar a que termine cada ejecución antes de iniciar otra. No ejecutar Preparar ni repetir Recuperar.
5. Si aparecen fuentes en revisión, compartir el JSON del registro; ahora incluye `revision_fuentes` con motivo y filas del panel, sin nombres o valores. No reintentar ciegamente una fuente que sigue siendo modificada durante la captura. El diagnóstico no congela la operación vigente.
6. Al terminar sin fuentes en revisión y con `panel_cambio: false`, descargar **la misma carpeta privada completa** como un ZIP nuevo. La recuperación muestra su enlace. La carpeta conserva su nombre anterior, aunque el plan tiene un `corte_id` nuevo.

La recuperación guarda una copia privada íntegra del plan anterior en una carpeta de respaldo independiente. Conserva los fragmentos anteriores en la carpeta del corte y registra cuáles quedan como respaldo de una copia parcial. Usa una lectura nueva del panel para seleccionar los archivos actuales. Recaptura el maestro, las fuentes retenidas, las nuevas y las que cambiaron de versión; reutiliza los fragmentos de fuentes completas solo si su versión permanece igual. Revisa de nuevo las versiones de las fuentes completadas al final de cada continuación. Esto no certifica por sí solo un corte final simultáneo de varios libros.

El maestro admite hasta 512 columnas y cada fragmento mantiene como máximo 10.000 celdas y 250 filas. Se conservan formatos, fórmulas como texto, notas, SKU con ceros, ausencia de captura y cantidades cero. Se mantienen las exclusiones de contraseñas y de hojas de configuración. El cambio no escribe en los libros originales, estados, permisos, propiedades o disparadores.

Si un archivo del corte anterior dejó de figurar entre los pendientes actuales —por ejemplo, pasó a Entregado—, sus fragmentos se conservan y se indica `fuentes_retiradas_panel_actual`. Requiere conciliación; no se borra ni se considera trasladado por desaparecer de la selección.

## En PowerShell de Windows

Actualizar y enviar el ZIP recuperado:

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
    & '.\enterprise\tools\enviar-abiertos-servidor.ps1' -Enviar
}
```

El servidor busca el ZIP anterior en su propia entrada privada usando el ID del corte y el SHA-256 exacto del plan. Examina solo archivos `ims-abiertos-<id>.zip` propios y limita la búsqueda a 128 candidatos. Verifica íntegramente ese corte v1 y concilia cada fragmento anterior: debe seguir activo con su procedencia original o estar conservado como respaldo. No vuelve a sumar los respaldos como líneas o capturas actuales. Sin un corte anterior íntegro no confirma el linaje. Conservar los ZIP anteriores del servidor; no se necesitan en el chat.

Compartir únicamente el nuevo `resumen_envio_abiertos_para_compartir.json`. La validación distingue el cambio del panel antiguo de un cambio durante la recuperación, y muestra `recuperacion.linaje_respaldo_verificado`. No importa MySQL, activa servicios o modifica Apache/puertos. `corte_final_aprobado` continúa en false: el traslado, la conciliación del delta y la ventana definitiva siguen pendientes.
