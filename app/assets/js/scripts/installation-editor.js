/**
 * Script para el editor de instalaciones personalizadas
 */

const remote = require('@electron/remote')
const ConfigManager = require('../configmanager')
const InstallationManager = require('../installationmanager')
const VersionAPI = require('../versionapi')
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('InstallationEditor')

// Estado del editor
let currentLoader = 'vanilla'
let minecraftVersions = []
let loaderVersions = []

/**
 * Inicializar el editor cuando el DOM esté listo
 */
document.addEventListener('DOMContentLoaded', async () => {
    logger.info('Inicializando editor de instalaciones')

    // Configurar listeners
    setupLoaderSelector()
    setupMinecraftVersionSelector()
    setupLoaderVersionSelector()
    setupFormSubmit()
    setupCancelButton()

    // Cargar versiones de Minecraft
    await loadMinecraftVersions()
    
    // Update experimental loaders visibility
    updateExperimentalLoadersVisibility()
})

// Listen for experimental loaders setting change from settings.js
window.addEventListener('experimental-loaders-changed', () => {
    updateExperimentalLoadersVisibility()
})

/**
 * Update visibility of experimental loaders (Fabric, Quilt, NeoForge)
 * based on the ExperimentalLoaders setting in ConfigManager
 */
function updateExperimentalLoadersVisibility() {
    const experimentalLoaders = ['fabric', 'quilt', 'neoforge']
    const showExperimental = ConfigManager.getExperimentalLoaders()
    
    experimentalLoaders.forEach(loader => {
        const btn = document.querySelector(`.loader-btn[data-loader="${loader}"]`)
        if (btn) {
            if (showExperimental) {
                btn.style.display = ''
            } else {
                btn.style.display = 'none'
                // If this loader was selected, switch to vanilla
                if (currentLoader === loader) {
                    const vanillaBtn = document.querySelector('.loader-btn[data-loader="vanilla"]')
                    if (vanillaBtn) {
                        vanillaBtn.click()
                    }
                }
            }
        }
    })
}

/**
 * Configurar selector de mod loader
 */
function setupLoaderSelector() {
    const loaderButtons = document.querySelectorAll('.loader-btn')
    const loaderVersionGroup = document.getElementById('loaderVersionGroup')

    loaderButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            // Remover clase active de todos los botones
            loaderButtons.forEach(b => b.classList.remove('active'))
            
            // Agregar clase active al botón clickeado
            btn.classList.add('active')
            
            // Actualizar loader actual
            const previousLoader = currentLoader
            currentLoader = btn.dataset.loader

            // Mostrar/ocultar selector de versión del loader
            if (currentLoader === 'vanilla') {
                loaderVersionGroup.style.display = 'none'
            } else {
                loaderVersionGroup.style.display = 'block'
            }

            // Si cambió el loader, recargar versiones de MC para aplicar filtros de compatibilidad
            if (previousLoader !== currentLoader) {
                logger.info(`Loader cambió de ${previousLoader} a ${currentLoader}, recargando versiones de MC...`)
                await loadMinecraftVersions()
            }

            // Limpiar y recargar versiones del loader si hay una versión de MC seleccionada
            const mcVersionSelect = document.getElementById('minecraftVersion')
            if (mcVersionSelect.value) {
                await loadLoaderVersions(mcVersionSelect.value)
            }

            // Actualizar estado del botón de crear
            updateCreateButton()
        })
    })
}

/**
 * Configurar selector de versión de Minecraft
 */
function setupMinecraftVersionSelector() {
    const mcVersionSelect = document.getElementById('minecraftVersion')

    mcVersionSelect.addEventListener('change', async (e) => {
        const selectedVersion = e.target.value

        if (!selectedVersion) {
            updateCreateButton()
            return
        }

        // Si no es Vanilla, cargar versiones del loader
        if (currentLoader !== 'vanilla') {
            await loadLoaderVersions(selectedVersion)
        }

        updateCreateButton()
    })
}

/**
 * Configurar selector de versión del loader
 */
function setupLoaderVersionSelector() {
    const loaderVersionSelect = document.getElementById('loaderVersion')

    loaderVersionSelect.addEventListener('change', () => {
        updateCreateButton()
    })
}

/**
 * Cargar versiones de Minecraft desde la API
 * Filtra versiones legacy (< 1.13) a menos que estén habilitadas en settings
 * Filtra por compatibilidad con el loader seleccionado (Fabric, Quilt, etc.)
 */
async function loadMinecraftVersions() {
    const mcVersionSelect = document.getElementById('minecraftVersion')
    const mcVersionInfo = document.getElementById('mcVersionInfo')
    
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
                // Parsear versión: 1.X.Y
                const parts = v.id.split('.')
                if (parts.length >= 2) {
                    const major = parseInt(parts[0], 10)
                    const minor = parseInt(parts[1], 10)
                    // Solo incluir 1.13+
                    return major >= 1 && minor >= 13
                }
                return false
            })
        }

        const totalBeforeLoaderFilter = filteredReleases.length
        
        // Filtrar por compatibilidad de loader
        if (currentLoader === 'fabric') {
            logger.info('Filtrando versiones de MC para compatibilidad con Fabric...')
            const fabricGameVersions = await VersionAPI.getFabricGameVersions()
            const compatibleIds = fabricGameVersions.map(v => v.version)
            filteredReleases = filteredReleases.filter(v => compatibleIds.includes(v.id))
            const hiddenCount = totalBeforeLoaderFilter - filteredReleases.length
            logger.info(`Fabric filter: ${filteredReleases.length} compatibles, ${hiddenCount} ocultas`)
            
            // Mostrar mensaje en UI
            if (hiddenCount > 0 && mcVersionInfo) {
                mcVersionInfo.textContent = `Mostrando ${filteredReleases.length} versiones compatibles con Fabric (${hiddenCount} ocultas)`
                mcVersionInfo.style.display = 'block'
            }
        } else if (currentLoader === 'quilt') {
            // TODO: Implementar filtrado de Quilt cuando esté disponible la API
            logger.info('Quilt: usando todas las versiones (filtrado no implementado)')
        } else if (currentLoader === 'neoforge') {
            // TODO: Implementar filtrado de NeoForge cuando esté disponible la API
            logger.info('NeoForge: usando todas las versiones (filtrado no implementado)')
        } else {
            // Vanilla y Forge: mostrar todas las versiones (1.13+)
            logger.info(`${currentLoader}: mostrando todas las versiones disponibles`)
        }
        
        minecraftVersions = filteredReleases

        // Limpiar y llenar el selector
        mcVersionSelect.innerHTML = '<option value="">Selecciona una versión</option>'
        
        filteredReleases.forEach(version => {
            const option = document.createElement('option')
            option.value = version.id
            
            // Añadir badge "Experimental" para versiones <1.13 si showLegacy está activo
            let displayText = version.id
            if (showLegacy) {
                const parts = version.id.split('.')
                if (parts.length >= 2) {
                    const major = parseInt(parts[0], 10)
                    const minor = parseInt(parts[1], 10)
                    if (major === 1 && minor < 13) {
                        displayText += ' [Experimental]'
                    }
                }
            }
            
            option.textContent = displayText
            mcVersionSelect.appendChild(option)
        })

        mcVersionSelect.disabled = false
        logger.info(`Cargadas ${filteredReleases.length} versiones de Minecraft${showLegacy ? ' (incluyendo legacy)' : ' (solo 1.13+)'}`)

    } catch (err) {
        logger.error('Error al cargar versiones de Minecraft:', err)
        showError('Error al cargar versiones de Minecraft. Verifica tu conexión a internet.')
        mcVersionSelect.innerHTML = '<option value="">Error al cargar versiones</option>'
        if (mcVersionInfo) {
            mcVersionInfo.style.display = 'none'
        }
    }
}

/**
 * Cargar versiones del loader seleccionado para una versión de Minecraft
 * @param {string} minecraftVersion - Versión de Minecraft
 */
async function loadLoaderVersions(minecraftVersion) {
    const loaderVersionSelect = document.getElementById('loaderVersion')
    
    try {
        loaderVersionSelect.innerHTML = '<option value="">Cargando versiones...</option>'
        loaderVersionSelect.disabled = true

        let versions = []

        switch (currentLoader) {
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

        if (versions.length === 0) {
            loaderVersionSelect.innerHTML = '<option value="">No hay versiones disponibles</option>'
            showError(`No hay versiones de ${currentLoader} disponibles para Minecraft ${minecraftVersion}`)
            return
        }

        // Limpiar y llenar el selector
        loaderVersionSelect.innerHTML = '<option value="">Selecciona una versión</option>'
        
        versions.forEach(version => {
            const option = document.createElement('option')
            option.value = version
            option.textContent = version
            loaderVersionSelect.appendChild(option)
        })

        // Seleccionar la primera versión por defecto
        if (versions.length > 0) {
            loaderVersionSelect.value = versions[0]
        }

        loaderVersionSelect.disabled = false
        logger.info(`Cargadas ${versions.length} versiones de ${currentLoader} para MC ${minecraftVersion}`)

    } catch (err) {
        logger.error(`Error al cargar versiones de ${currentLoader}:`, err)
        showError(`Error al cargar versiones de ${currentLoader}. Intenta con otra versión de Minecraft.`)
        loaderVersionSelect.innerHTML = '<option value="">Error al cargar versiones</option>'
    }
}

/**
 * Configurar envío del formulario
 */
function setupFormSubmit() {
    const form = document.getElementById('installationForm')

    form.addEventListener('submit', async (e) => {
        e.preventDefault()

        const nameInput = document.getElementById('installationName')
        const mcVersionSelect = document.getElementById('minecraftVersion')
        const loaderVersionSelect = document.getElementById('loaderVersion')
        const createBtn = document.getElementById('createBtn')

        // Validar campos
        const name = nameInput.value.trim()
        const minecraftVersion = mcVersionSelect.value
        const loaderVersion = currentLoader === 'vanilla' ? null : loaderVersionSelect.value

        if (!name) {
            showError('Debes ingresar un nombre para la instalación')
            return
        }

        if (!minecraftVersion) {
            showError('Debes seleccionar una versión de Minecraft')
            return
        }

        if (currentLoader !== 'vanilla' && !loaderVersion) {
            showError(`Debes seleccionar una versión de ${currentLoader}`)
            return
        }

        // Deshabilitar botón mientras se crea
        createBtn.disabled = true
        createBtn.innerHTML = '<span class="loading-spinner"></span> Creando...'

        try {
            // Crear instalación
            const installation = InstallationManager.createInstallation({
                name,
                loaderType: currentLoader,
                minecraftVersion,
                loaderVersion
            })

            // Validar instalación
            const validation = InstallationManager.validateInstallation(installation)
            if (!validation.valid) {
                showError(`Instalación no válida: ${validation.errors.join(', ')}`)
                createBtn.disabled = false
                createBtn.textContent = 'Crear Instalación'
                return
            }

            // Guardar en ConfigManager
            const added = ConfigManager.addInstallation(installation)
            if (!added) {
                showError('No se pudo agregar la instalación. Ya existe una con el mismo ID.')
                createBtn.disabled = false
                createBtn.textContent = 'Crear Instalación'
                return
            }

            ConfigManager.save()

            logger.info(`Instalación creada exitosamente: ${name}`)

            // Cerrar ventana y notificar éxito
            const currentWindow = remote.getCurrentWindow()
            currentWindow.close()

        } catch (err) {
            logger.error('Error al crear instalación:', err)
            showError(`Error al crear instalación: ${err.message}`)
            createBtn.disabled = false
            createBtn.textContent = 'Crear Instalación'
        }
    })
}

/**
 * Configurar botón de cancelar
 */
function setupCancelButton() {
    const cancelBtn = document.getElementById('cancelBtn')

    cancelBtn.addEventListener('click', () => {
        const currentWindow = remote.getCurrentWindow()
        currentWindow.close()
    })
}

/**
 * Actualizar estado del botón de crear según validación del formulario
 */
function updateCreateButton() {
    const createBtn = document.getElementById('createBtn')
    const nameInput = document.getElementById('installationName')
    const mcVersionSelect = document.getElementById('minecraftVersion')
    const loaderVersionSelect = document.getElementById('loaderVersion')

    const name = nameInput.value.trim()
    const mcVersion = mcVersionSelect.value
    const loaderVersion = loaderVersionSelect.value

    // Validar campos requeridos
    let isValid = name.length > 0 && mcVersion

    // Si no es Vanilla, requerir versión del loader
    if (currentLoader !== 'vanilla') {
        isValid = isValid && loaderVersion
    }

    createBtn.disabled = !isValid
}

/**
 * Mostrar mensaje de error
 * @param {string} message - Mensaje de error
 */
function showError(message) {
    const errorEl = document.getElementById('errorMessage')
    errorEl.textContent = message
    errorEl.classList.add('show')

    // Auto-ocultar después de 5 segundos
    setTimeout(() => {
        errorEl.classList.remove('show')
    }, 5000)
}

/**
 * Habilitar validación en tiempo real del nombre
 */
document.addEventListener('DOMContentLoaded', () => {
    const nameInput = document.getElementById('installationName')
    nameInput.addEventListener('input', updateCreateButton)
})
