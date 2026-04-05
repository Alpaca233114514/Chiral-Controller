---
name: chiral-controller
description: |
  开罗尔控制器 (Chiral Controller) - 手机远程控制 Kimi CLI 代码生成的开发工具。
  
  Use when:
  - 用户询问关于"开罗尔"、"Chiral Controller"、"chiral"
  - 需要启动 Chiral Controller 开发环境
  - 需要同时运行 MCP Server (电脑端) 和 Web Client (手机端)
  - 需要远程控制 Kimi CLI 进行代码生成
  - 需要发布 chiral-cli / chiral-mcp NPM 包
---

# 开罗尔控制器 (Chiral Controller)

手机作为 MCP Client 远程调用电脑端 MCP Server，实现 Kimi Code CLI 的跨设备流式控制。

## 快速启动

### 方式 1：chiral CLI（推荐）

```bash
# 全局安装
npm install -g chiral-cli

# 使用命令
chiral run dev              # 启动开发环境
chiral run dev --normal     # 使用普通 kimi 版本
chiral run server           # 只启动 MCP Server
chiral run client           # 只启动 Web Client
chiral stop                 # 停止服务
chiral status               # 查看状态
chiral help                 # 显示帮助

# 快捷别名
cc run dev
```

### 方式 2：批处理脚本

```bash
# Windows
.\start-dev-superpowers.bat
```

### 方式 3：从 Kimi CLI 启动

```bash
python ~/.kimi/skills/chiral-controller/scripts/start.py
```

## NPM 包发布

本项目使用 `npm-publish` skill 进行包发布：

### 1. 配置 NPM 令牌（只需一次）

```bash
python ~/.kimi/skills/npm-publish/scripts/config.py setup
```

### 2. 添加 Chiral 项目配置（只需一次）

```bash
python ~/.kimi/skills/npm-publish/scripts/config.py project add chiral \
  ~/Documents/GitHub/Chiral-Controller/packages \
  --packages chiral-cli,chiral-mcp
```

### 3. 发布

```bash
python ~/.kimi/skills/npm-publish/scripts/publish.py chiral
```

## 项目结构

```
chiral-controller/
├── packages/
│   ├── chiral-cli/         # CLI 工具
│   └── chiral-mcp/         # MCP Server 工具包
├── skill/                  # MCP Server
├── mobile/                 # Web Client
└── .agents/skills/
    └── chiral-controller/
        ├── SKILL.md
        └── scripts/
            ├── start.py
            └── start-dev.py
```

## MCP 工具集成

### Claude Desktop 配置

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

## 相关 Skills

- **npm-publish** - 用于发布 NPM 包
  - 位置: `~/.kimi/skills/npm-publish/`
  - 用途: 构建和发布 chiral-cli / chiral-mcp
