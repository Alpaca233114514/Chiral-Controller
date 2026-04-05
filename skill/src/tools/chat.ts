import { Response } from 'express';
import { spawn } from 'child_process';
import { ToolContext } from './index.js';
import { getSession, addMessage, TEMP_DIR } from '../utils/sessions.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

interface ChatParams {
  sessionId: string;
  message: string;
  attachments?: string[];  // file IDs
}

export async function handleChat(
  params: ChatParams,
  context: ToolContext,
  res: Response
): Promise<void> {
  const { sessionId, message, attachments } = params;
  const streamId = uuidv4();

  // 检查 session
  const session = getSession(sessionId);
  if (!session) {
    res.status(404).json({
      jsonrpc: '2.0',
      id: Date.now(),
      error: { code: -32602, message: 'Session not found' }
    });
    return;
  }

  // 获取附件文件路径
  const attachmentPaths: string[] = [];
  if (attachments) {
    for (const fileId of attachments) {
      const file = session.contextFiles.get(fileId);
      if (file && fs.existsSync(file.serverPath)) {
        attachmentPaths.push(file.serverPath);
      }
    }
  }

  // 构建历史上下文文件
  const historyContent = buildHistoryContent(session.messages.slice(-10));
  const historyPath = path.join(TEMP_DIR, sessionId, 'history_context.md');
  fs.writeFileSync(historyPath, historyContent);

  // 构建完整 prompt
  const fullPrompt = buildFullPrompt(message, historyPath, attachmentPaths);

  // 记录用户消息
  addMessage(sessionId, {
    role: 'user',
    content: message,
    type: 'text',
    attachments
  });

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
  const sseRes = context.connections.get(context.sessionId);
  if (!sseRes) {
    console.error(`[MCP] No SSE connection for session: ${context.sessionId}`);
    return;
  }

  // 启动 kimi
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

  sendNotification(sseRes, { type: 'command_started', command: 'kimi chat' });

  const kimi = spawn(kimiCmd, ['-p', fullPrompt], {
    shell: false,
    env,
    cwd: session.workingDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: true
  });

  let responseContent = '';
  let buffer = '';

  kimi.stdout.on('data', (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        responseContent += line + '\n';
        sendNotification(sseRes, { type: 'token', content: line });
      }
    }
  });

  kimi.stderr.on('data', (data: Buffer) => {
    const line = data.toString().trim();
    if (line) {
      sendNotification(sseRes, { type: 'thinking', content: line });
    }
  });

  kimi.on('close', (code) => {
    if (buffer.trim()) {
      responseContent += buffer.trim();
      sendNotification(sseRes, { type: 'token', content: buffer.trim() });
    }

    // 记录助手回复
    addMessage(sessionId, {
      role: 'assistant',
      content: responseContent.trim(),
      type: code === 0 ? 'text' : 'error'
    });

    sendNotification(sseRes, {
      type: code === 0 ? 'done' : 'error',
      content: code === 0 ? undefined : `Process exited with code ${code}`
    });
  });

  kimi.on('error', (err) => {
    console.error('[MCP] Failed to spawn kimi:', err);
    sendNotification(sseRes, {
      type: 'error',
      content: `Failed to start kimi process: ${err.message}`
    });
  });
}

function buildHistoryContent(messages: { role: string; content: string }[]): string {
  if (messages.length === 0) return '';
  
  let content = '# Conversation History\n\n';
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    content += `## ${role}\n${msg.content}\n\n`;
  }
  return content;
}

function buildFullPrompt(message: string, historyPath: string, attachmentPaths: string[]): string {
  const parts: string[] = [];
  
  // 添加历史上下文引用
  parts.push(`@${historyPath}`);
  
  // 添加附件引用
  for (const path of attachmentPaths) {
    parts.push(`@${path}`);
  }
  
  // 添加用户消息
  parts.push(message);
  
  return parts.join(' ');
}

function sendNotification(sseRes: Response, params: Record<string, any>) {
  const notification = {
    jsonrpc: '2.0',
    method: 'notifications/progress',
    params
  };
  sseRes.write(`event: message\n`);
  sseRes.write(`data: ${JSON.stringify(notification)}\n\n`);
}
