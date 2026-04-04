#!/usr/bin/env python3
"""
开罗尔控制器启动脚本 - Skill 入口
从 kimi-cli skill 系统调用
"""

import subprocess
import sys
import os
from pathlib import Path


def main():
    """启动开发环境"""
    script_path = Path(__file__).resolve()
    project_root = script_path.parent.parent.parent.parent.parent
    
    # 根据平台选择启动脚本
    if sys.platform == "win32":
        script = project_root / "start-dev.bat"
        # 使用 cmd /c start 来在新窗口运行
        subprocess.Popen(["cmd", "/c", "start", str(script)], cwd=project_root)
    else:
        script = project_root / "start-dev.sh"
        # 使脚本可执行
        os.chmod(script, 0o755)
        # 在后台运行
        subprocess.Popen([str(script)], cwd=project_root, start_new_session=True)
    
    print("✅ 已启动开罗尔控制器开发环境")
    print(f"   项目目录: {project_root}")
    print("")
    print("📝 如果使用 Windows，请查看弹出的命令行窗口")
    print("📝 如果使用 Mac/Linux，服务已在后台启动")
    print("")
    print("📱 访问 http://localhost:5173 开始使用")


if __name__ == "__main__":
    main()
