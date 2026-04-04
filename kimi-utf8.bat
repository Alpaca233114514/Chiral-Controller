@echo off
REM Kimi CLI UTF-8 Launcher
REM 解决 Windows 控制台 GBK 编码无法显示 emoji 的问题

chcp 65001 >nul
set PYTHONIOENCODING=utf-8
kimi %*
