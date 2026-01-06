# Java Download Fix Report

**Fecha:** 3 de Enero, 2026  
**Severidad:** CRÍTICA  
**Estado:** ✅ RESUELTO

---

## Resumen Ejecutivo

El launcher TECNILAND-Nexus crasheaba al intentar descargar Java automáticamente en PCs sin Java instalado. El error ocurría porque el código pasaba `'ADOPTIUM'` como distribución de Java, pero helios-core 2.2.4 solo acepta `'TEMURIN'` o `'CORRETTO'`.

---

## 1. Diagnóstico

### 1.1 Error Original

```
[JavaGuard]: Unknown distribution 'ADOPTIUM'
[Landing]: Unhandled error in Java Download 
Error: Unknown distribution 'ADOPTIUM'
    at latestOpenJDK (C:\...\helios-core\dist\java\JavaGuard.js:217:23)
    at downloadJavaWithCallback (file:///.../landing.js:722:25)
```

### 1.2 Causa Raíz

**Confusión de nomenclatura:**
- **Eclipse Adoptium** = Nombre de la fundación/proyecto
- **Eclipse Temurin** = Nombre de la distribución JDK

El código usaba el nombre del proyecto (`'ADOPTIUM'`) en lugar del nombre de la distribución (`'TEMURIN'`).

### 1.3 Versiones Afectadas

| Componente | Versión |
|------------|---------|
| helios-core | ~2.2.4 |
| helios-distribution-types | ^1.3.0 |

### 1.4 Distribuciones Válidas (helios-core)

Según `helios-distribution-types`:

```javascript
enum JdkDistribution {
    CORRETTO = "CORRETTO",  // Amazon Corretto
    TEMURIN = "TEMURIN"     // Eclipse Temurin (Adoptium)
}
```

---

## 2. Solución Aplicada

### 2.1 Estrategia

En lugar de hardcodear `'TEMURIN'`, la solución **usa `null` para permitir auto-detección por plataforma** según la lógica interna de helios-core:

| Plataforma | Distribución Auto |
|------------|-------------------|
| Windows | TEMURIN |
| Linux | TEMURIN |
| macOS | CORRETTO |

Esto es óptimo porque CORRETTO tiene mejor compatibilidad con macOS (arquitectura ARM/x64).

### 2.2 Archivos Modificados

#### [javamanager.js](../app/assets/js/javamanager.js)

**Cambio 1:** Añadidas constantes y función de validación defensiva (líneas 29-47)

```javascript
// ANTES: No existía validación

// DESPUÉS:
const VALID_JAVA_DISTRIBUTIONS = ['TEMURIN', 'CORRETTO']

function validateDistribution(distribution) {
    if (!distribution) return null
    if (!VALID_JAVA_DISTRIBUTIONS.includes(distribution)) {
        logger.warn(`Invalid Java distribution '${distribution}'. Falling back to auto-detection.`)
        return null
    }
    return distribution
}
```

**Cambio 2:** `generateEffectiveJavaOptions()` (línea ~590)

```javascript
// ANTES:
distribution: 'ADOPTIUM'

// DESPUÉS:
distribution: null // Auto-detect by platform
```

**Cambio 3:** Exports actualizados (final del archivo)

```javascript
module.exports = {
    // ... existentes
    validateDistribution,
    VALID_JAVA_DISTRIBUTIONS
}
```

#### [landing.js](../app/assets/js/scripts/landing.js)

**Cambio 1:** `createServerMock()` fallback (línea ~102)

```javascript
// ANTES:
distribution: 'ADOPTIUM'

// DESPUÉS:
distribution: null // Auto-detect by platform
```

**Cambio 2:** NeoForge Java 17 forzado (línea ~321)

```javascript
// ANTES:
loggerLanding.info('🔽 FORCING Java 17 download from Adoptium...')
distribution: 'ADOPTIUM'

// DESPUÉS:
loggerLanding.info('🔽 FORCING Java 17 download (auto-detect distribution)...')
distribution: null // Auto-detect by platform
```

**Cambio 3:** `downloadJavaWithCallback()` - Validación defensiva (línea ~722)

```javascript
// ANTES:
const asset = await latestOpenJDK(
    effectiveJavaOptions.suggestedMajor,
    ConfigManager.getDataDirectory(),
    effectiveJavaOptions.distribution
)

// DESPUÉS:
const validatedDistribution = JavaManager.validateDistribution(effectiveJavaOptions.distribution)
const asset = await latestOpenJDK(
    effectiveJavaOptions.suggestedMajor,
    ConfigManager.getDataDirectory(),
    validatedDistribution
)
```

**Cambio 4:** `downloadJava()` - Validación defensiva (línea ~883)

```javascript
// ANTES:
const asset = await latestOpenJDK(
    effectiveJavaOptions.suggestedMajor,
    ConfigManager.getDataDirectory(),
    effectiveJavaOptions.distribution)

// DESPUÉS:
const validatedDistribution = JavaManager.validateDistribution(effectiveJavaOptions.distribution)
const asset = await latestOpenJDK(
    effectiveJavaOptions.suggestedMajor,
    ConfigManager.getDataDirectory(),
    validatedDistribution)
```

#### [settings.js](../app/assets/js/scripts/settings.js)

**Cambios:** 3 fallbacks en `getAutoProfileEffectiveJavaOptions()` y `prepareJavaTab()` (líneas ~2634, ~2647, ~2725)

```javascript
// ANTES:
distribution: 'ADOPTIUM'

// DESPUÉS:
distribution: null // Auto-detect by platform
```

---

## 3. Flujo de Descarga de Java (Corregido)

```
Usuario → Click "Jugar"
    ↓
landing.js: dlAsync()
    ↓
JavaManager.resolveJavaForMinecraft(mcVersion)
    ↓
(Si no hay Java compatible)
    ↓
JavaManager.generateEffectiveJavaOptions(mcVersion)
  → Returns { distribution: null, suggestedMajor: 21, ... }
    ↓
landing.js: downloadJavaWithCallback(effectiveJavaOptions)
    ↓
JavaManager.validateDistribution(null) → null ✅
    ↓
helios-core: latestOpenJDK(21, dataDir, null)
    ↓
helios-core: (Windows/Linux) → latestAdoptium() → Descarga TEMURIN
helios-core: (macOS) → latestCorretto() → Descarga CORRETTO
    ↓
landing.js: downloadFile() + extractJdk()
    ↓
✅ Java instalado → Lanzar Minecraft
```

---

## 4. Validación Defensiva

La función `validateDistribution()` protege contra:

1. **Valores inválidos futuros:** Si alguien añade `'AZUL'` o `'LIBERICA'`, no crasheará
2. **Typos:** `'adoptium'` (minúsculas), `'TEMURUN'` (typo)
3. **Valores de configuración legacy:** Si hay configs guardadas con `'ADOPTIUM'`

Comportamiento:
```javascript
validateDistribution('TEMURIN')   → 'TEMURIN'  ✅
validateDistribution('CORRETTO')  → 'CORRETTO' ✅
validateDistribution('ADOPTIUM')  → null + warn log
validateDistribution(null)        → null       ✅
validateDistribution(undefined)   → null       ✅
```

---

## 5. Testing Checklist

### 5.1 Casos Críticos (MUST PASS)

- [ ] **PC Windows sin Java** → Crear instancia Vanilla 1.21 → Click "Jugar" → Descarga Java 21 automáticamente → Minecraft inicia
- [ ] **Java 8 detectado** → Instancia 1.21 → Mensaje claro "Java 21 requerido" → Descarga funciona
- [ ] **Descarga interrumpida** (cerrar launcher) → No deja archivos corruptos → Reintentar descarga funciona
- [ ] **Java descargado se usa** → Verificar que no usa Java 8 del sistema para 1.21
- [ ] **Settings → Java** → Muestra versión detectada correctamente

### 5.2 Casos de Red

- [ ] **Sin internet** → Mensaje claro "Descarga requiere conexión a internet" (no crash)
- [ ] **Descarga lenta** → Progress bar funciona, no timeout prematuro
- [ ] **Descarga parcial** → Validación de hash detecta corrupción → Reintentar

### 5.3 Otros Loaders (No Regresión)

- [ ] **Forge 1.20.1** → Funciona con Java 17, no regresión
- [ ] **Fabric 1.21** → Funciona con Java 21
- [ ] **Quilt 1.20.4** → Funciona con Java 17
- [ ] **NeoForge 1.21** → Forzado Java 17 funciona (caso especial)
- [ ] **OptiFine** → Auto-profiles funcionan

### 5.4 Plataformas (Si aplica)

- [ ] **Windows 10/11 x64** → Descarga TEMURIN
- [ ] **Linux x64** → Descarga TEMURIN
- [ ] **macOS ARM/Intel** → Descarga CORRETTO

---

## 6. Mejoras UI Implementadas

### 6.1 Mensajes de Log Mejorados

```javascript
// Antes:
'🔽 FORCING Java 17 download from Adoptium...'

// Después:
'🔽 FORCING Java 17 download (auto-detect distribution)...'
```

### 6.2 Comentarios Explicativos

Todos los lugares con `distribution: null` ahora tienen comentario explicativo:
```javascript
distribution: null // Auto-detect by platform (TEMURIN on Win/Linux, CORRETTO on macOS)
```

---

## 7. Mejoras Futuras Recomendadas

1. **UI de descarga mejorada:** Mostrar "Descargando Eclipse Temurin 21..." en lugar de solo "Descargando Java..."

2. **Botón descarga manual:** Si falla la descarga automática, mostrar botón con link a:
   - https://adoptium.net/temurin/releases/

3. **Detección de espacio en disco:** Verificar que hay espacio suficiente (~200MB) antes de iniciar descarga

4. **Retry automático:** Si falla la descarga, reintentar 2-3 veces antes de mostrar error

---

## 8. Archivos de Referencia

- **helios-core JavaGuard:** `node_modules/helios-core/dist/java/JavaGuard.js`
- **helios-distribution-types:** `node_modules/helios-distribution-types/dist/index.d.ts`

---

## 9. Contacto

Si este bug reaparece o hay variantes, revisar:

1. Actualización de helios-core que cambie distribuciones válidas
2. Nuevas instalaciones custom con `distribution` hardcodeado
3. Archivos de configuración legacy con `'ADOPTIUM'` guardado

**La validación defensiva debería prevenir crashes**, pero logueará warnings que indican el origen del valor inválido.
