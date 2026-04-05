import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import os from 'os';
import fs from 'fs';

export interface ContextFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  serverPath: string;
  uploadedAt: number;
}

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  type: 'text' | 'command' | 'error';
  timestamp: number;
  attachments?: string[];
}

export interface Session {
  id: string;
  name: string;
  createdAt: number;
  lastActivityAt: number;
  workingDir: string;
  contextFiles: Map<string, ContextFile>;
  messages: SessionMessage[];
}

// 内存存储
const sessions = new Map<string, Session>();

// 临时目录
export const TEMP_DIR = path.join(os.tmpdir(), 'chiral-controller');

// 确保临时目录存在
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

export function createSession(name?: string, workingDir?: string): Session {
  const id = uuidv4();
  const session: Session = {
    id,
    name: name || `Session ${sessions.size + 1}`,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    workingDir: workingDir || process.cwd(),
    contextFiles: new Map(),
    messages: []
  };
  sessions.set(id, session);
  
  // 创建 session 临时目录
  const sessionDir = path.join(TEMP_DIR, id);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.mkdirSync(path.join(sessionDir, 'files'), { recursive: true });
  
  return session;
}

export function getSession(id: string): Session | undefined {
  const session = sessions.get(id);
  if (session) {
    session.lastActivityAt = Date.now();
  }
  return session;
}

export function listSessions(): Pick<Session, 'id' | 'name' | 'createdAt' | 'lastActivityAt'>[] {
  return Array.from(sessions.values())
    .map(s => ({
      id: s.id,
      name: s.name,
      createdAt: s.createdAt,
      lastActivityAt: s.lastActivityAt
    }))
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

export function deleteSession(id: string): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  
  // 清理临时文件
  const sessionDir = path.join(TEMP_DIR, id);
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true });
  }
  
  sessions.delete(id);
  return true;
}

export function renameSession(id: string, name: string): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  session.name = name;
  return true;
}

export function addMessage(sessionId: string, message: Omit<SessionMessage, 'id' | 'timestamp'>): SessionMessage | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  
  const msg: SessionMessage = {
    ...message,
    id: uuidv4(),
    timestamp: Date.now()
  };
  session.messages.push(msg);
  session.lastActivityAt = Date.now();
  
  // 限制历史消息数量 (保留最近 50 条)
  if (session.messages.length > 50) {
    session.messages = session.messages.slice(-50);
  }
  
  return msg;
}

export function addContextFile(sessionId: string, file: Omit<ContextFile, 'id' | 'uploadedAt'>): ContextFile | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  
  const cf: ContextFile = {
    ...file,
    id: uuidv4(),
    uploadedAt: Date.now()
  };
  session.contextFiles.set(cf.id, cf);
  session.lastActivityAt = Date.now();
  return cf;
}

export function removeContextFile(sessionId: string, fileId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  
  const file = session.contextFiles.get(fileId);
  if (!file) return false;
  
  // 删除物理文件
  if (fs.existsSync(file.serverPath)) {
    fs.unlinkSync(file.serverPath);
  }
  
  session.contextFiles.delete(fileId);
  return true;
}

// 清理过期 session (7天)
export function cleanupOldSessions(): void {
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  
  for (const [id, session] of sessions) {
    if (now - session.lastActivityAt > SEVEN_DAYS) {
      deleteSession(id);
      console.log(`[Session] Cleaned up expired session: ${id}`);
    }
  }
}

// 定期清理
setInterval(cleanupOldSessions, 60 * 60 * 1000); // 每小时
