/**
 * TecnilandAuthManager
 * 
 * Cliente principal para el sistema de autenticación TECNILAND.
 * Maneja todas las interacciones con el backend de autenticación.
 * 
 * SISTEMA DE TOKENS:
 * ==================
 * Este manager maneja dos tipos de tokens diferentes:
 * 
 * 1. yggdrasilAccessToken (Token de Yggdrasil)
 *    - Obtenido de: POST /authserver/authenticate (response.accessToken)
 *    - Propósito: Autenticación de Minecraft (lanzar el juego)
 *    - Usado en: Proceso de launch del juego
 *    - Validación: POST /authserver/validate
 *    - Refresh: POST /authserver/refresh
 * 
 * 2. jwtToken (JWT para API REST)
 *    - Obtenido de: POST /authserver/authenticate (response.user.token)
 *    - Propósito: Autenticación con API REST de TECNILAND
 *    - Usado en: /api/skins/upload, /api/skins/delete, etc.
 *    - Header: Authorization: Bearer <jwtToken>
 *    - Expiración: response.user.tokenExpiresAt
 * 
 * FLUJO DE LOGIN:
 * ===============
 * 1. Login REST (GET /api/auth/login) → Validación inicial
 * 2. Yggdrasil Authenticate (POST /authserver/authenticate) → Obtiene ambos tokens
 *    - response.accessToken → this.yggdrasilAccessToken (para Minecraft)
 *    - response.user.token → this.jwtToken (para API REST)
 * 3. Guardar sesión con ambos tokens para uso posterior
 * 
 * @module tecnilandauth/TecnilandAuthManager
 */

const { LoggerUtil } = require('helios-core')
const ConfigManager = require('../configmanager')
const TecnilandAuthConfig = require('./TecnilandAuthConfig')
const crypto = require('crypto')
const fs = require('fs-extra')
const path = require('path')

const logger = LoggerUtil.getLogger('TecnilandAuthManager')

class TecnilandAuthManager {
    
    constructor() {
        // JWT para API REST (/api/skins/*) - obtenido de Yggdrasil user.token
        this.jwtToken = null
        this.jwtTokenExpiresAt = null
        
        // Tokens de Yggdrasil para Minecraft
        this.yggdrasilAccessToken = null  // Token para lanzar Minecraft
        this.yggdrasilClientToken = null  // Token de cliente Yggdrasil
        
        // Usuario actual
        this.currentUser = null
        this.sessionLoaded = false
        
        // Flag de validación: true solo si validateSession() confirmó que el JWT es válido
        this.sessionValidated = false
    }
    
    // ==================== API REST (Gestión de Cuenta) ====================
    
    /**
     * Registrar una nueva cuenta TECNILAND.
     * 
     * @param {string} username - Nombre de usuario (3-16 caracteres)
     * @param {string} email - Correo electrónico
     * @param {string} password - Contraseña (mínimo 6 caracteres)
     * @param {string} accessKey - Clave de acceso (16 caracteres)
     * @returns {Promise<Object>} Resultado del registro
     */
    async register(username, email, password, accessKey) {
        logger.info(`Intentando registrar cuenta: ${username}`)
        
        // Validaciones locales
        if (!TecnilandAuthConfig.VALIDATION.USERNAME_REGEX.test(username)) {
            return Promise.reject({
                code: TecnilandAuthConfig.ERROR_CODES.INVALID_USERNAME,
                title: 'Nombre de Usuario Inválido',
                desc: 'El nombre de usuario debe tener entre 3 y 16 caracteres (letras, números y guiones bajos).'
            })
        }
        
        if (!TecnilandAuthConfig.VALIDATION.EMAIL_REGEX.test(email)) {
            return Promise.reject({
                code: TecnilandAuthConfig.ERROR_CODES.INVALID_EMAIL,
                title: 'Correo Inválido',
                desc: 'Por favor ingresa un correo electrónico válido.'
            })
        }
        
        if (password.length < TecnilandAuthConfig.VALIDATION.PASSWORD_MIN_LENGTH) {
            return Promise.reject({
                code: TecnilandAuthConfig.ERROR_CODES.WEAK_PASSWORD,
                title: 'Contraseña Débil',
                desc: `La contraseña debe tener al menos ${TecnilandAuthConfig.VALIDATION.PASSWORD_MIN_LENGTH} caracteres.`
            })
        }
        
        if (!TecnilandAuthConfig.VALIDATION.ACCESS_KEY_REGEX.test(accessKey)) {
            return Promise.reject({
                code: TecnilandAuthConfig.ERROR_CODES.INVALID_ACCESS_KEY,
                title: 'Clave de Acceso Inválida',
                desc: 'La clave de acceso debe tener 16 caracteres alfanuméricos.'
            })
        }
        
        try {
            const response = await this._fetch(TecnilandAuthConfig.API.REGISTER, {
                method: 'POST',
                body: JSON.stringify({ username, email, password, accessKey })
            })
            
            if (response.success) {
                logger.info(`Cuenta registrada exitosamente: ${username}`)
                
                // Auto-login después del registro
                return await this.login(username, password)
            } else {
                return Promise.reject(this._parseError(response))
            }
        } catch (err) {
            logger.error('Error en registro:', err)
            return Promise.reject(this._handleConnectionError(err))
        }
    }
    
    /**
     * Iniciar sesión con cuenta TECNILAND (API REST + Yggdrasil).
     * 
     * FLUJO DE TOKENS:
     * 1. Login REST obtiene un JWT inicial (para validaciones de cuenta)
     * 2. Yggdrasil authenticate devuelve:
     *    - accessToken: Token para lanzar Minecraft
     *    - user.token: JWT válido para API REST (/api/skins/*)
     * 3. El JWT final usado será el de Yggdrasil (user.token) si está presente
     * 
     * @param {string} username - Nombre de usuario o email
     * @param {string} password - Contraseña
     * @returns {Promise<Object>} Datos de la sesión
     */
    async login(username, password) {
        logger.info('[login] ===== INICIO LOGIN =====')
        logger.info(`[login] Usuario: ${username}`)
        
        try {
            // Paso 1: Login API REST para obtener JWT inicial
            logger.info('[login] Paso 1: Enviando request REST a', TecnilandAuthConfig.API.LOGIN)
            const restResponse = await this._fetch(TecnilandAuthConfig.API.LOGIN, {
                method: 'POST',
                body: JSON.stringify({ username, password })
            })
            
            logger.info('[login] Paso 1: Respuesta REST recibida, success:', restResponse.success)
            
            if (!restResponse.success) {
                logger.error('[login] Paso 1: Login REST fallido:', restResponse.error || restResponse.message)
                return Promise.reject(this._parseError(restResponse))
            }
            
            // JWT temporal del login REST
            this.jwtToken = restResponse.token
            this.currentUser = restResponse.user
            logger.info('[login] Paso 1: JWT REST obtenido, usuario:', this.currentUser?.username)
            
            // Paso 2: Autenticación Yggdrasil para Minecraft
            // IMPORTANTE: authenticateYggdrasil() actualizará this.jwtToken
            // con el JWT de response.user.token si está presente
            logger.info('[login] Paso 2: Iniciando autenticación Yggdrasil...')
            const yggdrasilResponse = await this.authenticateYggdrasil(username, password)
            logger.info('[login] Paso 2: Yggdrasil completado')
            
            // Si Yggdrasil no devolvió un JWT en user.token, mantener el del login REST
            // (esto asegura compatibilidad con versiones anteriores del backend)
            if (!yggdrasilResponse.user || !yggdrasilResponse.user.token) {
                logger.warn('[login] Yggdrasil no devolvió JWT en user.token, usando JWT del login REST')
            }
            
            // Paso 3: Guardar sesión (con el JWT correcto ya asignado)
            logger.info('[login] Paso 3: Guardando sesión...')
            this.saveSession()
            
            // Paso 4: Marcar sesión como validada (login exitoso = sesión válida)
            logger.info('[login] Paso 4: Marcando sessionValidated = true')
            this.sessionValidated = true
            
            // Paso 5: Agregar cuenta a ConfigManager
            logger.info('[login] Paso 5: Agregando cuenta a ConfigManager...')
            const account = this._addTecnilandAccountToConfig()
            
            logger.info('[login] ===== LOGIN EXITOSO =====')
            logger.info(`[login] Usuario: ${this.currentUser.username} (${this.currentUser.uuid})`)
            logger.info(`[login] JWT tipo: ${yggdrasilResponse.user?.token ? 'Yggdrasil' : 'REST'}`)
            logger.info(`[login] sessionValidated: ${this.sessionValidated}`)
            
            return account
            
        } catch (err) {
            logger.error('[login] ===== ERROR EN LOGIN =====')
            logger.error('[login] Error:', err)
            logger.error('[login] Error code:', err?.code)
            logger.error('[login] Error message:', err?.message)
            if (err.code) {
                return Promise.reject(err)
            }
            return Promise.reject(this._handleConnectionError(err))
        }
    }
    
    /**
     * Validar la sesión actual.
     * 
     * @returns {Promise<boolean>} True si la sesión es válida
     */
    async validateSession() {
        logger.info('[validateSession] ===== INICIO VALIDACIÓN =====')
        
        if (!this.jwtToken) {
            logger.warn('[validateSession] No hay jwtToken, sesión inválida')
            this.sessionValidated = false
            return false
        }
        
        logger.debug('[validateSession] jwtToken existe, validando con backend...')
        // SECURITY: No loguear fragmentos de tokens
        logger.debug('[validateSession] URL:', TecnilandAuthConfig.API.VALIDATE)
        
        try {
            logger.debug('[validateSession] Haciendo GET /api/auth/validate...')
            
            const response = await this._fetch(TecnilandAuthConfig.API.VALIDATE, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.jwtToken}`
                }
            })
            
            logger.debug('[validateSession] Respuesta del backend:', JSON.stringify(response))
            logger.debug('[validateSession] response.success:', response?.success)
            logger.debug('[validateSession] response.data:', response?.data)
            logger.debug('[validateSession] response.data.valid:', response?.data?.valid)
            
            // El backend responde con estructura: { success: true, data: { valid: true, user: {...} } }
            if (response.success && response.data && response.data.valid) {
                logger.info('[validateSession] JWT válido, validando token Yggdrasil...')
                
                // También validar token Yggdrasil
                const yggdrasilValid = await this.validateYggdrasilToken()
                
                logger.debug('[validateSession] Yggdrasil válido:', yggdrasilValid)
                
                if (yggdrasilValid) {
                    this.sessionValidated = true
                    logger.info('[validateSession] ✅ Sesión TECNILAND validada correctamente')
                    return true
                } else {
                    logger.warn('[validateSession] ❌ Token Yggdrasil inválido')
                }
            } else {
                logger.warn('[validateSession] ❌ Backend respondió valid=false o estructura incorrecta')
                logger.debug('[validateSession] response.success:', response?.success)
                logger.debug('[validateSession] response.data?.valid:', response?.data?.valid)
                logger.debug('[validateSession] Respuesta completa:', JSON.stringify(response))
            }
            
            // Si la validación falló, limpiar sesión
            logger.warn('[validateSession] Sesión TECNILAND inválida, limpiando...')
            this.clearSession()
            return false
        } catch (err) {
            logger.error('[validateSession] ❌ ERROR en validación')
            logger.error('[validateSession] Error tipo:', err?.constructor?.name)
            logger.error('[validateSession] Error code:', err?.code)
            logger.error('[validateSession] Error message:', err?.message)
            logger.error('[validateSession] Error completo:', err)
            
            // En caso de error de red, no limpiar la sesión pero marcar como no validada
            this.sessionValidated = false
            return false
        }
    }
    
    /**
     * Cerrar sesión.
     * 
     * @returns {Promise<void>}
     */
    async logout() {
        logger.info('Cerrando sesión TECNILAND')
        
        try {
            // Invalidar en servidor (opcional, puede fallar si offline)
            if (this.jwtToken) {
                await this._fetch(TecnilandAuthConfig.API.LOGOUT, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.jwtToken}`
                    }
                }).catch(() => {})
            }
            
            // Invalidar Yggdrasil
            if (this.yggdrasilAccessToken && this.yggdrasilClientToken) {
                await this._fetch(TecnilandAuthConfig.YGGDRASIL.INVALIDATE, {
                    method: 'POST',
                    body: JSON.stringify({
                        accessToken: this.yggdrasilAccessToken,
                        clientToken: this.yggdrasilClientToken
                    })
                }).catch(() => {})
            }
        } catch (err) {
            logger.warn('Error al invalidar tokens en servidor:', err.message)
        }
        
        // Limpiar estado local
        if (this.currentUser) {
            ConfigManager.removeAuthAccount(this.currentUser.uuid)
            ConfigManager.save()
        }
        
        this.clearSession()
        
        logger.info('Sesión cerrada')
    }
    
    // ==================== Yggdrasil (Para Minecraft) ====================
    
    /**
     * Autenticar con el servidor Yggdrasil de TECNILAND.
     * 
     * IMPORTANTE: El backend TECNILAND devuelve en la respuesta Yggdrasil:
     * - accessToken: Token de Yggdrasil (usado para lanzar Minecraft)
     * - user.token: JWT para API REST (usado para /api/skins/*)
     * 
     * @param {string} username - Nombre de usuario
     * @param {string} password - Contraseña
     * @returns {Promise<Object>} Tokens de Yggdrasil
     */
    async authenticateYggdrasil(username, password) {
        logger.info('Autenticando con Yggdrasil TECNILAND')
        
        // Generar clientToken si no existe
        if (!this.yggdrasilClientToken) {
            this.yggdrasilClientToken = crypto.randomUUID().replace(/-/g, '')
        }
        
        try {
            const response = await this._fetch(TecnilandAuthConfig.YGGDRASIL.AUTHENTICATE, {
                method: 'POST',
                body: JSON.stringify({
                    agent: {
                        name: 'Minecraft',
                        version: 1
                    },
                    username: username,
                    password: password,
                    clientToken: this.yggdrasilClientToken,
                    requestUser: true
                })
            })
            
            if (response.accessToken) {
                // Token de Yggdrasil para Minecraft
                this.yggdrasilAccessToken = response.accessToken
                this.yggdrasilClientToken = response.clientToken
                
                // Actualizar información de usuario si viene
                if (response.selectedProfile) {
                    this.currentUser = {
                        ...this.currentUser,
                        uuid: response.selectedProfile.id,
                        username: response.selectedProfile.name
                    }
                }
                
                // NUEVO: Capturar JWT para API REST desde response.user.token
                // Este JWT se usa para /api/skins/upload y /api/skins/delete
                if (response.user && response.user.token) {
                    this.jwtToken = response.user.token
                    logger.info('JWT para API REST obtenido desde Yggdrasil')
                    
                    // Opcional: Guardar expiración si viene
                    if (response.user.tokenExpiresAt) {
                        this.jwtTokenExpiresAt = response.user.tokenExpiresAt
                        logger.debug(`JWT expira en: ${response.user.tokenExpiresAt}`)
                    }
                }
                
                logger.info('Autenticación Yggdrasil exitosa')
                return response
            } else {
                throw new Error('No se recibió accessToken de Yggdrasil')
            }
        } catch (err) {
            logger.error('Error en autenticación Yggdrasil:', err)
            throw err
        }
    }
    
    /**
     * Refrescar token Yggdrasil.
     * También actualiza el JWT para API REST si viene en la respuesta.
     * 
     * @returns {Promise<boolean>} True si se refrescó exitosamente
     */
    async refreshYggdrasil() {
        if (!this.yggdrasilAccessToken || !this.yggdrasilClientToken) {
            return false
        }
        
        logger.info('Refrescando token Yggdrasil')
        
        try {
            const response = await this._fetch(TecnilandAuthConfig.YGGDRASIL.REFRESH, {
                method: 'POST',
                body: JSON.stringify({
                    accessToken: this.yggdrasilAccessToken,
                    clientToken: this.yggdrasilClientToken,
                    requestUser: true
                })
            })
            
            if (response.accessToken) {
                this.yggdrasilAccessToken = response.accessToken
                
                // Actualizar JWT si viene en la respuesta
                if (response.user && response.user.token) {
                    this.jwtToken = response.user.token
                    if (response.user.tokenExpiresAt) {
                        this.jwtTokenExpiresAt = response.user.tokenExpiresAt
                    }
                    logger.info('JWT para API REST actualizado desde refresh')
                }
                
                this.saveSession()
                this._updateAccountToken()
                logger.info('Token Yggdrasil refrescado')
                return true
            }
            
            return false
        } catch (err) {
            logger.warn('Error refrescando token Yggdrasil:', err.message)
            return false
        }
    }
    
    /**
     * Validar token Yggdrasil actual.
     * 
     * @returns {Promise<boolean>} True si el token es válido
     */
    async validateYggdrasilToken() {
        logger.debug('[validateYggdrasilToken] ===== INICIO =====')
        
        if (!this.yggdrasilAccessToken || !this.yggdrasilClientToken) {
            logger.warn('[validateYggdrasilToken] No hay tokens Yggdrasil')
            logger.debug('[validateYggdrasilToken] accessToken:', this.yggdrasilAccessToken ? 'EXISTE' : 'NULL')
            logger.debug('[validateYggdrasilToken] clientToken:', this.yggdrasilClientToken ? 'EXISTE' : 'NULL')
            return false
        }
        
        logger.debug('[validateYggdrasilToken] Tokens Yggdrasil existen, validando...')
        logger.debug('[validateYggdrasilToken] URL:', TecnilandAuthConfig.YGGDRASIL.VALIDATE)
        // SECURITY: No loguear fragmentos de tokens
        
        try {
            logger.debug('[validateYggdrasilToken] Haciendo POST /authserver/validate...')
            
            const response = await this._fetch(TecnilandAuthConfig.YGGDRASIL.VALIDATE, {
                method: 'POST',
                body: JSON.stringify({
                    accessToken: this.yggdrasilAccessToken,
                    clientToken: this.yggdrasilClientToken
                })
            })
            
            logger.debug('[validateYggdrasilToken] Respuesta:', response)
            
            // Validate devuelve 204 No Content si es válido
            const isValid = response === null || response.valid !== false
            
            logger.info('[validateYggdrasilToken] Resultado:', isValid ? '✅ VÁLIDO' : '❌ INVÁLIDO')
            
            return isValid
        } catch (err) {
            logger.warn('[validateYggdrasilToken] ❌ Error validando Yggdrasil')
            logger.warn('[validateYggdrasilToken] Error:', err?.message || err)
            logger.warn('[validateYggdrasilToken] Intentando refresh...')
            
            // Si el servidor rechaza, intentar refresh
            const refreshResult = await this.refreshYggdrasil()
            logger.info('[validateYggdrasilToken] Resultado refresh:', refreshResult ? '✅ OK' : '❌ FALLÓ')
            return refreshResult
        }
    }
    
    // ==================== Skins ====================
    
    /**
     * Subir skin al servidor TECNILAND.
     * 
     * AUTENTICACIÓN: Usa this.jwtToken (JWT obtenido de Yggdrasil user.token)
     * para autenticar con la API REST /api/skins/upload
     * 
     * @param {File|Buffer} file - Archivo de skin (PNG)
     * @param {string} model - Modelo de skin ('steve', 'alex' o 'slim')
     * @returns {Promise<Object>} Resultado de la subida
     */
    async uploadSkin(file, model = 'steve') {
        if (!this.jwtToken || !this.sessionValidated) {
            return Promise.reject({
                code: 'NOT_AUTHENTICATED',
                title: 'No Autenticado',
                desc: 'Debes iniciar sesión para subir una skin.'
            })
        }
        logger.info(`Subiendo skin (modelo: ${model})`)
        
        try {
            // Crear FormData para upload
            const formData = new FormData()
            
            if (file instanceof Buffer) {
                const blob = new Blob([file], { type: 'image/png' })
                formData.append('skin', blob, 'skin.png')
            } else {
                formData.append('skin', file)
            }
            
            formData.append('model', model)
            
            const response = await fetch(TecnilandAuthConfig.getUrl(TecnilandAuthConfig.SKINS.UPLOAD), {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.jwtToken}`
                },
                body: formData
            })
            
            const data = await response.json()
            
            if (response.ok && data.success) {
                logger.info('Skin subida exitosamente')
                return data
            } else {
                return Promise.reject(this._parseError(data))
            }
        } catch (err) {
            logger.error('Error subiendo skin:', err)
            return Promise.reject(this._handleConnectionError(err))
        }
    }
    
    /**
     * Obtener URL de skin para un UUID.
     * 
     * @param {string} uuid - UUID del jugador (opcional, usa el actual si no se especifica)
     * @returns {string} URL de la skin
     */
    getSkinUrl(uuid = null) {
        const targetUuid = uuid || (this.currentUser ? this.currentUser.uuid : null)
        if (!targetUuid) {
            return null
        }
        return TecnilandAuthConfig.getSkinUrl(targetUuid)
    }
    
    /**
     * Eliminar skin actual.
     * 
     * AUTENTICACIÓN: Usa this.jwtToken (JWT obtenido de Yggdrasil user.token)
     * para autenticar con la API REST /api/skins/delete
     * 
     * @returns {Promise<Object>} Resultado de la eliminación
     */
    async deleteSkin() {
        if (!this.jwtToken || !this.sessionValidated) {
            return Promise.reject({
                code: 'NOT_AUTHENTICATED',
                title: 'No Autenticado',
                desc: 'Debes iniciar sesión para eliminar tu skin.'
            })
        }
        
        logger.info('Eliminando skin TECNILAND')
        
        try {
            const response = await this._fetch(TecnilandAuthConfig.SKINS.DELETE, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.jwtToken}`
                }
            })
            
            if (response.success) {
                logger.info('Skin eliminada')
                return response
            } else {
                return Promise.reject(this._parseError(response))
            }
        } catch (err) {
            logger.error('Error eliminando skin:', err)
            return Promise.reject(this._handleConnectionError(err))
        }
    }
    
    // ==================== Persistencia de Sesión ====================
    
    /**
     * Guardar sesión actual en ConfigManager.
     * 
     * TOKENS GUARDADOS:
     * - jwtToken: JWT para API REST (/api/skins/*) - obtenido de Yggdrasil user.token
     * - yggdrasilAccessToken: Token para lanzar Minecraft
     * - yggdrasilClientToken: Token de cliente Yggdrasil
     */
    saveSession() {
        const sessionData = {
            jwtToken: this.jwtToken,
            jwtTokenExpiresAt: this.jwtTokenExpiresAt,
            yggdrasilAccessToken: this.yggdrasilAccessToken,
            yggdrasilClientToken: this.yggdrasilClientToken,
            user: this.currentUser,
            lastLogin: Date.now()
        }
        
        logger.debug('[saveSession] Guardando:', JSON.stringify(Object.keys(sessionData)))
        logger.debug('[saveSession] jwtToken:', this.jwtToken ? 'EXISTE' : 'NULL')
        logger.debug('[saveSession] user:', this.currentUser ? this.currentUser.username : 'NULL')
        
        ConfigManager.setTecnilandSession(sessionData)
        ConfigManager.save()
        
        logger.debug('Sesión TECNILAND guardada')
    }
    
    /**
     * Cargar sesión desde ConfigManager.
     * 
     * RESTAURA:
     * - jwtToken: JWT para API REST (necesario para /api/skins/*)
     * - yggdrasilAccessToken: Token para lanzar Minecraft
     * - yggdrasilClientToken: Token de cliente Yggdrasil
     * 
     * @returns {boolean} True si se cargó una sesión válida
     */
    loadSession() {
        logger.debug('[loadSession] Inicio - sessionLoaded:', this.sessionLoaded)
        
        if (this.sessionLoaded) {
            logger.debug('[loadSession] Sesión ya cargada, retornando:', this.currentUser !== null)
            return this.currentUser !== null
        }
        
        const sessionData = ConfigManager.getTecnilandSession()
        logger.debug('[loadSession] sessionData:', sessionData ? 'EXISTE' : 'NULL')
        
        if (sessionData) {
            logger.debug('[loadSession] jwtToken:', sessionData.jwtToken ? 'EXISTE' : 'NULL')
            logger.debug('[loadSession] user:', sessionData.user ? 'EXISTE' : 'NULL')
        }
        
        if (sessionData && sessionData.jwtToken) {
            this.jwtToken = sessionData.jwtToken
            this.jwtTokenExpiresAt = sessionData.jwtTokenExpiresAt
            this.yggdrasilAccessToken = sessionData.yggdrasilAccessToken
            this.yggdrasilClientToken = sessionData.yggdrasilClientToken
            this.currentUser = sessionData.user
            
            // Marcar sesión como NO validada hasta que validateSession() confirme
            this.sessionValidated = false
            logger.info(`Sesión TECNILAND cargada: ${this.currentUser?.username} (pendiente de validación)`)
            this.sessionLoaded = true
            return true
        }
        
        this.sessionLoaded = true
        return false
    }
    
    /**
     * Limpiar sesión local.
     */
    clearSession() {
        this.jwtToken = null
        this.jwtTokenExpiresAt = null
        this.yggdrasilAccessToken = null
        this.yggdrasilClientToken = null
        this.currentUser = null
        this.sessionValidated = false
        
        logger.debug('[clearSession] Limpiando sesión, llamando setTecnilandSession(null)')
        ConfigManager.setTecnilandSession(null)
        ConfigManager.save()
        
        logger.debug('Sesión TECNILAND limpiada')
    }
    
    /**
     * Verificar si hay una sesión activa y validada.
     * 
     * IMPORTANTE: Devuelve true solo si la sesión ha sido validada con el backend.
     * Después de loadSession(), esta función devuelve false hasta que validateSession()
     * confirme que el JWT es válido.
     * 
     * @returns {boolean}
     */
    isLoggedIn() {
        return this.currentUser !== null && this.yggdrasilAccessToken !== null && this.sessionValidated
    }
    
    /**
     * Obtener usuario actual.
     * 
     * @returns {Object|null}
     */
    getCurrentUser() {
        return this.currentUser
    }
    
    /**
     * Obtener token de acceso Yggdrasil para lanzamiento de Minecraft.
     * 
     * @returns {string|null}
     */
    getAccessToken() {
        return this.yggdrasilAccessToken
    }
    
    // ==================== Authlib-Injector ====================
    
    /**
     * Obtener ruta del JAR de authlib-injector.
     * 
     * @returns {string} Ruta absoluta del JAR
     */
    getAuthlibInjectorPath() {
        return path.join(
            ConfigManager.getCommonDirectory(),
            TecnilandAuthConfig.AUTHLIB_INJECTOR.DIRECTORY,
            TecnilandAuthConfig.AUTHLIB_INJECTOR.JAR_NAME
        )
    }
    
    /**
     * Verificar si authlib-injector está instalado.
     * 
     * @returns {boolean}
     */
    isAuthlibInjectorInstalled() {
        const exists = fs.existsSync(this.getAuthlibInjectorPath())
        
        if (!exists) {
            logger.warn('authlib-injector not found. Download it from Settings > Account > TECNILAND section.')
        }
        
        return exists
    }
    
    /**
     * Obtener argumentos JVM para authlib-injector.
     * 
     * @returns {Array<string>} Argumentos JVM
     */
    getAuthlibInjectorArgs() {
        if (!this.isLoggedIn() || !this.isAuthlibInjectorInstalled()) {
            return []
        }
        
        const injectorPath = this.getAuthlibInjectorPath()
        
        return [
            `-javaagent:${injectorPath}=${TecnilandAuthConfig.BASE_URL}`,
            '-Dauthlibinjector.side=client'
        ]
    }
    
    /**
     * Obtener prefetched metadata en base64 para authlib-injector.
     * 
     * @returns {Promise<string|null>} Metadata en base64
     */
    async getPrefetchedMetadata() {
        try {
            const response = await fetch(TecnilandAuthConfig.BASE_URL)
            const metadata = await response.json()
            return Buffer.from(JSON.stringify(metadata)).toString('base64')
        } catch (err) {
            logger.warn('No se pudo obtener metadata prefetched:', err.message)
            return null
        }
    }
    
    // ==================== Métodos Privados ====================
    
    /**
     * Realizar petición HTTP al servidor TECNILAND.
     * 
     * @private
     */
    async _fetch(endpoint, options = {}) {
        const url = TecnilandAuthConfig.getUrl(endpoint)
        
        const defaultHeaders = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
        
        const fetchOptions = {
            ...options,
            headers: {
                ...defaultHeaders,
                ...options.headers
            }
        }
        
        const response = await fetch(url, fetchOptions)
        
        // 204 No Content
        if (response.status === 204) {
            return null
        }
        
        const data = await response.json()
        
        if (!response.ok) {
            throw data
        }
        
        return data
    }
    
    /**
     * Parsear error del servidor a formato displayable.
     * 
     * @private
     */
    _parseError(errorData) {
        const errorCode = errorData.error || errorData.code || 'UNKNOWN'
        const errorMessage = errorData.message || errorData.errorMessage || 'Error desconocido'
        
        // Mapeo de códigos de error a mensajes amigables
        const errorMap = {
            'INVALID_CREDENTIALS': {
                title: 'Credenciales Inválidas',
                desc: 'El nombre de usuario o contraseña son incorrectos.'
            },
            'USERNAME_EXISTS': {
                title: 'Usuario Ya Existe',
                desc: 'Este nombre de usuario ya está en uso.'
            },
            'EMAIL_EXISTS': {
                title: 'Correo Ya Registrado',
                desc: 'Este correo electrónico ya está registrado.'
            },
            'INVALID_ACCESS_KEY': {
                title: 'Clave de Acceso Inválida',
                desc: 'La clave de acceso proporcionada no es válida o ya fue usada.'
            },
            'ACCOUNT_BANNED': {
                title: 'Cuenta Suspendida',
                desc: 'Tu cuenta ha sido suspendida. Contacta al soporte.'
            },
            'TOKEN_EXPIRED': {
                title: 'Sesión Expirada',
                desc: 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.'
            },
            'ForbiddenOperationException': {
                title: 'Credenciales Inválidas',
                desc: 'El nombre de usuario o contraseña son incorrectos.'
            }
        }
        
        const mapped = errorMap[errorCode] || {
            title: 'Error',
            desc: errorMessage
        }
        
        return {
            code: errorCode,
            ...mapped
        }
    }
    
    /**
     * Manejar errores de conexión.
     * 
     * @private
     */
    _handleConnectionError(err) {
        if (err.code === 'ECONNREFUSED') {
            return {
                code: TecnilandAuthConfig.ERROR_CODES.CONNECTION_REFUSED,
                title: 'Servidor No Disponible',
                desc: 'No se pudo conectar al servidor TECNILAND. Verifica que el servidor esté corriendo.'
            }
        }
        
        if (err.code === 'ETIMEDOUT' || err.name === 'TimeoutError') {
            return {
                code: TecnilandAuthConfig.ERROR_CODES.TIMEOUT,
                title: 'Tiempo de Espera Agotado',
                desc: 'El servidor tardó demasiado en responder. Intenta nuevamente.'
            }
        }
        
        return {
            code: TecnilandAuthConfig.ERROR_CODES.UNKNOWN,
            title: 'Error de Conexión',
            desc: err.message || 'Ocurrió un error inesperado.'
        }
    }
    
    /**
     * Agregar cuenta TECNILAND a ConfigManager.
     * 
     * @private
     */
    _addTecnilandAccountToConfig() {
        // Parámetros: uuid, accessToken, username, displayName, email, clientToken, yggdrasilToken
        const account = ConfigManager.addTecnilandAuthAccount(
            this.currentUser.uuid,                              // uuid
            this.jwtToken,                                      // accessToken (JWT para API)
            this.currentUser.username,                          // username
            this.currentUser.displayName || this.currentUser.username,  // displayName
            this.currentUser.email || null,                     // email (puede ser null si no viene del backend)
            this.yggdrasilClientToken,                          // clientToken
            this.yggdrasilAccessToken                           // yggdrasilToken (para Minecraft)
        )
        
        ConfigManager.save()
        return account
    }
    
    /**
     * Actualizar token en cuenta existente.
     * 
     * @private
     */
    _updateAccountToken() {
        if (this.currentUser) {
            ConfigManager.updateTecnilandAuthAccount(
                this.currentUser.uuid,
                {
                    accessToken: this.jwtToken,
                    yggdrasilToken: this.yggdrasilAccessToken,
                    clientToken: this.yggdrasilClientToken
                }
            )
            ConfigManager.save()
        }
    }
}

// Exportar instancia singleton
const tecnilandAuthManager = new TecnilandAuthManager()

module.exports = tecnilandAuthManager
