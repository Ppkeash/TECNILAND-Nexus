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

El launcher usa `distribution.json` (Nebula → R2) como **fuente de verdad**. Dos
mecanismos cubren añadir, cambiar y **borrar** archivos sin romper los ajustes del
jugador.

### 5.1. Campos que controlas en `distribution.json`

Por cada server (modpack):

```json
"servers": [
  {
    "id": "tecniland-beyond",
    "version": "1.0.1",                          // súbelo en CADA cambio
    "tecnilandManaged": ["config/fancymenu"],    // carpetas 100% gestionadas
    "modules": [
      { "id": "...", "type": "File",
        "artifact": { "path": "config/fancymenu/layout.json", "MD5": "...", "url": "..." } }
    ]
  }
]
```

- **`version`**: cualquier cambio (mod, config, lo que sea) → súbelo (`1.0.1` → `1.0.2`).
  No importa el esquema; el launcher solo compara si es **distinto**. Distinto =
  todos ven el aviso **"ACTUALIZACIÓN NUEVA"**. `tecnilandManaged` es un campo extra;
  helios lo ignora, es seguro.
- **`tecnilandManaged`**: lista de subcarpetas (relativas a la instancia) que son
  100 % tuyas. Se sincronizan **exactas** en cada arranque y en cada reparación:
  lo que no esté declarado en el distro se **borra** del cliente. El resto de
  `config/` del usuario nunca se toca.

### 5.2. Añadir / cambiar un archivo (ej. FancyMenu)

1. Declararlo como módulo `type: "File"` con su `artifact.path` (ej.
   `config/fancymenu/loquesea.json`), su `MD5` y su `url` (R2).
2. Regenerar `distribution.json` (Nebula) y subirlo a R2.
3. Subir `version`.
   → Los jugadores lo reciben automáticamente al jugar/actualizar (descarga lo
   faltante o cambiado).

### 5.3. Borrar un archivo

- Si está bajo una ruta de `tecnilandManaged` (ej. `config/fancymenu`): basta con
  **quitarlo del distro** y subir `version`. Se borra solo en el cliente al jugar.
- Si NO está en una ruta gestionada (ej. un mod suelto en `mods/`): el jugador lo
  elimina con **Reparar → Reparación completa** (botón 🔧 junto a Jugar). Eso quita
  todos los mods sobrantes que ya no están en el distro.

### 5.4. Botón Reparar (en el launcher)

Junto a **Jugar**, con un modpack de distribución seleccionado:

- **Actualizar**: descarga faltantes/cambiados + sincroniza rutas gestionadas.
  **No** borra mods/configs del usuario.
- **Reparación completa**: lo anterior + **elimina sobrantes** en `mods/` (y en
  `config/`, `defaultconfigs/`, `resourcepacks/`, `options.txt` solo si marcas el
  checkbox correspondiente). `saves/`, `screenshots/`, `logs/` nunca se tocan.

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
