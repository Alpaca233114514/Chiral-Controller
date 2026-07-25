# Android 打包工作流

仓库通过 GitHub Actions 的 **Android package** 工作流打包
`apps/chiral_mobile` Flutter 应用。工作流固定使用 Flutter 3.41.9 和 Java 17，
并在上传产物前执行 `flutter analyze` 与 `flutter test`。

## 运行方式

在 GitHub 仓库的 **Actions → Android package → Run workflow** 中选择目标：

- `debug-apk`：无需签名 Secrets，生成可直接安装的调试 APK。
- `release-apk`：生成按 ABI 拆分并使用上传密钥签名的 APK。
- `release-aab`：生成供 Google Play 使用的签名 AAB。
- `release-all`：同时生成签名 APK 与 AAB。

也可以推送 `android-v*` 标签（例如 `android-v1.2.0`），自动执行
`release-all`。标签中的语义版本会作为 Android `versionName`，GitHub Actions
运行序号会作为 `versionCode`。手动运行时可以通过 `build_name` 覆盖
`versionName`。

推送 `codex/**` 功能分支时会自动执行 `debug-apk`，便于在合并工作流前先获取
真机测试包。

构建完成后，APK/AAB、`SHA256SUMS` 和 `BUILD-INFO.txt` 会保留在本次
Actions 运行的 Artifacts 中 14 天。

## 配置发布签名

发布目标不会使用调试密钥。先创建 Android 上传密钥，并将以下值添加到
GitHub 仓库的 **Settings → Secrets and variables → Actions**：

| Secret | 内容 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `.jks` 文件的 Base64 内容 |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 密码 |
| `ANDROID_KEY_ALIAS` | 上传密钥别名 |
| `ANDROID_KEY_PASSWORD` | 上传密钥密码 |

在 PowerShell 中可生成 `ANDROID_KEYSTORE_BASE64`：

```powershell
[Convert]::ToBase64String(
  [IO.File]::ReadAllBytes("C:\path\to\upload-keystore.jks")
) | Set-Clipboard
```

密钥文件和 `android/key.properties` 已被 Android 工程的 `.gitignore`
排除，不应提交到版本库。缺少任意一个发布 Secret 时，发布构建会在签名前
明确失败。
