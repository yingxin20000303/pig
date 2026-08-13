$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$appRoot = Join-Path $projectRoot 'app'
$outputRoot = Join-Path $projectRoot 'dist\WebSSH-Portable'
$runtimeRoot = Join-Path $outputRoot 'runtime'
$nodeSource = 'C:\Program Files\nodejs\node.exe'
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'

if (-not (Test-Path $nodeSource)) { throw "Node runtime not found: $nodeSource" }
if (-not (Test-Path $csc)) { throw "C# compiler not found: $csc" }

$profilesPath = Join-Path $outputRoot 'ssh-connections.json'
Remove-Item $outputRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $outputRoot, $runtimeRoot | Out-Null

Copy-Item $nodeSource (Join-Path $runtimeRoot 'node.exe')
Copy-Item (Join-Path $appRoot 'server.js'), (Join-Path $appRoot 'launch-browser.js'), (Join-Path $appRoot 'package.json') -Destination $outputRoot
[System.IO.File]::WriteAllText($profilesPath, '[]', [System.Text.UTF8Encoding]::new($false))
Copy-Item (Join-Path $appRoot 'public') -Destination $outputRoot -Recurse
Copy-Item (Join-Path $appRoot 'node_modules') -Destination $outputRoot -Recurse

Remove-Item (Join-Path $outputRoot 'node_modules\@yao-pkg') -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $outputRoot 'node_modules\.bin') -Recurse -Force -ErrorAction SilentlyContinue
# Remove unnecessary native/optional modules to keep the portable build lean
foreach ($name in @('cpu-features', 'nan', 'buildcheck', '.cache')) {
    $target = Join-Path $outputRoot ("node_modules\{0}" -f $name)
    if (Test-Path $target) { Remove-Item $target -Recurse -Force }
}

$launcherPath = Join-Path $outputRoot 'WebSSH.exe'
$launcherSource = Join-Path $PSScriptRoot 'WebSSHLauncher.cs'
& $csc /nologo /target:winexe ("/out:{0}" -f $launcherPath) /r:System.Windows.Forms.dll $launcherSource
if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed.' }

Get-ChildItem $outputRoot -Recurse -Force | Unblock-File -ErrorAction SilentlyContinue
Write-Output "Build completed: $outputRoot\WebSSH.exe"
