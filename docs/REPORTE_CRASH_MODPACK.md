# Reporte para el equipo del MODPACK — crash OOM en servidor (TECNILAND BEYOND 1.20.1)

> Generado desde la terminal del **launcher** (TECNILAND NEXUS). Pásale esto a la
> terminal de Claude que tiene contexto del modpack. El launcher ya quedó descartado
> como causa; el fallo es de un mod.

## TL;DR

El cliente crashea con `OutOfMemoryError` a los pocos minutos de entrar al servidor.
**No es el launcher** (la config de JVM ya se corrigió y se confirmó por logs). Es un
**consumidor de memoria sin límite dentro del modpack** — fuga o avalancha de datos por
la red. Hay que **identificar el mod culpable**.

## Cronología del fallo (3 síntomas, misma raíz)

| Versión launcher | Config JVM | Error en pantalla | Tiempo hasta crash |
|---|---|---|---|
| 1.2.2 | `-Xmx8704M`, sin tope de memoria directa | `Cannot reserve 4194304 bytes of direct buffer memory` (allocated ≈ **9.12 GB**, limit **9126805504** = 8704M) | ~20 min |
| 1.2.3 | + `-XX:MaxDirectMemorySize=2G` | mismo error, limit **2147483648** (=2G) | ~2 min |
| 1.2.4 | + `-Dio.netty.noPreferDirect=true` + `-Dio.netty.maxDirectMemory=0` | `OutOfMemoryError: Java heap space` | pocos min |

**Lectura:** el tope (1.2.3) solo adelantó el crash → es **fuga real**, no dimensionado
de buffers. Forzar buffers en heap (1.2.4) movió el OOM de off-heap a heap → confirma
que algo acumula memoria sin liberar. Las reservas repetidas de **4 MB** son la firma de
la capa de red (Netty) recibiendo un flujo continuo que no se consume/libera.

Confirmado por `debug.log` (00:14:54): `-Dio.netty.noPreferDirect: true`,
`-Dio.netty.maxDirectMemory: 0 bytes` → los flags del launcher SÍ se aplicaron.

## Pistas del log (instancia `tecniland-beyond-1.20.1/logs`)

- **El plugin JEI de `irons_spellbooks` se cuelga 2.8+ minutos** al entrar
  (`Registering recipes: irons_spellbooks:jei_plugin is running and has taken 2.x minutes`).
  Posible mod problemático o muy pesado en join.
- Mods de red presentes y relevantes:
  - **`connectivity`** — parchea `PacketEncoder/Decoder` y **sube el límite de tamaño de
    paquete**. Si un mod manda un flujo enorme, en vez de rechazarlo lo deja acumular →
    OOM. Sospechoso de amplificar el problema.
  - **`packetfixer`**, **`voicechat`** (Simple Voice Chat), **`customnpcs`**, **`epicfight`**,
    **`fancymenu`** (hace llamadas HTTP en `WebUtils`).
- `ResourceLeakDetector` está en nivel `simple` (no muestra el stack de la fuga).

## SOSPECHOSO #1: el mod que se cambió hace poco

El dueño confirma *"antes no pasaba"*. **Se hizo un swap de un mod** justo en la versión
previa del modpack. **Ese mod cambiado es el primer candidato a revertir y probar.**
👉 Necesitamos saber el nombre exacto del mod swappeado y su versión nueva vs vieja.

## Qué debe encontrar la terminal del modpack

1. **¿Qué mod se cambió/añadió en el último update del pack?** Revertir y probar 1 sesión.
2. ¿Algún mod conocido por fugas de ByteBuf / flood de paquetes en Forge 1.20.1?
   Revisar especialmente: `connectivity`, `voicechat`, `customnpcs`, `irons_spellbooks`,
   `epicfight`, mods de sincronización masiva (claims, quests, mapas).
3. ¿Hay incompatibilidad cliente/servidor en versiones de mods de red? (decode loop que
   reasigna buffers).

## Build de diagnóstico (ya armado en el launcher)

El launcher tiene `NETWORK_DIAGNOSTICS = true` en `processbuilder.js`. Al lanzar inyecta:

- `-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=<instancia>/crash-dumps`
  → al próximo OOM suelta un `.hprof`. Abrirlo con **Eclipse MAT** → "Leak Suspects"
  dirá **qué clase/paquete (mod)** ocupa el heap. El nombre del paquete delata al mod.
- `-Dio.netty.leakDetection.level=paranoid` + `targetRecords=32`
  → en `latest.log`/`debug.log` aparecerá `LEAK: ByteBuf.release() was not called ...`
  con el **stack de asignación** → nombra la clase del mod que fuga buffers.

### Procedimiento

1. Lanzar con el build de diagnóstico, entrar al servidor, esperar al crash.
2. Recoger:
   - `<instancia>/crash-dumps/*.hprof` (volcado de heap).
   - `<instancia>/logs/latest.log` y `debug.log` (buscar `LEAK:` y `OutOfMemory`).
3. Analizar el `.hprof` en Eclipse MAT (o VisualVM) → dominador del heap = el mod.
4. Cruzar con el stack `LEAK:` de Netty → confirma el handler/mod que no libera.

> Ruta de la instancia del launcher:
> `C:\Users\yeval\AppData\Roaming\.tecnilandnexus\instances\tecniland-beyond-1.20.1`

## Estado del launcher (cerrado)

- Fix de JVM aplicado y verificado. `noPreferDirect`/`maxDirectMemory=0` se quedan como
  buena higiene (evitan el desborde off-heap).
- **No se publica release** hasta hallar y arreglar el mod. El flag de diagnóstico debe
  volver a `false` antes de cualquier release público.
