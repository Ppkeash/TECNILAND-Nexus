# 📤 Instrucciones: Crear GitHub Release v1.0.0

**Fecha:** 12 de Enero, 2026  
**Acción:** Primera release pública de TECNILAND Nexus

---

## ✅ Pre-requisitos (Ya Completados)

- [x] Versión 1.0.0 en `package.json`
- [x] Código commiteado y pusheado a GitHub
- [x] Launcher compilado con `npm run dist`
- [x] Archivos generados en carpeta `dist/`

---

## 📦 Archivos Disponibles para Subir

Los siguientes archivos están listos en la carpeta `dist/`:

```
dist/
├── TECNILAND Nexus-setup-1.0.0.exe        ← SUBIR (Instalador principal)
├── TECNILAND Nexus-setup-1.0.0.exe.blockmap  ← SUBIR (Para updates diferenciales)
├── latest.yml                              ← SUBIR (Metadata para auto-updater)
├── builder-debug.yml                       (No subir)
├── builder-effective-config.yaml           (No subir)
└── win-unpacked/                           (No subir)
```

**⚠️ IMPORTANTE:** Solo debes subir los 3 archivos marcados con ← SUBIR

---

## 🌐 Paso a Paso: Crear Release en GitHub

### **Paso 1: Ir a la Página de Releases**

1. Abre tu navegador
2. Ve a: **https://github.com/Ppkeash/TECNILAND-Nexus/releases**
3. Click en el botón verde **"Draft a new release"** (arriba a la derecha)

---

### **Paso 2: Configurar el Tag**

En la página "Create a new release", verás un campo **"Choose a tag"**:

1. **Click** en el campo de texto
2. **Escribe exactamente:** `v1.0.0` (con la 'v' al inicio)
3. **Click** en: **"+ Create new tag: v1.0.0 on publish"**

**Ejemplo visual:**
```
┌─────────────────────────────────────────┐
│ Choose a tag                     ▼      │
│ v1.0.0                                  │
│ + Create new tag: v1.0.0 on publish    │ ← Click aquí
└─────────────────────────────────────────┘
```

**⚠️ CRÍTICO:** El tag debe ser **exactamente** `v1.0.0` (con 'v' minúscula). Si escribes `V1.0.0` o `1.0.0` NO funcionará.

---

### **Paso 3: Target Branch**

Asegúrate de que el campo **"Target"** esté en `main` (o tu rama principal):

```
Target: main  ✓
```

Si no es `main`, selecciona la rama correcta del dropdown.

---

### **Paso 4: Título del Release**

En el campo **"Release title"**, escribe:

```
TECNILAND Nexus v1.0.0 - Primera Release Pública
```

---

### **Paso 5: Descripción (Release Notes)**

Ahora viene la parte más importante. En el gran cuadro de texto **"Describe this release"**:

#### **Opción A: Copiar y Pegar el Template**

1. **Abre** el archivo `RELEASE_NOTES_v1.0.0.md` (está en la raíz del proyecto)
2. **Copia TODO** el contenido (Ctrl+A, Ctrl+C)
3. **Pega** en el cuadro de texto de GitHub

#### **Opción B: Usar el Editor de GitHub**

Si prefieres editar directamente en GitHub:

1. **Copia** este template minimalista:

```markdown
# 🎉 TECNILAND Nexus v1.0.0 - Primera Release Pública

> **Primera versión pública** de TECNILAND Nexus, el launcher personalizado para servidores TECNILAND.

---

## ✨ Características Principales

- ✅ **Multi-Loader:** Forge, Fabric, Quilt, NeoForge
- ✅ **Cuentas Offline:** Con soporte de skins (preview)
- ✅ **Gestor de Instalaciones:** Crea instalaciones personalizadas
- ✅ **Sistema de Modpacks:** Sección TECNILAND SERVERS
- ✅ **Java Inteligente:** Descarga automática según versión de MC
- ✅ **Visor de Logs:** En vivo con colores
- ✅ **Auto-Actualizaciones:** Nunca te quedes atrás
- ✅ **UI Moderna:** Hero Header + Animaciones fluidas
- ✅ **Discord RPC:** Muestra tu estado en Discord

---

## 🐛 Correcciones

- ✅ **Bug Crítico:** Descarga de Java (`ADOPTIUM` → `TEMURIN/CORRETTO`)
- ✅ **Forge:** Mejorada estabilidad en 1.15.2, 1.19.4
- ✅ **Fabric:** Corregido classpath y mappings de Quilt

---

## 🎯 Compatibilidad

**Testeado en:** MC 1.13.x - 1.21.x  
**Plataforma:** Windows 10/11 (64-bit)  
**Requisitos:** 4 GB RAM, 2 GB espacio libre

---

## 📥 Instalación

1. Descarga `TECNILAND Nexus-setup-1.0.0.exe`
2. Ejecuta el instalador
3. Si Windows SmartScreen advierte, click "Más información" → "Ejecutar de todos modos"
4. ¡Disfruta!

---

## ⚠️ Limitaciones Conocidas

- **Skins in-game:** Solo visible en preview (requiere Yggdrasil en Fase 1)
- **SmartScreen:** Advertencia normal (launcher no firmado)

---

## 🔗 Enlaces

- **GitHub:** https://github.com/Ppkeash/TECNILAND-Nexus
- **Discord:** https://discord.gg/53T4Tzrea3
- **Issues:** https://github.com/Ppkeash/TECNILAND-Nexus/issues

---

## 🎯 Próximo: Fase 1 - TECNILAND Account

- Sistema de cuentas propias
- Servidor Yggdrasil (skins in-game)
- Llaves de acceso para beta testers

---

**¡Gracias a todos los beta testers!** 🎮
```

2. **Pega** en el cuadro de texto

---

### **Paso 6: Subir Archivos**

Ahora viene la parte crucial. **Scroll** hacia abajo hasta encontrar el área de **"Attach binaries"**:

```
┌─────────────────────────────────────────────────────────────┐
│ Attach binaries by dropping them here or selecting them.   │
│                                                             │
│         [Arrastra archivos aquí]                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Método 1: Arrastrar y Soltar**
1. Abre la carpeta `dist/` en el Explorador de Windows
2. **Arrastra** los siguientes archivos al cuadro de GitHub:
   - `TECNILAND Nexus-setup-1.0.0.exe`
   - `TECNILAND Nexus-setup-1.0.0.exe.blockmap`
   - `latest.yml`

**Método 2: Seleccionar Archivos**
1. Click en el texto "selecting them"
2. Se abrirá un explorador de archivos
3. Navega a la carpeta `dist/`
4. **Selecciona** los 3 archivos (Ctrl+Click para múltiple selección):
   - `TECNILAND Nexus-setup-1.0.0.exe`
   - `TECNILAND Nexus-setup-1.0.0.exe.blockmap`
   - `latest.yml`
5. Click **"Abrir"**

**⏳ Espera** a que se suban los archivos (aparecerán en una lista con checkmarks ✓)

---

### **Paso 7: Opciones Adicionales**

**¿Es una Pre-Release?**
- **NO marques** la casilla "Set as a pre-release"
- Esta es una release **estable** (1.0.0), no beta

```
☐ Set as a pre-release    ← NO marcar
```

**¿Latest Release?**
- **SÍ marca** la casilla "Set as the latest release" (debería estar marcada por defecto)

```
☑ Set as the latest release    ← Debe estar marcado
```

**Generate release notes (GitHub)**
- Puedes dejar sin marcar, ya tienes tus propias release notes
- Si marcas, GitHub añadirá automáticamente commits recientes (opcional)

---

### **Paso 8: Publicar**

1. **Revisa** que todo esté correcto:
   - ✓ Tag: `v1.0.0`
   - ✓ Target: `main`
   - ✓ Título: "TECNILAND Nexus v1.0.0 - Primera Release Pública"
   - ✓ Descripción: Release notes completas
   - ✓ Archivos: 3 archivos subidos (`.exe`, `.blockmap`, `.yml`)
   - ✓ Pre-release: NO marcado
   - ✓ Latest release: SÍ marcado

2. **Click** en el botón verde **"Publish release"** (abajo del todo)

---

## ✅ Verificación Post-Release

Después de publicar, espera **2-5 minutos** y verifica:

### **1. Release Visible**
- Ve a: https://github.com/Ppkeash/TECNILAND-Nexus/releases
- Deberías ver tu release v1.0.0 al inicio

### **2. Feed Atom Activo**
- Abre en tu navegador: https://github.com/Ppkeash/TECNILAND-Nexus/releases.atom
- Deberías ver XML con tu release

### **3. Changelog en Launcher**
1. Abre TECNILAND Nexus
2. Ve a Configuración → Acerca de
3. En "Changelog" debería aparecer:
   - Título: "TECNILAND Nexus v1.0.0 - Primera Release Pública"
   - Contenido: Tus release notes
   - Link: "View Release Notes on GitHub" (funcional)

**Si dice "No Release Notes":**
- Espera 5 minutos más (GitHub propaga el feed)
- Refresca el launcher (Ctrl+R o cierra y abre)
- Verifica que el tag sea exactamente `v1.0.0`

---

## 🧪 Probar Auto-Updates (Opcional)

Si quieres probar que las actualizaciones funcionan:

### **Paso 1: Simular Nueva Versión**
1. Edita `package.json`: `"version": "1.0.1"`
2. Cambia algo pequeño (ej: texto de bienvenida)
3. Commit y push
4. Compila: `npm run dist`

### **Paso 2: Crear Release v1.0.1**
1. Repite el proceso anterior con tag `v1.0.1`
2. Sube los nuevos archivos desde `dist/`

### **Paso 3: Verificar Update**
1. Abre TECNILAND Nexus v1.0.0
2. Ve a Configuración → Actualizaciones
3. Click "Buscar Actualizaciones"
4. Debería detectar v1.0.1 y mostrar botón "Descargar"

---

## 📢 Anunciar a Beta Testers

Una vez verificado que todo funciona:

### **Mensaje para Discord/Grupo:**

```
🎉 ¡TECNILAND Nexus v1.0.0 ya está disponible!

📥 Descarga: https://github.com/Ppkeash/TECNILAND-Nexus/releases/latest

✨ Incluye:
• Soporte multi-loader (Forge/Fabric/Quilt/NeoForge)
• Cuentas offline con skins
• Gestor de instalaciones personalizadas
• Auto-actualizaciones
• Y mucho más...

⚠️ Windows SmartScreen puede advertir "Editor desconocido":
➡️ Click en "Más información" → "Ejecutar de todos modos"

📝 Reporten cualquier bug en:
https://github.com/Ppkeash/TECNILAND-Nexus/issues

¡Disfruten! 🎮
```

---

## 🛠️ Troubleshooting

### **Error: "Tag already exists"**
- Ya existe un tag v1.0.0 en tu repo
- Solución: Elimina el tag:
  ```powershell
  git tag -d v1.0.0
  git push origin :refs/tags/v1.0.0
  ```

### **Error al subir archivos grandes**
- El `.exe` es muy grande (>100 MB)
- GitHub tiene límite de 2 GB por archivo
- Si pasa de 2 GB, usa GitHub LFS o aloja en otro lugar

### **Changelog no aparece en launcher**
1. Verifica URL en navegador: `https://github.com/Ppkeash/TECNILAND-Nexus/releases.atom`
2. Busca tu release en el XML
3. Si no aparece, espera 5-10 minutos
4. En launcher, abre DevTools (Ctrl+Shift+I) → Console
5. Busca errores de AJAX/red

---

## 📋 Checklist Final

Antes de cerrar este proceso, verifica:

- [ ] Release publicado en GitHub
- [ ] 3 archivos subidos correctamente
- [ ] Tag es `v1.0.0` (exacto)
- [ ] Feed Atom accesible
- [ ] Changelog visible en launcher (sección "Acerca de")
- [ ] Instalador descargable desde GitHub
- [ ] Anunciado a beta testers

---

## 🎯 Próximos Pasos

Después de que los testers prueben v1.0.0:

1. **Recopilar feedback** de bugs y mejoras
2. **Arreglar issues** reportados
3. **Preparar v1.0.1** con fixes
4. **Repetir proceso** de release (será más rápido)

Para releases futuras, consulta la sección "Paso 3: Compilar el Launcher" en [AUTO_UPDATES_COMPLETE_GUIDE.md](docs/AUTO_UPDATES_COMPLETE_GUIDE.md).

---

**¡Éxito con tu primera release!** 🚀

*Si tienes problemas, revisa [AUTO_UPDATES_COMPLETE_GUIDE.md](docs/AUTO_UPDATES_COMPLETE_GUIDE.md) o abre un issue.*
