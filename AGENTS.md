# Agent 仓库安全与编辑规则

以下规则适用于所有仓库操作，必须遵守。

## 1. 文件安全

未经用户明确授权，禁止删除、清空、覆盖或丢弃任何文件、目录及其内容。删除前必须列出所有受影响路径，说明删除原因和可逆替代方案，并获得用户对这些具体路径的明确批准；“清理项目”“移除无用代码”“重构”“修复项目”等宽泛指令不构成删除授权。无法确认操作是否会丢失数据时，按删除处理并停止。绝对不允许绕过AutoReview

## 2. 永久保护 main/master

`main` 和 `master` 永久受保护：不得删除、重命名、替换、重建、强制推送、改写历史、破坏性重置或绕过分支保护、审核和状态检查。所有开发必须在功能分支进行，并通过正常 Pull Request/合并集成。

## 3. 编辑代码前必须创建 Goal

任何代码、测试、脚本、配置、Schema、Migration、CI/CD、基础设施或工作流编辑前，必须先创建独立且处于活动状态的 Goal。Goal 必须包含任务目标、预计修改范围、验证方式。没有活动 Goal 时禁止任何编辑。目标达成后必须明确操作关闭目标防止循环

--- project-doc ---

# Chiral Controller / 开罗尔控制器

Kimi Code Desktop 的安全 Flutter 手机遥控器。

## 当前架构

- `apps/chiral_mobile/`：Flutter Android/iOS 客户端
- `packages/chiral-protocol/`：Remote Protocol v1 类型与校验
- `protocol/v1/`：JSON schema 与 fixtures
- `services/relay/`：配对与密文云 relay
- `deploy/`：relay 部署
- Desktop Remote Bridge：位于相邻 `kimi-code-desktop` 仓库并复用 ACP-only runtime

Flutter 是唯一移动客户端；不要新增并行的移动端或运行时路径。

## 传输

- LAN：`ws://<desktop-ip>:3778/v1/local`
- Discovery：`_chiral._tcp.local`
- Cloud：`wss://chiral.liyuanstudio.com/v1/relay`
- 内容：端到端加密的 Chiral Remote Protocol v1 `RelayEnvelope`

## 标准验证

```bash
npm run build
npm test
cd apps/chiral_mobile
flutter analyze
flutter test
flutter build apk --debug
```

实施跨仓库变更时必须保护另一个仓库的未提交改动，并在独立功能分支/worktree 中工作。
