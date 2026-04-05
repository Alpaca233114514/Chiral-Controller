import { Response } from 'express';
import { ToolContext } from './index.js';
import { 
  createSession, 
  getSession, 
  listSessions, 
  deleteSession, 
  renameSession 
} from '../utils/sessions.js';

interface SessionParams {
  action: 'create' | 'list' | 'delete' | 'rename' | 'get';
  sessionId?: string;
  name?: string;
  workingDir?: string;
}

export async function handleSessionManage(
  params: SessionParams,
  context: ToolContext,
  res: Response
): Promise<void> {
  const { action, sessionId, name, workingDir } = params;

  switch (action) {
    case 'create': {
      const session = createSession(name, workingDir);
      res.json({
        jsonrpc: '2.0',
        id: Date.now(),
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              session: {
                id: session.id,
                name: session.name,
                createdAt: session.createdAt,
                workingDir: session.workingDir
              }
            })
          }]
        }
      });
      
      // 发送 session_created 通知
      const sseRes = context.connections.get(context.sessionId);
      if (sseRes) {
        sendNotification(sseRes, {
          type: 'session_created',
          sessionId: session.id,
          name: session.name
        });
      }
      break;
    }

    case 'list': {
      const sessions = listSessions();
      res.json({
        jsonrpc: '2.0',
        id: Date.now(),
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify({ sessions })
          }]
        }
      });
      break;
    }

    case 'get': {
      if (!sessionId) {
        res.status(400).json({
          jsonrpc: '2.0',
          id: Date.now(),
          error: { code: -32602, message: 'Missing sessionId' }
        });
        return;
      }
      const session = getSession(sessionId);
      if (!session) {
        res.status(404).json({
          jsonrpc: '2.0',
          id: Date.now(),
          error: { code: -32602, message: 'Session not found' }
        });
        return;
      }
      res.json({
        jsonrpc: '2.0',
        id: Date.now(),
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify({
              session: {
                id: session.id,
                name: session.name,
                createdAt: session.createdAt,
                lastActivityAt: session.lastActivityAt,
                workingDir: session.workingDir,
                contextFiles: Array.from(session.contextFiles.values()),
                messageCount: session.messages.length
              }
            })
          }]
        }
      });
      break;
    }

    case 'delete': {
      if (!sessionId) {
        res.status(400).json({
          jsonrpc: '2.0',
          id: Date.now(),
          error: { code: -32602, message: 'Missing sessionId' }
        });
        return;
      }
      const success = deleteSession(sessionId);
      res.json({
        jsonrpc: '2.0',
        id: Date.now(),
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify({ success })
          }]
        }
      });
      break;
    }

    case 'rename': {
      if (!sessionId || !name) {
        res.status(400).json({
          jsonrpc: '2.0',
          id: Date.now(),
          error: { code: -32602, message: 'Missing sessionId or name' }
        });
        return;
      }
      const success = renameSession(sessionId, name);
      res.json({
        jsonrpc: '2.0',
        id: Date.now(),
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify({ success })
          }]
        }
      });
      break;
    }

    default:
      res.status(400).json({
        jsonrpc: '2.0',
        id: Date.now(),
        error: { code: -32602, message: `Unknown action: ${action}` }
      });
  }
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
