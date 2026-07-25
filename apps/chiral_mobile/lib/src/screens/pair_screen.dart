import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../state/remote_controller.dart';

class PairScreen extends ConsumerStatefulWidget {
  const PairScreen({super.key});

  @override
  ConsumerState<PairScreen> createState() => _PairScreenState();
}

class _PairScreenState extends ConsumerState<PairScreen> {
  final TextEditingController _manualController = TextEditingController();
  bool _claiming = false;
  bool _scanned = false;

  @override
  void dispose() {
    _manualController.dispose();
    super.dispose();
  }

  Future<void> _claim(String value) async {
    if (_claiming || value.trim().isEmpty) return;
    setState(() => _claiming = true);
    try {
      await ref.read(remoteControllerProvider.notifier).pair(value);
      if (mounted) context.go('/');
    } catch (_) {
      if (mounted) setState(() => _scanned = false);
    } finally {
      if (mounted) setState(() => _claiming = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final RemoteState state = ref.watch(remoteControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('连接 Desktop')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          Text(
            '在 Kimi Code Desktop → 设置 → 远程 中生成二维码。',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: AspectRatio(
              aspectRatio: 1.35,
              child: MobileScanner(
                onDetect: (BarcodeCapture capture) {
                  if (_scanned) return;
                  for (final Barcode barcode in capture.barcodes) {
                    final String? value = barcode.rawValue;
                    if (value != null) {
                      _scanned = true;
                      _claim(value);
                      break;
                    }
                  }
                },
              ),
            ),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _manualController,
            minLines: 3,
            maxLines: 6,
            decoration: const InputDecoration(
              labelText: '或粘贴配对内容',
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: _claiming ? null : () => _claim(_manualController.text),
            icon: _claiming
                ? const SizedBox.square(
                    dimension: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.link),
            label: Text(_claiming ? '正在建立密钥…' : '安全配对'),
          ),
          if (state.error != null) ...<Widget>[
            const SizedBox(height: 12),
            Text(
              state.error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
          const SizedBox(height: 16),
          const Text('配对令牌仅可使用一次。消息正文、文件和会话内容会在设备之间端到端加密。'),
        ],
      ),
    );
  }
}
