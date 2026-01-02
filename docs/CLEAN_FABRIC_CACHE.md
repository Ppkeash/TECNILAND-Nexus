# 🧹 Limpiar Caché de Fabric - Instrucciones

**Objetivo**: Borrar instalación corrupta de Fabric para forzar reinstalación limpia  
**Fecha**: December 26, 2025

---

## 📋 Archivos a Borrar

### 1. Version.json de Fabric
**Ruta**: `common/versions/fabric-loader-{loaderVersion}-{mcVersion}/`

**Ejemplo**: `common/versions/fabric-loader-0.18.1-1.20.1/`

**Comando PowerShell**:
```powershell
# Cambiar a tu ruta específica
$commonDir = "$env:APPDATA\.tecnilandnexus\common"

# Borrar TODAS las versiones de Fabric (cualquier loader version)
Remove-Item "$commonDir\versions\fabric-loader-*" -Recurse -Force -ErrorAction SilentlyContinue

# Verificar que se borraron
Get-ChildItem "$commonDir\versions" | Where-Object { $_.Name -like "fabric-loader-*" }
# Debe retornar vacío
```

---

### 2. JAR de fabric-loader
**Ruta**: `common/libraries/net/fabricmc/fabric-loader/{loaderVersion}/`

**Ejemplo**: `common/libraries/net/fabricmc/fabric-loader/0.18.1/`

**Comando PowerShell**:
```powershell
$commonDir = "$env:APPDATA\.tecnilandnexus\common"

# Borrar TODOS los fabric-loader jars
Remove-Item "$commonDir\libraries\net\fabricmc\fabric-loader" -Recurse -Force -ErrorAction SilentlyContinue

# Verificar que se borraron
Test-Path "$commonDir\libraries\net\fabricmc\fabric-loader"
# Debe retornar False
```
Test-path 
---

### 3. JAR de intermediary (opcional)
**Ruta**: `common/libraries/net/fabricmc/intermediary/{mcVersion}/`

**Ejemplo**: `common/libraries/net/fabricmc/intermediary/1.20.1/`

**Comando PowerShell**:
```powershell
$commonDir = "$env:APPDATA\.tecnilandnexus\common"

# Borrar TODOS los intermediary jars
Remove-Item "$commonDir\libraries\net\fabricmc\intermediary" -Recurse -Force -ErrorAction SilentlyContinue

# Verificar que se borraron
Test-Path "$commonDir\libraries\net\fabricmc\intermediary"
# Debe retornar False
```

---

### 4. Dependencias de Fabric (ASM, Mixin)

**Rutas**:
- `common/libraries/org/ow2/asm/`
- `common/libraries/net/fabricmc/sponge-mixin/`

**Comando PowerShell** (OPCIONAL - solo si hay problemas con deps):
```powershell
$commonDir = "$env:APPDATA\.tecnilandnexus\common"

# Borrar ASM libraries (pueden estar compartidas con Forge)
Remove-Item "$commonDir\libraries\org\ow2\asm" -Recurse -Force -ErrorAction SilentlyContinue

# Borrar Sponge Mixin
Remove-Item "$commonDir\libraries\net\fabricmc\sponge-mixin" -Recurse -Force -ErrorAction SilentlyContinue
```

⚠️ **ADVERTENCIA**: ASM también lo usa Forge, así que solo borra esto si Forge no está instalado o si quieres forzar re-descarga.

---

## 🚀 Script Completo - Limpiar Todo Fabric

**Archivo**: `clean-fabric-cache.ps1`

```powershell
# Limpiar Caché de Fabric
# Este script borra TODAS las instalaciones de Fabric para forzar reinstalación limpia

$commonDir = "$env:APPDATA\.tecnilandnexus\common"

Write-Host "=== LIMPIANDO CACHE DE FABRIC ===" -ForegroundColor Yellow
Write-Host "Common directory: $commonDir" -ForegroundColor Cyan

# 1. Borrar version.json de Fabric
Write-Host "`n[1/4] Borrando version.json de Fabric..." -ForegroundColor Green
$fabricVersions = Get-ChildItem "$commonDir\versions" -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "fabric-loader-*" }
if ($fabricVersions) {
    foreach ($version in $fabricVersions) {
        Write-Host "  Borrando: $($version.Name)" -ForegroundColor Gray
        Remove-Item $version.FullName -Recurse -Force
    }
} else {
    Write-Host "  No se encontraron versiones de Fabric" -ForegroundColor Gray
}

# 2. Borrar fabric-loader jars
Write-Host "`n[2/4] Borrando fabric-loader jars..." -ForegroundColor Green
if (Test-Path "$commonDir\libraries\net\fabricmc\fabric-loader") {
    Remove-Item "$commonDir\libraries\net\fabricmc\fabric-loader" -Recurse -Force
    Write-Host "  Borrado: fabric-loader/" -ForegroundColor Gray
} else {
    Write-Host "  No se encontró fabric-loader/" -ForegroundColor Gray
}

# 3. Borrar intermediary jars
Write-Host "`n[3/4] Borrando intermediary jars..." -ForegroundColor Green
if (Test-Path "$commonDir\libraries\net\fabricmc\intermediary") {
    Remove-Item "$commonDir\libraries\net\fabricmc\intermediary" -Recurse -Force
    Write-Host "  Borrado: intermediary/" -ForegroundColor Gray
} else {
    Write-Host "  No se encontró intermediary/" -ForegroundColor Gray
}

# 4. Borrar sponge-mixin (OPCIONAL)
Write-Host "`n[4/4] Borrando sponge-mixin (opcional)..." -ForegroundColor Green
if (Test-Path "$commonDir\libraries\net\fabricmc\sponge-mixin") {
    Remove-Item "$commonDir\libraries\net\fabricmc\sponge-mixin" -Recurse -Force
    Write-Host "  Borrado: sponge-mixin/" -ForegroundColor Gray
} else {
    Write-Host "  No se encontró sponge-mixin/" -ForegroundColor Gray
}

Write-Host "`n=== LIMPIEZA COMPLETA ===" -ForegroundColor Yellow
Write-Host "Ahora puedes reinstalar Fabric desde el launcher." -ForegroundColor Cyan
Write-Host ""
```

**Uso**:
```powershell
# Ejecutar script
.\clean-fabric-cache.ps1

# O copiar y pegar en PowerShell
```

---

## 🧪 Verificar Limpieza

**Después de ejecutar el script**:

```powershell
$commonDir = "$env:APPDATA\.tecnilandnexus\common"

# Check 1: No hay versiones de Fabric
Write-Host "Check 1: Versiones de Fabric"
Get-ChildItem "$commonDir\versions" -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "fabric-loader-*" }
# Debe retornar vacío

# Check 2: No hay fabric-loader jars
Write-Host "`nCheck 2: fabric-loader jars"
Test-Path "$commonDir\libraries\net\fabricmc\fabric-loader"
# Debe retornar False

# Check 3: No hay intermediary jars
Write-Host "`nCheck 3: intermediary jars"
Test-Path "$commonDir\libraries\net\fabricmc\intermediary"
# Debe retornar False

Write-Host "`n✅ Caché limpia, listo para reinstalar" -ForegroundColor Green
```

---

## 📝 Pasos Después de Limpiar

### 1. Cerrar el Launcher
```powershell
# Si está corriendo, cerrar electron
Stop-Process -Name "electron" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "TECNILAND NEXUS" -Force -ErrorAction SilentlyContinue
```

### 2. Abrir Launcher y Reinstalar
```bash
npm start
```

### 3. Crear Nueva Instalación Fabric
- Minecraft: 1.20.1
- Loader: Fabric 0.18.1 (o la versión que prefieras)
- Nombre: "Fabric 1.20.1" (o cualquier nombre)

### 4. Verificar Logs Durante Instalación

**Buscar en consola**:
```
[FabricLoaderInstaller] ✅ Fabric API metadata validated: loader.maven and intermediary.maven present
[FabricLoaderInstaller] Added fabric-loader library: net.fabricmc:fabric-loader:0.18.1
[FabricLoaderInstaller] Added intermediary library: net.fabricmc:intermediary:1.20.1
[FabricLoaderInstaller] Total libraries: 8 (2 core + 6 dependencies)

[FabricLoaderInstaller] === FABRIC VERSION.JSON LIBRARIES ===
[FabricLoaderInstaller]   Total libraries in version.json: 8
[FabricLoaderInstaller]   [0] net.fabricmc:fabric-loader:0.18.1
[FabricLoaderInstaller]   [1] net.fabricmc:intermediary:1.20.1
[FabricLoaderInstaller]   [2] org.ow2.asm:asm:9.7.1
[FabricLoaderInstaller]   ...
[FabricLoaderInstaller] === END LIBRARIES LIST ===

[FabricLoaderInstaller] ✅ Post-generation validation: hasFabricLoader=true, hasIntermediary=true
```

✅ **Si ves esto**: version.json se generó correctamente

❌ **Si NO ves esto**: Hay un bug en `generateVersionJson()`, copia los logs completos

### 5. Click "Play" y Verificar Launch

**Buscar en consola**:
```
[ProcessBuilder] === MOD LOADER VERSION.JSON LOADED ===
[ProcessBuilder]   ID: fabric-loader-0.18.1-1.20.1
[ProcessBuilder]   MainClass: net.fabricmc.loader.launch.knot.KnotClient
[ProcessBuilder]   Libraries count: 8

[ProcessBuilder] === RESOLVING MOD LOADER LIBRARIES (fabric-loader-0.18.1-1.20.1) ===
[ProcessBuilder]   Total libraries in modManifest: 8
[ProcessBuilder]   ✅ Fabric assertion passed: Found 1 fabric-loader library
[ProcessBuilder]      net.fabricmc:fabric-loader:0.18.1

[ProcessBuilder] === BUILDING CLASSPATH ===
[ProcessBuilder]   Mod Loader libraries: 8

[ProcessBuilder] === FABRIC CLASSPATH VALIDATION ===
[ProcessBuilder]   ✅ hasFabricLoaderJar: true
[ProcessBuilder]   ✅ hasIntermediaryJar: true
[ProcessBuilder]   ✅ hasKnotClient: true
[ProcessBuilder] === END FABRIC VALIDATION ===
```

✅ **Si ves esto**: Classpath correcto, Minecraft debería abrir

❌ **Si ves errores**: Copia los logs completos para diagnóstico

---

## 🎯 Criterios de Aceptación

### ✅ Instalación Exitosa

1. **Durante instalación**:
   - `Total libraries: 8` (no 6)
   - `[0] net.fabricmc:fabric-loader:0.18.1` aparece en la lista
   - `✅ Post-generation validation: hasFabricLoader=true`

2. **Durante launch**:
   - `Libraries count: 8` (no 6)
   - `✅ Fabric assertion passed`
   - `✅ hasFabricLoaderJar: true`
   - `✅ hasIntermediaryJar: true`
   - `✅ hasKnotClient: true`

3. **Resultado final**:
   - Minecraft abre sin `ClassNotFoundException`
   - Ventana de Minecraft muestra Fabric cargado

---

## ❌ Si Sigue Fallando

### Escenario 1: Libraries count = 6
**Problema**: version.json solo tiene 6 libraries (faltan fabric-loader + intermediary)

**Verificar**:
```powershell
$commonDir = "$env:APPDATA\.tecnilandnexus\common"
Get-Content "$commonDir\versions\fabric-loader-0.18.1-1.20.1\fabric-loader-0.18.1-1.20.1.json" | ConvertFrom-Json | Select-Object -ExpandProperty libraries | Select-Object -First 3
```

**Debería verse**:
```json
{
  "name": "net.fabricmc:fabric-loader:0.18.1",
  "url": "https://maven.fabricmc.net/"
},
{
  "name": "net.fabricmc:intermediary:1.20.1",
  "url": "https://maven.fabricmc.net/"
},
{
  "name": "org.ow2.asm:asm:9.7.1",
  ...
}
```

**Si NO se ve**: Bug en `generateVersionJson()`, reportar logs completos

---

### Escenario 2: hasFabricLoaderJar = false
**Problema**: fabric-loader está en version.json pero no en classpath

**Verificar**:
```powershell
# Buscar fabric-loader jar en disco
Test-Path "$commonDir\libraries\net\fabricmc\fabric-loader\0.18.1\fabric-loader-0.18.1.jar"
# Debe retornar True
```

**Si False**: No se descargó el jar, verificar logs de descarga

**Si True**: ProcessBuilder no lo está agregando al classpath, bug en `_resolveModLoaderLibraries()`

---

### Escenario 3: Assert falla
**Problema**: ProcessBuilder detecta que fabric-loader no está en version.json

**Log esperado**:
```
[ProcessBuilder] === CRITICAL ERROR: FABRIC LOADER MISSING ===
[ProcessBuilder]   All library names:
[ProcessBuilder]     [0] org.ow2.asm:asm:9.7.1
[ProcessBuilder]     [1] ...
```

**Significa**: version.json se generó mal, verificar Step 1

---

## ✅ Status

**Limpiar caché**: READY  
**Reinstalar**: PENDING  
**Testing**: PENDING

---

*End of Clean Cache Instructions*
