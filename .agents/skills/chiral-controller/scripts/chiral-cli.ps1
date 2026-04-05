# Chiral Controller CLI
# 用法: chiral <command> [options]
# 
# 命令:
#   run dev      - 启动开发环境 (Server + Client)
#   run server   - 只启动 MCP Server
#   run client   - 只启动 Web Client
#   stop         - 停止所有服务
#   status       - 查看服务状态
#   help         - 显示帮助
#
# 选项:
#   -Normal      - 使用普通 kimi 版本 (默认使用 superpowers)

$CHIRAL_ROOT = "C:\Users\li\Documents\GitHub\Chiral-Controller"
$script:ServerJob = $null
$script:ClientJob = $null

function chiral {
    param(
        [Parameter(Mandatory=$false, Position=0)]
        [string]$Command,
        
        [Parameter(Mandatory=$false, Position=1)]
        [string]$SubCommand,
        
        [switch]$Normal,
        [switch]$Help
    )
    
    if ($Help -or -not $Command) {
        Show-Help
        return
    }
    
    $kimiVersion = if ($Normal) { "kimi" } else { "kimi-superpowers" }
    $mode = if ($Normal) { "Normal" } else { "Superpowers" }
    
    switch ($Command.ToLower()) {
        "run" {
            switch ($SubCommand.ToLower()) {
                "dev" { Start-Dev $kimiVersion $mode }
                "server" { Start-Server $kimiVersion $mode }
                "client" { Start-Client }
                default { Write-Host "未知子命令: $SubCommand" -ForegroundColor Red; Show-Help }
            }
        }
        "stop" { Stop-All }
        "status" { Show-Status }
        "help" { Show-Help }
        default { Write-Host "未知命令: $Command" -ForegroundColor Red; Show-Help }
    }
}

function Show-Help {
    Write-Host @"
Chiral Controller CLI

用法: chiral <command> [options]

命令:
  run dev        启动开发环境 (Server + Client)
  run server     只启动 MCP Server
  run client     只启动 Web Client
  stop           停止所有服务
  status         查看服务状态
  help           显示帮助信息

选项:
  -Normal        使用普通 kimi 版本 (默认使用 superpowers)

示例:
  chiral run dev           # 使用 superpowers 启动
  chiral run dev -Normal   # 使用普通 kimi 启动
  chiral run server        # 只启动 Server
  chiral stop              # 停止所有服务
  chiral status            # 查看状态
"@ -ForegroundColor Cyan
}

function Start-Dev($kimiVersion, $mode) {
    Write-Host "===============================================" -ForegroundColor Cyan
    Write-Host "    Chiral Controller - $mode Mode" -ForegroundColor Cyan
    Write-Host "===============================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Using: $kimiVersion" -ForegroundColor Yellow
    Write-Host ""
    
    Start-ServerInternal $kimiVersion
    Start-Sleep -Seconds 2
    Start-ClientInternal
    Start-Sleep -Seconds 2
    
    Show-Urls
    
    Write-Host "按 Ctrl+C 停止服务" -ForegroundColor Gray
    Write-Host ""
    
    try {
        while ($true) {
            if ($script:ServerJob) {
                Receive-Job -Job $script:ServerJob | ForEach-Object { Write-Host "[SERVER] $_" -ForegroundColor Blue }
            }
            if ($script:ClientJob) {
                Receive-Job -Job $script:ClientJob | ForEach-Object { Write-Host "[CLIENT] $_" -ForegroundColor Magenta }
            }
            Start-Sleep -Milliseconds 100
        }
    } finally {
        Stop-All
    }
}

function Start-Server($kimiVersion, $mode) {
    Write-Host "===============================================" -ForegroundColor Cyan
    Write-Host "    MCP Server - $mode Mode" -ForegroundColor Cyan
    Write-Host "===============================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Using: $kimiVersion" -ForegroundColor Yellow
    Write-Host ""
    
    Start-ServerInternal $kimiVersion
    Show-Urls
    
    try {
        while ($true) {
            if ($script:ServerJob) {
                Receive-Job -Job $script:ServerJob | ForEach-Object { Write-Host "[SERVER] $_" -ForegroundColor Blue }
            }
            Start-Sleep -Milliseconds 100
        }
    } finally {
        Stop-All
    }
}

function Start-Client {
    Write-Host "===============================================" -ForegroundColor Cyan
    Write-Host "    Web Client" -ForegroundColor Cyan
    Write-Host "===============================================" -ForegroundColor Cyan
    Write-Host ""
    
    Start-ClientInternal
    Show-Urls
    
    try {
        while ($true) {
            if ($script:ClientJob) {
                Receive-Job -Job $script:ClientJob | ForEach-Object { Write-Host "[CLIENT] $_" -ForegroundColor Magenta }
            }
            Start-Sleep -Milliseconds 100
        }
    } finally {
        Stop-All
    }
}

function Start-ServerInternal($kimiVersion) {
    $script:ServerJob = Start-Job -ScriptBlock {
        param($root, $kimi)
        $env:KIMI_CLI = $kimi
        Set-Location "$root\skill"
        & "$root\skill\node_modules\.bin\tsx.cmd" src\server.ts
    } -ArgumentList $CHIRAL_ROOT, $kimiVersion
    Write-Host "✓ MCP Server 启动中..." -ForegroundColor Green
}

function Start-ClientInternal {
    $script:ClientJob = Start-Job -ScriptBlock {
        param($root)
        Set-Location "$root\mobile"
        npm run dev
    } -ArgumentList $CHIRAL_ROOT
    Write-Host "✓ Web Client 启动中..." -ForegroundColor Green
}

function Show-Urls {
    Start-Sleep -Seconds 1
    $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
    if (-not $ip) { $ip = "192.168.31.17" }
    
    Write-Host ""
    Write-Host "===============================================" -ForegroundColor Green
    Write-Host "              Started!" -ForegroundColor Green
    Write-Host "===============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Local:   http://localhost:5173" -ForegroundColor White
    Write-Host "Mobile:  http://${ip}:5173" -ForegroundColor White
    Write-Host "Server:  http://${ip}:3777" -ForegroundColor White
    Write-Host ""
}

function Stop-All {
    Write-Host "`n停止服务中..." -ForegroundColor Yellow
    if ($script:ServerJob) {
        Stop-Job -Job $script:ServerJob -ErrorAction SilentlyContinue
        Remove-Job -Job $script:ServerJob -ErrorAction SilentlyContinue
        $script:ServerJob = $null
        Write-Host "✓ MCP Server 已停止" -ForegroundColor Green
    }
    if ($script:ClientJob) {
        Stop-Job -Job $script:ClientJob -ErrorAction SilentlyContinue
        Remove-Job -Job $script:ClientJob -ErrorAction SilentlyContinue
        $script:ClientJob = $null
        Write-Host "✓ Web Client 已停止" -ForegroundColor Green
    }
}

function Show-Status {
    $serverRunning = $script:ServerJob -and (Get-Job -Id $script:ServerJob.Id -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Running" })
    $clientRunning = $script:ClientJob -and (Get-Job -Id $script:ClientJob.Id -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Running" })
    
    Write-Host "Chiral Controller 状态:" -ForegroundColor Cyan
    Write-Host ""
    if ($serverRunning) {
        Write-Host "  MCP Server: 运行中 ✓" -ForegroundColor Green
    } else {
        Write-Host "  MCP Server: 未运行 ✗" -ForegroundColor Red
    }
    
    if ($clientRunning) {
        Write-Host "  Web Client: 运行中 ✓" -ForegroundColor Green
    } else {
        Write-Host "  Web Client: 未运行 ✗" -ForegroundColor Red
    }
    Write-Host ""
}

# 导出函数
Export-ModuleMember -Function chiral
