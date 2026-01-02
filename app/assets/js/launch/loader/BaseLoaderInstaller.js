/**
 * BaseLoaderInstaller
 * 
 * Abstract base class for all mod loader installers (Fabric, Quilt, NeoForge, etc.)
 * Provides common functionality and enforces consistent interface.
 * 
 * Each loader must implement:
 * - validateInstallation(): Check if loader is properly installed
 * - install(): Download and install the loader
 * - getVersionJson(): Return the loader's version.json
 * - getSupportedMinecraftVersions(): Return range of supported MC versions
 */

const fs = require('fs-extra')
const path = require('path')
const got = require('got')
const crypto = require('crypto')
const { getLogger } = require('../../loggerutil')

const logger = getLogger('BaseLoaderInstaller')

class BaseLoaderInstaller {
    
    /**
     * @param {Object} config Configuration object
     * @param {string} config.commonDir Path to common directory (libraries, versions)
     * @param {string} config.instanceDir Path to instance directory
     * @param {string} config.minecraftVersion Target Minecraft version
     * @param {string} config.loaderVersion Target loader version
     * @param {Function} config.progressCallback Optional progress callback
     */
    constructor(config) {
        if (new.target === BaseLoaderInstaller) {
            throw new Error('BaseLoaderInstaller is abstract and cannot be instantiated directly')
        }
        
        this.commonDir = config.commonDir
        this.instanceDir = config.instanceDir
        this.minecraftVersion = config.minecraftVersion
        this.loaderVersion = config.loaderVersion
        this.progressCallback = config.progressCallback
        
        this.librariesDir = path.join(this.commonDir, 'libraries')
        this.versionsDir = path.join(this.commonDir, 'versions')
    }
    
    // ============================================
    // ABSTRACT METHODS (must be implemented by subclasses)
    // ============================================
    
    /**
     * Validate if this loader is properly installed
     * @returns {Promise<boolean>} True if valid installation exists
     */
    async validateInstallation() {
        throw new Error('validateInstallation() must be implemented by subclass')
    }
    
    /**
     * Install the loader (download libraries, generate version.json, etc.)
     * @returns {Promise<Object>} Result object with success status
     */
    async install() {
        throw new Error('install() must be implemented by subclass')
    }
    
    /**
     * Get the loader's version.json
     * @returns {Promise<Object|null>} Parsed version.json or null if not found
     */
    async getVersionJson() {
        throw new Error('getVersionJson() must be implemented by subclass')
    }
    
    /**
     * Get supported Minecraft version range for this loader
     * @returns {Object} { min: '1.14', max: '1.21.4' }
     */
    getSupportedMinecraftVersions() {
        throw new Error('getSupportedMinecraftVersions() must be implemented by subclass')
    }
    
    /**
     * Get the loader type identifier
     * @returns {string} Loader type (e.g., 'fabric', 'quilt', 'neoforge')
     */
    getLoaderType() {
        throw new Error('getLoaderType() must be implemented by subclass')
    }
    
    // ============================================
    // COMMON UTILITY METHODS
    // ============================================
    
    /**
     * Parse Maven coordinate string into components
     * Supports formats:
     *   - group:artifact:version
     *   - group:artifact:version@ext
     *   - group:artifact:version:classifier
     *   - group:artifact:version:classifier@ext
     * 
     * @param {string} coordinate Maven coordinate string
     * @returns {Object} { group, artifact, version, ext, classifier }
     * 
     * @example
     * parseMavenCoordinate("net.neoforged:lib:1.0.16@jar")
     * // Returns: { group: "net.neoforged", artifact: "lib", version: "1.0.16", ext: "jar", classifier: null }
     * 
     * parseMavenCoordinate("org.lwjgl:lwjgl-glfw:3.3.1:natives-linux")
     * // Returns: { group: "org.lwjgl", artifact: "lwjgl-glfw", version: "3.3.1", ext: "jar", classifier: "natives-linux" }
     */
    parseMavenCoordinate(coordinate) {
        if (!coordinate || typeof coordinate !== 'string') {
            throw new Error(`Invalid Maven coordinate: ${coordinate}`)
        }
        
        // Split by @ to extract extension first
        const [mainPart, extPart] = coordinate.split('@')
        const ext = extPart || 'jar' // Default extension is jar
        
        // Split main part by :
        const parts = mainPart.split(':')
        
        if (parts.length < 3) {
            throw new Error(`Invalid Maven coordinate format: ${coordinate} (expected at least group:artifact:version)`)
        }
        
        const group = parts[0]
        const artifact = parts[1]
        const version = parts[2]
        const classifier = parts.length >= 4 ? parts[3] : null
        
        return { group, artifact, version, ext, classifier }
    }
    
    /**
     * Check if Minecraft version is supported by this loader
     * @returns {boolean} True if MC version is in supported range
     */
    isMinecraftVersionSupported() {
        const { min, max } = this.getSupportedMinecraftVersions()
        return this.compareVersions(this.minecraftVersion, min) >= 0 &&
               this.compareVersions(this.minecraftVersion, max) <= 0
    }
    
    /**
     * Validate compatibility before installation
     * Override this method in subclasses for dynamic validation
     * @throws {Error} If version is not supported
     */
    async validateCompatibility() {
        // Default implementation: check static range
        if (typeof this.getSupportedMinecraftVersions === 'function') {
            if (!this.isMinecraftVersionSupported()) {
                const { min, max } = this.getSupportedMinecraftVersions()
                throw new Error(
                    `${this.getLoaderType()} no es compatible con Minecraft ${this.minecraftVersion}. ` +
                    `Versiones soportadas: ${min} - ${max}`
                )
            }
        }
        // Si no tiene getSupportedMinecraftVersions(), asumir que siempre es compatible
    }
    
    /**
     * Download a library from Maven repository
     * @param {Object} lib Library object with name and url
     * @param {string} targetPath Full path where to save the library
     * @returns {Promise<void>}
     */
    async downloadLibrary(lib, targetPath) {
        // Check if already exists and validate
        if (await fs.pathExists(targetPath)) {
            // If SHA1 is provided, validate it
            if (lib.sha1) {
                const content = await fs.readFile(targetPath)
                const hash = crypto.createHash('sha1').update(content).digest('hex')
                if (hash === lib.sha1) {
                    logger.debug(`Library ${lib.name} already exists and is valid`)
                    return
                }
                logger.warn(`Library ${lib.name} exists but SHA1 mismatch, re-downloading`)
            } else {
                logger.debug(`Library ${lib.name} already exists (no SHA1 to validate)`)
                return
            }
        }
        
        // Parse Maven coordinates: group:artifact:version[@ext][:classifier]
        // Examples: 
        //   "org.example:lib:1.0.0" -> ext=jar
        //   "net.neoforged:lib:1.0.16@jar" -> ext=jar, version=1.0.16
        //   "org.example:lib:1.0.0:natives-linux" -> ext=jar, classifier=natives-linux
        const parsed = this.parseMavenCoordinate(lib.name)
        const { group, artifact, version, ext, classifier } = parsed
        
        const groupPath = group.replace(/\./g, '/')
        const classifierSuffix = classifier ? `-${classifier}` : ''
        const jarName = `${artifact}-${version}${classifierSuffix}.${ext}`
        
        // Determine repository base URL
        let repoBaseUrl
        let repoSource
        
        if (lib.url) {
            // Library specifies its own repository URL
            repoBaseUrl = lib.url.endsWith('/') ? lib.url : `${lib.url}/`
            repoSource = 'library.url'
        } else if (group.startsWith('net.neoforged') || group.startsWith('cpw.mods') || group.startsWith('net.minecraftforge')) {
            // NeoForge and related libraries use NeoForge Maven
            // Includes: net.neoforged.*, cpw.mods.*, net.minecraftforge.*
            repoBaseUrl = 'https://maven.neoforged.net/releases/'
            repoSource = 'neoforge-default'
        } else {
            // Default to Maven Central for everything else
            repoBaseUrl = 'https://repo1.maven.org/maven2/'
            repoSource = 'maven-central-default'
        }
        
        const url = `${repoBaseUrl}${groupPath}/${artifact}/${version}/${jarName}`
        
        logger.info(`Resolved library: ${lib.name} -> ${url}`)
        logger.debug(`  Using repo base: ${repoBaseUrl} (source: ${repoSource})`)
        
        // Download with retry
        const maxRetries = 3
        let lastError
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await fs.ensureDir(path.dirname(targetPath))
                
                const response = await got.get(url, {
                    responseType: 'buffer',
                    timeout: { request: 30000 },
                    retry: { limit: 0 } // We handle retries ourselves
                })
                
                await fs.writeFile(targetPath, response.body)
                
                // Validate SHA1 if provided
                if (lib.sha1) {
                    const hash = crypto.createHash('sha1').update(response.body).digest('hex')
                    if (hash !== lib.sha1) {
                        throw new Error(`SHA1 mismatch for ${lib.name}`)
                    }
                }
                
                logger.debug(`Successfully downloaded ${lib.name}`)
                return
                
            } catch (error) {
                lastError = error
                logger.warn(`Download attempt ${attempt}/${maxRetries} failed for ${lib.name}: ${error.message}`)
                if (attempt < maxRetries) {
                    await this.sleep(1000 * attempt) // Exponential backoff
                }
            }
        }
        
        throw new Error(`Failed to download ${lib.name} after ${maxRetries} attempts: ${lastError.message}`)
    }
    
    /**
     * Download multiple libraries in sequence
     * @param {Array} libraries Array of library objects
     * @returns {Promise<void>}
     */
    async downloadLibraries(libraries) {
        let downloaded = 0
        const total = libraries.length
        
        for (const lib of libraries) {
            // Use the same parser as downloadLibrary to extract coordinates
            const parsed = this.parseMavenCoordinate(lib.name)
            const { group, artifact, version, ext, classifier } = parsed
            
            const groupPath = group.replace(/\./g, '/')
            const classifierSuffix = classifier ? `-${classifier}` : ''
            const jarName = `${artifact}-${version}${classifierSuffix}.${ext}`
            const libPath = path.join(this.librariesDir, groupPath, artifact, version, jarName)
            
            await this.downloadLibrary(lib, libPath)
            
            downloaded++
            if (this.progressCallback) {
                const percent = Math.round((downloaded / total) * 100)
                this.progressCallback(downloaded, total, `Descargando librerías... ${percent}%`)
            }
        }
    }
    
    /**
     * Compare two version strings (semver-like)
     * @param {string} v1 First version
     * @param {string} v2 Second version
     * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
     */
    compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(p => parseInt(p) || 0)
        const parts2 = v2.split('.').map(p => parseInt(p) || 0)
        
        const maxLength = Math.max(parts1.length, parts2.length)
        
        for (let i = 0; i < maxLength; i++) {
            const p1 = parts1[i] || 0
            const p2 = parts2[i] || 0
            
            if (p1 < p2) return -1
            if (p1 > p2) return 1
        }
        
        return 0
    }
    
    /**
     * Sleep utility
     * @param {number} ms Milliseconds to sleep
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
    
    /**
     * Report progress to callback if available
     * @param {string} message Progress message
     */
    reportProgress(message) {
        if (this.progressCallback) {
            this.progressCallback(0, 1, message)
        }
        logger.info(message)
    }
}

module.exports = BaseLoaderInstaller
