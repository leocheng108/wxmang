# BizFind Demo · 停止（应用 → Solr）
$ErrorActionPreference = 'Continue'
$root = $PSScriptRoot

$appPort = 5180
$solrPort = 8983
$envFile = Join-Path $root 'app\.env'
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*PORT\s*=\s*(\d+)') { $appPort = [int]$Matches[1] }
    if ($line -match '^\s*SOLR_URL\s*=\s*http://[^:/\s]+:(\d+)') { $solrPort = [int]$Matches[1] }
  }
}

$env:SOLR_JAVA_HOME = Join-Path $root 'runtime\jre8'
$env:JAVA_HOME = $env:SOLR_JAVA_HOME
Write-Host 'BizFind Demo 停止中…' -ForegroundColor Cyan

# 1) 应用：按端口找 PID
$conn = Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue
if ($conn) {
  foreach ($item in $conn) {
    try {
      Stop-Process -Id $item.OwningProcess -Force -ErrorAction Stop
      Write-Host ("  已停止应用进程 {0}" -f $item.OwningProcess)
    } catch {
      Write-Host ("  应用进程 {0} 停止失败：{1}" -f $item.OwningProcess, $_.Exception.Message) -ForegroundColor Yellow
    }
  }
} else {
  Write-Host "  应用未在运行（:$appPort）"
}

# 2) Solr
$solrCmd = Join-Path $root 'solr\bin\solr.cmd'
if (Test-Path $solrCmd) {
  & $solrCmd stop -p $solrPort -all | Out-Null
  Write-Host "  已停止 Solr（:$solrPort）"
}

Write-Host '完成。' -ForegroundColor Green
