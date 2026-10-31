# BizFind Demo · 注册开机自启（启动任务 + 每 5 分钟自愈）
# 需要以管理员身份运行 install-autostart.cmd
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$startScript = Join-Path $root 'start.ps1'
$mainTask = 'BizFindDemo'
$watchTask = 'BizFindDemoWatchdog'
$command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$startScript`""

if ($Remove) {
  foreach ($task in $mainTask, $watchTask) {
    schtasks /delete /tn $task /f 2>$null | Out-Null
    Write-Host ("  已删除计划任务 {0}" -f $task)
  }
  Write-Host '开机自启已移除。' -ForegroundColor Green
  exit 0
}

if (-not (Test-Path $startScript)) {
  Write-Host ("找不到 {0}" -f $startScript) -ForegroundColor Red
  exit 1
}

schtasks /create /tn $mainTask /tr $command /sc onstart /ru SYSTEM /rl HIGHEST /f | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host '注册开机任务失败（请用管理员运行）' -ForegroundColor Red; exit 1 }
Write-Host ("  已注册开机启动任务：{0}" -f $mainTask)

schtasks /create /tn $watchTask /tr $command /sc minute /mo 5 /ru SYSTEM /rl HIGHEST /f | Out-Null
if ($LASTEXITCODE -eq 0) {
  Write-Host ("  已注册看护任务：{0}（每 5 分钟检查，未运行则拉起）" -f $watchTask)
} else {
  Write-Host '  看护任务注册失败（可选，不影响开机启动）' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '完成后：重启机器会自动启动；也可现在手动运行 start.cmd。' -ForegroundColor Green
