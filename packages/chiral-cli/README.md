# Chiral CLI

手机远程控制 Kimi CLI 代码生成的命令行工具。

## 安装

```bash
npm install -g chiral-cli
```

## 使用方法

### 启动开发环境

```bash
# 使用默认配置启动 (superpowers 版本)
chiral run dev

# 使用普通 kimi 版本
chiral run dev --normal

# 指定端口
chiral run dev --port 3777 --client-port 5173
```

### 单独启动服务

```bash
# 只启动 MCP Server
chiral run server

# 只启动 Web Client
chiral run client
```

### 查看状态

```bash
chiral status
```

### 停止服务

```bash
chiral stop
```

### 配置管理

```bash
# 查看所有配置
chiral config

# 获取配置项
chiral config --get serverPort

# 设置配置项
chiral config --set serverPort --value 3778
```

## 快捷别名

安装后也可以使用 `cc` 命令：

```bash
cc run dev
cc status
cc stop
```

## 配置项

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `serverPort` | 3777 | MCP Server 端口 |
| `clientPort` | 5173 | Web Client 端口 |
| `kimiVersion` | kimi-superpowers | 默认使用的 Kimi 版本 |
| `autoStart` | false | 是否自动启动 |

## 环境变量

| 变量名 | 说明 |
|--------|------|
| `CHIRAL_ROOT` | Chiral Controller 项目根目录 |
| `KIMI_CLI` | 使用的 Kimi CLI 版本 |

## 项目结构

Chiral CLI 需要配合 Chiral Controller 项目使用：

```
Chiral-Controller/
├── skill/          # MCP Server
├── mobile/         # Web Client
└── ...
```

CLI 会自动查找项目根目录（通过检查 skill 和 mobile 目录）。

## License

MIT
