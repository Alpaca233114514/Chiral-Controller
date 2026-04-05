import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3777;

// 安全的日志输出（处理 Windows 编码问题）
function safeLog(...args: any[]) {
  console.log(...args);
}

// 存储活跃的 SSE 连接
const connections = new Map<string, express.Response>();

// SSE 端点
app.get('/sse', (req, res) => {
  const sessionId = uuidv4();
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // 发送 endpoint 事件
  res.write(`event: endpoint\n`);
  res.write(`data: ${JSON.stringify({ endpoint: `/message?sessionId=${sessionId}` })}\n\n`);

  connections.set(sessionId, res);
  safeLog(`[SSE] Client connected: ${sessionId}`);

  req.on('close', () => {
    connections.delete(sessionId);
    safeLog(`[SSE] Client disconnected: ${sessionId}`);
  });
});

// MCP Tool 调用端点
app.post('/message', async (req, res) => {
  const { sessionId } = req.query as { sessionId: string };
  const { jsonrpc, id, method, params } = req.body;

  safeLog(`[MCP] Received: ${method}`, params);

  if (method === 'tools/call' && params?.name === 'kimi/generate') {
    const streamId = uuidv4();
    const prompt = params.arguments?.prompt || '';
    
    // 立即返回 stream_id
    res.json({
      jsonrpc: '2.0',
      id,
      result: {
        content: [{
          type: 'text',
          text: JSON.stringify({ stream_id: streamId, status: 'accepted' })
        }]
      }
    });

    // 获取 SSE 连接
    const sseRes = connections.get(sessionId);
    if (!sseRes) {
      console.error(`[MCP] No SSE connection for session: ${sessionId}`);
      return;
    }

    // 检查平台
    const isWindows = process.platform === 'win32';
    
    // 支持通过环境变量 KIMI_CLI 指定 kimi 命令路径
    // 可选值: 'kimi' (默认), 'kimi-superpowers', 或完整路径
    let kimiCmd: string;
    const kimiCli = process.env.KIMI_CLI || 'kimi-superpowers'; // 默认使用 superpowers
    
    safeLog(`[Debug] KIMI_CLI env: ${process.env.KIMI_CLI}`);
    safeLog(`[Debug] Using: ${kimiCli}`);
    
    if (kimiCli === 'kimi-superpowers') {
      // 使用 superpowers 版本的 kimi
      const homeDir = isWindows ? process.env.USERPROFILE : process.env.HOME;
      kimiCmd = `${homeDir}\\.venv-kimi-superpowers\\Scripts\\kimi.exe`;
    } else if (kimiCli.includes('/') || kimiCli.includes('\\')) {
      // 用户提供了完整路径
      kimiCmd = kimiCli;
    } else {
      // 默认使用 kimi
      kimiCmd = isWindows ? 'kimi.exe' : 'kimi';
    }
    
    // 启动 kimi 进程
    safeLog(`[Kimi] Using CLI: ${kimiCmd}`);
    safeLog(`[Kimi] Starting generation: ${streamId}`);
    
    // 使用 detached 模式并完全忽略 stdio，避免 rich 检测到 Windows 控制台
    // 设置 TERM=dumb 让 rich 进入非终端模式
    const env = {
      ...process.env,
      FORCE_COLOR: '0',
      TERM: 'dumb',
      COLUMNS: '80',
      LINES: '24'
    };
    
    const kimi = spawn(kimiCmd, ['-p', prompt], {
      shell: false,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: true
    });

    let buffer = '';

    kimi.stdout.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          // 发送 token notification
          const notification = {
            jsonrpc: '2.0',
            method: 'notifications/progress',
            params: {
              stream_id: streamId,
              type: 'token',
              content: line
            }
          };
          sseRes.write(`event: message\n`);
          sseRes.write(`data: ${JSON.stringify(notification)}\n\n`);
        }
      }
    });

    kimi.stderr.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) {
        const notification = {
          jsonrpc: '2.0',
          method: 'notifications/progress',
          params: {
            stream_id: streamId,
            type: 'thinking',
            content: line
          }
        };
        sseRes.write(`event: message\n`);
        sseRes.write(`data: ${JSON.stringify(notification)}\n\n`);
      }
    });

    kimi.on('close', (code) => {
      // 发送剩余缓冲
      if (buffer.trim()) {
        const notification = {
          jsonrpc: '2.0',
          method: 'notifications/progress',
          params: {
            stream_id: streamId,
            type: 'token',
            content: buffer.trim()
          }
        };
        sseRes.write(`event: message\n`);
        sseRes.write(`data: ${JSON.stringify(notification)}\n\n`);
      }

      // 发送 done notification
      const doneNotification = {
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: {
          stream_id: streamId,
          type: code === 0 ? 'done' : 'error',
          content: code === 0 ? undefined : `Process exited with code ${code}`
        }
      };
      sseRes.write(`event: message\n`);
      sseRes.write(`data: ${JSON.stringify(doneNotification)}\n\n`);

      safeLog(`[Kimi] Generation completed: ${streamId}, exit code: ${code}`);
    });

    return;
  }

  // 未知方法
  res.status(400).json({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: 'Method not found' }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', connections: connections.size });
});

app.listen(PORT, '0.0.0.0', () => {
  safeLog(`[Chiral Controller] MCP Server running on http://0.0.0.0:${PORT}`);
  safeLog(`[Chiral Controller] SSE endpoint: http://0.0.0.0:${PORT}/sse`);
});
