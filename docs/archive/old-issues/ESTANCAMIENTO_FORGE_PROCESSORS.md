# 🚧 ESTANCAMIENTO - Ejecución de Processors de Forge

## 📅 Fecha: 8 de diciembre de 2025

---

## 🎯 OBJETIVO PRINCIPAL

**Lograr que TECNILAND Nexus (fork de HeliosLauncher) ejecute automáticamente todos los processors de Forge para CUALQUIER versión de Minecraft/Forge**, eliminando por completo la necesidad de:

1. Copiar archivos manualmente desde instalaciones oficiales de Minecraft
2. Requerir que el usuario tenga el launcher oficial instalado
3. Intervención manual del usuario en ningún paso

El objetivo es que el launcher funcione como un **launcher nativo completo** (como ATLauncher, PrismLauncher, MultiMC) que puede procesar Forge desde cero.

---

## 🔄 FLUJO ESPERADO (IDEAL)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ 1. USUARIO CREA INSTALACIÓN                                                │
│    └─> Especifica: Minecraft 1.18.2 + Forge 40.3.0                         │
├────────────────────────────────────────────────────────────────────────────┤
│ 2. USUARIO HACE CLIC EN PLAY                                               │
├────────────────────────────────────────────────────────────────────────────┤
│ 3. DESCARGA DE ARCHIVOS BASE                                               │
│    ├─> Minecraft 1.18.2 vanilla (client.jar, assets, libraries)            │
│    ├─> Forge installer (forge-1.18.2-40.3.0-installer.jar)                 │
│    └─> 29 Librerías de Forge (del version.json)                            │
├────────────────────────────────────────────────────────────────────────────┤
│ 4. EXTRACCIÓN DE install_profile.json                                      │
│    └─> Contiene 10 processors (6 para client, 4 para server)               │
├────────────────────────────────────────────────────────────────────────────┤
│ 5. DESCARGA DE LIBRERÍAS DE PROCESSORS                    ❌ NO IMPLEMENTADO│
│    ├─> Cada processor tiene un campo `classpath[]`                         │
│    ├─> Estas librerías NO son las mismas del version.json                  │
│    └─> Deben descargarse desde Maven antes de ejecutar                     │
├────────────────────────────────────────────────────────────────────────────┤
│ 6. EJECUCIÓN SECUENCIAL DE PROCESSORS                                      │
│    ├─> Processor 1/6: installertools (MCP_DATA - extrae mappings)          │
│    ├─> Processor 2/6: jarsplitter (divide minecraft.jar en slim y extra)   │
│    ├─> Processor 3/6: binarypatcher (aplica patches de Forge)              │
│    ├─> Processor 4/6: SpecialSource (reobfusca con SRG mappings)           │
│    ├─> Processor 5/6: installertools (DOWNLOAD_MOJMAPS)                    │
│    └─> Processor 6/6: processor final                                      │
├────────────────────────────────────────────────────────────────────────────┤
│ 7. GENERACIÓN DE ARCHIVOS DE SALIDA                                        │
│    ├─> client-1.18.2-20220404.173914-extra.jar                             │
│    ├─> client-1.18.2-20220404.173914-srg.jar                               │
│    ├─> forge-1.18.2-40.3.0-client.jar                                      │
│    ├─> mcp_config-1.18.2-20220404.173914-mappings.txt                      │
│    └─> otros archivos procesados                                           │
├────────────────────────────────────────────────────────────────────────────┤
│ 8. VALIDACIÓN DE OUTPUTS CON SHA1                                          │
│    └─> Verificar que los archivos generados coincidan con checksums        │
├────────────────────────────────────────────────────────────────────────────┤
│ 9. MINECRAFT SE LANZA CON FORGE COMPLETAMENTE FUNCIONAL                    │
│    └─> SIN INTERVENCIÓN MANUAL DEL USUARIO                                 │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 ESTADO ACTUAL (BLOQUEADO EN PASO 5-6)

### ✅ Progreso Completado

| Componente | Estado | Detalles |
|------------|--------|----------|
| Descarga Minecraft vanilla | ✅ Funcionando | client.jar, assets, libraries |
| Descarga Forge installer | ✅ Funcionando | forge-1.18.2-40.3.0-installer.jar |
| Descarga 29 librerías Forge | ✅ Funcionando | Del version.json del installer |
| Extracción install_profile.json | ✅ Funcionando | 10 processors detectados |
| Filtrado para client | ✅ Funcionando | 6 processors aplicables |
| Sistema de variables | ✅ Funcionando | 19 variables construidas |
| Descarga processor JAR desde Maven | ✅ Funcionando | installertools-1.4.1.jar descargado |

### ❌ Punto de Bloqueo

| Paso | Estado | Error |
|------|--------|-------|
| Descarga dependencias classpath | ❌ NO IMPLEMENTADO | Solo muestra warnings |
| Ejecución Processor 1/6 | ❌ FALLA | NoClassDefFoundError |

---

## 🔥 ERROR ACTUAL

### Logs del Error
```log
[info] [ForgeProcessor]: Downloaded installertools-1.4.1.jar from Maven
[warn] [ForgeProcessor]: Classpath library not found: jopt-simple-6.0-alpha-3.jar
[warn] [ForgeProcessor]: Classpath library not found: fastcsv-2.2.2.jar
[warn] [ForgeProcessor]: Classpath library not found: srgutils-0.5.6.jar
[warn] [ForgeProcessor]: Classpath library not found: asm-commons-9.6.jar
[warn] [ForgeProcessor]: Classpath library not found: asm-tree-9.6.jar
[info] [ForgeProcessor]: Executing processor: installertools-1.4.1.jar
[error] Processor failed with exit code 1
[error] java.lang.NoClassDefFoundError: joptsimple/OptionException
[error] Caused by: java.lang.ClassNotFoundException: joptsimple.OptionException
```

### Estructura del Processor en install_profile.json
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
  "args": ["--task", "MCP_DATA", "--input", "{MAPPINGS}", "--output", "{MC_MAPPINGS}", "--key", "mappings"],
  "outputs": {...},
  "sides": ["client", "server"]
}
```

### Análisis del Problema
1. ✅ El launcher descarga `installertools-1.4.1.jar` desde Maven
2. ⚠️ El launcher detecta que faltan 5 librerías del `classpath`
3. ❌ El launcher solo muestra **warnings**, **NO descarga** las librerías
4. ❌ Java se ejecuta con classpath incompleto
5. ❌ Java falla porque no encuentra la clase `joptsimple.OptionException`

---

## 🏗️ ARQUITECTURA DE ARCHIVOS INVOLUCRADOS

```
app/assets/js/
├── loaderinstaller.js      # Orquesta la instalación de loaders
│   ├── installForge()      # Descarga installer, extrae, llama processors
│   ├── downloadForgeLibraries() # Descarga librerías del version.json
│   └── processForgeInstallProfile() # Crea ForgeProcessorRunner
│
├── forgeprocessor.js       # Ejecuta cada processor
│   ├── executeProcessor()  # ❌ AQUÍ FALTA descargar classpath
│   ├── mavenToPath()       # Convierte Maven ID a path local
│   ├── replaceVariables()  # Reemplaza {VAR} en args
│   ├── extractMainClass()  # Lee Main-Class del MANIFEST.MF
│   └── runAll()            # Ejecuta todos los processors
│
├── processbuilder.js       # Construye el proceso de Minecraft
│   ├── classpathArg()      # Construye -cp para ejecución
│   └── _resolveModLoaderLibraries() # Resuelve libs del loader
│
├── configmanager.js        # Configuración del launcher
│
├── distromanager.js        # Gestión de distribución
│
└── installationmanager.js  # Gestión de instalaciones custom
```

---

## 📋 DIFERENCIA: Librerías del version.json vs Classpath de Processors

### Librerías del version.json (SE DESCARGAN ✅)
Son las librerías que Minecraft/Forge necesita para **ejecutar el juego**:
```
cpw.mods:securejarhandler:1.0.8
org.ow2.asm:asm:9.7.1           ← Versión 9.7.1
org.ow2.asm:asm-commons:9.7.1   ← Versión 9.7.1
net.minecraftforge:fmlloader:1.18.2-40.3.0
... (29 librerías)
```

### Librerías del classpath de Processors (NO SE DESCARGAN ❌)
Son las librerías que los **processors** necesitan para ejecutarse durante la instalación:
```
net.sf.jopt-simple:jopt-simple:6.0-alpha-3    ← NO está en version.json
de.siegmar:fastcsv:2.2.2                       ← NO está en version.json
net.minecraftforge:srgutils:0.5.6              ← NO está en version.json
org.ow2.asm:asm-commons:9.6                    ← Versión 9.6 (diferente!)
org.ow2.asm:asm-tree:9.6                       ← Versión 9.6 (diferente!)
```

**Nota importante**: Algunas librerías tienen el mismo nombre pero **versiones diferentes**. Por ejemplo, `asm-commons:9.7.1` está en version.json, pero el processor necesita `asm-commons:9.6`.

---

## 🔧 SOLUCIÓN NECESARIA

### Código a Modificar: `forgeprocessor.js`

En la función `executeProcessor()`, después de descargar el processor JAR y ANTES de ejecutar Java:

```javascript
// PASO ADICIONAL: Descargar dependencias del classpath
if (processor.classpath && processor.classpath.length > 0) {
    logger.info(`Processor has ${processor.classpath.length} classpath dependencies`)
    
    for (const classpathItem of processor.classpath) {
        const classpathJar = this.mavenToPath(classpathItem)
        
        if (!fs.existsSync(classpathJar)) {
            logger.info(`Downloading classpath dependency: ${classpathItem}`)
            
            // Parsear Maven coordinate
            const parts = classpathItem.split(':')
            const group = parts[0].replace(/\./g, '/')
            const artifact = parts[1]
            const version = parts[2]
            const jarName = `${artifact}-${version}.jar`
            
            // URLs de Maven para intentar
            const mavenUrls = [
                `https://maven.minecraftforge.net/${group}/${artifact}/${version}/${jarName}`,
                `https://repo1.maven.org/maven2/${group}/${artifact}/${version}/${jarName}`,
                `https://libraries.minecraft.net/${group}/${artifact}/${version}/${jarName}`
            ]
            
            let downloaded = false
            for (const url of mavenUrls) {
                try {
                    await this.downloadFromUrl(url, classpathJar)
                    logger.info(`✓ Downloaded ${jarName} from Maven`)
                    downloaded = true
                    break
                } catch (err) {
                    logger.debug(`Failed from ${url}: ${err.message}`)
                }
            }
            
            if (!downloaded) {
                // Intentar extraer del installer
                const possiblePaths = [
                    `maven/${group}/${artifact}/${version}/${jarName}`,
                    `data/${jarName}`,
                    jarName
                ]
                
                for (const tryPath of possiblePaths) {
                    const entry = this.installerZip.getEntry(tryPath)
                    if (entry) {
                        fs.ensureDirSync(path.dirname(classpathJar))
                        fs.writeFileSync(classpathJar, entry.getData())
                        logger.info(`✓ Extracted ${jarName} from installer`)
                        downloaded = true
                        break
                    }
                }
            }
            
            if (!downloaded) {
                throw new Error(`Cannot find classpath dependency: ${classpathItem}`)
            }
        }
    }
}

// AHORA construir el classpath completo
const classpathEntries = [processorJar]
for (const lib of processor.classpath) {
    classpathEntries.push(this.mavenToPath(lib))
}
const classpath = classpathEntries.join(path.delimiter)

// Ejecutar Java con classpath completo
const args = ['-cp', classpath, mainClass, ...processorArgs]
```

---

## 📊 COMPARACIÓN CON LAUNCHERS NATIVOS

### ATLauncher (Java)
Archivo: `ForgeInstallProfile.java`, método `Processor.process()`

```java
// ATLauncher primero descarga todas las librerías del classpath
for (String lib : processor.classpath) {
    Download download = installProfile.libraries.get(lib);
    if (download != null) {
        download.downloadTo(librariesDir);
    }
}

// Luego construye el classpath completo
List<String> classpath = new ArrayList<>();
classpath.add(processorJar.getAbsolutePath());
for (String lib : processor.classpath) {
    classpath.add(getLibraryPath(lib).getAbsolutePath());
}

// Finalmente ejecuta Java
ProcessBuilder pb = new ProcessBuilder("java", "-cp", String.join(":", classpath), ...);
```

### PrismLauncher (C++/Qt)
Archivo: `ForgeInstallTask.cpp`

```cpp
// Descarga todas las dependencias primero
for (const auto& lib : processor.classpath) {
    auto libPath = m_instance->libraryPath() + "/" + lib.getArtifactPath();
    if (!QFile::exists(libPath)) {
        downloadLibrary(lib.getMavenUrl(), libPath);
    }
}
```

### HeliosLauncher (Actual) - PROBLEMA
```javascript
// Solo descarga el processor JAR principal
if (!fs.existsSync(processorJar)) {
    await downloadFromMaven(processorJar);
}

// Las dependencias del classpath... ¡SOLO MUESTRA WARNINGS!
for (const lib of processor.classpath) {
    const libPath = this.mavenToPath(lib)
    if (!fs.existsSync(libPath)) {
        logger.warn(`Classpath library not found: ${libPath}`)  // ← NO DESCARGA
    }
}
```

---

## 📁 REFERENCIA TÉCNICA

### FORGE_PROCESSORS_RESEARCH.md

| Sección | Relevancia |
|---------|------------|
| 1.1 | Estructura de install_profile.json |
| 2.0 | Estructura de un Processor (campo `classpath`) |
| 3.4 | Ejecución del Processor (construcción de classpath) |
| 5.0 | Conversión de Maven Identifier a Path |
| 6.0 | Ejemplo de install_profile.json completo |
| 7.0 | Pseudocódigo de implementación |

### URLs de Maven para Forge

```
https://maven.minecraftforge.net/      # Librerías de Forge/MCP
https://repo1.maven.org/maven2/        # Maven Central
https://libraries.minecraft.net/       # Librerías de Mojang
```

---

## 🎯 PRÓXIMOS PASOS

### Paso 1: Implementar descarga de dependencias del classpath
- [ ] Modificar `forgeprocessor.js` → `executeProcessor()`
- [ ] Iterar sobre `processor.classpath[]`
- [ ] Descargar JARs faltantes desde Maven
- [ ] Fallback: extraer del installer ZIP

### Paso 2: Validar Processor 1/6
- [ ] Verificar que `installertools` ejecuta sin `NoClassDefFoundError`
- [ ] Confirmar que genera `mcp_config-mappings.txt`
- [ ] Validar SHA1 del output

### Paso 3: Ejecutar Processors 2-6
- [ ] jarsplitter → client-slim.jar, client-extra.jar
- [ ] binarypatcher → client-patched.jar
- [ ] SpecialSource → client-srg.jar
- [ ] installertools (DOWNLOAD_MOJMAPS) → mappings
- [ ] Processor final → forge-client.jar

### Paso 4: Validación final
- [ ] Los 6 processors ejecutados exitosamente
- [ ] Todos los outputs generados y validados con SHA1
- [ ] Minecraft lanza con Forge funcional

---

## 🔍 LOGS CLAVE PARA DEBUG

### Log Exitoso Esperado
```log
[info] [ForgeProcessor]: Processor has 5 classpath dependencies
[info] [ForgeProcessor]: Downloading jopt-simple-6.0-alpha-3.jar from Maven
[info] [ForgeProcessor]: ✓ Downloaded jopt-simple-6.0-alpha-3.jar
[info] [ForgeProcessor]: Downloading fastcsv-2.2.2.jar from Maven
[info] [ForgeProcessor]: ✓ Downloaded fastcsv-2.2.2.jar
[info] [ForgeProcessor]: Downloading srgutils-0.5.6.jar from Maven
[info] [ForgeProcessor]: ✓ Downloaded srgutils-0.5.6.jar
[info] [ForgeProcessor]: Downloading asm-commons-9.6.jar from Maven
[info] [ForgeProcessor]: ✓ Downloaded asm-commons-9.6.jar
[info] [ForgeProcessor]: Downloading asm-tree-9.6.jar from Maven
[info] [ForgeProcessor]: ✓ Downloaded asm-tree-9.6.jar
[info] [ForgeProcessor]: [1/6] Executing processor: installertools-1.4.1.jar
[info] [ForgeProcessor]: [1/6] Processor completed successfully
```

### Log de Error Actual
```log
[warn] [ForgeProcessor]: Classpath library not found: jopt-simple-6.0-alpha-3.jar
[warn] [ForgeProcessor]: Classpath library not found: fastcsv-2.2.2.jar
[warn] [ForgeProcessor]: Classpath library not found: srgutils-0.5.6.jar
[warn] [ForgeProcessor]: Classpath library not found: asm-commons-9.6.jar
[warn] [ForgeProcessor]: Classpath library not found: asm-tree-9.6.jar
[info] [ForgeProcessor]: Executing processor: installertools-1.4.1.jar
[error] java.lang.NoClassDefFoundError: joptsimple/OptionException
```

---

## 📝 RESUMEN EJECUTIVO

| Aspecto | Estado |
|---------|--------|
| **Problema** | Las dependencias del classpath de processors NO se descargan |
| **Causa** | El código solo muestra warnings, no implementa descarga |
| **Impacto** | Ningún processor puede ejecutarse correctamente |
| **Solución** | Implementar descarga automática desde Maven/installer |
| **Complejidad** | Media - lógica similar ya existe para processor JAR |
| **Archivos a modificar** | `forgeprocessor.js` → `executeProcessor()` |

---

**Estado**: SOLUCIONADO 
**Prioridad**: Alta  
**Última actualización**: 6 de diciembre de 2025
