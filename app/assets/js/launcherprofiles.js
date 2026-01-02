/**
 * launcher_profiles.json compatibility helper
 *
 * Some external installers (like OptiFine) expect a .minecraft-like folder
 * containing launcher_profiles.json. We keep this file inside commonDir
 * (our shared root: assets/libraries/versions) to avoid depending on %APPDATA%\.minecraft.
 */

const crypto = require('crypto')
const fs = require('fs-extra')
const path = require('path')
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('LauncherProfiles')

const DEFAULT_SELECTED_PROFILE = '(Default)'
const LAUNCHER_VERSION_FORMAT = 21

function generateUuid() {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }

    // RFC4122 v4 fallback
    const bytes = crypto.randomBytes(16)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = bytes.toString('hex')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function isPlainObject(x) {
    return x != null && typeof x === 'object' && !Array.isArray(x)
}

/**
 * Ensure commonDir/launcher_profiles.json exists and has a minimal valid structure.
 *
 * - Creates the file if missing.
 * - If it exists, patches missing fields without removing existing profiles.
 * - Generates clientToken once and persists it.
 * - Does NOT store Microsoft access tokens.
 *
 * @param {string} commonDir
 * @returns {Promise<{ path: string, created: boolean, patched: boolean }>} info
 */
async function ensureLauncherProfiles(commonDir) {
    if (!commonDir || typeof commonDir !== 'string') {
        throw new Error('commonDir inválido')
    }

    await fs.ensureDir(commonDir)

    const filePath = path.join(commonDir, 'launcher_profiles.json')
    const existed = await fs.pathExists(filePath)

    let data = {}
    let created = false
    let patched = false

    if (existed) {
        try {
            data = await fs.readJson(filePath)
            if (!isPlainObject(data)) {
                data = {}
                patched = true
            }
        } catch (err) {
            // Keep the user's file safe: back it up, then recreate a minimal one.
            const backupPath = `${filePath}.bak-${Date.now()}`
            try {
                await fs.copy(filePath, backupPath)
                logger.warn(`[LauncherProfiles] Existing file is not valid JSON. Backed up to: ${backupPath}`)
            } catch (copyErr) {
                logger.warn(`[LauncherProfiles] Failed to backup invalid launcher_profiles.json: ${copyErr.message}`)
            }
            data = {}
            patched = true
        }
    } else {
        created = true
    }

    // profiles
    if (!isPlainObject(data.profiles)) {
        data.profiles = {}
        patched = true
    }

    // selectedProfile
    if (typeof data.selectedProfile !== 'string' || data.selectedProfile.trim().length === 0) {
        data.selectedProfile = DEFAULT_SELECTED_PROFILE
        patched = true
    }

    // Ensure default profile exists if selectedProfile points to something missing.
    if (!data.profiles[data.selectedProfile]) {
        data.profiles[data.selectedProfile] = {
            name: data.selectedProfile,
            type: 'custom'
        }
        patched = true
    }

    // launcherVersion
    if (!isPlainObject(data.launcherVersion)) {
        data.launcherVersion = {}
        patched = true
    }
    if (typeof data.launcherVersion.name !== 'string' || data.launcherVersion.name.trim().length === 0) {
        data.launcherVersion.name = 'TECNILAND'
        patched = true
    }
    if (typeof data.launcherVersion.format !== 'number') {
        data.launcherVersion.format = LAUNCHER_VERSION_FORMAT
        patched = true
    }

    // clientToken
    if (typeof data.clientToken !== 'string' || data.clientToken.trim().length === 0) {
        data.clientToken = generateUuid()
        patched = true
    }

    // Never store accessToken here.
    if (typeof data.authenticationDatabase !== 'undefined') {
        // We don't delete it (user might have it), but we explicitly do not manage it.
        logger.info('[LauncherProfiles] authenticationDatabase present; leaving untouched for compatibility.')
    }

    if (created || patched) {
        await fs.writeJson(filePath, data, { spaces: 2 })
    }

    logger.info(`[LauncherProfiles] launcher_profiles.json ${created ? 'created' : (patched ? 'patched' : 'ok')}: ${filePath}`)

    return { path: filePath, created, patched }
}

module.exports = {
    ensureLauncherProfiles
}
