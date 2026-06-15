# Guía de despliegue — TECNILAND (launcher + backend + web)

Paso a paso para publicar una nueva versión y para gestionar el mantenimiento de
modpacks. Tres piezas independientes:

| Pieza | Dónde vive | Cómo se despliega |
|-------|-----------|-------------------|
| **Launcher** (TECNILAND NEXUS) | repo GitHub `Ppkeash/TECNILAND-Nexus` | electron-builder → GitHub Releases → auto-update |
| **Backend** (tecniland-backend) | Fly.io `tecniland-backend` | `fly deploy` (no se versiona en git) |
| **Web** (TECNILAND_web) | Hostinger (React) | `npm run build` → subir `build/` |

---

## 1. Publicar nueva versión del LAUNCHER

1. Subir el número de versión en `package.json` (ej. `1.1.0` → `1.1.1`).
   > El auto-updater SOLO detecta el update si el número es mayor.
2. (Recomendado) commit + push a GitHub:
   ```powershell
   git add -A
   git commit -m "feat: ..."
   git push origin main
   ```
3. Exportar el token de GitHub en la sesión de PowerShell:
   ```powershell
   $env:GH_TOKEN = "tu_token_de_github"
   ```
4. Build + publish:
   ```powershell
   npm run dist:win -- --publish always
   ```
   Esto compila `TECNILAND-Nexus-setup-<version>.exe` + `latest.yml` y los sube a
   GitHub Releases (`Ppkeash/TECNILAND-Nexus`).
5. Listo. Los clientes con una versión anterior reciben el update al abrir el launcher.

**Probar el instalador sin publicar:** `npm run dist:win` → queda en `dist/`.

---

## 2. Desplegar el BACKEND (Fly.io)

Desde `tecniland-backend/`:
```powershell
fly deploy --remote-only
```
- `--remote-only` evita necesitar Docker local.
- La base de datos SQLite y sus tablas se crean/migran solas al arrancar.
- Verificar que quedó arriba:
  ```powershell
  curl https://tecniland-backend.fly.dev/health
  ```

> El backend NO se versiona en git (decisión propia). Solo se despliega.

---

## 3. Desplegar la WEB (Hostinger)

Desde `TECNILAND_web/tecniland/`:
```powershell
npm run build
```
Luego subir el **contenido de la carpeta `build/`** a `public_html` en Hostinger
(reemplazando lo anterior). El `.htaccess` ya va dentro para el routing de React.

---

## 4. Poner un modpack en MANTENIMIENTO / liberarlo

El bloqueo se controla desde la web (panel admin), se guarda en el backend y lo
lee el launcher.

1. Entrar a la web logueado como **admin** → Dashboard → pestaña **Admin** →
   **Gestión de Modpacks**.
2. **Registrar** el modpack con su ID exacto (= nombre de carpeta en Nebula =
   server id del distro). Ej: `tecniland-beyond-1.20.1`.
3. **Desactivar el toggle** = mantenimiento. Escribir el mensaje (ej.
   "DISPONIBLE EL 14 DE JUNIO") y Guardar.
4. En el launcher el modpack se ve bloqueado, "Sin seleccionar", con el mensaje, y
   no se puede instalar ni jugar.
5. Para **liberarlo**: activar el toggle (Instalable) y Guardar. Listo, ya se puede
   instalar.

> El ID debe coincidir EXACTO con el server id del distro o el launcher consultará
> otro id y no se bloqueará.

---

## 5. Actualizar el contenido de un modpack (mods / configs)

El launcher usa `distribution.json` (Nebula → R2) como **fuente de verdad**. Al darle
**Jugar**, el launcher valida y descarga lo que falta o cambió, y **elimina mods
sobrantes** automáticamente. Los **ajustes del jugador** (`options.txt`, controles,
FPS) quedan protegidos.

### 5.0. ⚠️ IMPORTANTE — Archivos del jugador (`untrackedFiles`)

**El bug de "se me resetea options.txt"** ocurría porque Nebula empaquetaba
`options.txt` con MD5. Cada vez que el jugador lo editaba, el launcher veía un MD5
distinto y lo **re-descargaba encima** (reset).

**Regla:** los archivos que el jugador edita (controles, video, etc.) deben ir como
**`untrackedFiles`** en `servermeta.json`. Nebula los empaqueta **sin MD5** → el
launcher los siembra **la primera vez** y **nunca los vuelve a tocar**.

`servers/<id>/servermeta.json`:

```jsonc
"untrackedFiles": [
  {
    "appliesTo": ["files"],
    "patterns": [
      "options.txt",
      "optionsof.txt",
      "optionsshaders.txt",
      "servers.dat",
      "config/embeddium-options.json",   // FPS / video
      "config/embeddium-fingerprint.json",
      "config/ribbits-options.json",
      "config/visual_keybinder.toml"
    ]
  }
]
```

> No untrackees `config/defaultoptions/`: ese es el mod **DefaultOptions** (tus
> ajustes por defecto para jugadores nuevos). Eso sí lo controlas tú.

**Doble red de seguridad:** además, el launcher protege SIEMPRE `options.txt`,
`optionsof.txt`, `optionsshaders.txt` y `servers.dat` (los respalda antes de reparar
y los restaura después), aunque olvides ponerlos en `untrackedFiles`. Para proteger
otros archivos vía launcher, añade el campo extra `tecnilandUserFiles` al server en
el distro (rutas relativas a la instancia).

### 5.1. Campos extra que controlas en `distribution.json`

Por cada server (Nebula los ignora; el launcher los lee):

```json
"servers": [
  {
    "id": "tecniland-beyond",
    "version": "1.0.1",                          // súbelo en CADA cambio
    "tecnilandManaged": ["config/fancymenu"],    // carpetas 100% gestionadas
    "tecnilandUserFiles": ["config/loquesea.json"] // archivos del jugador (seed once)
  }
]
```

- **`version`**: cualquier cambio → súbelo (`1.0.1` → `1.0.2`). El launcher solo
  compara si es **distinto** → todos ven el aviso **"ACTUALIZACIÓN NUEVA"**.
- **`tecnilandManaged`**: subcarpetas 100 % tuyas. Se sincronizan **exactas** en cada
  arranque/reparación: lo no declarado se **borra**. Úsalo para empujar/quitar
  archivos de config concretos (ej. FancyMenu) sin tocar el resto.
- **`tecnilandUserFiles`**: archivos del jugador a proteger por el launcher (seed once).

### 5.2. Añadir / cambiar un mod o archivo

1. Mete/cambia el archivo en `servers/<id>/files/...` (o `forgemods/`).
2. Regenera `distribution.json` (Nebula) y súbelo a R2.
3. Sube `version`.
   → Los jugadores lo reciben **al darle Jugar** (descarga lo faltante o cambiado).

### 5.3. Borrar / cambiar un mod (tu caso de hoy)

- **Mods (`mods/`):** quítalo/cámbialo en Nebula, regenera, sube `version`. Al darle
  **Jugar**, el launcher descarga el nuevo y **borra el viejo automáticamente** (ya no
  hace falta tocar nada). El mod fantasma quedó resuelto.
- **Config bajo `tecnilandManaged`** (ej. `config/fancymenu`): quítalo del distro +
  sube `version`. Se borra solo en el cliente al jugar.

### 5.4. Botón Reparar 🔧 (en el launcher, junto a Jugar)

Dos acciones, **sin checkboxes**:

- **Reparación completa**: revalida y descarga faltantes/cambiados, elimina sobrantes
  en `mods/`, `resourcepacks/`, `shaderpacks/` y rutas gestionadas. **Conserva**
  `options.txt` y los ajustes del jugador. Para bugs/desincronización.
- **Re-instalación (emergencia)**: **borra TODO** el modpack y lo descarga de cero.
  Pide confirmación. Solo cuando algo está muy roto.

> Nota técnica: cada refresh del distro hace **cache-bust** (`?t=`) para saltar el
> caché de borde de R2/Cloudflare. Por eso un cambio recién subido se ve al toque y
> no “a veces sí, a veces no”.

---

## Checklist rápido de un release completo

- [ ] (Si hay modpack nuevo) subirlo a R2 con Nebula y verificar el `distribution.json`.
- [ ] Backend: `fly deploy --remote-only` (si hubo cambios de backend).
- [ ] Web: `npm run build` + subir `build/` a Hostinger (si hubo cambios de web).
- [ ] Launcher: subir versión en `package.json`, commit + push, `npm run dist:win -- --publish always`.
- [ ] Probar: abrir el launcher, confirmar update y comportamiento.
