# Plan de Refactor: Settings Wiring + JVM Args Globales

**Fecha:** 29 de diciembre de 2025  
**Objetivo:** Conectar todas las opciones de Settings para que afecten realmente al launch, sin romper loaders ni flujos existentes.

---

## **Restricciones**

- ❌ NO tocar NeoForge (está en mantenimiento)
- ❌ NO romper Forge estable ni Fabric/Quilt
- ✅ Cambios quirúrgicos y rastreables
- ✅ Todas las opciones deben: guardarse → reflejarse en UI → afectar launch → loguearse

---

## **Decisiones de Diseño Críticas**

### 1. **JVMOptions es GLOBAL (no por instalación)**

**Antes:**
```javascript
config.javaConfig[serverid].jvmOptions = ['-XX:+UseG1GC', ...]
```

**Después:**
```javascript
config.settings.java.additionalJvmArgs = ['-Dtest=true', ...]  // GLOBAL
```

**Razón:**  
- Consistente con HeliosLauncher (Java management es global: RAM + JVM args)
- La pestaña Java muestra la instalación seleccionada solo como **contexto visual**
- Los args adicionales aplican a **todas las instalaciones**

**Compatibilidad:**  
- Mantener `config.javaConfig[serverid].jvmOptions` internamente (legacy)
- En runtime: merge `globalArgs + legacyPerInstallationArgs` con deduplicación

---

### 2. **Sanitización -Xmx/-Xms: Remover + Warning**

**Problema:**  
Si el usuario escribe `-Xmx4G` en "Opciones Adicionales JVM", puede sobrescribir los sliders de RAM.

**Solución:**  
- Al guardar en `settings.js`: filtrar automáticamente cualquier arg que empiece con `-Xmx` o `-Xms`
- Mostrar warning visible: *"Se ignoraron N argumentos de memoria (-Xmx/-Xms). Usa los sliders de RAM."*
- Logging detallado:
  ```
  JVM args sanitization: input=5, ignored=2 (memory flags), final=3
  ```

**Garantía:**  
Los sliders de RAM son la **única fuente de verdad** para memoria.

---

### 3. **"Mostrar versiones antiguas (<1.13)" debe funcionar**

**Antes:**  
Toggle existe pero no hace nada (decorativo).

**Después:**  
- Conectar al filtro de versiones en `installation-editor.js` o similar
- Si `showLegacyVersions = false`: ocultar versiones <1.13
- Si `showLegacyVersions = true`: mostrar **todas las versiones** con badge "Experimental"
- **No ocultar por limitaciones técnicas**, solo advertir con tooltip

**Razón:**  
Si un toggle existe, debe tener efecto real. Usuario puede experimentar bajo su riesgo.

---

## **Arquitectura de Merge de JVM Args**

### **Orden de Construcción (ProcessBuilder)**

```javascript
// 1. Base args (vanilla manifest JVM args)
let args = this.vanillaManifest.arguments.jvm

// 2. Loader args (Forge/Fabric/Quilt manifest JVM args)
if (modManifest !== vanillaManifest) {
    args = args.concat(modManifest.arguments.jvm)
}

// 3. RAM sliders (source of truth para memoria)
args.push('-Xmx' + ConfigManager.getMaxRAM(serverId))
args.push('-Xms' + ConfigManager.getMinRAM(serverId))

// 4. Global additional args (sanitizados, sin -Xmx/-Xms)
args = args.concat(ConfigManager.getGlobalJVMOptions())

// 5. Legacy per-installation args (compatibilidad)
const legacyArgs = ConfigManager.getJVMOptions(serverId)  // retorna legacy si existe
if (legacyArgs.length > 0) {
    logger.warn('Using legacy per-installation JVM args (deprecated)')
    args = args.concat(legacyArgs)
}

// 6. Deduplicación por key (ej: -Dfoo=bar → key="foo")
args = deduplicateJvmArgs(args)

// 7. Logging pre-launch
logger.info(`=== CUSTOM JVM ARGS (${customCount}) ===`)
logger.info(sanitizeLogForSecrets(args))
```

### **Deduplicación**

Si un arg aparece múltiples veces (ej: `-Dfoo=1` y luego `-Dfoo=2`), mantener **la primera ocurrencia**:

```javascript
function deduplicateJvmArgs(args) {
    const seen = new Set()
    return args.filter(arg => {
        const key = arg.split('=')[0]  // -Dfoo=bar → -Dfoo
        if (seen.has(key)) {
            logger.warn(`Duplicate JVM arg detected: ${key} (keeping first)`)
            return false
        }
        seen.add(key)
        return true
    })
}
```

---

## **Cambios en ConfigManager**

### **Nuevos Métodos**

```javascript
// GLOBAL JVM args (nuevo)
exports.getGlobalJVMOptions = function() {
    return config.settings.java.additionalJvmArgs || []
}

exports.setGlobalJVMOptions = function(argsArray) {
    config.settings.java.additionalJvmArgs = argsArray
}

// Legacy per-installation (mantener para compatibilidad)
exports.getJVMOptions = function(serverid) {
    // Ahora retorna SOLO legacy args, no merge
    // El merge se hace en ProcessBuilder
    if (!config.javaConfig[serverid]) return []
    return config.javaConfig[serverid].jvmOptions || []
}
```

### **DEFAULT_CONFIG actualizado**

```javascript
const DEFAULT_CONFIG = {
    settings: {
        game: { ... },
        launcher: { ... },
        java: {
            additionalJvmArgs: []  // 🆕 NUEVO: JVM args globales
        }
    },
    javaConfig: {
        // Legacy per-installation (mantener para compatibilidad)
        'server-id': {
            minRAM: '3G',
            maxRAM: '4G',
            executable: null,
            jvmOptions: []  // Deprecated pero mantenido
        }
    }
}
```

---

## **Cambios en settings.ejs**

### **1. Launcher Tab: Eliminar duplicado**

**Líneas 337-355 (ELIMINAR):**
```html
<!-- ❌ DUPLICADO INCORRECTO -->
<div class="settingsFieldContainer">
    <span class="settingsFieldTitle"><%- lang('settings.languageTitle') %></span>
    <span class="settingsFieldDesc"><%- lang('settings.showLegacyVersionsDesc') %></span>
    <label class="toggleSwitch">
        <input type="checkbox" cValue="ShowLegacyVersions">
        <span class="toggleSwitchSlider"></span>
    </label>
</div>
```

**Mantener solo líneas 357-369 (correcto):**
```html
<!-- ✅ SELECTOR DE IDIOMA CORRECTO -->
<div class="settingsFieldContainer">
    <span class="settingsFieldTitle"><%- lang('settings.languageTitle') %></span>
    <span class="settingsFieldDesc"><%- lang('settings.languageDesc') %></span>
    <div class="settingsSelectContainer">
        <div class="settingsSelectSelected" id="settingsLanguageSelected">Español</div>
        <div class="settingsSelectOptions" id="settingsLanguageOptions">
            <div value="es_ES" selected>Español</div>
            <div value="en_US">English</div>
        </div>
    </div>
</div>
```

### **2. Java Tab: JVMOptions global + contexto instalación**

**Antes (línea ~271):**
```html
<input id="settingsJVMOptsVal" cValue="JVMOptions" serverDependent type="text">
```

**Después:**
```html
<!-- Contexto: instalación seleccionada -->
<div id="settingsJavaInstallationContext">
    <span id="settingsJavaInstallName">Instalación: <strong>-</strong></span>
    <span id="settingsJavaInstallLoader">Loader: <strong>-</strong></span>
    <span id="settingsJavaInstallVersion">Minecraft: <strong>-</strong></span>
</div>

<!-- JVM args GLOBALES (sin serverDependent) -->
<input id="settingsJVMOptsVal" cValue="GlobalJVMOptions" type="text">
```

---

## **Cambios en settings.js**

### **1. Guardar: Sanitización -Xmx/-Xms**

```javascript
function saveSettingsValues() {
    // ...
    if (cVal === 'GlobalJVMOptions') {
        const rawArgs = v.value.trim().split(/\s+/).filter(a => a)
        
        // Sanitizar memoria
        const memoryFlagRegex = /^-Xmx|-Xms/
        const sanitizedArgs = rawArgs.filter(arg => !memoryFlagRegex.test(arg))
        const ignoredCount = rawArgs.length - sanitizedArgs.length
        
        // Warning visible
        if (ignoredCount > 0) {
            showWarningToast(
                `Se ignoraron ${ignoredCount} argumentos de memoria (-Xmx/-Xms). ` +
                `Usa los sliders de RAM.`
            )
        }
        
        // Logging
        logger.info(`JVM args sanitization: input=${rawArgs.length}, ignored=${ignoredCount} (memory), final=${sanitizedArgs.length}`)
        
        ConfigManager.setGlobalJVMOptions(sanitizedArgs)
    }
}
```

### **2. Cargar: Leer globales**

```javascript
async function initSettingsValues() {
    // ...
    if (cVal === 'GlobalJVMOptions') {
        const globalArgs = ConfigManager.getGlobalJVMOptions()
        v.value = globalArgs.join(' ')
    }
}
```

### **3. Java Tab: Mostrar contexto instalación**

```javascript
function populateJavaInstallationContext() {
    const installId = ConfigManager.getSelectedInstallation()
    const nameEl = document.getElementById('settingsJavaInstallName').querySelector('strong')
    const loaderEl = document.getElementById('settingsJavaInstallLoader').querySelector('strong')
    const versionEl = document.getElementById('settingsJavaInstallVersion').querySelector('strong')
    
    if (!installId) {
        nameEl.textContent = 'Sin selección'
        loaderEl.textContent = 'Servidor por defecto'
        versionEl.textContent = '-'
        return
    }
    
    const install = ConfigManager.getInstallation(installId)
    nameEl.textContent = install.name || install.id
    loaderEl.textContent = install.loader || 'Vanilla'
    versionEl.textContent = install.version || '-'
}
```

### **4. Mods Tab: Detección loader**

```javascript
async function prepareModsTab() {
    const installId = ConfigManager.getSelectedInstallation()
    const modsUnavailableMsg = document.getElementById('settingsModsUnavailableMessage')
    const modsControls = document.getElementById('settingsModsControls')
    
    if (!installId) {
        // TECNILAND server (siempre tiene mods)
        modsUnavailableMsg.style.display = 'none'
        modsControls.style.display = ''
        return
    }
    
    const install = ConfigManager.getInstallation(installId)
    const loader = (install.loader || 'vanilla').toLowerCase()
    
    // Vanilla/OptiFine: sin mods
    if (loader === 'vanilla' || loader === 'optifine') {
        modsUnavailableMsg.textContent = 
            `Mods no disponibles para instalaciones ${loader === 'vanilla' ? 'Vanilla' : 'OptiFine'}.`
        modsUnavailableMsg.style.display = ''
        modsControls.style.display = 'none'
        return
    }
    
    // Forge/Fabric/Quilt: mostrar mods
    modsUnavailableMsg.style.display = 'none'
    modsControls.style.display = ''
    
    // Mostrar ruta carpeta mods
    const modsPath = path.join(ConfigManager.getInstanceDirectory(), install.id, 'mods')
    const modsPathEl = document.getElementById('settingsModsPath')
    modsPathEl.textContent = modsPath
    
    if (!fs.existsSync(modsPath)) {
        modsPathEl.title = 'Se creará automáticamente al instalar mods'
    }
}
```

---

## **Cambios en ProcessBuilder**

### **1. Logging pre-launch**

```javascript
_constructJVMArguments113(mods, tempNativePath) {
    // ... construcción base args ...
    
    // Custom JVM args (global)
    const customArgs = ConfigManager.getGlobalJVMOptions()
    
    if (customArgs.length > 0) {
        logger.info('=== CUSTOM JVM ARGS ===')
        logger.info(`  Count: ${customArgs.length}`)
        
        // Sanitizar tokens/passwords para logging
        const safeArgs = customArgs.map(arg => {
            if (arg.includes('token') || arg.includes('password') || arg.includes('secret')) {
                return arg.split('=')[0] + '=***REDACTED***'
            }
            return arg
        })
        
        logger.info(`  Args: ${safeArgs.join(' ')}`)
        logger.info('=======================')
        
        args = args.concat(customArgs)
    }
    
    // Legacy per-installation args (si existen)
    const legacyArgs = ConfigManager.getJVMOptions(this.server.rawServer.id)
    if (legacyArgs.length > 0) {
        logger.warn('⚠️ Using legacy per-installation JVM args (deprecated)')
        logger.warn(`  Args: ${legacyArgs.join(' ')}`)
        args = args.concat(legacyArgs)
    }
    
    // Deduplicación
    args = this._deduplicateJvmArgs(args)
    
    return args
}

/**
 * Deduplicar args por key (mantener primera ocurrencia)
 */
_deduplicateJvmArgs(args) {
    const seen = new Set()
    const result = []
    
    for (const arg of args) {
        const key = arg.startsWith('-D') ? arg.split('=')[0] : arg.split(/\s+/)[0]
        
        if (seen.has(key)) {
            logger.warn(`Duplicate JVM arg detected: ${key} (keeping first occurrence)`)
            continue
        }
        
        seen.add(key)
        result.push(arg)
    }
    
    return result
}
```

---

## **Testing Checklist**

### **1. Vanilla + Custom Args**
- [ ] Abrir Settings → Java
- [ ] Cambiar RAM sliders (ej: 4GB max)
- [ ] Escribir `-Dtest.custom=true -Xmx6G` en "Opciones Adicionales JVM"
- [ ] Guardar → debe mostrar warning: "Se ignoró -Xmx/-Xms"
- [ ] Launch → verificar log:
  ```
  JVM args sanitization: input=2, ignored=1 (memory), final=1
  === CUSTOM JVM ARGS ===
    Count: 1
    Args: -Dtest.custom=true
  ```
- [ ] Verificar args finales: `-Xmx4G` (del slider), NO `-Xmx6G`

### **2. OptiFine**
- [ ] Seleccionar instalación OptiFine
- [ ] Abrir Settings → Java
- [ ] Verificar contexto: "Loader: OptiFine"
- [ ] Verificar JVM args aplican globalmente
- [ ] Abrir Settings → Mods
- [ ] Debe mostrar: "Mods no disponibles para instalaciones OptiFine"

### **3. Forge**
- [ ] Seleccionar instalación Forge
- [ ] Abrir Settings → Mods
- [ ] Debe mostrar carpeta mods de la instancia
- [ ] Si carpeta no existe: mostrar tooltip "Se creará automáticamente"

### **4. Fabric/Quilt**
- [ ] Sin regresiones en launch
- [ ] Mods tab funciona correctamente

### **5. Language Switch**
- [ ] Cambiar idioma Español → English
- [ ] Debe mostrar dialog "Restart required"
- [ ] Reiniciar → verificar idioma aplicado

### **6. Legacy Versions Toggle**
- [ ] Activar "Mostrar versiones antiguas (<1.13)"
- [ ] Abrir installation-editor o crear nueva instalación
- [ ] Verificar que versiones <1.13 aparecen con badge "Experimental"
- [ ] Desactivar toggle → versiones <1.13 ocultas

---

## **Entregables**

1. ✅ **1 PR:** "Settings wiring + Global JVM args + UX fixes"
2. ✅ **Archivos tocados:** 
   - `app/settings.ejs` (UI fixes)
   - `app/assets/js/scripts/settings.js` (sanitization + context)
   - `app/assets/js/configmanager.js` (global JVM args)
   - `app/assets/js/processbuilder.js` (logging + dedup)
   - `docs/SETTINGS_WIRING_REPORT.md` (mapeo completo)
3. ✅ **Cero regresiones** en launch de todos los loaders

---

## **Notas de Compatibilidad**

### **Migración Automática**

Si un usuario ya tiene `config.javaConfig[serverid].jvmOptions` con args custom:

```javascript
// En ConfigManager.init() o equivalente
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

### **Preservar Legacy Args**

Si hay users power con diferentes args por instalación:

- Mantener `config.javaConfig[serverid].jvmOptions` como está
- En runtime: merge global + legacy
- Mostrar warning en log: "Using legacy per-installation JVM args (deprecated)"
- Documentar en SETTINGS_WIRING_REPORT.md que UI solo edita globales

---

**Fin del Plan**
