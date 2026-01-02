# Script de limpieza para instalaciones corruptas de NeoForge
# Elimina version.json, libraries y fuerza reinstalación

param(
    [string]$CommonDir = "..\app\common"
)

Write-Host "=== LIMPIEZA DE NEOFORGE ===" -ForegroundColor Cyan
Write-Host "Este script eliminará todas las instalaciones de NeoForge existentes" -ForegroundColor Yellow
Write-Host "Directorio: $CommonDir" -ForegroundColor Gray
Write-Host ""

$confirm = Read-Host "¿Continuar? (S/N)"
if ($confirm -ne "S" -and $confirm -ne "s") {
    Write-Host "Operación cancelada" -ForegroundColor Red
    exit
}

Write-Host ""

# 1. Eliminar version.json de NeoForge
$versionsDir = Join-Path $CommonDir "versions"
if (Test-Path $versionsDir) {
    $neoforgeVersions = Get-ChildItem $versionsDir -Directory | Where-Object { $_.Name -like "neoforge-*" }
    
    if ($neoforgeVersions.Count -eq 0) {
        Write-Host "✓ No se encontraron instalaciones de NeoForge en versions/" -ForegroundColor Green
    } else {
        foreach ($ver in $neoforgeVersions) {
            Write-Host "Eliminando: $($ver.FullName)" -ForegroundColor Yellow
            Remove-Item $ver.FullName -Recurse -Force
        }
        Write-Host "✓ Eliminadas $($neoforgeVersions.Count) instalaciones de NeoForge" -ForegroundColor Green
    }
} else {
    Write-Host "⚠ Directorio versions/ no encontrado" -ForegroundColor Yellow
}

Write-Host ""

# 2. Eliminar librerías de NeoForge
$librariesDir = Join-Path $CommonDir "libraries"

if (Test-Path $librariesDir) {
    # net.neoforged:neoforge
    $neoforgedPath = Join-Path $librariesDir "net\neoforged"
    if (Test-Path $neoforgedPath) {
        Write-Host "Eliminando: $neoforgedPath" -ForegroundColor Yellow
        Remove-Item $neoforgedPath -Recurse -Force
        Write-Host "✓ Eliminado net.neoforged" -ForegroundColor Green
    } else {
        Write-Host "✓ net.neoforged no encontrado (ya limpio)" -ForegroundColor Green
    }
    
    Write-Host ""
    
    # NOTA: NO eliminamos otras librerías compartidas (ASM, Mixin, etc.)
    Write-Host "ℹ Otras librerías NO fueron eliminadas (pueden ser compartidas con Forge/Fabric)" -ForegroundColor Cyan
    
} else {
    Write-Host "⚠ Directorio libraries/ no encontrado" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== LIMPIEZA COMPLETADA ===" -ForegroundColor Green
Write-Host "Próximos pasos:" -ForegroundColor Cyan
Write-Host "1. Reinicia el launcher" -ForegroundColor Gray
Write-Host "2. Crea una nueva instalación de NeoForge" -ForegroundColor Gray
Write-Host "3. Se descargará todo desde cero con las correcciones aplicadas" -ForegroundColor Gray
Write-Host ""
