# Chiral Controller 启动脚本
$CHIRAL_ROOT = "C:\Users\li\Documents\GitHub\Chiral-Controller"

param(
    [switch]$Normal
)

$kimiVersion = if ($Normal) { "kimi" } else { "kimi-superpowers" }
$mode = if ($Normal) { "Normal" } else { "Superpowers" }

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "    Chiral Controller - $mode Mode" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Using: $kimiVersion" -ForegroundColor Yellow
Write-Host ""

# 启动 MCP Server
$serverJob = Start-Job -ScriptBlock {
    param($root, $kimi)
    $env:KIMI_CLI = $kimi
    Set-Location "$root\skill"
    & "$root\skill\node_modules\.bin\tsx.cmd" src\server.ts
} -ArgumentList $CHIRAL_ROOT, $kimiVersion

Start-Sleep -Seconds 2

# 启动 Web Client
$clientJob = Start-Job -ScriptBlock {
    param($root)
    Set-Location "$root\mobile"
    npm run dev
} -ArgumentList $CHIRAL_ROOT

Start-Sleep -Seconds 3

# 获取 IP
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
if (-not $ip) { $ip = "192.168.31.17" }

Write-Host "===============================================" -ForegroundColor Green
Write-Host "              Started!" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Local:   http://localhost:5173" -ForegroundColor White
Write-Host "Mobile:  http://${ip}:5173" -ForegroundColor White
Write-Host "Server:  http://${ip}:3777" -ForegroundColor White
Write-Host ""
Write-Host "按 Ctrl+C 停止服务" -ForegroundColor Gray
Write-Host ""

try {
    while ($true) {
        Receive-Job -Job $serverJob | ForEach-Object { Write-Host "[SERVER] $_" -ForegroundColor Blue }
        Receive-Job -Job $clientJob | ForEach-Object { Write-Host "[CLIENT] $_" -ForegroundColor Magenta }
        Start-Sleep -Milliseconds 100
    }
} finally {
    Stop-Job -Job $serverJob, $clientJob -ErrorAction SilentlyContinue
    Remove-Job -Job $serverJob, $clientJob -ErrorAction SilentlyContinue
    Write-Host "`n服务已停止" -ForegroundColor Yellow
}
