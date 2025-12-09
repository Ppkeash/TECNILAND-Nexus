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
 */
exports.getNeoForgeVersions = async function(minecraftVersion, forceRefresh = false) {
    // Cargar caché si no está en memoria
    if (!versionCache.lastUpdated) {
        loadCache()
    }

    // Verificar si necesitamos refrescar
    if (!forceRefresh && !isCacheExpired() && versionCache.neoforge[minecraftVersion]) {
        logger.info(`Usando caché de versiones de NeoForge para MC ${minecraftVersion}`)
        return versionCache.neoforge[minecraftVersion]
    }

    // Obtener desde API
    logger.info(`Obteniendo versiones de NeoForge para MC ${minecraftVersion}...`)
    try {
        const response = await axios.get(API_URLS.NEOFORGE_MAVEN, { timeout: 10000 })
        const versions = response.data.versions || []

        // Filtrar versiones que correspondan a la versión de Minecraft
        // NeoForge usa formato: 20.2.86 (para MC 1.20.2), 20.4.XX (para MC 1.20.4), etc.
        const mcVersionParts = minecraftVersion.split('.')
        const majorMinor = `${mcVersionParts[1]}.${mcVersionParts[2] || 0}` // "20.1" para MC 1.20.1

        const filteredVersions = versions.filter(v => v.startsWith(majorMinor))

        if (filteredVersions.length > 0) {
            versionCache.neoforge[minecraftVersion] = filteredVersions
            versionCache.lastUpdated = new Date().toISOString()
            saveCache()

            logger.info(`Obtenidas ${filteredVersions.length} versiones de NeoForge para MC ${minecraftVersion}`)
            return filteredVersions
        } else {
            logger.warn(`No hay versiones de NeoForge disponibles para MC ${minecraftVersion}`)
            return []
        }

    } catch (err) {
        logger.error('Error al obtener versiones de NeoForge:', err.message)
        
        // Intentar usar caché
        if (versionCache.neoforge[minecraftVersion]) {
            logger.warn(`Usando caché expirado de NeoForge para MC ${minecraftVersion}`)
            return versionCache.neoforge[minecraftVersion]
        }

        return []
    }
}

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
