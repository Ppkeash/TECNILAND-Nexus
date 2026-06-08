# Guía — Publicar y actualizar el modpack con Nebula

Cómo funciona la distribución del modpack TECNILAND y cómo subir cambios sin que
nadie reinstale nada ni se rompan configuraciones.

> **Idea central:** el launcher sincroniza por **hash MD5**. Cada archivo del
> modpack tiene su hash en `distribution.json`. Al dar **Play**, el launcher
> compara los hashes locales contra el `distribution.json` y descarga **solo lo
> que cambió o falta**. Nadie instala mod por mod, y un cambio mínimo NO obliga a
> reinstalar el modpack.

---

## El mecanismo (qué hace el launcher al dar Play)

En el código del launcher (`landing.js`), usa `FullRepair` de helios-core:

1. `FullRepair.verifyFiles()` — recorre cada archivo declarado en
   `distribution.json` y compara su hash MD5 con el archivo local. Devuelve la
   lista de los que faltan o no coinciden.
2. `FullRepair.download()` — descarga **únicamente** esos archivos.

Resultado: cambiás 1 archivo → solo se baja ese 1 archivo en la máquina del
jugador.

---

## Receta: publicar un cambio (config, mod, resourcepack, lo que sea)

1. Editá el archivo en el ROOT de Nebula:
   - Configs / resourcepacks / archivos generales → `servers/<server>/files/...`
   - Mods Forge → `servers/<server>/forgemods/...`
   - Mods Fabric → `servers/<server>/fabricmods/...`
   - Librerías → `servers/<server>/libraries/...`
2. Regenerá la distribución:
   ```
   npm run start -- g distro
   ```
   (Esto recalcula los hashes y reescribe `distribution.json`.)
3. Subí a R2 (Cloudflare):
   - El **`distribution.json`** nuevo.
   - El/los **archivo(s) que cambiaste** (en las mismas rutas que usa el json).
4. (Opcional pero recomendado) Subí el número `version` en
   `servers/<server>/servermeta.json` → al jugador le aparece "actualización
   disponible" en el launcher.
5. El jugador da **Play** → el launcher detecta el hash distinto → baja **solo
   ese archivo**. Sin reinstalar, sin tocar lo demás.

> El `BASE_URL` del `.env` de Nebula debe apuntar a donde sirves los archivos en
> R2 (actualmente `https://pub-…r2.dev/nebula/`). Si algún día cambias de
> URL/dominio, hay que regenerar el distro con el nuevo `BASE_URL` (ver
> `docs/FASE2_PLAN.md`).

---

## ⚠️ Lo MÁS importante: tracked vs untracked

Por cada archivo decides quién manda:

| Tipo | Comportamiento | Úsalo para |
|------|----------------|------------|
| **Tracked** (normal, con hash) | El launcher **fuerza tu versión**. Si el jugador edita ese archivo, al dar Play se le **revierte** a la tuya. | Mods y configs que **TÚ** controlas y quieres empujar a todos. |
| **Untracked** (en `untrackedFiles`) | El launcher **nunca lo toca**. El jugador conserva su versión. Pero **no podrás** enviarle updates de ese archivo. | Configs **personales** del jugador: controles, opciones de video, etc. |

**Regla mental:**
- `tracked` = manda tu cambio (pisa lo del jugador).
- `untracked` = manda el jugador (no puedes actualizarlo desde Nebula).
- No existe "las dos cosas a la vez".

### Cómo marcar untracked

En `servers/<server>/servermeta.json`:

```json
{
  "untrackedFiles": [
    {
      "appliesTo": ["files"],
      "patterns": [
        "config/options.txt",
        "config/*.cfg",
        "config/**/*.yml"
      ]
    }
  ]
}
```

- `appliesTo`: la carpeta (`files`, `forgemods`, `libraries`, etc.).
- `patterns`: globs de los archivos que NO quieres validar/actualizar.

> No marques mods como untracked salvo que sepas lo que haces — perderías el
> control de versión sobre ellos.

---

## Cómo estructurar para no sufrir

Pensá cada archivo así:

1. **¿Lo controlo yo y quiero que todos tengan lo mismo?** → tracked (déjalo
   normal). Ej: el modpack en sí, configs de mods que afectan al servidor,
   recetas, scripts.
2. **¿Es preferencia personal del jugador?** → untracked. Ej: `options.txt`
   (controles/video), config de minimapa, sonido.

Así un cambio tuyo en un config tracked llega a todos al dar Play, y las
preferencias personales de cada quien no se pisan.

---

## Lo que NUNCA se borra ni se rompe

El launcher (helios-core `FullRepair`) **solo gestiona lo que está en
`distribution.json`**. No borra lo que no conoce:

- `saves/` (mundos), `screenshots/`, resourcepacks/shaders que el jugador metió a
  mano → **a salvo**, el launcher no los toca.

---

## Resumen de un vistazo

```
Editar archivo en ROOT Nebula
        ↓
npm run start -- g distro      (recalcula hashes)
        ↓
Subir a R2: distribution.json + archivo(s) cambiado(s)
        ↓
(Opcional) subir 'version' en servermeta.json  → avisa "update disponible"
        ↓
Jugador da Play → launcher baja SOLO lo cambiado
```

Configs personales del jugador → `untrackedFiles`. Todo lo demás → tracked.
