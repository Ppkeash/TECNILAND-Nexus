# 🎮 Discord Rich Presence - Guía de Configuración

## 📋 Descripción

El sistema de Discord Rich Presence permite mostrar en tu perfil de Discord qué estás jugando en TECNILAND Nexus, incluyendo:
- 🎯 Servidor/Modpack actual
- ⏱️ Tiempo de juego
- 🖼️ Imagen del servidor
- 📊 Estado actual (cargando, jugando, etc.)

---

## 🔧 Configuración Inicial

### 1. Crear Aplicación de Discord

1. Ve a [Discord Developer Portal](https://discord.com/developers/applications)
2. Click en "New Application"
3. Nombre: `TECNILAND Nexus` (o el que prefieras)
4. En la pestaña "General Information", copia el **Application ID** (será tu `clientId`)

### 2. Subir Imágenes (Assets)

En la pestaña "Rich Presence" → "Art Assets":

**Imagen Principal (Logo TECNILAND):**
- Nombre: `tecniland-logo`
- Tamaño: 512x512px mínimo
- Formato: PNG con fondo transparente

**Imagen Pequeña (Ícono del Launcher):**
- Nombre: `launcher-icon`
- Tamaño: 512x512px mínimo
- Formato: PNG

**Imágenes de Servidores (una por cada modpack):**
- Nombre: `server-{id}` (ej: `server-tecniland-main`)
- Tamaño: 1024x1024px recomendado
- Formato: PNG o JPG

**Ejemplo de nombres:**
```
tecniland-logo         → Logo principal TECNILAND
launcher-icon          → Ícono del launcher (verde)
server-tecniland-main  → Imagen del servidor principal
server-skyblock        → Imagen del servidor skyblock
server-survival        → Imagen del servidor survival
```

---

## 📝 Configuración en distribution.json

### Configuración Global (nivel raíz)

Agrega esto en el nivel raíz de tu `distribution.json`:

```json
{
  "version": "1.0.0",
  "discord": {
    "clientId": "TU_APPLICATION_ID_AQUI",
    "smallImageKey": "launcher-icon",
    "smallImageText": "TECNILAND Nexus"
  },
  "servers": [...]
}
```

### Configuración por Servidor

Agrega esto a cada servidor/modpack en el array `servers`:

```json
{
  "id": "tecniland-main",
  "name": "TECNILAND Main Server",
  "discord": {
    "shortId": "Main",
    "largeImageKey": "server-tecniland-main",
    "largeImageText": "TECNILAND Main Server"
  }
}
```

**Explicación de campos:**
- `shortId`: Identificador corto (aparece en "Estado: Servidor Main")
- `largeImageKey`: Nombre del asset subido a Discord (imagen grande)
- `largeImageText`: Texto al pasar mouse sobre la imagen grande

---

## 🎨 Ejemplo Completo

```json
{
  "version": "1.0.0",
  "discord": {
    "clientId": "123456789012345678",
    "smallImageKey": "launcher-icon",
    "smallImageText": "TECNILAND Nexus v2.0"
  },
  "servers": [
    {
      "id": "tecniland-main",
      "name": "TECNILAND Main Server",
      "description": "Servidor principal con mods custom",
      "version": "1.0.0",
      "minecraftVersion": "1.20.1",
      "discord": {
        "shortId": "Main",
        "largeImageKey": "server-tecniland-main",
        "largeImageText": "TECNILAND Main Server"
      },
      "modules": [...]
    },
    {
      "id": "tecniland-skyblock",
      "name": "TECNILAND Skyblock",
      "description": "Skyblock con mods económicos",
      "version": "1.0.0",
      "minecraftVersion": "1.20.1",
      "discord": {
        "shortId": "Skyblock",
        "largeImageKey": "server-skyblock",
        "largeImageText": "TECNILAND Skyblock"
      },
      "modules": [...]
    }
  ]
}
```

---

## 🚀 Estados del Rich Presence

El launcher mostrará diferentes estados automáticamente:

| Estado | Cuándo | Texto Mostrado |
|--------|--------|----------------|
| **Esperando** | Al abrir launcher | "Esperando al cliente..." |
| **Cargando** | Validando archivos | "Cargando juego..." |
| **Jugando** | En partida | "Jugando en TECNILAND Main" |

---

## 🎯 Vista Previa en Discord

Así se verá en el perfil de Discord:

```
🎮 Jugando a TECNILAND Nexus
━━━━━━━━━━━━━━━━━━━━━━━━━
📜 Detalles: Jugando en TECNILAND Main
🏷️ Estado: Servidor: Main
⏱️ Tiempo: 01:23:45
🖼️ [Imagen Grande: Logo del servidor]
🖼️ [Imagen Pequeña: Logo TECNILAND Nexus]
```

---

## 🔍 Verificación

### Comprobar que funciona:

1. **Configura el distribution.json** con los datos de Discord
2. **Sube el distribution.json** a Cloudflare R2
3. **Abre el launcher** y selecciona un servidor
4. **Presiona "Jugar"**
5. **Abre Discord** y mira tu perfil

Si todo está correcto:
- ✅ Verás "Jugando a TECNILAND Nexus"
- ✅ Aparecerá la imagen del servidor
- ✅ Se mostrará el tiempo de juego

### Problemas comunes:

**"No aparece nada en Discord"**
- ✅ Verifica que Discord esté abierto
- ✅ Confirma que el `clientId` sea correcto
- ✅ Revisa que el nombre de las imágenes coincida exactamente

**"Aparece pero sin imagen"**
- ✅ Verifica que los assets estén aprobados en Discord Developer Portal
- ✅ Confirma que `largeImageKey` coincida con el nombre del asset
- ✅ Espera ~5 minutos (Discord cachea las imágenes)

**"Dice 'Esperando al cliente...' siempre"**
- ✅ El servidor no tiene configuración de Discord en distribution.json
- ✅ Agrega el objeto `discord` al servidor específico

---

## 🛠️ Personalización Avanzada

### Cambiar textos dinámicamente

Edita `app/assets/lang/es_ES.toml`:

```toml
[js.discord]
waiting = "Esperando al Cliente.."
state = "Servidor: {shortId}"

[js.landing.discord]
loading = "Cargando juego..."
joining = "Conectando al servidor..."
joined = "Explorando el mundo!"
```

### Agregar más estados personalizados

En `landing.js`, puedes agregar más llamadas a `DiscordWrapper.updateDetails()`:

```javascript
// Ejemplo: Al abrir el inventario de mods
DiscordWrapper.updateDetails('Configurando mods...')

// Ejemplo: Al finalizar descarga
DiscordWrapper.updateDetails('Listo para jugar!')
```

---

## 📚 Recursos Adicionales

- [Discord Developer Portal](https://discord.com/developers/applications)
- [Discord Rich Presence Docs](https://discord.com/developers/docs/rich-presence/how-to)
- [Helios Distribution Docs](https://github.com/dscalzi/HeliosLauncher/blob/master/docs/distro.md)

---

## ✅ Checklist de Implementación

- [ ] Crear aplicación en Discord Developer Portal
- [ ] Copiar Application ID (clientId)
- [ ] Subir assets (logo TECNILAND + imágenes de servidores)
- [ ] Esperar aprobación de assets (~5 mins)
- [ ] Configurar `discord` global en distribution.json
- [ ] Configurar `discord` por cada servidor
- [ ] Subir distribution.json actualizado a R2
- [ ] Probar en el launcher
- [ ] Verificar en perfil de Discord

---

**Última actualización:** 10 de Enero 2026  
**Estado:** ✅ Sistema completamente funcional, solo requiere configuración
