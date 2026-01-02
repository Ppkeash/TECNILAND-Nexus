# 🔍 Fabric Debugging Logs - Deterministic Validation

**Issue**: ClassNotFoundException persists, need deterministic verification  
**Solution**: Added comprehensive INFO-level logging for all critical paths  
**Date**: December 26, 2025

---

## 📋 Logs Added

### 1. Constructor - version.json Loading Verification
**Location**: ProcessBuilder constructor (lines 45-52)

**Logs printed**:
```
=== MOD LOADER VERSION.JSON LOADED ===
  ID: fabric-loader-0.18.1-1.20.1 (or whatever version user selected)
  MainClass: net.fabricmc.loader.impl.launch.knot.KnotClient
  Libraries count: 8
  InheritsFrom: 1.20.1
```

**What to verify**:
- ✅ ID contains correct loader version (NOT hardcoded 0.16.9)
- ✅ MainClass is correct for Fabric
- ✅ Libraries count is 8 (2 core + 6 deps) for Fabric

---

### 2. Library Resolution - Loader Libraries
**Location**: `_resolveModLoaderLibraries()` (lines 1084-1141)

**Logs printed**:
```
=== RESOLVING MOD LOADER LIBRARIES (fabric-loader-0.18.1-1.20.1) ===
  Total libraries in modManifest: 8
  Resolved 8 mod loader libraries
  Sample libraries: [ 'fabric-loader-0.18.1.jar', 'intermediary-1.20.1.jar', 'asm-9.7.1.jar' ]
```

**What to verify**:
- ✅ Total libraries matches Libraries count from constructor
- ✅ All 8 libraries resolved (no missing paths)
- ✅ Sample shows fabric-loader.jar and intermediary.jar

---

### 3. Classpath Building - Merge Verification
**Location**: `classpathArg()` (lines 963-990)

**Logs printed**:
```
=== BUILDING CLASSPATH ===
  Mojang (Vanilla) libraries: 25 (varies by MC version)
  Server libraries: 0 (varies by server mods)
  Mod Loader libraries: 8
  Final merged libraries: 33 (mojang + server + loader, no duplicates)
```

**What to verify**:
- ✅ Mod Loader libraries = 8 (same as resolution step)
- ✅ Final merged count = sum of all sources (accounting for overrides)
- ✅ Merge completed successfully (no errors)

---

### 4. Fabric Classpath Validation - Pre-Launch Checks
**Location**: `classpathArg()` end (lines 1006-1067)

**Logs printed**:
```
=== FABRIC CLASSPATH VALIDATION ===
  ✅ hasFabricLoaderJar: true
  ✅ hasIntermediaryJar: true
  ✅ hasKnotClient: true (net/fabricmc/loader/impl/launch/knot/KnotClient.class found in jar)
=== END FABRIC VALIDATION ===
```

**Critical checks**:

#### Check 1: hasFabricLoaderJar
```javascript
const hasFabricLoaderJar = classpathString.includes('\\net\\fabricmc\\fabric-loader\\')
```
- **Searches**: Full classpath string for `\net\fabricmc\fabric-loader\` substring
- **If FALSE**: Library was NOT downloaded or NOT included in version.json
- **Fix**: Verify `generateVersionJson()` adds `fabricMetadata.loader.maven` to libraries[]

#### Check 2: hasIntermediaryJar
```javascript
const hasIntermediaryJar = classpathString.includes('\\net\\fabricmc\\intermediary\\')
```
- **Searches**: Full classpath string for `\net\fabricmc\intermediary\` substring
- **If FALSE**: Intermediary mapping missing (may be optional for some versions)
- **Fix**: Verify `generateVersionJson()` adds `fabricMetadata.intermediary.maven` to libraries[]

#### Check 3: hasKnotClient
```javascript
const zip = new AdmZip(fabricLoaderJarPath)
const knotClientEntry = zip.getEntry('net/fabricmc/loader/impl/launch/knot/KnotClient.class')
```
- **Opens**: fabric-loader jar from classpath
- **Searches**: `net/fabricmc/loader/impl/launch/knot/KnotClient.class` inside jar
- **Alternative**: `net/fabricmc/loader/launch/knot/KnotClient.class` (older versions)
- **If FALSE**: MainClass in version.json is incorrect OR jar is corrupted

---

## 🔍 Debugging Flowchart

```
START Launch
    ↓
1. ProcessBuilder Constructor
    ├─ Log: version.json loaded (ID, mainClass, libraries count)
    ├─ ✅ Verify: mainClass is correct
    └─ ✅ Verify: libraries count = 8 for Fabric
    ↓
2. _resolveModLoaderLibraries()
    ├─ Log: Total libraries in modManifest
    ├─ Log: Resolved X mod loader libraries
    ├─ Log: Sample libraries (first 3)
    ├─ ✅ Verify: Resolved count = Total count
    └─ ✅ Verify: Sample includes fabric-loader.jar
    ↓
3. classpathArg() - Merge
    ├─ Log: Mojang libraries count
    ├─ Log: Server libraries count
    ├─ Log: Mod Loader libraries count
    ├─ Log: Final merged libraries count
    ├─ ✅ Verify: Mod Loader count matches step 2
    └─ ✅ Verify: Final count >= Mod Loader count
    ↓
4. classpathArg() - Validation
    ├─ Check: hasFabricLoaderJar (substring search)
    ├─ Check: hasIntermediaryJar (substring search)
    ├─ Check: hasKnotClient (jar inspection)
    ├─ ✅ Verify: ALL checks pass
    └─ ✅ If any fail: ERROR logged with details
    ↓
5. Launch Java
    ├─ Use mainClass from modManifest
    ├─ Use classpath from cpArgs
    └─ ✅ Verify: No ClassNotFoundException
    ↓
END
```

---

## 🎯 Acceptance Criteria

### ✅ Required Log Output

**Step 1 - version.json Loaded**:
```
[ProcessBuilder] === MOD LOADER VERSION.JSON LOADED ===
[ProcessBuilder]   ID: fabric-loader-0.18.1-1.20.1
[ProcessBuilder]   MainClass: net.fabricmc.loader.impl.launch.knot.KnotClient
[ProcessBuilder]   Libraries count: 8
[ProcessBuilder]   InheritsFrom: 1.20.1
```
✅ ID shows correct user-selected version (NOT 0.16.9 hardcoded)

**Step 2 - Libraries Resolved**:
```
[ProcessBuilder] === RESOLVING MOD LOADER LIBRARIES (fabric-loader-0.18.1-1.20.1) ===
[ProcessBuilder]   Total libraries in modManifest: 8
[ProcessBuilder]   Resolved 8 mod loader libraries
[ProcessBuilder]   Sample libraries: [ 'fabric-loader-0.18.1.jar', 'intermediary-1.20.1.jar', 'asm-9.7.1.jar' ]
```
✅ All 8 libraries resolved successfully

**Step 3 - Merge Completed**:
```
[ProcessBuilder] === BUILDING CLASSPATH ===
[ProcessBuilder]   Mojang (Vanilla) libraries: 25
[ProcessBuilder]   Server libraries: 0
[ProcessBuilder]   Mod Loader libraries: 8
[ProcessBuilder]   Final merged libraries: 33
```
✅ Merge includes all mod loader libraries

**Step 4 - Validation Passed**:
```
[ProcessBuilder] === FABRIC CLASSPATH VALIDATION ===
[ProcessBuilder]   ✅ hasFabricLoaderJar: true
[ProcessBuilder]   ✅ hasIntermediaryJar: true
[ProcessBuilder]   ✅ hasKnotClient: true (net/fabricmc/loader/impl/launch/knot/KnotClient.class found in jar)
[ProcessBuilder] === END FABRIC VALIDATION ===
```
✅ All checks pass

**Step 5 - Launch Success**:
```
Minecraft window opens
No ClassNotFoundException in console
```

---

## ❌ Error Scenarios

### Scenario 1: hasFabricLoaderJar = false

**Log output**:
```
[ProcessBuilder]   ✅ hasFabricLoaderJar: false
[ProcessBuilder]   ❌ CRITICAL: fabric-loader.jar NOT FOUND in classpath!
[ProcessBuilder]      This means the library was not downloaded or not included in version.json
```

**Diagnosis**:
- version.json does NOT contain `net.fabricmc:fabric-loader:<version>` in libraries[]
- Bug in `generateVersionJson()` - missing manual addition

**Fix**:
- Verify `FabricLoaderInstaller.generateVersionJson()` line 220
- Should add: `libraries.push({ name: fabricMetadata.loader.maven, url: '...' })`
- Check: `fabricMetadata.loader.maven` is defined and correct

---

### Scenario 2: hasFabricLoaderJar = true, hasKnotClient = false

**Log output**:
```
[ProcessBuilder]   ✅ hasFabricLoaderJar: true
[ProcessBuilder]   ❌ hasKnotClient: false - KnotClient.class NOT FOUND in jar!
[ProcessBuilder]      Jar: C:\...\fabric-loader-0.18.1.jar
[ProcessBuilder]      Expected path: net/fabricmc/loader/impl/launch/knot/KnotClient.class
[ProcessBuilder]      Alternative path: net/fabricmc/loader/launch/knot/KnotClient.class
```

**Diagnosis**:
- fabric-loader jar is in classpath
- BUT: jar doesn't contain KnotClient at expected path
- Possible causes:
  1. Wrong Fabric Loader version (very old or beta)
  2. Corrupted jar download
  3. MainClass is incorrect for this version

**Fix**:
1. Open jar manually: `jar tf fabric-loader-0.18.1.jar | grep KnotClient`
2. Find actual path of KnotClient.class
3. Update `mainClass` in `generateVersionJson()` if needed
4. Or use alternative path: `net.fabricmc.loader.launch.knot.KnotClient` (older versions)

---

### Scenario 3: hasFabricLoaderJar = true, hasKnotClient = true, still ClassNotFoundException

**Log output**:
```
[ProcessBuilder]   ✅ hasFabricLoaderJar: true
[ProcessBuilder]   ✅ hasIntermediaryJar: true
[ProcessBuilder]   ✅ hasKnotClient: true
[ProcessBuilder] === END FABRIC VALIDATION ===

[Java Error] Could not find or load main class net.fabricmc.loader.impl.launch.knot.KnotClient
```

**Diagnosis**:
- Classpath checks pass
- KnotClient.class exists in jar
- BUT: Java still can't find it

**Possible causes**:
1. Classpath separator wrong (`;` vs `:`)
2. fabric-loader jar path has spaces/special chars (needs quotes)
3. Classpath too long (Windows MAX_PATH limit)
4. JVM version mismatch (Fabric requires Java 17+ for MC 1.18+)

**Fix**:
1. Check Java version: `java -version` (must be 17+ for MC 1.18+)
2. Print full classpath to console (search for `-cp` in logs)
3. Verify fabric-loader jar path in classpath is correct
4. Test jar manually: `java -cp fabric-loader-0.18.1.jar net.fabricmc.loader.impl.launch.knot.KnotClient`

---

## 🧪 Testing Instructions

### 1. Delete Previous Installation
```powershell
Remove-Item "C:\...\common\versions\fabric-loader-*" -Recurse -Force
```

### 2. Launch Launcher
```bash
npm start
```

### 3. Create Fabric Installation
- Select Minecraft 1.20.1
- Select Fabric Loader **0.18.1** (NOT 0.16.9)
- Click Install

### 4. Verify Logs During Installation
Look for:
```
[FabricLoaderInstaller] Added fabric-loader library: net.fabricmc:fabric-loader:0.18.1
[FabricLoaderInstaller] Total libraries: 8 (2 core + 6 dependencies)
[FabricLoaderInstaller] ✅ Validated: KnotClient.class exists in fabric-loader.jar
```

### 5. Click "Play"

### 6. Verify Logs During Launch
Look for:
```
[ProcessBuilder] === MOD LOADER VERSION.JSON LOADED ===
[ProcessBuilder]   ID: fabric-loader-0.18.1-1.20.1
[ProcessBuilder]   MainClass: net.fabricmc.loader.impl.launch.knot.KnotClient
[ProcessBuilder]   Libraries count: 8

[ProcessBuilder] === RESOLVING MOD LOADER LIBRARIES (fabric-loader-0.18.1-1.20.1) ===
[ProcessBuilder]   Total libraries in modManifest: 8
[ProcessBuilder]   Resolved 8 mod loader libraries

[ProcessBuilder] === BUILDING CLASSPATH ===
[ProcessBuilder]   Mod Loader libraries: 8
[ProcessBuilder]   Final merged libraries: 33

[ProcessBuilder] === FABRIC CLASSPATH VALIDATION ===
[ProcessBuilder]   ✅ hasFabricLoaderJar: true
[ProcessBuilder]   ✅ hasIntermediaryJar: true
[ProcessBuilder]   ✅ hasKnotClient: true
[ProcessBuilder] === END FABRIC VALIDATION ===
```

### 7. Verify Minecraft Opens
- ✅ No ClassNotFoundException
- ✅ Minecraft window opens
- ✅ Fabric initializes

---

## 🔧 No Hardcoded Versions

**Verified**: No version strings are hardcoded.

**Dynamic versioning**:
- `FabricLoaderInstaller` uses `this.loaderVersion` everywhere
- `generateVersionJson()` uses `fabricMetadata.loader.maven` (from API response)
- `getVersionId()` constructs ID from parameters: `fabric-loader-${this.loaderVersion}-${this.minecraftVersion}`

**Example flow**:
1. User selects Fabric 0.18.1 in UI
2. `InstallationManager` creates installer with `loaderVersion: '0.18.1'`
3. Installer fetches `https://meta.fabricmc.net/v2/versions/loader/1.20.1/0.18.1`
4. API returns `loader.maven: "net.fabricmc:fabric-loader:0.18.1"`
5. `generateVersionJson()` adds to libraries: `{ name: "net.fabricmc:fabric-loader:0.18.1", ... }`
6. ProcessBuilder reads version.json and includes in classpath

**✅ Result**: User choice of 0.18.1 is respected throughout the entire flow.

---

## ✅ Status

**Implementation**: COMPLETE  
**Hardcoded versions**: NONE  
**Testing**: READY - awaiting user testing with detailed logs

---

*End of Debugging Log Report*
