import { Request, Response } from 'express';
import { handleExec } from './exec.js';
import { handleFileUpload } from './file.js';
import { handleSessionManage } from './session.js';
import { handleChat } from './chat.js';

export interface ToolContext {
  sessionId: string;
  connections: Map<string, Response>;
  // 将在后续 task 中添加 sessions 存储
}

export interface ToolHandler {
  (params: any, context: ToolContext, res: Response): Promise<void>;
}

const tools: Record<string, ToolHandler> = {
  'kimi/generate': handleExec,  // 保持兼容
  'kimi/exec': handleExec,
  'kimi/file/upload': handleFileUpload,
  'kimi/session/manage': handleSessionManage,
  'kimi/chat': handleChat,
};

export async function routeTool(
  toolName: string,
  params: any,
  context: ToolContext,
  res: Response
): Promise<boolean> {
  const handler = tools[toolName];
  if (!handler) {
    return false;
  }
  await handler(params, context, res);
  return true;
}

export { handleExec, handleFileUpload, handleSessionManage, handleChat };
