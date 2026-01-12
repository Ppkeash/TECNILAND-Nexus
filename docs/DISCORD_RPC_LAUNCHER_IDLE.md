# Discord Rich Presence - Launcher Idle State

## ✅ Implementación Simplificada

**Decisión de diseño:**
- El launcher SOLO maneja el estado **"idle"** (launcher abierto, no jugando)
- La presencia **in-game** se delega a mods como **CraftPresence** u otros
- El launcher NO intenta controlar estados dentro del juego

---

## 🔧 Archivos Involucrados

### 1. **discordwrapper.js** - Wrapper RPC simplificado

**Funciones exportadas:**
- `initRPC(genSettings, servSettings, initialDetails)` - Inicializa Discord RPC
- `shutdownRPC()` - Cierra conexión limpiamente
- `isActive()` - Verifica si RPC está activo

**Características:**
- Previene múltiples inicializaciones sin shutdown previo
- Logs claros: `[DISCORD] init launcher idle` y `[DISCORD] shutdown RPC`
- Estado interno coherente con `isInitialized`
- Limpieza completa en caso de error de conexión

---

### 2. **uibinder.js** - Inicialización en showMainUI

**Ubicación:** Función `initLauncherDiscordRPC(data)`, llamada en `showMainUI()`

**Qué hace:**
- Inicializa Discord RPC cuando el launcher termina de cargar
- Usa configuración del launcher (NO del servidor):
  - `largeImageKey: 'launcher-icon'`
  - `shortId: 'Launcher'`
  - `largeImageText: 'TECNILAND Nexus'`
- Muestra estado: "En el menú principal" (`discord.waiting`)

**Código:**
```javascript
const launcherDiscordSettings = {
    shortId: 'Launcher',
    largeImageKey: 'launcher-icon',
    largeImageText: 'TECNILAND Nexus'
}

DiscordWrapper.initRPC(
    data.rawDistribution.discord,
    launcherDiscordSettings,
    Lang.queryJS('discord.waiting') // "En el menú principal"
)
```

---

### 3. **landing.js** - Sin lógica de Discord in-game

**Lo que se eliminó:**
- Inicialización de Discord al lanzar el juego
- Actualización de estados (loading, joined, joining)
- Re-inicialización al cerrar Minecraft
- Variable `hasRPC` y sincronización con `window.hasDiscordRPC`

**Lo que queda:**
- El import de DiscordWrapper (por si se necesita en el futuro)
- Lógica de lanzamiento del juego intacta (sin modificaciones de Discord)

---

## 🎯 Flujo Simplificado

### Usuario abre TECNILAND NEXUS
```
1. showMainUI(data) se ejecuta en uibinder.js
2. initLauncherDiscordRPC(data) llamado
3. DiscordWrapper.initRPC() con config del launcher
4. Discord muestra:
   - Details: "En el menú principal"
   - State: "Estado: Launcher"
   - Imagen grande: launcher-icon
   - Imagen pequeña: definida en DistroIndex.discord.smallImageKey
```

### Usuario lanza Minecraft
```
1. Usuario clickea "Jugar"
2. Minecraft se lanza (launcher NO modifica Discord)
3. Si el modpack tiene CraftPresence u otro mod de RPC:
   - El mod tomará control de la presencia
4. Si no tiene mod de RPC:
   - Discord seguirá mostrando estado del launcher
```

### Minecraft se cierra
```
1. proc.on('close') detecta cierre
2. UI del launcher se resetea
3. Discord:
   - Si había mod de RPC: el mod ya liberó la conexión
   - La presencia del launcher sigue activa (nunca se apagó)
```

### Usuario cierra el launcher
```
1. Electron cierra la aplicación
2. DiscordWrapper.shutdownRPC() se llama en cleanup
3. Conexión IPC se cierra limpiamente
4. Presencia desaparece de Discord
```

---

## 📋 Configuración Requerida

### distribution.json (nivel raíz)
```json
{
    "discord": {
        "clientId": "1234567890123456789",
        "smallImageKey": "tecniland-logo",
        "smallImageText": "TECNILAND Nexus"
    }
}
```

### Discord Developer Portal
Assets necesarios:
- `launcher-icon` - Imagen grande para el estado idle del launcher
- `tecniland-logo` (o tu smallImageKey) - Imagen pequeña

---

## ✅ Resultado Final

| Estado | Presencia Discord |
|--------|-------------------|
| Launcher abierto | ✅ "En el menú principal" con launcher-icon |
| Jugando (con mod RPC) | ✅ Controlado por CraftPresence u otro mod |
| Jugando (sin mod RPC) | ✅ Mantiene estado del launcher |
| Launcher cerrado | ✅ Sin presencia (limpieza correcta) |

---

## 🐛 Troubleshooting

### Discord no muestra presencia al abrir launcher
- Verifica que Discord desktop esté abierto
- Revisa consola: busca `[DISCORD] init launcher idle`
- Confirma que `distribution.json` tenga `discord.clientId` válido

### Error "Discord RPC already initialized"
- Normal si la función se llama múltiples veces sin shutdown
- El wrapper lo maneja automáticamente (no re-inicializa)

### Presencia no cambia cuando juego
- Esperado: el launcher NO controla presencia in-game
- Instala CraftPresence o similar en el modpack si quieres presencia in-game
