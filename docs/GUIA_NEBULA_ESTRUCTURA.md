# Guía — Estructurar y generar el modpack con Nebula

Guía paso a paso para armar el modpack desde cero, con TU setup real.
Complementa `docs/GUIA_NEBULA_MODPACK.md` (esa explica cómo publicar cambios;
esta explica cómo estructurar las carpetas y generar la distribución).

## Tu setup (del `.env` de Nebula)

```
Nebula:        D:\NebulaRoot\Nebula
ROOT:          D:\TestRoot2
JAVA:          java  (OpenJDK 17 detectado)
BASE_URL:      https://pub-eae2df8eea254247b58a3f40588e2c61.r2.dev/nebula/
```

Server existente de referencia: `servers/tecniland-og-1.20.1-1.20.1/`
(Forge 47.3.0, Minecraft 1.20.1).

---

## 1. Qué permite Nebula

- Generar un `distribution.json` para el launcher a partir de una estructura de
  carpetas (no escribes el JSON a mano).
- Servidores (modpacks) con **Forge** o **Fabric** (no ambos en el mismo server).
- Tipos de módulo: **mods** (forge/fabric), **files** (configs, kubejs,
  resourcepacks, lo que va al `.minecraft`), **libraries**.
- **Mods opcionales toggleables**: required / optionalon / optionaloff.
- **Hashes MD5** por archivo → el launcher sincroniza solo lo que cambia.
- **untrackedFiles**: archivos que el launcher NO valida (preferencias del
  jugador). Ver `docs/GUIA_NEBULA_MODPACK.md`.
- Importar un modpack de **CurseForge** (`g server-curseforge`).
- Metadata de Discord Rich Presence (en `meta/distrometa.json` y por server).

---

## 2. Estructura de carpetas (dentro de `ROOT/servers/<id>-<version>/`)

El nombre de la carpeta del server es **`<id>-<version>`**. La `version` es la de
Minecraft. Ej: id `tecniland-og` + versión `1.20.1` → carpeta `tecniland-og-1.20.1`.

```
servers/
  tecniland-og-1.20.1/                 <- carpeta del modpack (id-version)
    servermeta.json                    <- metadata (nombre, versión, icono, forge…)
    server-icon.png                    <- ICONO/LOGO del modpack (jpg o png)
    forgemods/                         <- mods Forge (o fabricmods/ si es Fabric)
      required/                        <- siempre activos
      optionalon/                      <- opcionales, ON por defecto
      optionaloff/                     <- opcionales, OFF por defecto
    files/                             <- todo lo que va tal cual al .minecraft
      config/
      defaultconfigs/
      kubejs/
      resourcepacks/
      shaderpacks/
      options.txt                      <- (mejor marcarlo untracked, ver abajo)
    libraries/                         <- libs especiales (normalmente vacío)
```

Reglas:
- **Mods** → SIEMPRE en `forgemods/` (o `fabricmods/`), dentro de
  `required` / `optionalon` / `optionaloff`. NO los metas en `files/mods`.
- **Configs, kubejs, resourcepacks, scripts, etc.** → en `files/` respetando la
  ruta tal como debe quedar dentro del `.minecraft` del jugador.
- **No** pongas `saves/` ni `screenshots/` — eso es del jugador.

---

## 3. El nombre del modpack y el LOGO/icono

Ambos van en `servermeta.json`:

```json
{
  "$schema": "file:///D:/TestRoot2/schemas/ServerMetaSchema.schema.json",
  "meta": {
    "version": "1.0.0",
    "name": "TECNILAND OG",
    "description": "Modpack TECNILAND — Minecraft 1.20.1 (Forge 47.3.0)",
    "icon": "https://pub-eae2df8eea254247b58a3f40588e2c61.r2.dev/nebula/servers/tecniland-og-1.20.1/server-icon.png",
    "address": "tu.servidor.com:25565",
    "discord": {
      "shortId": "TecniOG",
      "largeImageText": "TECNILAND OG - Forge 1.20.1",
      "largeImageKey": "server-tecniland-og-1201"
    },
    "mainServer": true,
    "autoconnect": false
  },
  "forge": { "version": "47.3.0" },
  "untrackedFiles": []
}
```

- **`name`** = el nombre que ve el jugador en el launcher ("TECNILAND OG").
- **LOGO/icono del modpack** = `server-icon.png` en la raíz del server.
  - Forma 1 (preferida): pon el archivo `server-icon.png` (jpg/png) en la carpeta
    del server. Nebula lo detecta solo.
  - Forma 2: pon la **URL completa** en `meta.icon`. Si es una URL válida, esa
    gana sobre el archivo. (Tu ejemplo actual usa la URL de R2.)
- **`mainServer: true`** → ese modpack sale primero / destacado en el launcher.
- **`version`** → súbela cada vez que publiques un cambio (dispara "actualización
  disponible").
- **`untrackedFiles`** → para preferencias del jugador (ej. `options.txt`,
  controles). Ver la otra guía.

> El **logo del LAUNCHER** (el seal del menú) es otra cosa, va en el launcher
> (`app/assets/images/`), no en Nebula. El icono de aquí es el del MODPACK.

---

## 4. Comandos (tus scripts de Nebula)

Desde `D:\NebulaRoot\Nebula`. Forma recomendada (compila y corre):

```
npm run start -- <comando>
```

Comandos útiles:
- Inicializar estructura (ya está hecho): `npm run start -- init root`
- Crear un server Forge:
  `npm run start -- g server tecniland-og 1.20.1 --forge 47.3.0`
- Crear un server Fabric:
  `npm run start -- g server tecniland-og 1.20.1 --fabric latest`
- Importar de CurseForge (zip en `ROOT/modpacks/curseforge`):
  `npm run start -- g server-curseforge tecniland-og NombreDelZip.zip`
- Generar la distribución: `npm run start -- g distro`
- Generar para probar local en dev:
  `npm run start -- g distro distribution_dev --installLocal`

> `npm run faststart -- <comando>` corre sin recompilar (más rápido si no
> cambiaste el código de Nebula).

---

## 5. Paso a paso para preparar el modpack

1. (Si es server nuevo) Generá la estructura:
   `npm run start -- g server tecniland-og 1.20.1 --forge 47.3.0`
2. Colocá los archivos:
   - Mods → `servers/tecniland-og-1.20.1/forgemods/required` (y opcionales en
     `optionalon` / `optionaloff`).
   - Configs/kubejs/resourcepacks → `servers/tecniland-og-1.20.1/files/...`
   - Icono → `servers/tecniland-og-1.20.1/server-icon.png`
3. Editá `servermeta.json`: `name`, `description`, `version`, `mainServer`,
   `untrackedFiles` (para `options.txt` y configs personales).
4. Generá la distribución:
   `npm run start -- g distro`
   → crea/actualiza `D:\TestRoot2\distribution.json`.
5. (Recomendado) Probala local antes de publicar:
   `npm run start -- g distro distribution_dev --installLocal`
   y abrí el launcher en dev (`npm start`) para verificar que instala bien.

---

## 6. Subir a R2 (publicar)

El launcher lee de `https://pub-…r2.dev/nebula/distribution.json`. Hay que subir,
bajo el prefijo **`nebula/`** del bucket R2:

- `distribution.json`
- La carpeta `servers/<id>-<version>/` completa (mods, files, libraries, icono).

### Opción A — yo lo subo por terminal (rclone)
Tengo `rclone` con el remote `r2:` ya configurado (mismo Cloudflare). Puedo subir
con un comando tipo:
```
rclone copy "D:\TestRoot2\distribution.json" r2:<BUCKET>/nebula/ --progress
rclone copy "D:\TestRoot2\servers" r2:<BUCKET>/nebula/servers/ --progress
```
Solo necesito que me confirmes el **nombre del bucket** (el que está detrás de
`pub-eae2df8eea254247b58a3f40588e2c61.r2.dev`). Lo hago cuando los archivos estén
listos y me autorices.

### Opción B — lo subís vos (Cloudflare dashboard)
R2 → tu bucket → carpeta `nebula/` → subís `distribution.json` y `servers/`.

> Importante: subí SIEMPRE el `distribution.json` nuevo JUNTO con los archivos
> que cambiaron. Si subís archivos pero no el json (o al revés), los hashes no
> cuadran.

---

## 7. Qué hace yo (Claude) vs qué hacés vos

- **Vos**: curar el modpack — elegir y colocar mods, configs, resourcepacks,
  icono; decidir qué va `untracked`. (Es la parte creativa, solo tú.)
- **Yo (si querés)**: correr `g distro` (tengo Java 17), verificar el resultado,
  y subir a R2 por rclone — una vez los archivos estén en su sitio y me des el
  nombre del bucket + el OK.

---

## Resumen de un vistazo

```
ROOT/servers/<id>-<version>/
   servermeta.json   → name, version, icon, forge, untrackedFiles
   server-icon.png   → LOGO del modpack
   forgemods/{required,optionalon,optionaloff}  → mods
   files/...         → configs, kubejs, resourcepacks (al .minecraft)
        ↓
npm run start -- g distro      → distribution.json
        ↓
Subir a R2 bajo nebula/ : distribution.json + servers/<id>-<version>/
        ↓
Jugador abre launcher → ve el modpack → instala → updates incrementales
```
