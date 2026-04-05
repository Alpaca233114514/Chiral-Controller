# Chiral Controller / 开罗尔控制器

手机远程控制 Kimi CLI 代码生成的 MCP 工具。

## 快速开始

### 方式 1: 使用 chiral-cli (推荐)

```bash
# 安装
npm install -g chiral-cli

# 启动
chiral run dev

# 查看状态
chiral status

# 停止
chiral stop
```

### 方式 2: 一键启动（批处理）

**Windows - Superpowers 版本（推荐）:**
```bash
start-dev-superpowers.bat
```

**Windows - 普通版本:**
```bash
start-dev.bat
```

**Mac/Linux:**
```bash
./start-dev.sh
```

### 方式 3: 从 Kimi CLI 启动

在 Kimi CLI 中直接运行：
```bash
# 方法 1: 使用 Skill
python .agents/skills/chiral-controller/scripts/start.py

# 方法 2: 直接调用启动脚本（推荐）
Shell: 执行 .\start-dev.bat
```

### 方式 4: 手动启动

```bash
# 终端 1: MCP Server
cd skill && npm run dev

# 终端 2: Web Client  
cd mobile && npm run dev
```

## MCP 工具集成

### 安装 chiral-mcp

```bash
npm install -g chiral-mcp
```

### 在 Claude Desktop 中配置

编辑 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "chiral": {
      "command": "npx",
      "args": ["-y", "chiral-mcp"]
    }
  }
}
```

### 可用 MCP 工具

| 工具名 | 描述 |
|--------|------|
| `chiral_start_dev` | 启动开发环境 |
| `chiral_start_server` | 启动 MCP Server |
| `chiral_start_client` | 启动 Web Client |
| `chiral_stop` | 停止服务 |
| `chiral_status` | 获取状态 |

## 架构

- **skill/**: MCP Server (Node.js + Express + SSE)
- **mobile/**: React Web 客户端
- **packages/chiral-cli/**: CLI 工具
- **packages/chiral-mcp/**: MCP Server 工具包
- **.agents/skills/chiral-controller/**: Kimi CLI Skill

## 使用

1. 启动后，Web Client 运行在 `http://localhost:5173`
2. MCP Server 运行在 `http://localhost:3777`
3. 手机浏览器访问电脑的局域网 IP:5173
4. 在手机上点击「连接」，输入提示词，发送给 Kimi

## 协议

- **传输**: MCP over SSE
- **格式**: JSON-RPC 2.0
- **Tool**: `kimi/generate`
- **Notification**: `notifications/progress`

## Windows 编码问题

如果在 Windows 上遇到 `'gbk' codec can't encode character` 错误，需要设置 UTF-8 编码：

### 临时解决（当前终端）
```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"
```

### 永久解决（推荐）

**方法 1: 系统设置 UTF-8**
1. 打开「设置」→「时间和语言」→「语言和区域」→「管理语言设置」
2. 点击「更改系统区域设置」
3. 勾选 **「Beta 版：使用 Unicode UTF-8 提供全球语言支持」**
4. 重启电脑

**方法 2: 使用启动脚本**
使用项目中的 `kimi-utf8.bat` 启动 Kimi CLI：
```bash
.\kimi-utf8.bat
```

**方法 3: 使用 Windows Terminal**
从 Microsoft Store 安装 Windows Terminal，它默认使用 UTF-8 编码。

## 配置 Kimi CLI 版本

通过环境变量 `KIMI_CLI` 可以指定使用的 Kimi CLI 版本：

| 值 | 说明 |
|----|------|
| `kimi` (默认) | 使用系统默认的 kimi |
| `kimi-superpowers` | 使用 superpowers 版本 (`~/.venv-kimi-superpowers/Scripts/kimi.exe`) |
| 完整路径 | 使用自定义路径，如 `C:\custom\path\kimi.exe` |

**示例：**
```powershell
# PowerShell
$env:KIMI_CLI="kimi-superpowers"
npm run dev
```

## Skill 信息

- **名称**: chiral-controller
- **位置**: `.agents/skills/chiral-controller/`
- **功能**: 启动 Chiral Controller 开发环境

Kimi CLI 会自动加载此 skill，当你询问关于"开罗尔"或"Chiral Controller"时，skill 会被触发。
