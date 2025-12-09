# 🟢 TECNILAND Nexus

**Un launcher de Minecraft moderno, estable y pensado para la comunidad.**

> 🌍 [English](README.en.md) | 🇪🇸 **Español**

---

## 📋 Índice

- [Sobre TECNILAND Nexus](#sobre-tecniland-nexus)
- [Estado Actual (Beta)](#estado-actual-beta)
- [Características Implementadas](#características-implementadas)
- [Roadmap & Próximas Features](#roadmap--próximas-features)
- [Instalación](#instalación)
- [Guía de Uso](#guía-de-uso)
- [Desarrollo](#desarrollo)
- [Licencia y Créditos](#licencia-y-créditos)

---

## 🎮 Sobre TECNILAND Nexus

**TECNILAND Nexus** es un fork especializado de [HeliosLauncher](https://github.com/dscalzi/HeliosLauncher) diseñado para ofrecer una experiencia optimizada en la instalación y gestión de versiones de Minecraft con soporte completo de **Forge 1.13+**.

Nace con la visión de ser más que un simple launcher: queremos crear un **ecosistema** donde jugadores y modders puedan disfrutar de Minecraft modded de forma fácil, intuitiva y confiable. Con características como:

- ✅ **Soporte Multi-Loader:** Forge completamente integrado (Fabric, Quilt, NeoForge en desarrollo).
- ✅ **JavaManager Automático:** Gestión inteligente de versiones de Java según cada instalación.
- ✅ **Live Log Viewer:** Panel de logs en tiempo real con diseño estético verde/negro TECNILAND.
- ✅ **Modpacks TECNILAND:** Instalaciones preconfiguradas listas para jugar.
- ✅ **Cuentas Offline:** Soporte completo de cuentas sin Microsoft Account.

Estamos en **fase Beta (0.x.x)**, lo que significa que el launcher es funcional y estable, pero aún está en desarrollo activo con nuevas features llegando regularmente.

---

## 📊 Estado Actual (Beta)

### ✅ Forge 1.13 → 1.21.x Completamente Funcional

Hemos probado exhaustivamente todas las versiones de Forge desde Minecraft 1.13 hasta 1.21.x. Aquí están los resultados:

| Versión MC | Estado | Detalles |
|-----------|--------|---------|
| 1.13.x    | ✅ OK  | Funcional, cuentas offline soportadas |
| 1.14.x    | ✅ OK  | Soporte completo |
| 1.15.2    | ✅ OK  | Arreglado: Log4j2 conflict resolution |
| 1.16.x    | ✅ OK  | Todas las variantes (1.16.0-1.16.5) funcionales |
| 1.17.1    | ✅ OK  | Soporte completo |
| 1.18.2    | ✅ OK  | Versión estable muy utilizada |
| 1.19.4    | ✅ OK  | Arreglado: Classpath deduplication |
| 1.20.1    | ✅ OK  | Soporte completo, muy estable |
| 1.21.x    | ✅ OK  | Arreglado: Forge universal + client JAR handling |

---

## ✨ Características Implementadas

### 🎯 Fase 1: Core (Completada)

- **Multi-Loader Forge** - Soporte completo Forge 1.13–1.21.x con integración automática de:
  - Instaladores Forge descargables.
  - Processors ejecutables sin errores de módulo.
  - Classpath management inteligente (deduplicación de librerías).
  - Generación automática de `version.json` compatible.

- **JavaManager Automático** - Sistema inteligente de gestión de Java:
  - Detección automática de JDKs instalados.
  - Asignación de versión correcta por MC version:
    - MC 1.13–1.16.x → Java 8/17.
    - MC 1.17–1.20.x → Java 17.
    - MC 1.20.5+ → Java 17/21.
  - Descarga automática de Java si no está disponible.
  - Fallback graceful con mensajes claros al usuario.

- **Cuentas Offline** - Gestión completa de cuentas sin Microsoft:
  - Crear cuentas locales con cualquier nombre.
  - Persistencia en la configuración del launcher.
  - Skins locales cargables (almacenados localmente).

- **Live Log Viewer Nativo** - Panel de logs integrado:
  - Captura en tiempo real de stdout/stderr de Minecraft.
  - Buffer circular eficiente (máx. 1000 líneas).
  - Color-coding automático: INFO (verde), WARN (naranja), ERROR (rojo), DEBUG (cian).
  - Timestamps `[HH:MM:SS]` en cada línea.
  - Botones: Limpiar, Copiar al portapapeles, Exportar a `.txt`.
  - Tema oscuro verde/negro alineado con branding TECNILAND.
  - Toggle en Ajustes → Launcher para habilitar/deshabilitar.

- **Gestor de Instalaciones Personalizado** (En Desarrollo)
  - Crear, editar, eliminar instalaciones custom.
  - Seleccionar versión de MC + Loader (Forge).
  - Sincronización automática de carpetas `instances/`.

- **Modpacks TECNILAND** (En Desarrollo)
  - Sección dedicada con modpacks preconfigurados.
  - Instalación con un clic.
  - Separación clara en UI entre TECNILAND y instalaciones custom.

- **Integración de UI Profesional**
  - Diseño responsivo en Electron.
  - Tema verde/negro coherente.
  - Navegación intuitiva con tabs y menús.
  - Traducciones: Español (es_ES) e Inglés (en_US).

---

## 🗓️ Roadmap & Próximas Features

### 📋 Fase 2: Multi-Loader (En Desarrollo)

- [ ] **Soporte Fabric** - Integración completa del loader Fabric.
  - Descarga de instaladores Fabric.
  - Meta API para versiones.
  - Testing exhaustivo Fabric 1.14–1.21.x.

- [ ] **Soporte Quilt** - Loader moderno basado en Fabric.
  - Integración similar a Fabric.
  - Compatibilidad con mods Fabric + Quilt propios.

- [ ] **Soporte NeoForge** - Fork moderno de Forge (1.20.2+).
  - Pipeline similar a Forge pero con endpoint NeoForge.
  - Diferencias de librerías y argumentos JVM.

- [ ] **Toggle de Loaders Experimentales** - Ya implementado.
  - Ocultar Fabric, Quilt, NeoForge por defecto.
  - Modal de advertencia para desarrolladores.

### 🎯 Fase 3: Importación y Gestión Avanzada

- [ ] **Importar Modpacks ZIP** - Drag & drop o selector de archivos.
  - Descompresión automática.
  - Validación de estructura.
  - Instalación en carpeta `instances/`.

- [ ] **Gestor de Modpacks Avanzado**
  - Vista previa de modpacks.
  - Información del creador.
  - Historial de versiones.
  - Actualizaciones automáticas.

### 🌐 Fase 4: Integración y Comunidad

- [ ] **Discord Rich Presence** - Mostrar estado en Discord.
  - "Jugando en [Modpack Name] - MC [Versión]".
  - Tiempo de juego.

- [ ] **Sistema de Skins Personalizado**
  - Subir skins con cuenta offline.
  - Sincronización entre usuarios del mismo launcher.
  - Galería de skins comunitarios.

- [ ] **Versiones Pre-Integradas con Optifine**
  - Instalaciones listas con Optifine + Forge.
  - Configuración automática.

- [ ] **Auto-Actualización del Launcher**
  - Detección de nuevas versiones.
  - Descarga e instalación automática.
  - Changelog visible.

### 📊 Fase 5: Analytics y Progresión

- [ ] **Sistema de Estadísticas**
  - Tiempo jugado por modpack.
  - Últimos modpacks jugados.
  - Dashboard en home con gráficos visuales.

- [ ] **Sistema de Logros/Progresión**
  - Desbloqueo de badges.
  - Sincronización con servidor (a largo plazo).

### 🚀 Fase Final: Backend y IA

- [ ] **Servidor Backend TECNILAND**
  - Sincronización de skins.
  - Almacenamiento de estadísticas.
  - Noticias centralizadas.
  - Sistema de perfiles de usuario.
    *Todo centralizado en la pagina WEB oficial de TECNILAND Nexus (actualmente en desarrollo)

- [ ] **Multiplayer Directo**
  - Crear servidores temporales.
  - Invitar amigos directamente.
  - Sin necesidad de configuración manual.

- [ ] **Tienda de Cosméticos**
  - Skins exclusivos.
  - Temas de launcher.
  - Efectos visuales.

- [ ] **Recomendaciones de Mods Basadas en IA**
  - Sugerencias inteligentes según estilo de juego.
  - Análisis de mods compatibles.
  - Instalación asistida.

- [ ] **Asistente de IA Integrado**
  - Resolver problemas de crashes.
  - Responder dudas sobre configuración.
  - Soporte técnico 24/7.

- [ ] **Tutoriales y Guías en Vídeo**
  - Onboarding para usuarios nuevos.
  - Guías de características.
  - Troubleshooting visual.

---

## 📥 Instalación

### Requisitos Previos

- **Node.js** v18+ ([descargar](https://nodejs.org/))
- **Git** para clonar el repositorio.
- **Java** (el launcher manejará versiones automáticamente, pero es recomendable tener al menos Java 17).

### Pasos de Instalación

1. **Clonar el repositorio**

   ```bash
   git clone https://github.com/Ppkeash/TECNILAND-Nexus.git
   cd TECNILAND-Nexus
   ```

2. **Instalar dependencias**

   ```bash
   npm install
   ```

3. **Ejecutar en desarrollo**

   ```bash
   npm start
   ```

   Se abrirá el launcher en modo desarrollo.

4. **Buildear para distribución** (opcional-no recomendado aún)

   ```bash
   npm run dist
   ```

   Genera ejecutables en la carpeta `dist/`.

---

## 🎮 Guía de Uso

### Primeros Pasos

1. **Crear Cuenta**
   - Click en "Login" → "Offline".
   - Ingresa tu nombre de usuario preferido.
   - ¡Listo! Sesión creada localmente.

2. **Crear Instalación**
   - Click en botón "+" o "Nueva Instalación".
   - Selecciona versión de Minecraft (1.13–1.21.x).
   - Selecciona Loader: **Forge** (recomendado).
   - Espera a que descargue e instale automáticamente.

3. **Jugar**
   - Click en "Jugar" en tu instalación.
   - El launcher descargará Java automáticamente si es necesario.
   - Se abre Minecraft modded. ¡Disfruta!

### Live Log Viewer

- **Activar:** Ajustes → Launcher → Toggle "Mostrar Logs en Vivo".
- **Ver Logs:** Cuando lances un juego, aparecerá un panel a la derecha con logs.
- **Exportar:** Click en botón "Exportar" para guardar logs a archivo `.txt`.

### Gestor de Modpacks

- Sección **"TECNILAND"** en el menú.
- Selecciona modpack preconfigurando.
- Click "Instalar" para descargar.
- ¡Juega con amigos!

---

## 🛠️ Desarrollo

### Estructura del Proyecto

```
TECNILAND-Nexus/
├── app/
│   ├── assets/
│   │   ├── css/           # Estilos (tema verde/negro)
│   │   ├── js/            # Lógica del launcher
│   │   │   ├── forgeprocessor.js    # Procesamiento de Forge
│   │   │   ├── loaderinstaller.js   # Instalación de loaders
│   │   │   ├── javamanager.js       # Gestión automática de Java
│   │   │   ├── livelogviewer.js     # Panel de logs
│   │   │   ├── processbuilder.js    # Construcción de comandos
│   │   │   └── configmanager.js     # Configuración persistente
│   │   └── images/        # Assets visuales
│   └── assets-src/        # Fuentes pre-compiladas
├── docs/                  # Documentación técnica
├── src/                   # Código fuente de Electron
├── package.json           # Dependencias y scripts
├── .gitignore             # Archivos ignorados por git
└── README.md              # Este archivo
```

### Stack Tecnológico

- **Electron** - Framework para aplicaciones de escritorio.
- **Node.js + JavaScript** - Backend del launcher.
- **HTML/CSS** - UI responsiva.
- **Electron-Builder** - Compilación de ejecutables.

### Contribuir

1. Fork el repositorio.
2. Crea una rama: `git checkout -b feature/tu-feature`.
3. Commit cambios: `git commit -m 'Add: descripción'`.
4. Push a la rama: `git push origin feature/tu-feature`.
5. Abre un Pull Request.

### ESLint y Calidad de Código

```bash
npm run lint          # Revisar linting
npm run lint -- --fix # Arreglar automáticamente
```

---

## 📄 Licencia y Créditos

### Licencia

**TECNILAND Nexus** utiliza la licencia **MIT**, heredada de HeliosLauncher.

```
MIT License

Copyright (c) 2017-2024 Daniel D. Scalzi (HeliosLauncher)
Copyright (c) 2024 Ppkeash (TECNILAND Nexus Extensions)

Permission is hereby granted, free of charge, to any person obtaining a copy...
(Ver LICENSE.txt para el texto completo)
```

### Créditos

- **[HeliosLauncher](https://github.com/dscalzi/HeliosLauncher)** - Base original del launcher, sistema de login Microsoft, arquitectura modular. Desarrollado por Daniel D. Scalzi.
- **[TECNILAND Nexus](https://github.com/Ppkeash/TECNILAND-Nexus)** - Extensiones Forge, JavaManager, Live Log Viewer, UI verde/negro, Modpacks TECNILAND. Desarrollado por Ppkeash.

### Comunidades y Recursos

- [Minecraft Forge Documentation](https://docs.minecraftforge.net/)
- [Fabric Wiki](https://wiki.fabricmc.net/)
- [Java Downloads](https://www.java.com/)

---

## 📞 Soporte y Contacto

- **GitHub Issues:** Reporta bugs o pide features.
- **Discord:** *Próximamente integrado en el launcher --> https://discord.gg/eDmCZnc8tv <--.*
- **Email:** tutosmaspros@gmail.com

---

**TECNILAND Nexus - Hecho con mucho amor 💚 para la comunidad de 💚 TECNILAND 💚.**

*Versión: 0.1.0-beta | Última actualización: Diciembre 2025*
