/**
 * QuiltLoaderInstaller
 * 
 * Handles installation and validation of Quilt Loader.
 * 
 * Quilt is a community-driven modding toolchain for Minecraft, forked from Fabric.
 * - Supported MC versions: 1.14 - 1.21.x (same range as Fabric)
 * - No processors needed (like Fabric)
 * - Generates version.json programmatically
 * - Downloads libraries from https://maven.quiltmc.org/repository/release/
 * 
 * Installation flow:
 * 1. Validate MC version compatibility (strict)
 * 2. Fetch compatible Quilt Loader versions from API
 * 3. Generate version.json with proper structure
 * 4. Download Quilt libraries (loader + intermediary/hashed mappings)
 * 5. Save version.json to versions/ directory
 */

const BaseLoaderInstaller = require('./BaseLoaderInstaller')
const fs = require('fs-extra')
const path = require('path')
const got = require('got')
const { getLogger } = require('../../loggerutil')

const logger = getLogger('QuiltLoaderInstaller')

// Quilt Meta API endpoints
const QUILT_META_API = 'https://meta.quiltmc.org/v3'

class QuiltLoaderInstaller extends BaseLoaderInstaller {
    
    constructor(config) {
        super(config)
        this.loaderType = 'quilt'
    }
    
    // ============================================
    // ABSTRACT METHOD IMPLEMENTATIONS
    // ============================================
    
    getLoaderType() {
        return 'quilt'
    }
    
    /**
     * Override: Quilt soporta versiones dinámicamente según Meta API
     * No usamos límite hardcodeado
     */
    async validateCompatibility() {
        // No validar rango estático - Quilt Meta API devuelve versiones compatibles
        // Si la API devuelve loader versions para esta MC version, es compatible
        logger.debug(`Validando compatibilidad de Quilt con MC ${this.minecraftVersion}...`)
        
        try {
            const VersionAPI = require('../../versionapi')
            const quiltGameVersions = await VersionAPI.getQuiltGameVersions()
            const compatibleVersions = quiltGameVersions.map(v => v.version)
            
            if (!compatibleVersions.includes(this.minecraftVersion)) {
                throw new Error(
                    `Quilt no es compatible con Minecraft ${this.minecraftVersion}. ` +
                    'Verifica versiones compatibles en: https://quiltmc.org/install/client/'
                )
            }
            
            logger.info(`✓ Quilt es compatible con MC ${this.minecraftVersion}`)
        } catch (error) {
            if (error.message.includes('no es compatible')) {
                throw error // Re-throw validation error
            }
            // Si falla la API, log warning pero continuar (fallback graceful)
            logger.warn(`No se pudo validar compatibilidad con API: ${error.message}`)
        }
    }
    
    async validateInstallation() {
        try {
            const versionJsonPath = this.getVersionJsonPath()
            
            if (!await fs.pathExists(versionJsonPath)) {
                logger.debug(`Quilt version.json not found at ${versionJsonPath}`)
                return false
            }
            
            // Read and validate version.json structure
            const versionJson = await fs.readJson(versionJsonPath)
            
            if (!versionJson.id || !versionJson.mainClass || !versionJson.libraries) {
                logger.warn('Quilt version.json is malformed')
                return false
            }
            
            // ✅ CRITICAL: Invalidar instalaciones viejas sin mappings metadata
            if (!versionJson._quiltMeta || !versionJson._quiltMeta.mappingsType) {
                logger.warn('⚠️ Quilt installation is OLD (no _quiltMeta). Marking as invalid to force regeneration.')
                return false
            }
            
            // ✅ CRITICAL: Si usa hashed, DEBE tener el flag targetNamespace=official
            if (versionJson._quiltMeta.mappingsType === 'hashed') {
                const hasTargetNamespaceFlag = versionJson.arguments?.jvm?.some(arg => 
                    typeof arg === 'string' && arg.includes('loader.experimental.minecraft.targetNamespace=official')
                )
                
                if (!hasTargetNamespaceFlag) {
                    logger.warn('⚠️ Quilt installation uses hashed but missing targetNamespace=official flag')
                    logger.warn('   Marking as invalid to force regeneration with correct JVM args')
                    return false
                }
            }
            
            logger.debug(`Quilt installation validated: mappingsType=${versionJson._quiltMeta.mappingsType}`)
            
            // Check if all libraries exist
            for (const lib of versionJson.libraries) {
                const libPath = this.getLibraryPath(lib.name)
                if (!await fs.pathExists(libPath)) {
                    logger.debug(`Quilt library missing: ${lib.name}`)
                    return false
                }
            }
            
            logger.debug('Quilt installation is valid')
            return true
            
        } catch (error) {
            logger.error(`Error validating Quilt installation: ${error.message}`)
            return false
        }
    }
    
    async install() {
        try {
            this.reportProgress(`Instalando Quilt ${this.loaderVersion} para Minecraft ${this.minecraftVersion}...`)
            
            // 1. Strict validation (now async with dynamic API check)
            await this.validateCompatibility()
            
            // 2. Verify loader version is compatible with MC version
            await this.validateLoaderCompatibility()
            
            // 3. Fetch Quilt libraries metadata
            const quiltLibraries = await this.fetchQuiltLibraries()
            
            // 4. Generate version.json
            const versionJson = this.generateVersionJson(quiltLibraries)
            
            // 5. Save version.json
            const versionJsonPath = this.getVersionJsonPath()
            await fs.ensureDir(path.dirname(versionJsonPath))
            await fs.writeJson(versionJsonPath, versionJson, { spaces: 2 })
            logger.info(`Quilt version.json saved to ${versionJsonPath}`)
            
            // ✅ VERIFICACIÓN: Loggear libraries[].name del JSON guardado
            logger.info('=== QUILT VERSION.JSON LIBRARIES ===')
            logger.info(`  Total libraries in version.json: ${versionJson.libraries.length}`)
            versionJson.libraries.forEach((lib, index) => {
                logger.info(`  [${index}] ${lib.name}`)
            })
            logger.info('=== END LIBRARIES LIST ===')
            
            // ✅ ASSERT: Verificar que quilt-loader está en la lista
            const hasQuiltLoader = versionJson.libraries.some(lib => lib.name && lib.name.startsWith('org.quiltmc:quilt-loader:'))
            const hasIntermediary = versionJson.libraries.some(lib => 
                lib.name && (lib.name.startsWith('net.fabricmc:intermediary:') || lib.name.startsWith('org.quiltmc:hashed:'))
            )
            
            if (!hasQuiltLoader) {
                throw new Error(
                    'CRITICAL BUG: quilt-loader library NOT FOUND in generated version.json! ' +
                    'This means generateVersionJson() did not add it correctly. ' +
                    `Expected: org.quiltmc:quilt-loader:${this.loaderVersion}`
                )
            }
            if (!hasIntermediary) {
                logger.warn('WARNING: intermediary/hashed library NOT FOUND in version.json (may be optional for some Quilt versions)')
            }
            
            logger.info(`✅ Post-generation validation: hasQuiltLoader=${hasQuiltLoader}, hasIntermediary=${hasIntermediary}`)
            
            // 6. Download libraries
            this.reportProgress('Descargando librerías de Quilt...')
            await this.downloadLibraries(versionJson.libraries)
            
            // 7. ✅ POST-INSTALL VALIDATION: Verify KnotClient exists
            await this.validateKnotClient()
            
            this.reportProgress('Quilt instalado correctamente')
            logger.info(`Quilt ${this.loaderVersion} installed successfully for MC ${this.minecraftVersion}`)
            
            return { success: true }
            
        } catch (error) {
            logger.error(`Quilt installation failed: ${error.message}`)
            throw error
        }
    }
    
    async getVersionJson() {
        const versionJsonPath = this.getVersionJsonPath()
        
        if (await fs.pathExists(versionJsonPath)) {
            return await fs.readJson(versionJsonPath)
        }
        
        return null
    }
    
    // ============================================
    // QUILT-SPECIFIC METHODS
    // ============================================
    
    /**
     * Validate that the specified loader version is compatible with MC version
     * Uses Quilt Meta API to check compatibility
     */
    async validateLoaderCompatibility() {
        try {
            const url = `${QUILT_META_API}/versions/loader/${this.minecraftVersion}`
            logger.debug(`Fetching Quilt loader versions from ${url}`)
            
            const response = await got.get(url, { responseType: 'json', timeout: { request: 10000 } })
            const loaders = response.body
            
            if (!Array.isArray(loaders) || loaders.length === 0) {
                throw new Error(
                    `No hay versiones de Quilt Loader disponibles para Minecraft ${this.minecraftVersion}. ` +
                    'Verifica que la versión de Minecraft sea correcta.'
                )
            }
            
            // Check if specified loader version exists in compatible versions
            const isCompatible = loaders.some(entry => entry.loader.version === this.loaderVersion)
            
            if (!isCompatible) {
                // Get list of available versions for better error message
                const availableVersions = loaders.slice(0, 5).map(l => l.loader.version).join(', ')
                throw new Error(
                    `Quilt Loader ${this.loaderVersion} no es compatible con Minecraft ${this.minecraftVersion}. ` +
                    `Versiones disponibles: ${availableVersions}...`
                )
            }
            
            logger.info(`Quilt Loader ${this.loaderVersion} is compatible with MC ${this.minecraftVersion}`)
            
        } catch (error) {
            if (error.message.includes('no es compatible') || error.message.includes('No hay versiones')) {
                throw error // Re-throw validation errors
            }
            throw new Error(`Error validando compatibilidad de Quilt: ${error.message}`)
        }
    }
    
    /**
     * Fetch Quilt libraries metadata from Meta API
     * @returns {Promise<Object>} Complete metadata including loader, intermediary/hashed, and launcherMeta
     */
    async fetchQuiltLibraries() {
        try {
            const url = `${QUILT_META_API}/versions/loader/${this.minecraftVersion}/${this.loaderVersion}`
            logger.debug(`Fetching Quilt libraries from ${url}`)
            
            const response = await got.get(url, { responseType: 'json', timeout: { request: 10000 } })
            const metadata = response.body
            
            if (!metadata || !metadata.launcherMeta) {
                throw new Error('Invalid response from Quilt Meta API')
            }
            
            // Return complete metadata (includes loader.maven and hashed/intermediary.maven)
            return metadata
            
        } catch (error) {
            throw new Error(`Error obteniendo metadata de Quilt: ${error.message}`)
        }
    }
    
    /**
     * Generate version.json for Quilt
     * @param {Object} quiltMetadata Complete metadata from Quilt API (includes loader, hashed/intermediary, launcherMeta)
     * @returns {Object} Complete version.json structure
     */
    generateVersionJson(quiltMetadata) {
        const versionId = this.getVersionId()
        const quiltMeta = quiltMetadata.launcherMeta
        
        // ✅ VALIDAR que tenemos loader.maven
        if (!quiltMetadata.loader || !quiltMetadata.loader.maven) {
            throw new Error('quiltMetadata.loader.maven is undefined! Cannot generate version.json without quilt-loader artifact.')
        }
        
        // ✅ CRITICAL FIX: Preferir intermediary sobre hashed para compatibilidad
        // Quilt puede devolver ambos: "intermediary" (Fabric-compatible) y "hashed" (Quilt-specific)
        // Preferir intermediary porque:
        // 1. Contiene namespace "intermediary" que espera el loader por defecto
        // 2. Es compatible con el ecosistema Fabric
        // 3. hashed puede requerir flag adicional -Dloader.experimental.minecraft.targetNamespace=official
        let mappingsMaven = null
        let mappingsType = null
        
        if (quiltMetadata.intermediary?.maven) {
            mappingsMaven = quiltMetadata.intermediary.maven
            mappingsType = 'intermediary'
            logger.info('✅ Using intermediary mappings (Fabric-compatible, contains intermediary namespace)')
        } else if (quiltMetadata.hashed?.maven) {
            mappingsMaven = quiltMetadata.hashed.maven
            mappingsType = 'hashed'
            logger.warn('⚠️ Using hashed mappings (intermediary not available). May require targetNamespace=official flag.')
        } else {
            throw new Error('quiltMetadata does not have hashed or intermediary maven! Cannot generate version.json.')
        }
        
        logger.info(`✅ Quilt API metadata validated: loader.maven and ${mappingsType} mappings present`)
        
        // ✅ FIX: Quilt Meta API NO incluye quilt-loader ni hashed/intermediary en libraries[]
        // Debemos agregarlos manualmente desde loader.maven y hashed/intermediary.maven
        const libraries = []
        
        // 1. Add quilt-loader (CRITICAL: contiene KnotClient)
        libraries.push({
            name: quiltMetadata.loader.maven,
            url: 'https://maven.quiltmc.org/repository/release/'
        })
        logger.info(`Added quilt-loader library: ${quiltMetadata.loader.maven}`)
        
        // 2. Add intermediary/hashed mappings
        libraries.push({
            name: mappingsMaven,
            url: mappingsType === 'hashed' ? 'https://maven.quiltmc.org/repository/release/' : 'https://maven.fabricmc.net/'
        })
        logger.info(`Added mappings library: ${mappingsMaven} (type: ${mappingsType})`)
        
        // 3. Add API-provided libraries (ASM, Mixin, etc.)
        const apiLibraries = quiltMeta.libraries.common.concat(quiltMeta.libraries.client)
        libraries.push(...apiLibraries)
        logger.info(`Total libraries: ${libraries.length} (2 core + ${apiLibraries.length} dependencies)`)
        
        // ✅ Usar mainClass estándar de Quilt
        // org.quiltmc.loader.impl.launch.knot.KnotClient es la clase estándar
        const mainClass = 'org.quiltmc.loader.impl.launch.knot.KnotClient'
        logger.info(`Using mainClass: ${mainClass} (Quilt Knot launcher)`)
        
        // ✅ JVM arguments para Quilt
        const jvmArgs = [
            '-Dfabric.skipMcProvider=true',
            '-Dfabric.gameVersion=' + this.minecraftVersion,
            '-Dfabric.side=client'
        ]
        
        // ✅ CRITICAL FIX: Si usamos hashed (sin intermediary namespace), agregar targetNamespace=official
        if (mappingsType === 'hashed') {
            logger.warn('⚠️ Using hashed mappings: adding -Dloader.experimental.minecraft.targetNamespace=official')
            jvmArgs.push('-Dloader.experimental.minecraft.targetNamespace=official')
        }
        
        return {
            id: versionId,
            inheritsFrom: this.minecraftVersion,
            releaseTime: new Date().toISOString(),
            time: new Date().toISOString(),
            type: 'release',
            mainClass: mainClass,
            arguments: {
                game: [],
                jvm: jvmArgs
            },
            libraries: libraries,
            // ✅ Custom metadata for debugging
            _quiltMeta: {
                mappingsType: mappingsType,
                mappingsMaven: mappingsMaven
            }
        }
    }
    
    /**
     * Get the version ID for this Quilt installation
     * @returns {string} Version ID (e.g., "quilt-loader-0.29.2-1.20.1")
     */
    getVersionId() {
        return `quilt-loader-${this.loaderVersion}-${this.minecraftVersion}`
    }
    
    /**
     * Get path to version.json file
     * @returns {string} Full path to version.json
     */
    getVersionJsonPath() {
        const versionId = this.getVersionId()
        return path.join(this.versionsDir, versionId, `${versionId}.json`)
    }
    
    /**
     * Get path to a library file from Maven coordinates
     * @param {string} mavenCoords Maven coordinates (group:artifact:version[:classifier])
     * @returns {string} Full path to library JAR
     */
    getLibraryPath(mavenCoords) {
        const parts = mavenCoords.split(':')
        const group = parts[0].replace(/\./g, '/')
        const artifact = parts[1]
        const version = parts[2]
        const classifier = parts.length >= 4 ? `-${parts[3]}` : ''
        const jarName = `${artifact}-${version}${classifier}.jar`
        
        return path.join(this.librariesDir, group, artifact, version, jarName)
    }
    
    /**
     * Validate that quilt-loader.jar contains the KnotClient class
     * @throws {Error} If KnotClient.class is not found or jar doesn't exist
     */
    async validateKnotClient() {
        const AdmZip = require('adm-zip')
        
        try {
            // Get path to quilt-loader jar
            const loaderMaven = `org.quiltmc:quilt-loader:${this.loaderVersion}`
            const loaderJarPath = this.getLibraryPath(loaderMaven)
            
            logger.debug(`Validating KnotClient in ${loaderJarPath}`)
            
            // Check if jar exists
            if (!await fs.pathExists(loaderJarPath)) {
                throw new Error(
                    `quilt-loader JAR not found at ${loaderJarPath}. ` +
                    'This is a critical bug: the library should have been downloaded.'
                )
            }
            
            // Open jar and check for KnotClient.class
            const zip = new AdmZip(loaderJarPath)
            const knotClientPath = 'org/quiltmc/loader/impl/launch/knot/KnotClient.class'
            const knotClientEntry = zip.getEntry(knotClientPath)
            
            if (!knotClientEntry) {
                throw new Error(
                    `KnotClient.class not found in quilt-loader JAR at ${loaderJarPath}. ` +
                    `Expected path: ${knotClientPath}. ` +
                    'This means the mainClass is incorrect for this Quilt version, or the JAR is corrupted. ' +
                    `Quilt Loader version: ${this.loaderVersion}, MC version: ${this.minecraftVersion}`
                )
            }
            
            logger.info('✅ Validated: KnotClient.class exists in quilt-loader.jar')
            
        } catch (error) {
            if (error.message.includes('KnotClient.class not found') || error.message.includes('JAR not found')) {
                throw error // Re-throw validation errors
            }
            throw new Error(`Error validating KnotClient: ${error.message}`)
        }
    }
    
    // ============================================
    // STATIC UTILITY METHODS
    // ============================================
    
    /**
     * Get list of available Quilt Loader versions for a Minecraft version
     * @param {string} minecraftVersion Minecraft version
     * @returns {Promise<Array>} Array of loader version strings
     */
    static async getAvailableLoaderVersions(minecraftVersion) {
        try {
            const url = `${QUILT_META_API}/versions/loader/${minecraftVersion}`
            const response = await got.get(url, { responseType: 'json', timeout: { request: 10000 } })
            const loaders = response.body
            
            if (!Array.isArray(loaders)) {
                return []
            }
            
            return loaders.map(entry => ({
                version: entry.loader.version,
                stable: !entry.loader.version.includes('beta') && !entry.loader.version.includes('alpha'),
                build: entry.loader.build
            }))
            
        } catch (error) {
            logger.error(`Error fetching Quilt loader versions: ${error.message}`)
            return []
        }
    }
    
    /**
     * Get recommended (latest stable) Quilt Loader version for a Minecraft version
     * @param {string} minecraftVersion Minecraft version
     * @returns {Promise<string|null>} Recommended loader version or null
     */
    static async getRecommendedLoaderVersion(minecraftVersion) {
        const versions = await this.getAvailableLoaderVersions(minecraftVersion)
        
        // Find first stable version (not beta/alpha)
        const stableVersion = versions.find(v => v.stable)
        if (stableVersion) {
            return stableVersion.version
        }
        
        // Fallback to latest version
        if (versions.length > 0) {
            return versions[0].version
        }
        
        return null
    }
}

module.exports = QuiltLoaderInstaller
