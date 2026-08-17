#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$NodePath,
    [string]$CscPath
)

$ErrorActionPreference = 'Stop'

function Resolve-RequiredExecutable {
    param(
        [string]$ProvidedPath,
        [string]$CommandName,
        [string]$FallbackPath,
        [string]$Label
    )

    foreach ($candidate in @($ProvidedPath, $FallbackPath)) {
        if ($candidate -and (Test-Path $candidate -PathType Leaf)) {
            return (Resolve-Path $candidate).Path
        }
    }
    $command = Get-Command $CommandName -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    throw "未找到 $Label。请将其加入 PATH，或通过对应参数指定完整路径。"
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$appRoot = Join-Path $projectRoot 'app'
$distRoot = Join-Path $projectRoot 'dist'
$windowsDistRoot = Join-Path $distRoot 'windows'
$outputRoot = Join-Path $windowsDistRoot 'WebSSH-Portable'
$runtimeRoot = Join-Path $outputRoot 'runtime'

# Read version from app/package.json for unified asset naming
$appPkg = Get-Content (Join-Path $appRoot 'package.json') -Raw | ConvertFrom-Json
$appVersion = $appPkg.version
# Unified asset name: WebSSH-<version>-<OS>
$assetName = ('WebSSH-{0}-Windows' -f $appVersion)
$nodeSource = Resolve-RequiredExecutable -ProvidedPath $NodePath -CommandName 'node' -FallbackPath 'C:\Program Files\nodejs\node.exe' -Label 'Node.js 运行时'
$csc = Resolve-RequiredExecutable -ProvidedPath $CscPath -CommandName 'csc' -FallbackPath 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe' -Label 'C# 编译器'

Remove-Item $outputRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $outputRoot, $runtimeRoot | Out-Null

Copy-Item $nodeSource (Join-Path $runtimeRoot 'node.exe')
Copy-Item (Join-Path $appRoot 'server.js'), (Join-Path $appRoot 'launch-browser.js'), (Join-Path $appRoot 'package.json') -Destination $outputRoot
# 连接配置和 AES-256-GCM 密钥均由服务首次保存时创建，避免发布包含初始明文配置。
Copy-Item (Join-Path $appRoot 'public') -Destination $outputRoot -Recurse
# 本地上传目录可能包含用户自定义背景图，发布包不应携带运行时数据。
Remove-Item (Join-Path $outputRoot 'public\uploads') -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $appRoot 'node_modules') -Destination $outputRoot -Recurse

Remove-Item (Join-Path $outputRoot 'node_modules\@yao-pkg') -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $outputRoot 'node_modules\.bin') -Recurse -Force -ErrorAction SilentlyContinue
# Remove unnecessary native/optional modules and bundled test fixtures.
# Test fixtures may contain example certificates or private keys and are never needed at runtime.
foreach ($name in @('cpu-features', 'nan', 'buildcheck', '.cache', 'ssh2\test', '.ssh2.DELETE')) {
    $target = Join-Path $outputRoot ("node_modules\{0}" -f $name)
    if (Test-Path $target) { Remove-Item $target -Recurse -Force }
}

$launcherPath = Join-Path $outputRoot 'WebSSH.exe'
$launcherSource = Join-Path $PSScriptRoot 'WebSSHLauncher.cs'
& $csc /nologo /target:winexe ("/out:{0}" -f $launcherPath) /r:System.Windows.Forms.dll $launcherSource
if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed.' }

Get-ChildItem $outputRoot -Recurse -Force | Unblock-File -ErrorAction SilentlyContinue
Write-Output "Build completed: $outputRoot\WebSSH.exe"

# Package as zip with unified asset name under dist/windows
New-Item -ItemType Directory -Force -Path $windowsDistRoot | Out-Null
$zipPath = Join-Path $windowsDistRoot ($assetName + '.zip')
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
Compress-Archive -Path $outputRoot -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item $outputRoot -Recurse -Force
Write-Output ("Asset: {0}" -f $zipPath)
