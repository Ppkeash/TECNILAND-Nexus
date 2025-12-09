# 🎮 DISEÑO DEL SISTEMA MULTI-LOADER - TECNILAND NEXUS

## 📋 VISIÓN GENERAL

Implementar un sistema dual que permita:

1. **EDITAR INSTALACIÓN** - Crear instalaciones personalizadas con cualquier versión/loader
2. **TECNILAND** - Modpacks preconfigurados listos para jugar

### Compatibilidad
- ✅ Mantener sistema actual de servidores intacto
- ✅ Reutilizar ProcessBuilder y sistema de descarga
- ✅ Extender ConfigManager para nuevos metadatos

---

## 🏗️ ARQUITECTURA PROPUESTA

### 1. MODELO DE DATOS

#### 1.1. Nueva estructura en distribution.json

```json
{
  "version": "1.0.0",
  "discord": {...},
  "rss": "...",
  
  "servers": [
    // Sistema actual - MANTENER INTACTO
    {
      "id": "tecniland-1.20.1",
      "name": "TECNILAND OG",
      "minecraftVersion": "1.20.1",
      "modules": [...]
    }
  ],
  
  "installations": [
    // Sistema nuevo - INSTALACIONES PERSONALIZADAS
    {
      "id": "install-vanilla-1.20.1",
      "name": "Minecraft 1.20.1",
      "type": "custom",
      "icon": "default",
      "loader": {
        "type": "vanilla",
        "minecraftVersion": "1.20.1"
      },
      "lastPlayed": null,
      "playtime": 0
    },
    {
      "id": "install-forge-1.19.4",
      "name": "Forge 1.19.4",
      "type": "custom",
      "icon": "forge",
      "loader": {
        "type": "forge",
        "minecraftVersion": "1.19.4",
        "loaderVersion": "45.0.64"
      },
      "modules": [...],  // Mods opcionales
      "lastPlayed": "2025-12-07T15:30:00Z",
      "playtime": 7200
    }
  ],
  
  "modpacks": [
    // Sistema nuevo - MODPACKS TECNILAND
    {
      "id": "modpack-tecniland-survival",
      "name": "TECNILAND Survival",
      "description": "Modpack de supervivencia con Create, Farmer's Delight y más",
      "type": "modpack",
      "icon": "https://...",
      "category": "survival",
      "loader": {
        "type": "forge",
        "minecraftVersion": "1.20.1",
        "loaderVersion": "47.2.0"
      },
      "modules": [...],  // Mods obligatorios del modpack
      "lastPlayed": null,
      "playtime": 0,
      "serverAddress": "survival.tecniland.com:25565"  // Opcional
    }
  ]
}
```

#### 1.2. Tipos de Loader

```javascript
const LoaderType = {
    VANILLA: 'vanilla',
    FORGE: 'forge',
    FABRIC: 'fabric',
    QUILT: 'quilt',
    NEOFORGE: 'neoforge'
}
```

#### 1.3. Estructura de Installation

```typescript
interface Installation {
    // Identificación
    id: string                      // "install-xyz"
    name: string                    // Nombre editable por usuario
    type: 'custom' | 'modpack'      // Tipo de instalación
    icon: string                    // URL o nombre predefinido
    
    // Loader
    loader: {
        type: LoaderType
        minecraftVersion: string    // "1.20.1"
        loaderVersion?: string      // "47.2.0" (Forge/Fabric/etc)
    }
    
    // Contenido (opcional para custom, obligatorio para modpack)
    modules?: Module[]
    
    // Metadata
    lastPlayed: string | null       // ISO timestamp
    playtime: number                // Segundos totales
    created: string                 // ISO timestamp
    
    // Configuración (opcional)
    javaOptions?: {...}
    serverAddress?: string          // Para modpacks con servidor oficial
    category?: string               // "survival", "tech", "magic", etc.
}
```

---

## 2. SISTEMA DE GESTIÓN DE VERSIONES

### 2.1. API de Mojang (Vanilla)

**Endpoint**: `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json`

**Respuesta**:
```json
{
  "latest": {
    "release": "1.20.4",
    "snapshot": "24w10a"
  },
  "versions": [
    {
      "id": "1.20.4",
      "type": "release",
      "url": "https://piston-meta.mojang.com/v1/packages/.../1.20.4.json",
      "time": "2024-02-15T10:00:00+00:00",
      "releaseTime": "2024-02-15T10:00:00+00:00"
    },
    // ...más versiones
  ]
}
```

### 2.2. API de Forge

**Endpoint**: `https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json`

**Estructura**:
```json
{
  "1.20.1": [
    "47.2.0",
    "47.1.0",
    // ...más versiones
  ],
  "1.19.4": [
    "45.1.0",
    "45.0.64",
    // ...
  ]
}
```

### 2.3. API de Fabric

**Endpoint versiones**: `https://meta.fabricmc.net/v2/versions/game`
**Endpoint loaders**: `https://meta.fabricmc.net/v2/versions/loader/{minecraftVersion}`

### 2.4. API de Quilt

**Endpoint**: `https://meta.quiltmc.org/v3/versions/loader`

### 2.5. API de NeoForge

**Endpoint**: Similar a Forge, basado en Maven

---

## 3. FLUJO DE UI - EDITAR INSTALACIÓN

### 3.1. Mockup Visual

```
┌──────────────────────────────────────────────────┐
│  EDITAR INSTALACIÓN                              │
├──────────────────────────────────────────────────┤
│                                                  │
│  Nombre: [Minecraft 1.20.1            ]         │
│                                                  │
│  Mod Loader:  ┌──────────┬─────────┬──────┐    │
│               │ Vanilla ◉│ Forge  │Fabric│    │
│               └──────────┴─────────┴──────┘    │
│               ┌──────────┬─────────┐            │
│               │ Quilt   │NeoForge│            │
│               └──────────┴─────────┘            │
│                                                  │
│  Versión de Minecraft:                          │
│    [1.20.1 ▼]                                   │
│    ┌────────────────────────────────┐           │
│    │ 1.20.4 (Última)                │           │
│    │ 1.20.3                         │           │
│    │ ✓ 1.20.1                       │           │
│    │ 1.19.4                         │           │
│    │ ...                            │           │
│    └────────────────────────────────┘           │
│                                                  │
│  Versión de Forge: (si aplica)                  │
│    [47.2.0 (Recomendado) ▼]                    │
│    ┌────────────────────────────────┐           │
│    │ ✓ 47.2.0 (Recomendado)         │           │
│    │ 47.1.0                         │           │
│    │ 47.0.35                        │           │
│    └────────────────────────────────┘           │
│                                                  │
│  [🎮 Crear y Jugar]  [❌ Cancelar]              │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 3.2. Componentes UI Nuevos

**Archivos a crear**:
- `app/installation-editor.ejs` - UI del editor
- `app/assets/js/scripts/installation-editor.js` - Lógica del editor
- `app/assets/js/versionapi.js` - APIs para obtener versiones

---

## 4. FLUJO DE UI - MODPACKS TECNILAND

### 4.1. Mockup Visual

```
┌──────────────────────────────────────────────────────┐
│  MODPACKS TECNILAND                                  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌────────────────┐  ┌────────────────┐            │
│  │ [IMG]          │  │ [IMG]          │            │
│  │ TECNILAND      │  │ SkyFactory     │            │
│  │ Survival       │  │ Modern         │            │
│  │                │  │                │            │
│  │ Forge 1.20.1   │  │ Forge 1.19.2   │            │
│  │ ⏱ 12h jugadas  │  │ ⏱ 5h jugadas   │            │
│  │ [▶ JUGAR]      │  │ [▶ JUGAR]      │            │
│  └────────────────┘  └────────────────┘            │
│                                                      │
│  ┌────────────────┐  ┌────────────────┐            │
│  │ [IMG]          │  │ [IMG]          │            │
│  │ Create         │  │ All The Mods 9 │            │
│  │ Mecánico       │  │                │            │
│  │                │  │                │            │
│  │ Forge 1.20.1   │  │ Forge 1.20.1   │            │
│  │ ⏱ No jugado    │  │ ⏱ No jugado    │            │
│  │ [▶ JUGAR]      │  │ [▶ JUGAR]      │            │
│  └────────────────┘  └────────────────┘            │
│                                                      │
│  [❌ Cerrar]                                         │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 4.2. Selector Principal Actualizado

```
Botón actual: [• Demo (Minecraft 1.20)]  [▼]

Nuevo sistema:
┌────────────────────────────────────┐
│ INSTALACIONES                      │
├────────────────────────────────────┤
│ Minecraft 1.20.1 (Vanilla)         │
│ Forge 1.19.4 + Mods                │
│ Fabric 1.20.1 Testing              │
│                                    │
│ ── MODPACKS TECNILAND ──           │
│ TECNILAND Survival ⭐               │
│ SkyFactory Modern                  │
│ Create Mecánico                    │
│                                    │
│ [➕ Nueva Instalación]              │
│ [📦 Explorar Modpacks]              │
└────────────────────────────────────┘
```

---

## 5. INTEGRACIÓN CON SISTEMA EXISTENTE

### 5.1. Mapeo Installation → Server

Cada instalación genera un "servidor virtual" compatible con el sistema actual:

```javascript
function installationToServer(installation) {
    return {
        id: installation.id,
        name: installation.name,
        description: `${installation.loader.type} ${installation.loader.minecraftVersion}`,
        icon: installation.icon,
        version: "1.0.0",
        address: installation.serverAddress || "localhost:25565",
        minecraftVersion: installation.loader.minecraftVersion,
        discord: null,
        mainServer: false,
        autoconnect: installation.serverAddress != null,
        modules: generateModulesForLoader(installation.loader, installation.modules)
    }
}
```

### 5.2. Generación de Módulos por Loader

```javascript
function generateModulesForLoader(loaderConfig, additionalMods = []) {
    const modules = []
    
    switch(loaderConfig.type) {
        case 'forge':
            // Generar módulo de Forge
            modules.push({
                id: `net.minecraftforge:forge:${loaderConfig.minecraftVersion}-${loaderConfig.loaderVersion}`,
                name: "Minecraft Forge",
                type: "ForgeHosted",
                required: { value: true, def: true },
                artifact: {
                    size: 0,  // Se calcula al descargar
                    url: `https://files.minecraftforge.net/maven/net/minecraftforge/forge/${loaderConfig.minecraftVersion}-${loaderConfig.loaderVersion}/forge-${loaderConfig.minecraftVersion}-${loaderConfig.loaderVersion}-installer.jar`,
                    MD5: ""  // Se valida al descargar
                }
            })
            break
        
        case 'fabric':
            // Similar para Fabric
            break
        
        case 'vanilla':
            // Sin módulos adicionales
            break
    }
    
    // Agregar mods adicionales
    modules.push(...additionalMods)
    
    return modules
}
```

---

## 6. ALMACENAMIENTO Y PERSISTENCIA

### 6.1. Extensión de config.json

```json
{
  "selectedServer": "tecniland-og",
  "selectedInstallation": "install-forge-1.19.4",  // NUEVO
  
  "installations": {  // NUEVO
    "install-forge-1.19.4": {
      "name": "Forge 1.19.4 + Mods",
      "lastPlayed": "2025-12-07T15:30:00Z",
      "playtime": 7200,
      "customIcon": null,
      "javaOptions": {
        "executable": "C:/path/to/java.exe",
        "ram": "4G"
      }
    }
  },
  
  "authenticationDatabase": {...},
  "modConfigurations": [...],
  "javaConfig": {...}
}
```

### 6.2. Nuevas funciones en ConfigManager

```javascript
// Obtener/establecer instalación seleccionada
ConfigManager.getSelectedInstallation()
ConfigManager.setSelectedInstallation(installationId)

// Gestión de instalaciones locales
ConfigManager.getInstallations()
ConfigManager.addInstallation(installation)
ConfigManager.updateInstallation(installationId, updates)
ConfigManager.deleteInstallation(installationId)

// Metadata
ConfigManager.updatePlaytime(installationId, seconds)
ConfigManager.setLastPlayed(installationId, timestamp)
```

---

## 7. PLAN DE IMPLEMENTACIÓN

### Fase 1: Backend (Modelo de Datos)
1. ✅ Crear `versionapi.js` con APIs de Mojang/Forge/Fabric/etc
2. ✅ Extender `configmanager.js` con funciones de instalaciones
3. ✅ Crear `installationmanager.js` para lógica de instalaciones

### Fase 2: UI (Editor de Instalaciones)
1. ✅ Crear `installation-editor.ejs` 
2. ✅ Crear `installation-editor.js` con lógica del editor
3. ✅ Integrar con overlay existente

### Fase 3: UI (Selector Principal)
1. ✅ Extender `overlay.ejs` con nueva sección de instalaciones
2. ✅ Modificar `overlay.js` para manejar instalaciones + modpacks
3. ✅ Actualizar `landing.js` para usar instalaciones

### Fase 4: Integración
1. ✅ Mapear instalaciones → servidores virtuales
2. ✅ Asegurar compatibilidad con ProcessBuilder
3. ✅ Testing exhaustivo

### Fase 5: Traducciones
1. ✅ Agregar strings en `es_ES.toml`
2. ✅ Agregar strings en `en_US.toml`

---

## 8. CASOS DE USO

### Caso 1: Crear instalación Vanilla
```
Usuario → Click "Nueva Instalación"
       → Ingresa nombre: "Minecraft Vanilla 1.20.1"
       → Selecciona loader: Vanilla
       → Selecciona versión: 1.20.1
       → Click "Crear y Jugar"
       → Sistema genera servidor virtual
       → ProcessBuilder lanza Minecraft
```

### Caso 2: Crear instalación Forge
```
Usuario → Click "Nueva Instalación"
       → Ingresa nombre: "Forge + Create Mod"
       → Selecciona loader: Forge
       → Selecciona versión MC: 1.20.1
       → Sistema carga versiones de Forge para 1.20.1
       → Selecciona versión Forge: 47.2.0
       → Click "Crear y Jugar"
       → Sistema descarga Forge + dependencias
       → ProcessBuilder lanza con Forge
```

### Caso 3: Jugar modpack TECNILAND
```
Usuario → Click selector junto a JUGAR
       → Scroll a sección "MODPACKS TECNILAND"
       → Click "TECNILAND Survival"
       → Click "Seleccionar"
       → Sistema carga modpack preconfigurado
       → Click JUGAR
       → ProcessBuilder lanza con todos los mods
```

---

## 9. VENTAJAS DEL DISEÑO

✅ **Compatibilidad**: Sistema actual sigue funcionando
✅ **Extensibilidad**: Fácil agregar nuevos loaders (LiteLoader, etc)
✅ **Flexibilidad**: Usuarios pueden crear instalaciones custom
✅ **Organización**: Modpacks TECNILAND separados y destacados
✅ **Metadata**: Tracking de tiempo de juego y última sesión
✅ **Reutilización**: ProcessBuilder no necesita cambios mayores

---

## 10. PRÓXIMOS PASOS

1. ¿Apruebas este diseño?
2. Comenzar con Fase 1 (Backend - versionapi.js)
3. Continuar secuencialmente hasta completar todas las fases

