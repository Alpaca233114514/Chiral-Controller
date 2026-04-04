import { useState, useMemo} from 'react';
import { useMCP } from './hooks/useMCP';
import './App.css';

// 自动检测服务器地址
function getDefaultServerUrl(): string {
  // 从当前页面 URL 推断服务器地址
  const currentHost = window.location.hostname;
  const isLocalhost = currentHost === 'localhost' || currentHost === '127.0.0.1';
  
  if (isLocalhost) {
    return 'http://localhost:3777';
  }
  // 局域网环境，使用当前 IP + 3777 端口
  return `http://${currentHost}:3777`;
}

function App() {
  const [serverUrl, setServerUrl] = useState(getDefaultServerUrl());
  const [prompt, setPrompt] = useState('');
  const { connected, generating, events, error, connect, disconnect, generate, clearEvents } = useMCP(serverUrl);

  // 合并所有 token 内容
  const output = useMemo(() => {
    return events
      .filter(e => e.type === 'token')
      .map(e => e.content)
      .join('\n');
  }, [events]);

  // 思考内容
  const thinking = useMemo(() => {
    return events
      .filter(e => e.type === 'thinking')
      .map(e => e.content)
      .join('\n');
  }, [events]);

  // 是否完成
  const isDone = events.some(e => e.type === 'done');
  const hasError = events.some(e => e.type === 'error');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || generating) return;
    await generate(prompt);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>[开罗尔控制器]</h1>
        <p className="subtitle">Chiral Controller - MCP Remote</p>
      </header>

      <div className="connection-panel">
        <div className="input-group">
          <label>服务器地址</label>
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://localhost:3777"
            disabled={connected}
          />
        </div>
        <div className="button-group">
          {!connected ? (
            <button onClick={connect} className="btn btn-primary">
              连接
            </button>
          ) : (
            <button onClick={disconnect} className="btn btn-secondary">
              断开
            </button>
          )}
          <span className={`status ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? '[已连接]' : '[未连接]'}
          </span>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          错误: {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="prompt-form">
        <div className="input-group">
          <label>提示词</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="输入你想让 Kimi 生成的内容..."
            rows={3}
            disabled={!connected || generating}
          />
        </div>
        <div className="button-group">
          <button
            type="submit"
            disabled={!connected || !prompt.trim() || generating}
            className="btn btn-primary"
          >
            {generating ? '[生成中...]' : '[发送]'}
          </button>
          <button
            type="button"
            onClick={clearEvents}
            disabled={events.length === 0}
            className="btn btn-secondary"
          >
            [清空]
          </button>
        </div>
      </form>

      {thinking && (
        <div className="thinking-panel">
          <h3>[思考过程]</h3>
          <pre className="thinking-content">{thinking}</pre>
        </div>
      )}

      {(output || generating) && (
        <div className="output-panel">
          <div className="output-header">
            <h3>[输出]</h3>
            {generating && <span className="generating-indicator">*</span>}
            {isDone && <span className="done-indicator">[完成]</span>}
            {hasError && <span className="error-indicator">[错误]</span>}
          </div>
          <pre className="output-content">{output}</pre>
        </div>
      )}

      <footer className="footer">
        <p>MCP over SSE • Kimi Code CLI Remote Control</p>
      </footer>
    </div>
  );
}

export default App;
