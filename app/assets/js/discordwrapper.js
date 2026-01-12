/**
 * DiscordWrapper.js
 * 
 * Wrapper para Discord Rich Presence (RPC) en TECNILAND Nexus.
 * 
 * DECISIÓN DE DISEÑO:
 * El launcher SOLO maneja el estado "idle" (launcher abierto).
 * La presencia in-game se delega a mods como CraftPresence.
 * 
 * Estado soportado:
 * - Launcher abierto: "En el menú principal" con launcher-icon
 * 
 * Configuración requerida en distribution.json:
 * - discord.clientId (nivel raíz)
 * - discord.smallImageKey/Text (nivel raíz)
 * 
 * @see docs/DISCORD_RPC_SETUP.md para guía completa de configuración
 * @author TECNILAND Nexus Team
 */

const { LoggerUtil } = require('helios-core')
const logger = LoggerUtil.getLogger('DiscordWrapper')
const { Client } = require('discord-rpc-patch')
const Lang = require('./langloader')

let client = null
let activity = null
let isInitialized = false

/**
 * Initialize Discord Rich Presence.
 * 
 * @param {Object} genSettings - Global Discord settings from distribution.json
 * @param {string} genSettings.clientId - Discord Application ID
 * @param {string} genSettings.smallImageKey - Small image asset name
 * @param {string} genSettings.smallImageText - Small image hover text
 * @param {Object} servSettings - Server-specific Discord settings
 * @param {string} servSettings.shortId - Short server identifier
 * @param {string} servSettings.largeImageKey - Large image asset name
 * @param {string} servSettings.largeImageText - Large image hover text
 * @param {string} initialDetails - Initial details text (default: waiting)
 */
exports.initRPC = function(genSettings, servSettings, initialDetails = Lang.queryJS('discord.waiting')){
    // Evitar inicializar múltiples veces sin shutdown previo
    if(isInitialized) {
        logger.warn('Discord RPC already initialized. Call shutdownRPC() first.')
        return
    }
    
    logger.info('[DISCORD] init launcher idle')
    
    client = new Client({ transport: 'ipc' })

    activity = {
        details: initialDetails,
        state: Lang.queryJS('discord.state', {shortId: servSettings.shortId}),
        largeImageKey: servSettings.largeImageKey,
        largeImageText: servSettings.largeImageText,
        smallImageKey: genSettings.smallImageKey,
        smallImageText: genSettings.smallImageText,
        startTimestamp: new Date().getTime(),
        instance: false
    }

    client.on('ready', () => {
        logger.info('Discord RPC Connected')
        logger.debug('Activity:', activity)
        client.setActivity(activity)
        isInitialized = true
    })
    
    client.login({clientId: genSettings.clientId}).catch(error => {
        if(error.message.includes('ENOENT')) {
            logger.info('Unable to initialize Discord Rich Presence: Discord client not running.')
        } else if(error.message.includes('Could not connect')) {
            logger.info('Unable to initialize Discord Rich Presence: Could not connect to Discord IPC.')
        } else {
            logger.error('Unable to initialize Discord Rich Presence:', error.message)
        }
        // Limpiar estado si falla la conexión
        client = null
        activity = null
        isInitialized = false
    })
}

/**
 * Update the details field of the Rich Presence activity.
 * Used for custom instances to show game status.
 * 
 * @param {string} details - New details text
 */
exports.updateDetails = function(details){
    if(!client || !activity) {
        logger.warn('Attempted to update Discord RPC details but client is not initialized')
        return
    }
    
    activity.details = details
    client.setActivity(activity).catch(err => {
        logger.error('Failed to update Discord activity:', err)
    })
}

/**
 * Shutdown Discord Rich Presence and cleanup resources.
 * Called when launcher closes.
 */
exports.shutdownRPC = function(){
    if(!client || !isInitialized) {
        logger.debug('Discord RPC already shut down or never initialized')
        return
    }
    
    logger.info('[DISCORD] shutdown RPC')
    
    try {
        client.clearActivity()
        client.destroy()
        logger.info('Discord RPC shut down successfully')
    } catch(err) {
        logger.error('Error shutting down Discord RPC:', err)
    } finally {
        client = null
        activity = null
        isInitialized = false
    }
}

/**
 * Check if Discord RPC is currently initialized and connected.
 * @returns {boolean} True if RPC is active
 */
exports.isActive = function(){
    return isInitialized && client != null
}