# ChiralController PowerShell 模块

## 一键安装

模块已自动安装在：
```
C:\Users\li\Documents\WindowsPowerShell\Modules\ChiralController\
```

## 使用方法

### 1. 导入模块（每次新会话）

```powershell
Import-Module ChiralController
```

### 2. 添加到 Profile（自动加载）

打开 PowerShell Profile 文件：
```
C:\Users\li\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1
```

添加一行：
```powershell
Import-Module ChiralController
```

重新加载配置：
```powershell
. $PROFILE
```

## 可用命令

| 命令 | 别名 | 说明 |
|------|------|------|
| `Start-Chiral` | `chiral`, `cc` | 启动开发环境 |
| `Stop-Chiral` | `chiral-stop` | 停止所有服务 |
| `Get-ChiralStatus` | `chiral-status` | 查看服务状态 |

## 使用示例

```powershell
# 启动开发环境（默认 superpowers 版本）
chiral

# 使用普通 kimi 版本
chiral -Normal

# 只启动 MCP Server
chiral -ServerOnly

# 只启动 Web Client
chiral -ClientOnly

# 查看状态
chiral-status

# 停止所有服务
chiral-stop

# 使用快捷别名
cc
cc -Normal
```

## 解决执行策略问题

如果遇到执行策略错误，以管理员身份运行：

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

或仅当前会话：

```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
Import-Module ChiralController
```
