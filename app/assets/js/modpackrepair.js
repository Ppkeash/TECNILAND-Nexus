/**
 * modpackrepair.js
 *
 * Inventario + prune de archivos sobrantes para modpacks de distribución.
 *
 * helios-core (FullRepair / DistributionIndexProcessor) solo descarga archivos
 * declarados que falten o tengan MD5 distinto. NUNCA elimina archivos locales que
 * dejaron de estar en distribution.json. Este módulo aporta exactamente esa pieza
 * que falta: construir el inventario esperado desde el distro (fuente de verdad) y
 * borrar los sobrantes dentro de rutas gestionadas, respetando archivos del usuario.
 *
 * No duplica la lógica de descarga/validación de hashes: eso lo sigue haciendo
 * helios FullRepair. Aquí solo se enumera y se prune.
 */

const fs = require('fs-extra')
const path = require('path')
const { LoggerUtil } = require('helios-core')

const log = LoggerUtil.getLogger('ModpackRepair')

const ConfigManager = require('./configmanager')

/**
 * Carpetas/archivos que NUNCA se borran, pase lo que pase. Son datos del usuario.
 * Se comparan contra la ruta relativa (desde la raíz de la instancia), en minúsculas
 * y con separadores normalizados a '/'.
 */
const ALWAYS_PROTECTED_DIRS = [
    'saves',
    'screenshots',
    'logs',
    'crash-reports',
    'backups',
    'journeymap',
    'schematics',
    'replay_recordings',
    'shaderpacks'
]
const ALWAYS_PROTECTED_FILES = [
    'options.txt',
    'optionsof.txt',
    'optionsshaders.txt',
    'servers.dat',
    'usercache.json',
    'usernamecache.json',
    '.ds_store',
    'thumbs.db'
]

/**
 * Archivos de AJUSTES del usuario (relativos a la instancia, POSIX en minúsculas).
 * "Seed once": se descargan la PRIMERA vez (si no existen) y a partir de ahí son
 * INTOCABLES, aunque vengan declarados con MD5 en el distro. Es la red de seguridad
 * del launcher: aunque el admin olvide marcarlos como `untrackedFiles` en Nebula, el
 * jugador nunca pierde sus controles/ajustes. El admin puede ampliar esta lista por
 * modpack con el campo `tecnilandUserFiles` del distro (rutas relativas a la instancia).
 */
const DEFAULT_USER_FILES = [
    'options.txt',
    'optionsof.txt',
    'optionsshaders.txt',
    'servers.dat'
]

function normalize(p) {
    return path.resolve(p).toLowerCase()
}

function toPosixRel(root, file) {
    return path.relative(root, file).split(path.sep).join('/').toLowerCase()
}

/**
 * Construye el set de rutas absolutas (normalizadas) esperadas según el distro.
 * Recorre TODOS los servers y TODOS sus módulos (recursivo) para no borrar mods
 * compartidos en `modstore` que pertenezcan a otro modpack.
 *
 * @param {object} distro HeliosDistribution (de DistroAPI.getDistribution()).
 * @returns {Set<string>} rutas absolutas en minúsculas.
 */
function buildExpectedPaths(distro) {
    const expected = new Set()

    const visit = (module) => {
        try {
            const p = module.getPath()
            if (p) {
                expected.add(normalize(p))
            }
        } catch (err) {
            // Algunos módulos (VersionManifest sin path resoluble, etc.) pueden lanzar.
            log.debug(`No se pudo resolver getPath() de un módulo: ${err.message}`)
        }
        if (typeof module.hasSubModules === 'function' && module.hasSubModules()) {
            for (const sub of module.subModules) {
                visit(sub)
            }
        }
    }

    for (const server of distro.servers) {
        for (const module of server.modules) {
            visit(module)
        }
    }

    return expected
}

/**
 * Lista recursivamente todos los archivos bajo `root`. Devuelve rutas absolutas.
 * Si `root` no existe, devuelve [].
 */
async function walkFiles(root) {
    const out = []
    if (!await fs.pathExists(root)) {
        return out
    }
    const stack = [root]
    while (stack.length > 0) {
        const dir = stack.pop()
        let entries
        try {
            entries = await fs.readdir(dir, { withFileTypes: true })
        } catch (err) {
            log.warn(`No se pudo leer el directorio ${dir}: ${err.message}`)
            continue
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                stack.push(full)
            } else if (entry.isFile()) {
                out.push(full)
            }
        }
    }
    return out
}

/**
 * ¿Está protegido este archivo (relativo a la raíz de la instancia)?
 * @param {string} relPosix ruta relativa POSIX en minúsculas.
 */
function isProtected(relPosix) {
    const firstSeg = relPosix.split('/')[0]
    if (ALWAYS_PROTECTED_DIRS.includes(firstSeg)) {
        return true
    }
    if (ALWAYS_PROTECTED_FILES.includes(relPosix)) {
        return true
    }
    return false
}

/**
 * Elimina archivos sobrantes (presentes en disco pero no declarados en el distro)
 * dentro de las rutas gestionadas.
 *
 * Rutas gestionadas siempre: `modstore` (mods de juego) y `<instancia>/mods`.
 * Opcionales (según toggles): `config/`, `defaultconfigs/`, `resourcepacks/`, `options.txt`.
 *
 * @param {object} distro HeliosDistribution.
 * @param {string} serverId id del server seleccionado.
 * @param {object} [opts]
 * @param {boolean} [opts.config] prunar `config/`.
 * @param {boolean} [opts.defaultconfigs] prunar `defaultconfigs/`.
 * @param {boolean} [opts.resourcepacks] prunar `resourcepacks/`.
 * @param {boolean} [opts.optionsTxt] permitir eliminar `options.txt` si es sobrante.
 * @returns {Promise<{removed:string[], skippedProtected:string[]}>}
 */
async function pruneOrphans(distro, serverId, opts = {}) {
    const commonDir = ConfigManager.getCommonDirectory()
    const instanceDir = ConfigManager.getInstanceDirectory()
    const serverInstanceDir = path.join(instanceDir, serverId)

    const expected = buildExpectedPaths(distro)
    log.info(`Inventario esperado del distro: ${expected.size} archivos.`)

    const removed = []
    const skippedProtected = []

    // ---- Raíz compartida: modstore (mods de juego de tipo ForgeMod/LiteMod). ----
    // El set esperado incluye los módulos de TODOS los servers, así que aquí solo
    // se borran jars que ningún modpack declara ya.
    const modstoreRoot = path.join(commonDir, 'modstore')
    for (const file of await walkFiles(modstoreRoot)) {
        if (!expected.has(normalize(file))) {
            await fs.remove(file)
            const rel = path.relative(commonDir, file).split(path.sep).join('/')
            removed.push(rel)
            log.info(`extra file removed: ${rel}`)
        }
    }

    // ---- Raíces dentro de la instancia del server. ----
    // Cada entrada: [subruta relativa a la instancia, activada?]
    const instanceRoots = [
        ['mods', true],
        ['config', !!opts.config],
        ['defaultconfigs', !!opts.defaultconfigs],
        ['resourcepacks', !!opts.resourcepacks],
        ['shaderpacks', !!opts.shaderpacks]
    ]

    for (const [sub, enabled] of instanceRoots) {
        const root = path.join(serverInstanceDir, sub)
        for (const file of await walkFiles(root)) {
            const relPosix = toPosixRel(serverInstanceDir, file)

            // Guarda dura: nunca tocar datos del usuario aunque caigan bajo un root.
            if (isProtected(relPosix)) {
                skippedProtected.push(relPosix)
                log.info(`skipped protected file: ${relPosix}`)
                continue
            }
            if (!enabled) {
                // Carpeta sensible con su toggle apagado → se protege por completo.
                skippedProtected.push(relPosix)
                log.info(`skipped protected file: ${relPosix}`)
                continue
            }
            if (!expected.has(normalize(file))) {
                await fs.remove(file)
                removed.push(relPosix)
                log.info(`extra file removed: ${relPosix}`)
            }
        }
    }

    // ---- options.txt (archivo suelto, protegido salvo opt-in explícito). ----
    const optionsTxt = path.join(serverInstanceDir, 'options.txt')
    if (await fs.pathExists(optionsTxt)) {
        if (opts.optionsTxt && !expected.has(normalize(optionsTxt))) {
            await fs.remove(optionsTxt)
            removed.push('options.txt')
            log.info('extra file removed: options.txt')
        } else {
            skippedProtected.push('options.txt')
            log.info('skipped protected file: options.txt')
        }
    }

    log.info(`Prune completado: ${removed.length} eliminados, ${skippedProtected.length} protegidos.`)
    return { removed, skippedProtected }
}

/**
 * Sincroniza de forma EXACTA las "rutas gestionadas" que el administrador declara
 * en el distro (`server.rawServer.tecnilandManaged`: array de subrutas relativas a
 * la instancia, ej. ["config/fancymenu"]). Dentro de esas rutas, todo lo que no esté
 * declarado en el distro se elimina (añade/cambia lo hace FullRepair; aquí se borran
 * los sobrantes). Es seguro ejecutarlo siempre: son carpetas 100% gestionadas por el
 * admin, no ajustes libres del usuario.
 *
 * @param {object} distro HeliosDistribution.
 * @param {string} serverId id del server seleccionado.
 * @returns {Promise<{removed:string[]}>}
 */
async function syncManagedPaths(distro, serverId) {
    const removed = []
    const server = distro.getServerById(serverId)
    if (server == null) {
        return { removed }
    }

    const managed = server.rawServer.tecnilandManaged
    if (!Array.isArray(managed) || managed.length === 0) {
        return { removed }
    }

    const instanceDir = ConfigManager.getInstanceDirectory()
    const serverInstanceDir = path.join(instanceDir, serverId)
    const expected = buildExpectedPaths(distro)

    for (const sub of managed) {
        // Normaliza la subruta declarada y bloquea cualquier intento de escapar de
        // la instancia (path traversal con ".." o rutas absolutas).
        const rel = String(sub).replace(/\\/g, '/').replace(/^\/+/, '')
        const root = path.resolve(serverInstanceDir, rel)
        if (!root.toLowerCase().startsWith((serverInstanceDir + path.sep).toLowerCase())) {
            log.warn(`Ruta gestionada inválida (fuera de la instancia), ignorada: ${sub}`)
            continue
        }
        for (const file of await walkFiles(root)) {
            if (!expected.has(normalize(file))) {
                await fs.remove(file)
                const relLog = path.relative(serverInstanceDir, file).split(path.sep).join('/')
                removed.push(relLog)
                log.info(`extra file removed (managed): ${relLog}`)
            }
        }
    }

    if (removed.length > 0) {
        log.info(`Rutas gestionadas sincronizadas: ${removed.length} sobrantes eliminados.`)
    }
    return { removed }
}

/**
 * Resuelve las rutas absolutas de los archivos de AJUSTES del usuario para un server.
 * Combina la lista por defecto del launcher con el campo opcional del distro
 * `server.rawServer.tecnilandUserFiles` (rutas relativas a la instancia).
 *
 * @param {object} distro HeliosDistribution.
 * @param {string} serverId
 * @returns {string[]} rutas absolutas (sin normalizar a minúsculas; las reales).
 */
function getUserOwnedAbsPaths(distro, serverId) {
    const instanceDir = ConfigManager.getInstanceDirectory()
    const serverInstanceDir = path.join(instanceDir, serverId)

    const rels = new Set(DEFAULT_USER_FILES)
    const server = distro != null ? distro.getServerById(serverId) : null
    const extra = server != null ? server.rawServer.tecnilandUserFiles : null
    if (Array.isArray(extra)) {
        for (const e of extra) {
            const rel = String(e).replace(/\\/g, '/').replace(/^\/+/, '')
            if (rel) {
                rels.add(rel)
            }
        }
    }

    const out = []
    for (const rel of rels) {
        const abs = path.resolve(serverInstanceDir, rel)
        // Anti-traversal: la ruta debe quedar dentro de la instancia del server.
        if (abs.toLowerCase().startsWith((serverInstanceDir + path.sep).toLowerCase())) {
            out.push(abs)
        } else {
            log.warn(`tecnilandUserFiles fuera de la instancia, ignorado: ${rel}`)
        }
    }
    return out
}

/**
 * Toma una "foto" (contenido en memoria) de los archivos de ajustes del usuario que
 * EXISTEN antes de reparar/lanzar. Solo se capturan los que ya existen: si un archivo
 * no existe, se deja que helios lo siembre con el valor del distro (primera vez).
 *
 * @param {object} distro HeliosDistribution.
 * @param {string} serverId
 * @returns {Promise<Array<{path:string, data:Buffer}>>}
 */
async function snapshotUserFiles(distro, serverId) {
    const snapshot = []
    for (const abs of getUserOwnedAbsPaths(distro, serverId)) {
        try {
            if (await fs.pathExists(abs)) {
                snapshot.push({ path: abs, data: await fs.readFile(abs) })
            }
        } catch (err) {
            log.warn(`No se pudo respaldar el archivo de usuario ${abs}: ${err.message}`)
        }
    }
    if (snapshot.length > 0) {
        log.info(`Archivos de usuario respaldados (intocables): ${snapshot.length}.`)
    }
    return snapshot
}

/**
 * Restaura la "foto" de archivos de usuario, deshaciendo cualquier sobrescritura que
 * FullRepair haya hecho sobre ellos. Garantiza que options.txt y ajustes del jugador
 * queden EXACTAMENTE como estaban antes de reparar/lanzar.
 *
 * @param {Array<{path:string, data:Buffer}>} snapshot resultado de snapshotUserFiles.
 * @returns {Promise<{restored:string[]}>}
 */
async function restoreUserFiles(snapshot) {
    const restored = []
    if (!Array.isArray(snapshot)) {
        return { restored }
    }
    for (const entry of snapshot) {
        try {
            const current = await fs.pathExists(entry.path) ? await fs.readFile(entry.path) : null
            // Solo reescribe si cambió (FullRepair lo pisó) → evita I/O innecesaria.
            if (current == null || !current.equals(entry.data)) {
                await fs.outputFile(entry.path, entry.data)
                restored.push(entry.path)
                log.info(`user file preserved (restaurado): ${path.basename(entry.path)}`)
            }
        } catch (err) {
            log.warn(`No se pudo restaurar el archivo de usuario ${entry.path}: ${err.message}`)
        }
    }
    return { restored }
}

/**
 * Borra POR COMPLETO la instancia de un server (mods, config, resourcepacks, etc.)
 * para una RE-INSTALACIÓN de emergencia. Tras esto, FullRepair vuelve a descargar
 * todo desde cero. Pensado para modpacks de SERVIDOR (sin mundos locales): es un
 * borrado total de la carpeta de instancia del server.
 *
 * @param {string} serverId
 * @returns {Promise<{wiped:boolean, path:string}>}
 */
async function wipeInstance(serverId) {
    const instanceDir = ConfigManager.getInstanceDirectory()
    const serverInstanceDir = path.join(instanceDir, serverId)

    // Guarda dura: nunca borrar la raíz de instancias entera ni algo fuera de ella.
    const safeChild = serverInstanceDir.toLowerCase().startsWith((instanceDir + path.sep).toLowerCase())
    if (!serverId || !safeChild) {
        log.error(`wipeInstance abortado: ruta insegura para serverId="${serverId}".`)
        return { wiped: false, path: serverInstanceDir }
    }

    if (await fs.pathExists(serverInstanceDir)) {
        await fs.remove(serverInstanceDir)
        log.info(`Instancia eliminada por re-instalación: ${serverInstanceDir}`)
    }
    return { wiped: true, path: serverInstanceDir }
}

module.exports = {
    buildExpectedPaths,
    walkFiles,
    isProtected,
    pruneOrphans,
    syncManagedPaths,
    getUserOwnedAbsPaths,
    snapshotUserFiles,
    restoreUserFiles,
    wipeInstance
}
