# 🌀 开罗尔控制器 | Chiral Controller

手机作为 MCP Client 远程调用电脑端 MCP Server 的 Tool，实现 Kimi Code CLI 代码生成的跨设备流式控制。

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

### 方式一：一键启动（推荐）

```bash
node start.js
```

**Windows 备用:**
```bash
start-dev.bat
```

### 方式二：从 Kimi CLI Skill 启动

```bash
python .agents/skills/chiral-controller/scripts/start.py
```

### 方式三：手动启动

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

## 项目结构

```
chiral-controller/
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

## License

MIT
