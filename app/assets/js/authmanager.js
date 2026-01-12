/**
 * AuthManager
 * 
 * This module aims to abstract login procedures. Results from Mojang's REST api
 * are retrieved through our Mojang module. These results are processed and stored,
 * if applicable, in the config using the ConfigManager. All login procedures should
 * be made through this module.
 * 
 * @module authmanager
 */
// Requirements
const ConfigManager          = require('./configmanager')
const { LoggerUtil }         = require('helios-core')
const { RestResponseStatus } = require('helios-core/common')
const { MojangRestAPI, MojangErrorCode } = require('helios-core/mojang')
const { MicrosoftAuth, MicrosoftErrorCode } = require('helios-core/microsoft')
const { AZURE_CLIENT_ID }    = require('./ipcconstants')
const Lang = require('./langloader')
const crypto = require('crypto')

const log = LoggerUtil.getLogger('AuthManager')

// Error messages

function microsoftErrorDisplayable(errorCode) {
    switch (errorCode) {
        case MicrosoftErrorCode.NO_PROFILE:
            return {
                title: Lang.queryJS('auth.microsoft.error.noProfileTitle'),
                desc: Lang.queryJS('auth.microsoft.error.noProfileDesc')
            }
        case MicrosoftErrorCode.NO_XBOX_ACCOUNT:
            return {
                title: Lang.queryJS('auth.microsoft.error.noXboxAccountTitle'),
                desc: Lang.queryJS('auth.microsoft.error.noXboxAccountDesc')
            }
        case MicrosoftErrorCode.XBL_BANNED:
            return {
                title: Lang.queryJS('auth.microsoft.error.xblBannedTitle'),
                desc: Lang.queryJS('auth.microsoft.error.xblBannedDesc')
            }
        case MicrosoftErrorCode.UNDER_18:
            return {
                title: Lang.queryJS('auth.microsoft.error.under18Title'),
                desc: Lang.queryJS('auth.microsoft.error.under18Desc')
            }
        case MicrosoftErrorCode.UNKNOWN:
            return {
                title: Lang.queryJS('auth.microsoft.error.unknownTitle'),
                desc: Lang.queryJS('auth.microsoft.error.unknownDesc')
            }
    }
}

function mojangErrorDisplayable(errorCode) {
    switch(errorCode) {
        case MojangErrorCode.ERROR_METHOD_NOT_ALLOWED:
            return {
                title: Lang.queryJS('auth.mojang.error.methodNotAllowedTitle'),
                desc: Lang.queryJS('auth.mojang.error.methodNotAllowedDesc')
            }
        case MojangErrorCode.ERROR_NOT_FOUND:
            return {
                title: Lang.queryJS('auth.mojang.error.notFoundTitle'),
                desc: Lang.queryJS('auth.mojang.error.notFoundDesc')
            }
        case MojangErrorCode.ERROR_USER_MIGRATED:
            return {
                title: Lang.queryJS('auth.mojang.error.accountMigratedTitle'),
                desc: Lang.queryJS('auth.mojang.error.accountMigratedDesc')
            }
        case MojangErrorCode.ERROR_INVALID_CREDENTIALS:
            return {
                title: Lang.queryJS('auth.mojang.error.invalidCredentialsTitle'),
                desc: Lang.queryJS('auth.mojang.error.invalidCredentialsDesc')
            }
        case MojangErrorCode.ERROR_RATELIMIT:
            return {
                title: Lang.queryJS('auth.mojang.error.tooManyAttemptsTitle'),
                desc: Lang.queryJS('auth.mojang.error.tooManyAttemptsDesc')
            }
        case MojangErrorCode.ERROR_INVALID_TOKEN:
            return {
                title: Lang.queryJS('auth.mojang.error.invalidTokenTitle'),
                desc: Lang.queryJS('auth.mojang.error.invalidTokenDesc')
            }
        case MojangErrorCode.ERROR_ACCESS_TOKEN_HAS_PROFILE:
            return {
                title: Lang.queryJS('auth.mojang.error.tokenHasProfileTitle'),
                desc: Lang.queryJS('auth.mojang.error.tokenHasProfileDesc')
            }
        case MojangErrorCode.ERROR_CREDENTIALS_MISSING:
            return {
                title: Lang.queryJS('auth.mojang.error.credentialsMissingTitle'),
                desc: Lang.queryJS('auth.mojang.error.credentialsMissingDesc')
            }
        case MojangErrorCode.ERROR_INVALID_SALT_VERSION:
            return {
                title: Lang.queryJS('auth.mojang.error.invalidSaltVersionTitle'),
                desc: Lang.queryJS('auth.mojang.error.invalidSaltVersionDesc')
            }
        case MojangErrorCode.ERROR_UNSUPPORTED_MEDIA_TYPE:
            return {
                title: Lang.queryJS('auth.mojang.error.unsupportedMediaTypeTitle'),
                desc: Lang.queryJS('auth.mojang.error.unsupportedMediaTypeDesc')
            }
        case MojangErrorCode.ERROR_GONE:
            return {
                title: Lang.queryJS('auth.mojang.error.accountGoneTitle'),
                desc: Lang.queryJS('auth.mojang.error.accountGoneDesc')
            }
        case MojangErrorCode.ERROR_UNREACHABLE:
            return {
                title: Lang.queryJS('auth.mojang.error.unreachableTitle'),
                desc: Lang.queryJS('auth.mojang.error.unreachableDesc')
            }
        case MojangErrorCode.ERROR_NOT_PAID:
            return {
                title: Lang.queryJS('auth.mojang.error.gameNotPurchasedTitle'),
                desc: Lang.queryJS('auth.mojang.error.gameNotPurchasedDesc')
            }
        case MojangErrorCode.UNKNOWN:
            return {
                title: Lang.queryJS('auth.mojang.error.unknownErrorTitle'),
                desc: Lang.queryJS('auth.mojang.error.unknownErrorDesc')
            }
        default:
            throw new Error(`Unknown error code: ${errorCode}`)
    }
}

// Functions

/**
 * Add a Mojang account. This will authenticate the given credentials with Mojang's
 * authserver. The resultant data will be stored as an auth account in the
 * configuration database.
 * 
 * @param {string} username The account username (email if migrated).
 * @param {string} password The account password.
 * @returns {Promise.<Object>} Promise which resolves the resolved authenticated account object.
 */
exports.addMojangAccount = async function(username, password) {
    try {
        const response = await MojangRestAPI.authenticate(username, password, ConfigManager.getClientToken())
        console.log(response)
        if(response.responseStatus === RestResponseStatus.SUCCESS) {

            const session = response.data
            if(session.selectedProfile != null){
                const ret = ConfigManager.addMojangAuthAccount(session.selectedProfile.id, session.accessToken, username, session.selectedProfile.name)
                if(ConfigManager.getClientToken() == null){
                    ConfigManager.setClientToken(session.clientToken)
                }
                ConfigManager.save()
                return ret
            } else {
                return Promise.reject(mojangErrorDisplayable(MojangErrorCode.ERROR_NOT_PAID))
            }

        } else {
            return Promise.reject(mojangErrorDisplayable(response.mojangErrorCode))
        }
        
    } catch (err){
        log.error(err)
        return Promise.reject(mojangErrorDisplayable(MojangErrorCode.UNKNOWN))
    }
}

const AUTH_MODE = { FULL: 0, MS_REFRESH: 1, MC_REFRESH: 2 }

/**
 * Perform the full MS Auth flow in a given mode.
 * 
 * AUTH_MODE.FULL = Full authorization for a new account.
 * AUTH_MODE.MS_REFRESH = Full refresh authorization.
 * AUTH_MODE.MC_REFRESH = Refresh of the MC token, reusing the MS token.
 * 
 * @param {string} entryCode FULL-AuthCode. MS_REFRESH=refreshToken, MC_REFRESH=accessToken
 * @param {*} authMode The auth mode.
 * @returns An object with all auth data. AccessToken object will be null when mode is MC_REFRESH.
 */
async function fullMicrosoftAuthFlow(entryCode, authMode) {
    try {

        let accessTokenRaw
        let accessToken
        if(authMode !== AUTH_MODE.MC_REFRESH) {
            const accessTokenResponse = await MicrosoftAuth.getAccessToken(entryCode, authMode === AUTH_MODE.MS_REFRESH, AZURE_CLIENT_ID)
            if(accessTokenResponse.responseStatus === RestResponseStatus.ERROR) {
                return Promise.reject(microsoftErrorDisplayable(accessTokenResponse.microsoftErrorCode))
            }
            accessToken = accessTokenResponse.data
            accessTokenRaw = accessToken.access_token
        } else {
            accessTokenRaw = entryCode
        }
        
        const xblResponse = await MicrosoftAuth.getXBLToken(accessTokenRaw)
        if(xblResponse.responseStatus === RestResponseStatus.ERROR) {
            return Promise.reject(microsoftErrorDisplayable(xblResponse.microsoftErrorCode))
        }
        const xstsResonse = await MicrosoftAuth.getXSTSToken(xblResponse.data)
        if(xstsResonse.responseStatus === RestResponseStatus.ERROR) {
            return Promise.reject(microsoftErrorDisplayable(xstsResonse.microsoftErrorCode))
        }
        const mcTokenResponse = await MicrosoftAuth.getMCAccessToken(xstsResonse.data)
        if(mcTokenResponse.responseStatus === RestResponseStatus.ERROR) {
            return Promise.reject(microsoftErrorDisplayable(mcTokenResponse.microsoftErrorCode))
        }
        const mcProfileResponse = await MicrosoftAuth.getMCProfile(mcTokenResponse.data.access_token)
        if(mcProfileResponse.responseStatus === RestResponseStatus.ERROR) {
            return Promise.reject(microsoftErrorDisplayable(mcProfileResponse.microsoftErrorCode))
        }
        return {
            accessToken,
            accessTokenRaw,
            xbl: xblResponse.data,
            xsts: xstsResonse.data,
            mcToken: mcTokenResponse.data,
            mcProfile: mcProfileResponse.data
        }
    } catch(err) {
        log.error(err)
        
        // Check if it's a rate limit error (HTTP 429)
        if (err.response && err.response.statusCode === 429) {
            return Promise.reject({
                title: Lang.queryJS('auth.microsoft.error.rateLimitTitle'),
                desc: Lang.queryJS('auth.microsoft.error.rateLimitDesc')
            })
        }
        
        return Promise.reject(microsoftErrorDisplayable(MicrosoftErrorCode.UNKNOWN))
    }
}

/**
 * Calculate the expiry date. Advance the expiry time by 10 seconds
 * to reduce the liklihood of working with an expired token.
 * 
 * @param {number} nowMs Current time milliseconds.
 * @param {number} epiresInS Expires in (seconds)
 * @returns 
 */
function calculateExpiryDate(nowMs, epiresInS) {
    return nowMs + ((epiresInS-10)*1000)
}

/**
 * Add a Microsoft account. This will pass the provided auth code to Mojang's OAuth2.0 flow.
 * The resultant data will be stored as an auth account in the configuration database.
 * 
 * @param {string} authCode The authCode obtained from microsoft.
 * @returns {Promise.<Object>} Promise which resolves the resolved authenticated account object.
 */
exports.addMicrosoftAccount = async function(authCode) {

    const fullAuth = await fullMicrosoftAuthFlow(authCode, AUTH_MODE.FULL)

    // Advance expiry by 10 seconds to avoid close calls.
    const now = new Date().getTime()

    const ret = ConfigManager.addMicrosoftAuthAccount(
        fullAuth.mcProfile.id,
        fullAuth.mcToken.access_token,
        fullAuth.mcProfile.name,
        calculateExpiryDate(now, fullAuth.mcToken.expires_in),
        fullAuth.accessToken.access_token,
        fullAuth.accessToken.refresh_token,
        calculateExpiryDate(now, fullAuth.accessToken.expires_in)
    )
    ConfigManager.save()

    return ret
}

/**
 * Remove a Mojang account. This will invalidate the access token associated
 * with the account and then remove it from the database.
 * 
 * @param {string} uuid The UUID of the account to be removed.
 * @returns {Promise.<void>} Promise which resolves to void when the action is complete.
 */
exports.removeMojangAccount = async function(uuid){
    try {
        const authAcc = ConfigManager.getAuthAccount(uuid)
        const response = await MojangRestAPI.invalidate(authAcc.accessToken, ConfigManager.getClientToken())
        if(response.responseStatus === RestResponseStatus.SUCCESS) {
            ConfigManager.removeAuthAccount(uuid)
            ConfigManager.save()
            return Promise.resolve()
        } else {
            log.error('Error while removing account', response.error)
            return Promise.reject(response.error)
        }
    } catch (err){
        log.error('Error while removing account', err)
        return Promise.reject(err)
    }
}

/**
 * Remove a Microsoft account. It is expected that the caller will invoke the OAuth logout
 * through the ipc renderer.
 * 
 * @param {string} uuid The UUID of the account to be removed.
 * @returns {Promise.<void>} Promise which resolves to void when the action is complete.
 */
exports.removeMicrosoftAccount = async function(uuid){
    try {
        ConfigManager.removeAuthAccount(uuid)
        ConfigManager.save()
        return Promise.resolve()
    } catch (err){
        log.error('Error while removing account', err)
        return Promise.reject(err)
    }
}

/**
 * Validate the selected account with Mojang's authserver. If the account is not valid,
 * we will attempt to refresh the access token and update that value. If that fails, a
 * new login will be required.
 * 
 * @returns {Promise.<boolean>} Promise which resolves to true if the access token is valid,
 * otherwise false.
 */
async function validateSelectedMojangAccount(){
    const current = ConfigManager.getSelectedAccount()
    const response = await MojangRestAPI.validate(current.accessToken, ConfigManager.getClientToken())

    if(response.responseStatus === RestResponseStatus.SUCCESS) {
        const isValid = response.data
        if(!isValid){
            const refreshResponse = await MojangRestAPI.refresh(current.accessToken, ConfigManager.getClientToken())
            if(refreshResponse.responseStatus === RestResponseStatus.SUCCESS) {
                const session = refreshResponse.data
                ConfigManager.updateMojangAuthAccount(current.uuid, session.accessToken)
                ConfigManager.save()
            } else {
                log.error('Error while validating selected profile:', refreshResponse.error)
                log.info('Account access token is invalid.')
                return false
            }
            log.info('Account access token validated.')
            return true
        } else {
            log.info('Account access token validated.')
            return true
        }
    }
    
}

/**
 * Validate the selected account with Microsoft's authserver. If the account is not valid,
 * we will attempt to refresh the access token and update that value. If that fails, a
 * new login will be required.
 * 
 * @returns {Promise.<boolean>} Promise which resolves to true if the access token is valid,
 * otherwise false.
 */
async function validateSelectedMicrosoftAccount(){
    const current = ConfigManager.getSelectedAccount()
    const now = new Date().getTime()
    const mcExpiresAt = current.expiresAt
    const mcExpired = now >= mcExpiresAt

    if(!mcExpired) {
        return true
    }

    // MC token expired. Check MS token.

    const msExpiresAt = current.microsoft.expires_at
    const msExpired = now >= msExpiresAt

    if(msExpired) {
        // MS expired, do full refresh.
        try {
            const res = await fullMicrosoftAuthFlow(current.microsoft.refresh_token, AUTH_MODE.MS_REFRESH)

            ConfigManager.updateMicrosoftAuthAccount(
                current.uuid,
                res.mcToken.access_token,
                res.accessToken.access_token,
                res.accessToken.refresh_token,
                calculateExpiryDate(now, res.accessToken.expires_in),
                calculateExpiryDate(now, res.mcToken.expires_in)
            )
            ConfigManager.save()
            return true
        } catch(err) {
            return false
        }
    } else {
        // Only MC expired, use existing MS token.
        try {
            const res = await fullMicrosoftAuthFlow(current.microsoft.access_token, AUTH_MODE.MC_REFRESH)

            ConfigManager.updateMicrosoftAuthAccount(
                current.uuid,
                res.mcToken.access_token,
                current.microsoft.access_token,
                current.microsoft.refresh_token,
                current.microsoft.expires_at,
                calculateExpiryDate(now, res.mcToken.expires_in)
            )
            ConfigManager.save()
            return true
        }
        catch(err) {
            return false
        }
    }
}

/**
 * Validate the selected auth account.
 * 
 * @returns {Promise.<boolean>} Promise which resolves to true if the access token is valid,
 * otherwise false.
 */
exports.validateSelected = async function(){
    const current = ConfigManager.getSelectedAccount()

    if(current.type === 'microsoft') {
        return await validateSelectedMicrosoftAccount()
    } else if(current.type === 'offline') {
        // Offline accounts don't need validation
        return true
    } else {
        return await validateSelectedMojangAccount()
    }
    
}

// -------------------- OFFLINE ACCOUNT SUPPORT --------------------

/**
 * Validates an offline username according to Minecraft standards.
 * Username must be 3-16 characters, alphanumeric and underscores only.
 * 
 * @param {string} username The username to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
function validateOfflineUsername(username) {
    const minecraftUsernameRegex = /^[a-zA-Z0-9_]{3,16}$/
    return minecraftUsernameRegex.test(username)
}

/**
 * Generates a deterministic UUID v3 from a username.
 * Uses a fixed namespace UUID to ensure consistency.
 * 
 * @param {string} username The username to generate UUID from.
 * @returns {string} The generated UUID in standard format.
 */
function generateOfflineUUID(username) {
    // Namespace UUID for OfflinePlayer (Minecraft standard)
    const namespace = 'OfflinePlayer:' + username
    const hash = crypto.createHash('md5').update(namespace).digest()
    
    // Set version to 3 (MD5 hash based)
    hash[6] = (hash[6] & 0x0f) | 0x30
    hash[8] = (hash[8] & 0x3f) | 0x80
    
    // Format as UUID string
    const uuid = hash.toString('hex')
    return `${uuid.substring(0, 8)}-${uuid.substring(8, 12)}-${uuid.substring(12, 16)}-${uuid.substring(16, 20)}-${uuid.substring(20, 32)}`
}

/**
 * Add an offline account. This will create a local offline account without any online validation.
 * The account can be used to play on cracked/offline servers.
 * 
 * @param {string} username The username for the offline account (3-16 chars, alphanumeric + underscore).
 * @returns {Promise.<Object>} Promise which resolves the created offline account object.
 */
exports.addOfflineAccount = async function(username) {
    try {
        // Validate username format
        if (!validateOfflineUsername(username)) {
            return Promise.reject({
                title: Lang.queryJS('auth.offline.error.invalidUsernameTitle') || 'Invalid Username',
                desc: Lang.queryJS('auth.offline.error.invalidUsernameDesc') || 'Username must be 3-16 characters (letters, numbers, and underscores only).'
            })
        }

        // Generate deterministic UUID
        const uuid = generateOfflineUUID(username)

        // Check if account already exists
        const existingAccount = ConfigManager.getAuthAccount(uuid)
        if (existingAccount) {
            return Promise.reject({
                title: Lang.queryJS('auth.offline.error.accountExistsTitle') || 'Account Already Exists',
                desc: Lang.queryJS('auth.offline.error.accountExistsDesc') || 'An offline account with this username already exists.'
            })
        }

        // Add offline account to config
        const ret = ConfigManager.addOfflineAccount(uuid, username)
        ConfigManager.save()

        log.info(`Offline account created: ${username} (${uuid})`)
        return ret

    } catch (err) {
        log.error('Error while adding offline account:', err)
        return Promise.reject({
            title: Lang.queryJS('auth.offline.error.unknownTitle') || 'Unknown Error',
            desc: Lang.queryJS('auth.offline.error.unknownDesc') || 'An unknown error occurred while creating the offline account.'
        })
    }
}

/**
 * Remove an offline account from the configuration.
 * 
 * @param {string} uuid The UUID of the offline account to be removed.
 * @returns {Promise.<void>} Promise which resolves to void when the action is complete.
 */
exports.removeOfflineAccount = async function(uuid) {
    try {
        ConfigManager.removeAuthAccount(uuid)
        ConfigManager.save()
        log.info(`Offline account removed: ${uuid}`)
        return Promise.resolve()
    } catch (err) {
        log.error('Error while removing offline account:', err)
        return Promise.reject(err)
    }
}

/**
 * Validate an offline account. Offline accounts are always valid as they don't require online validation.
 * 
 * @param {Object} account The offline account to validate.
 * @returns {Promise.<boolean>} Promise which always resolves to true for offline accounts.
 */
exports.validateOfflineAccount = async function(account) {
    // Offline accounts don't need validation
    log.info(`Offline account validated: ${account.displayName}`)
    return Promise.resolve(true)
}

/**
 * Update an offline account's UUID (advanced feature).
 * Allows manual override of the auto-generated UUID.
 * 
 * @param {string} currentUuid The current UUID of the account.
 * @param {string} newUuid The new UUID to set (must be valid UUID format).
 * @returns {Promise.<Object>} Promise which resolves the updated account object.
 */
exports.updateOfflineAccountUUID = async function(currentUuid, newUuid) {
    try {
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (!uuidRegex.test(newUuid)) {
            return Promise.reject({
                title: 'Invalid UUID Format',
                desc: 'The provided UUID is not in a valid format.'
            })
        }

        // Get current account
        const account = ConfigManager.getAuthAccount(currentUuid)
        if (!account || account.type !== 'offline') {
            return Promise.reject({
                title: 'Account Not Found',
                desc: 'The specified offline account does not exist.'
            })
        }

        // Check if new UUID already exists
        const existingAccount = ConfigManager.getAuthAccount(newUuid)
        if (existingAccount && existingAccount.uuid !== currentUuid) {
            return Promise.reject({
                title: 'UUID Already Exists',
                desc: 'Another account is already using this UUID.'
            })
        }

        // Remove old account and add with new UUID
        ConfigManager.removeAuthAccount(currentUuid)
        const ret = ConfigManager.addOfflineAccount(newUuid, account.username, account.displayName)
        
        // If this was the selected account, update selection
        if (ConfigManager.getSelectedAccount()?.uuid === currentUuid) {
            ConfigManager.setSelectedAccount(newUuid)
        }
        
        ConfigManager.save()
        log.info(`Offline account UUID updated: ${currentUuid} -> ${newUuid}`)
        return ret

    } catch (err) {
        log.error('Error while updating offline account UUID:', err)
        return Promise.reject({
            title: 'Update Failed',
            desc: 'Failed to update the offline account UUID.'
        })
    }
}
