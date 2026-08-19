# Conectar Apps Script ⇄ GitHub (vía API)

Objetivo: que el código del proyecto Apps Script (ligado a tu Google Sheet)
quede sincronizado con este repositorio de GitHub **usando la API oficial**,
sin copiar/pegar a mano.

> ⚠️ **REGLA DE ORO:** la **fuente de verdad es el proyecto EN VIVO** (el que
> ya funciona y está desplegado). El PRIMER movimiento siempre es **PULL**
> (traer de Apps Script → a GitHub). **Nunca** hagas `clasp push` primero:
> eso subiría el contenido local y podría sobrescribir el proyecto que
> funciona.

---

## Opción A — clasp (CLI oficial, Apps Script API) — RECOMENDADA

Es la base para automatizar (CI/CD) y para el stack futuro (Supabase).

### 1) Habilitar la Apps Script API (una sola vez)
Entra a <https://script.google.com/home/usersettings> y activa
**"Google Apps Script API"**.

### 2) Instalar Node.js y clasp (una sola vez)
- Node.js LTS: <https://nodejs.org>
- Luego, en una terminal:
  ```bash
  npm install -g @google/clasp
  clasp login
  ```
  (`clasp login` abre el navegador; autoriza con tu cuenta de Google.)

### 3) Copiar el Script ID
En tu Sheet: **Extensiones → Apps Script**. Dentro del editor:
**⚙️ Configuración del proyecto → "ID de secuencia de comandos"**. Cópialo.

### 4) Traer el código EN VIVO a este repo (PULL)
Clona el repo (si aún no lo tienes en tu máquina) y entra a la carpeta:
```bash
git clone https://github.com/brantos102/INVT_ITSANET
cd INVT_ITSANET
```
Conecta con el proyecto y descarga el código a una carpeta limpia
(`apps_script/`), **sin tocar nada de lo que ya está en el repo**:
```bash
clasp clone "PEGA_AQUI_EL_SCRIPT_ID" --rootDir apps_script
```
Esto crea `.clasp.json` y descarga los archivos reales del proyecto
(`.gs` y `.html`) dentro de `apps_script/`.

### 5) Verificar y guardar en GitHub
Revisa que `apps_script/` tenga los archivos del editor
(`Cronograma_Recordatorios.gs`, `ITSANET_API.gs`, `WebApp.html`,
`WebApp_JS.html`, `AsistenteCreacionV2.html`, `BlindInventory.html`,
`appsscript.json`, …). Luego:
```bash
git add -A
git commit -m "Conectar Apps Script con GitHub via clasp (pull inicial)"
git push
```
✅ Listo: GitHub ya es un espejo fiel del proyecto EN VIVO, hecho por API.

### Flujo diario
- Cambiaste algo **en el editor** de Apps Script:
  ```bash
  clasp pull        # baja lo último del proyecto en vivo
  git add -A && git commit -m "..." && git push
  ```
- Cambiaste algo **en local** y quieres subirlo al proyecto:
  ```bash
  clasp push        # ⚠️ sobrescribe el proyecto en vivo con tu local
  git add -A && git commit -m "..." && git push
  ```
  > Después de `clasp push`, para que el Web App (`/exec`) tome los cambios,
  > hay que **crear NUEVA versión de implementación** en el editor.

---

## Opción B — Extensión de Chrome (sin terminal)

**"Google Apps Script GitHub Assistant"** (extensión de Chrome). Agrega
botones **Pull / Push** dentro del editor de Apps Script y sincroniza con
GitHub usando la API de GitHub (te pide un token personal de GitHub).
- Más fácil si no quieres instalar Node/terminal.
- Menos automatizable (no sirve para CI/CD).
- Igual regla de oro: primero **Pull** desde el editor para no pisar lo que
  funciona.

---

## Notas
- `.clasp.json` guarda el Script ID; puedes commitearlo (no es secreto) o
  ignorarlo si prefieres mantenerlo local.
- Los archivos `*.gs.txt` y `*.md` del repo son notas/espejo manual; una vez
  que `apps_script/*.gs` sea la fuente por API, puedes limpiarlos con calma.
- `ITSANET_API_GYE.gs.txt` es el módulo GYE (dormido). Cuando lo quieras en
  vivo, se copia como `.gs` dentro de `apps_script/` y `clasp push`.
