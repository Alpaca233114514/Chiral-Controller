import fs from 'fs';
import path from 'path';
import { TEMP_DIR } from './sessions.js';

export function saveUploadedFile(
  sessionId: string,
  filename: string,
  content: Buffer
): string {
  const sessionFilesDir = path.join(TEMP_DIR, sessionId, 'files');
  
  // 清理文件名，防止路径遍历
  const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const uniqueName = `${Date.now()}_${safeFilename}`;
  const filePath = path.join(sessionFilesDir, uniqueName);
  
  fs.writeFileSync(filePath, content);
  
  return filePath;
}

export function readFileAsBase64(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return content.toString('base64');
}

export function getFileInfo(filePath: string): { size: number; mimeType: string } | null {
  try {
    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.ts': 'text/typescript',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.py': 'text/x-python',
      '.html': 'text/html',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf'
    };
    
    return {
      size: stats.size,
      mimeType: mimeTypes[ext] || 'application/octet-stream'
    };
  } catch {
    return null;
  }
}

export function isAllowedFileType(filename: string): boolean {
  const allowedExts = ['.txt', '.md', '.ts', '.js', '.json', '.py', '.html', '.css', 
                       '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf'];
  const ext = path.extname(filename).toLowerCase();
  return allowedExts.includes(ext);
}
