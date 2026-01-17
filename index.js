const remoteMain = require('@electron/remote/main')
remoteMain.initialize()

// Requirements
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron')
const autoUpdater                       = require('electron-updater').autoUpdater
const ejse                              = require('ejs-electron')
const fs                                = require('fs')
const isDev                             = require('./app/assets/js/isdev')
const path                              = require('path')
const semver                            = require('semver')
const { pathToFileURL }                 = require('url')
const { AZURE_CLIENT_ID, MSFT_OPCODE, MSFT_REPLY_TYPE, MSFT_ERROR, SHELL_OPCODE } = require('./app/assets/js/ipcconstants')
const LangLoader                        = require('./app/assets/js/langloader')
const VersionAPI                        = require('./app/assets/js/versionapi')
const { getLogger }                     = require('./app/assets/js/loggerutil')

// Initialize logger
const logger = getLogger()
logger.info('TECNILAND NEXUS launcher iniciado')
logger.info(`Versión: ${app ? app.getVersion() : 'unknown'}`)
logger.info(`Modo desarrollo: ${isDev}`)

// Setup Lang for main process (without ConfigManager)
LangLoader.setupLanguageMain()
logger.info('Sistema de idiomas inicializado')

// Initialize version cache in background
VersionAPI.initializeCache().catch(err => {
    logger.error('Error al inicializar caché de versiones', err)
    console.error('Error al inicializar caché de versiones:', err)
})

// =====================================================
// AUTO UPDATER - FIX v1.0.5: Refactorización completa
// =====================================================

// Referencia global al webContents para enviar eventos de actualización
let autoUpdaterWebContents = null
let autoUpdaterInitialized = false

/**
 * Enviar notificación al renderer de forma segura
 */
function sendAutoUpdateNotification(channel, ...args) {
    if (autoUpdaterWebContents && !autoUpdaterWebContents.isDestroyed()) {
        autoUpdaterWebContents.send(channel, ...args)
    } else {
        logger.warn('AutoUpdater: No hay webContents válido para enviar notificación')
    }
}

/**
 * Inicializar el auto-updater (solo una vez)
 */
function initAutoUpdater(event, data) {
    // Guardar referencia al webContents
    autoUpdaterWebContents = event.sender
    
    // Si ya está inicializado, solo actualizar referencia y retornar
    if (autoUpdaterInitialized) {
        logger.debug('AutoUpdater: Ya inicializado, actualizando webContents')
        return
    }

    if(data){
        autoUpdater.allowPrerelease = true
    } else {
        // Defaults to true if application version contains prerelease components
    }
    
    if(isDev){
        autoUpdater.autoInstallOnAppQuit = false
        autoUpdater.updateConfigPath = path.join(__dirname, 'dev-app-update.yml')
    }
    
    // Desactivar autoDownload en TODAS las plataformas
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    
    // ===============================
    // EVENTOS DEL AUTO-UPDATER
    // ===============================
    
    autoUpdater.on('checking-for-update', () => {
        logger.info('AutoUpdater: Verificando actualizaciones...')
        sendAutoUpdateNotification('autoUpdateNotification', 'checking-for-update')
    })
    
    autoUpdater.on('update-available', (info) => {
        logger.info(`AutoUpdater: Nueva actualización disponible: ${info.version}`)
        sendAutoUpdateNotification('autoUpdateNotification', 'update-available', info)
    })
    
    autoUpdater.on('update-not-available', (info) => {
        logger.info('AutoUpdater: No hay actualizaciones disponibles')
        sendAutoUpdateNotification('autoUpdateNotification', 'update-not-available', info)
    })
    
    autoUpdater.on('download-progress', (progressObj) => {
        // Log detallado para debugging
        logger.info(`AutoUpdater: Progreso descarga: ${progressObj.percent.toFixed(1)}% ` +
            `(${formatBytes(progressObj.transferred)}/${formatBytes(progressObj.total)}) ` +
            `@ ${formatBytes(progressObj.bytesPerSecond)}/s`)
        sendAutoUpdateNotification('autoUpdateNotification', 'download-progress', progressObj)
    })
    
    autoUpdater.on('update-downloaded', (info) => {
        logger.info(`AutoUpdater: Actualización ${info.version} descargada y lista para instalar`)
        sendAutoUpdateNotification('autoUpdateNotification', 'update-downloaded', info)
    })
    
    autoUpdater.on('error', (err) => {
        logger.error('AutoUpdater: Error:', err.message || err)
        logger.error('AutoUpdater: Stack:', err.stack || 'no stack')
        sendAutoUpdateNotification('autoUpdateNotification', 'realerror', {
            message: err.message || String(err),
            code: err.code || 'UNKNOWN_ERROR'
        })
    })
    
    autoUpdaterInitialized = true
    logger.info('AutoUpdater: Inicializado correctamente')
}

// Helper para formatear bytes
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

// Open channel to listen for update actions.
ipcMain.on('autoUpdateAction', (event, arg, data, data2) => {
    // Actualizar webContents en cada mensaje para mantener referencia válida
    autoUpdaterWebContents = event.sender
    
    logger.debug(`AutoUpdater IPC: Recibido "${arg}"`)
    
    switch(arg){
        case 'initAutoUpdater':
            logger.info('AutoUpdater: Inicializando sistema de actualizaciones')
            initAutoUpdater(event, data)
            sendAutoUpdateNotification('autoUpdateNotification', 'ready')
            break
            
        case 'checkForUpdate':
            logger.info('AutoUpdater: Verificando actualizaciones disponibles...')
            autoUpdater.checkForUpdates()
                .then(result => {
                    if (result) {
                        logger.info(`AutoUpdater: Resultado de checkForUpdates: ${JSON.stringify({
                            updateInfo: result.updateInfo ? result.updateInfo.version : 'none',
                            cancellationToken: !!result.cancellationToken
                        })}`)
                    }
                })
                .catch(err => {
                    logger.error('AutoUpdater: Error al verificar actualizaciones:', err.message || err)
                    sendAutoUpdateNotification('autoUpdateNotification', 'realerror', {
                        message: err.message || String(err),
                        code: err.code || 'CHECK_UPDATE_ERROR'
                    })
                })
            break
            
        case 'downloadUpdate':
            logger.info('AutoUpdater: ======================================')
            logger.info('AutoUpdater: Usuario solicitó descarga manual')
            logger.info('AutoUpdater: Ejecutando autoUpdater.downloadUpdate()...')
            logger.info('AutoUpdater: ======================================')
            
            // Notificar al renderer que comenzamos
            sendAutoUpdateNotification('autoUpdateNotification', 'download-progress', {
                percent: 0,
                transferred: 0,
                total: 0,
                bytesPerSecond: 0
            })
            
            autoUpdater.downloadUpdate()
                .then(downloadedFiles => {
                    logger.info(`AutoUpdater: downloadUpdate() COMPLETADO`)
                    logger.info(`AutoUpdater: Archivos descargados: ${JSON.stringify(downloadedFiles)}`)
                })
                .catch(err => {
                    logger.error('AutoUpdater: ERROR en downloadUpdate():')
                    logger.error('AutoUpdater: Mensaje:', err.message || err)
                    logger.error('AutoUpdater: Código:', err.code || 'SIN_CODIGO')
                    logger.error('AutoUpdater: Stack:', err.stack || 'sin stack')
                    sendAutoUpdateNotification('autoUpdateNotification', 'realerror', {
                        message: err.message || String(err),
                        code: err.code || 'DOWNLOAD_ERROR'
                    })
                })
            break
            
        case 'installUpdateNow':
            logger.info('AutoUpdater: Instalando actualización y reiniciando launcher...')
            autoUpdater.quitAndInstall()
            break
            
        case 'allowPrereleaseChange':
            if(!data){
                const preRelComp = semver.prerelease(app.getVersion())
                if(preRelComp != null && preRelComp.length > 0){
                    autoUpdater.allowPrerelease = true
                } else {
                    autoUpdater.allowPrerelease = data
                }
            } else {
                autoUpdater.allowPrerelease = data
            }
            logger.debug(`AutoUpdater: allowPrerelease cambiado a ${autoUpdater.allowPrerelease}`)
            break
            
        case 'showRestartDialog':
            dialog.showMessageBox({
                type: 'info',
                title: data,
                message: data2,
                buttons: ['OK']
            })
            break
            
        default:
            logger.warn(`AutoUpdater: Acción desconocida: ${arg}`)
            break
    }
})
// Redirect distribution index event from preloader to renderer.
ipcMain.on('distributionIndexDone', (event, res) => {
    event.sender.send('distributionIndexDone', res)
})

// Handle trash item.
ipcMain.handle(SHELL_OPCODE.TRASH_ITEM, async (event, ...args) => {
    try {
        logger.info(`Moviendo a papelera: ${args[0]}`)
        await shell.trashItem(args[0])
        return {
            result: true
        }
    } catch(error) {
        logger.error(`Error al mover a papelera: ${args[0]}`, error)
        return {
            result: false,
            error: error
        }
    }
})

// IPC handlers para el sistema de logging
ipcMain.handle('logger-get-path', () => {
    return logger.getCurrentLogPath()
})

ipcMain.handle('logger-get-directory', () => {
    return logger.getLogDirectory()
})

ipcMain.handle('logger-read-current', () => {
    try {
        const logPath = logger.getCurrentLogPath()
        if (fs.existsSync(logPath)) {
            return fs.readFileSync(logPath, 'utf8')
        }
        return ''
    } catch(error) {
        logger.error('Error al leer log actual', error)
        return ''
    }
})

ipcMain.handle('logger-info', (event, message) => {
    logger.info(message)
})

ipcMain.handle('logger-warn', (event, message, error) => {
    logger.warn(message, error)
})

ipcMain.handle('logger-error', (event, message, error) => {
    logger.error(message, error)
})

// Disable hardware acceleration.
// https://electronjs.org/docs/tutorial/offscreen-rendering
app.disableHardwareAcceleration()


const REDIRECT_URI_PREFIX = 'https://login.microsoftonline.com/common/oauth2/nativeclient?'

// Microsoft Auth Login
let msftAuthWindow
let msftAuthSuccess
let msftAuthViewSuccess
let msftAuthViewOnClose
ipcMain.on(MSFT_OPCODE.OPEN_LOGIN, (ipcEvent, ...arguments_) => {
    if (msftAuthWindow) {
        ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.ALREADY_OPEN, msftAuthViewOnClose)
        return
    }
    msftAuthSuccess = false
    msftAuthViewSuccess = arguments_[0]
    msftAuthViewOnClose = arguments_[1]
    msftAuthWindow = new BrowserWindow({
        title: LangLoader.queryJS('index.microsoftLoginTitle'),
        backgroundColor: '#222222',
        width: 520,
        height: 600,
        frame: true,
        icon: getPlatformIcon('tecniland')
    })

    msftAuthWindow.on('closed', () => {
        msftAuthWindow = undefined
    })

    msftAuthWindow.on('close', () => {
        if(!msftAuthSuccess) {
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.NOT_FINISHED, msftAuthViewOnClose)
        }
    })

    msftAuthWindow.webContents.on('did-navigate', (_, uri) => {
        if (uri.startsWith(REDIRECT_URI_PREFIX)) {
            let queries = uri.substring(REDIRECT_URI_PREFIX.length).split('#', 1).toString().split('&')
            let queryMap = {}

            queries.forEach(query => {
                const [name, value] = query.split('=')
                queryMap[name] = decodeURI(value)
            })

            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.SUCCESS, queryMap, msftAuthViewSuccess)

            msftAuthSuccess = true
            msftAuthWindow.close()
            msftAuthWindow = null
        }
    })

    msftAuthWindow.removeMenu()
    msftAuthWindow.loadURL(`https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?prompt=select_account&client_id=${AZURE_CLIENT_ID}&response_type=code&scope=XboxLive.signin%20offline_access&redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient`)
})

// Microsoft Auth Logout
let msftLogoutWindow
let msftLogoutSuccess
let msftLogoutSuccessSent
ipcMain.on(MSFT_OPCODE.OPEN_LOGOUT, (ipcEvent, uuid, isLastAccount) => {
    if (msftLogoutWindow) {
        ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.ALREADY_OPEN)
        return
    }

    msftLogoutSuccess = false
    msftLogoutSuccessSent = false
    msftLogoutWindow = new BrowserWindow({
        title: LangLoader.queryJS('index.microsoftLogoutTitle'),
        backgroundColor: '#222222',
        width: 520,
        height: 600,
        frame: true,
        icon: getPlatformIcon('tecniland')
    })

    msftLogoutWindow.on('closed', () => {
        msftLogoutWindow = undefined
    })

    msftLogoutWindow.on('close', () => {
        if(!msftLogoutSuccess) {
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.NOT_FINISHED)
        } else if(!msftLogoutSuccessSent) {
            msftLogoutSuccessSent = true
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.SUCCESS, uuid, isLastAccount)
        }
    })
    
    msftLogoutWindow.webContents.on('did-navigate', (_, uri) => {
        if(uri.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/logoutsession')) {
            msftLogoutSuccess = true
            setTimeout(() => {
                if(!msftLogoutSuccessSent) {
                    msftLogoutSuccessSent = true
                    ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.SUCCESS, uuid, isLastAccount)
                }

                if(msftLogoutWindow) {
                    msftLogoutWindow.close()
                    msftLogoutWindow = null
                }
            }, 5000)
        }
    })
    
    msftLogoutWindow.removeMenu()
    msftLogoutWindow.loadURL('https://login.microsoftonline.com/common/oauth2/v2.0/logout')
})

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

function createWindow() {

    win = new BrowserWindow({
        width: 980,
        height: 552,
        icon: getPlatformIcon('tecniland'),
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'app', 'assets', 'js', 'preloader.js'),
            nodeIntegration: true,
            contextIsolation: false
        },
        backgroundColor: '#171614'
    })
    remoteMain.enable(win.webContents)

    const data = {
        bkid: Math.floor((Math.random() * fs.readdirSync(path.join(__dirname, 'app', 'assets', 'images', 'backgrounds')).length)),
        lang: (str, placeHolders) => LangLoader.queryEJS(str, placeHolders)
    }
    Object.entries(data).forEach(([key, val]) => ejse.data(key, val))

    win.loadURL(pathToFileURL(path.join(__dirname, 'app', 'app.ejs')).toString())

    /*win.once('ready-to-show', () => {
        win.show()
    })*/

    win.removeMenu()

    win.resizable = true

    win.on('closed', () => {
        win = null
    })
}

function createMenu() {
    
    if(process.platform === 'darwin') {

        // Extend default included application menu to continue support for quit keyboard shortcut
        let applicationSubMenu = {
            label: 'Application',
            submenu: [{
                label: 'About Application',
                selector: 'orderFrontStandardAboutPanel:'
            }, {
                type: 'separator'
            }, {
                label: 'Quit',
                accelerator: 'Command+Q',
                click: () => {
                    app.quit()
                }
            }]
        }

        // New edit menu adds support for text-editing keyboard shortcuts
        let editSubMenu = {
            label: 'Edit',
            submenu: [{
                label: 'Undo',
                accelerator: 'CmdOrCtrl+Z',
                selector: 'undo:'
            }, {
                label: 'Redo',
                accelerator: 'Shift+CmdOrCtrl+Z',
                selector: 'redo:'
            }, {
                type: 'separator'
            }, {
                label: 'Cut',
                accelerator: 'CmdOrCtrl+X',
                selector: 'cut:'
            }, {
                label: 'Copy',
                accelerator: 'CmdOrCtrl+C',
                selector: 'copy:'
            }, {
                label: 'Paste',
                accelerator: 'CmdOrCtrl+V',
                selector: 'paste:'
            }, {
                label: 'Select All',
                accelerator: 'CmdOrCtrl+A',
                selector: 'selectAll:'
            }]
        }

        // Bundle submenus into a single template and build a menu object with it
        let menuTemplate = [applicationSubMenu, editSubMenu]
        let menuObject = Menu.buildFromTemplate(menuTemplate)

        // Assign it to the application
        Menu.setApplicationMenu(menuObject)

    }

}

function getPlatformIcon(filename){
    let ext
    switch(process.platform) {
        case 'win32':
            ext = 'ico'
            break
        case 'darwin':
        case 'linux':
        default:
            ext = 'png'
            break
    }

    return path.join(__dirname, 'app', 'assets', 'images', 'icons', `${filename}.${ext}`)
}

// App ready event
app.on('ready', () => {
    logger.info('Aplicación Electron lista, creando ventana principal')
    createWindow()
    createMenu()
})

// All windows closed event
app.on('window-all-closed', () => {
    logger.info('Todas las ventanas cerradas')
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        logger.info('Cerrando aplicación')
        logger.closeSession()
        app.quit()
    }
})

// App activate event (macOS)
app.on('activate', () => {
    logger.info('Reactivando aplicación en macOS')
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
        createWindow()
    }
})

// Capturar errores no manejados
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', error)
    console.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', reason)
    console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})