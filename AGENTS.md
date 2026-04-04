# Chiral Controller / 开罗尔控制器

手机远程控制 Kimi CLI 代码生成的 MCP 工具。

## 快速开始

### 一键启动（推荐）

**Windows:**
```bash
start-dev.bat
```

**Mac/Linux:**
```bash
./start-dev.sh
```

### 从 Kimi CLI 启动开发环境

在 Kimi CLI 中直接运行：
```bash
# 方法 1: 使用 Skill
python .agents/skills/chiral-controller/scripts/start.py

# 方法 2: 直接调用启动脚本（推荐）
Shell: 执行 .\start-dev.bat
```

### 手动启动

```bash
# 终端 1: MCP Server
cd skill && npm run dev

# 终端 2: Web Client  
cd mobile && npm run dev
```

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

## 架构

- **skill/**: MCP Server (Node.js + Express + SSE)
- **mobile/**: React Web 客户端
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

## Skill 信息

- **名称**: chiral-controller
- **位置**: `.agents/skills/chiral-controller/`
- **功能**: 启动 Chiral Controller 开发环境

Kimi CLI 会自动加载此 skill，当你询问关于"开罗尔"或"Chiral Controller"时，skill 会被触发。
