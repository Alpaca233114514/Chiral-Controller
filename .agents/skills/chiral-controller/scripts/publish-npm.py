#!/usr/bin/env python3
"""
Chiral Controller NPM 包发布工具
用于构建和发布 chiral-cli 和 chiral-mcp 到 NPM
"""

import subprocess
import sys
import os
from pathlib import Path


def run_command(cmd: list[str], cwd: Path, description: str) -> bool:
    """运行命令并返回是否成功"""
    print(f"\n{'='*50}")
    print(f"📦 {description}")
    print(f"{'='*50}")
    print(f"命令: {' '.join(cmd)}")
    print()
    
    result = subprocess.run(cmd, cwd=cwd, capture_output=False)
    if result.returncode != 0:
        print(f"❌ {description} 失败")
        return False
    print(f"✅ {description} 成功")
    return True


def check_npm_login() -> bool:
    """检查是否已登录 NPM"""
    result = subprocess.run(
        ["npm", "whoami"],
        capture_output=True,
        text=True
    )
    if result.returncode == 0:
        print(f"✅ 已登录 NPM: {result.stdout.strip()}")
        return True
    else:
        print("❌ 未登录 NPM")
        print("请运行: npm login")
        return False


def build_package(package_dir: Path, package_name: str) -> bool:
    """构建单个包"""
    print(f"\n{'='*50}")
    print(f"🔨 构建 {package_name}")
    print(f"{'='*50}")
    
    # 安装依赖
    if not run_command(["npm", "install"], package_dir, f"安装 {package_name} 依赖"):
        return False
    
    # 构建
    if not run_command(["npm", "run", "build"], package_dir, f"构建 {package_name}"):
        return False
    
    return True


def publish_package(package_dir: Path, package_name: str) -> bool:
    """发布单个包"""
    print(f"\n{'='*50}")
    print(f"🚀 发布 {package_name}")
    print(f"{'='*50}")
    
    # 发布
    result = subprocess.run(
        ["npm", "publish"],
        cwd=package_dir,
        capture_output=False
    )
    
    if result.returncode != 0:
        print(f"❌ {package_name} 发布失败")
        print("\n常见问题:")
        print("1. 需要 2FA 验证 - 请使用 npm publish --otp=<验证码>")
        print("2. 包名已被占用 - 需要更换包名")
        print("3. 版本号冲突 - 需要更新 version")
        return False
    
    print(f"✅ {package_name} 发布成功!")
    return True


def main():
    """主函数"""
    project_root = Path(__file__).resolve().parent.parent.parent.parent
    packages_dir = project_root / "packages"
    
    print("🌀 Chiral Controller NPM 发布工具")
    print(f"项目目录: {project_root}")
    
    # 检查 NPM 登录状态
    if not check_npm_login():
        sys.exit(1)
    
    # 构建和发布 chiral-cli
    cli_dir = packages_dir / "chiral-cli"
    if cli_dir.exists():
        if not build_package(cli_dir, "chiral-cli"):
            sys.exit(1)
        if not publish_package(cli_dir, "chiral-cli"):
            sys.exit(1)
    else:
        print(f"❌ 找不到目录: {cli_dir}")
        sys.exit(1)
    
    # 构建和发布 chiral-mcp
    mcp_dir = packages_dir / "chiral-mcp"
    if mcp_dir.exists():
        if not build_package(mcp_dir, "chiral-mcp"):
            sys.exit(1)
        if not publish_package(mcp_dir, "chiral-mcp"):
            sys.exit(1)
    else:
        print(f"❌ 找不到目录: {mcp_dir}")
        sys.exit(1)
    
    print("\n" + "="*50)
    print("🎉 所有包发布完成!")
    print("="*50)
    print("\n你可以通过以下命令安装:")
    print("  npm install -g chiral-cli")
    print("  npm install -g chiral-mcp")


if __name__ == "__main__":
    main()
