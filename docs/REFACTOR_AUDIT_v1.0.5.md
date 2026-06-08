# 🔍 Auditoría de Código - TECNILAND Nexus

**Fecha**: Enero 2026  
**Versión objetivo**: v1.0.5 (mantenimiento)  

---

## ⚠️ REGLA CRÍTICA

**NO TOCAR** el fix de JVM args en `processbuilder.js`:
- `_processForgeJvmArgs()`
- `_deduplicateJvmArgs()` (lógica de pares)
- Guard-rail de validación pre-spawn
- Ningún cambio que afecte el comportamiento del launch

---

## 📋 Resumen de Hallazgos

| Categoría | Hallazgos | Alto | Medio | Bajo |
|-----------|-----------|------|-------|------|
| Dead Code | 5 | 0 | 2 | 3 |
| Duplicados | 3 | 1 | 1 | 1 |
| Errores Potenciales | 4 | 1 | 2 | 1 |
| Logging Ruidoso | 3 | 0 | 1 | 2 |

---

## 1️⃣ DEAD CODE

### DC-01: Función duplicada `getNeoForgeVersions`
- **Archivo**: `app/assets/js/versionapi.js`
- **Líneas**: L444-495 y L567-632
- **Problema**: La segunda definición sobrescribe la primera (L567 gana). La primera (L444-495) es código muerto.
- **Riesgo**: **MEDIO** - Código confuso, la primera nunca ejecuta
- **Fix**: Eliminar L444-495 (la versión antigua/incompleta)

### DC-02: Variable sin usar `loginOptionsCancellable`
- **Archivo**: `app/assets/js/scripts/loginOptions.js`
- **Problema**: Variable declarada pero nunca usada
- **Riesgo**: **BAJO**
- **Fix**: Eliminar declaración

### DC-03: Código comentado extenso
- **Archivo**: `app/assets/js/processbuilder.js`
- **Líneas**: Múltiples bloques con `/* ... */`
- **Problema**: Comentarios largos de implementaciones alternativas (NEOFORGE SRG JAR, etc.)
- **Riesgo**: **BAJO** - No afecta runtime pero dificulta lectura
- **Fix**: Mantener solo TODOs, mover explicaciones a docs/

### DC-04: Bloque diagnóstico comentado `MODULE PATH DIAGNOSTICS`
- **Archivo**: `app/assets/js/processbuilder.js`
- **Líneas**: ~L243-259
- **Problema**: Código de debug comentado
- **Riesgo**: **BAJO**
- **Fix**: Mover a función helper con flag isDev, o eliminar

### DC-05: Constante `ACTIVITY_LINGER_TIME` posiblemente sin usar
- **Archivo**: `app/assets/js/discordwrapper.js`
- **Problema**: Verificar si se usa realmente o es placeholder
- **Riesgo**: **BAJO**
- **Fix**: Verificar uso y eliminar si no se necesita

---

## 2️⃣ CÓDIGO DUPLICADO

### DUP-01: `getNeoForgeVersions` duplicada **(CRÍTICO)**
- **Archivo**: `app/assets/js/versionapi.js`
- **Problema**: Misma función definida 2 veces (L444 y L567)
- **Riesgo**: **ALTO** - Confusión, mantenibilidad
- **Fix**: Eliminar la primera definición (L444-495)

### DUP-02: `require('OptiFineVersions')` duplicado
- **Archivo**: `app/assets/js/scripts/landing.js`
- **Problema**: Se importa al inicio del archivo Y dentro de event handlers
- **Riesgo**: **MEDIO** - Imports innecesarios en cada llamada
- **Fix**: Usar solo el import del inicio

### DUP-03: Lógica de servidor virtual repetida
- **Archivos**: `uibinder.js`, `overlay.js`
- **Problema**: `InstallationManager.installationToServer()` y `autoProfileToServer()` se llaman con patrones similares en múltiples lugares
- **Riesgo**: **BAJO** - Funciona pero verbose
- **Fix**: Opcional - Crear helper `createVirtualServerContext()`

---

## 3️⃣ ERRORES POTENCIALES

### ERR-01: `updateSelectedServer` orden de carga **(CRÍTICO)**
- **Archivos**: `uibinder.js` (llama), `landing.js` (define)
- **Problema**: `uibinder.js` se carga en `<head>` (app.ejs L6), `landing.js` se carga en el body (landing.ejs L219). Las llamadas a `updateSelectedServer` en uibinder.js podrían fallar si landing.js no ha cargado.
- **Riesgo**: **ALTO** - Posible error "updateSelectedServer is not defined"
- **Estado actual**: Funciona por timing, pero es frágil
- **Fix seguro**: Agregar check defensivo en uibinder.js:
  ```javascript
  if (typeof updateSelectedServer === 'function') {
      updateSelectedServer(...)
  } else {
      console.warn('[UIBinder] updateSelectedServer not ready, deferring...')
      // Retry después de DOMContentLoaded
  }
  ```

### ERR-02: Promise `.catch(() => {})` vacío
- **Archivo**: `app/assets/js/discordwrapper.js`
- **Problema**: Errores silenciados sin logging
- **Riesgo**: **MEDIO** - Bugs difíciles de rastrear
- **Fix**: Agregar `logger.debug()` mínimo

### ERR-03: `settingsJavaExecVal` verificación typeof
- **Archivo**: `app/assets/js/scripts/settings.js`
- **Problema**: Múltiples checks `typeof settingsJavaExecVal !== 'undefined'` sugieren variable no siempre inicializada
- **Riesgo**: **MEDIO** - Posible race condition
- **Fix**: Asegurar inicialización antes de uso

### ERR-04: Console.log en código de producción
- **Archivos**: Varios en `app/assets/js/scripts/`
- **Problema**: `console.log()` debería usar `logger` para consistencia
- **Riesgo**: **BAJO** - Funciona pero inconsistente
- **Fix**: Reemplazar con logger donde sea apropiado

---

## 4️⃣ LOGGING RUIDOSO

### LOG-01: Logs de detección de loaders muy verbosos
- **Archivo**: `app/assets/js/processbuilder.js`
- **Líneas**: L112, L127, L142, L280
- **Problema**: `Detected Fabric/Quilt/NeoForge loader module: type=X, id=unknown` aparece múltiples veces
- **Riesgo**: **BAJO** - Ruido en consola
- **Fix**: Cambiar a `logger.debug()` o agregar flag

### LOG-02: Bloques `=== HEADER ===` muy frecuentes
- **Archivo**: `app/assets/js/processbuilder.js`
- **Problema**: Muchos bloques estilo `=== NEOFORGE: X ===` llenan la consola
- **Riesgo**: **MEDIO** - Difícil encontrar errores reales
- **Fix**: Reducir a un log por sección, o usar nivel DEBUG

### LOG-03: Debug de JVM args
- **Archivo**: `app/assets/js/processbuilder.js`
- **Líneas**: ~L400-430 (FINAL SPAWN ARGUMENTS DEBUG)
- **Problema**: Imprime los primeros/últimos 20 args en cada launch
- **Riesgo**: **BAJO** - Útil para debug pero ruidoso
- **Fix**: Mover detrás de flag `isDev` o nivel DEBUG

---

## 📝 PLAN DE REFACTOR (PRs Pequeños)

### PR-1: Eliminar duplicado `getNeoForgeVersions`
**Cambios**: 1 archivo  
**Riesgo**: Bajo (la versión eliminada nunca ejecutaba)
1. Eliminar `versionapi.js` L444-495
2. Mantener solo la versión L567-632

### PR-2: Fix defensivo para `updateSelectedServer`
**Cambios**: 1 archivo  
**Riesgo**: Bajo (solo agrega checks)
1. En `uibinder.js`, envolver llamadas a `updateSelectedServer` con verificación de existencia
2. Agregar fallback con retry en DOMContentLoaded si es necesario

### PR-3: Eliminar imports duplicados
**Cambios**: 1-2 archivos  
**Riesgo**: Muy bajo
1. Eliminar `require('OptiFineVersions')` duplicados en landing.js (dentro de handlers)
2. Usar solo el import del inicio del archivo

### PR-4: Reducir logging ruidoso
**Cambios**: 1 archivo  
**Riesgo**: Muy bajo (solo cambia niveles de log)
1. Cambiar logs de detección de loaders a `logger.debug()`
2. Consolidar bloques `=== HEADER ===` donde sea posible
3. Mover "FINAL SPAWN ARGUMENTS DEBUG" detrás de condición isDev

### PR-5: Limpieza menor de código muerto
**Cambios**: 3-4 archivos  
**Riesgo**: Muy bajo
1. Eliminar `loginOptionsCancellable` no usada
2. Reducir comentarios extensos (mover a docs)
3. Agregar logging mínimo a `.catch(() => {})` vacíos

---

## ✅ VALIDACIONES REQUERIDAS

Antes de merge de cada PR:
1. [ ] `npm start` - Launcher arranca sin errores
2. [ ] Vanilla 1.20.x - Inicia correctamente
3. [ ] Forge 1.20.1 (TECNILAND OG) - Inicia sin error de JVM args
4. [ ] `npm run dist` - Build exitoso
5. [ ] Instalar .exe y probar en modo producción

---

## 🚫 SEPARADO PARA DISCUTIR

Estos cambios podrían afectar comportamiento y requieren evaluación adicional:

1. **Refactor de arquitectura uibinder/landing**
   - Mover `updateSelectedServer` a un módulo compartido
   - Cambiaría cómo se cargan los scripts
   - **Decisión**: Posponer para v2.0

2. **Sistema de niveles de logging**
   - Implementar DEBUG/INFO/WARN/ERROR configurable
   - Afecta toda la aplicación
   - **Decisión**: Diseñar antes de implementar

3. **Unificar lógica de servidor virtual**
   - Crear helper centralizado para conversión installation→server
   - Requiere tests extensivos
   - **Decisión**: Evaluar después de PR-1 a PR-5
