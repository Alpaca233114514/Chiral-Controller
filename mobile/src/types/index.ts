export interface Session {
  id: string;
  name: string;
  createdAt: number;
  lastActivityAt: number;
  workingDir: string;
  contextFiles: ContextFile[];
  messageCount: number;
}

export interface ContextFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  type: 'text' | 'command' | 'error';
  timestamp: number;
  attachments?: string[];
}

export type StreamEvent = 
  | { type: 'token'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'done' }
  | { type: 'error'; content: string }
  | { type: 'file_uploaded'; fileId: string; filename: string }
  | { type: 'session_created'; sessionId: string; name: string }
  | { type: 'command_started'; command: string };

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  content: string;  // base64
}
