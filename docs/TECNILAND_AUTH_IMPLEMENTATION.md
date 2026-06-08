# TECNILAND Account Integration - Bloque 1.3

## Resumen

Se ha integrado el sistema de autenticación TECNILAND en el launcher TECNILAND Nexus, permitiendo:

1. **Login/Registro** desde el launcher
2. **Gestión de sesiones** (guardar token, auto-login)
3. **Upload/gestión de skins** desde el launcher
4. **Lanzar Minecraft** usando autenticación TECNILAND (Yggdrasil + authlib-injector)

## Archivos Creados

### Módulo de Autenticación (`app/assets/js/tecnilandauth/`)

| Archivo | Descripción |
|---------|-------------|
| `TecnilandAuthConfig.js` | Configuración de endpoints y constantes |
| `TecnilandAuthManager.js` | Cliente principal de autenticación (API + Yggdrasil) |
| `TecnilandAuthUI.js` | Controlador de UI para overlays y estados |
| `index.js` | Exportaciones del módulo |

## Archivos Modificados

### Backend Integration

| Archivo | Cambios |
|---------|---------|
| `authmanager.js` | Añadidas funciones `addTecnilandAccount()`, `removeTecnilandAccount()`, `validateSelectedTecnilandAccount()` |
| `configmanager.js` | Añadidas funciones `addTecnilandAuthAccount()`, `updateTecnilandAuthAccount()`, `getTecnilandAccounts()`, `getTecnilandSession()`, `setTecnilandSession()` |
| `processbuilder.js` | Soporte para cuentas TECNILAND con authlib-injector JVM args |

### UI Templates

| Archivo | Cambios |
|---------|---------|
| `loginOptions.ejs` | Botón TECNILAND como opción destacada |
| `overlay.ejs` | Overlay de login/registro TECNILAND |
| `settings.ejs` | Sección de cuenta TECNILAND con gestión de skin |

### Scripts UI

| Archivo | Cambios |
|---------|---------|
| `scripts/loginOptions.js` | Handler para botón TECNILAND |
| `scripts/settings.js` | Handlers para login, logout, skin upload/delete |

### Estilos

| Archivo | Cambios |
|---------|---------|
| `launcher.css` | ~400 líneas de estilos para auth overlay, botones, y sección de settings |

### Traducciones

| Archivo | Cambios |
|---------|---------|
| `lang/es_ES.toml` | Todas las traducciones necesarias para el sistema TECNILAND |

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                      TECNILAND Nexus                        │
│                        (Frontend)                           │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ loginOptions │  │   settings   │  │   overlay    │      │
│  │     .ejs     │  │     .ejs     │  │    .ejs      │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │               │
│         ▼                 ▼                 ▼               │
│  ┌────────────────────────────────────────────────────┐    │
│  │              TecnilandAuthUI.js                    │    │
│  │  - showLoginOverlay() / hideLoginOverlay()         │    │
│  │  - updateUIState() / refreshAvatar()               │    │
│  └──────────────────────┬─────────────────────────────┘    │
│                         │                                   │
│                         ▼                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │            TecnilandAuthManager.js                 │    │
│  │  - login() / register() / logout()                 │    │
│  │  - authenticateYggdrasil() / refreshYggdrasil()    │    │
│  │  - uploadSkin() / deleteSkin()                     │    │
│  │  - getAuthlibInjectorArgs()                        │    │
│  └──────────────────────┬─────────────────────────────┘    │
│                         │                                   │
└─────────────────────────┼───────────────────────────────────┘
                          │ HTTP Requests
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   TECNILAND Backend                         │
│          (https://tecniland-backend.fly.dev)                │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  /api/auth   │  │ /authserver  │  │  /api/skins  │      │
│  │   REST API   │  │  Yggdrasil   │  │    Skins     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                 │                 │               │
│         ▼                 ▼                 ▼               │
│  ┌────────────────────────────────────────────────────┐    │
│  │                    Database                        │    │
│  │              (Users, Sessions, Skins)              │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Flujo de Autenticación

### Login

1. Usuario hace clic en "Cuenta TECNILAND" en loginOptions
2. Se muestra overlay con formulario de login
3. Usuario ingresa credenciales
4. `TecnilandAuthManager.login()` → POST `/api/auth/login`
5. Si exitoso, `TecnilandAuthManager.authenticateYggdrasil()` → POST `/authserver/authenticate`
6. Tokens guardados en `ConfigManager`
7. Cuenta añadida a `authenticationDatabase`
8. UI actualizada

### Lanzamiento de Minecraft

1. Usuario hace clic en "JUGAR"
2. `ProcessBuilder` detecta cuenta tipo `tecniland`
3. `_getTecnilandAuthArgs()` obtiene argumentos de authlib-injector:
   - `-javaagent:path/to/authlib-injector.jar=https://tecniland-backend.fly.dev`
   - `-Dauthlibinjector.prefetched=<base64_metadata>`
4. Access token Yggdrasil usado como `--accessToken`
5. User type = `mojang` (protocolo Yggdrasil)
6. Minecraft se lanza con auth redirigida al servidor TECNILAND

## Configuración del Backend

El launcher usa el backend en producción `https://tecniland-backend.fly.dev` con los siguientes endpoints:

### API REST (`/api/auth/*`)
- `POST /api/auth/register` - Registro de usuarios
- `POST /api/auth/login` - Login (retorna JWT)
- `GET /api/auth/validate` - Validar sesión
- `POST /api/auth/logout` - Cerrar sesión

### Yggdrasil (`/authserver/*`)
- `POST /authserver/authenticate` - Autenticación Minecraft
- `POST /authserver/refresh` - Refrescar token
- `POST /authserver/validate` - Validar token
- `POST /authserver/invalidate` - Invalidar token

### Session Server (`/sessionserver/*`)
- `POST /sessionserver/session/minecraft/join` - Join server
- `GET /sessionserver/session/minecraft/hasJoined` - Verificar join
- `GET /sessionserver/session/minecraft/profile/:uuid` - Perfil de usuario

### Skins (`/api/skins/*`)
- `POST /api/skins/upload` - Subir skin
- `DELETE /api/skins/:uuid` - Eliminar skin
- `GET /textures/:uuid/skin` - Obtener skin

## Próximos Pasos

1. **Descargar authlib-injector**: El launcher necesita descargar `authlib-injector.jar` automáticamente
2. **✅ Configuración de URL del servidor**: Actualizado a producción `https://tecniland-backend.fly.dev`
3. **Verificación de email**: UI para verificación de email si el backend lo requiere
4. **Recuperación de contraseña**: Flujo de "olvidé mi contraseña"
5. **Actualización automática de sesión**: Refrescar tokens expirados automáticamente

## Dependencias

- Backend TECNILAND en producción: `https://tecniland-backend.fly.dev`
- `authlib-injector.jar` en la carpeta de librerías del launcher
- El servidor de Minecraft debe estar configurado para usar el mismo servidor Yggdrasil

## Testing

Para probar la integración:

1. El backend TECNILAND está disponible en `https://tecniland-backend.fly.dev`
2. Inicia el launcher con `npm start`
3. Haz clic en "Cuenta TECNILAND" en la pantalla de login
4. Registra una nueva cuenta o inicia sesión
5. Verifica que la cuenta aparezca en Settings > Cuenta
6. Sube una skin y verifica que se muestre
7. Lanza Minecraft y verifica que la autenticación funcione
