import { Response } from 'express';
import { ToolContext } from './index.js';

interface FileUploadParams {
  path?: string;
  content?: string;
  encoding?: string;
}

export async function handleFileUpload(
  params: FileUploadParams,
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
        text: JSON.stringify({ status: 'not_implemented', message: 'File upload will be implemented in a future task' })
      }]
    }
  });
}
