import { useState, useMemo, useEffect } from 'react';
import { useMCP } from './hooks/useMCP';
import './App.css';

function App() {
  const [serverUrl, setServerUrl] = useState(() => {
    const currentHost = window.location.hostname;
    const isLocalhost = currentHost === 'localhost' || currentHost === '127.0.0.1';
    return isLocalhost ? 'http://localhost:3777' : `http://${currentHost}:3777`;
  });
  
  const [input, setInput] = useState('');
  const [showSessions, setShowSessions] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  
  const { 
    connected, 
    generating, 
    events, 
    error, 
    currentSession,
    connect, 
    disconnect, 
    executeCommand,
    sendChat,
    createSession,
    listSessions,
    selectSession,
    clearEvents 
  } = useMCP(serverUrl);

  // 加载 session 列表
  useEffect(() => {
    if (connected) {
      loadSessions();
    }
  }, [connected]);

  const loadSessions = async () => {
    const list = await listSessions();
    setSessions(list);
  };

  // 合并输出
  const output = useMemo(() => {
    return events
      .filter(e => e.type === 'token')
      .map(e => e.content)
      .join('\n');
  }, [events]);

  const thinking = useMemo(() => {
    return events
      .filter(e => e.type === 'thinking')
      .map(e => e.content)
      .join('\n');
  }, [events]);

  const isDone = events.some(e => e.type === 'done');
  const hasError = events.some(e => e.type === 'error');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || generating) return;
    
    if (!currentSession) {
      await createSession();
    }
    
    if (input.startsWith('/')) {
      await executeCommand(input);
    } else {
      await sendChat(input);
    }
    setInput('');
  };

  const handleCreateSession = async () => {
    await createSession();
    await loadSessions();
  };

  return (
    <div className="app">
      <header className="header">
        <h1>[开罗尔控制器]</h1>
        <div className="header-actions">
          <button onClick={() => setShowSessions(!showSessions)}>
            {showSessions ? '关闭' : '会话'}
          </button>
        </div>
      </header>

      {/* 连接面板 */}
      <div className="connection-panel">
        <input
          type="text"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          placeholder="http://localhost:3777"
          disabled={connected}
        />
        {!connected ? (
          <button onClick={connect}>连接</button>
        ) : (
          <button onClick={disconnect}>断开</button>
        )}
        <span className={`status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '[已连接]' : '[未连接]'}
        </span>
      </div>

      {/* Session 面板 */}
      {showSessions && (
        <div className="session-panel">
          <h3>会话列表</h3>
          <button onClick={handleCreateSession}>+ 新建会话</button>
          <ul>
            {sessions.map(s => (
              <li 
                key={s.id} 
                className={currentSession?.id === s.id ? 'active' : ''}
                onClick={() => selectSession(s.id)}
              >
                {s.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 当前 Session 信息 */}
      {currentSession && (
        <div className="current-session">
          <span>当前: {currentSession.name}</span>
          {currentSession.contextFiles?.length > 0 && (
            <span className="file-count">
              📎 {currentSession.contextFiles.length}
            </span>
          )}
        </div>
      )}

      {/* 错误提示 */}
      {error && <div className="error-banner">错误: {error}</div>}

      {/* 输出区域 */}
      <div className="output-area">
        {thinking && (
          <div className="thinking-panel">
            <h4>[思考]</h4>
            <pre>{thinking}</pre>
          </div>
        )}
        
        {(output || generating) && (
          <div className="output-panel">
            <div className="output-header">
              <h4>[输出]</h4>
              {generating && <span className="indicator">*</span>}
              {isDone && <span className="done">[完成]</span>}
              {hasError && <span className="error">[错误]</span>}
            </div>
            <pre>{output}</pre>
          </div>
        )}
      </div>

      {/* 输入区域 */}
      <form onSubmit={handleSubmit} className="input-form">
        <div className="input-row">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={input.startsWith('/') ? '输入命令 (如 /task 写代码)' : '输入消息或 / 命令...'}
            disabled={!connected || generating}
          />
          <button type="submit" disabled={!connected || !input.trim() || generating}>
            {generating ? '...' : '发送'}
          </button>
        </div>
        
        {/* 快捷命令 */}
        <div className="quick-commands">
          <button type="button" onClick={() => setInput('/task ')}>/task</button>
          <button type="button" onClick={() => setInput('/commit')}>/commit</button>
          <button type="button" onClick={() => setInput('/pr')}>/pr</button>
          <button type="button" onClick={clearEvents}>清空</button>
        </div>
      </form>
    </div>
  );
}

export default App;
