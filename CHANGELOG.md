# Changelog

Novedades de TECNILAND Nexus.

## v1.2.5 — Junio 2026

### 🛠️ Estabilidad en el servidor (crasheos y desconexiones)

- **Adiós a los cierres por memoria en partidas largas.** Se resolvió la causa raíz de
  los crasheos en multijugador. Ya puedes jugar horas seguidas sin que se cierre.
- **Visor de logs más robusto:** si un mod escupía una avalancha gigante de mensajes, el
  launcher podía quedarse sin memoria y cerrarse. Ahora el panel de logs recorta el
  exceso de forma segura y nunca tumba la app.
- **Tu RAM la sigues ajustando igual.** No tienes que tocar nada.

## v1.2.2 — Junio 2026

### 🛡️ Tus ajustes ya no se pierden (arreglo importante)

- **Adiós al reseteo de `options.txt`:** corregido el fallo grave por el que tus
  controles, FOV, sonido y ajustes de video (FPS) se **restablecían** cada vez que
  reiniciabas el modpack. Ahora tus ajustes son **intocables**: solo se ponen los del
  servidor la **primera vez**, y a partir de ahí mandas tú.
- Doble protección: el launcher respalda y restaura tus ajustes en cada arranque por
  si acaso. Tus partidas y capturas nunca estuvieron en riesgo.

### 🔄 Cambios de mods automáticos

- **Cambiar un mod ahora es instantáneo para todos:** cuando actualizamos o quitamos
  un mod, te lo aplicamos **al darle Jugar**, sin que tengas que hacer nada. El mod
  viejo se retira solo y entra el nuevo.

### 🔧 Botón Reparar más simple

- Rediseñado a **dos acciones claras** (sin casillas confusas):
  - **Reparación completa:** arregla fallos y sincroniza el modpack **conservando tus
    ajustes**.
  - **Re-instalación (emergencia):** reinstala el modpack desde cero. Pide confirmación.

### 🔄 Actualización

La actualización es automática: abre el launcher y se aplicará sola.

## v1.2.1 — Junio 2026

### 🎨 Skins y capas mejoradas

- **¡Capas (capes) por fin!** Añadido soporte para capas de **MinecraftCapes** y
  **OptiFine**, además de tu skin de TECNILAND. Si tienes una capa, ahora se ve en
  el juego.
- **Skins locales:** ahora puedes usar skins, capas y élitros guardados en tu PC
  (carpeta `LocalSkin`), ideal para probar diseños sin subirlos a ningún lado.
- **Skins más al día:** ajustada la carga de skins para que los cambios se vean
  antes y con mejor rendimiento.

### 🖼️ Nuevos fondos

- **5 fondos nuevos** para personalizar tu launcher. Cámbialos desde *Ajustes →
  Personalización*.
- **Arreglo:** corregido un fallo por el que, al azar, el launcher podía abrir con
  el fondo en negro/roto. Ahora siempre carga un fondo válido.

### 🔧 Compatibilidad de modpack

- Actualizado el cargador de skins (CustomSkinLoader) para que **coincida con la
  versión incluida en el modpack** TECNILAND BEYOND, evitando conflictos al instalar
  o reparar.

### 🔄 Actualización

La actualización es automática: abre el launcher y se aplicará sola.

## v1.2.0 — Junio 2026

### 🔧 Reparar y actualizar tus modpacks

- **Aviso "Actualización nueva":** cuando preparamos cambios en un modpack, verás un
  aviso brillante junto a *Jugar*. Un clic y tu modpack queda al día.
- **Botón Reparar:** ahora puedes **Actualizar** (descarga lo que falte, sin tocar
  nada tuyo) o hacer una **Reparación completa** (deja tu modpack exactamente como
  debe estar, quitando mods sueltos que ya no van).
- **Tus cosas, a salvo:** tus partidas, capturas y controles (`options.txt`) nunca se
  tocan. Solo se reparan los archivos sensibles si tú lo marcas.
- **Adiós a los fallos raros:** corregido el problema por el que a veces reaparecía un
  mod que ya habíamos quitado. Ahora los cambios se aplican siempre a la primera.

### 🔄 Actualización

La actualización es automática: abre el launcher y se aplicará sola.

## v1.1.1 — Junio 2026

- **Arreglo visual:** el aviso de modpack en mantenimiento ahora se ve limpio y
  ordenado en la lista de modpacks (antes descuadraba la tarjeta y añadía scroll).
- Ajustes internos de estabilidad.

## v1.1.0 — Junio 2026

### 🌟 ¡TECNILAND BEYOND llega pronto!

Estamos preparando **TECNILAND BEYOND**, nuestro nuevo modpack. Ya aparece en el
launcher, y muy pronto podrás instalarlo y jugar. **Disponible el 14 de junio.**
¡Atento a las noticias dentro del launcher!

### ✨ Novedades de esta versión

- **Aviso de modpacks en mantenimiento:** cuando un modpack se está preparando o
  actualizando, se muestra como "En mantenimiento" con su fecha de disponibilidad,
  para que sepas exactamente cuándo podrás jugar. Nada de instalaciones a medias.
- **Personaliza tu launcher:** ahora puedes cambiar el fondo de pantalla y el logo
  desde el propio launcher, y elegir si se mantiene fijo o cambia en cada inicio.
- **Skins mejoradas:** visor de skin en 3D y mejor compatibilidad in-game.
- **Más estabilidad y arreglos** generales para una experiencia más fluida.

### 🔄 Actualización

La actualización es automática: abre el launcher y se aplicará sola.

---

> Versiones anteriores (1.0.x): base estable del launcher — soporte Forge,
> gestión automática de Java, cuentas TECNILAND y offline, noticias en vivo,
> sistema de modpacks y diagnóstico integrado.
