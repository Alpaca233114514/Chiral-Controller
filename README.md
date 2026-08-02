# Chiral Controller / 开罗尔控制器

Chiral Controller 是 Kimi Code Desktop 的安全 Flutter 遥控器。手机与桌面端通过二维码配对，消息始终端到端加密；同一局域网内优先直连，LAN 不可用时自动切换到云端 relay。

## 架构

```text
Flutter app
  ├─ LAN: ws://<desktop-ip>:3778/v1/local
  └─ Cloud: wss://chiral.liyuanstudio.com/v1/relay
            │ opaque encrypted envelopes
Kimi Code Desktop Remote Bridge
  └─ existing ACP-only session runtime
```

- `apps/chiral_mobile/`：Android/iOS Flutter 客户端
- `packages/chiral-protocol/`：Chiral Remote Protocol v1 TypeScript 类型与校验
- `protocol/v1/`：协议 schema 与跨语言 fixtures
- `services/relay/`：只路由密文的配对与云 relay
- `deploy/`：relay 的 Caddy/Docker 部署配置

Flutter 是唯一移动客户端，桌面端只通过 Remote Bridge 接入现有 ACP runtime。

## 使用

1. 启动 Kimi Code Desktop，打开“设置 → 远程控制”。
2. 开启 Remote Bridge，点击“添加设备”。
3. 在 Chiral Mobile 扫描二维码。
4. 同一 Wi-Fi 下状态显示 `LAN · 端到端加密`；直连失败时自动显示 Cloud。

Remote Bridge 首次默认关闭，开启选择会被记住。监听端口固定为 `3778`，不会自动修改系统防火墙。

## 开发

### Protocol 与 relay

```bash
npm install
npm run build
npm test
npm run dev
```

### Flutter

```bash
cd apps/chiral_mobile
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
```

### Relay 配置

复制 `services/relay/.env.example` 为 `.env`，再运行：

```bash
docker compose up --build
```

默认公共 relay 为 `wss://chiral.liyuanstudio.com/v1/relay`。协议细节见 `protocol/v1/README.md`。

## 安全

- ChaCha20-Poly1305 内容加密，X25519 + HKDF-SHA256 派生配对密钥。
- Ed25519 设备身份；relay 永远不持有内容密钥。
- LAN 与 Cloud 携带相同的加密 `RelayEnvelope`。
- 未配对、重放、篡改和超限消息必须被拒绝。

## License

Apache-2.0
