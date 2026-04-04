import { useState, useCallback, useRef, useEffect } from 'react';

export type StreamEvent = 
  | { type: 'token'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'done' }
  | { type: 'error'; content: string };

interface MCPState {
  connected: boolean;
  generating: boolean;
  events: StreamEvent[];
  error: string | null;
}

export function useMCP(serverUrl: string) {
  const [state, setState] = useState<MCPState>({
    connected: false,
    generating: false,
    events: [],
    error: null
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const messageEndpointRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // 连接 SSE
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
      // 提取 sessionId
      const match = data.endpoint.match(/sessionId=([^&]+)/);
      if (match) {
        sessionIdRef.current = match[1];
      }
      console.log('[MCP] Endpoint received:', data.endpoint);
    });

    es.addEventListener('message', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      console.log('[MCP] Notification:', data);

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

  // 断开连接
  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setState(s => ({ ...s, connected: false }));
  }, []);

  // 调用 kimi/generate
  const generate = useCallback(async (prompt: string) => {
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
        name: 'kimi/generate',
        arguments: { prompt, stream: true }
      }
    };

    console.log('[MCP] Calling tool:', requestBody);

    try {
      const response = await fetch(messageUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();
      console.log('[MCP] Tool response:', result);

      if (result.error) {
        setState(s => ({ ...s, error: result.error.message, generating: false }));
      }
    } catch (err) {
      console.error('[MCP] Call error:', err);
      setState(s => ({ ...s, error: String(err), generating: false }));
    }
  }, [serverUrl]);

  // 清除事件
  const clearEvents = useCallback(() => {
    setState(s => ({ ...s, events: [] }));
  }, []);

  // 组件卸载时断开连接
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    generate,
    clearEvents
  };
}
