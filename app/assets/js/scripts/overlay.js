/**
 * Script for overlay.ejs
 */

// ConfigManager, InstallationManager, ipcRenderer y remote ya están disponibles globalmente
// const ConfigManager = require('../configmanager')
// const InstallationManager = require('../installationmanager')
// const { ipcRenderer } = require('electron')
// const remote = require('@electron/remote')
const { BrowserWindow } = remote

// Listen for experimental loaders setting change from settings.js
window.addEventListener('experimental-loaders-changed', () => {
    updateExperimentalLoadersVisibility()
})

/* Overlay Wrapper Functions */

/**
 * Check to see if the overlay is visible.
 * 
 * @returns {boolean} Whether or not the overlay is visible.
 */
function isOverlayVisible(){
    return document.getElementById('main').hasAttribute('overlay')
}

let overlayHandlerContent

/**
 * Overlay keydown handler for a non-dismissable overlay.
 * 
 * @param {KeyboardEvent} e The keydown event.
 */
function overlayKeyHandler (e){
    if(e.key === 'Enter' || e.key === 'Escape'){
        document.getElementById(overlayHandlerContent).getElementsByClassName('overlayKeybindEnter')[0].click()
    }
}
/**
 * Overlay keydown handler for a dismissable overlay.
 * 
 * @param {KeyboardEvent} e The keydown event.
 */
function overlayKeyDismissableHandler (e){
    if(e.key === 'Enter'){
        document.getElementById(overlayHandlerContent).getElementsByClassName('overlayKeybindEnter')[0].click()
    } else if(e.key === 'Escape'){
        document.getElementById(overlayHandlerContent).getElementsByClassName('overlayKeybindEsc')[0].click()
    }
}

/**
 * Bind overlay keydown listeners for escape and exit.
 * 
 * @param {boolean} state Whether or not to add new event listeners.
 * @param {string} content The overlay content which will be shown.
 * @param {boolean} dismissable Whether or not the overlay is dismissable 
 */
function bindOverlayKeys(state, content, dismissable){
    overlayHandlerContent = content
    document.removeEventListener('keydown', overlayKeyHandler)
    document.removeEventListener('keydown', overlayKeyDismissableHandler)
    if(state){
        if(dismissable){
            document.addEventListener('keydown', overlayKeyDismissableHandler)
        } else {
            document.addEventListener('keydown', overlayKeyHandler)
        }
    }
}

/**
 * Toggle the visibility of the overlay.
 * 
 * @param {boolean} toggleState True to display, false to hide.
 * @param {boolean} dismissable Optional. True to show the dismiss option, otherwise false.
 * @param {string} content Optional. The content div to be shown.
 */
function toggleOverlay(toggleState, dismissable = false, content = 'overlayContent'){
    if(toggleState == null){
        toggleState = !document.getElementById('main').hasAttribute('overlay')
    }
    if(typeof dismissable === 'string'){
        content = dismissable
        dismissable = false
    }
    bindOverlayKeys(toggleState, content, dismissable)
    if(toggleState){
        document.getElementById('main').setAttribute('overlay', true)
        // Make things untabbable.
        $('#main *').attr('tabindex', '-1')
        $('#' + content).parent().children().hide()
        $('#' + content).show()
        if(dismissable){
            $('#overlayDismiss').show()
        } else {
            $('#overlayDismiss').hide()
        }
        $('#overlayContainer').fadeIn({
            duration: 250,
            start: () => {
                if(getCurrentView() === VIEWS.settings){
                    document.getElementById('settingsContainer').style.backgroundColor = 'transparent'
                }
            }
        })
    } else {
        document.getElementById('main').removeAttribute('overlay')
        // Make things tabbable.
        $('#main *').removeAttr('tabindex')
        $('#overlayContainer').fadeOut({
            duration: 250,
            start: () => {
                if(getCurrentView() === VIEWS.settings){
                    document.getElementById('settingsContainer').style.backgroundColor = 'rgba(0, 0, 0, 0.50)'
                }
            },
            complete: () => {
                $('#' + content).parent().children().hide()
                $('#' + content).show()
                if(dismissable){
                    $('#overlayDismiss').show()
                } else {
                    $('#overlayDismiss').hide()
                }
            }
        })
    }
}

async function toggleServerSelection(toggleState){
    await prepareServerSelectionList()
    toggleOverlay(toggleState, true, 'serverSelectContent')
}

/**
 * Set the content of the overlay.
 * 
 * @param {string} title Overlay title text.
 * @param {string} description Overlay description text.
 * @param {string} acknowledge Acknowledge button text.
 * @param {string} dismiss Dismiss button text.
 */
function setOverlayContent(title, description, acknowledge, dismiss = Lang.queryJS('overlay.dismiss')){
    document.getElementById('overlayTitle').innerHTML = title
    document.getElementById('overlayDesc').innerHTML = description
    document.getElementById('overlayAcknowledge').innerHTML = acknowledge
    document.getElementById('overlayDismiss').innerHTML = dismiss
}

/**
 * Set the onclick handler of the overlay acknowledge button.
 * If the handler is null, a default handler will be added.
 * 
 * @param {function} handler 
 */
function setOverlayHandler(handler){
    if(handler == null){
        document.getElementById('overlayAcknowledge').onclick = () => {
            toggleOverlay(false)
        }
    } else {
        document.getElementById('overlayAcknowledge').onclick = handler
    }
}

/**
 * Set the onclick handler of the overlay dismiss button.
 * If the handler is null, a default handler will be added.
 * 
 * @param {function} handler 
 */
function setDismissHandler(handler){
    if(handler == null){
        document.getElementById('overlayDismiss').onclick = () => {
            toggleOverlay(false)
        }
    } else {
        document.getElementById('overlayDismiss').onclick = handler
    }
}

/* Server Select View */

document.getElementById('serverSelectConfirm').addEventListener('click', async () => {
    // Verificar si hay una instalación personalizada seleccionada
    const installationListings = document.getElementsByClassName('installationListing')
    for(let i=0; i<installationListings.length; i++){
        if(installationListings[i].hasAttribute('selected')){
            const installId = installationListings[i].getAttribute('installid')
            const installation = ConfigManager.getInstallation(installId)
            
            if(installation){
                // Convertir instalación a servidor virtual
                const virtualServer = InstallationManager.installationToServer(installation)
                
                // Guardar instalación seleccionada
                ConfigManager.setSelectedInstallation(installId)
                ConfigManager.setSelectedServer(null) // Limpiar servidor TECNILAND
                ConfigManager.save()
                
                // Actualizar UI (usar el servidor virtual como si fuera un servidor real)
                updateSelectedServer({ rawServer: virtualServer })
                refreshServerStatus(true)
                toggleOverlay(false)
                return
            }
        }
    }

    // Si no hay instalación seleccionada, verificar servidores TECNILAND
    const serverListings = document.getElementsByClassName('serverListing')
    for(let i=0; i<serverListings.length; i++){
        if(serverListings[i].hasAttribute('selected')){
            const serv = (await DistroAPI.getDistribution()).getServerById(serverListings[i].getAttribute('servid'))
            updateSelectedServer(serv)
            
            // Guardar servidor seleccionado
            ConfigManager.setSelectedServer(serv.rawServer.id)
            ConfigManager.setSelectedInstallation(null) // Limpiar instalación
            ConfigManager.save()
            
            refreshServerStatus(true)
            toggleOverlay(false)
            return
        }
    }
    
    // None are selected? Not possible right? Meh, handle it.
    if(serverListings.length > 0){
        const serv = (await DistroAPI.getDistribution()).getServerById(serverListings[0].getAttribute('servid'))
        updateSelectedServer(serv)
        ConfigManager.setSelectedServer(serv.rawServer.id)
        ConfigManager.setSelectedInstallation(null)
        ConfigManager.save()
        toggleOverlay(false)
    }
})

document.getElementById('accountSelectConfirm').addEventListener('click', async () => {
    const listings = document.getElementsByClassName('accountListing')
    for(let i=0; i<listings.length; i++){
        if(listings[i].hasAttribute('selected')){
            const authAcc = ConfigManager.setSelectedAccount(listings[i].getAttribute('uuid'))
            ConfigManager.save()
            updateSelectedAccount(authAcc)
            if(getCurrentView() === VIEWS.settings) {
                await prepareSettings()
            }
            toggleOverlay(false)
            validateSelectedAccount()
            return
        }
    }
    // None are selected? Not possible right? Meh, handle it.
    if(listings.length > 0){
        const authAcc = ConfigManager.setSelectedAccount(listings[0].getAttribute('uuid'))
        ConfigManager.save()
        updateSelectedAccount(authAcc)
        if(getCurrentView() === VIEWS.settings) {
            await prepareSettings()
        }
        toggleOverlay(false)
        validateSelectedAccount()
    }
})

// Bind server select cancel button.
document.getElementById('serverSelectCancel').addEventListener('click', () => {
    toggleOverlay(false)
})

document.getElementById('accountSelectCancel').addEventListener('click', () => {
    $('#accountSelectContent').fadeOut(250, () => {
        $('#overlayContent').fadeIn(250)
    })
})

function setServerListingHandlers(){
    const listings = Array.from(document.getElementsByClassName('serverListing'))
    listings.map((val) => {
        val.onclick = e => {
            if(val.hasAttribute('selected')){
                return
            }
            const cListings = document.getElementsByClassName('serverListing')
            for(let i=0; i<cListings.length; i++){
                if(cListings[i].hasAttribute('selected')){
                    cListings[i].removeAttribute('selected')
                }
            }
            // También limpiar selección de instalaciones
            const installListings = document.getElementsByClassName('installationListing')
            for(let i=0; i<installListings.length; i++){
                if(installListings[i].hasAttribute('selected')){
                    installListings[i].removeAttribute('selected')
                }
            }
            val.setAttribute('selected', '')
            document.activeElement.blur()
        }
    })
}

function setInstallationListingHandlers(){
    const listings = Array.from(document.getElementsByClassName('installationListing'))
    listings.map((val) => {
        val.onclick = e => {
            if(val.hasAttribute('selected')){
                return
            }
            const cListings = document.getElementsByClassName('installationListing')
            for(let i=0; i<cListings.length; i++){
                if(cListings[i].hasAttribute('selected')){
                    cListings[i].removeAttribute('selected')
                }
            }
            // También limpiar selección de servidores
            const serverListings = document.getElementsByClassName('serverListing')
            for(let i=0; i<serverListings.length; i++){
                if(serverListings[i].hasAttribute('selected')){
                    serverListings[i].removeAttribute('selected')
                }
            }
            val.setAttribute('selected', '')
            document.activeElement.blur()
        }
        
        // Agregar menú contextual (click derecho)
        val.oncontextmenu = e => {
            e.preventDefault()
            const installId = val.getAttribute('installid')
            const installation = ConfigManager.getInstallation(installId)
            
            if(installation){
                showDeleteInstallationConfirmation(installId, installation.name)
            }
        }
    })
}

function showDeleteInstallationConfirmation(installId, installName){
    setOverlayContent(
        '¿Eliminar Instalación?',
        `¿Estás seguro de que deseas eliminar la instalación <strong>${installName}</strong>?<br><br>Esta acción no se puede deshacer.`,
        'Eliminar',
        'Cancelar'
    )
    
    setOverlayHandler(() => {
        // Eliminar instalación
        const success = ConfigManager.deleteInstallation(installId)
        
        if(success){
            ConfigManager.save()
            
            // Refrescar lista de instalaciones
            populateInstallationListings()
            setInstallationListingHandlers()
            
            // Si la instalación eliminada estaba seleccionada, seleccionar el primer servidor
            const selectedInstall = ConfigManager.getSelectedInstallation()
            if(!selectedInstall){
                // Seleccionar automáticamente TECNILAND
                ConfigManager.setSelectedServer('tecniland-wZJmEG')
                ConfigManager.save()
            }
        }
        
        toggleOverlay(false)
    })
    
    setDismissHandler(() => {
        toggleOverlay(false)
    })
    
    toggleOverlay(true, true)
}

function setAccountListingHandlers(){
    const listings = Array.from(document.getElementsByClassName('accountListing'))
    listings.map((val) => {
        val.onclick = e => {
            if(val.hasAttribute('selected')){
                return
            }
            const cListings = document.getElementsByClassName('accountListing')
            for(let i=0; i<cListings.length; i++){
                if(cListings[i].hasAttribute('selected')){
                    cListings[i].removeAttribute('selected')
                }
            }
            val.setAttribute('selected', '')
            document.activeElement.blur()
        }
    })
}

async function populateServerListings(){
    const distro = await DistroAPI.getDistribution()
    const giaSel = ConfigManager.getSelectedServer()
    const servers = distro.servers
    let htmlString = ''
    for(const serv of servers){
        htmlString += `<button class="serverListing" servid="${serv.rawServer.id}" ${serv.rawServer.id === giaSel ? 'selected' : ''}>
            <img class="serverListingImg" src="${serv.rawServer.icon}"/>
            <div class="serverListingDetails">
                <span class="serverListingName">${serv.rawServer.name}</span>
                <span class="serverListingDescription">${serv.rawServer.description}</span>
                <div class="serverListingInfo">
                    <div class="serverListingVersion">${serv.rawServer.minecraftVersion}</div>
                    <div class="serverListingRevision">${serv.rawServer.version}</div>
                    ${serv.rawServer.mainServer ? `<div class="serverListingStarWrapper">
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
        </button>`
    }
    document.getElementById('serverSelectListScrollable').innerHTML = htmlString

}

function populateAccountListings(){
    const accountsObj = ConfigManager.getAuthAccounts()
    const accounts = Array.from(Object.keys(accountsObj), v=>accountsObj[v])
    let htmlString = ''
    for(let i=0; i<accounts.length; i++){
        htmlString += `<button class="accountListing" uuid="${accounts[i].uuid}" ${i===0 ? 'selected' : ''}>
            <img src="https://mc-heads.net/head/${accounts[i].uuid}/40">
            <div class="accountListingName">${accounts[i].displayName}</div>
        </button>`
    }
    document.getElementById('accountSelectListScrollable').innerHTML = htmlString

}

function populateInstallationListings(){
    const installations = ConfigManager.getInstallations()
    const selectedInstallId = ConfigManager.getSelectedInstallation()
    let htmlString = ''
    
    if(installations.length === 0){
        htmlString = '<div style="text-align: center; padding: 40px 20px; color: rgba(255,255,255,0.6); font-style: italic;">No hay instalaciones personalizadas.<br>Crea una nueva para comenzar.</div>'
    } else {
        for(const install of installations){
            const info = InstallationManager.getInstallationInfo(install)
            const loaderIcon = {
                'vanilla': '🟩',
                'forge': '🔨',
                'fabric': '🧵',
                'quilt': '🪡',
                'neoforge': '⚒️'
            }[install.loader.type] || '📦'
            
            htmlString += `<button class="installationListing serverListing" installid="${install.id}" ${install.id === selectedInstallId ? 'selected' : ''}>
                <div style="font-size: 32px; margin-right: 15px;">${loaderIcon}</div>
                <div class="serverListingDetails">
                    <span class="serverListingName">${install.name}</span>
                    <span class="serverListingDescription">${info.loader.toUpperCase()} ${info.loaderVersion || ''} (MC ${info.minecraftVersion})</span>
                    <div class="serverListingInfo">
                        <div class="serverListingVersion">MC ${info.minecraftVersion}</div>
                        <div class="serverListingRevision">${info.loader}</div>
                    </div>
                </div>
            </button>`
        }
    }
    
    document.getElementById('installationSelectListScrollable').innerHTML = htmlString
}

async function prepareServerSelectionList(){
    // Poblar instalaciones
    populateInstallationListings()
    setInstallationListingHandlers()
    
    // Poblar servidores
    await populateServerListings()
    setServerListingHandlers()
    
    // Configurar tabs
    setupServerSelectTabs()
    
    // Configurar botón de crear instalación
    document.getElementById('createNewInstallation').onclick = () => {
        openInstallationEditor()
    }
}

function setupServerSelectTabs(){
    const tabInstallations = document.getElementById('tabInstallations')
    const tabServers = document.getElementById('tabServers')
    const installationList = document.getElementById('installationSelectListScrollable')
    const serverList = document.getElementById('serverSelectListScrollable')
    const createButton = document.getElementById('installationCreateButton')
    
    tabInstallations.onclick = () => {
        // Activar tab instalaciones
        tabInstallations.style.background = 'rgba(255,255,255,0.2)'
        tabInstallations.style.borderColor = 'rgba(255,255,255,0.4)'
        tabInstallations.querySelector('span').style.color = 'white'
        
        // Desactivar tab servidores
        tabServers.style.background = 'rgba(255,255,255,0.1)'
        tabServers.style.borderColor = 'rgba(255,255,255,0.2)'
        tabServers.querySelector('span').style.color = 'rgba(255,255,255,0.7)'
        
        // Mostrar lista de instalaciones
        installationList.style.display = 'block'
        serverList.style.display = 'none'
        createButton.style.display = 'block'
        
        // Actualizar header con contexto
        document.getElementById('serverSelectHeader').textContent = '🎮 Selecciona una Instalación Personalizada'
    }
    
    tabServers.onclick = () => {
        // Activar tab servidores
        tabServers.style.background = 'rgba(255,255,255,0.2)'
        tabServers.style.borderColor = 'rgba(255,255,255,0.4)'
        tabServers.querySelector('span').style.color = 'white'
        
        // Desactivar tab instalaciones
        tabInstallations.style.background = 'rgba(255,255,255,0.1)'
        tabInstallations.style.borderColor = 'rgba(255,255,255,0.2)'
        tabInstallations.querySelector('span').style.color = 'rgba(255,255,255,0.7)'
        
        // Mostrar lista de servidores
        installationList.style.display = 'none'
        serverList.style.display = 'block'
        createButton.style.display = 'none'
        
        // Actualizar header con contexto
        document.getElementById('serverSelectHeader').textContent = '🌐 Selecciona un Modpack TECNILAND'
    }
}

// ============================================================================
// Installation Editor (Inline)
// ============================================================================

let currentEditorLoader = 'vanilla'
let minecraftVersions = []
let loaderVersions = []

function openInstallationEditor(){
    // Ocultar selector de servidores
    document.getElementById('serverSelectContent').style.display = 'none'
    // Mostrar editor inline
    document.getElementById('installationEditorContent').style.display = 'block'
    
    // Resetear formulario
    resetInstallationEditorForm()
    
    // Aplicar visibilidad de loaders experimentales
    updateExperimentalLoadersVisibility()
    
    // Cargar versiones de Minecraft
    loadMinecraftVersionsInline()
    
    // Setup handlers
    setupInstallationEditorHandlers()
}

/**
 * Update visibility of experimental loaders (Fabric, Quilt, NeoForge)
 * based on the ExperimentalLoaders setting in ConfigManager
 */
function updateExperimentalLoadersVisibility() {
    const experimentalLoaders = ['fabric', 'quilt', 'neoforge']
    const showExperimental = ConfigManager.getExperimentalLoaders()
    
    experimentalLoaders.forEach(loader => {
        const btn = document.querySelector(`.installationEditorLoaderBtn[data-loader="${loader}"]`)
        if (btn) {
            btn.style.display = showExperimental ? '' : 'none'
        }
    })
}

function resetInstallationEditorForm() {
    document.getElementById('installationEditorName').value = ''
    document.getElementById('installationEditorMcVersion').value = ''
    document.getElementById('installationEditorLoaderVersion').value = ''
    document.getElementById('installationEditorLoaderVersionGroup').style.display = 'none'
    document.getElementById('installationEditorErrorMessage').style.display = 'none'
    currentEditorLoader = 'vanilla'
    
    // Resetear botones de loader
    document.querySelectorAll('.installationEditorLoaderBtn').forEach(btn => {
        btn.classList.remove('active')
        if(btn.dataset.loader === 'vanilla') {
            btn.classList.add('active')
        }
    })
    
    updateCreateButtonState()
}

function setupInstallationEditorHandlers() {
    // Loader selector
    document.querySelectorAll('.installationEditorLoaderBtn').forEach(btn => {
        btn.onclick = async function() {
            document.querySelectorAll('.installationEditorLoaderBtn').forEach(b => b.classList.remove('active'))
            this.classList.add('active')
            currentEditorLoader = this.dataset.loader
            
            const loaderVersionGroup = document.getElementById('installationEditorLoaderVersionGroup')
            if(currentEditorLoader === 'vanilla') {
                loaderVersionGroup.style.display = 'none'
            } else {
                loaderVersionGroup.style.display = 'block'
            }
            
            const mcVersion = document.getElementById('installationEditorMcVersion').value
            if(mcVersion) {
                await loadLoaderVersionsInline(mcVersion)
            }
            
            updateCreateButtonState()
        }
    })
    
    // MC version change
    document.getElementById('installationEditorMcVersion').onchange = async function() {
        if(currentEditorLoader !== 'vanilla' && this.value) {
            await loadLoaderVersionsInline(this.value)
        }
        updateCreateButtonState()
    }
    
    // Loader version change
    document.getElementById('installationEditorLoaderVersion').onchange = function() {
        updateCreateButtonState()
    }
    
    // Name input
    document.getElementById('installationEditorName').oninput = function() {
        updateCreateButtonState()
    }
    
    // Cancel button
    document.getElementById('installationEditorCancel').onclick = function() {
        closeInstallationEditor()
    }
    
    // Form submit
    document.getElementById('installationEditorForm').onsubmit = async function(e) {
        e.preventDefault()
        await createInstallationFromForm()
    }
}

async function loadMinecraftVersionsInline() {
    const mcVersionSelect = document.getElementById('installationEditorMcVersion')
    
    try {
        mcVersionSelect.innerHTML = '<option value="">Cargando versiones...</option>'
        mcVersionSelect.disabled = true
        
        const versions = await VersionAPI.getMinecraftVersions()
        
        // Verificar si mostrar versiones legacy (< 1.13)
        const showLegacy = ConfigManager.getShowLegacyVersions()
        
        // Filtrar versiones legacy si está deshabilitado
        let filteredReleases = versions.releases
        if (!showLegacy) {
            filteredReleases = versions.releases.filter(v => {
                const parts = v.id.split('.')
                if (parts.length >= 2) {
                    const major = parseInt(parts[0], 10)
                    const minor = parseInt(parts[1], 10)
                    return major >= 1 && minor >= 13
                }
                return false
            })
        }
        
        minecraftVersions = filteredReleases
        
        mcVersionSelect.innerHTML = '<option value="">Selecciona una versión</option>'
        filteredReleases.forEach(version => {
            const option = document.createElement('option')
            option.value = version.id
            option.textContent = version.id
            mcVersionSelect.appendChild(option)
        })
        
        mcVersionSelect.disabled = false
        
    } catch(err) {
        console.error('Error al cargar versiones de Minecraft:', err)
        showInstallationEditorError('Error al cargar versiones de Minecraft. Verifica tu conexión.')
        mcVersionSelect.innerHTML = '<option value="">Error al cargar</option>'
    }
}

async function loadLoaderVersionsInline(minecraftVersion) {
    const loaderVersionSelect = document.getElementById('installationEditorLoaderVersion')
    
    try {
        loaderVersionSelect.innerHTML = '<option value="">Cargando versiones...</option>'
        loaderVersionSelect.disabled = true
        
        let versions = []
        
        switch(currentEditorLoader) {
            case 'forge': {
                versions = await VersionAPI.getForgeVersions(minecraftVersion)
                break
            }
            case 'fabric': {
                const fabricVersions = await VersionAPI.getFabricVersions(minecraftVersion)
                versions = fabricVersions.map(v => v.version)
                break
            }
            case 'quilt': {
                const quiltVersions = await VersionAPI.getQuiltVersions(minecraftVersion)
                versions = quiltVersions.map(v => v.version)
                break
            }
            case 'neoforge': {
                versions = await VersionAPI.getNeoForgeVersions(minecraftVersion)
                break
            }
        }
        
        loaderVersions = versions
        
        if(versions.length === 0) {
            loaderVersionSelect.innerHTML = '<option value="">No hay versiones disponibles</option>'
            showInstallationEditorError(`No hay versiones de ${currentEditorLoader} para Minecraft ${minecraftVersion}`)
            return
        }
        
        loaderVersionSelect.innerHTML = '<option value="">Selecciona una versión</option>'
        versions.forEach(version => {
            const option = document.createElement('option')
            option.value = version
            option.textContent = version
            loaderVersionSelect.appendChild(option)
        })
        
        if(versions.length > 0) {
            loaderVersionSelect.value = versions[0]
        }
        
        loaderVersionSelect.disabled = false
        
    } catch(err) {
        console.error(`Error al cargar versiones de ${currentEditorLoader}:`, err)
        showInstallationEditorError(`Error al cargar versiones de ${currentEditorLoader}`)
        loaderVersionSelect.innerHTML = '<option value="">Error al cargar</option>'
    }
}

async function createInstallationFromForm() {
    const name = document.getElementById('installationEditorName').value.trim()
    const minecraftVersion = document.getElementById('installationEditorMcVersion').value
    const loaderVersion = currentEditorLoader === 'vanilla' ? null : document.getElementById('installationEditorLoaderVersion').value
    
    if(!name || !minecraftVersion) {
        showInstallationEditorError('Por favor completa todos los campos requeridos')
        return
    }
    
    if(currentEditorLoader !== 'vanilla' && !loaderVersion) {
        showInstallationEditorError(`Debes seleccionar una versión de ${currentEditorLoader}`)
        return
    }
    
    const createBtn = document.getElementById('installationEditorCreate')
    createBtn.disabled = true
    createBtn.innerHTML = 'Crear instalación...'
    
    try {
        const installation = InstallationManager.createInstallation({
            name,
            loaderType: currentEditorLoader,
            minecraftVersion,
            loaderVersion
        })
        
        const validation = InstallationManager.validateInstallation(installation)
        if(!validation.valid) {
            showInstallationEditorError(`Instalación no válida: ${validation.errors.join(', ')}`)
            createBtn.disabled = false
            createBtn.innerHTML = '✅ Crear Instalación'
            return
        }
        
        const added = ConfigManager.addInstallation(installation)
        if(!added) {
            showInstallationEditorError('No se pudo agregar la instalación. Ya existe una con el mismo nombre.')
            createBtn.disabled = false
            createBtn.innerHTML = '✅ Crear Instalación'
            return
        }
        
        ConfigManager.save()
        
        // Cerrar editor y volver al selector
        closeInstallationEditor()
        
        // Refrescar lista
        await prepareServerSelectionList()
        
    } catch(err) {
        console.error('Error al crear instalación:', err)
        showInstallationEditorError(`Error al crear instalación: ${err.message}`)
        createBtn.disabled = false
        createBtn.innerHTML = '✅ Crear Instalación'
    }
}

function closeInstallationEditor() {
    document.getElementById('installationEditorContent').style.display = 'none'
    document.getElementById('serverSelectContent').style.display = 'flex'
}

function showInstallationEditorError(message) {
    const errorEl = document.getElementById('installationEditorErrorMessage')
    errorEl.textContent = '⚠️ ' + message
    errorEl.style.display = 'block'
    
    setTimeout(() => {
        errorEl.style.display = 'none'
    }, 5000)
}

function updateCreateButtonState() {
    const createBtn = document.getElementById('installationEditorCreate')
    const name = document.getElementById('installationEditorName').value.trim()
    const mcVersion = document.getElementById('installationEditorMcVersion').value
    const loaderVersion = document.getElementById('installationEditorLoaderVersion').value
    
    let isValid = name.length > 0 && mcVersion
    
    if(currentEditorLoader !== 'vanilla') {
        isValid = isValid && loaderVersion
    }
    
    createBtn.disabled = !isValid
}

function prepareAccountSelectionList(){
    populateAccountListings()
    setAccountListingHandlers()
}