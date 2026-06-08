'use strict'

/**
 * ==========================================
 * TECNILAND - Modpack Status Client
 * ==========================================
 * Cliente ligero para consultar el estado de habilitación/mantenimiento de los
 * modpacks desde el backend. Mantiene una caché en memoria para que la UI
 * (lista de selección, botón de servidor) pueda consultar de forma síncrona.
 *
 * Fail-open: ante cualquier error de red, se considera que TODO está habilitado.
 */

// El estado de mantenimiento es estado GLOBAL de producción: el toggle vive en el
// backend de producción (fly.dev), no en un backend local de desarrollo. Por eso se
// apunta a fly.dev por defecto incluso en dev. Override opcional con la env
// TECNILAND_MODPACK_API (ej. http://localhost:3000) para quien sí corra backend local.
const MODPACK_API_BASE = process.env.TECNILAND_MODPACK_API || 'https://tecniland-backend.fly.dev'

// Caché en memoria: Map<serverId, { enabled, maintenanceMessage }>
let _cache = new Map()
let _lastFetch = 0

/**
 * Descarga la lista de estados y actualiza la caché.
 * @param {Object} [opts]
 * @param {number} [opts.maxAgeMs] Si la caché es más reciente que esto, no hace red.
 * @returns {Promise<Map<string,{enabled:boolean,maintenanceMessage:?string}>>}
 */
async function fetchAndCacheStatuses(opts = {}) {
    const { maxAgeMs } = opts
    if (maxAgeMs != null && _lastFetch > 0 && (Date.now() - _lastFetch) < maxAgeMs) {
        return _cache
    }
    try {
        const res = await fetch(`${MODPACK_API_BASE}/api/modpacks/status`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            timeout: 5000
        })
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
        }
        const data = await res.json()
        const map = new Map()
        if (data && data.success && data.data && Array.isArray(data.data.modpacks)) {
            for (const m of data.data.modpacks) {
                map.set(m.serverId, {
                    enabled: m.enabled !== false,
                    maintenanceMessage: m.maintenanceMessage || null
                })
            }
        }
        _cache = map
        _lastFetch = Date.now()
        return _cache
    } catch (err) {
        console.warn('[ModpackStatus] No se pudieron obtener estados (fail-open):', err.message)
        // No vaciamos la caché previa: si hubo un fetch exitoso antes, lo conservamos.
        return _cache
    }
}

/**
 * Consulta el estado de un modpack concreto (fresco, no caché).
 * @param {string} serverId
 * @returns {Promise<{enabled:boolean, maintenanceMessage:?string, connectionOk:boolean}>}
 */
async function fetchStatus(serverId) {
    try {
        const res = await fetch(`${MODPACK_API_BASE}/api/modpacks/status/${encodeURIComponent(serverId)}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            timeout: 5000
        })
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
        }
        const data = await res.json()
        if (data && data.success && data.data) {
            const entry = {
                enabled: data.data.enabled !== false,
                maintenanceMessage: data.data.maintenanceMessage || null
            }
            _cache.set(serverId, entry)
            return { ...entry, connectionOk: true }
        }
        return { enabled: true, maintenanceMessage: null, connectionOk: true }
    } catch (err) {
        console.warn('[ModpackStatus] fail-open status check:', err.message)
        return { enabled: true, maintenanceMessage: null, connectionOk: false }
    }
}

/**
 * ¿El modpack está en mantenimiento? (consulta síncrona sobre la caché)
 * @param {string} serverId
 * @returns {boolean}
 */
function isUnderMaintenance(serverId) {
    const entry = _cache.get(serverId)
    return entry ? entry.enabled === false : false
}

/**
 * Mensaje de mantenimiento cacheado (o null).
 * @param {string} serverId
 * @returns {?string}
 */
function getMaintenanceMessage(serverId) {
    const entry = _cache.get(serverId)
    return entry ? entry.maintenanceMessage : null
}

module.exports = {
    MODPACK_API_BASE,
    fetchAndCacheStatuses,
    fetchStatus,
    isUnderMaintenance,
    getMaintenanceMessage
}
