/**
 * Loader Installer
 * 
 * Este módulo maneja la descarga e instalación de mod loaders (Forge, Fabric, Quilt, NeoForge)
 * para instalaciones personalizadas.
 */

const { LoggerUtil } = require('helios-core')
const logger = LoggerUtil.getLogger('LoaderInstaller')
const fs = require('fs-extra')
const path = require('path')
const got = require('got')
const AdmZip = require('adm-zip')
const crypto = require('crypto')
const { ForgeProcessorRunner } = require('./forgeprocessor')

// Import modular loader installers
const FabricLoaderInstaller = require('./launch/loader/FabricLoaderInstaller')
const QuiltLoaderInstaller = require('./launch/loader/QuiltLoaderInstaller')
const NeoForgeLoaderInstaller = require('./launch/loader/NeoForgeLoaderInstaller')

// Tipos de loaders
const LoaderType = Object.freeze({
    VANILLA: 'vanilla',
    FORGE: 'forge',
    FABRIC: 'fabric',
    QUILT: 'quilt',
    NEOFORGE: 'neoforge'
})

/**
 * Clase principal para manejar instalación de loaders
 */
class LoaderInstaller {
    
    constructor(commonDir, instanceDir, loader) {
        this.commonDir = commonDir
        this.instanceDir = instanceDir
        this.loader = loader
        this.loaderType = loader.type
        this.minecraftVersion = loader.minecraftVersion
        this.loaderVersion = loader.loaderVersion
        this.progressCallback = null
    }
    
    /**
     * Set progress callback for UI updates
     */
    setProgressCallback(callback) {
        this.progressCallback = callback
    }

    /**
     * Validar si el loader está instalado correctamente
     */
    async validate() {
        switch(this.loaderType) {
            case LoaderType.FORGE:
                return await this.validateForge()
            case LoaderType.FABRIC:
                return await this.validateFabric()
            case LoaderType.QUILT:
                return await this.validateQuilt()
            case LoaderType.NEOFORGE:
                return await this.validateNeoForge()
            case LoaderType.VANILLA:
                return true
            default:
                logger.warn(`Loader type ${this.loaderType} not supported`)
                return false
        }
    }

    /**
     * Instalar el loader
     */
    async install() {
        switch(this.loaderType) {
            case LoaderType.FORGE:
                return await this.installForge()
            case LoaderType.FABRIC:
                return await this.installFabric()
            case LoaderType.QUILT:
                return await this.installQuilt()
            case LoaderType.NEOFORGE:
                return await this.installNeoForge()
            case LoaderType.VANILLA:
                return { success: true }
            default:
                throw new Error(`Loader type ${this.loaderType} not supported`)
        }
    }

    /**
     * Obtener version.json del loader instalado
     */
    async getVersionJson() {
        switch(this.loaderType) {
            case LoaderType.FORGE:
                return await this.getForgeVersionJson()
            case LoaderType.FABRIC:
                return await this.getFabricVersionJson()
            case LoaderType.QUILT:
                return await this.getQuiltVersionJson()
            case LoaderType.NEOFORGE:
                return await this.getNeoForgeVersionJson()
            case LoaderType.VANILLA:
                return null
            default:
                throw new Error(`Loader type ${this.loaderType} not supported`)
        }
    }

    // =====================================================
    // FORGE
    // =====================================================

    /**
     * Normalizar la versión de Forge (puede venir como "41.0.14" o "1.19-41.0.14")
     */
    normalizeForgeVersion() {
        if (this.loaderVersion.startsWith(this.minecraftVersion)) {
            return this.loaderVersion
        }
        return `${this.minecraftVersion}-${this.loaderVersion}`
    }

    /**
     * Validar instalación de Forge
     */
    async validateForge() {
        const versionJsonPath = this.getForgeVersionJsonPath()
        const forgeJarPath = this.getForgeJarPath()
        
        const versionExists = await fs.pathExists(versionJsonPath)
        const jarExists = await fs.pathExists(forgeJarPath)
        
        if (!versionExists || !jarExists) {
            logger.info(`Forge not installed or incomplete: version=${versionExists}, jar=${jarExists}`)
            return false
        }
        
        // Verificar también los archivos client requeridos por Forge 1.17+
        // Leer version.json para obtener el MCP version
        try {
            const versionData = await fs.readJson(versionJsonPath)
            const mcpVersion = versionData.arguments?.game?.find((arg, i, arr) => 
                arr[i-1] === '--fml.mcpVersion'
            )
            
            if (mcpVersion) {
                const librariesDir = path.join(this.commonDir, 'libraries')
                const forgeVersion = this.normalizeForgeVersion()
                
                // Lista completa de archivos requeridos (8 archivos)
                const clientFiles = [
                    // 3 archivos generados por processors principales
                    path.join(librariesDir, 'net', 'minecraft', 'client', `${this.minecraftVersion}-${mcpVersion}`, `client-${this.minecraftVersion}-${mcpVersion}-extra.jar`),
                    path.join(librariesDir, 'net', 'minecraft', 'client', `${this.minecraftVersion}-${mcpVersion}`, `client-${this.minecraftVersion}-${mcpVersion}-srg.jar`),
                    path.join(librariesDir, 'net', 'minecraftforge', 'forge', forgeVersion, `forge-${forgeVersion}-client.jar`),
                    // 5 librerías de Forge adicionales
                    path.join(librariesDir, 'net', 'minecraftforge', 'fmlcore', forgeVersion, `fmlcore-${forgeVersion}.jar`),
                    path.join(librariesDir, 'net', 'minecraftforge', 'forge', forgeVersion, `forge-${forgeVersion}-universal.jar`),
                    path.join(librariesDir, 'net', 'minecraftforge', 'javafmllanguage', forgeVersion, `javafmllanguage-${forgeVersion}.jar`),
                    path.join(librariesDir, 'net', 'minecraftforge', 'lowcodelanguage', forgeVersion, `lowcodelanguage-${forgeVersion}.jar`),
                    path.join(librariesDir, 'net', 'minecraftforge', 'mclanguage', forgeVersion, `mclanguage-${forgeVersion}.jar`)
                ]
                
                for (const file of clientFiles) {
                    if (!(await fs.pathExists(file))) {
                        logger.info(`Required Forge client file missing: ${path.basename(file)}`)
                        return false
                    }
                }
            }
        } catch(err) {
            logger.warn(`Failed to validate client files: ${err.message}`)
        }
        
        return true
    }

    /**
     * Instalar Forge
     */
    async installForge() {
        logger.info(`Installing Forge ${this.loaderVersion} for Minecraft ${this.minecraftVersion}`)
        
        try {
            // 0. Limpiar archivos intermedios de instalaciones anteriores
            // Esto evita problemas de checksum mismatch por archivos cacheados corruptos
            await this.cleanForgeIntermediateFiles()
            
            // 1. Descargar Forge installer
            const installerPath = await this.downloadForgeInstaller()
            
            // 2. Extraer version.json y todos los archivos del installer
            const extractResult = await this.extractForgeInstaller(installerPath)
            
            // 3. Descargar bibliotecas de Forge (de version.json) - pasamos installerZip para extraer las que no tienen URL
            await this.downloadForgeLibraries(extractResult.versionData, extractResult.installerZip)
            
            // 4. Descargar bibliotecas de install_profile.json (dependencias de processors)
            if (extractResult.installProfile) {
                await this.downloadInstallProfileLibraries(extractResult.installProfile, extractResult.installerZip)
            }
            
            // 5. Procesar install_profile.json para generar archivos client
            // Usamos forceClean=true ya que ya limpiamos arriba, pero por si acaso
            if (extractResult.installProfile) {
                try {
                    await this.processForgeInstallProfile(extractResult.installProfile, extractResult.installerZip, extractResult.versionData, installerPath, false)
                } catch(err) {
                    // Si falla por checksum mismatch, limpiar archivos intermedios y reintentar
                    if (err.message && err.message.includes('CHECKSUM_MISMATCH')) {
                        logger.warn('Detected checksum mismatch from corrupted cache, cleaning and retrying...')
                        try {
                            await this.processForgeInstallProfile(extractResult.installProfile, extractResult.installerZip, extractResult.versionData, installerPath, true)
                            logger.info('Retry successful after cleaning intermediate files')
                        } catch(retryErr) {
                            logger.error('Failed to process install_profile after retry:', retryErr.message)
                            logger.warn('Will attempt to launch without processed files')
                        }
                    } else {
                        logger.error('Failed to process install_profile:', err.message)
                        // No lanzar error aquí, intentar continuar
                        logger.warn('Will attempt to launch without processed files')
                    }
                }
            }
            
            // 5. Limpiar installer temporal (después de extraer todo)
            try {
                await fs.remove(installerPath)
                logger.debug('Forge installer cleaned up')
            } catch(err) {
                logger.warn('Failed to clean up installer:', err.message)
            }
            
            logger.info('Forge installation completed successfully')
            return extractResult
            
        } catch(error) {
            logger.error('Failed to install Forge:', error)
            throw error
        }
    }

    /**
     * Limpiar archivos intermedios generados por processors de Forge
     * Estos archivos pueden quedar corruptos de instalaciones anteriores
     * y causar checksum mismatch cuando se reinstala
     */
    async cleanForgeIntermediateFiles() {
        const mcVer = this.minecraftVersion
        const librariesDir = path.join(this.commonDir, 'libraries')
        let deleted = 0
        
        // Directorio net/minecraft/client/ con archivos intermedios
        const clientDir = path.join(librariesDir, 'net', 'minecraft', 'client')
        if (fs.existsSync(clientDir)) {
            try {
                const versions = fs.readdirSync(clientDir)
                for (const ver of versions) {
                    if (ver.includes(mcVer)) {
                        const verDir = path.join(clientDir, ver)
                        if (fs.statSync(verDir).isDirectory()) {
                            const entries = fs.readdirSync(verDir)
                            for (const entry of entries) {
                                // Solo archivos generados por processors (slim, extra, srg, mappings)
                                if (entry.includes('-slim.jar') ||
                                    entry.includes('-extra.jar') ||
                                    entry.includes('-srg.jar') ||
                                    entry.includes('-mappings')) {
                                    const filePath = path.join(verDir, entry)
                                    try {
                                        fs.unlinkSync(filePath)
                                        logger.debug(`Deleted intermediate file: ${entry}`)
                                        deleted++
                                    } catch (err) {
                                        logger.warn(`Failed to delete ${entry}: ${err.message}`)
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                logger.warn(`Error scanning client dir: ${err.message}`)
            }
        }
        
        // Directorio mcp_config/ con archivos mappings
        const mcpDir = path.join(librariesDir, 'de', 'oceanlabs', 'mcp', 'mcp_config')
        if (fs.existsSync(mcpDir)) {
            try {
                const versions = fs.readdirSync(mcpDir)
                for (const ver of versions) {
                    if (ver.includes(mcVer)) {
                        const verDir = path.join(mcpDir, ver)
                        if (fs.statSync(verDir).isDirectory()) {
                            const entries = fs.readdirSync(verDir)
                            for (const entry of entries) {
                                // Solo archivos generados (mappings-merged, mappings.txt)
                                if (entry.includes('-mappings') && !entry.endsWith('.zip')) {
                                    const filePath = path.join(verDir, entry)
                                    try {
                                        fs.unlinkSync(filePath)
                                        logger.debug(`Deleted intermediate file: ${entry}`)
                                        deleted++
                                    } catch (err) {
                                        logger.warn(`Failed to delete ${entry}: ${err.message}`)
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                logger.warn(`Error scanning mcp_config dir: ${err.message}`)
            }
        }
        
        // Forge client jar
        const forgeVersion = this.normalizeForgeVersion()
        const forgeDir = path.join(librariesDir, 'net', 'minecraftforge', 'forge', forgeVersion)
        if (fs.existsSync(forgeDir)) {
            try {
                const entries = fs.readdirSync(forgeDir)
                for (const entry of entries) {
                    if (entry.includes('-client.jar')) {
                        const filePath = path.join(forgeDir, entry)
                        try {
                            fs.unlinkSync(filePath)
                            logger.debug(`Deleted intermediate file: ${entry}`)
                            deleted++
                        } catch (err) {
                            logger.warn(`Failed to delete ${entry}: ${err.message}`)
                        }
                    }
                }
            } catch (err) {
                logger.warn(`Error scanning forge dir: ${err.message}`)
            }
        }
        
        // VERSIONED DATA DIRECTORY: data/{mcVersion}/ with client.lzma, etc.
        // These files are now extracted per-version to prevent cross-version conflicts
        const dataVersionDir = path.join(librariesDir, 'data', mcVer)
        if (fs.existsSync(dataVersionDir)) {
            try {
                logger.info(`Cleaning versioned data directory: data/${mcVer}/`)
                fs.removeSync(dataVersionDir)
                logger.debug(`Deleted versioned data directory: ${dataVersionDir}`)
                deleted++
            } catch (err) {
                logger.warn(`Failed to delete data/${mcVer}/: ${err.message}`)
            }
        }
        
        if (deleted > 0) {
            logger.info(`Cleaned ${deleted} intermediate files from previous installation`)
        }
        
        return deleted
    }

    /**
     * Descargar Forge installer con streaming, progreso y reintentos
     */
    async downloadForgeInstaller() {
        // loaderVersion puede venir como "41.0.14" o "1.19-41.0.14"
        // Normalizar para asegurar formato correcto
        let forgeVersion = this.loaderVersion
        if (!forgeVersion.startsWith(this.minecraftVersion)) {
            forgeVersion = `${this.minecraftVersion}-${this.loaderVersion}`
        }
        
        const url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-installer.jar`
        
        const tempDir = path.join(this.commonDir, 'temp')
        await fs.ensureDir(tempDir)
        
        const installerPath = path.join(tempDir, `forge-${forgeVersion}-installer.jar`)
        
        logger.info(`Downloading Forge installer from ${url}`)
        
        // Reintentos automáticos
        const maxRetries = 3
        let lastError = null
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                logger.info(`Download attempt ${attempt}/${maxRetries}`)
                
                // Usar streaming para descargas grandes con progreso
                const downloadStream = got.stream(url, {
                    timeout: {
                        lookup: 10000,      // 10s para DNS lookup
                        connect: 30000,     // 30s para conectar
                        secureConnect: 30000,
                        socket: 60000,      // 60s sin datos = timeout
                        send: 60000,
                        response: 60000
                    },
                    retry: {
                        limit: 0  // Manejamos reintentos manualmente
                    }
                })
                
                // Tracking de progreso
                let totalBytes = 0
                let receivedBytes = 0
                let startTime = Date.now()
                let lastProgressLog = 0
                
                downloadStream.on('response', (response) => {
                    totalBytes = parseInt(response.headers['content-length'], 10) || 0
                    logger.info(`Forge installer size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`)
                })
                
                downloadStream.on('downloadProgress', (progress) => {
                    receivedBytes = progress.transferred
                    const now = Date.now()
                    
                    // Log cada 2 segundos
                    if (now - lastProgressLog >= 2000) {
                        lastProgressLog = now
                        const elapsedSec = (now - startTime) / 1000
                        const speedMBps = (receivedBytes / 1024 / 1024 / elapsedSec).toFixed(2)
                        const percent = totalBytes > 0 ? ((receivedBytes / totalBytes) * 100).toFixed(1) : 0
                        
                        logger.info(`Downloading Forge: ${percent}% (${(receivedBytes / 1024 / 1024).toFixed(2)}/${(totalBytes / 1024 / 1024).toFixed(2)} MB) @ ${speedMBps} MB/s`)
                        
                        // Callback de progreso para la UI
                        if (this.progressCallback) {
                            this.progressCallback(receivedBytes, totalBytes, `Descargando Forge... ${percent}%`)
                        }
                    }
                })
                
                // Escribir a archivo
                const fileStream = fs.createWriteStream(installerPath)
                
                await new Promise((resolve, reject) => {
                    downloadStream.pipe(fileStream)
                    
                    downloadStream.on('error', (err) => {
                        fileStream.close()
                        fs.unlink(installerPath).catch(() => {})
                        reject(err)
                    })
                    
                    fileStream.on('error', (err) => {
                        reject(err)
                    })
                    
                    fileStream.on('finish', () => {
                        fileStream.close()
                        resolve()
                    })
                })
                
                // Validar que el archivo no esté corrupto/incompleto
                const stats = await fs.stat(installerPath)
                if (stats.size < 500000) {  // Menos de 500KB = probablemente incompleto
                    throw new Error(`Downloaded file too small (${stats.size} bytes), likely incomplete`)
                }
                
                if (totalBytes > 0 && stats.size !== totalBytes) {
                    throw new Error(`Download incomplete: got ${stats.size} bytes, expected ${totalBytes}`)
                }
                
                const elapsedTotal = ((Date.now() - startTime) / 1000).toFixed(1)
                logger.info(`Forge installer downloaded to ${installerPath} in ${elapsedTotal}s`)
                
                return installerPath
                
            } catch(error) {
                lastError = error
                logger.warn(`Download attempt ${attempt} failed: ${error.message}`)
                
                // Limpiar archivo parcial
                try {
                    await fs.unlink(installerPath)
                } catch(e) { /* ignorar */ }
                
                if (attempt < maxRetries) {
                    const waitTime = attempt * 2000  // 2s, 4s, 6s
                    logger.info(`Waiting ${waitTime/1000}s before retry...`)
                    await new Promise(r => setTimeout(r, waitTime))
                }
            }
        }
        
        logger.error(`Failed to download Forge installer after ${maxRetries} attempts: ${lastError.message}`)
        throw new Error(`Cannot download Forge ${forgeVersion}: ${lastError.message}`)
    }

    /**
     * Extraer version.json y todos los archivos necesarios del installer
     */
    async extractForgeInstaller(installerPath) {
        logger.info('Extracting Forge installer')
        
        try {
            const zip = new AdmZip(installerPath)
            const zipEntries = zip.getEntries()
            
            // Buscar version.json en el installer
            const versionEntry = zipEntries.find(entry => 
                entry.entryName === 'version.json' || 
                entry.entryName.endsWith('/version.json')
            )
            
            if (!versionEntry) {
                throw new Error('version.json not found in Forge installer')
            }
            
            // Leer version.json
            const versionData = JSON.parse(versionEntry.getData().toString('utf8'))
            
            // Guardar version.json en la ubicación correcta
            const versionJsonPath = this.getForgeVersionJsonPath()
            await fs.ensureDir(path.dirname(versionJsonPath))
            await fs.writeJson(versionJsonPath, versionData, { spaces: 2 })
            
            logger.info(`Forge version.json saved to ${versionJsonPath}`)
            
            // Extraer install_profile.json para procesarlo
            const installProfileEntry = zipEntries.find(entry => 
                entry.entryName === 'install_profile.json'
            )
            
            let installProfileData = null
            if (installProfileEntry) {
                installProfileData = JSON.parse(installProfileEntry.getData().toString('utf8'))
                logger.info('install_profile.json found in installer')
            } else {
                logger.warn('install_profile.json not found, this Forge version may not need processing')
            }
            
            return {
                success: true,
                versionData: versionData,
                installProfile: installProfileData,
                installerZip: zip
            }
            
        } catch(error) {
            logger.error('Failed to extract Forge installer:', error)
            throw error
        }
    }

    /**
     * Descargar librerías de Forge especificadas en version.json
     * Maneja librerías con y sin URL (algunas vienen en el installer)
     */
    async downloadForgeLibraries(versionData, installerZip) {
        if (!versionData.libraries || versionData.libraries.length === 0) {
            logger.info('No libraries to download for Forge')
            return
        }

        logger.info(`Downloading ${versionData.libraries.length} Forge libraries`)
        const librariesDir = path.join(this.commonDir, 'libraries')
        await fs.ensureDir(librariesDir)

        const downloadPromises = []
        let extracted = 0
        let existing = 0

        for (const lib of versionData.libraries) {
            // Obtener path de la librería
            let libPath = null
            let artifact = lib.downloads?.artifact
            
            if (artifact && artifact.path) {
                libPath = path.join(librariesDir, artifact.path)
            } else {
                // Construir path desde el nombre Maven
                const pathInfo = this.mavenNameToPath(lib.name)
                if (pathInfo) {
                    libPath = path.join(librariesDir, pathInfo.path)
                } else {
                    logger.warn(`Cannot determine path for library: ${lib.name}`)
                    continue
                }
            }

            // Si ya existe, verificar SHA1
            if (await fs.pathExists(libPath)) {
                if (artifact?.sha1) {
                    try {
                        const content = await fs.readFile(libPath)
                        const hash = crypto.createHash('sha1').update(content).digest('hex')
                        
                        if (hash === artifact.sha1) {
                            logger.debug(`Library ${lib.name} already exists and is valid`)
                            existing++
                            continue
                        }
                    } catch(err) {
                        logger.warn(`Failed to verify ${lib.name}, redownloading`)
                    }
                } else {
                    logger.debug(`Library ${lib.name} already exists (no SHA1 to verify)`)
                    existing++
                    continue
                }
            }

            // Si tiene URL válida, descargar
            if (artifact?.url && artifact.url.length > 0) {
                downloadPromises.push(
                    this.downloadLibrary(artifact, libPath, lib.name)
                )
                continue
            }

            // Sin URL - intentar extraer del installer primero
            if (installerZip) {
                const extractedPath = await this.extractLibraryFromInstaller(installerZip, lib.name, libPath)
                if (extractedPath) {
                    logger.debug(`Extracted ${lib.name} from installer`)
                    extracted++
                    continue
                }
            }

            // Último recurso: construir URL de Maven y descargar
            const mavenUrl = this.buildMavenUrl(lib.name)
            if (mavenUrl) {
                downloadPromises.push(
                    this.downloadFromMaven(mavenUrl, libPath, lib.name).catch(err => {
                        logger.warn(`Failed to download ${lib.name}: ${err.message}`)
                    })
                )
            } else {
                logger.warn(`Cannot download library ${lib.name} - no URL available`)
            }
        }

        if (downloadPromises.length > 0) {
            logger.info(`Downloading ${downloadPromises.length} missing libraries`)
            await Promise.allSettled(downloadPromises)
            logger.info('Forge libraries download completed')
        }
        
        if (extracted > 0 || existing > 0) {
            logger.info(`Libraries: ${existing} existing, ${extracted} extracted from installer`)
        }
    }

    /**
     * Descargar librerías de install_profile.json (dependencias de los processors)
     * Estas librerías son CRÍTICAS para que los processors funcionen
     * Incluye: jopt-simple, fastcsv, srgutils, asm-commons, etc.
     */
    async downloadInstallProfileLibraries(installProfile, installerZip) {
        if (!installProfile.libraries || installProfile.libraries.length === 0) {
            logger.info('No install_profile libraries to download')
            return
        }

        logger.info(`Downloading ${installProfile.libraries.length} install_profile libraries (processor dependencies)`)
        const librariesDir = path.join(this.commonDir, 'libraries')
        await fs.ensureDir(librariesDir)

        const downloadPromises = []
        let extracted = 0
        let downloaded = 0
        let existing = 0

        for (const lib of installProfile.libraries) {
            // Obtener información del artifact
            const artifact = lib.downloads?.artifact
            if (!artifact) {
                // Intentar construir la ruta desde el nombre Maven
                const mavenPath = this.mavenNameToPath(lib.name)
                if (!mavenPath) {
                    logger.warn(`Cannot determine path for library: ${lib.name}`)
                    continue
                }
                
                const libPath = path.join(librariesDir, mavenPath.path)
                
                // Verificar si ya existe
                if (await fs.pathExists(libPath)) {
                    logger.debug(`Install profile library ${lib.name} already exists`)
                    existing++
                    continue
                }
                
                // Intentar extraer del installer primero
                const extractedPath = await this.extractLibraryFromInstaller(installerZip, lib.name, libPath)
                if (extractedPath) {
                    extracted++
                    continue
                }
                
                // Descargar desde Maven
                const mavenUrl = this.buildMavenUrl(lib.name)
                if (mavenUrl) {
                    downloadPromises.push(
                        this.downloadFromMaven(mavenUrl, libPath, lib.name)
                    )
                    downloaded++
                }
                continue
            }

            const libPath = path.join(librariesDir, artifact.path)

            // Si ya existe, verificar SHA1
            if (await fs.pathExists(libPath)) {
                if (artifact.sha1) {
                    try {
                        const content = await fs.readFile(libPath)
                        const hash = crypto.createHash('sha1').update(content).digest('hex')
                        
                        if (hash === artifact.sha1) {
                            logger.debug(`Install profile library ${lib.name} already exists and is valid`)
                            existing++
                            continue
                        }
                    } catch(err) {
                        logger.warn(`Failed to verify ${lib.name}, redownloading`)
                    }
                } else {
                    logger.debug(`Install profile library ${lib.name} already exists (no SHA1 to verify)`)
                    existing++
                    continue
                }
            }

            // Intentar extraer del installer primero (muchas librerías vienen incluidas)
            const extractedPath = await this.extractLibraryFromInstaller(installerZip, lib.name, libPath)
            if (extractedPath) {
                extracted++
                continue
            }

            // Descargar librería desde URL proporcionada o Maven
            if (artifact.url) {
                downloadPromises.push(
                    this.downloadLibrary(artifact, libPath, lib.name)
                )
                downloaded++
            } else {
                // Construir URL de Maven
                const mavenUrl = this.buildMavenUrl(lib.name)
                if (mavenUrl) {
                    downloadPromises.push(
                        this.downloadFromMaven(mavenUrl, libPath, lib.name)
                    )
                    downloaded++
                }
            }
        }

        if (downloadPromises.length > 0) {
            logger.info(`Downloading ${downloadPromises.length} processor dependency libraries`)
            const results = await Promise.allSettled(downloadPromises)
            
            const failed = results.filter(r => r.status === 'rejected')
            if (failed.length > 0) {
                logger.warn(`${failed.length} libraries failed to download`)
                for (const f of failed) {
                    logger.warn(`  - ${f.reason?.message || f.reason}`)
                }
            }
        }
        
        logger.info(`Install profile libraries: ${existing} existing, ${extracted} extracted, ${downloaded} downloaded`)
    }

    /**
     * Convertir nombre Maven a path de archivo
     * Ejemplo: net.sf.jopt-simple:jopt-simple:6.0-alpha-3 → net/sf/jopt-simple/jopt-simple/6.0-alpha-3/jopt-simple-6.0-alpha-3.jar
     */
    mavenNameToPath(mavenName) {
        if (!mavenName) return null
        
        const parts = mavenName.split(':')
        if (parts.length < 3) return null
        
        const group = parts[0]
        const artifact = parts[1]
        const version = parts[2].split('@')[0]
        const classifier = parts[3] || ''
        const extension = mavenName.includes('@') ? mavenName.split('@')[1] : 'jar'
        
        const groupPath = group.replace(/\./g, '/')
        const fileName = classifier 
            ? `${artifact}-${version}-${classifier}.${extension}`
            : `${artifact}-${version}.${extension}`
        
        return {
            path: `${groupPath}/${artifact}/${version}/${fileName}`,
            fileName: fileName
        }
    }

    /**
     * Construir URL de Maven para descargar librería
     */
    buildMavenUrl(mavenName) {
        const pathInfo = this.mavenNameToPath(mavenName)
        if (!pathInfo) return null
        
        // Lista de repositorios Maven en orden de prioridad
        const repos = [
            'https://maven.minecraftforge.net',
            'https://maven.fabricmc.net',
            'https://libraries.minecraft.net',
            'https://repo1.maven.org/maven2'
        ]
        
        // Usamos el primer repo como default, el código de descarga intentará otros si falla
        return `${repos[0]}/${pathInfo.path}`
    }

    /**
     * Intentar extraer librería del installer ZIP
     * Forge empaqueta algunas librerías en maven/ dentro del installer
     */
    async extractLibraryFromInstaller(installerZip, mavenName, destPath) {
        const pathInfo = this.mavenNameToPath(mavenName)
        if (!pathInfo) return null
        
        // Posibles ubicaciones dentro del installer
        const possiblePaths = [
            `maven/${pathInfo.path}`,
            pathInfo.path,
            `data/${pathInfo.fileName}`
        ]
        
        for (const internalPath of possiblePaths) {
            const entry = installerZip.getEntry(internalPath)
            if (entry) {
                try {
                    await fs.ensureDir(path.dirname(destPath))
                    await fs.writeFile(destPath, entry.getData())
                    logger.debug(`Extracted ${mavenName} from installer (${internalPath})`)
                    return destPath
                } catch (err) {
                    logger.warn(`Failed to extract ${mavenName}: ${err.message}`)
                }
            }
        }
        
        return null
    }

    /**
     * Descargar desde Maven con reintentos en múltiples repositorios
     */
    async downloadFromMaven(primaryUrl, destPath, libName) {
        const repos = [
            'https://maven.minecraftforge.net',
            'https://maven.fabricmc.net', 
            'https://libraries.minecraft.net',
            'https://repo1.maven.org/maven2'
        ]
        
        // Extraer el path relativo de la URL
        const urlPath = primaryUrl.replace(/https?:\/\/[^/]+\//, '')
        
        let lastError = null
        
        for (const repo of repos) {
            const url = `${repo}/${urlPath}`
            try {
                await fs.ensureDir(path.dirname(destPath))
                
                const response = await got.get(url, {
                    responseType: 'buffer',
                    timeout: { request: 30000 },
                    retry: { limit: 2 }
                })
                
                await fs.writeFile(destPath, response.body)
                logger.debug(`Downloaded ${libName} from ${repo}`)
                return destPath
                
            } catch (err) {
                lastError = err
                // Silently try next repo
            }
        }
        
        // Si llegamos aquí, ningún repo funcionó
        logger.warn(`Failed to download ${libName} from all Maven repos: ${lastError?.message}`)
        throw new Error(`Cannot download ${libName}`)
    }

    /**
     * Procesar install_profile.json ejecutando processors automáticamente
     * Genera archivos requeridos (client-extra, client-srg, forge-client, etc.)
     * @param {boolean} forceClean - If true, clean intermediate files before running processors
     */
    async processForgeInstallProfile(installProfile, installerZip, versionData, installerPath, forceClean = false) {
        logger.info('=== STARTING processForgeInstallProfile ===')
        
        if (!installProfile) {
            logger.warn('No install_profile provided, skipping client file processing')
            return
        }
        
        if (!installProfile.processors) {
            logger.info('No processors found in install_profile, skipping')
            return
        }

        logger.info(`Processing Forge install_profile with ${installProfile.processors.length} processors`)
        if (forceClean) {
            logger.info('Force clean mode enabled - will delete intermediate files')
        }
        
        // Usar JavaManager para obtener el Java correcto para esta versión de Minecraft
        const JavaManager = require('./javamanager')
        const ConfigManager = require('./configmanager')
        const serverId = ConfigManager.getSelectedServer() || ConfigManager.getSelectedInstallation()
        
        // Obtener Java configurado por el usuario (si existe)
        const configuredJava = ConfigManager.getJavaExecutable(serverId)
        
        // Resolver el Java compatible para esta versión de MC
        const javaResult = await JavaManager.resolveJavaForMinecraft(this.minecraftVersion, configuredJava)
        
        if (!javaResult.success) {
            // No hay Java compatible disponible
            logger.error(`No compatible Java found for Minecraft ${this.minecraftVersion}`)
            logger.error(`Requirements: Java ${javaResult.requirements.min}-${javaResult.requirements.max}`)
            logger.error(`Installed versions: ${javaResult.installedVersions}`)
            
            // Lanzar error con información clara para que landing.js pueda manejar la descarga
            const error = new Error(`JAVA_INCOMPATIBLE:${this.minecraftVersion}:${javaResult.requirements.recommended}`)
            error.javaRequired = javaResult.requirements.recommended
            error.mcVersion = this.minecraftVersion
            error.needsDownload = true
            throw error
        }
        
        const javaExecutable = javaResult.executable
        logger.info(`Using Java ${javaResult.majorVersion} (${javaResult.source}): ${javaExecutable}`)
        
        // Construir rutas necesarias
        const minecraftJar = path.join(this.commonDir, 'versions', this.minecraftVersion, `${this.minecraftVersion}.jar`)
        
        // Verificar que el jar de Minecraft existe
        if (!fs.existsSync(minecraftJar)) {
            throw new Error(`Minecraft ${this.minecraftVersion} jar not found at ${minecraftJar}`)
        }
        
        // Crear el runner de processors
        const runner = new ForgeProcessorRunner(
            installProfile,
            installerZip,
            versionData,
            {
                commonDir: this.commonDir,
                minecraftJar: minecraftJar,
                javaExecutable: javaExecutable,
                installerPath: installerPath
            },
            this.progressCallback  // Pass the progress callback
        )
        
        // Ejecutar todos los processors
        logger.info('=== Starting processor execution ===')
        
        try {
            const result = await runner.runAll(forceClean)
            
            if (result.success) {
                logger.info('=== Processors completed successfully ===')
                logger.info(`Total: ${result.total}, Executed: ${result.executed}, Skipped: ${result.skipped}`)
                return result
            } else {
                throw new Error('Processor execution failed')
            }
            
        } catch (err) {
            logger.error('=== Processor execution failed ===')
            logger.error(`Error: ${err.message}`)
            
            // Mostrar mensaje de error detallado
            logger.warn('='.repeat(80))
            logger.warn('FORGE PROCESSOR EXECUTION FAILED')
            logger.warn('')
            logger.warn('Los processors de Forge no pudieron ejecutarse correctamente.')
            logger.warn('Esto puede deberse a:')
            logger.warn('  1. Librerías faltantes del classpath')
            logger.warn('  2. Archivos data/ no extraídos del installer')
            logger.warn('  3. Java no encontrado o versión incorrecta')
            logger.warn('')
            logger.warn(`Error específico: ${err.message}`)
            logger.warn('='.repeat(80))
            
            throw new Error(
                `Failed to process Forge installation: ${err.message}. ` +
                'Check the logs for details.'
            )
        }
    }

    /**
     * Descargar una librería individual
     */
    async downloadLibrary(artifact, libPath, libName) {
        try {
            await fs.ensureDir(path.dirname(libPath))
            
            const response = await got.get(artifact.url, {
                responseType: 'buffer'
            })

            await fs.writeFile(libPath, response.body)
            
            logger.debug(`Downloaded ${libName}`)
            
        } catch(error) {
            logger.error(`Failed to download ${libName}: ${error.message}`)
            throw error
        }
    }

    /**
     * Obtener version.json de Forge
     */
    async getForgeVersionJson() {
        const versionJsonPath = this.getForgeVersionJsonPath()
        
        if (await fs.pathExists(versionJsonPath)) {
            return await fs.readJson(versionJsonPath)
        }
        
        return null
    }

    /**
     * Path del version.json de Forge
     */
    getForgeVersionJsonPath() {
        // Formato: [minecraftVersion]-forge-[loaderVersion sin MC version]
        const loaderOnly = this.loaderVersion.replace(`${this.minecraftVersion}-`, '')
        const forgeVersion = `${this.minecraftVersion}-forge-${loaderOnly}`
        return path.join(this.commonDir, 'versions', forgeVersion, `${forgeVersion}.json`)
    }

    /**
     * Path del JAR de Forge
     */
    getForgeJarPath() {
        // Formato: [minecraftVersion]-forge-[loaderVersion sin MC version]
        const loaderOnly = this.loaderVersion.replace(`${this.minecraftVersion}-`, '')
        const forgeVersion = `${this.minecraftVersion}-forge-${loaderOnly}`
        return path.join(this.commonDir, 'versions', forgeVersion, `${forgeVersion}.jar`)
    }

    // =====================================================
    // FABRIC (Implementado con módulo dedicado)
    // =====================================================

    async validateFabric() {
        try {
            const fabricInstaller = new FabricLoaderInstaller({
                commonDir: this.commonDir,
                instanceDir: this.instanceDir,
                minecraftVersion: this.minecraftVersion,
                loaderVersion: this.loaderVersion,
                progressCallback: this.progressCallback
            })
            
            return await fabricInstaller.validateInstallation()
        } catch (error) {
            logger.error(`Error validating Fabric: ${error.message}`)
            return false
        }
    }

    async installFabric() {
        const fabricInstaller = new FabricLoaderInstaller({
            commonDir: this.commonDir,
            instanceDir: this.instanceDir,
            minecraftVersion: this.minecraftVersion,
            loaderVersion: this.loaderVersion,
            progressCallback: this.progressCallback
        })
        
        return await fabricInstaller.install()
    }

    async getFabricVersionJson() {
        try {
            const fabricInstaller = new FabricLoaderInstaller({
                commonDir: this.commonDir,
                instanceDir: this.instanceDir,
                minecraftVersion: this.minecraftVersion,
                loaderVersion: this.loaderVersion
            })
            
            return await fabricInstaller.getVersionJson()
        } catch (error) {
            logger.error(`Error getting Fabric version.json: ${error.message}`)
            return null
        }
    }

    // =====================================================
    // QUILT
    // =====================================================

    async validateQuilt() {
        const quiltInstaller = new QuiltLoaderInstaller({
            commonDir: this.commonDir,
            instanceDir: this.instanceDir,
            minecraftVersion: this.minecraftVersion,
            loaderVersion: this.loaderVersion
        })
        
        return await quiltInstaller.validateInstallation()
    }

    async installQuilt() {
        const quiltInstaller = new QuiltLoaderInstaller({
            commonDir: this.commonDir,
            instanceDir: this.instanceDir,
            minecraftVersion: this.minecraftVersion,
            loaderVersion: this.loaderVersion,
            progressCallback: this.progressCallback
        })
        
        return await quiltInstaller.install()
    }

    async getQuiltVersionJson() {
        try {
            const quiltInstaller = new QuiltLoaderInstaller({
                commonDir: this.commonDir,
                instanceDir: this.instanceDir,
                minecraftVersion: this.minecraftVersion,
                loaderVersion: this.loaderVersion
            })
            
            return await quiltInstaller.getVersionJson()
        } catch (error) {
            logger.error(`Error getting Quilt version.json: ${error.message}`)
            return null
        }
    }

    // =====================================================
    // NEOFORGE
    // =====================================================

    async validateNeoForge() {
        try {
            const neoforgeInstaller = new NeoForgeLoaderInstaller({
                commonDir: this.commonDir,
                instanceDir: this.instanceDir,
                minecraftVersion: this.minecraftVersion,
                loaderVersion: this.loaderVersion,
                progressCallback: this.progressCallback
            })
            
            return await neoforgeInstaller.validateInstallation()
        } catch (error) {
            logger.error(`Error validating NeoForge: ${error.message}`)
            return false
        }
    }

    async installNeoForge() {
        const neoforgeInstaller = new NeoForgeLoaderInstaller({
            commonDir: this.commonDir,
            instanceDir: this.instanceDir,
            minecraftVersion: this.minecraftVersion,
            loaderVersion: this.loaderVersion,
            progressCallback: this.progressCallback
        })
        
        return await neoforgeInstaller.install()
    }

    async getNeoForgeVersionJson() {
        try {
            const neoforgeInstaller = new NeoForgeLoaderInstaller({
                commonDir: this.commonDir,
                instanceDir: this.instanceDir,
                minecraftVersion: this.minecraftVersion,
                loaderVersion: this.loaderVersion
            })
            
            return await neoforgeInstaller.getVersionJson()
        } catch (error) {
            logger.error(`Error getting NeoForge version.json: ${error.message}`)
            return null
        }
    }
}

// Exportar
module.exports = {
    LoaderInstaller,
    LoaderType
}
