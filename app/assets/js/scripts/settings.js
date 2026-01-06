// Requirements
const os     = require('os')
const semver = require('semver')

const DropinModUtil  = require('./assets/js/dropinmodutil')
const { MSFT_OPCODE, MSFT_REPLY_TYPE, MSFT_ERROR } = require('./assets/js/ipcconstants')
const {
    validateSelectedJvm,
    ensureJavaDirIsRoot
}                    = require('helios-core/java')

// LoggerUtil ya está disponible globalmente desde uicore.js
const logger = LoggerUtil.getLogger('Settings')
const settingsState = {
    invalid: new Set()
}

/**
 * Verifica si un error tiene la estructura displayable {title, desc}.
 * @param {*} err El error a verificar
 * @returns {boolean} true si el error es displayable
 */
function isDisplayableError(err) {
    return err != null && typeof err === 'object' && 
           typeof err.title === 'string' && typeof err.desc === 'string'
}

/**
 * Parse JVM arguments string with basic quote support.
 * Handles quoted arguments with spaces: -Dpath="C:\My Folder"
 * 
 * @param {string} input Raw JVM arguments string
 * @returns {Array<string>} Array of parsed arguments
 */
function parseJvmArgs(input) {
    const args = []
    let current = ''
    let inQuote = false
    let quoteChar = null
    
    for (let i = 0; i < input.length; i++) {
        const char = input[i]
        
        if ((char === '"' || char === '\'') && (i === 0 || input[i - 1] !== '\\')) {
            if (!inQuote) {
                // Start quote
                inQuote = true
                quoteChar = char
            } else if (char === quoteChar) {
                // End quote
                inQuote = false
                quoteChar = null
            } else {
                // Different quote inside quote
                current += char
            }
        } else if (char === ' ' && !inQuote) {
            // Space outside quotes: end of argument
            if (current.trim()) {
                args.push(current.trim())
                current = ''
            }
        } else {
            current += char
        }
    }
    
    // Add last argument
    if (current.trim()) {
        args.push(current.trim())
    }
    
    return args
}

/**
 * Populate the Java installation context information.
 * Shows the currently selected installation/server as visual context.
 * Note: JVM args are global and apply to all installations.
 */
async function populateJavaInstallationContext() {
    const nameEl = document.getElementById('settingsJavaInstallName')
    const loaderEl = document.getElementById('settingsJavaInstallLoader')
    const versionEl = document.getElementById('settingsJavaInstallVersion')
    
    const installId = ConfigManager.getSelectedInstallation()
    
    if (!installId) {
        // No custom installation selected - using default server
        try {
            const distro = await DistroAPI.getDistribution()
            const server = distro.getServerById(ConfigManager.getSelectedServer())
            
            nameEl.textContent = server.rawServer.name || 'Servidor TECNILAND'
            loaderEl.textContent = 'Servidor (Forge/Mods)'
            versionEl.textContent = server.rawServer.minecraftVersion || '-'
        } catch(err) {
            nameEl.textContent = 'Servidor por defecto'
            loaderEl.textContent = '-'
            versionEl.textContent = '-'
        }
        return
    }
    
    // Custom installation selected
    const install = ConfigManager.getInstallation(installId)
    
    if (!install) {
        nameEl.textContent = 'Sin instalación'
        loaderEl.textContent = '-'
        versionEl.textContent = '-'
        return
    }
    
    // Populate from installation data
    nameEl.textContent = install.name || install.id || 'Sin nombre'
    
    // Determine loader type
    let loaderType = 'Vanilla'
    const loaderValue = install.loader || install.modLoader
    if (loaderValue && typeof loaderValue === 'string') {
        loaderType = loaderValue.charAt(0).toUpperCase() + loaderValue.slice(1).toLowerCase()
    } else if (loaderValue && typeof loaderValue === 'object' && loaderValue.type) {
        loaderType = loaderValue.type.charAt(0).toUpperCase() + loaderValue.type.slice(1).toLowerCase()
    }
    loaderEl.textContent = loaderType
    
    // Determine Minecraft version (múltiples fuentes posibles)
    let mcVersion = install.minecraftVersion || install.version
    if (!mcVersion && loaderValue && typeof loaderValue === 'object') {
        mcVersion = loaderValue.minecraftVersion || loaderValue.gameVersion
    }
    versionEl.textContent = mcVersion || '-'
}

function bindSettingsSelect(){
    for(let ele of document.getElementsByClassName('settingsSelectContainer')) {
        const selectedDiv = ele.getElementsByClassName('settingsSelectSelected')[0]

        selectedDiv.onclick = (e) => {
            e.stopPropagation()
            closeSettingsSelect(e.target)
            e.target.nextElementSibling.toggleAttribute('hidden')
            e.target.classList.toggle('select-arrow-active')
        }
    }
}

function closeSettingsSelect(el){
    for(let ele of document.getElementsByClassName('settingsSelectContainer')) {
        const selectedDiv = ele.getElementsByClassName('settingsSelectSelected')[0]
        const optionsDiv = ele.getElementsByClassName('settingsSelectOptions')[0]

        if(!(selectedDiv === el)) {
            selectedDiv.classList.remove('select-arrow-active')
            optionsDiv.setAttribute('hidden', '')
        }
    }
}

/* If the user clicks anywhere outside the select box,
then close all select boxes: */
document.addEventListener('click', closeSettingsSelect)

bindSettingsSelect()


function bindFileSelectors(){
    for(let ele of document.getElementsByClassName('settingsFileSelButton')){
        
        ele.onclick = async e => {
            const isJavaExecSel = ele.id === 'settingsJavaExecSel'
            const directoryDialog = ele.hasAttribute('dialogDirectory') && ele.getAttribute('dialogDirectory') == 'true'
            const properties = directoryDialog ? ['openDirectory', 'createDirectory'] : ['openFile']

            const options = {
                properties
            }

            if(ele.hasAttribute('dialogTitle')) {
                options.title = ele.getAttribute('dialogTitle')
            }

            if(isJavaExecSel && process.platform === 'win32') {
                options.filters = [
                    { name: Lang.queryJS('settings.fileSelectors.executables'), extensions: ['exe'] },
                    { name: Lang.queryJS('settings.fileSelectors.allFiles'), extensions: ['*'] }
                ]
            }

            const res = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), options)
            if(!res.canceled) {
                ele.previousElementSibling.value = res.filePaths[0]
                if(isJavaExecSel) {
                    await populateJavaExecDetails(ele.previousElementSibling.value)
                }
            }
        }
    }
}

bindFileSelectors()


/**
 * Bind the language selector functionality.
 */
function bindLanguageSelector(){
    const languageOptions = document.getElementById('settingsLanguageOptions')
    const languageSelected = document.getElementById('settingsLanguageSelected')
    
    // Set initial value from config
    const currentLang = ConfigManager.getLanguage()
    for(let opt of languageOptions.children) {
        if(opt.getAttribute('value') === currentLang) {
            opt.setAttribute('selected', '')
            languageSelected.innerHTML = opt.innerHTML
        }
    }
    
    // Handle language change
    for(let opt of languageOptions.children) {
        opt.addEventListener('click', function(e) {
            const selectedLang = this.getAttribute('value')
            const currentLang = ConfigManager.getLanguage()
            
            // Only proceed if language actually changed
            if(selectedLang !== currentLang) {
                // Update UI
                this.parentNode.previousElementSibling.innerHTML = this.innerHTML
                for(let sib of this.parentNode.children) {
                    sib.removeAttribute('selected')
                }
                this.setAttribute('selected', '')
                
                // Save to config
                ConfigManager.setLanguage(selectedLang)
                ConfigManager.save()
                
                // Show restart notification
                const {ipcRenderer} = require('electron')
                ipcRenderer.send('autoUpdateAction', 'showRestartDialog', Lang.queryJS('settings.languageRestartTitle'), Lang.queryJS('settings.languageRestartMessage'))
            }
            
            closeSettingsSelect()
        })
    }
}

bindLanguageSelector()

/**
 * Bind the experimental loaders toggle with warning modal.
 * When user tries to enable it, show a warning overlay first.
 */
function bindExperimentalLoadersToggle(){
    const toggle = document.getElementById('experimentalLoadersToggle')
    if (!toggle) return
    
    toggle.addEventListener('change', function(e) {
        // If user is trying to enable experimental loaders
        if (e.target.checked) {
            // Prevent the change temporarily
            e.target.checked = false
            
            // Show warning overlay
            setOverlayContent(
                Lang.queryJS('settings.experimentalLoadersWarningTitle'),
                Lang.queryJS('settings.experimentalLoadersWarningMessage'),
                Lang.queryJS('settings.experimentalLoadersConfirm'),
                Lang.queryJS('settings.experimentalLoadersCancel')
            )
            
            setOverlayHandler(() => {
                // User confirmed - enable experimental loaders
                toggle.checked = true
                ConfigManager.setExperimentalLoaders(true)
                ConfigManager.save()
                toggleOverlay(false)
                // Dispatch event so installation-editor can update
                window.dispatchEvent(new CustomEvent('experimental-loaders-changed', { detail: { enabled: true } }))
            })
            
            setDismissHandler(() => {
                // User cancelled - keep disabled
                toggle.checked = false
                toggleOverlay(false)
            })
            
            toggleOverlay(true, true)
        } else {
            // User is disabling - no confirmation needed
            ConfigManager.setExperimentalLoaders(false)
            ConfigManager.save()
            // Dispatch event so installation-editor can update
            window.dispatchEvent(new CustomEvent('experimental-loaders-changed', { detail: { enabled: false } }))
        }
    })
}

// Initialize experimental loaders toggle handler
bindExperimentalLoadersToggle()


/**
 * General Settings Functions
 */

/**
  * Bind value validators to the settings UI elements. These will
  * validate against the criteria defined in the ConfigManager (if
  * any). If the value is invalid, the UI will reflect this and saving
  * will be disabled until the value is corrected. This is an automated
  * process. More complex UI may need to be bound separately.
  */
function initSettingsValidators(){
    const sEls = document.getElementById('settingsContainer').querySelectorAll('[cValue]')
    Array.from(sEls).map((v, index, arr) => {
        const vFn = ConfigManager['validate' + v.getAttribute('cValue')]
        if(typeof vFn === 'function'){
            if(v.tagName === 'INPUT'){
                if(v.type === 'number' || v.type === 'text'){
                    v.addEventListener('keyup', (e) => {
                        const v = e.target
                        if(!vFn(v.value)){
                            settingsState.invalid.add(v.id)
                            v.setAttribute('error', '')
                            settingsSaveDisabled(true)
                        } else {
                            if(v.hasAttribute('error')){
                                v.removeAttribute('error')
                                settingsState.invalid.delete(v.id)
                                if(settingsState.invalid.size === 0){
                                    settingsSaveDisabled(false)
                                }
                            }
                        }
                    })
                }
            }
        }

    })
    
    // Inicializar estado de tabs al cargar Settings por primera vez
    resetSettingsTabsToDefault()
}

/**
 * Load configuration values onto the UI. This is an automated process.
 */
async function initSettingsValues(){
    const sEls = document.getElementById('settingsContainer').querySelectorAll('[cValue]')

    for(const v of sEls) {
        const cVal = v.getAttribute('cValue')
        const serverDependent = v.hasAttribute('serverDependent') // Means the first argument is the server id.
        const gFn = ConfigManager['get' + cVal]
        const gFnOpts = []
        if(serverDependent) {
            // Usar installation ID si hay una instalación custom seleccionada, sino usar server ID
            const selectedInstallId = ConfigManager.getSelectedInstallation()
            gFnOpts.push(selectedInstallId || ConfigManager.getSelectedServer())
        }
        if(typeof gFn === 'function'){
            if(v.tagName === 'INPUT'){
                if(v.type === 'number' || v.type === 'text'){
                    // Special Conditions
                    if(cVal === 'JavaExecutable'){
                        const execPath = gFn.apply(null, gFnOpts)
                        v.value = execPath || 'Se detectará automáticamente al iniciar'
                        await populateJavaExecDetails(execPath)
                    } else if (cVal === 'DataDirectory'){
                        v.value = gFn.apply(null, gFnOpts)
                    } else if (cVal === 'JVMOptions' || cVal === 'GlobalJVMOptions'){
                        v.value = gFn.apply(null, gFnOpts).join(' ')
                    } else {
                        v.value = gFn.apply(null, gFnOpts)
                    }
                } else if(v.type === 'checkbox'){
                    v.checked = gFn.apply(null, gFnOpts)
                }
            } else if(v.tagName === 'DIV'){
                if(v.classList.contains('rangeSlider')){
                    // Special Conditions
                    if(cVal === 'MinRAM' || cVal === 'MaxRAM'){
                        let val = gFn.apply(null, gFnOpts)
                        if(val.endsWith('M')){
                            val = Number(val.substring(0, val.length-1))/1024
                        } else {
                            val = Number.parseFloat(val)
                        }

                        v.setAttribute('value', val)
                    } else {
                        v.setAttribute('value', Number.parseFloat(gFn.apply(null, gFnOpts)))
                    }
                }
            }
        }
    }

}

/**
 * Save the settings values.
 */
function saveSettingsValues(){
    const sEls = document.getElementById('settingsContainer').querySelectorAll('[cValue]')
    Array.from(sEls).map((v, index, arr) => {
        const cVal = v.getAttribute('cValue')
        const serverDependent = v.hasAttribute('serverDependent') // Means the first argument is the server id.
        const sFn = ConfigManager['set' + cVal]
        const sFnOpts = []
        if(serverDependent) {
            // Usar installation ID si hay una instalación custom seleccionada, sino usar server ID
            const selectedInstallId = ConfigManager.getSelectedInstallation()
            sFnOpts.push(selectedInstallId || ConfigManager.getSelectedServer())
        }
        if(typeof sFn === 'function'){
            if(v.tagName === 'INPUT'){
                if(v.type === 'number' || v.type === 'text'){
                    // Special Conditions
                    if(cVal === 'JVMOptions'){
                        // Legacy per-installation JVM options (deprecated but still supported)
                        if(!v.value.trim()) {
                            sFnOpts.push([])
                            sFn.apply(null, sFnOpts)
                        } else {
                            sFnOpts.push(v.value.trim().split(/\s+/))
                            sFn.apply(null, sFnOpts)
                        }
                    } else if(cVal === 'GlobalJVMOptions'){
                        // Global JVM options (new preferred method)
                        if(!v.value.trim()) {
                            sFnOpts.push([])
                            sFn.apply(null, sFnOpts)
                        } else {
                            // Parse args with basic quote support
                            const rawInput = v.value.trim()
                            const parsedArgs = parseJvmArgs(rawInput)
                            
                            // Sanitize: remove -Xmx/-Xms flags
                            const memoryFlagRegex = /^-(Xmx|Xms)/
                            const sanitizedArgs = parsedArgs.filter(arg => !memoryFlagRegex.test(arg))
                            const ignoredCount = parsedArgs.length - sanitizedArgs.length
                            
                            // Show warning if memory flags were removed
                            if(ignoredCount > 0) {
                                const { remote } = require('electron')
                                const logger = require(remote.app.getAppPath() + '/app/assets/js/loggerutil.js')
                                
                                logger.info(`JVM args sanitization: input=${parsedArgs.length}, ignored=${ignoredCount} (memory flags), final=${sanitizedArgs.length}`)
                                
                                // Show overlay warning
                                setOverlayContent(
                                    'Argumentos de Memoria Ignorados',
                                    `Se ignoraron ${ignoredCount} argumento${ignoredCount > 1 ? 's' : ''} de memoria (-Xmx/-Xms).<br>Por favor, usa los sliders de RAM para ajustar la memoria.`,
                                    'Entendido'
                                )
                                setOverlayHandler(() => {
                                    toggleOverlay(false)
                                })
                                toggleOverlay(true, true)
                            }
                            
                            sFnOpts.push(sanitizedArgs)
                            sFn.apply(null, sFnOpts)
                        }
                    } else {
                        sFnOpts.push(v.value)
                        sFn.apply(null, sFnOpts)
                    }
                } else if(v.type === 'checkbox'){
                    sFnOpts.push(v.checked)
                    sFn.apply(null, sFnOpts)
                    // Special Conditions
                    if(cVal === 'AllowPrerelease'){
                        changeAllowPrerelease(v.checked)
                    }
                }
            } else if(v.tagName === 'DIV'){
                if(v.classList.contains('rangeSlider')){
                    // Special Conditions
                    if(cVal === 'MinRAM' || cVal === 'MaxRAM'){
                        let val = Number(v.getAttribute('value'))
                        if(val%1 > 0){
                            val = val*1024 + 'M'
                        } else {
                            val = val + 'G'
                        }

                        sFnOpts.push(val)
                        sFn.apply(null, sFnOpts)
                    } else {
                        sFnOpts.push(v.getAttribute('value'))
                        sFn.apply(null, sFnOpts)
                    }
                }
            }
        }
    })
}

let selectedSettingsTab = 'settingsTabAccount'

/**
 * Modify the settings container UI when the scroll threshold reaches
 * a certain poin.
 * 
 * @param {UIEvent} e The scroll event.
 */
function settingsTabScrollListener(e){
    if(e.target.scrollTop > Number.parseFloat(getComputedStyle(e.target.firstElementChild).marginTop)){
        document.getElementById('settingsContainer').setAttribute('scrolled', '')
    } else {
        document.getElementById('settingsContainer').removeAttribute('scrolled')
    }
}

/**
 * Resetear tabs de settings a estado por defecto: "Cuenta" seleccionada, scroll en 0.
 * Se llama al abrir Settings o al inicializar tabs.
 */
function resetSettingsTabsToDefault(){
    // Remover 'selected' de todos los nav items
    const navItems = document.getElementsByClassName('settingsNavItem')
    for(let i=0; i<navItems.length; i++){
        navItems[i].removeAttribute('selected')
    }
    
    // Remover 'active' de todas las tabs
    const allTabs = document.getElementsByClassName('settingsTab')
    for(let i=0; i<allTabs.length; i++){
        allTabs[i].removeAttribute('active')
        allTabs[i].classList.remove('animating')
    }
    
    // Forzar selección de "Cuenta" (settingsTabAccount)
    selectedSettingsTab = 'settingsTabAccount'
    const accountNavBtn = document.getElementById('settingsNavAccount')
    const accountTab = document.getElementById('settingsTabAccount')
    
    if(accountNavBtn) accountNavBtn.setAttribute('selected', '')
    if(accountTab) {
        accountTab.setAttribute('active', '')
        accountTab.classList.add('animating')
        
        // Forzar reflow
        void accountTab.offsetHeight
        
        // Remover animating para iniciar transition
        requestAnimationFrame(() => {
            accountTab.classList.remove('animating')
        })
    }
    
    // Resetear scroll del contenedor principal
    const containerRight = document.getElementById('settingsContainerRight')
    if(containerRight) {
        containerRight.scrollTop = 0
        containerRight.onscroll = settingsTabScrollListener
    }
}

/**
 * Bind functionality for the settings navigation items.
 */
function setupSettingsTabs(){
    Array.from(document.getElementsByClassName('settingsNavItem')).map((val) => {
        if(val.hasAttribute('rSc')){
            val.onclick = () => {
                settingsNavItemListener(val)
            }
        }
    })
    
    // Forzar tab inicial: SIEMPRE "Cuenta" (settingsTabAccount)
    resetSettingsTabsToDefault()
}

/**
 * Settings nav item onclick lisener. Function is exposed so that
 * other UI elements can quickly toggle to a certain tab from other views.
 * 
 * @param {Element} ele The nav item which has been clicked.
 * @param {boolean} fade Optional. True to fade transition.
 */
function settingsNavItemListener(ele, fade = true){
    if(ele.hasAttribute('selected')){
        return
    }
    const navItems = document.getElementsByClassName('settingsNavItem')
    for(let i=0; i<navItems.length; i++){
        if(navItems[i].hasAttribute('selected')){
            navItems[i].removeAttribute('selected')
        }
    }
    ele.setAttribute('selected', '')
    let prevTab = selectedSettingsTab
    selectedSettingsTab = ele.getAttribute('rSc')

    // Remover atributo 'active' del tab anterior y agregarlo al nuevo
    const prevTabEl = document.getElementById(prevTab)
    const nextTabEl = document.getElementById(selectedSettingsTab)
    
    if(prevTabEl) {
        prevTabEl.removeAttribute('active')
        prevTabEl.classList.remove('animating')
    }
    
    if(nextTabEl) {
        // Agregar animación de entrada si fade=true
        if(fade) {
            // Agregar active y animating juntos (estado inicial)
            nextTabEl.setAttribute('active', '')
            nextTabEl.classList.add('animating')
            
            // Forzar reflow
            void nextTabEl.offsetHeight
            
            // En el siguiente frame, remover animating para iniciar transition
            requestAnimationFrame(() => {
                nextTabEl.classList.remove('animating')
            })
        } else {
            // Sin animación: activar directamente
            nextTabEl.setAttribute('active', '')
        }
    }
    
    // Resetear scroll del contenedor principal al cambiar tabs
    const containerRight = document.getElementById('settingsContainerRight')
    if(containerRight) containerRight.scrollTop = 0
    
    // Actualizar listener de scroll para el contenedor (no las tabs individuales)
    containerRight.onscroll = settingsTabScrollListener
}

const settingsNavDone = document.getElementById('settingsNavDone')

/**
 * Set if the settings save (done) button is disabled.
 * 
 * @param {boolean} v True to disable, false to enable.
 */
function settingsSaveDisabled(v){
    settingsNavDone.disabled = v
}

function fullSettingsSave() {
    saveSettingsValues()
    saveModConfiguration()
    ConfigManager.save()
    saveDropinModConfiguration()
    saveShaderpackSettings()
}

/* Closes the settings view and saves all data. */
settingsNavDone.onclick = () => {
    fullSettingsSave()
    switchView(getCurrentView(), VIEWS.landing)
}

/**
 * Account Management Tab
 */

const msftLoginLogger = LoggerUtil.getLogger('Microsoft Login')
const msftLogoutLogger = LoggerUtil.getLogger('Microsoft Logout')

// Bind the add mojang account button.
document.getElementById('settingsAddMojangAccount').onclick = (e) => {
    switchView(getCurrentView(), VIEWS.login, 500, 500, () => {
        loginViewOnCancel = VIEWS.settings
        loginViewOnSuccess = VIEWS.settings
        loginCancelEnabled(true)
        showNormalLogin()
    })
}

// Bind the add microsoft account button.
document.getElementById('settingsAddMicrosoftAccount').onclick = (e) => {
    switchView(getCurrentView(), VIEWS.waiting, 500, 500, () => {
        ipcRenderer.send(MSFT_OPCODE.OPEN_LOGIN, VIEWS.settings, VIEWS.settings)
    })
}

// Bind the add offline account button.
document.getElementById('settingsAddOfflineAccount').onclick = (e) => {
    switchView(getCurrentView(), VIEWS.login, 500, 500, () => {
        loginViewOnCancel = VIEWS.settings
        loginViewOnSuccess = VIEWS.settings
        loginCancelEnabled(true)
        showOfflineLogin()
    })
}

// Bind reply for Microsoft Login.
ipcRenderer.on(MSFT_OPCODE.REPLY_LOGIN, (_, ...arguments_) => {
    if (arguments_[0] === MSFT_REPLY_TYPE.ERROR) {

        const viewOnClose = arguments_[2]
        console.log(arguments_)
        switchView(getCurrentView(), viewOnClose, 500, 500, () => {

            if(arguments_[1] === MSFT_ERROR.NOT_FINISHED) {
                // User cancelled.
                msftLoginLogger.info('Login cancelled by user.')
                return
            }

            // Unexpected error.
            setOverlayContent(
                Lang.queryJS('settings.msftLogin.errorTitle'),
                Lang.queryJS('settings.msftLogin.errorMessage'),
                Lang.queryJS('settings.msftLogin.okButton')
            )
            setOverlayHandler(() => {
                toggleOverlay(false)
            })
            toggleOverlay(true)
        })
    } else if(arguments_[0] === MSFT_REPLY_TYPE.SUCCESS) {
        const queryMap = arguments_[1]
        const viewOnClose = arguments_[2]

        // Error from request to Microsoft.
        if (Object.prototype.hasOwnProperty.call(queryMap, 'error')) {
            switchView(getCurrentView(), viewOnClose, 500, 500, () => {
                // TODO Dont know what these errors are. Just show them I guess.
                // This is probably if you messed up the app registration with Azure.      
                let error = queryMap.error // Error might be 'access_denied' ?
                let errorDesc = queryMap.error_description
                console.log('Error getting authCode, is Azure application registered correctly?')
                console.log(error)
                console.log(errorDesc)
                console.log('Full query map: ', queryMap)
                setOverlayContent(
                    error,
                    errorDesc,
                    Lang.queryJS('settings.msftLogin.okButton')
                )
                setOverlayHandler(() => {
                    toggleOverlay(false)
                })
                toggleOverlay(true)

            })
        } else {

            msftLoginLogger.info('Acquired authCode, proceeding with authentication.')

            const authCode = queryMap.code
            AuthManager.addMicrosoftAccount(authCode).then(value => {
                updateSelectedAccount(value)
                switchView(getCurrentView(), viewOnClose, 500, 500, async () => {
                    await prepareSettings()
                })
            })
                .catch((displayableError) => {

                    let actualDisplayableError
                    if(isDisplayableError(displayableError)) {
                        msftLoginLogger.error('Error while logging in.', displayableError)
                        actualDisplayableError = displayableError
                    } else {
                        // Uh oh.
                        msftLoginLogger.error('Unhandled error during login.', displayableError)
                        actualDisplayableError = Lang.queryJS('login.error.unknown')
                    }

                    switchView(getCurrentView(), viewOnClose, 500, 500, () => {
                        setOverlayContent(actualDisplayableError.title, actualDisplayableError.desc, Lang.queryJS('login.tryAgain'))
                        setOverlayHandler(() => {
                            toggleOverlay(false)
                        })
                        toggleOverlay(true)
                    })
                })
        }
    }
})

/**
 * Bind functionality for the account selection buttons. If another account
 * is selected, the UI of the previously selected account will be updated.
 */
function bindAuthAccountSelect(){
    Array.from(document.getElementsByClassName('settingsAuthAccountSelect')).map((val) => {
        val.onclick = (e) => {
            if(val.hasAttribute('selected')){
                return
            }
            const selectBtns = document.getElementsByClassName('settingsAuthAccountSelect')
            for(let i=0; i<selectBtns.length; i++){
                if(selectBtns[i].hasAttribute('selected')){
                    selectBtns[i].removeAttribute('selected')
                    selectBtns[i].innerHTML = Lang.queryJS('settings.authAccountSelect.selectButton')
                }
            }
            val.setAttribute('selected', '')
            val.innerHTML = Lang.queryJS('settings.authAccountSelect.selectedButton')
            setSelectedAccount(val.closest('.settingsAuthAccount').getAttribute('uuid'))
        }
    })
}

/**
 * Bind functionality for the log out button. If the logged out account was
 * the selected account, another account will be selected and the UI will
 * be updated accordingly.
 */
function bindAuthAccountLogOut(){
    Array.from(document.getElementsByClassName('settingsAuthAccountLogOut')).map((val) => {
        val.onclick = (e) => {
            let isLastAccount = false
            if(Object.keys(ConfigManager.getAuthAccounts()).length === 1){
                isLastAccount = true
                setOverlayContent(
                    Lang.queryJS('settings.authAccountLogout.lastAccountWarningTitle'),
                    Lang.queryJS('settings.authAccountLogout.lastAccountWarningMessage'),
                    Lang.queryJS('settings.authAccountLogout.confirmButton'),
                    Lang.queryJS('settings.authAccountLogout.cancelButton')
                )
                setOverlayHandler(() => {
                    processLogOut(val, isLastAccount)
                    toggleOverlay(false)
                })
                setDismissHandler(() => {
                    toggleOverlay(false)
                })
                toggleOverlay(true, true)
            } else {
                processLogOut(val, isLastAccount)
            }
            
        }
    })
}

let msAccDomElementCache
/**
 * Process a log out.
 * 
 * @param {Element} val The log out button element.
 * @param {boolean} isLastAccount If this logout is on the last added account.
 */
function processLogOut(val, isLastAccount){
    const parent = val.closest('.settingsAuthAccount')
    const uuid = parent.getAttribute('uuid')
    const prevSelAcc = ConfigManager.getSelectedAccount()
    const targetAcc = ConfigManager.getAuthAccount(uuid)
    if(targetAcc.type === 'microsoft') {
        msAccDomElementCache = parent
        switchView(getCurrentView(), VIEWS.waiting, 500, 500, () => {
            ipcRenderer.send(MSFT_OPCODE.OPEN_LOGOUT, uuid, isLastAccount)
        })
    } else if(targetAcc.type === 'offline') {
        // Handle offline account logout
        AuthManager.removeOfflineAccount(uuid).then(() => {
            if(!isLastAccount && uuid === prevSelAcc.uuid){
                const selAcc = ConfigManager.getSelectedAccount()
                refreshAuthAccountSelected(selAcc.uuid)
                updateSelectedAccount(selAcc)
                validateSelectedAccount()
            }
            if(isLastAccount) {
                loginOptionsCancelEnabled(false)
                loginOptionsViewOnLoginSuccess = VIEWS.settings
                loginOptionsViewOnLoginCancel = VIEWS.loginOptions
                switchView(getCurrentView(), VIEWS.loginOptions)
            }
        })
        $(parent).fadeOut(250, () => {
            parent.remove()
        })
    } else {
        // Mojang account
        AuthManager.removeMojangAccount(uuid).then(() => {
            if(!isLastAccount && uuid === prevSelAcc.uuid){
                const selAcc = ConfigManager.getSelectedAccount()
                refreshAuthAccountSelected(selAcc.uuid)
                updateSelectedAccount(selAcc)
                validateSelectedAccount()
            }
            if(isLastAccount) {
                loginOptionsCancelEnabled(false)
                loginOptionsViewOnLoginSuccess = VIEWS.settings
                loginOptionsViewOnLoginCancel = VIEWS.loginOptions
                switchView(getCurrentView(), VIEWS.loginOptions)
            }
        })
        $(parent).fadeOut(250, () => {
            parent.remove()
        })
    }
}

// Bind reply for Microsoft Logout.
ipcRenderer.on(MSFT_OPCODE.REPLY_LOGOUT, (_, ...arguments_) => {
    if (arguments_[0] === MSFT_REPLY_TYPE.ERROR) {
        switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {

            if(arguments_.length > 1 && arguments_[1] === MSFT_ERROR.NOT_FINISHED) {
                // User cancelled.
                msftLogoutLogger.info('Logout cancelled by user.')
                return
            }

            // Unexpected error.
            setOverlayContent(
                Lang.queryJS('settings.msftLogout.errorTitle'),
                Lang.queryJS('settings.msftLogout.errorMessage'),
                Lang.queryJS('settings.msftLogout.okButton')
            )
            setOverlayHandler(() => {
                toggleOverlay(false)
            })
            toggleOverlay(true)
        })
    } else if(arguments_[0] === MSFT_REPLY_TYPE.SUCCESS) {
        
        const uuid = arguments_[1]
        const isLastAccount = arguments_[2]
        const prevSelAcc = ConfigManager.getSelectedAccount()

        msftLogoutLogger.info('Logout Successful. uuid:', uuid)
        
        AuthManager.removeMicrosoftAccount(uuid)
            .then(() => {
                if(!isLastAccount && uuid === prevSelAcc.uuid){
                    const selAcc = ConfigManager.getSelectedAccount()
                    refreshAuthAccountSelected(selAcc.uuid)
                    updateSelectedAccount(selAcc)
                    validateSelectedAccount()
                }
                if(isLastAccount) {
                    loginOptionsCancelEnabled(false)
                    loginOptionsViewOnLoginSuccess = VIEWS.settings
                    loginOptionsViewOnLoginCancel = VIEWS.loginOptions
                    switchView(getCurrentView(), VIEWS.loginOptions)
                }
                if(msAccDomElementCache) {
                    msAccDomElementCache.remove()
                    msAccDomElementCache = null
                }
            })
            .finally(() => {
                if(!isLastAccount) {
                    switchView(getCurrentView(), VIEWS.settings, 500, 500)
                }
            })

    }
})

/**
 * Refreshes the status of the selected account on the auth account
 * elements.
 * 
 * @param {string} uuid The UUID of the new selected account.
 */
function refreshAuthAccountSelected(uuid){
    Array.from(document.getElementsByClassName('settingsAuthAccount')).map((val) => {
        const selBtn = val.getElementsByClassName('settingsAuthAccountSelect')[0]
        if(uuid === val.getAttribute('uuid')){
            selBtn.setAttribute('selected', '')
            selBtn.innerHTML = Lang.queryJS('settings.authAccountSelect.selectedButton')
        } else {
            if(selBtn.hasAttribute('selected')){
                selBtn.removeAttribute('selected')
            }
            selBtn.innerHTML = Lang.queryJS('settings.authAccountSelect.selectButton')
        }
    })
}

const settingsCurrentMicrosoftAccounts = document.getElementById('settingsCurrentMicrosoftAccounts')
const settingsCurrentMojangAccounts = document.getElementById('settingsCurrentMojangAccounts')

// Importar SkinManager para gestión de skins offline
const SkinManager = require('./assets/js/skinmanager')

/**
 * Add auth account elements for each one stored in the authentication database.
 */
function populateAuthAccounts(){
    const authAccounts = ConfigManager.getAuthAccounts()
    const authKeys = Object.keys(authAccounts)
    if(authKeys.length === 0){
        return
    }
    const selectedUUID = ConfigManager.getSelectedAccount().uuid

    let microsoftAuthAccountStr = ''
    let mojangAuthAccountStr = ''
    let offlineAuthAccountStr = ''

    authKeys.forEach((val) => {
        const acc = authAccounts[val]

        // Determine account type badge and image source
        let accountTypeBadge = ''
        let accountImage = ''
        let skinButton = ''
        
        if(acc.type === 'microsoft') {
            accountTypeBadge = '<span class="settingsAuthAccountBadge badgeMicrosoft">Microsoft</span>'
            accountImage = `https://mc-heads.net/body/${acc.uuid}/115`
        } else if(acc.type === 'mojang') {
            accountTypeBadge = '<span class="settingsAuthAccountBadge badgeMojang">Mojang</span>'
            accountImage = `https://mc-heads.net/body/${acc.uuid}/115`
        } else if(acc.type === 'offline') {
            accountTypeBadge = '<span class="settingsAuthAccountBadge badgeOffline">Offline</span>'
            // Usar skin local si existe, sino fallback a mc-heads
            accountImage = SkinManager.getSkinDisplayUrl(acc.uuid, 'offline')
            // Añadir botón de editar skin para cuentas offline
            skinButton = `<button class="settingsAuthAccountSkin" data-uuid="${acc.uuid}" title="${Lang.queryJS('settings.skinEditor.editSkinTooltip')}">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <span>${Lang.queryJS('settings.skinEditor.skinButton')}</span>
            </button>`
        }

        const accHtml = `<div class="settingsAuthAccount" uuid="${acc.uuid}" data-type="${acc.type}">
            <div class="settingsAuthAccountLeft">
                <img class="settingsAuthAccountImage" alt="${acc.displayName}" src="${accountImage}">
            </div>
            <div class="settingsAuthAccountRight">
                <div class="settingsAuthAccountDetails">
                    <div class="settingsAuthAccountDetailPane">
                        <div class="settingsAuthAccountDetailTitle">${Lang.queryJS('settings.authAccountPopulate.username')}</div>
                        <div class="settingsAuthAccountDetailValue">${acc.displayName} ${accountTypeBadge}</div>
                    </div>
                    <div class="settingsAuthAccountDetailPane">
                        <div class="settingsAuthAccountDetailTitle">${Lang.queryJS('settings.authAccountPopulate.uuid')}</div>
                        <div class="settingsAuthAccountDetailValue">${acc.uuid}</div>
                    </div>
                </div>
                <div class="settingsAuthAccountActions">
                    ${skinButton}
                    <button class="settingsAuthAccountSelect" ${selectedUUID === acc.uuid ? 'selected>' + Lang.queryJS('settings.authAccountPopulate.selectedAccount') : '>' + Lang.queryJS('settings.authAccountPopulate.selectAccount')}</button>
                    <div class="settingsAuthAccountWrapper">
                        <button class="settingsAuthAccountLogOut">${Lang.queryJS('settings.authAccountPopulate.logout')}</button>
                    </div>
                </div>
            </div>
        </div>`

        if(acc.type === 'microsoft') {
            microsoftAuthAccountStr += accHtml
        } else if(acc.type === 'offline') {
            offlineAuthAccountStr += accHtml
        } else {
            mojangAuthAccountStr += accHtml
        }

    })

    settingsCurrentMicrosoftAccounts.innerHTML = microsoftAuthAccountStr
    settingsCurrentMojangAccounts.innerHTML = mojangAuthAccountStr
    
    // Add offline accounts section if there are offline accounts
    if(offlineAuthAccountStr !== '') {
        const offlineContainer = document.getElementById('settingsCurrentOfflineAccounts')
        if(offlineContainer) {
            offlineContainer.innerHTML = offlineAuthAccountStr
        }
    }
}

/**
 * Prepare the accounts tab for display.
 */
function prepareAccountsTab() {
    populateAuthAccounts()
    bindAuthAccountSelect()
    bindAuthAccountLogOut()
    bindAuthAccountSkinButtons()
}

// ==================== SKIN EDITOR ====================

// Estado del editor de skins
let skinEditorState = {
    uuid: null,
    username: null,
    originalSkinPath: null,
    pendingSkinPath: null,
    pendingModel: 'classic',
    hasChanges: false
}

/**
 * Bind click handlers for skin edit buttons on offline accounts.
 */
function bindAuthAccountSkinButtons() {
    const skinButtons = document.querySelectorAll('.settingsAuthAccountSkin')
    skinButtons.forEach(btn => {
        btn.onclick = () => {
            const uuid = btn.getAttribute('data-uuid')
            openSkinEditor(uuid)
        }
    })
}

/**
 * Open the skin editor overlay for a specific account.
 * @param {string} uuid - UUID of the offline account
 */
async function openSkinEditor(uuid) {
    const account = ConfigManager.getAuthAccount(uuid)
    if (!account || account.type !== 'offline') {
        return
    }

    // Inicializar estado
    const skinInfo = SkinManager.getSkinForUUID(uuid)
    skinEditorState = {
        uuid: uuid,
        username: account.displayName,
        originalSkinPath: skinInfo.path,
        pendingSkinPath: null,
        pendingModel: skinInfo.model || 'classic',
        hasChanges: false
    }

    // Mostrar overlay primero para que el DOM exista
    toggleOverlay(true, true, 'skinEditorContent')

    // Pequeño delay para asegurar que el overlay está renderizado
    await new Promise(resolve => setTimeout(resolve, 50))

    // AHORA sí podemos acceder a los elementos del DOM y bindear handlers
    bindSkinEditorHandlers()

    // Actualizar UI del editor
    const usernameEl = document.getElementById('skinEditorUsername')
    if (usernameEl) usernameEl.textContent = account.displayName

    // Cargar preview actual
    await refreshSkinEditorPreview()

    // Actualizar selector de modelo
    updateModelSelector(skinEditorState.pendingModel)

    // Mostrar/ocultar botón de eliminar según si hay skin
    const removeBtn = document.getElementById('skinEditorRemoveSkin')
    if (removeBtn) removeBtn.style.display = skinInfo.exists ? 'flex' : 'none'

    // Ocultar botones de guardar/descartar (no hay cambios aún)
    setSkinEditorPendingState(false)

    // Cargar galería
    await loadSkinGallery()
}

/**
 * Refresh the skin preview canvas in the editor.
 */
async function refreshSkinEditorPreview() {
    const canvas = document.getElementById('skinEditorCanvas')
    const placeholder = document.getElementById('skinEditorNoSkin')
    
    // Determinar qué skin mostrar
    const skinPath = skinEditorState.pendingSkinPath || skinEditorState.originalSkinPath
    
    if (skinPath) {
        // Ocultar placeholder, mostrar canvas
        placeholder.style.display = 'none'
        canvas.style.display = 'block'
        
        // Renderizar preview
        const model = skinEditorState.pendingModel
        await SkinManager.renderSkinPreview(canvas, skinPath, model)
    } else {
        // Mostrar placeholder, ocultar canvas
        canvas.style.display = 'none'
        placeholder.style.display = 'flex'
    }
}

/**
 * Update the model selector buttons.
 * @param {string} model - 'classic' or 'slim'
 */
function updateModelSelector(model) {
    const buttons = document.querySelectorAll('.skinEditorModelBtn')
    buttons.forEach(btn => {
        if (btn.getAttribute('data-model') === model) {
            btn.classList.add('active')
        } else {
            btn.classList.remove('active')
        }
    })
}

/**
 * Set the pending changes state in the skin editor UI.
 * @param {boolean} hasPending - Whether there are unsaved changes
 */
function setSkinEditorPendingState(hasPending) {
    skinEditorState.hasChanges = hasPending
    
    document.getElementById('skinEditorPendingChanges').style.display = hasPending ? 'flex' : 'none'
    document.getElementById('skinEditorSave').style.display = hasPending ? 'flex' : 'none'
    document.getElementById('skinEditorDiscard').style.display = hasPending ? 'flex' : 'none'
    document.getElementById('skinEditorClose').style.display = hasPending ? 'none' : 'flex'
}

/**
 * Load and display the skin gallery.
 */
async function loadSkinGallery() {
    const galleryGrid = document.getElementById('skinEditorGalleryGrid')
    const skins = await SkinManager.listGallerySkins()
    
    if (skins.length === 0) {
        galleryGrid.innerHTML = `<div class="skinEditorGalleryEmpty">
            <span>${Lang.queryJS('settings.skinEditor.galleryEmpty')}</span>
        </div>`
        return
    }
    
    let galleryHtml = ''
    for (const skin of skins) {
        galleryHtml += `<div class="skinEditorGalleryItem" data-path="${skin.path}" title="${skin.name}">
            <canvas class="skinEditorGalleryCanvas" width="32" height="32"></canvas>
            <span class="skinEditorGalleryName">${skin.name}</span>
        </div>`
    }
    
    galleryGrid.innerHTML = galleryHtml
    
    // Renderizar miniaturas
    const items = galleryGrid.querySelectorAll('.skinEditorGalleryItem')
    for (const item of items) {
        const canvas = item.querySelector('.skinEditorGalleryCanvas')
        const skinPath = item.getAttribute('data-path')
        await SkinManager.renderSkinHead(canvas, skinPath)
        
        // Bind click handler
        item.onclick = () => selectGallerySkin(skinPath)
    }
}

/**
 * Select a skin from the gallery.
 * @param {string} skinPath - Path to the selected skin
 */
async function selectGallerySkin(skinPath) {
    skinEditorState.pendingSkinPath = skinPath
    setSkinEditorPendingState(true)
    await refreshSkinEditorPreview()
}

/**
 * Handle the "Change Skin" button click - open file dialog.
 */
async function handleSkinFileSelect() {
    try {
        const result = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
            title: Lang.queryJS('settings.skinEditor.dialogTitle'),
            properties: ['openFile'],
            filters: [
                { name: Lang.queryJS('settings.skinEditor.pngFiles'), extensions: ['png'] }
            ]
        })
        
        if (result.canceled || result.filePaths.length === 0) {
            return
        }
        
        const filePath = result.filePaths[0]
        
        // Validar la imagen
        const validation = await SkinManager.validateSkinImage(filePath)
        if (!validation.valid) {
            let errorMsg = Lang.queryJS('settings.skinEditor.invalidImage')
            if (validation.error === 'INVALID_DIMENSIONS' && validation.dimensions) {
                errorMsg = Lang.queryJS('settings.skinEditor.invalidDimensions')
                    .replace('{width}', validation.dimensions.width)
                    .replace('{height}', validation.dimensions.height)
            }
            
            // Guardar UUID actual para reabrir después del error
            const currentUuid = skinEditorState.uuid
            
            setOverlayContent(
                Lang.queryJS('settings.skinEditor.errorTitle'),
                errorMsg,
                Lang.queryJS('settings.skinEditor.okButton')
            )
            setOverlayHandler(() => {
                toggleOverlay(false)
                // Reabrir el editor de skins después de cerrar el error
                setTimeout(() => openSkinEditor(currentUuid), 300)
            })
            toggleOverlay(true, true)
            return
        }
        
        // Skin válida - actualizar estado y preview
        skinEditorState.pendingSkinPath = filePath
        setSkinEditorPendingState(true)
        await refreshSkinEditorPreview()
    } catch (error) {
        console.error('Error al seleccionar archivo de skin:', error)
    }
}

/**
 * Save the pending skin changes.
 */
async function saveSkinChanges() {
    if (!skinEditorState.hasChanges || !skinEditorState.pendingSkinPath) {
        return
    }
    
    try {
        const result = await SkinManager.setSkinForUUID(
            skinEditorState.uuid,
            skinEditorState.pendingSkinPath,
            skinEditorState.pendingModel
        )
        
        if (result.success) {
            // Actualizar estado
            skinEditorState.originalSkinPath = result.path
            skinEditorState.pendingSkinPath = null
            skinEditorState.hasChanges = false
            
            // Refrescar UI
            setSkinEditorPendingState(false)
            const removeBtn = document.getElementById('skinEditorRemoveSkin')
            if (removeBtn) removeBtn.style.display = 'flex'
            
            // Refrescar lista de cuentas para mostrar nueva skin
            populateAuthAccounts()
            bindAuthAccountSelect()
            bindAuthAccountLogOut()
            bindAuthAccountSkinButtons()
            
            // Cerrar editor con un pequeño delay para feedback visual
            setTimeout(() => closeSkinEditor(), 200)
        } else {
            // Guardar UUID para reabrir después del error
            const currentUuid = skinEditorState.uuid
            
            // Mostrar error
            setOverlayContent(
                Lang.queryJS('settings.skinEditor.errorTitle'),
                Lang.queryJS('settings.skinEditor.saveError'),
                Lang.queryJS('settings.skinEditor.okButton')
            )
            setOverlayHandler(() => {
                toggleOverlay(false)
                setTimeout(() => openSkinEditor(currentUuid), 300)
            })
            toggleOverlay(true, true)
        }
    } catch (error) {
        console.error('Error al guardar skin:', error)
    }
}

/**
 * Discard pending skin changes.
 */
async function discardSkinChanges() {
    skinEditorState.pendingSkinPath = null
    skinEditorState.hasChanges = false
    setSkinEditorPendingState(false)
    await refreshSkinEditorPreview()
}

/**
 * Remove the current skin from the account.
 */
async function removeSkin() {
    try {
        const result = await SkinManager.deleteSkinForUUID(skinEditorState.uuid)
        
        if (result.success) {
            skinEditorState.originalSkinPath = null
            skinEditorState.pendingSkinPath = null
            skinEditorState.hasChanges = false
            
            setSkinEditorPendingState(false)
            const removeBtn = document.getElementById('skinEditorRemoveSkin')
            if (removeBtn) removeBtn.style.display = 'none'
            await refreshSkinEditorPreview()
            
            // Refrescar lista de cuentas
            populateAuthAccounts()
            bindAuthAccountSelect()
            bindAuthAccountLogOut()
            bindAuthAccountSkinButtons()
        }
    } catch (error) {
        console.error('Error al eliminar skin:', error)
    }
}

/**
 * Close the skin editor overlay.
 */
function closeSkinEditor() {
    toggleOverlay(false)
    skinEditorState = {
        uuid: null,
        username: null,
        originalSkinPath: null,
        pendingSkinPath: null,
        pendingModel: 'classic',
        hasChanges: false
    }
}

/**
 * Bind all skin editor event handlers.
 * Se llama cada vez que se abre el editor para asegurar que los elementos existen.
 */
function bindSkinEditorHandlers() {
    // Botón "Cambiar Skin"
    const changeSkinBtn = document.getElementById('skinEditorChangeSkin')
    if (changeSkinBtn) {
        changeSkinBtn.onclick = handleSkinFileSelect
    }

    // Botón "Guardar"
    const saveBtn = document.getElementById('skinEditorSave')
    if (saveBtn) {
        saveBtn.onclick = saveSkinChanges
    }

    // Botón "Descartar"
    const discardBtn = document.getElementById('skinEditorDiscard')
    if (discardBtn) {
        discardBtn.onclick = discardSkinChanges
    }

    // Botón "Eliminar Skin"
    const removeBtn = document.getElementById('skinEditorRemoveSkin')
    if (removeBtn) {
        removeBtn.onclick = removeSkin
    }

    // Botón "Cerrar"
    const closeBtn = document.getElementById('skinEditorClose')
    if (closeBtn) {
        closeBtn.onclick = closeSkinEditor
    }

    // Botones de selector de modelo
    const modelButtons = document.querySelectorAll('.skinEditorModelBtn')
    modelButtons.forEach(btn => {
        btn.onclick = async () => {
            const model = btn.getAttribute('data-model')
            skinEditorState.pendingModel = model
            updateModelSelector(model)
            
            // Si hay una skin (pendiente o original), marcar como cambio y refrescar
            if (skinEditorState.pendingSkinPath || skinEditorState.originalSkinPath) {
                const originalModel = SkinManager.getSkinForUUID(skinEditorState.uuid)?.model || 'classic'
                if (model !== originalModel || skinEditorState.pendingSkinPath) {
                    setSkinEditorPendingState(true)
                }
                await refreshSkinEditorPreview()
            }
        }
    })
}

// Escuchar evento de skin actualizada (este se registra una sola vez)
if (typeof window !== 'undefined' && !window.__skinEditorEventListenerRegistered) {
    window.addEventListener(SkinManager.SKIN_UPDATED_EVENT, (e) => {
        const { uuid } = e.detail
        
        // Actualizar imagen en la lista de cuentas si está visible
        const accountElements = document.querySelectorAll(`.settingsAuthAccount[uuid="${uuid}"]`)
        accountElements.forEach(el => {
            const img = el.querySelector('.settingsAuthAccountImage')
            if (img) {
                // Forzar recarga añadiendo timestamp
                const newUrl = SkinManager.getSkinDisplayUrl(uuid, 'offline')
                img.src = newUrl.includes('?') ? `${newUrl}&t=${Date.now()}` : `${newUrl}?t=${Date.now()}`
            }
        })
        
        // Actualizar avatar en landing si es la cuenta seleccionada
        const selectedAccount = ConfigManager.getSelectedAccount()
        if (selectedAccount && selectedAccount.uuid === uuid && authUser.type === 'offline') {
            // Forzar recarga del avatar
            updateSelectedAccount(selectedAccount)
        }
    })
    window.__skinEditorEventListenerRegistered = true
}

// ==================== FIN SKIN EDITOR ====================

/**
 * Minecraft Tab
 */

/**
  * Disable decimals, negative signs, and scientific notation.
  */
document.getElementById('settingsGameWidth').addEventListener('keydown', (e) => {
    if(/^[-.eE]$/.test(e.key)){
        e.preventDefault()
    }
})
document.getElementById('settingsGameHeight').addEventListener('keydown', (e) => {
    if(/^[-.eE]$/.test(e.key)){
        e.preventDefault()
    }
})

/**
 * Mods Tab
 */

const settingsModsContainer = document.getElementById('settingsModsContainer')

/**
 * Resolve and update the mods on the UI.
 */
async function resolveModsForUI(){
    // Si hay una instalación custom seleccionada, no tiene mods de distribución
    const selectedInstallId = ConfigManager.getSelectedInstallation()
    if(selectedInstallId) {
        document.getElementById('settingsReqModsContent').innerHTML = ''
        document.getElementById('settingsOptModsContent').innerHTML = ''
        return
    }
    
    const serv = ConfigManager.getSelectedServer()

    const distro = await DistroAPI.getDistribution()
    const servConf = ConfigManager.getModConfiguration(serv)

    const modStr = parseModulesForUI(distro.getServerById(serv).modules, false, servConf.mods)

    document.getElementById('settingsReqModsContent').innerHTML = modStr.reqMods
    document.getElementById('settingsOptModsContent').innerHTML = modStr.optMods
}

/**
 * Recursively build the mod UI elements.
 * 
 * @param {Object[]} mdls An array of modules to parse.
 * @param {boolean} submodules Whether or not we are parsing submodules.
 * @param {Object} servConf The server configuration object for this module level.
 */
function parseModulesForUI(mdls, submodules, servConf){

    let reqMods = ''
    let optMods = ''

    for(const mdl of mdls){

        if(mdl.rawModule.type === Type.ForgeMod || mdl.rawModule.type === Type.LiteMod || mdl.rawModule.type === Type.LiteLoader || mdl.rawModule.type === Type.FabricMod){

            if(mdl.getRequired().value){

                reqMods += `<div id="${mdl.getVersionlessMavenIdentifier()}" class="settingsBaseMod settings${submodules ? 'Sub' : ''}Mod" enabled>
                    <div class="settingsModContent">
                        <div class="settingsModMainWrapper">
                            <div class="settingsModStatus"></div>
                            <div class="settingsModDetails">
                                <span class="settingsModName">${mdl.rawModule.name}</span>
                                <span class="settingsModVersion">v${mdl.mavenComponents.version}</span>
                            </div>
                        </div>
                        <label class="toggleSwitch" reqmod>
                            <input type="checkbox" checked>
                            <span class="toggleSwitchSlider"></span>
                        </label>
                    </div>
                    ${mdl.subModules.length > 0 ? `<div class="settingsSubModContainer">
                        ${Object.values(parseModulesForUI(mdl.subModules, true, servConf[mdl.getVersionlessMavenIdentifier()])).join('')}
                    </div>` : ''}
                </div>`

            } else {

                const conf = servConf[mdl.getVersionlessMavenIdentifier()]
                const val = typeof conf === 'object' ? conf.value : conf

                optMods += `<div id="${mdl.getVersionlessMavenIdentifier()}" class="settingsBaseMod settings${submodules ? 'Sub' : ''}Mod" ${val ? 'enabled' : ''}>
                    <div class="settingsModContent">
                        <div class="settingsModMainWrapper">
                            <div class="settingsModStatus"></div>
                            <div class="settingsModDetails">
                                <span class="settingsModName">${mdl.rawModule.name}</span>
                                <span class="settingsModVersion">v${mdl.mavenComponents.version}</span>
                            </div>
                        </div>
                        <label class="toggleSwitch">
                            <input type="checkbox" formod="${mdl.getVersionlessMavenIdentifier()}" ${val ? 'checked' : ''}>
                            <span class="toggleSwitchSlider"></span>
                        </label>
                    </div>
                    ${mdl.subModules.length > 0 ? `<div class="settingsSubModContainer">
                        ${Object.values(parseModulesForUI(mdl.subModules, true, conf.mods)).join('')}
                    </div>` : ''}
                </div>`

            }
        }
    }

    return {
        reqMods,
        optMods
    }

}

/**
 * Bind functionality to mod config toggle switches. Switching the value
 * will also switch the status color on the left of the mod UI.
 */
function bindModsToggleSwitch(){
    const sEls = settingsModsContainer.querySelectorAll('[formod]')
    Array.from(sEls).map((v, index, arr) => {
        v.onchange = () => {
            if(v.checked) {
                document.getElementById(v.getAttribute('formod')).setAttribute('enabled', '')
            } else {
                document.getElementById(v.getAttribute('formod')).removeAttribute('enabled')
            }
        }
    })
}


/**
 * Save the mod configuration based on the UI values.
 */
function saveModConfiguration(){
    // Si hay instalación custom seleccionada, no hay mods de distribución para guardar
    const selectedInstallId = ConfigManager.getSelectedInstallation()
    if(selectedInstallId) {
        return
    }
    
    const serv = ConfigManager.getSelectedServer()
    const modConf = ConfigManager.getModConfiguration(serv)
    modConf.mods = _saveModConfiguration(modConf.mods)
    ConfigManager.setModConfiguration(serv, modConf)
}

/**
 * Recursively save mod config with submods.
 * 
 * @param {Object} modConf Mod config object to save.
 */
function _saveModConfiguration(modConf){
    for(let m of Object.entries(modConf)){
        const tSwitch = settingsModsContainer.querySelectorAll(`[formod='${m[0]}']`)
        if(!tSwitch[0].hasAttribute('dropin')){
            if(typeof m[1] === 'boolean'){
                modConf[m[0]] = tSwitch[0].checked
            } else {
                if(m[1] != null){
                    if(tSwitch.length > 0){
                        modConf[m[0]].value = tSwitch[0].checked
                    }
                    modConf[m[0]].mods = _saveModConfiguration(modConf[m[0]].mods)
                }
            }
        }
    }
    return modConf
}

// Drop-in mod elements.

let CACHE_SETTINGS_MODS_DIR
let CACHE_DROPIN_MODS

/**
 * Resolve any located drop-in mods for this server and
 * populate the results onto the UI.
 */
async function resolveDropinModsForUI(){
    // Detectar si hay instalación custom o servidor
    const selectedInstallId = ConfigManager.getSelectedInstallation()
    let instanceId, minecraftVersion
    
    if(selectedInstallId) {
        const OptiFineVersions = require('./assets/js/optifineversions')
        
        // Caso 1: Auto-profile (OptiFine)
        if(OptiFineVersions.isAutoProfileId(selectedInstallId)) {
            const autoProfile = await OptiFineVersions.getAutoProfileById(selectedInstallId)
            if(!autoProfile) {
                logger.error(`Auto-profile not found: ${selectedInstallId}`)
                return
            }
            instanceId = autoProfile.id
            minecraftVersion = autoProfile.minecraftVersion
        }
        // Caso 2: Instalación custom
        else {
            const installation = ConfigManager.getInstallation(selectedInstallId)
            if(!installation) {
                logger.error(`Installation not found: ${selectedInstallId}`)
                return
            }
            instanceId = installation.id
            minecraftVersion = installation.version
        }
    } else {
        // Servidor de distribución
        const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
        instanceId = serv.rawServer.id
        minecraftVersion = serv.rawServer.minecraftVersion
    }
    
    CACHE_SETTINGS_MODS_DIR = path.join(ConfigManager.getInstanceDirectory(), instanceId, 'mods')
    CACHE_DROPIN_MODS = DropinModUtil.scanForDropinMods(CACHE_SETTINGS_MODS_DIR, minecraftVersion)

    let dropinMods = ''

    for(dropin of CACHE_DROPIN_MODS){
        dropinMods += `<div id="${dropin.fullName}" class="settingsBaseMod settingsDropinMod" ${!dropin.disabled ? 'enabled' : ''}>
                    <div class="settingsModContent">
                        <div class="settingsModMainWrapper">
                            <div class="settingsModStatus"></div>
                            <div class="settingsModDetails">
                                <span class="settingsModName">${dropin.name}</span>
                                <div class="settingsDropinRemoveWrapper">
                                    <button class="settingsDropinRemoveButton" remmod="${dropin.fullName}">${Lang.queryJS('settings.dropinMods.removeButton')}</button>
                                </div>
                            </div>
                        </div>
                        <label class="toggleSwitch">
                            <input type="checkbox" formod="${dropin.fullName}" dropin ${!dropin.disabled ? 'checked' : ''}>
                            <span class="toggleSwitchSlider"></span>
                        </label>
                    </div>
                </div>`
    }

    document.getElementById('settingsDropinModsContent').innerHTML = dropinMods
}

/**
 * Bind the remove button for each loaded drop-in mod.
 */
function bindDropinModsRemoveButton(){
    const sEls = settingsModsContainer.querySelectorAll('[remmod]')
    Array.from(sEls).map((v, index, arr) => {
        v.onclick = async () => {
            const fullName = v.getAttribute('remmod')
            const res = await DropinModUtil.deleteDropinMod(CACHE_SETTINGS_MODS_DIR, fullName)
            if(res){
                document.getElementById(fullName).remove()
            } else {
                setOverlayContent(
                    Lang.queryJS('settings.dropinMods.deleteFailedTitle', { fullName }),
                    Lang.queryJS('settings.dropinMods.deleteFailedMessage'),
                    Lang.queryJS('settings.dropinMods.okButton')
                )
                setOverlayHandler(null)
                toggleOverlay(true)
            }
        }
    })
}

/**
 * Bind functionality to the file system button for the selected
 * server configuration.
 */
function bindDropinModFileSystemButton(){
    const fsBtn = document.getElementById('settingsDropinFileSystemButton')
    fsBtn.onclick = () => {
        DropinModUtil.validateDir(CACHE_SETTINGS_MODS_DIR)
        shell.openPath(CACHE_SETTINGS_MODS_DIR)
    }
    fsBtn.ondragenter = e => {
        e.dataTransfer.dropEffect = 'move'
        fsBtn.setAttribute('drag', '')
        e.preventDefault()
    }
    fsBtn.ondragover = e => {
        e.preventDefault()
    }
    fsBtn.ondragleave = e => {
        fsBtn.removeAttribute('drag')
    }

    fsBtn.ondrop = async e => {
        fsBtn.removeAttribute('drag')
        e.preventDefault()

        DropinModUtil.addDropinMods(e.dataTransfer.files, CACHE_SETTINGS_MODS_DIR)
        await reloadDropinMods()
    }
}

/**
 * Save drop-in mod states. Enabling and disabling is just a matter
 * of adding/removing the .disabled extension.
 */
function saveDropinModConfiguration(){
    // Validar que CACHE_DROPIN_MODS esté inicializado
    if(!CACHE_DROPIN_MODS || !Array.isArray(CACHE_DROPIN_MODS)){
        CACHE_DROPIN_MODS = []
        return
    }
    
    for(dropin of CACHE_DROPIN_MODS){
        const dropinUI = document.getElementById(dropin.fullName)
        if(dropinUI != null){
            const dropinUIEnabled = dropinUI.hasAttribute('enabled')
            if(DropinModUtil.isDropinModEnabled(dropin.fullName) != dropinUIEnabled){
                DropinModUtil.toggleDropinMod(CACHE_SETTINGS_MODS_DIR, dropin.fullName, dropinUIEnabled).catch(err => {
                    if(!isOverlayVisible()){
                        setOverlayContent(
                            Lang.queryJS('settings.dropinMods.failedToggleTitle'),
                            err.message,
                            Lang.queryJS('settings.dropinMods.okButton')
                        )
                        setOverlayHandler(null)
                        toggleOverlay(true)
                    }
                })
            }
        }
    }
}

// Refresh the drop-in mods when F5 is pressed.
// Only active on the mods tab.
document.addEventListener('keydown', async (e) => {
    if(getCurrentView() === VIEWS.settings && selectedSettingsTab === 'settingsTabMods'){
        if(e.key === 'F5'){
            await reloadDropinMods()
            saveShaderpackSettings()
            await resolveShaderpacksForUI()
        }
    }
})

async function reloadDropinMods(){
    await resolveDropinModsForUI()
    bindDropinModsRemoveButton()
    bindDropinModFileSystemButton()
    bindModsToggleSwitch()
}

// Shaderpack

let CACHE_SETTINGS_INSTANCE_DIR
let CACHE_SHADERPACKS
let CACHE_SELECTED_SHADERPACK

/**
 * Load shaderpack information.
 */
async function resolveShaderpacksForUI(){
    // Detectar si hay instalación custom o servidor
    const selectedInstallId = ConfigManager.getSelectedInstallation()
    let instanceId
    
    if(selectedInstallId) {
        const OptiFineVersions = require('./assets/js/optifineversions')
        
        // Caso 1: Auto-profile (OptiFine)
        if(OptiFineVersions.isAutoProfileId(selectedInstallId)) {
            const autoProfile = await OptiFineVersions.getAutoProfileById(selectedInstallId)
            if(!autoProfile) {
                logger.error(`Auto-profile not found: ${selectedInstallId}`)
                return
            }
            instanceId = autoProfile.id
        }
        // Caso 2: Instalación custom
        else {
            const installation = ConfigManager.getInstallation(selectedInstallId)
            if(!installation) {
                logger.error(`Installation not found: ${selectedInstallId}`)
                return
            }
            instanceId = installation.id
        }
    } else {
        // Servidor de distribución
        const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
        instanceId = serv.rawServer.id
    }
    
    CACHE_SETTINGS_INSTANCE_DIR = path.join(ConfigManager.getInstanceDirectory(), instanceId)
    CACHE_SHADERPACKS = DropinModUtil.scanForShaderpacks(CACHE_SETTINGS_INSTANCE_DIR)
    CACHE_SELECTED_SHADERPACK = DropinModUtil.getEnabledShaderpack(CACHE_SETTINGS_INSTANCE_DIR)

    setShadersOptions(CACHE_SHADERPACKS, CACHE_SELECTED_SHADERPACK)
}

function setShadersOptions(arr, selected){
    const cont = document.getElementById('settingsShadersOptions')
    cont.innerHTML = ''
    for(let opt of arr) {
        const d = document.createElement('DIV')
        d.innerHTML = opt.name
        d.setAttribute('value', opt.fullName)
        if(opt.fullName === selected) {
            d.setAttribute('selected', '')
            document.getElementById('settingsShadersSelected').innerHTML = opt.name
        }
        d.addEventListener('click', function(e) {
            this.parentNode.previousElementSibling.innerHTML = this.innerHTML
            for(let sib of this.parentNode.children){
                sib.removeAttribute('selected')
            }
            this.setAttribute('selected', '')
            closeSettingsSelect()
        })
        cont.appendChild(d)
    }
}

function saveShaderpackSettings(){
    const shadersOptions = document.getElementById('settingsShadersOptions')
    if(!shadersOptions || !CACHE_SETTINGS_INSTANCE_DIR){
        return
    }
    
    let sel = 'OFF'
    for(let opt of shadersOptions.children){
        if(opt.hasAttribute && opt.hasAttribute('selected')){
            sel = opt.getAttribute('value')
        }
    }
    DropinModUtil.setEnabledShaderpack(CACHE_SETTINGS_INSTANCE_DIR, sel)
}

function bindShaderpackButton() {
    const spBtn = document.getElementById('settingsShaderpackButton')
    spBtn.onclick = () => {
        const p = path.join(CACHE_SETTINGS_INSTANCE_DIR, 'shaderpacks')
        DropinModUtil.validateDir(p)
        shell.openPath(p)
    }
    spBtn.ondragenter = e => {
        e.dataTransfer.dropEffect = 'move'
        spBtn.setAttribute('drag', '')
        e.preventDefault()
    }
    spBtn.ondragover = e => {
        e.preventDefault()
    }
    spBtn.ondragleave = e => {
        spBtn.removeAttribute('drag')
    }

    spBtn.ondrop = async e => {
        spBtn.removeAttribute('drag')
        e.preventDefault()

        DropinModUtil.addShaderpacks(e.dataTransfer.files, CACHE_SETTINGS_INSTANCE_DIR)
        saveShaderpackSettings()
        await resolveShaderpacksForUI()
    }
}

// Server status bar functions.

/**
 * Load the currently selected server information onto the mods tab.
 */
async function loadSelectedServerOnModsTab(){
    // Detectar si hay instalación custom seleccionada
    const selectedInstallId = ConfigManager.getSelectedInstallation()
    let displayData
    
    // Importar OptiFineVersions para detectar auto-profiles
    const OptiFineVersions = require('./assets/js/optifineversions')
    
    // Caso 1: Auto-profile (OptiFine detectado)
    if(selectedInstallId && OptiFineVersions.isAutoProfileId(selectedInstallId)) {
        const autoProfile = await OptiFineVersions.getAutoProfileById(selectedInstallId)
        
        if(autoProfile) {
            displayData = {
                icon: 'assets/images/icons/sevenstar_circle.svg',
                name: autoProfile.name,
                description: `OptiFine - MC ${autoProfile.minecraftVersion}`,
                minecraftVersion: autoProfile.minecraftVersion,
                version: 'OptiFine',
                mainServer: false
            }
        } else {
            // Auto-profile no encontrado, usar fallback
            displayData = {
                icon: 'assets/images/icons/sevenstar_circle.svg',
                name: 'OptiFine',
                description: 'Auto-profile no encontrado',
                minecraftVersion: '?',
                version: 'OptiFine',
                mainServer: false
            }
        }
    }
    // Caso 2: Instalación personalizada
    else if(selectedInstallId) {
        // Usar datos de la instalación custom
        const installation = ConfigManager.getInstallation(selectedInstallId)
        
        if(installation) {
            const loaderType = installation.loader?.type || installation.loader || 'vanilla'
            const loaderVersion = installation.loader?.loaderVersion || installation.loaderVersion || ''
            const mcVersion = installation.loader?.minecraftVersion || installation.version || '?'
            
            const loaderText = loaderType === 'vanilla' ? 'Vanilla' : 
                              loaderType === 'forge' ? `Forge ${loaderVersion}` :
                              loaderType === 'fabric' ? `Fabric ${loaderVersion}` :
                              loaderType === 'quilt' ? `Quilt ${loaderVersion}` :
                              loaderType === 'neoforge' ? `NeoForge ${loaderVersion}` : loaderType
            
            displayData = {
                icon: 'assets/images/icons/sevenstar_circle.svg',
                name: installation.name,
                description: `${loaderText} - MC ${mcVersion}`,
                minecraftVersion: mcVersion,
                version: loaderType,
                mainServer: false
            }
        } else {
            // Instalación no encontrada, limpiar selección
            ConfigManager.setSelectedInstallation(null)
            ConfigManager.save()
            // Usar servidor por defecto
            const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
            if(serv) {
                displayData = {
                    icon: serv.rawServer.icon,
                    name: serv.rawServer.name,
                    description: serv.rawServer.description,
                    minecraftVersion: serv.rawServer.minecraftVersion,
                    version: serv.rawServer.version,
                    mainServer: serv.rawServer.mainServer
                }
            } else {
                displayData = {
                    icon: 'assets/images/icons/sevenstar_circle.svg',
                    name: 'Sin selección',
                    description: 'Selecciona un servidor o instalación',
                    minecraftVersion: '?',
                    version: '?',
                    mainServer: false
                }
            }
        }
    } else {
        // Usar servidor de distribución
        const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
        displayData = {
            icon: serv.rawServer.icon,
            name: serv.rawServer.name,
            description: serv.rawServer.description,
            minecraftVersion: serv.rawServer.minecraftVersion,
            version: serv.rawServer.version,
            mainServer: serv.rawServer.mainServer
        }
    }

    for(const el of document.getElementsByClassName('settingsSelServContent')) {
        el.innerHTML = `
            <img class="serverListingImg" src="${displayData.icon}"/>
            <div class="serverListingDetails">
                <span class="serverListingName">${displayData.name}</span>
                <span class="serverListingDescription">${displayData.description}</span>
                <div class="serverListingInfo">
                    <div class="serverListingVersion">${displayData.minecraftVersion}</div>
                    <div class="serverListingRevision">${displayData.version}</div>
                    ${displayData.mainServer ? `<div class="serverListingStarWrapper">
                        <svg id="Layer_1" viewBox="0 0 107.45 104.74" width="20px" height="20px">
                            <defs>
                                <style>.cls-1{fill:#fff;}.cls-2{fill:none;stroke:#fff;stroke-miterlimit:10;}</style>
                            </defs>
                            <path class="cls-1" d="M100.93,65.54C89,62,68.18,55.65,63.54,52.13c2.7-5.23,18.8-19.2,28-27.55C81.36,31.74,63.74,43.87,58.09,45.3c-2.41-5.37-3.61-26.52-4.37-39-.77,12.46-2,33.64-4.36,39-5.7-1.46-23.3-13.57-33.49-20.72,9.26,8.37,25.39,22.36,28,27.55C39.21,55.68,18.47,62,6.52,65.55c12.32-2,33.63-6.06,39.34-4.9-.16,5.87-8.41,26.16-13.11,37.69,6.1-10.89,16.52-30.16,21-33.9,4.5,3.79,14.93,23.09,21,34C70,86.84,61.73,66.48,61.59,60.65,67.36,59.49,88.64,63.52,100.93,65.54Z"/>
                            <circle class="cls-2" cx="53.73" cy="53.9" r="38"/>
                        </svg>
                        <span class="serverListingStarTooltip">${Lang.queryJS('settings.serverListing.mainServer')}</span>
                    </div>` : ''}
                </div>
            </div>
        `
    }
}

// Bind functionality to the server switch button.
Array.from(document.getElementsByClassName('settingsSwitchServerButton')).forEach(el => {
    el.addEventListener('click', async e => {
        e.target.blur()
        await toggleServerSelection(true)
    })
})

/**
 * Save mod configuration for the current selected server.
 */
function saveAllModConfigurations(){
    saveModConfiguration()
    ConfigManager.save()
    saveDropinModConfiguration()
}

/**
 * Function to refresh the current tab whenever the selected
 * server is changed.
 */
function animateSettingsTabRefresh(){
    $(`#${selectedSettingsTab}`).fadeOut(500, async () => {
        await prepareSettings()
        $(`#${selectedSettingsTab}`).fadeIn(500)
    })
}

/**
 * Get the mods directory for a custom installation.
 * @param {string} installId Installation ID
 * @returns {string} Full path to mods directory
 */
function getModsDirectory(installId) {
    const instanceDir = ConfigManager.getInstanceDirectory()
    return path.join(instanceDir, installId, 'mods')
}

/**
 * Scan local mods directory for installed mods.
 * @param {string} modsDir Path to mods directory
 * @returns {Promise<Array>} Array of mod info objects
 */
async function scanLocalMods(modsDir) {
    const fs = require('fs-extra')
    const mods = []
    
    try {
        await fs.ensureDir(modsDir)
        const files = await fs.readdir(modsDir)
        
        for (const file of files) {
            if (file.endsWith('.jar')) {
                const filePath = path.join(modsDir, file)
                const stats = await fs.stat(filePath)
                
                mods.push({
                    fileName: file,
                    name: file.replace('.jar', ''),
                    size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
                    enabled: true,
                    path: filePath
                })
            } else if (file.endsWith('.jar.disabled')) {
                const filePath = path.join(modsDir, file)
                const stats = await fs.stat(filePath)
                
                mods.push({
                    fileName: file,
                    name: file.replace('.jar.disabled', ''),
                    size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
                    enabled: false,
                    path: filePath
                })
            }
        }
    } catch (err) {
        logger.error('Error scanning mods directory:', err)
    }
    
    return mods
}

/**
 * Toggle mod enabled/disabled state.
 * @param {string} modPath Full path to mod file
 * @param {boolean} currentState Current enabled state
 */
async function toggleLocalMod(modPath, currentState) {
    const fs = require('fs-extra')
    try {
        if (currentState) {
            // Disable: rename .jar to .jar.disabled
            await fs.rename(modPath, modPath + '.disabled')
        } else {
            // Enable: rename .jar.disabled to .jar
            await fs.rename(modPath, modPath.replace('.jar.disabled', '.jar'))
        }
        return true
    } catch (err) {
        logger.error('Error toggling mod:', err)
        return false
    }
}

/**
 * Render local mods UI for custom installations.
 * @param {Array} mods Array of mod objects
 * @param {string} modsDir Path to mods directory
 */
function renderLocalModsUI(mods, modsDir, installName) {
    const modsContainer = document.getElementById('settingsModsContainer')
    
    let modsHTML = `
        <div style="padding: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <div>
                    <h3 style="color: rgba(255,255,255,0.9); margin: 0 0 0.5rem 0; font-size: 1.1rem;">Gestión Local de Mods</h3>
                    <p style="color: rgba(255,255,255,0.6); margin: 0; font-size: 0.9rem;">Instalación: <strong>${installName}</strong></p>
                </div>
                <button id="openModsFolderBtn" style="background: rgba(0, 122, 204, 0.8); color: white; border: none; padding: 0.6rem 1.2rem; border-radius: 4px; cursor: pointer; font-size: 0.9rem;">
                    📁 Abrir Carpeta Mods
                </button>
            </div>
    `
    
    if (mods.length === 0) {
        modsHTML += `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 300px; text-align: center;">
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2" style="margin-bottom: 1rem;">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="12" y1="8" x2="12" y2="16"></line>
                    <line x1="8" y1="12" x2="16" y2="12"></line>
                </svg>
                <h4 style="color: rgba(255,255,255,0.7); margin: 0 0 0.5rem 0;">No hay mods instalados</h4>
                <p style="color: rgba(255,255,255,0.5); margin: 0;">Haz clic en "Abrir Carpeta Mods" para añadir archivos .jar</p>
            </div>
        `
    } else {
        modsHTML += `
            <div style="color: rgba(255,255,255,0.6); margin-bottom: 1rem; font-size: 0.9rem;">
                ${mods.length} mod${mods.length !== 1 ? 's' : ''} encontrado${mods.length !== 1 ? 's' : ''}
            </div>
            <div style="max-height: 400px; overflow-y: auto;" class="scrollbar-track">
        `
        
        mods.forEach((mod, index) => {
            const statusColor = mod.enabled ? 'rgba(76, 175, 80, 0.8)' : 'rgba(158, 158, 158, 0.6)'
            const statusText = mod.enabled ? 'Habilitado' : 'Deshabilitado'
            
            modsHTML += `
                <div style="background: rgba(255,255,255,0.05); border-radius: 4px; padding: 0.8rem 1rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <div style="color: rgba(255,255,255,0.9); font-weight: 500; margin-bottom: 0.3rem;">${mod.name}</div>
                        <div style="color: rgba(255,255,255,0.5); font-size: 0.85rem;">${mod.size}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <span style="color: ${statusColor}; font-size: 0.85rem; font-weight: 500;">${statusText}</span>
                        <label class="toggleSwitch" style="margin: 0;">
                            <input type="checkbox" ${mod.enabled ? 'checked' : ''} data-mod-path="${mod.path}" data-mod-enabled="${mod.enabled}" class="localModToggle">
                            <span class="toggleSwitchSlider"></span>
                        </label>
                    </div>
                </div>
            `
        })
        
        modsHTML += '</div>'
    }
    
    modsHTML += '</div>'
    
    modsContainer.innerHTML = modsHTML
    
    // Bind open folder button
    const openBtn = document.getElementById('openModsFolderBtn')
    if (openBtn) {
        openBtn.onclick = () => {
            const { shell } = require('electron')
            shell.openPath(modsDir)
        }
    }
    
    // Bind toggle switches
    const toggles = document.querySelectorAll('.localModToggle')
    toggles.forEach(toggle => {
        toggle.addEventListener('change', async (e) => {
            const modPath = e.target.getAttribute('data-mod-path')
            const currentState = e.target.getAttribute('data-mod-enabled') === 'true'
            
            const success = await toggleLocalMod(modPath, currentState)
            
            if (success) {
                // Refresh the UI
                const installId = ConfigManager.getSelectedInstallation()
                const install = ConfigManager.getInstallation(installId)
                const modsDir = getModsDirectory(installId)
                const mods = await scanLocalMods(modsDir)
                renderLocalModsUI(mods, modsDir, install.name || install.id)
            } else {
                // Revert toggle state on error
                e.target.checked = currentState
                setOverlayContent(
                    'Error',
                    'No se pudo cambiar el estado del mod. Verifica los permisos del archivo.',
                    'Entendido'
                )
                setOverlayHandler(null)
                toggleOverlay(true)
            }
        })
    })
}

// Variable global para almacenar el HTML original del contenedor de mods
let originalModsContainerHTML = null

/**
 * Prepare the Mods tab for display.
 */
async function prepareModsTab(first){
    const selectedInstallId = ConfigManager.getSelectedInstallation()
    const modsTab = document.getElementById('settingsTabMods')
    const modsNavItem = document.querySelector('[forTab="settingsTabMods"]')
    const modsContainer = document.getElementById('settingsModsContainer')
    
    // Guardar el HTML original la primera vez
    if(!originalModsContainerHTML && modsContainer) {
        originalModsContainerHTML = modsContainer.innerHTML
    }
    
    // Siempre mostrar el tab de Mods
    if(modsTab) modsTab.style.display = ''
    if(modsNavItem) modsNavItem.style.display = ''
    
    // Si hay instalación custom seleccionada, usar sistema de gestión local
    if(selectedInstallId) {
        const OptiFineVersions = require('./assets/js/optifineversions')
        
        // Caso 1: Auto-profile (OptiFine) - mostrar mensaje "Mods No Disponibles"
        if(OptiFineVersions.isAutoProfileId(selectedInstallId)) {
            const autoProfile = await OptiFineVersions.getAutoProfileById(selectedInstallId)
            if(modsContainer && autoProfile) {
                modsContainer.innerHTML = `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 400px; padding: 2rem; text-align: center;">
                        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2" style="margin-bottom: 1.5rem;">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                        <h3 style="color: rgba(255,255,255,0.8); margin-bottom: 1rem; font-size: 1.2rem; font-weight: 600;">Mods No Disponibles</h3>
                        <p style="color: rgba(255,255,255,0.6); max-width: 420px; line-height: 1.6;">
                            La instalación <strong>${autoProfile.name}</strong> utiliza <strong>OptiFine</strong>, que no soporta carga de mods.<br><br>
                            Para usar mods, crea una instalación con <strong>Forge</strong>, <strong>Fabric</strong>, <strong>Quilt</strong> o <strong>NeoForge</strong> desde el Editor de Instalaciones.
                        </p>
                    </div>
                `
            }
            return
        }
        
        // Caso 2: Instalación custom regular
        const install = ConfigManager.getInstallation(selectedInstallId)
        
        if(install) {
            // Detectar tipo de loader
            const loaderValue = install.loader || install.modLoader
            let loaderType = 'vanilla'
            
            if (loaderValue) {
                if (typeof loaderValue === 'string') {
                    loaderType = loaderValue.toLowerCase()
                } else if (typeof loaderValue === 'object' && loaderValue.type) {
                    loaderType = loaderValue.type.toLowerCase()
                }
            }
            
            // Si es vanilla u optifine, mostrar mensaje de no disponible
            if(loaderType === 'vanilla' || loaderType === 'optifine') {
                if(modsContainer) {
                    modsContainer.innerHTML = `
                        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 400px; padding: 2rem; text-align: center;">
                            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2" style="margin-bottom: 1.5rem;">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                            <h3 style="color: rgba(255,255,255,0.8); margin-bottom: 1rem; font-size: 1.2rem; font-weight: 600;">Mods No Disponibles</h3>
                            <p style="color: rgba(255,255,255,0.6); max-width: 420px; line-height: 1.6;">
                                La instalación <strong>${install.name || install.id}</strong> utiliza <strong>${loaderType === 'vanilla' ? 'Vanilla' : 'OptiFine'}</strong>, que no soporta carga de mods.<br><br>
                                Para usar mods, crea una instalación con <strong>Forge</strong>, <strong>Fabric</strong>, <strong>Quilt</strong> o <strong>NeoForge</strong> desde el Editor de Instalaciones.
                            </p>
                        </div>
                    `
                }
                return
            }
            
            // Si tiene loader (forge/fabric/quilt/neoforge), mostrar gestión local de mods
            const modsDir = getModsDirectory(selectedInstallId)
            const mods = await scanLocalMods(modsDir)
            renderLocalModsUI(mods, modsDir, install.name || install.id)
            return
        }
    }
    
    // Sistema original de TECNILAND: restaurar HTML original si fue modificado
    if(modsContainer && originalModsContainerHTML) {
        modsContainer.innerHTML = originalModsContainerHTML
    }
    
    await resolveModsForUI()
    await resolveDropinModsForUI()
    await resolveShaderpacksForUI()
    bindDropinModsRemoveButton()
    bindDropinModFileSystemButton()
    bindShaderpackButton()
    bindModsToggleSwitch()
    await loadSelectedServerOnModsTab()
}

/**
 * Java Tab
 */

// DOM Cache
const settingsMaxRAMRange     = document.getElementById('settingsMaxRAMRange')
const settingsMinRAMRange     = document.getElementById('settingsMinRAMRange')
const settingsMaxRAMLabel     = document.getElementById('settingsMaxRAMLabel')
const settingsMinRAMLabel     = document.getElementById('settingsMinRAMLabel')
const settingsMemoryTotal     = document.getElementById('settingsMemoryTotal')
const settingsMemoryAvail     = document.getElementById('settingsMemoryAvail')
const settingsJavaExecDetails = document.getElementById('settingsJavaExecDetails')
const settingsJavaReqDesc     = document.getElementById('settingsJavaReqDesc')
const settingsJvmOptsLink     = document.getElementById('settingsJvmOptsLink')

// Bind on change event for min memory container.
settingsMinRAMRange.onchange = (e) => {

    // Current range values
    const sMaxV = Number(settingsMaxRAMRange.getAttribute('value'))
    const sMinV = Number(settingsMinRAMRange.getAttribute('value'))

    // Get reference to range bar.
    const bar = e.target.getElementsByClassName('rangeSliderBar')[0]
    // Calculate effective total memory.
    const max = os.totalmem()/1073741824

    // Change range bar color based on the selected value.
    if(sMinV >= max/2){
        bar.style.background = '#e86060'
    } else if(sMinV >= max/4) {
        bar.style.background = '#e8e18b'
    } else {
        bar.style.background = null
    }

    // Increase maximum memory if the minimum exceeds its value.
    if(sMaxV < sMinV){
        const sliderMeta = calculateRangeSliderMeta(settingsMaxRAMRange)
        updateRangedSlider(settingsMaxRAMRange, sMinV,
            ((sMinV-sliderMeta.min)/sliderMeta.step)*sliderMeta.inc)
        settingsMaxRAMLabel.innerHTML = sMinV.toFixed(1) + 'G'
    }

    // Update label
    settingsMinRAMLabel.innerHTML = sMinV.toFixed(1) + 'G'
}

// Bind on change event for max memory container.
settingsMaxRAMRange.onchange = (e) => {
    // Current range values
    const sMaxV = Number(settingsMaxRAMRange.getAttribute('value'))
    const sMinV = Number(settingsMinRAMRange.getAttribute('value'))

    // Get reference to range bar.
    const bar = e.target.getElementsByClassName('rangeSliderBar')[0]
    // Calculate effective total memory.
    const max = os.totalmem()/1073741824

    // Change range bar color based on the selected value.
    if(sMaxV >= max/2){
        bar.style.background = '#e86060'
    } else if(sMaxV >= max/4) {
        bar.style.background = '#e8e18b'
    } else {
        bar.style.background = null
    }

    // Decrease the minimum memory if the maximum value is less.
    if(sMaxV < sMinV){
        const sliderMeta = calculateRangeSliderMeta(settingsMaxRAMRange)
        updateRangedSlider(settingsMinRAMRange, sMaxV,
            ((sMaxV-sliderMeta.min)/sliderMeta.step)*sliderMeta.inc)
        settingsMinRAMLabel.innerHTML = sMaxV.toFixed(1) + 'G'
    }
    settingsMaxRAMLabel.innerHTML = sMaxV.toFixed(1) + 'G'
}

/**
 * Calculate common values for a ranged slider.
 * 
 * @param {Element} v The range slider to calculate against. 
 * @returns {Object} An object with meta values for the provided ranged slider.
 */
function calculateRangeSliderMeta(v){
    const val = {
        max: Number(v.getAttribute('max')),
        min: Number(v.getAttribute('min')),
        step: Number(v.getAttribute('step')),
    }
    val.ticks = (val.max-val.min)/val.step
    val.inc = 100/val.ticks
    return val
}

/**
 * Binds functionality to the ranged sliders. They're more than
 * just divs now :').
 */
function bindRangeSlider(){
    Array.from(document.getElementsByClassName('rangeSlider')).map((v) => {

        // Reference the track (thumb).
        const track = v.getElementsByClassName('rangeSliderTrack')[0]

        // Set the initial slider value.
        const value = v.getAttribute('value')
        const sliderMeta = calculateRangeSliderMeta(v)

        updateRangedSlider(v, value, ((value-sliderMeta.min)/sliderMeta.step)*sliderMeta.inc)

        // The magic happens when we click on the track.
        track.onmousedown = (e) => {

            // Stop moving the track on mouse up.
            document.onmouseup = (e) => {
                document.onmousemove = null
                document.onmouseup = null
            }

            // Move slider according to the mouse position.
            document.onmousemove = (e) => {

                // Distance from the beginning of the bar in pixels.
                const rect = v.getBoundingClientRect()
                const diff = e.clientX - rect.left - track.offsetWidth/2
                
                // Don't move the track off the bar.
                if(diff >= 0 && diff <= rect.width - track.offsetWidth/2){

                    // Convert the difference to a percentage.
                    const perc = (diff/rect.width)*100
                    // Calculate the percentage of the closest notch.
                    const notch = Number(perc/sliderMeta.inc).toFixed(0)*sliderMeta.inc

                    // If we're close to that notch, stick to it.
                    if(Math.abs(perc-notch) < sliderMeta.inc/2){
                        updateRangedSlider(v, sliderMeta.min+(sliderMeta.step*(notch/sliderMeta.inc)), notch)
                    }
                }
            }
        }
    }) 
}

/**
 * Update a ranged slider's value and position.
 * 
 * @param {Element} element The ranged slider to update.
 * @param {string | number} value The new value for the ranged slider.
 * @param {number} notch The notch that the slider should now be at.
 */
function updateRangedSlider(element, value, notch){
    const oldVal = element.getAttribute('value')
    const bar = element.getElementsByClassName('rangeSliderBar')[0]
    const track = element.getElementsByClassName('rangeSliderTrack')[0]
    
    element.setAttribute('value', value)

    if(notch < 0){
        notch = 0
    } else if(notch > 100) {
        notch = 100
    }

    const event = new MouseEvent('change', {
        target: element,
        type: 'change',
        bubbles: false,
        cancelable: true
    })

    let cancelled = !element.dispatchEvent(event)

    if(!cancelled){
        track.style.left = notch + '%'
        bar.style.width = notch + '%'
    } else {
        element.setAttribute('value', oldVal)
    }
}

/**
 * Display the total and available RAM.
 */
function populateMemoryStatus(){
    settingsMemoryTotal.innerHTML = Number((os.totalmem()-1073741824)/1073741824).toFixed(1) + 'G'
    settingsMemoryAvail.innerHTML = Number(os.freemem()/1073741824).toFixed(1) + 'G'
}

/**
 * Validate the provided executable path and display the data on
 * the UI.
 * 
 * @param {string} execPath The executable path to populate against.
 */
async function populateJavaExecDetails(execPath){
    // Verificar si hay una instalación personalizada seleccionada
    const selectedInstallId = ConfigManager.getSelectedInstallation()
    let effectiveJavaOptions
    
    if(selectedInstallId) {
        // Obtener javaOptions de la instalación personalizada
        const installation = ConfigManager.getInstallation(selectedInstallId)
        if(installation && installation.javaOptions) {
            effectiveJavaOptions = installation.javaOptions
        } else {
            // Valores por defecto si no están configurados
            effectiveJavaOptions = {
                supported: '>=8.x',
                suggestedMajor: 8,
                distribution: null // Auto-detect by platform
            }
        }
    } else {
        // Obtener del servidor de distribución tradicional
        const server = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
        if(server) {
            effectiveJavaOptions = server.effectiveJavaOptions
        } else {
            // Fallback por defecto
            effectiveJavaOptions = {
                supported: '>=8.x',
                suggestedMajor: 8,
                distribution: null // Auto-detect by platform
            }
        }
    }

    // Si no hay ejecutable configurado, mostrar mensaje informativo
    if(!execPath) {
        settingsJavaExecDetails.innerHTML = '<span style="color: rgba(255,255,255,0.6)">Java se detectará y configurará automáticamente al lanzar el juego por primera vez.</span>'
        return
    }

    const details = await validateSelectedJvm(ensureJavaDirIsRoot(execPath), effectiveJavaOptions.supported)

    if(details != null) {
        settingsJavaExecDetails.innerHTML = Lang.queryJS('settings.java.selectedJava', { version: details.semverStr, vendor: details.vendor })
    } else {
        settingsJavaExecDetails.innerHTML = Lang.queryJS('settings.java.invalidSelection')
    }
}

function populateJavaReqDesc(effectiveJavaOptions) {
    settingsJavaReqDesc.innerHTML = Lang.queryJS('settings.java.requiresJava', { major: effectiveJavaOptions.suggestedMajor })
}

function populateJvmOptsLink(effectiveJavaOptions) {
    const major = effectiveJavaOptions.suggestedMajor
    settingsJvmOptsLink.innerHTML = Lang.queryJS('settings.java.availableOptions', { major: major })
    if(major >= 12) {
        settingsJvmOptsLink.href = `https://docs.oracle.com/en/java/javase/${major}/docs/specs/man/java.html#extra-options-for-java`
    }
    else if(major >= 11) {
        settingsJvmOptsLink.href = 'https://docs.oracle.com/en/java/javase/11/tools/java.html#GUID-3B1CE181-CD30-4178-9602-230B800D4FAE'
    }
    else if(major >= 9) {
        settingsJvmOptsLink.href = `https://docs.oracle.com/javase/${major}/tools/java.htm`
    }
    else {
        settingsJvmOptsLink.href = `https://docs.oracle.com/javase/${major}/docs/technotes/tools/${process.platform === 'win32' ? 'windows' : 'unix'}/java.html`
    }
}

function bindMinMaxRam(javaOptions) {
    // Store maximum memory values.
    const SETTINGS_MAX_MEMORY = ConfigManager.getAbsoluteMaxRAM(javaOptions?.ram)
    const SETTINGS_MIN_MEMORY = ConfigManager.getAbsoluteMinRAM(javaOptions?.ram)

    // Set the max and min values for the ranged sliders.
    settingsMaxRAMRange.setAttribute('max', SETTINGS_MAX_MEMORY)
    settingsMaxRAMRange.setAttribute('min', SETTINGS_MIN_MEMORY)
    settingsMinRAMRange.setAttribute('max', SETTINGS_MAX_MEMORY)
    settingsMinRAMRange.setAttribute('min', SETTINGS_MIN_MEMORY)
}

/**
 * Prepare the Java tab for display.
 */
async function prepareJavaTab(){
    // Populate installation context (visual info only)
    await populateJavaInstallationContext()
    
    // Poblar información del servidor/instalación seleccionada
    await loadSelectedServerOnModsTab()
    
    // Obtener effectiveJavaOptions y javaOptions dependiendo del tipo de selección
    const selectedInstallId = ConfigManager.getSelectedInstallation()
    let effectiveJavaOptions, javaOptions
    
    if(selectedInstallId) {
        // Instalación custom
        const installation = ConfigManager.getInstallation(selectedInstallId)
        if(installation && installation.javaOptions) {
            effectiveJavaOptions = installation.javaOptions
            javaOptions = installation.javaOptions
        } else {
            // Valores por defecto para instalaciones custom
            effectiveJavaOptions = {
                supported: '>=8.x',
                suggestedMajor: 8,
                distribution: null // Auto-detect by platform
            }
            javaOptions = effectiveJavaOptions
        }
    } else {
        // Servidor de distribución
        const server = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
        effectiveJavaOptions = server.effectiveJavaOptions
        javaOptions = server.rawServer.javaOptions
    }
    
    bindMinMaxRam(javaOptions)
    bindRangeSlider()
    populateMemoryStatus()
    populateJavaReqDesc(effectiveJavaOptions)
    populateJvmOptsLink(effectiveJavaOptions)
}

/**
 * About Tab
 */

const settingsTabAbout             = document.getElementById('settingsTabAbout')
const settingsAboutChangelogTitle  = settingsTabAbout.getElementsByClassName('settingsChangelogTitle')[0]
const settingsAboutChangelogText   = settingsTabAbout.getElementsByClassName('settingsChangelogText')[0]
const settingsAboutChangelogButton = settingsTabAbout.getElementsByClassName('settingsChangelogButton')[0]

// Bind the devtools toggle button.
document.getElementById('settingsAboutDevToolsButton').onclick = (e) => {
    let window = remote.getCurrentWindow()
    window.toggleDevTools()
}

// Bind the launcher logs button.
document.getElementById('settingsAboutLauncherLogsButton').onclick = async (e) => {
    e.preventDefault()
    const { shell } = require('electron')
    const { ipcRenderer } = require('electron')
    
    try {
        const logDir = await ipcRenderer.invoke('logger-get-directory')
        if (logDir) {
            shell.openPath(logDir)
        }
    } catch(err) {
        console.error('Error al abrir carpeta de logs:', err)
    }
}

/**
 * Return whether or not the provided version is a prerelease.
 * 
 * @param {string} version The semver version to test.
 * @returns {boolean} True if the version is a prerelease, otherwise false.
 */
function isPrerelease(version){
    const preRelComp = semver.prerelease(version)
    return preRelComp != null && preRelComp.length > 0
}

/**
 * Utility method to display version information on the
 * About and Update settings tabs.
 * 
 * @param {string} version The semver version to display.
 * @param {Element} valueElement The value element.
 * @param {Element} titleElement The title element.
 * @param {Element} checkElement The check mark element.
 */
function populateVersionInformation(version, valueElement, titleElement, checkElement){
    valueElement.innerHTML = version
    if(isPrerelease(version)){
        titleElement.innerHTML = Lang.queryJS('settings.about.preReleaseTitle')
        titleElement.style.color = '#ff886d'
        checkElement.style.background = '#ff886d'
    } else {
        titleElement.innerHTML = Lang.queryJS('settings.about.stableReleaseTitle')
        titleElement.style.color = null
        checkElement.style.background = null
    }
}

/**
 * Retrieve the version information and display it on the UI.
 */
function populateAboutVersionInformation(){
    populateVersionInformation(remote.app.getVersion(), document.getElementById('settingsAboutCurrentVersionValue'), document.getElementById('settingsAboutCurrentVersionTitle'), document.getElementById('settingsAboutCurrentVersionCheck'))
}

/**
 * Fetches the GitHub atom release feed and parses it for the release notes
 * of the current version. This value is displayed on the UI.
 */
function populateReleaseNotes(){
    $.ajax({
        url: 'https://github.com/dscalzi/HeliosLauncher/releases.atom',
        success: (data) => {
            const version = 'v' + remote.app.getVersion()
            const entries = $(data).find('entry')
            
            for(let i=0; i<entries.length; i++){
                const entry = $(entries[i])
                let id = entry.find('id').text()
                id = id.substring(id.lastIndexOf('/')+1)

                if(id === version){
                    settingsAboutChangelogTitle.innerHTML = entry.find('title').text()
                    settingsAboutChangelogText.innerHTML = entry.find('content').text()
                    settingsAboutChangelogButton.href = entry.find('link').attr('href')
                }
            }

        },
        timeout: 2500
    }).catch(err => {
        settingsAboutChangelogText.innerHTML = Lang.queryJS('settings.about.releaseNotesFailed')
    })
}

/**
 * Prepare account tab for display.
 */
function prepareAboutTab(){
    populateAboutVersionInformation()
    populateReleaseNotes()
}

/**
 * Update Tab
 */

// Declarar selectores del DOM primero (antes de funciones que los usan)
let settingsTabUpdate
let settingsUpdateTitle
let settingsUpdateVersionCheck
let settingsUpdateVersionTitle
let settingsUpdateVersionValue
let settingsUpdateChangelogTitle
let settingsUpdateChangelogText
let settingsUpdateChangelogCont
let settingsUpdateActionButton

// Inicializar selectores cuando el DOM esté listo
function initUpdateTabElements() {
    settingsTabUpdate = document.getElementById('settingsTabUpdate')
    if (settingsTabUpdate) {
        settingsUpdateTitle = document.getElementById('settingsUpdateTitle')
        settingsUpdateVersionCheck = document.getElementById('settingsUpdateVersionCheck')
        settingsUpdateVersionTitle = document.getElementById('settingsUpdateVersionTitle')
        settingsUpdateVersionValue = document.getElementById('settingsUpdateVersionValue')
        settingsUpdateChangelogTitle = settingsTabUpdate.getElementsByClassName('settingsChangelogTitle')[0]
        settingsUpdateChangelogText = settingsTabUpdate.getElementsByClassName('settingsChangelogText')[0]
        settingsUpdateChangelogCont = settingsTabUpdate.getElementsByClassName('settingsChangelogContainer')[0]
        settingsUpdateActionButton = document.getElementById('settingsUpdateActionButton')
    }
}

/**
 * Update the properties of the update action button.
 * 
 * @param {string} text The new button text.
 * @param {boolean} disabled Optional. Disable or enable the button
 * @param {function} handler Optional. New button event handler.
 */
function settingsUpdateButtonStatus(text, disabled = false, handler = null){
    if (!settingsUpdateActionButton) return
    settingsUpdateActionButton.innerHTML = text
    settingsUpdateActionButton.disabled = disabled
    if(handler != null){
        settingsUpdateActionButton.onclick = handler
    }
}

/**
 * Populate the update tab with relevant information.
 * 
 * @param {Object} data The update data.
 */
function populateSettingsUpdateInformation(data){
    if (!settingsUpdateTitle) return // Guard clause si no se inicializó
    
    if(data != null){
        settingsUpdateTitle.innerHTML = isPrerelease(data.version) ? Lang.queryJS('settings.updates.newPreReleaseTitle') : Lang.queryJS('settings.updates.newReleaseTitle')
        if (settingsUpdateChangelogCont) settingsUpdateChangelogCont.style.display = null
        if (settingsUpdateChangelogTitle) settingsUpdateChangelogTitle.innerHTML = data.releaseName
        if (settingsUpdateChangelogText) settingsUpdateChangelogText.innerHTML = data.releaseNotes
        populateVersionInformation(data.version, settingsUpdateVersionValue, settingsUpdateVersionTitle, settingsUpdateVersionCheck)
        
        if(process.platform === 'darwin'){
            settingsUpdateButtonStatus(Lang.queryJS('settings.updates.downloadButton'), false, () => {
                shell.openExternal(data.darwindownload)
            })
        } else {
            settingsUpdateButtonStatus(Lang.queryJS('settings.updates.downloadingButton'), true)
        }
    } else {
        settingsUpdateTitle.innerHTML = Lang.queryJS('settings.updates.latestVersionTitle')
        if (settingsUpdateChangelogCont) settingsUpdateChangelogCont.style.display = 'none'
        populateVersionInformation(remote.app.getVersion(), settingsUpdateVersionValue, settingsUpdateVersionTitle, settingsUpdateVersionCheck)
        settingsUpdateButtonStatus(Lang.queryJS('settings.updates.checkForUpdatesButton'), false, () => {
            if(!isDev){
                ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
                settingsUpdateButtonStatus(Lang.queryJS('settings.updates.checkingForUpdatesButton'), true)
            }
        })
    }
}

/**
 * Prepare update tab for display.
 * 
 * @param {Object} data The update data.
 */
function prepareUpdateTab(data = null){
    initUpdateTabElements() // Inicializar elementos del DOM primero
    populateSettingsUpdateInformation(data)
}

/**
 * Settings preparation functions.
 */

/**
  * Prepare the entire settings UI.
  * 
  * @param {boolean} first Whether or not it is the first load.
  */
async function prepareSettings(first = false) {
    if(first){
        setupSettingsTabs()
        initSettingsValidators()
        prepareUpdateTab()
    } else {
        // Cada vez que se abre Settings (no solo first time), resetear a "Cuenta"
        resetSettingsTabsToDefault()
        await prepareModsTab()
    }
    await initSettingsValues()
    prepareAccountsTab()
    await prepareJavaTab()
    prepareAboutTab()
}

// Prepare the settings UI on startup.
//prepareSettings(true)
