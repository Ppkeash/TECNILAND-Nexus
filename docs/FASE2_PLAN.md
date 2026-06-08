# Fase 2 — Endurecimiento (plan de trabajo diferido)

**Contexto:** continuación de `docs/AUDITORIA_v1.0.8.md`. Fase 0 (bugs) y Fase 1
(saneamiento) están completas y en GitHub. Fase 2 contiene cambios de mayor
riesgo; se ejecutan **después** de publicar el próximo modpack o cuando se
autorice cada parte, para no desestabilizar un launcher que ya funciona.

Estado de Fase 2 a la fecha:
- ✅ **Hecho ahora (bajo riesgo):** `REMOTE_DISTRO_URL` configurable por env
  (`TECNILAND_DISTRO_URL`) en `distromanager.js`. Permite migrar a dominio
  propio sin tocar código.
- ⬜ Resto: diferido (ver abajo).

---

## #10 — Dominio propio para R2 (OPCIONAL — Nebula + Launcher)

> **No es obligatorio.** El setup actual (bucket R2 servido en `pub-…r2.dev/nebula/`)
> funciona a la escala actual. Esto solo aplica si a futuro hay descarga masiva y
> el rate-limit de `r2.dev` molesta. El default de `REMOTE_DISTRO_URL` sigue
> siendo la URL `r2.dev` de siempre; no hay que hacer nada para que funcione.

**Contexto:** la distribución y sus assets se sirven desde la URL pública de
desarrollo de R2 (`pub-eae2df8eea254247b58a3f40588e2c61.r2.dev`), que Cloudflare
marca como *rate-limited*.

La URL dev aparece en **dos sitios**:
1. **Nebula** `.env` → `BASE_URL=...r2.dev/nebula/` → genera las URLs de assets
   (mods, libraries, files) embebidas dentro de `distribution.json`.
2. **Launcher** `distromanager.js` → `REMOTE_DISTRO_URL` (ahora override por
   env `TECNILAND_DISTRO_URL`).

**Pasos de migración:**
1. Cloudflare → bucket R2 → **Settings → Custom Domains → Connect Domain**
   (ej. `cdn.tecnilandnex.online`). Cloudflare crea DNS + cache, sin rate-limit.
2. Nebula `.env`: `BASE_URL=https://cdn.tecnilandnex.online/nebula/`
3. Launcher: setear `TECNILAND_DISTRO_URL=https://cdn.tecnilandnex.online/nebula/distribution.json`
   (o cambiar el default en `distromanager.js`).
4. **Regenerar** la distribución (`g distro`) y re-subir a R2 — el
   `distribution.json` viejo tiene URLs `r2.dev` embebidas; cambiar solo el
   launcher NO basta.

> Hacer junto al despliegue del modpack (Fase 3).

---

## #9 — `safeStorage` para tokens (S2) — RIESGO MEDIO

**Problema:** JWT, token Yggdrasil y clientToken se guardan en texto plano en
`config.json` (`authenticationDatabase`, `tecnilandSession`). Cualquiera con
acceso al disco roba la sesión.

**Plan:**
- Usar `safeStorage` de Electron (cifra con DPAPI en Windows / keychain en
  macOS) para los campos de token al persistir, y descifrar al cargar.
- Tocar: `configmanager.js` (lectura/escritura de los campos sensibles) y
  `TecnilandAuthManager.js` (save/loadSession).
- `safeStorage.encryptString` devuelve un Buffer → guardar en base64.
- **Migración:** detectar tokens en texto plano existentes y re-cifrarlos en el
  primer arranque (no romper sesiones ya guardadas).
- **Testing obligatorio:** login nuevo, persistencia entre reinicios, refresh de
  token, y arranque con config viejo (migración). Probar en build empaquetado,
  no solo `npm start` (safeStorage depende del SO).

---

## #11 — `contextIsolation: true` (S1) — RIESGO ALTO

**Problema:** el renderer corre con `nodeIntegration: true` +
`contextIsolation: false` (`index.js`). Con inyección de HTML remoto (noticias),
un XSS escala a **RCE** sobre la máquina del usuario.

**Mitigación ya existente:** todo el HTML remoto de noticias pasa por
`SecurityHelper.sanitizeHTML` (DOMParser, allowlist de tags/attrs/urls).
Verificado en Fase 1.

**Plan de fondo (cambio grande, incremental):**
1. Crear un script `preload.js` con `contextBridge.exposeInMainWorld` que
   exponga SOLO las APIs que el renderer necesita (no `require` completo).
2. Migrar los `require(...)` del renderer a llamadas vía el bridge.
3. Activar `contextIsolation: true` + `nodeIntegration: false` en `index.js`.
4. Reemplazar el sanitizador casero por **DOMPurify** (dependencia madura).
5. Probar TODOS los flujos (login, settings, launch, modpacks, skins, noticias).

> Es el cambio más invasivo del proyecto (Helios entero asume el modelo viejo).
> Hacer en una rama dedicada, con testing exhaustivo. No bloqueante para el
> modpack siempre que el sanitizador siga cubriendo todo el HTML remoto.

---

## #12 — Dividir "god files" — RIESGO ALTO

Archivos demasiado grandes, difíciles de mantener:
- `scripts/settings.js` — ~3853 líneas
- `scripts/processbuilder.js` — ~2522
- `scripts/overlay.js` — ~2233
- `scripts/landing.js` — ~2058

**Plan (incremental, un archivo por vez, con testing entre cada uno):**
- Extraer por responsabilidad a módulos (`settings/` con submódulos por pestaña;
  `overlay/` por tipo de overlay; etc.).
- Mantener la API pública/global que el resto del código espera, para no romper
  los `<script>` de los EJS.
- Verificar `node -c` + arranque + flujo afectado tras cada extracción.

> Alto riesgo de romper un launcher funcional. Hacer fuera del camino crítico
> del modpack, una pieza a la vez.

---

## Orden recomendado (post-modpack)
1. #10 dominio R2 (junto al modpack, ya casi listo).
2. #9 safeStorage (mejora de seguridad concreta, riesgo acotado).
3. #12 god files (incremental, sin prisa).
4. #11 contextIsolation + DOMPurify (el más grande, rama dedicada).
