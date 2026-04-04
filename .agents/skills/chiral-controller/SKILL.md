---
name: chiral-controller
description: |
  开罗尔控制器 (Chiral Controller) - 手机远程控制 Kimi CLI 代码生成的开发工具。
  提供 MCP Server + React Web 客户端，通过 SSE 协议实现跨设备流式控制。
  
  Use when:
  - 需要启动 Chiral Controller 开发环境
  - 需要同时运行 MCP Server (电脑端) 和 Web Client (手机端)
  - 需要远程控制 Kimi CLI 进行代码生成
---

# 开罗尔控制器 (Chiral Controller)

手机作为 MCP Client 远程调用电脑端 MCP Server，实现 Kimi Code CLI 的跨设备流式控制。

## 架构

```
┌─────────────────┐         SSE (MCP over SSE)         ┌─────────────────┐
│   手机/浏览器    │  ◄────────────────────────────────►  │   电脑 MCP Server│
│  (React Web)    │    JSON-RPC 2.0 + Notifications     │  (Node.js)      │
│   localhost:5173│                                     │  localhost:3777 │
└─────────────────┘                                     └─────────────────┘
```

## 快速启动

### 自动启动（推荐）

```bash
# 同时启动 Server 和 Client
python .agents/skills/chiral-controller/scripts/start-dev.py
```

### 手动启动

**终端 1 - MCP Server:**
```bash
cd skill
npm run dev
```

**终端 2 - Web Client:**
```bash
cd mobile
npm run dev
```

## 使用流程

1. 启动后，Server 运行在 `http://localhost:3777`
2. Web Client 运行在 `http://localhost:5173`（同时暴露到局域网）
3. 手机浏览器访问电脑的局域网 IP:5173
4. 在手机上点击「连接」，输入提示词，发送给 Kimi
5. 实时观看 Kimi 生成的代码流式显示在手机上！

## 项目结构

```
chiral-controller/
├── skill/              # MCP Server (Node.js + Express + SSE)
│   ├── src/server.ts   # SSE 端点 + kimi/generate Tool
│   └── package.json
├── mobile/             # React Web 客户端
│   ├── src/
│   │   ├── hooks/useMCP.ts   # MCP Client hook
│   │   └── App.tsx
│   └── package.json
└── .agents/skills/chiral-controller/   # 本 Skill
    ├── SKILL.md
    └── scripts/start-dev.py
```

## 协议

- **传输**: MCP over SSE (Server-Sent Events)
- **格式**: JSON-RPC 2.0
- **Tool**: `kimi/generate` - 接收 prompt，返回 stream_id
- **Notification**: `notifications/progress` - 实时推送 token/thinking/done

## 故障排查

**问题**: 手机无法连接电脑  
**解决**: 确保手机和电脑在同一 WiFi，检查防火墙是否放行 3777 和 5173 端口

**问题**: kimicode-cli 未找到  
**解决**: 确保 `kimi` 命令在 PATH 中可用
