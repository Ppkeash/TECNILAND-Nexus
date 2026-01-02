# 🔧 Solución Aplicada: Quilt Mappings Fix v2

## Problema Original
Quilt crasheaba con error:
```
Loading mappings: .../org/quiltmc/hashed/1.21.4/hashed-1.21.4.jar!/mappings/mappings.tiny
Skipping mappings: Missing namespace 'intermediary'
IllegalStateException: Requested target namespace intermediary not loaded
```

**Causa Raíz:**
1. JVM args del `modManifest.arguments.jvm` NO se estaban aplicando al proceso Java
2. Flag `-Dloader.experimental.minecraft.targetNamespace=official` no llegaba al runtime
3. Instalaciones viejas sin el fix seguían activas (no se invalidaban)

---

## ✅ Fixes Implementados

### Fix 1: Merge Robusto de JVM Args + Logging
**Archivo:** `processbuilder.js` líneas 678-707

**Cambios:**
- Agregar logging detallado al mergear `modManifest.arguments.jvm`
- Log cada arg individual: `[0] -Dfabric.skipMcProvider=true`
- Log resumen: `✅ Merged 4 JVM args from modManifest.arguments.jvm`
- Aplicado en **ambos** métodos: `_constructJVMArguments113` (MC 1.13+) y `_constructJVMArguments112` (MC 1.12-)

**Logs esperados:**
```
=== MERGING MOD LOADER JVM ARGS ===
  [0] -Dfabric.skipMcProvider=true
  [1] -Dfabric.gameVersion=1.21.4
  [2] -Dfabric.side=client
  [3] -Dloader.experimental.minecraft.targetNamespace=official
  ✅ Merged 4 JVM args from modManifest.arguments.jvm
```

---

### Fix 2: Fallback Garantizado para Quilt+Hashed
**Archivo:** `processbuilder.js` líneas 709-741

**Cambios:**
- Detectar si Quilt usa `hashed` sin `intermediary`
- Verificar si el flag `targetNamespace=official` ya está presente
- **Si NO está**, agregarlo forzadamente en runtime
- Triple verificación:
  1. Detectar hashed en args o metadata
  2. Detectar intermediary en args o metadata
  3. Verificar flag existente

**Logs esperados (caso hashed sin flag):**
```
=== QUILT MAPPINGS FALLBACK CHECK ===
  hasHashedJar: true
  hasIntermediaryJar: false
  hasTargetNamespaceFlag: false
  ⚠️ CRITICAL: Quilt hashed mappings detected without intermediary namespace
  ⚠️ Forcing -Dloader.experimental.minecraft.targetNamespace=official
=== END QUILT MAPPINGS FALLBACK ===
```

**Logs esperados (caso intermediary):**
```
=== QUILT MAPPINGS FALLBACK CHECK ===
  hasHashedJar: false
  hasIntermediaryJar: true
  hasTargetNamespaceFlag: false
  ✅ Quilt using intermediary mappings (standard namespace)
=== END QUILT MAPPINGS FALLBACK ===
```

---

### Fix 3: Invalidación de Instalaciones Viejas
**Archivo:** `QuiltLoaderInstaller.js` líneas 88-110

**Cambios:**
- Validar que `version.json` contiene `_quiltMeta.mappingsType`
- Si **NO tiene** metadata → marcar como inválida → forzar reinstalación
- Si usa `hashed` pero **NO tiene** flag `targetNamespace=official` → marcar como inválida
- Garantiza que instalaciones viejas se regeneran con el fix

**Logs esperados (instalación vieja):**
```
⚠️ Quilt installation is OLD (no _quiltMeta). Marking as invalid to force regeneration.
```

**Logs esperados (hashed sin flag):**
```
⚠️ Quilt installation uses hashed but missing targetNamespace=official flag
   Marking as invalid to force regeneration with correct JVM args
```

**Logs esperados (instalación válida):**
```
Quilt installation validated: mappingsType=intermediary
Quilt installation is valid
```

---

## 📝 Script de Limpieza

**Archivo:** `scripts/clean-quilt.ps1`

**Uso:**
```powershell
cd scripts
.\clean-quilt.ps1
```

**Qué hace:**
1. Elimina todas las carpetas `common/versions/quilt-loader-*`
2. Elimina `common/libraries/org/quiltmc/quilt-loader/`
3. Elimina `common/libraries/org/quiltmc/hashed/`
4. **NO** elimina `net.fabricmc:intermediary` (Fabric puede usarlo)

**Cuándo usarlo:**
- Si quieres forzar reinstalación completa de Quilt
- Si la validación automática no detecta la instalación vieja
- Si quieres limpiar espacio en disco

---

## 🎯 Pasos para Probar el Fix

### Opción A: Reinstalación Automática (Recomendado)
1. **Reinicia el launcher** (npm start)
2. Ve a "Crear instalación" → Quilt
3. Selecciona MC 1.21.4 + quilt-loader 0.29.2
4. La instalación vieja será **invalidada automáticamente**
5. Se descargará todo desde cero con el fix aplicado

### Opción B: Limpieza Manual + Reinstalación
1. **Cierra el launcher**
2. Ejecuta: `cd scripts && .\clean-quilt.ps1`
3. Confirma con "S"
4. Reinicia el launcher (npm start)
5. Crea nueva instalación de Quilt

---

## 📊 Criterios de Aceptación

### ✅ Logs Correctos (Verificar en consola del launcher)

**Durante instalación:**
```
✅ Using intermediary mappings (Fabric-compatible, contains intermediary namespace)
Added mappings library: net.fabricmc:intermediary:1.21.4 (type: intermediary)
```

**Durante launch (caso intermediary):**
```
=== QUILT MAPPINGS METADATA ===
  Mappings type: intermediary
  Mappings maven: net.fabricmc:intermediary:1.21.4
  ✅ Using intermediary namespace (standard)
=== END QUILT MAPPINGS METADATA ===

=== MERGING MOD LOADER JVM ARGS ===
  [0] -Dfabric.skipMcProvider=true
  [1] -Dfabric.gameVersion=1.21.4
  [2] -Dfabric.side=client
  ✅ Merged 3 JVM args from modManifest.arguments.jvm

=== QUILT MAPPINGS FALLBACK CHECK ===
  hasHashedJar: false
  hasIntermediaryJar: true
  hasTargetNamespaceFlag: false
  ✅ Quilt using intermediary mappings (standard namespace)
=== END QUILT MAPPINGS FALLBACK ===
```

**Durante launch (caso hashed con fallback):**
```
=== QUILT MAPPINGS METADATA ===
  Mappings type: hashed
  Mappings maven: org.quiltmc:hashed:1.21.4
  ⚠️ Using hashed namespace (requires targetNamespace=official flag)
=== END QUILT MAPPINGS METADATA ===

=== MERGING MOD LOADER JVM ARGS ===
  [0] -Dfabric.skipMcProvider=true
  [1] -Dfabric.gameVersion=1.21.4
  [2] -Dfabric.side=client
  [3] -Dloader.experimental.minecraft.targetNamespace=official
  ✅ Merged 4 JVM args from modManifest.arguments.jvm

=== QUILT MAPPINGS FALLBACK CHECK ===
  hasHashedJar: true
  hasIntermediaryJar: false
  hasTargetNamespaceFlag: true
  ✅ targetNamespace flag already present in arguments
=== END QUILT MAPPINGS FALLBACK ===
```

### ✅ Minecraft Arranca Sin Crash
- **NO** debe aparecer: `"Target namespace: intermediary"` con hashed
- **NO** debe aparecer: `"Missing namespace 'intermediary'"`
- **NO** debe aparecer: `IllegalStateException`
- **SÍ** debe arrancar: Pantalla de título de Minecraft

### ✅ Instalaciones Viejas Invalidadas
- Primera ejecución después del fix → log: `"⚠️ Quilt installation is OLD (no _quiltMeta)"`
- Se descarga todo de nuevo → log: `"Instalando Quilt 0.29.2 para Minecraft 1.21.4..."`
- Nueva instalación tiene metadata → log: `"Quilt installation validated: mappingsType=intermediary"`

---

## 🔍 Troubleshooting

### Problema: Sigue usando hashed en vez de intermediary
**Solución:**
1. Verifica que QuiltLoaderInstaller.js línea 281 dice: `if (quiltMetadata.intermediary?.maven)` **ANTES** de `else if (quiltMetadata.hashed?.maven)`
2. Ejecuta `.\clean-quilt.ps1` para forzar regeneración

### Problema: Flag targetNamespace=official no aparece en logs
**Solución:**
1. Verifica que ProcessBuilder línea 709-741 está agregando el fallback
2. Verifica que `hasHashedJar === true` y `hasIntermediaryJar === false`
3. Si ambos son false, el version.json está corrupto → ejecuta clean-quilt.ps1

### Problema: "Quilt installation is valid" pero sigue crasheando
**Solución:**
1. Ejecuta `.\clean-quilt.ps1` para forzar regeneración (instalación vieja sin fix)
2. Verifica que version.json tiene `_quiltMeta` y `arguments.jvm` con los 3-4 flags

### Problema: Logs de merge no aparecen
**Solución:**
1. Verifica que `this.modManifest !== this.vanillaManifest` es true
2. Verifica que `this.modManifest.arguments.jvm` es un array con elementos
3. Agrega breakpoint en ProcessBuilder línea 688 para debug

---

## 📦 Archivos Modificados

1. **processbuilder.js**
   - Líneas 640-668: Merge JVM args para MC 1.12-
   - Líneas 678-741: Merge JVM args + fallback para MC 1.13+
   - Líneas 1131-1146: Logging metadata de mappings

2. **QuiltLoaderInstaller.js**
   - Líneas 273-296: Priorizar intermediary sobre hashed
   - Líneas 323-333: Agregar JVM args con flag condicional
   - Líneas 88-110: Invalidar instalaciones viejas

3. **scripts/clean-quilt.ps1** (nuevo)
   - Script de limpieza manual de Quilt

---

## 🚀 Resultado Final

**Antes del fix:**
```
[ERROR] Loading mappings: .../hashed-1.21.4.jar!/mappings/mappings.tiny
[ERROR] Skipping mappings: Missing namespace 'intermediary'
[FATAL] IllegalStateException: Requested target namespace intermediary not loaded
[CRASH] Game crashed
```

**Después del fix (intermediary):**
```
[INFO] ✅ Using intermediary mappings (Fabric-compatible)
[INFO] ✅ Merged 3 JVM args from modManifest.arguments.jvm
[INFO] ✅ Quilt using intermediary mappings (standard namespace)
[INFO] Loading Minecraft 1.21.4 with Quilt 0.29.2...
[SUCCESS] Game started successfully
```

**Después del fix (hashed con fallback):**
```
[WARN] ⚠️ Using hashed mappings: adding targetNamespace=official
[INFO] ✅ Merged 4 JVM args from modManifest.arguments.jvm
[WARN] ⚠️ Forcing -Dloader.experimental.minecraft.targetNamespace=official
[INFO] Loading Minecraft 1.21.4 with Quilt 0.29.2...
[SUCCESS] Game started successfully
```

---

## ✨ Bonus: No Breaking Changes

- ✅ **Fabric**: Sigue funcionando exactamente igual (no usa `_quiltMeta`)
- ✅ **Forge**: No afectado (condición `!this.usingOptiFine` excluye otros loaders)
- ✅ **Vanilla**: No afectado (no tiene `modManifest.arguments`)
- ✅ **OptiFine**: No afectado (condición explícita `!this.usingOptiFine`)
- ✅ **Instalaciones viejas de Fabric/Forge**: No invalidadas (solo Quilt sin `_quiltMeta`)

---

## 📞 Próximos Pasos

1. **Ejecutar `npm start`** para probar los cambios
2. **Crear instalación Quilt** para MC 1.21.4 + quilt-loader 0.29.2
3. **Verificar logs** en consola del launcher (buscar "MERGING MOD LOADER JVM ARGS" y "QUILT MAPPINGS FALLBACK")
4. **Lanzar Minecraft** y confirmar que arranca sin crash
5. **Reportar resultado** con logs completos si hay algún problema

---

**Fecha:** 2025-12-28  
**Versión:** Quilt Mappings Fix v2  
**Estado:** ✅ Implementado y listo para testing
