/**
 * ModpackManager.js
 * 
 * Gestiona la descarga, instalación, actualización, reparación y desinstalación
 * de modpacks TECNILAND distribuidos vía Nebula + Cloudflare R2.
 * 
 * @author TECNILAND Nexus Team
 * @version 1.0.0
 */

const fs = require('fs-extra')
const path = require('path')
const { LoggerUtil } = require('helios-core')
const ConfigManager = require('./configmanager')
const { DistroAPI } = require('./distromanager')

const logger = LoggerUtil.getLogger('ModpackManager')

// ============================================================================
// Constants
// ============================================================================

/**
 * Files to preserve during updates (user configs)
 */
const PRESERVED_FILES = [
    'options.txt',
    'config/**',
    'defaultconfigs/**',
    'saves/**',
    'screenshots/**',
    'resourcepacks/**',
    'shaderpacks/**'
]

/**
 * Minimum free disk space multiplier (10% buffer)
 */
const DISK_SPACE_BUFFER = 1.1

// ============================================================================
// State
// ============================================================================

let cachedDistribution = null
let lastDistributionFetch = 0
const DISTRIBUTION_CACHE_TTL = 60000 // 60 seconds

// ============================================================================
// Distribution Management
// ============================================================================

/**
 * Fetch distribution.json from Cloudflare R2.
 * Uses caching to avoid unnecessary network requests.
 * 
 * @param {boolean} forceRefresh - Force re-fetch ignoring cache.
 * @returns {Promise<Object>} The distribution object.
 */
async function fetchDistribution(forceRefresh = false) {
    const now = Date.now()
    
    // Return cached if still valid
    if (!forceRefresh && cachedDistribution && (now - lastDistributionFetch) < DISTRIBUTION_CACHE_TTL) {
        logger.debug('Using cached distribution')
        return cachedDistribution
    }
    
    try {
        logger.info('Fetching distribution from R2...')
        
        // Use helios-core DistroAPI
        const distribution = await DistroAPI.getDistribution()
        
        if (distribution) {
            cachedDistribution = distribution
            lastDistributionFetch = now
            logger.info(`Distribution fetched: ${distribution.rawDistribution.servers?.length || 0} servers`)
            return distribution
        }
        
        throw new Error('Distribution is null')
    } catch (err) {
        logger.error('Failed to fetch distribution:', err)
        
        // Return cached if available
        if (cachedDistribution) {
            logger.warn('Using stale cached distribution')
            return cachedDistribution
        }
        
        throw err
    }
}

/**
 * Force refresh the distribution cache.
 * 
 * @returns {Promise<Object>} The refreshed distribution.
 */
async function refreshDistribution() {
    return fetchDistribution(true)
}

/**
 * Get all servers (modpacks) from distribution.
 * 
 * @returns {Promise<Array>} Array of server objects.
 */
async function getServers() {
    const distro = await fetchDistribution()
    return distro.rawDistribution.servers || []
}

/**
 * Get a specific server by ID.
 * 
 * @param {string} serverId - The server ID.
 * @returns {Promise<Object|null>} The server object or null.
 */
async function getServerById(serverId) {
    const distro = await fetchDistribution()
    return distro.getServerById(serverId) || null
}

// ============================================================================
// Size Calculation
// ============================================================================

/**
 * Calculate total size of all modules in a server recursively.
 * 
 * @param {Array} modules - Array of module objects.
 * @returns {number} Total size in bytes.
 */
function calculateModulesSize(modules) {
    if (!modules || !Array.isArray(modules)) return 0
    
    let totalSize = 0
    
    for (const mod of modules) {
        // Add artifact size
        if (mod.rawModule?.artifact?.size) {
            totalSize += mod.rawModule.artifact.size
        } else if (mod.artifact?.size) {
            totalSize += mod.artifact.size
        }
        
        // Recursively add submodules
        if (mod.subModules && mod.subModules.length > 0) {
            totalSize += calculateModulesSize(mod.subModules)
        }
        if (mod.rawModule?.subModules && mod.rawModule.subModules.length > 0) {
            totalSize += calculateRawModulesSize(mod.rawModule.subModules)
        }
    }
    
    return totalSize
}

/**
 * Calculate size from raw module objects (from distribution.json directly).
 * 
 * @param {Array} modules - Array of raw module objects.
 * @returns {number} Total size in bytes.
 */
function calculateRawModulesSize(modules) {
    if (!modules || !Array.isArray(modules)) return 0
    
    let totalSize = 0
    
    for (const mod of modules) {
        if (mod.artifact?.size) {
            totalSize += mod.artifact.size
        }
        if (mod.subModules && mod.subModules.length > 0) {
            totalSize += calculateRawModulesSize(mod.subModules)
        }
    }
    
    return totalSize
}

/**
 * Calculate total size of a modpack server.
 * 
 * @param {string} serverId - The server ID.
 * @returns {Promise<number>} Total size in bytes.
 */
async function calculateModpackSize(serverId) {
    const server = await getServerById(serverId)
    if (!server) {
        logger.warn(`Server not found for size calculation: ${serverId}`)
        return 0
    }
    
    const modules = server.modules || server.rawServer?.modules || []
    const size = calculateModulesSize(modules)
    
    logger.debug(`Modpack ${serverId} size: ${formatBytes(size)}`)
    return size
}

/**
 * Format bytes to human-readable string.
 * 
 * @param {number} bytes - Size in bytes.
 * @param {number} decimals - Decimal places.
 * @returns {string} Formatted string (e.g., "2.5 GB").
 */
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

// ============================================================================
// Disk Space
// ============================================================================

/**
 * Get free disk space for a path.
 * Uses check-disk-space if available, falls back to fs.statfs.
 * 
 * @param {string} targetPath - Path to check.
 * @returns {Promise<number>} Free space in bytes.
 */
async function getFreeDiskSpace(targetPath) {
    try {
        // Try to use check-disk-space package
        const checkDiskSpace = require('check-disk-space').default
        const diskSpace = await checkDiskSpace(targetPath)
        return diskSpace.free
    } catch (err) {
        logger.warn('check-disk-space not available, using fallback')
        
        // Fallback: try fs.statfs (Node 18+)
        try {
            const stats = await fs.statfs(targetPath)
            return stats.bfree * stats.bsize
        } catch (statErr) {
            logger.warn('fs.statfs not available, assuming enough space')
            return Number.MAX_SAFE_INTEGER
        }
    }
}

/**
 * Check if there's enough disk space for installation.
 * 
 * @param {number} requiredSize - Required size in bytes.
 * @returns {Promise<{hasSpace: boolean, freeSpace: number, requiredSpace: number}>}
 */
async function checkDiskSpace(requiredSize) {
    const dataDir = ConfigManager.getDataDirectory()
    const freeSpace = await getFreeDiskSpace(dataDir)
    const requiredWithBuffer = Math.ceil(requiredSize * DISK_SPACE_BUFFER)
    
    return {
        hasSpace: freeSpace >= requiredWithBuffer,
        freeSpace: freeSpace,
        requiredSpace: requiredWithBuffer,
        freeFormatted: formatBytes(freeSpace),
        requiredFormatted: formatBytes(requiredWithBuffer)
    }
}

// ============================================================================
// Modpack State
// ============================================================================

/**
 * Check if a modpack is physically installed on disk.
 * Verifies both config.json registration AND physical folder existence.
 * 
 * @param {string} serverId - The server ID.
 * @returns {Promise<{installed: boolean, path: string|null, size: number}>}
 */
async function checkPhysicalInstallation(serverId) {
    const dataDir = ConfigManager.getDataDirectory()
    const instancesPath = path.join(dataDir, 'instances', serverId)
    
    try {
        const exists = await fs.pathExists(instancesPath)
        if (!exists) {
            return { installed: false, path: null, size: 0 }
        }
        
        // Verify it's a valid instance (has mods or versions folder)
        const modsPath = path.join(instancesPath, 'mods')
        const versionsPath = path.join(instancesPath, 'versions')
        const hasContent = await fs.pathExists(modsPath) || await fs.pathExists(versionsPath)
        
        if (!hasContent) {
            return { installed: false, path: null, size: 0 }
        }
        
        // Calculate actual disk usage
        let totalSize = 0
        try {
            const calculateDirSize = async (dirPath) => {
                let size = 0
                const items = await fs.readdir(dirPath, { withFileTypes: true })
                for (const item of items) {
                    const itemPath = path.join(dirPath, item.name)
                    if (item.isDirectory()) {
                        size += await calculateDirSize(itemPath)
                    } else {
                        const stats = await fs.stat(itemPath)
                        size += stats.size
                    }
                }
                return size
            }
            totalSize = await calculateDirSize(instancesPath)
        } catch (err) {
            logger.warn(`Could not calculate size for ${serverId}:`, err.message)
        }
        
        return { 
            installed: true, 
            path: instancesPath, 
            size: totalSize 
        }
    } catch (err) {
        logger.error(`Error checking physical installation for ${serverId}:`, err)
        return { installed: false, path: null, size: 0 }
    }
}

/**
 * Get the complete state of a modpack.
 * Combines local installation data with remote distribution data.
 * NOW INCLUDES physical disk verification for pre-existing installations.
 * 
 * @param {string} serverId - The server ID.
 * @returns {Promise<Object>} Complete modpack state.
 */
async function getModpackState(serverId) {
    // Check config.json registration
    const localData = ConfigManager.getModpackInstallation(serverId)
    
    // Check physical installation
    const physicalCheck = await checkPhysicalInstallation(serverId)
    
    let remoteData = null
    try {
        remoteData = await getServerById(serverId)
    } catch (err) {
        logger.warn(`Could not fetch remote data for ${serverId}:`, err.message)
    }
    
    const remoteVersion = remoteData?.rawServer?.version || remoteData?.version || null
    const localVersion = localData?.version || null
    
    // Determine if truly installed: either registered OR physically present
    const actuallyInstalled = (localData !== null && localData.status === 'installed') || physicalCheck.installed
    
    // If physically installed but not registered, auto-register it
    if (physicalCheck.installed && !localData) {
        logger.info(`[Auto-Register] Found unregistered installation: ${serverId}`)
        try {
            ConfigManager.saveModpackInstallation({
                id: serverId,
                version: remoteVersion || 'unknown',
                status: 'installed',
                installPath: physicalCheck.path,
                installedAt: Date.now(),
                sizeOnDisk: physicalCheck.size
            })
            logger.info(`[Auto-Register] Successfully registered ${serverId}`)
        } catch (err) {
            logger.error(`[Auto-Register] Failed to register ${serverId}:`, err)
        }
    }
    
    // Calculate if update is available
    const updateAvailable = actuallyInstalled && remoteVersion && localVersion && localVersion !== remoteVersion
    
    // Get size
    let totalSize = 0
    if (remoteData) {
        const modules = remoteData.modules || remoteData.rawServer?.modules || []
        totalSize = calculateModulesSize(modules)
    }
    
    // Use physical size if available, otherwise use config size
    const diskSize = physicalCheck.installed ? physicalCheck.size : (localData?.sizeOnDisk || 0)
    
    return {
        serverId,
        // Remote info
        name: remoteData?.rawServer?.name || remoteData?.name || serverId,
        description: remoteData?.rawServer?.description || remoteData?.description || '',
        icon: remoteData?.rawServer?.icon || remoteData?.icon || null,
        minecraftVersion: remoteData?.rawServer?.minecraftVersion || remoteData?.minecraftVersion || 'Unknown',
        remoteVersion: remoteVersion,
        totalSize: totalSize,
        totalSizeFormatted: formatBytes(totalSize),
        mainServer: remoteData?.rawServer?.mainServer || remoteData?.mainServer || false,
        // Local state (physical + config merged)
        isInstalled: actuallyInstalled,
        localVersion: localVersion || (physicalCheck.installed ? 'unknown' : null),
        installedAt: localData?.installedAt || null,
        lastPlayed: localData?.lastPlayed || null,
        sizeOnDisk: diskSize,
        sizeOnDiskFormatted: formatBytes(diskSize),
        installPath: physicalCheck.path || localData?.installPath || null,
        status: actuallyInstalled ? 'installed' : 'not-installed',
        // Computed
        updateAvailable: updateAvailable,
        canPlay: actuallyInstalled,
        canUpdate: updateAvailable,
        canRepair: actuallyInstalled,
        canUninstall: actuallyInstalled
    }
}

/**
 * Get states for all modpacks in distribution.
 * 
 * @returns {Promise<Array>} Array of modpack states.
 */
async function getAllModpackStates() {
    const servers = await getServers()
    const states = []
    
    for (const server of servers) {
        const serverId = server.rawServer?.id || server.id
        const state = await getModpackState(serverId)
        states.push(state)
    }
    
    // Sort: main server first, then by name
    states.sort((a, b) => {
        if (a.mainServer && !b.mainServer) return -1
        if (!a.mainServer && b.mainServer) return 1
        return a.name.localeCompare(b.name)
    })
    
    return states
}

// ============================================================================
// Helpers - Preserved Files (solo para referencia futura)
// ============================================================================

// ============================================================================
// Helpers - Preserved Files (solo para referencia futura)
// ============================================================================

/**
 * Check if a file path matches preserved patterns.
 * Usado internamente - los usuarios no necesitan actualizar/reparar manualmente.
 * Helios FullRepair maneja esto automáticamente.
 * 
 * @param {string} filePath - Relative file path.
 * @returns {boolean} True if should be preserved.
 */
function isPreservedFile(filePath) {
    const normalizedPath = filePath.replace(/\\/g, '/')
    
    for (const pattern of PRESERVED_FILES) {
        if (pattern.includes('**')) {
            // Glob pattern: check if path starts with base
            const base = pattern.replace('/**', '')
            if (normalizedPath.startsWith(base + '/') || normalizedPath === base) {
                return true
            }
        } else {
            // Exact match
            if (normalizedPath === pattern) {
                return true
            }
        }
    }
    
    return false
}

// ============================================================================
// Uninstall
// ============================================================================

/**
 * Uninstall a modpack.
 * Deletes all files and removes from config.
 * 
 * @param {string} serverId - The server ID to uninstall.
 * @param {boolean} keepSaves - Keep saves folder (default: true).
 * @returns {Promise<{freedSpace: number}>} Uninstall stats.
 */
async function uninstallModpack(serverId, keepSaves = true) {
    logger.info(`Starting uninstall of modpack: ${serverId}`)
    
    const localData = ConfigManager.getModpackInstallation(serverId)
    if (!localData) {
        throw new Error('Modpack no está instalado')
    }
    
    const instanceDir = localData.installPath
    const sizeOnDisk = localData.sizeOnDisk || 0
    
    try {
        if (instanceDir && await fs.pathExists(instanceDir)) {
            if (keepSaves) {
                // Backup saves before delete
                const savesDir = path.join(instanceDir, 'saves')
                const tempSavesDir = path.join(ConfigManager.getDataDirectory(), '.temp-saves-' + serverId)
                
                if (await fs.pathExists(savesDir)) {
                    await fs.copy(savesDir, tempSavesDir)
                    logger.info('Saves backed up temporarily')
                }
                
                // Delete instance
                await fs.remove(instanceDir)
                
                // Restore saves to a safe location (in case user wants them)
                if (await fs.pathExists(tempSavesDir)) {
                    const savedBackupDir = path.join(ConfigManager.getDataDirectory(), 'saves-backup', serverId)
                    await fs.move(tempSavesDir, savedBackupDir, { overwrite: true })
                    logger.info(`Saves preserved at: ${savedBackupDir}`)
                }
            } else {
                // Delete everything
                await fs.remove(instanceDir)
            }
        }
        
        // Remove from config
        ConfigManager.removeModpackInstallation(serverId)
        ConfigManager.save()
        
        logger.info(`Modpack uninstalled: ${serverId}`)
        
        return { freedSpace: sizeOnDisk }
        
    } catch (err) {
        logger.error(`Uninstall failed for ${serverId}:`, err)
        throw err
    }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
    // Distribution
    fetchDistribution,
    refreshDistribution,
    getServers,
    getServerById,
    
    // Size
    calculateModpackSize,
    formatBytes,
    
    // Disk space
    getFreeDiskSpace,
    checkDiskSpace,
    
    // State
    getModpackState,
    getAllModpackStates,
    
    // Operations (solo las que usamos realmente)
    uninstallModpack,
    
    // Utils
    isPreservedFile
}
