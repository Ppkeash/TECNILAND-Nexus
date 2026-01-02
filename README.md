# 🟢 TECNILAND Nexus

**Un launcher de Minecraft moderno, estable y pensado para la comunidad TECNILAND.**

> 🌍 [English](README.en.md) | 🇪🇸 **Español**

---

## 📋 Índice Completo

1. [Resumen ejecutivo](#-resumen-ejecutivo)
2. [Sobre TECNILAND Nexus](#-sobre-tecniland-nexus)
3. [Estado actual (Beta)](#-estado-actual-beta)
4. [Características implementadas (Fase 1)](#-características-implementadas-fase-1)
5. [OptiFine: integración especial](#-optifine-integración-especial)
6. [Modpacks TECNILAND: sistema Nebula + Cloudflare R2](#-modpacks-tecniland-sistema-nebula--cloudflare-r2)
7. [Tabla de estado real (✅/🟡/⬜)](#-tabla-de-estado-real)
8. [Roadmap detallado (próximas fases)](#-roadmap-detallado-próximas-fases)
9. [Instalación y primeros pasos](#-instalación-y-primeros-pasos)
10. [Guía completa de uso](#-guía-completa-de-uso)
11. [Desarrollo y arquitectura](#-desarrollo-y-arquitectura)
12. [Glosario de términos](#-glosario-de-términos)
13. [Ideas y mejoras futuras](#-ideas-y-mejoras-futuras)
14. [Licencia y créditos](#-licencia-y-créditos)
15. [Soporte y contacto](#-soporte-y-contacto)

---

## 🎯 Resumen ejecutivo

**TECNILAND Nexus** es un fork especializado de [HeliosLauncher](https://github.com/dscalzi/HeliosLauncher) enfocado en:

- ✅ **Soporte Forge estable:** Minecraft 1.13 → 1.21.x completamente funcional.
- ✅ **Gestión automática de Java:** detección inteligente + descarga automática.
- ✅ **Cuentas Offline:** jugar sin Microsoft Account, con soporte de skins locales.
- ✅ **Diagnóstico en tiempo real:** Live Log Viewer con exportación a archivo.
- ✅ **OptiFine integrado:** flujo especial para instalación y detección.
- ✅ **Modpacks TECNILAND:** sistema de distribución basado en Nebula + Cloudflare R2.
- ✅ **UI profesional:** tema verde/negro TECNILAND, responsivo, intuitivo.
- 🟡 **Multi-loader experimental:** Fabric/Quilt en desarrollo, **NeoForge en modo mantenimiento** (inestable).

> 🚧 **ADVERTENCIA IMPORTANTE:** NeoForge 1.20.4 está en modo mantenimiento debido a inestabilidad crítica (crashes frecuentes con JPMS, requiere Java 17 exacto, workarounds complejos). **Recomendamos usar Forge estable (1.20.1/1.20.6).** Si intentas usar NeoForge, el launcher te pedirá confirmación en cada lanzamiento.

Estado: **Beta 0.x.x** (funcional, en desarrollo activo).

---

## 🎮 Sobre TECNILAND Nexus

### Visión

TECNILAND Nexus nace con la ambición de ser más que un launcher. Queremos crear un **ecosistema** donde jugadores y modders disfruten Minecraft modded sin dolor:

- Sin errores de Forge sin sentido.
- Sin "¿cuál es la versión de Java que necesito?"
- Sin logs que no entiendes.
- Sin cuentas obligatorias.

### Principios de diseño

1. **Estabilidad primero:** antes de añadir features, consolidar lo actual.
2. **Diagnóstico real:** si algo falla, el usuario puede ver logs + exportarlos.
3. **UX pensada:** navegación simple, estética coherente (verde/negro TECNILAND).
4. **Crecimiento modular:** features por fases, sin romper lo funcional.

### ¿Por qué un fork de HeliosLauncher?

- Base sólida de un launcher real (usado en comunidades grandes).
- Arquitectura modular (fácil extender).
- Código limpio (mejor que empezar desde cero).
- Tiempo de desarrollo más eficiente.

---

## 📊 Estado actual (Beta)

### Tabla de compatibilidad Minecraft/Forge

Hemos probado exhaustivamente todas las versiones desde 1.13 hasta 1.21.x. Aquí está el resumen:

| Versión MC | Estado | Detalles | Java recomendado |
|-----------|--------|---------|------------------|
| 1.13.x    | ✅ OK  | Funcional, cuentas offline soportadas | Java 8-11 |
| 1.14.x    | ✅ OK  | Soporte completo | Java 8-11 |
| 1.15.2    | ✅ OK  | Arreglado: Log4j2 conflict resolution | Java 8-11 |
| 1.16.x    | ✅ OK  | Todas las variantes (1.16.0-1.16.5) funcionales | Java 8-11 |
| 1.17.1    | ✅ OK  | Soporte completo | Java 16-17 |
| 1.18.2    | ✅ OK  | Versión estable muy utilizada | Java 17 |
| 1.19.4    | ✅ OK  | Arreglado: Classpath deduplication | Java 17 |
| 1.20.1    | ✅ OK  | **Soporte completo, muy estable** | Java 17 |
| 1.21.x    | ✅ OK  | Arreglado: Forge universal + client JAR handling | Java 17-21 |

**Nota:** El JavaManager automático del launcher elige la versión correcta. No tienes que hacer nada.

---

## ✨ Características implementadas (Fase 1)

### 🎯 Fase 1: Core (Completada)

#### 1. Multi-Loader Forge (Completado)
Soporte completo de Forge 1.13–1.21.x con integración automática.

**Características:**
- Descarga e instalación de instaladores Forge.
- Ejecución de processors (sin errores de módulo).
- Classpath management inteligente (deduplicación automática de librerías).
- Generación automática de `version.json` compatible con Minecraft/Forge.
- Manejo correcto de múltiples versiones de Forge en el mismo launcher.

**Ejemplo de flujo:**
```
Usuario selecciona: Minecraft 1.20.1 + Forge 47.3.0
↓
Launcher descarga: instalador de Forge 47.3.0
↓
Ejecuta processors: (correcciones de librerías, patches)
↓
Genera version.json: listo para lanzar Minecraft
↓
Usuario hace click en "Jugar" → Minecraft + Forge inicia
```

**Beneficio:** El usuario no toca nada; el launcher maneja toda la magia.

---

#### 2. JavaManager Automático (Completado)
Sistema inteligente de gestión de versiones de Java.

**Características:**
- Detección automática de JDKs instalados en el sistema.
- Asignación inteligente de versión por Minecraft:
  - MC 1.13–1.16.x → Java 8/11/17.
  - MC 1.17–1.20.x → Java 17.
  - MC 1.20.5+ → Java 17/21.
- Descarga automática de Java desde Oracle/Eclipse si no está disponible.
- Fallback graceful: si falla todo, mensaje claro y opciones al usuario.

**Ejemplo de flujo:**
```
Usuario intenta jugar MC 1.20.1
↓
Launcher detecta: "Java 8 instalado, pero MC 1.20.1 necesita Java 17"
↓
Descarga Java 17 automáticamente (~ 200 MB)
↓
Configura rutas + variables de entorno
↓
Minecraft inicia sin que el usuario haga nada
```

**Beneficio:** Adiós a "Java version mismatch". El launcher arregla esto automáticamente.

---

#### 3. Cuentas Offline (Completado)
Soporte completo de cuentas locales sin Microsoft Account.

**Características:**
- Crear cuentas locales con cualquier nombre.
- Persistencia: las cuentas se guardan en configuración del launcher.
- Skins locales cargables (almacenados localmente en formato PNG).
- Soporte para UUID generado localmente (compatible con Minecraft offline).
- Cambiar de cuenta sin reiniciar el launcher.

**Ejemplo de flujo:**
```
Inicio de sesión Offline:
1. Click en "Login" → "Offline"
2. Escribe: "SuNombreAleatório"
3. Click "Crear"
↓
Launcher crea carpeta con datos de cuenta:
- UUID local
- Datos de perfil
- Skin (si la cargaste)
↓
Ahora ese nombre aparece en "Cuentas" para sesiones futuras
```

**Beneficio:** Juega con amigos sin obligación de cuentas Microsoft. Ideal para servidores privados.

---

#### 4. Live Log Viewer Nativo (Completado)
Panel de logs integrado en el launcher para diagnóstico real.

**Características:**
- Captura en tiempo real de stdout/stderr de Minecraft.
- Buffer circular eficiente (máximo 1000 líneas).
- Color-coding automático:
  - INFO → Verde
  - WARN → Naranja
  - ERROR → Rojo
  - DEBUG → Cian
- Timestamps `[HH:MM:SS]` en cada línea.
- Botones de acción:
  - Limpiar: borra el buffer.
  - Copiar: copia todo a portapapeles.
  - Exportar: guarda a archivo `.txt` con timestamp.
- Tema oscuro verde/negro alineado con branding TECNILAND.
- Toggle en Ajustes → Launcher → "Mostrar logs en vivo".

**Ejemplo:**
```
[14:23:45] [INFO] Minecraft started
[14:23:47] [WARN] Some mods might not be compatible
[14:23:50] [ERROR] ClassNotFoundException: com.example.Mod
[14:23:51] [INFO] Game crashed
```

**Beneficio:** Diagnóstico visual. Si algo falla, exporta el log y envíalo a soporte.

---

#### 5. Gestor de Instalaciones Personalizado (Completado)
Crear, editar y eliminar instalaciones custom.

**Características:**
- Crear instalaciones con versión de MC + Loader elegidos.
- Editar nombre, descripción, versión.
- Eliminar instalaciones (con confirmación).
- Sincronización automática de carpeta `instances/` del launcher.
- Cada instalación es independiente (mods, configs, skins locales, etc).

**Ejemplo:**
```
Instalación 1: "SkyFactory 4" (MC 1.12.2 + Forge)
Instalación 2: "Modpack Propio" (MC 1.20.1 + Forge 47.3.0)
Instalación 3: "Vanilla Puro" (MC 1.20.1 sin mods)

Cada una tiene su carpeta independiente en instances/.
```

---

#### 6. Modpacks TECNILAND (Completado - Base)
Sección dedicada con modpacks preconfigurados.

**Características:**
- Sección "TECNILAND" en el menú principal.
- Instalación con un clic (descarga + extrae + listo).
- Separación clara en UI entre TECNILAND y instalaciones custom.
- Información del modpack (nombre, versión, tamaño, descripción).
- Botón "Jugar" directo para iniciar modpack instalado.

**Nota:** La distribución actual se basa en Nebula + Cloudflare R2 (ver sección dedicada).

---

#### 7. UI Profesional e Integración (Completada)
Diseño y navegación del launcher.

**Características:**
- Diseño responsivo en Electron (se adapta a diferentes tamaños de ventana).
- Tema verde/negro coherente (branding TECNILAND).
- Navegación intuitiva con tabs y menús.
- Traducciones: Español (es_ES) e Inglés (en_US).
- Botones y controles claros (sin tecnicismos).

**Elementos visuales:**
- Header con logo TECNILAND + usuario actual.
- Sidebar con navegación: Inicio, Instalaciones, Modpacks, Ajustes.
- Panel principal: listado de instalaciones/modpacks.
- Panel secundario: logs (si está activado).

---

## 🎨 OptiFine: integración especial

OptiFine es un mod especial que mejora el rendimiento gráfico de Minecraft. Su instalación es diferente a otros mods, así que TECNILAND Nexus tiene un **flujo dedicado**.

### ¿Qué es OptiFine?

OptiFine es un mod que optimiza Minecraft para FPS más altos y gráficos mejores. Es "transparente" (no añade contenido nuevo, solo optimiza lo existente).

### Flujo de OptiFine en TECNILAND Nexus

1. **Detección automática:** el launcher detecta si OptiFine está instalado.
2. **Instalación dedicada:** flujo especial para instalar OptiFine.jar correctamente.
3. **Compatibilidad:** verifica que la versión de OptiFine sea compatible con MC + Forge.
4. **Toggle opcional:** puede activarse/desactivarse sin desinstalar.

### ¿Cómo usar OptiFine?

```
Ajustes → Optimizaciones → "Instalar/Activar OptiFine"
↓
El launcher descarga la versión correcta para tu MC
↓
Reinicia Minecraft
↓
¡OptiFine activo! (mejor rendimiento)
```

### Notas técnicas

- OptiFine se instala como un mod especial (no como modpack).
- Puede coexistir con otros mods, pero algunos conflictúan.
- El launcher muestra advertencias si detecta conflictos conocidos.

---

## 🧩 Modpacks TECNILAND: sistema Nebula + Cloudflare R2

Esta sección describe el **sistema real de distribución** de modpacks TECNILAND que ya está funcionando.

### ¿Qué es Nebula?

**Nebula** es una herramienta para generar modpacks distribuidores. Toma una carpeta local con mods/configs y genera:

1. Un archivo **`distribution.json`** (metadatos + hashes de archivos).
2. Una carpeta **`servers/`** con todos los archivos organizados.

Luego subimos todo a un hosting (Cloudflare R2 en nuestro caso) y el launcher descarga desde ahí.

### ¿Qué es Cloudflare R2?

**Cloudflare R2** es un servicio de almacenamiento en la nube (tipo AWS S3). Permite:
- Subir archivos (modpacks, índices, etc).
- Servirlos vía HTTPS pública.
- Bajo costo y buena velocidad.

### Pipeline actual: Cómo publicamos modpacks TECNILAND

```
Paso 1: Preparar modpack local
├─ carpeta: TECNILAND_OG/
├─ contiene: mods/, config/, assets/, options.txt, etc

Paso 2: Generar con Nebula
├─ Comando: npm run start -- g server tecniland-og 1.20.1 --forge 47.3.0
├─ Resultado: D:\TestRoot2\servers\tecniland-og-1.20.1\
├─ Genera: distribution.json con hashes MD5 de cada archivo

Paso 3: Subir a Cloudflare R2
├─ rclone sync D:\TestRoot2 r2:tecniland-modpacks/nebula
├─ Resultado: URL pública de distribution.json

Paso 4: El launcher descarga desde R2
├─ URL: https://pub-[tu-bucket].r2.dev/nebula/distribution.json
├─ Launcher lee la distro + descarga solo diferencias
├─ Usuario hace click en "Instalar" → modpack instalado
```

### ✅ Estado actual del sistema Modpacks TECNILAND

| Aspecto | Estado | Detalles |
|---------|--------|---------|
| Generación de distro (Nebula) | ✅ Hecho | `g server` + `g distro` funciona perfectamente. |
| Upload a R2 (rclone sync) | ✅ Hecho | Archivos subidos, URL pública funcional. |
| Descarga en launcher | ✅ Hecho | Launcher lee distro remota + descarga archivos. |
| Validación de integridad | ✅ Hecho | MD5 verifica que archivos sean correctos. |
| Instalación con 1 click | ✅ Hecho | Usuario ve botón "Instalar" + progreso. |
| **Desinstalar modpack** | ⬜ Pendiente | No existe UI para eliminar modpack. |
| **Mostrar tamaño/peso** | ⬜ Pendiente | No muestra cuánto ocupa el modpack. |
| **Updates sin re-descargar** | 🟡 Parcial | Funciona por hash, pero sin UI clara de "actualización". |
| **Repair/Update botón** | ⬜ Pendiente | No existe UI para reparar instalación dañada. |
| **Política de configs** | ⬜ Pendiente | No se respetan cambios en `options.txt` en updates. |
| **Estética TECNILAND** | 🟡 Parcial | UI base existe, pero puede mejorarse (cards, estado, etc). |

### 🔧 Derivaciones (tareas para cerrar "Modpacks TECNILAND v1.0")

Estas son las mejoras que convierten el sistema en "producto profesional":

#### A. Gestión de espacio

- [ ] **Desinstalar modpack** desde UI
  - Click derecho en modpack → "Desinstalar"
  - Borra carpeta de instalación + caché asociado
  - Libera espacio en disco

- [ ] **Mostrar tamaño/peso**
  - Tamaño total del modpack
  - Espacio ya descargado
  - Espacio requerido antes de instalar
  - Espacio libre en disco (advertencia si falta)

#### B. Updates confiables

- [ ] **Verificar que "Jugar" NO re-descarga todo**
  - Si el modpack está instalado, valida hashes
  - Solo descarga lo que cambió
  - No toca archivos del usuario (`options.txt`, `config/`)

- [ ] **Implementar Repair/Update UI**
  - Botón "Repair" en el modpack instalado
  - Opciones:
    - Repair rápido (mods/loader): sin tocar configs
    - Full Repair (restaurar todo a oficial)
  - Progreso visual + logs en vivo

- [ ] **Política de preservación**
  - `options.txt`: preset inicial, pero editable por usuario (NO pisar en updates)
  - `config/`: idem (usuario puede editarlo)
  - `mods/`: SIEMPRE sincronizar con distro oficial
  - `forgemods/`: igual que mods

#### C. UX TECNILAND (estética)

- [ ] **Cards de modpacks mejoradas**
  - Imagen/preview del modpack
  - Nombre + descripción
  - Estado: "Instalado", "Actualizando", "Listo para instalar"
  - Botones: Instalar / Jugar / Desinstalar

- [ ] **Progreso visual durante instalación**
  - Barra de progreso (%)
  - Archivo actual descargando
  - Velocidad de descarga (KB/s)
  - Tiempo estimado

- [ ] **Mejoras visuales generales**
  - Tipografía coherente (Minecraft font para títulos)
  - Paleta de colores verde/negro mejorada
  - Iconos modernos (tamaño, descargas, etc)
  - Animaciones suaves

---

## 📋 Tabla de estado real

> Esta tabla es la **fuente de verdad** del proyecto. Se actualiza con cada sesión de desarrollo.

| Módulo | Feature | Estado | Notas | Prioridad |
|--------|---------|--------|-------|-----------|
| **Core** | Forge 1.13–1.21.x | ✅ Hecho | Pipeline completo | - |
| **Core** | JavaManager automático | ✅ Hecho | Detecta + descarga | - |
| **Core** | Cuentas Offline | ✅ Hecho | Persistencia + skins | - |
| **Core** | Live Log Viewer | ✅ Hecho | Logs + exportar | - |
| **Core** | Gestor instalaciones | ✅ Hecho | Crear/editar/eliminar | - |
| **Loaders** | Fabric | 🟡 Experimental | Detrás de toggle | Baja |
| **Loaders** | Quilt | 🟡 Experimental | Detrás de toggle | Baja |
| **Loaders** | NeoForge | � Mantenimiento | **Inestable, gate activo** | **Ver advertencia** |
| **Optimización** | OptiFine | ✅ Hecho | Flujo dedicado | - |
| **Modpacks** | Sección TECNILAND | ✅ Hecho | Menú + UI | - |
| **Modpacks** | Generación (Nebula) | ✅ Hecho | `g distro` funciona | - |
| **Modpacks** | Upload a R2 | ✅ Hecho | rclone sync ok | - |
| **Modpacks** | Desinstalar | ⬜ Pendiente | Agregar botón | **Alta** |
| **Modpacks** | Mostrar tamaño | ⬜ Pendiente | Parseár distro | **Alta** |
| **Modpacks** | Repair/Update UI | ⬜ Pendiente | Nueva UI + lógica | **Muy alta** |
| **Modpacks** | No pisar configs | ⬜ Pendiente | Policy + validación | **Muy alta** |
| **UI/UX** | Estética TECNILAND | 🟡 Parcial | Tema base existe | Media |
| **Release** | Auto-update launcher | ⬜ Pendiente | Update checker | Baja |
| **Comunidad** | Discord Rich Presence | ⬜ Pendiente | Integración Discord | Baja |
| **Backend** | Servidor TECNILAND | ⬜ Pendiente | Backend + sync | Muy baja |

---

## 🗓️ Roadmap detallado (próximas fases)

### 📋 Fase 2: Multi-Loader (En desarrollo)

> 🚧 **IMPORTANTE:** NeoForge 1.20.4 está en modo mantenimiento y no forma parte activa de esta fase debido a inestabilidad crítica. Ver advertencia en la sección [Resumen ejecutivo](#-resumen-ejecutivo).

Objetivo: Consolidar soporte para Fabric y Quilt.

**Tareas:**
- [ ] **Soporte Fabric completo**
  - Descarga de instaladores Fabric
  - Meta API para versiones
  - Testing Fabric 1.14–1.21.x
  - Detrás del toggle de experimentales

- [ ] **Soporte Quilt completo**
  - Integración similar a Fabric
  - Compatibilidad mods Fabric + Quilt propios
  - Testing Quilt 1.14–1.21.x

- [x] **NeoForge: Maintenance gate implementado**
  - ✅ Gate ephemeral activo (confirmación cada launch)
  - ✅ Modal de advertencia con detalles de inestabilidad
  - ✅ Recomendación de usar Forge estable
  - ❌ NO se desarrollará activamente hasta resolver problemas JPMS

- [ ] **Toggle consolidado de "Loaders experimentales"**
  - ✅ Ya implementado (mejorar UI si aplica)
  - Oculta/expone Fabric, Quilt, NeoForge por defecto
  - Modal de advertencia para desarrolladores

**Criterios de aceptación:**
- Al menos 3 versiones de Fabric y Quilt testeadas.
- Sin crashes al cambiar de loader.
- Logs claros si algo falla.

---

### 🧰 Fase 2.5 (Nueva): Repair / Update UI (Mantenimiento)

Objetivo: que el usuario pueda mantener su instalación sana sin reinstalar todo.

**Tareas críticas:**
- [ ] Botón "Repair" visible en:
  - [ ] Instalaciones custom
  - [ ] Modpacks TECNILAND

- [ ] Repair rápido (mods/loader) sin pisar configs del usuario
  - [ ] Validar hashes de mods/loader
  - [ ] Re-descargar solo lo dañado
  - [ ] Mantener `options.txt`, `config/`, `defaultconfigs/`

- [ ] Full Repair (restaurar estado oficial completo)
  - [ ] Opción de "restaurar todo"
  - [ ] Confirmación (con advertencia de datos perdidos)

- [ ] Progreso claro + logs en vivo
  - [ ] Barra de progreso
  - [ ] Logs en tiempo real (sin congelar UI)

- [ ] Resultado final: "Listo para jugar" o "Error con reporte"
  - [ ] Mensaje claro al usuario
  - [ ] Opción de exportar logs si hay error

**Estimación:** 2-3 sesiones de trabajo con Copilot.

---

### 🎯 Fase 3: Modpacks TECNILAND v1.0 (Producto real)

Objetivo: cerrar las "derivaciones" del sistema Modpacks (ver sección anterior).

**Tareas por prioridad:**

**Muy alta (hacer primero):**
- [ ] Desinstalar modpack (UI + lógica)
- [ ] Mostrar tamaño/peso del modpack
- [ ] Repair/Update botón (continuación de Fase 2.5)
- [ ] No pisar `options.txt` en updates (política)

**Alta:**
- [ ] Canales Stable/Beta para releases del modpack
- [ ] Updates confiables sin re-descargas completas
- [ ] Pulido UI TECNILAND (cards, estado, animaciones)

**Media:**
- [ ] Vista previa de modpack (screenshot/preview)
- [ ] Información del creador
- [ ] Historial de versiones

**Estimación:** 4-5 sesiones.

---

### 🌐 Fase 4: Integración y Comunidad

Objetivo: integraciones externas + features sociales.

**Tareas:**

- [ ] **Discord Rich Presence**
  - Mostrar en Discord: "Jugando en [Modpack] - MC [Versión]"
  - Tiempo de juego
  - Botones "Unirse" si aplica

- [ ] **Sistema de Skins mejorado**
  - Subir skins con cuenta offline (UI)
  - Galería local de skins (carpeta `skins/`)
  - Sincronización entre usuarios (futuro)

- [ ] **Auto-actualización del Launcher**
  - Detector de nuevas versiones
  - Descarga e instalación automática
  - Changelog visible

- [ ] **Importar Modpacks ZIP** (feature bonus)
  - Drag & drop o selector de archivos
  - Descompresión automática
  - Validación de estructura
  - Instalación en `instances/`

**Estimación:** 3-4 sesiones.

---

### 📊 Fase 5: Analytics y Progresión

Objetivo: estadísticas y logros.

**Tareas:**

- [ ] **Sistema de Estadísticas**
  - Tiempo jugado por modpack
  - Últimos modpacks jugados
  - Dashboard en home con gráficos visuales

- [ ] **Sistema de Logros/Badges**
  - Desbloqueo de badges (ej: "Primera instalación")
  - Sincronización con servidor (futuro)

**Estimación:** 2-3 sesiones.

---

### 🚀 Fase Final: Backend e IA

Objetivo: infraestructura centralizada + asistencia inteligente.

**Tareas:**

- [ ] **Servidor Backend TECNILAND**
  - API para sincronización de skins
  - Almacenamiento de estadísticas
  - Noticias centralizadas
  - Sistema de perfiles de usuario
  - Hosted en sitio WEB oficial TECNILAND (en desarrollo)

- [ ] **Multiplayer Directo**
  - Crear servidores temporales
  - Invitar amigos directamente
  - Sin configuración manual

- [ ] **Tienda de Cosméticos**
  - Skins exclusivos
  - Temas de launcher
  - Efectos visuales

- [ ] **Asistente de IA Integrado**
  - Resolver crashes automáticamente
  - Q&A sobre configuración
  - Soporte técnico 24/7

- [ ] **Tutoriales y Guías en Vídeo**
  - Onboarding para usuarios nuevos
  - Guías de features
  - Troubleshooting visual

**Estimación:** 10+ sesiones (proyecto largo plazo).

---

## 📥 Instalación y primeros pasos

### Requisitos previos

- **Node.js** v18+ ([descargar](https://nodejs.org/))
- **Git** para clonar el repositorio
- **Java** (el launcher gestiona versiones, pero tener Java 17 nunca duele)

### Instalación (desarrollo)

```bash
# 1. Clonar el repositorio
git clone https://github.com/Ppkeash/TECNILAND-Nexus.git
cd TECNILAND-Nexus

# 2. Instalar dependencias
npm install

# 3. Ejecutar en desarrollo
npm start
```

Se abrirá el launcher en modo desarrollo. Desde aquí puedes:
- Crear cuentas offline
- Crear instalaciones custom
- Ver logs en vivo
- Instalar modpacks TECNILAND

### Build para distribución (opcional, no recomendado aún)

```bash
npm run dist
```

Genera ejecutables en `dist/` para Windows, macOS y Linux.

**Nota:** Aún estamos en Beta, así que los builds automáticos pueden tener bugs. Mejor seguir usando `npm start` para desarrollo.

---

## 🎮 Guía completa de uso

### 1. Primer inicio: Crear cuenta offline

```
1. Abre el launcher (npm start)
2. Botón: "Login" → "Offline"
3. Escribe tu nombre (ej: "TuNombreAqui")
4. Click: "Crear cuenta"
5. ¡Listo! Ya estás dentro
```

Esa cuenta se guardará localmente. La próxima vez que abras el launcher, solo selecciona tu cuenta y listo.

**Tip:** Puedes crear múltiples cuentas. Ideal si compartes el launcher con amigos.

---

### 2. Crear una instalación custom

```
1. En el launcher, haz click en "Instalaciones" (sidebar)
2. Click en botón "+" o "Nueva instalación"
3. Rellena:
   - Nombre: "Mi Modpack" (cualquier nombre)
   - Versión de MC: 1.20.1 (elige la que quieras)
   - Loader: Forge (recomendado)
4. Click: "Crear"
5. Espera a que descargue e instale Forge (puede tardar 1-2 min)
6. Una vez lista, aparecerá en tu lista de instalaciones
```

**Nota:** Cada instalación es independiente. Puedes tener varias versiones de MC sin conflictuar.

---

### 3. Instalar mods (en una instalación custom)

```
1. En tu instalación, click derecho → "Abrir carpeta de instalación"
2. Copia tus archivos:
   - mods/ → carpeta mods dentro de la instalación
   - config/ → carpeta config
   - assets/ → si tienes
3. Cierra la carpeta
4. En el launcher, click "Jugar" en esa instalación
5. Minecraft abre con tus mods
```

---

### 4. Usar Live Log Viewer

```
1. Ajustes (sidebar) → "Launcher" → Toggle "Mostrar logs en vivo"
2. Vuelve a jugar una instalación
3. Aparecerá un panel a la derecha con logs en tiempo real
4. Si algo crashea, exporta los logs:
   - Click botón "Exportar"
   - Guarda archivo .txt
   - Comparte con soporte si tienes problema
```

**Colores:**
- Verde = INFO (información normal)
- Naranja = WARN (advertencia)
- Rojo = ERROR (problema grave)
- Cian = DEBUG (información técnica)

---

### 5. Instalar modpack TECNILAND

```
1. En el launcher, menú "TECNILAND" (sidebar)
2. Elige un modpack (ej: "TECNILAND OG")
3. Click: "Instalar"
4. Espera a que descargue todos los archivos
5. Una vez listo, aparecerá botón "Jugar"
6. Click "Jugar" → entra directamente al modpack
```

**Nota:** Los modpacks TECNILAND ya tienen todo: mods, configs, skins, optimizaciones. Solo instala y juega.

---

### 6. Usar OptiFine (cuando esté disponible)

```
1. Ajustes → "Optimizaciones" → "Instalar OptiFine"
2. Elige versión de MC
3. El launcher descarga + instala
4. Reinicia Minecraft
5. ¡Más FPS! (OptiFine mejora rendimiento)

Para desactivar:
1. Ajustes → "Optimizaciones" → toggle "Desactivar OptiFine"
2. Reinicia
```

---

## 🛠️ Desarrollo y arquitectura

### Stack tecnológico

- **Electron:** Framework para apps de escritorio (Windows, macOS, Linux)
- **Node.js + JavaScript:** Backend del launcher
- **HTML/CSS:** UI responsiva y bonita
- **electron-builder:** Compilación de ejecutables
- **helios-core:** Librería de Helios Launcher para manejo de instalaciones

### Estructura del proyecto

```
TECNILAND-Nexus/
├── app/
│   ├── assets/
│   │   ├── css/                    # Estilos (tema verde/negro)
│   │   │   ├── main.css            # Estilos principales
│   │   │   ├── dark-theme.css      # Tema oscuro
│   │   │   └── components.css      # Componentes (cards, botones)
│   │   ├── js/                     # Lógica del launcher
│   │   │   ├── forgeprocessor.js   # Procesamiento de Forge + librerías
│   │   │   ├── loaderinstaller.js  # Instalación de loaders (Forge/Fabric)
│   │   │   ├── javamanager.js      # Detección + descarga de Java
│   │   │   ├── livelogviewer.js    # Panel de logs en tiempo real
│   │   │   ├── processbuilder.js   # Construcción de comandos Minecraft
│   │   │   ├── configmanager.js    # Persistencia de configuración
│   │   │   ├── skincache.js        # Caché local de skins
│   │   │   └── modpackmanager.js   # Gestión de modpacks (futuro)
│   │   ├── html/
│   │   │   ├── index.html          # UI principal
│   │   │   ├── settings.html       # Panel de ajustes
│   │   │   └── modpacks.html       # Sección de modpacks
│   │   └── images/                 # Logo, iconos, assets
│   ├── main.js                     # Entry point de Electron
│   └── preload.js                  # Seguridad (context isolation)
├── src/                            # Código fuente de Electron (futura refactorización)
├── docs/                           # Documentación técnica
├── package.json                    # Dependencias y scripts
├── .gitignore                      # Archivos ignorados
└── README.md                       # Este archivo
```

### Flujo de una sesión típica

```
Usuario abre launcher (npm start)
    ↓
main.js crea ventana Electron
    ↓
UI (index.html) carga + se renderiza
    ↓
configmanager.js carga configuración guardada (cuentas, instalaciones)
    ↓
Usuario interactúa:
    - Click "Nueva instalación" → loaderinstaller.js descarga Forge
    - Click "Jugar" → javamanager.js verifica Java
           → processbuilder.js construye comando Minecraft
           → se lanza proceso (subprocess)
    - Click "Exportar logs" → livelogviewer.js guarda .txt
```

### Cómo contribuir

1. **Fork** el repositorio
2. Crea una rama: `git checkout -b feature/tu-feature`
3. Haz cambios + commits: `git commit -m "Add: descripción"`
4. Push: `git push origin feature/tu-feature`
5. Abre un Pull Request en GitHub

**Regla:** Siempre comenta tu código. Los futuros desarrolladores (incluyéndote) lo agradecerán.

### Linting y calidad de código

```bash
# Revisar errores de linting
npm run lint

# Arreglar automáticamente
npm run lint -- --fix
```

Usamos **ESLint** para mantener código consistente. Antes de hacer PR, asegurate que no haya errores.

---

## 📖 Glosario de términos

### Términos técnicos explicados para no técnicos

| Término | Definición simple |
|---------|------------------|
| **Launcher** | App que descarga Minecraft + mods + optimizaciones. Luego lo inicia. |
| **Forge** | Sistema que permite añadir mods a Minecraft. Es "el intermediario". |
| **Mod** | Extensión que modifica Minecraft (añade bloques, mobs, mecánicas, etc). |
| **Modpack** | Colección prearmada de mods + configuración + assets. "Todo en uno". |
| **Instalación** | Carpeta con versión de MC + loader + mods. Puedes tener varias. |
| **Loader** | Sistema que "carga" los mods (Forge, Fabric, Quilt, NeoForge). |
| **Java** | Lenguaje en el que está hecho Minecraft. El launcher elige la versión correcta. |
| **JDK / JRE** | Software de Java. Necesario para ejecutar Minecraft. |
| **Distribution.json** | Archivo que describe qué archivos tiene un modpack + hashes (para validar). |
| **Hash / MD5** | "Huella digital" de un archivo. Si el hash no coincide, el archivo está dañado. |
| **Nebula** | Herramienta que genera distribution.json a partir de una carpeta de modpack. |
| **Cloudflare R2** | Servidor en la nube donde guardamos archivos del modpack. |
| **rclone** | Herramienta para sincronizar carpetas locales con servidores en la nube. |
| **Repair / Update** | Validar integridad de instalación + descargar lo faltante / cambios nuevos. |

---

## 💡 Ideas y mejoras futuras

### Ideas que podrían implementarse (sin orden de prioridad)

#### UX/UI
- [ ] Tema claro (light mode) además del oscuro.
- [ ] Personalización de colores (usuario elige paleta).
- [ ] Drag & drop de archivos para instalar modpacks.
- [ ] Vista previa en miniatura de modpacks.
- [ ] Búsqueda + filtrado de instalaciones/modpacks.

#### Rendimiento
- [ ] Caché agresivo de downloads (evitar re-descargas).
- [ ] Compresión de archivos antes de upload a R2.
- [ ] Descarga paralela de múltiples archivos.
- [ ] Gestor de espacio: limpiar archivos temporales automáticamente.

#### Estabilidad
- [ ] Auto-backup antes de updates (para revertir si algo falla).
- [ ] Validación de integridad post-instalación.
- [ ] Sistema de rollback a versión anterior de modpack.
- [ ] Detección de conflictos entre mods (y advertencias).

#### Comunidad
- [ ] Galería de skins compartidas (usuarios suben skins).
- [ ] Ranking de modpacks más jugados.
- [ ] Forum integrado en el launcher (chat de usuarios).
- [ ] Sistema de "favoritos" (marcar modpacks que usas frecuentemente).

#### Backend
- [ ] API REST para sincronizar datos entre PCs.
- [ ] Guardado de configuración en la nube (cloud sync).
- [ ] Estadísticas agregadas (cuántas horas jugadas total).
- [ ] Notificaciones de updates de modpacks.

#### IA / Automatización
- [ ] Detección de mods que causan crashes (análisis de logs).
- [ ] Recomendaciones de mods similares a los que usas.
- [ ] Auto-installer de dependencias de mods (si Mod A necesita Mod B).

### Propuestas de mejora (por categoría)

#### Accesibilidad
- [ ] Alto contraste (para usuarios con problemas de visión).
- [ ] Soporte de screen readers (para usuarios ciegos).
- [ ] Atajos de teclado configurables.

#### Localización
- [ ] Traducciones más completas (árabe, chino, japonés, etc).
- [ ] Conversión de tamaños en unidades locales (GB vs otros sistemas).

#### Seguridad
- [ ] Verificación de virus en mods descargados (integración con VirusTotal).
- [ ] Whitelist de modpacks "verificados" (firmados por TECNILAND).
- [ ] Sandboxing: ejecutar Minecraft en contenedor aislado (futuro).

---

## 📄 Licencia y créditos

### Licencia

**TECNILAND Nexus** utiliza la licencia **MIT**, heredada de HeliosLauncher.

```
MIT License

Copyright (c) 2017-2024 Daniel D. Scalzi (HeliosLauncher)
Copyright (c) 2024 Ppkeash (TECNILAND Nexus Extensions)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and subject to the persons to whom the Software is
furnished to do so, subject to the following conditions:

(Ver LICENSE.txt para el texto completo)
```

### Créditos principales

| Proyecto | Rol | Autor |
|----------|-----|-------|
| **HeliosLauncher** | Base original del launcher, arquitectura, login Microsoft | [Daniel D. Scalzi](https://github.com/dscalzi) |
| **TECNILAND Nexus** | Extensions: Forge, JavaManager, Live Log Viewer, UI, Modpacks | [Ppkeash](https://github.com/Ppkeash) |

### Recursos y comunidades

- [Minecraft Forge Documentation](https://docs.minecraftforge.net/)
- [Fabric Wiki](https://wiki.fabricmc.net/)
- [Java Downloads (Oracle + Eclipse)](https://www.java.com/)
- [Electron Documentation](https://www.electronjs.org/)
- [Node.js Documentation](https://nodejs.org/en/docs/)

---

## 📞 Soporte y contacto

### ¿Tienes un problema?

1. **GitHub Issues:** [Reporta bugs aquí](https://github.com/Ppkeash/TECNILAND-Nexus/issues)
   - Sé específico: versión del launcher, SO, pasos para reproducir
   - Adjunta logs (exporta desde Live Log Viewer)

2. **Discord:** *Próximamente integrado en el launcher*
   - [Servidor TECNILAND](https://discord.gg/eDmCZnc8tv)
   - Comunidad activa, soporte en vivo

3. **Email:** tutosmaspros@gmail.com
   - Para consultas formales o reportes sensibles

### ¿Quieres sugerir una feature?

- Abre un GitHub Issue con etiqueta "Enhancement"
- Describe qué quieres lograr (no cómo implementarlo)
- Si es posible, explica por qué lo necesitas

### ¿Quieres contribuir código?

- Lee la sección [Cómo contribuir](#cómo-contribuir)
- Fork → rama → cambios → PR
- Asegúrate que `npm run lint` no tenga errores

---

## 🎉 Agradecimientos finales

Este proyecto es posible gracias a:

- **La comunidad TECNILAND:** por confiar en este launcher.
- **HeliosLauncher:** por la base sólida.
- **Minecraft Forge:** por hacer posible los mods.
- **Tú:** por leer este README hasta el final 💚

---

**TECNILAND Nexus - Hecho con mucho amor 💚 para la comunidad de 💚 TECNILAND 💚.**

*Versión: 0.x.x-beta | Última actualización: Diciembre 2025*

---

## 📝 Notas de desarrollo (para el equipo)

### Sesiones de trabajo recientes (resumen)

- **Dic 12-13:** Pipeline Nebula + Cloudflare R2 funcionando. Distro.json generada + subida.
- **Dic 6-9:** Live Log Viewer completo + UI mejorada.
- **Nov 25-30:** Sistema offline implementado + UI base refinada.

### Deuda técnica conocida

- Refactorizar `processbuilder.js` (muy largo, dividir en módulos).
- Tests unitarios (falta cobertura).
- Documentación API interna (inline comments).

### Próximos pasos (orden sugerido)

1. Implementar Repair/Update UI (Fase 2.5).
2. Cerrar "derivaciones" de Modpacks (Fase 3).
3. Multi-loader consolidado (Fase 2).
