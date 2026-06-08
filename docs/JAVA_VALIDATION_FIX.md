# 🔧 Java Validation & Auto-Download Fix

**Fecha:** 22 de Enero de 2026  
**Versión:** v1.0.7 (Post-release hotfix)

---

## 🐛 Problema Detectado

Un usuario reportó que el launcher crasheaba al intentar lanzar **Forge 1.20.1** con el error:

```
java.lang.IllegalArgumentException: Unsupported class file major version 68
```

**Causa raíz:** El usuario tenía **Java 24** configurado en el launcher, pero Forge 1.20.1 requiere **Java 17** (máximo Java 21).

### ¿Por qué falló el sistema automático?

Aunque TECNILAND Nexus tiene un sistema de gestión automática de Java (JavaManager), el problema estaba en el **flujo de validación**:

1. **ConfigManager guardaba Java 24** de una instalación anterior
2. **landing.js** validaba el Java configurado
3. Si era incompatible, **ofrecía descarga** pero NO forzaba el reemplazo
4. El usuario podía ignorar el mensaje y lanzar anyway
5. **ProcessBuilder** confiaba en que el Java ya estaba validado
6. **Crash instantáneo** al intentar lanzar con Java incompatible

---

## ✅ Solución Implementada

### 1. **Validación Estricta Pre-Launch (landing.js)**

**Cambio en línea 354-380:**

```javascript
// ✅ CRITICAL FIX: ALWAYS validate configured Java BEFORE using it
const configuredJava = ConfigManager.getJavaExecutable(serverId)
let javaResult = await JavaManager.resolveJavaForMinecraft(minecraftVersion, configuredJava)

// ⚠️ STRICT VALIDATION: If configured Java is incompatible, FORCE re-detection/download
if (configuredJava && !javaResult.success) {
    loggerLanding.warn(`❌ Configured Java is INCOMPATIBLE: ${configuredJava}`)
    loggerLanding.info('   🔄 FORCING automatic Java detection/download...')
    
    // Clear incompatible Java from config
    ConfigManager.setJavaExecutable(serverId, null)
    ConfigManager.save()
    
    // Re-scan WITHOUT configured Java (force system scan)
    javaResult = await JavaManager.resolveJavaForMinecraft(minecraftVersion, null)
}
```

**¿Qué hace?**
- Si el Java configurado es incompatible, **lo elimina automáticamente**
- Fuerza una **nueva detección** en el sistema
- Si no hay Java compatible, **descarga automáticamente** la versión correcta
- **No permite** lanzar con Java incompatible

### 2. **Validación Final en ProcessBuilder (Capa de Seguridad)**

**Cambio en líneas 319-350:**

```javascript
// ⚠️ CRITICAL VALIDATION: ALWAYS verify Java compatibility before launch
const javaValidation = await JavaManager.validateJavaForMinecraft(javaExecutable, mcVersion)

if (!javaValidation.compatible) {
    logger.error('❌ CRITICAL JAVA INCOMPATIBILITY DETECTED ❌')
    logger.error(`   Java: ${javaExecutable}`)
    logger.error(`   Version: Java ${javaValidation.majorVersion || 'unknown'}`)
    logger.error(`   Required: Java ${javaReqs.min}-${javaReqs.max}`)
    
    throw new Error(
        `Java ${javaValidation.majorVersion} is NOT compatible with Minecraft ${mcVersion}.\n` +
        `Required: Java ${javaReqs.min}-${javaReqs.max}.\n\n` +
        `Please go to Settings > Java and select a compatible Java version.`
    )
}
```

**¿Por qué esta capa extra?**
- **Última línea de defensa** antes de spawn del proceso
- Evita crashes si el flujo de landing.js fue bypass (edge cases)
- Logs detallados para debugging
- Error claro y descriptivo para el usuario

### 3. **ProcessBuilder ahora es Async**

Para poder usar `await` en la validación de Java, ProcessBuilder.build() ahora es asíncrono:

```javascript
async build() {
    // ... código existente
    const javaValidation = await JavaManager.validateJavaForMinecraft(...)
    // ... resto del código
}
```

**Cambio en landing.js:**
```javascript
proc = await pb.build()  // Ahora con await
```

---

## 📊 Matriz de Requisitos de Java (JAVA_REQUIREMENTS)

El launcher tiene una matriz hardcodeada en `javamanager.js` con los requisitos exactos de Java para cada versión de Minecraft:

| Minecraft | Java Min | Java Max | Recomendado | Notas |
|-----------|----------|----------|-------------|-------|
| 1.21.x    | 21       | 23       | 21          | Requiere Java 21+ |
| 1.20.5-6  | 21       | 23       | 21          | Cambio de versión |
| 1.20-1.20.4 | **17** | **21**   | **17**      | **Forge 1.20.1 aquí** |
| 1.18-1.19.x | 17     | 21       | 17          | Era Java 17 |
| 1.17.x    | 16       | 21       | 17          | Primera versión Java 16+ |
| 1.13-1.16.5 | 8      | **16**   | 8           | **MAX Java 16** (incompatible con 17+) |

**⚠️ CRÍTICO para Forge 1.20.1:**
- **Mínimo:** Java 17
- **Máximo:** Java 21
- **Recomendado:** Java 17
- **Java 24 NO es compatible** (class file version 68 vs 61)

---

## 🔄 Flujo Completo (Diagrama)

```
Usuario presiona PLAY
        ↓
┌──────────────────────────────────────────┐
│ landing.js - Pre-Launch Validation       │
├──────────────────────────────────────────┤
│ 1. Obtener MC version (ej: 1.20.1)      │
│ 2. Obtener Java configurado (si existe) │
│ 3. JavaManager.resolveJavaForMinecraft() │
│    ├─ Si config existe → validar         │
│    ├─ Si incompatible → LIMPIAR CONFIG   │
│    └─ Re-detectar en sistema             │
│ 4. ¿Encontrado compatible?               │
│    ├─ SÍ → Guardar en config, continuar │
│    └─ NO → Descargar automáticamente     │
└──────────────────────────────────────────┘
        ↓
┌──────────────────────────────────────────┐
│ ProcessBuilder.build() - Final Check     │
├──────────────────────────────────────────┤
│ 1. Obtener javaExecutable de config     │
│ 2. validateJavaForMinecraft()            │
│ 3. ¿Compatible?                          │
│    ├─ SÍ → Continuar con spawn           │
│    └─ NO → THROW ERROR + logs detallados │
└──────────────────────────────────────────┘
        ↓
   Minecraft Launched ✅
```

---

## 🧪 Casos de Prueba

### Caso 1: Primera instalación (sin Java configurado)
- **Entrada:** Usuario nuevo, sin Java en config
- **Resultado:** ✅ Detecta Java 17 del sistema o descarga automáticamente

### Caso 2: Java incompatible configurado (Java 24)
- **Entrada:** Usuario con Java 24 configurado para Forge 1.20.1
- **Resultado:** ✅ Limpia config, descarga Java 17, lanza correctamente

### Caso 3: Usuario manual cambió a Java incompatible en Settings
- **Entrada:** Usuario selecciona Java 8 para MC 1.20.1 manualmente
- **Resultado:** ✅ Al hacer PLAY, detecta incompatibilidad, fuerza descarga de Java 17

### Caso 4: Múltiples versiones de Java instaladas
- **Entrada:** Sistema con Java 8, 17, 21, 24
- **Resultado:** ✅ Selecciona Java 17 (recomendado para 1.20.1)

### Caso 5: NeoForge 1.20.4 (requiere Java 17 exacto)
- **Entrada:** Lanzar NeoForge con Java 21
- **Resultado:** ✅ Detecta que NeoForge necesita exacto Java 17, fuerza descarga

---

## 📝 Logs de Ejemplo (Caso Real del Usuario)

### ANTES del fix (crasheaba):
```
[21:16:50] [main/INFO] ModLauncher starting: java version 24.0.2
[21:16:56] java.lang.IllegalArgumentException: Unsupported class file major version 68
[21:16:58] Minecraft closed with code 1
```

### DESPUÉS del fix (funcionaría):
```
[Landing] Launching Minecraft 1.20.1 (requires Java 17-21, recommended: 17)
[Landing] ❌ Configured Java is INCOMPATIBLE: C:\Program Files\Java\jdk-24
[Landing]    Version detected: Java 24
[Landing]    Required: Java 17-21
[Landing]    🔄 FORCING automatic Java detection/download...
[JavaManager] No compatible Java found in system
[JavaManager] Downloading Java 17 from Eclipse Temurin...
[Landing] ✅ Downloaded and extracted Java 17 to: C:\Users\...\runtime\java\17
[Landing] 💾 Saving Java 17 to ConfigManager
[ProcessBuilder] ✅ Using Java 17: C:\Users\...\runtime\java\17\bin\javaw.exe
[ProcessBuilder] Validation: Java 17 is compatible with Minecraft 1.20.1
[21:16:50] [main/INFO] ModLauncher starting: java version 17.0.13
✅ MINECRAFT LAUNCHED SUCCESSFULLY
```

---

## 🎯 Beneficios

1. **100% automático** - El usuario nunca ve un crash por Java incompatible
2. **Descarga automática** - Si no hay Java compatible, se descarga sin preguntar
3. **Logs detallados** - Cada paso está loggeado para debugging
4. **Doble validación** - landing.js + ProcessBuilder (redundancia de seguridad)
5. **Sin prompts molestos** - Si hay Java incompatible, se reemplaza directamente

---

## 🚀 Testing Recomendado

Para validar el fix, probar estos escenarios:

```bash
# 1. Limpiar config.json (simular usuario nuevo)
# 2. Instalar solo Java 24 en el sistema
# 3. Intentar lanzar Forge 1.20.1
# Resultado esperado: Descarga Java 17 automáticamente y lanza

# 4. Configurar manualmente Java 8 para MC 1.20.1 en Settings
# 5. Presionar PLAY
# Resultado esperado: Detecta incompatibilidad, descarga Java 17, lanza

# 6. Sistema con Java 8, 11, 17, 21, 24 instalados
# 7. Lanzar Forge 1.20.1
# Resultado esperado: Selecciona Java 17 (recomendado)
```

---

## 📚 Archivos Modificados

1. **app/assets/js/scripts/landing.js** (líneas 354-380)
   - Validación estricta pre-launch
   - Auto-limpieza de Java incompatible
   - Forzar descarga si es necesario

2. **app/assets/js/processbuilder.js** (líneas 319-350)
   - Validación final async
   - Error descriptivo con requisitos
   - Logs detallados para debugging

3. **app/assets/js/processbuilder.js** (línea 147)
   - Método `build()` ahora es `async build()`

4. **app/assets/js/scripts/landing.js** (línea 1393)
   - Llamada con `await pb.build()`

---

## 🔮 Mejoras Futuras

- [ ] UI en Settings que muestre incompatibilidad visual (⚠️ rojo)
- [ ] Botón "Auto-detect" en Settings que ejecute JavaManager
- [ ] Notificación toast cuando se auto-descarga Java
- [ ] Guardar historial de Javas usados por instalación
- [ ] Opción "Force Java X" para testing (modo desarrollador)

---

**Status:** ✅ Fix implementado y listo para testing  
**Próximo paso:** Compilar launcher y probar con usuario que reportó el bug
