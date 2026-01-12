# INSTANCE_UPGRADE_IN_PLACE_REPORT

## Resumen

Este documento describe la implementación del sistema de **upgrade-in-place** para instalaciones personalizadas en TECNILAND NEXUS. El objetivo es permitir a los usuarios cambiar la versión de Minecraft y/o el loader (Forge, Fabric, Quilt, NeoForge, Vanilla) de una instancia existente **sin crear una nueva carpeta**, preservando todos los datos del usuario (saves, configs, resourcepacks, etc.).

---

## 1. Flujo: Antes vs Después

### Flujo ANTERIOR (problemático)

```
┌─────────────────────────────────────────────────────────┐
│ Usuario: "Editar instancia" → Cambiar MC 1.19.2 → 1.20.1│
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ ConfigManager.updateInstallation()                       │
│   → Solo actualiza metadata (loader.minecraftVersion)   │
│   → NO verifica impacto en datos de usuario             │
│   → NO avisa de incompatibilidades de mods              │
│   → NO crea backup                                       │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ Resultado: Usuario pierde mods, puede tener crashes     │
│ por mods incompatibles, sin backup para recuperar.      │
└─────────────────────────────────────────────────────────┘
```

### Flujo NUEVO (upgrade-in-place)

```
┌─────────────────────────────────────────────────────────┐
│ Usuario: "Editar instancia" → Cambiar MC 1.19.2 → 1.20.1│
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ InstallationManager.analyzeUpgradeChanges()              │
│   → Detecta: mcVersionChanged, loaderTypeChanged        │
│   → Calcula: isDowngrade (1.20 < 1.19? NO)              │
│   → Genera: summary para UI                              │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ showUpgradeConfirmationOverlay()                         │
│   → Muestra resumen de cambios                           │
│   → Lista datos que se preservan                         │
│   → Avisa si mods serán deshabilitados                   │
│   → Si DOWNGRADE: requiere checkbox de confirmación     │
└────────────────────────────┬────────────────────────────┘
                             │ Usuario confirma
                             ▼
┌─────────────────────────────────────────────────────────┐
│ InstallationManager.createInstanceBackup()               │
│   → Copia instances/<id>/ → instances-backups/<id>_...  │
│   → Guarda _backup_meta.json con timestamp y reason     │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ InstallationManager.disableInstanceMods() [si loader ≠] │
│   → Mueve mods/ → mods.disabled/                        │
│   → Preserva mods anteriores en _archived_<timestamp>/  │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ ConfigManager.updateInstallation()                       │
│   → Actualiza: loader.type, minecraftVersion, etc.      │
│   → Guarda: upgradeHistory[], lastUpgrade timestamp     │
│   → Limpia: upgradeFailed (si éxito)                    │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ Resultado: Instancia actualizada, datos preservados,    │
│ mods deshabilitados (si aplica), backup disponible.     │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Archivos Modificados

| Archivo | Cambios | Motivo |
|---------|---------|--------|
| `app/assets/js/installationmanager.js` | +400 líneas | Nueva lógica de upgrade-in-place: `analyzeUpgradeChanges()`, `createInstanceBackup()`, `disableInstanceMods()`, `restoreInstanceMods()`, `restoreFromBackup()`, `getInstanceBackups()`, `upgradeInstanceInPlace()`, `getFailedUpgrade()`, `clearFailedUpgrade()`, `compareMinecraftVersions()` |
| `app/assets/js/configmanager.js` | +10 líneas | Soporte para nuevos campos: `upgradeHistory`, `lastUpgrade`, `upgradeFailed` en `updateInstallation()` |
| `app/assets/js/scripts/overlay.js` | +300 líneas | UI de confirmación: `showUpgradeConfirmationOverlay()`, `executeUpgradeInPlace()`, `showFailedUpgradeRecovery()`, `restoreInstanceFromBackup()`. Modificación de `createInstallationFromForm()` y `loadInstallationIntoEditor()` |

---

## 3. Estructura de Datos

### Installation Object (campos nuevos)

```javascript
{
  // ... campos existentes ...
  
  // Nuevo: Historial de upgrades
  upgradeHistory: [
    {
      timestamp: "2026-01-06T12:00:00.000Z",
      from: {
        mcVersion: "1.19.2",
        loaderType: "forge",
        loaderVersion: "43.2.0"
      },
      to: {
        mcVersion: "1.20.1",
        loaderType: "fabric",
        loaderVersion: "0.15.11"
      },
      backupPath: "C:/.../instances-backups/install-xxx_upgrade-1.19.2-to-1.20.1_2026-01-06T12-00-00-000Z"
    }
  ],
  
  // Nuevo: Timestamp del último upgrade exitoso
  lastUpgrade: "2026-01-06T12:00:00.000Z",
  
  // Nuevo: Info de upgrade fallido (para recovery)
  upgradeFailed: {
    timestamp: "2026-01-06T12:00:00.000Z",
    targetProfile: { name, loaderType, minecraftVersion, loaderVersion },
    backupPath: "...",
    error: "Mensaje de error"
  } | null
}
```

### Backup Metadata (`_backup_meta.json`)

```javascript
{
  instanceId: "install-xxx-123456-abcd",
  reason: "upgrade-1.19.2-to-1.20.1",
  timestamp: "2026-01-06T12:00:00.000Z",
  sourcePath: "C:/.../instances/install-xxx-123456-abcd",
  backupPath: "C:/.../instances-backups/install-xxx_upgrade-1.19.2-to-1.20.1_2026-01-06T12-00-00-000Z"
}
```

---

## 4. Estructura de Carpetas

```
.tecnilandnexus/
├── common/                    # [SIN CAMBIOS] Recursos compartidos
│   ├── versions/
│   ├── libraries/
│   └── assets/
│
├── instances/                 # [SIN CAMBIOS] Instancias de usuario
│   └── install-xxx/
│       ├── saves/             # ✅ Preservado
│       ├── options.txt        # ✅ Preservado
│       ├── resourcepacks/     # ✅ Preservado
│       ├── screenshots/       # ✅ Preservado
│       ├── mods/              # ⚠️ Vaciado si cambia loader
│       ├── mods.disabled/     # 🆕 Mods movidos aquí
│       │   ├── mod1.jar
│       │   ├── mod2.jar
│       │   └── _archived_2026-01-06T12-00-00-000Z/  # Mods previos
│       └── config/            # ✅ Preservado (puede requerir ajustes manuales)
│
└── instances-backups/         # 🆕 Directorio de backups
    └── install-xxx_upgrade-1.19.2-to-1.20.1_2026-01-06T12-00-00-000Z/
        ├── saves/
        ├── mods/
        ├── config/
        ├── options.txt
        └── _backup_meta.json
```

---

## 5. API de Funciones

### `InstallationManager.analyzeUpgradeChanges(currentInstall, newProfile)`

Analiza los cambios entre la instalación actual y el nuevo perfil.

**Parámetros:**
- `currentInstall`: Objeto de instalación actual
- `newProfile`: `{ name, loaderType, minecraftVersion, loaderVersion }`

**Retorna:**
```javascript
{
  nameChanged: boolean,
  mcVersionChanged: boolean,
  loaderTypeChanged: boolean,
  loaderVersionChanged: boolean,
  oldMcVersion: string,
  newMcVersion: string,
  oldLoaderType: string,
  newLoaderType: string,
  isDowngrade: boolean,
  requiresModDisable: boolean,
  requiresBackup: boolean,
  hasChanges: boolean,
  summary: string[]  // Mensajes legibles para UI
}
```

### `InstallationManager.upgradeInstanceInPlace(instanceId, newProfile, options?)`

Ejecuta el upgrade completo de una instancia.

**Parámetros:**
- `instanceId`: ID de la instancia
- `newProfile`: `{ name, loaderType, minecraftVersion, loaderVersion }`
- `options`: `{ skipBackup?: boolean, forceModDisable?: boolean }`

**Retorna:**
```javascript
{
  success: boolean,
  backupPath: string | null,
  modsDisabled: number,
  changes: Object,  // Resultado de analyzeUpgradeChanges
  error: string | null,
  warnings: string[]
}
```

### `InstallationManager.createInstanceBackup(instanceId, reason)`

Crea un backup completo de la instancia.

**Retorna:**
```javascript
{
  success: boolean,
  backupPath: string | null,
  timestamp?: string,
  skipped?: boolean,  // Si la instancia no tiene datos
  error?: string
}
```

### `InstallationManager.disableInstanceMods(instanceId)`

Mueve `mods/` a `mods.disabled/`.

**Retorna:**
```javascript
{
  success: boolean,
  modsCount: number,
  modsDisabledPath?: string,
  error?: string
}
```

### `InstallationManager.restoreFromBackup(backupPath, instanceId)`

Restaura una instancia desde un backup.

### `InstallationManager.getInstanceBackups(instanceId)`

Lista todos los backups disponibles para una instancia.

### `InstallationManager.getFailedUpgrade(instanceId)`

Verifica si hay un upgrade fallido pendiente.

### `InstallationManager.clearFailedUpgrade(instanceId)`

Limpia el estado de upgrade fallido.

---

## 6. Checklist de Pruebas

### ✅ Casos Básicos

- [ ] **Editar Vanilla 1.19.2 → Vanilla 1.20.x**
  - Debe mostrar overlay de confirmación
  - Debe crear backup
  - saves/ debe preservarse
  - No debe tocar mods (no hay)

- [ ] **Editar Forge 1.19.2 → Forge 1.19.4**
  - Solo cambia versión menor
  - Backup creado
  - mods/ NO se deshabilita (mismo loader)
  - saves/ preservado

- [ ] **Editar Forge → Fabric (mismo MC)**
  - Overlay muestra "cambio de loader"
  - Backup creado
  - mods/ → mods.disabled/
  - config/ preservado con warning

- [ ] **Editar con DOWNGRADE (1.20.1 → 1.19.2)**
  - Overlay requiere checkbox de confirmación
  - Warning fuerte visible
  - Backup creado
  - Permite continuar solo si checkbox marcado

### ✅ Casos de Error/Recovery

- [ ] **Fallo durante backup**
  - Estado `upgradeFailed` guardado
  - Al reabrir editor, muestra recovery dialog
  - Opción de restaurar o ignorar

- [ ] **Fallo durante upgrade (después de backup)**
  - Backup disponible
  - Estado `upgradeFailed` contiene backupPath
  - Recovery permite restaurar

- [ ] **Cancelar upgrade**
  - No se crea backup
  - Instalación sin cambios
  - Editor vuelve a estado editable

### ✅ Casos Edge

- [ ] **Instancia sin mods**
  - disableInstanceMods() retorna modsCount: 0
  - No muestra warning de mods

- [ ] **Instancia nueva (sin datos)**
  - createInstanceBackup() retorna skipped: true
  - Upgrade continúa sin error

- [ ] **Cambio solo de nombre**
  - hasChanges = true, pero NO require backup
  - Actualización directa sin confirmación

---

## 7. Procedimiento de Rollback Manual

Si algo sale mal y el usuario necesita restaurar manualmente:

### Opción A: Desde la UI (si el launcher funciona)

1. Abrir el editor de la instancia afectada
2. Si hay upgrade fallido, aparecerá diálogo de recovery
3. Click en "Restaurar desde backup"

### Opción B: Manual (si el launcher no abre)

1. Navegar a `.tecnilandnexus/instances-backups/`
2. Encontrar el backup más reciente de la instancia (ordenado por fecha en nombre)
3. Eliminar la carpeta de instancia problemática en `.tecnilandnexus/instances/<id>`
4. Copiar el contenido del backup a `.tecnilandnexus/instances/<id>`
5. Eliminar `_backup_meta.json` de la carpeta restaurada
6. Editar `.tecnilandnexus/config.json`:
   - Buscar la instalación por ID
   - Restaurar valores de `loader` al estado anterior
   - Eliminar `upgradeFailed` si existe

### Opción C: Restaurar solo mods

Si solo necesitas los mods antiguos:

1. Ir a `.tecnilandnexus/instances/<id>/mods.disabled/`
2. Copiar los `.jar` que necesites de vuelta a `mods/`
3. O restaurar desde `_archived_<timestamp>/` si hay múltiples backups

---

## 8. Notas de Implementación

### Decisiones de Diseño

1. **NO se eliminan archivos de `common/`**: Los runtimes viejos se mantienen como caché compartido. Esto evita romper otras instancias y permite rollback fácil.

2. **Backup completo vs parcial**: Se decidió hacer backup completo de la instancia (no solo saves) porque:
   - Más simple de restaurar
   - Incluye configs que pueden ser específicos del loader
   - El espacio en disco es barato vs. la pérdida de datos

3. **mods.disabled/ en lugar de eliminar**: Los mods se mueven, no se eliminan. Esto permite al usuario:
   - Revisar qué mods tenía
   - Restaurar manualmente los compatibles
   - No perder mods pagos o difíciles de encontrar

4. **Checkbox para downgrade**: El downgrade es inherentemente peligroso (corrupción de mundos). Requerir confirmación explícita reduce errores accidentales.

### Limitaciones Conocidas

1. **No hay actualización automática de mods**: El sistema solo deshabilita mods, no intenta actualizarlos. Esto requeriría integración con Modrinth/CurseForge.

2. **config/ se preserva sin cambios**: Algunos configs pueden ser incompatibles entre loaders. El usuario debe revisar manualmente.

3. **Sin limpieza automática de backups**: Los backups se acumulan. Considerar añadir botón "Limpiar backups antiguos" en futuras versiones.

---

## 9. Próximos Pasos (Futuro)

- [ ] Botón "Limpiar caché/runtimes no usados" para `common/`
- [ ] Integración con Modrinth para sugerir versiones compatibles de mods
- [ ] Limpieza automática de backups > 30 días
- [ ] Export/Import de instancias como .zip
