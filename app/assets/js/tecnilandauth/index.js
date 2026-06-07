/**
 * TECNILAND Auth Module
 * 
 * Exporta todos los componentes del sistema de autenticación TECNILAND.
 */

const TecnilandAuthManager = require('./TecnilandAuthManager')
const TecnilandAuthUI = require('./TecnilandAuthUI')
const TecnilandAuthConfig = require('./TecnilandAuthConfig')

module.exports = {
    TecnilandAuthManager,
    TecnilandAuthUI,
    TecnilandAuthConfig
}
