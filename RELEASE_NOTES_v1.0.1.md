# 🐛 TECNILAND Nexus v1.0.1 - Hotfix Crítico

> **Fecha de Release:** 12 de Enero, 2026  
> **Tipo:** Hotfix Release  
> **Plataforma:** Windows 10/11 (64-bit)

---

## 🚨 Acción Requerida

**Si instalaste v1.0.0 y experimentaste crashes al lanzar modpacks**, esta actualización es crítica.

### Actualización Automática
- El launcher descargará automáticamente esta actualización
- Recibirás una notificación para instalar
- Click en **"Instalar Ahora"** y listo

### Actualización Manual
Si prefieres actualizar manualmente:
1. Descarga `TECNILAND Nexus-setup-1.0.1.exe`
2. Ejecuta el instalador (sobreescribirá v1.0.0)
3. Reinicia el launcher

---

## 🐛 Bug Crítico Corregido

### **Error al Lanzar Modpacks**

**Síntoma:**
```
TypeError: arg.includes is not a function
    at ProcessBuilder._deduplicateJvmArgs
```

**Afectaba a:**
- Usuarios intentando lanzar modpacks TECNILAND
- Configuraciones con JVM args personalizados
- Cualquier instalación con argumentos de Java inválidos

**Causa:**
El sistema de deduplicación de argumentos JVM asumía que todos los elementos eran strings, pero en algunos casos podían contener valores `null`, `undefined` o tipos inválidos desde la configuración guardada.

**Solución:**
- ✅ Añadida validación de tipo antes de procesar argumentos
- ✅ Args inválidos ahora se detectan y se saltan con warning en logs
- ✅ El launcher continúa funcionando incluso con configuraciones corruptas

**Código Corregido:**
```javascript
// Antes (crash si arg no es string)
const key = arg.includes('=') ? arg.split('=')[0] : arg.split(/\s+/)[0]

// Ahora (validación defensiva)
if (typeof arg !== 'string' || !arg.trim()) {
    logger.warn(`Invalid JVM arg detected - skipping`)
    continue
}
const key = arg.includes('=') ? arg.split('=')[0] : arg.split(/\s+/)[0]
```

---

## 📊 Impacto

**Usuarios Afectados:**
- ~40-60% de instalaciones nuevas (dependiendo de la configuración inicial)
- Principalmente al lanzar el primer modpack

**Severidad:**
- 🔴 **Alta** - Impedía jugar completamente

**Tiempo de Resolución:**
- ⚡ Menos de 2 horas desde el primer reporte

---

## 🎯 Qué se Mantiene Igual

Esta versión **NO cambia** ninguna característica, solo corrige el bug. Todo lo de v1.0.0 sigue igual:

- ✅ Sistema Multi-Loader (Forge/Fabric/Quilt/NeoForge)
- ✅ Cuentas Offline con skins
- ✅ Gestor de instalaciones
- ✅ Sistema de modpacks TECNILAND
- ✅ Auto-actualizaciones
- ✅ UI moderna

---

## 🧪 Probado En

- ✅ Windows 10 (64-bit)
- ✅ Windows 11 (64-bit)
- ✅ Modpack TECNILAND OG
- ✅ Instalaciones custom con Forge 1.20.1
- ✅ Configuraciones con JVM args personalizados

---

## 📥 Instalación

### Si Ya Tienes v1.0.0:
**Opción A: Automática** (Recomendado)
1. Abre TECNILAND Nexus
2. Espera notificación de actualización (1-30 min)
3. Click "Instalar Ahora"
4. Listo

**Opción B: Manual**
1. Descarga `TECNILAND Nexus-setup-1.0.1.exe`
2. Cierra el launcher v1.0.0
3. Ejecuta el instalador v1.0.1
4. Reinicia el launcher

### Si Es Tu Primera Instalación:
1. Descarga `TECNILAND Nexus-setup-1.0.1.exe`
2. Ejecuta el instalador
3. Sigue el asistente
4. ¡Listo para jugar!

---

## 🔍 Verificar Versión Instalada

Para confirmar que tienes v1.0.1:

1. Abre TECNILAND Nexus
2. Ve a **Configuración** (⚙️)
3. Sección **"Acerca de"**
4. Verifica: **"Versión 1.0.1"**

---

## 🛠️ Para Desarrolladores

### Cambios Técnicos

**Archivo:** `app/assets/js/processbuilder.js`

**Función Modificada:** `_deduplicateJvmArgs(args)`

**Líneas:** 510-530

**Diff:**
```diff
_deduplicateJvmArgs(args) {
    const seen = new Set()
    const result = []
    
    for (const arg of args) {
+       // Skip invalid args (not string or empty)
+       if (typeof arg !== 'string' || !arg.trim()) {
+           logger.warn(`Invalid JVM arg detected (type: ${typeof arg}): ${JSON.stringify(arg)} - skipping`)
+           continue
+       }
+       
        // Extract key: -Dkey=value → -Dkey, -Xmx4G → -Xmx4G
        const key = arg.includes('=') ? arg.split('=')[0] : arg.split(/\s+/)[0]
        
        if (seen.has(key)) {
            logger.warn(`Duplicate JVM arg detected: ${key} (keeping first occurrence)`)
            continue
        }
        
        seen.add(key)
        result.push(arg)
    }
    
    return result
}
```

---

## 📋 Testing Checklist

Para verificar que el bug está corregido:

- [x] Instalar v1.0.1
- [x] Lanzar modpack TECNILAND OG
- [x] Verificar que Minecraft inicia correctamente
- [x] Verificar logs (no debe haber "arg.includes is not a function")
- [x] Probar con instalación custom
- [x] Probar con JVM args personalizados

---

## 🙏 Agradecimientos

Gracias a **sustr** (usuario de Discord) por ser el primero en reportar este bug y proporcionar logs detallados. Gracias a todos los beta testers por su paciencia.

---

## 🔗 Enlaces

- **GitHub:** https://github.com/Ppkeash/TECNILAND-Nexus
- **Issues:** https://github.com/Ppkeash/TECNILAND-Nexus/issues
- **Discord:** https://discord.gg/53T4Tzrea3
- **Reportar Bugs:** https://github.com/Ppkeash/TECNILAND-Nexus/issues/new

---

## 🎯 Próximo: Fase 1

Ahora que el bug crítico está resuelto, continuamos con el roadmap:

- **TECNILAND Account** - Sistema de cuentas propias
- **Yggdrasil Server** - Skins in-game funcionales
- **Access Keys** - Control de beta testers
- **Panel Web** - Administración centralizada

---

## 📝 Notas

- **Tamaño:** ~279 MB
- **Requiere:** Windows 10/11 (64-bit)
- **RAM Mínima:** 4 GB
- **Espacio:** 2 GB libre
- **Compatible con:** Todos los modpacks TECNILAND

---

**¡Gracias por usar TECNILAND Nexus!** 🎮

*Si encuentras algún otro bug, por favor repórtalo en [GitHub Issues](https://github.com/Ppkeash/TECNILAND-Nexus/issues).*
