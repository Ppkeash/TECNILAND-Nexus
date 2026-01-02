/**
 * LoggerUtil
 * 
 * Sistema de logging para el launcher que captura:
 * - Eventos del launcher (inicio, errores, operaciones)
 * - Separado del log de Minecraft
 * - Archivos de log con rotación automática
 * - Niveles: INFO, WARN, ERROR, DEBUG
 */

const fs = require('fs-extra')
const path = require('path')
const { app } = require('electron')

class LoggerUtil {

    constructor() {
        // Obtener directorio de logs del launcher
        const dataPath = app ? app.getPath('userData') : path.join(process.env.APPDATA || process.env.HOME, '.tecnilandnexus')
        this.logDir = path.join(dataPath, 'launcher-logs')
        this.currentLogFile = null
        this.sessionStartTime = new Date()
        
        // Asegurar que el directorio existe
        this._ensureLogDir()
        
        // Crear archivo de log para esta sesión
        this._createSessionLog()
        
        // Limpiar logs antiguos (mantener últimos 10)
        this._cleanOldLogs()
    }

    /**
     * Asegurar que el directorio de logs existe
     */
    _ensureLogDir() {
        try {
            fs.ensureDirSync(this.logDir)
        } catch(err) {
            console.error('Error al crear directorio de logs:', err)
        }
    }

    /**
     * Crear archivo de log para la sesión actual
     */
    _createSessionLog() {
        const timestamp = this._getFileTimestamp()
        const filename = `launcher_${timestamp}.log`
        this.currentLogFile = path.join(this.logDir, filename)
        
        try {
            const header = this._generateHeader()
            fs.writeFileSync(this.currentLogFile, header, 'utf8')
        } catch(err) {
            console.error('Error al crear archivo de log:', err)
        }
    }

    /**
     * Generar header del archivo de log
     */
    _generateHeader() {
        const separator = '═'.repeat(70)
        return `${separator}
  TECNILAND NEXUS - Launcher Logs
  Session Started: ${this.sessionStartTime.toISOString()}
  Platform: ${process.platform}
  Electron: ${process.versions.electron}
  Node: ${process.versions.node}
${separator}

`
    }

    /**
     * Obtener timestamp para nombre de archivo
     */
    _getFileTimestamp() {
        const now = new Date()
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, '0')
        const day = String(now.getDate()).padStart(2, '0')
        const hour = String(now.getHours()).padStart(2, '0')
        const minute = String(now.getMinutes()).padStart(2, '0')
        const second = String(now.getSeconds()).padStart(2, '0')
        return `${year}${month}${day}_${hour}${minute}${second}`
    }

    /**
     * Obtener timestamp para mensaje de log
     */
    _getMessageTimestamp() {
        const now = new Date()
        const hours = String(now.getHours()).padStart(2, '0')
        const minutes = String(now.getMinutes()).padStart(2, '0')
        const seconds = String(now.getSeconds()).padStart(2, '0')
        const ms = String(now.getMilliseconds()).padStart(3, '0')
        return `${hours}:${minutes}:${seconds}.${ms}`
    }

    /**
     * Escribir mensaje al log
     */
    _writeLog(level, message, error = null) {
        if (!this.currentLogFile) return

        const timestamp = this._getMessageTimestamp()
        const levelPadded = level.padEnd(5, ' ')
        let logMessage = `[${timestamp}] [${levelPadded}] ${message}\n`
        
        // Si hay un error, agregar stacktrace
        if (error && error.stack) {
            logMessage += `${error.stack}\n`
        } else if (error) {
            logMessage += `Error: ${JSON.stringify(error, null, 2)}\n`
        }

        try {
            fs.appendFileSync(this.currentLogFile, logMessage, 'utf8')
            
            // También imprimir en consola para desarrollo
            const consoleMethod = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'
            console[consoleMethod](`[${level}]`, message, error || '')
        } catch(err) {
            console.error('Error al escribir log:', err)
        }
    }

    /**
     * Limpiar logs antiguos (mantener últimos 10)
     */
    _cleanOldLogs() {
        try {
            const files = fs.readdirSync(this.logDir)
                .filter(f => f.startsWith('launcher_') && f.endsWith('.log'))
                .map(f => ({
                    name: f,
                    path: path.join(this.logDir, f),
                    time: fs.statSync(path.join(this.logDir, f)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time) // Más recientes primero

            // Eliminar archivos más allá de los 10 más recientes
            if (files.length > 10) {
                files.slice(10).forEach(file => {
                    try {
                        fs.unlinkSync(file.path)
                        this.info(`Log antiguo eliminado: ${file.name}`)
                    } catch(err) {
                        this.error('Error al eliminar log antiguo', err)
                    }
                })
            }
        } catch(err) {
            console.error('Error al limpiar logs antiguos:', err)
        }
    }

    /**
     * Log nivel INFO
     */
    info(message) {
        this._writeLog('INFO', message)
    }

    /**
     * Log nivel WARN
     */
    warn(message, error = null) {
        this._writeLog('WARN', message, error)
    }

    /**
     * Log nivel ERROR
     */
    error(message, error = null) {
        this._writeLog('ERROR', message, error)
    }

    /**
     * Log nivel DEBUG
     */
    debug(message) {
        this._writeLog('DEBUG', message)
    }

    /**
     * Escribir separador en el log
     */
    separator(title = null) {
        const separator = '─'.repeat(70)
        if (title) {
            const message = ` ${title} `
            const leftPad = Math.floor((70 - message.length) / 2)
            const rightPad = 70 - message.length - leftPad
            this._writeLog('INFO', '─'.repeat(leftPad) + message + '─'.repeat(rightPad))
        } else {
            this._writeLog('INFO', separator)
        }
    }

    /**
     * Obtener path del archivo de log actual
     */
    getCurrentLogPath() {
        return this.currentLogFile
    }

    /**
     * Obtener path del directorio de logs
     */
    getLogDirectory() {
        return this.logDir
    }

    /**
     * Escribir footer al cerrar la sesión
     */
    closeSession() {
        const sessionEnd = new Date()
        const duration = Math.round((sessionEnd - this.sessionStartTime) / 1000)
        const separator = '═'.repeat(70)
        
        const footer = `
${separator}
  Session Ended: ${sessionEnd.toISOString()}
  Session Duration: ${duration} seconds
${separator}
`
        try {
            fs.appendFileSync(this.currentLogFile, footer, 'utf8')
        } catch(err) {
            console.error('Error al escribir footer del log:', err)
        }
    }
}

// Singleton instance
let loggerInstance = null

function getLogger() {
    if (!loggerInstance) {
        loggerInstance = new LoggerUtil()
    }
    return loggerInstance
}

module.exports = {
    getLogger,
    LoggerUtil
}
