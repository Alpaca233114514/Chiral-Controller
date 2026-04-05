# Chiral MCP

Chiral Controller 的 MCP (Model Context Protocol) 工具包，让其他 MCP Client 可以调用 Chiral Controller 的功能。

## 安装

```bash
npm install -g chiral-mcp
```

## 使用方法

### 作为独立 MCP Server 运行

```bash
chiral-mcp
```

### 在 MCP Client 中配置

#### Claude Desktop 配置

在 `claude_desktop_config.json` 中添加：

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

#### Cline 配置

在 Cline 的 MCP 设置中添加：

```json
{
  "mcpServers": [
    {
      "name": "chiral",
      "command": "npx",
      "args": ["-y", "chiral-mcp"]
    }
  ]
}
```

## 提供的工具

| 工具名 | 描述 |
|--------|------|
| `chiral_start_dev` | 启动完整的开发环境 (Server + Client) |
| `chiral_start_server` | 只启动 MCP Server |
| `chiral_start_client` | 只启动 Web Client |
| `chiral_stop` | 停止所有服务 |
| `chiral_status` | 获取服务状态 |
| `chiral_get_config` | 获取配置 |
| `chiral_set_config` | 设置配置 |

## 工具参数

### chiral_start_dev

```json
{
  "normal": false,      // 是否使用普通 kimi 版本
  "serverPort": 3777,   // MCP Server 端口
  "clientPort": 5173    // Web Client 端口
}
```

### chiral_start_server

```json
{
  "normal": false,   // 是否使用普通 kimi 版本
  "port": 3777       // 服务端口
}
```

### chiral_start_client

```json
{
  "port": 5173   // 客户端端口
}
```

### chiral_get_config

```json
{
  "key": "serverPort"   // 配置项名称 (可选)
}
```

### chiral_set_config

```json
{
  "key": "serverPort",   // 配置项名称
  "value": "3778"        // 配置值
}
```

## 使用示例

在支持 MCP 的 AI 助手（如 Claude Desktop）中，你可以这样使用：

> "启动 Chiral Controller 开发环境"

AI 会自动调用 `chiral_start_dev` 工具启动服务。

> "检查 Chiral 服务状态"

AI 会调用 `chiral_status` 工具获取当前状态。

## 依赖

- Node.js >= 18.0.0
- chiral-cli >= 1.0.0

## License

MIT
