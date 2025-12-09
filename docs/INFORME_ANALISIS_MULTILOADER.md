# 📊 INFORME TÉCNICO: Análisis Exhaustivo del Sistema Multi-Loader

## Fecha: 8 de diciembre de 2025
## Proyecto: TECNILAND Nexus (Fork de HeliosLauncher)

---

# 1. ANÁLISIS DEL ESTADO ACTUAL DE CADA ARCHIVO CLAVE

## 1.1 `loaderinstaller.js` - Instalador de Loaders

**Ubicación**: `app/assets/js/loaderinstaller.js`  
**Líneas**: 674  
**Estado**: ⚠️ Parcialmente funcional

### Funcionalidad Actual:
```
✅ Descarga del installer de Forge desde Maven
✅ Extracción de version.json del installer
✅ Extracción de install_profile.json del installer
✅ Descarga de 29 librerías del version.json
✅ Creación del ForgeProcessorRunner
❌ No descarga las librerías del install_profile.libraries
```

### Flujo Implementado:
```javascript
async installForge() {
    // 1. ✅ Descarga installer JAR
    const installerPath = await this.downloadForgeInstaller()
    
    // 2. ✅ Extrae version.json e install_profile.json
    const extractResult = await this.extractForgeInstaller(installerPath)
    
    // 3. ✅ Descarga librerías del version.json
    await this.downloadForgeLibraries(extractResult.versionData)
    
    // 4. ⚠️ Procesa install_profile (aquí falla)
    await this.processForgeInstallProfile(...)
}
```

### Gap Identificado:
El método `downloadForgeLibraries()` solo descarga las librerías declaradas en `version.json`, NO las librerías declaradas en `install_profile.json.libraries[]`. Estas últimas son las que los processors necesitan.

---

## 1.2 `forgeprocessor.js` - Ejecutor de Processors

**Ubicación**: `app/assets/js/forgeprocessor.js`  
**Líneas**: 563  
**Estado**: ❌ Crítico - Falta descarga de dependencias

### Funcionalidad Actual:
```
✅ Construcción de variables ({MINECRAFT_JAR}, {ROOT}, etc.)
✅ Conversión Maven ID → Path local (mavenToPath())
✅ Reemplazo de variables en argumentos
✅ Extracción de Main-Class del MANIFEST.MF
✅ Descarga del processor JAR principal desde Maven
✅ Verificación si outputs ya existen (needToRun())
✅ Ejecución de Java via spawn()
❌ NO descarga dependencias del campo classpath[]
```

### Código Problemático (líneas ~350-370):
```javascript
// Add classpath libraries
if (processor.classpath) {
    for (const lib of processor.classpath) {
        const libPath = this.mavenToPath(lib)
        if (fs.existsSync(libPath)) {
            classpathEntries.push(libPath)
        } else {
            logger.warn(`Classpath library not found: ${libPath}`)
            // ❌ SOLO MUESTRA WARNING, NO DESCARGA
        }
    }
}
```

### Solución Requerida:
```javascript
// Cambiar de:
logger.warn(`Classpath library not found: ${libPath}`)

// A:
logger.info(`Downloading classpath dependency: ${lib}`)
await this.downloadFromMaven(lib, libPath)
classpathEntries.push(libPath)
```

---

## 1.3 `processbuilder.js` - Constructor del Proceso de Minecraft

**Ubicación**: `app/assets/js/processbuilder.js`  
**Líneas**: 991  
**Estado**: ✅ Funcional

### Funcionalidad Actual:
```
✅ Construcción de argumentos JVM
✅ Construcción del classpath (-cp)
✅ Resolución de librerías de Mojang
✅ Resolución de librerías del servidor/loader
✅ Extracción de natives
✅ Reemplazo de variables de juego (username, uuid, etc.)
✅ Soporte para Forge 1.13+ (argumentos especiales)
✅ Soporte para Fabric Loader
```

### Método Crítico: `classpathArg()`
```javascript
classpathArg(mods, tempNativePath){
    let cpArgs = []
    
    // Agregar version.jar si es necesario
    if(!mcVersionAtLeast('1.17', ...) || this.usingFabricLoader || isVanilla) {
        cpArgs.push(path.join(..., version + '.jar'))
    }
    
    // Resolver librerías Mojang
    const mojangLibs = this._resolveMojangLibraries(tempNativePath)
    
    // Resolver librerías del servidor
    const servLibs = this._resolveServerLibraries(mods)
    
    // Resolver librerías del mod loader
    const loaderLibs = this._resolveModLoaderLibraries()  // ✅ Nuevo método
    
    // Merge
    const finalLibs = {...mojangLibs, ...servLibs, ...loaderLibs}
    cpArgs = cpArgs.concat(Object.values(finalLibs))
    
    return cpArgs
}
```

---

## 1.4 `configmanager.js` - Gestión de Configuración

**Ubicación**: `app/assets/js/configmanager.js`  
**Líneas**: 1005  
**Estado**: ✅ Funcional

### Estructura de Configuración:
```javascript
DEFAULT_CONFIG = {
    settings: {
        game: { resWidth, resHeight, fullscreen, ... },
        launcher: { allowPrerelease, dataDirectory, language }
    },
    clientToken: null,
    selectedServer: null,
    selectedAccount: null,
    authenticationDatabase: {},
    modConfigurations: [],
    javaConfig: {},
    installations: [],        // ✅ Nuevo: instalaciones custom
    selectedInstallation: null // ✅ Nuevo: instalación seleccionada
}
```

### Directorios Clave:
```javascript
dataPath = '.tecnilandnexus'           // Antes era .helioslauncher
commonDir = dataPath + '/common'        // Librerías, assets, versions
instanceDir = dataPath + '/instances'   // Carpetas de juego por instalación
```

---

## 1.5 `distromanager.js` - Gestión de Distribución

**Ubicación**: `app/assets/js/distromanager.js`  
**Líneas**: ~25  
**Estado**: ✅ Funcional (delegado a helios-core)

### Configuración:
```javascript
REMOTE_DISTRO_URL = 'https://helios-files.geekcorner.eu.org/distribution.json'

const api = new DistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected by preloader
    null, // Injected by preloader
    REMOTE_DISTRO_URL,
    false
)
```

---

## 1.6 `installationmanager.js` - Gestor de Instalaciones

**Ubicación**: `app/assets/js/installationmanager.js`  
**Líneas**: 389  
**Estado**: ✅ Funcional

### Tipos de Loader Soportados:
```javascript
const LoaderType = {
    VANILLA: 'vanilla',
    FORGE: 'forge',
    FABRIC: 'fabric',
    QUILT: 'quilt',
    NEOFORGE: 'neoforge'
}
```

### Funcionalidades:
```
✅ createInstallation() - Crea instalación con loader
✅ installationToServer() - Convierte a formato servidor
✅ validateInstallation() - Valida campos obligatorios
✅ duplicateInstallation() - Duplica instalación
✅ getDefaultJavaOptions() - Configura Java según versión MC
```

---

# 2. PROBLEMAS IDENTIFICADOS EN LOGS

## 2.1 Error Principal: Classpath Libraries Not Found

```log
[warn] Classpath library not found: jopt-simple-6.0-alpha-3.jar
[warn] Classpath library not found: fastcsv-2.2.2.jar
[warn] Classpath library not found: srgutils-0.5.6.jar
[warn] Classpath library not found: asm-commons-9.6.jar
[warn] Classpath library not found: asm-tree-9.6.jar
```

### Causa Raíz:
Las librerías están especificadas en el campo `classpath[]` del processor en `install_profile.json`, pero el launcher **NO las descarga** - solo verifica si existen y muestra warnings.

### Estructura del Processor en install_profile.json:
```json
{
  "jar": "net.minecraftforge:installertools:1.4.1",
  "classpath": [
    "net.sf.jopt-simple:jopt-simple:6.0-alpha-3",
    "de.siegmar:fastcsv:2.2.2",
    "net.minecraftforge:srgutils:0.5.6",
    "org.ow2.asm:asm-commons:9.6",
    "org.ow2.asm:asm-tree:9.6"
  ],
  "args": ["--task", "MCP_DATA", ...],
  "outputs": {...}
}
```

## 2.2 Error Consecuente: NoClassDefFoundError

```log
[error] java.lang.NoClassDefFoundError: joptsimple/OptionException
Caused by: java.lang.ClassNotFoundException: joptsimple.OptionException
```

### Causa:
Java se ejecuta con classpath incompleto (solo tiene `installertools.jar`), por lo que no puede cargar la clase `joptsimple.OptionException` que está en `jopt-simple-6.0-alpha-3.jar`.

## 2.3 Error Final: Archivos No Generados

```log
java.io.IOException: Invalid paths argument, contained no existing paths: [
  client-1.18.2-20220404.173914-srg.jar,
  client-1.18.2-20220404.173914-extra.jar,
  forge-1.18.2-40.3.0-client.jar
]
```

### Causa:
Como los processors no pudieron ejecutarse, los archivos de salida nunca fueron generados, y Minecraft no puede iniciar sin ellos.

---

# 3. FLUJO ACTUAL VS FLUJO ESPERADO

## 3.1 Flujo Actual (Con Fallos)

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. ✅ Descarga Minecraft vanilla                                    │
│    └── client.jar, assets, libraries de Mojang                      │
├─────────────────────────────────────────────────────────────────────┤
│ 2. ✅ Descarga Forge installer                                      │
│    └── forge-1.18.2-40.3.0-installer.jar                            │
├─────────────────────────────────────────────────────────────────────┤
│ 3. ✅ Extrae installer                                              │
│    ├── version.json → .../versions/1.18.2-forge-40.3.0/            │
│    └── install_profile.json → memoria                               │
├─────────────────────────────────────────────────────────────────────┤
│ 4. ✅ Descarga 29 librerías del version.json                        │
│    └── cpw.mods:securejarhandler, org.ow2.asm:asm:9.7.1, etc.       │
├─────────────────────────────────────────────────────────────────────┤
│ 5. ❌ NO descarga librerías del install_profile.libraries[]         │
│    └── jopt-simple:6.0-alpha-3, srgutils:0.5.6, etc.                │
│        ESTAS SON DIFERENTES A LAS DEL version.json                  │
├─────────────────────────────────────────────────────────────────────┤
│ 6. ✅ Descarga processor JAR (installertools-1.4.1.jar)             │
├─────────────────────────────────────────────────────────────────────┤
│ 7. ⚠️ Detecta classpath faltante, solo muestra WARNINGS             │
├─────────────────────────────────────────────────────────────────────┤
│ 8. ❌ Ejecuta Java con classpath incompleto                         │
│    └── java -cp installertools.jar ... (FALTA jopt-simple, etc.)    │
├─────────────────────────────────────────────────────────────────────┤
│ 9. ❌ Java falla: NoClassDefFoundError                              │
├─────────────────────────────────────────────────────────────────────┤
│ 10. ❌ Archivos no generados, Minecraft no puede iniciar            │
└─────────────────────────────────────────────────────────────────────┘
```

## 3.2 Flujo Esperado (Objetivo)

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. ✅ Descarga Minecraft vanilla                                    │
├─────────────────────────────────────────────────────────────────────┤
│ 2. ✅ Descarga Forge installer                                      │
├─────────────────────────────────────────────────────────────────────┤
│ 3. ✅ Extrae installer                                              │
├─────────────────────────────────────────────────────────────────────┤
│ 4. ✅ Descarga librerías del version.json (29)                      │
├─────────────────────────────────────────────────────────────────────┤
│ 5. 🔧 NUEVO: Descarga librerías del install_profile.libraries[]     │
│    └── Estas se usan tanto para processors como para runtime        │
├─────────────────────────────────────────────────────────────────────┤
│ 6. ✅ Para cada processor:                                          │
│    ├── Descarga processor JAR si no existe                          │
│    ├── 🔧 NUEVO: Descarga TODAS las dependencias del classpath[]    │
│    ├── Construye classpath completo                                 │
│    ├── Ejecuta Java con classpath completo                          │
│    └── Valida outputs con SHA1                                      │
├─────────────────────────────────────────────────────────────────────┤
│ 7. ✅ Todos los archivos generados:                                 │
│    ├── client-extra.jar                                             │
│    ├── client-srg.jar                                               │
│    ├── forge-client.jar                                             │
│    └── mappings.txt                                                 │
├─────────────────────────────────────────────────────────────────────┤
│ 8. ✅ Minecraft lanza con Forge funcional                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

# 4. DIFERENCIAS ENTRE LOADERS

## 4.1 Vanilla
```
Complejidad: ⭐ (Más simple)
Archivos: Solo los de Mojang
Processors: Ninguno
Classpath: Solo librerías de Minecraft
```

## 4.2 Forge
```
Complejidad: ⭐⭐⭐⭐⭐ (Más complejo)
Archivos: 
  - installer.jar → version.json, install_profile.json
  - Librerías de version.json (~30)
  - Librerías de install_profile.libraries (~40)
Processors: 6-10 según versión
  - installertools (MCP_DATA, DOWNLOAD_MOJMAPS)
  - jarsplitter (divide minecraft.jar)
  - binarypatcher (aplica patches)
  - SpecialSource (reobfusca SRG)
Classpath: 
  - Librerías de Minecraft
  - Librerías de Forge
  - Archivos generados (client-srg.jar, etc.)
```

## 4.3 Fabric
```
Complejidad: ⭐⭐ (Simple)
Archivos:
  - fabric-loader-X.X.X.jar
  - fabric-intermediary.jar
Processors: Ninguno
Classpath:
  - Minecraft client.jar (sin modificar)
  - fabric-loader.jar
  - intermediary mappings
```

## 4.4 Quilt
```
Complejidad: ⭐⭐ (Similar a Fabric)
Archivos:
  - quilt-loader-X.X.X.jar
Processors: Ninguno
Classpath:
  - Similar a Fabric
```

## 4.5 NeoForge
```
Complejidad: ⭐⭐⭐⭐ (Similar a Forge)
Archivos:
  - Similar a Forge pero diferentes URLs
Processors: Similares a Forge
Classpath: Similar a Forge
```

---

# 5. RECOMENDACIONES TÉCNICAS

## 5.1 Prioridad Alta: Descargar dependencias del classpath

**Archivo**: `forgeprocessor.js`  
**Función**: `executeProcessor()`  
**Cambio requerido**:

```javascript
// ANTES de construir el classpath, descargar todas las dependencias
if (processor.classpath && processor.classpath.length > 0) {
    for (const classpathItem of processor.classpath) {
        const classpathJar = this.mavenToPath(classpathItem)
        
        if (!fs.existsSync(classpathJar)) {
            // 1. Intentar descargar desde Maven
            const downloaded = await this.downloadFromMaven(classpathItem, classpathJar)
            
            // 2. Si falla, intentar extraer del installer ZIP
            if (!downloaded) {
                await this.extractFromInstaller(classpathItem, classpathJar)
            }
        }
        
        classpathEntries.push(classpathJar)
    }
}
```

## 5.2 Prioridad Media: Descargar librerías del install_profile

**Archivo**: `loaderinstaller.js`  
**Función**: Nueva función `downloadInstallProfileLibraries()`

```javascript
async downloadInstallProfileLibraries(installProfile) {
    if (!installProfile.libraries) return
    
    for (const lib of installProfile.libraries) {
        const artifact = lib.downloads?.artifact
        if (!artifact) continue
        
        const libPath = path.join(this.commonDir, 'libraries', artifact.path)
        
        if (!await fs.pathExists(libPath)) {
            await this.downloadLibrary(artifact, libPath, lib.name)
        }
    }
}
```

## 5.3 Prioridad Baja: Implementar Fabric/Quilt/NeoForge

Los stubs ya existen en `loaderinstaller.js`:
```javascript
async installFabric() {
    throw new Error('Fabric installation not implemented yet')
}

async installQuilt() {
    throw new Error('Quilt installation not implemented yet')
}

async installNeoForge() {
    throw new Error('NeoForge installation not implemented yet')
}
```

---

# 6. ESTRUCTURA DE CARPETAS ESPERADA

```
.tecnilandnexus/
├── common/
│   ├── assets/
│   │   ├── indexes/
│   │   ├── objects/
│   │   └── skins/
│   │
│   ├── libraries/
│   │   ├── com/mojang/...
│   │   ├── cpw/mods/...
│   │   ├── de/oceanlabs/mcp/...          ← mcp_config.zip, mappings
│   │   ├── de/siegmar/fastcsv/...        ← ❌ FALTA
│   │   ├── net/java/dev/jna/...
│   │   ├── net/minecraft/client/...      ← client-srg.jar, client-extra.jar
│   │   ├── net/minecraftforge/...
│   │   │   ├── forge/1.18.2-40.3.0/      ← forge-client.jar
│   │   │   ├── installertools/1.4.1/     ← installertools.jar
│   │   │   └── srgutils/0.5.6/           ← ❌ FALTA
│   │   ├── net/sf/jopt-simple/...        ← ❌ FALTA
│   │   └── org/ow2/asm/...
│   │
│   ├── versions/
│   │   ├── 1.18.2/
│   │   │   ├── 1.18.2.jar
│   │   │   └── 1.18.2.json
│   │   └── 1.18.2-forge-40.3.0/
│   │       ├── 1.18.2-forge-40.3.0.jar   ← Vacío o symlink
│   │       └── 1.18.2-forge-40.3.0.json  ← version.json de Forge
│   │
│   ├── logs/
│   └── temp/
│
└── instances/
    └── install-prueba-forge-1-18-2-.../
        ├── mods/
        ├── config/
        ├── saves/
        └── logs/
```

---

# 7. REFERENCIAS

## Documentación Interna:
- `docs/FORGE_PROCESSORS_RESEARCH.md` - Investigación completa de processors
- `docs/ESTANCAMIENTO_FORGE_PROCESSORS.md` - Estado actual del bloqueo
- `MULTILOADER_DESIGN.md` - Diseño del sistema multi-loader

## Código de Referencia:
- **ATLauncher** (Java): `Processor.java`, `Forge113Loader.java`
- **PrismLauncher** (C++): `ForgeInstallTask.cpp`
- **MultiMC** (C++): Similar a PrismLauncher

## URLs Maven:
```
https://maven.minecraftforge.net/    # Librerías de Forge
https://repo1.maven.org/maven2/      # Maven Central
https://libraries.minecraft.net/     # Librerías de Mojang
```

---

**Estado del análisis**: Completo  
**Siguiente paso**: Implementar descarga de dependencias del classpath en `forgeprocessor.js`  
**Fecha**: 8 de diciembre de 2025
