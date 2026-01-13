# 🔄 Guía Completa: Sistema de Auto-Actualizaciones TECNILAND Nexus

**Fecha:** 12 de Enero, 2026  
**Versión del Launcher:** 1.0.0  
**Autor:** Ppkeash

---

## 📋 Tabla de Contenidos

1. [¿Cómo Funciona?](#cómo-funciona)
2. [¿Por Qué No Aparece el Changelog?](#por-qué-no-aparece-el-changelog)
3. [Proceso Completo: Publicar una Actualización](#proceso-completo-publicar-una-actualización)
4. [Cómo Funcionan las Actualizaciones para tus Testers](#cómo-funcionan-las-actualizaciones-para-tus-testers)
5. [Botón "Buscar Actualizaciones"](#botón-buscar-actualizaciones)
6. [Solución de Problemas](#solución-de-problemas)

---

## 🔍 ¿Cómo Funciona?

El sistema de auto-actualizaciones de TECNILAND Nexus usa **electron-updater** + **GitHub Releases**:

```
┌──────────────────────────────────────────────────────────────┐
│  FLUJO DE ACTUALIZACIONES                                     │
└──────────────────────────────────────────────────────────────┘

1. Launcher se inicia
   ↓
2. electron-updater verifica GitHub cada 30 min
   ↓
3. Compara versión local (package.json) vs GitHub Release
   ↓
4. Si hay versión nueva:
   - Descarga automáticamente
   - Notifica al usuario
   - Botón "Instalar Ahora"
   ↓
5. Usuario instala → Launcher se reinicia con nueva versión
```

### 📦 Componentes Clave

| Archivo | Propósito |
|---------|-----------|
| `electron-builder.yml` | Configuración de publicación (GitHub) |
| `dev-app-update.yml` | URL del repo para auto-updates en dev |
| `package.json` | **Versión actual** del launcher |
| `index.js` | Lógica del auto-updater (IPC handlers) |
| `uicore.js` | Listeners de eventos de actualización |
| `settings.js` | UI de la pestaña "Actualizaciones" |

---

## ❌ ¿Por Qué No Aparece el Changelog?

### Causa Raíz
**No hay releases en tu repositorio GitHub.**

Cuando abres la sección "Acerca de", el launcher hace esto:

```javascript
// settings.js - Línea ~2818
function populateReleaseNotes(){
    $.ajax({
        url: 'https://github.com/Ppkeash/TECNILAND-Nexus/releases.atom',
        success: (data) => {
            // Busca un release que coincida con la versión actual
            const version = 'v' + remote.app.getVersion() // 'v1.0.0'
            // Si no encuentra ningún release con ese tag → "No Release Notes"
        }
    })
}
```

### ✅ Solución
Necesitas crear tu primer GitHub Release:

1. **Ir a:** https://github.com/Ppkeash/TECNILAND-Nexus/releases
2. **Click:** "Create a new release"
3. **Configurar:**
   - **Tag:** `v1.0.0` (debe coincidir con `package.json`)
   - **Title:** "TECNILAND Nexus v1.0.0 - Primera Release Pública"
   - **Description:** (Tu changelog aquí)

```markdown
## 🎉 Primera Release Pública

### ✨ Características Principales
- ✅ Sistema de cuentas offline con skins
- ✅ Soporte multi-loader (Forge, Fabric, Quilt, NeoForge)
- ✅ Gestor de instalaciones personalizadas
- ✅ Sistema de modpacks TECNILAND
- ✅ Visor de logs en vivo
- ✅ Auto-actualizaciones

### 🎨 UI/UX
- Diseño moderno con animaciones fluidas
- Hero Header dinámico
- Sistema de iconos SVG personalizado

### 📝 Notas
- **Skins:** Solo visible en preview del launcher (in-game requiere Yggdrasil)
- **Discord RPC:** Funcional en modo desarrollo
```

---

## 📤 Proceso Completo: Publicar una Actualización

### Paso 1: Hacer Cambios en el Código

```powershell
# Ejemplo: Añadir un nuevo feature
git add .
git commit -m "feat: añadido sistema de notificaciones"
git push
```

### Paso 2: Actualizar Versión en `package.json`

```json
{
  "name": "tecnilandnexus",
  "version": "1.0.1",  // ← CAMBIAR AQUÍ (era 1.0.0)
  "productName": "TECNILAND Nexus",
  ...
}
```

**Reglas de Versionado (Semantic Versioning):**

| Cambio | Versión | Ejemplo |
|--------|---------|---------|
| **Bug fix** | Patch | `1.0.0` → `1.0.1` |
| **Nueva feature** | Minor | `1.0.0` → `1.1.0` |
| **Breaking change** | Major | `1.0.0` → `2.0.0` |
| **Pre-release** | - | `1.0.0-beta.1` |

### Paso 3: Compilar el Launcher

```powershell
# Compilar para distribución
npm run dist
```

Esto genera:
```
dist/
├── TECNILAND Nexus Setup 1.0.1.exe      # Windows
├── TECNILAND Nexus Setup 1.0.1.exe.blockmap
├── latest.yml                            # Metadata para auto-updater
└── ...
```

### Paso 4: Crear GitHub Release

1. **Ir a:** https://github.com/Ppkeash/TECNILAND-Nexus/releases/new

2. **Configuración:**
   ```
   Tag: v1.0.1
   Target: main
   Title: TECNILAND Nexus v1.0.1 - [Título Descriptivo]
   ```

3. **Escribir Changelog:**
   ```markdown
   ## 🐛 Bug Fixes
   - Corregido crash al cargar skins grandes
   - Arreglado problema de memoria en logs

   ## 🎨 Mejoras
   - Optimizado tiempo de inicio del launcher
   - Mejorado feedback visual en botón "Buscar Actualizaciones"

   ## 📝 Notas
   - Esta actualización se descargará automáticamente
   ```

4. **Subir Archivos (CRÍTICO):**
   - Arrastra `dist/TECNILAND Nexus Setup 1.0.1.exe`
   - Arrastra `dist/latest.yml`
   - Arrastra `dist/*.blockmap` (importante para updates diferenciales)

5. **Publicar:**
   - Si es estable: **"Publish release"**
   - Si es beta: ✅ **"Set as a pre-release"** → "Publish"

### Paso 5: Commit y Push del `package.json`

```powershell
git add package.json
git commit -m "chore: bump version to 1.0.1"
git push
```

---

## 👥 Cómo Funcionan las Actualizaciones para tus Testers

### Escenario Real

**Tester tiene:** TECNILAND Nexus v1.0.0  
**Tú publicas:** GitHub Release v1.0.1

### ¿Qué Pasa?

#### **Opción 1: Verificación Automática** (cada 30 min)

```
[Tester abre el launcher]
  ↓
[30 segundos después]
  ↓
[electron-updater detecta v1.0.1 en GitHub]
  ↓
[Descarga automática en segundo plano]
  ↓
[Notificación: "Actualización lista para instalar"]
  ↓
[Tester click "Instalar Ahora"]
  ↓
[Launcher se reinicia con v1.0.1]
```

**Visual:**
- Sello del launcher (esquina) muestra un **indicador verde**
- Al hacer click → "Actualización disponible: v1.0.1 - ¿Instalar ahora?"

#### **Opción 2: Verificación Manual**

```
[Tester abre Configuración → Actualizaciones]
  ↓
[Click en "Buscar Actualizaciones"]
  ↓
[Botón cambia a "Buscando Actualizaciones..."]
  ↓
Si hay update:
  ↓
  [Muestra changelog + botón "Descargar"]
  ↓
  [Descarga + "Instalar Ahora"]

Si NO hay update:
  ↓
  [Muestra "Estás usando la última versión"]
```

### 🔒 Control de Acceso (Beta Testers)

**Problema:** Cualquiera puede descargar desde GitHub Releases públicas.

**Soluciones:**

#### A) **Private Repository** (Recomendado)
```yaml
# electron-builder.yml
publish:
  provider: github
  owner: Ppkeash
  repo: TECNILAND-Nexus
  private: true  # ← Añadir esto
```

- ❌ **Contra:** Requiere GitHub Pro ($4/mes)
- ✅ **Pro:** Control total de acceso

#### B) **Pre-releases + Access Keys** (Gratis)
```javascript
// Fase 1: Implementar sistema de llaves
// Los testers necesitan una llave para activar pre-release updates
```

#### C) **Discord Bot Distribution** (Intermedio)
- Publicas releases en un canal privado de Discord
- Bot notifica + link de descarga
- No es auto-update, pero controlado

---

## 🔘 Botón "Buscar Actualizaciones"

### Problema Actual

Cuando haces click en "Buscar Actualizaciones" y **NO hay updates disponibles**, no hay feedback claro.

### Flujo Completo (con logs)

```javascript
// Usuario click → settings.js
ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
settingsUpdateButtonStatus('Buscando Actualizaciones...', true)

// → index.js (main process)
autoUpdater.checkForUpdates()

// → Eventos de electron-updater
'checking-for-update' → uicore.js
  └─ Botón: "Buscando Actualizaciones..."

'update-not-available' → uicore.js
  └─ Botón: "Buscar Actualizaciones" (vuelve al estado original)
  └─ ❌ NO hay mensaje "Estás actualizado"

'update-available' → uicore.js
  └─ Muestra changelog en la UI
  └─ Botón: "Descargar" / "Descargando..."

'update-downloaded' → uicore.js
  └─ Botón: "Instalar Ahora"
```

### Mejora Implementada

Añadiremos notificación visual cuando estás actualizado:

```javascript
// uicore.js - caso 'update-not-available'
case 'update-not-available':
    loggerAutoUpdater.info('No new update found.')
    settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.checkForUpdatesButton'))
    // NUEVO: Mostrar mensaje temporal
    showUpdateStatusMessage('✅ Estás usando la última versión', 'success')
    break
```

---

## 🛠️ Solución de Problemas

### "No Release Notes" en Acerca de

**Causa:** No hay releases en GitHub o el tag no coincide con `package.json`

**Solución:**
1. Verifica `package.json`: `"version": "1.0.0"`
2. Crea release con tag **exacto**: `v1.0.0` (con 'v')
3. Espera 2-5 minutos para que GitHub propague el feed

### Botón "Buscar Actualizaciones" No Responde

**Causa:** Estás en modo dev (`isDev = true`)

**Solución:**
```javascript
// Verifica en consola del launcher
console.log('isDev:', require('electron-is-dev'))

// Si es true:
// - Compila el launcher: npm run dist
// - Ejecuta el .exe desde dist/
```

### Actualizaciones No se Descargan

**Checklist:**
- [ ] ¿Existe `latest.yml` en el GitHub Release?
- [ ] ¿El `.exe` está subido al Release?
- [ ] ¿El tag del Release coincide con `package.json`?
- [ ] ¿`electron-builder.yml` tiene la sección `publish`?

**Debug:**
```powershell
# Ver logs del auto-updater
# Abre el launcher y ve a DevTools (Ctrl+Shift+I)
# Busca logs con "autoUpdater"
```

### Error: "ERR_UPDATER_INVALID_RELEASE_FEED"

**Causa:** No hay releases con archivos adjuntos válidos

**Solución:**
1. El Release debe tener:
   - `TECNILAND Nexus Setup X.X.X.exe`
   - `latest.yml`
2. El `latest.yml` debe ser generado por `electron-builder` (no crear manualmente)

---

## 📊 Estados del Sistema de Actualizaciones

### Estados Visuales

| Estado | Botón | Icono Sello | Descripción |
|--------|-------|-------------|-------------|
| **Inicial** | "Buscar Actualizaciones" | Normal | Launcher iniciado, sin verificar |
| **Checking** | "Buscando Actualizaciones..." (disabled) | Normal | Consultando GitHub |
| **Up to Date** | "Buscar Actualizaciones" | Normal | ✅ Última versión |
| **Update Available** | "Descargar" | 🟢 Verde | Nueva versión encontrada |
| **Downloading** | "Descargando..." (disabled) | 🟡 Amarillo | Descarga en progreso |
| **Ready** | "Instalar Ahora" | 🔴 Rojo pulsante | Listo para instalar |

---

## 🔐 Seguridad

### Code Signing (Recomendado para Producción)

```yaml
# electron-builder.yml
win:
  certificateFile: path/to/cert.pfx
  certificatePassword: ${CERT_PASSWORD}
```

**Sin code signing:**
- Windows SmartScreen advertirá "Editor desconocido"
- Los usuarios deben hacer click en "Más información" → "Ejecutar de todos modos"

**Con code signing:**
- Instalación sin advertencias
- Mayor confianza del usuario

**Costo:** ~$70-200/año (certificado de Sectigo/DigiCert)

---

## ✅ Checklist Pre-Release

Antes de publicar una actualización a tus testers:

- [ ] Versión actualizada en `package.json`
- [ ] Changelog preparado
- [ ] `npm run dist` exitoso
- [ ] Probado el `.exe` localmente
- [ ] GitHub Release creado con tag correcto
- [ ] Archivos subidos: `.exe`, `latest.yml`, `.blockmap`
- [ ] Esperado 5 min y verificado que el feed funciona
- [ ] Anunciado en Discord a los testers

---

## 📞 Soporte

**Si algo no funciona:**

1. **Revisar logs:**
   - Launcher: `%APPDATA%/tecnilandnexus/logs/`
   - DevTools: `Ctrl+Shift+I` → Console

2. **Buscar en este documento:** Ctrl+F con el error

3. **GitHub Issues:** https://github.com/Ppkeash/TECNILAND-Nexus/issues

---

## 🎯 Próximos Pasos (Post-Beta)

### Fase 1: TECNILAND Account
- Sistema de llaves de acceso integrado
- Pre-releases solo para holders de llaves
- Actualizaciones diferenciadas (beta vs stable)

### Fase 2: Delta Updates
- Actualizaciones diferenciales (solo cambios)
- Reduce uso de ancho de banda
- Actualizaciones más rápidas

### Fase 3: Update Channels
```
- Stable: Para usuarios normales
- Beta: Para testers activos
- Nightly: Para desarrollo (tú)
```

---

**Documento generado el 12 de Enero, 2026**  
**TECNILAND Nexus - Sistema de Actualizaciones v1.0**
