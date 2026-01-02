/**
 * SkinProviders - Arquitectura de proveedores de skins para TECNILAND Nexus
 * 
 * Este módulo define la capa de abstracción para múltiples fuentes de skins:
 * - LocalSkinProvider: Skins locales para UI del launcher únicamente
 * - TecnilandSkinProvider: Backend Yggdrasil (futuro) para skins in-game
 * 
 * TODO [BACKEND-YGGDRASIL]:
 * La implementación futura de TecnilandSkinProvider se integrará con:
 * - Auth/Session server compatible con Yggdrasil API
 * - authlib-injector para apuntar el cliente Minecraft al servidor alternativo
 * - Endpoints: /authserver, /sessionserver, /api/profiles/minecraft
 * 
 * Referencias técnicas:
 * - https://wiki.vg/Authentication
 * - https://github.com/yushijinhun/authlib-injector
 * - https://wiki.vg/Mojang_API#UUID_to_Profile_and_Skin.2FCape
 */

const fs = require('fs-extra')
const path = require('path')
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('SkinProviders')

// Obtener app de manera compatible
const electronApp = require('electron').app
const app = electronApp || require('@electron/remote').app

/**
 * LocalSkinProvider - Proveedor de skins locales
 * 
 * Gestiona skins almacenadas localmente en tecniland/skins/accounts/<uuid>.png
 * SOLO para preview en el launcher. NO aplica skins al juego.
 */
class LocalSkinProvider {
    constructor() {
        this.basePath = path.join(app.getPath('userData'), 'tecniland', 'skins', 'accounts')
    }

    /**
     * Verifica si una skin existe localmente
     * @param {string} uuid - UUID de la cuenta
     * @returns {Promise<boolean>}
     */
    async hasSkin(uuid) {
        try {
            const skinPath = path.join(this.basePath, `${uuid}.png`)
            return await fs.pathExists(skinPath)
        } catch (error) {
            logger.error('Error checking local skin:', error)
            return false
        }
    }

    /**
     * Obtiene la ruta de la skin local
     * @param {string} uuid - UUID de la cuenta
     * @returns {Promise<string|null>}
     */
    async getSkinPath(uuid) {
        try {
            const skinPath = path.join(this.basePath, `${uuid}.png`)
            if (await fs.pathExists(skinPath)) {
                return skinPath
            }
            return null
        } catch (error) {
            logger.error('Error getting local skin path:', error)
            return null
        }
    }

    /**
     * Guarda una skin localmente
     * @param {string} uuid - UUID de la cuenta
     * @param {string} sourcePath - Ruta del archivo PNG a copiar
     * @returns {Promise<{success: boolean, path?: string, error?: string}>}
     */
    async saveSkin(uuid, sourcePath) {
        try {
            await fs.ensureDir(this.basePath)
            const skinPath = path.join(this.basePath, `${uuid}.png`)
            await fs.copy(sourcePath, skinPath)
            logger.info(`Saved local skin for ${uuid}`)
            return { success: true, path: skinPath }
        } catch (error) {
            logger.error('Error saving local skin:', error)
            return { success: false, error: error.message }
        }
    }

    /**
     * Elimina una skin local
     * @param {string} uuid - UUID de la cuenta
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async deleteSkin(uuid) {
        try {
            const skinPath = path.join(this.basePath, `${uuid}.png`)
            if (await fs.pathExists(skinPath)) {
                await fs.remove(skinPath)
                logger.info(`Deleted local skin for ${uuid}`)
            }
            return { success: true }
        } catch (error) {
            logger.error('Error deleting local skin:', error)
            return { success: false, error: error.message }
        }
    }
}

/**
 * TecnilandSkinProvider - Proveedor de backend TECNILAND (STUB)
 * 
 * TODO [BACKEND-YGGDRASIL]:
 * Este proveedor será la interfaz con el backend de autenticación TECNILAND.
 * Implementará el flujo completo Yggdrasil-compatible:
 * 
 * 1. Autenticación:
 *    POST /authserver/authenticate
 *    { username, password, clientToken, requestUser: true }
 *    
 * 2. Obtener perfil con skin:
 *    GET /sessionserver/session/minecraft/profile/<uuid>?unsigned=false
 *    
 * 3. Subir skin:
 *    POST /api/user/profile/<uuid>/skin
 *    { model: "slim"|"classic", file: <multipart> }
 *    
 * 4. Integración con launcher:
 *    - Añadir --authlib-injector <servidor> al comando Java
 *    - O usar custom authlib JAR con servidor pre-configurado
 *    
 * Referencias:
 * - authlib-injector: https://github.com/yushijinhun/authlib-injector
 * - Yggdrasil API spec: https://wiki.vg/Authentication
 * - Session server: https://wiki.vg/Protocol_Encryption#Authentication
 */
class TecnilandSkinProvider {
    constructor() {
        // TODO [BACKEND-YGGDRASIL]: Configurar endpoint del servidor
        this.authServerUrl = null // 'https://auth.tecniland.net/authserver'
        this.sessionServerUrl = null // 'https://auth.tecniland.net/sessionserver'
        this.apiServerUrl = null // 'https://auth.tecniland.net/api'
        
        this.accessToken = null
        this.clientToken = null
        this.userProfile = null
    }

    /**
     * Login en el sistema TECNILAND
     * 
     * TODO [BACKEND-YGGDRASIL]:
     * Implementar autenticación completa:
     * - POST /authserver/authenticate con email/password
     * - Guardar accessToken, clientToken, profile
     * - Retornar perfil con UUID y propiedades de skin
     * 
     * @param {string} email - Email de la cuenta TECNILAND
     * @param {string} password - Contraseña
     * @returns {Promise<{success: boolean, profile?: Object, error?: string}>}
     */
    async loginTecniland(email, password) {
        logger.warn('TecnilandSkinProvider.loginTecniland: Not implemented yet')
        return {
            success: false,
            error: 'TECNILAND authentication not implemented. Backend Yggdrasil-compatible server required.'
        }
        
        // TODO [BACKEND-YGGDRASIL]: Implementar
        // const response = await axios.post(`${this.authServerUrl}/authenticate`, {
        //     username: email,
        //     password: password,
        //     clientToken: this.clientToken || crypto.randomUUID(),
        //     requestUser: true
        // })
        // this.accessToken = response.data.accessToken
        // this.clientToken = response.data.clientToken
        // this.userProfile = response.data.selectedProfile
        // return { success: true, profile: this.userProfile }
    }

    /**
     * Obtiene el perfil completo de un usuario (incluye textures)
     * 
     * TODO [BACKEND-YGGDRASIL]:
     * Implementar obtención de perfil:
     * - GET /sessionserver/session/minecraft/profile/<uuid>?unsigned=false
     * - Parsear textures (skin + cape) desde propiedades
     * - Validar firma si unsigned=false
     * 
     * @param {string} uuid - UUID del usuario
     * @returns {Promise<{success: boolean, profile?: Object, error?: string}>}
     */
    async getProfile(uuid) {
        logger.warn('TecnilandSkinProvider.getProfile: Not implemented yet')
        return {
            success: false,
            error: 'Profile fetching not implemented. Backend session server required.'
        }
        
        // TODO [BACKEND-YGGDRASIL]: Implementar
        // const response = await axios.get(`${this.sessionServerUrl}/session/minecraft/profile/${uuid}`)
        // const profile = response.data
        // // Decodificar textures desde base64
        // const texturesProp = profile.properties.find(p => p.name === 'textures')
        // const textures = JSON.parse(Buffer.from(texturesProp.value, 'base64').toString())
        // return { success: true, profile: { ...profile, textures } }
    }

    /**
     * Obtiene la URL de la skin de un usuario
     * 
     * TODO [BACKEND-YGGDRASIL]:
     * Implementar obtención de URL:
     * - Llamar getProfile(uuid)
     * - Extraer textures.SKIN.url
     * - Retornar URL directa para descarga
     * 
     * @param {string} uuid - UUID del usuario
     * @returns {Promise<{success: boolean, url?: string, model?: string, error?: string}>}
     */
    async getSkinUrl(uuid) {
        logger.warn('TecnilandSkinProvider.getSkinUrl: Not implemented yet')
        return {
            success: false,
            error: 'Skin URL fetching not implemented. Backend session server required.'
        }
        
        // TODO [BACKEND-YGGDRASIL]: Implementar
        // const profileResult = await this.getProfile(uuid)
        // if (!profileResult.success) return profileResult
        // const skinTexture = profileResult.profile.textures.SKIN
        // return {
        //     success: true,
        //     url: skinTexture.url,
        //     model: skinTexture.metadata?.model || 'classic'
        // }
    }

    /**
     * Sube una nueva skin al servidor TECNILAND
     * 
     * TODO [BACKEND-YGGDRASIL]:
     * Implementar upload de skin:
     * - POST /api/user/profile/<uuid>/skin
     * - Multipart form-data con archivo PNG
     * - Incluir modelo (slim/classic)
     * - Autenticar con accessToken
     * 
     * @param {string} uuid - UUID del usuario
     * @param {string} pngPath - Ruta del archivo PNG (64x64)
     * @param {string} model - Modelo: 'classic' o 'slim'
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async uploadSkin(uuid, pngPath, model = 'classic') {
        logger.warn('TecnilandSkinProvider.uploadSkin: Not implemented yet')
        return {
            success: false,
            error: 'Skin upload not implemented. Backend API server required.'
        }
        
        // TODO [BACKEND-YGGDRASIL]: Implementar
        // const form = new FormData()
        // form.append('file', fs.createReadStream(pngPath))
        // form.append('model', model)
        // await axios.post(`${this.apiServerUrl}/user/profile/${uuid}/skin`, form, {
        //     headers: {
        //         'Authorization': `Bearer ${this.accessToken}`,
        //         ...form.getHeaders()
        //     }
        // })
        // return { success: true }
    }

    /**
     * Cierra sesión TECNILAND
     * 
     * TODO [BACKEND-YGGDRASIL]:
     * Implementar invalidación:
     * - POST /authserver/invalidate con accessToken y clientToken
     * - Limpiar tokens locales
     * 
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async logoutTecniland() {
        logger.warn('TecnilandSkinProvider.logoutTecniland: Not implemented yet')
        
        // Limpiar estado local
        this.accessToken = null
        this.clientToken = null
        this.userProfile = null
        
        return { success: true }
        
        // TODO [BACKEND-YGGDRASIL]: Implementar
        // await axios.post(`${this.authServerUrl}/invalidate`, {
        //     accessToken: this.accessToken,
        //     clientToken: this.clientToken
        // })
        // // Limpiar estado
        // this.accessToken = null
        // this.clientToken = null
        // this.userProfile = null
        // return { success: true }
    }

    /**
     * Verifica si hay una sesión activa
     * @returns {boolean}
     */
    isAuthenticated() {
        return this.accessToken !== null && this.userProfile !== null
    }
}

// Instancias singleton
const localProvider = new LocalSkinProvider()
const tecnilandProvider = new TecnilandSkinProvider()

module.exports = {
    LocalSkinProvider,
    TecnilandSkinProvider,
    localProvider,
    tecnilandProvider
}
