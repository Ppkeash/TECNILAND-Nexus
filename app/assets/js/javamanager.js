/**
 * Java Manager
 * 
 * Gestiona la detección, selección y descarga automática de versiones de Java
 * para cada versión de Minecraft/Forge.
 * 
 * Requisitos de Java por versión de Minecraft:
 * - MC 1.20.5+     → Java 21 (mínimo y recomendado)
 * - MC 1.18 - 1.20.4 → Java 17+ (17-21 son compatibles)
 * - MC 1.17.x      → Java 17+
 * - MC 1.13 - 1.16.5 → Java 8-16 (Forge legacy no funciona con Java 17+)
 */

const { LoggerUtil } = require('helios-core')
const logger = LoggerUtil.getLogger('JavaManager')
const fs = require('fs-extra')
const path = require('path')
const { execSync } = require('child_process')
const os = require('os')

/**
 * Mapeo de versiones de Minecraft a requisitos de Java
 * min: versión mínima requerida
 * max: versión máxima compatible
 * recommended: versión óptima para esta versión de MC
 * 
 * IMPORTANTE: Forge 1.18+ funciona bien con Java 17-21
 * Solo Forge 1.16.5 y anteriores tienen problemas con Java 17+
 */
/**
 * Valid Java distributions supported by helios-core
 * - TEMURIN: Eclipse Temurin (from Adoptium foundation)
 * - CORRETTO: Amazon Corretto
 * - null: Auto-detect by platform (recommended)
 */
const VALID_JAVA_DISTRIBUTIONS = ['TEMURIN', 'CORRETTO']

/**
 * Validate and sanitize Java distribution value
 * @param {string|null} distribution - Distribution to validate
 * @returns {string|null} Valid distribution or null for auto-detection
 */
function validateDistribution(distribution) {
    if (!distribution) return null // null = auto by helios-core (TEMURIN on Win/Linux, CORRETTO on macOS)
    if (!VALID_JAVA_DISTRIBUTIONS.includes(distribution)) {
        logger.warn(`Invalid Java distribution '${distribution}'. Valid options: ${VALID_JAVA_DISTRIBUTIONS.join(', ')}. Falling back to auto-detection (null).`)
        return null
    }
    return distribution
}

const JAVA_REQUIREMENTS = {
    // MC 1.21+ requiere Java 21
    '1.21.4': { min: 21, max: 23, recommended: 21 },
    '1.21.3': { min: 21, max: 23, recommended: 21 },
    '1.21.2': { min: 21, max: 23, recommended: 21 },
    '1.21.1': { min: 21, max: 23, recommended: 21 },
    '1.21': { min: 21, max: 23, recommended: 21 },
    // MC 1.20.5+ requiere Java 21
    '1.20.6': { min: 21, max: 23, recommended: 21 },
    '1.20.5': { min: 21, max: 23, recommended: 21 },
    // MC 1.18 - 1.20.4: Java 17 mínimo, compatible con Java 17-21
    '1.20.4': { min: 17, max: 21, recommended: 17 },
    '1.20.3': { min: 17, max: 21, recommended: 17 },
    '1.20.2': { min: 17, max: 21, recommended: 17 },
    '1.20.1': { min: 17, max: 21, recommended: 17 },
    '1.20': { min: 17, max: 21, recommended: 17 },
    '1.19.4': { min: 17, max: 21, recommended: 17 },
    '1.19.3': { min: 17, max: 21, recommended: 17 },
    '1.19.2': { min: 17, max: 21, recommended: 17 },
    '1.19.1': { min: 17, max: 21, recommended: 17 },
    '1.19': { min: 17, max: 21, recommended: 17 },
    '1.18.2': { min: 17, max: 21, recommended: 17 },
    '1.18.1': { min: 17, max: 21, recommended: 17 },
    '1.18': { min: 17, max: 21, recommended: 17 },
    // MC 1.17.x requiere Java 16+, pero 17 es más estable
    '1.17.1': { min: 16, max: 21, recommended: 17 },
    '1.17': { min: 16, max: 21, recommended: 17 },
    // MC 1.13 - 1.16.5: Java 8 recomendado
    // IMPORTANTE: Forge para estas versiones NO funciona bien con Java 17+
    // Máximo Java 16 para evitar problemas con CoreMods
    '1.16.5': { min: 8, max: 16, recommended: 8 },
    '1.16.4': { min: 8, max: 16, recommended: 8 },
    '1.16.3': { min: 8, max: 16, recommended: 8 },
    '1.16.2': { min: 8, max: 16, recommended: 8 },
    '1.16.1': { min: 8, max: 16, recommended: 8 },
    '1.16': { min: 8, max: 16, recommended: 8 },
    '1.15.2': { min: 8, max: 16, recommended: 8 },
    '1.15.1': { min: 8, max: 16, recommended: 8 },
    '1.15': { min: 8, max: 16, recommended: 8 },
    '1.14.4': { min: 8, max: 16, recommended: 8 },
    '1.14.3': { min: 8, max: 16, recommended: 8 },
    '1.14.2': { min: 8, max: 16, recommended: 8 },
    '1.14.1': { min: 8, max: 16, recommended: 8 },
    '1.14': { min: 8, max: 16, recommended: 8 },
    '1.13.2': { min: 8, max: 16, recommended: 8 },
    '1.13.1': { min: 8, max: 16, recommended: 8 },
    '1.13': { min: 8, max: 16, recommended: 8 }
}

// Default para versiones no listadas (asumimos MC moderno)
const DEFAULT_JAVA_REQUIREMENT = { min: 17, max: 21, recommended: 17 }

/**
 * Cache de instalaciones de Java detectadas
 */
let javaInstallationsCache = null
let cacheTimestamp = 0
const CACHE_TTL = 60000 // 1 minuto

/**
 * Obtener requisitos de Java para una versión de Minecraft
 * @param {string} mcVersion - Versión de Minecraft (ej: "1.20.1")
 * @returns {Object} { min, max, recommended }
 */
function getJavaRequirements(mcVersion) {
    if (!mcVersion) {
        logger.warn('No MC version provided, using defaults')
        return DEFAULT_JAVA_REQUIREMENT
    }
    
    // Buscar exactamente
    if (JAVA_REQUIREMENTS[mcVersion]) {
        return JAVA_REQUIREMENTS[mcVersion]
    }
    
    // Buscar por prefijo (ej: 1.20.1 → buscar 1.20)
    const parts = mcVersion.split('.')
    if (parts.length >= 2) {
        const majorMinor = parts.slice(0, 2).join('.')
        if (JAVA_REQUIREMENTS[majorMinor]) {
            return JAVA_REQUIREMENTS[majorMinor]
        }
        
        // Inferir basado en número de versión
        const minor = parseInt(parts[1])
        if (minor >= 21) {
            return { min: 21, max: 23, recommended: 21 }
        } else if (minor >= 20) {
            // 1.20.5+ = Java 21, 1.20-1.20.4 = Java 17-21
            if (parts.length >= 3) {
                const patch = parseInt(parts[2])
                if (patch >= 5) {
                    return { min: 21, max: 23, recommended: 21 }
                }
            }
            return { min: 17, max: 21, recommended: 17 }
        } else if (minor >= 17) {
            return { min: 17, max: 21, recommended: 17 }
        } else if (minor >= 13) {
            return { min: 8, max: 16, recommended: 8 }
        }
    }
    
    logger.warn(`No Java requirements defined for MC ${mcVersion}, using defaults`)
    return DEFAULT_JAVA_REQUIREMENT
}

/**
 * Detectar todas las instalaciones de Java en el sistema
 * @returns {Promise<Array>} Lista de instalaciones de Java
 */
async function detectJavaInstallations() {
    // Usar cache si es válido
    const now = Date.now()
    if (javaInstallationsCache && (now - cacheTimestamp) < CACHE_TTL) {
        return javaInstallationsCache
    }
    
    logger.info('Detectando instalaciones de Java...')
    const installations = []
    
    const platform = os.platform()
    
    if (platform === 'win32') {
        // Windows: buscar en ubicaciones conocidas
        const searchPaths = [
            'C:\\Program Files\\Java',
            'C:\\Program Files (x86)\\Java',
            'C:\\Program Files\\Eclipse Adoptium',
            'C:\\Program Files\\Eclipse Foundation',
            'C:\\Program Files\\AdoptOpenJDK',
            'C:\\Program Files\\Microsoft\\jdk-17*',
            'C:\\Program Files\\Microsoft\\jdk-21*',
            'C:\\Program Files\\Zulu',
            'C:\\Program Files\\BellSoft',
            'C:\\Program Files\\Amazon Corretto',
            'C:\\Program Files\\Temurin',
            path.join(os.homedir(), '.jdks'),
            path.join(os.homedir(), 'scoop', 'apps', 'java', 'current'),
            path.join(os.homedir(), 'scoop', 'apps', 'temurin*-jdk', 'current'),
            path.join(os.homedir(), 'scoop', 'apps', 'openjdk*', 'current')
        ]
        
        for (const searchPath of searchPaths) {
            try {
                // Manejar wildcards
                if (searchPath.includes('*')) {
                    const basePath = path.dirname(searchPath)
                    const pattern = path.basename(searchPath).replace(/\*/g, '.*')
                    if (await fs.pathExists(basePath)) {
                        const entries = await fs.readdir(basePath)
                        for (const entry of entries) {
                            if (new RegExp(`^${pattern}$`).test(entry)) {
                                const fullPath = path.join(basePath, entry)
                                await checkJavaPath(fullPath, installations)
                            }
                        }
                    }
                } else if (await fs.pathExists(searchPath)) {
                    // Buscar subdirectorios
                    const entries = await fs.readdir(searchPath)
                    for (const entry of entries) {
                        const fullPath = path.join(searchPath, entry)
                        await checkJavaPath(fullPath, installations)
                    }
                    // También verificar el path directo
                    await checkJavaPath(searchPath, installations)
                }
            } catch (err) {
                // Ignorar errores de acceso
            }
        }
        
        // También verificar JAVA_HOME
        if (process.env.JAVA_HOME) {
            await checkJavaPath(process.env.JAVA_HOME, installations)
        }
        
    } else if (platform === 'darwin') {
        // macOS
        const searchPaths = [
            '/Library/Java/JavaVirtualMachines',
            '/System/Library/Java/JavaVirtualMachines',
            path.join(os.homedir(), '.sdkman', 'candidates', 'java'),
            '/opt/homebrew/opt/openjdk@17',
            '/opt/homebrew/opt/openjdk@21',
            '/opt/homebrew/opt/openjdk'
        ]
        
        for (const searchPath of searchPaths) {
            try {
                if (await fs.pathExists(searchPath)) {
                    const entries = await fs.readdir(searchPath)
                    for (const entry of entries) {
                        const fullPath = path.join(searchPath, entry)
                        const contentsPath = path.join(fullPath, 'Contents', 'Home')
                        if (await fs.pathExists(contentsPath)) {
                            await checkJavaPath(contentsPath, installations)
                        } else {
                            await checkJavaPath(fullPath, installations)
                        }
                    }
                }
            } catch (err) {
                // Ignorar
            }
        }
        
    } else {
        // Linux
        const searchPaths = [
            '/usr/lib/jvm',
            '/usr/java',
            '/opt/java',
            path.join(os.homedir(), '.sdkman', 'candidates', 'java'),
            path.join(os.homedir(), '.jdks')
        ]
        
        for (const searchPath of searchPaths) {
            try {
                if (await fs.pathExists(searchPath)) {
                    const entries = await fs.readdir(searchPath)
                    for (const entry of entries) {
                        const fullPath = path.join(searchPath, entry)
                        await checkJavaPath(fullPath, installations)
                    }
                }
            } catch (err) {
                // Ignorar
            }
        }
    }
    
    // Ordenar por versión (mayor primero)
    installations.sort((a, b) => b.majorVersion - a.majorVersion)
    
    logger.info(`Encontradas ${installations.length} instalaciones de Java`)
    for (const inst of installations) {
        logger.debug(`  Java ${inst.majorVersion} (${inst.version}) - ${inst.path}`)
    }
    
    // Guardar en cache
    javaInstallationsCache = installations
    cacheTimestamp = now
    
    return installations
}

/**
 * Verificar si un path contiene una instalación de Java válida
 * @param {string} javaHome - Path al directorio de Java
 * @param {Array} installations - Array donde agregar la instalación
 */
async function checkJavaPath(javaHome, installations) {
    try {
        const platform = os.platform()
        const javaExe = platform === 'win32' 
            ? path.join(javaHome, 'bin', 'java.exe')
            : path.join(javaHome, 'bin', 'java')
        
        const javawExe = platform === 'win32'
            ? path.join(javaHome, 'bin', 'javaw.exe')
            : javaExe
        
        if (!(await fs.pathExists(javaExe))) {
            return
        }
        
        // Obtener versión
        const versionInfo = await getJavaVersion(javaExe)
        if (!versionInfo) {
            return
        }
        
        // Verificar si ya existe (evitar duplicados)
        const exists = installations.some(i => 
            i.majorVersion === versionInfo.major && 
            i.path === javaHome
        )
        
        if (!exists) {
            installations.push({
                path: javaHome,
                executable: javaExe,
                executableW: javawExe,
                version: versionInfo.full,
                majorVersion: versionInfo.major,
                vendor: versionInfo.vendor || 'Unknown'
            })
        }
    } catch (err) {
        // Ignorar errores
    }
}

/**
 * Obtener la versión de Java de un ejecutable
 * @param {string} javaExe - Path al ejecutable de Java
 * @returns {Object|null} { full, major, vendor }
 */
async function getJavaVersion(javaExe) {
    return new Promise((resolve) => {
        try {
            const result = execSync(`"${javaExe}" -version 2>&1`, { 
                encoding: 'utf8',
                timeout: 5000,
                windowsHide: true
            })
            
            // Parsear la salida
            const versionMatch = result.match(/version "([^"]+)"/)
            if (!versionMatch) {
                resolve(null)
                return
            }
            
            const fullVersion = versionMatch[1]
            let major
            
            // Parsear major version
            if (fullVersion.startsWith('1.')) {
                // Java 8 y anteriores: 1.8.0_xxx → major = 8
                major = parseInt(fullVersion.split('.')[1])
            } else {
                // Java 9+: 17.0.5 → major = 17
                major = parseInt(fullVersion.split('.')[0])
            }
            
            // Detectar vendor
            let vendor = 'Unknown'
            if (result.includes('OpenJDK')) {
                vendor = 'OpenJDK'
            } else if (result.includes('Oracle')) {
                vendor = 'Oracle'
            } else if (result.includes('Temurin')) {
                vendor = 'Eclipse Temurin'
            } else if (result.includes('Zulu')) {
                vendor = 'Azul Zulu'
            } else if (result.includes('Corretto')) {
                vendor = 'Amazon Corretto'
            } else if (result.includes('Microsoft')) {
                vendor = 'Microsoft'
            } else if (result.includes('GraalVM')) {
                vendor = 'GraalVM'
            }
            
            resolve({
                full: fullVersion,
                major: major,
                vendor: vendor
            })
        } catch (err) {
            resolve(null)
        }
    })
}

/**
 * Seleccionar la mejor instalación de Java para una versión de Minecraft
 * @param {string} mcVersion - Versión de Minecraft
 * @param {Array} installations - Lista de instalaciones disponibles
 * @returns {Object|null} Instalación de Java seleccionada o null
 */
function selectBestJava(mcVersion, installations) {
    if (!installations || installations.length === 0) {
        return null
    }
    
    const req = getJavaRequirements(mcVersion)
    
    // Filtrar instalaciones compatibles
    const compatible = installations.filter(inst => 
        inst.majorVersion >= req.min && inst.majorVersion <= req.max
    )
    
    if (compatible.length === 0) {
        logger.warn(`No compatible Java found for MC ${mcVersion}. Required: Java ${req.min}-${req.max}`)
        logger.warn(`Installed versions: ${installations.map(i => i.majorVersion).join(', ')}`)
        return null
    }
    
    // Preferir la versión recomendada exacta
    const recommended = compatible.find(inst => inst.majorVersion === req.recommended)
    if (recommended) {
        logger.info(`Found recommended Java ${req.recommended} for MC ${mcVersion}`)
        return recommended
    }
    
    // Si no hay recomendada, usar la más cercana a la recomendada
    compatible.sort((a, b) => {
        const diffA = Math.abs(a.majorVersion - req.recommended)
        const diffB = Math.abs(b.majorVersion - req.recommended)
        return diffA - diffB
    })
    
    logger.info(`Using Java ${compatible[0].majorVersion} for MC ${mcVersion} (recommended: ${req.recommended})`)
    return compatible[0]
}

/**
 * Verificar si un ejecutable de Java es compatible con una versión de Minecraft
 * @param {string} javaExe - Path al ejecutable de Java
 * @param {string} mcVersion - Versión de Minecraft
 * @returns {Promise<Object>} { compatible, majorVersion, requirements, message }
 */
async function validateJavaForMinecraft(javaExe, mcVersion) {
    const req = getJavaRequirements(mcVersion)
    
    if (!javaExe) {
        return {
            compatible: false,
            majorVersion: null,
            requirements: req,
            message: 'No se ha configurado Java'
        }
    }
    
    // Verificar que el archivo existe
    if (!(await fs.pathExists(javaExe))) {
        return {
            compatible: false,
            majorVersion: null,
            requirements: req,
            message: `El ejecutable de Java no existe: ${javaExe}`
        }
    }
    
    // Obtener versión del Java configurado
    const versionInfo = await getJavaVersion(javaExe)
    if (!versionInfo) {
        return {
            compatible: false,
            majorVersion: null,
            requirements: req,
            message: 'No se pudo determinar la versión del Java configurado'
        }
    }
    
    // Verificar compatibilidad
    const isCompatible = versionInfo.major >= req.min && versionInfo.major <= req.max
    
    if (isCompatible) {
        return {
            compatible: true,
            majorVersion: versionInfo.major,
            requirements: req,
            message: `Java ${versionInfo.major} es compatible con Minecraft ${mcVersion}`
        }
    } else {
        return {
            compatible: false,
            majorVersion: versionInfo.major,
            requirements: req,
            message: `Java ${versionInfo.major} no es compatible con Minecraft ${mcVersion}. ` +
                     `Se requiere Java ${req.min}${req.max !== req.min ? '-' + req.max : ''} (recomendado: Java ${req.recommended})`
        }
    }
}

/**
 * Obtener el Java apropiado para una versión de Minecraft
 * Primero verifica el configurado, luego busca en el sistema
 * @param {string} mcVersion - Versión de Minecraft
 * @param {string} configuredJava - Java configurado por el usuario (opcional)
 * @returns {Promise<Object>} Resultado completo
 */
async function resolveJavaForMinecraft(mcVersion, configuredJava = null) {
    const req = getJavaRequirements(mcVersion)
    
    logger.info(`Resolving Java for Minecraft ${mcVersion}`)
    logger.info(`Requirements: Java ${req.min}-${req.max} (recommended: ${req.recommended})`)
    
    // 1. Si hay Java configurado, verificar si es compatible
    if (configuredJava) {
        const validation = await validateJavaForMinecraft(configuredJava, mcVersion)
        
        if (validation.compatible) {
            logger.info(`Configured Java ${validation.majorVersion} is compatible`)
            return {
                success: true,
                executable: configuredJava,
                majorVersion: validation.majorVersion,
                source: 'configured',
                requirements: req,
                message: validation.message
            }
        } else {
            logger.warn(`Configured Java is not compatible: ${validation.message}`)
            // Continuar buscando alternativas
        }
    }
    
    // 2. Buscar en el sistema
    const installations = await detectJavaInstallations()
    const bestJava = selectBestJava(mcVersion, installations)
    
    if (bestJava) {
        return {
            success: true,
            executable: bestJava.executableW || bestJava.executable,
            path: bestJava.path,
            majorVersion: bestJava.majorVersion,
            version: bestJava.version,
            vendor: bestJava.vendor,
            source: 'detected',
            requirements: req,
            message: `Usando Java ${bestJava.majorVersion} (${bestJava.vendor}) detectado automáticamente`
        }
    }
    
    // 3. No hay Java compatible - necesita descarga
    const installedVersions = installations.map(i => `Java ${i.majorVersion}`).join(', ') || 'ninguna'
    
    return {
        success: false,
        executable: null,
        majorVersion: null,
        source: 'none',
        requirements: req,
        needsDownload: true,
        installedVersions: installedVersions,
        configuredJavaIncompatible: configuredJava ? true : false,
        message: `No se encontró Java compatible para Minecraft ${mcVersion}. ` +
                 `Se requiere Java ${req.min}-${req.max}. Versiones instaladas: ${installedVersions}`
    }
}

/**
 * Genera las opciones de Java efectivas para integrar con el sistema existente
 * Compatible con el formato effectiveJavaOptions usado en landing.js
 * @param {string} mcVersion - Versión de Minecraft
 * @returns {Object} effectiveJavaOptions compatible
 */
function generateEffectiveJavaOptions(mcVersion) {
    const req = getJavaRequirements(mcVersion)
    
    // Generar string de versiones soportadas
    let supported = `>=${req.min}.x`
    
    return {
        supported: supported,
        suggestedMajor: req.recommended,
        distribution: null // Auto-detect by platform (TEMURIN on Win/Linux, CORRETTO on macOS)
    }
}

/**
 * Invalida el cache de Java (llamar después de descargar/instalar Java)
 */
function invalidateCache() {
    javaInstallationsCache = null
    cacheTimestamp = 0
    logger.info('Cache de instalaciones de Java invalidado')
}

/**
 * Verificar si hay Java compatible disponible en el sistema
 * @param {string} mcVersion - Versión de Minecraft
 * @returns {Promise<boolean>}
 */
async function hasCompatibleJava(mcVersion) {
    const result = await resolveJavaForMinecraft(mcVersion)
    return result.success
}

/**
 * Obtener información de depuración sobre todas las instalaciones de Java
 * @returns {Promise<Object>} Información de debug
 */
async function getDebugInfo() {
    const installations = await detectJavaInstallations()
    
    return {
        platform: os.platform(),
        arch: os.arch(),
        javaHome: process.env.JAVA_HOME || 'no definido',
        installationsCount: installations.length,
        installations: installations.map(i => ({
            path: i.path,
            version: i.version,
            majorVersion: i.majorVersion,
            vendor: i.vendor
        }))
    }
}

module.exports = {
    // Funciones principales
    resolveJavaForMinecraft,
    validateJavaForMinecraft,
    detectJavaInstallations,
    selectBestJava,
    
    // Utilidades
    getJavaRequirements,
    generateEffectiveJavaOptions,
    hasCompatibleJava,
    invalidateCache,
    getDebugInfo,
    getJavaVersion,
    validateDistribution,
    
    // Constantes
    JAVA_REQUIREMENTS,
    DEFAULT_JAVA_REQUIREMENT,
    VALID_JAVA_DISTRIBUTIONS
}
