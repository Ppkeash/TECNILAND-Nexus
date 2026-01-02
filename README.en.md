# 🟢 TECNILAND Nexus

**A modern, stable Minecraft launcher built for the community.**

> 🌍 **English** | 🇪🇸 [Español](README.md)

---

## 📋 Table of Contents

- [About TECNILAND Nexus](#about-tecniland-nexus)
- [Current Status (Beta)](#current-status-beta)
- [Implemented Features](#implemented-features)
- [Roadmap & Upcoming Features](#roadmap--upcoming-features)
- [Installation](#installation)
- [Usage Guide](#usage-guide)
- [Development](#development)
- [License & Credits](#license--credits)

---

## 🎮 About TECNILAND Nexus

**TECNILAND Nexus** is a specialized fork of [HeliosLauncher](https://github.com/dscalzi/HeliosLauncher) designed to provide an optimized experience for installing and managing Minecraft versions with **complete Forge 1.13+ support**.

We envision more than just a simple launcher: we're building an **ecosystem** where players and modders can enjoy modded Minecraft easily, intuitively, and reliably. With features like:

- ✅ **Multi-Loader Support:** Forge fully integrated, Fabric/Quilt in development, **NeoForge in maintenance mode** (unstable).
- ✅ **Automatic JavaManager:** Intelligent Java version management for each installation.
- ✅ **Live Log Viewer:** Real-time logs panel with TECNILAND green/black aesthetic.
- ✅ **TECNILAND Modpacks:** Pre-configured installations ready to play.
- ✅ **Offline Accounts:** Full support for accounts without Microsoft.

> 🚧 **IMPORTANT WARNING:** NeoForge 1.20.4 is in maintenance mode due to critical instability (frequent JPMS crashes, requires Java 17 exactly, complex workarounds). **We recommend using stable Forge (1.20.1/1.20.6).** If you attempt to use NeoForge, the launcher will require confirmation on every launch.

We're in **Beta phase (0.x.x)**, meaning the launcher is functional and stable, but actively developed with new features arriving regularly.

---

## 📊 Current Status (Beta)

### ✅ Forge 1.13 → 1.21.x Fully Functional

We've thoroughly tested all Forge versions from Minecraft 1.13 to 1.21.x. Here are the results:

| MC Version | Status | Details |
|-----------|--------|---------|
| 1.13.x    | ✅ OK  | Functional, offline accounts supported |
| 1.14.x    | ✅ OK  | Full support |
| 1.15.2    | ✅ OK  | Fixed: Log4j2 conflict resolution |
| 1.16.x    | ✅ OK  | All variants (1.16.0-1.16.5) functional |
| 1.17.1    | ✅ OK  | Full support |
| 1.18.2    | ✅ OK  | Stable, widely used version |
| 1.19.4    | ✅ OK  | Fixed: Classpath deduplication |
| 1.20.1    | ✅ OK  | Full support, very stable |
| 1.21.x    | ✅ OK  | Fixed: Forge universal + client JAR handling |

---

## ✨ Implemented Features

### 🎯 Phase 1: Core (Completed)

- **Forge Multi-Loader** - Full support Forge 1.13–1.21.x with automatic integration of:
  - Downloadable Forge installers.
  - Executable processors without module errors.
  - Smart classpath management (library deduplication).
  - Automatic `version.json` generation compatible.

- **Automatic JavaManager** - Intelligent Java management system:
  - Auto-detection of installed JDKs.
  - Correct version assignment per MC version:
    - MC 1.13–1.16.x → Java 8/17.
    - MC 1.17–1.20.x → Java 17.
    - MC 1.20.5+ → Java 17/21.
  - Automatic Java download if unavailable.
  - Graceful fallback with clear user messages.

- **Offline Accounts** - Complete account management without Microsoft:
  - Create local accounts with any username.
  - Persistence in launcher configuration.
  - Loadable local skins (stored locally).

- **Native Live Log Viewer** - Integrated logs panel:
  - Real-time capture of Minecraft stdout/stderr.
  - Efficient circular buffer (max 1000 lines).
  - Auto color-coding: INFO (green), WARN (orange), ERROR (red), DEBUG (cyan).
  - `[HH:MM:SS]` timestamps on each line.
  - Buttons: Clear, Copy to clipboard, Export to `.txt`.
  - Dark green/black theme aligned with TECNILAND branding.
  - Toggle in Settings → Launcher to enable/disable.

- **Custom Installation Manager** (In Development)
  - Create, edit, delete custom installations.
  - Select Minecraft version + Loader (Forge).
  - Automatic folder synchronization `instances/`.

- **TECNILAND Modpacks** (In Development)
  - Dedicated section with pre-configured modpacks.
  - One-click installation.
  - Clear UI separation between TECNILAND and custom installations.

- **Professional UI Integration**
  - Responsive design in Electron.
  - Coherent green/black theme.
  - Intuitive navigation with tabs and menus.
  - Translations: Spanish (es_ES) and English (en_US).

---

## 🗓️ Roadmap & Upcoming Features

### 📋 Phase 2: Multi-Loader (In Development)

> 🚧 **IMPORTANT:** NeoForge 1.20.4 is in maintenance mode and not part of active development due to critical instability. See warning in [About TECNILAND Nexus](#about-tecniland-nexus) section.

- [ ] **Fabric Support** - Complete Fabric loader integration.
  - Download Fabric installers.
  - Meta API for versions.
  - Exhaustive testing Fabric 1.14–1.21.x.

- [ ] **Quilt Support** - Modern loader based on Fabric.
  - Integration similar to Fabric.
  - Compatibility with Fabric + Quilt-specific mods.

- [x] **NeoForge: Maintenance gate implemented**
  - ✅ Ephemeral gate active (confirmation every launch)
  - ✅ Warning modal with instability details
  - ✅ Recommendation to use stable Forge
  - ❌ NOT actively developed until JPMS issues resolved

- [ ] **Experimental Loaders Toggle** - Already implemented.
  - Hide Fabric, Quilt, NeoForge by default.
  - Warning modal for developers.

### 🎯 Phase 3: Import and Advanced Management

- [ ] **Import Modpacks ZIP** - Drag & drop or file selector.
  - Automatic extraction.
  - Structure validation.
  - Installation in `instances/` folder.

- [ ] **Advanced Modpack Manager**
  - Modpack preview.
  - Creator information.
  - Version history.
  - Automatic updates.

### 🌐 Phase 4: Integration and Community

- [ ] **Discord Rich Presence** - Show status on Discord.
  - "Playing in [Modpack Name] - MC [Version]".
  - Play time.

- [ ] **Custom Skins System**
  - Upload skins with offline account.
  - Synchronization between same launcher users.
  - Community skin gallery.

- [ ] **Pre-Integrated Optifine Versions**
  - Ready installations with Optifine + Forge.
  - Automatic configuration.

- [ ] **Launcher Auto-Update**
  - Detect new versions.
  - Automatic download and installation.
  - Visible changelog.

### 📊 Phase 5: Analytics and Progression

- [ ] **Statistics System**
  - Playtime per modpack.
  - Recently played modpacks.
  - Home dashboard with visual graphs.

- [ ] **Achievements/Progression System**
  - Badge unlocking.
  - Server synchronization (long-term).

### 🚀 Final Phase: Backend and AI

- [ ] **TECNILAND Backend Server**
  - Skin synchronization.
  - Statistics storage.
  - Centralized news.
  - User profile system.

- [ ] **Direct Multiplayer**
  - Create temporary servers.
  - Invite friends directly.
  - No manual configuration needed.

- [ ] **Cosmetics Shop**
  - Exclusive skins.
  - Launcher themes.
  - Visual effects.

- [ ] **AI-Based Mod Recommendations**
  - Intelligent suggestions based on playstyle.
  - Compatible mods analysis.
  - Assisted installation.

- [ ] **Integrated AI Assistant**
  - Solve crash problems.
  - Answer configuration questions.
  - 24/7 technical support.

- [ ] **Video Tutorials and Guides**
  - Onboarding for new users.
  - Feature guides.
  - Visual troubleshooting.

---

## 📥 Installation

### Prerequisites

- **Node.js** v18+ ([download](https://nodejs.org/))
- **Git** to clone the repository.
- **Java** (the launcher handles versions automatically, but Java 17+ is recommended).

### Installation Steps

1. **Clone the repository**

   ```bash
   git clone https://github.com/Ppkeash/TECNILAND-Nexus.git
   cd TECNILAND-Nexus
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Run in development**

   ```bash
   npm start
   ```

   The launcher will open in development mode.

4. **Build for distribution** (optional)

   ```bash
   npm run dist
   ```

   Generates executables in the `dist/` folder.

---

## 🎮 Usage Guide

### Getting Started

1. **Create Account**
   - Click "Login" → "Offline".
   - Enter your preferred username.
   - Done! Session created locally.

2. **Create Installation**
   - Click "+" button or "New Installation".
   - Select Minecraft version (1.13–1.21.x).
   - Select Loader: **Forge** (recommended).
   - Wait for automatic download and installation.

3. **Play**
   - Click "Play" on your installation.
   - The launcher automatically downloads Java if needed.
   - Minecraft modded opens. Enjoy!

### Live Log Viewer

- **Activate:** Settings → Launcher → Toggle "Show Live Logs".
- **View Logs:** When you launch a game, a panel appears on the right with logs.
- **Export:** Click "Export" button to save logs to `.txt` file.

### Modpack Manager

- **TECNILAND** section in the menu.
- Select a pre-configured modpack.
- Click "Install" to download.
- Play with friends!

---

## 🛠️ Development

### Project Structure

```
TECNILAND-Nexus/
├── app/
│   ├── assets/
│   │   ├── css/           # Styles (green/black theme)
│   │   ├── js/            # Launcher logic
│   │   │   ├── forgeprocessor.js    # Forge processing
│   │   │   ├── loaderinstaller.js   # Loader installation
│   │   │   ├── javamanager.js       # Automatic Java management
│   │   │   ├── livelogviewer.js     # Logs panel
│   │   │   ├── processbuilder.js    # Command construction
│   │   │   └── configmanager.js     # Persistent configuration
│   │   └── images/        # Visual assets
│   └── assets-src/        # Pre-compiled sources
├── docs/                  # Technical documentation
├── src/                   # Electron source code
├── package.json           # Dependencies and scripts
├── .gitignore             # Ignored files
└── README.md              # This file
```

### Tech Stack

- **Electron** - Framework for desktop applications.
- **Node.js + JavaScript** - Launcher backend.
- **HTML/CSS** - Responsive UI.
- **Electron-Builder** - Executable compilation.

### Contributing

1. Fork the repository.
2. Create a branch: `git checkout -b feature/your-feature`.
3. Commit changes: `git commit -m 'Add: description'`.
4. Push to branch: `git push origin feature/your-feature`.
5. Open a Pull Request.

### ESLint and Code Quality

```bash
npm run lint          # Check linting
npm run lint -- --fix # Fix automatically
```

---

## 📄 License and Credits

### License

**TECNILAND Nexus** uses the **MIT License**, inherited from HeliosLauncher.

```
MIT License

Copyright (c) 2017-2024 Daniel D. Scalzi (HeliosLauncher)
Copyright (c) 2024 Ppkeash (TECNILAND Nexus Extensions)

Permission is hereby granted, free of charge, to any person obtaining a copy...
(See LICENSE.txt for full text)
```

### Credits

- **[HeliosLauncher](https://github.com/dscalzi/HeliosLauncher)** - Original launcher base, Microsoft login system, modular architecture. Developed by Daniel D. Scalzi.
- **[TECNILAND Nexus](https://github.com/Ppkeash/TECNILAND-Nexus)** - Forge extensions, JavaManager, Live Log Viewer, green/black UI, TECNILAND Modpacks. Developed by Ppkeash.

### Communities and Resources

- [Minecraft Forge Documentation](https://docs.minecraftforge.net/)
- [Fabric Wiki](https://wiki.fabricmc.net/)
- [Java Downloads](https://www.java.com/)

---

## 📞 Support and Contact

- **GitHub Issues:** Report bugs or request features.
- **Discord:** *Coming soon integrated in the launcher.*
- **Email:** Contact info in development.

---

**TECNILAND Nexus - Made with ❤️ for the Minecraft community.**

*Version: 0.1.0-beta | Last updated: December 2024*
