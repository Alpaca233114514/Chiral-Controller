import { Response } from 'express';
import { spawn } from 'child_process';
import { ToolContext } from './index.js';
import { v4 as uuidv4 } from 'uuid';

interface ExecParams {
  command?: string;
  prompt?: string;  // 兼容旧版
  cwd?: string;
  stream?: boolean;
}

export async function handleExec(
  params: ExecParams,
  context: ToolContext,
  res: Response
): Promise<void> {
  const { sessionId, connections } = context;
  const streamId = uuidv4();
  
  // 兼容旧版 kimi/generate (使用 prompt) 和新版 kimi/exec (使用 command)
  const command = params.command || params.prompt || '';
  
  // 立即返回接受响应
  res.json({
    jsonrpc: '2.0',
    id: Date.now(),
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

  // 解析命令
  const isRawCommand = command.trim().startsWith('/');
  const kimiArgs = isRawCommand 
    ? command.trim().split(/\s+/).slice(1)  // 去掉开头的 /
    : ['-p', command];

  // 启动 kimi 进程 (复用现有逻辑)
  const isWindows = process.platform === 'win32';
  let kimiCmd: string;
  const kimiCli = process.env.KIMI_CLI || 'kimi-superpowers';
  
  if (kimiCli === 'kimi-superpowers') {
    const homeDir = isWindows ? process.env.USERPROFILE : process.env.HOME;
    kimiCmd = `${homeDir}\\.venv-kimi-superpowers\\Scripts\\kimi.exe`;
  } else if (kimiCli.includes('/') || kimiCli.includes('\\')) {
    kimiCmd = kimiCli;
  } else {
    kimiCmd = isWindows ? 'kimi.exe' : 'kimi';
  }

  const env = {
    ...process.env,
    FORCE_COLOR: '0',
    TERM: 'dumb',
    COLUMNS: '80',
    LINES: '24'
  };

  // 发送 command_started 事件
  sendNotification(sseRes, {
    type: 'command_started',
    command: `${kimiCmd} ${kimiArgs.join(' ')}`
  });

  const kimi = spawn(kimiCmd, isRawCommand ? [command.trim()] : ['-p', command], {
    shell: false,
    env,
    cwd: params.cwd || process.cwd(),
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
        sendNotification(sseRes, {
          type: 'token',
          content: line
        });
      }
    }
  });

  kimi.stderr.on('data', (data: Buffer) => {
    const line = data.toString().trim();
    if (line) {
      sendNotification(sseRes, {
        type: 'thinking',
        content: line
      });
    }
  });

  kimi.on('close', (code) => {
    if (buffer.trim()) {
      sendNotification(sseRes, {
        type: 'token',
        content: buffer.trim()
      });
    }

    sendNotification(sseRes, {
      type: code === 0 ? 'done' : 'error',
      content: code === 0 ? undefined : `Process exited with code ${code}`
    });
  });
}

function sendNotification(sseRes: Response, params: { type: string; content?: string; command?: string }) {
  const notification = {
    jsonrpc: '2.0',
    method: 'notifications/progress',
    params
  };
  sseRes.write(`event: message\n`);
  sseRes.write(`data: ${JSON.stringify(notification)}\n\n`);
}
