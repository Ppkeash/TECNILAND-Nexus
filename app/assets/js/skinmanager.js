/**
 * SkinManager - Módulo centralizado para gestión de skins offline
 * 
 * Este módulo maneja:
 * - Validación de archivos de skin (PNG, dimensiones 64x64 o 64x32)
 * - Almacenamiento local de skins en tecniland/skins/accounts/<uuid>.png
 * - Galería compartida de skins en tecniland/skins/gallery/*.png
 * - Emisión de eventos para refrescar avatares en la UI
 * 
 * Estructura de carpetas:
 *   <launcherData>/tecniland/skins/accounts/<uuid>.png  - Skin activa por cuenta
 *   <launcherData>/tecniland/skins/gallery/*.png        - Galería compartida
 * 
 * Futuro (Option B): Se podría integrar skinview3d para un preview 3D completo
 * en lugar del canvas 2.5D actual. Ver: https://github.com/bs-community/skinview3d
 * 
 * @module skinmanager
 */

const fs = require('fs-extra')
const path = require('path')
const { LoggerUtil } = require('helios-core')
const ConfigManager = require('./configmanager')
const { localProvider } = require('./skinproviders')

const logger = LoggerUtil.getLogger('SkinManager')

// Constantes para estructura de carpetas
const SKINS_ROOT_FOLDER = 'tecniland/skins'
const ACCOUNTS_SUBFOLDER = 'accounts'
const GALLERY_SUBFOLDER = 'gallery'

// Dimensiones válidas de skins de Minecraft
const VALID_SKIN_DIMENSIONS = [
    { width: 64, height: 64 },  // Skin moderna (1.8+)
    { width: 64, height: 32 }   // Skin legacy
]

// Evento custom para notificar cambios de skin
const SKIN_UPDATED_EVENT = 'tecniland-skin-updated'

/**
 * Obtiene la ruta base del directorio de skins.
 * @returns {string} Ruta absoluta al directorio de skins
 */
function getSkinsBasePath() {
    return path.join(ConfigManager.getDataDirectory(), SKINS_ROOT_FOLDER)
}

/**
 * Obtiene la ruta del directorio de skins de cuentas.
 * @returns {string} Ruta absoluta al directorio de skins de cuentas
 */
function getAccountsSkinsPath() {
    return path.join(getSkinsBasePath(), ACCOUNTS_SUBFOLDER)
}

/**
 * Obtiene la ruta del directorio de galería de skins.
 * @returns {string} Ruta absoluta al directorio de galería
 */
function getGalleryPath() {
    return path.join(getSkinsBasePath(), GALLERY_SUBFOLDER)
}

/**
 * Asegura que los directorios de skins existen.
 * Crea la estructura si no existe.
 */
function ensureSkinsDirectories() {
    const accountsPath = getAccountsSkinsPath()
    const galleryPath = getGalleryPath()
    
    fs.ensureDirSync(accountsPath)
    fs.ensureDirSync(galleryPath)
    
    logger.debug('Directorios de skins verificados/creados')
}

/**
 * Valida si un archivo es una imagen PNG válida con dimensiones de skin de Minecraft.
 * 
 * @param {string} filePath - Ruta al archivo a validar
 * @returns {Promise<{valid: boolean, error?: string, dimensions?: {width: number, height: number}}>}
 */
async function validateSkinImage(filePath) {
    try {
        // Verificar que el archivo existe
        if (!fs.existsSync(filePath)) {
            return { valid: false, error: 'FILE_NOT_FOUND' }
        }

        // Verificar extensión PNG
        if (path.extname(filePath).toLowerCase() !== '.png') {
            return { valid: false, error: 'NOT_PNG' }
        }

        // Leer los primeros bytes para verificar firma PNG y obtener dimensiones
        const buffer = await fs.readFile(filePath)
        
        // Verificar firma PNG: 89 50 4E 47 0D 0A 1A 0A
        const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
        for (let i = 0; i < PNG_SIGNATURE.length; i++) {
            if (buffer[i] !== PNG_SIGNATURE[i]) {
                return { valid: false, error: 'INVALID_PNG_SIGNATURE' }
            }
        }

        // Obtener dimensiones del chunk IHDR (bytes 16-23)
        // Width: bytes 16-19 (big endian)
        // Height: bytes 20-23 (big endian)
        const width = buffer.readUInt32BE(16)
        const height = buffer.readUInt32BE(20)

        // Validar dimensiones contra las permitidas
        const isValidDimension = VALID_SKIN_DIMENSIONS.some(
            dim => dim.width === width && dim.height === height
        )

        if (!isValidDimension) {
            return { 
                valid: false, 
                error: 'INVALID_DIMENSIONS',
                dimensions: { width, height }
            }
        }

        return { 
            valid: true, 
            dimensions: { width, height }
        }

    } catch (error) {
        logger.error('Error validando skin:', error)
        return { valid: false, error: 'VALIDATION_ERROR' }
    }
}

/**
 * Obtiene la ruta de la skin para un UUID específico.
 * 
 * @param {string} uuid - UUID de la cuenta offline
 * @returns {string|null} Ruta al archivo de skin o null si no existe
 */
function getSkinPathForUUID(uuid) {
    const skinPath = path.join(getAccountsSkinsPath(), `${uuid}.png`)
    return fs.existsSync(skinPath) ? skinPath : null
}

/**
 * Obtiene la información de skin para un UUID.
 * Utiliza LocalSkinProvider para verificar existencia y obtener ruta.
 * 
 * @param {string} uuid - UUID de la cuenta offline
 * @returns {{path: string|null, model: string, exists: boolean}}
 */
function getSkinForUUID(uuid) {
    // Usar LocalSkinProvider para verificar existencia
    const skinPath = localProvider.getSkinPath(uuid)
    const account = ConfigManager.getAuthAccount(uuid)
    
    // TODO [BACKEND-YGGDRASIL]: Aquí se podría consultar TecnilandSkinProvider
    // para obtener la skin desde el servidor remoto si no existe localmente.
    // Ejemplo futuro:
    // if (!skinPath && account?.type === 'tecniland') {
    //     return await tecnilandProvider.getSkinUrl(uuid)
    // }
    
    return {
        path: skinPath,
        model: account?.skin?.model || 'classic',
        exists: skinPath !== null
    }
}

/**
 * Establece la skin para un UUID específico.
 * Utiliza LocalSkinProvider para copiar y almacenar la skin.
 * 
 * @param {string} uuid - UUID de la cuenta offline
 * @param {string} sourcePath - Ruta al archivo PNG de origen
 * @param {string} model - Modelo de skin: 'classic' (Steve) o 'slim' (Alex)
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
async function setSkinForUUID(uuid, sourcePath, model = 'classic') {
    try {
        logger.info(`Estableciendo skin para UUID: ${uuid}`)
        
        // Usar LocalSkinProvider para guardar
        const result = await localProvider.saveSkin(uuid, sourcePath)
        
        if (!result.success) {
            return result
        }

        // Actualizar configuración
        const account = ConfigManager.getAuthAccount(uuid)
        if (account && account.type === 'offline') {
            ConfigManager.setOfflineAccountSkin(uuid, {
                path: result.path,
                model: model,
                lastUpdated: Date.now()
            })
            ConfigManager.save()
        }

        logger.info(`Skin establecida para UUID: ${uuid}`)

        // Emitir evento de actualización
        emitSkinUpdated(uuid)

        // TODO [BACKEND-YGGDRASIL]: Aquí se podría subir la skin al servidor
        // usando TecnilandSkinProvider para skins in-game.
        // Ejemplo futuro:
        // if (account?.type === 'tecniland') {
        //     await tecnilandProvider.uploadSkin(uuid, result.path, model)
        // }

        return { success: true, path: result.path }

    } catch (error) {
        logger.error('Error estableciendo skin:', error)
        return { success: false, error: 'COPY_ERROR' }
    }
}

/**
 * Elimina la skin de un UUID específico.
 * Utiliza LocalSkinProvider para eliminar la skin del almacenamiento local.
 * 
 * @param {string} uuid - UUID de la cuenta offline
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deleteSkinForUUID(uuid) {
    try {
        logger.info(`Eliminando skin para UUID: ${uuid}`)
        
        // Usar LocalSkinProvider para eliminar
        const result = await localProvider.deleteSkin(uuid)
        
        if (!result.success) {
            return result
        }

        // Limpiar configuración
        const account = ConfigManager.getAuthAccount(uuid)
        if (account && account.type === 'offline') {
            ConfigManager.setOfflineAccountSkin(uuid, null)
            ConfigManager.save()
        }

        logger.info(`Skin eliminada para UUID: ${uuid}`)

        // Emitir evento de actualización
        emitSkinUpdated(uuid)

        return { success: true }

    } catch (error) {
        logger.error('Error eliminando skin:', error)
        return { success: false, error: 'DELETE_ERROR' }
    }
}

/**
 * Lista todos los skins disponibles en la galería.
 * 
 * @returns {Promise<Array<{name: string, path: string}>>}
 */
async function listGallerySkins() {
    try {
        ensureSkinsDirectories()
        
        const galleryPath = getGalleryPath()
        const files = await fs.readdir(galleryPath)
        
        const skins = []
        for (const file of files) {
            if (path.extname(file).toLowerCase() === '.png') {
                const filePath = path.join(galleryPath, file)
                const validation = await validateSkinImage(filePath)
                
                if (validation.valid) {
                    skins.push({
                        name: path.basename(file, '.png'),
                        path: filePath
                    })
                }
            }
        }

        // TODO [SYNC]: Aquí se podría mezclar con skins de un servidor remoto
        // para mostrar una galería compartida de la comunidad TECNILAND.
        // Ejemplo futuro:
        // const remoteSkins = await fetchGalleryFromServer()
        // return [...skins, ...remoteSkins]

        return skins

    } catch (error) {
        logger.error('Error listando galería:', error)
        return []
    }
}

/**
 * Añade una skin a la galería compartida.
 * 
 * @param {string} sourcePath - Ruta al archivo PNG de origen
 * @param {string} name - Nombre para la skin en la galería
 * @returns {Promise<{success: boolean, error?: string, path?: string}>}
 */
async function addToGallery(sourcePath, name) {
    try {
        // Validar la imagen
        const validation = await validateSkinImage(sourcePath)
        if (!validation.valid) {
            return { success: false, error: validation.error }
        }

        ensureSkinsDirectories()

        // Sanitizar nombre y copiar
        const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_')
        const destPath = path.join(getGalleryPath(), `${safeName}.png`)
        
        await fs.copy(sourcePath, destPath, { overwrite: true })

        logger.info(`Skin añadida a galería: ${safeName}`)

        return { success: true, path: destPath }

    } catch (error) {
        logger.error('Error añadiendo a galería:', error)
        return { success: false, error: 'GALLERY_ERROR' }
    }
}

/**
 * Elimina una skin de la galería.
 * 
 * @param {string} name - Nombre de la skin a eliminar
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function removeFromGallery(name) {
    try {
        const skinPath = path.join(getGalleryPath(), `${name}.png`)
        
        if (fs.existsSync(skinPath)) {
            await fs.remove(skinPath)
            logger.info(`Skin eliminada de galería: ${name}`)
            return { success: true }
        }

        return { success: false, error: 'NOT_FOUND' }

    } catch (error) {
        logger.error('Error eliminando de galería:', error)
        return { success: false, error: 'DELETE_ERROR' }
    }
}

/**
 * Emite el evento de skin actualizada para refrescar la UI.
 * 
 * @param {string} uuid - UUID de la cuenta cuya skin cambió
 */
function emitSkinUpdated(uuid) {
    if (typeof window !== 'undefined') {
        const event = new CustomEvent(SKIN_UPDATED_EVENT, {
            detail: { uuid }
        })
        window.dispatchEvent(event)
        logger.debug(`Evento ${SKIN_UPDATED_EVENT} emitido para UUID: ${uuid}`)
    }
}

/**
 * Obtiene la URL o ruta para mostrar la skin de un UUID.
 * Devuelve la skin local si existe, o un avatar por defecto.
 * 
 * @param {string} uuid - UUID de la cuenta
 * @param {string} accountType - Tipo de cuenta ('offline', 'microsoft', 'mojang')
 * @returns {string} URL o file:// path para la imagen
 */
function getSkinDisplayUrl(uuid, accountType = 'offline') {
    if (accountType === 'offline') {
        const skinPath = getSkinPathForUUID(uuid)
        if (skinPath) {
            // Convertir a file:// URL para uso en img src
            return `file://${skinPath.replace(/\\/g, '/')}`
        }
    }
    
    // Fallback: usar mc-heads.net para avatar genérico
    return `https://mc-heads.net/avatar/${uuid}/60`
}

/**
 * Obtiene la URL para mostrar el cuerpo completo de la skin.
 * Para skins locales, devuelve la ruta al archivo PNG.
 * 
 * @param {string} uuid - UUID de la cuenta
 * @param {string} accountType - Tipo de cuenta
 * @returns {string} URL o file:// path para la imagen
 */
function getSkinBodyUrl(uuid, accountType = 'offline') {
    if (accountType === 'offline') {
        const skinPath = getSkinPathForUUID(uuid)
        if (skinPath) {
            return `file://${skinPath.replace(/\\/g, '/')}`
        }
    }
    
    // Fallback: usar mc-heads.net para body render
    return `https://mc-heads.net/body/${uuid}/60`
}

/**
 * Renderiza un preview 2.5D de la skin en un canvas.
 * Extrae las regiones UV de la skin y las dibuja en perspectiva pseudo-3D.
 * 
 * Futuro (Option B): Esta función podría ser reemplazada por skinview3d
 * para un render 3D completo con rotación interactiva.
 * 
 * @param {HTMLCanvasElement} canvas - Canvas donde dibujar
 * @param {string} skinPath - Ruta al archivo PNG de la skin
 * @param {string} model - 'classic' o 'slim'
 * @returns {Promise<boolean>} true si el render fue exitoso
 */
async function renderSkinPreview(canvas, skinPath, model = 'classic') {
    return new Promise((resolve) => {
        const ctx = canvas.getContext('2d')
        const img = new Image()
        
        img.onload = () => {
            const isSlim = model === 'slim'
            const isLegacy = img.height === 32
            
            // Limpiar canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.imageSmoothingEnabled = false
            
            // Escala para el preview
            const scale = 4
            const offsetX = (canvas.width - 16 * scale) / 2
            const offsetY = 10
            
            // === CABEZA (front face) ===
            // UV: x=8, y=8, w=8, h=8
            ctx.drawImage(img, 8, 8, 8, 8, offsetX, offsetY, 8 * scale, 8 * scale)
            
            // === CUERPO (front face) ===
            // UV: x=20, y=20, w=8, h=12
            ctx.drawImage(img, 20, 20, 8, 12, offsetX, offsetY + 8 * scale, 8 * scale, 12 * scale)
            
            // === BRAZO DERECHO (front face) ===
            // Classic: UV x=44, y=20, w=4, h=12
            // Slim: UV x=44, y=20, w=3, h=12
            const armWidth = isSlim ? 3 : 4
            ctx.drawImage(img, 44, 20, armWidth, 12, 
                offsetX - armWidth * scale, offsetY + 8 * scale, 
                armWidth * scale, 12 * scale)
            
            // === BRAZO IZQUIERDO (front face) ===
            if (isLegacy) {
                // Legacy: espejo del brazo derecho
                ctx.save()
                ctx.scale(-1, 1)
                ctx.drawImage(img, 44, 20, armWidth, 12,
                    -(offsetX + 8 * scale + armWidth * scale), offsetY + 8 * scale,
                    armWidth * scale, 12 * scale)
                ctx.restore()
            } else {
                // Modern: UV x=36, y=52, w=4, h=12 (slim: w=3)
                ctx.drawImage(img, 36, 52, armWidth, 12,
                    offsetX + 8 * scale, offsetY + 8 * scale,
                    armWidth * scale, 12 * scale)
            }
            
            // === PIERNA DERECHA (front face) ===
            // UV: x=4, y=20, w=4, h=12
            ctx.drawImage(img, 4, 20, 4, 12,
                offsetX, offsetY + 20 * scale,
                4 * scale, 12 * scale)
            
            // === PIERNA IZQUIERDA (front face) ===
            if (isLegacy) {
                // Legacy: espejo de la pierna derecha
                ctx.save()
                ctx.scale(-1, 1)
                ctx.drawImage(img, 4, 20, 4, 12,
                    -(offsetX + 8 * scale), offsetY + 20 * scale,
                    4 * scale, 12 * scale)
                ctx.restore()
            } else {
                // Modern: UV x=20, y=52, w=4, h=12
                ctx.drawImage(img, 20, 52, 4, 12,
                    offsetX + 4 * scale, offsetY + 20 * scale,
                    4 * scale, 12 * scale)
            }
            
            // === OVERLAY/HAT LAYER (cabeza) ===
            // UV: x=40, y=8, w=8, h=8
            ctx.drawImage(img, 40, 8, 8, 8, offsetX, offsetY, 8 * scale, 8 * scale)
            
            resolve(true)
        }
        
        img.onerror = () => {
            logger.error('Error cargando imagen de skin para preview')
            resolve(false)
        }
        
        // Cargar imagen desde file:// o ruta local
        if (skinPath.startsWith('file://')) {
            img.src = skinPath
        } else {
            img.src = `file://${skinPath.replace(/\\/g, '/')}`
        }
    })
}

/**
 * Renderiza solo la cabeza de la skin (para avatares pequeños).
 * 
 * @param {HTMLCanvasElement} canvas - Canvas donde dibujar (recomendado 32x32 o 64x64)
 * @param {string} skinPath - Ruta al archivo PNG de la skin
 * @returns {Promise<boolean>} true si el render fue exitoso
 */
async function renderSkinHead(canvas, skinPath) {
    return new Promise((resolve) => {
        const ctx = canvas.getContext('2d')
        const img = new Image()
        
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.imageSmoothingEnabled = false
            
            // Cara (front face): UV x=8, y=8, w=8, h=8
            ctx.drawImage(img, 8, 8, 8, 8, 0, 0, canvas.width, canvas.height)
            
            // Overlay (hat layer): UV x=40, y=8, w=8, h=8
            ctx.drawImage(img, 40, 8, 8, 8, 0, 0, canvas.width, canvas.height)
            
            resolve(true)
        }
        
        img.onerror = () => {
            resolve(false)
        }
        
        if (skinPath.startsWith('file://')) {
            img.src = skinPath
        } else {
            img.src = `file://${skinPath.replace(/\\/g, '/')}`
        }
    })
}

// TODO [BACKEND-YGGDRASIL]:
// Las funciones applyOfflineSkinToInstance() y enableResourcepackInOptions() fueron eliminadas
// porque los resourcepacks NO pueden cambiar la skin del jugador local en Minecraft vanilla/OptiFine.
// 
// Para aplicar skins in-game en cuentas offline, se necesita:
// 1. Backend Yggdrasil-compatible (auth + session server)
// 2. authlib-injector integrado en el launcher
// 3. Implementación de TecnilandSkinProvider en skinproviders.js
//
// Referencias:
// - https://github.com/yushijinhun/authlib-injector
// - https://wiki.vg/Authentication (Yggdrasil API)

/**
 * Renderiza un avatar tipo Xbox/Bedrock (cabeza + torso) en un canvas.
 * Este avatar se usa en la UI del launcher (configuración y landing).
 * 
 * @param {string} uuid - UUID de la cuenta
 * @param {string} model - Modelo de skin ('classic' o 'slim')
 * @param {number} size - Tamaño del canvas (default: 128)
 * @returns {Promise<string>} Data URL del canvas con el avatar renderizado
 */
async function renderPlayerAvatar(uuid, model = 'classic', size = 128) {
    return new Promise((resolve, reject) => {
        try {
            const canvas = document.createElement('canvas')
            canvas.width = size
            canvas.height = size
            const ctx = canvas.getContext('2d')
            
            // Fondo transparente
            ctx.clearRect(0, 0, size, size)
            
            const skinInfo = getSkinForUUID(uuid)
            
            if (!skinInfo.exists) {
                // Sin skin personalizada - renderizar Steve/Alex por defecto
                const isAlex = model === 'slim'
                ctx.fillStyle = isAlex ? '#F0A080' : '#C89664'
                
                // Cabeza (más grande)
                const headSize = size * 0.55
                const headX = (size - headSize) / 2
                const headY = size * 0.1
                ctx.fillRect(headX, headY, headSize, headSize)
                
                // Torso (más pequeño)
                const torsoWidth = size * 0.45
                const torsoHeight = size * 0.3
                const torsoX = (size - torsoWidth) / 2
                const torsoY = headY + headSize + size * 0.02
                ctx.fillRect(torsoX, torsoY, torsoWidth, torsoHeight)
                
                resolve(canvas.toDataURL('image/png'))
                return
            }
            
            // Cargar skin personalizada
            const img = new Image()
            img.crossOrigin = 'anonymous'
            
            img.onload = () => {
                const scale = size / 32 // Escala para el tamaño del canvas
                
                // Configurar estilo pixelado
                ctx.imageSmoothingEnabled = false
                
                // === CABEZA (más grande y prominente) ===
                const headSize = 14 * scale
                const headX = (size - headSize) / 2
                const headY = size * 0.08
                
                // Cara frontal de la cabeza (UV: 8,8 size 8x8)
                ctx.drawImage(img, 8, 8, 8, 8, headX, headY, headSize, headSize)
                
                // Overlay de la cabeza si existe (UV: 40,8 size 8x8)
                ctx.drawImage(img, 40, 8, 8, 8, headX, headY, headSize, headSize)
                
                // === TORSO (más pequeño, debajo de la cabeza) ===
                const torsoWidth = 14 * scale
                const torsoHeight = 8 * scale
                const torsoX = (size - torsoWidth) / 2
                const torsoY = headY + headSize + scale * 0.5
                
                // Cuerpo frontal (UV: 20,20 size 8x12)
                ctx.drawImage(img, 20, 20, 8, 6, torsoX, torsoY, torsoWidth, torsoHeight)
                
                // Overlay del cuerpo si existe (UV: 20,36 size 8x12)
                ctx.drawImage(img, 20, 36, 8, 6, torsoX, torsoY, torsoWidth, torsoHeight)
                
                resolve(canvas.toDataURL('image/png'))
            }
            
            img.onerror = (error) => {
                logger.error('Error loading skin for avatar:', error)
                reject(error)
            }
            
            img.src = getSkinDisplayUrl(uuid, 'offline')
            
        } catch (error) {
            logger.error('Error rendering player avatar:', error)
            reject(error)
        }
    })
}

// Exportar todas las funciones
module.exports = {
    // Constantes
    SKIN_UPDATED_EVENT,
    VALID_SKIN_DIMENSIONS,
    
    // Rutas
    getSkinsBasePath,
    getAccountsSkinsPath,
    getGalleryPath,
    
    // Validación
    validateSkinImage,
    
    // CRUD de skins por UUID
    getSkinForUUID,
    getSkinPathForUUID,
    setSkinForUUID,
    deleteSkinForUUID,
    
    // Galería
    listGallerySkins,
    addToGallery,
    removeFromGallery,
    
    // URLs para display
    getSkinDisplayUrl,
    getSkinBodyUrl,
    
    // Renderizado canvas
    renderSkinPreview,
    renderSkinHead,
    renderPlayerAvatar,
    
    // Eventos
    emitSkinUpdated,
    
    // Utilidades
    ensureSkinsDirectories
}

