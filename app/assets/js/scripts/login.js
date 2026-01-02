/**
 * Script for login.ejs
 */
// Validation Regexes.
const validUsername         = /^[a-zA-Z0-9_]{1,16}$/
const basicEmail            = /^\S+@\S+\.\S+$/


// Login Elements
const loginCancelContainer  = document.getElementById('loginCancelContainer')
const loginCancelButton     = document.getElementById('loginCancelButton')
const loginEmailError       = document.getElementById('loginEmailError')
const loginUsername         = document.getElementById('loginUsername')
const loginPasswordError    = document.getElementById('loginPasswordError')
const loginPassword         = document.getElementById('loginPassword')
const checkmarkContainer    = document.getElementById('checkmarkContainer')
const loginRememberOption   = document.getElementById('loginRememberOption')
const loginButton           = document.getElementById('loginButton')
const loginForm             = document.getElementById('loginForm')

// Control variables.
let lu = false, lp = false


/**
 * Show a login error.
 * 
 * @param {HTMLElement} element The element on which to display the error.
 * @param {string} value The error text.
 */
function showError(element, value){
    element.innerHTML = value
    element.style.opacity = 1
}

/**
 * Shake a login error to add emphasis.
 * 
 * @param {HTMLElement} element The element to shake.
 */
function shakeError(element){
    if(element.style.opacity == 1){
        element.classList.remove('shake')
        void element.offsetWidth
        element.classList.add('shake')
    }
}

/**
 * Validate that an email field is neither empty nor invalid.
 * 
 * @param {string} value The email value.
 */
function validateEmail(value){
    if(value){
        if(!basicEmail.test(value) && !validUsername.test(value)){
            showError(loginEmailError, Lang.queryJS('login.error.invalidValue'))
            loginDisabled(true)
            lu = false
        } else {
            loginEmailError.style.opacity = 0
            lu = true
            if(lp){
                loginDisabled(false)
            }
        }
    } else {
        lu = false
        showError(loginEmailError, Lang.queryJS('login.error.requiredValue'))
        loginDisabled(true)
    }
}

/**
 * Validate that the password field is not empty.
 * 
 * @param {string} value The password value.
 */
function validatePassword(value){
    if(value){
        loginPasswordError.style.opacity = 0
        lp = true
        if(lu){
            loginDisabled(false)
        }
    } else {
        lp = false
        showError(loginPasswordError, Lang.queryJS('login.error.invalidValue'))
        loginDisabled(true)
    }
}

// Emphasize errors with shake when focus is lost.
loginUsername.addEventListener('focusout', (e) => {
    validateEmail(e.target.value)
    shakeError(loginEmailError)
})
loginPassword.addEventListener('focusout', (e) => {
    validatePassword(e.target.value)
    shakeError(loginPasswordError)
})

// Validate input for each field.
loginUsername.addEventListener('input', (e) => {
    validateEmail(e.target.value)
})
loginPassword.addEventListener('input', (e) => {
    validatePassword(e.target.value)
})

/**
 * Enable or disable the login button.
 * 
 * @param {boolean} v True to enable, false to disable.
 */
function loginDisabled(v){
    if(loginButton.disabled !== v){
        loginButton.disabled = v
    }
}

/**
 * Enable or disable loading elements.
 * 
 * @param {boolean} v True to enable, false to disable.
 */
function loginLoading(v){
    if(v){
        loginButton.setAttribute('loading', v)
        loginButton.innerHTML = loginButton.innerHTML.replace(Lang.queryJS('login.login'), Lang.queryJS('login.loggingIn'))
    } else {
        loginButton.removeAttribute('loading')
        loginButton.innerHTML = loginButton.innerHTML.replace(Lang.queryJS('login.loggingIn'), Lang.queryJS('login.login'))
    }
}

/**
 * Enable or disable login form.
 * 
 * @param {boolean} v True to enable, false to disable.
 */
function formDisabled(v){
    loginDisabled(v)
    loginCancelButton.disabled = v
    loginUsername.disabled = v
    loginPassword.disabled = v
    if(v){
        checkmarkContainer.setAttribute('disabled', v)
    } else {
        checkmarkContainer.removeAttribute('disabled')
    }
    loginRememberOption.disabled = v
}

let loginViewOnSuccess = VIEWS.landing
let loginViewOnCancel = VIEWS.settings
let loginViewCancelHandler

function loginCancelEnabled(val){
    if(val){
        $(loginCancelContainer).show()
    } else {
        $(loginCancelContainer).hide()
    }
}

loginCancelButton.onclick = (e) => {
    switchView(getCurrentView(), loginViewOnCancel, 500, 500, () => {
        loginUsername.value = ''
        loginPassword.value = ''
        loginCancelEnabled(false)
        if(loginViewCancelHandler != null){
            loginViewCancelHandler()
            loginViewCancelHandler = null
        }
    })
}

// Disable default form behavior.
loginForm.onsubmit = () => { return false }

// Bind login button behavior.
loginButton.addEventListener('click', () => {
    // Disable form.
    formDisabled(true)

    // Show loading stuff.
    loginLoading(true)

    AuthManager.addMojangAccount(loginUsername.value, loginPassword.value).then((value) => {
        updateSelectedAccount(value)
        loginButton.innerHTML = loginButton.innerHTML.replace(Lang.queryJS('login.loggingIn'), Lang.queryJS('login.success'))
        $('.circle-loader').toggleClass('load-complete')
        $('.checkmark').toggle()
        setTimeout(() => {
            switchView(VIEWS.login, loginViewOnSuccess, 500, 500, async () => {
                // Temporary workaround
                if(loginViewOnSuccess === VIEWS.settings){
                    await prepareSettings()
                }
                loginViewOnSuccess = VIEWS.landing // Reset this for good measure.
                loginCancelEnabled(false) // Reset this for good measure.
                loginViewCancelHandler = null // Reset this for good measure.
                loginUsername.value = ''
                loginPassword.value = ''
                $('.circle-loader').toggleClass('load-complete')
                $('.checkmark').toggle()
                loginLoading(false)
                loginButton.innerHTML = loginButton.innerHTML.replace(Lang.queryJS('login.success'), Lang.queryJS('login.login'))
                formDisabled(false)
            })
        }, 1000)
    }).catch((displayableError) => {
        loginLoading(false)

        let actualDisplayableError
        if(isDisplayableError(displayableError)) {
            msftLoginLogger.error('Error while logging in.', displayableError)
            actualDisplayableError = displayableError
        } else {
            // Uh oh.
            msftLoginLogger.error('Unhandled error during login.', displayableError)
            actualDisplayableError = Lang.queryJS('login.error.unknown')
        }

        setOverlayContent(actualDisplayableError.title, actualDisplayableError.desc, Lang.queryJS('login.tryAgain'))
        setOverlayHandler(() => {
            formDisabled(false)
            toggleOverlay(false)
        })
        toggleOverlay(true)
    })

})

// -------------------- OFFLINE LOGIN --------------------

// Offline Login Elements
const loginOfflineContent = document.getElementById('loginOfflineContent')
const loginOfflineForm = document.getElementById('loginOfflineForm')
const loginOfflineUsername = document.getElementById('loginOfflineUsername')
const loginOfflineUsernameError = document.getElementById('loginOfflineUsernameError')
const loginOfflineButton = document.getElementById('loginOfflineButton')

// Offline control variables
let luOffline = false

/**
 * Validate offline username according to Minecraft standards.
 * Username must be 3-16 characters, alphanumeric and underscores only.
 * 
 * @param {string} value The username value.
 */
function validateOfflineUsername(value) {
    const minecraftUsernameRegex = /^[a-zA-Z0-9_]{3,16}$/
    
    if (value) {
        if (!minecraftUsernameRegex.test(value)) {
            showError(loginOfflineUsernameError, 'Username must be 3-16 characters (letters, numbers, and underscores only).')
            loginOfflineDisabled(true)
            luOffline = false
        } else {
            loginOfflineUsernameError.style.opacity = 0
            luOffline = true
            loginOfflineDisabled(false)
        }
    } else {
        luOffline = false
        showError(loginOfflineUsernameError, 'Username is required.')
        loginOfflineDisabled(true)
    }
}

// Validate offline username input
loginOfflineUsername.addEventListener('input', (e) => {
    validateOfflineUsername(e.target.value)
})

loginOfflineUsername.addEventListener('focusout', (e) => {
    validateOfflineUsername(e.target.value)
    shakeError(loginOfflineUsernameError)
})

/**
 * Enable or disable the offline login button.
 * 
 * @param {boolean} v True to enable, false to disable.
 */
function loginOfflineDisabled(v) {
    if (loginOfflineButton.disabled !== v) {
        loginOfflineButton.disabled = v
    }
}

/**
 * Enable or disable offline login loading elements.
 * 
 * @param {boolean} v True to enable, false to disable.
 */
function loginOfflineLoading(v) {
    if (v) {
        loginOfflineButton.setAttribute('loading', v)
        loginOfflineButton.innerHTML = loginOfflineButton.innerHTML.replace('Login Offline', 'Logging In...')
    } else {
        loginOfflineButton.removeAttribute('loading')
        loginOfflineButton.innerHTML = loginOfflineButton.innerHTML.replace('Logging In...', 'Login Offline')
    }
}

/**
 * Enable or disable offline login form.
 * 
 * @param {boolean} v True to enable, false to disable.
 */
function formOfflineDisabled(v) {
    loginOfflineDisabled(v)
    loginOfflineUsername.disabled = v
}

// Disable default form behavior for offline form
loginOfflineForm.onsubmit = () => { return false }

// Bind offline login button behavior
loginOfflineButton.addEventListener('click', () => {
    // Disable form
    formOfflineDisabled(true)
    
    // Show loading
    loginOfflineLoading(true)
    
    AuthManager.addOfflineAccount(loginOfflineUsername.value).then((value) => {
        updateSelectedAccount(value)
        loginOfflineButton.innerHTML = loginOfflineButton.innerHTML.replace('Logging In...', 'Success!')
        $('.circle-loader').toggleClass('load-complete')
        $('.checkmark').toggle()
        
        setTimeout(() => {
            switchView(VIEWS.login, loginViewOnSuccess, 500, 500, async () => {
                // Temporary workaround
                if (loginViewOnSuccess === VIEWS.settings) {
                    await prepareSettings()
                }
                loginViewOnSuccess = VIEWS.landing // Reset
                loginCancelEnabled(false) // Reset
                loginViewCancelHandler = null // Reset
                loginOfflineUsername.value = ''
                $('.circle-loader').toggleClass('load-complete')
                $('.checkmark').toggle()
                loginOfflineLoading(false)
                loginOfflineButton.innerHTML = loginOfflineButton.innerHTML.replace('Success!', 'Login Offline')
                formOfflineDisabled(false)
                
                // Switch back to normal login view
                $(loginOfflineContent).hide()
                $(loginContent).show()
            })
        }, 1000)
    }).catch((displayableError) => {
        loginOfflineLoading(false)
        
        let actualDisplayableError
        if (isDisplayableError(displayableError)) {
            msftLoginLogger.error('Error while logging in offline.', displayableError)
            actualDisplayableError = displayableError
        } else {
            msftLoginLogger.error('Unhandled error during offline login.', displayableError)
            actualDisplayableError = {
                title: 'Unknown Error',
                desc: 'An unknown error occurred while creating offline account.'
            }
        }
        
        setOverlayContent(actualDisplayableError.title, actualDisplayableError.desc, 'Try Again')
        setOverlayHandler(() => {
            formOfflineDisabled(false)
            toggleOverlay(false)
        })
        toggleOverlay(true)
    })
})

/**
 * Show the offline login form and hide the normal login form.
 */
function showOfflineLogin() {
    $(loginContent).hide()
    $(loginOfflineContent).show()
}

/**
 * Show the normal login form and hide the offline login form.
 */
function showNormalLogin() {
    $(loginOfflineContent).hide()
    $(loginContent).show()
}