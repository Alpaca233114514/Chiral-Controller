import { useState, useCallback, useRef, useEffect } from 'react';
import type { Session, StreamEvent, ContextFile } from '../types';

interface MCPState {
  connected: boolean;
  generating: boolean;
  events: StreamEvent[];
  error: string | null;
  currentSession: Session | null;
}

export function useMCP(serverUrl: string) {
  const [state, setState] = useState<MCPState>({
    connected: false,
    generating: false,
    events: [],
    error: null,
    currentSession: null
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const messageEndpointRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // 连接 SSE (保持现有逻辑)
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const sseUrl = `${serverUrl}/sse`;
    console.log('[MCP] Connecting to:', sseUrl);

    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    es.onopen = () => {
      console.log('[MCP] SSE connected');
      setState(s => ({ ...s, connected: true, error: null }));
    };

    es.addEventListener('endpoint', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      messageEndpointRef.current = data.endpoint;
      const match = data.endpoint.match(/sessionId=([^&]+)/);
      if (match) {
        sessionIdRef.current = match[1];
      }
    });

    es.addEventListener('message', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      
      if (data.method === 'notifications/progress') {
        const { type, content } = data.params;
        setState(s => ({
          ...s,
          events: [...s.events, { type, content } as StreamEvent],
          generating: type !== 'done' && type !== 'error'
        }));
      }
    });

    es.onerror = (err) => {
      console.error('[MCP] SSE error:', err);
      setState(s => ({ ...s, connected: false, error: 'Connection error' }));
    };

    return () => {
      es.close();
    };
  }, [serverUrl]);

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setState(s => ({ ...s, connected: false }));
  }, []);

  // 执行原始命令
  const executeCommand = useCallback(async (command: string, cwd?: string) => {
    if (!sessionIdRef.current || !messageEndpointRef.current) {
      setState(s => ({ ...s, error: 'Not connected' }));
      return;
    }

    setState(s => ({ ...s, generating: true, events: [], error: null }));

    const messageUrl = `${serverUrl}${messageEndpointRef.current}`;
    
    const requestBody = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'kimi/exec',
        arguments: { command, cwd }
      }
    };

    try {
      const response = await fetch(messageUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();
      if (result.error) {
        setState(s => ({ ...s, error: result.error.message, generating: false }));
      }
    } catch (err) {
      setState(s => ({ ...s, error: String(err), generating: false }));
    }
  }, [serverUrl]);

  // 发送聊天消息
  const sendChat = useCallback(async (message: string, attachments?: string[]) => {
    if (!sessionIdRef.current || !messageEndpointRef.current) {
      setState(s => ({ ...s, error: 'Not connected' }));
      return;
    }

    if (!state.currentSession) {
      setState(s => ({ ...s, error: 'No active session' }));
      return;
    }

    setState(s => ({ ...s, generating: true, events: [], error: null }));

    const messageUrl = `${serverUrl}${messageEndpointRef.current}`;
    
    const requestBody = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'kimi/chat',
        arguments: { 
          sessionId: state.currentSession.id,
          message,
          attachments
        }
      }
    };

    try {
      const response = await fetch(messageUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();
      if (result.error) {
        setState(s => ({ ...s, error: result.error.message, generating: false }));
      }
    } catch (err) {
      setState(s => ({ ...s, error: String(err), generating: false }));
    }
  }, [serverUrl, state.currentSession]);

  // Session 管理
  const createSession = useCallback(async (name?: string, workingDir?: string) => {
    if (!sessionIdRef.current || !messageEndpointRef.current) return null;

    const messageUrl = `${serverUrl}${messageEndpointRef.current}`;
    
    const requestBody = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'kimi/session/manage',
        arguments: { action: 'create', name, workingDir }
      }
    };

    try {
      const response = await fetch(messageUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();
      if (result.error) {
        setState(s => ({ ...s, error: result.error.message }));
        return null;
      }
      
      const data = JSON.parse(result.result.content[0].text);
      setState(s => ({ ...s, currentSession: data.session }));
      return data.session;
    } catch (err) {
      setState(s => ({ ...s, error: String(err) }));
      return null;
    }
  }, [serverUrl]);

  const listSessions = useCallback(async (): Promise<Session[]> => {
    if (!sessionIdRef.current || !messageEndpointRef.current) return [];

    const messageUrl = `${serverUrl}${messageEndpointRef.current}`;
    
    const requestBody = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'kimi/session/manage',
        arguments: { action: 'list' }
      }
    };

    try {
      const response = await fetch(messageUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();
      if (result.error) return [];
      
      const data = JSON.parse(result.result.content[0].text);
      return data.sessions;
    } catch {
      return [];
    }
  }, [serverUrl]);

  const selectSession = useCallback(async (sessionId: string) => {
    if (!sessionIdRef.current || !messageEndpointRef.current) return false;

    const messageUrl = `${serverUrl}${messageEndpointRef.current}`;
    
    const requestBody = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'kimi/session/manage',
        arguments: { action: 'get', sessionId }
      }
    };

    try {
      const response = await fetch(messageUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();
      if (result.error) return false;
      
      const data = JSON.parse(result.result.content[0].text);
      setState(s => ({ ...s, currentSession: data.session }));
      return true;
    } catch {
      return false;
    }
  }, [serverUrl]);

  // 文件上传
  const uploadFile = useCallback(async (file: File): Promise<ContextFile | null> => {
    if (!sessionIdRef.current || !messageEndpointRef.current) return null;
    if (!state.currentSession) {
      setState(s => ({ ...s, error: 'No active session' }));
      return null;
    }

    const messageUrl = `${serverUrl}${messageEndpointRef.current}`;
    
    // 读取文件为 base64
    const reader = new FileReader();
    const content = await new Promise<string>((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result as string;
        // 去掉 data:image/png;base64, 前缀
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const requestBody = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'kimi/file/upload',
        arguments: {
          sessionId: state.currentSession.id,
          filename: file.name,
          content,
          mimeType: file.type
        }
      }
    };

    try {
      const response = await fetch(messageUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();
      if (result.error) {
        setState(s => ({ ...s, error: result.error.message }));
        return null;
      }
      
      const data = JSON.parse(result.result.content[0].text);
      return data.file;
    } catch (err) {
      setState(s => ({ ...s, error: String(err) }));
      return null;
    }
  }, [serverUrl, state.currentSession]);

  const clearEvents = useCallback(() => {
    setState(s => ({ ...s, events: [] }));
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    executeCommand,
    sendChat,
    createSession,
    listSessions,
    selectSession,
    uploadFile,
    clearEvents
  };
}
