/**
 * Script for landing.ejs
 * Updated: 2025-12-08
 */

/**
 * Landing.js - Main landing page script
 * This script loads AFTER uicore.js and uibinder.js
 * Uses IIFE to avoid polluting global scope and conflicting with other scripts
 */

// Wrap everything in an IIFE to avoid global variable conflicts
(function() {
    'use strict'
    
    // Prevent double execution
    if (window.__LANDING_JS_LOADED__) {
        console.warn('[LANDING] Script already loaded, skipping.')
        return
    }
    window.__LANDING_JS_LOADED__ = true
    console.log('[LANDING] Initializing...')

    // Load modules (scoped to this IIFE, won't conflict with uicore.js)
    const { URL } = require('url')
    const path = require('path')
    const mojang = require('helios-core/mojang')
    const common = require('helios-core/common')
    const dl = require('helios-core/dl')
    const java = require('helios-core/java')
    const SkinManager = require('./assets/js/skinmanager')
    const SkinViewer3DManager = require('./assets/js/skinviewer3d/SkinViewer3DManager')
    const { LoggerUtil } = require('helios-core')
    
    const MojangRestAPI = mojang.MojangRestAPI
    const getServerStatus = mojang.getServerStatus
    const RestResponseStatus = common.RestResponseStatus
    const isDisplayableError = common.isDisplayableError
    const validateLocalFile = common.validateLocalFile
    const FullRepair = dl.FullRepair
    const DistributionIndexProcessor = dl.DistributionIndexProcessor
    const MojangIndexProcessor = dl.MojangIndexProcessor
    const downloadFile = dl.downloadFile
    const downloadQueue = dl.downloadQueue
    const validateSelectedJvmLanding = java.validateSelectedJvm
    const ensureJavaDirIsRootLanding = java.ensureJavaDirIsRoot
    const javaExecFromRoot = java.javaExecFromRoot
    const discoverBestJvmInstallation = java.discoverBestJvmInstallation
    const latestOpenJDK = java.latestOpenJDK
    const extractJdk = java.extractJdk
    
    // Internal Requirements
    const DiscordWrapper = require('./assets/js/discordwrapper')
    const ProcessBuilder = require('./assets/js/processbuilder')
    const JavaManager = require('./assets/js/javamanager')
    const SecurityHelper = require('./assets/js/securityhelper')
    
    // ConfigManager e InstallationManager ya están disponibles globalmente
    // const ConfigManager = require('./assets/js/configmanager')
    // const InstallationManager = require('./assets/js/installationmanager')
    
    // Launch Elements
    const launch_content = document.getElementById('launch_content')
    const launch_details = document.getElementById('launch_details')
    const launch_progress = document.getElementById('launch_progress')
    const launch_progress_label = document.getElementById('launch_progress_label')
    const launch_details_text = document.getElementById('launch_details_text')
    const server_selection_button = document.getElementById('server_selection_button')
    const user_text = document.getElementById('user_text')
    
    const loggerLanding = LoggerUtil.getLogger('Landing')

    // OptiFine auto-profiles
    const OptiFineVersions = require('./assets/js/optifineversions')

/**
 * Crear un mock de objeto Server compatible con DistroAPI
 * para instalaciones personalizadas
 */
function createServerMock(virtualServer) {
    return {
        rawServer: virtualServer,
        
        // Propiedades directas (ProcessBuilder las accede directamente)
        modules: virtualServer.modules || [],
        
        // Métodos compatibles con DistroAPI Server
        getID: () => virtualServer.id,
        getName: () => virtualServer.name,
        getDescription: () => virtualServer.description,
        getIcon: () => virtualServer.icon,
        getVersion: () => virtualServer.version,
        getAddress: () => virtualServer.address,
        getMinecraftVersion: () => virtualServer.minecraftVersion,
        getDiscord: () => virtualServer.discord,
        isMainServer: () => virtualServer.mainServer || false,
        isAutoConnect: () => virtualServer.autoconnect || false,
        getModules: () => virtualServer.modules || [],
        
        // Propiedades de Java
        effectiveJavaOptions: virtualServer.javaOptions || {
            supported: '>=8.x',
            suggestedMajor: 8,
            distribution: null // Auto-detect by platform
        }
    }
}

async function resolveSelectedLaunchTarget(distro, logger, opts) {
    const selectedInstallId = ConfigManager.getSelectedInstallation()

    // Auto-profile (OptiFine detectado automáticamente)
    if (selectedInstallId && OptiFineVersions.isAutoProfileId(selectedInstallId)) {
        logger.info(`Auto-profile detectado: ${selectedInstallId}`)

        const autoProfile = await OptiFineVersions.getAutoProfileById(selectedInstallId)
        if (!autoProfile) {
            logger.error(`Auto-profile no encontrado: ${selectedInstallId}`)
            showLaunchFailure(opts.failureTitle, opts.autoProfileMissingText)
            return null
        }

        const virtualServer = InstallationManager.autoProfileToServer(autoProfile)
        return {
            kind: 'optifine-auto',
            server: createServerMock(virtualServer),
            serverId: autoProfile.id,
            autoProfile,
            virtualServer
        }
    }

    // Instalación personalizada
    if (selectedInstallId) {
        const installation = ConfigManager.getInstallation(selectedInstallId)
        if (!installation) {
            logger.error(`Instalación seleccionada no encontrada: ${selectedInstallId}`)
            showLaunchFailure(opts.failureTitle, opts.installationMissingText)
            return null
        }

        const validation = InstallationManager.validateInstallation(installation)
        if (!validation.valid) {
            logger.error('Instalación inválida:', validation.errors)
            showLaunchFailure(opts.failureTitle, `Instalación inválida: ${validation.errors.join(', ')}${opts.installationInvalidSuffix || ''}`)
            return null
        }

        const virtualServer = InstallationManager.installationToServer(installation)
        return {
            kind: 'custom',
            server: createServerMock(virtualServer),
            serverId: installation.id,
            installation,
            virtualServer
        }
    }

    // Servidor TECNILAND (distribución / modpack)
    const serverId = ConfigManager.getSelectedServer()
    const distroResolved = distro || (await DistroAPI.getDistribution())
    const server = distroResolved.getServerById(serverId)
    if (!server) {
        logger.error('No hay servidor o instalación seleccionada')
        showLaunchFailure(opts.failureTitle, opts.noSelectionText)
        return null
    }

    // Check if modpack is installed before launching
    const modpackInstallation = ConfigManager.getModpackInstallation(serverId)
    if (modpackInstallation) {
        // Modpack is managed by ModpackManager
        if (modpackInstallation.status !== 'installed') {
            logger.error(`Modpack ${serverId} no está instalado correctamente (status: ${modpackInstallation.status})`)
            showLaunchFailure(opts.failureTitle, opts.modpackNotInstalledText || 'El modpack no está instalado. Por favor, instálalo desde la sección Modpacks TECNILAND.')
            return null
        }
        
        // Update last played
        ConfigManager.updateModpackLastPlayed(serverId)
        ConfigManager.save()
        logger.info(`Launching modpack: ${serverId} (v${modpackInstallation.version})`)
    }

    return {
        kind: 'distro',
        server,
        serverId,
        modpackInstallation // Include for reference
    }
}

/* Launch Progress Wrapper Functions */

/**
 * Show/hide the loading area.
 * 
 * @param {boolean} loading True if the loading area should be shown, otherwise false.
 */
function toggleLaunchArea(loading){
    if(loading){
        launch_details.style.display = 'flex'
        launch_content.style.display = 'none'
    } else {
        launch_details.style.display = 'none'
        launch_content.style.display = 'inline-flex'
    }
}

/**
 * Set the details text of the loading area.
 * 
 * @param {string} details The new text for the loading details.
 */
function setLaunchDetails(details){
    launch_details_text.innerHTML = details
}

/**
 * Set the value of the loading progress bar and display that value.
 * 
 * @param {number} percent Percentage (0-100)
 */
function setLaunchPercentage(percent){
    launch_progress.setAttribute('max', 100)
    launch_progress.setAttribute('value', percent)
    launch_progress_label.innerHTML = percent + '%'
}

/**
 * Set the value of the OS progress bar and display that on the UI.
 * 
 * @param {number} percent Percentage (0-100)
 */
function setDownloadPercentage(percent){
    remote.getCurrentWindow().setProgressBar(percent/100)
    setLaunchPercentage(percent)
}

/**
 * Enable or disable the launch button.
 * 
 * @param {boolean} val True to enable, false to disable.
 */
function setLaunchEnabled(val){
    document.getElementById('launch_button').disabled = !val
}

// Bind launch button
document.getElementById('launch_button').addEventListener('click', async e => {
    loggerLanding.info('Launching game..')
    try {
        const target = await resolveSelectedLaunchTarget(null, loggerLanding, {
            failureTitle: Lang.queryJS('landing.launch.failureTitle'),
            autoProfileMissingText: 'La versión de OptiFine seleccionada ya no existe.',
            installationMissingText: 'La instalación seleccionada no existe. Por favor, selecciona otra instalación.',
            installationInvalidSuffix: '',
            noSelectionText: 'No has seleccionado ninguna instalación o servidor.'
        })

        if (!target) {
            return
        }

        const server = target.server
        const serverId = target.serverId
        
        // Obtener versión de Minecraft para JavaManager
        const minecraftVersion = server.rawServer.minecraftVersion
        loggerLanding.info(`Minecraft version: ${minecraftVersion}`)
        
        // Detectar si es NeoForge
        const isNeoForge = server.modules && server.modules.length > 0 
            && server.modules.some(mdl => {
                const moduleType = mdl.rawModule ? mdl.rawModule.type : mdl.type
                const moduleId = mdl.id || ''
                return moduleType === 'NeoForgeMod' || moduleId.startsWith('net.neoforged:neoforge:')
            })
        
        if (isNeoForge) {
            loggerLanding.info('=== DETECTED NEOFORGE ===')
            loggerLanding.info('  🚧 NeoForge MAINTENANCE MODE: Gate check required')
            loggerLanding.info('=========================')
            
            // 🚧 MAINTENANCE GATE: NeoForge requires ephemeral confirmation every launch
            loggerLanding.warn('🚧 NeoForge Maintenance Gate: Showing warning modal...')
            
            setLaunchDetails(Lang.queryJS('landing.dlAsync.loadingServerInfo'))
            setLaunchPercentage(0, 100)
            
            const maintenanceTitle = Lang.queryJS('settings.neoforgeMaintenanceTitle')
            const maintenanceMessage = Lang.queryJS('settings.neoforgeMaintenanceMessage')
            const cancelText = Lang.queryJS('settings.neoforgeMaintenanceCancel')
            const tryAnywayText = Lang.queryJS('settings.neoforgeMaintenanceTryAnyway')
            
            setOverlayContent(
                maintenanceTitle,
                maintenanceMessage,
                tryAnywayText,
                cancelText
            )
            
            setOverlayHandler(() => {
                // User clicked "Try Anyway" - continue with NeoForge launch (ephemeral, no persistence)
                loggerLanding.warn('⚠️ User bypassed NeoForge maintenance gate (ephemeral)')
                toggleOverlay(false)
                // Continue execution by re-triggering dlAsync
                dlAsync(login)
            })
            
            setDismissHandler(() => {
                // User clicked "Cancel" - abort launch
                loggerLanding.info('✅ User cancelled NeoForge launch at maintenance gate')
                toggleOverlay(false)
                toggleLaunchArea(false)
                setLaunchDetails(Lang.queryJS('landing.dlAsync.loginCancelled'))
                setLaunchPercentage(0, 100)
            })
            
            toggleOverlay(true, true)
            return // Exit early, wait for user decision
        }
        
        if (isNeoForge) {
            loggerLanding.info('  NeoForge STRICT MODE: Java 17 ONLY')
            loggerLanding.info('  Java 21/22 will be REJECTED')
            loggerLanding.info('=========================')
            
            // STRICT MODE: Check if Java 17 is installed BEFORE continuing
            const allJavaInstalls = await JavaManager.detectJavaInstallations()
            const java17 = allJavaInstalls.find(j => j.majorVersion === 17)
            
            if (!java17) {
                loggerLanding.warn('❌ Java 17 NOT FOUND in system')
                loggerLanding.info('🔽 FORCING Java 17 download (auto-detect distribution)...')
                
                const neoForgeJavaOptions = {
                    supported: '17.x',
                    suggestedMajor: 17,
                    distribution: null // Auto-detect by platform
                }
                
                await asyncSystemScanWithJavaManager(neoForgeJavaOptions, true, serverId, minecraftVersion)
                return // Will re-launch after download
            }
            
            // Java 17 found, force use it
            const java17Executable = java17.executableW || java17.executable
            loggerLanding.info(`✅ NEOFORGE: Forcing Java 17 executable: ${java17Executable}`)
            ConfigManager.setJavaExecutable(serverId, java17Executable)
            ConfigManager.save()
        }
        
        // ✅ CRITICAL FIX: ALWAYS validate configured Java BEFORE using it
        // This prevents launching with incompatible Java versions (e.g., Java 24 for Forge 1.20.1)
        const configuredJava = ConfigManager.getJavaExecutable(serverId)
        
        loggerLanding.info('═══════════════════════════════════════')
        loggerLanding.info('🔍 JAVA VALIDATION FOR MINECRAFT ' + minecraftVersion)
        loggerLanding.info('═══════════════════════════════════════')
        if (configuredJava) {
            loggerLanding.info(`📁 Configured Java: ${configuredJava}`)
        } else {
            loggerLanding.info('📁 No Java configured - will auto-detect')
        }
        
        let javaResult = await JavaManager.resolveJavaForMinecraft(minecraftVersion, configuredJava)
        
        // ⚠️ STRICT VALIDATION: If configured Java is incompatible, FORCE re-detection/download
        if (configuredJava && !javaResult.success) {
            loggerLanding.warn('❌ CONFIGURED JAVA IS INCOMPATIBLE!')
            loggerLanding.warn(`   Path: ${configuredJava}`)
            loggerLanding.warn(`   ${javaResult.message}`)
            loggerLanding.info('🔄 FORCING automatic Java detection/download...')
            
            // Clear incompatible Java from config
            ConfigManager.setJavaExecutable(serverId, null)
            ConfigManager.save()
            
            // Re-scan WITHOUT configured Java (force system scan)
            javaResult = await JavaManager.resolveJavaForMinecraft(minecraftVersion, null)
        }
        
        loggerLanding.info('─────────────────────────────────────')
        loggerLanding.info('Java resolution result:', javaResult)
        loggerLanding.info('═══════════════════════════════════════')
        
        // ✅ NEOFORGE STRICT: Abort if not Java 17
        if (isNeoForge && javaResult.success && javaResult.majorVersion !== 17) {
            loggerLanding.error('❌ NEOFORGE CRITICAL ERROR ❌')
            loggerLanding.error(`   Java ${javaResult.majorVersion} detected after forcing Java 17`)
            loggerLanding.error('   This should never happen. Aborting launch.')
            throw new Error(`NeoForge requires Java 17, but Java ${javaResult.majorVersion} was selected. Launch aborted.`)
        }
        
        if (!javaResult.success) {
            // No hay Java compatible, necesitamos descargar
            loggerLanding.warn(`❌ No compatible Java found: ${javaResult.message}`)
            
            // Ofrecer descarga automática (sin preguntar, ya limpiamos el incompatible)
            const effectiveJavaOptions = JavaManager.generateEffectiveJavaOptions(minecraftVersion)
            loggerLanding.info(`📥 Auto-downloading Java ${effectiveJavaOptions.suggestedMajor} for Minecraft ${minecraftVersion}...`)
            await asyncSystemScanWithJavaManager(effectiveJavaOptions, true, serverId, minecraftVersion)
        } else {
            // Java encontrado, verificar y actualizar ConfigManager si es necesario
            if (javaResult.source === 'detected' || !configuredJava) {
                // Java auto-detectado o no había configurado, guardarlo en ConfigManager para futuras ejecuciones
                loggerLanding.info(`💾 Saving Java ${javaResult.majorVersion} to ConfigManager: ${javaResult.executable}`)
                ConfigManager.setJavaExecutable(serverId, javaResult.executable)
                ConfigManager.save()
            }
            
            setLaunchDetails(Lang.queryJS('landing.launch.pleaseWait'))
            toggleLaunchArea(true)
            setLaunchPercentage(0, 100)
            
            loggerLanding.info(`✅ Using Java ${javaResult.majorVersion} from ${javaResult.source}: ${javaResult.executable}`)
            await dlAsync()
        }
    } catch(err) {
        loggerLanding.error('Unhandled error in during launch process.', err)
        showLaunchFailure(Lang.queryJS('landing.launch.failureTitle'), Lang.queryJS('landing.launch.failureText'))
    }
})

// Bind settings button
document.getElementById('settingsMediaButton').onclick = async e => {
    await prepareSettings()
    switchView(getCurrentView(), VIEWS.settings)
}

// Bind avatar overlay button.
document.getElementById('avatarOverlay').onclick = async e => {
    await prepareSettings()
    switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
        settingsNavItemListener(document.getElementById('settingsNavAccount'), false)
    })
}

// Bind selected account
function updateSelectedAccount(authUser){
    let username = Lang.queryJS('landing.selectedAccount.noAccountSelected')
    if(authUser != null){
        if(authUser.displayName != null){
            username = authUser.displayName
            // Add account type indicator with appropriate color
            if(authUser.type === 'offline'){
                username += ' <span style="font-size: 10px; color: #888; font-weight: normal;">(Offline)</span>'
            } else if(authUser.type === 'tecniland'){
                username += ' <span style="font-size: 10px; color: #39FF14; font-weight: normal;">(TECNILAND)</span>'
            }
        }
        if(authUser.uuid != null){
            // Use centralized avatar URL function from ConfigManager
            const avatarUrl = ConfigManager.getAccountAvatarUrl(authUser, 'body')
            
            // For TECNILAND accounts, use SkinViewer3DManager to handle fallback to Steve
            if(authUser.type === 'tecniland'){
                SkinViewer3DManager.createOrUpdateViewer('avatarContainer', avatarUrl, 'steve')
            } else {
                // For other account types, use direct background-image
                document.getElementById('avatarContainer').style.backgroundImage = `url('${avatarUrl}')`
            }
        }
    } else {
        // No account selected - clear avatar and show placeholder
        document.getElementById('avatarContainer').style.backgroundImage = ''
    }
    user_text.innerHTML = username
}
updateSelectedAccount(ConfigManager.getSelectedAccount())

// Bind selected server
function updateSelectedServer(serv){
    if(getCurrentView() === VIEWS.settings){
        fullSettingsSave()
    }
    ConfigManager.setSelectedServer(serv != null ? serv.rawServer.id : null)
    ConfigManager.save()
    server_selection_button.innerHTML = '&#8226; ' + (serv != null ? serv.rawServer.name : Lang.queryJS('landing.noSelection'))
    if(getCurrentView() === VIEWS.settings){
        animateSettingsTabRefresh()
    }
    setLaunchEnabled(serv != null)
}
// Real text is set in uibinder.js on distributionIndexDone.
server_selection_button.innerHTML = '&#8226; ' + Lang.queryJS('landing.selectedServer.loading')
server_selection_button.onclick = async e => {
    e.target.blur()
    await toggleServerSelection(true)
}

// Update Mojang Status Color
const refreshMojangStatuses = async function(){
    loggerLanding.info('Refreshing Mojang Statuses..')

    let status = 'grey'
    let tooltipEssentialHTML = ''
    let tooltipNonEssentialHTML = ''

    const response = await MojangRestAPI.status()
    let statuses
    if(response.responseStatus === RestResponseStatus.SUCCESS) {
        statuses = response.data
    } else {
        loggerLanding.warn('Unable to refresh Mojang service status.')
        statuses = MojangRestAPI.getDefaultStatuses()
    }
    
    let greenCount = 0
    let greyCount = 0

    for(let i=0; i<statuses.length; i++){
        const service = statuses[i]

        const tooltipHTML = `<div class="mojangStatusContainer">
            <span class="mojangStatusIcon" style="color: ${MojangRestAPI.statusToHex(service.status)};">&#8226;</span>
            <span class="mojangStatusName">${service.name}</span>
        </div>`
        if(service.essential){
            tooltipEssentialHTML += tooltipHTML
        } else {
            tooltipNonEssentialHTML += tooltipHTML
        }

        if(service.status === 'yellow' && status !== 'red'){
            status = 'yellow'
        } else if(service.status === 'red'){
            status = 'red'
        } else {
            if(service.status === 'grey'){
                ++greyCount
            }
            ++greenCount
        }

    }

    if(greenCount === statuses.length){
        if(greyCount === statuses.length){
            status = 'grey'
        } else {
            status = 'green'
        }
    }
    
    document.getElementById('mojangStatusEssentialContainer').innerHTML = tooltipEssentialHTML
    document.getElementById('mojangStatusNonEssentialContainer').innerHTML = tooltipNonEssentialHTML
    document.getElementById('mojang_status_icon').style.color = MojangRestAPI.statusToHex(status)
}

const refreshServerStatus = async (fade = false) => {
    loggerLanding.info('Refreshing Server Status')
    
    // Para instalaciones personalizadas, no hay servidor en la distribución
    const selectedInstallId = ConfigManager.getSelectedInstallation()
    if(selectedInstallId) {
        // Instalación personalizada - no mostrar estado de servidor
        loggerLanding.info('Instalación personalizada seleccionada - no hay servidor para consultar estado')
        return
    }
    
    const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())

    let pLabel = Lang.queryJS('landing.serverStatus.server')
    let pVal = Lang.queryJS('landing.serverStatus.offline')

    try {
        if(serv && serv.hostname) {
            const servStat = await getServerStatus(47, serv.hostname, serv.port)
            console.log(servStat)
            pLabel = Lang.queryJS('landing.serverStatus.players')
            pVal = servStat.players.online + '/' + servStat.players.max
        }
    } catch (err) {
        loggerLanding.warn('Unable to refresh server status, assuming offline.')
        loggerLanding.debug(err)
    }
    if(fade){
        $('#server_status_wrapper').fadeOut(250, () => {
            document.getElementById('landingPlayerLabel').innerHTML = pLabel
            document.getElementById('player_count').innerHTML = pVal
            $('#server_status_wrapper').fadeIn(500)
        })
    } else {
        document.getElementById('landingPlayerLabel').innerHTML = pLabel
        document.getElementById('player_count').innerHTML = pVal
    }
    
}

refreshMojangStatuses()
// Server Status is refreshed in uibinder.js on distributionIndexDone.

// Refresh statuses every hour. The status page itself refreshes every day so...
let mojangStatusListener = setInterval(() => refreshMojangStatuses(true), 60*60*1000)
// Set refresh rate to once every 5 minutes.
let serverStatusListener = setInterval(() => refreshServerStatus(true), 300000)

/**
 * Shows an error overlay, toggles off the launch area.
 * 
 * @param {string} title The overlay title.
 * @param {string} desc The overlay description.
 */
function showLaunchFailure(title, desc){
    setOverlayContent(
        title,
        desc,
        Lang.queryJS('landing.launch.okay')
    )
    setOverlayHandler(null)
    toggleOverlay(true)
    toggleLaunchArea(false)
}

/* System (Java) Scan */

/**
 * Show overlay when user's configured Java is incompatible with Minecraft version
 * @param {string} mcVersion - Minecraft version
 * @param {Object} javaResult - Result from JavaManager.resolveJavaForMinecraft
 * @param {string} serverId - Server/installation ID
 */
async function showJavaIncompatibleOverlay(mcVersion, javaResult, serverId) {
    const req = javaResult.requirements
    
    setOverlayContent(
        Lang.queryJS('landing.javaManager.incompatibleTitle'),
        Lang.queryJS('landing.javaManager.incompatibleMessage', { 
            mcVersion: mcVersion,
            required: req.recommended,
            minVersion: req.min,
            maxVersion: req.max
        }),
        Lang.queryJS('landing.javaManager.downloadCompatible', { major: req.recommended }),
        Lang.queryJS('landing.javaManager.cancel')
    )
    
    setOverlayHandler(async () => {
        // Usuario acepta descargar Java compatible
        toggleOverlay(false)
        const effectiveJavaOptions = JavaManager.generateEffectiveJavaOptions(mcVersion)
        await asyncSystemScanWithJavaManager(effectiveJavaOptions, true, serverId, mcVersion)
    })
    
    setDismissHandler(() => {
        toggleOverlay(false)
        toggleLaunchArea(false)
    })
    
    toggleOverlay(true, true)
}

/**
 * System scan with JavaManager integration - detects and downloads correct Java version
 * @param {Object} effectiveJavaOptions - Java options for helios-core compatibility
 * @param {boolean} launchAfter - Whether to launch after Java is ready
 * @param {string} serverId - Server/installation ID
 * @param {string} mcVersion - Minecraft version for proper Java selection
 */
async function asyncSystemScanWithJavaManager(effectiveJavaOptions, launchAfter = true, serverId = null, mcVersion = null) {
    // Si no se proporciona serverId, usar el servidor o instalación seleccionada
    if (!serverId) {
        serverId = ConfigManager.getSelectedInstallation() || ConfigManager.getSelectedServer()
    }
    
    setLaunchDetails(Lang.queryJS('landing.systemScan.checking'))
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)
    
    // Primero, intentar detectar Java con JavaManager (respeta límites min/max)
    if (mcVersion) {
        const javaResult = await JavaManager.resolveJavaForMinecraft(mcVersion, null)
        
        if (javaResult.success) {
            // Java encontrado, guardarlo y continuar
            loggerLanding.info(`JavaManager found compatible Java: ${javaResult.executable}`)
            ConfigManager.setJavaExecutable(serverId, javaResult.executable)
            ConfigManager.save()
            
            // Update settings UI if open
            if (typeof settingsJavaExecVal !== 'undefined') {
                settingsJavaExecVal.value = javaResult.executable
                if (typeof populateJavaExecDetails === 'function') {
                    await populateJavaExecDetails(javaResult.executable)
                }
            }
            
            if (launchAfter) {
                await dlAsync()
            }
            return
        }
        
        // JavaManager dice que NO hay Java compatible - IR DIRECTAMENTE A DESCARGAR
        // NO usar helios-core fallback porque no respeta límites max de Java
        loggerLanding.info(`═══════════════════════════════════════════════════════════`)
        loggerLanding.info(`🔧 JavaManager: No compatible Java found for MC ${mcVersion}`)
        loggerLanding.info(`📥 DOWNLOADING Java ${effectiveJavaOptions.suggestedMajor} (no fallback to helios-core)`)
        loggerLanding.info(`═══════════════════════════════════════════════════════════`)
        
        setLaunchDetails(Lang.queryJS('landing.systemScan.javaDownloadPrepare'))
        
        try {
            await downloadJavaWithCallback(effectiveJavaOptions, launchAfter, serverId, mcVersion)
        } catch (err) {
            loggerLanding.error('Error downloading Java', err)
            showLaunchFailure(
                Lang.queryJS('landing.systemScan.javaDownloadFailureTitle'),
                Lang.queryJS('landing.systemScan.javaDownloadFailureText')
            )
        }
        return
    }
    
    // Solo usar helios-core si NO tenemos mcVersion (compatibilidad legacy)
    const jvmDetails = await discoverBestJvmInstallation(
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.supported
    )
    
    if (jvmDetails == null) {
        // No se encontró Java compatible, ofrecer descarga
        loggerLanding.info(`No compatible Java found, offering download of Java ${effectiveJavaOptions.suggestedMajor}`)
        
        setOverlayContent(
            Lang.queryJS('landing.systemScan.noCompatibleJava'),
            Lang.queryJS('landing.javaManager.noJavaFound', { 
                major: effectiveJavaOptions.suggestedMajor,
                mcVersion: mcVersion || 'desconocida'
            }),
            Lang.queryJS('landing.systemScan.installJava'),
            Lang.queryJS('landing.systemScan.installJavaManually')
        )
        
        setOverlayHandler(async () => {
            setLaunchDetails(Lang.queryJS('landing.systemScan.javaDownloadPrepare'))
            toggleOverlay(false)
            
            try {
                await downloadJavaWithCallback(effectiveJavaOptions, launchAfter, serverId, mcVersion)
            } catch (err) {
                loggerLanding.error('Unhandled error in Java Download', err)
                showLaunchFailure(
                    Lang.queryJS('landing.systemScan.javaDownloadFailureTitle'),
                    Lang.queryJS('landing.systemScan.javaDownloadFailureText')
                )
            }
        })
        
        setDismissHandler(() => {
            $('#overlayContent').fadeOut(250, () => {
                setOverlayContent(
                    Lang.queryJS('landing.systemScan.javaRequired', { 'major': effectiveJavaOptions.suggestedMajor }),
                    Lang.queryJS('landing.systemScan.javaRequiredMessage', { 'major': effectiveJavaOptions.suggestedMajor }),
                    Lang.queryJS('landing.systemScan.javaRequiredDismiss'),
                    Lang.queryJS('landing.systemScan.javaRequiredCancel')
                )
                setOverlayHandler(() => {
                    toggleLaunchArea(false)
                    toggleOverlay(false)
                })
                setDismissHandler(() => {
                    toggleOverlay(false, true)
                    asyncSystemScanWithJavaManager(effectiveJavaOptions, launchAfter, serverId, mcVersion)
                })
                $('#overlayContent').fadeIn(250)
            })
        })
        toggleOverlay(true, true)
    } else {
        // Java encontrado via helios-core
        const javaExec = javaExecFromRoot(jvmDetails.path)
        loggerLanding.info(`helios-core found Java at: ${javaExec}`)
        ConfigManager.setJavaExecutable(serverId, javaExec)
        ConfigManager.save()
        
        // Update settings UI if open
        if (typeof settingsJavaExecVal !== 'undefined') {
            settingsJavaExecVal.value = javaExec
            if (typeof populateJavaExecDetails === 'function') {
                await populateJavaExecDetails(javaExec)
            }
        }
        
        if (launchAfter) {
            await dlAsync()
        }
    }
}

/**
 * Download Java with proper callback for auto-launch after download
 */
async function downloadJavaWithCallback(effectiveJavaOptions, launchAfter = true, serverId = null, mcVersion = null) {
    // Validate distribution before calling helios-core
    const validatedDistribution = JavaManager.validateDistribution(effectiveJavaOptions.distribution)
    
    const asset = await latestOpenJDK(
        effectiveJavaOptions.suggestedMajor,
        ConfigManager.getDataDirectory(),
        validatedDistribution
    )
    
    if (asset == null) {
        throw new Error(Lang.queryJS('landing.downloadJava.findJdkFailure'))
    }
    
    loggerLanding.info(`Downloading Java ${effectiveJavaOptions.suggestedMajor} from ${asset.url}`)
    
    let received = 0
    await downloadFile(asset.url, asset.path, ({ transferred }) => {
        received = transferred
        setDownloadPercentage(Math.trunc((transferred / asset.size) * 100))
    })
    setDownloadPercentage(100)
    
    if (received != asset.size) {
        loggerLanding.warn(`Java Download: Expected ${asset.size} bytes but received ${received}`)
        if (!await validateLocalFile(asset.path, asset.algo, asset.hash)) {
            loggerLanding.error(`Hashes do not match, ${asset.id} may be corrupted.`)
            throw new Error(Lang.queryJS('landing.downloadJava.javaDownloadCorruptedError'))
        }
    }
    
    // Extract
    remote.getCurrentWindow().setProgressBar(2)
    
    const eLStr = Lang.queryJS('landing.downloadJava.extractingJava')
    let dotStr = ''
    setLaunchDetails(eLStr)
    const extractListener = setInterval(() => {
        if (dotStr.length >= 3) {
            dotStr = ''
        } else {
            dotStr += '.'
        }
        setLaunchDetails(eLStr + dotStr)
    }, 750)
    
    const newJavaExec = await extractJdk(asset.path)
    
    remote.getCurrentWindow().setProgressBar(-1)
    clearInterval(extractListener)
    
    // Save to ConfigManager
    if (!serverId) {
        serverId = ConfigManager.getSelectedInstallation() || ConfigManager.getSelectedServer()
    }
    ConfigManager.setJavaExecutable(serverId, newJavaExec)
    ConfigManager.save()
    
    // Invalidate JavaManager cache so it detects the new installation
    JavaManager.invalidateCache()
    
    loggerLanding.info(`Java ${effectiveJavaOptions.suggestedMajor} installed at: ${newJavaExec}`)
    setLaunchDetails(Lang.queryJS('landing.downloadJava.javaInstalled'))
    
    // Update settings UI if open
    if (typeof settingsJavaExecVal !== 'undefined') {
        settingsJavaExecVal.value = newJavaExec
        if (typeof populateJavaExecDetails === 'function') {
            await populateJavaExecDetails(newJavaExec)
        }
    }
    
    // Auto-launch after download
    if (launchAfter) {
        await dlAsync()
    }
}

/**
 * Asynchronously scan the system for valid Java installations.
 * 
 * @param {boolean} launchAfter Whether we should begin to launch after scanning. 
 */
async function asyncSystemScan(effectiveJavaOptions, launchAfter = true, serverId = null){

    // Si no se proporciona serverId, usar el servidor o instalación seleccionada
    if(!serverId) {
        serverId = ConfigManager.getSelectedInstallation() || ConfigManager.getSelectedServer()
    }

    setLaunchDetails(Lang.queryJS('landing.systemScan.checking'))
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const jvmDetails = await discoverBestJvmInstallation(
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.supported
    )

    if(jvmDetails == null) {
        // If the result is null, no valid Java installation was found.
        // Show this information to the user.
        setOverlayContent(
            Lang.queryJS('landing.systemScan.noCompatibleJava'),
            Lang.queryJS('landing.systemScan.installJavaMessage', { 'major': effectiveJavaOptions.suggestedMajor }),
            Lang.queryJS('landing.systemScan.installJava'),
            Lang.queryJS('landing.systemScan.installJavaManually')
        )
        setOverlayHandler(() => {
            setLaunchDetails(Lang.queryJS('landing.systemScan.javaDownloadPrepare'))
            toggleOverlay(false)
            
            try {
                downloadJava(effectiveJavaOptions, launchAfter)
            } catch(err) {
                loggerLanding.error('Unhandled error in Java Download', err)
                showLaunchFailure(Lang.queryJS('landing.systemScan.javaDownloadFailureTitle'), Lang.queryJS('landing.systemScan.javaDownloadFailureText'))
            }
        })
        setDismissHandler(() => {
            $('#overlayContent').fadeOut(250, () => {
                //$('#overlayDismiss').toggle(false)
                setOverlayContent(
                    Lang.queryJS('landing.systemScan.javaRequired', { 'major': effectiveJavaOptions.suggestedMajor }),
                    Lang.queryJS('landing.systemScan.javaRequiredMessage', { 'major': effectiveJavaOptions.suggestedMajor }),
                    Lang.queryJS('landing.systemScan.javaRequiredDismiss'),
                    Lang.queryJS('landing.systemScan.javaRequiredCancel')
                )
                setOverlayHandler(() => {
                    toggleLaunchArea(false)
                    toggleOverlay(false)
                })
                setDismissHandler(() => {
                    toggleOverlay(false, true)

                    asyncSystemScan(effectiveJavaOptions, launchAfter, serverId)
                })
                $('#overlayContent').fadeIn(250)
            })
        })
        toggleOverlay(true, true)
    } else {
        // Java installation found, use this to launch the game.
        const javaExec = javaExecFromRoot(jvmDetails.path)
        ConfigManager.setJavaExecutable(serverId, javaExec)
        ConfigManager.save()

        // We need to make sure that the updated value is on the settings UI.
        // Just incase the settings UI is already open.
        settingsJavaExecVal.value = javaExec
        await populateJavaExecDetails(settingsJavaExecVal.value)

        // TODO Callback hell, refactor
        // TODO Move this out, separate concerns.
        if(launchAfter){
            await dlAsync()
        }
    }

}

async function downloadJava(effectiveJavaOptions, launchAfter = true) {

    // Validate distribution before calling helios-core
    const validatedDistribution = JavaManager.validateDistribution(effectiveJavaOptions.distribution)

    // TODO Error handling.
    // asset can be null.
    const asset = await latestOpenJDK(
        effectiveJavaOptions.suggestedMajor,
        ConfigManager.getDataDirectory(),
        validatedDistribution)

    if(asset == null) {
        throw new Error(Lang.queryJS('landing.downloadJava.findJdkFailure'))
    }

    let received = 0
    await downloadFile(asset.url, asset.path, ({ transferred }) => {
        received = transferred
        setDownloadPercentage(Math.trunc((transferred/asset.size)*100))
    })
    setDownloadPercentage(100)

    if(received != asset.size) {
        loggerLanding.warn(`Java Download: Expected ${asset.size} bytes but received ${received}`)
        if(!await validateLocalFile(asset.path, asset.algo, asset.hash)) {
            log.error(`Hashes do not match, ${asset.id} may be corrupted.`)
            // Don't know how this could happen, but report it.
            throw new Error(Lang.queryJS('landing.downloadJava.javaDownloadCorruptedError'))
        }
    }

    // Extract
    // Show installing progress bar.
    remote.getCurrentWindow().setProgressBar(2)

    // Wait for extration to complete.
    const eLStr = Lang.queryJS('landing.downloadJava.extractingJava')
    let dotStr = ''
    setLaunchDetails(eLStr)
    const extractListener = setInterval(() => {
        if(dotStr.length >= 3){
            dotStr = ''
        } else {
            dotStr += '.'
        }
        setLaunchDetails(eLStr + dotStr)
    }, 750)

    const newJavaExec = await extractJdk(asset.path)

    // Extraction complete, remove the loading from the OS progress bar.
    remote.getCurrentWindow().setProgressBar(-1)

    // Extraction completed successfully.
    ConfigManager.setJavaExecutable(ConfigManager.getSelectedServer(), newJavaExec)
    ConfigManager.save()

    clearInterval(extractListener)
    setLaunchDetails(Lang.queryJS('landing.downloadJava.javaInstalled'))

    // TODO Callback hell
    // Refactor the launch functions
    asyncSystemScan(effectiveJavaOptions, launchAfter)

}

// Keep reference to Minecraft Process
let proc
// NOTA: Discord RPC se maneja únicamente en uibinder.js para estado idle del launcher
// La presencia in-game se delega a mods como CraftPresence
// Joined server regex
// Change this if your server uses something different.
const GAME_JOINED_REGEX = /\[.+\]: Sound engine started/
const GAME_LAUNCH_REGEX = /^\[.+\]: (?:MinecraftForge .+ Initialized|ModLauncher .+ starting: .+|Loading Minecraft .+ with Fabric Loader .+)$/
const MIN_LINGER = 5000

async function dlAsync(login = true) {

    // Login parameter is temporary for debug purposes. Allows testing the validation/downloads without
    // launching the game.

    const loggerLaunchSuite = LoggerUtil.getLogger('LaunchSuite')

    setLaunchDetails(Lang.queryJS('landing.dlAsync.loadingServerInfo'))

    let distro

    try {
        distro = await DistroAPI.refreshDistributionOrFallback()
        onDistroRefresh(distro)
    } catch(err) {
        loggerLaunchSuite.error('Unable to refresh distribution index.', err)
        showLaunchFailure(Lang.queryJS('landing.dlAsync.fatalError'), Lang.queryJS('landing.dlAsync.unableToLoadDistributionIndex'))
        return
    }

    const target = await resolveSelectedLaunchTarget(distro, loggerLaunchSuite, {
        failureTitle: Lang.queryJS('landing.dlAsync.fatalError'),
        autoProfileMissingText: 'La versión de OptiFine seleccionada ya no existe. Puede que haya sido eliminada.',
        installationMissingText: 'La instalación seleccionada no existe. Por favor, selecciona otra instalación.',
        installationInvalidSuffix: '. Por favor, crea una nueva instalación.',
        noSelectionText: Lang.queryJS('landing.noSelection')
    })

    if (!target) {
        return
    }

    const isDistroServer = target.kind === 'distro'
    let serv = target.server
    let serverId = target.serverId
    let mojangIndexProcessor = null
    let fullRepairModule = null

    if (target.kind === 'optifine-auto') {
        loggerLaunchSuite.info(`Lanzando auto-profile OptiFine: ${target.autoProfile.name}`)
        loggerLaunchSuite.info(`  versionId: ${target.autoProfile.versionId}`)
        loggerLaunchSuite.info(`  minecraftVersion: ${target.autoProfile.minecraftVersion}`)
    } else if (target.kind === 'custom') {
        loggerLaunchSuite.info(`Lanzando instalación personalizada: ${target.installation.name}`)
        loggerLaunchSuite.info(`  Loader: ${target.installation.loader.type} ${target.installation.loader.loaderVersion || ''}`)
        loggerLaunchSuite.info(`  Minecraft: ${target.installation.loader.minecraftVersion}`)
    }

    // ============================================================
    // DESCARGA/REPARACIÓN DE ARCHIVOS
    // - Instalaciones personalizadas y auto-profiles: validar/descargar assets vanilla via MojangIndexProcessor
    // - Servidores de distribución: FullRepair
    // ============================================================
    if (!isDistroServer) {
        mojangIndexProcessor = new MojangIndexProcessor(
            ConfigManager.getCommonDirectory(),
            serv.rawServer.minecraftVersion
        )

        try {
            // Inicializar processor (carga manifests)
            setLaunchDetails('Cargando información de la versión...')
            await mojangIndexProcessor.init()

            // Validar archivos
            loggerLaunchSuite.info('Validando archivos de Minecraft.')
            setLaunchDetails('Validando archivos de Minecraft...')
            setLaunchPercentage(0, 100)

            let totalAssets = 0
            const assetCategories = await mojangIndexProcessor.validate(async () => {
                // Callback por cada stage completado
                setLaunchPercentage(Math.min(100, (totalAssets / 4) * 100))
            })

            // Contar total de assets faltantes
            const allAssets = Object.values(assetCategories).flat()
            totalAssets = allAssets.length

            if (totalAssets > 0) {
                loggerLaunchSuite.info(`Descargando ${totalAssets} archivos de Minecraft.`)
                setLaunchDetails(`Descargando archivos de Minecraft (${totalAssets} archivos)...`)
                setLaunchPercentage(0, 100)

                let received = {}
                await downloadQueue(allAssets, ({ id, transferred }) => {
                    received[id] = transferred
                    const totalReceived = Object.values(received).reduce((acc, val) => acc + val, 0)
                    const totalSize = allAssets.reduce((acc, asset) => acc + asset.size, 0)
                    setDownloadPercentage(Math.trunc((totalReceived / totalSize) * 100))
                })
                setDownloadPercentage(100)
            } else {
                loggerLaunchSuite.info('Todos los archivos de Minecraft están actualizados.')
            }

            setLaunchPercentage(100, 100)
        } catch (err) {
            loggerLaunchSuite.error('Error durante la descarga de archivos de Minecraft para instalación personalizada.')
            showLaunchFailure('Error al descargar Minecraft', err.message || 'Ver consola para detalles')
            return
        }

        // Remove download bar
        remote.getCurrentWindow().setProgressBar(-1)
    } else {
        // Para servidores TECNILAND, usar FullRepair normal
        fullRepairModule = new FullRepair(
            ConfigManager.getCommonDirectory(),
            ConfigManager.getInstanceDirectory(),
            ConfigManager.getLauncherDirectory(),
            serverId,
            DistroAPI.isDevMode()
        )

        fullRepairModule.spawnReceiver()

        fullRepairModule.childProcess.on('error', (err) => {
            loggerLaunchSuite.error('Error during launch', err)
            showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), err.message || Lang.queryJS('landing.dlAsync.errorDuringLaunchText'))
        })
        fullRepairModule.childProcess.on('close', (code, _signal) => {
            if (code !== 0) {
                loggerLaunchSuite.error(`Full Repair Module exited with code ${code}, assuming error.`)
                showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
            }
        })

        loggerLaunchSuite.info('Validating files.')
        setLaunchDetails(Lang.queryJS('landing.dlAsync.validatingFileIntegrity'))
        let invalidFileCount = 0
        try {
            invalidFileCount = await fullRepairModule.verifyFiles(percent => {
                setLaunchPercentage(percent)
            })
            setLaunchPercentage(100)
        } catch (err) {
            loggerLaunchSuite.error('Error during file validation.')
            showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringFileVerificationTitle'), err.displayable || Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
            return
        }

        if (invalidFileCount > 0) {
            loggerLaunchSuite.info('Downloading files.')
            setLaunchDetails(Lang.queryJS('landing.dlAsync.downloadingFiles'))
            setLaunchPercentage(0)
            try {
                await fullRepairModule.download(percent => {
                    setDownloadPercentage(percent)
                })
                setDownloadPercentage(100)
            } catch (err) {
                loggerLaunchSuite.error('Error during file download.')
                showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringFileDownloadTitle'), err.displayable || Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
                return
            }
        } else {
            loggerLaunchSuite.info('No invalid files, skipping download.')
        }

        // Remove download bar.
        remote.getCurrentWindow().setProgressBar(-1)

        fullRepairModule.destroyReceiver()
    }

    setLaunchDetails(Lang.queryJS('landing.dlAsync.preparingToLaunch'))

    // Crear mojangIndexProcessor si no existe (servidores tradicionales)
    if(!mojangIndexProcessor) {
        loggerLaunchSuite.info('Creando MojangIndexProcessor para servidor tradicional')
        mojangIndexProcessor = new MojangIndexProcessor(
            ConfigManager.getCommonDirectory(),
            serv.rawServer.minecraftVersion)
        await mojangIndexProcessor.init()
    }
    
    loggerLaunchSuite.info('Obteniendo versionData de MojangIndexProcessor')
    const versionData = await mojangIndexProcessor.getVersionJson()
    loggerLaunchSuite.info(`versionData obtenido: ${versionData.id}`)
    
    let modLoaderData = null
    
    // ============================================================
    // CARGAR modLoaderData según el tipo de lanzamiento
    // ============================================================
    
    // CASO 1: Auto-profile (OptiFine detectado)
    if (target.kind === 'optifine-auto') {
        loggerLaunchSuite.info('Cargando modLoaderData para auto-profile OptiFine')

        // Cargar el version.json de OptiFine TAL CUAL
        modLoaderData = await OptiFineVersions.getOptiFineVersionJson(target.autoProfile.versionId)

        if (!modLoaderData) {
            loggerLaunchSuite.error(`Error leyendo version.json de OptiFine: ${target.autoProfile.versionId}`)
            showLaunchFailure('Error con OptiFine', `No se pudo leer el version.json de "${target.autoProfile.versionId}"`)
            return
        }

        loggerLaunchSuite.info(`[Auto-Profile] version.json de OptiFine cargado: ${modLoaderData.id}`)
        loggerLaunchSuite.info(`[Auto-Profile] mainClass: ${modLoaderData.mainClass}`)
    }
    // CASO 2: Servidor TECNILAND tradicional
    else if (isDistroServer) {
        loggerLaunchSuite.info('Cargando modLoaderData para servidor TECNILAND')
        const distributionIndexProcessor = new DistributionIndexProcessor(
            ConfigManager.getCommonDirectory(),
            distro,
            serverId
        )
        modLoaderData = await distributionIndexProcessor.loadModLoaderVersionJson(serv)
    }
    // CASO 3: Instalación personalizada tradicional
    else {
        const installation = target.installation

        if (installation.loader && installation.loader.type !== 'vanilla') {
            loggerLaunchSuite.info(`Instalación personalizada con loader: ${installation.loader.type}`)
            
            // Importar LoaderInstaller (ruta desde app/)
            const { LoaderInstaller } = require('./assets/js/loaderinstaller')
            const loaderInstaller = new LoaderInstaller(
                ConfigManager.getCommonDirectory(),
                path.join(ConfigManager.getInstanceDirectory(), installation.id),
                {
                    type: installation.loader.type,
                    minecraftVersion: installation.loader.minecraftVersion,
                    loaderVersion: installation.loader.loaderVersion
                }
            )
            
            try {
                // Validar si el loader está instalado
                const isValid = await loaderInstaller.validate()
                
                if(!isValid) {
                    loggerLaunchSuite.info(`${installation.loader.type} no está instalado, descargando...`)
                    setLaunchDetails(`Descargando ${installation.loader.type}...`)
                    
                    // Configurar callback de progreso para descarga y processors de Forge
                    if (installation.loader.type === 'forge') {
                        loaderInstaller.setProgressCallback((current, total, message) => {
                            // Detectar si es progreso de descarga (bytes) o de processors (pasos)
                            if (message && message.includes('Descargando')) {
                                // Progreso de descarga - current/total son bytes
                                const percent = total > 0 ? Math.floor((current / total) * 100) : 0
                                setLaunchDetails(message)
                                setLaunchPercentage(percent, 100)
                            } else {
                                // Progreso de processors - current/total son pasos
                                setLaunchDetails(`Procesando Forge (${current}/${total})`)
                                setLaunchPercentage(50 + Math.floor((current / total) * 30), 100)
                            }
                        })
                    }
                    
                    await loaderInstaller.install()
                }
                
                // Obtener version.json del loader
                modLoaderData = await loaderInstaller.getVersionJson()
                loggerLaunchSuite.info(`${installation.loader.type} version.json cargado`)
                
            } catch(error) {
                loggerLaunchSuite.error(`Error instalando ${installation.loader.type}:`, error)
                showLaunchFailure(`Error con ${installation.loader.type}`, error.message || 'Ver consola para detalles')
                return
            }
        } else {
            // Para instalaciones personalizadas Vanilla
            // Verificar si tiene OptiFine habilitado
            if (installation.optifine && installation.optifine.enabled && installation.optifine.versionId) {
                loggerLaunchSuite.info(`Instalación Vanilla con OptiFine: ${installation.optifine.versionId}`)
                
                // Verificar que la versión OptiFine existe
                const optifineExists = await OptiFineVersions.optiFineVersionExists(installation.optifine.versionId)
                if (!optifineExists) {
                    loggerLaunchSuite.error(`OptiFine version.json no encontrado: ${installation.optifine.versionId}`)
                    showLaunchFailure('OptiFine no encontrado', 
                        `La versión de OptiFine "${installation.optifine.versionId}" no está instalada. ` +
                        'Por favor, instálala usando el instalador oficial de OptiFine.')
                    return
                }
                
                // Cargar version.json de OptiFine como modLoaderData
                modLoaderData = await OptiFineVersions.getOptiFineVersionJson(installation.optifine.versionId)
                if (!modLoaderData) {
                    loggerLaunchSuite.error(`Error leyendo version.json de OptiFine: ${installation.optifine.versionId}`)
                    showLaunchFailure('Error con OptiFine', 'No se pudo leer el version.json de OptiFine')
                    return
                }
                
                loggerLaunchSuite.info(`OptiFine version.json cargado: ${modLoaderData.id}`)
                
            } else {
                // Vanilla puro, sin OptiFine
                loggerLaunchSuite.info('Instalación personalizada - usando Vanilla puro (versionData como modManifest)')
                modLoaderData = versionData
                loggerLaunchSuite.info(`modLoaderData = versionData (${modLoaderData.id})`)
            }
        }
    }

    if(login) {
        const authUser = ConfigManager.getSelectedAccount()
        loggerLaunchSuite.info(`Sending selected account (${authUser.displayName}) to ProcessBuilder.`)
        let pb = new ProcessBuilder(serv, versionData, modLoaderData, authUser, remote.app.getVersion())
        setLaunchDetails(Lang.queryJS('landing.dlAsync.launchingGame'))

        // ============================================================
        // Discord RPC para instancias custom/vanilla
        // Servidores TECNILAND: presencia in-game se delega a mods
        // ============================================================
        if (!isDistroServer && distro.rawDistribution.discord) {
            const genericDiscordSettings = {
                shortId: 'Custom',
                largeImageKey: 'launcher-icon',
                largeImageText: 'Minecraft desde TECNILAND Nexus'
            }

            // Construir descripción de versión y loader
            let versionInfo = 'Minecraft'
            if (target.kind === 'optifine-auto') {
                versionInfo = `Versión: ${target.autoProfile.minecraftVersion} (OptiFine)`
            } else if (target.kind === 'custom') {
                const loaderType = target.installation.loader?.type || 'Vanilla'
                const mcVersion = target.installation.loader?.minecraftVersion || 'unknown'
                const loaderName = loaderType.charAt(0).toUpperCase() + loaderType.slice(1)
                versionInfo = `Versión: ${mcVersion} (${loaderName})`
            }

            try {
                // Verificar si RPC ya está inicializado
                if (DiscordWrapper.isActive()) {
                    loggerLaunchSuite.info('[DISCORD] Updating to custom instance presence')
                    DiscordWrapper.updateDetails('Jugando Minecraft con TECNILAND Nexus')
                } else {
                    loggerLaunchSuite.info('[DISCORD] Initializing RPC for custom instance')
                    DiscordWrapper.initRPC(
                        distro.rawDistribution.discord,
                        genericDiscordSettings,
                        'Jugando Minecraft con TECNILAND Nexus'
                    )
                }
            } catch(err) {
                loggerLaunchSuite.error('[DISCORD] Failed to set custom instance presence:', err)
            }
        }

        // const SERVER_JOINED_REGEX = /\[.+\]: \[CHAT\] [a-zA-Z0-9_]{1,16} joined the game/
        const SERVER_JOINED_REGEX = new RegExp(`\\[.+\\]: \\[CHAT\\] ${authUser.displayName} joined the game`)

        const onLoadComplete = () => {
            toggleLaunchArea(false)
            // Discord RPC in-game se delega a mods como CraftPresence
            // El launcher no intenta controlar estados in-game
            if(proc) {
                proc.stdout.removeListener('data', tempListener)
                proc.stderr.removeListener('data', gameErrorListener)
            }
        }
        const start = Date.now()

        // Attach a temporary listener to the client output.
        // Will wait for a certain bit of text meaning that
        // the client application has started, and we can hide
        // the progress bar stuff.
        const tempListener = function(data){
            if(GAME_LAUNCH_REGEX.test(data.trim())){
                const diff = Date.now()-start
                if(diff < MIN_LINGER) {
                    setTimeout(onLoadComplete, MIN_LINGER-diff)
                } else {
                    onLoadComplete()
                }
            }
        }

        // NOTA: Discord RPC in-game se delega a mods como CraftPresence
        // El launcher ya no monitorea estados de juego para actualizar Discord

        const gameErrorListener = function(data){
            data = data.trim()
            if(data.indexOf('Could not find or load main class net.minecraft.launchwrapper.Launch') > -1){
                loggerLaunchSuite.error('Game launch failed, LaunchWrapper was not downloaded properly.')
                showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.launchWrapperNotDownloaded'))
            }
        }

        try {
            // Build Minecraft process (async due to Java validation)
            proc = await pb.build()

            // Notificar al live log viewer que el juego inició
            window.dispatchEvent(new CustomEvent('minecraft-process-started'))

            // Wrapper para stdout que envía datos al live log viewer
            const stdoutWrapper = function(data) {
                // Enviar al live log viewer
                window.dispatchEvent(new CustomEvent('minecraft-log-data', {
                    detail: { data: data.toString(), isError: false }
                }))
                // Llamar listener original
                tempListener(data)
            }

            // Wrapper para stderr que envía datos al live log viewer
            const stderrWrapper = function(data) {
                // Enviar al live log viewer
                window.dispatchEvent(new CustomEvent('minecraft-log-data', {
                    detail: { data: data.toString(), isError: true }
                }))
                // Llamar listener original
                gameErrorListener(data)
            }

            // Bind listeners to stdout/stderr.
            proc.stdout.on('data', stdoutWrapper)
            proc.stderr.on('data', stderrWrapper)

            setLaunchDetails(Lang.queryJS('landing.dlAsync.doneEnjoyServer'))

            // Listen for game close event to reset UI
            proc.on('close', (code, signal) => {
                loggerLaunchSuite.info(`Minecraft closed with code ${code}`)
                
                // Notificar al live log viewer
                window.dispatchEvent(new CustomEvent('minecraft-process-closed', {
                    detail: { code }
                }))
                
                // Reset UI to allow launching again
                toggleLaunchArea(false)
                setLaunchEnabled(true)
                proc = null
                
                // Discord RPC: volver a presencia idle del launcher
                // Solo para instancias custom (modpacks TECNILAND delegan a mods in-game)
                if (!isDistroServer && distro.rawDistribution.discord && DiscordWrapper.isActive()) {
                    loggerLaunchSuite.info('[DISCORD] Resetting to launcher idle after custom instance closed')
                    try {
                        DiscordWrapper.updateDetails(Lang.queryJS('discord.waiting'))
                    } catch(err) {
                        loggerLaunchSuite.error('[DISCORD] Failed to reset to idle:', err)
                    }
                }
            })

            // NOTA: Discord RPC in-game se delega a mods como CraftPresence
            // El launcher mantiene su presencia idle, no intenta cambiarla al lanzar el juego

        } catch(err) {

            loggerLaunchSuite.error('Error during launch', err)
            showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.checkConsoleForDetails'))

        }
    }

}

/**
 * News Loading Functions
 */

// DOM Cache
const newsContent                   = document.getElementById('newsContent')
const newsArticleTitle              = document.getElementById('newsArticleTitle')
const newsArticleDate               = document.getElementById('newsArticleDate')
const newsArticleAuthor             = document.getElementById('newsArticleAuthor')
const newsArticleComments           = document.getElementById('newsArticleComments')
const newsNavigationStatus          = document.getElementById('newsNavigationStatus')
const newsArticleContentScrollable  = document.getElementById('newsArticleContentScrollable')
const nELoadSpan                    = document.getElementById('nELoadSpan')

// News slide caches.
let newsActive = false
let newsGlideCount = 0

/**
 * Show the news UI via a slide animation.
 * 
 * @param {boolean} up True to slide up, otherwise false. 
 */
function slide_(up){
    const lCUpper = document.querySelector('#landingContainer > #upper')
    const lCLLeft = document.querySelector('#landingContainer > #lower > #left')
    const lCLCenter = document.querySelector('#landingContainer > #lower > #center')
    const lCLRight = document.querySelector('#landingContainer > #lower > #right')
    const newsBtn = document.querySelector('#landingContainer > #lower > #center #content')
    const landingContainer = document.getElementById('landingContainer')
    const newsContainer = document.querySelector('#landingContainer > #newsContainer')

    newsGlideCount++

    if(up){
        lCUpper.style.top = '-200vh'
        lCLLeft.style.top = '-200vh'
        lCLCenter.style.top = '-200vh'
        lCLRight.style.top = '-200vh'
        newsBtn.style.top = '130vh'
        newsContainer.style.top = '0px'
        //date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'})
        //landingContainer.style.background = 'rgba(29, 29, 29, 0.55)'
        landingContainer.style.background = 'rgba(0, 0, 0, 0.50)'
        setTimeout(() => {
            if(newsGlideCount === 1){
                lCLCenter.style.transition = 'none'
                newsBtn.style.transition = 'none'
            }
            newsGlideCount--
        }, 2000)
    } else {
        setTimeout(() => {
            newsGlideCount--
        }, 2000)
        landingContainer.style.background = null
        lCLCenter.style.transition = null
        newsBtn.style.transition = null
        newsContainer.style.top = '100%'
        lCUpper.style.top = '0px'
        lCLLeft.style.top = '0px'
        lCLCenter.style.top = '0px'
        lCLRight.style.top = '0px'
        newsBtn.style.top = '10px'
    }
}

// Bind news button.
document.getElementById('newsButton').onclick = () => {
    // Toggle tabbing.
    if(newsActive){
        $('#landingContainer *').removeAttr('tabindex')
        $('#newsContainer *').attr('tabindex', '-1')
    } else {
        $('#landingContainer *').attr('tabindex', '-1')
        $('#newsContainer, #newsContainer *, #lower, #lower #center *').removeAttr('tabindex')
        if(newsAlertShown){
            $('#newsButtonAlert').fadeOut(2000)
            newsAlertShown = false
            ConfigManager.setNewsCacheDismissed(true)
            ConfigManager.save()
        }
    }
    slide_(!newsActive)
    newsActive = !newsActive
}

// Array to store article meta.
let newsArr = null

// News load animation listener.
let newsLoadingListener = null

/**
 * Set the news loading animation.
 * 
 * @param {boolean} val True to set loading animation, otherwise false.
 */
function setNewsLoading(val){
    if(val){
        const nLStr = Lang.queryJS('landing.news.checking')
        let dotStr = '..'
        nELoadSpan.innerHTML = nLStr + dotStr
        newsLoadingListener = setInterval(() => {
            if(dotStr.length >= 3){
                dotStr = ''
            } else {
                dotStr += '.'
            }
            nELoadSpan.innerHTML = nLStr + dotStr
        }, 750)
    } else {
        if(newsLoadingListener != null){
            clearInterval(newsLoadingListener)
            newsLoadingListener = null
        }
    }
}

// Bind retry button.
newsErrorRetry.onclick = () => {
    $('#newsErrorFailed').fadeOut(250, () => {
        initNews()
        $('#newsErrorLoading').fadeIn(250)
    })
}

newsArticleContentScrollable.onscroll = (e) => {
    if(e.target.scrollTop > Number.parseFloat($('.newsArticleSpacerTop').css('height'))){
        newsContent.setAttribute('scrolled', '')
    } else {
        newsContent.removeAttribute('scrolled')
    }
}

/**
 * Reload the news without restarting.
 * 
 * @returns {Promise.<void>} A promise which resolves when the news
 * content has finished loading and transitioning.
 */
function reloadNews(){
    return new Promise((resolve, reject) => {
        $('#newsContent').fadeOut(250, () => {
            $('#newsErrorLoading').fadeIn(250)
            initNews().then(() => {
                resolve()
            })
        })
    })
}

let newsAlertShown = false

/**
 * Show the news alert indicating there is new news.
 */
function showNewsAlert(){
    newsAlertShown = true
    $(newsButtonAlert).fadeIn(250)
}

async function digestMessage(str) {
    const msgUint8 = new TextEncoder().encode(str)
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    return hashHex
}

/**
 * Initialize News UI. This will load the news and prepare
 * the UI accordingly.
 * 
 * @returns {Promise.<void>} A promise which resolves when the news
 * content has finished loading and transitioning.
 */
async function initNews(){

    setNewsLoading(true)

    const news = await loadNews()

    newsArr = news?.articles || null

    if(newsArr == null){
        // News Loading Failed
        setNewsLoading(false)

        await $('#newsErrorLoading').fadeOut(250).promise()
        await $('#newsErrorFailed').fadeIn(250).promise()

    } else if(newsArr.length === 0) {
        // No News Articles
        setNewsLoading(false)

        ConfigManager.setNewsCache({
            date: null,
            content: null,
            dismissed: false
        })
        ConfigManager.save()

        await $('#newsErrorLoading').fadeOut(250).promise()
        await $('#newsErrorNone').fadeIn(250).promise()
    } else {
        // Success
        setNewsLoading(false)

        const lN = newsArr[0]
        const cached = ConfigManager.getNewsCache()
        let newHash = await digestMessage(lN.content)
        let newDate = new Date(lN.dateISO || lN.date) // Use ISO date for proper comparison
        let isNew = false

        if(cached.date != null && cached.content != null){

            if(new Date(cached.date) >= newDate){

                // Compare Content
                if(cached.content !== newHash){
                    isNew = true
                    showNewsAlert()
                } else {
                    if(!cached.dismissed){
                        isNew = true
                        showNewsAlert()
                    }
                }

            } else {
                isNew = true
                showNewsAlert()
            }

        } else {
            isNew = true
            showNewsAlert()
        }

        if(isNew){
            ConfigManager.setNewsCache({
                date: newDate.getTime(),
                content: newHash,
                dismissed: false
            })
            ConfigManager.save()
        }

        const switchHandler = (forward) => {
            let cArt = parseInt(newsContent.getAttribute('article'))
            let nxtArt = forward ? (cArt >= newsArr.length-1 ? 0 : cArt + 1) : (cArt <= 0 ? newsArr.length-1 : cArt - 1)
    
            displayArticle(newsArr[nxtArt], nxtArt+1)
        }

        document.getElementById('newsNavigateRight').onclick = () => { switchHandler(true) }
        document.getElementById('newsNavigateLeft').onclick = () => { switchHandler(false) }
        await $('#newsErrorContainer').fadeOut(250).promise()
        displayArticle(newsArr[0], 1)
        await $('#newsContent').fadeIn(250).promise()
    }


}

/**
 * Add keyboard controls to the news UI. Left and right arrows toggle
 * between articles. If you are on the landing page, the up arrow will
 * open the news UI.
 */
document.addEventListener('keydown', (e) => {
    if(newsActive){
        if(e.key === 'ArrowRight' || e.key === 'ArrowLeft'){
            document.getElementById(e.key === 'ArrowRight' ? 'newsNavigateRight' : 'newsNavigateLeft').click()
        }
        // Interferes with scrolling an article using the down arrow.
        // Not sure of a straight forward solution at this point.
        // if(e.key === 'ArrowDown'){
        //     document.getElementById('newsButton').click()
        // }
    } else {
        if(getCurrentView() === VIEWS.landing){
            if(e.key === 'ArrowUp'){
                document.getElementById('newsButton').click()
            }
        }
    }
})

/**
 * Display a news article on the UI.
 * 
 * @param {Object} articleObject The article meta object.
 * @param {number} index The article index.
 */
function displayArticle(articleObject, index){
    // SECURITY: Usar textContent para datos de texto plano
    newsArticleTitle.textContent = articleObject.title
    newsArticleTitle.href = '#'
    newsArticleTitle.onclick = (e) => e.preventDefault() // Disable click
    newsArticleTitle.style.cursor = 'default' // Remove pointer cursor
    newsArticleAuthor.textContent = 'by ' + articleObject.author
    newsArticleDate.textContent = articleObject.date
    newsArticleComments.textContent = articleObject.comments
    newsArticleComments.href = articleObject.commentsLink
    
    // SECURITY: Sanitizar contenido HTML antes de inyectar
    const sanitizedContent = SecurityHelper.sanitizeHTML(articleObject.content, {
        allowImages: true,
        allowLinks: true,
        allowStyles: true
    })
    newsArticleContentScrollable.innerHTML = '<div id="newsArticleContentWrapper"><div class="newsArticleSpacerTop"></div>' + sanitizedContent + '<div class="newsArticleSpacerBot"></div></div>'
    
    Array.from(newsArticleContentScrollable.getElementsByClassName('bbCodeSpoilerButton')).forEach(v => {
        v.onclick = () => {
            const text = v.parentElement.getElementsByClassName('bbCodeSpoilerText')[0]
            text.style.display = text.style.display === 'block' ? 'none' : 'block'
        }
    })
    newsNavigationStatus.innerHTML = Lang.query('ejs.landing.newsNavigationStatus', {currentPage: index, totalPages: newsArr.length})
    newsContent.setAttribute('article', index-1)
}

/**
 * TECNILAND News API Configuration
 * Endpoint for fetching news from backend (Fly.io production)
 */
const isDev = require('./assets/js/isdev')
const NEWS_API_BASE = isDev ? 'http://localhost:3000' : 'https://tecniland-backend.fly.dev'
const NEWS_API_ENDPOINT = `${NEWS_API_BASE}/api/news`
const NEWS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes cache

// News cache for performance
let newsCache = {
    data: null,
    timestamp: null
}

/**
 * Get fallback news when API is unavailable
 * @returns {Object} Fallback news object with maintenance message
 */
function getFallbackNews() {
    return {
        articles: [{
            id: 'maintenance',
            link: 'https://github.com/Ppkeash/TECNILAND-Nexus',
            title: Lang.queryJS('landing.news.maintenanceTitle'),
            date: new Date().toLocaleDateString('es-ES', {month: 'short', day: 'numeric', year: 'numeric'}),
            author: 'TECNILAND Team',
            content: Lang.queryJS('landing.news.maintenanceContent'),
            comments: '0 Comments',
            commentsLink: 'https://github.com/Ppkeash/TECNILAND-Nexus/issues'
        }]
    }
}

/**
 * Transform API response to launcher format
 * @param {Array} apiArticles Articles from backend API
 * @returns {Array} Transformed articles for UI
 */
function transformNewsArticles(apiArticles) {
    return apiArticles.map(article => {
        // Format date from ISO to readable format
        const publishDate = new Date(article.publishedAt)
        const formattedDate = publishDate.toLocaleDateString('es-ES', {
            month: 'short', 
            day: 'numeric', 
            year: 'numeric'
        })

        // Build comments text - always show "Ver en la web" to redirect to web panel
        const commentsText = 'Ver en la web'

        // Build content with cover image if available.
        // El alt se escapa como defensa en profundidad; igualmente todo el
        // displayContent pasa por SecurityHelper.sanitizeHTML al renderizar.
        const displayContent = article.coverImage
            ? `<img src="${article.coverImage}" class="newsArticleCoverImage" alt="${SecurityHelper.escapeHTML(article.title)}"/>${article.content}`
            : article.content

        // Build link to news detail (use slug for better URLs)
        const newsLink = article.link || `${NEWS_API_BASE}/news/${article.slug}`
        // Link to web panel news section
        const commentsLink = 'https://tecnilandnex.online/server'

        return {
            id: article.id || article.slug,
            link: newsLink,
            title: article.title,
            date: formattedDate,
            dateISO: article.publishedAt, // Keep ISO format for comparisons
            author: article.author?.username || 'TECNILAND Team',
            content: displayContent,
            comments: commentsText,
            commentsLink: commentsLink,
            featured: article.featured || false,
            views: article.views || 0,
            slug: article.slug,
            excerpt: article.excerpt || ''
        }
    })
}

/**
 * Load news from TECNILAND Backend API.
 * Fetches news articles from the backend with caching support.
 * Falls back to maintenance message if API is unavailable.
 * 
 * @param {Object} options - Optional parameters
 * @param {number} options.limit - Number of articles to fetch (default: 10)
 * @param {boolean} options.featured - Only fetch featured articles
 * @param {boolean} options.forceRefresh - Bypass cache and fetch fresh data
 * @returns {Object} News object with articles array
 */
async function loadNews(options = {}) {
    const { limit = 10, featured = false, forceRefresh = false } = options

    loggerLanding.info('[NEWS] Starting news fetch...')
    loggerLanding.info(`[NEWS] Options: limit=${limit}, featured=${featured}, forceRefresh=${forceRefresh}`)

    // Check cache first (unless force refresh)
    if (!forceRefresh && newsCache.data && newsCache.timestamp) {
        const cacheAge = Date.now() - newsCache.timestamp
        if (cacheAge < NEWS_CACHE_TTL) {
            loggerLanding.debug('[NEWS] Returning cached news data')
            return newsCache.data
        }
    }

    try {
        // Build API URL with parameters
        const params = new URLSearchParams()
        params.append('limit', limit.toString())
        if (featured) params.append('featured', 'true')

        const apiUrl = `${NEWS_API_ENDPOINT}?${params.toString()}`
        loggerLanding.info(`[NEWS] Fetching news from: ${apiUrl}`)

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 5000
        })

        loggerLanding.info(`[NEWS] Response status: ${response.status}`)

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()
        loggerLanding.info('[NEWS] Response data:', JSON.stringify(data).substring(0, 200) + '...')

        if (data.success && data.data?.articles?.length > 0) {
            // Transform API response to launcher format
            const transformedArticles = transformNewsArticles(data.data.articles)
            
            const newsResult = {
                articles: transformedArticles,
                total: data.data.total || transformedArticles.length,
                hasMore: data.data.hasMore || false
            }

            // Update cache
            newsCache = {
                data: newsResult,
                timestamp: Date.now()
            }

            loggerLanding.info(`[NEWS] ✅ Successfully loaded ${transformedArticles.length} articles from API`)
            return newsResult
        } else if (data.success && data.data?.articles?.length === 0) {
            // API is working but there are no published articles yet
            loggerLanding.warn('[NEWS] ⚠️ API responded successfully but no articles available')
            return getFallbackNews()
        } else {
            loggerLanding.warn('[NEWS] API returned unexpected response format, showing fallback')
            return getFallbackNews()
        }

    } catch (error) {
        loggerLanding.error('[NEWS] ❌ Failed to fetch news from API:', error.message)
        loggerLanding.error('[NEWS] Error stack:', error.stack)
        
        // If we have cached data (even expired), use it as fallback
        if (newsCache.data) {
            loggerLanding.warn('[NEWS] Using expired cache as fallback')
            return newsCache.data
        }

        // Ultimate fallback: maintenance message
        loggerLanding.warn('[NEWS] Showing maintenance message fallback')
        return getFallbackNews()
    }
}

/**
 * Refresh the landing page UI for the currently selected server/modpack.
 * Called from overlay.js when a modpack is selected for play.
 */
async function refreshLandingForSelectedServer() {
    const serverId = ConfigManager.getSelectedServer()
    if (!serverId) return
    
    try {
        const distro = await DistroAPI.getDistribution()
        const server = distro.getServerById(serverId)
        if (server) {
            server_selection_button.innerHTML = '&#8226; ' + server.rawServer.name
            setLaunchEnabled(true)
            loggerLanding.info(`Landing refreshed for modpack: ${serverId}`)
        }
    } catch (err) {
        loggerLanding.error('Failed to refresh landing for modpack:', err)
    }
}

// Expose necessary functions globally for other scripts
// These functions are called from uibinder.js, overlay.js, and settings.js
window.updateSelectedServer = updateSelectedServer
window.updateSelectedAccount = updateSelectedAccount
window.refreshServerStatus = refreshServerStatus
window.refreshLandingForSelectedServer = refreshLandingForSelectedServer
window.initNews = initNews
window.reloadNews = reloadNews

// Initialize TECNILAND Auth UI to load and validate session on startup
try {
    const TecnilandAuthUI = require('./assets/js/tecnilandauth/TecnilandAuthUI')
    if (TecnilandAuthUI && typeof TecnilandAuthUI.init === 'function') {
        loggerLanding.info('[LANDING] Inicializando TecnilandAuthUI...')
        TecnilandAuthUI.init()
    } else {
        loggerLanding.warn('[LANDING] TecnilandAuthUI no disponible o sin método init')
    }
} catch (err) {
    loggerLanding.error('[LANDING] Error al cargar TecnilandAuthUI:', err)
}

// Inicializar SkinViewer3D para el avatar del landing
loggerLanding.info('[LANDING] Preparando SkinViewer3D...')
setTimeout(() => {
    try {
        const SkinViewer3DLanding = require('./assets/js/skinviewer3d/SkinViewer3DLanding')
        if (SkinViewer3DLanding && typeof SkinViewer3DLanding.initLandingSkinViewer === 'function') {
            loggerLanding.info('[LANDING] Inicializando SkinViewer3D...')
            SkinViewer3DLanding.initLandingSkinViewer()
        } else {
            loggerLanding.warn('[LANDING] SkinViewer3DLanding no disponible')
        }
    } catch (err) {
        loggerLanding.error('[LANDING] Error al cargar SkinViewer3DLanding:', err.message)
    }
}, 2000)

})() // End of IIFE
