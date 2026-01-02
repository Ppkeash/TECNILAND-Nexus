# Script de limpieza para instalaciones corruptas de Quilt
# Elimina version.json, libraries y fuerza reinstalación

param(
    [string]$CommonDir = "..\app\common"
)

Write-Host "=== LIMPIEZA DE QUILT ===" -ForegroundColor Cyan
Write-Host "Este script eliminará todas las instalaciones de Quilt existentes" -ForegroundColor Yellow
Write-Host "Directorio: $CommonDir" -ForegroundColor Gray
Write-Host ""

$confirm = Read-Host "¿Continuar? (S/N)"
if ($confirm -ne "S" -and $confirm -ne "s") {
    Write-Host "Operación cancelada" -ForegroundColor Red
    exit
}

Write-Host ""

# 1. Eliminar version.json de Quilt
$versionsDir = Join-Path $CommonDir "versions"
if (Test-Path $versionsDir) {
    $quiltVersions = Get-ChildItem $versionsDir -Directory | Where-Object { $_.Name -like "quilt-loader-*" }
    
    if ($quiltVersions.Count -eq 0) {
        Write-Host "✓ No se encontraron instalaciones de Quilt en versions/" -ForegroundColor Green
    } else {
        foreach ($ver in $quiltVersions) {
            Write-Host "Eliminando: $($ver.FullName)" -ForegroundColor Yellow
            Remove-Item $ver.FullName -Recurse -Force
        }
        Write-Host "✓ Eliminadas $($quiltVersions.Count) instalaciones de Quilt" -ForegroundColor Green
    }
} else {
    Write-Host "⚠ Directorio versions/ no encontrado" -ForegroundColor Yellow
}

Write-Host ""

# 2. Eliminar librerías de Quilt
$librariesDir = Join-Path $CommonDir "libraries"

if (Test-Path $librariesDir) {
    # org.quiltmc:quilt-loader
    $quiltLoaderPath = Join-Path $librariesDir "org\quiltmc\quilt-loader"
    if (Test-Path $quiltLoaderPath) {
        Write-Host "Eliminando: $quiltLoaderPath" -ForegroundColor Yellow
        Remove-Item $quiltLoaderPath -Recurse -Force
        Write-Host "✓ Eliminado org.quiltmc:quilt-loader" -ForegroundColor Green
    } else {
        Write-Host "✓ org.quiltmc:quilt-loader no encontrado (ya limpio)" -ForegroundColor Green
    }
    
    Write-Host ""
    
    # org.quiltmc:hashed (mappings específicos de Quilt)
    $hashedPath = Join-Path $librariesDir "org\quiltmc\hashed"
    if (Test-Path $hashedPath) {
        Write-Host "Eliminando: $hashedPath" -ForegroundColor Yellow
        Remove-Item $hashedPath -Recurse -Force
        Write-Host "✓ Eliminado org.quiltmc:hashed" -ForegroundColor Green
    } else {
        Write-Host "✓ org.quiltmc:hashed no encontrado (ya limpio)" -ForegroundColor Green
    }
    
    Write-Host ""
    
    # NOTA: NO eliminamos net.fabricmc:intermediary porque Fabric puede estar usándolo
    Write-Host "ℹ net.fabricmc:intermediary NO fue eliminado (puede ser usado por Fabric)" -ForegroundColor Cyan
    
} else {
    Write-Host "⚠ Directorio libraries/ no encontrado" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== LIMPIEZA COMPLETADA ===" -ForegroundColor Green
Write-Host "Próximos pasos:" -ForegroundColor Cyan
Write-Host "1. Reinicia el launcher" -ForegroundColor Gray
Write-Host "2. Crea una nueva instalación de Quilt" -ForegroundColor Gray
Write-Host "3. Se descargará todo desde cero con las correcciones aplicadas" -ForegroundColor Gray
Write-Host ""
