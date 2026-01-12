/**
 * Gestor de Instalaciones - Crea y mapea instalaciones a servidores virtuales
 * Compatible con el sistema existente de Helios (ProcessBuilder)
 */

const crypto = require('crypto')
const path = require('path')
const fs = require('fs-extra')
const { LoggerUtil } = require('helios-core')
const JavaManager = require('./javamanager')

const logger = LoggerUtil.getLogger('InstallationManager')

/**
 * Tipos de mod loaders soportados
 */
const LoaderType = {
    VANILLA: 'vanilla',
    FORGE: 'forge',
    FABRIC: 'fabric',
    QUILT: 'quilt',
    NEOFORGE: 'neoforge'
}

exports.LoaderType = LoaderType

/**
 * Generar ID único para una instalación
 * @param {string} name - Nombre de la instalación
 * @returns {string} ID único
 */
function generateInstallationId(name) {
    const timestamp = Date.now()
    const random = crypto.randomBytes(4).toString('hex')
    const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    return `install-${sanitizedName}-${timestamp}-${random}`
}

/**
 * Crear una nueva instalación
 * @param {Object} config - Configuración de la instalación
 * @param {string} config.name - Nombre de la instalación
 * @param {string} config.loaderType - Tipo de loader (vanilla, forge, fabric, quilt, neoforge)
 * @param {string} config.minecraftVersion - Versión de Minecraft
 * @param {string} [config.loaderVersion] - Versión del loader (requerido para forge/fabric/quilt/neoforge)
 * @param {string} [config.icon] - URL o nombre del icono
 * @param {Array} [config.modules] - Módulos adicionales (mods)
 * @param {Object} [config.optifine] - Configuración de OptiFine (solo para Vanilla)
 * @param {boolean} [config.optifine.enabled] - Si OptiFine está habilitado
 * @param {string} [config.optifine.versionId] - ID de la versión OptiFine detectada
 * @returns {Object} Objeto de instalación
 */
exports.createInstallation = function(config) {
    // Validar configuración
    if (!config.name || !config.loaderType || !config.minecraftVersion) {
        throw new Error('Faltan parámetros obligatorios: name, loaderType, minecraftVersion')
    }

    // Validar que loaderVersion esté presente para loaders que lo requieren
    if (config.loaderType !== LoaderType.VANILLA && !config.loaderVersion) {
        throw new Error(`loaderVersion es requerido para el loader tipo ${config.loaderType}`)
    }

    // Validar OptiFine solo para Vanilla
    if (config.optifine && config.optifine.enabled && config.loaderType !== LoaderType.VANILLA) {
        logger.warn('OptiFine solo es compatible con instalaciones Vanilla, ignorando configuración OptiFine')
        config.optifine = null
    }

    // Crear objeto de instalación
    const installation = {
        id: generateInstallationId(config.name),
        name: config.name,
        type: 'custom',
        icon: config.icon || 'default',
        loader: {
            type: config.loaderType,
            minecraftVersion: config.minecraftVersion,
            loaderVersion: config.loaderVersion || null
        },
        // OptiFine: solo disponible para instalaciones Vanilla
        optifine: config.optifine && config.loaderType === LoaderType.VANILLA ? {
            enabled: config.optifine.enabled || false,
            versionId: config.optifine.versionId || null
        } : null,
        modules: config.modules || [],
        created: new Date().toISOString(),
        lastPlayed: null,
        playtime: 0,
        javaOptions: null,
        serverAddress: null
    }

    logger.info(`Instalación creada: ${installation.name} (${installation.id})`)
    logger.info(`  Loader: ${installation.loader.type} ${installation.loader.loaderVersion || ''}`)
    logger.info(`  Minecraft: ${installation.loader.minecraftVersion}`)
    if (installation.optifine && installation.optifine.enabled) {
        logger.info(`  OptiFine: ${installation.optifine.versionId}`)
    }

    return installation
}

/**
 * Convertir una instalación a un servidor virtual compatible con el sistema existente
 * @param {Object} installation - Objeto de instalación
 * @returns {Object} Servidor virtual compatible con DistroAPI
 */
exports.installationToServer = function(installation) {
    const server = {
        id: installation.id,
        name: installation.name,
        description: generateDescription(installation),
        icon: getIconUrl(installation.icon, installation.loader.type),
        version: '1.0.0',
        address: installation.serverAddress || 'localhost:25565',
        minecraftVersion: installation.loader.minecraftVersion,
        discord: null,
        mainServer: false,
        autoconnect: installation.serverAddress != null,
        modules: generateModules(installation),
        javaOptions: installation.javaOptions || getDefaultJavaOptions(installation.loader.minecraftVersion),
        // Propagar información de OptiFine para el flujo de lanzamiento
        optifine: installation.optifine || null
    }

    return server
}

/**
 * Obtener opciones de Java por defecto basadas en la versión de Minecraft
 * Usa JavaManager para obtener los requisitos correctos
 * @param {string} minecraftVersion - Versión de Minecraft (ej: "1.20.1")
 * @returns {Object} Opciones de Java compatibles con effectiveJavaOptions
 */
function getDefaultJavaOptions(minecraftVersion) {
    // Usar JavaManager para generar las opciones de Java correctas
    return JavaManager.generateEffectiveJavaOptions(minecraftVersion)
}

/**
 * Generar lista de versiones de Java soportadas
 * @param {number} suggestedMajor - Versión principal sugerida
 * @returns {string} String con versiones soportadas (ej: ">=17.x")
 */
// eslint-disable-next-line no-unused-vars
function generateSupportedJavaVersions(suggestedMajor) {
    // Generar rango de versiones compatible
    if (suggestedMajor >= 21) {
        return '>=21.x'
    } else if (suggestedMajor >= 17) {
        return '>=17.x'
    } else {
        return '>=8.x'
    }
}

/**
 * Generar descripción legible de una instalación
 * @param {Object} installation - Objeto de instalación
 * @returns {string} Descripción
 */
function generateDescription(installation) {
    const loader = installation.loader
    
    if (loader.type === LoaderType.VANILLA) {
        // Incluir OptiFine en la descripción si está habilitado
        if (installation.optifine && installation.optifine.enabled && installation.optifine.versionId) {
            return `Minecraft ${loader.minecraftVersion} + OptiFine`
        }
        return `Minecraft ${loader.minecraftVersion}`
    } else {
        const loaderName = loader.type.charAt(0).toUpperCase() + loader.type.slice(1)
        return `${loaderName} ${loader.loaderVersion} (MC ${loader.minecraftVersion})`
    }
}

/**
 * Obtener URL del icono según el tipo de loader
 * @param {string} icon - Icono personalizado o nombre predefinido
 * @param {string} loaderType - Tipo de loader
 * @returns {string} URL del icono
 */
function getIconUrl(icon, loaderType) {
    // Si es una URL completa, devolverla directamente
    if (icon.startsWith('http://') || icon.startsWith('https://')) {
        return icon
    }

    // Iconos predefinidos por loader
    const defaultIcons = {
        [LoaderType.VANILLA]: 'https://launcher.mojang.com/download/Minecraft.exe',  // Icono de grass block
        [LoaderType.FORGE]: 'https://avatars.githubusercontent.com/u/1390178',
        [LoaderType.FABRIC]: 'https://fabricmc.net/assets/logo.png',
        [LoaderType.QUILT]: 'https://quiltmc.org/assets/img/logo.svg',
        [LoaderType.NEOFORGE]: 'https://neoforged.net/img/logo.svg'
    }

    return defaultIcons[loaderType] || defaultIcons[LoaderType.VANILLA]
}

/**
 * Generar módulos (mods, loader) para una instalación
 * @param {Object} installation - Objeto de instalación
 * @returns {Array} Array de módulos
 */
function generateModules(installation) {
    const modules = []
    const loader = installation.loader

    // Agregar el mod loader como módulo (excepto para vanilla)
    if (loader.type !== LoaderType.VANILLA) {
        const loaderModule = generateLoaderModule(loader)
        if (loaderModule) {
            modules.push(loaderModule)
        }
    }

    // Agregar módulos adicionales (mods del usuario)
    if (installation.modules && installation.modules.length > 0) {
        modules.push(...installation.modules)
    }

    return modules
}

/**
 * Generar módulo del loader (Forge, Fabric, etc.)
 * @param {Object} loader - Configuración del loader
 * @returns {Object|null} Módulo del loader o null si no aplica
 */
function generateLoaderModule(loader) {
    switch (loader.type) {
        case LoaderType.FORGE:
            return {
                id: `net.minecraftforge:forge:${loader.minecraftVersion}-${loader.loaderVersion}`,
                name: 'Minecraft Forge',
                type: 'ForgeHosted',
                required: {
                    value: true,
                    def: true
                },
                artifact: {
                    size: 0,  // Se calcula al descargar
                    url: `https://maven.minecraftforge.net/net/minecraftforge/forge/${loader.minecraftVersion}-${loader.loaderVersion}/forge-${loader.minecraftVersion}-${loader.loaderVersion}-installer.jar`,
                    MD5: ''  // Se valida al descargar
                }
            }

        case LoaderType.FABRIC:
            return {
                id: `net.fabricmc:fabric-loader:${loader.loaderVersion}`,
                name: 'Fabric Loader',
                type: 'FabricMod',
                required: {
                    value: true,
                    def: true
                },
                artifact: {
                    size: 0,
                    url: `https://maven.fabricmc.net/net/fabricmc/fabric-loader/${loader.loaderVersion}/fabric-loader-${loader.loaderVersion}.jar`,
                    MD5: ''
                }
            }

        case LoaderType.QUILT:
            return {
                id: `org.quiltmc:quilt-loader:${loader.loaderVersion}`,
                name: 'Quilt Loader',
                type: 'QuiltMod',
                required: {
                    value: true,
                    def: true
                },
                artifact: {
                    size: 0,
                    url: `https://maven.quiltmc.org/repository/release/org/quiltmc/quilt-loader/${loader.loaderVersion}/quilt-loader-${loader.loaderVersion}.jar`,
                    MD5: ''
                }
            }

        case LoaderType.NEOFORGE:
            return {
                id: `net.neoforged:neoforge:${loader.loaderVersion}`,
                name: 'NeoForge',
                type: 'ForgeHosted',
                required: {
                    value: true,
                    def: true
                },
                artifact: {
                    size: 0,
                    url: `https://maven.neoforged.net/releases/net/neoforged/neoforge/${loader.loaderVersion}/neoforge-${loader.loaderVersion}-installer.jar`,
                    MD5: ''
                }
            }

        default:
            return null
    }
}

/**
 * Validar que una instalación sea válida
 * @param {Object} installation - Objeto de instalación
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
exports.validateInstallation = function(installation) {
    const errors = []

    // Validar campos obligatorios
    if (!installation.id) errors.push('Falta el ID de la instalación')
    if (!installation.name) errors.push('Falta el nombre de la instalación')
    if (!installation.loader) errors.push('Falta la configuración del loader')
    
    if (installation.loader) {
        if (!installation.loader.type) errors.push('Falta el tipo de loader')
        if (!installation.loader.minecraftVersion) errors.push('Falta la versión de Minecraft')
        
        // Validar loaderVersion para loaders que lo requieren
        if (installation.loader.type !== LoaderType.VANILLA && !installation.loader.loaderVersion) {
            errors.push(`El loader ${installation.loader.type} requiere una versión específica`)
        }
    }

    return {
        valid: errors.length === 0,
        errors
    }
}

/**
 * Duplicar una instalación existente
 * @param {Object} installation - Instalación a duplicar
 * @param {string} [newName] - Nombre para la copia (opcional)
 * @returns {Object} Nueva instalación
 */
exports.duplicateInstallation = function(installation, newName) {
    const copy = JSON.parse(JSON.stringify(installation))
    
    copy.id = generateInstallationId(newName || `${installation.name} (Copia)`)
    copy.name = newName || `${installation.name} (Copia)`
    copy.created = new Date().toISOString()
    copy.lastPlayed = null
    copy.playtime = 0

    logger.info(`Instalación duplicada: ${installation.name} → ${copy.name}`)

    return copy
}

/**
 * Actualizar metadata de una instalación (tiempo de juego, última vez jugado)
 * @param {Object} installation - Instalación a actualizar
 * @param {Object} updates - Actualizaciones
 * @param {string} [updates.lastPlayed] - Timestamp ISO de última vez jugado
 * @param {number} [updates.playtime] - Tiempo de juego total en segundos
 * @returns {Object} Instalación actualizada
 */
exports.updateInstallationMetadata = function(installation, updates) {
    if (updates.lastPlayed !== undefined) {
        installation.lastPlayed = updates.lastPlayed
    }
    
    if (updates.playtime !== undefined) {
        installation.playtime = updates.playtime
    }

    return installation
}

/**
 * Obtener información legible de una instalación
 * @param {Object} installation - Instalación
 * @returns {Object} Información formateada
 */
exports.getInstallationInfo = function(installation) {
    const playtimeHours = Math.floor(installation.playtime / 3600)
    const playtimeMinutes = Math.floor((installation.playtime % 3600) / 60)

    return {
        name: installation.name,
        loader: installation.loader.type,
        minecraftVersion: installation.loader.minecraftVersion,
        loaderVersion: installation.loader.loaderVersion,
        // Información de OptiFine
        optifineEnabled: installation.optifine?.enabled || false,
        optifineVersionId: installation.optifine?.versionId || null,
        created: new Date(installation.created).toLocaleDateString(),
        lastPlayed: installation.lastPlayed ? new Date(installation.lastPlayed).toLocaleDateString() : 'Nunca',
        playtime: `${playtimeHours}h ${playtimeMinutes}m`,
        playtimeSeconds: installation.playtime
    }
}

/**
 * Convertir un auto-profile (OptiFine detectado) a un servidor virtual
 * 
 * Este método crea un servidor virtual a partir de un auto-profile detectado
 * en commonDir/versions. El servidor virtual usa el version.json de OptiFine
 * TAL CUAL, sin modificaciones.
 * 
 * @param {Object} profile - Auto-profile de optifineversions.getAllInstalledProfiles()
 * @param {string} profile.id - ID del auto-profile (ej: "autoprofile-optifine-1.20.1-OptiFine_HD_U_I6")
 * @param {string} profile.type - Tipo: 'optifine'
 * @param {string} profile.name - Nombre legible
 * @param {string} profile.minecraftVersion - Versión base de Minecraft
 * @param {string} profile.versionId - ID de la versión en versions/ (ej: "1.20.1-OptiFine_HD_U_I6")
 * @returns {Object} Servidor virtual compatible con DistroAPI
 */
exports.autoProfileToServer = function(profile) {
    const server = {
        id: profile.id,
        name: profile.name,
        description: `Minecraft ${profile.minecraftVersion} con OptiFine`,
        icon: 'https://optifine.net/images/logo.png',
        version: profile.displayVersion || '1.0.0',
        address: 'localhost:25565',
        minecraftVersion: profile.minecraftVersion,
        discord: null,
        mainServer: false,
        autoconnect: false,
        modules: [], // Auto-profiles no tienen módulos adicionales
        javaOptions: getDefaultJavaOptions(profile.minecraftVersion),
        // ============================================================
        // CLAVE: effectiveVersionId indica qué version.json usar
        // ProcessBuilder usará esta versión directamente, respetando
        // su mainClass, libraries y arguments TAL CUAL están definidos.
        // ============================================================
        effectiveVersionId: profile.versionId,
        // Marcar como auto-profile para que el launcher sepa cómo manejarlo
        isAutoProfile: true,
        autoProfileType: profile.type
    }

    logger.info(`Auto-profile convertido a servidor virtual: ${profile.name}`)
    logger.info(`  effectiveVersionId: ${profile.versionId}`)
    logger.info(`  minecraftVersion: ${profile.minecraftVersion}`)

    return server
}

/**
 * Obtener el versionId efectivo de una instalación para lanzamiento
 * Este es el ID de la versión que se usará en commonDir/versions/<versionId>
 * 
 * @param {Object} installation - Objeto de instalación
 * @returns {string} versionId efectivo
 */
exports.getEffectiveVersionId = function(installation) {
    const path = require('path')
    const fs = require('fs-extra')
    const ConfigManager = require('./configmanager')
    
    if (!installation || !installation.loader) {
        return null
    }
    
    const loader = installation.loader
    
    switch (loader.type) {
        case LoaderType.VANILLA:
            // Vanilla puro: minecraftVersion (ej: "1.20.1")
            return loader.minecraftVersion
            
        case LoaderType.FORGE: {
            // Forge: leer el version.json para obtener el ID real
            try {
                const loaderOnly = loader.loaderVersion.replace(`${loader.minecraftVersion}-`, '')
                const forgeVersion = `${loader.minecraftVersion}-forge-${loaderOnly}`
                const versionJsonPath = path.join(ConfigManager.getCommonDirectory(), 'versions', forgeVersion, `${forgeVersion}.json`)
                
                if (fs.existsSync(versionJsonPath)) {
                    const versionData = fs.readJsonSync(versionJsonPath)
                    return versionData.id || forgeVersion
                }
                
                return forgeVersion
            } catch(err) {
                console.warn(`[InstallationManager] Error leyendo version.json de Forge: ${err.message}`)
                const loaderOnly = loader.loaderVersion.replace(`${loader.minecraftVersion}-`, '')
                return `${loader.minecraftVersion}-forge-${loaderOnly}`
            }
        }
            
        case LoaderType.FABRIC: {
            // Fabric: formato fabric-loader-[version]-[mcVersion]
            try {
                const fabricVersion = `fabric-loader-${loader.loaderVersion}-${loader.minecraftVersion}`
                const versionJsonPath = path.join(ConfigManager.getCommonDirectory(), 'versions', fabricVersion, `${fabricVersion}.json`)
                
                if (fs.existsSync(versionJsonPath)) {
                    const versionData = fs.readJsonSync(versionJsonPath)
                    return versionData.id || fabricVersion
                }
                
                return fabricVersion
            } catch(err) {
                return `fabric-loader-${loader.loaderVersion}-${loader.minecraftVersion}`
            }
        }
            
        case LoaderType.QUILT: {
            // Quilt: formato quilt-loader-[version]-[mcVersion]
            try {
                const quiltVersion = `quilt-loader-${loader.loaderVersion}-${loader.minecraftVersion}`
                const versionJsonPath = path.join(ConfigManager.getCommonDirectory(), 'versions', quiltVersion, `${quiltVersion}.json`)
                
                if (fs.existsSync(versionJsonPath)) {
                    const versionData = fs.readJsonSync(versionJsonPath)
                    return versionData.id || quiltVersion
                }
                
                return quiltVersion
            } catch(err) {
                return `quilt-loader-${loader.loaderVersion}-${loader.minecraftVersion}`
            }
        }
            
        case LoaderType.NEOFORGE: {
            // NeoForge: formato neoforge-[version]
            try {
                const neoforgeVersion = `neoforge-${loader.loaderVersion}`
                const versionJsonPath = path.join(ConfigManager.getCommonDirectory(), 'versions', neoforgeVersion, `${neoforgeVersion}.json`)
                
                if (fs.existsSync(versionJsonPath)) {
                    const versionData = fs.readJsonSync(versionJsonPath)
                    return versionData.id || neoforgeVersion
                }
                
                return neoforgeVersion
            } catch(err) {
                return `neoforge-${loader.loaderVersion}`
            }
        }
            
        default:
            return loader.minecraftVersion
    }
}
// ============================================================================
// UPGRADE-IN-PLACE SYSTEM
// Sistema de actualización de instancias sin crear nuevas carpetas
// ============================================================================

/**
 * Comparar dos versiones de Minecraft para determinar upgrade/downgrade
 * @param {string} oldVersion - Versión antigua (ej: "1.19.2")
 * @param {string} newVersion - Versión nueva (ej: "1.20.1")
 * @returns {number} -1 si downgrade, 0 si igual, 1 si upgrade
 */
function compareMinecraftVersions(oldVersion, newVersion) {
    if (oldVersion === newVersion) return 0
    
    const oldParts = oldVersion.split('.').map(p => parseInt(p, 10) || 0)
    const newParts = newVersion.split('.').map(p => parseInt(p, 10) || 0)
    
    // Normalizar a 3 partes
    while (oldParts.length < 3) oldParts.push(0)
    while (newParts.length < 3) newParts.push(0)
    
    for (let i = 0; i < 3; i++) {
        if (newParts[i] > oldParts[i]) return 1  // Upgrade
        if (newParts[i] < oldParts[i]) return -1 // Downgrade
    }
    
    return 0
}

exports.compareMinecraftVersions = compareMinecraftVersions

/**
 * Analizar los cambios entre la instalación actual y el nuevo perfil
 * @param {Object} currentInstall - Instalación actual
 * @param {Object} newProfile - Nuevo perfil {loaderType, minecraftVersion, loaderVersion, name}
 * @returns {Object} Análisis de cambios
 */
exports.analyzeUpgradeChanges = function(currentInstall, newProfile) {
    const changes = {
        nameChanged: currentInstall.name !== newProfile.name,
        mcVersionChanged: currentInstall.loader.minecraftVersion !== newProfile.minecraftVersion,
        loaderTypeChanged: currentInstall.loader.type !== newProfile.loaderType,
        loaderVersionChanged: currentInstall.loader.loaderVersion !== newProfile.loaderVersion,
        
        // Detalles
        oldMcVersion: currentInstall.loader.minecraftVersion,
        newMcVersion: newProfile.minecraftVersion,
        oldLoaderType: currentInstall.loader.type,
        newLoaderType: newProfile.loaderType,
        oldLoaderVersion: currentInstall.loader.loaderVersion,
        newLoaderVersion: newProfile.loaderVersion,
        
        // Flags de riesgo
        isDowngrade: false,
        requiresModDisable: false,
        requiresBackup: false,
        
        // Resumen legible
        summary: []
    }
    
    // Detectar upgrade/downgrade de MC version
    if (changes.mcVersionChanged) {
        const comparison = compareMinecraftVersions(changes.oldMcVersion, changes.newMcVersion)
        changes.isDowngrade = comparison < 0
        changes.requiresBackup = true
        
        if (changes.isDowngrade) {
            changes.summary.push(`⚠️ DOWNGRADE: ${changes.oldMcVersion} → ${changes.newMcVersion}`)
        } else {
            changes.summary.push(`📈 Upgrade MC: ${changes.oldMcVersion} → ${changes.newMcVersion}`)
        }
    }
    
    // Detectar cambio de loader
    if (changes.loaderTypeChanged) {
        changes.requiresModDisable = true
        changes.requiresBackup = true
        changes.summary.push(`🔄 Cambio de loader: ${changes.oldLoaderType} → ${changes.newLoaderType}`)
    } else if (changes.loaderVersionChanged) {
        changes.summary.push(`📦 Versión de loader: ${changes.oldLoaderVersion} → ${changes.newLoaderVersion}`)
    }
    
    if (changes.nameChanged) {
        changes.summary.push(`📝 Nombre: ${currentInstall.name} → ${newProfile.name}`)
    }
    
    // Flag general: ¿hay cambios reales?
    changes.hasChanges = changes.mcVersionChanged || changes.loaderTypeChanged || 
                         changes.loaderVersionChanged || changes.nameChanged
    
    return changes
}

/**
 * Crear backup de una instancia antes del upgrade
 * @param {string} instanceId - ID de la instancia
 * @param {string} reason - Razón del backup (ej: "upgrade-1.19.2-to-1.20.1")
 * @returns {Object} {success: boolean, backupPath: string, error?: string}
 */
exports.createInstanceBackup = async function(instanceId, reason = 'manual') {
    const ConfigManager = require('./configmanager')
    
    const instancePath = path.join(ConfigManager.getInstanceDirectory(), instanceId)
    const backupsDir = path.join(ConfigManager.getDataDirectory(), 'instances-backups')
    
    // Crear directorio de backups si no existe
    fs.ensureDirSync(backupsDir)
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupName = `${instanceId}_${reason}_${timestamp}`
    const backupPath = path.join(backupsDir, backupName)
    
    try {
        if (!fs.existsSync(instancePath)) {
            logger.warn(`[Backup] Instance path does not exist: ${instancePath}`)
            // No es un error fatal, la instancia puede ser nueva
            return {
                success: true,
                backupPath: null,
                skipped: true,
                message: 'Instancia sin datos aún'
            }
        }
        
        // Copiar toda la carpeta de la instancia
        logger.info(`[Backup] Creando backup: ${backupPath}`)
        await fs.copy(instancePath, backupPath, {
            preserveTimestamps: true,
            errorOnExist: false
        })
        
        // Crear archivo de metadatos del backup
        const backupMeta = {
            instanceId,
            reason,
            timestamp: new Date().toISOString(),
            sourcePath: instancePath,
            backupPath
        }
        await fs.writeJson(path.join(backupPath, '_backup_meta.json'), backupMeta, { spaces: 2 })
        
        logger.info(`[Backup] Backup completado: ${backupPath}`)
        
        return {
            success: true,
            backupPath,
            timestamp: backupMeta.timestamp
        }
        
    } catch (err) {
        logger.error(`[Backup] Error creando backup: ${err.message}`)
        return {
            success: false,
            backupPath: null,
            error: err.message
        }
    }
}

/**
 * Deshabilitar mods moviendo la carpeta mods/ a mods.disabled/
 * @param {string} instanceId - ID de la instancia
 * @returns {Object} {success: boolean, modsCount: number, error?: string}
 */
exports.disableInstanceMods = async function(instanceId) {
    const ConfigManager = require('./configmanager')
    
    const instancePath = path.join(ConfigManager.getInstanceDirectory(), instanceId)
    const modsPath = path.join(instancePath, 'mods')
    const modsDisabledPath = path.join(instancePath, 'mods.disabled')
    
    try {
        if (!fs.existsSync(modsPath)) {
            logger.info(`[DisableMods] No hay carpeta mods/ en ${instanceId}`)
            return { success: true, modsCount: 0 }
        }
        
        // Contar mods
        const modFiles = fs.readdirSync(modsPath).filter(f => f.endsWith('.jar'))
        
        if (modFiles.length === 0) {
            logger.info(`[DisableMods] Carpeta mods/ vacía en ${instanceId}`)
            return { success: true, modsCount: 0 }
        }
        
        // Si ya existe mods.disabled, mover contenido a un subfolder con timestamp
        if (fs.existsSync(modsDisabledPath)) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
            const archivePath = path.join(modsDisabledPath, `_archived_${timestamp}`)
            
            // Mover archivos existentes al archivo
            const existingFiles = fs.readdirSync(modsDisabledPath)
            if (existingFiles.length > 0) {
                fs.ensureDirSync(archivePath)
                for (const file of existingFiles) {
                    if (!file.startsWith('_archived_')) {
                        await fs.move(
                            path.join(modsDisabledPath, file),
                            path.join(archivePath, file)
                        )
                    }
                }
            }
        }
        
        // Mover mods/ → mods.disabled/
        logger.info(`[DisableMods] Moviendo ${modFiles.length} mods a mods.disabled/`)
        await fs.move(modsPath, modsDisabledPath, { overwrite: true })
        
        // Crear carpeta mods/ vacía
        fs.ensureDirSync(modsPath)
        
        logger.info(`[DisableMods] ${modFiles.length} mods deshabilitados en ${instanceId}`)
        
        return {
            success: true,
            modsCount: modFiles.length,
            modsDisabledPath
        }
        
    } catch (err) {
        logger.error(`[DisableMods] Error: ${err.message}`)
        return {
            success: false,
            modsCount: 0,
            error: err.message
        }
    }
}

/**
 * Restaurar mods desde mods.disabled/
 * @param {string} instanceId - ID de la instancia
 * @returns {Object} {success: boolean, modsCount: number}
 */
exports.restoreInstanceMods = async function(instanceId) {
    const ConfigManager = require('./configmanager')
    
    const instancePath = path.join(ConfigManager.getInstanceDirectory(), instanceId)
    const modsPath = path.join(instancePath, 'mods')
    const modsDisabledPath = path.join(instancePath, 'mods.disabled')
    
    try {
        if (!fs.existsSync(modsDisabledPath)) {
            return { success: true, modsCount: 0 }
        }
        
        // Contar mods a restaurar (excluyendo carpetas _archived_)
        const modFiles = fs.readdirSync(modsDisabledPath)
            .filter(f => f.endsWith('.jar'))
        
        if (modFiles.length === 0) {
            return { success: true, modsCount: 0 }
        }
        
        // Mover de vuelta
        for (const mod of modFiles) {
            await fs.move(
                path.join(modsDisabledPath, mod),
                path.join(modsPath, mod),
                { overwrite: true }
            )
        }
        
        logger.info(`[RestoreMods] ${modFiles.length} mods restaurados en ${instanceId}`)
        
        return {
            success: true,
            modsCount: modFiles.length
        }
        
    } catch (err) {
        logger.error(`[RestoreMods] Error: ${err.message}`)
        return {
            success: false,
            modsCount: 0,
            error: err.message
        }
    }
}

/**
 * Restaurar una instancia desde un backup
 * @param {string} backupPath - Ruta al backup
 * @param {string} instanceId - ID de la instancia destino
 * @returns {Object} {success: boolean, error?: string}
 */
exports.restoreFromBackup = async function(backupPath, instanceId) {
    const ConfigManager = require('./configmanager')
    
    const instancePath = path.join(ConfigManager.getInstanceDirectory(), instanceId)
    
    try {
        if (!fs.existsSync(backupPath)) {
            return { success: false, error: 'Backup no encontrado' }
        }
        
        // Eliminar instancia actual
        if (fs.existsSync(instancePath)) {
            await fs.remove(instancePath)
        }
        
        // Copiar backup a instancia
        await fs.copy(backupPath, instancePath, {
            preserveTimestamps: true
        })
        
        // Eliminar archivo de metadatos del backup
        const metaPath = path.join(instancePath, '_backup_meta.json')
        if (fs.existsSync(metaPath)) {
            await fs.remove(metaPath)
        }
        
        logger.info(`[Restore] Instancia ${instanceId} restaurada desde backup`)
        
        return { success: true }
        
    } catch (err) {
        logger.error(`[Restore] Error: ${err.message}`)
        return { success: false, error: err.message }
    }
}

/**
 * Obtener lista de backups disponibles para una instancia
 * @param {string} instanceId - ID de la instancia
 * @returns {Array} Lista de backups [{path, timestamp, reason}]
 */
exports.getInstanceBackups = function(instanceId) {
    const ConfigManager = require('./configmanager')
    const backupsDir = path.join(ConfigManager.getDataDirectory(), 'instances-backups')
    
    if (!fs.existsSync(backupsDir)) {
        return []
    }
    
    const backups = []
    const entries = fs.readdirSync(backupsDir)
    
    for (const entry of entries) {
        if (entry.startsWith(instanceId + '_')) {
            const backupPath = path.join(backupsDir, entry)
            const metaPath = path.join(backupPath, '_backup_meta.json')
            
            let meta = { timestamp: 'unknown', reason: 'unknown' }
            if (fs.existsSync(metaPath)) {
                try {
                    meta = fs.readJsonSync(metaPath)
                } catch (e) {
                    // Ignorar errores de lectura
                }
            }
            
            backups.push({
                name: entry,
                path: backupPath,
                timestamp: meta.timestamp,
                reason: meta.reason
            })
        }
    }
    
    // Ordenar por timestamp descendente (más reciente primero)
    backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    
    return backups
}

/**
 * FUNCIÓN PRINCIPAL: Actualizar una instancia in-place
 * 
 * @param {string} instanceId - ID de la instancia a actualizar
 * @param {Object} newProfile - Nuevo perfil
 * @param {string} newProfile.name - Nombre de la instalación
 * @param {string} newProfile.loaderType - Tipo de loader (vanilla/forge/fabric/quilt/neoforge)
 * @param {string} newProfile.minecraftVersion - Versión de Minecraft
 * @param {string|null} newProfile.loaderVersion - Versión del loader (null para vanilla)
 * @param {Object} options - Opciones
 * @param {boolean} options.skipBackup - Saltar backup (NO RECOMENDADO)
 * @param {boolean} options.forceModDisable - Forzar deshabilitación de mods incluso si no cambia loader
 * @returns {Object} Resultado del upgrade
 */
exports.upgradeInstanceInPlace = async function(instanceId, newProfile, options = {}) {
    const ConfigManager = require('./configmanager')
    
    const result = {
        success: false,
        backupPath: null,
        modsDisabled: 0,
        changes: null,
        error: null,
        warnings: []
    }
    
    try {
        // 1. Obtener instalación actual
        const currentInstall = ConfigManager.getInstallation(instanceId)
        if (!currentInstall) {
            result.error = `Instalación no encontrada: ${instanceId}`
            return result
        }
        
        // 2. Analizar cambios
        const changes = exports.analyzeUpgradeChanges(currentInstall, newProfile)
        result.changes = changes
        
        if (!changes.hasChanges) {
            result.success = true
            result.warnings.push('No hay cambios que aplicar')
            return result
        }
        
        logger.info(`[Upgrade] Iniciando upgrade de ${instanceId}`)
        logger.info(`[Upgrade] Cambios: ${changes.summary.join(', ')}`)
        
        // 3. Crear backup (obligatorio a menos que se salte explícitamente)
        if (!options.skipBackup && changes.requiresBackup) {
            const backupReason = changes.isDowngrade ? 
                `downgrade-${changes.oldMcVersion}-to-${changes.newMcVersion}` :
                `upgrade-${changes.oldMcVersion}-to-${changes.newMcVersion}`
            
            const backupResult = await exports.createInstanceBackup(instanceId, backupReason)
            
            if (!backupResult.success && !backupResult.skipped) {
                result.error = `Error creando backup: ${backupResult.error}`
                return result
            }
            
            result.backupPath = backupResult.backupPath
            
            if (backupResult.backupPath) {
                logger.info(`[Upgrade] Backup creado: ${backupResult.backupPath}`)
            }
        }
        
        // 4. Deshabilitar mods si cambia loader
        if (changes.loaderTypeChanged || options.forceModDisable) {
            const disableResult = await exports.disableInstanceMods(instanceId)
            
            if (!disableResult.success) {
                result.warnings.push(`Error deshabilitando mods: ${disableResult.error}`)
            } else if (disableResult.modsCount > 0) {
                result.modsDisabled = disableResult.modsCount
                logger.info(`[Upgrade] ${disableResult.modsCount} mods deshabilitados`)
            }
        }
        
        // 5. Actualizar metadata de la instalación
        const updates = {
            name: newProfile.name,
            loader: {
                type: newProfile.loaderType,
                minecraftVersion: newProfile.minecraftVersion,
                loaderVersion: newProfile.loaderVersion || null
            }
        }
        
        // Registrar historial de upgrade
        if (!currentInstall.upgradeHistory) {
            currentInstall.upgradeHistory = []
        }
        
        currentInstall.upgradeHistory.push({
            timestamp: new Date().toISOString(),
            from: {
                mcVersion: changes.oldMcVersion,
                loaderType: changes.oldLoaderType,
                loaderVersion: changes.oldLoaderVersion
            },
            to: {
                mcVersion: changes.newMcVersion,
                loaderType: changes.newLoaderType,
                loaderVersion: changes.newLoaderVersion
            },
            backupPath: result.backupPath
        })
        
        updates.upgradeHistory = currentInstall.upgradeHistory
        updates.lastUpgrade = new Date().toISOString()
        
        // Limpiar estado de error previo si existe
        updates.upgradeFailed = null
        
        const updated = ConfigManager.updateInstallation(instanceId, updates)
        
        if (!updated) {
            result.error = 'Error actualizando metadata de instalación'
            // Marcar como fallido para recovery
            ConfigManager.updateInstallation(instanceId, {
                upgradeFailed: {
                    timestamp: new Date().toISOString(),
                    targetProfile: newProfile,
                    backupPath: result.backupPath,
                    error: result.error
                }
            })
            ConfigManager.save()
            return result
        }
        
        ConfigManager.save()
        
        logger.info(`[Upgrade] Upgrade completado exitosamente para ${instanceId}`)
        
        result.success = true
        return result
        
    } catch (err) {
        logger.error(`[Upgrade] Error durante upgrade: ${err.message}`)
        result.error = err.message
        
        // Intentar marcar como fallido para recovery
        try {
            const ConfigManager = require('./configmanager')
            ConfigManager.updateInstallation(instanceId, {
                upgradeFailed: {
                    timestamp: new Date().toISOString(),
                    targetProfile: newProfile,
                    backupPath: result.backupPath,
                    error: err.message
                }
            })
            ConfigManager.save()
        } catch (e) {
            logger.error(`[Upgrade] Error guardando estado fallido: ${e.message}`)
        }
        
        return result
    }
}

/**
 * Verificar si una instancia tiene un upgrade fallido pendiente
 * @param {string} instanceId - ID de la instancia
 * @returns {Object|null} Información del upgrade fallido o null
 */
exports.getFailedUpgrade = function(instanceId) {
    const ConfigManager = require('./configmanager')
    const install = ConfigManager.getInstallation(instanceId)
    
    if (install && install.upgradeFailed) {
        return install.upgradeFailed
    }
    
    return null
}

/**
 * Limpiar estado de upgrade fallido
 * @param {string} instanceId - ID de la instancia
 */
exports.clearFailedUpgrade = function(instanceId) {
    const ConfigManager = require('./configmanager')
    ConfigManager.updateInstallation(instanceId, { upgradeFailed: null })
    ConfigManager.save()
}