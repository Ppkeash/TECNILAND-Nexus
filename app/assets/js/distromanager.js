const { DistributionAPI } = require('helios-core/common')

const ConfigManager = require('./configmanager')

// Old WesterosCraft url.
// exports.REMOTE_DISTRO_URL = 'http://mc.westeroscraft.com/WesterosCraftLauncher/distribution.json'
exports.REMOTE_DISTRO_URL = 'https://pub-eae2df8eea254247b58a3f40588e2c61.r2.dev/nebula/distribution.json'

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