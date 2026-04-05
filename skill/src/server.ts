import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { routeTool, ToolContext } from './tools/index.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3777', 10);

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

  if (method === 'tools/call') {
    const toolName = params?.name;
    const context: ToolContext = {
      sessionId,
      connections
    };
    
    const routed = await routeTool(toolName, params.arguments, context, res);
    if (!routed) {
      res.status(400).json({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Tool not found: ${toolName}` }
      });
    }
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
