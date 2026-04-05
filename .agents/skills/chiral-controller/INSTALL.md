# Chiral Controller CLI 安装指南

## 快速安装（推荐）

### 1. 打开 PowerShell Profile 文件

**文件路径：**
```
C:\Users\li\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1
```

如果文件不存在，先创建目录：
```powershell
New-Item -ItemType Directory -Path "C:\Users\li\Documents\WindowsPowerShell" -Force
New-Item -ItemType File -Path "C:\Users\li\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1" -Force
```

### 2. 复制以下内容到 Profile 文件

```powershell
# Chiral Controller CLI
$CHIRAL_ROOT = "C:\Users\li\Documents\GitHub\Chiral-Controller"

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
        @"
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
"@ | Write-Host -ForegroundColor Cyan
        return
    }
    
    $kimiVersion = if ($Normal) { "kimi" } else { "kimi-superpowers" }
    $mode = if ($Normal) { "Normal" } else { "Superpowers" }
    
    switch ($Command.ToLower()) {
        "run" {
            switch ($SubCommand.ToLower()) {
                "dev" { 
                    Write-Host "===============================================" -ForegroundColor Cyan
                    Write-Host "    Chiral Controller - $mode Mode" -ForegroundColor Cyan
                    Write-Host "===============================================" -ForegroundColor Cyan
                    Write-Host ""
                    Write-Host "Using: $kimiVersion" -ForegroundColor Yellow
                    Write-Host ""
                    
                    # 启动 Server
                    $serverJob = Start-Job -ScriptBlock {
                        param($root, $kimi)
                        $env:KIMI_CLI = $kimi
                        Set-Location "$root\skill"
                        & "$root\skill\node_modules\.bin\tsx.cmd" src\server.ts
                    } -ArgumentList $CHIRAL_ROOT, $kimiVersion
                    Write-Host "✓ MCP Server 启动中..." -ForegroundColor Green
                    
                    Start-Sleep -Seconds 2
                    
                    # 启动 Client
                    $clientJob = Start-Job -ScriptBlock {
                        param($root)
                        Set-Location "$root\mobile"
                        npm run dev
                    } -ArgumentList $CHIRAL_ROOT
                    Write-Host "✓ Web Client 启动中..." -ForegroundColor Green
                    
                    Start-Sleep -Seconds 2
                    
                    # 显示 URL
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
                }
                "server" { 
                    Write-Host "Starting MCP Server ($mode)..." -ForegroundColor Cyan
                    $env:KIMI_CLI = $kimiVersion
                    Set-Location "$CHIRAL_ROOT\skill"
                    & "$CHIRAL_ROOT\skill\node_modules\.bin\tsx.cmd" src\server.ts
                }
                "client" { 
                    Write-Host "Starting Web Client..." -ForegroundColor Cyan
                    Set-Location "$CHIRAL_ROOT\mobile"
                    npm run dev
                }
                default { Write-Host "未知子命令: $SubCommand" -ForegroundColor Red }
            }
        }
        "stop" { 
            Get-Job | Stop-Job -ErrorAction SilentlyContinue
            Get-Job | Remove-Job -ErrorAction SilentlyContinue
            Write-Host "所有服务已停止" -ForegroundColor Green
        }
        "status" { 
            $jobs = Get-Job | Where-Object { $_.State -eq "Running" }
            if ($jobs) {
                Write-Host "运行中的服务:" -ForegroundColor Green
                $jobs | ForEach-Object { Write-Host "  - $($_.Name)" }
            } else {
                Write-Host "没有运行中的服务" -ForegroundColor Yellow
            }
        }
        default { Write-Host "未知命令: $Command" -ForegroundColor Red }
    }
}

# 快捷别名
Set-Alias -Name cc -Value chiral

Write-Host "Chiral Controller CLI 已加载！使用 'chiral help' 查看帮助" -ForegroundColor DarkGray
```

### 3. 重新加载 PowerShell

关闭并重新打开 PowerShell，或运行：
```powershell
. $PROFILE
```

### 4. 开始使用

```powershell
chiral run dev           # 启动开发环境
chiral run dev -Normal   # 使用普通 kimi 版本
chiral run server        # 只启动 MCP Server
chiral run client        # 只启动 Web Client
chiral stop              # 停止所有服务
chiral status            # 查看状态
chiral help              # 显示帮助

# 或使用快捷别名
cc run dev
cc help
```

---

## 解决执行策略问题

如果遇到 "cannot be loaded because running scripts is disabled" 错误，以管理员身份运行：

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

或仅允许当前会话：

```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
```
