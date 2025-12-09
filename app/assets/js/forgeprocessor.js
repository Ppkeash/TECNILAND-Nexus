/**
 * ForgeProcessorRunner
 * Executes Forge install_profile.json processors automatically
 * Based on ATLauncher and PrismLauncher implementations
 */

const fs = require('fs-extra')
const path = require('path')
const { spawn } = require('child_process')
const crypto = require('crypto')
const AdmZip = require('adm-zip')
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('ForgeProcessor')

class ForgeProcessorRunner {
    
    /**
     * @param {Object} installProfile - Parsed install_profile.json
     * @param {AdmZip} installerZip - The Forge installer zip
     * @param {Object} versionData - Parsed version.json
     * @param {Object} paths - Required paths
     * @param {string} paths.commonDir - Common directory (.tecnilandnexus/common)
     * @param {string} paths.minecraftJar - Path to minecraft client jar
     * @param {string} paths.javaExecutable - Path to java executable
     * @param {Function} progressCallback - Optional callback for progress updates (current, total, message)
     */
    constructor(installProfile, installerZip, versionData, paths, progressCallback) {
        this.installProfile = installProfile
        this.installerZip = installerZip
        this.versionData = versionData
        this.paths = paths
        this.progressCallback = progressCallback || null
        
        // Extract version info
        this.minecraftVersion = versionData.inheritsFrom || versionData.id.split('-')[0]
        this.forgeVersion = versionData.id
        
        // Directory paths
        this.librariesDir = path.join(paths.commonDir, 'libraries')
        this.versionsDir = path.join(paths.commonDir, 'versions')
        
        // Build variables map
        this.variables = this.buildVariablesMap()
        
        logger.info(`ForgeProcessorRunner initialized for ${this.forgeVersion}`)
        logger.debug(`Minecraft version: ${this.minecraftVersion}`)
        logger.debug(`Libraries dir: ${this.librariesDir}`)
    }
    
    /**
     * Build the variables map for replacements
     */
    buildVariablesMap() {
        const vars = {
            '{SIDE}': 'client',
            '{MINECRAFT_JAR}': this.paths.minecraftJar,
            '{ROOT}': this.librariesDir,
            '{LIBRARY_DIR}': this.librariesDir,
            '{MC_VERSION}': this.minecraftVersion,
            '{INSTALLER}': '__INSTALLER_ZIP__' // Special handling
        }
        
        // Add data variables from install_profile
        if (this.installProfile.data) {
            for (const [key, value] of Object.entries(this.installProfile.data)) {
                if (value.client) {
                    const varName = `{${key}}`
                    // Handle Maven artifact references
                    if (value.client.startsWith('[') && value.client.endsWith(']')) {
                        const artifact = value.client.slice(1, -1)
                        vars[varName] = this.mavenToPath(artifact)
                    } else {
                        vars[varName] = value.client
                    }
                }
            }
        }
        
        logger.debug(`Built ${Object.keys(vars).length} variables for replacement`)
        return vars
    }
    
    /**
     * Convert Maven artifact identifier to local file path
     * Example: net.minecraft:client:1.20.1:mappings@txt → .../net/minecraft/client/1.20.1/client-1.20.1-mappings.txt
     */
    mavenToPath(identifier) {
        // Remove @ extension if present
        let ext = 'jar'
        let id = identifier
        if (identifier.includes('@')) {
            const parts = identifier.split('@')
            id = parts[0]
            ext = parts[1]
        }
        
        // Parse Maven coordinate: group:artifact:version[:classifier]
        const parts = id.split(':')
        if (parts.length < 3) {
            logger.warn(`Invalid Maven identifier: ${identifier}`)
            return identifier
        }
        
        const group = parts[0]
        const artifact = parts[1]
        const version = parts[2]
        const classifier = parts[3] || ''
        
        // Build file name
        const fileName = classifier
            ? `${artifact}-${version}-${classifier}.${ext}`
            : `${artifact}-${version}.${ext}`
        
        // Build full path
        const filePath = path.join(
            this.librariesDir,
            group.replace(/\./g, path.sep),
            artifact,
            version,
            fileName
        )
        
        return filePath
    }
    
    /**
     * Replace variables in argument string
     * Handles {VAR}, [artifact], and /local/paths
     * Data paths are version-specific to prevent cross-version conflicts
     */
    replaceVariables(arg) {
        let result = arg
        
        // Handle Maven artifact references [group:artifact:version]
        const artifactRegex = /\[([^\]]+)\]/g
        result = result.replace(artifactRegex, (match, artifact) => {
            return this.mavenToPath(artifact)
        })
        
        // Handle variable replacements {VAR}
        for (const [varName, varValue] of Object.entries(this.variables)) {
            if (varName === '{INSTALLER}') {
                // Special handling for INSTALLER - extract from zip
                continue
            }
            result = result.replace(new RegExp(varName.replace(/[{}]/g, '\\$&'), 'g'), varValue)
        }
        
        // Handle paths starting with / (relative to libraries)
        // VERSIONED DATA: /data/... paths go to libraries/data/{mcVersion}/...
        if (result.startsWith('/')) {
            const internalPath = result.slice(1)
            if (internalPath.startsWith('data/')) {
                // Version-specific data path
                const relativePath = internalPath.slice(5) // Remove 'data/'
                result = path.join(this.librariesDir, 'data', this.minecraftVersion, relativePath)
            } else {
                result = path.join(this.librariesDir, internalPath)
            }
        }
        
        return result
    }
    
    /**
     * Calculate SHA1 hash of a file
     */
    calculateSHA1(filePath) {
        try {
            const buffer = fs.readFileSync(filePath)
            const hash = crypto.createHash('sha1')
            hash.update(buffer)
            return hash.digest('hex')
        } catch (err) {
            logger.error(`Failed to calculate SHA1 for ${filePath}:`, err.message)
            return null
        }
    }
    
    /**
     * Check if a processor needs to run by validating outputs
     * IMPORTANTE: Los SHA1 dinámicos como {MC_SLIM_SHA} no se resuelven - siempre hay que regenerar
     */
    needToRun(processor) {
        if (!processor.outputs) {
            // No outputs specified, always run
            return true
        }
        
        // Check each output file
        for (const [outputPath, expectedSHA1] of Object.entries(processor.outputs)) {
            const resolvedPath = this.replaceVariables(outputPath)
            
            if (!fs.existsSync(resolvedPath)) {
                logger.debug(`Output missing: ${path.basename(resolvedPath)}`)
                return true
            }
            
            // Si el SHA esperado contiene placeholders no resueltos, ignorar validación
            // Forge usa {MC_SLIM_SHA}, {MC_EXTRA_SHA}, etc. que no podemos resolver
            if (expectedSHA1 && expectedSHA1.includes('{')) {
                logger.debug(`SHA1 contains unresolved placeholder, will re-run: ${expectedSHA1}`)
                // Borrar el archivo existente para forzar regeneración
                try {
                    fs.unlinkSync(resolvedPath)
                    logger.debug(`Deleted cached file: ${path.basename(resolvedPath)}`)
                } catch (err) {
                    logger.warn(`Failed to delete cached file: ${err.message}`)
                }
                return true
            }
            
            // Validate SHA1 if specified and is a valid hash
            if (expectedSHA1 && expectedSHA1 !== '' && expectedSHA1.length === 40) {
                const actualSHA1 = this.calculateSHA1(resolvedPath)
                if (actualSHA1 !== expectedSHA1) {
                    logger.debug(`SHA1 mismatch for ${path.basename(resolvedPath)}`)
                    logger.debug(`  Expected: ${expectedSHA1}`)
                    logger.debug(`  Actual:   ${actualSHA1}`)
                    return true
                }
            }
        }
        
        logger.debug('All outputs valid, skipping processor')
        return false
    }
    
    /**
     * Get list of intermediate files generated by Forge processors
     * These should be deleted when reinstalling to ensure clean state
     */
    getIntermediateFiles() {
        const mcVer = this.minecraftVersion
        const files = []
        
        // Archivos generados por processors en el directorio net/minecraft/client/
        const clientDir = path.join(this.librariesDir, 'net', 'minecraft', 'client')
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
                                    files.push(path.join(verDir, entry))
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                logger.warn(`Error scanning client dir: ${err.message}`)
            }
        }
        
        // Archivos generados en mcp_config/
        const mcpDir = path.join(this.librariesDir, 'de', 'oceanlabs', 'mcp', 'mcp_config')
        if (fs.existsSync(mcpDir)) {
            try {
                const versions = fs.readdirSync(mcpDir)
                for (const ver of versions) {
                    if (ver.includes(mcVer)) {
                        const verDir = path.join(mcpDir, ver)
                        if (fs.statSync(verDir).isDirectory()) {
                            const entries = fs.readdirSync(verDir)
                            for (const entry of entries) {
                                // Solo archivos generados (mappings-merged, etc.)
                                if (entry.includes('-mappings') && !entry.endsWith('.zip')) {
                                    files.push(path.join(verDir, entry))
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
        const forgeDir = path.join(this.librariesDir, 'net', 'minecraftforge', 'forge')
        if (fs.existsSync(forgeDir)) {
            try {
                const versions = fs.readdirSync(forgeDir)
                for (const ver of versions) {
                    if (ver.includes(mcVer)) {
                        const verDir = path.join(forgeDir, ver)
                        if (fs.statSync(verDir).isDirectory()) {
                            const entries = fs.readdirSync(verDir)
                            for (const entry of entries) {
                                if (entry.includes('-client.jar')) {
                                    files.push(path.join(verDir, entry))
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                logger.warn(`Error scanning forge dir: ${err.message}`)
            }
        }
        
        return files
    }
    
    /**
     * Clean all intermediate files generated by previous processor runs
     * This ensures a clean state when reinstalling Forge
     */
    cleanIntermediateFiles() {
        const files = this.getIntermediateFiles()
        let deleted = 0
        
        for (const file of files) {
            try {
                if (fs.existsSync(file)) {
                    fs.unlinkSync(file)
                    logger.debug(`Deleted intermediate file: ${path.basename(file)}`)
                    deleted++
                }
            } catch (err) {
                logger.warn(`Failed to delete ${file}: ${err.message}`)
            }
        }
        
        if (deleted > 0) {
            logger.info(`Cleaned ${deleted} intermediate files from previous installation`)
        }
        
        return deleted
    }
    
    /**
     * Extract a file from the installer zip to a temporary location
     */
    extractFromInstaller(internalPath) {
        try {
            const tempDir = path.join(this.paths.commonDir, 'temp', 'forge-install')
            fs.ensureDirSync(tempDir)
            
            const fileName = path.basename(internalPath)
            const outputPath = path.join(tempDir, fileName)
            
            const entry = this.installerZip.getEntry(internalPath)
            if (!entry) {
                logger.error(`File not found in installer: ${internalPath}`)
                return null
            }
            
            fs.writeFileSync(outputPath, entry.getData())
            logger.debug(`Extracted ${fileName} from installer`)
            
            return outputPath
        } catch (err) {
            logger.error(`Failed to extract ${internalPath}:`, err.message)
            return null
        }
    }
    
    /**
     * Execute a processor (spawn Java process)
     */
    async executeProcessor(processor, index, total) {
        return new Promise(async (resolve, reject) => {
            try {
                // Build classpath
                const classpathEntries = []
                
                // Add processor jar - convert Maven identifier to path if needed
                let processorJar = processor.jar
                let processorMavenId = null
                
                if (processorJar.startsWith('[') && processorJar.endsWith(']')) {
                    processorMavenId = processorJar.slice(1, -1)
                    processorJar = this.mavenToPath(processorMavenId)
                } else if (!processorJar.includes(path.sep)) {
                    // It's a Maven identifier without brackets
                    processorMavenId = processorJar
                    processorJar = this.mavenToPath(processorJar)
                } else {
                    processorJar = this.replaceVariables(processorJar)
                }
                
                // Check if processor jar exists, if not try to download from Maven or extract from installer
                if (!fs.existsSync(processorJar)) {
                    logger.debug(`Processor jar not found at ${processorJar}`)
                    
                    if (processorMavenId) {
                        const parts = processorMavenId.split(':')
                        if (parts.length >= 3) {
                            const group = parts[0].replace(/\./g, '/')
                            const artifact = parts[1]
                            const version = parts[2]
                            const classifier = parts[3] || ''
                            let jarName = `${artifact}-${version}`
                            if (classifier) jarName += `-${classifier}`
                            jarName += '.jar'
                            
                            // Helper function to download from URL
                            const downloadFromUrl = (url, destination) => {
                                return new Promise((resolveDownload, rejectDownload) => {
                                    const https = require('https')
                                    const http = require('http')
                                    const protocol = url.startsWith('https') ? https : http
                                    
                                    protocol.get(url, (response) => {
                                        if (response.statusCode === 200) {
                                            fs.ensureDirSync(path.dirname(destination))
                                            const fileStream = fs.createWriteStream(destination)
                                            response.pipe(fileStream)
                                            fileStream.on('finish', () => {
                                                fileStream.close()
                                                resolveDownload()
                                            })
                                            fileStream.on('error', rejectDownload)
                                        } else if (response.statusCode === 301 || response.statusCode === 302) {
                                            // Handle redirect
                                            rejectDownload(new Error('Redirect'))
                                        } else {
                                            rejectDownload(new Error(`HTTP ${response.statusCode}`))
                                        }
                                    }).on('error', rejectDownload)
                                })
                            }
                            
                            // Try to download from Maven first (for installertools and other tools)
                            const mavenUrls = [
                                `https://maven.minecraftforge.net/${group}/${artifact}/${version}/${jarName}`,
                                `https://repo1.maven.org/maven2/${group}/${artifact}/${version}/${jarName}`
                            ]
                            
                            let downloaded = false
                            for (const url of mavenUrls) {
                                try {
                                    logger.debug(`Trying to download from: ${url}`)
                                    await downloadFromUrl(url, processorJar)
                                    logger.info(`Downloaded ${jarName} from Maven`)
                                    downloaded = true
                                    break
                                } catch (err) {
                                    logger.debug(`Failed to download from ${url}: ${err.message}`)
                                }
                            }
                            
                            // If download failed, try to extract from installer
                            if (!downloaded) {
                                logger.debug('Trying to extract from installer...')
                                const possiblePaths = [
                                    `maven/${group}/${artifact}/${version}/${jarName}`,
                                    `data/${jarName}`,
                                    jarName
                                ]
                                
                                let found = false
                                for (const tryPath of possiblePaths) {
                                    logger.debug(`Looking for ${tryPath} in installer`)
                                    const entry = this.installerZip.getEntry(tryPath)
                                    if (entry) {
                                        fs.ensureDirSync(path.dirname(processorJar))
                                        fs.writeFileSync(processorJar, entry.getData())
                                        logger.info(`Extracted ${jarName} from installer (${tryPath})`)
                                        found = true
                                        break
                                    }
                                }
                                
                                if (!found) {
                                    return reject(new Error(`Processor jar not found in Maven or installer: ${processorMavenId}`))
                                }
                            }
                        }
                    } else {
                        return reject(new Error(`Processor jar not found: ${processorJar}`))
                    }
                }
                
                classpathEntries.push(processorJar)
                
                // Add classpath libraries
                if (processor.classpath) {
                    for (const lib of processor.classpath) {
                        const libPath = this.mavenToPath(lib)
                        if (fs.existsSync(libPath)) {
                            classpathEntries.push(libPath)
                        } else {
                            logger.warn(`Classpath library not found: ${libPath}`)
                        }
                    }
                }
                
                const classpath = classpathEntries.join(path.delimiter)
                
                // Build arguments - use -cp with mainClass
                const args = ['-cp', classpath]
                
                // Extract main class from jar
                const mainClass = this.extractMainClass(processorJar)
                if (!mainClass) {
                    return reject(new Error(`Could not determine main class for ${path.basename(processorJar)}`))
                }
                args.push(mainClass)
                
                // Add processor arguments
                if (processor.args) {
                    for (let arg of processor.args) {
                        // Special handling for INSTALLER references
                        if (arg.includes('{INSTALLER}')) {
                            // Extract the file from installer zip
                            const internalPath = arg.replace('{INSTALLER}', '').replace(/^\//, '')
                            const extractedPath = this.extractFromInstaller(internalPath)
                            if (extractedPath) {
                                args.push(extractedPath)
                            } else {
                                return reject(new Error(`Failed to extract installer file: ${internalPath}`))
                            }
                        } else {
                            args.push(this.replaceVariables(arg))
                        }
                    }
                }
                
                logger.info(`[${index}/${total}] Executing processor: ${path.basename(processorJar)}`)
                logger.debug(`Java: ${this.paths.javaExecutable}`)
                logger.debug(`Args: ${args.slice(2).join(' ')}`) // Skip -cp and classpath
                
                // Spawn Java process
                const javaProcess = spawn(this.paths.javaExecutable, args, {
                    cwd: this.librariesDir
                })
                
                let stdout = ''
                let stderr = ''
                
                javaProcess.stdout.on('data', (data) => {
                    stdout += data.toString()
                })
                
                javaProcess.stderr.on('data', (data) => {
                    stderr += data.toString()
                })
                
                javaProcess.on('close', (code) => {
                    if (code !== 0) {
                        logger.error(`Processor failed with exit code ${code}`)
                        if (stdout) logger.debug(`stdout: ${stdout}`)
                        if (stderr) logger.error(`stderr: ${stderr}`)
                        
                        // Detectar errores específicos para dar información más clara
                        let errorMessage = `Processor exited with code ${code}`
                        
                        if (stderr.includes('checksum') || stderr.includes('Checksum')) {
                            // Error de checksum - archivos intermedios corruptos
                            errorMessage = 'CHECKSUM_MISMATCH: ' + errorMessage
                            logger.error('Detected checksum mismatch - intermediate files may be corrupted')
                        }
                        
                        const error = new Error(errorMessage)
                        error.stdout = stdout
                        error.stderr = stderr
                        error.exitCode = code
                        
                        return reject(error)
                    }
                    
                    logger.info(`[${index}/${total}] Processor completed successfully`)
                    if (stdout) logger.debug(`Output: ${stdout.trim()}`)
                    
                    resolve()
                })
                
                javaProcess.on('error', (err) => {
                    logger.error('Failed to spawn Java process:', err.message)
                    reject(err)
                })
                
                // Set timeout (5 minutes per processor)
                setTimeout(() => {
                    if (!javaProcess.killed) {
                        javaProcess.kill()
                        reject(new Error('Processor timeout (5 minutes exceeded)'))
                    }
                }, 5 * 60 * 1000)
                
            } catch (err) {
                reject(err)
            }
        })
    }
    
    /**
     * Extract main class from jar's MANIFEST.MF
     */
    extractMainClass(jarPath) {
        try {
            const zip = new AdmZip(jarPath)
            const manifestEntry = zip.getEntry('META-INF/MANIFEST.MF')
            
            if (!manifestEntry) {
                logger.warn(`No MANIFEST.MF found in ${path.basename(jarPath)}`)
                return null
            }
            
            const manifestContent = manifestEntry.getData().toString('utf8')
            const mainClassMatch = manifestContent.match(/Main-Class:\s*(.+)/i)
            
            if (mainClassMatch) {
                return mainClassMatch[1].trim()
            }
            
            logger.warn(`No Main-Class in MANIFEST.MF of ${path.basename(jarPath)}`)
            return null
            
        } catch (err) {
            logger.error(`Failed to read MANIFEST.MF from ${jarPath}:`, err.message)
            return null
        }
    }
    
    /**
     * Extract all data files from installer that are referenced in install_profile.data
     * Estos archivos son críticos: mappings, client.lzma, etc.
     * IMPORTANT: Files are now extracted to version-specific directories to prevent
     * cross-version conflicts (e.g., client.lzma from 1.19.4 being used for 1.20.1)
     */
    async extractDataFiles() {
        if (!this.installProfile.data) {
            logger.debug('No data section in install_profile')
            return
        }
        
        let extracted = 0
        
        for (const [, value] of Object.entries(this.installProfile.data)) {
            const clientValue = value.client
            if (!clientValue) continue
            
            // Si el valor empieza con /, es una ruta interna del installer
            if (clientValue.startsWith('/')) {
                const internalPath = clientValue.slice(1) // Quitar el / inicial
                
                // VERSIONED PATH: Extract to libraries/data/{mcVersion}/... instead of libraries/data/...
                // This prevents client.lzma and other files from different MC versions conflicting
                let destPath
                if (internalPath.startsWith('data/')) {
                    // Replace data/ with data/{mcVersion}/
                    const relativePath = internalPath.slice(5) // Remove 'data/'
                    destPath = path.join(this.librariesDir, 'data', this.minecraftVersion, relativePath)
                } else {
                    destPath = path.join(this.librariesDir, internalPath)
                }
                
                // Verificar si ya existe
                if (fs.existsSync(destPath)) {
                    logger.debug(`Data file already exists: ${internalPath}`)
                    continue
                }
                
                // Buscar en el installer
                const possiblePaths = [
                    internalPath,
                    `data/${path.basename(internalPath)}`
                ]
                
                let found = false
                for (const tryPath of possiblePaths) {
                    const entry = this.installerZip.getEntry(tryPath)
                    if (entry) {
                        try {
                            fs.ensureDirSync(path.dirname(destPath))
                            fs.writeFileSync(destPath, entry.getData())
                            logger.debug(`Extracted data file: ${internalPath}`)
                            extracted++
                            found = true
                            break
                        } catch (err) {
                            logger.warn(`Failed to extract ${internalPath}: ${err.message}`)
                        }
                    }
                }
                
                if (!found) {
                    logger.warn(`Data file not found in installer: ${internalPath}`)
                }
            }
        }
        
        logger.info(`Extracted ${extracted} data files from installer`)
    }
    
    /**
     * Run all processors sequentially
     * @param {boolean} forceClean - If true, clean intermediate files before running
     */
    async runAll(forceClean = false) {
        const processors = this.installProfile.processors
        
        if (!processors || processors.length === 0) {
            logger.warn('No processors found in install_profile.json')
            return { success: true, processed: 0 }
        }
        
        // PASO 0: Si forceClean o es una reinstalación, limpiar archivos intermedios
        // Esto evita problemas de checksum mismatch por archivos cacheados corruptos
        if (forceClean) {
            logger.info('=== Cleaning intermediate files (force clean requested) ===')
            this.cleanIntermediateFiles()
        }
        
        // PASO 1: Extraer archivos data/ del installer antes de ejecutar processors
        logger.info('=== Extracting data files from installer ===')
        await this.extractDataFiles()
        
        logger.info(`Found ${processors.length} processors to execute`)
        
        // Filter for client-side processors
        const clientProcessors = processors.filter(p => {
            if (!p.sides) return true // No sides = both
            return p.sides.includes('client')
        })
        
        logger.info(`${clientProcessors.length} processors applicable for client`)
        
        let executed = 0
        
        for (let i = 0; i < clientProcessors.length; i++) {
            const processor = clientProcessors[i]
            const index = i + 1
            const total = clientProcessors.length
            
            logger.info(`\n=== Processor ${index}/${total} ===`)
            logger.debug(`Jar: ${processor.jar}`)
            
            // Report progress
            const processorName = path.basename(processor.jar).replace('.jar', '')
            if (this.progressCallback) {
                this.progressCallback(index, total, `Processing ${processorName}...`)
            }
            
            // Check if we need to run this processor
            if (!this.needToRun(processor)) {
                logger.info(`[${index}/${total}] Skipping (outputs already valid)`)
                continue
            }
            
            // Ensure output directories exist
            if (processor.outputs) {
                for (const outputPath of Object.keys(processor.outputs)) {
                    const resolvedPath = this.replaceVariables(outputPath)
                    const dir = path.dirname(resolvedPath)
                    fs.ensureDirSync(dir)
                }
            }
            
            // Execute the processor
            try {
                await this.executeProcessor(processor, index, total)
                executed++
            } catch (err) {
                logger.error(`Failed to execute processor ${index}/${total}:`, err.message)
                throw err
            }
        }
        
        logger.info('\n=== Forge Processing Complete ===')
        logger.info(`Executed: ${executed}/${clientProcessors.length} processors`)
        
        // Cleanup temp directory
        try {
            const tempDir = path.join(this.paths.commonDir, 'temp', 'forge-install')
            if (fs.existsSync(tempDir)) {
                fs.removeSync(tempDir)
                logger.debug('Cleaned up temporary files')
            }
        } catch (err) {
            logger.warn('Failed to cleanup temp directory:', err.message)
        }
        
        return {
            success: true,
            total: clientProcessors.length,
            executed: executed,
            skipped: clientProcessors.length - executed
        }
    }
}

module.exports = { ForgeProcessorRunner }
