/**
 * CustomSkinLoaderManager
 * 
 * Gestiona la descarga, instalación y configuración de CustomSkinLoader (CSL)
 * para instancias de Minecraft con mod loaders (Fabric, Forge, NeoForge).
 * 
 * CSL permite que las skins personalizadas del servidor TECNILAND se muestren
 * en singleplayer, algo que authlib-injector no puede hacer por diseño.
 * 
 * @module customskinloader/CustomSkinLoaderManager
 */

const fs = require('fs-extra')
const path = require('path')
const https = require('https')
const http = require('http')
const { LoggerUtil } = require('helios-core')

const TecnilandAuthConfig = require('../tecnilandauth/TecnilandAuthConfig')

const logger = LoggerUtil.getLogger('CustomSkinLoader')

/**
 * Mapeo de versiones de CSL disponibles por versión de Minecraft y tipo de loader.
 * 
 * VARIANTES DE FORGE:
 * - ForgeV1: Para MC 1.7.10 - 1.16.5
 * - ForgeV2: Para MC 1.17.1 - 1.20.4
 * - ForgeV3: Para MC 1.20.6+
 * - ForgeActive: OBSOLETO (no usar)
 * 
 * FABRIC: El mismo JAR sirve para todas las versiones y también para Quilt.
 * 
 * Fuente: https://modrinth.com/mod/customskinloader/versions
 */
const CSL_VERSIONS = {
    // ==================== Minecraft 1.21.x ====================
    '1.21.4': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.27-ForgeV3',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/5Rn0uF40/CustomSkinLoader_ForgeV3-14.27.jar',
            filename: 'CustomSkinLoader_ForgeV3-14.27.jar'
        }
    },
    '1.21.3': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.27-ForgeV3',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/5Rn0uF40/CustomSkinLoader_ForgeV3-14.27.jar',
            filename: 'CustomSkinLoader_ForgeV3-14.27.jar'
        }
    },
    '1.21.2': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.27-ForgeV3',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/5Rn0uF40/CustomSkinLoader_ForgeV3-14.27.jar',
            filename: 'CustomSkinLoader_ForgeV3-14.27.jar'
        }
    },
    '1.21.1': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.27-ForgeV3',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/5Rn0uF40/CustomSkinLoader_ForgeV3-14.27.jar',
            filename: 'CustomSkinLoader_ForgeV3-14.27.jar'
        }
    },
    '1.21': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.27-ForgeV3',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/5Rn0uF40/CustomSkinLoader_ForgeV3-14.27.jar',
            filename: 'CustomSkinLoader_ForgeV3-14.27.jar'
        }
    },
    
    // ==================== Minecraft 1.20.x ====================
    '1.20.6': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.27-ForgeV3',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/5Rn0uF40/CustomSkinLoader_ForgeV3-14.27.jar',
            filename: 'CustomSkinLoader_ForgeV3-14.27.jar'
        }
    },
    '1.20.5': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.27-ForgeV3',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/5Rn0uF40/CustomSkinLoader_ForgeV3-14.27.jar',
            filename: 'CustomSkinLoader_ForgeV3-14.27.jar'
        }
    },
    '1.20.4': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV2',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/4jkpqBGD/CustomSkinLoader_ForgeV2-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV2-14.26.jar'
        }
    },
    '1.20.3': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV2',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/4jkpqBGD/CustomSkinLoader_ForgeV2-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV2-14.26.jar'
        }
    },
    '1.20.2': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV2',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/4jkpqBGD/CustomSkinLoader_ForgeV2-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV2-14.26.jar'
        }
    },
    '1.20.1': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV2',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/4jkpqBGD/CustomSkinLoader_ForgeV2-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV2-14.26.jar'
        }
    },
    '1.20': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV2',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/4jkpqBGD/CustomSkinLoader_ForgeV2-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV2-14.26.jar'
        }
    },
    
    // ==================== Minecraft 1.19.x ====================
    '1.19.4': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV2',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/4jkpqBGD/CustomSkinLoader_ForgeV2-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV2-14.26.jar'
        }
    },
    '1.19.3': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV2',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/4jkpqBGD/CustomSkinLoader_ForgeV2-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV2-14.26.jar'
        }
    },
    '1.19.2': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV2',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/4jkpqBGD/CustomSkinLoader_ForgeV2-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV2-14.26.jar'
        }
    },
    '1.19.1': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV2',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/4jkpqBGD/CustomSkinLoader_ForgeV2-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV2-14.26.jar'
        }
    },
    '1.19': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV2',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/4jkpqBGD/CustomSkinLoader_ForgeV2-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV2-14.26.jar'
        }
    },
    
    // ==================== Minecraft 1.18.x ====================
    '1.18.2': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV2',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/4jkpqBGD/CustomSkinLoader_ForgeV2-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV2-14.26.jar'
        }
    },
    '1.18.1': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV2',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/4jkpqBGD/CustomSkinLoader_ForgeV2-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV2-14.26.jar'
        }
    },
    '1.18': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV2',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/4jkpqBGD/CustomSkinLoader_ForgeV2-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV2-14.26.jar'
        }
    },
    
    // ==================== Minecraft 1.17.x ====================
    '1.17.1': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV2',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/4jkpqBGD/CustomSkinLoader_ForgeV2-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV2-14.26.jar'
        }
    },
    '1.17': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV2',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/4jkpqBGD/CustomSkinLoader_ForgeV2-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV2-14.26.jar'
        }
    },
    
    // ==================== Minecraft 1.16.x (ForgeV1) ====================
    '1.16.5': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    '1.16.4': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    '1.16.3': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    '1.16.2': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    '1.16.1': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    '1.16': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    
    // ==================== Minecraft 1.15.x (ForgeV1) ====================
    '1.15.2': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    '1.15.1': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    '1.15': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    
    // ==================== Minecraft 1.14.x (ForgeV1) ====================
    '1.14.4': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    '1.14.3': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    '1.14.2': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    '1.14.1': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    '1.14': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    
    // ==================== Minecraft 1.13.x (ForgeV1, no Fabric) ====================
    '1.13.2': {
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
        // No Fabric for 1.13.x
    },
    '1.13.1': {
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    '1.13': {
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    
    // ==================== Minecraft 1.12.x (ForgeV1, no Fabric) ====================
    '1.12.2': {
        fabric: {
            version: '14.26.1-Fabric',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/bLZg6wUJ/CustomSkinLoader_Fabric-14.26.1.jar',
            filename: 'CustomSkinLoader_Fabric-14.26.1.jar'
        },
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    '1.12.1': {
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    '1.12': {
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    
    // ==================== Minecraft 1.11.x - 1.7.10 (ForgeV1, no Fabric) ====================
    '1.11.2': {
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    '1.10.2': {
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    '1.9.4': {
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    '1.8.9': {
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    },
    '1.7.10': {
        forge: {
            version: '14.26-ForgeV1',
            url: 'https://cdn.modrinth.com/data/idMHQ4n2/versions/Dv1aBYaX/CustomSkinLoader_ForgeV1-14.26.jar',
            filename: 'CustomSkinLoader_ForgeV1-14.26.jar'
        }
    }
}

class CustomSkinLoaderManager {
    
    /**
     * Método principal: configura CSL para una instancia antes del lanzamiento.
     * 
     * @param {string} instancePath - Ruta absoluta de la instancia (gameDir)
     * @param {string} mcVersion - Versión de Minecraft (ej: "1.20.1")
     * @param {string} modLoader - Loader detectado: "fabric", "quilt", "forge", "neoforge", "vanilla"
     * @param {string} username - Username del jugador autenticado
     * @param {Object} [options] - Opciones adicionales
     * @param {boolean} [options.verifyBackend=false] - Verificar conectividad con backend
     * @returns {Promise<boolean>} - true si se instaló/configuró correctamente
     */
    static async setupForInstance(instancePath, mcVersion, modLoader, username, options = {}) {
        try {
            logger.info(`[CSL] Setting up CustomSkinLoader for ${mcVersion} (${modLoader})`)
            logger.debug(`[CSL] Instance path: ${instancePath}`)
            logger.debug(`[CSL] Username: ${username}`)
            logger.debug(`[CSL] Backend URL: ${TecnilandAuthConfig.BASE_URL}`)
            
            // 1. Verificar si es vanilla (CSL no funciona en vanilla)
            if (modLoader === 'vanilla') {
                logger.info('[CSL] Vanilla instance detected - CSL requires a mod loader (Fabric/Forge)')
                return false
            }
            
            // 2. Normalizar loader type
            const normalizedLoader = this._normalizeLoaderType(modLoader)
            logger.debug(`[CSL] Normalized loader: ${normalizedLoader}`)
            
            // 3. Verificar si hay versión de CSL disponible
            if (!this._hasCSLVersion(mcVersion, normalizedLoader)) {
                logger.warn(`[CSL] No CSL version available for MC ${mcVersion} (${normalizedLoader})`)
                return false
            }
            
            // 4. Verificar conectividad del backend (opcional, no bloquea)
            if (options.verifyBackend) {
                const backendCheck = await this.verifyBackendConnectivity(username, 3000)
                if (!backendCheck.success) {
                    logger.warn('[CSL] Backend is not reachable, but continuing with setup')
                    logger.warn('[CSL] Skins may not load until backend is available')
                }
            }
            
            // 5. Descargar e instalar CSL si es necesario
            const installed = await this._ensureCSLInstalled(instancePath, mcVersion, normalizedLoader)
            
            if (!installed) {
                logger.warn('[CSL] Failed to install CustomSkinLoader')
                return false
            }
            
            // 6. Generar/actualizar configuración (SIEMPRE, por si cambió el backend URL)
            this._generateConfig(instancePath, username)
            
            logger.info('[CSL] CustomSkinLoader ready for launch')
            return true
            
        } catch (error) {
            // NO bloquear el lanzamiento si CSL falla - es opcional
            logger.error(`[CSL] Error setting up CustomSkinLoader: ${error.message}`)
            logger.error(error.stack)
            return false
        }
    }
    
    /**
     * Normaliza el tipo de loader a los valores que CSL reconoce.
     * - Quilt usa el mismo JAR que Fabric
     * - NeoForge usa el mismo JAR que Forge
     * 
     * @param {string} modLoader
     * @returns {string} 'fabric' o 'forge'
     */
    static _normalizeLoaderType(modLoader) {
        const loader = modLoader.toLowerCase()
        
        // Quilt es compatible con Fabric
        if (loader === 'quilt') {
            return 'fabric'
        }
        
        // NeoForge es compatible con Forge
        if (loader === 'neoforge') {
            return 'forge'
        }
        
        // OptiFine se carga con Forge
        if (loader === 'optifine') {
            return 'forge'
        }
        
        return loader
    }
    
    /**
     * Verifica si hay una versión de CSL disponible para la combinación MC+Loader.
     * 
     * @param {string} mcVersion
     * @param {string} normalizedLoader
     * @returns {boolean}
     */
    static _hasCSLVersion(mcVersion, normalizedLoader) {
        const versionData = CSL_VERSIONS[mcVersion]
        return versionData && versionData[normalizedLoader]
    }
    
    /**
     * Obtiene la configuración de CSL para una versión de MC + loader.
     * 
     * @param {string} mcVersion
     * @param {string} normalizedLoader
     * @returns {Object|null}
     */
    static _getCSLVersion(mcVersion, normalizedLoader) {
        const versionData = CSL_VERSIONS[mcVersion]
        return versionData ? versionData[normalizedLoader] : null
    }
    
    /**
     * Asegura que CSL esté instalado en la instancia.
     * Descarga si es necesario.
     * 
     * @param {string} instancePath
     * @param {string} mcVersion
     * @param {string} normalizedLoader
     * @returns {Promise<boolean>}
     */
    static async _ensureCSLInstalled(instancePath, mcVersion, normalizedLoader) {
        const modsPath = path.join(instancePath, 'mods')
        fs.ensureDirSync(modsPath)
        
        const versionConfig = this._getCSLVersion(mcVersion, normalizedLoader)
        if (!versionConfig) {
            return false
        }
        
        const { url, filename } = versionConfig
        const destPath = path.join(modsPath, filename)
        
        // Si ya existe el archivo correcto, no descargar de nuevo
        if (fs.existsSync(destPath)) {
            logger.info(`[CSL] ${filename} already installed`)
            
            // Limpiar versiones antiguas de CSL (diferentes al filename actual)
            this._cleanupOldVersions(modsPath, filename)
            
            return true
        }
        
        // Limpiar versiones antiguas antes de descargar
        this._cleanupOldVersions(modsPath, filename)
        
        logger.info(`[CSL] Downloading ${filename}...`)
        
        try {
            await this._downloadFile(url, destPath)
            logger.info(`[CSL] Successfully downloaded ${filename}`)
            return true
        } catch (error) {
            logger.error(`[CSL] Download failed: ${error.message}`)
            // Limpiar archivo parcial si existe
            if (fs.existsSync(destPath)) {
                fs.unlinkSync(destPath)
            }
            return false
        }
    }
    
    /**
     * Limpia versiones antiguas de CSL en la carpeta mods.
     * Solo mantiene el filename especificado.
     * 
     * @param {string} modsPath
     * @param {string} keepFilename
     */
    static _cleanupOldVersions(modsPath, keepFilename) {
        try {
            const files = fs.readdirSync(modsPath)
            const cslFiles = files.filter(f => 
                f.includes('CustomSkinLoader') && 
                f.endsWith('.jar') && 
                f !== keepFilename
            )
            
            for (const oldFile of cslFiles) {
                const oldPath = path.join(modsPath, oldFile)
                logger.info(`[CSL] Removing old version: ${oldFile}`)
                fs.unlinkSync(oldPath)
            }
        } catch (error) {
            logger.warn(`[CSL] Could not cleanup old versions: ${error.message}`)
        }
    }
    
    /**
     * Descarga un archivo por HTTPS con soporte para redirecciones.
     * 
     * @param {string} url
     * @param {string} dest
     * @returns {Promise<void>}
     */
    static _downloadFile(url, dest) {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(dest)
            
            const request = https.get(url, (response) => {
                // Manejar redirecciones (301, 302, 307, 308)
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    file.close()
                    fs.unlinkSync(dest)
                    return this._downloadFile(response.headers.location, dest)
                        .then(resolve)
                        .catch(reject)
                }
                
                // Verificar código de respuesta exitoso
                if (response.statusCode !== 200) {
                    file.close()
                    fs.unlinkSync(dest)
                    reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`))
                    return
                }
                
                response.pipe(file)
                
                file.on('finish', () => {
                    file.close(resolve)
                })
            })
            
            request.on('error', (err) => {
                file.close()
                if (fs.existsSync(dest)) {
                    fs.unlinkSync(dest)
                }
                reject(err)
            })
            
            file.on('error', (err) => {
                file.close()
                if (fs.existsSync(dest)) {
                    fs.unlinkSync(dest)
                }
                reject(err)
            })
            
            // Timeout de 30 segundos
            request.setTimeout(30000, () => {
                request.destroy()
                reject(new Error('Download timeout'))
            })
        })
    }
    
    /**
     * Genera el archivo de configuración CustomSkinLoader.json.
     * SIEMPRE se regenera para asegurar que apunte al backend correcto.
     * 
     * IMPORTANTE - Flujo de CustomSkinAPI:
     * 1. CSL solicita: GET {root}/{username}.json
     * 2. Backend responde con JSON SIN extensión .png en skins.default
     * 3. CSL aplica patrón hardcoded: {root}/textures/{filename}.png
     * 4. Backend sirve la skin PNG
     * 
     * @param {string} instancePath
     * @param {string} username
     */
    static _generateConfig(instancePath, username) {
        const cslDir = path.join(instancePath, 'CustomSkinLoader')
        fs.ensureDirSync(cslDir)
        
        /**
         * Configuración de CSL.
         * 
         * loadlist: Lista de servidores de skins en orden de prioridad.
         * - TECNILAND primero: siempre intenta cargar desde nuestro servidor
         * - Mojang segundo: fallback para skins de cuentas Microsoft
         * 
         * Tipos de servidor:
         * - "CustomSkinAPI": API de CustomSkinLoader (usa patrón /textures/ hardcoded)
         * - "MojangAPI": API oficial de Mojang
         * 
         * NOTA: El campo "skin" se OMITE porque CustomSkinAPI lo ignora.
         * CSL siempre usa: root + /textures/ + filename + .png
         */
        const config = {
            version: '14.20',
            enable: true,
            enableSkull: true,
            enableDynamicSkull: true,
            enableTransparentSkin: true,
            forceLoadAllTextures: false,
            enableCape: true,
            threadPoolSize: 4,
            cacheExpiry: 60000,  // 1 minuto para desarrollo (permite ver cambios rápido)
            enableUpdateSkull: true,
            enableLocalProfileCache: false,  // Desactivado para desarrollo
            enableCacheAutoClean: false,
            forceIgnoreHttpsCertificate: false,
            forceDisableCache: true,  // Desactivar cache completamente en desarrollo
            loadlist: [
                {
                    name: 'TECNILAND',
                    type: 'CustomSkinAPI',
                    root: TecnilandAuthConfig.BASE_URL + '/',
                    userAgent: 'TECNILAND-Launcher/1.0'
                },
                {
                    name: 'Mojang',
                    type: 'MojangAPI',
                    apiRoot: 'https://api.mojang.com/',
                    sessionRoot: 'https://sessionserver.mojang.com/'
                }
            ]
        }
        
        const configPath = path.join(cslDir, 'CustomSkinLoader.json')
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
        
        logger.info(`[CSL] Configuration file updated at ${configPath}`)
        logger.debug(`[CSL] Backend URL: ${TecnilandAuthConfig.BASE_URL}/`)
    }
    
    /**
     * Verifica si CSL está instalado en una instancia.
     * 
     * @param {string} instancePath
     * @returns {boolean}
     */
    static isInstalled(instancePath) {
        const modsPath = path.join(instancePath, 'mods')
        
        if (!fs.existsSync(modsPath)) {
            return false
        }
        
        try {
            const files = fs.readdirSync(modsPath)
            return files.some(f => f.includes('CustomSkinLoader') && f.endsWith('.jar'))
        } catch {
            return false
        }
    }
    
    /**
     * Desinstala CSL de una instancia.
     * 
     * @param {string} instancePath
     * @returns {boolean}
     */
    static uninstall(instancePath) {
        const modsPath = path.join(instancePath, 'mods')
        const cslDir = path.join(instancePath, 'CustomSkinLoader')
        
        let removed = false
        
        try {
            // Eliminar JARs
            if (fs.existsSync(modsPath)) {
                const files = fs.readdirSync(modsPath)
                for (const file of files) {
                    if (file.includes('CustomSkinLoader') && file.endsWith('.jar')) {
                        fs.unlinkSync(path.join(modsPath, file))
                        logger.info(`[CSL] Removed: ${file}`)
                        removed = true
                    }
                }
            }
            
            // Eliminar carpeta de configuración
            if (fs.existsSync(cslDir)) {
                fs.removeSync(cslDir)
                logger.info('[CSL] Removed configuration folder')
                removed = true
            }
            
            return removed
        } catch (error) {
            logger.error(`[CSL] Uninstall failed: ${error.message}`)
            return false
        }
    }
    
    /**
     * Limpia el cache de CustomSkinLoader.
     * Útil cuando el usuario sube una nueva skin y quiere forzar la actualización
     * sin esperar a que expire el cache.
     * 
     * @param {string} instancePath - Ruta de la instancia (.minecraft)
     * @returns {{success: boolean, reason?: string}}
     */
    static clearCache(instancePath) {
        const cacheDir = path.join(instancePath, 'CustomSkinLoader', 'caches')
        
        try {
            if (fs.existsSync(cacheDir)) {
                fs.removeSync(cacheDir)
                logger.info('[CSL] Cache de skins limpiado')
                return { success: true }
            }
            
            logger.debug('[CSL] Cache directory not found (may not exist yet)')
            return { success: false, reason: 'Cache directory not found' }
        } catch (error) {
            logger.error(`[CSL] Error clearing cache: ${error.message}`)
            return { success: false, reason: error.message }
        }
    }
    
    /**
     * Limpia cache después de subir una skin.
     * Llamar esto después de uploadSkin() exitoso.
     * 
     * @param {string} instancePath - Ruta de la instancia (.minecraft)
     */
    static refreshSkinAfterUpload(instancePath) {
        logger.info('[CSL] Refrescando skin después de upload...')
        
        // Limpiar cache de CSL
        this.clearCache(instancePath)
        
        // Limpiar cache de assets de Minecraft (opcional, para skins descargadas)
        try {
            const assetsCache = path.join(instancePath, 'assets', 'skins')
            if (fs.existsSync(assetsCache)) {
                fs.removeSync(assetsCache)
                logger.debug('[CSL] Assets skins cache cleared')
            }
        } catch (error) {
            logger.debug(`[CSL] Could not clear assets cache: ${error.message}`)
        }
        
        logger.info('[CSL] Skin lista para actualizar en próximo lanzamiento')
    }
    
    /**
     * Obtiene las versiones de MC soportadas por CSL.
     * 
     * @returns {string[]}
     */
    static getSupportedVersions() {
        return Object.keys(CSL_VERSIONS)
    }
    
    /**
     * Verifica la conectividad con el backend de TECNILAND.
     * Prueba el endpoint /health y opcionalmente el endpoint de usuario.
     * 
     * @param {string} [username] - Username para probar endpoint de skin
     * @param {number} [timeout=5000] - Timeout en ms
     * @returns {Promise<{success: boolean, checks: Object}>}
     */
    static async verifyBackendConnectivity(username, timeout = 5000) {
        const checks = {
            healthCheck: false,
            userEndpoint: false,
            texturesEndpoint: false,
            errors: []
        }
        
        const baseUrl = TecnilandAuthConfig.BASE_URL
        
        try {
            // 1. Health check
            logger.debug(`[CSL] Testing backend connectivity: ${baseUrl}/health`)
            const healthResult = await this._httpGet(`${baseUrl}/health`, timeout)
            checks.healthCheck = healthResult.success
            if (!healthResult.success) {
                checks.errors.push(`Health check failed: ${healthResult.error}`)
            }
            
            // 2. User JSON endpoint (si se proporciona username)
            if (username && checks.healthCheck) {
                logger.debug(`[CSL] Testing user endpoint: ${baseUrl}/${username}.json`)
                const userResult = await this._httpGet(`${baseUrl}/${username}.json`, timeout)
                checks.userEndpoint = userResult.success
                
                // Validar respuesta JSON
                if (userResult.success && userResult.data) {
                    try {
                        const userData = JSON.parse(userResult.data)
                        // Verificar que NO tenga .png en la ruta de skin
                        if (userData.skins && userData.skins.default) {
                            if (userData.skins.default.endsWith('.png')) {
                                checks.errors.push('⚠️ Backend returns .png extension in skins.default - this will cause double extension!')
                                logger.warn('[CSL] Backend JSON issue: skins.default should NOT have .png extension')
                            } else {
                                logger.info('[CSL] Backend JSON format is correct (no .png in skins.default)')
                            }
                        }
                    } catch (e) {
                        checks.errors.push(`Invalid JSON response: ${e.message}`)
                    }
                } else if (!userResult.success) {
                    checks.errors.push(`User endpoint failed: ${userResult.error}`)
                }
            }
            
            logger.info(`[CSL] Backend verification: health=${checks.healthCheck}, user=${checks.userEndpoint}`)
            
        } catch (error) {
            checks.errors.push(`Verification error: ${error.message}`)
            logger.error(`[CSL] Backend verification error: ${error.message}`)
        }
        
        return {
            success: checks.healthCheck,
            checks
        }
    }
    
    /**
     * Realiza una petición HTTP GET simple.
     * 
     * @param {string} url
     * @param {number} timeout
     * @returns {Promise<{success: boolean, data?: string, error?: string}>}
     */
    static _httpGet(url, timeout = 5000) {
        return new Promise((resolve) => {
            const urlObj = new URL(url)
            const isHttps = urlObj.protocol === 'https:'
            const client = isHttps ? https : http
            
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: 'GET',
                timeout: timeout,
                headers: {
                    'User-Agent': 'TECNILAND-Launcher/1.0'
                }
            }
            
            const req = client.request(options, (res) => {
                let data = ''
                res.on('data', chunk => data += chunk)
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ success: true, data })
                    } else {
                        resolve({ success: false, error: `HTTP ${res.statusCode}` })
                    }
                })
            })
            
            req.on('error', (err) => {
                resolve({ success: false, error: err.message })
            })
            
            req.on('timeout', () => {
                req.destroy()
                resolve({ success: false, error: 'Connection timeout' })
            })
            
            req.end()
        })
    }
    
    /**
     * Genera un reporte de diagnóstico completo.
     * 
     * @param {string} instancePath
     * @param {string} username
     * @returns {Promise<Object>}
     */
    static async generateDiagnosticReport(instancePath, username) {
        const report = {
            timestamp: new Date().toISOString(),
            instance: instancePath,
            username: username,
            backendUrl: TecnilandAuthConfig.BASE_URL,
            cslInstalled: false,
            cslConfig: null,
            backendStatus: null,
            issues: [],
            recommendations: []
        }
        
        // 1. Verificar instalación CSL
        report.cslInstalled = this.isInstalled(instancePath)
        if (!report.cslInstalled) {
            report.issues.push('CustomSkinLoader not installed')
            report.recommendations.push('CSL will be installed automatically on next launch')
        }
        
        // 2. Verificar configuración
        const configPath = path.join(instancePath, 'CustomSkinLoader', 'CustomSkinLoader.json')
        if (fs.existsSync(configPath)) {
            try {
                report.cslConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
                
                // Verificar que TECNILAND esté configurado
                const tecnilandEntry = report.cslConfig.loadlist?.find(l => l.name === 'TECNILAND')
                if (!tecnilandEntry) {
                    report.issues.push('TECNILAND not found in CSL loadlist')
                    report.recommendations.push('Configuration will be regenerated on next launch')
                } else {
                    // Verificar tipo correcto
                    if (tecnilandEntry.type !== 'CustomSkinAPI') {
                        report.issues.push(`Wrong API type: ${tecnilandEntry.type} (should be CustomSkinAPI)`)
                    }
                    // Verificar URL termina en /
                    if (!tecnilandEntry.root?.endsWith('/')) {
                        report.issues.push('Backend URL should end with /')
                    }
                }
            } catch (e) {
                report.issues.push(`Invalid CSL config: ${e.message}`)
            }
        }
        
        // 3. Verificar backend
        const backendVerification = await this.verifyBackendConnectivity(username)
        report.backendStatus = backendVerification
        
        if (!backendVerification.success) {
            report.issues.push('Backend is not reachable')
            report.recommendations.push('Ensure TECNILAND auth server is running')
        }
        
        return report
    }
}

module.exports = CustomSkinLoaderManager
