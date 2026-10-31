# BizFind Demo · 启动（Solr → 应用），可重复执行
# 位置：交付包根目录；依赖 .\solr、.\app、.\runtime
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

# 端口以 app\.env 为准，脚本内不写死
$appPort = 5180
$solrPort = 8983
$envFile = Join-Path $root 'app\.env'
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*PORT\s*=\s*(\d+)') { $appPort = [int]$Matches[1] }
    if ($line -match '^\s*SOLR_URL\s*=\s*http://[^:/\s]+:(\d+)') { $solrPort = [int]$Matches[1] }
  }
}

$jreDir = Join-Path $root 'runtime\jre8'
if (-not (Test-Path (Join-Path $jreDir 'bin\java.exe'))) {
  Write-Host '  缺少 runtime\jre8（Solr 7.7.2 需要 Java 8），无法启动' -ForegroundColor Red
  exit 1
}
$env:SOLR_JAVA_HOME = $jreDir
$env:JAVA_HOME = $jreDir
$solrCmd = Join-Path $root 'solr\bin\solr.cmd'
$solrHome = Join-Path $root 'solr\server\solr'
$appDir = Join-Path $root 'app'
$nodeExe = Join-Path $root 'runtime\node.exe'
$logDir = Join-Path $appDir 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null

function Test-Http([string]$url, [int]$timeoutMs = 1500) {
  try {
    $request = [System.Net.HttpWebRequest]::Create($url)
    $request.Timeout = $timeoutMs
    $request.Method = 'GET'
    $response = $request.GetResponse()
    $response.Close()
    return $true
  } catch { return $false }
}

function Wait-Http([string]$url, [int]$seconds, [string]$label) {
  for ($i = 0; $i -lt $seconds; $i++) {
    if (Test-Http $url) { return $true }
    Start-Sleep -Seconds 1
  }
  Write-Host ("  [失败] {0} 在 {1} 秒内未就绪" -f $label, $seconds) -ForegroundColor Red
  return $false
}

Write-Host 'BizFind Demo 启动中…' -ForegroundColor Cyan

# 1) Solr
$solrUp = Test-Http "http://127.0.0.1:$solrPort/solr/admin/cores?action=STATUS&wt=json"
if ($solrUp) {
  Write-Host "  Solr 已在运行（:$solrPort）"
} else {
  Write-Host "  启动 Solr（:$solrPort）…"
  Start-Process -FilePath $solrCmd -ArgumentList 'start', '-p', $solrPort, '-s', $solrHome `
    -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'solr.out.log') `
    -RedirectStandardError (Join-Path $logDir 'solr.err.log')
  if (-not (Wait-Http "http://127.0.0.1:$solrPort/solr/admin/cores?action=STATUS&wt=json" 180 'Solr')) {
    Write-Host '  查看 app\logs\solr.*.log 与 solr\server\logs\ 排查' -ForegroundColor Yellow
    exit 1
  }
}

# 2) 应用
$appUp = Test-Http "http://127.0.0.1:$appPort/api/health"
if ($appUp) {
  Write-Host "  应用已在运行（:$appPort）"
} else {
  Write-Host "  启动应用（:$appPort）…"
  Start-Process -FilePath $nodeExe -ArgumentList 'dist/start/index.js' -WorkingDirectory $appDir `
    -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'app.out.log') `
    -RedirectStandardError (Join-Path $logDir 'app.err.log')
  if (-not (Wait-Http "http://127.0.0.1:$appPort/api/health" 90 '应用')) {
    Write-Host '  查看 app\logs\app.*.log 排查' -ForegroundColor Yellow
    exit 1
  }
}

# 3) 汇报
try {
  $version = Invoke-RestMethod "http://127.0.0.1:$appPort/api/version" -TimeoutSec 3
  $health = Invoke-RestMethod "http://127.0.0.1:$appPort/api/health" -TimeoutSec 3
  Write-Host ''
  Write-Host ("  访问地址   http://127.0.0.1:{0}" -f $appPort) -ForegroundColor Green
  Write-Host ("  版本       {0} ({1})" -f $version.version, $version.commit)
  Write-Host ("  检索后端   {0} · {1}" -f $health.backend, $health.solr.core)
  Write-Host ''
} catch {
  Write-Host '  已启动，但读取状态失败；请运行 status.cmd 检查' -ForegroundColor Yellow
}
