const { DistributionAPI } = require('helios-core/common')

const ConfigManager = require('./configmanager')

// URL de la distribución (distribution.json).
// Override por variable de entorno TECNILAND_DISTRO_URL para migrar a un
// dominio propio de R2 sin tocar código (ver docs/FASE2_PLAN.md).
// Default: URL pública dev de R2 (rate-limited, reemplazar por dominio propio).
exports.REMOTE_DISTRO_URL = process.env.TECNILAND_DISTRO_URL
    || 'https://pub-eae2df8eea254247b58a3f40588e2c61.r2.dev/nebula/distribution.json'

// Para testing local, comenta la línea de arriba y descomenta esta:
// exports.REMOTE_DISTRO_URL = path.join(__dirname, '..', '..', '..', 'distribution-local.json')

const api = new DistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected forcefully by the preloader.
    null, // Injected forcefully by the preloader.
    exports.REMOTE_DISTRO_URL,
    false
)

exports.DistroAPI = api