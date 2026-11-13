# Continuar con el corte elegido y ya enviado

El usuario eligió expresamente usar las capturas guardadas del corte **07e58bf9-6fe1-4bf0-b93e-d1a89cb66764**, sin pedir otra extracción ni un delta nuevo de Google. El resumen de envío confirmó:

- ZIP privado: `/home/enicolalde/bryan/centro_mando_ims_datos/entrada/ims-abiertos-f0799052d8b942138c0ac3106980d740.zip`, 3.672.695 bytes.
- 12 archivos de inventario y 12.362 productos; C1 presente en 10.602 líneas, C2 en 290 y C3 en 205. Los conteos incluyen ceros: ausencia y cero siguen siendo distintos.
- 249 fragmentos, panel estable, sin referencias discordantes ni fuentes pendientes.
- Una fuente de inventario (fila 2 del panel del corte) y el maestro en revisión por cambio de versión. Se conservan sus fragmentos, cobertura y avisos; no se declaran completos artificialmente.

## Un solo proceso en el servidor

Ejecutar el bloque publicado en el chat en **la terminal SSH de VS Code** (`enicolalde@apps`), no en PowerShell local. El bloque usa `git fetch` y un worktree fijado a la revisión publicada; no sustituye el código que está usando el servicio.

El lanzador es `enterprise/deploy/procesar_corte_elegido.sh` y recibe tres argumentos: revisión de 40 caracteres, ZIP privado existente y corte elegido. Ejecuta la preparación, la copia transaccional en las tablas `ims_abiertos_copia` y `ims_abiertos_copia_fila`, la comprobación de integridad y la proyección operativa. Reutiliza la preparación de ese mismo ZIP y hash si existe; repetir el proceso vuelve a verificar la copia SQL, no agrega otra copia de las mismas filas.

Solo usa `ims_cm_migracion` en `centromando_ims_ensayo`, con una conexión por herramienta. No instala cuentas, amplía permisos ni solicita contraseñas del proyecto. Las credenciales existentes van a Node por entrada estándar y nunca al resumen.

La decisión se guarda en `corte_elegido_NO_COMPARTIR.json`, vinculada al UUID, hash del ZIP y `copia_id`. El plan operativo resultante refleja `requiere_delta_final: false` por esa decisión expresa. Esa excepción no elimina los bloqueos de cantidad, identidad, cobertura o permisos, y no cambia las banderas del corte original de Google.

Las decisiones anteriores de separar código/fecha y mantener un archivo pendiente se recuperan de su preparación anterior **por hash**, verifican su ZIP y localizan el mismo ID físico en el corte actual. Se aplican solo si siguen coincidiendo la cantidad de productos y códigos; para el pendiente se exige además que código, inicio y capturas sigan vacíos. Nunca se trasladan reglas por el número actual de fila del panel. Si el archivo ya no está seleccionado o su situación cambió, el resumen lo indica conservando los datos.

## Resultado que se debe compartir

Al terminar imprime una ruta como:

```text
/home/enicolalde/bryan/centro_mando_ims_datos/CORTE_ELEGIDO_<id>/resumen_corte_elegido_para_compartir.json
```

En VS Code, abrir esa carpeta y descargar **solo `resumen_corte_elegido_para_compartir.json`** para adjuntarlo al chat. No compartir el ZIP, contexto SQL, planes privados ni la decisión privada.

Este proceso guarda las capturas en MySQL y produce el plan operativo. Todavía no inserta líneas en el núcleo nativo ni habilita operadores. El resultado distingue `copia_revision_mysql: true` de `datos_operativos_importados: false`. Permite realizar la siguiente importación con la cobertura real del paquete elegido, sin solicitar otro corte de Google y sin activar silenciosamente datos o permisos faltantes.

El histórico de 352 conteos/97.822 líneas, los inventarios nativos existentes, las cuentas de acceso, Apache, puertos y otros servicios permanecen sin cambios. Un fallo después de intentar SQL indica si la copia pudo confirmarse; no declara falsamente que la base quedó intacta si la respuesta se perdió.
