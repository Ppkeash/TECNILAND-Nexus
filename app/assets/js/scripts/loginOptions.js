const loginOptionsCancelContainer = document.getElementById('loginOptionCancelContainer')
const loginOptionMicrosoft = document.getElementById('loginOptionMicrosoft')
const loginOptionMojang = document.getElementById('loginOptionMojang')
const loginOptionOffline = document.getElementById('loginOptionOffline')
const loginOptionTecniland = document.getElementById('loginOptionTecniland')
const loginOptionsCancelButton = document.getElementById('loginOptionCancelButton')

// TECNILAND Auth - use global if already loaded by another script
let TecnilandAuthUI_LO
try {
    TecnilandAuthUI_LO = require('./assets/js/tecnilandauth/TecnilandAuthUI')
} catch(e) {
    console.warn('TecnilandAuthUI already loaded or not available')
}

let loginOptionsCancellable = false

let loginOptionsViewOnLoginSuccess
let loginOptionsViewOnLoginCancel
let loginOptionsViewOnCancel
let loginOptionsViewCancelHandler

function loginOptionsCancelEnabled(val){
    if(val){
        $(loginOptionsCancelContainer).show()
    } else {
        $(loginOptionsCancelContainer).hide()
    }
}

// TECNILAND Account login handler
if (loginOptionTecniland && TecnilandAuthUI_LO) {
    loginOptionTecniland.onclick = (e) => {
        // Inicializar TecnilandAuthUI si no está inicializado
        if (!TecnilandAuthUI_LO.initialized) {
            TecnilandAuthUI_LO.init()
        }
        
        // Mostrar overlay de login TECNILAND
        TecnilandAuthUI_LO.showLoginOverlay(
            // onSuccess
            () => {
                if (loginOptionsViewOnLoginSuccess) {
                    switchView(getCurrentView(), loginOptionsViewOnLoginSuccess, 500, 500)
                }
            },
            // onCancel
            () => {
                if (loginOptionsViewOnLoginCancel) {
                    switchView(getCurrentView(), loginOptionsViewOnLoginCancel, 500, 500)
                }
            }
        )
    }
}

loginOptionMicrosoft.onclick = (e) => {
    switchView(getCurrentView(), VIEWS.waiting, 500, 500, () => {
        ipcRenderer.send(
            MSFT_OPCODE.OPEN_LOGIN,
            loginOptionsViewOnLoginSuccess,
            loginOptionsViewOnLoginCancel
        )
    })
}

loginOptionMojang.onclick = (e) => {
    switchView(getCurrentView(), VIEWS.login, 500, 500, () => {
        loginViewOnSuccess = loginOptionsViewOnLoginSuccess
        loginViewOnCancel = loginOptionsViewOnLoginCancel
        loginCancelEnabled(true)
        showNormalLogin()
    })
}

loginOptionOffline.onclick = (e) => {
    switchView(getCurrentView(), VIEWS.login, 500, 500, () => {
        loginViewOnSuccess = loginOptionsViewOnLoginSuccess
        loginViewOnCancel = loginOptionsViewOnLoginCancel
        loginCancelEnabled(true)
        showOfflineLogin()
    })
}

loginOptionsCancelButton.onclick = (e) => {
    switchView(getCurrentView(), loginOptionsViewOnCancel, 500, 500, () => {
        // Clear login values (Mojang and Offline login)
        // No cleanup needed for Microsoft.
        loginUsername.value = ''
        loginPassword.value = ''
        loginOfflineUsername.value = ''
        if(loginOptionsViewCancelHandler != null){
            loginOptionsViewCancelHandler()
            loginOptionsViewCancelHandler = null
        }
    })
}