# Generates solid-color placeholder PNG icons for the Octane PWA.
# No dependencies beyond .NET System.Drawing (built into Windows PowerShell 5.1+).
#
# Usage:  pwsh -File public/icons/generate-icons.ps1
#     or:  powershell -ExecutionPolicy Bypass -File public/icons/generate-icons.ps1
#
# Produces, in the same folder as this script:
#   icon-192.png            (192x192,  solid #0f172a)
#   icon-512.png            (512x512,  solid #0f172a)
#   icon-512-maskable.png   (512x512,  solid #0f172a — safe-zone filled so any
#                            mask shape crops to the same color)
#
# These are PLACEHOLDERS so the home-screen icon is not blank. Replace them
# with a real branded icon (any square PNG of the right size) and re-run
# `npm run build` + redeploy. See public/icons/README.md.

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# Output folder = the folder this script lives in.
$OutDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Add-Type -AssemblyName System.Drawing

# Octane dark background — matches manifest theme_color / background_color.
$bg = [System.Drawing.Color]::FromArgb(0x0f, 0x17, 0x2a)

function New-SolidPng([int]$Size, [string]$Path) {
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $brush = New-Object System.Drawing.SolidBrush($bg)
    $gfx.FillRectangle($brush, 0, 0, $Size, $Size)
    $gfx.Dispose()
    $brush.Dispose()
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created $Path ($Size x $Size)"
}

New-SolidPng 192 (Join-Path $OutDir 'icon-192.png')
New-SolidPng 512 (Join-Path $OutDir 'icon-512.png')
New-SolidPng 512 (Join-Path $OutDir 'icon-512-maskable.png')

Write-Host ""
Write-Host "Done. Re-run 'npm run build' and redeploy dist/ to pick up the new icons."