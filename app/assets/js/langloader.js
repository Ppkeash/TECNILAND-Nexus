const fs = require('fs-extra')
const path = require('path')
const toml = require('toml')
const merge = require('lodash.merge')

let lang

exports.loadLanguage = function(id){
    lang = merge(lang || {}, toml.parse(fs.readFileSync(path.join(__dirname, '..', 'lang', `${id}.toml`))) || {})
}

/**
 * Read language preference from config file without using ConfigManager
 * (to avoid @electron/remote issues in main process)
 */
function getUserLanguageFromConfig(){
    try {
        const { app } = require('electron')
        const configPath = path.join(app.getPath('userData'), 'config.json')
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'UTF-8'))
            return config?.settings?.launcher?.language || 'es_ES'
        }
    } catch (err) {
        console.error('[LangLoader] Error reading config:', err)
    }
    return 'es_ES' // Default to Spanish
}

exports.query = function(id, placeHolders){
    let query = id.split('.')
    let res = lang
    for(let q of query){
        res = res[q]
    }
    let text = res === lang ? '' : res
    if (placeHolders) {
        Object.entries(placeHolders).forEach(([key, value]) => {
            text = text.replace(`{${key}}`, value)
        })
    }
    return text
}

exports.queryJS = function(id, placeHolders){
    return exports.query(`js.${id}`, placeHolders)
}

exports.queryEJS = function(id, placeHolders){
    return exports.query(`ejs.${id}`, placeHolders)
}

/**
 * Setup language for main process (loads default without ConfigManager)
 */
exports.setupLanguageMain = function(){
    // Read user's language preference directly from config file
    const selectedLang = getUserLanguageFromConfig()
    
    console.log('[LangLoader Main] Selected language:', selectedLang)
    
    // Load fallback language first (as base)
    const fallbackLang = selectedLang === 'es_ES' ? 'en_US' : 'es_ES'
    exports.loadLanguage(fallbackLang)
    
    // Load selected language on top (overrides fallback)
    exports.loadLanguage(selectedLang)
    
    // Load Custom Language File for Launcher Customizer
    exports.loadLanguage('_custom')
}

/**
 * Setup language for renderer process (reads user preference from ConfigManager)
 */
exports.setupLanguage = function(){
    // Load the user's selected language from config
    const ConfigManager = require('./configmanager')
    const selectedLang = ConfigManager.getLanguage()
    
    // Load fallback language first (as base)
    const fallbackLang = selectedLang === 'es_ES' ? 'en_US' : 'es_ES'
    exports.loadLanguage(fallbackLang)
    
    // Load selected language on top (overrides fallback)
    exports.loadLanguage(selectedLang)

    // Load Custom Language File for Launcher Customizer
    exports.loadLanguage('_custom')
}