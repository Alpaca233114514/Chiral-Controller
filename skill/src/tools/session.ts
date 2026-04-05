import { Response } from 'express';
import { ToolContext } from './index.js';

interface SessionManageParams {
  action?: 'create' | 'destroy' | 'list' | 'info';
  sessionId?: string;
}

export async function handleSessionManage(
  params: SessionManageParams,
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
        text: JSON.stringify({ status: 'not_implemented', message: 'Session management will be implemented in a future task' })
      }]
    }
  });
}
