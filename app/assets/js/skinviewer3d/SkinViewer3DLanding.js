/**
 * SkinViewer3DLanding
 * 
 * Script para integrar skinview3d en el landing page (avatar del usuario).
 * Maneja la inicialización, actualización automática y fallback 2D.
 */

/* eslint-env browser */

const SkinViewer3DManager = require('./SkinViewer3DManager')
const TecnilandAuthManager = require('../tecnilandauth/TecnilandAuthManager')
const ConfigManager = require('../configmanager')
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('SkinViewer3DLanding')

let landingViewerInitialized = false
let initializationInProgress = false

/**
 * Inicializar el viewer 3D en el landing page
 */
function initLandingSkinViewer() {
    if (landingViewerInitialized || initializationInProgress) {
        logger.debug('Landing viewer ya inicializado o en progreso, saltando...')
        return
    }
    
    initializationInProgress = true
    
    try {
        // Obtener configuración del usuario
        let enable3D = false
        let quality = 'medium'
        
        try {
            enable3D = ConfigManager.getSkinViewer3DEnabled()
            quality = ConfigManager.getSkinViewer3DQuality()
        } catch (configErr) {
            logger.warn('Error leyendo config 3D, usando defaults:', configErr.message)
        }
        
        // Si 3D está deshabilitado, no hacer nada más
        if (!enable3D) {
            logger.info('SkinViewer3D deshabilitado en configuración')
            landingViewerInitialized = true
            initializationInProgress = false
            return
        }
        
        // Inicializar manager (v2.x es síncrono)
        SkinViewer3DManager.initialize({
            enabled3D: enable3D,
            quality: quality
        })
        
        logger.info('Landing SkinViewer3D inicializado - 3D: ' + enable3D + ', Calidad: ' + quality)
        
        // Renderizar avatar inicial
        try {
            updateLandingSkinViewer()
        } catch (renderErr) {
            logger.warn('Error en primer render 3D:', renderErr.message)
        }
        
        // Escuchar eventos de actualización de avatar
        document.addEventListener('avatar-updated', (event) => {
            logger.debug('Evento avatar-updated recibido, actualizando viewer 3D')
            updateLandingSkinViewer(event.detail)
        })
        
        // Escuchar cambios de cuenta
        document.addEventListener('account-changed', () => {
            logger.debug('Cuenta cambiada, actualizando viewer 3D')
            updateLandingSkinViewer()
        })
        
        landingViewerInitialized = true
        
    } catch (err) {
        logger.error('Error inicializando landing viewer 3D:', err)
    } finally {
        initializationInProgress = false
    }
}

/**
 * Actualizar el viewer 3D del landing
 */
function updateLandingSkinViewer(eventDetail = null) {
    try {
        const selectedAccount = ConfigManager.getSelectedAccount()
        
        if (!selectedAccount) {
            logger.debug('No hay cuenta seleccionada')
            return
        }
        
        const container = document.getElementById('avatarContainer')
        if (!container) {
            logger.error('avatarContainer no encontrado')
            return
        }
        
        // Verificar si 3D está habilitado en settings
        const enabled3D = ConfigManager.getSkinViewer3DEnabled()
        
        // Para cuentas TECNILAND, SIEMPRE renderizar en 3D (si está habilitado)
        if (selectedAccount.type === 'tecniland' && enabled3D) {
            let skinUrl = null
            let model = 'steve'
            
            // Si hay eventDetail con skinUrl (del evento avatar-updated), usar esa info
            if (eventDetail && eventDetail.skinUrl) {
                skinUrl = eventDetail.skinUrl
                logger.debug('Usando skinUrl del evento: ' + skinUrl)
            } else {
                // Obtener skin de TECNILAND
                const tecnilandSkinUrl = TecnilandAuthManager.getSkinUrl(selectedAccount.uuid)
                
                if (tecnilandSkinUrl) {
                    // Verificar si es URL real del backend (no fallback)
                    // Producción: tecniland-backend.fly.dev | Dev: localhost
                    if (tecnilandSkinUrl.includes('tecniland-backend.fly.dev') || 
                        tecnilandSkinUrl.includes('localhost:3000') ||
                        tecnilandSkinUrl.includes('/api/skins/')) {
                        // Agregar timestamp para cache-busting
                        skinUrl = tecnilandSkinUrl + '?t=' + Date.now()
                    }
                }
            }
            
            model = selectedAccount.model || 'steve'
            
            logger.debug('Renderizando skin 3D TECNILAND: ' + (skinUrl || 'Steve default'))
            
            // Crear/actualizar viewer 3D (v2.x es síncrono)
            SkinViewer3DManager.createOrUpdateViewer('avatarContainer', skinUrl, model, {
                animation: true,
                autoRotate: true
            })
            
        } else {
            // Fallback a 2D (cuenta offline o 3D deshabilitado)
            logger.debug('Usando fallback 2D')
            
            // Destruir viewer 3D si existe
            SkinViewer3DManager.destroyViewer('avatarContainer')
            
            // Usar el sistema original de backgroundImage
            const fallbackUrl = ConfigManager.getAccountAvatarUrl(selectedAccount, 'body')
            container.style.backgroundImage = 'url(\'' + fallbackUrl + '\')'
        }
        
    } catch (err) {
        logger.error('Error actualizando landing viewer 3D:', err)
    }
}

/**
 * Función global para refrescar el viewer desde otros módulos
 */
window.refreshSkinViewer3D = function() {
    logger.debug('refreshSkinViewer3D llamado desde window')
    updateLandingSkinViewer()
}

/**
 * Limpiar y destruir viewer al salir
 */
function cleanupLandingSkinViewer() {
    SkinViewer3DManager.destroyViewer('avatarContainer')
    landingViewerInitialized = false
    logger.info('Landing viewer 3D limpiado')
}

// Exportar funciones
module.exports = {
    initLandingSkinViewer,
    updateLandingSkinViewer,
    cleanupLandingSkinViewer
}
