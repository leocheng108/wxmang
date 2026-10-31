@echo off
chcp 65001 >nul
echo 即将清空演示数据（笔记/批注、分类归类、检索历史、登录会话）。
echo 用户账号与索引数据默认保留。
echo.
set /p confirm=确认继续？(y/N)
if /i not "%confirm%"=="y" exit /b
echo.
"%~dp0runtime\node.exe" "%~dp0app\scripts\reset-demo.mjs" %*
echo.
echo 重置完成。如果应用正在运行，请重启后再验证（分类会在启动时重新播种）。
pause
