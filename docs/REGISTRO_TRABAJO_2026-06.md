# Registro de trabajo — Junio 2026

Consolidado de la sesión de auditoría/saneamiento del launcher TECNILAND Nexus
y backup del backend. Complementa `docs/AUDITORIA_v1.0.8.md` y
`docs/FASE2_PLAN.md`.

---

## Fase 0 — bugs + versionado (COMPLETA, pusheada)

Commit `726cc10`.

- **B1** — refresh de token Yggdrasil no se persistía (args posicionales en vez
  de objeto). Corregido en `TecnilandAuthManager.js`.
- **B2** — `clientToken` se guardaba como `undefined` (`this.clientToken` no
  existe → `this.yggdrasilClientToken`).
- **B3** — `getSelectedServer()` default devolvía el campo equivocado.
- **npm audit** — 25→10 (restantes solo build-chain, no se empaquetan).
- **Versionado** — `package.json`=1.0.8 = fuente única. Tags Helios locales
  (v0.x, v1.1+, v2.x, prereleases) borrados; quedan v1.0.0–v1.0.5 (sync remoto).
  Auto-updater verificado sano (solo 1 release real en GitHub: v1.0.8).

## Fase 1 — saneamiento (COMPLETA, pusheada)

Commit `6c19946`.

- Docs sueltas de la raíz movidas a `docs/archive/` (gitignored).
- Código muerto eliminado (verificado sin llamadores externos):
  - `modpackmanager.js`: `calculateModpackSize`, `getFreeDiskSpace`,
    `checkDiskSpace`, `isPreservedFile`, constantes `PRESERVED_FILES` /
    `DISK_SPACE_BUFFER`, `require('check-disk-space')` (ausente de
    package.json) y un bloque de comentario duplicado. Se conservan
    `calculateModulesSize` y `formatBytes` (los usa `getModpackState`).
  - `TecnilandAuthManager.js`: `getPrefetchedMetadata` (sin llamadores).
- **Noticias / HTML remoto**: verificado que TODO el contenido de noticias pasa
  por `SecurityHelper.sanitizeHTML` antes de inyectarse al DOM (ya existía).
  Cambio mínimo: se escapa `article.title` en el `alt` de la imagen de portada
  (defensa en profundidad). **El flujo no cambió**: backend activo → noticias
  del front-end; backend caído → fallback local del launcher.
- **PII en logs**: se dejó de escribir en consola la respuesta completa del
  backend (contenía datos de usuario) en `validateSession` y
  `validateYggdrasilToken`. Ahora solo flags booleanos. Sin cambio funcional.

## Fase 2 — solo parte segura (resto diferido a post-modpack)

Commit `861c21e`. Detalle y plan del trabajo diferido en `docs/FASE2_PLAN.md`.

- `distromanager.js`: `REMOTE_DISTRO_URL` acepta override opcional por env
  `TECNILAND_DISTRO_URL`. **El valor por defecto sigue siendo la URL R2 de
  siempre** — si no se setea la env var, todo funciona igual que antes.
- **Decisión del usuario**: diferir safeStorage, split de god files y
  contextIsolation hasta después del modpack.

## Fase 3 — nuevo modpack

Objetivo principal. **Requiere aprobación explícita del usuario** antes de
empezar.

---

## Backend — backup (extra, fuera de la auditoría del launcher)

Repo backend: `tecniland-backend` (NO versionado en git por decisión del
usuario; no se pushea).

- **Litestream → Cloudflare R2** activo y verificado. Replica continua de
  `tecniland.db` (sync 10s, snapshot 1h, retención 72h). Si el volumen de Fly
  muere/recrea, restaura solo al arrancar. Restore probado: 6=6 usuarios.
  Archivos: `litestream.yml`, `scripts/run.sh`, cambios en `Dockerfile`.
  Secrets R2 en Fly: `R2_BUCKET`, `R2_ENDPOINT`, `LITESTREAM_ACCESS_KEY_ID`,
  `LITESTREAM_SECRET_ACCESS_KEY`.
- **fly.toml**: always-on (`auto_stop_machines='off'`,
  `min_machines_running=1`), RAM `1024mb`.
- **Pendiente**: las skins (`/data/uploads/skins`) NO están respaldadas (solo la
  DB). Plan: mover skins a R2 o backup aparte.
- SQLite alcanza de sobra para ~15 jugadores simultáneos. Migración a
  Postgres/Supabase solo si se necesita alta disponibilidad / multi-instancia.

---

## Sobre Nebula y R2 (aclaración)

- **No se requiere dominio propio.** El setup actual (bucket R2 servido en
  `pub-…r2.dev/nebula/`) funciona. El dominio propio es *opcional* y solo
  evitaría el rate-limit de `r2.dev` bajo descarga masiva — no es necesario a la
  escala actual.
- Flujo Nebula: `init root` → `g server` → colocar archivos → `g distro` (usa
  `BASE_URL` del `.env` de Nebula para armar las URLs de assets) → subir el
  resultado al bucket R2. El launcher lee `distribution.json` desde esa URL
  (`REMOTE_DISTRO_URL`).

---

## Pendientes abiertos

1. R2 dominio propio — **opcional**, solo si hay rate-limit a futuro.
2. Backup de skins del backend a R2.
3. Rotar token R2 (compartido en local; pendiente cosmético).
4. Fase 2 pesada (safeStorage, god files, contextIsolation) — post-modpack.
5. Fase 3 (modpack) — espera aprobación explícita.
