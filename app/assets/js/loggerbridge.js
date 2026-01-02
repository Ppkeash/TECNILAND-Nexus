/**
 * Logger Bridge
 * 
 * Puente entre el renderer process y el sistema de logging del main process.
 * Permite a las páginas del launcher escribir logs centralizados.
 */

const { ipcRenderer } = require('electron')

class LoggerBridge {

    /**
     * Log nivel INFO
     * @param {string} message Mensaje a registrar
     */
    static async info(message) {
        try {
            await ipcRenderer.invoke('logger-info', message)
        } catch(err) {
            console.error('Error al enviar log INFO:', err)
        }
    }

    /**
     * Log nivel WARN
     * @param {string} message Mensaje a registrar
     * @param {Error} error Error opcional
     */
    static async warn(message, error = null) {
        try {
            await ipcRenderer.invoke('logger-warn', message, error ? error.toString() : null)
        } catch(err) {
            console.error('Error al enviar log WARN:', err)
        }
    }

    /**
     * Log nivel ERROR
     * @param {string} message Mensaje a registrar
     * @param {Error} error Error opcional
     */
    static async error(message, error = null) {
        try {
            const errorData = error ? {
                message: error.message,
                stack: error.stack,
                name: error.name
            } : null
            await ipcRenderer.invoke('logger-error', message, errorData)
        } catch(err) {
            console.error('Error al enviar log ERROR:', err)
        }
    }

    /**
     * Obtener path del archivo de log actual
     * @returns {Promise<string>}
     */
    static async getCurrentLogPath() {
        try {
            return await ipcRenderer.invoke('logger-get-path')
        } catch(err) {
            console.error('Error al obtener path del log:', err)
            return null
        }
    }

    /**
     * Obtener path del directorio de logs
     * @returns {Promise<string>}
     */
    static async getLogDirectory() {
        try {
            return await ipcRenderer.invoke('logger-get-directory')
        } catch(err) {
            console.error('Error al obtener directorio de logs:', err)
            return null
        }
    }

    /**
     * Leer contenido del log actual
     * @returns {Promise<string>}
     */
    static async readCurrentLog() {
        try {
            return await ipcRenderer.invoke('logger-read-current')
        } catch(err) {
            console.error('Error al leer log actual:', err)
            return ''
        }
    }
}

module.exports = LoggerBridge
