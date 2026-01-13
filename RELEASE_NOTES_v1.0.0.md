# 🎉 TECNILAND Nexus v1.0.0 - Primera Release Pública

> **Fecha de Release:** 12 de Enero, 2026  
> **Tipo:** Stable Release  
> **Plataforma:** Windows 10/11 (64-bit)

---

## 📝 Descripción

Primera versión pública de **TECNILAND Nexus**, un launcher personalizado diseñado para ofrecer la mejor experiencia de juego en servidores TECNILAND. Este launcher combina potencia, estabilidad y una interfaz moderna, todo en un solo lugar.

---

## ✨ Características Principales

### 🎮 **Sistema Multi-Loader**
- ✅ Soporte completo para **Forge**, **Fabric**, **Quilt** y **NeoForge**
- ✅ Detección automática de versiones compatibles
- ✅ Instalación simplificada de modpacks

### 👤 **Cuentas Offline**
- ✅ Creación de cuentas locales sin Microsoft
- ✅ Soporte para skins personalizados (preview en launcher)
- ⚠️ **Nota:** Skins in-game llegarán con TECNILAND Account (Fase 1)

### 🔧 **Gestor de Instalaciones**
- ✅ Crea instalaciones personalizadas con cualquier versión de Minecraft
- ✅ Selección de loader (Forge/Fabric/Quilt/NeoForge)
- ✅ Gestión automática de carpetas `instances/`

### 📦 **Sistema de Modpacks TECNILAND**
- ✅ Sección dedicada "TECNILAND SERVERS"
- ✅ Instalación automática de modpacks oficiales
- ✅ Sincronización de mods con el servidor

### ☕ **Gestión Inteligente de Java**
- ✅ Detección automática de Java instalado
- ✅ Descarga automática si no está disponible
- ✅ Validación de versión según Minecraft:
  - MC 1.16.5 o inferior → Java 8
  - MC 1.17.x - 1.20.4 → Java 17
  - MC 1.20.5+ → Java 21

### 📊 **Visor de Logs en Vivo**
- ✅ Captura en tiempo real de logs de Minecraft
- ✅ Colores automáticos: INFO (verde), WARN (naranja), ERROR (rojo)
- ✅ Exportar logs a `.txt`
- ✅ Buffer circular eficiente (1000 líneas)

### 🔄 **Auto-Actualizaciones**
- ✅ Sistema de actualizaciones automáticas
- ✅ Descarga en segundo plano
- ✅ Notificación cuando hay nuevas versiones

### 🎨 **UI/UX Moderna**
- ✅ Diseño Hero Header dinámico
- ✅ Sistema de iconos SVG optimizado
- ✅ Animaciones fluidas (fade-in, hover effects)
- ✅ Arquitectura CSS con metodología BEM

### 🎯 **Discord Rich Presence**
- ✅ Muestra estado del launcher en Discord
- ✅ Información del servidor actual
- ✅ Tiempo de juego en tiempo real

---

## 🐛 Correcciones Importantes

### **Bug Crítico: Descarga de Java** (Enero 2026)
- ✅ **Corregido:** Crash al intentar descargar Java automáticamente
- **Causa:** Error `Unknown distribution 'ADOPTIUM'` en helios-core 2.2.4
- **Solución:** Implementada detección de plataforma (TEMURIN en Windows/Linux, CORRETTO en macOS)
- 📄 **Detalles:** Ver [JAVA_DOWNLOAD_FIX_REPORT.md](docs/JAVA_DOWNLOAD_FIX_REPORT.md)

### **Mejoras en Forge Processors**
- ✅ Mejorada estabilidad en versiones Forge 1.15.2, 1.19.4
- ✅ Resolución de conflictos de Log4j2
- ✅ Deduplicación de classpath

### **Optimizaciones de Fabric**
- ✅ Corregido problema de classpath en Fabric
- ✅ Manejo correcto de mappings de Quilt
- ✅ Soporte para Fabric Loader 0.15.x+

---

## 🎯 Compatibilidad

### Minecraft Versions Testeadas

| Versión MC | Estado | Loader | Notas |
|-----------|--------|--------|-------|
| 1.13.x | ✅ OK | Forge | Funcional con cuentas offline |
| 1.14.x | ✅ OK | Forge | Soporte completo |
| 1.15.2 | ✅ OK | Forge | Conflicto Log4j2 resuelto |
| 1.16.5 | ✅ OK | Forge/Fabric | Muy estable |
| 1.17.1 | ✅ OK | Forge/Fabric | Soporte completo |
| 1.18.2 | ✅ OK | Forge/Fabric | Versión ampliamente usada |
| 1.19.4 | ✅ OK | Forge/Fabric | Classpath deduplicado |
| 1.20.1 | ✅ OK | Forge/Fabric/Quilt | Muy estable |
| 1.20.4 | ✅ OK | Forge/Fabric/NeoForge | Soporte NeoForge |
| 1.21.x | ✅ OK | Forge/Fabric/NeoForge | Última versión estable |

### Requisitos del Sistema

**Mínimos:**
- Windows 10 64-bit
- 4 GB RAM
- 2 GB espacio libre
- Conexión a internet

**Recomendados:**
- Windows 10/11 64-bit
- 8+ GB RAM
- 5 GB espacio libre
- Java 8/17/21 (se descarga automáticamente si falta)

---

## 📥 Instalación

1. **Descargar** `TECNILAND Nexus-setup-1.0.0.exe`
2. **Ejecutar** el instalador
3. **Seguir** el asistente de instalación
4. **Iniciar** TECNILAND Nexus desde el escritorio o menú inicio

⚠️ **Nota:** Windows SmartScreen puede mostrar advertencia "Editor desconocido" (el launcher no está firmado digitalmente). Click en "Más información" → "Ejecutar de todos modos".

---

## 🔄 Actualizaciones Automáticas

Este launcher incluye sistema de auto-actualizaciones:
- ✅ Verificación automática cada 30 minutos
- ✅ Descarga en segundo plano
- ✅ Instalación con un click

**Para verificar manualmente:**
1. Abre Configuración (⚙️)
2. Ve a "Actualizaciones"
3. Click en "Buscar Actualizaciones"

---

## ⚠️ Limitaciones Conocidas

### Skins In-Game
Las skins cargadas en cuentas offline solo son visibles en el **preview del launcher**. Para ver skins in-game se necesita un sistema de autenticación Yggdrasil, que llegará con **TECNILAND Account** (Fase 1).

### Firma Digital
El launcher no está firmado digitalmente, por lo que Windows SmartScreen mostrará una advertencia. Esto es normal y seguro.

---

## 🛠️ Solución de Problemas

### El launcher no inicia
- Verifica que tienes Windows 10/11 64-bit
- Reinstala desde el instalador

### "Error al descargar Java"
- Este bug fue corregido en v1.0.0
- Si persiste, instala Java manualmente desde [adoptium.net](https://adoptium.net)

### Minecraft no se inicia
1. Abre Configuración → Launcher → Ver Logs
2. Busca líneas en rojo (ERROR)
3. Reporta en Issues de GitHub con los logs

---

## 🔗 Enlaces

- **GitHub:** https://github.com/Ppkeash/TECNILAND-Nexus
- **Issues:** https://github.com/Ppkeash/TECNILAND-Nexus/issues
- **Discord:** https://discord.gg/53T4Tzrea3
- **Instagram:** [@ppzek_sh](https://www.instagram.com/ppzek_sh/)

---

## 👥 Para Beta Testers

Si eres beta tester de TECNILAND:

1. **Descarga** el instalador desde arriba
2. **Instala** y prueba todas las funcionalidades
3. **Reporta bugs** en el Discord o GitHub Issues
4. **Disfruta** de actualizaciones automáticas futuras

---

## 📋 Notas de Desarrollo

- **Base:** Fork de Helios Launcher by dscalzi
- **Personalización:** TECNILAND by Ppkeash
- **Licencia:** MIT
- **Versión Electron:** 33.2.1
- **Versión Node:** 20.x.x

---

## 🎯 Próximos Pasos (Roadmap)

### Fase 1: TECNILAND Account
- Sistema de cuentas propias
- Servidor de autenticación Yggdrasil
- Skins in-game funcionales
- Llaves de acceso para beta testers

### Fase 2: Backend Completo
- Panel web de administración
- Sistema de estadísticas
- Gestión de modpacks desde panel
- Update channels (Stable/Beta/Nightly)

### Fase 3: Características Avanzadas
- Capes personalizadas
- Sistema de logros
- Integración con tienda TECNILAND
- Modo offline completo

---

## 🙏 Agradecimientos

Gracias a todos los beta testers que hicieron posible esta primera release. Su feedback ha sido invaluable.

**¡Disfruta TECNILAND Nexus!** 🎮

---

*Para más información, consulta la [documentación completa](https://github.com/Ppkeash/TECNILAND-Nexus) en GitHub.*
