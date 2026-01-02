/**
 * Gestor de Instalaciones - Crea y mapea instalaciones a servidores virtuales
 * Compatible con el sistema existente de Helios (ProcessBuilder)
 */

const crypto = require('crypto')
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
