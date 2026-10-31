# BizFind Demo · 状态
$ErrorActionPreference = 'Continue'

$appPort = 5180
$solrPort = 8983
$envFile = Join-Path $PSScriptRoot 'app\.env'
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*PORT\s*=\s*(\d+)') { $appPort = [int]$Matches[1] }
    if ($line -match '^\s*SOLR_URL\s*=\s*http://[^:/\s]+:(\d+)') { $solrPort = [int]$Matches[1] }
  }
}

function Get-Json([string]$url) {
  try { return Invoke-RestMethod $url -TimeoutSec 3 } catch { return $null }
}

Write-Host 'BizFind Demo 状态' -ForegroundColor Cyan
Write-Host '----------------------------------------'

$sessions = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue
$solrListening = $sessions | Where-Object { $_.LocalPort -eq $solrPort }
$appListening = $sessions | Where-Object { $_.LocalPort -eq $appPort }

Write-Host ("  Solr :{0}   {1}" -f $solrPort, $(if ($solrListening) { '监听中' } else { '未运行' }))
Write-Host ("  应用 :{0}   {1}" -f $appPort, $(if ($appListening) { '监听中' } else { '未运行' }))

$version = Get-Json "http://127.0.0.1:$appPort/api/version"
if ($version) {
  Write-Host ("  版本       {0} ({1})  构建于 {2}" -f $version.version, $version.commit, $version.builtAt)
  Write-Host ("  运行时长   {0} 分钟" -f [math]::Round($version.uptimeSec / 60, 1))
  Write-Host ("  默认 Core  {0}" -f $version.core)
}
$health = Get-Json "http://127.0.0.1:$appPort/api/health"
if ($health) {
  Write-Host ("  检索后端   {0}" -f $health.backend)
  Write-Host ("  Solr 状态  {0}（{1}ms）" -f $health.solr.reachable, $health.solr.latencyMs)
  Write-Host ("  数据源     {0}" -f (($health.cores | ForEach-Object { $_.name }) -join ', '))
  Write-Host ("  回退文档   {0} 篇" -f $health.mock.docCount)
}
if (-not $health) { Write-Host '  应用无响应，查看 app\logs\app.err.log' -ForegroundColor Yellow }
Write-Host '----------------------------------------'
