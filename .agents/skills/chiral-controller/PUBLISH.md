# Chiral Controller NPM 发布指南

## 准备工作

### 1. 注册 NPM 账户

如果还没有 NPM 账户，先注册：

```bash
npm adduser
```

### 2. 登录 NPM

```bash
npm login
```

验证登录状态：

```bash
npm whoami
```

### 3. 配置 2FA（推荐）

NPM 要求 2FA 验证才能发布包。有两种方式：

#### 方式 A: 访问令牌（推荐用于 CI/CD）

1. 访问 https://www.npmjs.com/settings/alpacali/tokens
2. 点击 "Generate New Token"
3. 选择 "Publish" 类型
4. 复制令牌
5. 使用令牌登录：

```bash
npm login --registry=https://registry.npmjs.org/
# 用户名: alpacali
# 密码: <粘贴你的访问令牌>
```

#### 方式 B: OTP 验证码（手动发布）

在手机上安装 Authy 或 Google Authenticator，绑定 NPM 账户后：

```bash
npm publish --otp=<6位验证码>
```

## 发布流程

### 方法 1: 使用 Skill 脚本（最简单）

在 Kimi CLI 中：

```bash
python .agents/skills/chiral-controller/scripts/publish.py
```

或直接使用：

```bash
python .agents/skills/chiral-controller/scripts/publish-npm.py
```

### 方法 2: 手动发布

#### 发布 chiral-cli

```bash
cd packages/chiral-cli

# 1. 安装依赖
npm install

# 2. 构建
npm run build

# 3. 发布（需要 2FA）
npm publish

# 或使用 OTP
npm publish --otp=123456
```

#### 发布 chiral-mcp

```bash
cd packages/chiral-mcp

# 1. 安装依赖
npm install

# 2. 构建
npm run build

# 3. 发布
npm publish

# 或使用 OTP
npm publish --otp=123456
```

### 方法 3: 使用 npm run publish:all

```bash
# 在项目根目录
npm run build

# 然后分别进入每个包目录发布
cd packages/chiral-cli && npm publish
cd packages/chiral-mcp && npm publish
```

## 常见问题

### 1. 403 Forbidden - 需要 2FA

**错误信息:**
```
npm error 403 403 Forbidden - PUT https://registry.npmjs.org/chiral-cli 
- Two-factor authentication or granular access token with bypass 2fa enabled is required
```

**解决方案:**
- 使用访问令牌登录，或
- 添加 `--otp=<验证码>` 参数

### 2. 包名已被占用

**错误信息:**
```
npm error 403 You do not have permission to publish "chiral-cli"
```

**解决方案:**
修改 `package.json` 中的 name：

```json
{
  "name": "@alpacali/chiral-cli"
}
```

使用 scoped 包名（以 @用户名 开头）。

### 3. 版本号冲突

**错误信息:**
```
npm error 403 You cannot publish over the previously published versions
```

**解决方案:**
更新 `package.json` 中的 version：

```json
{
  "version": "1.0.1"
}
```

### 4. 构建失败

**错误信息:**
```
npm error Lifecycle script `build` failed
```

**解决方案:**
```bash
# 重新安装依赖
rm -rf node_modules package-lock.json
npm install

# 然后重新构建
npm run build
```

## 验证发布

发布后验证包是否可用：

```bash
# 查看包信息
npm info chiral-cli

# 测试安装
npm install -g chiral-cli

# 测试命令
chiral --version
chiral status
```

## 版本管理

遵循语义化版本规范 (SemVer):

- `MAJOR.MINOR.PATCH`
- MAJOR: 破坏性变更
- MINOR: 新功能（向后兼容）
- PATCH: 问题修复

更新版本：

```bash
# 自动更新版本
cd packages/chiral-cli
npm version patch   # 1.0.0 -> 1.0.1
npm version minor   # 1.0.0 -> 1.1.0
npm version major   # 1.0.0 -> 2.0.0
```

## 撤销发布（24小时内）

如果发现严重问题，可以在 24 小时内撤销：

```bash
npm unpublish chiral-cli@1.0.0 --force
```

⚠️ **注意**: 不推荐频繁撤销，会影响用户。

## 更多帮助

- NPM 文档: https://docs.npmjs.com/
- 语义化版本: https://semver.org/
- 2FA 设置: https://docs.npmjs.com/configuring-two-factor-authentication
