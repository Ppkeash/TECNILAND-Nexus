/**
 * FabricLoaderInstaller
 * 
 * Handles installation and validation of Fabric Loader.
 * 
 * Fabric is a lightweight modding toolchain for Minecraft.
 * - Supported MC versions: 1.14 - 1.21.x
 * - No processors needed (unlike Forge)
 * - Generates version.json programmatically
 * - Downloads libraries from https://maven.fabricmc.net/
 * 
 * Installation flow:
 * 1. Validate MC version compatibility (strict)
 * 2. Fetch compatible Fabric Loader versions from API
 * 3. Generate version.json with proper structure
 * 4. Download Fabric libraries (loader + intermediary mappings)
 * 5. Save version.json to versions/ directory
 */

const BaseLoaderInstaller = require('./BaseLoaderInstaller')
const fs = require('fs-extra')
const path = require('path')
const got = require('got')
const { getLogger } = require('../../loggerutil')

const logger = getLogger('FabricLoaderInstaller')

// Fabric Meta API endpoints
const FABRIC_META_API = 'https://meta.fabricmc.net/v2'

class FabricLoaderInstaller extends BaseLoaderInstaller {
    
    constructor(config) {
        super(config)
        this.loaderType = 'fabric'
    }
    
    // ============================================
    // ABSTRACT METHOD IMPLEMENTATIONS
    // ============================================
    
    getLoaderType() {
        return 'fabric'
    }
    
    /**
     * Override: Fabric soporta versiones dinámicamente según Meta API
     * No usamos límite hardcodeado
     */
    async validateCompatibility() {
        // No validar rango estático - Fabric Meta API devuelve versiones compatibles
        // Si la API devuelve loader versions para esta MC version, es compatible
        logger.debug(`Validando compatibilidad de Fabric con MC ${this.minecraftVersion}...`)
        
        try {
            const VersionAPI = require('../../versionapi')
            const fabricGameVersions = await VersionAPI.getFabricGameVersions()
            const compatibleVersions = fabricGameVersions.map(v => v.version)
            
            if (!compatibleVersions.includes(this.minecraftVersion)) {
                throw new Error(
                    `Fabric no es compatible con Minecraft ${this.minecraftVersion}. ` +
                    'Verifica versiones compatibles en: https://fabricmc.net/versions.html'
                )
            }
            
            logger.info(`✓ Fabric es compatible con MC ${this.minecraftVersion}`)
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
                logger.debug(`Fabric version.json not found at ${versionJsonPath}`)
                return false
            }
            
            // Read and validate version.json structure
            const versionJson = await fs.readJson(versionJsonPath)
            
            if (!versionJson.id || !versionJson.mainClass || !versionJson.libraries) {
                logger.warn('Fabric version.json is malformed')
                return false
            }
            
            // Check if all libraries exist
            for (const lib of versionJson.libraries) {
                const libPath = this.getLibraryPath(lib.name)
                if (!await fs.pathExists(libPath)) {
                    logger.debug(`Fabric library missing: ${lib.name}`)
                    return false
                }
            }
            
            logger.debug('Fabric installation is valid')
            return true
            
        } catch (error) {
            logger.error(`Error validating Fabric installation: ${error.message}`)
            return false
        }
    }
    
    async install() {
        try {
            this.reportProgress(`Instalando Fabric ${this.loaderVersion} para Minecraft ${this.minecraftVersion}...`)
            
            // 1. Strict validation (now async with dynamic API check)
            await this.validateCompatibility()
            
            // 2. Verify loader version is compatible with MC version
            await this.validateLoaderCompatibility()
            
            // 3. Fetch Fabric libraries metadata
            const fabricLibraries = await this.fetchFabricLibraries()
            
            // 4. Generate version.json
            const versionJson = this.generateVersionJson(fabricLibraries)
            
            // 5. Save version.json
            const versionJsonPath = this.getVersionJsonPath()
            await fs.ensureDir(path.dirname(versionJsonPath))
            await fs.writeJson(versionJsonPath, versionJson, { spaces: 2 })
            logger.info(`Fabric version.json saved to ${versionJsonPath}`)
            
            // ✅ VERIFICACIÓN: Loggear libraries[].name del JSON guardado
            logger.info('=== FABRIC VERSION.JSON LIBRARIES ===')
            logger.info(`  Total libraries in version.json: ${versionJson.libraries.length}`)
            versionJson.libraries.forEach((lib, index) => {
                logger.info(`  [${index}] ${lib.name}`)
            })
            logger.info('=== END LIBRARIES LIST ===')
            
            // ✅ ASSERT: Verificar que fabric-loader está en la lista
            const hasFabricLoader = versionJson.libraries.some(lib => lib.name && lib.name.startsWith('net.fabricmc:fabric-loader:'))
            const hasIntermediary = versionJson.libraries.some(lib => lib.name && lib.name.startsWith('net.fabricmc:intermediary:'))
            
            if (!hasFabricLoader) {
                throw new Error(
                    'CRITICAL BUG: fabric-loader library NOT FOUND in generated version.json! ' +
                    'This means generateVersionJson() did not add it correctly. ' +
                    `Expected: net.fabricmc:fabric-loader:${this.loaderVersion}`
                )
            }
            if (!hasIntermediary) {
                logger.warn('WARNING: intermediary library NOT FOUND in version.json (may be optional for some Fabric versions)')
            }
            
            logger.info(`✅ Post-generation validation: hasFabricLoader=${hasFabricLoader}, hasIntermediary=${hasIntermediary}`)
            
            // 6. Download libraries
            this.reportProgress('Descargando librerías de Fabric...')
            await this.downloadLibraries(versionJson.libraries)
            
            // 7. ✅ POST-INSTALL VALIDATION: Verify KnotClient exists
            await this.validateKnotClient()
            
            this.reportProgress('Fabric instalado correctamente')
            logger.info(`Fabric ${this.loaderVersion} installed successfully for MC ${this.minecraftVersion}`)
            
            return { success: true }
            
        } catch (error) {
            logger.error(`Fabric installation failed: ${error.message}`)
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
    // FABRIC-SPECIFIC METHODS
    // ============================================
    
    /**
     * Validate that the specified loader version is compatible with MC version
     * Uses Fabric Meta API to check compatibility
     */
    async validateLoaderCompatibility() {
        try {
            const url = `${FABRIC_META_API}/versions/loader/${this.minecraftVersion}`
            logger.debug(`Fetching Fabric loader versions from ${url}`)
            
            const response = await got.get(url, { responseType: 'json', timeout: { request: 10000 } })
            const loaders = response.body
            
            if (!Array.isArray(loaders) || loaders.length === 0) {
                throw new Error(
                    `No hay versiones de Fabric Loader disponibles para Minecraft ${this.minecraftVersion}. ` +
                    'Verifica que la versión de Minecraft sea correcta.'
                )
            }
            
            // Check if specified loader version exists in compatible versions
            const isCompatible = loaders.some(entry => entry.loader.version === this.loaderVersion)
            
            if (!isCompatible) {
                // Get list of available versions for better error message
                const availableVersions = loaders.slice(0, 5).map(l => l.loader.version).join(', ')
                throw new Error(
                    `Fabric Loader ${this.loaderVersion} no es compatible con Minecraft ${this.minecraftVersion}. ` +
                    `Versiones disponibles: ${availableVersions}...`
                )
            }
            
            logger.info(`Fabric Loader ${this.loaderVersion} is compatible with MC ${this.minecraftVersion}`)
            
        } catch (error) {
            if (error.message.includes('no es compatible') || error.message.includes('No hay versiones')) {
                throw error // Re-throw validation errors
            }
            throw new Error(`Error validando compatibilidad de Fabric: ${error.message}`)
        }
    }
    
    /**
     * Fetch Fabric libraries metadata from Meta API
     * @returns {Promise<Object>} Complete metadata including loader, intermediary, and launcherMeta
     */
    async fetchFabricLibraries() {
        try {
            const url = `${FABRIC_META_API}/versions/loader/${this.minecraftVersion}/${this.loaderVersion}`
            logger.debug(`Fetching Fabric libraries from ${url}`)
            
            const response = await got.get(url, { responseType: 'json', timeout: { request: 10000 } })
            const metadata = response.body
            
            if (!metadata || !metadata.launcherMeta) {
                throw new Error('Invalid response from Fabric Meta API')
            }
            
            // Return complete metadata (includes loader.maven and intermediary.maven)
            return metadata
            
        } catch (error) {
            throw new Error(`Error obteniendo metadata de Fabric: ${error.message}`)
        }
    }
    
    /**
     * Generate version.json for Fabric
     * @param {Object} fabricMetadata Complete metadata from Fabric API (includes loader, intermediary, launcherMeta)
     * @returns {Object} Complete version.json structure
     */
    generateVersionJson(fabricMetadata) {
        const versionId = this.getVersionId()
        const fabricMeta = fabricMetadata.launcherMeta
        
        // ✅ VALIDAR que tenemos loader.maven e intermediary.maven
        if (!fabricMetadata.loader || !fabricMetadata.loader.maven) {
            throw new Error('fabricMetadata.loader.maven is undefined! Cannot generate version.json without fabric-loader artifact.')
        }
        if (!fabricMetadata.intermediary || !fabricMetadata.intermediary.maven) {
            throw new Error('fabricMetadata.intermediary.maven is undefined! Cannot generate version.json without intermediary artifact.')
        }
        
        logger.info('✅ Fabric API metadata validated: loader.maven and intermediary.maven present')
        
        // ✅ FIX: Fabric Meta API NO incluye fabric-loader ni intermediary en libraries[]
        // Debemos agregarlos manualmente desde loader.maven e intermediary.maven
        const libraries = []
        
        // 1. Add fabric-loader (CRITICAL: contiene KnotClient)
        libraries.push({
            name: fabricMetadata.loader.maven,
            url: 'https://maven.fabricmc.net/'
        })
        logger.info(`Added fabric-loader library: ${fabricMetadata.loader.maven}`)
        
        // 2. Add intermediary mappings
        libraries.push({
            name: fabricMetadata.intermediary.maven,
            url: 'https://maven.fabricmc.net/'
        })
        logger.info(`Added intermediary library: ${fabricMetadata.intermediary.maven}`)
        
        // 3. Add API-provided libraries (ASM, Mixin, etc.)
        const apiLibraries = fabricMeta.libraries.common.concat(fabricMeta.libraries.client)
        libraries.push(...apiLibraries)
        logger.info(`Total libraries: ${libraries.length} (2 core + ${apiLibraries.length} dependencies)`)
        
        // ✅ CAMBIO: Usar mainClass recomendada por docs (sin .impl)
        // net.fabricmc.loader.launch.knot.KnotClient es la clase estándar para launchers
        const mainClass = 'net.fabricmc.loader.launch.knot.KnotClient'
        logger.info(`Using mainClass: ${mainClass} (standard Knot launcher)`)
        
        return {
            id: versionId,
            inheritsFrom: this.minecraftVersion,
            releaseTime: new Date().toISOString(),
            time: new Date().toISOString(),
            type: 'release',
            mainClass: mainClass,
            arguments: {
                game: [],
                jvm: []
            },
            libraries: libraries
        }
    }
    
    /**
     * Get the version ID for this Fabric installation
     * @returns {string} Version ID (e.g., "fabric-loader-0.15.0-1.20.1")
     */
    getVersionId() {
        return `fabric-loader-${this.loaderVersion}-${this.minecraftVersion}`
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
     * Validate that fabric-loader.jar contains the KnotClient class
     * @throws {Error} If KnotClient.class is not found or jar doesn't exist
     */
    async validateKnotClient() {
        const AdmZip = require('adm-zip')
        
        try {
            // Get path to fabric-loader jar
            const loaderMaven = `net.fabricmc:fabric-loader:${this.loaderVersion}`
            const loaderJarPath = this.getLibraryPath(loaderMaven)
            
            logger.debug(`Validating KnotClient in ${loaderJarPath}`)
            
            // Check if jar exists
            if (!await fs.pathExists(loaderJarPath)) {
                throw new Error(
                    `fabric-loader JAR not found at ${loaderJarPath}. ` +
                    'This is a critical bug: the library should have been downloaded.'
                )
            }
            
            // Open jar and check for KnotClient.class
            const zip = new AdmZip(loaderJarPath)
            const knotClientPath = 'net/fabricmc/loader/impl/launch/knot/KnotClient.class'
            const knotClientEntry = zip.getEntry(knotClientPath)
            
            if (!knotClientEntry) {
                // Try alternative path (older Fabric versions)
                const altPath = 'net/fabricmc/loader/launch/knot/KnotClient.class'
                const altEntry = zip.getEntry(altPath)
                
                if (!altEntry) {
                    throw new Error(
                        `KnotClient.class not found in fabric-loader JAR at ${loaderJarPath}. ` +
                        `Expected path: ${knotClientPath}. ` +
                        'This means the mainClass is incorrect for this Fabric version, or the JAR is corrupted. ' +
                        `Fabric Loader version: ${this.loaderVersion}, MC version: ${this.minecraftVersion}`
                    )
                } else {
                    logger.warn(`KnotClient found at alternative path: ${altPath}. This may indicate an older Fabric version.`)
                }
            }
            
            logger.info('✅ Validated: KnotClient.class exists in fabric-loader.jar')
            
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
     * Get list of available Fabric Loader versions for a Minecraft version
     * @param {string} minecraftVersion Minecraft version
     * @returns {Promise<Array>} Array of loader version strings
     */
    static async getAvailableLoaderVersions(minecraftVersion) {
        try {
            const url = `${FABRIC_META_API}/versions/loader/${minecraftVersion}`
            const response = await got.get(url, { responseType: 'json', timeout: { request: 10000 } })
            const loaders = response.body
            
            if (!Array.isArray(loaders)) {
                return []
            }
            
            return loaders.map(entry => ({
                version: entry.loader.version,
                stable: entry.loader.stable,
                build: entry.loader.build
            }))
            
        } catch (error) {
            logger.error(`Error fetching Fabric loader versions: ${error.message}`)
            return []
        }
    }
    
    /**
     * Get recommended (latest stable) Fabric Loader version for a Minecraft version
     * @param {string} minecraftVersion Minecraft version
     * @returns {Promise<string|null>} Recommended loader version or null
     */
    static async getRecommendedLoaderVersion(minecraftVersion) {
        const versions = await this.getAvailableLoaderVersions(minecraftVersion)
        
        // Find first stable version
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

module.exports = FabricLoaderInstaller
