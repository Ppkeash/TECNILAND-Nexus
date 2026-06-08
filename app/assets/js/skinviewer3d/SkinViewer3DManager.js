/**
 * SkinViewer3DManager
 * 
 * Gestiona el renderizado de skins de Minecraft.
 * Usa render 2D isométrico (estilo Microsoft) ya que skinview3d no es compatible con Electron.
 * 
 * NOTA: skinview3d requiere un bundler (webpack) para funcionar en Electron.
 * Este manager usa render 2D del cuerpo como alternativa compatible.
 */

/* eslint-env browser */

const { LoggerUtil } = require('helios-core')
const SkinRenderer2D = require('./SkinRenderer2D')

const logger = LoggerUtil.getLogger('SkinViewer3DManager')

class SkinViewer3DManager {
    
    constructor() {
        this.enabled3D = true // Ahora es "enable body render"
        this.quality = 'medium' // Afecta el scale
        this.initialized = false
        this.containers = new Map() // Track de contenedores renderizados
    }
    
    /**
     * Inicializar el manager con configuración del usuario
     * @param {Object} config - Configuración
     */
    initialize(config = {}) {
        this.enabled3D = config.enabled3D !== false
        this.quality = config.quality || 'medium'
        this.initialized = true
        
        logger.info('SkinViewer inicializado - Render cuerpo: ' + this.enabled3D + ', Calidad: ' + this.quality)
    }
    
    /**
     * Obtener el factor de escala basado en calidad
     */
    _getScale() {
        switch (this.quality) {
            case 'low': return 3
            case 'high': return 6
            case 'medium':
            default: return 4
        }
    }
    
    /**
     * Crear o actualizar un viewer en un contenedor
     * 
     * @param {string} containerId - ID del elemento contenedor
     * @param {string} skinUrl - URL de la skin PNG
     * @param {string} model - 'steve' o 'alex' (para fallback)
     * @param {Object} options - Opciones adicionales
     * @returns {Object|null} Resultado o null si falló
     */
    createOrUpdateViewer(containerId, skinUrl, model = 'steve', options = {}) {
        if (!this.enabled3D) {
            logger.debug('Render de cuerpo deshabilitado, usando fallback simple')
            this._renderSimpleFallback(containerId, skinUrl)
            return null
        }
        
        const container = document.getElementById(containerId)
        if (!container) {
            logger.error('Contenedor ' + containerId + ' no encontrado')
            return null
        }
        
        // Si no hay skinUrl válida, renderizar Steve por defecto
        if (!skinUrl || skinUrl.includes('profile.svg')) {
            skinUrl = SkinRenderer2D.getSteveDefault()
            logger.debug('Usando skin por defecto de Steve (embebida)')
        }
        
        // Renderizar skin con el renderer 2D
        const scale = this._getScale()
        
        SkinRenderer2D.renderToContainer(containerId, skinUrl, scale)
            .then((canvas) => {
                if (canvas) {
                    this.containers.set(containerId, { skinUrl, scale })
                    container.classList.add('skin-body-rendered')
                    logger.debug('Skin renderizada en ' + containerId)
                }
            })
            .catch(() => {
                logger.debug('Skin personalizada no disponible, usando Steve por defecto')
                // Si falla la skin personalizada, renderizar Steve por defecto
                const steveSkin = SkinRenderer2D.getSteveDefault()
                SkinRenderer2D.renderToContainer(containerId, steveSkin, scale)
                    .then((canvas) => {
                        if (canvas) {
                            this.containers.set(containerId, { skinUrl: steveSkin, scale })
                            container.classList.add('skin-body-rendered')
                            logger.debug('Steve default renderizado en ' + containerId)
                        }
                    })
                    .catch((fallbackErr) => {
                        logger.error('Error fatal renderizando Steve default:', fallbackErr.message)
                        // Último recurso: background-image simple
                        this._renderSimpleFallback(containerId, null)
                    })
            })
        
        return { containerId, skinUrl }
    }
    
    /**
     * Renderizar fallback simple (solo background-image)
     * Usado como último recurso si falla todo
     */
    _renderSimpleFallback(containerId, fallbackUrl) {
        const container = document.getElementById(containerId)
        if (!container) return
        
        // Usar skin por defecto de Steve si no hay URL
        const finalUrl = fallbackUrl || SkinRenderer2D.getSteveDefault()
        
        container.style.backgroundImage = 'url(\'' + finalUrl + '\')'
        container.style.backgroundSize = 'contain'
        container.style.backgroundPosition = 'center'
        container.style.backgroundRepeat = 'no-repeat'
        
        logger.debug('Fallback simple renderizado en ' + containerId + ' con ' + (fallbackUrl ? 'URL custom' : 'Steve default'))
    }
    
    /**
     * Destruir un viewer
     */
    destroyViewer(containerId) {
        const container = document.getElementById(containerId)
        if (container) {
            container.classList.remove('skin-body-rendered')
        }
        this.containers.delete(containerId)
    }
    
    /**
     * Activar/desactivar render de cuerpo
     */
    toggle3D(enabled) {
        this.enabled3D = enabled
        logger.info('Render de cuerpo ' + (enabled ? 'habilitado' : 'deshabilitado'))
    }
    
    /**
     * Cambiar calidad
     */
    setQuality(quality) {
        this.quality = quality
        logger.info('Calidad cambiada a: ' + quality)
    }
}

// Singleton
const skinViewer3DManager = new SkinViewer3DManager()

module.exports = skinViewer3DManager
