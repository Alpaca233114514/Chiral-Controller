# Chiral Controller - 手机端完整 CLI 控制设计文档

**日期**: 2026-04-05  
**状态**: 设计阶段  
**版本**: 1.0

---

## 1. 概述

### 1.1 目标
将 Chiral Controller 手机端从简单的"提示词生成器"升级为 Kimi CLI 的完整远程控制台，支持：
1. 输入原始 CLI 命令（slash commands）
2. 上下文管理（文件、图片传输）
3. 会话历史
4. 多轮对话

### 1.2 非目标
- 不替代电脑端的完整 IDE 体验
- 不支持需要 GUI 交互的操作（如 `kimi --gui`）
- 不实现 Kimi CLI 本身的功能，只作为远程调用层

---

## 2. 架构设计

### 2.1 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Mobile (React)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ CommandInput │  │ FileUploader │  │ SessionManager       │   │
│  │  - /task     │  │  - Upload    │  │  - List sessions     │   │
│  │  - /commit   │  │  - Preview   │  │  - Create/Resume     │   │
│  │  - /pr       │  │  - Attach    │  │  - History           │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ SSE (MCP over SSE)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MCP Server (Node.js)                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Tool Router                          │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │   │
│  │  │kimi/exec │ │kimi/chat │ │kimi/file │ │kimi/session│  │   │
│  │  │- execute │ │- chat    │ │- upload  │ │- manage    │  │   │
│  │  │- raw cmd │ │- context │ │- context │ │- history   │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ stdio / spawn
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Kimi CLI (本地)                            │
│              (保持原生命令行界面和逻辑)                          │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
1. 命令模式:
   Mobile输入 → kimi/exec → spawn("kimi", args) → SSE流式返回

2. 对话模式:
   Mobile输入 → kimi/chat → 维护session上下文 → spawn("kimi", args) → SSE流式返回

3. 文件传输:
   Mobile选择文件 → Base64编码 → kimi/file/upload → 保存到临时目录 → 作为context附加到命令
```

---

## 3. 核心组件设计

### 3.1 Mobile 端 (React)

#### 3.1.1 界面布局
```
┌─────────────────────────────────────────┐
│ [开罗尔控制器]         [≡] [⚙️]        │  ← Header (菜单+设置)
├─────────────────────────────────────────┤
│ 服务器: http://192.168.1.100:3777 [连接] │  ← Connection Panel
├─────────────────────────────────────────┤
│ 📁 context/                             │  ← Context Panel (可折叠)
│   ├── src/main.ts                       │
│   └── image.png [x]                     │
├─────────────────────────────────────────┤
│ Kimi: 你好，我是Kimi...                 │  ← Chat History
│ You: 帮我写个函数                       │
│ Kimi: [生成中...]                       │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ /task 写个函数...          [📎][↑] │ │  ← Input Area
│ └─────────────────────────────────────┘ │
│ [/task] [/commit] [/pr] [more...]       │  ← Quick Commands
└─────────────────────────────────────────┘
```

#### 3.1.2 状态管理
```typescript
interface Session {
  id: string;
  name: string;
  createdAt: number;
  lastMessageAt: number;
  messages: Message[];
  contextFiles: ContextFile[];
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  type: 'text' | 'command' | 'error';
  timestamp: number;
  attachments?: Attachment[];
}

interface ContextFile {
  id: string;
  name: string;
  type: 'text' | 'image';
  size: number;
  // 对于大文件，存储在 server 的临时路径
  serverPath?: string;
  // 对于小文件(<100KB)，直接存 base64
  content?: string;
}
```

#### 3.1.3 Hooks
- `useMCP`: 扩展现有 hook，支持多种 tool 调用
- `useSession`: 会话管理（创建、切换、历史）
- `useFileUpload`: 文件上传和预览
- `useCommandParser`: 解析 slash commands

### 3.2 MCP Server (Node.js)

#### 3.2.1 工具集 (Tools)

```typescript
// Tool 1: 原始命令执行
interface KimiExecParams {
  command: string;        // 完整命令，如 "kimi /task 写个函数"
  cwd?: string;           // 工作目录
  env?: Record<string, string>;
}

// Tool 2: 对话模式（带上下文）
interface KimiChatParams {
  sessionId: string;
  message: string;
  contextFiles?: string[];    // 文件ID列表
  mode?: 'chat' | 'plan' | 'code';
}

// Tool 3: 文件上传
interface KimiFileUploadParams {
  sessionId: string;
  filename: string;
  content: string;        // base64 encoded
  mimeType: string;
}

// Tool 4: 会话管理
interface KimiSessionParams {
  action: 'create' | 'list' | 'delete' | 'rename';
  sessionId?: string;
  name?: string;
}
```

#### 3.2.2 会话存储
```typescript
// Server-side session storage (in-memory + optional persist)
interface ServerSession {
  id: string;
  name: string;
  createdAt: number;
  workingDir: string;
  contextFiles: Map<string, ContextFileInfo>;
  messageHistory: ServerMessage[];
}

// 临时文件存储
const TEMP_DIR = path.join(os.tmpdir(), 'chiral-controller');
// 文件结构: ${TEMP_DIR}/${sessionId}/${fileId}_${filename}
```

### 3.3 Kimi CLI 集成

#### 3.3.1 命令映射
| 手机端输入 | 实际执行的命令 |
|-----------|---------------|
| `/task 写个函数` | `kimi /task "写个函数"` |
| `/commit` | `kimi /commit` |
| `/pr` | `kimi /pr` |
| `帮我改代码` | `kimi -p "帮我改代码"` (普通prompt模式) |
| `@file.ts 这是什么` | `kimi -p "@/path/to/file.ts 这是什么"` |

#### 3.3.2 文件引用机制
- 手机上传的文件保存在 server 临时目录
- 通过 `@filename` 语法在 prompt 中引用
- Server 自动将相对路径解析为绝对路径

---

## 4. 功能详细设计

### 4.1 命令输入 (F1)

**需求**: 支持输入 Kimi CLI 的所有 slash commands

**实现**:
1. 输入框支持 `/` 触发命令补全
2. 发送时检测是否以 `/` 开头
3. 是: 直接透传给 Kimi CLI
4. 否: 包装为 `kimi -p "message"`

**命令分类**:
- **执行类**: `/task`, `/commit`, `/pr`, `/fix`, `/test`
- **信息类**: `/status`, `/help`, `/version`
- **交互类**: `/chat` (进入对话模式)

### 4.2 上下文管理 (F2)

**需求**: 支持传输文件、图片作为上下文

**实现**:
1. **手机端**: 文件选择器 → 预览 → 上传
2. **传输**: Base64 编码 → SSE/HTTP 上传
3. **Server**: 解码 → 保存临时文件 → 返回 fileId
4. **引用**: 用户在 prompt 中使用 `@filename` 引用

**文件大小策略**:
- < 100KB: 直接传输，可内嵌在 message 中
- 100KB-10MB: 分片上传
- > 10MB: 压缩/拒绝

**支持的文件类型**:
- 文本: `.ts`, `.js`, `.py`, `.md`, `.json`, ...
- 图片: `.png`, `.jpg`, `.gif`, `.webp`
- 文档: `.pdf` (通过 OCR 提取文本)

### 4.3 会话历史 (F3)

**需求**: 保存和恢复对话历史

**实现**:
1. 每个 session 有唯一 ID
2. Server 维护 session 的内存存储
3. 可选: 持久化到文件系统
4. Mobile 可列出、切换、删除 session

**Session 生命周期**:
```
Create → Active → (Inactive) → Delete
           ↓
      [Persistence]
```

### 4.4 多轮对话 (F4)

**需求**: 支持连续对话，保持上下文

**实现方案**:
由于 Kimi CLI 本身是无状态的（每次命令独立），多轮对话需要 Server 层模拟：

1. **简单模式**: 将历史消息拼接到 prompt
   ```
   prompt = "Previous context:\n" + history + "\n\nNew message: " + message
   ```

2. **上下文文件模式**: 将历史保存为临时文件，通过 `@` 引用
   ```
   kimi -p "@/tmp/session_history.md @用户新问题"
   ```

**推荐方案**: 方案 2，因为 Kimi CLI 对文件引用有原生支持

---

## 5. API 设计

### 5.1 MCP Tools

```json
{
  "tools": [
    {
      "name": "kimi/exec",
      "description": "Execute raw kimi CLI command",
      "parameters": {
        "type": "object",
        "properties": {
          "command": { "type": "string" },
          "cwd": { "type": "string" },
          "sessionId": { "type": "string" }
        },
        "required": ["command"]
      }
    },
    {
      "name": "kimi/chat",
      "description": "Send message in chat mode with context",
      "parameters": {
        "type": "object",
        "properties": {
          "sessionId": { "type": "string" },
          "message": { "type": "string" },
          "attachments": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["sessionId", "message"]
      }
    },
    {
      "name": "kimi/file/upload",
      "description": "Upload file to server",
      "parameters": {
        "type": "object",
        "properties": {
          "sessionId": { "type": "string" },
          "filename": { "type": "string" },
          "content": { "type": "string" },
          "mimeType": { "type": "string" }
        },
        "required": ["sessionId", "filename", "content"]
      }
    },
    {
      "name": "kimi/file/delete",
      "description": "Delete uploaded file",
      "parameters": {
        "type": "object",
        "properties": {
          "sessionId": { "type": "string" },
          "fileId": { "type": "string" }
        }
      }
    },
    {
      "name": "kimi/session/manage",
      "description": "Manage sessions",
      "parameters": {
        "type": "object",
        "properties": {
          "action": { "enum": ["create", "list", "delete", "rename", "get"] },
          "sessionId": { "type": "string" },
          "name": { "type": "string" }
        },
        "required": ["action"]
      }
    }
  ]
}
```

### 5.2 SSE Events

```typescript
// 现有事件类型保持不变
type StreamEvent = 
  | { type: 'token'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'done' }
  | { type: 'error'; content: string }
  // 新增:
  | { type: 'file_uploaded'; fileId: string; filename: string }
  | { type: 'session_created'; sessionId: string }
  | { type: 'command_started'; command: string };
```

---

## 6. 数据持久化

### 6.1 存储策略
- **内存**: 活跃 session 和临时文件
- **文件系统**: session 元数据和历史记录
- **清理**: 自动清理 7 天未访问的 session

### 6.2 目录结构
```
${TEMP_DIR}/
├── sessions.json           # session 元数据索引
├── ${sessionId}/
│   ├── history.json        # 消息历史
│   └── files/
│       ├── ${fileId}_${filename}
│       └── ...
```

---

## 7. 安全考虑

1. **文件上传限制**:
   - 大小限制: 单文件 10MB，总上下文 50MB
   - 类型白名单: 只允许文本和图片
   - 路径安全: 禁止 `../` 等路径遍历

2. **命令执行限制**:
   - 只允许 `kimi` 命令
   - 禁止 `;`, `&&`, `|` 等 shell 注入
   - 工作目录限制在项目根目录

3. **CORS**: 保持现有配置，允许局域网访问

---

## 8. 错误处理

| 场景 | 错误码 | 处理方式 |
|-----|-------|---------|
| 文件过大 | FILE_TOO_LARGE | 提示用户压缩或分片 |
| 不支持的类型 | UNSUPPORTED_TYPE | 提示支持的格式 |
| 命令执行失败 | EXEC_FAILED | 显示 stderr |
| Session 不存在 | SESSION_NOT_FOUND | 提示创建新 session |
| 连接断开 | CONNECTION_LOST | 自动重连提示 |

---

## 9. 实现阶段

### Phase 1: 基础命令支持
- [ ] 重构 `kimi/exec` tool 支持 raw commands
- [ ] Mobile 端命令输入界面
- [ ] 命令补全和快捷按钮

### Phase 2: 文件传输
- [ ] `kimi/file/upload` tool
- [ ] Mobile 文件选择器和预览
- [ ] `@` 引用语法支持

### Phase 3: 会话管理
- [ ] Session 数据模型
- [ ] `kimi/session/manage` tool
- [ ] Mobile session 列表界面

### Phase 4: 多轮对话
- [ ] 历史上下文拼接
- [ ] 消息界面优化
- [ ] 持久化存储

---

## 10. 测试策略

1. **单元测试**: 各 tool 的逻辑
2. **集成测试**: Mobile ↔ Server ↔ Kimi CLI 端到端
3. **场景测试**:
   - 上传代码文件并请求修改
   - 多轮对话保持上下文
   - 复杂命令序列（如 `/task` → `/commit` → `/pr`）

---

## 附录

### A. Kimi CLI 命令参考
```
kimi [options] [prompt]
kimi /task <description>
kimi /commit [message]
kimi /pr [title]
kimi /fix
kimi /test
```

### B. 相关文件
- `mobile/src/hooks/useMCP.ts` - MCP hook
- `mobile/src/App.tsx` - 主界面
- `skill/src/server.ts` - MCP Server
