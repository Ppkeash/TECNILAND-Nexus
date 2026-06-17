const AdmZip                = require('adm-zip')
const child_process         = require('child_process')
const crypto                = require('crypto')
const fs                    = require('fs-extra')
const { LoggerUtil }        = require('helios-core')
const { getMojangOS, isLibraryCompatible, mcVersionAtLeast }  = require('helios-core/common')
const { Type }              = require('helios-distribution-types')
const os                    = require('os')
const path                  = require('path')

const ConfigManager            = require('./configmanager')
const JavaManager              = require('./javamanager')
const TecnilandAuthManager     = require('./tecnilandauth/TecnilandAuthManager')
const CustomSkinLoaderManager  = require('./customskinloader/CustomSkinLoaderManager')

const logger = LoggerUtil.getLogger('ProcessBuilder')


/**
 * Only forge and fabric are top level mod loaders.
 * 
 * Forge 1.13+ launch logic is similar to fabrics, for now using usingFabricLoader flag to
 * change minor details when needed.
 * 
 * Rewrite of this module may be needed in the future.
 */
class ProcessBuilder {

    constructor(distroServer, vanillaManifest, modManifest, authUser, launcherVersion){
        this.gameDir = path.join(ConfigManager.getInstanceDirectory(), distroServer.rawServer.id)
        this.commonDir = ConfigManager.getCommonDirectory()
        this.server = distroServer
        this.vanillaManifest = vanillaManifest
        this.modManifest = modManifest
        this.authUser = authUser
        this.launcherVersion = launcherVersion
        this.forgeModListFile = path.join(this.gameDir, 'forgeMods.list') // 1.13+
        this.fmlDir = path.join(this.gameDir, 'forgeModList.json')
        this.llDir = path.join(this.gameDir, 'liteloaderModList.json')
        this.libPath = path.join(this.commonDir, 'libraries')

        this.usingLiteLoader = false
        this.usingFabricLoader = false
        this.usingQuiltLoader = false
        this.usingNeoForgeLoader = false
        this.usingOptiFine = false
        this.llPath = null
        
        // ✅ LOG: Verificar modManifest cargado (para Fabric/Forge/OptiFine)
        if (modManifest && modManifest !== vanillaManifest) {
            logger.info('=== MOD LOADER VERSION.JSON LOADED ===')
            logger.info(`  ID: ${modManifest.id || 'unknown'}`)
            logger.info(`  MainClass: ${modManifest.mainClass || 'none'}`)
            logger.info(`  Libraries count: ${modManifest.libraries ? modManifest.libraries.length : 0}`)
            logger.info(`  InheritsFrom: ${modManifest.inheritsFrom || 'none'}`)
        } else {
            logger.info('Using pure Vanilla (no mod loader)')
        }
    }
    
    /**
     * Detectar si estamos usando OptiFine basado en el modManifest
     * OptiFine se identifica por:
     * - ID contiene "OptiFine"
     * - O tiene inheritsFrom y libraries con optifine
     */
    _detectOptiFine() {
        if (!this.modManifest || this.modManifest === this.vanillaManifest) {
            return false
        }
        
        // Criterio 1: ID contiene OptiFine
        if (this.modManifest.id && this.modManifest.id.toLowerCase().includes('optifine')) {
            return true
        }
        
        // Criterio 2: Libraries contienen optifine
        if (this.modManifest.libraries) {
            for (const lib of this.modManifest.libraries) {
                const libName = (lib.name || '').toLowerCase()
                if (libName.includes('optifine:optifine') || libName.includes('optifine:launchwrapper')) {
                    return true
                }
            }
        }
        
        return false
    }
    
    /**
     * Get authlib-injector JVM arguments for TECNILAND accounts.
     * This allows Minecraft to authenticate against the TECNILAND server.
     * 
     * @returns {Array<string>} Array of JVM arguments for authlib-injector, or empty array.
     */
    _getTecnilandAuthArgs() {
        if (this.authUser.type !== 'tecniland') {
            return []
        }
        
        try {
            const args = TecnilandAuthManager.getAuthlibInjectorArgs()
            
            if (args.length > 0) {
                logger.info('[ProcessBuilder] Using authlib-injector for Yggdrasil authentication')
            }
            
            return args
        } catch (err) {
            logger.error('Error getting TECNILAND auth args:', err)
            return []
        }
    }
    
    /**
     * Determina el tipo de mod loader de la instancia actual.
     * Utiliza los flags detectados durante build().
     * 
     * @returns {string} 'fabric' | 'quilt' | 'forge' | 'neoforge' | 'optifine' | 'vanilla'
     */
    _getModLoaderType() {
        if (this.usingFabricLoader) return 'fabric'
        if (this.usingQuiltLoader) return 'quilt'
        if (this.usingNeoForgeLoader) return 'neoforge'
        if (this.usingOptiFine) return 'optifine'
        
        // Detectar Forge: cuando modManifest !== vanillaManifest y no es ningún otro loader
        if (this.modManifest && this.modManifest !== this.vanillaManifest) {
            // Si tiene libraries con 'forge' o 'minecraftforge', es Forge
            if (this.modManifest.libraries) {
                for (const lib of this.modManifest.libraries) {
                    const libName = (lib.name || '').toLowerCase()
                    if (libName.includes('minecraftforge') || libName.includes('net.minecraftforge:forge')) {
                        return 'forge'
                    }
                }
            }
        }
        
        return 'vanilla'
    }
    
    /**
     * Convienence method to run the functions typically used to build a process.
     */
    async build(){
        fs.ensureDirSync(this.gameDir)
        
        const tempNativePath = path.join(os.tmpdir(), ConfigManager.getTempNativeFolder(), crypto.pseudoRandomBytes(16).toString('hex'))
        process.throwDeprecation = true
        this.setupLiteLoader()
        logger.info('Using liteloader:', this.usingLiteLoader)
        
        // Detectar OptiFine
        this.usingOptiFine = this._detectOptiFine()
        logger.info('Using OptiFine:', this.usingOptiFine)
        
        // Detectar Fabric loader (net.fabricmc:fabric-loader)
        // Para instalaciones custom, los módulos son objetos planos sin rawModule
        // Tipos válidos: Type.Fabric (distro), 'FabricMod' (custom fabric)
        this.usingFabricLoader = this.server.modules && this.server.modules.length > 0 
            ? this.server.modules.some(mdl => {
                const moduleType = mdl.rawModule ? mdl.rawModule.type : mdl.type
                const moduleId = mdl.id || ''
                const isFabric = moduleType === Type.Fabric || moduleType === 'FabricMod' || moduleId.startsWith('net.fabricmc:fabric-loader:')
                if (isFabric) {
                    logger.debug(`Detected Fabric loader module: type=${moduleType}, id=${mdl.id || 'unknown'}`)
                }
                return isFabric
            })
            : false
        logger.info('Using fabric loader:', this.usingFabricLoader)
        
        // Detectar Quilt loader (org.quiltmc:quilt-loader)
        // Tipo válido: 'QuiltMod' (custom quilt)
        this.usingQuiltLoader = this.server.modules && this.server.modules.length > 0 
            ? this.server.modules.some(mdl => {
                const moduleType = mdl.rawModule ? mdl.rawModule.type : mdl.type
                const moduleId = mdl.id || ''
                const isQuilt = moduleType === 'QuiltMod' || moduleId.startsWith('org.quiltmc:quilt-loader:')
                if (isQuilt) {
                    logger.debug(`Detected Quilt loader module: type=${moduleType}, id=${mdl.id || 'unknown'}`)
                }
                return isQuilt
            })
            : false
        logger.info('Using quilt loader:', this.usingQuiltLoader)
        
        // Detectar NeoForge loader (net.neoforged:neoforge)
        // Tipo válido: 'NeoForgeMod' (custom neoforge)
        this.usingNeoForgeLoader = this.server.modules && this.server.modules.length > 0 
            ? this.server.modules.some(mdl => {
                const moduleType = mdl.rawModule ? mdl.rawModule.type : mdl.type
                const moduleId = mdl.id || ''
                const isNeoForge = moduleType === 'NeoForgeMod' || moduleId.startsWith('net.neoforged:neoforge:')
                if (isNeoForge) {
                    logger.debug(`Detected NeoForge loader module: type=${moduleType}, id=${mdl.id || 'unknown'}`)
                }
                return isNeoForge
            })
            : false
        logger.info('Using neoforge loader:', this.usingNeoForgeLoader)
        
        // ✅ NEOFORGE: Locate SRG JAR and enumerate ALL other client JARs for hiding
        // SRG JAR: Will be added to module path (module `minecraft`) - this one must remain visible
        // ALL OTHER client-*.jar: Must be physically hidden to prevent JPMS module conflicts
        // This must happen BEFORE constructJVMArguments is called
        this.neoForgeSrgJarPath = null
        this.neoForgeClientJarsToHide = []  // Array of JAR filenames to hide (not full paths)
        this.neoForgeClientJarsDirectory = null  // Directory containing client JARs
        if (this.usingNeoForgeLoader) {
            const mcVersion = this.server.rawServer.minecraftVersion
            const clientDir = path.join(this.libPath, 'net', 'minecraft', 'client')
            
            try {
                // Find the versioned directory (e.g., "1.20.4-20231207.154220")
                const clientDirs = fs.readdirSync(clientDir)
                const versionDir = clientDirs.find(dir => dir.startsWith(mcVersion))
                
                if (!versionDir) {
                    throw new Error(`No NeoForge client directory found for MC ${mcVersion} in ${clientDir}`)
                }
                
                // Enumerate ALL files in the versioned directory
                const versionPath = path.join(clientDir, versionDir)
                const files = fs.readdirSync(versionPath)
                
                // Find SRG JAR (the only one we want to keep visible)
                const srgJar = files.find(f => f.endsWith('-srg.jar'))
                
                if (!srgJar) {
                    throw new Error(`No SRG JAR found in ${versionPath}. Processors may not have executed correctly.`)
                }
                
                // Find ALL other client-*.jar files (extra, slim, and any future variants)
                const clientJarsPattern = /^client-.*\.jar$/
                const allClientJars = files.filter(f => clientJarsPattern.test(f) && f !== srgJar)
                
                this.neoForgeSrgJarPath = path.join(versionPath, srgJar)
                this.neoForgeClientJarsToHide = allClientJars
                this.neoForgeClientJarsDirectory = versionPath
                
                logger.info('=== NEOFORGE JAR DETECTION ===')
                logger.info(`  ✅ SRG JAR (will remain visible): ${srgJar}`)
                logger.info(`  ✅ Client JARs to hide: ${allClientJars.length}`)
                allClientJars.forEach((jar, idx) => {
                    logger.info(`     [${idx + 1}] ${jar}`)
                })
                logger.info(`  Directory: ${versionPath}`)
                logger.info('================================')
                
            } catch (error) {
                logger.error(`❌ CRITICAL: Failed to locate NeoForge JARs: ${error.message}`)
                throw error
            }
        }
        
        // Para instalaciones custom sin modules, usar objeto vacío
        const modules = this.server.modules || []
        const modConfig = this.server.modules && this.server.modules.length > 0
            ? ConfigManager.getModConfiguration(this.server.rawServer.id).mods
            : {}
        const modObj = this.resolveModConfiguration(modConfig, modules)
        
        // Separar game mods de loader modules
        const gameMods = modObj.fMods  // Mods reales con archivos
        const liteMods = modObj.lMods
        const loaderModules = modObj.loaderMods || []  // Metadata de loaders (Fabric, Quilt, etc)
        
        logger.info(`Separated modules: gameMods=${gameMods.length}, liteMods=${liteMods.length}, loaderModules=${loaderModules.length}`)
        
        // Mod list below 1.13
        // Fabric only supports 1.14+
        if(!mcVersionAtLeast('1.13', this.server.rawServer.minecraftVersion)){
            this.constructJSONModList('forge', gameMods, true)
            if(this.usingLiteLoader){
                this.constructJSONModList('liteloader', liteMods, true)
            }
        }
        
        const uberModArr = gameMods.concat(liteMods)
        let args = this.constructJVMArguments(uberModArr, tempNativePath)

        if(mcVersionAtLeast('1.13', this.server.rawServer.minecraftVersion)){
            //args = args.concat(this.constructModArguments(gameMods))
            // IMPORTANTE: Solo pasar gameMods (archivos reales), NO loaderModules
            args = args.concat(this.constructModList(gameMods))
        }

        // Hide access token
        const loggableArgs = [...args]
        loggableArgs[loggableArgs.findIndex(x => x === this.authUser.accessToken)] = '**********'

        logger.info('Launch Arguments:', loggableArgs)
        
        // ✅ NEOFORGE DIAGNOSTICS: Log module path for debugging (optional)
        // Uncomment if you need to debug module path issues
        /*
        if (this.usingNeoForgeLoader) {
            const modulePathIndex = args.findIndex(arg => arg === '-p')
            if (modulePathIndex !== -1 && modulePathIndex + 1 < args.length) {
                const modulePathValue = args[modulePathIndex + 1]
                const separator = ProcessBuilder.getClasspathSeparator()
                const entries = modulePathValue.split(separator)
                
                logger.info('=== NEOFORGE: MODULE PATH DIAGNOSTICS ===')
                logger.info(`  Total entries: ${entries.length}`)
                entries.forEach((entry, idx) => {
                    const moduleName = this._getJarModuleName(entry)
                    logger.info(`    [${idx + 1}] ${path.basename(entry)} -> ${moduleName || 'unknown'}`)
                })
                logger.info('=============================================')
            }
        }
        */

        // Get Java executable - should already be configured by landing.js
        // This is the Java that was validated by JavaManager before launch
        let javaExecutable = ConfigManager.getJavaExecutable(this.server.rawServer.id)
        
        // ⚠️ CRITICAL VALIDATION: ALWAYS verify Java compatibility before launch
        // This is a safety net in case landing.js validation was bypassed
        const mcVersion = this.server.rawServer.minecraftVersion
        const javaReqs = JavaManager.getJavaRequirements(mcVersion)
        logger.info(`Launching Minecraft ${mcVersion} (requires Java ${javaReqs.min}-${javaReqs.max}, recommended: ${javaReqs.recommended})`)
        
        if (!javaExecutable) {
            throw new Error(`❌ CRITICAL: No Java executable configured for Minecraft ${mcVersion}. This should have been detected by landing.js.`)
        }
        
        // Validate Java version BEFORE launching
        const javaValidation = await JavaManager.validateJavaForMinecraft(javaExecutable, mcVersion)
        
        if (!javaValidation.compatible) {
            logger.error('❌ CRITICAL JAVA INCOMPATIBILITY DETECTED ❌')
            logger.error(`   Java: ${javaExecutable}`)
            logger.error(`   Version: Java ${javaValidation.majorVersion || 'unknown'}`)
            logger.error(`   Required: Java ${javaReqs.min}-${javaReqs.max} (recommended: ${javaReqs.recommended})`)
            logger.error(`   Minecraft: ${mcVersion}`)
            logger.error('   THIS SHOULD HAVE BEEN CAUGHT BY landing.js!')
            
            throw new Error(
                `Java ${javaValidation.majorVersion || 'unknown'} is NOT compatible with Minecraft ${mcVersion}.\n` +
                `Required: Java ${javaReqs.min}-${javaReqs.max} (recommended: Java ${javaReqs.recommended}).\n\n` +
                `Please go to Settings > Java and select a compatible Java version, or let the launcher download it automatically.`
            )
        }
        
        logger.info(`✅ Using Java ${javaValidation.majorVersion}: ${javaExecutable}`)
        logger.info(`   Validation: ${javaValidation.message}`)
        
        // Log loader detection (condensado)
        if (this.usingNeoForgeLoader || this.usingFabricLoader || this.usingQuiltLoader) {
            const loaders = []
            if (this.usingNeoForgeLoader) loaders.push('NeoForge')
            if (this.usingFabricLoader) loaders.push('Fabric')
            if (this.usingQuiltLoader) loaders.push('Quilt')
            logger.info(`Mod loaders detected: ${loaders.join(', ')}`)
        }
        
        // ✅ NEOFORGE: Ensure fml.toml exists with earlyWindowControl=false
        if (this.usingNeoForgeLoader) {
            this._ensureFmlToml()
        }

        // ✅ NEOFORGE CRITICAL FIX: Temporarily hide vanilla JAR AND ALL client-*.jar (except SRG)
        // NeoForge's MinecraftLocator automatically scans versions/<mcVersion>/<mcVersion>.jar
        // and libraryDirectory for JARs. These cause JPMS module conflicts (split packages).
        // Solution: physically rename (hide) ALL problematic JARs before launch, restore after close
        // This is the ONLY reliable way to prevent JPMS from discovering them.
        let vanillaJarPath = null
        let vanillaJarBackupPath = null
        const hiddenClientJars = []  // Array of {original, backup} paths for restoration
        
        if (this.usingNeoForgeLoader) {
            logger.info('=== NEOFORGE: HIDING JARS FROM JPMS ===')
            
            // Hide vanilla JAR
            vanillaJarPath = path.join(this.commonDir, 'versions', mcVersion, `${mcVersion}.jar`)
            vanillaJarBackupPath = path.join(this.commonDir, 'versions', mcVersion, `${mcVersion}.jar.neoforge_backup`)
            
            if (fs.existsSync(vanillaJarPath)) {
                logger.info(`  [1/1] Hiding vanilla JAR: ${mcVersion}.jar`)
                fs.renameSync(vanillaJarPath, vanillaJarBackupPath)
            }
            
            // Hide ALL client-*.jar files (except SRG) from libraryDirectory
            // This includes: client-*-extra.jar, client-*-slim.jar, and any future variants
            // ignoreList doesn't work - JPMS still discovers them in libraryDirectory
            // Physical hiding is the ONLY solution to prevent module conflicts
            if (this.neoForgeClientJarsToHide && this.neoForgeClientJarsToHide.length > 0) {
                logger.info(`  Hiding ${this.neoForgeClientJarsToHide.length} client JARs from ${path.basename(this.neoForgeClientJarsDirectory)}:`)
                
                this.neoForgeClientJarsToHide.forEach((jarName, idx) => {
                    const originalPath = path.join(this.neoForgeClientJarsDirectory, jarName)
                    const backupPath = path.join(this.neoForgeClientJarsDirectory, `${jarName}.neoforge_backup`)
                    
                    if (fs.existsSync(originalPath)) {
                        logger.info(`  [${idx + 1}/${this.neoForgeClientJarsToHide.length}] ${jarName}`)
                        fs.renameSync(originalPath, backupPath)
                        hiddenClientJars.push({ original: originalPath, backup: backupPath })
                    } else {
                        logger.warn(`  [${idx + 1}/${this.neoForgeClientJarsToHide.length}] ${jarName} (not found, skipping)`)
                    }
                })
                
                logger.info(`  ✅ Successfully hidden ${hiddenClientJars.length} client JARs`)
            }
            
            logger.info('=======================================')
        }

        // ✅ NEOFORGE: Verify fml.toml exists and log its content before spawning
        if (this.usingNeoForgeLoader) {
            const fmlTomlPath = path.join(this.gameDir, 'config', 'fml.toml')
            logger.info('=== NEOFORGE PRE-SPAWN VERIFICATION ===')
            if (fs.existsSync(fmlTomlPath)) {
                logger.info('  ✅ fml.toml exists')
                try {
                    const fmlContent = fs.readFileSync(fmlTomlPath, 'utf8')
                    const lines = fmlContent.split('\n').slice(0, 5) // First 5 lines
                    logger.info('  📄 fml.toml content (first 5 lines):')
                    lines.forEach((line, idx) => {
                        logger.info(`     ${idx + 1}: ${line}`)
                    })
                } catch (err) {
                    logger.warn(`  ⚠️ Could not read fml.toml: ${err.message}`)
                }
            } else {
                logger.warn('  ❌ fml.toml NOT FOUND!')
                logger.warn(`     Expected path: ${fmlTomlPath}`)
            }
            logger.info('========================================')
        }

        // ✅ CRITICAL VALIDATION v1.0.5: Detect and fix orphaned paired flags before spawn
        // This guard-rail prevents "--add-opens requires modules" Java errors
        const pairedFlagsToValidate = ['--add-opens', '--add-exports', '--add-reads', '--add-modules']
        const orphanedFlags = []
        
        for (let i = 0; i < args.length; i++) {
            const arg = args[i]
            if (typeof arg === 'string' && pairedFlagsToValidate.includes(arg)) {
                const nextArg = args[i + 1]
                // Check if next arg is missing, not a string, or is another flag
                if (!nextArg || typeof nextArg !== 'string' || nextArg.startsWith('-')) {
                    orphanedFlags.push({ index: i, flag: arg, nextArg: nextArg })
                }
            }
        }
        
        if (orphanedFlags.length > 0) {
            logger.error('=== ❌ CRITICAL: ORPHANED JVM FLAGS DETECTED ===')
            logger.error('The following paired flags have no valid value:')
            for (const orphan of orphanedFlags) {
                logger.error(`  [${orphan.index}] "${orphan.flag}" → next: ${JSON.stringify(orphan.nextArg)}`)
            }
            logger.error('')
            logger.error('This would cause Java to fail with:')
            logger.error('  "Error: --add-opens requires modules to be specified"')
            logger.error('')
            logger.error('FIXING: Removing orphaned flags from args array...')
            
            // Remove orphaned flags (iterate backwards to avoid index shifting)
            for (let i = orphanedFlags.length - 1; i >= 0; i--) {
                const idx = orphanedFlags[i].index
                const removed = args.splice(idx, 1)
                logger.error(`  Removed orphan at [${idx}]: "${removed[0]}"`)
            }
            
            logger.error('=== END ORPHAN FLAG FIX ===')
        }

        // 🔍 CRITICAL DEBUG: Log all args before spawn to identify malformed arguments
        logger.info('=== FINAL SPAWN ARGUMENTS DEBUG ===')
        logger.info(`Total args: ${args.length}`)
        
        // Check for problematic patterns
        const problematicArgs = []
        for (let i = 0; i < args.length; i++) {
            const arg = args[i]
            const argType = typeof arg
            const isArray = Array.isArray(arg)
            
            // Log every argument for debugging
            if (i < 20 || i > args.length - 20) {
                logger.info(`  [${i}] (${argType}${isArray ? '/array' : ''}) ${JSON.stringify(arg).substring(0, 100)}`)
            }
            
            // Detect problematic patterns
            if (argType !== 'string') {
                problematicArgs.push({ index: i, type: argType, value: arg })
            } else if (arg.includes('java.base') && !arg.startsWith('--add-opens') && !arg.startsWith('--add-exports')) {
                // This might be a malformed --add-opens argument
                logger.error(`  ⚠️ SUSPICIOUS ARG at [${i}]: ${arg}`)
                problematicArgs.push({ index: i, type: 'suspicious-java.base', value: arg })
            }
        }
        
        if (problematicArgs.length > 0) {
            logger.error(`=== ${problematicArgs.length} PROBLEMATIC ARGUMENTS DETECTED ===`)
            for (const p of problematicArgs) {
                logger.error(`  [${p.index}] type=${p.type}, value=${JSON.stringify(p.value)}`)
            }
            logger.error('===========================================')
        }
        
        logger.info('=== END SPAWN ARGUMENTS DEBUG ===')

        // ============================================================
        // CustomSkinLoader Setup (skins para singleplayer)
        // Se ejecuta async pero no bloquea el lanzamiento.
        // La primera vez descargará el mod, luego solo actualizará config.
        // ============================================================
        const modLoaderType = this._getModLoaderType()
        const cslUsername = this.authUser.displayName || this.authUser.username || 'Player'
        
        if (modLoaderType !== 'vanilla' && this.authUser.type === 'tecniland') {
            logger.info(`[CSL] Preparing CustomSkinLoader for ${mcVersion} (${modLoaderType})`)
            
            // Fire and forget: no bloquea el spawn
            CustomSkinLoaderManager.setupForInstance(this.gameDir, mcVersion, modLoaderType, cslUsername)
                .then(success => {
                    if (success) {
                        logger.info('[CSL] CustomSkinLoader ready - skins will load on next world entry')
                    }
                })
                .catch(err => {
                    logger.warn(`[CSL] Setup failed (non-blocking): ${err.message}`)
                })
        } else {
            if (modLoaderType === 'vanilla') {
                logger.info('[CSL] Skipped: Vanilla instance (no mod loader)')
            } else if (this.authUser.type !== 'tecniland') {
                logger.info('[CSL] Skipped: Not using TECNILAND account')
            }
        }

        const child = child_process.spawn(javaExecutable, args, {
            cwd: this.gameDir,
            detached: ConfigManager.getLaunchDetached()
        })

        if(ConfigManager.getLaunchDetached()){
            child.unref()
        }

        child.stdout.setEncoding('utf8')
        child.stderr.setEncoding('utf8')

        const logFile = path.join(this.commonDir, 'logs', 'minecraft-launch.log')
        fs.ensureDirSync(path.dirname(logFile))
        const logStream = fs.createWriteStream(logFile, { flags: 'w' })

        child.stdout.on('data', (data) => {
            logStream.write('[STDOUT] ' + data)
            data.trim().split('\n').forEach(x => console.log(`\x1b[32m[Minecraft]\x1b[0m ${x}`))
            
        })
        child.stderr.on('data', (data) => {
            logStream.write('[STDERR] ' + data)
            data.trim().split('\n').forEach(x => console.log(`\x1b[31m[Minecraft]\x1b[0m ${x}`))
        })
        child.on('close', (code, signal) => {
            logStream.end()
            logger.info('Exited with code', code)
            
            // ✅ Restore vanilla JAR and ALL hidden client JARs after NeoForge closes
            if (this.usingNeoForgeLoader) {
                logger.info('=== NEOFORGE: RESTORING HIDDEN JARS ===')
                let restoredCount = 0
                
                // Restore vanilla JAR
                if (vanillaJarBackupPath && fs.existsSync(vanillaJarBackupPath)) {
                    logger.info(`  [1] Restoring vanilla JAR: ${mcVersion}.jar`)
                    fs.renameSync(vanillaJarBackupPath, vanillaJarPath)
                    restoredCount++
                }
                
                // Restore ALL client JARs (in reverse order for safety)
                if (hiddenClientJars.length > 0) {
                    logger.info(`  Restoring ${hiddenClientJars.length} client JARs:`)
                    
                    for (let i = hiddenClientJars.length - 1; i >= 0; i--) {
                        const { original, backup } = hiddenClientJars[i]
                        if (fs.existsSync(backup)) {
                            logger.info(`  [${hiddenClientJars.length - i}/${hiddenClientJars.length}] ${path.basename(original)}`)
                            fs.renameSync(backup, original)
                            restoredCount++
                        } else {
                            logger.warn(`  [${hiddenClientJars.length - i}/${hiddenClientJars.length}] ${path.basename(backup)} not found`)
                        }
                    }
                }
                
                logger.info(`  ✅ Successfully restored ${restoredCount} JARs`)
                logger.info('=======================================')
            }
            
            fs.remove(tempNativePath, (err) => {
                if(err){
                    logger.warn('Error while deleting temp dir', err)
                } else {
                    logger.info('Temp dir deleted successfully.')
                }
            })
        })

        return child
    }

    /**
     * Get the platform specific classpath separator. On windows, this is a semicolon.
     * On Unix, this is a colon.
     * 
     * @returns {string} The classpath separator for the current operating system.
     */
    static getClasspathSeparator() {
        return process.platform === 'win32' ? ';' : ':'
    }

    /**
     * Get the JPMS module name from a JAR file.
     * Tries Automatic-Module-Name from manifest first, then derives from filename.
     * 
     * @param {string} jarPath - Absolute path to JAR file
     * @returns {string|null} Module name or null if cannot be determined
     */
    _getJarModuleName(jarPath) {
        try {
            if (!fs.existsSync(jarPath)) {
                return null
            }

            // Try reading manifest Automatic-Module-Name
            const zip = new AdmZip(jarPath)
            const manifestEntry = zip.getEntry('META-INF/MANIFEST.MF')
            
            if (manifestEntry) {
                const manifestContent = zip.readAsText(manifestEntry)
                const match = manifestContent.match(/Automatic-Module-Name:\s*([^\r\n]+)/)
                if (match) {
                    return match[1].trim()
                }
            }

            // Fallback: derive from filename (remove version, .jar, replace - with .)
            // e.g., "client-1.20.4-20231207.154220-srg.jar" -> "client"
            const basename = path.basename(jarPath, '.jar')
            // Remove version patterns
            const withoutVersion = basename.replace(/-\d+\.\d+.*$/, '')
            return withoutVersion || basename

        } catch (error) {
            logger.warn(`Failed to get module name from ${path.basename(jarPath)}: ${error.message}`)
            return null
        }
    }

    /**
     * Determine if an optional mod is enabled from its configuration value. If the
     * configuration value is null, the required object will be used to
     * determine if it is enabled.
     * 
     * A mod is enabled if:
     *   * The configuration is not null and one of the following:
     *     * The configuration is a boolean and true.
     *     * The configuration is an object and its 'value' property is true.
     *   * The configuration is null and one of the following:
     *     * The required object is null.
     *     * The required object's 'def' property is null or true.
     * 
     * @param {Object | boolean} modCfg The mod configuration object.
     * @param {Object} required Optional. The required object from the mod's distro declaration.
     * @returns {boolean} True if the mod is enabled, false otherwise.
     */
    static isModEnabled(modCfg, required = null){
        return modCfg != null ? ((typeof modCfg === 'boolean' && modCfg) || (typeof modCfg === 'object' && (typeof modCfg.value !== 'undefined' ? modCfg.value : true))) : required != null ? required.def : true
    }

    /**
     * Deduplicate JVM arguments by key. Keeps first occurrence.
     * Key is extracted from -Dkey=value or the entire arg if no = sign.
     * 
     * CRITICAL: For paired args like --add-opens and --add-exports:
     * - They are NOT deduplicated as they can have multiple values
     * - Full "flag+value" pairs are deduplicated (e.g., "--add-opens java.base/x=y")
     * 
     * @param {Array<string>} args Array of JVM arguments
     * @returns {Array<string>} Deduplicated array
     */
    _deduplicateJvmArgs(args) {
        const seen = new Set()
        const pairedArgsSeen = new Set() // For --add-opens/--add-exports full pairs
        const result = []
        
        // Paired flags that can appear multiple times with different values
        const pairedFlags = new Set(['--add-opens', '--add-exports', '--add-reads', '--add-modules'])
        
        for (let i = 0; i < args.length; i++) {
            const arg = args[i]
            
            // Skip invalid args (not string or empty)
            if (typeof arg !== 'string' || !arg.trim()) {
                logger.warn(`Invalid JVM arg detected (type: ${typeof arg}): ${JSON.stringify(arg)} - skipping`)
                continue
            }
            
            // Check if this is a paired flag (--add-opens, --add-exports, etc.)
            if (pairedFlags.has(arg)) {
                // Look ahead for the value
                const nextArg = args[i + 1]
                if (nextArg && typeof nextArg === 'string' && !nextArg.startsWith('-')) {
                    // Deduplicate by full pair: "--add-opens java.base/x=y"
                    const pairKey = `${arg} ${nextArg}`
                    if (!pairedArgsSeen.has(pairKey)) {
                        pairedArgsSeen.add(pairKey)
                        result.push(arg)
                        result.push(nextArg)
                    } else {
                        logger.debug(`Duplicate paired arg: ${pairKey} (skipping)`)
                    }
                    i++ // Skip the value we just processed
                } else {
                    // Orphan flag without value - this is an ERROR state
                    logger.error(`CRITICAL: Orphan paired flag detected: "${arg}" at index ${i} without value (next: "${nextArg}")`)
                    // Don't push orphan flags - they break Java
                }
                continue
            }
            
            // Regular args: Extract key: -Dkey=value → -Dkey, -Xmx4G → -Xmx
            let key
            if (arg.startsWith('-D') && arg.includes('=')) {
                key = arg.split('=')[0]
            } else if (arg.startsWith('-X') && arg.length > 2) {
                // -Xmx4G → -Xmx, -Xms2G → -Xms
                const match = arg.match(/^(-X[a-z]+)/i)
                key = match ? match[1] : arg
            } else {
                key = arg
            }
            
            if (seen.has(key)) {
                logger.debug(`Duplicate JVM arg detected: ${key} (keeping first occurrence)`)
                continue
            }
            
            seen.add(key)
            result.push(arg)
        }
        
        return result
    }

    /**
     * Sanitize JVM args for logging (redact sensitive values).
     * 
     * @param {Array<string>} args Array of JVM arguments
     * @returns {Array<string>} Sanitized args for logging
     */
    _sanitizeArgsForLogging(args) {
        return args.map(arg => {
            const lower = arg.toLowerCase()
            if (lower.includes('token') || lower.includes('password') || 
                lower.includes('secret') || lower.includes('auth')) {
                const key = arg.split('=')[0]
                return `${key}=***REDACTED***`
            }
            return arg
        })
    }

    /**
     * ✅ CRITICAL FIX v1.0.5: Process Forge JVM args correctly
     * 
     * Forge sends JVM args as a FLAT string array:
     *   ["--add-opens", "java.base/x=cpw", "java.base/y=cpw", "--add-exports", "java.base/z=cpw"]
     * 
     * Java requires EACH value to have its own flag:
     *   --add-opens java.base/x=cpw --add-opens java.base/y=cpw --add-exports java.base/z=cpw
     * 
     * Previous bug (v1.0.4): Pushed flag when first seen AND before each value = DUPLICATE FLAGS
     * 
     * This fix: Only push flag+value PAIRS. The flag is NOT pushed when first seen,
     * it's only pushed when we have a value to pair it with.
     * 
     * @param {Array} jvmArgs - Raw JVM args from modManifest.arguments.jvm
     * @param {Set<string>} pairedFlags - Flags that require a following value (--add-opens, etc.)
     * @returns {Array<string>} Correctly formatted JVM args
     */
    _processForgeJvmArgs(jvmArgs, pairedFlags) {
        const result = []
        let currentFlag = null // Track the current paired flag
        
        const processArg = (rawArg) => {
            if (typeof rawArg !== 'string') return
            
            // Replace placeholders
            const arg = rawArg
                .replaceAll('${library_directory}', this.libPath)
                .replaceAll('${classpath_separator}', ProcessBuilder.getClasspathSeparator())
                .replaceAll('${version_name}', this.modManifest.id)
            
            // Check if this is a paired flag (--add-opens, --add-exports, etc.)
            if (pairedFlags.has(arg)) {
                // Remember this flag for the next value(s)
                // DO NOT push it yet - only push when we have the value
                currentFlag = arg
                logger.debug(`  FORGE ARG: Remembered flag "${arg}" for pairing`)
                return
            }
            
            // Check if this is another flag (starts with -)
            if (arg.startsWith('-')) {
                // This is a non-paired flag or the start of a new sequence
                // Reset currentFlag and push this arg directly
                currentFlag = null
                result.push(arg)
                logger.debug(`  FORGE ARG: Regular flag "${arg}"`)
                return
            }
            
            // This is a value (doesn't start with -)
            if (currentFlag) {
                // We have a pending paired flag - push flag+value
                result.push(currentFlag)
                result.push(arg)
                logger.debug(`  FORGE ARG: Pair "${currentFlag}" + "${arg}"`)
                // Keep currentFlag for next value (Forge may send multiple values per flag)
            } else {
                // Value without a paired flag - push as-is (unusual but handle it)
                result.push(arg)
                logger.debug(`  FORGE ARG: Standalone value "${arg}"`)
            }
        }
        
        // Process all args
        for (const argItem of jvmArgs) {
            if (Array.isArray(argItem)) {
                // Handle nested arrays (legacy format)
                for (const subArg of argItem) {
                    processArg(subArg)
                }
            } else if (typeof argItem === 'string') {
                processArg(argItem)
            }
            // Skip objects with rules - they're processed elsewhere
        }
        
        // Check for orphaned flag at the end
        if (currentFlag) {
            logger.warn(`  FORGE ARG: Orphaned flag "${currentFlag}" at end of array (no value followed)`)
            // Don't push orphaned flags - they break Java
        }
        
        return result
    }

    /**
     * Log and merge custom JVM arguments (global + legacy per-installation).
     * Includes deduplication and sanitization.
     * 
     * @param {Array<string>} baseArgs Base JVM args array
     * @param {string} serverId Server/installation ID
     * @returns {Array<string>} Args with custom JVM args merged
     */
    _mergeCustomJvmArgs(baseArgs, serverId) {
        let args = [...baseArgs]
        
        // Get global JVM args (new preferred method)
        const globalArgs = ConfigManager.getGlobalJVMOptions()
        
        // Get legacy per-installation args (if any)
        const legacyArgs = ConfigManager.getJVMOptions(serverId)
        
        // Merge: global + legacy
        const customArgs = [...globalArgs, ...legacyArgs]
        
        if (customArgs.length > 0) {
            logger.info('=== CUSTOM JVM ARGS ===')
            logger.info(`  Global args: ${globalArgs.length}`)
            if (legacyArgs.length > 0) {
                logger.warn(`  Legacy per-installation args: ${legacyArgs.length} (deprecated)`)
            }
            logger.info(`  Total custom args: ${customArgs.length}`)
            
            // Sanitize for logging
            const safeArgs = this._sanitizeArgsForLogging(customArgs)
            logger.info(`  Args: ${safeArgs.join(' ')}`)
            logger.info('=======================')
            
            // Add custom args to base
            args = args.concat(customArgs)

            // Deduplicate
            args = this._deduplicateJvmArgs(args)
        }

        return args
    }

    /**
     * Cap off-heap (direct) memory used by Netty.
     *
     * By default the JVM sets MaxDirectMemorySize == -Xmx. With a large heap
     * (e.g. 8.5G) Netty's pooled allocator sizes its arenas relative to that
     * huge ceiling and never releases them under sustained multiplayer packet
     * load, leading to:
     *   "OutOfMemoryError: Cannot reserve N bytes of direct buffer memory"
     * after ~20 min in-server. Heap stays healthy so it looks like a leak.
     *
     * Capping direct memory forces buffer reuse and bounds off-heap growth.
     * We only inject the cap if the user (or modManifest) hasn't set one, so
     * advanced users keep full control.
     *
     * @param {Array<string>} args Final JVM args array
     * @returns {Array<string>} args with a direct-memory cap if none present
     */
    _applyDirectMemoryCap(args) {
        const hasCap = args.some(a => typeof a === 'string' && a.startsWith('-XX:MaxDirectMemorySize'))
        if (hasCap) {
            logger.info('MaxDirectMemorySize already set by user/manifest; leaving as-is.')
            return args
        }
        const cap = '-XX:MaxDirectMemorySize=2G'
        args.push(cap)
        logger.info(`Injected ${cap} to bound Netty off-heap memory (prevents direct-buffer OOM).`)
        return args
    }

    /**
     * Function which performs a preliminary scan of the top level
     * mods. If liteloader is present here, we setup the special liteloader
     * launch options. Note that liteloader is only allowed as a top level
     * mod. It must not be declared as a submodule.
     */
    setupLiteLoader(){
        // Validar que modules existe y tiene elementos
        if(!this.server.modules || this.server.modules.length === 0){
            return
        }
        
        for(let ll of this.server.modules){
            // Para instalaciones custom, los módulos son objetos planos sin rawModule
            const moduleType = ll.rawModule ? ll.rawModule.type : ll.type
            
            if(moduleType === Type.LiteLoader){
                // Para módulos de distribución (con rawModule)
                if(ll.rawModule) {
                    if(!ll.getRequired().value){
                        const modCfg = ConfigManager.getModConfiguration(this.server.rawServer.id).mods
                        if(ProcessBuilder.isModEnabled(modCfg[ll.getVersionlessMavenIdentifier()], ll.getRequired())){
                            if(fs.existsSync(ll.getPath())){
                                this.usingLiteLoader = true
                                this.llPath = ll.getPath()
                            }
                        }
                    } else {
                        if(fs.existsSync(ll.getPath())){
                            this.usingLiteLoader = true
                            this.llPath = ll.getPath()
                        }
                    }
                }
                // Para instalaciones custom, LiteLoader no está soportado aún
            }
        }
    }

    /**
     * Resolve an array of all enabled mods. These mods will be constructed into
     * a mod list format and enabled at launch.
     * 
     * @param {Object} modCfg The mod configuration object.
     * @param {Array.<Object>} mdls An array of modules to parse.
     * @returns {{fMods: Array.<Object>, lMods: Array.<Object>}} An object which contains
     * a list of enabled forge mods and litemods.
     */
    /**
     * Normalizar módulo: soporta tanto objetos con métodos (helios-core) como objetos planos (custom installations)
     * @param {Object} mdl - Módulo a normalizar
     * @returns {Object} Módulo normalizado con propiedades consistentes
     */
    _normalizeModule(mdl) {
        // Si el módulo tiene métodos (helios-core DistroModule), usarlos
        if (typeof mdl.getRequired === 'function') {
            // Intentar obtener versionlessMavenId de forma segura
            let versionlessMavenId = null
            try {
                versionlessMavenId = mdl.getVersionlessMavenIdentifier()
            } catch (e) {
                // Algunos módulos no tienen componentes maven válidos
                logger.debug(`Module doesn't have valid maven identifier: ${e.message}`)
            }
            
            return {
                type: mdl.rawModule ? mdl.rawModule.type : mdl.type,
                required: mdl.getRequired(),
                versionlessMavenId: versionlessMavenId,
                subModules: mdl.subModules || [],
                original: mdl,
                source: 'helios-core'
            }
        }
        
        // Si es objeto plano (custom installation), adaptarlo
        if (mdl.type) {
            return {
                type: mdl.type,
                required: mdl.required || { value: true, def: true },
                versionlessMavenId: mdl.id ? mdl.id.split(':').slice(0, 2).join(':') : null,
                subModules: [],
                original: mdl,
                source: 'plain-object'
            }
        }
        
        // Fallback: objeto desconocido
        logger.warn('Unknown module format:', mdl)
        return {
            type: 'Unknown',
            required: { value: false, def: false },
            versionlessMavenId: null,
            subModules: [],
            original: mdl,
            source: 'unknown'
        }
    }

    resolveModConfiguration(modCfg, mdls){
        let fMods = []  // Game mods (archivos reales: drop-ins, optional, required)
        let lMods = []  // LiteMods
        let loaderMods = []  // Loader modules (Fabric, Quilt, Forge metadata - NO son archivos)

        for(let mdl of mdls){
            // Normalizar módulo para soportar ambos formatos
            const normalized = this._normalizeModule(mdl)
            const type = normalized.type
            
            logger.debug(`Resolving mod: type=${type}, source=${normalized.source}, id=${normalized.versionlessMavenId || 'none'}`)
            
            // Identificar loader modules vs game mods
            const isLoaderModule = type === 'FabricMod' || type === 'QuiltMod' || type === Type.ForgeHosted || type === Type.Fabric
            const isGameMod = type === Type.ForgeMod || type === Type.FabricMod  // Type.FabricMod es diferente de 'FabricMod'
            const isLiteMod = type === Type.LiteMod || type === Type.LiteLoader
            
            if(isLoaderModule || isGameMod || isLiteMod){
                const o = !normalized.required.value
                const e = normalized.versionlessMavenId 
                    ? ProcessBuilder.isModEnabled(modCfg[normalized.versionlessMavenId], normalized.required)
                    : true
                
                if(!o || (o && e)){
                    // Procesar submódulos si existen (solo para helios-core modules)
                    if(normalized.subModules.length > 0 && normalized.versionlessMavenId && modCfg[normalized.versionlessMavenId]){
                        const v = this.resolveModConfiguration(
                            modCfg[normalized.versionlessMavenId].mods, 
                            normalized.subModules
                        )
                        fMods = fMods.concat(v.fMods)
                        lMods = lMods.concat(v.lMods)
                        loaderMods = loaderMods.concat(v.loaderMods)
                        if(type === Type.LiteLoader){
                            continue
                        }
                    }
                    
                    // Categorizar: loader module vs game mod
                    if(isLoaderModule){
                        logger.debug(`  → Classified as LOADER module: ${normalized.versionlessMavenId || type}`)
                        loaderMods.push(mdl)
                    } else if(isGameMod){
                        logger.debug(`  → Classified as GAME mod: ${normalized.versionlessMavenId || type}`)
                        fMods.push(mdl)
                    } else if(isLiteMod){
                        logger.debug(`  → Classified as LITE mod: ${normalized.versionlessMavenId || type}`)
                        lMods.push(mdl)
                    }
                }
            }
        }

        logger.debug(`Resolved mods: gameMods=${fMods.length}, liteMods=${lMods.length}, loaderMods=${loaderMods.length}`)

        return {
            fMods,      // Game mods (con archivos)
            lMods,      // LiteMods
            loaderMods  // Loader modules (metadata)
        }
    }

    _lteMinorVersion(version) {
        return Number(this.modManifest.id.split('-')[0].split('.')[1]) <= Number(version)
    }

    /**
     * Test to see if this version of forge requires the absolute: prefix
     * on the modListFile repository field.
     */
    _requiresAbsolute(){
        try {
            if(this._lteMinorVersion(9)) {
                return false
            }
            const ver = this.modManifest.id.split('-')[2]
            const pts = ver.split('.')
            const min = [14, 23, 3, 2655]
            for(let i=0; i<pts.length; i++){
                const parsed = Number.parseInt(pts[i])
                if(parsed < min[i]){
                    return false
                } else if(parsed > min[i]){
                    return true
                }
            }
        } catch (err) {
            // We know old forge versions follow this format.
            // Error must be caused by newer version.
        }
        
        // Equal or errored
        return true
    }

    /**
     * Construct a mod list json object.
     * 
     * @param {'forge' | 'liteloader'} type The mod list type to construct.
     * @param {Array.<Object>} mods An array of mods to add to the mod list.
     * @param {boolean} save Optional. Whether or not we should save the mod list file.
     */
    constructJSONModList(type, mods, save = false){
        const modList = {
            repositoryRoot: ((type === 'forge' && this._requiresAbsolute()) ? 'absolute:' : '') + path.join(this.commonDir, 'modstore')
        }

        const ids = []
        if(type === 'forge'){
            for(let mod of mods){
                ids.push(mod.getExtensionlessMavenIdentifier())
            }
        } else {
            for(let mod of mods){
                ids.push(mod.getMavenIdentifier())
            }
        }
        modList.modRef = ids
        
        if(save){
            const json = JSON.stringify(modList, null, 4)
            fs.writeFileSync(type === 'forge' ? this.fmlDir : this.llDir, json, 'UTF-8')
        }

        return modList
    }

    /**
     * Helper para obtener ruta de un mod de forma segura
     * @param {Object} mod - Módulo del cual obtener la ruta
     * @returns {string|null} Ruta del mod o null si no puede resolverse
     */
    _getModPath(mod) {
        // Método 1: helios-core DistroModule con método getPath()
        if (typeof mod.getPath === 'function') {
            return mod.getPath()
        }
        
        // Método 2: objeto plano con propiedad 'path'
        if (mod.path && typeof mod.path === 'string') {
            return mod.path
        }
        
        // Método 3: objeto plano con propiedad 'file'
        if (mod.file && typeof mod.file === 'string') {
            return mod.file
        }
        
        // Método 4: artifact.path (estructura de distro)
        if (mod.artifact && mod.artifact.path) {
            return mod.artifact.path
        }
        
        // No se pudo resolver
        return null
    }
    
    /**
     * Validar que un mod tenga ruta válida o lanzar error con contexto
     * @param {Object} mod - Módulo a validar
     * @param {number} index - Índice del mod en el array
     * @throws {Error} Si el mod no tiene ruta y es un loader module (bug de flujo)
     */
    _validateModPath(mod, index) {
        const path = this._getModPath(mod)
        
        if (!path) {
            // Detectar si es un loader module (bug de flujo)
            const type = mod.type || (mod.rawModule ? mod.rawModule.type : 'unknown')
            const isLoaderModule = type === 'FabricMod' || type === 'QuiltMod' || 
                                   type === Type.ForgeHosted || type === Type.Fabric
            
            if (isLoaderModule) {
                // Esto es un BUG: loader modules no deberían llegar aquí
                throw new Error(
                    `FLOW BUG: Loader module '${mod.id || mod.name || 'unknown'}' (type=${type}) ` +
                    `passed to constructModList() at index ${index}. ` +
                    'Loader modules are metadata only and should NOT be in game mods list. ' +
                    'This is a bug in resolveModConfiguration() separation logic.'
                )
            }
            
            // Es un mod real pero sin ruta (configuración inválida)
            throw new Error(
                `Cannot resolve path for mod at index ${index}: ` +
                `id=${mod.id || 'unknown'}, type=${type}, name=${mod.name || 'unknown'}. ` +
                `Mod object: ${JSON.stringify(Object.keys(mod))}`
            )
        }
        
        return path
    }

    /**
     * Construct the mod argument list for forge 1.13 and Fabric
     * 
     * @param {Array.<Object>} mods An array of mods to add to the mod list.
     */
    constructModList(mods) {
        // Log detallado de input para debugging
        logger.debug('constructModList input:', mods.map((m, idx) => ({
            index: idx,
            keys: Object.keys(m),
            hasGetPath: typeof m.getPath === 'function',
            type: m.type || (m.rawModule ? m.rawModule.type : 'unknown'),
            id: m.id || m.name || 'unknown'
        })))
        
        // Validar que no haya loader modules aquí (deberían estar separados)
        const loaderModulesFound = mods.filter(m => {
            const type = m.type || (m.rawModule ? m.rawModule.type : null)
            return type === 'FabricMod' || type === 'QuiltMod'
        })
        
        if (loaderModulesFound.length > 0) {
            logger.error(
                `CRITICAL: Found ${loaderModulesFound.length} loader module(s) in constructModList input. ` +
                'This is a flow bug - loader modules should be separated. ' +
                `IDs: ${loaderModulesFound.map(m => m.id || m.name).join(', ')}`
            )
        }
        
        const writeBuffer = mods.map((mod, index) => {
            if (this.usingFabricLoader || this.usingQuiltLoader || this.usingNeoForgeLoader) {
                // Fabric/Quilt/NeoForge: necesita ruta completa al archivo
                return this._validateModPath(mod, index)
            } else {
                // Forge: necesita Maven identifier
                if (typeof mod.getExtensionlessMavenIdentifier === 'function') {
                    return mod.getExtensionlessMavenIdentifier()
                }
                // Fallback para objetos planos
                if (mod.id) {
                    return mod.id.split(':').slice(0, 2).join(':')
                }
                throw new Error(
                    `Cannot resolve Maven identifier for Forge mod at index ${index}: ` +
                    `${JSON.stringify(Object.keys(mod))}`
                )
            }
        }).join('\n')

        if(writeBuffer) {
            fs.writeFileSync(this.forgeModListFile, writeBuffer, 'UTF-8')
            return this.usingFabricLoader || this.usingQuiltLoader || this.usingNeoForgeLoader ? [
                '--fabric.addMods',
                `@${this.forgeModListFile}`
            ] : [
                '--fml.mavenRoots',
                path.join('..', '..', 'common', 'modstore'),
                '--fml.modLists',
                this.forgeModListFile
            ]
        } else {
            return []
        }

    }

    _processAutoConnectArg(args){
        if(ConfigManager.getAutoConnect() && this.server.rawServer.autoconnect){
            if(mcVersionAtLeast('1.20', this.server.rawServer.minecraftVersion)){
                args.push('--quickPlayMultiplayer')
                args.push(`${this.server.hostname}:${this.server.port}`)
            } else {
                args.push('--server')
                args.push(this.server.hostname)
                args.push('--port')
                args.push(this.server.port)
            }
        }
    }

    /**
     * Construct the argument array that will be passed to the JVM process.
     * 
     * @param {Array.<Object>} mods An array of enabled mods which will be launched with this process.
     * @param {string} tempNativePath The path to store the native libraries.
     * @returns {Array.<string>} An array containing the full JVM arguments for this process.
     */
    constructJVMArguments(mods, tempNativePath){
        if(mcVersionAtLeast('1.13', this.server.rawServer.minecraftVersion)){
            return this._constructJVMArguments113(mods, tempNativePath)
        } else {
            return this._constructJVMArguments112(mods, tempNativePath)
        }
    }

    /**
     * Construct the argument array that will be passed to the JVM process.
     * This function is for 1.12 and below.
     * 
     * @param {Array.<Object>} mods An array of enabled mods which will be launched with this process.
     * @param {string} tempNativePath The path to store the native libraries.
     * @returns {Array.<string>} An array containing the full JVM arguments for this process.
     */
    _constructJVMArguments112(mods, tempNativePath){

        let args = []

        // ✅ TECNILAND AUTH: Add authlib-injector args for TECNILAND accounts
        // These must be added FIRST before any other JVM arguments
        const tecnilandAuthArgs = this._getTecnilandAuthArgs()
        args.push(...tecnilandAuthArgs)

        // Classpath Argument
        args.push('-cp')
        args.push(this.classpathArg(mods, tempNativePath).join(ProcessBuilder.getClasspathSeparator()))

        // ✅ Merge modManifest JVM args (Fabric/Quilt for old MC versions)
        if(this.modManifest !== this.vanillaManifest && this.modManifest.arguments && this.modManifest.arguments.jvm != null && !this.usingOptiFine) {
            logger.info('=== MERGING MOD LOADER JVM ARGS (1.12) ===')
            
            // ✅ CRITICAL FIX v1.0.5: Correct handling of Forge's FLAT string array format
            // Forge sends: ["--add-opens", "val1", "val2", "--add-exports", "val3"]
            // Java requires: --add-opens val1 --add-opens val2 --add-exports val3
            // 
            // FIX: Do NOT push flag when first seen. Only push flag+value PAIRS.
            // Previous bug: pushed flag twice (once when seen, once before value)
            const pairedFlags = new Set(['--add-opens', '--add-exports', '--add-reads', '--add-modules', '-p', '--module-path'])
            const processedJvmArgs = this._processForgeJvmArgs(this.modManifest.arguments.jvm, pairedFlags)
            
            for (const arg of processedJvmArgs) {
                args.push(arg)
            }
            
            logger.info(`  ✅ Merged ${processedJvmArgs.length} JVM args from modManifest.arguments.jvm`)
        }

        // Java Arguments
        if(process.platform === 'darwin'){
            args.push('-Xdock:name=TECNILAND Nexus')
            args.push('-Xdock:icon=' + path.join(__dirname, '..', 'images', 'minecraft.icns'))
        }
        args.push('-Xmx' + ConfigManager.getMaxRAM(this.server.rawServer.id))
        args.push('-Xms' + ConfigManager.getMinRAM(this.server.rawServer.id))
        
        // Merge custom JVM args (global + legacy) with deduplication
        args = this._mergeCustomJvmArgs(args, this.server.rawServer.id)

        // Bound off-heap memory (fixes direct-buffer OOM on high-RAM configs)
        args = this._applyDirectMemoryCap(args)

        args.push('-Djava.library.path=' + tempNativePath)

        // ✅ NEOFORGE: Add JVM argument to disable early progress window (fallback to fml.toml)
        if (this.usingNeoForgeLoader) {
            args.push('-Dfml.earlyprogresswindow=false')
            logger.info('=== NEOFORGE JVM ARG ===')
            logger.info('  ✅ Added: -Dfml.earlyprogresswindow=false')
            logger.info('     This is a fallback to fml.toml earlyWindowControl')
            logger.info('========================')
        }

        // Main Java Class
        args.push(this.modManifest.mainClass)

        // Forge Arguments
        args = args.concat(this._resolveForgeArgs())

        return args
    }

    /**
     * Construct the argument array that will be passed to the JVM process.
     * This function is for 1.13+
     * 
     * Note: Required Libs https://github.com/MinecraftForge/MinecraftForge/blob/af98088d04186452cb364280340124dfd4766a5c/src/fmllauncher/java/net/minecraftforge/fml/loading/LibraryFinder.java#L82
     * 
     * @param {Array.<Object>} mods An array of enabled mods which will be launched with this process.
     * @param {string} tempNativePath The path to store the native libraries.
     * @returns {Array.<string>} An array containing the full JVM arguments for this process.
     */
    _constructJVMArguments113(mods, tempNativePath){

        const argDiscovery = /\${*(.*)}/

        // JVM Arguments First
        // ✅ CRITICAL FIX: Deep copy the vanilla manifest JVM args to avoid modifying the original
        // The vanilla manifest may be reused across multiple launches, and modifying it directly
        // causes accumulated corruption of the arguments array
        let args = JSON.parse(JSON.stringify(this.vanillaManifest.arguments.jvm))

        // ✅ TECNILAND AUTH: Add authlib-injector args for TECNILAND accounts
        // These must be added FIRST before any other JVM arguments
        const tecnilandAuthArgs = this._getTecnilandAuthArgs()
        args.unshift(...tecnilandAuthArgs)

        // Debug securejarhandler
        // args.push('-Dbsl.debug=true')

        // Solo agregar argumentos JVM del modManifest si es diferente de vanillaManifest
        // (es decir, si hay un mod loader como Forge/Fabric/Quilt, pero NO OptiFine)
        // OptiFine no necesita argumentos JVM especiales
        if(this.modManifest !== this.vanillaManifest && this.modManifest.arguments && this.modManifest.arguments.jvm != null && !this.usingOptiFine) {
            logger.info('=== MERGING MOD LOADER JVM ARGS (1.13+) ===')
            
            // ✅ CRITICAL FIX v1.0.5: Correct handling of Forge's FLAT string array format
            // Forge sends: ["--add-opens", "val1", "val2", "--add-exports", "val3"]
            // Java requires: --add-opens val1 --add-opens val2 --add-exports val3
            // 
            // FIX: Do NOT push flag when first seen. Only push flag+value PAIRS.
            // Previous bug: pushed flag twice (once when seen, once before value)
            const pairedFlags = new Set(['--add-opens', '--add-exports', '--add-reads', '--add-modules', '-p', '--module-path'])
            const processedJvmArgs = this._processForgeJvmArgs(this.modManifest.arguments.jvm, pairedFlags)
            
            for (const arg of processedJvmArgs) {
                args.push(arg)
            }
            
            logger.info(`  ✅ Merged ${processedJvmArgs.length} JVM args from modManifest.arguments.jvm`)
        }
        
        // ✅ NEOFORGE CRITICAL FIX: Do NOT add SRG JAR to module path
        // Problem: Adding SRG JAR creates JPMS module 'client', but NeoForge/ModLauncher already
        // creates module 'minecraft'. This causes ResolutionException (split-packages conflict).
        // Solution: Let NeoForge/ModLauncher handle the SRG JAR automatically via its internal
        // class loading mechanisms. Physical hiding of vanilla.jar + client-*-extra/slim is still
        // needed to prevent MinecraftLocator from discovering them.
        if (this.usingNeoForgeLoader && this.neoForgeSrgJarPath) {
            logger.info('=== NEOFORGE: MODULE PATH HANDLING ===')
            logger.info('  ✅ SRG JAR located: ' + path.basename(this.neoForgeSrgJarPath))
            logger.info('  ℹ️  NOT adding SRG to module path (-p) to avoid client vs minecraft conflict')
            logger.info('  ℹ️  NeoForge/ModLauncher will load SRG JAR automatically via internal mechanisms')
            
            // 🚧 ALTERNATIVE (if ClassNotFoundException occurs): Uncomment this to use --patch-module
            // This patches the minecraft module with SRG classes without creating a separate module
            /*
            logger.info('  ➕ Using --patch-module to inject SRG classes into minecraft module')
            const patchModuleArg = `--patch-module`
            const patchModuleValue = `minecraft=${this.neoForgeSrgJarPath}`
            
            // Insert before main class
            const mainClassIndex = args.indexOf(this.modManifest.mainClass)
            if (mainClassIndex !== -1) {
                args.splice(mainClassIndex, 0, patchModuleArg, patchModuleValue)
                logger.info(`     Added: ${patchModuleArg} ${patchModuleValue}`)
            }
            */
            
            logger.info('=======================================')
        }
        
        // ✅ NEOFORGE: Client JARs hiding status (from earlier in build())
        if (this.usingNeoForgeLoader && this.neoForgeClientJarsToHide && this.neoForgeClientJarsToHide.length > 0) {
            logger.info('=== NEOFORGE: PHYSICAL JAR HIDING ===')
            logger.info(`  ℹ️  ${this.neoForgeClientJarsToHide.length} client JARs physically hidden (renamed)`)
            logger.info('     This prevents MinecraftLocator from discovering them')
            logger.info('=======================================')
        }
        
        // NOTE: No longer needed - we removed SRG JAR from classpath completely
        // MinecraftLocator handles SRG JAR loading as a JPMS module automatically
        
        // ✅ QUILT CRITICAL FIX: Fallback garantizado para hashed sin intermediary
        // Si Quilt usa hashed mappings (sin intermediary), FORZAR targetNamespace=official
        if (this.usingQuiltLoader) {
            const hasHashedJar = args.some(arg => 
                typeof arg === 'string' && arg.includes('org\\quiltmc\\hashed')
            ) || (this.modManifest._quiltMeta && this.modManifest._quiltMeta.mappingsType === 'hashed')
            
            const hasIntermediaryJar = args.some(arg => 
                typeof arg === 'string' && arg.includes('net\\fabricmc\\intermediary')
            ) || (this.modManifest._quiltMeta && this.modManifest._quiltMeta.mappingsType === 'intermediary')
            
            const hasTargetNamespaceFlag = args.some(arg => 
                typeof arg === 'string' && arg.includes('loader.experimental.minecraft.targetNamespace')
            )
            
            logger.info('=== QUILT MAPPINGS FALLBACK CHECK ===')
            logger.info(`  hasHashedJar: ${hasHashedJar}`)
            logger.info(`  hasIntermediaryJar: ${hasIntermediaryJar}`)
            logger.info(`  hasTargetNamespaceFlag: ${hasTargetNamespaceFlag}`)
            
            if (hasHashedJar && !hasIntermediaryJar && !hasTargetNamespaceFlag) {
                logger.warn('  ⚠️ CRITICAL: Quilt hashed mappings detected without intermediary namespace')
                logger.warn('  ⚠️ Forcing -Dloader.experimental.minecraft.targetNamespace=official')
                args.push('-Dloader.experimental.minecraft.targetNamespace=official')
            } else if (hasIntermediaryJar) {
                logger.info('  ✅ Quilt using intermediary mappings (standard namespace)')
            } else if (hasTargetNamespaceFlag) {
                logger.info('  ✅ targetNamespace flag already present in arguments')
            }
            
            logger.info('=== END QUILT MAPPINGS FALLBACK ===')
        }

        //args.push('-Dlog4j.configurationFile=D:\\WesterosCraft\\game\\common\\assets\\log_configs\\client-1.12.xml')

        // Java Arguments
        if(process.platform === 'darwin'){
            args.push('-Xdock:name=TECNILAND Nexus')
            args.push('-Xdock:icon=' + path.join(__dirname, '..', 'images', 'minecraft.icns'))
        }
        args.push('-Xmx' + ConfigManager.getMaxRAM(this.server.rawServer.id))
        args.push('-Xms' + ConfigManager.getMinRAM(this.server.rawServer.id))
        
        // Merge custom JVM args (global + legacy) with deduplication
        args = this._mergeCustomJvmArgs(args, this.server.rawServer.id)

        // Bound off-heap memory (fixes direct-buffer OOM on high-RAM configs)
        args = this._applyDirectMemoryCap(args)

        // ✅ NEOFORGE: Add JVM argument to disable early progress window (fallback to fml.toml)
        if (this.usingNeoForgeLoader) {
            args.push('-Dfml.earlyprogresswindow=false')
            logger.info('=== NEOFORGE JVM ARG ===')
            logger.info('  ✅ Added: -Dfml.earlyprogresswindow=false')
            logger.info('     This is a fallback to fml.toml earlyWindowControl')
            logger.info('========================')
        }

        // Main Java Class
        args.push(this.modManifest.mainClass)

        // ============================================================
        // GAME ARGUMENTS - Construidos manualmente, NO de arguments.game
        // Esto evita placeholders ${...} sin resolver y objetos [object Object]
        // ============================================================
        
        // Argumentos básicos del juego (siempre necesarios)
        args.push('--username', this.authUser.displayName.trim())
        args.push('--version', this.server.rawServer.id)
        args.push('--gameDir', this.gameDir)
        args.push('--assetsDir', path.join(this.commonDir, 'assets'))
        args.push('--assetIndex', this.vanillaManifest.assets)
        args.push('--uuid', this.authUser.uuid.trim())
        
        // Access token: TECNILAND uses yggdrasilToken, offline uses '0', others use accessToken
        if (this.authUser.type === 'offline') {
            args.push('--accessToken', '0')
        } else if (this.authUser.type === 'tecniland') {
            // Use Yggdrasil token for TECNILAND accounts (for authlib-injector compatibility)
            args.push('--accessToken', this.authUser.yggdrasilToken || this.authUser.accessToken)
        } else {
            args.push('--accessToken', this.authUser.accessToken)
        }
        
        // User type: Microsoft = msa, TECNILAND = mojang (via Yggdrasil), Offline = legacy, others = mojang
        if (this.authUser.type === 'microsoft') {
            args.push('--userType', 'msa')
        } else if (this.authUser.type === 'offline') {
            args.push('--userType', 'legacy')
        } else {
            // TECNILAND and Mojang both use 'mojang' type (Yggdrasil protocol)
            args.push('--userType', 'mojang')
        }
        
        args.push('--versionType', this.vanillaManifest.type)
        
        // Resolución (si está configurada)
        const gameWidth = ConfigManager.getGameWidth()
        const gameHeight = ConfigManager.getGameHeight()
        if (gameWidth && gameHeight) {
            args.push('--width', String(gameWidth))
            args.push('--height', String(gameHeight))
        }
        
        // Fullscreen
        if (ConfigManager.getFullscreen()) {
            args.push('--fullscreen')
        }

        // Procesar argumentos JVM que tienen rules (solo los de vanillaManifest.arguments.jvm)
        // Necesitamos procesar los que tienen ${natives_directory}, ${launcher_name}, ${launcher_version}, ${classpath}
        for(let i=0; i<args.length; i++){
            if(typeof args[i] === 'object' && args[i].rules != null){
                
                let checksum = 0
                for(let rule of args[i].rules){
                    if(rule.os != null){
                        if(rule.os.name === getMojangOS()
                            && (rule.os.version == null || new RegExp(rule.os.version).test(os.release))){
                            if(rule.action === 'allow'){
                                checksum++
                            }
                        } else {
                            if(rule.action === 'disallow'){
                                checksum++
                            }
                        }
                    } else if(rule.features != null){
                        // We don't have many 'features' in the index at the moment.
                        // This should be fine for a while.
                        if(rule.features.has_custom_resolution != null && rule.features.has_custom_resolution === true){
                            if(ConfigManager.getFullscreen()){
                                args[i].value = [
                                    '--fullscreen',
                                    'true'
                                ]
                            }
                            checksum++
                        }
                    }
                }

                // TODO splice not push
                if(checksum === args[i].rules.length){
                    if(typeof args[i].value === 'string'){
                        args[i] = args[i].value
                    } else if(typeof args[i].value === 'object'){
                        //args = args.concat(args[i].value)
                        args.splice(i, 1, ...args[i].value)
                    }

                    // Decrement i to reprocess the resolved value
                    i--
                } else {
                    args[i] = null
                }

            } else if(typeof args[i] === 'string'){
                if(argDiscovery.test(args[i])){
                    const identifier = args[i].match(argDiscovery)[1]
                    let val = null
                    switch(identifier){
                        case 'natives_directory':
                            val = args[i].replace(argDiscovery, tempNativePath)
                            break
                        case 'launcher_name':
                            val = args[i].replace(argDiscovery, 'TECNILAND-Nexus')
                            break
                        case 'launcher_version':
                            val = args[i].replace(argDiscovery, this.launcherVersion)
                            break
                        case 'classpath':
                            val = this.classpathArg(mods, tempNativePath).join(ProcessBuilder.getClasspathSeparator())
                            break
                        case 'library_directory':
                            val = args[i].replace(argDiscovery, this.libPath)
                            break
                        case 'classpath_separator':
                            val = args[i].replace(argDiscovery, ProcessBuilder.getClasspathSeparator())
                            break
                        case 'version_name':
                            val = args[i].replace(argDiscovery, this.server.rawServer.id)
                            break
                    }
                    if(val != null){
                        args[i] = val
                    }
                }
            }
        }

        // Autoconnect
        this._processAutoConnectArg(args)
        
        // ============================================================
        // MOD LOADER / OPTIFINE GAME ARGUMENTS
        // ============================================================
        // OptiFine SÍ necesita sus argumentos de game (--tweakClass optifine.OptiFineTweaker)
        // El comentario anterior era incorrecto - launchwrapper busca VanillaTweaker si no se especifica tweakClass
        if(this.modManifest !== this.vanillaManifest && this.modManifest.arguments && this.modManifest.arguments.game != null) {
            // Para Forge/Fabric/OptiFine, procesar sus argumentos de game que son strings simples
            for (const arg of this.modManifest.arguments.game) {
                if (typeof arg === 'string') {
                    // Reemplazar placeholders conocidos
                    const processed = arg
                        .replaceAll('${version_name}', this.modManifest.id)
                        .replaceAll('${library_directory}', this.libPath)
                        .replaceAll('${classpath_separator}', ProcessBuilder.getClasspathSeparator())
                    args.push(processed)
                }
                // Ignorar objetos con rules - no los necesitamos
            }
        }

        // Filter null values y cualquier objeto que haya quedado sin resolver
        // CRITICAL: Flatten nested arrays to prevent incorrect command line formatting
        args = args.filter(arg => {
            return arg != null && typeof arg !== 'object'
        }).flat(Infinity) // Flatten any nested arrays completely

        return args
    }

    /**
     * Resolve the arguments required by forge.
     * 
     * @returns {Array.<string>} An array containing the arguments required by forge.
     */
    _resolveForgeArgs(){
        const mcArgs = this.modManifest.minecraftArguments.split(' ')
        const argDiscovery = /\${*(.*)}/

        // Replace the declared variables with their proper values.
        for(let i=0; i<mcArgs.length; ++i){
            if(argDiscovery.test(mcArgs[i])){
                const identifier = mcArgs[i].match(argDiscovery)[1]
                let val = null
                switch(identifier){
                    case 'auth_player_name':
                        val = this.authUser.displayName.trim()
                        break
                    case 'version_name':
                        //val = vanillaManifest.id
                        val = this.server.rawServer.id
                        break
                    case 'game_directory':
                        val = this.gameDir
                        break
                    case 'assets_root':
                        val = path.join(this.commonDir, 'assets')
                        break
                    case 'assets_index_name':
                        val = this.vanillaManifest.assets
                        break
                    case 'auth_uuid':
                        val = this.authUser.uuid.trim()
                        break
                    case 'auth_access_token':
                        // For offline accounts, use dummy token
                        // For TECNILAND accounts, use yggdrasilToken
                        if (this.authUser.type === 'offline') {
                            val = '0'
                        } else if (this.authUser.type === 'tecniland') {
                            val = this.authUser.yggdrasilToken || this.authUser.accessToken
                        } else {
                            val = this.authUser.accessToken
                        }
                        break
                    case 'user_type':
                        // Offline = 'legacy', Microsoft = 'msa', TECNILAND/Mojang = 'mojang'
                        if (this.authUser.type === 'microsoft') {
                            val = 'msa'
                        } else if (this.authUser.type === 'offline') {
                            val = 'legacy'
                        } else {
                            // TECNILAND and Mojang both use 'mojang' type (Yggdrasil protocol)
                            val = 'mojang'
                        }
                        break
                    case 'user_properties': // 1.8.9 and below.
                        val = '{}'
                        break
                    case 'version_type':
                        val = this.vanillaManifest.type
                        break
                }
                if(val != null){
                    mcArgs[i] = val
                }
            }
        }

        // Autoconnect to the selected server.
        this._processAutoConnectArg(mcArgs)

        // Prepare game resolution
        if(ConfigManager.getFullscreen()){
            mcArgs.push('--fullscreen')
            mcArgs.push(true)
        } else {
            mcArgs.push('--width')
            mcArgs.push(ConfigManager.getGameWidth())
            mcArgs.push('--height')
            mcArgs.push(ConfigManager.getGameHeight())
        }
        
        // Mod List File Argument
        mcArgs.push('--modListFile')
        if(this._lteMinorVersion(9)) {
            mcArgs.push(path.basename(this.fmlDir))
        } else {
            mcArgs.push('absolute:' + this.fmlDir)
        }
        

        // LiteLoader
        if(this.usingLiteLoader){
            mcArgs.push('--modRepo')
            mcArgs.push(this.llDir)

            // Set first arg to liteloader tweak class
            mcArgs.unshift('com.mumfrey.liteloader.launch.LiteLoaderTweaker')
            mcArgs.unshift('--tweakClass')
        }

        return mcArgs
    }

    /**
     * Ensure that the classpath entries all point to jar files.
     * 
     * @param {Array.<String>} list Array of classpath entries.
     */
    _processClassPathList(list) {

        const ext = '.jar'
        const extLen = ext.length
        for(let i=0; i<list.length; i++) {
            const extIndex = list[i].indexOf(ext)
            if(extIndex > -1 && extIndex  !== list[i].length - extLen) {
                list[i] = list[i].substring(0, extIndex + extLen)
            }
        }

    }

    /**
     * Resolve the full classpath argument list for this process. This method will resolve all Mojang-declared
     * libraries as well as the libraries declared by the server. Since mods are permitted to declare libraries,
     * this method requires all enabled mods as an input
     * 
     * @param {Array.<Object>} mods An array of enabled mods which will be launched with this process.
     * @param {string} tempNativePath The path to store the native libraries.
     * @returns {Array.<string>} An array containing the paths of each library required by this process.
     */
    classpathArg(mods, tempNativePath){
        let cpArgs = []

        // Determine if this is a vanilla installation (no mod loaders except OptiFine)
        const isVanilla = !this.usingLiteLoader && !this.usingFabricLoader && !this.usingQuiltLoader && !this.usingNeoForgeLoader && this.server.modules.length === 0 && !this.usingOptiFine
        
        logger.info('=== BUILDING CLASSPATH ===')

        if(this.usingLiteLoader){
            cpArgs.push(this.llPath)
        }

        // Resolve the Mojang declared libraries.
        const mojangLibs = this._resolveMojangLibraries(tempNativePath)
        
        // ✅ CRITICAL FOR NEOFORGE: Filter out vanilla Minecraft JAR from Mojang libraries
        // NeoForge uses a remapped SRG JAR that replaces the vanilla JAR completely
        // Having both causes: "Module minecraft contains package X, module client exports package X"
        const filteredMojangLibs = {}
        if (this.usingNeoForgeLoader) {
            const mcVersion = this.server.rawServer.minecraftVersion
            const vanillaJarPattern = new RegExp(`versions[/\\\\]${mcVersion}[/\\\\]${mcVersion}\\.jar$`)
            
            for (const [libId, libPath] of Object.entries(mojangLibs)) {
                // Test the actual file path (value), not the Maven ID (key)
                if (!vanillaJarPattern.test(libPath)) {
                    filteredMojangLibs[libId] = libPath
                }
            }
            logger.info(`  Mojang (Vanilla) libraries: ${Object.keys(mojangLibs).length} → ${Object.keys(filteredMojangLibs).length} (filtered vanilla JAR for NeoForge)`)
        } else {
            Object.assign(filteredMojangLibs, mojangLibs)
            logger.info(`  Mojang (Vanilla) libraries: ${Object.keys(mojangLibs).length}`)
        }

        // Resolve the server declared libraries.
        const servLibs = this._resolveServerLibraries(mods)
        logger.info(`  Server libraries: ${Object.keys(servLibs).length}`)

        // Resolve mod loader libraries (Forge, Fabric, etc.) for custom installations
        const loaderLibs = this._resolveModLoaderLibraries()
        logger.info(`  Mod Loader libraries: ${Object.keys(loaderLibs).length}`)

        // Merge libraries, server libs with the same
        // maven identifier will override the mojang ones.
        // Ex. 1.7.10 forge overrides mojang's guava with newer version.
        const finalLibs = {...filteredMojangLibs, ...servLibs, ...loaderLibs}
        logger.info(`  Final merged libraries: ${Object.keys(finalLibs).length}`)
        cpArgs = cpArgs.concat(Object.values(finalLibs))

        // Add the version.jar AFTER libraries for OptiFine
        // OptiFine uses launchwrapper to patch Minecraft classes at runtime.
        // Libraries must be loaded FIRST so OptiFine transformers can intercept vanilla class loading.
        // For other loaders:
        // - Minecraft < 1.17 (always needed)
        // - Using Fabric/Quilt Loader (needs the vanilla JAR)
        // - Pure Vanilla (no mod loaders at all)
        // Must NOT be added for Forge 1.17+ or NeoForge (they use remapped JARs that replace vanilla)
        
        // DEBUG: Log condition evaluation for vanilla JAR
        const shouldAddVanillaJar = (!mcVersionAtLeast('1.17', this.server.rawServer.minecraftVersion) || this.usingFabricLoader || this.usingQuiltLoader || this.usingOptiFine || isVanilla) && !this.usingNeoForgeLoader
        logger.info(`  Vanilla JAR decision: shouldAdd=${shouldAddVanillaJar}, isVanilla=${isVanilla}, usingNeoForge=${this.usingNeoForgeLoader}`)
        
        if(shouldAddVanillaJar) {
            const version = this.vanillaManifest.id
            const vanillaJarPath = path.join(this.commonDir, 'versions', version, version + '.jar')
            logger.info(`  ✅ Adding vanilla JAR to classpath: ${version}.jar`)
            cpArgs.push(vanillaJarPath)
        } else {
            logger.info('  ❌ Skipping vanilla JAR (using mod loader that provides its own)')
        }
        
        // ✅ NEOFORGE: SRG JAR is NOT added to classpath, only to module path
        // The SRG JAR path was already located during initialization (this.neoForgeSrgJarPath)
        // It will be added to module path in _constructJVMArguments113
        // DO NOT add it to classpath here - that causes JPMS duplicate module errors
        if (this.usingNeoForgeLoader && this.neoForgeSrgJarPath) {
            logger.info('  ℹ️  NeoForge SRG JAR will be in module path only (not classpath)')
            logger.info(`     Path: ${this.neoForgeSrgJarPath}`)
        }

        this._processClassPathList(cpArgs)
        
        // ✅ CHECKS: Validar classpath antes de launch
        if (this.usingFabricLoader) {
            logger.info('=== FABRIC CLASSPATH VALIDATION ===')
            
            const classpathString = cpArgs.join(';')
            
            // Check 1: fabric-loader jar presente
            const hasFabricLoaderJar = classpathString.includes('\\net\\fabricmc\\fabric-loader\\')
            logger.info(`  ✅ hasFabricLoaderJar: ${hasFabricLoaderJar}`)
            
            if (!hasFabricLoaderJar) {
                logger.error('  ❌ CRITICAL: fabric-loader.jar NOT FOUND in classpath!')
                logger.error('     This means the library was not downloaded or not included in version.json')
            }
            
            // Check 2: intermediary jar presente
            const hasIntermediaryJar = classpathString.includes('\\net\\fabricmc\\intermediary\\')
            logger.info(`  ✅ hasIntermediaryJar: ${hasIntermediaryJar}`)
            
            if (!hasIntermediaryJar) {
                logger.warn('  ⚠️ intermediary.jar NOT FOUND in classpath (may be optional for some Fabric versions)')
            }
            
            // Check 3: KnotClient.class exists in fabric-loader jar
            if (hasFabricLoaderJar) {
                try {
                    const fabricLoaderJarPath = cpArgs.find(p => p.includes('\\net\\fabricmc\\fabric-loader\\'))
                    
                    if (fabricLoaderJarPath && fs.existsSync(fabricLoaderJarPath)) {
                        const zip = new AdmZip(fabricLoaderJarPath)
                        const knotClientPath = 'net/fabricmc/loader/impl/launch/knot/KnotClient.class'
                        const knotClientEntry = zip.getEntry(knotClientPath)
                        
                        if (knotClientEntry) {
                            logger.info(`  ✅ hasKnotClient: true (${knotClientPath} found in jar)`)
                        } else {
                            // Try alternative path
                            const altPath = 'net/fabricmc/loader/launch/knot/KnotClient.class'
                            const altEntry = zip.getEntry(altPath)
                            if (altEntry) {
                                logger.warn(`  ⚠️ hasKnotClient: true (found at ALTERNATIVE path ${altPath})`)
                                logger.warn('     Expected mainClass should be: net.fabricmc.loader.launch.knot.KnotClient')
                            } else {
                                logger.error('  ❌ hasKnotClient: false - KnotClient.class NOT FOUND in jar!')
                                logger.error(`     Jar: ${fabricLoaderJarPath}`)
                                logger.error(`     Expected path: ${knotClientPath}`)
                                logger.error(`     Alternative path: ${altPath}`)
                            }
                        }
                    } else {
                        logger.error('  ❌ Could not verify KnotClient: fabric-loader jar not found on disk')
                    }
                } catch (error) {
                    logger.error(`  ❌ Error checking KnotClient: ${error.message}`)
                }
            }
            
            logger.info('=== END FABRIC VALIDATION ===')
        } else if (this.usingQuiltLoader) {
            logger.info('=== QUILT CLASSPATH VALIDATION ===')
            
            const classpathString = cpArgs.join(';')
            
            // Check 1: quilt-loader jar presente
            const hasQuiltLoaderJar = classpathString.includes('\\org\\quiltmc\\quilt-loader\\')
            logger.info(`  ✅ hasQuiltLoaderJar: ${hasQuiltLoaderJar}`)
            
            if (!hasQuiltLoaderJar) {
                logger.error('  ❌ CRITICAL: quilt-loader.jar NOT FOUND in classpath!')
                logger.error('     This means the library was not downloaded or not included in version.json')
            }
            
            // Check 2: hashed or intermediary jar presente (Quilt puede usar cualquiera)
            const hasHashedJar = classpathString.includes('\\org\\quiltmc\\hashed\\')
            const hasIntermediaryJar = classpathString.includes('\\net\\fabricmc\\intermediary\\')
            logger.info(`  ✅ hasHashedJar: ${hasHashedJar}`)
            logger.info(`  ✅ hasIntermediaryJar: ${hasIntermediaryJar}`)
            
            if (!hasHashedJar && !hasIntermediaryJar) {
                logger.warn('  ⚠️ Neither hashed.jar nor intermediary.jar found (may be optional for some Quilt versions)')
            }
            
            // Check 3: KnotClient.class exists in quilt-loader jar
            if (hasQuiltLoaderJar) {
                try {
                    const quiltLoaderJarPath = cpArgs.find(p => p.includes('\\org\\quiltmc\\quilt-loader\\'))
                    
                    if (quiltLoaderJarPath && fs.existsSync(quiltLoaderJarPath)) {
                        const zip = new AdmZip(quiltLoaderJarPath)
                        const knotClientPath = 'org/quiltmc/loader/impl/launch/knot/KnotClient.class'
                        const knotClientEntry = zip.getEntry(knotClientPath)
                        
                        if (knotClientEntry) {
                            logger.info(`  ✅ hasQuiltKnotClient: true (${knotClientPath} found in jar)`)
                        } else {
                            logger.error('  ❌ hasQuiltKnotClient: false - KnotClient.class NOT FOUND in jar!')
                            logger.error(`     Jar: ${quiltLoaderJarPath}`)
                            logger.error(`     Expected path: ${knotClientPath}`)
                        }
                    } else {
                        logger.error('  ❌ Could not verify KnotClient: quilt-loader jar not found on disk')
                    }
                } catch (error) {
                    logger.error(`  ❌ Error checking Quilt KnotClient: ${error.message}`)
                }
            }
            
            logger.info('=== END QUILT VALIDATION ===')
            
            // ✅ Log Quilt mappings metadata
            if (this.modManifest._quiltMeta) {
                logger.info('=== QUILT MAPPINGS METADATA ===')
                logger.info(`  Mappings type: ${this.modManifest._quiltMeta.mappingsType}`)
                logger.info(`  Mappings maven: ${this.modManifest._quiltMeta.mappingsMaven}`)
                if (this.modManifest._quiltMeta.mappingsType === 'intermediary') {
                    logger.info('  ✅ Using intermediary namespace (standard)')
                } else if (this.modManifest._quiltMeta.mappingsType === 'hashed') {
                    logger.warn('  ⚠️ Using hashed namespace (requires targetNamespace=official flag)')
                }
                logger.info('=== END QUILT MAPPINGS METADATA ===')
            }
        }

        return cpArgs
    }

    /**
     * Resolve libraries from mod loader version.json (Forge, Fabric, OptiFine, etc.)
     * Used for custom installations with loaders.
     * 
     * @returns {{[id: string]: string}} An object containing the paths of each loader library.
     */
    _resolveModLoaderLibraries() {
        const libs = {}

        // Si no hay modManifest (instalación custom sin loader), retornar vacío
        if (!this.modManifest || !this.modManifest.libraries) {
            logger.debug('No modManifest.libraries, returning empty')
            return libs
        }
        
        logger.info(`=== RESOLVING MOD LOADER LIBRARIES (${this.modManifest.id || 'unknown'}) ===`)
        logger.info(`  Total libraries in modManifest: ${this.modManifest.libraries.length}`)

        const librariesDir = path.join(this.commonDir, 'libraries')

        for (const lib of this.modManifest.libraries) {
            let libPath = null
            
            // Formato 1: Forge/Fabric con downloads.artifact
            if (lib.downloads && lib.downloads.artifact && lib.downloads.artifact.path) {
                libPath = path.join(librariesDir, lib.downloads.artifact.path)
            }
            // Formato 2: OptiFine y otros que solo tienen "name" sin downloads
            // El name tiene formato Maven: group:artifact:version
            // Se convierte a path: group/artifact/version/artifact-version.jar
            else if (lib.name) {
                const parts = lib.name.split(':')
                if (parts.length >= 3) {
                    const group = parts[0].replace(/\./g, '/')
                    const artifact = parts[1]
                    const version = parts[2]
                    // Manejar classifier si existe (4ta parte)
                    const classifier = parts.length >= 4 ? `-${parts[3]}` : ''
                    
                    // ✅ SPECIAL CASE: NeoForge main JAR
                    // NeoForge processors generate neoforge-VERSION-client.jar (not universal)
                    // The version.json may list it as "net.neoforged:neoforge:VERSION" without classifier
                    if (this.usingNeoForgeLoader && group === 'net/neoforged' && artifact === 'neoforge' && !classifier) {
                        const jarDir = path.join(librariesDir, group, artifact, version)
                        const clientJar = path.join(jarDir, `${artifact}-${version}-client.jar`)
                        
                        // Check if client.jar exists
                        if (fs.existsSync(clientJar)) {
                            logger.info(`Using NeoForge runtime jar: ${artifact}-${version}-client.jar`)
                            libPath = clientJar
                        } else {
                            // Fallback: search for any neoforge-VERSION-*.jar in directory
                            try {
                                const files = fs.readdirSync(jarDir)
                                const neoforgeJar = files.find(f => f.startsWith(`${artifact}-${version}-`) && f.endsWith('.jar'))
                                
                                if (neoforgeJar) {
                                    logger.warn(`NeoForge client jar not found, using fallback: ${neoforgeJar}`)
                                    libPath = path.join(jarDir, neoforgeJar)
                                } else {
                                    throw new Error(
                                        `NeoForge patched client jar missing: ${clientJar}. ` +
                                        'Processors may not have run correctly. Please reinstall NeoForge.'
                                    )
                                }
                            } catch (err) {
                                throw new Error(
                                    `NeoForge patched client jar missing: ${clientJar}. ` +
                                    `Cannot read directory: ${err.message}`
                                )
                            }
                        }
                    } else {
                        // Standard case: build path normally
                        const jarName = `${artifact}-${version}${classifier}.jar`
                        libPath = path.join(librariesDir, group, artifact, version, jarName)
                    }
                }
            }
            
            if (!libPath) {
                logger.debug(`Skipping library without valid path: ${lib.name || 'unknown'}`)
                continue
            }

            // FIX: Generar ID sin versión para hacer override correcto sobre librerías de Mojang.
            // Esto evita duplicados de Log4j2, JNA, etc.
            // Formatos posibles de lib.name:
            //   - "group:artifact:version" (3 partes) → ID = "group:artifact"
            //   - "group:artifact:version:classifier" (4 partes) → ID = "group:artifact:classifier"
            // El classifier es importante para diferenciar forge:universal vs forge:client en 1.21+
            const parts = lib.name.split(':')
            let versionIndependentId
            if (parts.length >= 4) {
                // 4+ partes: group:artifact:version:classifier → group:artifact:classifier
                versionIndependentId = `${parts[0]}:${parts[1]}:${parts[3]}`
            } else if (parts.length === 3) {
                // 3 partes: group:artifact:version → group:artifact
                versionIndependentId = `${parts[0]}:${parts[1]}`
            } else {
                // Fallback: usar nombre completo
                versionIndependentId = lib.name
            }
            libs[versionIndependentId] = libPath
        }

        logger.info(`  Resolved ${Object.keys(libs).length} mod loader libraries`)
        logger.debug('  Sample libraries:', Object.values(libs).slice(0, 3).map(p => path.basename(p)))
        
        // ✅ ASSERT: Si Fabric está habilitado, DEBE haber fabric-loader en libraries
        if (this.usingFabricLoader) {
            const fabricLoaderLibs = this.modManifest.libraries.filter(lib => 
                lib.name && lib.name.startsWith('net.fabricmc:fabric-loader:')
            )
            
            if (fabricLoaderLibs.length === 0) {
                logger.error('=== CRITICAL ERROR: FABRIC LOADER MISSING ===')
                logger.error('  usingFabricLoader = true, but no fabric-loader library found in modManifest.libraries[]')
                logger.error(`  modManifest.id: ${this.modManifest.id}`)
                logger.error(`  modManifest.libraries.length: ${this.modManifest.libraries.length}`)
                logger.error('  All library names:')
                this.modManifest.libraries.forEach((lib, idx) => {
                    logger.error(`    [${idx}] ${lib.name || 'NO NAME'}`)
                })
                throw new Error(
                    'FABRIC INSTALLATION CORRUPTED: version.json does not contain net.fabricmc:fabric-loader library. ' +
                    'This means the installer did not add it to libraries[]. ' +
                    'Delete the Fabric installation folder and reinstall from scratch.'
                )
            }
            
            logger.info(`  ✅ Fabric assertion passed: Found ${fabricLoaderLibs.length} fabric-loader library`)
            logger.info(`     ${fabricLoaderLibs[0].name}`)
        }
        
        // ✅ ASSERT: Si Quilt está habilitado, DEBE haber quilt-loader en libraries
        if (this.usingQuiltLoader) {
            const quiltLoaderLibs = this.modManifest.libraries.filter(lib => 
                lib.name && lib.name.startsWith('org.quiltmc:quilt-loader:')
            )
            
            if (quiltLoaderLibs.length === 0) {
                logger.error('=== CRITICAL ERROR: QUILT LOADER MISSING ===')
                logger.error('  usingQuiltLoader = true, but no quilt-loader library found in modManifest.libraries[]')
                logger.error(`  modManifest.id: ${this.modManifest.id}`)
                logger.error(`  modManifest.libraries.length: ${this.modManifest.libraries.length}`)
                logger.error('  All library names:')
                this.modManifest.libraries.forEach((lib, idx) => {
                    logger.error(`    [${idx}] ${lib.name || 'NO NAME'}`)
                })
                throw new Error(
                    'QUILT INSTALLATION CORRUPTED: version.json does not contain org.quiltmc:quilt-loader library. ' +
                    'This means the installer did not add it to libraries[]. ' +
                    'Delete the Quilt installation folder and reinstall from scratch.'
                )
            }
            
            logger.info(`  ✅ Quilt assertion passed: Found ${quiltLoaderLibs.length} quilt-loader library`)
            logger.info(`     ${quiltLoaderLibs[0].name}`)
        }
        
        // ✅ ASSERT: Si NeoForge está habilitado, DEBE haber librerías de NeoForge
        // NOTA: NeoForge NO tiene una librería "net.neoforged:neoforge" como Fabric/Quilt
        //       En su lugar, usa net.neoforged.fancymodloader como librería principal
        if (this.usingNeoForgeLoader) {
            const neoforgeLoaderLibs = this.modManifest.libraries.filter(lib => 
                lib.name && (
                    lib.name.startsWith('net.neoforged.fancymodloader:loader:') ||
                    lib.name.startsWith('net.neoforged:neoforgespi:') ||
                    lib.name.startsWith('net.neoforged:coremods:')
                )
            )
            
            if (neoforgeLoaderLibs.length === 0) {
                logger.error('=== CRITICAL ERROR: NEOFORGE LOADER MISSING ===')
                logger.error('  usingNeoForgeLoader = true, but no neoforge libraries found in modManifest.libraries[]')
                logger.error(`  modManifest.id: ${this.modManifest.id}`)
                logger.error(`  modManifest.libraries.length: ${this.modManifest.libraries.length}`)
                logger.error('  All library names:')
                this.modManifest.libraries.forEach((lib, idx) => {
                    logger.error(`    [${idx}] ${lib.name || 'NO NAME'}`)
                })
                throw new Error(
                    'NEOFORGE INSTALLATION CORRUPTED: version.json does not contain NeoForge libraries. ' +
                    'Expected at least one of: net.neoforged.fancymodloader:loader, net.neoforged:neoforgespi, net.neoforged:coremods. ' +
                    'Delete the NeoForge installation folder and reinstall from scratch.'
                )
            }
            
            logger.info(`✅ NeoForge assertion passed: Found ${neoforgeLoaderLibs.length} neoforge core libraries`)
            neoforgeLoaderLibs.forEach(lib => {
                logger.info(`   ${lib.name}`)
            })
        }

        return libs
    }

    /**
     * Resolve the libraries defined by Mojang's version data. This method will also extract
     * native libraries and point to the correct location for its classpath.
     * 
     * TODO - clean up function
     * 
     * @param {string} tempNativePath The path to store the native libraries.
     * @returns {{[id: string]: string}} An object containing the paths of each library mojang declares.
     */
    _resolveMojangLibraries(tempNativePath){
        const nativesRegex = /.+:natives-([^-]+)(?:-(.+))?/
        const libs = {}

        const libArr = this.vanillaManifest.libraries
        fs.ensureDirSync(tempNativePath)
        for(let i=0; i<libArr.length; i++){
            const lib = libArr[i]
            if(isLibraryCompatible(lib.rules, lib.natives)){

                // Pre-1.19 has a natives object.
                if(lib.natives != null) {
                    // Extract the native library.
                    const exclusionArr = lib.extract != null ? lib.extract.exclude : ['META-INF/']
                    const artifact = lib.downloads.classifiers[lib.natives[getMojangOS()].replace('${arch}', process.arch.replace('x', ''))]

                    // Location of native zip.
                    const to = path.join(this.libPath, artifact.path)

                    let zip = new AdmZip(to)
                    let zipEntries = zip.getEntries()

                    // Unzip the native zip.
                    for(let i=0; i<zipEntries.length; i++){
                        const fileName = zipEntries[i].entryName

                        let shouldExclude = false

                        // Exclude noted files.
                        exclusionArr.forEach(function(exclusion){
                            if(fileName.indexOf(exclusion) > -1){
                                shouldExclude = true
                            }
                        })

                        // Extract the file.
                        if(!shouldExclude){
                            fs.writeFile(path.join(tempNativePath, fileName), zipEntries[i].getData(), (err) => {
                                if(err){
                                    logger.error('Error while extracting native library:', err)
                                }
                            })
                        }

                    }
                }
                // 1.19+ logic
                else if(lib.name.includes('natives-')) {

                    const regexTest = nativesRegex.exec(lib.name)
                    // const os = regexTest[1]
                    const arch = regexTest[2] ?? 'x64'

                    if(arch != process.arch) {
                        continue
                    }

                    // Extract the native library.
                    const exclusionArr = lib.extract != null ? lib.extract.exclude : ['META-INF/', '.git', '.sha1']
                    const artifact = lib.downloads.artifact

                    // Location of native zip.
                    const to = path.join(this.libPath, artifact.path)

                    let zip = new AdmZip(to)
                    let zipEntries = zip.getEntries()

                    // Unzip the native zip.
                    for(let i=0; i<zipEntries.length; i++){
                        if(zipEntries[i].isDirectory) {
                            continue
                        }

                        const fileName = zipEntries[i].entryName

                        let shouldExclude = false

                        // Exclude noted files.
                        exclusionArr.forEach(function(exclusion){
                            if(fileName.indexOf(exclusion) > -1){
                                shouldExclude = true
                            }
                        })

                        const extractName = fileName.includes('/') ? fileName.substring(fileName.lastIndexOf('/')) : fileName

                        // Extract the file.
                        if(!shouldExclude){
                            fs.writeFile(path.join(tempNativePath, extractName), zipEntries[i].getData(), (err) => {
                                if(err){
                                    logger.error('Error while extracting native library:', err)
                                }
                            })
                        }

                    }
                }
                // No natives
                else {
                    const dlInfo = lib.downloads
                    const artifact = dlInfo.artifact
                    const to = path.join(this.libPath, artifact.path)
                    // Generar ID sin versión, pero preservando classifier si existe
                    // Formato: group:artifact:version[:classifier] → group:artifact[:classifier]
                    const parts = lib.name.split(':')
                    let versionIndependentId
                    if (parts.length >= 4) {
                        versionIndependentId = `${parts[0]}:${parts[1]}:${parts[3]}`
                    } else {
                        versionIndependentId = lib.name.substring(0, lib.name.lastIndexOf(':'))
                    }
                    libs[versionIndependentId] = to
                }
            }
        }

        return libs
    }

    /**
     * Resolve the libraries declared by this server in order to add them to the classpath.
     * This method will also check each enabled mod for libraries, as mods are permitted to
     * declare libraries.
     * 
     * @param {Array.<Object>} mods An array of enabled mods which will be launched with this process.
     * @returns {{[id: string]: string}} An object containing the paths of each library this server requires.
     */
    _resolveServerLibraries(mods){
        const mdls = this.server.modules
        let libs = {}

        // Locate Forge/Fabric/Libraries
        for(let mdl of mdls){
            // Para instalaciones custom, los módulos son objetos planos sin rawModule ni métodos
            // Solo procesamos DistroModule que tienen los métodos necesarios
            const type = mdl.rawModule ? mdl.rawModule.type : mdl.type
            if(type === Type.ForgeHosted || type === Type.Fabric || type === Type.Library){
                // Verificar que el módulo tenga los métodos de DistroModule
                if(typeof mdl.getVersionlessMavenIdentifier === 'function' && typeof mdl.getPath === 'function'){
                    libs[mdl.getVersionlessMavenIdentifier()] = mdl.getPath()
                    if(mdl.subModules && mdl.subModules.length > 0){
                        const res = this._resolveModuleLibraries(mdl)
                        libs = {...libs, ...res}
                    }
                }
                // Para instalaciones custom, el loader se maneja via version.json, no classpath
            }
        }

        //Check for any libraries in our mod list.
        for(let i=0; i<mods.length; i++){
            if(mods.sub_modules != null){
                const res = this._resolveModuleLibraries(mods[i])
                libs = {...libs, ...res}
            }
        }

        return libs
    }

    /**
     * Recursively resolve the path of each library required by this module.
     * 
     * @param {Object} mdl A module object from the server distro index.
     * @returns {{[id: string]: string}} An object containing the paths of each library this module requires.
     */
    _resolveModuleLibraries(mdl){
        if(!mdl.subModules || !mdl.subModules.length > 0){
            return {}
        }
        let libs = {}
        for(let sm of mdl.subModules){
            // Para instalaciones custom, los módulos son objetos planos sin rawModule
            const subType = sm.rawModule ? sm.rawModule.type : sm.type
            if(subType === Type.Library){
                // Verificar que el submódulo tenga los métodos de DistroModule
                if(typeof sm.getVersionlessMavenIdentifier === 'function' && typeof sm.getPath === 'function'){
                    const classpath = sm.rawModule ? (sm.rawModule.classpath ?? true) : true
                    if(classpath) {
                        libs[sm.getVersionlessMavenIdentifier()] = sm.getPath()
                    }
                }
            }
            // If this module has submodules, we need to resolve the libraries for those.
            // To avoid unnecessary recursive calls, base case is checked here.
            if(sm.subModules && sm.subModules.length > 0){
                const res = this._resolveModuleLibraries(sm)
                libs = {...libs, ...res}
            }
        }
        return libs
    }

    /**
     * Ensures fml.toml exists with earlyWindowControl=false for NeoForge
     * CRITICAL: This is the ONLY place that writes fml.toml for NeoForge
     * 
     * Implements robust TOML writing:
     * 1. Normalizes line endings to LF (\n) before write
     * 2. Ensures earlyWindowControl = false with proper TOML format (spaces)
     * 3. Separates comments from values with newlines
     * 4. Post-write verification to catch any issues before launch
     * 
     * @private
     */
    _ensureFmlToml() {
        try {
            const fmlPath = path.join(this.gameDir, 'config', 'fml.toml')
            
            logger.info('=== NEOFORGE: ROBUST FML.TOML SETUP ===')
            logger.info(`  Target path: ${fmlPath}`)
            
            // Ensure config directory exists
            fs.ensureDirSync(path.dirname(fmlPath))
            
            // Read existing content or create base template
            let content = ''
            
            if (fs.existsSync(fmlPath)) {
                content = fs.readFileSync(fmlPath, 'utf8')
                logger.info('  ℹ️  File exists, will modify')
            } else {
                logger.info('  ℹ️  File does not exist, will create')
                // Base TOML template (minimal valid config)
                content = '# NeoForge Configuration\n\n'
            }
            
            // Normalize CRLF to LF to avoid TOML parsing issues
            content = content.replace(/\r\n/g, '\n')
            
            // Search for earlyWindowControl with multiline regex
            const earlyWindowControlRegex = /^\s*earlyWindowControl\s*=\s*(true|false)\s*$/m
            const match = content.match(earlyWindowControlRegex)
            
            if (match) {
                const currentValue = match[1]
                logger.info(`  📄 Found existing: earlyWindowControl = ${currentValue}`)
                
                if (currentValue !== 'false') {
                    // Replace with correct value
                    content = content.replace(earlyWindowControlRegex, 'earlyWindowControl = false')
                    logger.info('  🔧 Replaced with: earlyWindowControl = false')
                } else {
                    logger.info('  ✅ Already correct: earlyWindowControl = false')
                }
            } else {
                // Key not found, append it
                logger.info('  ⚠️  earlyWindowControl NOT found, appending...')
                
                // Ensure content ends with newline
                if (content && !content.endsWith('\n')) {
                    content += '\n'
                }
                
                // Append with proper formatting: comment on separate line, then key=value
                content += '\n'
                content += '# Launcher override: Disable Early Display to prevent crashes\n'
                content += 'earlyWindowControl = false\n'
                
                logger.info('  ✅ Appended: earlyWindowControl = false')
            }
            
            // Write file with normalized LF line endings
            fs.writeFileSync(fmlPath, content, 'utf8')
            logger.info('  💾 File written successfully')
            
            // === POST-WRITE VERIFICATION ===
            logger.info('  🔍 Post-write verification...')
            
            // Re-read file to verify
            const verifyContent = fs.readFileSync(fmlPath, 'utf8')
            const verifyMatch = verifyContent.match(earlyWindowControlRegex)
            
            if (!verifyMatch) {
                // CRITICAL ERROR: File doesn't contain the key after write
                logger.error('  ❌ VERIFICATION FAILED: earlyWindowControl not found after write!')
                logger.error('  📄 File content:')
                logger.error(verifyContent)
                throw new Error('fml.toml verification failed: earlyWindowControl key not found after write')
            }
            
            if (verifyMatch[1] !== 'false') {
                // CRITICAL ERROR: Value is not 'false'
                logger.error(`  ❌ VERIFICATION FAILED: earlyWindowControl = ${verifyMatch[1]} (expected false)`)
                logger.error('  📄 File content:')
                logger.error(verifyContent)
                throw new Error(`fml.toml verification failed: earlyWindowControl is ${verifyMatch[1]}, expected false`)
            }
            
            // Success
            logger.info('  ✅ VERIFIED: earlyWindowControl = false')
            logger.info('=========================================')
            
        } catch (error) {
            logger.error('❌ CRITICAL: Failed to ensure fml.toml')
            logger.error(`   Error: ${error.message}`)
            throw error // Re-throw to abort launch
        }
    }

}

module.exports = ProcessBuilder