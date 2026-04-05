import { Response } from 'express';
import { ToolContext } from './index.js';
import { addContextFile, getSession, removeContextFile } from '../utils/sessions.js';
import { saveUploadedFile, isAllowedFileType, getFileInfo } from '../utils/files.js';

interface FileUploadParams {
  sessionId: string;
  filename: string;
  content: string;  // base64
  mimeType?: string;
}

interface FileDeleteParams {
  sessionId: string;
  fileId: string;
}

export async function handleFileUpload(
  params: FileUploadParams,
  context: ToolContext,
  res: Response
): Promise<void> {
  const { sessionId, filename, content, mimeType } = params;

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

  // 检查文件类型
  if (!isAllowedFileType(filename)) {
    res.status(400).json({
      jsonrpc: '2.0',
      id: Date.now(),
      error: { 
        code: -32602, 
        message: 'Unsupported file type. Allowed: txt, md, ts, js, json, py, html, css, png, jpg, gif, webp, pdf' 
      }
    });
    return;
  }

  // 解码 base64
  let fileBuffer: Buffer;
  try {
    fileBuffer = Buffer.from(content, 'base64');
  } catch {
    res.status(400).json({
      jsonrpc: '2.0',
      id: Date.now(),
      error: { code: -32602, message: 'Invalid base64 content' }
    });
    return;
  }

  // 大小限制: 10MB
  const MAX_SIZE = 10 * 1024 * 1024;
  if (fileBuffer.length > MAX_SIZE) {
    res.status(400).json({
      jsonrpc: '2.0',
      id: Date.now(),
      error: { code: -32602, message: 'File too large (max 10MB)' }
    });
    return;
  }

  // 保存文件
  try {
    const serverPath = saveUploadedFile(sessionId, filename, fileBuffer);
    const fileInfo = getFileInfo(serverPath);
    
    const contextFile = addContextFile(sessionId, {
      name: filename,
      mimeType: mimeType || fileInfo?.mimeType || 'application/octet-stream',
      size: fileBuffer.length,
      serverPath
    });

    if (!contextFile) {
      res.status(500).json({
        jsonrpc: '2.0',
        id: Date.now(),
        error: { code: -32603, message: 'Failed to add context file' }
      });
      return;
    }

    // 发送 file_uploaded 通知
    const sseRes = context.connections.get(context.sessionId);
    if (sseRes) {
      sendNotification(sseRes, {
        type: 'file_uploaded',
        fileId: contextFile.id,
        filename: contextFile.name
      });
    }

    res.json({
      jsonrpc: '2.0',
      id: Date.now(),
      result: {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            file: {
              id: contextFile.id,
              name: contextFile.name,
              size: contextFile.size,
              mimeType: contextFile.mimeType
            }
          })
        }]
      }
    });
  } catch (error) {
    console.error('[File Upload] Error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      id: Date.now(),
      error: { code: -32603, message: 'File save failed' }
    });
  }
}

export async function handleFileDelete(
  params: FileDeleteParams,
  context: ToolContext,
  res: Response
): Promise<void> {
  const { sessionId, fileId } = params;
  
  const success = removeContextFile(sessionId, fileId);
  
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
