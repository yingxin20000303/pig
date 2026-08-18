#Requires -Version 5.1
<#
.SYNOPSIS
将 WebSSH 打包为飞牛 fnOS 原生应用 FPK（不依赖 Docker，纯 JS 依赖，兼容 x86/ARM）。

.DESCRIPTION
1. 将 app/ 下的 server.js / server / public / package.json 复制到 fnos/webssh/app/server；
2. 复制 node_modules 并剔除需要原生编译的可选模块（cpu-features/nan/buildcheck 等），
   使依赖保持纯 JS，可在 x86 与 ARM 上直接运行；
3. 调用飞牛官方 fnpack 工具执行 build 生成 .fpk。

用法：
    .\scripts\build-fnos-fpk.ps1 -Fnpack "D:\tools\fnpack.exe"
    .\scripts\build-fnos-fpk.ps1 -DownloadFnpack            # 自动下载官方 Windows 版 fnpack 到 tools\
#>
[CmdletBinding()]
param(
    # 飞牛官方 fnpack 工具完整路径；留空则按 -FnpackPath 或 PATH 查找
    [string]$Fnpack = 'fnpack',

    # 允许从飞牛官方静态服务器下载 Windows x86_64 版 fnpack.exe 到 tools\
    [switch]$DownloadFnpack,

    # 跳过 node_modules 复制（调试结构用）
    [switch]$SkipNodeModules
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$appRoot = Join-Path $projectRoot 'app'
$fpkRoot = Join-Path $projectRoot 'fnos\webssh'
$serverRoot = Join-Path $fpkRoot 'app\server'
$outputRoot = Join-Path $projectRoot 'dist\fnos'
$toolsRoot = Join-Path $projectRoot 'tools'

# Read version from app/package.json for unified asset naming
$appPkg = Get-Content (Join-Path $appRoot 'package.json') -Raw | ConvertFrom-Json
$appVersion = $appPkg.version
# Unified asset name: WebSSH-<version>-<OS>
$assetName = ('WebSSH-{0}-fnOS' -f $appVersion)

# 需要剔除的原生编译/可选模块（会导致架构不通用）
$nativeExclude = @('cpu-features', 'nan', 'buildcheck', '.bin', '.cache', 'ssh2\test')

function Resolve-Fnpack {
    param([string]$Path)
    if ([System.IO.Path]::IsPathRooted($Path) -and (Test-Path $Path)) {
        return (Resolve-Path $Path).Path
    }
    $cmd = Get-Command $Path -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    if (-not $DownloadFnpack) {
        throw "未找到 fnpack：$Path。请从飞牛开放平台下载，或用 -DownloadFnpack 自动获取官方工具。"
    }
    $dest = Join-Path $toolsRoot 'fnpack.exe'
    New-Item -ItemType Directory -Force $toolsRoot | Out-Null
    Write-Host '下载官方 fnpack（Windows x86_64）...'
    Invoke-WebRequest -Uri 'https://static2.fnnas.com/fnpack/fnpack-1.2.1-windows-amd64' -OutFile $dest -UseBasicParsing
    return $dest
}

function Copy-AppServer {
    if (Test-Path $serverRoot) {
        Remove-Item $serverRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Force $serverRoot | Out-Null

    Write-Host '复制应用代码...'
    Copy-Item (Join-Path $appRoot 'server.js') $serverRoot
    Copy-Item (Join-Path $appRoot 'server') -Destination (Join-Path $serverRoot 'server') -Recurse
    Copy-Item (Join-Path $appRoot 'package.json') $serverRoot
    Copy-Item (Join-Path $appRoot 'package-lock.json') $serverRoot
    Copy-Item (Join-Path $appRoot 'public') (Join-Path $serverRoot 'public') -Recurse
    # 本地上传目录可能包含用户自定义背景图，发布包不应携带运行时数据。
    Remove-Item (Join-Path $serverRoot 'public\uploads') -Recurse -Force -ErrorAction SilentlyContinue

    if (-not $SkipNodeModules) {
        Write-Host '复制 node_modules（剔除原生编译模块，保证 x86/ARM 通用）...'
        $srcNodeModules = Join-Path $appRoot 'node_modules'
        if (-not (Test-Path $srcNodeModules)) { throw "缺少 node_modules，请先执行 npm install。" }
        Copy-Item $srcNodeModules (Join-Path $serverRoot 'node_modules') -Recurse -Force
        $dstNodeModules = Join-Path $serverRoot 'node_modules'
        foreach ($name in $nativeExclude) {
            $target = Join-Path $dstNodeModules $name
            if (Test-Path $target) { Remove-Item $target -Recurse -Force }
        }
    }
}

function Invoke-FnpackBuild {
    param([string]$FnpackPath)
    if (-not (Test-Path $fpkRoot)) { throw "缺少 FPK 项目目录：$fpkRoot" }
    # 移除 Docker 模板遗留目录与文件，避免被误识别
    $dockerDir = Join-Path $fpkRoot 'app\docker'
    if (Test-Path $dockerDir) { Remove-Item $dockerDir -Recurse -Force }
    foreach ($legacy in @('app\ui\index.cgi', 'app\ui\webssh.cgi')) {
        $target = Join-Path $fpkRoot $legacy
        if (Test-Path $target) { Remove-Item $target -Force }
    }

    New-Item -ItemType Directory -Force $outputRoot | Out-Null
    Push-Location $fpkRoot
    try {
        Write-Host "运行 fnpack build：$FnpackPath"
        & $FnpackPath build
        if ($LASTEXITCODE -ne 0) { throw "fnpack build 失败，退出码 $LASTEXITCODE" }
    } finally {
        Pop-Location
    }

    # 仅取 fnpack 本次生成于 fpkRoot 的 fpk（排除 dist\ 下历史版本产物，避免旧包覆盖新资产）
    $fpkFiles = @(Get-ChildItem $fpkRoot -Filter '*.fpk' -File)
    if (-not $fpkFiles) { throw 'fnpack 未生成 .fpk 文件' }
    $fpkFile = $fpkFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $assetPath = Join-Path $outputRoot ($assetName + '.fpk')
    Remove-Item $assetPath -Force -ErrorAction SilentlyContinue
    Copy-Item $fpkFile.FullName $assetPath -Force
    Write-Host ("FPK 产物：{0}" -f $assetPath)
}

$fnpackPath = Resolve-Fnpack -Path $Fnpack
Copy-AppServer
Invoke-FnpackBuild -FnpackPath $fnpackPath
Write-Host '完成。将 dist/fnos 下的 .fpk 通过 fnOS 应用中心手动安装即可。'
