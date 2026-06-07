/**
 * TecnilandAuthUI
 * 
 * Controlador de UI para el sistema de autenticación TECNILAND.
 * Maneja overlays de login/registro y actualización de interfaz.
 * 
 * @module tecnilandauth/TecnilandAuthUI
 */

/* global document, window, setOverlayContent, setOverlayHandler, toggleOverlay, setSelectedAccount, updateSelectedAccount */

const TecnilandAuthManager = require('./TecnilandAuthManager')
const TecnilandAuthConfig = require('./TecnilandAuthConfig')
const { LoggerUtil } = require('helios-core')
const ConfigManager = require('../configmanager')

const logger = LoggerUtil.getLogger('TecnilandAuthUI')

class TecnilandAuthUI {
    
    constructor() {
        this.overlayVisible = false
        this.currentTab = 'login' // 'login' o 'register'
        this.onLoginSuccess = null
        this.onLoginCancel = null
        this.initialized = false
        this.modalEventsBound = false // Flag para vincular eventos del modal una sola vez
    }
    
    /**
     * Inicializar eventos de UI.
     * Llamar después de que el DOM esté cargado.
     */
    init() {
        logger.info('[init] ======= TecnilandAuthUI.init() LLAMADO =======')
        
        if (this.initialized) {
            logger.info('[init] Ya inicializado, saltando (initialized = true)')
            return
        }
        
        logger.info('[init] Primera inicialización - ejecutando bindEvents y initializeState...')
        this._bindEvents()
        this._initializeState()
        
        this.initialized = true
        logger.info('[init] ======= TecnilandAuthUI INICIALIZADO CORRECTAMENTE =======')
    }
    
    /**
     * Mostrar overlay de login TECNILAND.
     * Usa un modal overlay independiente que NO afecta la navegación actual.
     * 
     * @param {Function} onSuccess - Callback cuando login es exitoso
     * @param {Function} onCancel - Callback cuando se cancela
     */
    showLoginOverlay(onSuccess = null, onCancel = null) {
        this.onLoginSuccess = onSuccess
        this.onLoginCancel = onCancel
        
        // Usar el modal overlay independiente (NO el loginContainer)
        const overlay = document.getElementById('tecnilandAuthOverlay')
        
        if (overlay) {
            overlay.style.display = 'flex'
            this.overlayVisible = true
            this._clearForms()
            this._hideAllErrors()
            
            // Vincular eventos del modal si aún no se han vinculado
            // (Esto resuelve el problema de timing donde el DOM del modal no existe al inicio)
            if (!this.modalEventsBound) {
                logger.info('[showLoginOverlay] Vinculando eventos del modal por primera vez...')
                this._bindModalEvents()
                this.modalEventsBound = true
            }
            
            // Focus en el primer campo
            setTimeout(() => {
                const usernameInput = document.getElementById('tecnilandAuthModalUsername')
                if (usernameInput) usernameInput.focus()
            }, 100)
            
            logger.info('Modal overlay TECNILAND mostrado')
        } else {
            logger.error('No se encontró el overlay tecnilandAuthOverlay')
        }
    }
    
    /**
     * Ocultar overlay de login.
     * Solo oculta el modal, NO afecta la navegación ni la sesión actual.
     */
    hideLoginOverlay() {
        const overlay = document.getElementById('tecnilandAuthOverlay')
        
        if (overlay) {
            overlay.style.display = 'none'
        }
        
        this.overlayVisible = false
        this._clearForms()
        this._hideAllErrors()
        
        logger.info('Modal overlay TECNILAND ocultado')
    }
    
    /**
     * Actualizar UI según estado de sesión.
     */
    async updateUIState() {
        const isLoggedIn = TecnilandAuthManager.isLoggedIn()
        const user = TecnilandAuthManager.getCurrentUser()
        
        // Actualizar elementos en settings
        this._updateSettingsPanel(isLoggedIn, user)
        
        // Actualizar elementos en landing (si existen)
        this._updateLandingElements(isLoggedIn, user)
    }
    
    /**
     * Refrescar avatar del usuario en toda la UI.
     * Actualiza:
     * - Elementos con clase .tecniland-account-avatar (settings, account panels)
     * - #avatarContainer del landing page (esquina superior derecha)
     * - #tecnilandAccountAvatar del panel de cuenta en settings
     * 
     * @param {string} uuid - UUID del usuario (opcional)
     */
    refreshAvatar(uuid = null) {
        const timestamp = Date.now()
        const skinUrl = TecnilandAuthManager.getSkinUrl(uuid)
        const fallbackUrl = './assets/images/icons/profile.svg'
        
        logger.debug(`[refreshAvatar] Refrescando avatar para UUID: ${uuid}, URL: ${skinUrl}`)
        
        // 1. Actualizar elementos con clase .tecniland-account-avatar
        const avatarElements = document.querySelectorAll('.tecniland-account-avatar')
        avatarElements.forEach(el => {
            if (skinUrl) {
                el.src = `${skinUrl}?t=${timestamp}`
                el.onerror = () => {
                    el.src = fallbackUrl
                }
            } else {
                el.src = fallbackUrl
            }
        })
        
        // 2. Actualizar el avatar del landing page (#avatarContainer)
        //    Este es el icono en la esquina superior derecha de la UI principal
        const avatarContainer = document.getElementById('avatarContainer')
        if (avatarContainer) {
            const selectedAccount = ConfigManager.getSelectedAccount()
            // Actualizar SIEMPRE si el UUID coincide con la cuenta seleccionada
            // Esto asegura que el avatar se actualice inmediatamente después de upload
            if (selectedAccount && selectedAccount.type === 'tecniland' && (!uuid || selectedAccount.uuid === uuid)) {
                // Guardar data attribute para uso posterior (3D o 2D)
                avatarContainer.setAttribute('data-skin-url', skinUrl ? `${skinUrl}?t=${timestamp}` : '')
                
                // Verificar si el modo 3D está activo
                const is3DActive = avatarContainer.classList.contains('skinviewer3d-active')
                
                if (!is3DActive) {
                    // Solo actualizar backgroundImage si NO está en modo 3D
                    if (skinUrl) {
                        avatarContainer.style.backgroundImage = `url('${skinUrl}?t=${timestamp}')`
                        logger.debug('[refreshAvatar] Landing avatarContainer actualizado con timestamp (2D)')
                    } else {
                        avatarContainer.style.backgroundImage = `url('${fallbackUrl}')`
                        logger.debug('[refreshAvatar] Landing avatarContainer usando fallback (2D)')
                    }
                } else {
                    logger.debug('[refreshAvatar] Modo 3D activo, delegando actualización al viewer 3D')
                }
                
                // Trigger evento para que el sistema 3D refresque si está activo
                const event = new CustomEvent('avatar-updated', { 
                    detail: { uuid: uuid, skinUrl: skinUrl ? `${skinUrl}?t=${timestamp}` : null, timestamp: timestamp } 
                })
                document.dispatchEvent(event)
            }
        }
        
        // 3. Actualizar #tecnilandAccountAvatar en el panel de settings (si existe)
        const tecnilandAccountAvatar = document.getElementById('tecnilandAccountAvatar')
        if (tecnilandAccountAvatar) {
            if (skinUrl) {
                tecnilandAccountAvatar.src = `${skinUrl}?t=${timestamp}`
                tecnilandAccountAvatar.onerror = () => {
                    tecnilandAccountAvatar.src = fallbackUrl
                }
            } else {
                tecnilandAccountAvatar.src = fallbackUrl
            }
        }
        
        logger.info(`[refreshAvatar] Avatar actualizado para UUID: ${uuid || 'all'}`)
    }
    
    // ==================== Métodos Privados ====================
    
    /**
     * Vincular eventos de UI.
     * NOTA: Los eventos del modal se vinculan en _bindModalEvents() cuando se muestra
     * por primera vez, ya que el DOM del modal puede no existir al inicio.
     * @private
     */
    _bindEvents() {
        logger.info('[_bindEvents] ======= INICIO VINCULACIÓN DE EVENTOS =======')
        
        // Resetear estado de loading en botones que existan
        this._setLoading(false, 'login')
        this._setLoading(false, 'register')
        
        // Vincular el botón del loginContainer (para compatibilidad)
        const loginBtn = document.getElementById('tecnilandLoginButton')
        logger.info('[_bindEvents] tecnilandLoginButton:', loginBtn ? 'ENCONTRADO ✓' : 'NO ENCONTRADO')
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                logger.info('[_bindEvents] Click en tecnilandLoginButton')
                this._handleLogin()
            })
        }
        
        // Enlace de registro del loginContainer (para compatibilidad)
        const registerLink = document.getElementById('tecnilandRegisterLink')
        if (registerLink) {
            registerLink.addEventListener('click', (e) => {
                e.preventDefault()
                const { shell } = require('electron')
                shell.openExternal(TecnilandAuthConfig.REGISTER_URL || 'https://tecniland.com/register')
            })
        }
        
        // LoginContainer: username (compatibilidad)
        document.getElementById('tecnilandLoginUsername')?.addEventListener('input', (e) => {
            this._validateField(e.target, 'username')
            this._updateButtonState('login')
        })
        
        // LoginContainer: password (compatibilidad)
        document.getElementById('tecnilandLoginPassword')?.addEventListener('input', (e) => {
            this._validateField(e.target, 'password')
            this._updateButtonState('login')
        })
        
        // Enter en formulario de login (loginContainer - compatibilidad)
        document.getElementById('tecnilandLoginPassword')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this._handleLogin()
            }
        })
        
        // Cerrar con ESC (global - funciona para cualquier overlay)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlayVisible) {
                this.hideLoginOverlay()
                if (this.onLoginCancel) {
                    this.onLoginCancel()
                }
            }
        })
        
        // Eventos de settings panel
        this._bindSettingsEvents()
        
        // Verificar estado inicial de campos
        logger.debug('[_bindEvents] Verificando estado inicial de campos')
        setTimeout(() => {
            this._updateButtonState('login')
            this._updateButtonState('register')
        }, 100)
        
        logger.info('[_bindEvents] Eventos principales vinculados (modal se vinculará al mostrarse)')
    }
    
    /**
     * Vincular eventos específicos del modal overlay.
     * Se llama la primera vez que se muestra el modal para evitar problemas de timing.
     * @private
     */
    _bindModalEvents() {
        logger.info('[_bindModalEvents] ======= VINCULANDO EVENTOS DEL MODAL =======')
        
        // Resetear estado de loading del modal
        this._setLoading(false, 'modal')
        
        // Botón de login del modal overlay
        const modalLoginBtn = document.getElementById('tecnilandAuthModalLoginBtn')
        logger.info('[_bindModalEvents] tecnilandAuthModalLoginBtn:', modalLoginBtn ? 'ENCONTRADO ✓' : 'NO ENCONTRADO ✗')
        if (modalLoginBtn) {
            logger.info('[_bindModalEvents] Vinculando evento click al botón del modal...')
            modalLoginBtn.addEventListener('click', (e) => {
                logger.info('[_bindModalEvents] ===== CLICK EN BOTÓN LOGIN MODAL DETECTADO =====')
                logger.info('[_bindModalEvents] Botón disabled?:', modalLoginBtn.disabled)
                this._handleLogin()
            })
            logger.info('[_bindModalEvents] Evento click vinculado al botón del modal ✓')
        } else {
            logger.error('[_bindModalEvents] ¡ERROR! Botón tecnilandAuthModalLoginBtn NO existe en el DOM')
        }
        
        // Enlace de registro del modal - abre navegador externo
        const modalRegisterLink = document.getElementById('tecnilandAuthModalRegisterLink')
        if (modalRegisterLink) {
            modalRegisterLink.addEventListener('click', (e) => {
                e.preventDefault()
                const { shell } = require('electron')
                shell.openExternal(TecnilandAuthConfig.REGISTER_URL || 'https://tecniland.com/register')
            })
        }
        
        // Botón de cancelar del modal overlay
        const modalCancelBtn = document.getElementById('tecnilandAuthCancelBtn')
        if (modalCancelBtn) {
            modalCancelBtn.addEventListener('click', (e) => {
                e.preventDefault()
                this.hideLoginOverlay()
                if (this.onLoginCancel) {
                    this.onLoginCancel()
                }
            })
        }
        
        // Cerrar al hacer click fuera del formulario (en el fondo del overlay)
        const overlay = document.getElementById('tecnilandAuthOverlay')
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                // Solo cerrar si se hizo click directamente en el overlay (no en su contenido)
                if (e.target === overlay) {
                    this.hideLoginOverlay()
                    if (this.onLoginCancel) {
                        this.onLoginCancel()
                    }
                }
            })
        }
        
        // Modal: username - validación en tiempo real
        document.getElementById('tecnilandAuthModalUsername')?.addEventListener('input', (e) => {
            this._validateField(e.target, 'username')
            this._updateButtonState('modal')
        })
        
        // Modal: password - validación en tiempo real
        document.getElementById('tecnilandAuthModalPassword')?.addEventListener('input', (e) => {
            this._validateField(e.target, 'password')
            this._updateButtonState('modal')
        })
        
        // Enter en formulario de login (modal)
        document.getElementById('tecnilandAuthModalPassword')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this._handleLogin()
            }
        })
        
        // Verificar estado inicial de campos del modal
        this._updateButtonState('modal')
        
        logger.info('[_bindModalEvents] ======= EVENTOS DEL MODAL VINCULADOS =======')
    }
    
    /**
     * Vincular eventos de validación.
     * Para campos del loginContainer (compatibilidad).
     * Los eventos del modal se vinculan en _bindModalEvents().
     * @private
     */
    _bindValidationEvents() {
        // LoginContainer: username (compatibilidad)
        document.getElementById('tecnilandLoginUsername')?.addEventListener('input', (e) => {
            this._validateField(e.target, 'username')
            this._updateButtonState('login')
        })
        
        // LoginContainer: password (compatibilidad)
        document.getElementById('tecnilandLoginPassword')?.addEventListener('input', (e) => {
            this._validateField(e.target, 'password')
            this._updateButtonState('login')
        })
    }
    
    /**
     * Vincular eventos del panel de settings.
     * Los eventos principales se manejan en settings.js (botón de añadir cuenta).
     * @private
     */
    _bindSettingsEvents() {
        // El botón settingsAddTecnilandAccount se maneja en settings.js
        // Aquí solo dejamos placeholder para futuras funcionalidades
    }
    
    /**
     * Inicializar estado de UI.
     * @private
     */
    _initializeState() {
        logger.debug('[_initializeState] Inicio')
        
        // Cargar sesión si existe
        const sessionLoaded = TecnilandAuthManager.loadSession()
        logger.debug(`[_initializeState] sessionLoaded = ${sessionLoaded}`)
        logger.debug(`[_initializeState] currentUser = ${TecnilandAuthManager.currentUser?.username || 'NULL'}`)
        
        // Actualizar UI inicialmente (mostrará como NO logueado aunque haya sesión cargada)
        // porque sessionValidated = false hasta que validateSession() confirme
        this.updateUIState()
        
        // Validar sesión en background
        if (sessionLoaded && TecnilandAuthManager.currentUser) {
            logger.info('Validando sesión TECNILAND en background...')
            TecnilandAuthManager.validateSession().then(valid => {
                if (valid) {
                    logger.info('Sesión TECNILAND válida, actualizando UI')
                    // Sesión válida: actualizar UI para mostrar como logueado
                    this.updateUIState()
                } else {
                    logger.warn('Sesión TECNILAND inválida o expirada')
                    // Sesión inválida: ya se limpió en validateSession(), actualizar UI
                    this.updateUIState()
                }
            }).catch(err => {
                logger.error('Error validando sesión TECNILAND:', err)
                // En caso de error de red, dejar la UI como está (no logueado)
                // El usuario podrá intentar de nuevo más tarde
            })
        }
    }
    
    /**
     * Cambiar tab activa.
     * @private
     */
    _switchTab(tab) {
        this.currentTab = tab
        
        // Tabs y campos
        const loginTab = document.getElementById('tecnilandTabLogin')
        const registerTab = document.getElementById('tecnilandTabRegister')
        const loginFields = document.getElementById('tecnilandLoginFields')
        const registerFields = document.getElementById('tecnilandRegisterFields')
        
        if (!loginTab || !registerTab || !loginFields || !registerFields) {
            logger.error('No se encontraron elementos de tab TECNILAND')
            return
        }
        
        if (tab === 'login') {
            // Activar tab de login
            loginTab.style.backgroundColor = '#2c2c2c'
            loginTab.style.borderBottom = '3px solid #00ff00'
            registerTab.style.backgroundColor = '#1e1e1e'
            registerTab.style.borderBottom = '3px solid transparent'
            
            // Mostrar campos de login
            loginFields.style.display = 'block'
            registerFields.style.display = 'none'
            
            // Focus en primer campo
            setTimeout(() => {
                document.getElementById('tecnilandLoginUsername')?.focus()
            }, 100)
        } else {
            // Activar tab de register
            registerTab.style.backgroundColor = '#2c2c2c'
            registerTab.style.borderBottom = '3px solid #00ff00'
            loginTab.style.backgroundColor = '#1e1e1e'
            loginTab.style.borderBottom = '3px solid transparent'
            
            // Mostrar campos de registro
            registerFields.style.display = 'block'
            loginFields.style.display = 'none'
            
            // Focus en primer campo
            setTimeout(() => {
                document.getElementById('tecnilandRegisterUsername')?.focus()
            }, 100)
        }
        
        // Limpiar errores al cambiar
        this._hideAllErrors()
    }
    
    /**
     * Manejar login.
     * Soporta tanto el modal overlay como el loginContainer.
     * @private
     */
    async _handleLogin() {
        logger.info('[_handleLogin] ===== INICIO _handleLogin =====')
        
        // Intentar obtener valores del modal primero, luego del loginContainer
        let usernameInput = document.getElementById('tecnilandAuthModalUsername')
        let passwordInput = document.getElementById('tecnilandAuthModalPassword')
        let errorElementId = 'tecnilandAuthModalError'
        let formType = 'modal'
        
        logger.info('[_handleLogin] Modal username input element:', usernameInput ? 'EXISTE ✓' : 'NO EXISTE ✗')
        logger.info('[_handleLogin] Modal password input element:', passwordInput ? 'EXISTE ✓' : 'NO EXISTE ✗')
        logger.info('[_handleLogin] Modal username value:', usernameInput?.value ? `"${usernameInput.value}"` : 'NULL/UNDEFINED')
        logger.info('[_handleLogin] Modal password value:', passwordInput?.value ? '[PRESENTE]' : 'NULL/UNDEFINED')
        
        // Si los campos del modal están vacíos, usar los del loginContainer
        if (!usernameInput?.value?.trim()) {
            logger.debug('[_handleLogin] Modal vacío, intentando loginContainer')
            usernameInput = document.getElementById('tecnilandLoginUsername')
            passwordInput = document.getElementById('tecnilandLoginPassword')
            errorElementId = 'tecnilandLoginError'
            formType = 'login'
            logger.debug('[_handleLogin] LoginContainer username input:', usernameInput ? 'EXISTE' : 'NO EXISTE')
        }
        
        const username = usernameInput?.value?.trim()
        const password = passwordInput?.value
        
        logger.info('[_handleLogin] username final:', username ? `"${username}"` : 'VACÍO/NULL')
        logger.info('[_handleLogin] password final:', password ? '[PRESENTE - longitud: ' + password.length + ']' : 'VACÍO/NULL')
        
        if (!username || !password) {
            logger.warn('[_handleLogin] Validación fallida - campos vacíos')
            this._showError(errorElementId, 'Por favor completa todos los campos.')
            return
        }
        
        logger.info('[_handleLogin] Validación OK - procediendo con login...')
        
        // Deshabilitar UI
        this._setLoading(true, formType)
        this._hideAllErrors()
        
        try {
            logger.info('[_handleLogin] Llamando a TecnilandAuthManager.login()...')
            const account = await TecnilandAuthManager.login(username, password)
            logger.info('[_handleLogin] Login exitoso, cuenta:', account?.displayName || 'NULL')
            
            logger.info(`Login TECNILAND exitoso: ${account.displayName}`)
            
            // Seleccionar la cuenta recién creada y actualizar UI
            if (typeof setSelectedAccount === 'function') {
                setSelectedAccount(account.uuid)
            } else {
                // Fallback si setSelectedAccount no está disponible
                ConfigManager.setSelectedAccount(account.uuid)
                ConfigManager.save()
                if (typeof updateSelectedAccount === 'function') {
                    updateSelectedAccount(account)
                }
            }
            
            // Actualizar UI del auth system
            this.updateUIState()
            
            // Callback de éxito
            if (this.onLoginSuccess) {
                this.onLoginSuccess(account)
            }
            
            // Cerrar overlay
            this.hideLoginOverlay()
            
            // Mostrar mensaje de éxito (usando el overlay del launcher)
            if (typeof setOverlayContent === 'function') {
                setOverlayContent(
                    '¡Bienvenido!',
                    `Has iniciado sesión como ${account.displayName}`,
                    'Continuar'
                )
                setOverlayHandler(() => {
                    toggleOverlay(false)
                })
                toggleOverlay(true)
            }
            
        } catch (err) {
            logger.error('[_handleLogin] ===== ERROR EN LOGIN =====')
            logger.error('[_handleLogin] Tipo de error:', err?.code || 'SIN CÓDIGO')
            logger.error('[_handleLogin] Mensaje:', err?.message || 'SIN MENSAJE')
            logger.error('[_handleLogin] Descripción:', err?.desc || 'SIN DESC')
            logger.error('[_handleLogin] Error completo:', JSON.stringify(err, null, 2))
            this._showError(errorElementId, err.desc || err.message || 'Error al iniciar sesión')
        } finally {
            logger.info('[_handleLogin] ===== FIN _handleLogin =====')
            this._setLoading(false, formType)
        }
    }
    
    /**
     * Manejar registro.
     * @private
     */
    async _handleRegister() {
        const usernameInput = document.getElementById('tecnilandRegisterUsername')
        const emailInput = document.getElementById('tecnilandRegisterEmail')
        const passwordInput = document.getElementById('tecnilandRegisterPassword')
        const accessKeyInput = document.getElementById('tecnilandRegisterAccessKey')
        
        const username = usernameInput?.value?.trim()
        const email = emailInput?.value?.trim()
        const password = passwordInput?.value
        const accessKey = accessKeyInput?.value?.trim()
        
        if (!username || !email || !password || !accessKey) {
            this._showError('tecnilandRegisterError', 'Por favor completa todos los campos.')
            return
        }
        
        // Deshabilitar UI
        this._setLoading(true, 'register')
        this._hideAllErrors()
        
        try {
            const account = await TecnilandAuthManager.register(username, email, password, accessKey)
            
            logger.info(`Registro TECNILAND exitoso: ${account.displayName}`)
            
            // Actualizar UI
            this.updateUIState()
            
            // Callback de éxito
            if (this.onLoginSuccess) {
                this.onLoginSuccess(account)
            }
            
            // Cerrar overlay
            this.hideLoginOverlay()
            
            // Mostrar mensaje de bienvenida
            if (typeof setOverlayContent === 'function') {
                setOverlayContent(
                    '¡Cuenta Creada!',
                    `Bienvenido a TECNILAND, ${account.displayName}. Tu cuenta ha sido creada exitosamente.`,
                    'Comenzar'
                )
                setOverlayHandler(() => {
                    toggleOverlay(false)
                })
                toggleOverlay(true)
            }
            
        } catch (err) {
            logger.error('Error en registro TECNILAND:', err)
            this._showError('tecnilandRegisterError', err.desc || err.message || 'Error al registrar cuenta')
        } finally {
            this._setLoading(false, 'register')
        }
    }
    
    /**
     * Manejar logout.
     * @private
     */
    async _handleLogout() {
        const logoutButton = document.getElementById('tecnilandLogoutButton')
        if (logoutButton) {
            logoutButton.disabled = true
            logoutButton.textContent = 'Cerrando sesión...'
        }
        
        try {
            await TecnilandAuthManager.logout()
            this.updateUIState()
            
            logger.info('Logout TECNILAND exitoso')
        } catch (err) {
            logger.error('Error en logout:', err)
        } finally {
            if (logoutButton) {
                logoutButton.disabled = false
                logoutButton.textContent = 'Cerrar Sesión'
            }
        }
    }
    
    /**
     * Manejar upload de skin.
     * @private
     */
    async _handleSkinUpload(event) {
        const file = event.target.files?.[0]
        if (!file) return
        
        // Validar tipo de archivo
        if (file.type !== 'image/png') {
            this._showSettingsError('La skin debe ser un archivo PNG.')
            return
        }
        
        // Validar tamaño
        if (file.size > TecnilandAuthConfig.VALIDATION.MAX_SKIN_SIZE) {
            this._showSettingsError('La skin es demasiado grande (máximo 64KB).')
            return
        }
        
        const uploadButton = document.getElementById('tecnilandUploadSkinButton')
        if (uploadButton) {
            uploadButton.disabled = true
            uploadButton.textContent = 'Subiendo...'
        }
        
        try {
            const model = document.getElementById('tecnilandSkinModelSelect')?.value || 'steve'
            await TecnilandAuthManager.uploadSkin(file, model)
            
            // Refrescar avatar con UUID del usuario actual
            const currentUser = TecnilandAuthManager.getCurrentUser()
            if (currentUser) {
                this.refreshAvatar(currentUser.uuid)
                
                // Si la cuenta modificada es la seleccionada, actualizar hub principal y elementos de landing
                const selectedAccount = ConfigManager.getSelectedAccount()
                if (selectedAccount && selectedAccount.uuid === currentUser.uuid) {
                    // Actualizar hub mediante updateSelectedAccount (fuerza recarga del avatar)
                    if (typeof updateSelectedAccount === 'function') {
                        updateSelectedAccount(selectedAccount)
                    }
                    // También actualizar elementos de landing adicionales
                    this._updateLandingElements(true, currentUser)
                }
            }
            
            this._showSettingsSuccess('Skin actualizada correctamente.')
        } catch (err) {
            logger.error('Error subiendo skin:', err)
            this._showSettingsError(err.desc || 'Error al subir la skin.')
        } finally {
            if (uploadButton) {
                uploadButton.disabled = false
                uploadButton.textContent = 'Cambiar Skin'
            }
            // Limpiar input
            event.target.value = ''
        }
    }
    
    /**
     * Manejar eliminación de skin.
     * @private
     */
    async _handleSkinDelete() {
        const deleteButton = document.getElementById('tecnilandDeleteSkinButton')
        if (deleteButton) {
            deleteButton.disabled = true
            deleteButton.textContent = 'Eliminando...'
        }
        
        try {
            await TecnilandAuthManager.deleteSkin()
            
            // Refrescar avatar con UUID del usuario actual
            const currentUser = TecnilandAuthManager.getCurrentUser()
            if (currentUser) {
                this.refreshAvatar(currentUser.uuid)
                
                // Si la cuenta modificada es la seleccionada, actualizar hub principal y elementos de landing
                const selectedAccount = ConfigManager.getSelectedAccount()
                if (selectedAccount && selectedAccount.uuid === currentUser.uuid) {
                    // Actualizar hub mediante updateSelectedAccount (fuerza recarga del avatar)
                    if (typeof updateSelectedAccount === 'function') {
                        updateSelectedAccount(selectedAccount)
                    }
                    // También actualizar elementos de landing adicionales
                    this._updateLandingElements(true, currentUser)
                }
            }
            
            this._showSettingsSuccess('Skin eliminada.')
        } catch (err) {
            logger.error('Error eliminando skin:', err)
            this._showSettingsError(err.desc || 'Error al eliminar la skin.')
        } finally {
            if (deleteButton) {
                deleteButton.disabled = false
                deleteButton.textContent = 'Eliminar Skin'
            }
        }
    }
    
    /**
     * Validar campo de formulario.
     * @private
     */
    _validateField(input, type) {
        const value = input.value.trim()
        let isValid = true
        
        switch (type) {
            case 'username':
                isValid = value.length === 0 || TecnilandAuthConfig.VALIDATION.USERNAME_REGEX.test(value)
                break
            case 'email':
                isValid = value.length === 0 || TecnilandAuthConfig.VALIDATION.EMAIL_REGEX.test(value)
                break
            case 'password':
                isValid = value.length === 0 || value.length >= TecnilandAuthConfig.VALIDATION.PASSWORD_MIN_LENGTH
                break
            case 'accessKey':
                isValid = value.length === 0 || TecnilandAuthConfig.VALIDATION.ACCESS_KEY_REGEX.test(value)
                break
        }
        
        if (isValid) {
            input.classList.remove('invalid')
        } else {
            input.classList.add('invalid')
        }
        
        return isValid
    }
    
    /**
     * Actualizar panel de settings.
     * Como ahora usamos la misma estructura que Microsoft/Mojang/Offline,
     * las cuentas se manejan dinámicamente en settingsCurrentTecnilandAccounts.
     * @private
     */
    _updateSettingsPanel(isLoggedIn, user) {
        // La lógica de cuentas se maneja en settings.js via prepareAccountsTab
        // Aquí solo actualizamos el avatar si hay usuario logueado
        if (isLoggedIn && user) {
            this.refreshAvatar(user.uuid)
            
            // Refrescar el panel completo de cuentas para mostrar la nueva cuenta TECNILAND
            // inmediatamente después del login sin necesidad de cambiar de tab
            if (typeof window !== 'undefined' && typeof window.refreshAccountsPanel === 'function') {
                window.refreshAccountsPanel()
            }
        }
    }
    
    /**
     * Actualizar elementos de landing.
     * @private
     */
    _updateLandingElements(isLoggedIn, user) {
        // Actualizar estado visual del indicador de cuenta TECNILAND (si existe)
        const tecnilandStatusEl = document.getElementById('tecnilandAccountStatus')
        if (tecnilandStatusEl) {
            if (isLoggedIn && user) {
                tecnilandStatusEl.textContent = user.username
                tecnilandStatusEl.classList.add('logged-in')
            } else {
                tecnilandStatusEl.textContent = 'No conectado'
                tecnilandStatusEl.classList.remove('logged-in')
            }
        }
        
        // Actualizar avatar del hub principal si la cuenta TECNILAND es la seleccionada
        if (isLoggedIn && user) {
            const selectedAccount = ConfigManager.getSelectedAccount()
            if (selectedAccount && selectedAccount.type === 'tecniland' && selectedAccount.uuid === user.uuid) {
                // La cuenta TECNILAND es la seleccionada, actualizar avatar del hub
                const avatarContainer = document.getElementById('avatarContainer')
                if (avatarContainer) {
                    const skinUrl = TecnilandAuthManager.getSkinUrl(user.uuid)
                    if (skinUrl) {
                        // Usar la skin de TECNILAND con timestamp para evitar cache
                        avatarContainer.style.backgroundImage = `url('${skinUrl}?t=${Date.now()}')`
                    } else {
                        // Fallback a avatar por defecto
                        avatarContainer.style.backgroundImage = 'url(\'./assets/images/icons/profile.svg\')'
                    }
                }
            }
        }
    }
    
    /**
     * Mostrar error en formulario.
     * @private
     */
    _showError(elementId, message) {
        const errorEl = document.getElementById(elementId)
        if (errorEl) {
            errorEl.textContent = message
            errorEl.style.display = 'block'
            errorEl.classList.add('shake')
            setTimeout(() => errorEl.classList.remove('shake'), 500)
        }
    }
    
    /**
     * Ocultar todos los errores.
     * @private
     */
    _hideAllErrors() {
        const errorElements = document.querySelectorAll('.tecnilandErrorSpan')
        errorElements.forEach(el => {
            el.style.display = 'none'
            el.textContent = ''
        })
    }
    
    /**
     * Mostrar mensaje de error en settings.
     * @private
     */
    _showSettingsError(message) {
        const statusEl = document.getElementById('tecnilandSettingsStatus')
        if (statusEl) {
            statusEl.textContent = message
            statusEl.className = 'tecniland-settings-status error'
            statusEl.style.display = 'block'
            setTimeout(() => { statusEl.style.display = 'none' }, 5000)
        }
    }
    
    /**
     * Mostrar mensaje de éxito en settings.
     * @private
     */
    _showSettingsSuccess(message) {
        const statusEl = document.getElementById('tecnilandSettingsStatus')
        if (statusEl) {
            statusEl.textContent = message
            statusEl.className = 'tecniland-settings-status success'
            statusEl.style.display = 'block'
            setTimeout(() => { statusEl.style.display = 'none' }, 3000)
        }
    }
    
    /**
     * Establecer estado de carga.
     * Soporta modal, login, y register.
     * @private
     */
    _setLoading(loading, formType) {
        let buttonId, buttonContentId, inputSelector
        
        if (formType === 'modal') {
            buttonId = 'tecnilandAuthModalLoginBtn'
            buttonContentId = 'tecnilandAuthModalLoginContent'
            inputSelector = '#tecnilandAuthModalForm input'
        } else if (formType === 'login') {
            buttonId = 'tecnilandLoginButton'
            buttonContentId = 'tecnilandLoginButtonContent'
            inputSelector = '#loginTecnilandForm input'
        } else {
            buttonId = 'tecnilandRegisterButton'
            buttonContentId = 'tecnilandRegisterButtonContent'
            inputSelector = '#tecnilandRegisterForm input'
        }
        
        const button = document.getElementById(buttonId)
        const buttonContent = document.getElementById(buttonContentId)
        const inputs = document.querySelectorAll(inputSelector)
        
        if (loading) {
            if (button) {
                button.disabled = true
                button.setAttribute('loading', 'true')
            }
            if (buttonContent) {
                buttonContent.dataset.originalHTML = buttonContent.innerHTML
                buttonContent.innerHTML = formType === 'register' 
                    ? 'REGISTRANDO...<div class="circle-loader"><div class="checkmark draw"></div></div>'
                    : 'INICIANDO SESIÓN...<div class="circle-loader"><div class="checkmark draw"></div></div>'
            }
            inputs.forEach(input => input.disabled = true)
        } else {
            if (button) {
                button.disabled = false
                button.removeAttribute('loading')
            }
            if (buttonContent && buttonContent.dataset.originalHTML) {
                buttonContent.innerHTML = buttonContent.dataset.originalHTML
            }
            inputs.forEach(input => input.disabled = false)
            // Re-validar para habilitar/deshabilitar botones
            this._updateButtonState(formType)
        }
    }
    
    /**
     * Actualizar estado de habilitación de botones.
     * Soporta modal, login, y register.
     * @private
     */
    _updateButtonState(formType) {
        if (formType === 'modal') {
            // Modal overlay
            const username = document.getElementById('tecnilandAuthModalUsername')?.value?.trim()
            const password = document.getElementById('tecnilandAuthModalPassword')?.value
            const button = document.getElementById('tecnilandAuthModalLoginBtn')
            const shouldEnable = !!(username && password)
            logger.debug('[_updateButtonState] modal - username:', username ? 'TIENE' : 'VACÍO', '| password:', password ? 'TIENE' : 'VACÍO', '| shouldEnable:', shouldEnable)
            if (button) {
                button.disabled = !shouldEnable
                logger.debug('[_updateButtonState] Botón modal disabled =', button.disabled)
            }
        } else if (formType === 'login') {
            // LoginContainer
            const username = document.getElementById('tecnilandLoginUsername')?.value?.trim()
            const password = document.getElementById('tecnilandLoginPassword')?.value
            const button = document.getElementById('tecnilandLoginButton')
            if (button) {
                button.disabled = !(username && password)
            }
        } else {
            // Register (legacy)
            const username = document.getElementById('tecnilandRegisterUsername')?.value?.trim()
            const email = document.getElementById('tecnilandRegisterEmail')?.value?.trim()
            const password = document.getElementById('tecnilandRegisterPassword')?.value
            const accessKey = document.getElementById('tecnilandRegisterAccessKey')?.value?.trim()
            const button = document.getElementById('tecnilandRegisterButton')
            if (button) {
                button.disabled = !(username && email && password && accessKey)
            }
        }
    }
    
    /**
     * Limpiar formularios (modal y loginContainer).
     * @private
     */
    _clearForms() {
        // Limpiar campos del modal overlay
        const modalInputs = document.querySelectorAll('#tecnilandAuthOverlay input')
        modalInputs.forEach(input => {
            input.value = ''
            input.classList.remove('invalid')
        })
        
        // Limpiar campos del loginContainer (compatibilidad)
        const loginInputs = document.querySelectorAll('#loginTecnilandContent input')
        loginInputs.forEach(input => {
            input.value = ''
            input.classList.remove('invalid')
        })
        
        // Resetear botones
        const modalBtn = document.getElementById('tecnilandAuthModalLoginBtn')
        const loginBtn = document.getElementById('tecnilandLoginButton')
        if (modalBtn) modalBtn.disabled = true
        if (loginBtn) loginBtn.disabled = true
    }
}

// Exportar instancia singleton
const tecnilandAuthUI = new TecnilandAuthUI()

module.exports = tecnilandAuthUI
