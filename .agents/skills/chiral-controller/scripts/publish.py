#!/usr/bin/env python3
"""
Chiral Controller NPM 发布工具 - Skill 版本
从 Kimi CLI skill 系统调用
"""

import subprocess
import sys
import os
from pathlib import Path


def main():
    """启动发布流程"""
    script_path = Path(__file__).resolve()
    publish_script = script_path.parent / "publish-npm.py"
    
    if not publish_script.exists():
        print("❌ 找不到发布脚本")
        sys.exit(1)
    
    # 执行发布脚本
    result = subprocess.run(
        [sys.executable, str(publish_script)],
        capture_output=False
    )
    
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
