import { Response } from 'express';
import { ToolContext } from './index.js';

interface ChatParams {
  message?: string;
  sessionId?: string;
  context?: any;
}

export async function handleChat(
  params: ChatParams,
  context: ToolContext,
  res: Response
): Promise<void> {
  // TODO: 在后续 task 中实现
  res.json({
    jsonrpc: '2.0',
    id: Date.now(),
    result: {
      content: [{
        type: 'text',
        text: JSON.stringify({ status: 'not_implemented', message: 'Chat will be implemented in a future task' })
      }]
    }
  });
}
