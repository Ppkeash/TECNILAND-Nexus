/**
 * API para obtener versiones de Minecraft y mod loaders
 * Sistema con caché local para evitar llamadas constantes a las APIs
 */

const fs = require('fs-extra')
const path = require('path')
const { LoggerUtil } = require('helios-core')
const axios = require('axios')

const logger = LoggerUtil.getLogger('VersionAPI')

// Obtener app de manera compatible con main y renderer process
// En main process: require('electron').app está disponible
// En renderer process: require('electron').app es undefined, usar @electron/remote
const electronApp = require('electron').app
const app = electronApp || require('@electron/remote').app

// Ruta del archivo de caché
const CACHE_FILE = path.join(app.getPath('userData'), 'versions-cache.json')

// Tiempo de expiración del caché (24 horas en milisegundos)
const CACHE_EXPIRY = 24 * 60 * 60 * 1000

// URLs de las APIs
const API_URLS = {
    MOJANG_MANIFEST: 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
    FORGE_MAVEN: 'https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json',
    FABRIC_GAME: 'https://meta.fabricmc.net/v2/versions/game',
    FABRIC_LOADER: 'https://meta.fabricmc.net/v2/versions/loader',
    QUILT_LOADER: 'https://meta.quiltmc.org/v3/versions/loader',
    NEOFORGE_MAVEN: 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge'
}

/**
 * Estructura del caché de versiones
 */
let versionCache = {
    lastUpdated: null,
    minecraft: {
        releases: [],
        snapshots: [],
        latest: { release: '', snapshot: '' }
    },
    forge: {},        // { "1.20.1": ["47.2.0", "47.1.0", ...], ... }
    fabric: {
        loaders: [],  // ["0.15.0", "0.14.24", ...]
        game: []      // Versiones de MC compatibles
    },
    quilt: {
        loaders: []
    },
    neoforge: {}      // Similar a forge
}

/**
 * Cargar caché desde disco
 */
function loadCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const data = fs.readFileSync(CACHE_FILE, 'utf-8')
            versionCache = JSON.parse(data)
            logger.info('Caché de versiones cargado desde disco')
            return true
        }
    } catch (err) {
        logger.error('Error al cargar caché de versiones:', err)
    }
    return false
}

/**
 * Guardar caché en disco
 */
function saveCache() {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(versionCache, null, 2), 'utf-8')
        logger.info('Caché de versiones guardado en disco')
    } catch (err) {
        logger.error('Error al guardar caché de versiones:', err)
    }
}

/**
 * Verificar si el caché ha expirado
 */
function isCacheExpired() {
    if (!versionCache.lastUpdated) {
        return true
    }
    const now = Date.now()
    const lastUpdate = new Date(versionCache.lastUpdated).getTime()
    return (now - lastUpdate) > CACHE_EXPIRY
}

/**
 * Obtener versiones de Minecraft desde Mojang
 * @param {boolean} forceRefresh - Forzar actualización desde API
 * @returns {Promise<Object>} Objeto con releases, snapshots y latest
 */
exports.getMinecraftVersions = async function(forceRefresh = false) {
    // Cargar caché si no está en memoria
    if (!versionCache.lastUpdated) {
        loadCache()
    }

    // Verificar si necesitamos refrescar
    if (!forceRefresh && !isCacheExpired() && versionCache.minecraft.releases.length > 0) {
        logger.info('Usando caché de versiones de Minecraft')
        return {
            releases: versionCache.minecraft.releases,
            snapshots: versionCache.minecraft.snapshots,
            latest: versionCache.minecraft.latest
        }
    }

    // Obtener desde API
    logger.info('Obteniendo versiones de Minecraft desde Mojang...')
    try {
        const response = await axios.get(API_URLS.MOJANG_MANIFEST, { timeout: 10000 })
        const manifest = response.data

        // Separar releases y snapshots
        const releases = []
        const snapshots = []

        for (const version of manifest.versions) {
            if (version.type === 'release') {
                releases.push({
                    id: version.id,
                    releaseTime: version.releaseTime,
                    url: version.url
                })
            } else if (version.type === 'snapshot') {
                snapshots.push({
                    id: version.id,
                    releaseTime: version.releaseTime,
                    url: version.url
                })
            }
        }

        // Actualizar caché
        versionCache.minecraft.releases = releases
        versionCache.minecraft.snapshots = snapshots
        versionCache.minecraft.latest = manifest.latest
        versionCache.lastUpdated = new Date().toISOString()

        saveCache()

        logger.info(`Obtenidas ${releases.length} releases y ${snapshots.length} snapshots de Minecraft`)

        return {
            releases,
            snapshots,
            latest: manifest.latest
        }

    } catch (err) {
        logger.error('Error al obtener versiones de Minecraft:', err.message)
        
        // Si falla, intentar usar caché aunque esté expirado
        if (versionCache.minecraft.releases.length > 0) {
            logger.warn('Usando caché expirado de Minecraft')
            return {
                releases: versionCache.minecraft.releases,
                snapshots: versionCache.minecraft.snapshots,
                latest: versionCache.minecraft.latest
            }
        }

        throw new Error('No se pudieron obtener versiones de Minecraft y no hay caché disponible')
    }
}

/**
 * Obtener versiones de Forge para una versión específica de Minecraft
 * @param {string} minecraftVersion - Versión de Minecraft (ej: "1.20.1")
 * @param {boolean} forceRefresh - Forzar actualización desde API
 * @returns {Promise<Array<string>>} Array de versiones de Forge
 */
exports.getForgeVersions = async function(minecraftVersion, forceRefresh = false) {
    // Cargar caché si no está en memoria
    if (!versionCache.lastUpdated) {
        loadCache()
    }

    // Verificar si necesitamos refrescar
    if (!forceRefresh && !isCacheExpired() && versionCache.forge[minecraftVersion]) {
        logger.info(`Usando caché de versiones de Forge para MC ${minecraftVersion}`)
        return versionCache.forge[minecraftVersion]
    }

    // Obtener desde API
    logger.info(`Obteniendo versiones de Forge para MC ${minecraftVersion}...`)
    try {
        const response = await axios.get(API_URLS.FORGE_MAVEN, { timeout: 10000 })
        const data = response.data

        // El formato del JSON es: { "1.20.1": ["47.2.0", "47.1.0", ...], ... }
        if (data[minecraftVersion]) {
            versionCache.forge[minecraftVersion] = data[minecraftVersion]
            versionCache.lastUpdated = new Date().toISOString()
            saveCache()

            logger.info(`Obtenidas ${data[minecraftVersion].length} versiones de Forge para MC ${minecraftVersion}`)
            return data[minecraftVersion]
        } else {
            logger.warn(`No hay versiones de Forge disponibles para MC ${minecraftVersion}`)
            return []
        }

    } catch (err) {
        logger.error('Error al obtener versiones de Forge:', err.message)
        
        // Intentar usar caché aunque esté expirado
        if (versionCache.forge[minecraftVersion]) {
            logger.warn(`Usando caché expirado de Forge para MC ${minecraftVersion}`)
            return versionCache.forge[minecraftVersion]
        }

        return []
    }
}

/**
 * Obtener versiones de Minecraft compatibles con Fabric
 * @param {boolean} forceRefresh - Forzar actualización desde API
 * @returns {Promise<Array<Object>>} Array de versiones de MC compatibles { version: "1.20.1", stable: true }
 */
exports.getFabricGameVersions = async function(forceRefresh = false) {
    // Cargar caché si no está en memoria
    if (!versionCache.lastUpdated) {
        loadCache()
    }

    // Verificar si necesitamos refrescar
    if (!forceRefresh && !isCacheExpired() && versionCache.fabric.game.length > 0) {
        logger.info('Usando caché de versiones de MC compatibles con Fabric')
        return versionCache.fabric.game
    }

    // Obtener desde API
    logger.info('Obteniendo versiones de MC compatibles con Fabric desde Meta API...')
    try {
        const response = await axios.get(API_URLS.FABRIC_GAME, { timeout: 10000 })
        const games = response.data

        // Extraer versiones con flag stable
        const gameVersions = games.map(item => ({
            version: item.version,
            stable: item.stable === true
        }))

        // Actualizar caché
        versionCache.fabric.game = gameVersions
        versionCache.lastUpdated = new Date().toISOString()
        saveCache()

        logger.info(`Obtenidas ${gameVersions.length} versiones de MC compatibles con Fabric`)
        return gameVersions

    } catch (err) {
        logger.error('Error al obtener versiones de MC para Fabric:', err.message)
        
        // Intentar usar caché expirado
        if (versionCache.fabric.game.length > 0) {
            logger.warn('Usando caché expirado de versiones de MC para Fabric')
            return versionCache.fabric.game
        }

        return []
    }
}

/**
 * Obtener versiones de Minecraft compatibles con Quilt
 * @param {boolean} forceRefresh - Forzar actualización desde API
 * @returns {Promise<Array<Object>>} Array de versiones de MC compatibles { version: "1.20.1", stable: true }
 */
exports.getQuiltGameVersions = async function(forceRefresh = false) {
    // Cargar caché si no está en memoria
    if (!versionCache.lastUpdated) {
        loadCache()
    }

    // Verificar si necesitamos refrescar - validar que cache sea array
    if (!forceRefresh && !isCacheExpired() && Array.isArray(versionCache.quilt.game) && versionCache.quilt.game.length > 0) {
        logger.info('Usando caché de versiones de MC compatibles con Quilt')
        return versionCache.quilt.game
    }

    // Obtener desde API
    logger.info('Obteniendo versiones de MC compatibles con Quilt desde Meta API...')
    try {
        const response = await axios.get('https://meta.quiltmc.org/v3/versions/game', { timeout: 10000 })
        const games = response.data

        // ✅ VALIDAR: response.data debe ser un array
        if (!Array.isArray(games)) {
            logger.error('Quilt Meta: invalid response shape, expected array, got:', typeof games)
            throw new Error('Quilt Meta API returned non-array response')
        }

        // Extraer versiones con flag stable
        const gameVersions = games.map(item => ({
            version: item.version,
            stable: item.stable === true
        }))

        logger.info(`Quilt Meta: received ${gameVersions.length} versions`)

        // Actualizar caché
        versionCache.quilt.game = gameVersions
        versionCache.lastUpdated = new Date().toISOString()
        saveCache()

        return gameVersions

    } catch (err) {
        logger.error('Quilt Meta: request failed -', err.message)
        
        // Intentar usar caché expirado - validar que sea array
        if (Array.isArray(versionCache.quilt.game) && versionCache.quilt.game.length > 0) {
            logger.warn('Usando caché expirado de versiones de MC para Quilt')
            return versionCache.quilt.game
        }

        // ✅ SIEMPRE retornar array vacío, nunca undefined
        logger.warn('Quilt Meta: returning empty list (no cache available)')
        return []
    }
}

/**
 * Obtener versiones de Fabric Loader
 * @param {string} minecraftVersion - Versión de Minecraft (ej: "1.20.1")
 * @param {boolean} forceRefresh - Forzar actualización desde API
 * @returns {Promise<Array<Object>>} Array de versiones de Fabric Loader
 */
exports.getFabricVersions = async function(minecraftVersion, forceRefresh = false) {
    // Cargar caché si no está en memoria
    if (!versionCache.lastUpdated) {
        loadCache()
    }

    // Verificar si necesitamos refrescar loaders
    if (!forceRefresh && !isCacheExpired() && versionCache.fabric.loaders.length > 0) {
        logger.info('Usando caché de versiones de Fabric Loader')
        return versionCache.fabric.loaders
    }

    // Obtener loaders desde API
    logger.info('Obteniendo versiones de Fabric Loader...')
    try {
        const response = await axios.get(`${API_URLS.FABRIC_LOADER}/${minecraftVersion}`, { timeout: 10000 })
        const loaders = response.data

        // Extraer solo las versiones del loader
        const loaderVersions = loaders.map(item => ({
            version: item.loader.version,
            stable: item.loader.stable
        }))

        // Actualizar caché
        versionCache.fabric.loaders = loaderVersions
        versionCache.lastUpdated = new Date().toISOString()
        saveCache()

        logger.info(`Obtenidas ${loaderVersions.length} versiones de Fabric Loader`)
        return loaderVersions

    } catch (err) {
        logger.error('Error al obtener versiones de Fabric:', err.message)
        
        // Intentar usar caché
        if (versionCache.fabric.loaders.length > 0) {
            logger.warn('Usando caché expirado de Fabric Loader')
            return versionCache.fabric.loaders
        }

        return []
    }
}

/**
 * Obtener versiones de Quilt Loader
 * @param {string} minecraftVersion - Versión de Minecraft (ej: "1.20.1")
 * @param {boolean} forceRefresh - Forzar actualización desde API
 * @returns {Promise<Array<Object>>} Array de versiones de Quilt Loader
 */
exports.getQuiltVersions = async function(minecraftVersion, forceRefresh = false) {
    // Cargar caché si no está en memoria
    if (!versionCache.lastUpdated) {
        loadCache()
    }

    // Verificar si necesitamos refrescar
    if (!forceRefresh && !isCacheExpired() && versionCache.quilt.loaders.length > 0) {
        logger.info('Usando caché de versiones de Quilt Loader')
        return versionCache.quilt.loaders
    }

    // Obtener desde API
    logger.info('Obteniendo versiones de Quilt Loader...')
    try {
        const response = await axios.get(API_URLS.QUILT_LOADER, { timeout: 10000 })
        const loaders = response.data

        // Extraer versiones
        const loaderVersions = loaders.map(item => ({
            version: item.version,
            stable: !item.version.includes('beta') && !item.version.includes('alpha')
        }))

        // Actualizar caché
        versionCache.quilt.loaders = loaderVersions
        versionCache.lastUpdated = new Date().toISOString()
        saveCache()

        logger.info(`Obtenidas ${loaderVersions.length} versiones de Quilt Loader`)
        return loaderVersions

    } catch (err) {
        logger.error('Error al obtener versiones de Quilt:', err.message)
        
        // Intentar usar caché
        if (versionCache.quilt.loaders.length > 0) {
            logger.warn('Usando caché expirado de Quilt Loader')
            return versionCache.quilt.loaders
        }

        return []
    }
}

/**
 * Obtener versiones de NeoForge para una versión específica de Minecraft
 * @param {string} minecraftVersion - Versión de Minecraft (ej: "1.20.1")
 * @param {boolean} forceRefresh - Forzar actualización desde API
 * @returns {Promise<Array<string>>} Array de versiones de NeoForge
 * 
 * @deprecated Esta función está definida más abajo con mejor lógica de filtrado.
 * NOTA: Esta definición fue ELIMINADA en v1.0.5 - era código muerto sobrescrito por la versión en L567+
 */
// [ELIMINADO v1.0.5] Primera definición duplicada de getNeoForgeVersions - ver línea ~560 para la versión activa

/**
 * Inicializar caché al arrancar la aplicación
 * Carga el caché desde disco y opcionalmente refresca si es necesario
 */
exports.initializeCache = async function() {
    logger.info('Inicializando caché de versiones...')
    
    // Cargar caché existente
    const cacheLoaded = loadCache()
    
    // Si no hay caché o está expirado, refrescar en segundo plano
    if (!cacheLoaded || isCacheExpired()) {
        logger.info('Caché no disponible o expirado, refrescando en segundo plano...')
        
        // Refrescar Minecraft versions (las más importantes)
        try {
            await exports.getMinecraftVersions(true)
        } catch (err) {
            logger.error('Error al inicializar caché de Minecraft:', err)
        }
    } else {
        logger.info('Caché de versiones cargado correctamente')
    }
}

/**
 * Limpiar caché completamente
 */
exports.clearCache = function() {
    versionCache = {
        lastUpdated: null,
        minecraft: { releases: [], snapshots: [], latest: { release: '', snapshot: '' } },
        forge: {},
        fabric: { loaders: [], game: [] },
        quilt: { loaders: [] },
        neoforge: {}
    }
    
    try {
        if (fs.existsSync(CACHE_FILE)) {
            fs.unlinkSync(CACHE_FILE)
            logger.info('Caché de versiones eliminado')
        }
    } catch (err) {
        logger.error('Error al eliminar caché:', err)
    }
}

/**
 * Obtener información del caché actual
 */
exports.getCacheInfo = function() {
    return {
        lastUpdated: versionCache.lastUpdated,
        isExpired: isCacheExpired(),
        minecraftVersionsCount: versionCache.minecraft.releases.length,
        forgeVersionsCount: Object.keys(versionCache.forge).length,
        fabricLoadersCount: versionCache.fabric.loaders.length,
        quiltLoadersCount: versionCache.quilt.loaders.length,
        neoforgeVersionsCount: Object.keys(versionCache.neoforge).length
    }
}

// ===================================================================
// NEOFORGE API
// ===================================================================

/**
 * Obtener versiones de NeoForge para una versión específica de Minecraft
 * @param {string} minecraftVersion - Versión de Minecraft (ej: "1.20.4", "1.21.1")
 * @param {boolean} forceRefresh - Forzar actualización del caché
 * @returns {Promise<Array<string>>} Array de versiones de NeoForge
 */
exports.getNeoForgeVersions = async function(minecraftVersion, forceRefresh = false) {
    try {
        // ✅ NeoForge solo para MC 1.20.2+
        if (!isVersionAtLeast(minecraftVersion, '1.20.2')) {
            logger.warn(`NeoForge no es compatible con MC ${minecraftVersion} (requiere 1.20.2+)`)
            return []
        }
        
        // Verificar caché primero (si no se fuerza refresh)
        if (!forceRefresh && versionCache.neoforge[minecraftVersion]) {
            logger.info(`✅ Devolviendo ${versionCache.neoforge[minecraftVersion].length} versiones de NeoForge desde caché para MC ${minecraftVersion}`)
            return versionCache.neoforge[minecraftVersion]
        }
        
        logger.info(`Obteniendo versiones de NeoForge para MC ${minecraftVersion}...`)
        
        // Fetch desde NeoForge Maven API
        const response = await axios.get(API_URLS.NEOFORGE_MAVEN, { timeout: 10000 })
        const allVersions = response.data
        
        if (!Array.isArray(allVersions)) {
            throw new Error('NeoForge Maven API no devolvió un array de versiones')
        }
        
        logger.info(`NeoForge Maven API devolvió ${allVersions.length} versiones totales`)
        
        // ✅ Filtrar por "train" prefix según MC version
        // MC 1.20.2 → train "20.2"
        // MC 1.20.4 → train "20.4"
        // MC 1.20.5 → train "20.5"
        // MC 1.21.1 → train "21.1"
        // MC 1.21.3 → train "21.3"
        const train = extractNeoForgeTrain(minecraftVersion)
        if (!train) {
            logger.warn(`No se pudo determinar train de NeoForge para MC ${minecraftVersion}`)
            return []
        }
        
        logger.info(`Train calculado para MC ${minecraftVersion}: ${train}`)
        
        // Filtrar versiones que coincidan con el train
        const compatibleVersions = allVersions.filter(v => v.startsWith(train + '.'))
        logger.info(`✅ Encontradas ${compatibleVersions.length} versiones de NeoForge para MC ${minecraftVersion} (train ${train})`)
        
        // Guardar en caché
        versionCache.neoforge[minecraftVersion] = compatibleVersions
        versionCache.lastUpdated = Date.now()
        saveCache()
        
        return compatibleVersions
        
    } catch (err) {
        logger.error(`Error al obtener versiones de NeoForge para MC ${minecraftVersion}:`, err.message)
        
        // Intentar devolver desde caché aunque esté expirado
        if (versionCache.neoforge[minecraftVersion]) {
            logger.warn('Devolviendo versiones desde caché expirado como fallback')
            return versionCache.neoforge[minecraftVersion]
        }
        
        return []
    }
}

/**
 * Extraer el "train" de NeoForge desde la versión de Minecraft
 * @param {string} mcVersion - Versión de Minecraft (ej: "1.20.4")
 * @returns {string|null} Train (ej: "20.4") o null si no es compatible
 */
function extractNeoForgeTrain(mcVersion) {
    // MC 1.20.2 → 20.2
    // MC 1.20.4 → 20.4
    // MC 1.21.1 → 21.1
    // MC 1.21.11 → 21.11
    
    const parts = mcVersion.split('.')
    if (parts.length < 2) {
        return null
    }
    
    // Primera parte siempre es "1"
    if (parts[0] !== '1') {
        return null
    }
    
    // Segunda parte es el major
    const major = parts[1]
    
    // Tercera parte es el minor (puede no existir → 0)
    const minor = parts[2] || '0'
    
    // NeoForge train = major.minor (sin el "1." inicial)
    return `${major}.${minor}`
}

/**
 * Comparar si una versión es mayor o igual a otra
 * @param {string} version - Versión a comparar (ej: "1.20.4")
 * @param {string} minimumVersion - Versión mínima (ej: "1.20.2")
 * @returns {boolean} true si version >= minimumVersion
 */
function isVersionAtLeast(version, minimumVersion) {
    const v1Parts = version.split('.').map(Number)
    const v2Parts = minimumVersion.split('.').map(Number)
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
        const v1 = v1Parts[i] || 0
        const v2 = v2Parts[i] || 0
        
        if (v1 > v2) return true
        if (v1 < v2) return false
    }
    
    return true // Son iguales
}
