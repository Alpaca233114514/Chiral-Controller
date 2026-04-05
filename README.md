# 此项目为demo版本。
# 🌀 开罗尔控制器 | Chiral Controller

手机作为 MCP Client 远程调用电脑端 MCP Server 的 Tool，实现 Kimi Code CLI 代码流式生成的跨设备控制。取名灵感来自《死亡搁浅》的开罗尔物质。

## 架构

```
┌─────────────────┐         SSE (MCP over SSE)         ┌─────────────────┐
│   手机/浏览器    │  ◄────────────────────────────────►  │   电脑 MCP Server│
│  (React Web)    │    JSON-RPC 2.0 + Notifications     │  (Node.js)      │
│                 │                                     │   ┌─────────┐   │
│  ┌───────────┐  │                                     │   │kimi/cli │   │
│  │  Prompt   │  │         POST /message               │   │ 子进程   │   │
│  │  Input    │ ─┼────────────────────────────────────►│   └────┬────┘   │
│  └───────────┘  │                                     │        │        │
│                 │  ◄──── notifications/progress ─────┼────────┘        │
│  ┌───────────┐  │     (Server-Sent Events)            │                 │
│  │  Output   │  │                                     │                 │
│  │  Stream   │  │                                     │                 │
│  └───────────┘  │                                     │                 │
└─────────────────┘                                     └─────────────────┘
```

## 快速开始

### 方式一：使用 chiral-cli (推荐)

安装 CLI 工具：

```bash
npm install -g chiral-cli
```

启动开发环境：

```bash
# 启动完整环境 (Server + Client)
chiral run dev

# 使用普通 kimi 版本
chiral run dev --normal

# 查看状态
chiral status

# 停止服务
chiral stop
```

### 方式二：一键启动

```bash
node start.js
```

**Windows 备用:**
```bash
start-dev.bat
```

### 方式三：从 Kimi CLI Skill 启动

```bash
python .agents/skills/chiral-controller/scripts/start.py
```

### 方式四：手动启动

**终端 1 - MCP Server:**
```bash
cd skill && npm run dev
```

**终端 2 - Web Client:**
```bash
cd mobile && npm run dev
```

### 使用手机控制

1. 确保手机和电脑在同一 WiFi
2. 手机浏览器访问 `http://<电脑IP>:5173`
3. 服务器地址填入 `http://<电脑IP>:3777`
4. 点击「连接」，输入提示词，点击「发送」
5. 观看 Kimi 实时生成的代码流式显示在手机上！

## 常见问题

### PowerShell 执行策略错误

如果在 PowerShell 中运行 `chiral` 命令时遇到以下错误：

```
File C:\Users\...\chiral.ps1 cannot be loaded because running scripts is disabled on this system.
```

**解决方案：**

1. **以管理员身份打开 PowerShell，执行：**
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```
   然后输入 `Y` 确认。

2. **或者改用 CMD 运行：**
   ```cmd
   node start.js
   ```

3. **或者使用 Windows Terminal**（默认允许脚本执行）

## NPM 包

本项目提供两个 NPM 包：

### chiral-cli

命令行工具，提供 `chiral` 命令管理 Chiral Controller。

```bash
npm install -g chiral-cli
```

**命令:**
- `chiral run dev` - 启动开发环境
- `chiral run server` - 启动 MCP Server
- `chiral run client` - 启动 Web Client
- `chiral stop` - 停止服务
- `chiral status` - 查看状态
- `chiral config` - 管理配置

### chiral-mcp

MCP Server 工具包，让其他 MCP Client 可以调用 Chiral Controller。

```bash
npm install -g chiral-mcp
```

**在 Claude Desktop 中配置:**

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

**可用工具:**
- `chiral_start_dev` - 启动开发环境
- `chiral_start_server` - 启动 MCP Server
- `chiral_start_client` - 启动 Web Client
- `chiral_stop` - 停止服务
- `chiral_status` - 获取状态
- `chiral_get_config` - 获取配置
- `chiral_set_config` - 设置配置

## 项目结构

```
chiral-controller/
├── packages/                 # NPM 包
│   ├── chiral-cli/          # CLI 工具
│   │   ├── src/
│   │   ├── bin/
│   │   └── package.json
│   └── chiral-mcp/          # MCP Server 工具包
│       ├── src/
│       ├── bin/
│       └── package.json
├── skill/                    # 电脑端 MCP Server
│   ├── src/
│   │   └── server.ts         # SSE + MCP Tool 实现
│   └── package.json
├── mobile/                   # 手机端 React Web
│   ├── src/
│   │   ├── hooks/
│   │   │   └── useMCP.ts     # MCP Client hook
│   │   └── App.tsx           # 主界面
│   └── package.json
├── .agents/skills/           # Kimi CLI Skill
│   └── chiral-controller/
│       ├── SKILL.md          # Skill 定义
│       └── scripts/
│           └── start.py      # 自动启动脚本
├── start-dev.bat             # Windows 一键启动
└── start-dev.sh              # Mac/Linux 一键启动
```

## 技术栈

- **传输协议**: MCP over SSE (Server-Sent Events)
- **数据格式**: JSON-RPC 2.0
- **Server**: Node.js + Express
- **Client**: React + TypeScript + Vite
- **流式机制**: Tool 返回 stream_id，Server 通过 Notification 推送实时 token

## 协议示例

### 1. 建立 SSE 连接
```
GET /sse
→ event: endpoint
→ data: {"endpoint": "/message?sessionId=xxx"}
```

### 2. 调用 kimi/generate
```json
POST /message?sessionId=xxx
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "kimi/generate",
    "arguments": { "prompt": "写个 React hooks", "stream": true }
  }
}

← { "jsonrpc": "2.0", "id": 1, "result": { "content": [{ "type": "text", "text": "{\"stream_id\":\"uuid\",\"status\":\"accepted\"}" }] } }
```

### 3. 接收流式输出
```
← SSE event: message
← data: { "jsonrpc": "2.0", "method": "notifications/progress", "params": { "stream_id": "uuid", "type": "token", "content": "import" } }

← SSE event: message
← data: { "jsonrpc": "2.0", "method": "notifications/progress", "params": { "stream_id": "uuid", "type": "done" } }
```

## 开发

### 安装依赖

```bash
# 安装所有依赖
npm run install:all
```

### 构建包

```bash
# 构建所有包
npm run build

# 单独构建
npm run build:cli
npm run build:mcp
```

### 发布包

```bash
# 发布到 NPM
npm run publish:all
```

## License

Apache 2.0
