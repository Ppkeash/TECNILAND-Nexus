# Guía de Migración - TECNILAND Nexus

## Cambios de Personalización

El launcher ha sido rebrandeado de "Helios Launcher" a "TECNILAND Nexus". Los siguientes cambios se han implementado:

### 1. Nombre de la Aplicación
- **Antes**: Helios Launcher
- **Ahora**: TECNILAND Nexus
- **Archivos modificados**: 
  - `app/assets/lang/_custom.toml` - Título de la app
  - `package.json` - productName y metadata
  - `electron-builder.yml` - Configuración del instalador

### 2. Directorio de Datos
- **Antes**: `.helioslauncher`
- **Ahora**: `.tecnilandnexus`
- **Ubicación** (Windows): `%APPDATA%\.tecnilandnexus`
- **Ubicación** (macOS): `~/Library/Application Support/.tecnilandnexus`
- **Ubicación** (Linux): `~/.tecnilandnexus`

### 3. Directorio de Configuración de Usuario
- **Antes**: `%APPDATA%\Helios Launcher`
- **Ahora**: `%APPDATA%\TECNILAND Nexus`

### 4. Nombre del Dock (macOS)
- **Antes**: HeliosLauncher
- **Ahora**: TECNILAND Nexus

## Migración de Datos Existentes

Si ya tenías datos en el launcher anterior, puedes migrarlos manualmente:

### Windows

```powershell
# Migrar directorio de datos del juego
Copy-Item "$env:APPDATA\.helioslauncher" "$env:APPDATA\.tecnilandnexus" -Recurse -Force

# Migrar configuración del launcher
Copy-Item "$env:APPDATA\Helios Launcher" "$env:APPDATA\TECNILAND Nexus" -Recurse -Force

# Limpiar datos antiguos (opcional - hacer backup primero)
# Remove-Item "$env:APPDATA\.helioslauncher" -Recurse -Force
# Remove-Item "$env:APPDATA\Helios Launcher" -Recurse -Force
```

### macOS/Linux

```bash
# Migrar directorio de datos del juego
cp -r ~/.helioslauncher ~/.tecnilandnexus

# Migrar configuración del launcher (macOS)
cp -r ~/Library/Application\ Support/Helios\ Launcher ~/Library/Application\ Support/TECNILAND\ Nexus

# Limpiar datos antiguos (opcional - hacer backup primero)
# rm -rf ~/.helioslauncher
# rm -rf ~/Library/Application\ Support/Helios\ Launcher
```

## Archivos Modificados

### Código
- `app/assets/lang/_custom.toml` - Título y enlaces personalizados
- `app/assets/lang/es_ES.toml` - Mensajes de error actualizados
- `app/assets/lang/en_US.toml` - Mensajes de error actualizados
- `app/assets/js/configmanager.js` - Directorio de datos
- `app/assets/js/processbuilder.js` - Nombre del dock en macOS

### Configuración
- `package.json` - Metadata del proyecto (ya modificado previamente)
- `electron-builder.yml` - Configuración del instalador (ya modificado previamente)

## Notas Importantes

1. **Primera Ejecución**: Si es tu primera vez ejecutando TECNILAND Nexus, se creará automáticamente la nueva estructura de directorios.

2. **Cuentas**: Las cuentas de Microsoft, Mojang y Offline se almacenan en el config.json dentro del directorio de configuración del usuario.

3. **Mundos y Capturas**: Los mundos guardados y capturas de pantalla están en `instances/` dentro del directorio de datos del juego.

4. **Configuración de Java**: Las instalaciones de Java descargadas automáticamente están en `runtime/` dentro del directorio de datos.

5. **Mods**: Los mods están en `libraries/`, `mods/`, o dentro de cada instancia de servidor.

## Revertir Cambios

Si necesitas revertir a "Helios Launcher", simplemente cambia los valores en los archivos mencionados arriba de vuelta a sus valores originales.

---

**Basado en**: Helios Launcher por dscalzi (https://github.com/dscalzi/HeliosLauncher)  
**Personalizado para**: TECNILAND Network
