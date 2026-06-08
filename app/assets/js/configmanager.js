const fs   = require('fs-extra')
const { LoggerUtil } = require('helios-core')
const os   = require('os')
const path = require('path')

const logger = LoggerUtil.getLogger('ConfigManager')

const sysRoot = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME)

// Data directory changed from .helioslauncher to .tecnilandnexus
const dataPath = path.join(sysRoot, '.tecnilandnexus')

const launcherDir = require('@electron/remote').app.getPath('userData')

/**
 * Retrieve the absolute path of the launcher directory.
 * 
 * @returns {string} The absolute path of the launcher directory.
 */
exports.getLauncherDirectory = function(){
    return launcherDir
}

/**
 * Get the launcher's data directory. This is where all files related
 * to game launch are installed (common, instances, java, etc).
 * 
 * @returns {string} The absolute path of the launcher's data directory.
 */
exports.getDataDirectory = function(def = false){
    return !def ? config.settings.launcher.dataDirectory : DEFAULT_CONFIG.settings.launcher.dataDirectory
}

/**
 * Set the new data directory.
 * 
 * @param {string} dataDirectory The new data directory.
 */
exports.setDataDirectory = function(dataDirectory){
    config.settings.launcher.dataDirectory = dataDirectory
}

const configPath = path.join(exports.getLauncherDirectory(), 'config.json')
const configPathLEGACY = path.join(dataPath, 'config.json')
const firstLaunch = !fs.existsSync(configPath) && !fs.existsSync(configPathLEGACY)

exports.getAbsoluteMinRAM = function(ram){
    if(ram?.minimum != null) {
        return ram.minimum/1024
    } else {
        // Legacy behavior
        const mem = os.totalmem()
        return mem >= (6*1073741824) ? 3 : 2
    }
}

exports.getAbsoluteMaxRAM = function(ram){
    const mem = os.totalmem()
    const gT16 = mem-(16*1073741824)
    return Math.floor((mem-(gT16 > 0 ? (Number.parseInt(gT16/8) + (16*1073741824)/4) : mem/4))/1073741824)
}

function resolveSelectedRAM(ram) {
    if(ram?.recommended != null) {
        return `${ram.recommended}M`
    } else {
        // Legacy behavior
        const mem = os.totalmem()
        return mem >= (8*1073741824) ? '4G' : (mem >= (6*1073741824) ? '3G' : '2G')
    }
}

/**
 * Three types of values:
 * Static = Explicitly declared.
 * Dynamic = Calculated by a private function.
 * Resolved = Resolved externally, defaults to null.
 */
const DEFAULT_CONFIG = {
    settings: {
        game: {
            resWidth: 1280,
            resHeight: 720,
            fullscreen: false,
            autoConnect: true,
            launchDetached: true
        },
        launcher: {
            allowPrerelease: false,
            showLegacyVersions: false,
            showLiveLogs: false,
            dataDirectory: dataPath,
            language: 'es_ES'
        },
        java: {
            additionalJvmArgs: []  // Global JVM args (new)
        },
        skinViewer3D: {
            enabled: true,  // Renderizado 3D de skins (true = 3D, false = 2D)
            quality: 'medium'  // Calidad: 'low', 'medium', 'high'
        }
    },
    newsCache: {
        date: null,
        content: null,
        dismissed: false
    },
    clientToken: null,
    selectedServer: null, // Resolved
    selectedAccount: null,
    authenticationDatabase: {},
    modConfigurations: [],
    javaConfig: {},
    installations: [],
    selectedInstallation: null,
    modpackInstallations: [],  // TECNILAND Modpacks state
    customization: {
        background: null,        // nombre de archivo del fondo elegido, ej. '3.jpg' (o null)
        backgroundRandom: false, // true = aleatorio en cada inicio (ignora 'background')
        logo: null               // null = SealCircle.png por defecto. Si no, ruta relativa al logo
    }
}

let config = null

// Persistance Utility Functions

/**
 * Save the current configuration to a file.
 */
exports.save = function(){
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'UTF-8')
}

/**
 * Load the configuration into memory. If a configuration file exists,
 * that will be read and saved. Otherwise, a default configuration will
 * be generated. Note that "resolved" values default to null and will
 * need to be externally assigned.
 */
exports.load = function(){
    let doLoad = true

    if(!fs.existsSync(configPath)){
        // Create all parent directories.
        fs.ensureDirSync(path.join(configPath, '..'))
        if(fs.existsSync(configPathLEGACY)){
            fs.moveSync(configPathLEGACY, configPath)
        } else {
            doLoad = false
            config = DEFAULT_CONFIG
            exports.save()
        }
    }
    if(doLoad){
        let doValidate = false
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'UTF-8'))
            doValidate = true
        } catch (err){
            logger.error(err)
            logger.info('Configuration file contains malformed JSON or is corrupt.')
            logger.info('Generating a new configuration file.')
            fs.ensureDirSync(path.join(configPath, '..'))
            config = DEFAULT_CONFIG
            exports.save()
        }
        if(doValidate){
            config = validateKeySet(DEFAULT_CONFIG, config)
            exports.save()
        }
    }
    logger.info('Successfully Loaded')
}

/**
 * @returns {boolean} Whether or not the manager has been loaded.
 */
exports.isLoaded = function(){
    return config != null
}

/**
 * Validate that the destination object has at least every field
 * present in the source object. Assign a default value otherwise.
 * 
 * @param {Object} srcObj The source object to reference against.
 * @param {Object} destObj The destination object.
 * @returns {Object} A validated destination object.
 */
function validateKeySet(srcObj, destObj){
    if(srcObj == null){
        srcObj = {}
    }
    const validationBlacklist = ['authenticationDatabase', 'javaConfig']
    const keys = Object.keys(srcObj)
    for(let i=0; i<keys.length; i++){
        if(typeof destObj[keys[i]] === 'undefined'){
            destObj[keys[i]] = srcObj[keys[i]]
        } else if(typeof srcObj[keys[i]] === 'object' && srcObj[keys[i]] != null && !(srcObj[keys[i]] instanceof Array) && validationBlacklist.indexOf(keys[i]) === -1){
            destObj[keys[i]] = validateKeySet(srcObj[keys[i]], destObj[keys[i]])
        }
    }
    return destObj
}

/**
 * Check to see if this is the first time the user has launched the
 * application. This is determined by the existance of the data path.
 * 
 * @returns {boolean} True if this is the first launch, otherwise false.
 */
exports.isFirstLaunch = function(){
    return firstLaunch
}

/**
 * Returns the name of the folder in the OS temp directory which we
 * will use to extract and store native dependencies for game launch.
 * 
 * @returns {string} The name of the folder.
 */
exports.getTempNativeFolder = function(){
    return 'WCNatives'
}

// System Settings (Unconfigurable on UI)

/**
 * Retrieve the news cache to determine
 * whether or not there is newer news.
 * 
 * @returns {Object} The news cache object.
 */
exports.getNewsCache = function(){
    return config.newsCache
}

/**
 * Set the new news cache object.
 * 
 * @param {Object} newsCache The new news cache object.
 */
exports.setNewsCache = function(newsCache){
    config.newsCache = newsCache
}

/**
 * Set whether or not the news has been dismissed (checked)
 * 
 * @param {boolean} dismissed Whether or not the news has been dismissed (checked).
 */
exports.setNewsCacheDismissed = function(dismissed){
    config.newsCache.dismissed = dismissed
}

/**
 * Retrieve the common directory for shared
 * game files (assets, libraries, etc).
 * 
 * @returns {string} The launcher's common directory.
 */
exports.getCommonDirectory = function(){
    return path.join(exports.getDataDirectory(), 'common')
}

/**
 * Retrieve the instance directory for the per
 * server game directories.
 * 
 * @returns {string} The launcher's instance directory.
 */
exports.getInstanceDirectory = function(){
    return path.join(exports.getDataDirectory(), 'instances')
}

/**
 * Retrieve the launcher's Client Token.
 * There is no default client token.
 * 
 * @returns {string} The launcher's Client Token.
 */
exports.getClientToken = function(){
    return config.clientToken
}

/**
 * Set the launcher's Client Token.
 * 
 * @param {string} clientToken The launcher's new Client Token.
 */
exports.setClientToken = function(clientToken){
    config.clientToken = clientToken
}

/**
 * Retrieve the ID of the selected serverpack.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {string} The ID of the selected serverpack.
 */
exports.getSelectedServer = function(def = false){
    return !def ? config.selectedServer : DEFAULT_CONFIG.selectedServer
}

/**
 * Set the ID of the selected serverpack.
 * 
 * @param {string} serverID The ID of the new selected serverpack.
 */
exports.setSelectedServer = function(serverID){
    config.selectedServer = serverID
}

/**
 * Get an array of each account currently authenticated by the launcher.
 * 
 * @returns {Array.<Object>} An array of each stored authenticated account.
 */
exports.getAuthAccounts = function(){
    return config.authenticationDatabase
}

/**
 * Returns the authenticated account with the given uuid. Value may
 * be null.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * @returns {Object} The authenticated account with the given uuid.
 */
exports.getAuthAccount = function(uuid){
    return config.authenticationDatabase[uuid]
}

/**
 * Update the access token of an authenticated mojang account.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * @param {string} accessToken The new Access Token.
 * 
 * @returns {Object} The authenticated account object created by this action.
 */
exports.updateMojangAuthAccount = function(uuid, accessToken){
    config.authenticationDatabase[uuid].accessToken = accessToken
    config.authenticationDatabase[uuid].type = 'mojang' // For gradual conversion.
    return config.authenticationDatabase[uuid]
}

/**
 * Adds an authenticated mojang account to the database to be stored.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * @param {string} accessToken The accessToken of the authenticated account.
 * @param {string} username The username (usually email) of the authenticated account.
 * @param {string} displayName The in game name of the authenticated account.
 * 
 * @returns {Object} The authenticated account object created by this action.
 */
exports.addMojangAuthAccount = function(uuid, accessToken, username, displayName){
    config.selectedAccount = uuid
    config.authenticationDatabase[uuid] = {
        type: 'mojang',
        accessToken,
        username: username.trim(),
        uuid: uuid.trim(),
        displayName: displayName.trim()
    }
    return config.authenticationDatabase[uuid]
}

/**
 * Update the tokens of an authenticated microsoft account.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * @param {string} accessToken The new Access Token.
 * @param {string} msAccessToken The new Microsoft Access Token
 * @param {string} msRefreshToken The new Microsoft Refresh Token
 * @param {date} msExpires The date when the microsoft access token expires
 * @param {date} mcExpires The date when the mojang access token expires
 * 
 * @returns {Object} The authenticated account object created by this action.
 */
exports.updateMicrosoftAuthAccount = function(uuid, accessToken, msAccessToken, msRefreshToken, msExpires, mcExpires) {
    config.authenticationDatabase[uuid].accessToken = accessToken
    config.authenticationDatabase[uuid].expiresAt = mcExpires
    config.authenticationDatabase[uuid].microsoft.access_token = msAccessToken
    config.authenticationDatabase[uuid].microsoft.refresh_token = msRefreshToken
    config.authenticationDatabase[uuid].microsoft.expires_at = msExpires
    return config.authenticationDatabase[uuid]
}

/**
 * Adds an authenticated microsoft account to the database to be stored.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * @param {string} accessToken The accessToken of the authenticated account.
 * @param {string} name The in game name of the authenticated account.
 * @param {date} mcExpires The date when the mojang access token expires
 * @param {string} msAccessToken The microsoft access token
 * @param {string} msRefreshToken The microsoft refresh token
 * @param {date} msExpires The date when the microsoft access token expires
 * 
 * @returns {Object} The authenticated account object created by this action.
 */
exports.addMicrosoftAuthAccount = function(uuid, accessToken, name, mcExpires, msAccessToken, msRefreshToken, msExpires) {
    config.selectedAccount = uuid
    config.authenticationDatabase[uuid] = {
        type: 'microsoft',
        accessToken,
        username: name.trim(),
        uuid: uuid.trim(),
        displayName: name.trim(),
        expiresAt: mcExpires,
        microsoft: {
            access_token: msAccessToken,
            refresh_token: msRefreshToken,
            expires_at: msExpires
        }
    }
    return config.authenticationDatabase[uuid]
}

/**
 * Adds an offline account to the database to be stored.
 * Offline accounts can be used to play on cracked/offline servers.
 * 
 * @param {string} uuid The uuid of the offline account (generated from username).
 * @param {string} username The username for the offline account.
 * @param {string} displayName Optional display name, defaults to username.
 * 
 * @returns {Object} The offline account object created by this action.
 */
exports.addOfflineAccount = function(uuid, username, displayName = null) {
    config.selectedAccount = uuid
    config.authenticationDatabase[uuid] = {
        type: 'offline',
        username: username.trim(),
        uuid: uuid.trim(),
        displayName: (displayName || username).trim(),
        // Offline accounts don't need tokens
        accessToken: '0'
    }
    return config.authenticationDatabase[uuid]
}

/**
 * Get all offline accounts from the database.
 * 
 * @returns {Array<Object>} Array of offline account objects.
 */
exports.getOfflineAccounts = function() {
    const offlineAccounts = []
    for (const uuid in config.authenticationDatabase) {
        if (config.authenticationDatabase[uuid].type === 'offline') {
            offlineAccounts.push(config.authenticationDatabase[uuid])
        }
    }
    return offlineAccounts
}

/**
 * Get the skin data for an offline account.
 * 
 * @param {string} uuid The UUID of the offline account.
 * @returns {{path: string|null, model: string, lastUpdated: number|null}|null} The skin data or null.
 */
exports.getOfflineAccountSkin = function(uuid) {
    const account = config.authenticationDatabase[uuid]
    if (account && account.type === 'offline') {
        return account.skin || null
    }
    return null
}

/**
 * Set the skin data for an offline account.
 * 
 * @param {string} uuid The UUID of the offline account.
 * @param {{path: string|null, model: string, lastUpdated: number|null}|null} skinData The skin data to set, or null to clear.
 * @returns {boolean} True if the skin was set successfully.
 */
exports.setOfflineAccountSkin = function(uuid, skinData) {
    const account = config.authenticationDatabase[uuid]
    if (account && account.type === 'offline') {
        if (skinData === null) {
            delete account.skin
        } else {
            account.skin = {
                path: skinData.path || null,
                model: skinData.model || 'classic',
                lastUpdated: skinData.lastUpdated || Date.now()
            }
        }
        return true
    }
    return false
}

// =============================================================================
// TECNILAND Account Functions
// =============================================================================

/**
 * Add a TECNILAND authenticated account to the database.
 * 
 * @param {string} uuid The UUID of the account.
 * @param {string} accessToken The JWT access token.
 * @param {string} username The username of the account.
 * @param {string} displayName The display name of the account.
 * @param {string} email The email of the account.
 * @param {string} clientToken The client token for Yggdrasil.
 * @param {string} yggdrasilToken The Yggdrasil access token.
 * 
 * @returns {Object} The authenticated account object created by this action.
 */
exports.addTecnilandAuthAccount = function(uuid, accessToken, username, displayName, email, clientToken, yggdrasilToken) {
    config.selectedAccount = uuid
    config.clientToken = clientToken
    config.authenticationDatabase[uuid] = {
        type: 'tecniland',
        accessToken: accessToken,
        username: username.trim(),
        uuid: uuid.trim(),
        displayName: displayName ? displayName.trim() : username.trim(),
        email: email ? email.trim() : null,
        clientToken: clientToken,
        yggdrasilToken: yggdrasilToken
    }
    return config.authenticationDatabase[uuid]
}

/**
 * Update a TECNILAND authenticated account with new token data.
 * 
 * @param {string} uuid The UUID of the account to update.
 * @param {Object} updates The updates to apply (accessToken, yggdrasilToken, clientToken, etc).
 * 
 * @returns {Object|null} The updated account object or null if not found.
 */
exports.updateTecnilandAuthAccount = function(uuid, updates) {
    const account = config.authenticationDatabase[uuid]
    if (account && account.type === 'tecniland') {
        if (updates.accessToken) account.accessToken = updates.accessToken
        if (updates.yggdrasilToken) account.yggdrasilToken = updates.yggdrasilToken
        if (updates.clientToken) account.clientToken = updates.clientToken
        if (updates.displayName) account.displayName = updates.displayName
        if (updates.username) account.username = updates.username
        return account
    }
    return null
}

/**
 * Get all TECNILAND accounts from the database.
 * 
 * @returns {Array<Object>} Array of TECNILAND account objects.
 */
exports.getTecnilandAccounts = function() {
    const tecnilandAccounts = []
    for (const uuid in config.authenticationDatabase) {
        if (config.authenticationDatabase[uuid].type === 'tecniland') {
            tecnilandAccounts.push(config.authenticationDatabase[uuid])
        }
    }
    return tecnilandAccounts
}

/**
 * Get the TECNILAND session data (stored separately for quick access).
 * 
 * @returns {Object|null} The TECNILAND session data or null.
 */
exports.getTecnilandSession = function() {
    const session = config.tecnilandSession || null
    logger.debug('[getTecnilandSession] Llamado')
    logger.debug('[getTecnilandSession] Datos:', session ? 'EXISTE' : 'NULL')
    
    if (session) {
        logger.debug('[getTecnilandSession] Keys:', Object.keys(session).join(', '))
        
        // Validar estructura: si tiene campos viejos pero no los nuevos, limpiar
        if (session.lastValidated && !session.jwtToken && !session.user) {
            logger.warn('[getTecnilandSession] Detectada estructura antigua/inválida, limpiando')
            delete config.tecnilandSession
            return null
        }
    }
    
    return session
}

/**
 * Set the TECNILAND session data.
 * 
 * @param {Object|null} session The session data to store or null to clear.
 */
exports.setTecnilandSession = function(session) {
    logger.debug('[setTecnilandSession] Recibido:', session ? 
        (typeof session === 'object' ? JSON.stringify(Object.keys(session)) : 'NO ES OBJETO') 
        : 'NULL')
    
    if (session === null) {
        logger.debug('[setTecnilandSession] Eliminando sesión')
        delete config.tecnilandSession
    } else {
        // Estructura correcta que coincide con TecnilandAuthManager.saveSession()
        config.tecnilandSession = {
            jwtToken: session.jwtToken,
            jwtTokenExpiresAt: session.jwtTokenExpiresAt,
            yggdrasilAccessToken: session.yggdrasilAccessToken,
            yggdrasilClientToken: session.yggdrasilClientToken,
            user: session.user,
            lastLogin: session.lastLogin
        }
        logger.debug('[setTecnilandSession] Guardado con keys:', Object.keys(config.tecnilandSession).join(', '))
    }
}

/**
 * Remove an authenticated account from the database. If the account
 * was also the selected account, a new one will be selected. If there
 * are no accounts, the selected account will be null.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * 
 * @returns {boolean} True if the account was removed, false if it never existed.
 */
exports.removeAuthAccount = function(uuid){
    if(config.authenticationDatabase[uuid] != null){
        delete config.authenticationDatabase[uuid]
        if(config.selectedAccount === uuid){
            const keys = Object.keys(config.authenticationDatabase)
            if(keys.length > 0){
                config.selectedAccount = keys[0]
            } else {
                config.selectedAccount = null
                config.clientToken = null
            }
        }
        return true
    }
    return false
}

/**
 * Get the currently selected authenticated account.
 * 
 * @returns {Object} The selected authenticated account.
 */
exports.getSelectedAccount = function(){
    return config.authenticationDatabase[config.selectedAccount]
}

/**
 * Set the selected authenticated account.
 * 
 * @param {string} uuid The UUID of the account which is to be set
 * as the selected account.
 * 
 * @returns {Object} The selected authenticated account.
 */
exports.setSelectedAccount = function(uuid){
    const authAcc = config.authenticationDatabase[uuid]
    if(authAcc != null) {
        config.selectedAccount = uuid
    }
    return authAcc
}

/**
 * Get the avatar URL for an account.
 * This centralizes avatar URL logic for all account types.
 * 
 * @param {Object} account - The account object (or null to use selected account)
 * @param {string} renderType - 'body', 'avatar', or 'head' (default: auto-detect)
 * @returns {string} The URL of the avatar image
 */
exports.getAccountAvatarUrl = function(account = null, renderType = null) {
    const acc = account || config.authenticationDatabase[config.selectedAccount]
    if (!acc || !acc.uuid) {
        return './assets/images/icons/profile.svg'
    }
    
    // Auto-detect render type if not specified
    const type = renderType || (acc.type === 'offline' ? 'avatar' : 'body')
    
    if (acc.type === 'tecniland') {
        // TECNILAND accounts use the TECNILAND skin server with timestamp to avoid cache
        try {
            const TecnilandAuthConfig = require('./assets/js/tecnilandauth/TecnilandAuthConfig')
            const skinUrl = TecnilandAuthConfig.getSkinUrl(acc.uuid)
            return skinUrl ? `${skinUrl}?t=${Date.now()}` : `https://mc-heads.net/${type}/${acc.uuid}/right`
        } catch (e) {
            return `https://mc-heads.net/${type}/${acc.uuid}/right`
        }
    } else if (acc.type === 'offline') {
        // Offline accounts - check local skin first
        try {
            const SkinManager = require('./assets/js/skinmanager')
            const localSkin = SkinManager.getSkinDisplayUrl(acc.uuid, 'offline')
            if (localSkin && !localSkin.includes('mc-heads')) {
                return localSkin
            }
        } catch (e) {
            // Fallback
        }
        return `https://mc-heads.net/${type}/${acc.uuid}/right`
    } else {
        // Microsoft/Mojang accounts
        return `https://mc-heads.net/${type}/${acc.uuid}/right`
    }
}

/**
 * Get an array of each mod configuration currently stored.
 * 
 * @returns {Array.<Object>} An array of each stored mod configuration.
 */
exports.getModConfigurations = function(){
    return config.modConfigurations
}

/**
 * Set the array of stored mod configurations.
 * 
 * @param {Array.<Object>} configurations An array of mod configurations.
 */
exports.setModConfigurations = function(configurations){
    config.modConfigurations = configurations
}

/**
 * Get the mod configuration for a specific server.
 * 
 * @param {string} serverid The id of the server.
 * @returns {Object} The mod configuration for the given server.
 */
exports.getModConfiguration = function(serverid){
    const cfgs = config.modConfigurations
    for(let i=0; i<cfgs.length; i++){
        if(cfgs[i].id === serverid){
            return cfgs[i]
        }
    }
    // Si no existe configuración, devolver una vacía por defecto (para instalaciones personalizadas)
    return {
        id: serverid,
        mods: {}
    }
}

/**
 * Set the mod configuration for a specific server. This overrides any existing value.
 * 
 * @param {string} serverid The id of the server for the given mod configuration.
 * @param {Object} configuration The mod configuration for the given server.
 */
exports.setModConfiguration = function(serverid, configuration){
    const cfgs = config.modConfigurations
    for(let i=0; i<cfgs.length; i++){
        if(cfgs[i].id === serverid){
            cfgs[i] = configuration
            return
        }
    }
    cfgs.push(configuration)
}

// User Configurable Settings

// Java Settings

function defaultJavaConfig(effectiveJavaOptions, ram) {
    if(effectiveJavaOptions.suggestedMajor > 8) {
        return defaultJavaConfig17(ram)
    } else {
        return defaultJavaConfig8(ram)
    }
}

function defaultJavaConfig8(ram) {
    return {
        minRAM: resolveSelectedRAM(ram),
        maxRAM: resolveSelectedRAM(ram),
        executable: null,
        jvmOptions: [
            '-XX:+UseConcMarkSweepGC',
            '-XX:+CMSIncrementalMode',
            '-XX:-UseAdaptiveSizePolicy',
            '-Xmn128M'
        ],
    }
}

function defaultJavaConfig17(ram) {
    return {
        minRAM: resolveSelectedRAM(ram),
        maxRAM: resolveSelectedRAM(ram),
        executable: null,
        jvmOptions: [
            '-XX:+UnlockExperimentalVMOptions',
            '-XX:+UseG1GC',
            '-XX:G1NewSizePercent=20',
            '-XX:G1ReservePercent=20',
            '-XX:MaxGCPauseMillis=50',
            '-XX:G1HeapRegionSize=32M'
        ],
    }
}

/**
 * Ensure a java config property is set for the given server.
 * 
 * @param {string} serverid The server id.
 * @param {*} mcVersion The minecraft version of the server.
 */
exports.ensureJavaConfig = function(serverid, effectiveJavaOptions, ram) {
    if(!Object.prototype.hasOwnProperty.call(config.javaConfig, serverid)) {
        config.javaConfig[serverid] = defaultJavaConfig(effectiveJavaOptions, ram)
    }
}

/**
 * Retrieve the minimum amount of memory for JVM initialization. This value
 * contains the units of memory. For example, '5G' = 5 GigaBytes, '1024M' = 
 * 1024 MegaBytes, etc.
 * 
 * @param {string} serverid The server id.
 * @returns {string} The minimum amount of memory for JVM initialization.
 */
exports.getMinRAM = function(serverid){
    if(!config.javaConfig[serverid]){
        config.javaConfig[serverid] = {}
    }
    return config.javaConfig[serverid].minRAM || '3G'
}

/**
 * Set the minimum amount of memory for JVM initialization. This value should
 * contain the units of memory. For example, '5G' = 5 GigaBytes, '1024M' = 
 * 1024 MegaBytes, etc.
 * 
 * @param {string} serverid The server id.
 * @param {string} minRAM The new minimum amount of memory for JVM initialization.
 */
exports.setMinRAM = function(serverid, minRAM){
    if(!config.javaConfig[serverid]){
        config.javaConfig[serverid] = {}
    }
    config.javaConfig[serverid].minRAM = minRAM
}

/**
 * Retrieve the maximum amount of memory for JVM initialization. This value
 * contains the units of memory. For example, '5G' = 5 GigaBytes, '1024M' = 
 * 1024 MegaBytes, etc.
 * 
 * @param {string} serverid The server id.
 * @returns {string} The maximum amount of memory for JVM initialization.
 */
exports.getMaxRAM = function(serverid){
    if(!config.javaConfig[serverid]){
        config.javaConfig[serverid] = {}
    }
    return config.javaConfig[serverid].maxRAM || '3G'
}

/**
 * Set the maximum amount of memory for JVM initialization. This value should
 * contain the units of memory. For example, '5G' = 5 GigaBytes, '1024M' = 
 * 1024 MegaBytes, etc.
 * 
 * @param {string} serverid The server id.
 * @param {string} maxRAM The new maximum amount of memory for JVM initialization.
 */
exports.setMaxRAM = function(serverid, maxRAM){
    if(!config.javaConfig[serverid]){
        config.javaConfig[serverid] = {}
    }
    config.javaConfig[serverid].maxRAM = maxRAM
}

/**
 * Retrieve the path of the Java Executable.
 * 
 * This is a resolved configuration value and defaults to null until externally assigned.
 * 
 * @param {string} serverid The server id.
 * @returns {string} The path of the Java Executable.
 */
exports.getJavaExecutable = function(serverid){
    if(!config.javaConfig[serverid]){
        config.javaConfig[serverid] = {}
    }
    return config.javaConfig[serverid].executable
}

/**
 * Set the path of the Java Executable.
 * 
 * @param {string} serverid The server id.
 * @param {string} executable The new path of the Java Executable.
 */
exports.setJavaExecutable = function(serverid, executable){
    if(!config.javaConfig[serverid]){
        config.javaConfig[serverid] = {}
    }
    config.javaConfig[serverid].executable = executable
}

/**
 * Retrieve the additional arguments for JVM initialization. Required arguments,
 * such as memory allocation, will be dynamically resolved and will not be included
 * in this value.
 * 
 * @param {string} serverid The server id.
 * @returns {Array.<string>} An array of the additional arguments for JVM initialization.
 */
exports.getJVMOptions = function(serverid){
    if(!config.javaConfig[serverid]){
        config.javaConfig[serverid] = {}
    }
    return config.javaConfig[serverid].jvmOptions || []
}

/**
 * Set the additional arguments for JVM initialization. Required arguments,
 * such as memory allocation, will be dynamically resolved and should not be
 * included in this value.
 * 
 * @param {string} serverid The server id.
 * @param {Array.<string>} jvmOptions An array of the new additional arguments for JVM 
 * initialization.
 */
exports.setJVMOptions = function(serverid, jvmOptions){
    if(!config.javaConfig[serverid]){
        config.javaConfig[serverid] = {}
    }
    config.javaConfig[serverid].jvmOptions = jvmOptions
}

// Global JVM Options (NEW - preferred method)

/**
 * Retrieve the global additional arguments for JVM initialization.
 * These apply to all installations/servers.
 * 
 * @returns {Array.<string>} An array of the global additional arguments for JVM initialization.
 */
exports.getGlobalJVMOptions = function(){
    if(!config.settings.java){
        config.settings.java = {}
    }
    return config.settings.java.additionalJvmArgs || []
}

/**
 * Set the global additional arguments for JVM initialization.
 * These apply to all installations/servers.
 * 
 * @param {Array.<string>} jvmOptions An array of the new global additional arguments for JVM initialization.
 */
exports.setGlobalJVMOptions = function(jvmOptions){
    if(!config.settings.java){
        config.settings.java = {}
    }
    config.settings.java.additionalJvmArgs = jvmOptions
}

// Game Settings

/**
 * Retrieve the width of the game window.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {number} The width of the game window.
 */
exports.getGameWidth = function(def = false){
    return !def ? config.settings.game.resWidth : DEFAULT_CONFIG.settings.game.resWidth
}

/**
 * Set the width of the game window.
 * 
 * @param {number} resWidth The new width of the game window.
 */
exports.setGameWidth = function(resWidth){
    config.settings.game.resWidth = Number.parseInt(resWidth)
}

/**
 * Validate a potential new width value.
 * 
 * @param {number} resWidth The width value to validate.
 * @returns {boolean} Whether or not the value is valid.
 */
exports.validateGameWidth = function(resWidth){
    const nVal = Number.parseInt(resWidth)
    return Number.isInteger(nVal) && nVal >= 0
}

/**
 * Retrieve the height of the game window.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {number} The height of the game window.
 */
exports.getGameHeight = function(def = false){
    return !def ? config.settings.game.resHeight : DEFAULT_CONFIG.settings.game.resHeight
}

/**
 * Set the height of the game window.
 * 
 * @param {number} resHeight The new height of the game window.
 */
exports.setGameHeight = function(resHeight){
    config.settings.game.resHeight = Number.parseInt(resHeight)
}

/**
 * Validate a potential new height value.
 * 
 * @param {number} resHeight The height value to validate.
 * @returns {boolean} Whether or not the value is valid.
 */
exports.validateGameHeight = function(resHeight){
    const nVal = Number.parseInt(resHeight)
    return Number.isInteger(nVal) && nVal >= 0
}

/**
 * Check if the game should be launched in fullscreen mode.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {boolean} Whether or not the game is set to launch in fullscreen mode.
 */
exports.getFullscreen = function(def = false){
    return !def ? config.settings.game.fullscreen : DEFAULT_CONFIG.settings.game.fullscreen
}

/**
 * Change the status of if the game should be launched in fullscreen mode.
 * 
 * @param {boolean} fullscreen Whether or not the game should launch in fullscreen mode.
 */
exports.setFullscreen = function(fullscreen){
    config.settings.game.fullscreen = fullscreen
}

/**
 * Check if the game should auto connect to servers.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {boolean} Whether or not the game should auto connect to servers.
 */
exports.getAutoConnect = function(def = false){
    return !def ? config.settings.game.autoConnect : DEFAULT_CONFIG.settings.game.autoConnect
}

/**
 * Change the status of whether or not the game should auto connect to servers.
 * 
 * @param {boolean} autoConnect Whether or not the game should auto connect to servers.
 */
exports.setAutoConnect = function(autoConnect){
    config.settings.game.autoConnect = autoConnect
}

/**
 * Check if the game should launch as a detached process.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {boolean} Whether or not the game will launch as a detached process.
 */
exports.getLaunchDetached = function(def = false){
    return !def ? config.settings.game.launchDetached : DEFAULT_CONFIG.settings.game.launchDetached
}

/**
 * Change the status of whether or not the game should launch as a detached process.
 * 
 * @param {boolean} launchDetached Whether or not the game should launch as a detached process.
 */
exports.setLaunchDetached = function(launchDetached){
    config.settings.game.launchDetached = launchDetached
}

// Launcher Settings

/**
 * Check if the launcher should download prerelease versions.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {boolean} Whether or not the launcher should download prerelease versions.
 */
exports.getAllowPrerelease = function(def = false){
    return !def ? config.settings.launcher.allowPrerelease : DEFAULT_CONFIG.settings.launcher.allowPrerelease
}

/**
 * Change the status of Whether or not the launcher should download prerelease versions.
 * 
 * @param {boolean} launchDetached Whether or not the launcher should download prerelease versions.
 */
exports.setAllowPrerelease = function(allowPrerelease){
    config.settings.launcher.allowPrerelease = allowPrerelease
}

/**
 * Check if the launcher should show legacy Minecraft versions (< 1.13).
 * Legacy versions are hidden by default because Forge support starts at 1.13.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {boolean} Whether or not the launcher should show legacy versions.
 */
exports.getShowLegacyVersions = function(def = false){
    return !def ? (config.settings.launcher.showLegacyVersions ?? false) : DEFAULT_CONFIG.settings.launcher.showLegacyVersions
}

/**
 * Change the status of whether or not the launcher should show legacy Minecraft versions.
 * 
 * @param {boolean} showLegacy Whether or not the launcher should show legacy versions (< 1.13).
 */
exports.setShowLegacyVersions = function(showLegacy){
    config.settings.launcher.showLegacyVersions = showLegacy
}

/**
 * Check if the launcher should show live Minecraft logs during gameplay.
 * When enabled, displays a split-panel with real-time stdout/stderr output.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {boolean} Whether or not live logs should be shown.
 */
exports.getShowLiveLogs = function(def = false){
    return !def ? (config.settings.launcher.showLiveLogs ?? false) : DEFAULT_CONFIG.settings.launcher.showLiveLogs
}

/**
 * Change the status of whether or not the launcher should show live Minecraft logs.
 * 
 * @param {boolean} showLiveLogs Whether or not live logs should be displayed.
 */
exports.setShowLiveLogs = function(showLiveLogs){
    config.settings.launcher.showLiveLogs = showLiveLogs
}

/**
 * Check if experimental loaders (Fabric, Quilt, NeoForge) should be shown.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {boolean} Whether or not experimental loaders are enabled.
 */
exports.getExperimentalLoaders = function(def = false){
    return !def ? (config.settings.launcher.experimentalLoaders ?? false) : false
}

/**
 * Change the status of whether experimental loaders should be shown.
 * 
 * @param {boolean} experimentalLoaders Whether or not experimental loaders should be shown.
 */
exports.setExperimentalLoaders = function(experimentalLoaders){
    config.settings.launcher.experimentalLoaders = experimentalLoaders
}

/**
 * Get the selected language for the launcher.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {string} The language code (e.g., 'es_ES', 'en_US').
 */
exports.getLanguage = function(def = false){
    const lang = !def ? config.settings.launcher.language : DEFAULT_CONFIG.settings.launcher.language
    // If language is not set or empty, return default
    if (!lang || lang === '') {
        return DEFAULT_CONFIG.settings.launcher.language
    }
    return lang
}

/**
 * Set the selected language for the launcher.
 * 
 * @param {string} language The language code (e.g., 'es_ES', 'en_US').
 */
exports.setLanguage = function(language){
    config.settings.launcher.language = language
}

// Customization (fondo y logo del launcher)

/**
 * Obtener el fondo personalizado elegido por el usuario.
 *
 * @returns {string|null} Nombre de archivo del fondo (ej. '3.jpg') o null si es aleatorio.
 */
exports.getSelectedBackground = function(){
    return config.customization?.background ?? null
}

/**
 * Establecer el fondo personalizado.
 *
 * @param {string|null} background Nombre de archivo (ej. '3.jpg') o null para aleatorio.
 */
exports.setSelectedBackground = function(background){
    if(config.customization == null){
        config.customization = { background: null, backgroundRandom: false, logo: null }
    }
    config.customization.background = background
}

/**
 * Saber si el fondo debe ser aleatorio en cada inicio.
 *
 * @returns {boolean} true = aleatorio cada inicio; false = usar el fondo fijo elegido.
 */
exports.getBackgroundRandom = function(){
    return config.customization?.backgroundRandom ?? false
}

/**
 * Establecer el modo de fondo (aleatorio o fijo).
 *
 * @param {boolean} random true = aleatorio en cada inicio.
 */
exports.setBackgroundRandom = function(random){
    if(config.customization == null){
        config.customization = { background: null, backgroundRandom: false, logo: null }
    }
    config.customization.backgroundRandom = !!random
}

/**
 * Obtener el logo personalizado elegido por el usuario.
 *
 * @returns {string|null} Ruta relativa del logo o null para el por defecto (SealCircle.png).
 */
exports.getSelectedLogo = function(){
    return config.customization?.logo ?? null
}

/**
 * Establecer el logo personalizado.
 *
 * @param {string|null} logo Ruta relativa del logo o null para el por defecto.
 */
exports.setSelectedLogo = function(logo){
    if(config.customization == null){
        config.customization = { background: null, backgroundRandom: false, logo: null }
    }
    config.customization.logo = logo
}

// Installation Management

/**
 * Get all custom installations.
 * 
 * @returns {Array} Array of installation objects.
 */
exports.getInstallations = function(){
    return config.installations || []
}

/**
 * Add a new custom installation.
 * 
 * @param {Object} installation The installation object to add.
 * @returns {boolean} True if successful, false if installation with same ID already exists.
 */
exports.addInstallation = function(installation){
    if (!config.installations) {
        config.installations = []
    }
    
    // Check for duplicate ID
    if (config.installations.some(inst => inst.id === installation.id)) {
        logger.error(`Installation with ID ${installation.id} already exists`)
        return false
    }
    
    // Crear la carpeta de instancia inmediatamente
    try {
        const instancePath = path.join(exports.getInstanceDirectory(), installation.id)
        fs.ensureDirSync(instancePath)
        logger.debug(`Instance directory created: ${instancePath}`)
    } catch(err) {
        logger.error(`Failed to create instance directory: ${err.message}`)
        // No bloquear la creación, solo log
    }
    
    config.installations.push(installation)
    logger.info(`Installation added: ${installation.name} (${installation.id})`)
    return true
}

/**
 * Update an existing installation.
 * 
 * @param {string} id The ID of the installation to update.
 * @param {Object} updates Object containing fields to update.
 * @returns {boolean} True if successful, false if installation not found.
 */
exports.updateInstallation = function(id, updates){
    if (!config.installations) {
        config.installations = []
    }
    
    const index = config.installations.findIndex(inst => inst.id === id)
    if (index === -1) {
        logger.error(`Installation with ID ${id} not found`)
        return false
    }
    
    const existing = config.installations[index]
    
    // Merge updates carefully to preserve nested objects
    if (updates.name !== undefined) {
        existing.name = updates.name
    }
    if (updates.loader !== undefined) {
        existing.loader = { ...existing.loader, ...updates.loader }
    }
    if (updates.optifine !== undefined) {
        existing.optifine = updates.optifine
    }
    if (updates.modules !== undefined) {
        existing.modules = updates.modules
    }
    if (updates.icon !== undefined) {
        existing.icon = updates.icon
    }
    if (updates.javaOptions !== undefined) {
        existing.javaOptions = updates.javaOptions
    }
    if (updates.serverAddress !== undefined) {
        existing.serverAddress = updates.serverAddress
    }
    // Upgrade tracking fields
    if (updates.upgradeHistory !== undefined) {
        existing.upgradeHistory = updates.upgradeHistory
    }
    if (updates.lastUpgrade !== undefined) {
        existing.lastUpgrade = updates.lastUpgrade
    }
    if (updates.upgradeFailed !== undefined) {
        existing.upgradeFailed = updates.upgradeFailed
    }
    
    config.installations[index] = existing
    logger.info(`Installation updated: ${id}`)
    return true
}

/**
 * Delete an installation and optionally its instance folder.
 * 
 * @param {string} id The ID of the installation to delete.
 * @param {boolean} deleteFolder Whether to delete the instance folder (default: true).
 * @returns {boolean} True if successful, false if installation not found.
 */
exports.deleteInstallation = function(id, deleteFolder = true){
    if (!config.installations) {
        config.installations = []
    }
    
    const index = config.installations.findIndex(inst => inst.id === id)
    if (index === -1) {
        logger.error(`Installation with ID ${id} not found`)
        return false
    }
    
    const installation = config.installations[index]
    const name = installation.name
    
    // Delete instance folder if requested
    if (deleteFolder) {
        const instancePath = path.join(exports.getInstanceDirectory(), id)
        try {
            if (fs.existsSync(instancePath)) {
                fs.removeSync(instancePath)
                logger.info(`Instance folder deleted: ${instancePath}`)
            }
        } catch (err) {
            logger.warn(`Failed to delete instance folder: ${err.message}`)
        }
    }
    
    config.installations.splice(index, 1)
    
    // Clear selected installation if it was deleted
    if (config.selectedInstallation === id) {
        config.selectedInstallation = null
    }
    
    logger.info(`Installation deleted: ${name} (${id})`)
    return true
}

/**
 * Get a specific installation by ID.
 * 
 * @param {string} id The ID of the installation.
 * @returns {Object|null} The installation object or null if not found.
 */
exports.getInstallation = function(id){
    if (!config.installations) {
        config.installations = []
    }
    
    return config.installations.find(inst => inst.id === id) || null
}

/**
 * Get the selected installation ID.
 * 
 * @returns {string|null} The ID of the selected installation or null.
 */
exports.getSelectedInstallation = function(){
    return config.selectedInstallation || null
}

/**
 * Set the selected installation.
 * 
 * @param {string|null} installationId The ID of the installation to select, or null to clear.
 */
exports.setSelectedInstallation = function(installationId){
    config.selectedInstallation = installationId
}

// ============================================================================
// TECNILAND Modpack Installations Management
// ============================================================================

/**
 * Modpack installation schema:
 * {
 *   id: string,              // Server ID from distribution.json (e.g. "tecniland-og-1.20.1")
 *   version: string,         // Installed version from distribution
 *   minecraftVersion: string,// MC version (e.g. "1.20.1")
 *   installedAt: number,     // Timestamp of installation
 *   lastPlayed: number|null, // Timestamp of last play
 *   sizeOnDisk: number,      // Size in bytes
 *   installPath: string,     // Path to instance folder
 *   status: string           // 'installed'|'updating'|'repairing'|'corrupted'
 * }
 */

/**
 * Get all TECNILAND modpack installations.
 * 
 * @returns {Array} Array of modpack installation objects.
 */
exports.getModpackInstallations = function(){
    if (!config.modpackInstallations) {
        config.modpackInstallations = []
    }
    return config.modpackInstallations
}

/**
 * Get a specific modpack installation by server ID.
 * 
 * @param {string} serverId The server ID from distribution.json.
 * @returns {Object|null} The modpack installation object or null if not found.
 */
exports.getModpackInstallation = function(serverId){
    if (!config.modpackInstallations) {
        config.modpackInstallations = []
    }
    return config.modpackInstallations.find(mp => mp.id === serverId) || null
}

/**
 * Save or update a modpack installation state.
 * 
 * @param {Object} modpackData The modpack installation data.
 * @returns {boolean} True if successful.
 */
exports.saveModpackInstallation = function(modpackData){
    if (!config.modpackInstallations) {
        config.modpackInstallations = []
    }
    
    const existingIndex = config.modpackInstallations.findIndex(mp => mp.id === modpackData.id)
    
    if (existingIndex !== -1) {
        // Update existing
        config.modpackInstallations[existingIndex] = {
            ...config.modpackInstallations[existingIndex],
            ...modpackData
        }
        logger.info(`Modpack installation updated: ${modpackData.id}`)
    } else {
        // Add new
        config.modpackInstallations.push({
            id: modpackData.id,
            version: modpackData.version || '1.0.0',
            minecraftVersion: modpackData.minecraftVersion || 'unknown',
            installedAt: modpackData.installedAt || Date.now(),
            lastPlayed: modpackData.lastPlayed || null,
            sizeOnDisk: modpackData.sizeOnDisk || 0,
            installPath: modpackData.installPath || '',
            status: modpackData.status || 'installed'
        })
        logger.info(`Modpack installation added: ${modpackData.id}`)
    }
    
    return true
}

/**
 * Update the last played timestamp for a modpack.
 * 
 * @param {string} serverId The server ID.
 * @returns {boolean} True if successful.
 */
exports.updateModpackLastPlayed = function(serverId){
    const modpack = exports.getModpackInstallation(serverId)
    if (modpack) {
        modpack.lastPlayed = Date.now()
        return true
    }
    return false
}

/**
 * Update the status of a modpack installation.
 * 
 * @param {string} serverId The server ID.
 * @param {string} status The new status ('installed'|'updating'|'repairing'|'corrupted').
 * @returns {boolean} True if successful.
 */
exports.updateModpackStatus = function(serverId, status){
    const modpack = exports.getModpackInstallation(serverId)
    if (modpack) {
        modpack.status = status
        logger.info(`Modpack ${serverId} status changed to: ${status}`)
        return true
    }
    return false
}

/**
 * Remove a modpack installation from config.
 * Does NOT delete files - that's ModpackManager's job.
 * 
 * @param {string} serverId The server ID to remove.
 * @returns {boolean} True if removed, false if not found.
 */
exports.removeModpackInstallation = function(serverId){
    if (!config.modpackInstallations) {
        config.modpackInstallations = []
        return false
    }
    
    const index = config.modpackInstallations.findIndex(mp => mp.id === serverId)
    if (index === -1) {
        logger.warn(`Modpack installation not found: ${serverId}`)
        return false
    }
    
    const removed = config.modpackInstallations.splice(index, 1)[0]
    logger.info(`Modpack installation removed: ${removed.id}`)
    return true
}

/**
 * Check if a modpack is installed.
 * 
 * @param {string} serverId The server ID.
 * @returns {boolean} True if installed.
 */
exports.isModpackInstalled = function(serverId){
    const modpack = exports.getModpackInstallation(serverId)
    return modpack !== null && modpack.status === 'installed'
}

/**
 * Get the preserved files list for modpack updates.
 * These files will be backed up before update and restored after.
 * 
 * @returns {Array<string>} Array of glob patterns for files to preserve.
 */
exports.getModpackPreservedFiles = function(){
    return [
        'options.txt',
        'config/**',
        'defaultconfigs/**',
        'saves/**',
        'screenshots/**',
        'resourcepacks/**',
        'shaderpacks/**'
    ]
}

// ========== SkinViewer3D Settings ==========

/**
 * Get whether 3D skin rendering is enabled.
 * 
 * @param {boolean} def Optional. If true, returns default value.
 * @returns {boolean} True if 3D rendering is enabled.
 */
exports.getSkinViewer3DEnabled = function(def = false) {
    if (!config.settings.skinViewer3D) {
        config.settings.skinViewer3D = DEFAULT_CONFIG.settings.skinViewer3D
    }
    return !def ? (config.settings.skinViewer3D.enabled ?? true) : DEFAULT_CONFIG.settings.skinViewer3D.enabled
}

/**
 * Set whether 3D skin rendering is enabled.
 * 
 * @param {boolean} enabled True to enable 3D rendering.
 */
exports.setSkinViewer3DEnabled = function(enabled) {
    if (!config.settings.skinViewer3D) {
        config.settings.skinViewer3D = DEFAULT_CONFIG.settings.skinViewer3D
    }
    config.settings.skinViewer3D.enabled = enabled
}

/**
 * Get the 3D rendering quality.
 * 
 * @param {boolean} def Optional. If true, returns default value.
 * @returns {string} Quality setting: 'low', 'medium', or 'high'.
 */
exports.getSkinViewer3DQuality = function(def = false) {
    if (!config.settings.skinViewer3D) {
        config.settings.skinViewer3D = DEFAULT_CONFIG.settings.skinViewer3D
    }
    return !def ? (config.settings.skinViewer3D.quality ?? 'medium') : DEFAULT_CONFIG.settings.skinViewer3D.quality
}

/**
 * Set the 3D rendering quality.
 * 
 * @param {string} quality Quality setting: 'low', 'medium', or 'high'.
 */
exports.setSkinViewer3DQuality = function(quality) {
    if (!['low', 'medium', 'high'].includes(quality)) {
        throw new Error(`Invalid quality: ${quality}. Must be 'low', 'medium', or 'high'.`)
    }
    if (!config.settings.skinViewer3D) {
        config.settings.skinViewer3D = DEFAULT_CONFIG.settings.skinViewer3D
    }
    config.settings.skinViewer3D.quality = quality
}
