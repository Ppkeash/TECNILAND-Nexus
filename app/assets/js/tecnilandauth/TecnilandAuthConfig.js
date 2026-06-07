/**
 * TecnilandAuthConfig
 * 
 * Configuración de endpoints y constantes para el sistema de autenticación TECNILAND.
 * 
 * @module tecnilandauth/TecnilandAuthConfig
 */

const isDev = require('../isdev')

// SECURITY: URLs configurables por entorno
// Producción: Backend en Fly.io (São Paulo, Brasil)
// Desarrollo: localhost para testing local
const getBaseUrl = () => {
    // Primero intentar variable de entorno
    if (process.env.TECNILAND_AUTH_URL) {
        return process.env.TECNILAND_AUTH_URL
    }
    // En desarrollo, usar localhost con HTTP
    if (isDev) {
        return 'http://localhost:3000'
    }
    // En producción: Fly.io backend (HTTPS obligatorio)
    return 'https://tecniland-backend.fly.dev'
}

const getRegisterUrl = () => {
    if (process.env.TECNILAND_REGISTER_URL) {
        return process.env.TECNILAND_REGISTER_URL
    }
    if (isDev) {
        return 'http://localhost:3001/'
    }
    // Frontend oficial: tecnilandnex.online
    return 'https://tecnilandnex.online/'
}

const TecnilandAuthConfig = {
    // URL base del servidor de autenticación TECNILAND
    // SECURITY: Configurado dinámicamente según entorno
    get BASE_URL() {
        return getBaseUrl()
    },
    
    // URL de registro (página web externa)
    // El registro se hace desde la web, no desde el launcher
    get REGISTER_URL() {
        return getRegisterUrl()
    },
    
    // Endpoints de API REST (para gestión de cuenta)
    API: {
        REGISTER: '/api/auth/register',
        LOGIN: '/api/auth/login',
        VALIDATE: '/api/auth/validate',
        LOGOUT: '/api/auth/logout',
        PROFILE: '/api/auth/profile',
        CHANGE_PASSWORD: '/api/auth/change-password'
    },
    
    // Endpoints Yggdrasil (para autenticación de Minecraft)
    YGGDRASIL: {
        AUTHENTICATE: '/authserver/authenticate',
        REFRESH: '/authserver/refresh',
        VALIDATE: '/authserver/validate',
        INVALIDATE: '/authserver/invalidate',
        SIGNOUT: '/authserver/signout'
    },
    
    // Session server (para validación de skins)
    SESSION: {
        JOIN: '/sessionserver/session/minecraft/join',
        HAS_JOINED: '/sessionserver/session/minecraft/hasJoined',
        PROFILE: '/sessionserver/session/minecraft/profile'
    },
    
    // Endpoints de Skins
    SKINS: {
        UPLOAD: '/api/skins/upload',
        GET: '/api/skins',         // Agregar /:uuid.png
        DELETE: '/api/skins/delete'
    },
    
    // Configuración de authlib-injector
    AUTHLIB_INJECTOR: {
        // URL de descarga del JAR
        DOWNLOAD_URL: 'https://authlib-injector.yushi.moe/artifact/latest.json',
        // Nombre del archivo JAR
        JAR_NAME: 'authlib-injector.jar',
        // Directorio relativo donde se guarda
        DIRECTORY: 'libraries/authlib-injector'
    },
    
    // Configuración de sesión
    SESSION_CONFIG: {
        // Tiempo de expiración del token JWT (en ms) - 24 horas
        JWT_EXPIRY_MS: 24 * 60 * 60 * 1000,
        // Tiempo de expiración del token Yggdrasil (en ms) - 7 días
        YGGDRASIL_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000,
        // Tiempo antes de expiración para refrescar (en ms) - 1 hora
        REFRESH_THRESHOLD_MS: 60 * 60 * 1000
    },
    
    // Códigos de error
    ERROR_CODES: {
        // Errores de conexión
        CONNECTION_REFUSED: 'ECONNREFUSED',
        TIMEOUT: 'ETIMEDOUT',
        
        // Errores de autenticación
        INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
        INVALID_TOKEN: 'INVALID_TOKEN',
        TOKEN_EXPIRED: 'TOKEN_EXPIRED',
        ACCOUNT_BANNED: 'ACCOUNT_BANNED',
        
        // Errores de registro
        USERNAME_EXISTS: 'USERNAME_EXISTS',
        EMAIL_EXISTS: 'EMAIL_EXISTS',
        INVALID_ACCESS_KEY: 'INVALID_ACCESS_KEY',
        INVALID_USERNAME: 'INVALID_USERNAME',
        INVALID_EMAIL: 'INVALID_EMAIL',
        WEAK_PASSWORD: 'WEAK_PASSWORD',
        
        // Errores de skin
        INVALID_SKIN_FORMAT: 'INVALID_SKIN_FORMAT',
        SKIN_TOO_LARGE: 'SKIN_TOO_LARGE',
        
        // Errores generales
        SERVER_ERROR: 'SERVER_ERROR',
        UNKNOWN: 'UNKNOWN'
    },
    
    // Validaciones
    VALIDATION: {
        // Nombre de usuario: 3-16 caracteres, alfanumérico y guiones bajos
        USERNAME_REGEX: /^[a-zA-Z0-9_]{3,16}$/,
        // Email básico
        EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        // Contraseña: mínimo 6 caracteres
        PASSWORD_MIN_LENGTH: 6,
        // Access key: 16 caracteres alfanuméricos
        ACCESS_KEY_REGEX: /^[A-Za-z0-9]{16}$/,
        // Tamaño máximo de skin (en bytes) - 64KB
        MAX_SKIN_SIZE: 64 * 1024,
        // Dimensiones válidas de skin
        VALID_SKIN_DIMENSIONS: [
            { width: 64, height: 32 },  // Skin legacy
            { width: 64, height: 64 }   // Skin moderna
        ]
    },
    
    /**
     * Obtiene la URL completa de un endpoint
     * @param {string} endpoint - Ruta del endpoint
     * @returns {string} URL completa
     */
    getUrl(endpoint) {
        return `${this.BASE_URL}${endpoint}`
    },
    
    /**
     * Obtiene la URL de skin para un UUID
     * @param {string} uuid - UUID del jugador
     * @returns {string} URL de la skin
     */
    getSkinUrl(uuid) {
        return `${this.BASE_URL}${this.SKINS.GET}/${uuid}.png`
    },
    
    /**
     * Obtiene la URL de perfil de session server
     * @param {string} uuid - UUID del jugador
     * @param {boolean} unsigned - Si incluir firma
     * @returns {string} URL del perfil
     */
    getProfileUrl(uuid, unsigned = true) {
        return `${this.BASE_URL}${this.SESSION.PROFILE}/${uuid}?unsigned=${unsigned}`
    }
}

module.exports = TecnilandAuthConfig
