#!/usr/bin/env python3
"""
开罗尔控制器开发环境启动脚本
同时启动 MCP Server 和 React Web Client
"""

import subprocess
import sys
import os
import socket
import time
from pathlib import Path


def get_local_ip():
    """获取本机局域网 IP"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"


def print_banner():
    """打印启动横幅"""
    print("""
╔═══════════════════════════════════════════════════════════╗
║                    🌀 开罗尔控制器                         ║
║              Chiral Controller - Dev Mode                 ║
╚═══════════════════════════════════════════════════════════╝
    """)


def check_node_modules(project_dir: Path) -> bool:
    """检查 node_modules 是否存在"""
    return (project_dir / "node_modules").exists()


def install_deps(project_dir: Path, name: str) -> bool:
    """安装依赖"""
    print(f"📦 {name}: 正在安装依赖...")
    try:
        result = subprocess.run(
            ["npm", "install"],
            cwd=project_dir,
            capture_output=True,
            text=True,
            shell=True
        )
        if result.returncode != 0:
            print(f"❌ {name}: 依赖安装失败")
            print(result.stderr)
            return False
        print(f"✅ {name}: 依赖安装完成")
        return True
    except Exception as e:
        print(f"❌ {name}: 安装出错 - {e}")
        return False


def start_server(project_root: Path):
    """启动 MCP Server"""
    skill_dir = project_root / "skill"
    
    if not check_node_modules(skill_dir):
        if not install_deps(skill_dir, "MCP Server"):
            return None
    
    print("🚀 正在启动 MCP Server (端口: 3777)...")
    
    # Windows 使用 cmd 来执行 npm
    if sys.platform == "win32":
        process = subprocess.Popen(
            ["cmd", "/c", "npm run dev"],
            cwd=skill_dir,
            creationflags=subprocess.CREATE_NEW_CONSOLE
        )
    else:
        process = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=skill_dir,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True
        )
    
    return process


def start_client(project_root: Path):
    """启动 Web Client"""
    mobile_dir = project_root / "mobile"
    
    if not check_node_modules(mobile_dir):
        if not install_deps(mobile_dir, "Web Client"):
            return None
    
    print("🚀 正在启动 Web Client (端口: 5173)...")
    
    # Windows 使用 cmd 来执行 npm
    if sys.platform == "win32":
        process = subprocess.Popen(
            ["cmd", "/c", "npm run dev"],
            cwd=mobile_dir,
            creationflags=subprocess.CREATE_NEW_CONSOLE
        )
    else:
        process = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=mobile_dir,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True
        )
    
    return process


def main():
    """主函数"""
    print_banner()
    
    # 找到项目根目录
    script_path = Path(__file__).resolve()
    project_root = script_path.parent.parent.parent.parent.parent
    
    print(f"📁 项目目录: {project_root}")
    print()
    
    # 检查 Node.js
    try:
        subprocess.run(["node", "--version"], capture_output=True, check=True, shell=True)
    except:
        print("❌ 错误: 未找到 Node.js，请先安装 Node.js")
        sys.exit(1)
    
    # 启动 Server
    server_process = start_server(project_root)
    if not server_process:
        print("❌ MCP Server 启动失败")
        sys.exit(1)
    
    time.sleep(2)  # 等待 Server 启动
    
    # 启动 Client
    client_process = start_client(project_root)
    if not client_process:
        print("❌ Web Client 启动失败")
        server_process.terminate()
        sys.exit(1)
    
    time.sleep(2)  # 等待 Client 启动
    
    # 获取 IP
    local_ip = get_local_ip()
    
    print()
    print("=" * 60)
    print("✅ 开发环境已启动！")
    print("=" * 60)
    print()
    print("📱 本机访问:")
    print(f"   Web Client: http://localhost:5173")
    print()
    print("📱 手机访问 (同一 WiFi):")
    print(f"   Web Client: http://{local_ip}:5173")
    print(f"   MCP Server: http://{local_ip}:3777")
    print()
    print("📝 使用步骤:")
    print("   1. 打开手机浏览器")
    print("   2. 访问上面的手机地址")
    print("   3. 服务器地址填入: " + f"http://{local_ip}:3777")
    print("   4. 点击「连接」")
    print("   5. 输入提示词，点击「发送」")
    print()
    print("⚠️  按 Ctrl+C 停止所有服务")
    print()
    
    try:
        # 等待用户中断
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print()
        print("\n🛑 正在停止服务...")
        server_process.terminate()
        client_process.terminate()
        print("✅ 服务已停止")


if __name__ == "__main__":
    main()
