---
name: chiral-controller
description: |
  开罗尔控制器 (Chiral Controller) - Kimi Code Desktop 的 Flutter 手机遥控器。
  用于 Flutter 客户端、Chiral Remote Protocol、加密 relay、LAN bridge 集成和 Android/iOS 打包。
---

# Chiral Controller

Chiral Mobile 通过二维码与 Kimi Code Desktop 配对。同网时使用
`ws://<desktop-ip>:3778/v1/local`，否则自动回退到加密云 relay。

## 主路径

```text
apps/chiral_mobile/       Flutter Android/iOS app
packages/chiral-protocol/ Protocol v1 TypeScript types
protocol/v1/              JSON schemas and fixtures
services/relay/            Pairing and opaque relay service
deploy/                    Caddy and Docker deployment
```

Flutter 是唯一移动客户端；所有远程执行均通过 Desktop ACP-only runtime。

## 验证

```bash
npm run build
npm test
cd apps/chiral_mobile
flutter analyze
flutter test
flutter build apk --debug
```

桌面 LAN bridge 位于相邻 `kimi-code-desktop` 仓库，必须复用其 ACP-only 运行时。
