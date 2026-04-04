#!/bin/bash

# 开罗尔控制器开发环境启动脚本
# 同时启动 MCP Server 和 React Web Client

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                    🌀 开罗尔控制器                         ║"
echo "║              Chiral Controller - Dev Mode                 ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 获取本机 IP
LOCAL_IP=$(hostname -I | awk '{print $1}')
if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP="127.0.0.1"
fi

echo "📁 项目目录: $PROJECT_ROOT"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js"
    exit 1
fi

echo "✅ Node.js 已安装: $(node --version)"
echo ""

# 安装并启动 MCP Server
cd "$PROJECT_ROOT/skill"
if [ ! -d "node_modules" ]; then
    echo "📦 MCP Server: 正在安装依赖..."
    npm install
    echo "✅ MCP Server 依赖安装完成"
fi

echo "🚀 启动 MCP Server (端口: 3777)..."
npm run dev &
SERVER_PID=$!

# 等待 Server 启动
sleep 3

# 安装并启动 Web Client
cd "$PROJECT_ROOT/mobile"
if [ ! -d "node_modules" ]; then
    echo "📦 Web Client: 正在安装依赖..."
    npm install
    echo "✅ Web Client 依赖安装完成"
fi

echo "🚀 启动 Web Client (端口: 5173)..."
npm run dev &
CLIENT_PID=$!

# 等待 Client 启动
sleep 3

echo ""
echo "============================================================"
echo "✅ 开发环境已启动！"
echo "============================================================"
echo ""
echo "📱 本机访问:"
echo "   Web Client: http://localhost:5173"
echo ""
echo "📱 手机访问 (同一 WiFi):"
echo "   Web Client: http://$LOCAL_IP:5173"
echo "   MCP Server: http://$LOCAL_IP:3777"
echo ""
echo "📝 使用步骤:"
echo "   1. 打开手机浏览器"
echo "   2. 访问: http://$LOCAL_IP:5173"
echo "   3. 服务器地址填入: http://$LOCAL_IP:3777"
echo "   4. 点击「连接」"
echo "   5. 输入提示词，点击「发送」"
echo ""
echo "⚠️  按 Ctrl+C 停止所有服务"
echo ""

# 捕获中断信号
cleanup() {
    echo ""
    echo "🛑 正在停止服务..."
    kill $SERVER_PID $CLIENT_PID 2>/dev/null || true
    echo "✅ 服务已停止"
    exit 0
}

trap cleanup SIGINT SIGTERM

# 等待
wait
