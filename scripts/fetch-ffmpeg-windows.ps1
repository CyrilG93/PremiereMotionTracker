# Download the LGPL static FFmpeg sidecar used only when Windows Media Foundation cannot decode a source codec.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$downloadPath = Join-Path $env:TEMP 'premiere-motion-tracker-ffmpeg-lgpl.zip'
$extractPath = Join-Path $env:TEMP 'premiere-motion-tracker-ffmpeg-lgpl'
$targetPath = Join-Path $projectRoot 'win\x64'
$url = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl.zip'

Invoke-WebRequest -Uri $url -OutFile $downloadPath
Expand-Archive -LiteralPath $downloadPath -DestinationPath $extractPath -Force
$ffmpeg = Get-ChildItem -LiteralPath $extractPath -Recurse -Filter 'ffmpeg.exe' | Select-Object -First 1
$license = Get-ChildItem -LiteralPath $extractPath -Recurse -Filter 'LICENSE.txt' | Select-Object -First 1
if (-not $ffmpeg -or -not $license) { throw 'The downloaded FFmpeg archive is incomplete.' }

# Keep the executable beside the addon because the native module resolves only its own sidecar directory.
Copy-Item -LiteralPath $ffmpeg.FullName -Destination (Join-Path $targetPath 'ffmpeg.exe') -Force
Copy-Item -LiteralPath $license.FullName -Destination (Join-Path $targetPath 'FFMPEG-LICENSE.txt') -Force
