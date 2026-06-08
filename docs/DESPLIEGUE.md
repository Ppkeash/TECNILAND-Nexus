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

## Checklist rápido de un release completo

- [ ] (Si hay modpack nuevo) subirlo a R2 con Nebula y verificar el `distribution.json`.
- [ ] Backend: `fly deploy --remote-only` (si hubo cambios de backend).
- [ ] Web: `npm run build` + subir `build/` a Hostinger (si hubo cambios de web).
- [ ] Launcher: subir versión en `package.json`, commit + push, `npm run dist:win -- --publish always`.
- [ ] Probar: abrir el launcher, confirmar update y comportamiento.
