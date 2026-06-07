# Auditoría TECNILAND Nexus — v1.0.8

**Fecha:** 2026-06-06
**Alcance:** código fuente (`index.js`, `app/assets/js/**`), dependencias, estructura, seguridad.
**Base:** Fork de Helios Launcher + sistema propio (auth TECNILAND, skins, modpacks vía Nebula/R2).
**Estado general:** Funcional, pero con bugs reales en el flujo de auth, deuda técnica acumulada y caos de versionado. Necesita una pasada de limpieza antes del próximo modpack.

---

## 1. Resumen ejecutivo

| Categoría | Severidad | Cantidad |
|-----------|-----------|----------|
| Bugs funcionales | 🔴 Alta | 1 |
| Bugs funcionales | 🟡 Media | 2 |
| Seguridad | 🔴 Alta | 1 |
| Seguridad | 🟡 Media | 2 |
| Dependencias (npm audit) | 🔴 Alta | 18 |
| Código muerto / inconsistencias | 🟢 Baja | varios |

**Prioridad inmediata antes de publicar:** arreglar el bug de refresh de token (#B1) y decidir el modelo de versionado (#V1).

---

## 2. Bugs funcionales

### 🔴 B1 — Refresh de token Yggdrasil NUNCA se persiste
**Archivo:** `app/assets/js/tecnilandauth/TecnilandAuthManager.js:945` ↔ `app/assets/js/configmanager.js:535`

`_updateAccountToken()` llama:
```js
ConfigManager.updateTecnilandAuthAccount(
    this.currentUser.uuid,
    this.yggdrasilAccessToken,                                  // ❌ string
    Date.now() + TecnilandAuthConfig.SESSION_CONFIG.YGGDRASIL_EXPIRY_MS  // ❌ number
)
```
Pero la firma real es `updateTecnilandAuthAccount(uuid, updates)` donde `updates` debe ser un **objeto**:
```js
if (updates.accessToken) account.accessToken = updates.accessToken   // updates = string → undefined
```
**Efecto:** tras un `refreshYggdrasil()`, el token nuevo se guarda en memoria y en `tecnilandSession`, pero **NO** en la `authenticationDatabase` de la cuenta. El launch lee de la cuenta → puede usar un token Yggdrasil viejo/expirado → fallo de auth al lanzar Minecraft después de unos días.

**Fix:**
```js
ConfigManager.updateTecnilandAuthAccount(this.currentUser.uuid, {
    yggdrasilToken: this.yggdrasilAccessToken,
    accessToken: this.jwtToken
})
```

### 🟡 B2 — `clientToken` se guarda como `undefined`
**Archivo:** `app/assets/js/tecnilandauth/TecnilandAuthManager.js:932`

`_addTecnilandAccountToConfig()` pasa `this.clientToken`, pero ese campo no existe en la clase. El campo real es `this.yggdrasilClientToken`. Resultado: la cuenta queda con `clientToken: undefined`.
**Fix:** usar `this.yggdrasilClientToken`.

### 🟡 B3 — `getSelectedServer()` devuelve el campo equivocado por defecto
**Archivo:** `app/assets/js/configmanager.js:298`
```js
return !def ? config.selectedServer : DEFAULT_CONFIG.clientToken   // ❌
```
Debe devolver `DEFAULT_CONFIG.selectedServer`. Solo afecta al fallback `def=true`, pero es claramente un copy-paste.

---

## 3. Seguridad

### 🔴 S1 — `nodeIntegration: true` + `contextIsolation: false` + contenido remoto
**Archivo:** `index.js:419-420`

El renderer tiene Node.js completo y sin aislamiento de contexto. El launcher inyecta HTML remoto (noticias) en el DOM. Si ese HTML logra ejecutar JS, es **RCE completa** sobre la máquina del usuario, no solo XSS.

Existe `securityhelper.js` que sanitiza, pero:
- Es un sanitizador casero (no DOMPurify). El fallback por regex (`sanitizeHTMLBasic`) es bypasseable.
- Solo protege si **todas** las rutas de inyección pasan por él.

**Mitigación realista (sin reescribir todo Helios):**
1. Verificar que **todo** HTML remoto pasa por `sanitizeHTML()` antes de tocar el DOM.
2. Reemplazar el sanitizador casero por `DOMPurify` (dependencia madura).
3. Plan a futuro: migrar a `contextIsolation: true` + `preload` con `contextBridge` (es el cambio grande, pero es la única solución de fondo).

### 🟡 S2 — Tokens almacenados en texto plano
**Archivos:** `configmanager.js` (`authenticationDatabase`, `tecnilandSession`)

JWT, token Yggdrasil y clientToken se guardan sin cifrar en `config.json`. Cualquiera con acceso al disco roba la sesión.
**Fix:** usar `safeStorage` de Electron (cifra con keychain/DPAPI del SO) para los campos de token. Heredado de Helios, pero conviene cerrarlo.

### 🟡 S3 — 25 vulnerabilidades en dependencias (18 high)
`npm audit`: `tar-fs` (symlink bypass), `tmp` (path traversal), cadena de `electron-builder`.
La mayoría son del *build chain* (no se empaquetan en el cliente), pero conviene:
```
npm audit fix
```
y revisar manualmente lo que requiera `--force`.

### 🟢 S4 — `decodeURI` en callback de Microsoft Auth
**Archivo:** `index.js:336` — usar `decodeURIComponent` para valores de query individuales (`decodeURI` no decodifica `&`, `=`, etc.). Bajo impacto.

---

## 4. Código muerto / inconsistencias

- **`modpackmanager.js:451-456`** — bloque de comentario duplicado literalmente.
- **`modpackmanager.js`** — `isPreservedFile`, `PRESERVED_FILES`, `DISK_SPACE_BUFFER`, `checkDiskSpace`, `calculateModpackSize` parecen sin uso real (el propio código dice "solo para referencia futura"). Decidir: usar o borrar.
- **`require('check-disk-space')`** (`modpackmanager.js:237`) — el paquete **no está en `package.json`**, así que siempre cae al fallback. Añadir la dependencia o quitar la rama.
- **`TecnilandAuthManager.getPrefetchedMetadata()`** — definido pero nunca llamado.
- **Logging ruidoso de sesión** — `validateSession()` loguea la respuesta completa del backend (incluye datos de usuario/PII) en debug. Los tokens no se loguean (bien), pero conviene reducir.
- **Docs sueltas en raíz** — múltiples `RELEASE_NOTES_v1.0.x.md`, `FIX_*.md`, `SOLUCION_*.md` sin trackear. Mover a `docs/archive/` (ya ignorado en `.gitignore`).

---

## 5. Versionado (el lío principal)

### V1 — No hay una única fuente de verdad
- `package.json` → **1.0.8**
- Tags git → hasta **v2.2.1** (heredados de Helios, no corresponden a este proyecto)
- Docs → `v1.0.5`, `v1.0.6`, `RELEASE_NOTES_v1.0.8`
- `engines.node` → `20.x.x`, pero el entorno corre Node **22.15** (Electron 33 trae su propio Node, así que solo afecta a herramientas dev).

**Recomendación:**
1. Definir `package.json` como única fuente de versión.
2. Borrar/ignorar los tags heredados de Helios o re-taggear limpio desde la versión actual.
3. El auto-updater (`electron-updater`) compara contra los releases de GitHub: si los tags están desalineados, las actualizaciones pueden romperse. **Verificar antes de publicar el modpack.**

---

## 6. Arquitectura y estructura

**Bien:**
- Separación modular clara: `tecnilandauth/`, `customskinloader/`, `skinviewer3d/`, `launch/loader/`.
- `securityhelper.js` añadido (buena intención).
- Sistema de caché de versiones (`versionapi.js`) razonable.

**A mejorar:**
- **God files:** `settings.js` (3853 líneas), `processbuilder.js` (2522), `overlay.js` (2233), `landing.js` (2058). Difíciles de mantener; candidatos a dividir por responsabilidad.
- **Dos sistemas de auth en paralelo** (Microsoft/Mojang de Helios + Yggdrasil TECNILAND). Documentar claramente cuál usa cada flujo para no mezclar tokens.

---

## 7. Nebula / Distribución

- `distromanager.js:7` sirve la distribución desde una **URL pública de desarrollo de R2**: `https://pub-...r2.dev/nebula/distribution.json`.
  Cloudflare advierte que `r2.dev` está *rate-limited* y **no es para producción**. Con muchos usuarios bajando el modpack, puede throttlearse.
  **Fix:** dominio propio conectado al bucket R2 + caché de Cloudflare.
- Integridad de módulos: helios-core valida hashes de los artifacts → OK. Pero el `distribution.json` en sí se sirve sin firma; confías en R2.

---

## 8. Hoja de ruta sugerida (orden)

**Fase 0 — antes de tocar nada nuevo (1 día)**
1. Arreglar B1 (refresh token) ← bloqueante real para usuarios.
2. Arreglar B2 y B3.
3. `npm audit fix`.
4. Decidir versionado (V1) y limpiar tags.

**Fase 1 — saneamiento (2-3 días)**
5. Mover docs sueltas a `docs/archive/`.
6. Borrar código muerto (sección 4).
7. Verificar que TODO HTML remoto pasa por el sanitizador; cambiar a DOMPurify.
8. Reducir logging de PII.

**Fase 2 — endurecimiento (cuando haya tiempo)**
9. `safeStorage` para tokens.
10. Dominio propio para R2.
11. Plan de migración a `contextIsolation: true`.
12. Dividir los god files.

**Fase 3 — modpack nuevo**
13. Con Nebula: generar nueva distribución, validar contra el launcher saneado, taggear release limpio, publicar.
