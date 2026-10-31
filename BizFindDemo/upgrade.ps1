# BizFind Demo · 升级（保留数据，可回滚）
# 用法：把新版本的 zip 放在本目录，运行 upgrade.cmd
#      或 upgrade.cmd -From D:\downloads\BizFindDemo-1.1.0.zip
param(
  [string]$From = '',
  [switch]$KeepBackups
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$stamp = (Get-Date).ToString('yyyyMMdd-HHmm')
$backupDir = Join-Path $root "backup\upgrade-$stamp"

function Fail([string]$message) {
  Write-Host ("  升级中止：" + $message) -ForegroundColor Red
  exit 1
}

# 1) 定位新版本
if (-not $From) {
  $candidate = Get-ChildItem $root -Filter 'BizFindDemo*.zip' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $candidate) { Fail '没找到新版本 zip。请把新包放在本目录，或用 -From 指定路径。' }
  $From = $candidate.FullName
}
if (-not (Test-Path $From)) { Fail ("找不到 " + $From) }

# 2) 检查当前结构
foreach ($need in 'start.ps1', 'app', 'app\data') {
  if (-not (Test-Path (Join-Path $root $need))) { Fail ("当前目录不像交付包，缺少 " + $need) }
}

Write-Host '1/6 停止服务…' -ForegroundColor Cyan
& (Join-Path $root 'stop.ps1') | Out-Null

Write-Host "2/6 备份数据到 backup\upgrade-$stamp …" -ForegroundColor Cyan
New-Item -ItemType Directory -Force $backupDir | Out-Null
Copy-Item (Join-Path $root 'app\data') (Join-Path $backupDir 'data') -Recurse -Force
$envFile = Join-Path $root 'app\.env'
if (Test-Path $envFile) { Copy-Item $envFile (Join-Path $backupDir '.env') -Force }
$pwFile = Join-Path $root '首次登录口令.txt'
if (Test-Path $pwFile) { Copy-Item $pwFile (Join-Path $backupDir '首次登录口令.txt') -Force }
Write-Host ("      已备份：" + $backupDir)

Write-Host '3/6 解压新版本…' -ForegroundColor Cyan
$incoming = Join-Path $root '_incoming'
if (Test-Path $incoming) { Remove-Item $incoming -Recurse -Force }
New-Item -ItemType Directory -Force $incoming | Out-Null
if ((Get-Item $From).PSIsContainer) {
  Copy-Item (Join-Path $From '*') $incoming -Recurse -Force
} else {
  Expand-Archive -Path $From -DestinationPath $incoming -Force
}
# 有些 zip 会多包一层目录
$inner = Get-ChildItem $incoming -Directory | Select-Object -First 1
if ($inner -and (Test-Path (Join-Path $inner.FullName 'app'))) { $incoming = $inner.FullName }
if (-not (Test-Path (Join-Path $incoming 'app'))) { Fail '新版本包里没有 app 目录，可能不是交付包。' }

Write-Host '4/6 替换程序文件（保留 app\data 与 .env）…' -ForegroundColor Cyan
foreach ($dir in 'app', 'solr', 'runtime') {
  $source = Join-Path $incoming $dir
  if (-not (Test-Path $source)) { continue }
  $exclude = @()
  if ($dir -eq 'app') {
    $exclude = @((Join-Path $source 'data'), (Join-Path $source '.env'))
  }
  $args = @($source, (Join-Path $root $dir), '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1')
  if ($exclude.Count -gt 0) { $args += @('/XF') + $exclude }
  & robocopy @args | Out-Null
  if ($LASTEXITCODE -ge 8) { Fail ("替换 " + $dir + " 失败（robocopy " + $LASTEXITCODE + "）") }
  $global:LASTEXITCODE = 0
}
foreach ($file in 'start.ps1', 'stop.ps1', 'status.ps1', 'reset-data.ps1', 'upgrade.ps1', 'README-安装.md', '怎么用.txt', 'LICENSE-语料说明.txt') {
  $source = Join-Path $incoming $file
  if (Test-Path $source) { Copy-Item $source (Join-Path $root $file) -Force }
}

Write-Host '5/6 核对数据 …' -ForegroundColor Cyan
$newData = Join-Path $root 'app\data'
New-Item -ItemType Directory -Force $newData | Out-Null
foreach ($db in Get-ChildItem (Join-Path $backupDir 'data') -File -Filter '*.db') {
  if (-not (Test-Path (Join-Path $newData $db.Name))) { Copy-Item $db.FullName $newData -Force }
}
$info = Join-Path $root 'app\build-info.json'
if (Test-Path $info) {
  $parsed = Get-Content $info -Raw -Encoding UTF8 | ConvertFrom-Json
  Write-Host ("      程序版本 " + $parsed.version + " (" + $parsed.commit + ")，数据结构版本 " + $parsed.dataVersion)
}

Write-Host '6/6 启动服务…' -ForegroundColor Cyan
& (Join-Path $root 'start.ps1')
if ($LASTEXITCODE -ne 0) {
  Write-Host '  启动失败，正在从备份恢复数据…' -ForegroundColor Yellow
  Copy-Item (Join-Path $backupDir 'data\*') $newData -Force -Recurse
  Fail '启动失败。数据已从备份恢复，请查看 app\logs\app.err.log。'
}

Remove-Item $incoming -Recurse -Force -ErrorAction SilentlyContinue
if (-not $KeepBackups) {
  Write-Host ''
  Write-Host ("  备份保留在 " + $backupDir + "，确认无误后可自行删除") -ForegroundColor Yellow
}
Write-Host '  升级完成' -ForegroundColor Green
