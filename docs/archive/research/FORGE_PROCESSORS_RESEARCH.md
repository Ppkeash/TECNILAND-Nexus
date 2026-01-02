# Investigación: Sistema de Processors de Forge

## Resumen Ejecutivo

Los **processors** de Forge son tareas Java que transforman archivos durante la instalación. Son esenciales para versiones Forge 1.13+ y ejecutan herramientas como `jarsplitter`, `binarypatcher`, y `SpecialSource` para generar los archivos necesarios.

## 1. Estructura de install_profile.json

### 1.1 Ubicación y Formato
```json
{
  "version": "forge-1.20.1-47.1.0",
  "spec": 1,
  "json": "/version.json",
  "path": "net.minecraftforge:forge:1.20.1-47.1.0",
  "minecraft": "1.20.1",
  "data": {
    "MINECRAFT_JAR": {
      "client": "[path_to_client.jar]",
      "server": "[path_to_server.jar]"
    },
    "MINECRAFT_VERSION": {
      "client": "[version.json]",
      "server": "[version.json]"
    },
    "ROOT": {
      "client": "[instance_root]",
      "server": "[server_root]"
    },
    "INSTALLER": {
      "client": "[installer.jar]",
      "server": "[installer.jar]"
    },
    "LIBRARY_DIR": {
      "client": "[libraries_folder]",
      "server": "[libraries_folder]"
    }
  },
  "processors": [...]
}
```

### 1.2 Campo `data`
Contiene variables del sistema que se reemplazan en los argumentos de processors:
- **MINECRAFT_JAR**: Ruta al JAR de Minecraft (client.jar o server.jar)
- **MINECRAFT_VERSION**: Ruta al version.json de Minecraft
- **ROOT**: Directorio raíz de la instalación
- **INSTALLER**: Ruta al instalador de Forge
- **LIBRARY_DIR**: Carpeta de librerías
- **SIDE**: "client" o "server"

Cada entrada puede tener valores diferentes para `client` y `server`.

## 2. Estructura de un Processor

```json
{
  "jar": "net.minecraftforge:jarsplitter:1.1.4:fatjar",
  "classpath": [
    "net.minecraftforge:srgutils:0.4.11"
  ],
  "args": [
    "--input",
    "{MINECRAFT_JAR}",
    "--slim",
    "{BINPATCH}",
    "--extra",
    "{BINPATCH_OUTPUT}",
    "--srg",
    "{MAPPINGS}"
  ],
  "outputs": {
    "{BINPATCH}": "a1b2c3d4...",
    "{BINPATCH_OUTPUT}": "'e5f6g7h8...'"
  },
  "sides": ["client", "server"]
}
```

### Campos:
- **jar**: Identificador Maven del JAR principal a ejecutar
- **classpath**: Array de librerías necesarias para el classpath
- **args**: Argumentos que se pasan al método `main()` del JAR
- **outputs**: Map de archivos de salida con sus checksums SHA1 esperados
- **sides**: Array indicando si aplica a "client", "server", o ambos

## 3. Flujo de Ejecución de Processors

### 3.1 Implementación en ATLauncher (Java)

**Archivo**: `Forge113Loader.java`
```java
@Override
public void runProcessors() {
    ForgeInstallProfile installProfile = this.getInstallProfile();

    installProfile.processors.forEach(processor -> {
        if (!instanceInstaller.isCancelled()) {
            try {
                processor.process(installProfile, this.tempDir, instanceInstaller);
            } catch (IOException e) {
                LogManager.logStackTrace(e);
                LogManager.error("Failed to process processor with jar " + processor.getJar());
                instanceInstaller.cancel(true);
            }
        }
    });
}
```

### 3.2 Preparación de Variables

**Archivo**: `Forge113Loader.java`
```java
@Override
public ForgeInstallProfile getInstallProfile() {
    ForgeInstallProfile installProfile = super.getInstallProfile();

    // Inyectar variables del sistema
    installProfile.data.put("SIDE", new Data("client", "server"));
    installProfile.data.put("ROOT", new Data(instanceInstaller.root.toAbsolutePath().toString()));
    installProfile.data.put("MINECRAFT_JAR",
            new Data(instanceInstaller.getMinecraftJarLibrary("client").getAbsolutePath(),
                    instanceInstaller.getMinecraftJarLibrary("server").getAbsolutePath()));
    installProfile.data.put("MINECRAFT_VERSION",
            new Data(FileSystem.MINECRAFT_VERSIONS_JSON
                    .resolve(instanceInstaller.minecraftVersionManifest.id + ".json").toAbsolutePath().toString()));
    installProfile.data.put("INSTALLER", new Data(installerPath.toAbsolutePath().toString()));
    installProfile.data.put("LIBRARY_DIR", new Data(FileSystem.LIBRARIES.toAbsolutePath().toString()));

    return installProfile;
}
```

### 3.3 Validación Previa (needToRun)

**Archivo**: `Processor.java`
```java
public boolean needToRun(ForgeInstallProfile installProfile, File extractedDir,
        InstanceInstaller instanceInstaller) {
    // 1. Verificar si aplica al lado correcto (client/server)
    if (this.sides != null && !this.sides.contains(instanceInstaller.isServer ? "server" : "client")) {
        LogManager.debug("No need to run processor " + this.jar + " since it's not needed for this side");
        return false;
    }

    // 2. Si no tiene outputs, siempre debe ejecutarse
    if (!this.hasOutputs()) {
        return true;
    }

    // 3. Validar cada output
    File librariesDirectory = instanceInstaller.isServer 
        ? instanceInstaller.root.resolve("libraries").toFile()
        : FileSystem.LIBRARIES.toFile();

    for (Entry<String, String> entry : this.outputs.entrySet()) {
        String key = entry.getKey();
        LogManager.debug("Processing output for " + key);

        char start = key.charAt(0);
        char end = key.charAt(key.length() - 1);

        // Si la key es una variable (ej: {BINPATCH})
        if (start == '{' && end == '}') {
            // Obtener el path del archivo desde data
            String dataItem = installProfile.data.get(key.substring(1, key.length() - 1))
                    .getValue(!instanceInstaller.isServer, librariesDirectory);
            
            String value = entry.getValue();
            File outputFile = new File(dataItem);

            // Si el archivo no existe, necesita ejecutarse
            if (!outputFile.exists() || !outputFile.isFile()) {
                return true;
            }

            // Validar SHA1 del archivo
            char valueStart = value.charAt(0);
            char valueEnd = value.charAt(value.length() - 1);

            if (valueStart == '{' && valueEnd == '}') {
                // La value también es una variable, obtener el hash esperado
                String valueDataItem = installProfile.data.get(value.substring(1, value.length() - 1))
                        .getValue(!instanceInstaller.isServer, librariesDirectory);
                
                String sha1Hash = Hashing.sha1(outputFile.toPath()).toString();
                String expectedHash = valueDataItem.charAt(0) == '\''
                        ? valueDataItem.substring(1, valueDataItem.length() - 1)
                        : valueDataItem;

                LogManager.debug("Expecting " + sha1Hash + " to equal " + expectedHash);
                if (!sha1Hash.equals(expectedHash)) {
                    Utils.delete(outputFile);
                    return true;
                }
            }
        }
    }

    LogManager.debug("No need to run processor " + this.jar + " since outputs all match hashes");
    return false;
}
```

### 3.4 Ejecución del Processor

**Archivo**: `Processor.java`
```java
public void process(ForgeInstallProfile installProfile, File extractedDir, 
        InstanceInstaller instanceInstaller) throws IOException {
    
    // 1. Verificar si necesita ejecutarse
    if (!this.needToRun(installProfile, extractedDir, instanceInstaller)) {
        return;
    }

    File librariesDirectory = instanceInstaller.isServer 
        ? instanceInstaller.root.resolve("libraries").toFile()
        : FileSystem.LIBRARIES.toFile();

    // 2. Obtener el JAR del processor
    File jarPath = Utils.convertMavenIdentifierToFile(this.jar, librariesDirectory);
    LogManager.debug("Jar path is " + jarPath);
    if (!jarPath.exists() || !jarPath.isFile()) {
        LogManager.error("Failed to process processor with jar " + this.jar + " as the jar doesn't exist");
        instanceInstaller.cancel(true);
        return;
    }

    // 3. Extraer el MainClass del MANIFEST.MF
    JarFile jarFile = new JarFile(jarPath);
    String mainClass = jarFile.getManifest().getMainAttributes().getValue(Attributes.Name.MAIN_CLASS);
    jarFile.close();
    LogManager.debug("Found mainclass of " + mainClass);

    if (mainClass == null || mainClass.isEmpty()) {
        LogManager.error("Failed to process processor with jar " + this.jar + " as the mainclass wasn't found");
        instanceInstaller.cancel(true);
        return;
    }

    // 4. Construir el classpath
    List<URL> classpath = new ArrayList<>();
    classpath.add(jarPath.toURI().toURL());

    for (String classpathItem : this.getClasspath()) {
        LogManager.debug("Adding classpath " + classpathItem);
        File classpathFile = Utils.convertMavenIdentifierToFile(classpathItem, FileSystem.LIBRARIES.toFile());

        if (!classpathFile.exists() || !classpathFile.isFile()) {
            LogManager.error("Failed to process processor with jar " + this.jar
                    + " as the classpath item with file " + classpathFile.getAbsolutePath() + " doesn't exist");
            instanceInstaller.cancel(true);
            return;
        }

        classpath.add(classpathFile.toURI().toURL());
    }

    // 5. Procesar argumentos y reemplazar variables
    List<String> args = new ArrayList<>();

    for (String arg : this.getArgs()) {
        // Reemplazar {ROOT} si existe
        if (arg.contains("{ROOT}")) {
            arg = arg.replace("{ROOT}",
                    installProfile.data.get("ROOT").getValue(!instanceInstaller.isServer, librariesDirectory));
        }

        LogManager.debug("Processing argument " + arg);
        char start = arg.charAt(0);
        char end = arg.charAt(arg.length() - 1);

        if (start == '{' && end == '}') {
            // Es una variable del data map
            String key = arg.substring(1, arg.length() - 1);
            LogManager.debug("Getting data with key of " + key);
            String value = installProfile.data.get(key).getValue(!instanceInstaller.isServer, librariesDirectory);

            if (value == null || value.isEmpty()) {
                LogManager.error("Failed to process processor with jar " + this.jar 
                    + " as the argument with name " + arg + " as the data item with key " + key + " was empty or null");
                instanceInstaller.cancel(true);
                return;
            }

            LogManager.debug("Got value of " + value);
            
            // Si el value es un path local (empieza con /)
            if (value.charAt(0) == '/') {
                if (value.toLowerCase(Locale.ENGLISH).contains(FileSystem.BASE_DIR.toString().toLowerCase(Locale.ENGLISH))) {
                    // Ya está resuelto (como {INSTALLER})
                    args.add(value);
                } else {
                    // Localizar al extractedDir
                    File localFile = new File(extractedDir, value);
                    LogManager.debug("Got argument with local file of " + localFile.getAbsolutePath());

                    if (!localFile.exists() || !localFile.isFile()) {
                        LogManager.error("Failed to process argument with value of " + value 
                            + " as the local file " + localFile.getAbsolutePath() + " doesn't exist");
                        instanceInstaller.cancel(true);
                        return;
                    }

                    args.add(localFile.getAbsolutePath());
                }
            } else {
                args.add(value);
            }
        } else if (start == '[' && end == ']') {
            // Es un artifact Maven (ej: [net.minecraft:client:1.20.1:mappings@txt])
            String artifact = arg.substring(1, arg.length() - 1);
            File artifactFile = Utils.convertMavenIdentifierToFile(artifact, FileSystem.LIBRARIES.toFile());
            LogManager.debug("Got argument with file of " + artifactFile.getAbsolutePath());

            if (!artifactFile.exists() || !artifactFile.isFile()) {
                LogManager.error("Failed to process argument with value of " + arg 
                    + " as the file " + artifactFile.getAbsolutePath() + " doesn't exist");
                instanceInstaller.cancel(true);
                return;
            }

            args.add(artifactFile.getAbsolutePath());
        } else {
            // Argumento literal
            args.add(arg);
        }
    }

    // 6. Parámetros extra para DEOBF_REALMS
    if (this.args.contains("DEOBF_REALMS")) {
        args.add("--json");
        args.add(FileSystem.MINECRAFT_VERSIONS_JSON.resolve(instanceInstaller.minecraftVersionManifest.id + ".json")
                .toAbsolutePath().toString());
        args.add("--libs");
        args.add(FileSystem.LIBRARIES.toFile().getAbsolutePath());
    }

    // 7. Crear ClassLoader personalizado
    ClassLoader parentClassLoader = null;
    try {
        Method getPlatform = ClassLoader.class.getDeclaredMethod("getPlatformClassLoader");
        parentClassLoader = (ClassLoader) getPlatform.invoke(null);
    } catch (Exception e) {
        // ignored
    }

    ClassLoader cl = new URLClassLoader(classpath.toArray(new URL[0]), parentClassLoader);
    Thread currentThread = Thread.currentThread();
    ClassLoader threadClassloader = currentThread.getContextClassLoader();
    currentThread.setContextClassLoader(cl);

    // 8. Ejecutar el processor
    try {
        LogManager.debug("Running processor with args \"" + String.join(" ", args) + "\"");
        Class<?> cls = Class.forName(mainClass, true, cl);
        Method main = cls.getDeclaredMethod("main", String[].class);
        main.invoke(null, (Object) args.toArray(new String[args.size()]));
    } catch (InvocationTargetException ite) {
        Throwable e = ite.getCause();
        LogManager.logStackTrace(e);
        LogManager.error("Failed to process processor with jar " + this.jar 
            + " as there was an error invoking the jar");
        instanceInstaller.cancel(true);
    } catch (Throwable e) {
        LogManager.logStackTrace(e);
        LogManager.error("Failed to process processor with jar " + this.jar 
            + " as there was an error invoking the jar");
        instanceInstaller.cancel(true);
    } finally {
        currentThread.setContextClassLoader(threadClassloader);
    }
}
```

## 4. Processors Comunes

### 4.1 jarsplitter
**Propósito**: Divide el JAR de Minecraft en múltiples partes (slim, extra).

**Argumentos típicos**:
```
--input {MINECRAFT_JAR}
--slim {BINPATCH}
--extra {BINPATCH_OUTPUT}
--srg {MAPPINGS}
```

**Maven**: `net.minecraftforge:jarsplitter:1.1.4:fatjar`

### 4.2 binarypatcher
**Propósito**: Aplica patches binarios al JAR de Minecraft.

**Argumentos típicos**:
```
--clean {MINECRAFT_JAR}
--output {BINPATCHED}
--apply {BINPATCH}
```

**Maven**: `net.minecraftforge:binarypatcher:1.0.12`

### 4.3 SpecialSource
**Propósito**: Reobfusca/deobfusca el código usando mappings SRG.

**Argumentos típicos**:
```
--in-jar {INPUT}
--out-jar {OUTPUT}
--srg-in {MAPPINGS}
--live
```

**Maven**: `net.md-5:SpecialSource:1.11.0:shaded`

### 4.4 installertools
**Propósito**: Herramientas auxiliares de Forge (DEOBF_REALMS, etc.).

**Maven**: `net.minecraftforge:installertools:1.2.10`

## 5. Conversión de Maven Identifier a Path

```javascript
// Ejemplo: "net.minecraftforge:forge:1.20.1-47.1.0"
function convertMavenIdentifierToPath(identifier) {
    const parts = identifier.split(':');
    
    // net.minecraftforge:forge:1.20.1-47.1.0 -> 
    // net/minecraftforge/forge/1.20.1-47.1.0/forge-1.20.1-47.1.0.jar
    
    const group = parts[0].replace(/\./g, '/');  // net/minecraftforge
    const artifact = parts[1];                    // forge
    const version = parts[2].split('@')[0];      // 1.20.1-47.1.0
    const classifier = parts[3] || '';            // fatjar, shaded, etc.
    const extension = parts[2].includes('@') 
        ? parts[2].split('@')[1] 
        : 'jar';
    
    let filename = `${artifact}-${version}`;
    if (classifier) {
        filename += `-${classifier}`;
    }
    filename += `.${extension}`;
    
    return `${group}/${artifact}/${version}/${filename}`;
}

// Ejemplo con classifier:
// "net.minecraftforge:jarsplitter:1.1.4:fatjar"
// -> net/minecraftforge/jarsplitter/1.1.4/jarsplitter-1.1.4-fatjar.jar

// Ejemplo con extension:
// "net.minecraft:client:1.20.1:mappings@txt"
// -> net/minecraft/client/1.20.1/client-1.20.1-mappings.txt
```

## 6. Clase Data (Variables)

**Archivo**: `Data.java`
```java
public class Data {
    public String client;
    public String server;
    
    public Data(String value) {
        this.client = value;
        this.server = value;
    }
    
    public Data(String client, String server) {
        this.client = client;
        this.server = server;
    }
    
    public String getValue(boolean isClient, File librariesDirectory) {
        String value = isClient ? this.client : this.server;
        
        // Si es un path Maven (empieza con [)
        if (value != null && value.charAt(0) == '[' && value.charAt(value.length() - 1) == ']') {
            // Convertir a path real
            String artifact = value.substring(1, value.length() - 1);
            File file = convertMavenIdentifierToFile(artifact, librariesDirectory);
            return file.getAbsolutePath();
        }
        
        return value;
    }
}
```

## 7. Pseudocódigo para JavaScript/Node.js

```javascript
class ForgeProcessorRunner {
    constructor(installProfile, instanceRoot, isServer) {
        this.installProfile = installProfile;
        this.instanceRoot = instanceRoot;
        this.isServer = isServer;
        this.librariesDir = path.join(instanceRoot, 'libraries');
    }
    
    async runProcessors() {
        // 1. Preparar variables del sistema
        this.installProfile.data = {
            ...this.installProfile.data,
            SIDE: { client: 'client', server: 'server' },
            ROOT: { client: this.instanceRoot, server: this.instanceRoot },
            MINECRAFT_JAR: {
                client: path.join(this.librariesDir, 'net/minecraft/client/...'),
                server: path.join(this.librariesDir, 'net/minecraft/server/...')
            },
            MINECRAFT_VERSION: {
                client: path.join(this.instanceRoot, 'versions/1.20.1/1.20.1.json'),
                server: path.join(this.instanceRoot, 'versions/1.20.1/1.20.1.json')
            },
            INSTALLER: { 
                client: path.join(tempDir, 'forge-installer.jar'),
                server: path.join(tempDir, 'forge-installer.jar')
            },
            LIBRARY_DIR: {
                client: this.librariesDir,
                server: this.librariesDir
            }
        };
        
        // 2. Ejecutar cada processor en orden
        for (const processor of this.installProfile.processors) {
            await this.processProcessor(processor);
        }
    }
    
    async processProcessor(processor) {
        // 1. Verificar si aplica al lado correcto
        if (processor.sides && !processor.sides.includes(this.isServer ? 'server' : 'client')) {
            console.log(`Skipping processor ${processor.jar} (wrong side)`);
            return;
        }
        
        // 2. Verificar si necesita ejecutarse (validar outputs)
        if (!await this.needToRun(processor)) {
            console.log(`Skipping processor ${processor.jar} (outputs valid)`);
            return;
        }
        
        // 3. Obtener el JAR del processor
        const jarPath = this.convertMavenToPath(processor.jar);
        if (!fs.existsSync(jarPath)) {
            throw new Error(`Processor JAR not found: ${jarPath}`);
        }
        
        // 4. Extraer MainClass del MANIFEST.MF
        const mainClass = await this.extractMainClass(jarPath);
        
        // 5. Construir classpath
        const classpath = [jarPath];
        for (const lib of processor.classpath || []) {
            classpath.push(this.convertMavenToPath(lib));
        }
        
        // 6. Procesar argumentos
        const args = [];
        for (let arg of processor.args) {
            // Reemplazar {ROOT}
            if (arg.includes('{ROOT}')) {
                arg = arg.replace('{ROOT}', this.instanceRoot);
            }
            
            // Variable {VAR}
            if (arg.startsWith('{') && arg.endsWith('}')) {
                const key = arg.substring(1, arg.length - 1);
                const value = this.getData(key);
                
                if (value.startsWith('/')) {
                    // Path local al extractedDir
                    args.push(path.join(extractedDir, value));
                } else {
                    args.push(value);
                }
            }
            // Maven artifact [group:artifact:version]
            else if (arg.startsWith('[') && arg.endsWith(']')) {
                const artifact = arg.substring(1, arg.length - 1);
                args.push(this.convertMavenToPath(artifact));
            }
            // Literal
            else {
                args.push(arg);
            }
        }
        
        // 7. Ejecutar el processor con Java
        await this.executeJava(mainClass, classpath, args);
    }
    
    async needToRun(processor) {
        if (!processor.outputs || Object.keys(processor.outputs).length === 0) {
            return true; // Sin outputs, siempre ejecutar
        }
        
        for (const [key, value] of Object.entries(processor.outputs)) {
            // Obtener path del output
            const outputPath = this.resolveVariable(key);
            
            // Verificar si existe
            if (!fs.existsSync(outputPath)) {
                return true;
            }
            
            // Obtener hash esperado
            const expectedHash = this.resolveVariable(value);
            const actualHash = await this.calculateSHA1(outputPath);
            
            // Remover comillas si las tiene
            const cleanHash = expectedHash.replace(/^'|'$/g, '');
            
            if (actualHash !== cleanHash) {
                fs.unlinkSync(outputPath); // Borrar archivo inválido
                return true;
            }
        }
        
        return false; // Todos los outputs son válidos
    }
    
    getData(key) {
        const data = this.installProfile.data[key];
        if (!data) {
            throw new Error(`Data key not found: ${key}`);
        }
        
        const value = this.isServer ? data.server : data.client;
        
        // Si es un Maven artifact [...]
        if (value.startsWith('[') && value.endsWith(']')) {
            const artifact = value.substring(1, value.length - 1);
            return this.convertMavenToPath(artifact);
        }
        
        return value;
    }
    
    resolveVariable(varOrValue) {
        if (varOrValue.startsWith('{') && varOrValue.endsWith('}')) {
            const key = varOrValue.substring(1, varOrValue.length - 1);
            return this.getData(key);
        }
        return varOrValue;
    }
    
    async executeJava(mainClass, classpath, args) {
        const javaPath = await this.getJavaPath();
        
        const javaArgs = [
            '-cp',
            classpath.join(path.delimiter),
            mainClass,
            ...args
        ];
        
        return new Promise((resolve, reject) => {
            const child = spawn(javaPath, javaArgs, {
                cwd: this.instanceRoot,
                stdio: 'inherit'
            });
            
            child.on('exit', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Processor exited with code ${code}`));
                }
            });
            
            child.on('error', reject);
        });
    }
    
    async extractMainClass(jarPath) {
        // Usar JSZip o similar para leer META-INF/MANIFEST.MF
        const zip = await JSZip.loadAsync(fs.readFileSync(jarPath));
        const manifest = await zip.file('META-INF/MANIFEST.MF').async('string');
        
        const match = manifest.match(/Main-Class:\s*(.+)/);
        if (!match) {
            throw new Error('MainClass not found in MANIFEST.MF');
        }
        
        return match[1].trim();
    }
    
    convertMavenToPath(identifier) {
        // net.minecraftforge:forge:1.20.1-47.1.0 -> path
        const parts = identifier.split(':');
        const group = parts[0].replace(/\./g, path.sep);
        const artifact = parts[1];
        const versionWithExt = parts[2];
        const classifier = parts[3] || '';
        
        const [version, ext] = versionWithExt.split('@');
        const extension = ext || 'jar';
        
        let filename = `${artifact}-${version}`;
        if (classifier) {
            filename += `-${classifier}`;
        }
        filename += `.${extension}`;
        
        return path.join(this.librariesDir, group, artifact, version, filename);
    }
    
    async calculateSHA1(filePath) {
        const hash = crypto.createHash('sha1');
        const stream = fs.createReadStream(filePath);
        
        return new Promise((resolve, reject) => {
            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }
}
```

## 8. Orden de Ejecución

Los processors **DEBEN** ejecutarse en el orden exacto especificado en el array `processors`. Cada processor puede depender de los outputs del anterior.

Orden típico para Forge 1.20.1:
1. **jarsplitter** - Divide minecraft.jar
2. **binarypatcher** - Aplica patches de Forge
3. **SpecialSource** - Reobfusca con mappings SRG
4. **installertools** - Tareas finales

## 9. Consideraciones Importantes

### 9.1 Variables
- Las variables en `{CORCHETES}` se reemplazan con valores de `data`
- Los artifacts Maven en `[CORCHETES]` se convierten a paths
- Los paths literales se usan tal cual

### 9.2 SHA1 Validation
- Si un output tiene SHA1 inválido, se borra y se re-ejecuta el processor
- Los hashes pueden estar entre comillas simples ('hash') o sin ellas
- Usar biblioteca de hashing nativa (crypto en Node.js)

### 9.3 Classpath
- El JAR principal del processor va primero
- Luego todas las librerías del array `classpath`
- Se pasan al comando java con `-cp`

### 9.4 Manejo de Errores
- Si un processor falla, detener toda la instalación
- Mostrar logs claros del error
- Limpiar archivos parciales si es necesario

### 9.5 Sides (Client/Server)
- Verificar el campo `sides` antes de ejecutar
- Si no existe, ejecutar para ambos lados
- Las variables `data` tienen valores diferentes para client y server

### 9.6 Extracción del MainClass
- Leer el MANIFEST.MF dentro del JAR
- Buscar el atributo `Main-Class:`
- Es el entry point que se invoca con reflection/spawn

## 10. Ejemplo Completo de Uso

```javascript
const installProfile = JSON.parse(fs.readFileSync('install_profile.json'));
const runner = new ForgeProcessorRunner(installProfile, '/path/to/instance', false);

try {
    await runner.runProcessors();
    console.log('All processors completed successfully!');
} catch (error) {
    console.error('Processor execution failed:', error);
}
```

## 11. Referencias

- **ATLauncher Repository**: https://github.com/ATLauncher/ATLauncher
  - `src/main/java/com/atlauncher/data/minecraft/loaders/forge/Forge113Loader.java`
  - `src/main/java/com/atlauncher/data/minecraft/loaders/forge/Processor.java`
  - `src/main/java/com/atlauncher/data/minecraft/loaders/forge/ForgeInstallProfile.java`

- **PrismLauncher Repository**: https://github.com/PrismLauncher/PrismLauncher
  - C++/Qt implementation (más complejo para portar directamente)

## 12. Próximos Pasos para Implementación

1. Crear clase `ForgeProcessorRunner` en JavaScript
2. Implementar conversión de Maven identifier a path
3. Implementar lectura de MANIFEST.MF desde JARs
4. Implementar cálculo de SHA1
5. Implementar ejecución de procesos Java
6. Integrar con el flujo de instalación existente
7. Añadir logs detallados para debugging
8. Manejar casos edge (Forge legacy, NeoForge, etc.)

---

**Documento generado**: 8 de diciembre, 2025
**Basado en**: ATLauncher 3.4.40+ y Forge 1.13+
