# Settings Wiring Report

**Fecha:** 29 de diciembre de 2025  
**Versión:** 1.0  
**Estado:** Implementación completada (tareas 1-6)

---

## **Resumen Ejecutivo**

Este documento detalla el mapeo completo entre controles UI de Settings, claves de configuración en ConfigManager, y su uso en runtime (ProcessBuilder y otros). El refactor migró JVM args de per-installation a **global**, implementó sanitización de memoria, y mejoró la UX con contexto visual.

---

## **1. Mapeo UI → ConfigManager → Runtime**

### **Java Tab**

| UI Control | Atributo cValue | ConfigManager Key | ConfigManager Method | Runtime Usage | Notas |
|------------|-----------------|-------------------|----------------------|---------------|-------|
| Min RAM Slider | `MinRAM` (serverDependent) | `javaConfig[serverid].minRAM` | `getMinRAM(serverid)`<br>`setMinRAM(serverid, val)` | ProcessBuilder: `-Xms{value}` | Valores: `2G`, `3G`, `3.5G`, etc. |
| Max RAM Slider | `MaxRAM` (serverDependent) | `javaConfig[serverid].maxRAM` | `getMaxRAM(serverid)`<br>`setMaxRAM(serverid, val)` | ProcessBuilder: `-Xmx{value}` | **Fuente de verdad única para memoria** |
| Java Executable | `JavaExecutable` (serverDependent) | `javaConfig[serverid].executable` | `getJavaExecutable(serverid)`<br>`setJavaExecutable(serverid, path)` | ProcessBuilder: spawn path | Path absoluto a `javaw.exe` / `java` |
| **Opciones Adicionales JVM** | **`GlobalJVMOptions`** (sin serverDependent) | **`settings.java.additionalJvmArgs`** | **`getGlobalJVMOptions()`**<br>**`setGlobalJVMOptions(arr)`** | **ProcessBuilder: `_mergeCustomJvmArgs()`** | **GLOBAL: aplica a todas las instalaciones** |
| *(Legacy)* JVMOptions | `JVMOptions` (serverDependent) | `javaConfig[serverid].jvmOptions` | `getJVMOptions(serverid)`<br>`setJVMOptions(serverid, arr)` | ProcessBuilder: merge con global | **Deprecated pero mantenido para compatibilidad** |

**Instalación Context (Visual Only)**:
- Nombre, Loader, Minecraft Version → poblado desde `ConfigManager.getSelectedInstallation()` + `getInstallation(id)`
- **No afecta runtime**, solo contexto visual para el usuario

---

### **Minecraft Tab**

| UI Control | Atributo cValue | ConfigManager Key | ConfigManager Method | Runtime Usage | Notas |
|------------|-----------------|-------------------|----------------------|---------------|-------|
| Resolution Width | `GameWidth` | `settings.game.resWidth` | `getGameWidth()`<br>`setGameWidth(val)` | ProcessBuilder: `--width {value}` | Píxeles (ej: 1280) |
| Resolution Height | `GameHeight` | `settings.game.resHeight` | `getGameHeight()`<br>`setGameHeight(val)` | ProcessBuilder: `--height {value}` | Píxeles (ej: 720) |
| Fullscreen Toggle | `Fullscreen` | `settings.game.fullscreen` | `getFullscreen()`<br>`setFullscreen(bool)` | ProcessBuilder: `--fullscreen` flag | Boolean |
| Auto Connect Toggle | `AutoConnect` | `settings.game.autoConnect` | `getAutoConnect()`<br>`setAutoConnect(bool)` | ProcessBuilder: `_processAutoConnectArg()` | Si true + server.autoconnect |
| Launch Detached Toggle | `LaunchDetached` | `settings.game.launchDetached` | `getLaunchDetached()`<br>`setLaunchDetached(bool)` | ProcessBuilder: detached spawn option | Boolean |

---

### **Launcher Tab**

| UI Control | Atributo cValue | ConfigManager Key | ConfigManager Method | Runtime Usage | Notas |
|------------|-----------------|-------------------|----------------------|---------------|-------|
| Allow Prerelease Toggle | `AllowPrerelease` | `settings.launcher.allowPrerelease` | `getAllowPrerelease()`<br>`setAllowPrerelease(bool)` | Landing: filtro de versiones | Boolean |
| **Show Legacy Versions Toggle** | **`ShowLegacyVersions`** | **`settings.launcher.showLegacyVersions`** | **`getShowLegacyVersions()`**<br>**`setShowLegacyVersions(bool)`** | **installation-editor.js: filtro <1.13** | **Conectado (tarea 8)** |
| Show Live Logs Toggle | `ShowLiveLogs` | `settings.launcher.showLiveLogs` | `getShowLiveLogs()`<br>`setShowLiveLogs(bool)` | Landing: live log viewer | Boolean |
| Language Selector | - (custom handler) | `settings.launcher.language` | `getLanguage()`<br>`setLanguage(lang)` | LangLoader: i18n | `es_ES`, `en_US` |
| Data Directory | `DataDirectory` | `settings.launcher.dataDirectory` | `getDataDirectory()`<br>`setDataDirectory(path)` | ConfigManager: base path | Path absoluto |
| Experimental Loaders Toggle | `ExperimentalLoaders` | *(no implementado)* | - | - | Placeholder futuro |

---

### **Mods Tab**

| Funcionalidad | Método | Descripción | Notas |
|---------------|--------|-------------|-------|
| Detección de Loader | `prepareModsTab()` | Lee `installation.loader` o `installation.modLoader` | Vanilla/OptiFine → oculta controles |
| Mensaje "No disponible" | `settingsModsUnavailableMessage` | Mostrado si loader es Vanilla/OptiFine | "Mods no disponibles para instalaciones Vanilla/OptiFine" |
| Ruta carpeta mods | `settingsModsPath` | Path absoluto: `{instanceDir}/{installId}/mods` | Tooltip si no existe: "Se creará automáticamente" |

---

## **2. Flujo de Datos Completo**

### **Guardado de Settings**

```
User Input (UI)
    ↓
saveSettingsValues() [settings.js]
    ↓
parseJvmArgs() → sanitize (-Xmx/-Xms removed)
    ↓
ConfigManager.setGlobalJVMOptions(sanitizedArgs)
    ↓
config.settings.java.additionalJvmArgs = [...]
    ↓
ConfigManager.save() → config.json escrito a disco
```

**Sanitización JVM Args:**
1. Input: `-Dtest=true -Xmx6G -Xms2G -Dfoo=bar`
2. Parse con comillas: `['-Dtest=true', '-Xmx6G', '-Xms2G', '-Dfoo=bar']`
3. Filtro regex `/^-(Xmx|Xms)/`: eliminar `-Xmx6G`, `-Xms2G`
4. Output: `['-Dtest=true', '-Dfoo=bar']`
5. Warning overlay: "Se ignoraron 2 argumentos de memoria (-Xmx/-Xms). Usa los sliders de RAM."
6. Log: `JVM args sanitization: input=4, ignored=2 (memory flags), final=2`

---

### **Carga de Settings**

```
initSettingsValues() [settings.js]
    ↓
Para cada elemento [cValue]:
    ↓
ConfigManager['get' + cValue].apply(null, opts)
    ↓
    Si cValue == 'GlobalJVMOptions':
        ConfigManager.getGlobalJVMOptions()
            ↓
        config.settings.java.additionalJvmArgs
            ↓
        .join(' ') → input value
```

---

### **Construcción de Args (Runtime)**

```
ProcessBuilder.build()
    ↓
_constructJVMArguments113() (o 112 para <1.13)
    ↓
Base JVM args (vanilla manifest)
    ↓
Loader JVM args (Forge/Fabric/Quilt manifest)
    ↓
RAM args: -Xmx, -Xms (desde sliders)
    ↓
_mergeCustomJvmArgs(args, serverId):
    ├─ globalArgs = ConfigManager.getGlobalJVMOptions()
    ├─ legacyArgs = ConfigManager.getJVMOptions(serverId)
    ├─ customArgs = [...globalArgs, ...legacyArgs]
    ├─ Log: "=== CUSTOM JVM ARGS ==="
    ├─ Sanitize para logging (redact tokens/passwords)
    ├─ args = args.concat(customArgs)
    └─ _deduplicateJvmArgs(args)
        ↓
    Deduplicación por key:
        -Dfoo=1 + -Dfoo=2 → mantiene -Dfoo=1 (primera ocurrencia)
        Log warning: "Duplicate JVM arg detected: -Dfoo"
        ↓
Final JVM args array → spawn(java, args)
```

**Ejemplo de Log:**
```
=== CUSTOM JVM ARGS ===
  Global args: 2
  Total custom args: 2
  Args: -Dtest.custom=true -Dfoo=bar
=======================
```

Si hay legacy args:
```
=== CUSTOM JVM ARGS ===
  Global args: 2
  Legacy per-installation args: 1 (deprecated)
  Total custom args: 3
  Args: -Dtest.custom=true -Dfoo=bar -Dlegacy=old
=======================
Duplicate JVM arg detected: -Dfoo (keeping first occurrence)
```

---

## **3. Arquitectura de Compatibilidad**

### **Legacy vs Global JVM Args**

| Aspecto | Legacy (`javaConfig[serverid].jvmOptions`) | Global (`settings.java.additionalJvmArgs`) |
|---------|-------------------------------------------|--------------------------------------------|
| **Ámbito** | Por instalación/servidor | Global (todas las instalaciones) |
| **UI** | Deprecated (ya no editable desde UI) | `GlobalJVMOptions` input (Java tab) |
| **Storage** | `config.javaConfig[serverid].jvmOptions` | `config.settings.java.additionalJvmArgs` |
| **Runtime** | Merge después de global | Primera prioridad en merge |
| **Estado** | Mantenido para compatibilidad | **Método preferido (nuevo)** |

### **Merge Order en Runtime**

1. **Base args** (vanilla manifest: `-classpath`, `-Djava.library.path`, etc.)
2. **Loader args** (Forge/Fabric/Quilt manifest: `--add-modules`, `-Dloader.*`, etc.)
3. **RAM args** (`-Xmx`, `-Xms` desde sliders) ← **Fuente de verdad única**
4. **Global custom args** (`settings.java.additionalJvmArgs`)
5. **Legacy per-installation args** (`javaConfig[serverid].jvmOptions`) ← *deprecated*
6. **Deduplicación** (mantiene primera ocurrencia por key)

**Garantías:**
- Si user tiene args legacy antiguos, siguen funcionando (se mergean)
- Warning en log: "Legacy per-installation args: N (deprecated)"
- Futuros cambios solo afectan global (UI solo edita global)

---

## **4. Testing Checklist**

### **Test 1: Vanilla + Custom JVM Args**

**Objetivo:** Verificar que args globales funcionan y -Xmx/-Xms se sanitiza.

**Pasos:**
1. Seleccionar instalación Vanilla
2. Settings → Java
   - Verificar contexto muestra "Loader: Vanilla"
3. Cambiar RAM sliders: Min=3G, Max=4G
4. Escribir en "Opciones Adicionales JVM":
   ```
   -Dtest.custom=true -Xmx6G -Dpath="C:\My Folder" -Xms2G
   ```
5. Guardar → debe aparecer overlay warning:
   ```
   Argumentos de Memoria Ignorados
   Se ignoraron 2 argumentos de memoria (-Xmx/-Xms).
   Por favor, usa los sliders de RAM para ajustar la memoria.
   ```
6. Reabrir Settings → Java → verificar input muestra solo:
   ```
   -Dtest.custom=true -Dpath="C:\My Folder"
   ```
7. Launch → verificar en log:
   ```
   JVM args sanitization: input=4, ignored=2 (memory flags), final=2
   === CUSTOM JVM ARGS ===
     Global args: 2
     Total custom args: 2
     Args: -Dtest.custom=true -Dpath="C:\My Folder"
   =======================
   ```
8. Verificar que Minecraft lanza con:
   - `-Xmx4G` (del slider, NO -Xmx6G del input)
   - `-Xms3G` (del slider, NO -Xms2G del input)
   - `-Dtest.custom=true` presente
   - `-Dpath="C:\My Folder"` presente (path con espacios funciona)

**Resultado Esperado:** ✅ Sanitización funciona, warning aparece, sliders son fuente de verdad única.

---

### **Test 2: OptiFine + Contexto Visual**

**Objetivo:** Verificar que contexto de instalación muestra info correcta.

**Pasos:**
1. Seleccionar instalación OptiFine (ej: "OptiFine 1.20.1")
2. Settings → Java
   - Verificar bloque contexto muestra:
     - **Nombre:** OptiFine 1.20.1
     - **Loader:** Optifine
     - **Minecraft:** 1.20.1
   - Verificar nota: "Las opciones adicionales de JVM se aplican globalmente..."
3. Añadir custom arg: `-Doptifine.test=true`
4. Guardar, launch
5. Verificar log muestra custom args (igual que Test 1)

**Resultado Esperado:** ✅ Contexto visual correcto, args globales funcionan con OptiFine.

---

### **Test 3: Forge + Mods Tab**

**Objetivo:** Verificar que Mods tab detecta Forge y muestra carpeta mods.

**Pasos:**
1. Seleccionar instalación Forge (ej: "Forge 1.20.1")
2. Settings → Mods
   - Verificar NO aparece mensaje "Mods no disponibles"
   - Verificar muestra ruta: `C:\...\instances\forge-1.20.1\mods`
   - Si carpeta no existe: tooltip "Se creará automáticamente al instalar mods"
3. Verificar controles de mods están habilitados

**Resultado Esperado:** ✅ Mods tab funciona para Forge, muestra ruta correcta.

---

### **Test 4: Fabric/Quilt (Sin Regresiones)**

**Objetivo:** Verificar que cambios no rompieron Fabric/Quilt.

**Pasos:**
1. Seleccionar instalación Fabric o Quilt
2. Settings → Java
   - Verificar contexto muestra "Loader: Fabric" o "Loader: Quilt"
3. Añadir custom arg: `-Dfabric.test=true`
4. Launch → verificar sin errores
5. Verificar log muestra custom args correctamente

**Resultado Esperado:** ✅ Fabric/Quilt lanzan sin errores, custom args funcionan.

---

### **Test 5: Language Switch + Restart**

**Objetivo:** Verificar que cambio de idioma pide restart.

**Pasos:**
1. Settings → Launcher
2. Cambiar idioma: Español → English (o viceversa)
3. Debe aparecer dialog:
   ```
   Restart Required
   The launcher will now restart to apply the language change.
   ```
4. Aceptar → launcher reinicia
5. Verificar UI en nuevo idioma

**Resultado Esperado:** ✅ Cambio de idioma funciona, restart prompt correcto.

---

### **Test 6: Legacy Versions Toggle + Filtro**

**Objetivo:** Verificar que toggle "Mostrar versiones antiguas" filtra versiones <1.13.

**Pasos:**
1. Settings → Launcher
2. Desactivar "Mostrar versiones antiguas (<1.13)"
3. Guardar, cerrar Settings
4. Ir a installation-editor (crear/editar instalación)
5. Abrir selector de versiones MC
   - Verificar que versiones <1.13 NO aparecen (ej: 1.12.2, 1.8.9)
6. Volver a Settings → Launcher
7. Activar "Mostrar versiones antiguas (<1.13)"
8. Guardar, volver a installation-editor
9. Abrir selector de versiones MC
   - Verificar que versiones <1.13 SÍ aparecen con badge "Experimental"
   - Tooltip: "Loaders modernos pueden no soportar esta versión"

**Resultado Esperado:** ✅ Filtro funciona, versiones antiguas se muestran/ocultan según toggle.

---

## **5. Archivos Modificados**

### **Archivos Core**

| Archivo | Cambios | Líneas Aprox |
|---------|---------|--------------|
| `app/settings.ejs` | - Eliminado selector idioma duplicado (L337-355)<br>- Cambiado JVMOptions a GlobalJVMOptions (L283)<br>- Añadido bloque contexto instalación (L203-219) | 337-355, 283, 203-219 |
| `app/assets/css/launcher.css` | Añadido CSS para `#settingsJavaInstallationContext` | 2295-2340 (nuevo) |
| `app/assets/js/configmanager.js` | - Añadido `settings.java.additionalJvmArgs` a DEFAULT_CONFIG<br>- Añadidos métodos `getGlobalJVMOptions()`, `setGlobalJVMOptions()` | 79-82, 764-785 |
| `app/assets/js/scripts/settings.js` | - Añadida función `parseJvmArgs()` (parseo comillas)<br>- Modificado `saveSettingsValues()` (sanitización -Xmx/-Xms)<br>- Añadida función `populateJavaInstallationContext()`<br>- Modificado `prepareJavaTab()` | 25-70, 313-348, 95-145, 2435-2438 |
| `app/assets/js/processbuilder.js` | - Añadidos métodos `_deduplicateJvmArgs()`, `_sanitizeArgsForLogging()`, `_mergeCustomJvmArgs()`<br>- Modificado `_constructJVMArguments112()` (L1024)<br>- Modificado `_constructJVMArguments113()` (L1263) | 503-598, 1024, 1263 |

### **Archivos Pendientes (Tareas 7-8)**

| Archivo | Cambio Pendiente | Tarea |
|---------|------------------|-------|
| `app/assets/js/scripts/settings.js` | Implementar detección loader en `prepareModsTab()` | Tarea 7 |
| `app/assets/js/scripts/installation-editor.js` | Conectar filtro `showLegacyVersions` a selector versiones | Tarea 8 |

---

## **6. Decisiones de Diseño Clave**

### **¿Por qué JVM args globales y no per-installation?**

**Razones:**
1. **Consistencia con HeliosLauncher:** La mayoría de launchers tratan Java management (RAM + args) como configuración global del launcher.
2. **Simplicidad UX:** Usuario espera que "Opciones JVM" apliquen a todo, no a una instalación específica.
3. **Menos confusión:** Si fueran per-installation, cambiar instalación requeriría re-escribir args cada vez.
4. **Casos de uso reales:** Args típicos (`-Dfile.encoding=UTF-8`, `-XX:+UseG1GC`) aplican a todas las instalaciones.

**Excepciones:** Si en el futuro se necesita per-installation (ej: args específicos de Forge vs Fabric), se puede:
- Añadir sección "Avanzado" en installation-editor
- Mantener global como default, override opcional por instalación

---

### **¿Por qué sanitizar -Xmx/-Xms en lugar de permitirlos?**

**Razones:**
1. **Conflictos:** Si user escribe `-Xmx6G` en JVM args pero slider dice 4G, ¿cuál gana? Ambiguo y confuso.
2. **Source of Truth único:** Sliders son más intuitivos y visuales que texto plano.
3. **Prevención de errores:** User puede escribir `-Xmx99999G` y crashear launcher.
4. **Consistencia:** Todos los launchers modernos (MultiMC, Prism) usan sliders únicamente para RAM.

**Alternativa descartada:** "Warn + Allow" (mostrar warning pero aplicar arg) causa comportamiento inesperado si user olvida cambiar slider.

---

### **¿Por qué mostrar contexto de instalación si args son globales?**

**Razones:**
1. **Transparencia:** User necesita saber qué instalación está mirando en Settings.
2. **Evitar confusión:** Sin contexto, user podría pensar que cambiar RAM slider afecta solo a "la instalación actual" (falso).
3. **Futuro-proof:** Si se añaden settings per-installation después, el contexto ya está presente.

**Nota importante:** El bloque dice explícitamente "Las opciones adicionales de JVM se aplican globalmente a todas las instalaciones."

---

## **7. Breaking Changes y Migraciones**

### **Breaking Changes**

| Cambio | Impacto | Mitigation |
|--------|---------|------------|
| JVMOptions per-installation → global | Users con args per-installation perderán distinción | - Legacy args se mantienen internamente<br>- Se mergean con global en runtime<br>- Warning en log: "deprecated" |
| -Xmx/-Xms sanitizados | Args de memoria en JVMOptions serán ignorados | - Overlay warning al guardar<br>- User debe usar sliders |

### **Migración Automática (Futura)**

Si se detecta que `settings.java.additionalJvmArgs` está vacío pero existe `javaConfig[serverid].jvmOptions` con contenido:

```javascript
function migrateJvmArgsToGlobal() {
    if (!config.settings.java) {
        config.settings.java = {}
    }
    
    if (!config.settings.java.additionalJvmArgs || config.settings.java.additionalJvmArgs.length === 0) {
        // Buscar primer serverid con jvmOptions custom
        for (const serverId in config.javaConfig) {
            const jvmOpts = config.javaConfig[serverId].jvmOptions
            if (jvmOpts && jvmOpts.length > 0) {
                logger.info('Migrating legacy per-installation JVM args to global')
                config.settings.java.additionalJvmArgs = jvmOpts
                break
            }
        }
    }
}
```

**Nota:** Esta migración NO está implementada actualmente. Si se necesita, añadir en `ConfigManager.load()`.

---

## **8. Limitaciones Conocidas**

### **Parseo de Comillas**

**Implementación actual:**
- Soporta comillas dobles `"` y simples `'`
- Soporta espacios dentro de comillas: `-Dpath="C:\My Folder"`
- **NO soporta:** Escape de comillas (`\"`), comillas anidadas

**Casos edge:**
```javascript
// ✅ Funciona
'-Dpath="C:\My Folder"'
'-Dname='My Game''

// ❌ No funciona (comilla escaped)
'-Dmsg="He said \"hello\""'

// ❌ No funciona (comilla anidada diferente)
'-Dval="outer 'inner' outer"'
```

**Solución futura:** Usar librería de parseo de shell args (ej: `shell-quote`).

---

### **Deduplicación de Args**

**Implementación actual:**
- Key = primera parte antes de `=` o todo el arg si no hay `=`
- Mantiene primera ocurrencia

**Limitaciones:**
```javascript
// ✅ Detecta duplicados correctos
'-Dfoo=1' + '-Dfoo=2' → '-Dfoo=1'

// ❌ NO detecta variantes sin valor
'-Dfoo' + '-Dfoo=bar' → ambos pasan (keys diferentes: '-Dfoo' vs '-Dfoo')

// ❌ NO detecta alias
'-Xmx4G' + '--max-heap-size=4G' → ambos pasan (son el mismo flag en realidad)
```

**Solución futura:** Mapa de aliases + normalización de flags sin valor.

---

## **9. Preguntas Frecuentes (FAQ)**

### **Q: ¿Los JVM args aplican a todas las instalaciones?**

**A:** Sí. Los "Opciones Adicionales de JVM" son **globales** y aplican a Vanilla, Forge, Fabric, Quilt, OptiFine, etc. Esto es consistente con HeliosLauncher y la mayoría de launchers modernos.

---

### **Q: ¿Por qué mi -Xmx6G fue ignorado?**

**A:** Los argumentos de memoria (`-Xmx`, `-Xms`) se sanitizan automáticamente porque los **sliders de RAM** son la única fuente de verdad. Si necesitas cambiar memoria, usa los sliders en Settings → Java.

---

### **Q: ¿Puedo tener args diferentes para Forge y Fabric?**

**A:** Actualmente **no**. Los args son globales. Si necesitas args específicos por loader, puedes:
1. Usar flags condicionales dentro del arg (ej: `-Dloader.type=forge`)
2. Esperar feature futuro de override per-installation

---

### **Q: ¿Qué pasa con mis args antiguos per-installation?**

**A:** Se mantienen por compatibilidad. En runtime, se mergean con los globales:
- Orden: global args primero, luego legacy per-installation
- Deduplicación: si hay conflicto, global gana (primera ocurrencia)
- Warning en log: "Legacy per-installation args: N (deprecated)"

---

### **Q: ¿Por qué aparece "Duplicate JVM arg detected" en el log?**

**A:** Significa que un argumento con la misma key apareció múltiples veces. Se mantiene la primera ocurrencia. Ejemplo:
```
Global: -Dfoo=1
Legacy: -Dfoo=2
→ Log: "Duplicate JVM arg detected: -Dfoo (keeping first occurrence)"
→ Resultado: -Dfoo=1
```

---

### **Q: ¿Cómo testeo que mis custom args funcionan?**

**A:** Busca en el log de lanzamiento:
```
=== CUSTOM JVM ARGS ===
  Global args: 2
  Total custom args: 2
  Args: -Dtest.custom=true -Dfoo=bar
=======================
```

Si aparece, tus args fueron aplicados. Puedes verificar con:
```java
// En Minecraft/mod
System.getProperty("test.custom") // → "true"
System.getProperty("foo") // → "bar"
```

---

## **10. Roadmap Futuro**

### **Mejoras Potenciales**

| Feature | Prioridad | Descripción |
|---------|-----------|-------------|
| Args per-installation (override) | Media | Permitir args específicos por instalación en installation-editor |
| Validación de syntax JVM | Alta | Detectar args inválidos antes de launch (ej: `-Xinvalid`) |
| Presets de args | Baja | Templates para casos comunes (Performance, Debug, etc.) |
| Export/Import de settings | Media | Compartir config entre users |
| Args profiles | Baja | Múltiples sets de args, cambiar rápido |

---

## **11. Conclusión**

El refactor de Settings ha logrado:
- ✅ **JVM args globales** (simplifica UX, consistente con industry standard)
- ✅ **Sanitización automática** de memoria (previene conflictos con sliders)
- ✅ **Parseo robusto** con soporte de comillas (paths con espacios funcionan)
- ✅ **Contexto visual** en Java tab (user sabe qué instalación está mirando)
- ✅ **Deduplicación** de args (previene duplicados accidentales)
- ✅ **Logging detallado** (facilita debugging)
- ✅ **Compatibilidad legacy** (args antiguos siguen funcionando)

**Estado:** Implementación completada (tareas 1-6), pendiente tareas 7-8 (Mods tab loader detection + legacy versions filter).

**Testing:** Seguir checklist en sección 4 antes de merge final.

---

**Documento generado:** 29 de diciembre de 2025  
**Última actualización:** Post-implementación tareas 1-6  
**Próxima revisión:** Post-testing completo
