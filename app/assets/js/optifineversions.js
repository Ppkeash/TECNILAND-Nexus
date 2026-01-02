/**
 * OptiFine Versions Detector
 * 
 * Este módulo escanea las versiones instaladas en .tecnilandnexus/common/versions
 * y detecta cuáles son versiones de OptiFine, permitiendo seleccionarlas
 * para instalaciones Vanilla.
 * 
 * NO ejecuta el instalador de OptiFine ni modifica archivos.
 * Solo DETECTA versiones OptiFine ya instaladas por el usuario.
 */

const fs = require('fs-extra')
const path = require('path')
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('OptiFineVersions')

/**
 * Estructura de una versión OptiFine detectada
 * @typedef {Object} OptiFineVersion
 * @property {string} id - ID completo de la versión (ej: "1.20.1-OptiFine_HD_U_I6")
 * @property {string} baseVersion - Versión base de Minecraft (ej: "1.20.1")
 * @property {string} optifineVersion - Versión de OptiFine (ej: "HD_U_I6")
 * @property {string} displayName - Nombre legible para mostrar en UI
 * @property {string} versionJsonPath - Ruta completa al version.json
 */

/**
 * Cache de versiones OptiFine detectadas
 * @type {Map<string, OptiFineVersion[]>}
 */
let optifineCache = new Map()

/**
 * Timestamp de la última actualización del cache
 * @type {number}
 */
let cacheTimestamp = 0

/**
 * Tiempo de vida del cache en milisegundos (30 segundos)
 */
const CACHE_TTL = 30000

/**
 * Obtener el directorio de versiones del launcher
 * @returns {string} Ruta al directorio common/versions
 */
function getVersionsDirectory() {
    const ConfigManager = require('./configmanager')
    return path.join(ConfigManager.getCommonDirectory(), 'versions')
}

/**
 * Verificar si un version.json corresponde a OptiFine
 * 
 * Criterios de detección:
 * 1. El ID contiene "OptiFine" (case-insensitive)
 * 2. Las libraries contienen "optifine:OptiFine" o "optifine:launchwrapper"
 * 3. El mainClass es de OptiFine (net.minecraft.launchwrapper.Launch para versiones antiguas)
 * 
 * @param {Object} versionJson - Contenido del version.json parseado
 * @returns {boolean} True si es una versión OptiFine
 */
function isOptiFineVersion(versionJson) {
    if (!versionJson || !versionJson.id) {
        return false
    }

    // Criterio 1: ID contiene "OptiFine"
    if (versionJson.id.toLowerCase().includes('optifine')) {
        return true
    }

    // Criterio 2: Libraries contienen OptiFine
    if (versionJson.libraries && Array.isArray(versionJson.libraries)) {
        for (const lib of versionJson.libraries) {
            const libName = lib.name || ''
            if (libName.toLowerCase().includes('optifine:optifine') ||
                libName.toLowerCase().includes('optifine:launchwrapper')) {
                return true
            }
        }
    }

    return false
}

/**
 * Extraer la versión base de Minecraft de un ID de OptiFine
 * 
 * Ejemplos:
 * - "1.20.1-OptiFine_HD_U_I6" -> "1.20.1"
 * - "1.19.4-OptiFine_HD_U_I4" -> "1.19.4"
 * - "OptiFine_1.20.1_HD_U_I6" -> "1.20.1"
 * 
 * @param {string} optifineId - ID de la versión OptiFine
 * @param {Object} versionJson - version.json para fallback (inheritsFrom)
 * @returns {string|null} Versión base de Minecraft o null si no se puede determinar
 */
function extractBaseVersion(optifineId, versionJson) {
    // Primero intentar con inheritsFrom (más confiable)
    if (versionJson.inheritsFrom) {
        return versionJson.inheritsFrom
    }

    // Patrón común: X.XX.X-OptiFine_...
    const dashPattern = /^(\d+\.\d+(?:\.\d+)?)-OptiFine/i
    const dashMatch = optifineId.match(dashPattern)
    if (dashMatch) {
        return dashMatch[1]
    }

    // Patrón alternativo: OptiFine_X.XX.X_...
    const underscorePattern = /OptiFine[_-](\d+\.\d+(?:\.\d+)?)[_-]/i
    const underscoreMatch = optifineId.match(underscorePattern)
    if (underscoreMatch) {
        return underscoreMatch[1]
    }

    // Buscar cualquier versión semántica en el ID
    const semverPattern = /(\d+\.\d+(?:\.\d+)?)/
    const semverMatch = optifineId.match(semverPattern)
    if (semverMatch) {
        return semverMatch[1]
    }

    return null
}

/**
 * Extraer la versión específica de OptiFine del ID
 * 
 * @param {string} optifineId - ID completo (ej: "1.20.1-OptiFine_HD_U_I6")
 * @returns {string} Versión de OptiFine (ej: "HD_U_I6") o ID completo si no se puede extraer
 */
function extractOptiFineVersion(optifineId) {
    // Patrón: cualquier cosa después de "OptiFine_" o "OptiFine-"
    const pattern = /OptiFine[_-](.+)$/i
    const match = optifineId.match(pattern)
    
    if (match) {
        return match[1]
    }

    // Si el ID contiene OptiFine pero no coincide con el patrón, retornar todo después del guión
    const dashIndex = optifineId.indexOf('-')
    if (dashIndex !== -1) {
        return optifineId.substring(dashIndex + 1)
    }

    return optifineId
}

/**
 * Crear nombre legible para mostrar en la UI
 * 
 * @param {string} optifineId - ID completo de OptiFine
 * @param {string} optifineVersion - Versión extraída de OptiFine
 * @returns {string} Nombre legible
 */
function createDisplayName(optifineId, optifineVersion) {
    // Limpiar underscores y formatear
    const cleanVersion = optifineVersion.replace(/_/g, ' ')
    return `OptiFine ${cleanVersion}`
}

/**
 * Escanear el directorio de versiones y detectar todas las versiones OptiFine
 * 
 * @param {boolean} forceRefresh - Forzar re-escaneo ignorando cache
 * @returns {Promise<Map<string, OptiFineVersion[]>>} Mapa de versión MC -> array de OptiFine
 */
async function scanOptiFineVersions(forceRefresh = false) {
    const now = Date.now()
    
    // Verificar cache
    if (!forceRefresh && optifineCache.size > 0 && (now - cacheTimestamp) < CACHE_TTL) {
        logger.debug('Usando cache de versiones OptiFine')
        return optifineCache
    }

    logger.info('Escaneando versiones OptiFine en disco...')
    
    const versionsDir = getVersionsDirectory()
    const newCache = new Map()

    // Verificar que el directorio existe
    if (!await fs.pathExists(versionsDir)) {
        logger.info('Directorio de versiones no existe, no hay OptiFine instalado')
        optifineCache = newCache
        cacheTimestamp = now
        return newCache
    }

    try {
        // Leer todas las carpetas en versions/
        const entries = await fs.readdir(versionsDir, { withFileTypes: true })
        
        for (const entry of entries) {
            if (!entry.isDirectory()) continue

            const versionId = entry.name
            const versionJsonPath = path.join(versionsDir, versionId, `${versionId}.json`)

            // Verificar que existe version.json
            if (!await fs.pathExists(versionJsonPath)) {
                continue
            }

            try {
                // Leer y parsear version.json
                const versionJsonContent = await fs.readFile(versionJsonPath, 'utf-8')
                const versionJson = JSON.parse(versionJsonContent)

                // Verificar si es OptiFine
                if (!isOptiFineVersion(versionJson)) {
                    continue
                }

                // Extraer información
                const baseVersion = extractBaseVersion(versionId, versionJson)
                if (!baseVersion) {
                    logger.warn(`No se pudo determinar versión base para OptiFine: ${versionId}`)
                    continue
                }

                const optifineVersion = extractOptiFineVersion(versionId)
                const displayName = createDisplayName(versionId, optifineVersion)

                /** @type {OptiFineVersion} */
                const optiFineEntry = {
                    id: versionId,
                    baseVersion,
                    optifineVersion,
                    displayName,
                    versionJsonPath
                }

                // Agregar al mapa por versión base
                if (!newCache.has(baseVersion)) {
                    newCache.set(baseVersion, [])
                }
                newCache.get(baseVersion).push(optiFineEntry)

                logger.info(`OptiFine detectado: ${versionId} (base: ${baseVersion})`)

            } catch (parseError) {
                logger.warn(`Error parseando version.json de ${versionId}:`, parseError.message)
            }
        }

        // Ordenar cada array por versión de OptiFine (más reciente primero)
        for (const [, versions] of newCache) {
            versions.sort((a, b) => b.optifineVersion.localeCompare(a.optifineVersion))
        }

        logger.info(`Escaneo completado: ${newCache.size} versiones de MC con OptiFine`)
        
        // Actualizar cache
        optifineCache = newCache
        cacheTimestamp = now

        return newCache

    } catch (error) {
        logger.error('Error escaneando versiones OptiFine:', error)
        return new Map()
    }
}

/**
 * Obtener versiones OptiFine disponibles para una versión específica de Minecraft
 * 
 * @param {string} mcVersion - Versión de Minecraft (ej: "1.20.1")
 * @param {boolean} forceRefresh - Forzar re-escaneo del disco
 * @returns {Promise<OptiFineVersion[]>} Array de versiones OptiFine disponibles (vacío si no hay)
 */
async function getOptiFineVersionsByBase(mcVersion, forceRefresh = false) {
    const cache = await scanOptiFineVersions(forceRefresh)
    return cache.get(mcVersion) || []
}

/**
 * Verificar si existe una versión OptiFine específica en disco
 * 
 * @param {string} optifineVersionId - ID de la versión OptiFine (ej: "1.20.1-OptiFine_HD_U_I6")
 * @returns {Promise<boolean>} True si existe
 */
async function optiFineVersionExists(optifineVersionId) {
    const versionsDir = getVersionsDirectory()
    const versionJsonPath = path.join(versionsDir, optifineVersionId, `${optifineVersionId}.json`)
    return await fs.pathExists(versionJsonPath)
}

/**
 * Obtener el version.json de una versión OptiFine específica
 * 
 * @param {string} optifineVersionId - ID de la versión OptiFine
 * @returns {Promise<Object|null>} Contenido del version.json o null si no existe
 */
async function getOptiFineVersionJson(optifineVersionId) {
    const versionsDir = getVersionsDirectory()
    const versionJsonPath = path.join(versionsDir, optifineVersionId, `${optifineVersionId}.json`)

    if (!await fs.pathExists(versionJsonPath)) {
        logger.error(`version.json de OptiFine no encontrado: ${versionJsonPath}`)
        return null
    }

    try {
        const content = await fs.readFile(versionJsonPath, 'utf-8')
        return JSON.parse(content)
    } catch (error) {
        logger.error(`Error leyendo version.json de OptiFine ${optifineVersionId}:`, error)
        return null
    }
}

/**
 * Invalidar el cache de versiones OptiFine
 * Útil cuando el usuario instala una nueva versión de OptiFine
 */
function invalidateCache() {
    optifineCache.clear()
    cacheTimestamp = 0
    logger.info('Cache de OptiFine invalidado')
}

/**
 * Obtener todas las versiones OptiFine detectadas (todas las versiones de MC)
 * 
 * @param {boolean} forceRefresh - Forzar re-escaneo
 * @returns {Promise<OptiFineVersion[]>} Array plano de todas las versiones
 */
async function getAllOptiFineVersions(forceRefresh = false) {
    const cache = await scanOptiFineVersions(forceRefresh)
    const allVersions = []
    
    for (const versions of cache.values()) {
        allVersions.push(...versions)
    }
    
    return allVersions
}

/**
 * @typedef {Object} AutoProfile
 * @property {string} id - ID único del auto-profile (mismo que versionId de OptiFine)
 * @property {string} type - Tipo de auto-profile: 'optifine'
 * @property {string} name - Nombre legible para mostrar
 * @property {string} minecraftVersion - Versión base de Minecraft
 * @property {string} versionId - ID de la versión en versions/ (ej: "1.20.1-OptiFine_HD_U_I6")
 * @property {string} versionJsonPath - Ruta completa al version.json
 * @property {string} displayVersion - Versión de OptiFine para mostrar
 */

/**
 * Obtener todos los "auto-profiles" instalados en commonDir/versions
 * 
 * Esta función detecta versiones de OptiFine (y en el futuro otros perfiles auto-generados)
 * que se muestran directamente en la lista de instalaciones sin necesidad de crear
 * una instalación personalizada.
 * 
 * @param {boolean} forceRefresh - Forzar re-escaneo del disco
 * @returns {Promise<AutoProfile[]>} Array de auto-profiles detectados
 */
async function getAllInstalledProfiles(forceRefresh = false) {
    const profiles = []
    
    // Obtener todas las versiones OptiFine
    const optifineVersions = await getAllOptiFineVersions(forceRefresh)
    
    for (const optifine of optifineVersions) {
        /** @type {AutoProfile} */
        const profile = {
            id: `autoprofile-optifine-${optifine.id}`,
            type: 'optifine',
            name: `OptiFine ${optifine.optifineVersion.replace(/_/g, ' ')}`,
            minecraftVersion: optifine.baseVersion,
            versionId: optifine.id,
            versionJsonPath: optifine.versionJsonPath,
            displayVersion: optifine.optifineVersion
        }
        
        profiles.push(profile)
    }
    
    // Ordenar por versión de Minecraft (más reciente primero)
    profiles.sort((a, b) => {
        // Comparar versiones de MC
        const aParts = a.minecraftVersion.split('.').map(Number)
        const bParts = b.minecraftVersion.split('.').map(Number)
        
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const aNum = aParts[i] || 0
            const bNum = bParts[i] || 0
            if (aNum !== bNum) return bNum - aNum
        }
        
        // Si misma versión MC, ordenar por versión OptiFine
        return b.displayVersion.localeCompare(a.displayVersion)
    })
    
    logger.info(`Auto-profiles detectados: ${profiles.length} (OptiFine)`)
    
    return profiles
}

/**
 * Obtener un auto-profile específico por su ID
 * 
 * @param {string} profileId - ID del auto-profile (ej: "autoprofile-optifine-1.20.1-OptiFine_HD_U_I6")
 * @returns {Promise<AutoProfile|null>} Auto-profile o null si no existe
 */
async function getAutoProfileById(profileId) {
    const profiles = await getAllInstalledProfiles()
    return profiles.find(p => p.id === profileId) || null
}

/**
 * Verificar si un ID corresponde a un auto-profile
 * 
 * @param {string} id - ID a verificar
 * @returns {boolean} True si es un auto-profile ID
 */
function isAutoProfileId(id) {
    return id && id.startsWith('autoprofile-')
}

// Exportar funciones públicas
module.exports = {
    scanOptiFineVersions,
    getOptiFineVersionsByBase,
    optiFineVersionExists,
    getOptiFineVersionJson,
    invalidateCache,
    getAllOptiFineVersions,
    // Sistema de auto-profiles
    getAllInstalledProfiles,
    getAutoProfileById,
    isAutoProfileId,
    // Para testing
    isOptiFineVersion,
    extractBaseVersion,
    extractOptiFineVersion
}
