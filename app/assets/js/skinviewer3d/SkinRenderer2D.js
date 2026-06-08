/**
 * SkinRenderer2D
 * 
 * Renderiza skins de Minecraft en 2D isométrico (estilo Microsoft/Crafatar).
 * Extrae las partes del cuerpo de una skin PNG y las compone en una vista de cuerpo completo.
 * 
 * Este es el método usado por Microsoft en el launcher oficial.
 */

/* eslint-env browser */

const { LoggerUtil } = require('helios-core')
const logger = LoggerUtil.getLogger('SkinRenderer2D')

/**
 * Coordenadas de las partes del cuerpo en una skin de Minecraft (64x64)
 * Formato: [x, y, width, height]
 */
const SKIN_PARTS = {
    // Cabeza
    head: { x: 8, y: 8, w: 8, h: 8 },
    headOverlay: { x: 40, y: 8, w: 8, h: 8 },
    
    // Cuerpo
    body: { x: 20, y: 20, w: 8, h: 12 },
    bodyOverlay: { x: 20, y: 36, w: 8, h: 12 },
    
    // Brazo derecho
    armRight: { x: 44, y: 20, w: 4, h: 12 },
    armRightOverlay: { x: 44, y: 36, w: 4, h: 12 },
    
    // Brazo izquierdo (en skins modernas 64x64)
    armLeft: { x: 36, y: 52, w: 4, h: 12 },
    armLeftOverlay: { x: 52, y: 52, w: 4, h: 12 },
    
    // Pierna derecha
    legRight: { x: 4, y: 20, w: 4, h: 12 },
    legRightOverlay: { x: 4, y: 36, w: 4, h: 12 },
    
    // Pierna izquierda (en skins modernas 64x64)
    legLeft: { x: 20, y: 52, w: 4, h: 12 },
    legLeftOverlay: { x: 4, y: 52, w: 4, h: 12 }
}

/**
 * Renderiza una skin de cuerpo completo en un canvas
 * @param {string} skinUrl - URL de la skin PNG
 * @param {number} scale - Factor de escala (default: 4)
 * @returns {Promise<HTMLCanvasElement>} Canvas con el render
 */
async function renderBodyFront(skinUrl, scale = 4) {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        
        img.onload = () => {
            try {
                // Detectar si es skin legacy (64x32) o moderna (64x64)
                const isLegacy = img.height === 32
                
                // Dimensiones del render final (8 cabeza + 12 cuerpo + 12 piernas = 32 alto, 16 ancho)
                const renderWidth = 16 * scale
                const renderHeight = 32 * scale
                
                const canvas = document.createElement('canvas')
                canvas.width = renderWidth
                canvas.height = renderHeight
                const ctx = canvas.getContext('2d')
                
                // Desactivar suavizado para mantener pixeles nítidos
                ctx.imageSmoothingEnabled = false
                
                // Dibujar partes del cuerpo de frente
                // Orden: piernas, cuerpo, brazos, cabeza (de atrás hacia adelante)
                
                // Pierna derecha (posición x: 4, y: 20 en render)
                drawPart(ctx, img, SKIN_PARTS.legRight, 4 * scale, 20 * scale, scale)
                drawPart(ctx, img, SKIN_PARTS.legRightOverlay, 4 * scale, 20 * scale, scale)
                
                // Pierna izquierda
                if (isLegacy) {
                    // En skins legacy, se espeja la pierna derecha
                    drawPartMirrored(ctx, img, SKIN_PARTS.legRight, 8 * scale, 20 * scale, scale)
                } else {
                    drawPart(ctx, img, SKIN_PARTS.legLeft, 8 * scale, 20 * scale, scale)
                    drawPart(ctx, img, SKIN_PARTS.legLeftOverlay, 8 * scale, 20 * scale, scale)
                }
                
                // Cuerpo
                drawPart(ctx, img, SKIN_PARTS.body, 4 * scale, 8 * scale, scale)
                if (!isLegacy) {
                    drawPart(ctx, img, SKIN_PARTS.bodyOverlay, 4 * scale, 8 * scale, scale)
                }
                
                // Brazo derecho
                drawPart(ctx, img, SKIN_PARTS.armRight, 0, 8 * scale, scale)
                if (!isLegacy) {
                    drawPart(ctx, img, SKIN_PARTS.armRightOverlay, 0, 8 * scale, scale)
                }
                
                // Brazo izquierdo
                if (isLegacy) {
                    drawPartMirrored(ctx, img, SKIN_PARTS.armRight, 12 * scale, 8 * scale, scale)
                } else {
                    drawPart(ctx, img, SKIN_PARTS.armLeft, 12 * scale, 8 * scale, scale)
                    drawPart(ctx, img, SKIN_PARTS.armLeftOverlay, 12 * scale, 8 * scale, scale)
                }
                
                // Cabeza (más grande, escala 2x)
                const headScale = scale
                drawPart(ctx, img, SKIN_PARTS.head, 4 * scale, 0, headScale)
                drawPart(ctx, img, SKIN_PARTS.headOverlay, 4 * scale, 0, headScale)
                
                logger.debug('Skin renderizada correctamente')
                resolve(canvas)
            } catch (err) {
                logger.error('Error renderizando skin:', err)
                reject(err)
            }
        }
        
        img.onerror = () => {
            // Error esperado cuando la skin no existe en el backend (404)
            logger.debug('Skin no encontrada, se usará fallback')
            reject(new Error('Skin no disponible'))
        }
        
        img.src = skinUrl
    })
}

/**
 * Dibuja una parte de la skin en el canvas
 */
function drawPart(ctx, img, part, destX, destY, scale) {
    ctx.drawImage(
        img,
        part.x, part.y, part.w, part.h,  // Fuente
        destX, destY, part.w * scale, part.h * scale  // Destino
    )
}

/**
 * Dibuja una parte de la skin espejada horizontalmente
 */
function drawPartMirrored(ctx, img, part, destX, destY, scale) {
    ctx.save()
    ctx.translate(destX + part.w * scale, destY)
    ctx.scale(-1, 1)
    ctx.drawImage(
        img,
        part.x, part.y, part.w, part.h,
        0, 0, part.w * scale, part.h * scale
    )
    ctx.restore()
}

/**
 * Renderiza una skin y la aplica como fondo a un contenedor
 * @param {string} containerId - ID del contenedor
 * @param {string} skinUrl - URL de la skin
 * @param {number} scale - Factor de escala
 */
async function renderToContainer(containerId, skinUrl, scale = 4) {
    const container = document.getElementById(containerId)
    if (!container) {
        logger.error('Contenedor no encontrado:', containerId)
        return null
    }
    
    try {
        const canvas = await renderBodyFront(skinUrl, scale)
        const dataUrl = canvas.toDataURL('image/png')
        
        // Aplicar como background-image
        container.style.backgroundImage = 'url(' + dataUrl + ')'
        container.style.backgroundSize = 'contain'
        container.style.backgroundPosition = 'center'
        container.style.backgroundRepeat = 'no-repeat'
        
        logger.debug('Skin aplicada a contenedor:', containerId)
        return canvas
    } catch (err) {
        logger.debug('Error aplicando skin a contenedor (se usará fallback):', err.message)
        throw err
    }
}

/**
 * Obtiene la ruta local de la skin de Steve por defecto
 */
function getSteveDefault() {
    // Skin de Steve local en assets/images/steve.png (64x64 formato Minecraft)
    return 'assets/images/steve.png'
}

module.exports = {
    renderBodyFront,
    renderToContainer,
    getSteveDefault,
    SKIN_PARTS
}
