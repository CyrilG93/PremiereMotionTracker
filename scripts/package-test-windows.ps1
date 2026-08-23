# Build a Windows CCX package with the native addon and its LGPL FFmpeg decoder sidecar.
[CmdletBinding()]
param(
    [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$version = $package.version
$addonName = "premiere-motion-tracker-$version.uxpaddon"
$runtimeDirectory = Join-Path $projectRoot 'win\x64'
$sourceAddon = Join-Path $runtimeDirectory $addonName
$sourceFfmpeg = Join-Path $runtimeDirectory 'ffmpeg.exe'
$sourceLicense = Join-Path $runtimeDirectory 'FFMPEG-LICENSE.txt'

# Keep test packages separate from public releases unless the caller explicitly chooses another directory.
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $projectRoot 'Releases\Test'
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
$outputFile = Join-Path $OutputDirectory "PremiereMotionTracker-$version-windows-x64.ccx"

foreach ($requiredFile in @($sourceAddon, $sourceFfmpeg, $sourceLicense)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Missing Windows runtime file: $requiredFile"
    }
}
if (Test-Path -LiteralPath $outputFile) {
    throw "Refusing to overwrite existing package: $outputFile"
}

# Verify the downloaded executable before shipping it: this project distributes only the LGPL FFmpeg build.
$ffmpegVersion = (& $sourceFfmpeg -version 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0 -or $ffmpegVersion -notmatch 'ffmpeg version') {
    throw 'The bundled ffmpeg.exe cannot be executed successfully.'
}
if ($ffmpegVersion -match '--enable-gpl') {
    throw 'The bundled ffmpeg.exe is GPL-enabled. Download the LGPL build with scripts/fetch-ffmpeg-windows.ps1.'
}
if (-not (Select-String -LiteralPath $sourceLicense -Pattern 'GNU LESSER GENERAL PUBLIC LICENSE' -Quiet)) {
    throw 'FFMPEG-LICENSE.txt does not contain the expected LGPL notice.'
}

$stageDirectory = Join-Path $env:TEMP ("pmt-package-" + [guid]::NewGuid().ToString('N'))
$pluginDirectory = Join-Path $stageDirectory 'plugin'
$archiveTemporary = Join-Path $env:TEMP ("pmt-package-" + [guid]::NewGuid().ToString('N') + '.zip')

try {
    New-Item -ItemType Directory -Path $pluginDirectory -Force | Out-Null

    # Stage only UXP runtime files so source builds, test output, and development dependencies never ship.
    foreach ($runtimeFile in @('index.html', 'index.js', 'manifest.json', 'styles.css', 'package.json')) {
        Copy-Item -LiteralPath (Join-Path $projectRoot $runtimeFile) -Destination (Join-Path $pluginDirectory $runtimeFile)
    }
    foreach ($runtimeFolder in @('src', 'assets')) {
        Copy-Item -LiteralPath (Join-Path $projectRoot $runtimeFolder) -Destination (Join-Path $pluginDirectory $runtimeFolder) -Recurse
    }

    $stagedRuntimeDirectory = Join-Path $pluginDirectory 'win\x64'
    New-Item -ItemType Directory -Path $stagedRuntimeDirectory -Force | Out-Null
    Copy-Item -LiteralPath $sourceAddon -Destination (Join-Path $stagedRuntimeDirectory $addonName)
    Copy-Item -LiteralPath $sourceFfmpeg -Destination (Join-Path $stagedRuntimeDirectory 'ffmpeg.exe')
    Copy-Item -LiteralPath $sourceLicense -Destination (Join-Path $stagedRuntimeDirectory 'FFMPEG-LICENSE.txt')

    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
    # Create a CCX-compatible ZIP whose manifest and native sidecars are at the archive root.
    [System.IO.Compression.ZipFile]::CreateFromDirectory(
        $pluginDirectory,
        $archiveTemporary,
        [System.IO.Compression.CompressionLevel]::Optimal,
        $false
    )
    Move-Item -LiteralPath $archiveTemporary -Destination $outputFile

    # Inspect the emitted archive instead of trusting the staging copy.
    $archive = [System.IO.Compression.ZipFile]::OpenRead($outputFile)
    try {
        # .NET keeps Windows path separators in ZIP entry names, so compare a normalized archive path.
        $entryNames = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
        foreach ($expectedEntry in @('manifest.json', "win/x64/$addonName", 'win/x64/ffmpeg.exe', 'win/x64/FFMPEG-LICENSE.txt')) {
            if ($entryNames -notcontains $expectedEntry) {
                throw "The generated package is missing: $expectedEntry"
            }
        }
    }
    finally {
        $archive.Dispose()
    }

    Write-Output "Created Windows x64 package: $outputFile"
    Write-Output "Bundled FFmpeg: $($ffmpegVersion.Split([Environment]::NewLine)[0])"
}
finally {
    # Remove only uniquely named temporary build locations created by this script.
    if (Test-Path -LiteralPath $stageDirectory) { Remove-Item -LiteralPath $stageDirectory -Recurse -Force }
    if (Test-Path -LiteralPath $archiveTemporary) { Remove-Item -LiteralPath $archiveTemporary -Force }
}
