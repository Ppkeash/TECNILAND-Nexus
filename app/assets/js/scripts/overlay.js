/**
 * Script for overlay.ejs
 */

// ConfigManager, InstallationManager, ipcRenderer y remote ya están disponibles globalmente
const { BrowserWindow } = remote

// Importar módulo de detección de OptiFine
const OptiFineVersions = require('./assets/js/optifineversions')

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

// ============================================================================
// UPGRADE-IN-PLACE: UI de confirmación
// ============================================================================

/**
 * Mostrar overlay de confirmación para upgrade de instancia
 * @param {string} instanceId - ID de la instancia
 * @param {Object} currentInstall - Instalación actual
 * @param {Object} newProfile - Nuevo perfil
 * @param {Object} changes - Análisis de cambios de InstallationManager.analyzeUpgradeChanges()
 */
async function showUpgradeConfirmationOverlay(instanceId, currentInstall, newProfile, changes) {
    const fs = require('fs-extra')
    const path = require('path')
    
    // Ocultar editor de instalaciones
    document.getElementById('installationEditorContent').style.display = 'none'
    
    // Preparar resumen de cambios
    let summaryHtml = '<div style="text-align: left; margin: 15px 0;">'
    
    // Título del resumen
    summaryHtml += '<div style="font-weight: bold; margin-bottom: 10px; color: #4fc3f7;">📋 Resumen de cambios:</div>'
    
    // Cambios detallados
    summaryHtml += '<ul style="margin: 0; padding-left: 20px; line-height: 1.8;">'
    
    for (const change of changes.summary) {
        summaryHtml += `<li>${change}</li>`
    }
    
    summaryHtml += '</ul>'
    
    // Sección: Datos preservados
    summaryHtml += '<div style="margin-top: 15px; padding: 10px; background: rgba(76, 175, 80, 0.2); border-radius: 6px; border-left: 3px solid #4caf50;">'
    summaryHtml += '<strong style="color: #81c784;">✅ Se preservará:</strong><br>'
    summaryHtml += '• saves/ (mundos)<br>'
    summaryHtml += '• options.txt (configuración)<br>'
    summaryHtml += '• resourcepacks/<br>'
    summaryHtml += '• screenshots/'
    summaryHtml += '</div>'
    
    // Sección: Mods (solo si cambia loader)
    if (changes.loaderTypeChanged) {
        // Verificar si hay mods
        const instancePath = path.join(ConfigManager.getInstanceDirectory(), instanceId)
        const modsPath = path.join(instancePath, 'mods')
        let modsCount = 0
        
        if (fs.existsSync(modsPath)) {
            const modFiles = fs.readdirSync(modsPath).filter(f => f.endsWith('.jar'))
            modsCount = modFiles.length
        }
        
        if (modsCount > 0) {
            summaryHtml += '<div style="margin-top: 10px; padding: 10px; background: rgba(255, 152, 0, 0.2); border-radius: 6px; border-left: 3px solid #ff9800;">'
            summaryHtml += `<strong style="color: #ffb74d;">⚠️ Mods (${modsCount}):</strong><br>`
            summaryHtml += 'Se moverán a <code>mods.disabled/</code> por compatibilidad.<br>'
            summaryHtml += '<small>Actualiza tus mods para el nuevo loader y restaurálos manualmente.</small>'
            summaryHtml += '</div>'
        }
    }
    
    // Sección: Backup
    summaryHtml += '<div style="margin-top: 10px; padding: 10px; background: rgba(33, 150, 243, 0.2); border-radius: 6px; border-left: 3px solid #2196f3;">'
    summaryHtml += '<strong style="color: #64b5f6;">💾 Backup automático:</strong><br>'
    summaryHtml += 'Se creará un backup completo antes de aplicar cambios.'
    summaryHtml += '</div>'
    
    summaryHtml += '</div>'
    
    // Warning adicional para downgrade
    if (changes.isDowngrade) {
        setOverlayContent(
            '⚠️ Confirmación de DOWNGRADE',
            `<div style="color: #ef5350; font-weight: bold; margin-bottom: 10px;">
                ¡ATENCIÓN! Estás bajando la versión de Minecraft.
            </div>
            <div style="margin-bottom: 15px;">
                Esto puede causar <strong>corrupción irreversible</strong> de mundos si fueron 
                abiertos en versiones más nuevas.
            </div>
            ${summaryHtml}
            <div style="margin-top: 15px; padding: 10px; background: rgba(244, 67, 54, 0.2); border-radius: 6px;">
                <label style="cursor: pointer;">
                    <input type="checkbox" id="downgradeConfirmCheck" style="margin-right: 8px;">
                    <strong>Entiendo el riesgo de corrupción y deseo continuar</strong>
                </label>
            </div>`,
            '🔄 Aplicar Downgrade',
            'Cancelar'
        )
        
        // Handler especial para downgrade: requiere checkbox
        setOverlayHandler(async () => {
            const checkbox = document.getElementById('downgradeConfirmCheck')
            if (!checkbox || !checkbox.checked) {
                // Mostrar error temporal
                const desc = document.getElementById('overlayDesc')
                const originalColor = desc.style.borderColor
                desc.style.border = '2px solid #ef5350'
                setTimeout(() => {
                    desc.style.border = originalColor ? `2px solid ${originalColor}` : 'none'
                }, 1000)
                return
            }
            
            toggleOverlay(false)
            await executeUpgradeInPlace(instanceId, newProfile, changes)
        })
        
    } else {
        // Upgrade normal o cambio de loader
        const title = changes.loaderTypeChanged ? 
            '🔄 Confirmar cambio de loader' : 
            '📈 Confirmar actualización'
        
        setOverlayContent(
            title,
            summaryHtml,
            '✅ Aplicar cambios',
            'Cancelar'
        )
        
        setOverlayHandler(async () => {
            toggleOverlay(false)
            await executeUpgradeInPlace(instanceId, newProfile, changes)
        })
    }
    
    // Handler de cancelar
    setDismissHandler(() => {
        toggleOverlay(false)
        // Reabrir editor
        document.getElementById('installationEditorContent').style.display = 'block'
    })
    
    toggleOverlay(true, true)
}

/**
 * Ejecutar el upgrade-in-place después de confirmación
 */
async function executeUpgradeInPlace(instanceId, newProfile, changes) {
    // Mostrar overlay de progreso
    setOverlayContent(
        '⏳ Aplicando cambios...',
        '<div style="text-align: center;">' +
        '<div style="font-size: 48px; margin-bottom: 20px;">🔄</div>' +
        '<div>Creando backup y actualizando instalación...</div>' +
        '<div style="margin-top: 10px; color: rgba(255,255,255,0.6);">No cierres el launcher</div>' +
        '</div>',
        'Espera...'
    )
    document.getElementById('overlayAcknowledge').disabled = true
    document.getElementById('overlayDismiss').style.display = 'none'
    toggleOverlay(true, false)
    
    try {
        // Ejecutar upgrade
        const result = await InstallationManager.upgradeInstanceInPlace(instanceId, newProfile)
        
        if (result.success) {
            // Éxito
            let successMsg = '<div style="text-align: center;">'
            successMsg += '<div style="font-size: 48px; margin-bottom: 20px;">✅</div>'
            successMsg += '<div style="font-weight: bold; color: #81c784;">Instalación actualizada correctamente</div>'
            
            if (result.backupPath) {
                successMsg += '<div style="margin-top: 15px; padding: 10px; background: rgba(33, 150, 243, 0.2); border-radius: 6px;">'
                successMsg += '<strong>💾 Backup creado en:</strong><br>'
                successMsg += `<code style="font-size: 11px; word-break: break-all;">${result.backupPath}</code>`
                successMsg += '</div>'
            }
            
            if (result.modsDisabled > 0) {
                successMsg += '<div style="margin-top: 10px; padding: 10px; background: rgba(255, 152, 0, 0.2); border-radius: 6px;">'
                successMsg += `<strong>⚠️ ${result.modsDisabled} mods deshabilitados</strong><br>`
                successMsg += 'Revisa <code>mods.disabled/</code> en tu instancia.'
                successMsg += '</div>'
            }
            
            if (result.warnings && result.warnings.length > 0) {
                successMsg += '<div style="margin-top: 10px; color: #ffb74d;">'
                successMsg += result.warnings.join('<br>')
                successMsg += '</div>'
            }
            
            successMsg += '</div>'
            
            setOverlayContent('✅ Upgrade completado', successMsg, 'OK')
            document.getElementById('overlayAcknowledge').disabled = false
            setOverlayHandler(async () => {
                toggleOverlay(false)
                closeInstallationEditor()
                await prepareServerSelectionList()
            })
            
        } else {
            // Error
            let errorMsg = '<div style="text-align: center;">'
            errorMsg += '<div style="font-size: 48px; margin-bottom: 20px;">❌</div>'
            errorMsg += `<div style="color: #ef5350;">${result.error}</div>`
            
            if (result.backupPath) {
                errorMsg += '<div style="margin-top: 15px; padding: 10px; background: rgba(33, 150, 243, 0.2); border-radius: 6px;">'
                errorMsg += '<strong>💾 Backup disponible:</strong><br>'
                errorMsg += `<code style="font-size: 11px;">${result.backupPath}</code><br>`
                errorMsg += '<small>Puedes restaurar manualmente si es necesario.</small>'
                errorMsg += '</div>'
            }
            
            errorMsg += '</div>'
            
            setOverlayContent('❌ Error en upgrade', errorMsg, 'Cerrar', 'Reintentar')
            document.getElementById('overlayAcknowledge').disabled = false
            document.getElementById('overlayDismiss').style.display = ''
            
            setOverlayHandler(() => {
                toggleOverlay(false)
                closeInstallationEditor()
            })
            
            setDismissHandler(() => {
                toggleOverlay(false)
                document.getElementById('installationEditorContent').style.display = 'block'
            })
        }
        
    } catch (err) {
        console.error('[Upgrade] Error inesperado:', err)
        
        setOverlayContent(
            '❌ Error inesperado',
            `<div style="text-align: center;">
                <div style="font-size: 48px; margin-bottom: 20px;">💥</div>
                <div style="color: #ef5350;">${err.message}</div>
            </div>`,
            'Cerrar'
        )
        document.getElementById('overlayAcknowledge').disabled = false
        setOverlayHandler(() => {
            toggleOverlay(false)
            closeInstallationEditor()
        })
    }
}

/**
 * Mostrar overlay para instancias con upgrade fallido (recovery)
 * @param {string} instanceId - ID de la instancia
 * @param {Object} failedUpgrade - Info del upgrade fallido
 */
function showFailedUpgradeRecovery(instanceId, failedUpgrade) {
    let recoveryHtml = '<div style="text-align: left;">'
    recoveryHtml += '<div style="color: #ef5350; margin-bottom: 15px;">Esta instancia tiene un upgrade pendiente que falló.</div>'
    
    recoveryHtml += '<div style="padding: 10px; background: rgba(0,0,0,0.3); border-radius: 6px; margin-bottom: 15px;">'
    recoveryHtml += `<strong>Error:</strong> ${failedUpgrade.error || 'Desconocido'}<br>`
    recoveryHtml += `<strong>Fecha:</strong> ${new Date(failedUpgrade.timestamp).toLocaleString()}`
    recoveryHtml += '</div>'
    
    if (failedUpgrade.backupPath) {
        recoveryHtml += '<div style="padding: 10px; background: rgba(33, 150, 243, 0.2); border-radius: 6px;">'
        recoveryHtml += '<strong>💾 Backup disponible:</strong><br>'
        recoveryHtml += `<code style="font-size: 11px;">${failedUpgrade.backupPath}</code>`
        recoveryHtml += '</div>'
    }
    
    recoveryHtml += '</div>'
    
    setOverlayContent(
        '⚠️ Upgrade fallido detectado',
        recoveryHtml,
        '🔄 Restaurar desde backup',
        '❌ Ignorar y continuar'
    )
    
    setOverlayHandler(async () => {
        if (failedUpgrade.backupPath) {
            toggleOverlay(false)
            await restoreInstanceFromBackup(instanceId, failedUpgrade.backupPath)
        } else {
            setOverlayContent('❌ Sin backup', 'No hay backup disponible para restaurar.', 'OK')
            setOverlayHandler(() => toggleOverlay(false))
        }
    })
    
    setDismissHandler(() => {
        // Limpiar estado de error
        InstallationManager.clearFailedUpgrade(instanceId)
        toggleOverlay(false)
    })
    
    toggleOverlay(true, true)
}

/**
 * Restaurar instancia desde backup
 */
async function restoreInstanceFromBackup(instanceId, backupPath) {
    setOverlayContent(
        '⏳ Restaurando...',
        '<div style="text-align: center;"><div style="font-size: 48px;">🔄</div><div>Restaurando desde backup...</div></div>',
        'Espera...'
    )
    document.getElementById('overlayAcknowledge').disabled = true
    toggleOverlay(true, false)
    
    const result = await InstallationManager.restoreFromBackup(backupPath, instanceId)
    
    if (result.success) {
        // Limpiar estado de error
        InstallationManager.clearFailedUpgrade(instanceId)
        
        setOverlayContent(
            '✅ Restauración completada',
            '<div style="text-align: center;"><div style="font-size: 48px;">✅</div><div>La instancia ha sido restaurada correctamente.</div></div>',
            'OK'
        )
        document.getElementById('overlayAcknowledge').disabled = false
        setOverlayHandler(async () => {
            toggleOverlay(false)
            await prepareServerSelectionList()
        })
    } else {
        setOverlayContent(
            '❌ Error en restauración',
            `<div style="text-align: center;"><div style="font-size: 48px;">❌</div><div style="color: #ef5350;">${result.error}</div></div>`,
            'Cerrar'
        )
        document.getElementById('overlayAcknowledge').disabled = false
        setOverlayHandler(() => toggleOverlay(false))
    }
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
    // ============================================================
    // PRIORIDAD 1: Verificar si hay un auto-profile seleccionado
    // ============================================================
    const autoProfileListings = document.getElementsByClassName('autoProfileListing')
    for(let i=0; i<autoProfileListings.length; i++){
        if(autoProfileListings[i].hasAttribute('selected')){
            const profileId = autoProfileListings[i].getAttribute('installid')
            const versionId = autoProfileListings[i].getAttribute('versionid')
            const profileType = autoProfileListings[i].getAttribute('profiletype')
            
            // Guardar auto-profile seleccionado
            ConfigManager.setSelectedInstallation(profileId)
            ConfigManager.setSelectedServer(null)
            ConfigManager.save()
            
            // Crear servidor virtual desde auto-profile
            const OptiFineVersions = require('./assets/js/optifineversions')
            const profile = await OptiFineVersions.getAutoProfileById(profileId)
            
            if(profile){
                const virtualServer = InstallationManager.autoProfileToServer(profile)
                updateSelectedServer({ rawServer: virtualServer })
                refreshServerStatus(true)
            }
            
            toggleOverlay(false)
            return
        }
    }
    
    // ============================================================
    // PRIORIDAD 2: Verificar instalación personalizada seleccionada
    // ============================================================
    const installationListings = document.getElementsByClassName('installationListing')
    for(let i=0; i<installationListings.length; i++){
        if(installationListings[i].hasAttribute('selected') && !installationListings[i].classList.contains('autoProfileListing')){
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

    // ============================================================
    // PRIORIDAD 3: Verificar servidores TECNILAND
    // ============================================================
    const serverListings = document.getElementsByClassName('serverListing')
    for(let i=0; i<serverListings.length; i++){
        if(serverListings[i].hasAttribute('selected') && !serverListings[i].classList.contains('installationListing')){
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

/**
 * Cargar la sección de auto-profiles (OptiFine detectados en versions/)
 * Esta función es asíncrona y actualiza el DOM cuando termina
 * 
 * @param {string|null} selectedInstallId - ID de instalación actualmente seleccionada
 */
async function loadAutoProfilesSection(selectedInstallId) {
    const OptiFineVersions = require('./assets/js/optifineversions')
    const autoProfilesSection = document.getElementById('autoProfilesSection')
    
    if (!autoProfilesSection) return
    
    try {
        // Obtener auto-profiles detectados
        const autoProfiles = await OptiFineVersions.getAllInstalledProfiles(true) // Forzar re-escaneo
        
        if (autoProfiles.length === 0) {
            // No hay auto-profiles, ocultar la sección
            autoProfilesSection.style.display = 'none'
            return
        }
        
        // Construir HTML para auto-profiles
        let htmlString = ''
        
        for (const profile of autoProfiles) {
            const isSelected = selectedInstallId === profile.id
            
            htmlString += `<button class="installationListing autoProfileListing serverListing instance-card instance-card--optifine" installid="${profile.id}" autoprofile="true" profiletype="${profile.type}" versionid="${profile.versionId}" ${isSelected ? 'selected' : ''}>
                <div class="instance-card__icon"><img src="assets/images/icons/loaders/optifine.svg" alt="OptiFine" class="instance-card__icon-img"></div>
                <div class="serverListingDetails">
                    <span class="serverListingName">${profile.name}</span>
                    <span class="serverListingDescription">Minecraft ${profile.minecraftVersion} con OptiFine</span>
                    <div class="serverListingInfo">
                        <div class="serverListingVersion">MC ${profile.minecraftVersion}</div>
                        <div class="serverListingRevision" style="background: linear-gradient(90deg, #ffa500, #ff8c00); color: white;">OptiFine</div>
                    </div>
                </div>
            </button>`
        }
        
        autoProfilesSection.innerHTML = htmlString
        autoProfilesSection.style.display = 'block'
        
        // Configurar handlers para auto-profiles
        setAutoProfileListingHandlers()
        
    } catch (error) {
        console.error('Error cargando auto-profiles:', error)
        autoProfilesSection.style.display = 'none'
    }
}

/**
 * Configurar handlers de click para auto-profiles
 * Similar a setInstallationListingHandlers pero para auto-profiles
 */
function setAutoProfileListingHandlers() {
    const OptiFineVersions = require('./assets/js/optifineversions')
    const listings = Array.from(document.getElementsByClassName('autoProfileListing'))
    listings.map((val) => {
        val.onclick = e => {
            if (val.hasAttribute('selected')) {
                return
            }
            
            // Limpiar todas las selecciones (servidores, instalaciones, auto-profiles)
            const allListings = document.querySelectorAll('.serverListing, .installationListing, .autoProfileListing')
            allListings.forEach(listing => listing.removeAttribute('selected'))
            
            val.setAttribute('selected', '')
            document.activeElement.blur()
        }
        
        // Auto-profiles tienen menú contextual (solo Eliminar, no Editar)
        val.oncontextmenu = async (e) => {
            e.preventDefault()
            
            const installId = val.getAttribute('installid')
            const versionId = val.getAttribute('versionid')
            
            // Obtener auto-profile
            const autoProfile = await OptiFineVersions.getAutoProfileById(installId)
            if (!autoProfile) {
                console.error(`Auto-profile no encontrado: ${installId}`)
                return
            }
            
            // Crear objeto installation virtual para el modal
            const virtualInstallation = {
                id: installId,
                name: autoProfile.name,
                loader: {
                    type: 'optifine',
                    minecraftVersion: autoProfile.minecraftVersion
                }
            }
            
            showInstallationContextMenu(e, installId, virtualInstallation)
        }
    })
}

/**
 * Mostrar información sobre un auto-profile (tooltip simple)
 * @param {MouseEvent} e - Evento del mouse
 * @param {string} versionId - ID de la versión de OptiFine
 */
function showAutoProfileInfo(e, versionId) {
    // Crear un tooltip temporal
    const tooltip = document.createElement('div')
    tooltip.id = 'autoProfileTooltip'
    tooltip.style.cssText = `
        position: fixed;
        left: ${e.clientX}px;
        top: ${e.clientY}px;
        background: rgba(0,0,0,0.9);
        border: 1px solid #ffa500;
        border-radius: 8px;
        padding: 12px 16px;
        color: white;
        font-size: 12px;
        z-index: 10000;
        max-width: 300px;
    `
    tooltip.innerHTML = `
        <div style="color: #ffa500; font-weight: bold; margin-bottom: 8px;">⚡ Auto-Profile OptiFine</div>
        <div style="color: rgba(255,255,255,0.8);">
            <strong>Versión:</strong> ${versionId}<br>
            <small style="color: rgba(255,255,255,0.5);">Este perfil fue detectado automáticamente.<br>Para eliminarlo, borra la carpeta en versions/</small>
        </div>
    `
    
    document.body.appendChild(tooltip)
    
    // Remover después de 3 segundos o al hacer click
    const removeTooltip = () => {
        if (document.getElementById('autoProfileTooltip')) {
            document.body.removeChild(tooltip)
        }
    }
    setTimeout(removeTooltip, 3000)
    document.addEventListener('click', removeTooltip, { once: true })
}

function setServerListingHandlers(){
    const listings = Array.from(document.getElementsByClassName('serverListing'))
    
    // Import ModpackManager
    let ModpackManager = null
    try {
        ModpackManager = require('./assets/js/modpackmanager')
    } catch (err) {
        console.error('[ServerHandlers] ModpackManager not available:', err)
    }
    
    listings.map((val) => {
        // Ignorar auto-profiles (tienen su propio handler)
        if (val.classList.contains('autoProfileListing')) return
        
        // Ignorar instalaciones personalizadas (tienen su propio menú contextual)
        if (val.classList.contains('installationListing')) return
        
        const serverId = val.getAttribute('servid')
        
        // Left click: Select server (original behavior)
        val.onclick = e => {
            if(val.hasAttribute('selected')){
                return
            }
            
            // Limpiar TODAS las selecciones (servidores, instalaciones, auto-profiles)
            const allListings = document.querySelectorAll('.serverListing, .installationListing, .autoProfileListing')
            allListings.forEach(listing => listing.removeAttribute('selected'))
            
            val.setAttribute('selected', '')
            ConfigManager.setSelectedServer(serverId)
            document.activeElement.blur()
        }
        
        // Right click: Show modpack options menu (TECNILAND feature)
        // SOLO para servidores de TECNILAND, NO para instalaciones personalizadas
        if (ModpackManager) {
            val.oncontextmenu = async (e) => {
                e.preventDefault()
                await showModpackContextMenu(serverId, e.clientX, e.clientY, ModpackManager)
            }
        }
    })
}

// ============================================================================
// MODPACKS TECNILAND - Context Menu & Operations
// ============================================================================

/**
 * Show context menu for modpack operations
 * @param {string} serverId - Server/Modpack ID
 * @param {number} x - Mouse X position
 * @param {number} y - Mouse Y position
 * @param {Object} ModpackManager - ModpackManager instance
 */
async function showModpackContextMenu(serverId, x, y, ModpackManager) {
    // Get modpack state
    const state = await ModpackManager.getModpackState(serverId)
    
    // ONLY show menu if modpack is installed
    if (!state.isInstalled) {
        console.log('[Modpack Menu] Not installed, no menu shown')
        return
    }
    
    // Remove existing menu
    const existingMenu = document.getElementById('tecnilandModpackMenu')
    if (existingMenu) existingMenu.remove()
    
    // Create menu
    const menu = document.createElement('div')
    menu.id = 'tecnilandModpackMenu'
    menu.className = 'tecniland-context-menu'
    
    // Build menu items (only for INSTALLED modpacks)
    // Nota: Actualización/Reparación se maneja automáticamente por Helios al presionar "Jugar"
    const menuItems = `
        <div class="tecniland-menu-header">
            <span>🎮 Opciones de Modpack</span>
        </div>
        <div class="tecniland-menu-item" data-action="folder" data-server="${serverId}">
            <span class="tecniland-menu-icon">📂</span>
            <span class="tecniland-menu-label">Abrir carpeta</span>
        </div>
        <div class="tecniland-menu-divider"></div>
        <div class="tecniland-menu-item danger" data-action="uninstall" data-server="${serverId}">
            <span class="tecniland-menu-icon">🗑️</span>
            <span class="tecniland-menu-label">Desinstalar para liberar espacio</span>
            <span class="tecniland-menu-hint">${state.sizeOnDiskFormatted || 'Liberar espacio'}</span>
        </div>
    `
    
    menu.innerHTML = menuItems
    menu.style.left = `${x}px`
    menu.style.top = `${y}px`
    
    document.body.appendChild(menu)
    
    // Attach handlers
    menu.querySelectorAll('.tecniland-menu-item').forEach(item => {
        item.onclick = async () => {
            const action = item.dataset.action
            const server = item.dataset.server
            menu.remove()
            
            await handleModpackAction(action, server, ModpackManager)
        }
    })
    
    // Close menu on click outside
    setTimeout(() => {
        const closeHandler = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove()
                document.removeEventListener('click', closeHandler)
            }
        }
        document.addEventListener('click', closeHandler)
    }, 100)
}

/**
 * Handle modpack actions
 * @param {string} action - Action to perform
 * @param {string} serverId - Server ID
 * @param {Object} ModpackManager - ModpackManager instance
 */
async function handleModpackAction(action, serverId, ModpackManager) {
    console.log('[Modpack Action]', action, 'on', serverId)
    
    switch (action) {
        case 'uninstall':
            confirmUninstallModpack(serverId, ModpackManager)
            break
        case 'folder':
            openModpackFolder(serverId)
            break
    }
}

// Nota: Las funciones de actualizar/reparar fueron eliminadas.
// Helios ya maneja esto automáticamente con FullRepair cuando se presiona "Jugar".

/**
 * Confirm and uninstall modpack
 */
function confirmUninstallModpack(serverId, ModpackManager) {
    // Get current state to show size
    ModpackManager.getModpackState(serverId).then(state => {
        const sizeText = state.sizeOnDiskFormatted || 'espacio desconocido'
        
        setOverlayContent(
            '🗑️ Desinstalar Modpack',
            `¿Deseas desinstalar este modpack para liberar espacio?\n\nSe liberarán aproximadamente: ${sizeText}\n\nTus partidas guardadas se conservarán en una carpeta de respaldo.`,
            'Cancelar',
            'Desinstalar'
        )
        
        // Botón "Cancelar" (primario, izquierda)
        setOverlayHandler(() => {
            toggleOverlay(false)
        })
        
        // Botón "Desinstalar" (secundario, derecha)
        setDismissHandler(() => {
            toggleOverlay(false)
            // Pequeño delay para que se vea el cierre del overlay
            setTimeout(() => {
                uninstallModpack(serverId, ModpackManager)
            }, 100)
        })
        
        toggleOverlay(true, true)
    })
}

/**
 * Uninstall modpack
 */
async function uninstallModpack(serverId, ModpackManager) {
    try {
        // Notificación simple
        showTecnilandNotification('🗑️ Desinstalando modpack...', 'info')
        
        // Ejecutar desinstalación
        const result = await ModpackManager.uninstallModpack(serverId, true)
        
        // Mostrar notificación de éxito
        showTecnilandNotification(`✅ Desinstalado correctamente. ${ModpackManager.formatBytes(result.freedSpace)} liberados`, 'success')
        
        // Refrescar lista de servidores
        await populateServerListings()
        setServerListingHandlers()
        
    } catch (err) {
        console.error('[Modpack Uninstall Error]', err)
        showTecnilandNotification(`❌ Error al desinstalar: ${err.message}`, 'error')
    }
}

/**
 * Open modpack folder
 */
async function openModpackFolder(serverId) {
    try {
        // Construir ruta directamente: .tecnilandnexus/instances/{serverId}
        const path = require('path')
        const fs = require('fs-extra')
        const dataDir = ConfigManager.getDataDirectory()
        const instancePath = path.join(dataDir, 'instances', serverId)
        
        // Verificar que existe
        const exists = await fs.pathExists(instancePath)
        if (!exists) {
            showTecnilandNotification('❌ No se encontró la carpeta de instalación', 'error')
            console.log('[Modpack Folder] Path not found:', instancePath)
            return
        }
        
        // Abrir carpeta
        const { shell } = require('electron')
        await shell.openPath(instancePath)
        console.log('[Modpack Folder] Opened:', instancePath)
        
    } catch (err) {
        console.error('[Modpack Folder Error]', err)
        showTecnilandNotification('❌ Error al abrir carpeta', 'error')
    }
}

// Funciones de overlay de progreso eliminadas - no necesarias para abrir carpeta/desinstalar

/**
 * Show TECNILAND notification
 */
function showTecnilandNotification(message, type = 'info') {
    const colors = {
        success: '#39FF14',
        error: '#ff6b6b',
        info: '#FFD700'
    }
    
    const notif = document.createElement('div')
    notif.className = 'tecniland-notification'
    notif.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 15px 25px;
        background: rgba(10, 14, 39, 0.95);
        border: 2px solid ${colors[type]};
        border-radius: 8px;
        color: white;
        font-size: 14px;
        z-index: 99999;
        box-shadow: 0 0 20px ${colors[type]}40;
        animation: slideInRight 0.3s ease;
    `
    notif.textContent = message
    
    document.body.appendChild(notif)
    
    setTimeout(() => {
        notif.style.animation = 'slideOutRight 0.3s ease'
        setTimeout(() => notif.remove(), 300)
    }, 4000)
}


function setInstallationListingHandlers(){
    const listings = Array.from(document.getElementsByClassName('installationListing'))
    listings.map((val) => {
        // Ignorar auto-profiles (tienen su propio handler)
        if (val.classList.contains('autoProfileListing')) return
        
        val.onclick = e => {
            if(val.hasAttribute('selected')){
                return
            }
            
            // Limpiar TODAS las selecciones (servidores, instalaciones, auto-profiles)
            const allListings = document.querySelectorAll('.serverListing, .installationListing, .autoProfileListing')
            allListings.forEach(listing => listing.removeAttribute('selected'))
            
            val.setAttribute('selected', '')
            document.activeElement.blur()
        }
        
        // Agregar menú contextual (click derecho) - solo para instalaciones personalizadas, no auto-profiles
        val.oncontextmenu = e => {
            e.preventDefault()
            const installId = val.getAttribute('installid')
            const installation = ConfigManager.getInstallation(installId)
            
            if(installation){
                showInstallationContextMenu(e, installId, installation)
            }
        }
    })
}

/**
 * Mostrar menú contextual personalizado para una instalación
 * @param {MouseEvent} e - Evento del mouse
 * @param {string} installId - ID de la instalación
 * @param {Object} installation - Objeto de instalación
 */
function showInstallationContextMenu(e, installId, installation) {
    const menu = document.getElementById('installationContextMenu')
    const OptiFineVersions = require('./assets/js/optifineversions')
    const isAutoProfile = OptiFineVersions.isAutoProfileId(installId)
    
    // Posicionar el menú
    menu.style.left = `${e.clientX}px`
    menu.style.top = `${e.clientY}px`
    menu.style.display = 'block'
    
    // Ajustar si el menú se sale de la pantalla
    const menuRect = menu.getBoundingClientRect()
    if (menuRect.right > window.innerWidth) {
        menu.style.left = `${e.clientX - menuRect.width}px`
    }
    if (menuRect.bottom > window.innerHeight) {
        menu.style.top = `${e.clientY - menuRect.height}px`
    }
    
    // Configurar handlers
    const editBtn = document.getElementById('contextMenuEdit')
    const deleteBtn = document.getElementById('contextMenuDelete')
    
    // Ocultar "Editar" para auto-profiles (no se pueden editar)
    if (isAutoProfile) {
        editBtn.style.display = 'none'
        // También ocultar el divider si existe
        const divider = menu.querySelector('.contextMenuDivider')
        if (divider) divider.style.display = 'none'
    } else {
        editBtn.style.display = 'flex'
        const divider = menu.querySelector('.contextMenuDivider')
        if (divider) divider.style.display = 'block'
    }
    
    // Remover handlers anteriores clonando el elemento
    const newEditBtn = editBtn.cloneNode(true)
    const newDeleteBtn = deleteBtn.cloneNode(true)
    editBtn.parentNode.replaceChild(newEditBtn, editBtn)
    deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn)
    
    // Editar instalación
    newEditBtn.onclick = () => {
        hideInstallationContextMenu()
        openInstallationEditor(installId)
    }
    
    // Eliminar instalación
    newDeleteBtn.onclick = () => {
        hideInstallationContextMenu()
        showDeleteInstallationModal(installId, installation, isAutoProfile)
    }
    
    // Cerrar menú al hacer click fuera
    setTimeout(() => {
        document.addEventListener('click', hideInstallationContextMenu, { once: true })
    }, 10)
}

/**
 * Ocultar el menú contextual
 */
function hideInstallationContextMenu() {
    const menu = document.getElementById('installationContextMenu')
    if (menu) {
        menu.style.display = 'none'
    }
}

/**
 * Modal de eliminación con 3 opciones usando overlay nativo de Electron
 */
function showDeleteInstallationModal(installId, installation, isAutoProfile = false) {
    const InstallationManager = require('./assets/js/installationmanager')
    const info = InstallationManager.getInstallationInfo(installation)
    
    const installName = installation.name || installId
    const mcVersion = info.minecraftVersion
    
    let message = `¿Qué deseas eliminar de <strong>${installName}</strong> (MC ${mcVersion})?<br><br>`
    
    if (isAutoProfile) {
        message += '<span style="color: #ffa500;">⚡ Este es un auto-profile. Al eliminarlo se borrará la versión de OptiFine.</span><br><br>'
    }
    
    message += '<strong>Opciones:</strong><br>'
    message += '• <strong>Instancia + Versión:</strong> Borra todo (peligroso)<br>'
    message += '• <strong>Solo Instancia:</strong> Mantiene la versión en disco (seguro)'
    
    // Mostrar diálogo con opción 1 como botón principal
    setOverlayContent(
        '¿Eliminar instancia?',
        message,
        '🗑️ Eliminar Instancia + Versión',
        '📁 Solo Instancia'
    )
    
    // Botón principal: Eliminar instancia + versión
    setOverlayHandler(async () => {
        toggleOverlay(false)
        await handleDeleteInstallation(installId, installation, isAutoProfile, true)
    })
    
    // Botón secundario: Solo instancia
    setDismissHandler(async () => {
        toggleOverlay(false)
        await handleDeleteInstallation(installId, installation, isAutoProfile, false)
    })
    
    toggleOverlay(true, true)
}

/**
 * Manejar eliminación de instalación (con o sin versión)
 */
async function handleDeleteInstallation(installId, installation, isAutoProfile, deleteVersion) {
    const path = require('path')
    const fs = require('fs-extra')
    const ConfigManager = require('./assets/js/configmanager')
    const InstallationManager = require('./assets/js/installationmanager')
    const OptiFineVersions = require('./assets/js/optifineversions')
    
    try {
        // Cerrar modal
        const modal = document.getElementById('deleteInstallationModal')
        if (modal) modal.remove()
        
        // Obtener versionId efectivo
        let versionId = null
        let instancePath = null
        
        if (isAutoProfile) {
            // Auto-profile: versionId es el ID detectado (ej: 1.20.1-OptiFine_HD_U_I7)
            const autoProfile = await OptiFineVersions.getAutoProfileById(installId)
            if (autoProfile) {
                versionId = autoProfile.versionId
                // Instancia en instances/auto/<versionId> (si existe)
                instancePath = path.join(ConfigManager.getInstanceDirectory(), 'auto', versionId)
            }
        } else {
            // Instalación personalizada
            const info = InstallationManager.getInstallationInfo(installation)
            versionId = InstallationManager.getEffectiveVersionId(installation)
            instancePath = path.join(ConfigManager.getInstanceDirectory(), installId)
        }
        
        // 1. Borrar instancia (carpeta instances/...)
        if (instancePath && fs.existsSync(instancePath)) {
            fs.removeSync(instancePath)
            console.log(`[Delete] Instancia eliminada: ${instancePath}`)
        }
        
        // 2. Borrar del config (solo para instalaciones personalizadas)
        if (!isAutoProfile) {
            ConfigManager.deleteInstallation(installId, false) // false porque ya borramos la carpeta
            ConfigManager.save()
        }
        
        // 3. Borrar versión si se solicitó
        if (deleteVersion && versionId) {
            const versionPath = path.join(ConfigManager.getCommonDirectory(), 'versions', versionId)
            
            // Verificar si otras instalaciones usan esta versión
            const otherInstallationsUsingVersion = getInstallationsUsingVersion(versionId, installId)
            
            if (otherInstallationsUsingVersion.length > 0) {
                // Versión en uso por otros
                setOverlayContent(
                    'Versión en uso',
                    `No se eliminó la versión <strong>${versionId}</strong> porque aún la usan ${otherInstallationsUsingVersion.length} instalación(es):<br><br>${otherInstallationsUsingVersion.map(i => `• ${i.name}`).join('<br>')}`,
                    'OK'
                )
                setOverlayHandler(() => {
                    toggleOverlay(false)
                    refreshInstallationsList()
                })
                toggleOverlay(true)
            } else {
                // Versión no usada, borrar
                if (fs.existsSync(versionPath)) {
                    fs.removeSync(versionPath)
                    console.log(`[Delete] Versión eliminada: ${versionPath}`)
                    
                    // Invalidar cache de OptiFine si es auto-profile
                    if (isAutoProfile) {
                        OptiFineVersions.invalidateCache()
                    }
                    
                    setOverlayContent(
                        'Eliminación completa',
                        `Instancia y versión <strong>${versionId}</strong> eliminadas correctamente.`,
                        'OK'
                    )
                } else {
                    setOverlayContent(
                        'Versión no encontrada',
                        `La instancia fue eliminada, pero no se encontró la versión <strong>${versionId}</strong> en disco.`,
                        'OK'
                    )
                }
                
                setOverlayHandler(() => {
                    toggleOverlay(false)
                    refreshInstallationsList()
                })
                toggleOverlay(true)
            }
        } else {
            // Solo se eliminó la instancia
            refreshInstallationsList()
        }
        
        // Si la instalación eliminada estaba seleccionada, limpiar selección
        const selectedInstall = ConfigManager.getSelectedInstallation()
        if (selectedInstall === installId) {
            ConfigManager.setSelectedServer('tecniland-wZJmEG')
            ConfigManager.save()
        }
        
    } catch (error) {
        console.error('[Delete] Error eliminando instalación:', error)
        setOverlayContent(
            'Error',
            `No se pudo eliminar la instalación:<br><br>${error.message}`,
            'OK'
        )
        setOverlayHandler(() => toggleOverlay(false))
        toggleOverlay(true)
    }
}

/**
 * Obtener instalaciones que usan una versión específica
 */
function getInstallationsUsingVersion(versionId, excludeInstallId = null) {
    const ConfigManager = require('./assets/js/configmanager')
    const InstallationManager = require('./assets/js/installationmanager')
    const installations = ConfigManager.getInstallations()
    
    const using = []
    
    for (const install of installations) {
        if (excludeInstallId && install.id === excludeInstallId) continue
        
        const effectiveVersion = InstallationManager.getEffectiveVersionId(install)
        if (effectiveVersion === versionId) {
            using.push(install)
        }
    }
    
    return using
}

/**
 * Refrescar lista de instalaciones después de eliminar
 */
function refreshInstallationsList() {
    populateInstallationListings()
    setInstallationListingHandlers()
    setAutoProfileListingHandlers()
    
    // Recargar auto-profiles
    const selectedInstallId = ConfigManager.getSelectedInstallation()
    loadAutoProfilesSection(selectedInstallId)
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
    
    // Import ModpackManager for checking installation states
    let ModpackManager = null
    try {
        ModpackManager = require('./assets/js/modpackmanager')
    } catch (err) {
        console.error('[ServerListings] ModpackManager not available:', err)
    }
    
    let htmlString = ''
    for(const serv of servers){
        const serverId = serv.rawServer.id
        const isSelected = serverId === giaSel
        
        // Check modpack installation state
        let installState = 'not-installed'
        let installBadge = ''
        
        if (ModpackManager) {
            try {
                const state = await ModpackManager.getModpackState(serverId)
                if (state.isInstalled) {
                    installState = 'installed'
                    installBadge = '<span class="server-badge-installed">✓ Instalado</span>'
                    if (state.updateAvailable) {
                        installState = 'update-available'
                        installBadge = '<span class="server-badge-update">⬆ Actualización disponible</span>'
                    }
                }
            } catch (err) {
                // If state check fails, treat as not installed
                console.log('[ServerListings] Cannot get state for', serverId)
            }
        }
        
        htmlString += `<button class="serverListing tecniland-server-card ${installState}" servid="${serverId}" ${isSelected ? 'selected' : ''}>
            <img class="serverListingImg" src="${serv.rawServer.icon}"/>
            <div class="serverListingDetails">
                <span class="serverListingName">${serv.rawServer.name}</span>
                <span class="serverListingDescription">${serv.rawServer.description}</span>
                <div class="serverListingInfo">
                    <div class="serverListingVersion">${serv.rawServer.minecraftVersion}</div>
                    <div class="serverListingRevision">${serv.rawServer.version}</div>
                    ${installBadge}
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
    const path = require('path')
    const fs = require('fs-extra')
    let installations = ConfigManager.getInstallations()
    const selectedInstallId = ConfigManager.getSelectedInstallation()
    
    // Filtrar instalaciones cuya carpeta no existe (borradas manualmente)
    const invalidInstallations = []
    
    for (const install of installations) {
        const instancePath = path.join(ConfigManager.getInstanceDirectory(), install.id)
        if (!fs.existsSync(instancePath)) {
            invalidInstallations.push(install)
            console.warn(`[Cleanup] Instalación fantasma detectada (carpeta no existe): ${install.name} (${install.id})`)
        }
    }
    
    // Si hay instalaciones inválidas, eliminarlas del config
    if (invalidInstallations.length > 0) {
        invalidInstallations.forEach(install => {
            ConfigManager.deleteInstallation(install.id, false) // false porque la carpeta ya no existe
        })
        ConfigManager.save()
        // Recargar instalaciones después de limpiar
        installations = ConfigManager.getInstallations()
    }
    
    let htmlString = ''
    
    // ========================================================
    // SECCIÓN: AUTO-PROFILES (OptiFine detectados en versions/)
    // ========================================================
    // Esta sección se puebla de forma asíncrona después
    htmlString += '<div id="autoProfilesSection" style="display: none;"></div>'
    
    // ========================================================
    // SECCIÓN: INSTALACIONES PERSONALIZADAS
    // ========================================================
    if(installations.length === 0){
        htmlString += '<div id="customInstallationsSection"><div style="text-align: center; padding: 40px 20px; color: rgba(255,255,255,0.6); font-style: italic;">No hay instalaciones personalizadas.<br>Crea una nueva para comenzar.</div></div>'
    } else {
        htmlString += '<div id="customInstallationsSection">'
        for(const install of installations){
            const info = InstallationManager.getInstallationInfo(install)
            // SVG icon paths for loaders (replacing emojis)
            const loaderIconPath = {
                'vanilla': 'assets/images/icons/loaders/vanilla.svg',
                'forge': 'assets/images/icons/loaders/forge.svg',
                'fabric': 'assets/images/icons/loaders/fabric.svg',
                'quilt': 'assets/images/icons/loaders/quilt.svg',
                'neoforge': 'assets/images/icons/loaders/neoforge.svg'
            }[install.loader.type] || 'assets/images/icons/loaders/unknown.svg'
            
            // Descripción
            let description = `${info.loader.toUpperCase()} ${info.loaderVersion || ''} (MC ${info.minecraftVersion})`
            
            htmlString += `<button class="installationListing serverListing instance-card instance-card--custom" installid="${install.id}" ${install.id === selectedInstallId ? 'selected' : ''}>
                <div class="instance-card__icon"><img src="${loaderIconPath}" alt="${install.loader.type}" class="instance-card__icon-img"></div>
                <div class="serverListingDetails">
                    <span class="serverListingName">${install.name}</span>
                    <span class="serverListingDescription">${description}</span>
                    <div class="serverListingInfo">
                        <div class="serverListingVersion">MC ${info.minecraftVersion}</div>
                        <div class="serverListingRevision">${info.loader}</div>
                    </div>
                </div>
            </button>`
        }
        htmlString += '</div>'
    }
    
    document.getElementById('installationSelectListScrollable').innerHTML = htmlString
    
    // Cargar auto-profiles de forma asíncrona
    loadAutoProfilesSection(selectedInstallId)
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
    const heroHeader = document.getElementById('tecnilandHeroHeader')
    const mainHeader = document.getElementById('serverSelectHeader')
    
    tabInstallations.onclick = () => {
        // Activar tab instalaciones usando clases BEM
        tabInstallations.classList.add('active')
        tabServers.classList.remove('active')
        
        // Mostrar lista de instalaciones
        installationList.style.display = 'block'
        serverList.style.display = 'none'
        createButton.style.display = 'block'
        
        // Ocultar hero TECNILAND, mostrar header normal
        heroHeader.style.display = 'none'
        mainHeader.style.display = 'block'
        mainHeader.innerHTML = '<img src="assets/images/icons/loaders/gamepad.svg" class="instance-selector__header-icon"> Selecciona una Instalación'
    }
    
    tabServers.onclick = async () => {
        // Activar tab servidores usando clases BEM
        tabServers.classList.add('active')
        tabInstallations.classList.remove('active')
        
        // Mostrar lista de servidores TECNILAND
        installationList.style.display = 'none'
        serverList.style.display = 'block'
        createButton.style.display = 'none'
        
        // Mostrar hero TECNILAND, ocultar header normal
        heroHeader.style.display = 'flex'
        mainHeader.style.display = 'none'
        
        // Actualizar stats del hero
        await updateTecnilandHeroStats()
    }
}

/**
 * Actualizar estadísticas del Hero Header TECNILAND
 */
async function updateTecnilandHeroStats() {
    try {
        const distro = await DistroAPI.getDistribution()
        const servers = distro.servers
        const totalModpacks = servers.length
        
        // Contar instalados
        let installedCount = 0
        let ModpackManager = null
        try {
            ModpackManager = require('./assets/js/modpackmanager')
        } catch (e) {
            // ModpackManager no disponible, stats mostrarán 0 instalados
        }
        
        if (ModpackManager) {
            for (const serv of servers) {
                const state = await ModpackManager.getModpackState(serv.rawServer.id)
                if (state.isInstalled) installedCount++
            }
        }
        
        // Actualizar DOM con animación
        const modpackCountEl = document.getElementById('heroModpackCount')
        const installedCountEl = document.getElementById('heroInstalledCount')
        
        if (modpackCountEl) {
            animateNumber(modpackCountEl, totalModpacks)
        }
        if (installedCountEl) {
            animateNumber(installedCountEl, installedCount)
        }
    } catch (err) {
        console.error('[Hero Stats] Error:', err)
    }
}

/**
 * Animar número de 0 al valor final
 */
function animateNumber(element, target) {
    const duration = 600
    const start = parseInt(element.textContent) || 0
    const startTime = performance.now()
    
    function update(currentTime) {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1)
        
        // Easing: ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3)
        const current = Math.floor(start + (target - start) * eased)
        
        element.textContent = current
        
        if (progress < 1) {
            requestAnimationFrame(update)
        }
    }
    
    requestAnimationFrame(update)
}

// ============================================================================
// Installation Editor (Inline)
// ============================================================================

let currentEditorLoader = 'vanilla'
let minecraftVersions = []
let loaderVersions = []
let editingInstallationId = null  // null = crear nueva, string = editando existente

/**
 * Abrir el editor de instalaciones
 * @param {string|null} installationId - ID de instalación para editar, o null para crear nueva
 */
function openInstallationEditor(installationId = null){
    const mode = installationId ? 'edit' : 'create'
    console.log('[InstallEditor] Opening editor: mode=' + mode + ' id=' + (installationId || 'none'))
    
    // IMPORTANTE: Establecer editingInstallationId ANTES de cualquier otra operación
    editingInstallationId = installationId
    
    console.log('[InstallEditor] editingInstallationId set to: ' + (editingInstallationId || 'null'))
    
    // Ocultar selector de servidores
    document.getElementById('serverSelectContent').style.display = 'none'
    // Mostrar editor inline
    document.getElementById('installationEditorContent').style.display = 'block'
    
    // Resetear formulario (NO resetea editingInstallationId)
    resetInstallationEditorForm()
    
    // Aplicar visibilidad de loaders experimentales
    updateExperimentalLoadersVisibility()
    
    // Cargar versiones de Minecraft
    loadMinecraftVersionsInline()
    
    // Setup handlers
    setupInstallationEditorHandlers()
    
    // Si estamos editando, precargar datos
    if (installationId) {
        const installation = ConfigManager.getInstallation(installationId)
        if (installation) {
            loadInstallationIntoEditor(installation)
        }
    }
}

/**
 * Cargar datos de una instalación existente en el editor
 * @param {Object} installation - Instalación a editar
 */
async function loadInstallationIntoEditor(installation) {
    console.log('[InstallEditor] Loading installation for editing: mode=edit id=' + installation.id + ' name="' + installation.name + '"')
    
    // Cambiar header - usar "Aplicar cambios" para reflejar upgrade-in-place
    document.getElementById('installationEditorHeader').textContent = '✏️ Editar Instalación'
    document.getElementById('installationEditorCreate').textContent = '🔄 Aplicar Cambios'
    
    // Verificar si hay upgrade fallido pendiente
    const failedUpgrade = InstallationManager.getFailedUpgrade(installation.id)
    if (failedUpgrade) {
        console.log('[InstallEditor] Found failed upgrade for id=' + installation.id + ', showing recovery dialog')
        showFailedUpgradeRecovery(installation.id, failedUpgrade)
        return
    }
    
    // Cargar nombre
    document.getElementById('installationEditorName').value = installation.name
    
    // Seleccionar loader
    currentEditorLoader = installation.loader.type
    document.querySelectorAll('.installationEditorLoaderBtn').forEach(btn => {
        btn.classList.remove('active')
        if (btn.dataset.loader === currentEditorLoader) {
            btn.classList.add('active')
        }
    })
    
    // Mostrar/ocultar selector de versión de loader
    const loaderVersionGroup = document.getElementById('installationEditorLoaderVersionGroup')
    loaderVersionGroup.style.display = currentEditorLoader === 'vanilla' ? 'none' : 'block'
    
    // Esperar a que se carguen las versiones de MC
    await new Promise(resolve => {
        const checkInterval = setInterval(() => {
            const mcSelect = document.getElementById('installationEditorMcVersion')
            if (mcSelect.options.length > 1 && mcSelect.options[1].value) {
                clearInterval(checkInterval)
                resolve()
            }
        }, 100)
        // Timeout después de 5 segundos
        setTimeout(() => {
            clearInterval(checkInterval)
            resolve()
        }, 5000)
    })
    
    // Seleccionar versión de MC
    document.getElementById('installationEditorMcVersion').value = installation.loader.minecraftVersion
    
    // Si tiene loader (no vanilla), cargar versiones del loader
    if (currentEditorLoader !== 'vanilla' && installation.loader.loaderVersion) {
        await loadLoaderVersionsInline(installation.loader.minecraftVersion)
        document.getElementById('installationEditorLoaderVersion').value = installation.loader.loaderVersion
    }
    
    updateCreateButtonState()
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
    // NO resetear editingInstallationId aquí - se maneja en openInstallationEditor
    
    // Resetear header y botón (se sobrescribirá si es modo edit)
    document.getElementById('installationEditorHeader').textContent = '✨ Nueva Instalación'
    document.getElementById('installationEditorCreate').textContent = '✅ Crear Instalación'
    
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
            const previousLoader = currentEditorLoader
            
            document.querySelectorAll('.installationEditorLoaderBtn').forEach(b => b.classList.remove('active'))
            this.classList.add('active')
            currentEditorLoader = this.dataset.loader
            
            // ✅ INSTRUMENTACIÓN: Log del loader seleccionado
            console.log(`Selected loader raw value: ${currentEditorLoader}`)
            
            const loaderVersionGroup = document.getElementById('installationEditorLoaderVersionGroup')
            
            if(currentEditorLoader === 'vanilla') {
                loaderVersionGroup.style.display = 'none'
            } else {
                loaderVersionGroup.style.display = 'block'
            }
            
            // Si cambió el loader, recargar versiones de MC para aplicar filtros de compatibilidad
            if (previousLoader !== currentEditorLoader) {
                console.log(`Loader cambió de ${previousLoader} a ${currentEditorLoader}, recargando versiones de MC...`)
                await loadMinecraftVersionsInline()
            }
            
            const mcVersion = document.getElementById('installationEditorMcVersion').value
            if(mcVersion && currentEditorLoader !== 'vanilla') {
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
    const mcVersionInfo = document.getElementById('installationEditorMcVersionInfo')
    
    try {
        mcVersionSelect.innerHTML = '<option value="">Cargando versiones...</option>'
        mcVersionSelect.disabled = true
        if (mcVersionInfo) {
            mcVersionInfo.style.display = 'none'
            mcVersionInfo.textContent = ''
        }
        
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

        const totalBeforeLoaderFilter = filteredReleases.length
        
        // Filtrar por compatibilidad de loader
        if (currentEditorLoader === 'fabric') {
            console.log('Filtrando versiones de MC para compatibilidad con Fabric...')
            const fabricGameVersions = await VersionAPI.getFabricGameVersions()
            const compatibleIds = fabricGameVersions.map(v => v.version)
            filteredReleases = filteredReleases.filter(v => compatibleIds.includes(v.id))
            const hiddenCount = totalBeforeLoaderFilter - filteredReleases.length
            console.log(`Fabric filter: ${filteredReleases.length} compatibles, ${hiddenCount} ocultas`)
            
            // Mostrar mensaje en UI
            if (hiddenCount > 0 && mcVersionInfo) {
                mcVersionInfo.textContent = `Mostrando ${filteredReleases.length} versiones compatibles con Fabric (${hiddenCount} ocultas)`
                mcVersionInfo.style.display = 'block'
            }
        } else if (currentEditorLoader === 'quilt') {
            console.log('Filtrando versiones de MC para compatibilidad con Quilt...')
            const quiltGameVersions = await VersionAPI.getQuiltGameVersions()
            
            // ✅ VALIDACIÓN: si API falla (array vacío), mostrar error
            if (!Array.isArray(quiltGameVersions) || quiltGameVersions.length === 0) {
                console.error('Quilt: Meta API no devolvió versiones válidas')
                mcVersionSelect.innerHTML = '<option value="">Error: No se pudieron cargar versiones de Quilt</option>'
                mcVersionSelect.disabled = true
                if (mcVersionInfo) {
                    mcVersionInfo.textContent = 'No se pudieron cargar versiones de Quilt (Meta API no disponible)'
                    mcVersionInfo.style.display = 'block'
                    mcVersionInfo.style.color = '#d32f2f'
                }
                return
            }
            
            const compatibleIds = quiltGameVersions.map(v => v.version)
            filteredReleases = filteredReleases.filter(v => compatibleIds.includes(v.id))
            const hiddenCount = totalBeforeLoaderFilter - filteredReleases.length
            console.log(`Quilt filter: ${filteredReleases.length} compatibles, ${hiddenCount} ocultas`)
            
            // Mostrar mensaje en UI
            if (hiddenCount > 0 && mcVersionInfo) {
                mcVersionInfo.textContent = `Mostrando ${filteredReleases.length} versiones compatibles con Quilt (${hiddenCount} ocultas)`
                mcVersionInfo.style.display = 'block'
                mcVersionInfo.style.color = ''
            }
        } else if (currentEditorLoader === 'neoforge') {
            // TODO: Implementar filtrado de NeoForge cuando esté disponible la API
            console.log('NeoForge: usando todas las versiones (filtrado no implementado)')
        } else {
            // Vanilla y Forge: mostrar todas las versiones (1.13+)
            console.log(`${currentEditorLoader}: mostrando todas las versiones disponibles`)
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
        if (mcVersionInfo) {
            mcVersionInfo.style.display = 'none'
        }
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
    
    const mode = editingInstallationId ? 'edit' : 'create'
    console.log('[InstallEditor] createInstallationFromForm called: mode=' + mode + ' id=' + (editingInstallationId || 'none') + ' name="' + name + '"')
    console.log('[InstallEditor] editingInstallationId value check:', editingInstallationId, typeof editingInstallationId)
    
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
    createBtn.innerHTML = editingInstallationId ? 'Aplicando cambios...' : 'Creando instalación...'
    
    try {
        if (editingInstallationId) {
            // ============================================================
            // MODO EDICIÓN: Usar sistema de upgrade-in-place
            // ============================================================
            console.log('[InstallEditor] EDIT MODE: Processing upgrade for id=' + editingInstallationId)
            
            const existingInstall = ConfigManager.getInstallation(editingInstallationId)
            
            if (!existingInstall) {
                console.error('[InstallEditor] ERROR: Installation not found: id=' + editingInstallationId)
                showInstallationEditorError('No se encontró la instalación a editar')
                createBtn.disabled = false
                createBtn.innerHTML = '🔄 Aplicar Cambios'
                return
            }
            
            // Preparar nuevo perfil
            const newProfile = {
                name: name,
                loaderType: currentEditorLoader,
                minecraftVersion: minecraftVersion,
                loaderVersion: loaderVersion
            }
            
            console.log('[InstallEditor] Analyzing changes:', {
                from: {
                    name: existingInstall.name,
                    loader: existingInstall.loader.type,
                    mcVersion: existingInstall.loader.minecraftVersion,
                    loaderVersion: existingInstall.loader.loaderVersion
                },
                to: newProfile
            })
            
            // Analizar cambios
            const changes = InstallationManager.analyzeUpgradeChanges(existingInstall, newProfile)
            
            if (!changes.hasChanges) {
                console.log('[InstallEditor] No changes detected, closing editor')
                createBtn.disabled = false
                createBtn.innerHTML = '🔄 Aplicar Cambios'
                closeInstallationEditor()
                await prepareServerSelectionList()
                return
            }
            
            console.log('[InstallEditor] Changes detected:', changes.summary)
            
            // Si hay cambios significativos, mostrar diálogo de confirmación
            if (changes.mcVersionChanged || changes.loaderTypeChanged) {
                console.log('[InstallEditor] Significant changes detected, showing confirmation overlay')
                createBtn.disabled = false
                createBtn.innerHTML = '🔄 Aplicar Cambios'
                
                // Mostrar overlay de confirmación
                showUpgradeConfirmationOverlay(editingInstallationId, existingInstall, newProfile, changes)
                return
            }
            
            // Cambios menores (solo nombre o versión de loader): aplicar directamente
            console.log('[InstallEditor] Minor changes, applying upgrade directly without confirmation')
            const result = await InstallationManager.upgradeInstanceInPlace(editingInstallationId, newProfile)
            
            if (!result.success) {
                console.error('[InstallEditor] Upgrade failed:', result.error)
                showInstallationEditorError('Error: ' + result.error)
                createBtn.disabled = false
                createBtn.innerHTML = '🔄 Aplicar Cambios'
                return
            }
            
            console.log('[InstallEditor] ✅ Upgrade successful for id=' + editingInstallationId)
            
        } else {
            // ============================================================
            // MODO CREACIÓN: Crear nueva instalación
            // ============================================================
            console.log('[InstallEditor] CREATE MODE: Creating new installation name="' + name + '"')
            // MODO CREACIÓN: Crear nueva instalación
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
                console.error('[InstallEditor] Failed to add installation: name="' + name + '"')
                showInstallationEditorError('No se pudo agregar la instalación. Ya existe una con el mismo nombre.')
                createBtn.disabled = false
                createBtn.innerHTML = '✅ Crear Instalación'
                return
            }
            
            ConfigManager.save()
            console.log('[InstallEditor] ✅ New installation created: id=' + installation.id + ' name="' + name + '"')
        }
        
        // Cerrar editor y volver al selector
        console.log('[InstallEditor] Closing editor and refreshing installation list')
        closeInstallationEditor()
        
        // Refrescar lista
        await prepareServerSelectionList()
        
    } catch(err) {
        console.error('Error al guardar instalación:', err)
        showInstallationEditorError(`Error: ${err.message}`)
        createBtn.disabled = false
        createBtn.innerHTML = editingInstallationId ? '💾 Guardar Cambios' : '✅ Crear Instalación'
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