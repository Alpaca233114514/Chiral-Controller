import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models/protocol.dart';
import '../state/remote_controller.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  final TextEditingController _composer = TextEditingController();
  final ScrollController _timeline = ScrollController();

  @override
  void dispose() {
    _composer.dispose();
    _timeline.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final RemoteState state = ref.watch(remoteControllerProvider);
    final bool wide = MediaQuery.sizeOf(context).width >= 760;
    if (!state.initialized) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return Scaffold(
      drawer: wide ? null : Drawer(child: _SessionRail(state: state)),
      body: SafeArea(
        child: Row(
          children: <Widget>[
            if (wide) SizedBox(width: 280, child: _SessionRail(state: state)),
            if (wide) const VerticalDivider(width: 1),
            Expanded(
              child: _Conversation(state: state, owner: this),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> send() async {
    final String text = _composer.text;
    if (text.trim().isEmpty) return;
    await ref.read(remoteControllerProvider.notifier).sendPrompt(text);
    _composer.clear();
    if (_timeline.hasClients) {
      await _timeline.animateTo(
        _timeline.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    }
  }

  Future<void> attach() async {
    final FilePickerResult? result = await FilePicker.platform.pickFiles(
      withData: true,
    );
    final PlatformFile? file = result?.files.single;
    if (file?.bytes == null || !mounted) return;
    final RemoteController controller = ref.read(
      remoteControllerProvider.notifier,
    );
    String? uploadedPath;
    try {
      uploadedPath = await controller.uploadFile(
        filename: file!.name,
        bytes: file.bytes!,
      );
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('附件上传失败：$error')));
      }
      return;
    }
    if (uploadedPath == null || !mounted) return;
    final String normalized = uploadedPath.replaceAll('\\', '/');
    final String token = normalized.contains(RegExp(r'\s'))
        ? '@"$normalized"'
        : '@$normalized';
    final String next = <String>[
      _composer.text.trimRight(),
      token,
    ].where((String part) => part.isNotEmpty).join('\n');
    _composer.value = TextEditingValue(
      text: next,
      selection: TextSelection.collapsed(offset: next.length),
    );
    controller.setDraft(next);
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('${file.name} 已加入下一条消息')));
  }

  void showWorkspace() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (BuildContext context) => const _WorkspacePanel(),
    );
  }
}

class _SessionRail extends ConsumerWidget {
  const _SessionRail({required this.state});

  final RemoteState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final RemoteController controller = ref.read(
      remoteControllerProvider.notifier,
    );
    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 16, 10, 12),
            child: Row(
              children: <Widget>[
                const Expanded(
                  child: Text(
                    'CHIRAL',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      letterSpacing: 2,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: '新建会话',
                  onPressed: state.connected
                      ? () => controller.createSession()
                      : null,
                  icon: const Icon(Icons.add, size: 20),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: _ConnectionBadge(state: state),
          ),
          const SizedBox(height: 10),
          Expanded(
            child: state.sessions.isEmpty
                ? const Center(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: Text(
                        '连接 Desktop 后，会话会在这里出现。',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                : ListView.builder(
                    itemCount: state.sessions.length,
                    itemBuilder: (BuildContext context, int index) {
                      final ChiralSession session = state.sessions[index];
                      return ListTile(
                        dense: true,
                        selected: state.selectedSessionId == session.sessionId,
                        title: Text(
                          session.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        subtitle: session.workDir == null
                            ? null
                            : Text(
                                session.workDir!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                        leading: Icon(
                          session.isRunning
                              ? Icons.motion_photos_on_outlined
                              : Icons.chat_bubble_outline,
                          size: 18,
                        ),
                        onTap: () {
                          controller.selectSession(session.sessionId);
                          if (Scaffold.maybeOf(context)?.hasDrawer == true) {
                            Navigator.pop(context);
                          }
                        },
                      );
                    },
                  ),
          ),
          const Divider(height: 1),
          ListTile(
            dense: true,
            leading: const Icon(Icons.devices_outlined, size: 19),
            title: Text(
              state.pairedDesktop?.bundle.desktop.displayName ?? '配对 Desktop',
            ),
            onTap: () => context.push('/pair'),
          ),
          if (state.pairedDesktop != null)
            ListTile(
              dense: true,
              leading: const Icon(Icons.link_off, size: 19),
              title: const Text('解除配对'),
              onTap: controller.unpair,
            ),
        ],
      ),
    );
  }
}

class _Conversation extends ConsumerWidget {
  const _Conversation({required this.state, required this.owner});

  final RemoteState state;
  final _HomeScreenState owner;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final RemoteController controller = ref.read(
      remoteControllerProvider.notifier,
    );
    return Column(
      children: <Widget>[
        SizedBox(
          height: 56,
          child: Row(
            children: <Widget>[
              if (MediaQuery.sizeOf(context).width < 760)
                Builder(
                  builder: (BuildContext context) => IconButton(
                    onPressed: () => Scaffold.of(context).openDrawer(),
                    icon: const Icon(Icons.menu),
                  ),
                ),
              Expanded(
                child: Text(
                  state.selectedSession?.title ?? '远程控制台',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              IconButton(
                tooltip: 'Changes · Files · Agents · Tasks',
                onPressed: state.selectedSessionId == null
                    ? null
                    : owner.showWorkspace,
                icon: const Icon(Icons.space_dashboard_outlined),
              ),
              IconButton(
                tooltip: '刷新',
                onPressed: state.connected ? controller.refreshSessions : null,
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        if (state.error != null)
          MaterialBanner(
            content: Text(state.error!),
            actions: <Widget>[
              TextButton(
                onPressed: controller.clearError,
                child: const Text('关闭'),
              ),
              if (state.pairedDesktop != null)
                TextButton(
                  onPressed: controller.connect,
                  child: const Text('重试'),
                ),
            ],
          ),
        Expanded(
          child: state.selectedSessionId == null
              ? _EmptyState(state: state)
              : ListView.builder(
                  controller: owner._timeline,
                  padding: const EdgeInsets.fromLTRB(18, 20, 18, 12),
                  itemCount: state.entries.length,
                  itemBuilder: (BuildContext context, int index) =>
                      _TimelineEntry(entry: state.entries[index]),
                ),
        ),
        _Composer(state: state, owner: owner),
      ],
    );
  }
}

class _ConnectionBadge extends StatelessWidget {
  const _ConnectionBadge({required this.state});

  final RemoteState state;

  @override
  Widget build(BuildContext context) {
    final (Color color, String label) = switch (state.connectionMode) {
      ConnectionMode.lan => (Colors.green, 'LAN · 端到端加密'),
      ConnectionMode.cloud => (Colors.blue, 'CLOUD · 端到端加密'),
      ConnectionMode.connecting => (Colors.orange, '正在连接'),
      ConnectionMode.disconnected => (Colors.grey, 'Desktop 离线'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).dividerColor),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: <Widget>[
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Expanded(child: Text(label, style: const TextStyle(fontSize: 11))),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.state});

  final RemoteState state;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(Icons.all_inclusive, size: 34),
            const SizedBox(height: 16),
            Text(
              state.pairedDesktop == null
                  ? '先与 Kimi Code Desktop 配对'
                  : state.connected
                  ? '选择或创建一个会话'
                  : 'Desktop 当前离线\n本地草稿会保留，但不会执行',
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _TimelineEntry extends ConsumerWidget {
  const _TimelineEntry({required this.entry});

  final ChatEntry entry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bool isUser = entry.kind == ChatEntryKind.user;
    final Widget body = switch (entry.kind) {
      ChatEntryKind.assistant => MarkdownBody(
        data: entry.content,
        selectable: true,
      ),
      ChatEntryKind.approval => _ApprovalCard(entry: entry),
      ChatEntryKind.question => _QuestionCard(entry: entry),
      _ => SelectableText(entry.content),
    };
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 760),
        margin: const EdgeInsets.only(bottom: 12),
        padding: EdgeInsets.all(isUser ? 12 : 10),
        decoration: BoxDecoration(
          color: isUser
              ? Theme.of(context).colorScheme.surfaceContainerHighest
              : entry.kind == ChatEntryKind.error
              ? Theme.of(context).colorScheme.errorContainer
              : Colors.transparent,
          border:
              entry.kind == ChatEntryKind.tool ||
                  entry.kind == ChatEntryKind.thinking ||
                  entry.kind == ChatEntryKind.status ||
                  entry.kind == ChatEntryKind.task
              ? Border(left: BorderSide(color: Theme.of(context).dividerColor))
              : null,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              _entryLabel(entry.kind),
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 6),
            body,
          ],
        ),
      ),
    );
  }
}

class _Composer extends ConsumerWidget {
  const _Composer({required this.state, required this.owner});

  final RemoteState state;
  final _HomeScreenState owner;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final RemoteController controller = ref.read(
      remoteControllerProvider.notifier,
    );
    final bool canSend =
        state.connected && state.selectedSessionId != null && !state.running;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: Theme.of(context).dividerColor)),
      ),
      child: Column(
        children: <Widget>[
          Row(
            children: <Widget>[
              FilterChip(
                label: const Text('Plan'),
                selected: state.planMode,
                onSelected: state.connected ? controller.setPlanMode : null,
              ),
              const SizedBox(width: 8),
              PopupMenuButton<String>(
                enabled: state.connected,
                initialValue: state.permissionMode,
                onSelected: controller.setPermissionMode,
                itemBuilder: (BuildContext context) =>
                    const <PopupMenuEntry<String>>[
                      PopupMenuItem(value: 'default', child: Text('权限：默认')),
                      PopupMenuItem(
                        value: 'acceptEdits',
                        child: Text('权限：接受编辑'),
                      ),
                      PopupMenuItem(
                        value: 'bypassPermissions',
                        child: Text('权限：完全访问'),
                      ),
                    ],
                child: Chip(label: Text('权限 · ${state.permissionMode}')),
              ),
              const Spacer(),
              if (state.contextLabel != null)
                Flexible(
                  child: Text(
                    state.contextLabel!,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelSmall,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: <Widget>[
              IconButton(
                tooltip: '附件',
                onPressed: state.connected ? owner.attach : null,
                icon: const Icon(Icons.attach_file),
              ),
              Expanded(
                child: TextField(
                  controller: owner._composer,
                  minLines: 1,
                  maxLines: 7,
                  onChanged: controller.setDraft,
                  onSubmitted: canSend ? (_) => owner.send() : null,
                  decoration: InputDecoration(
                    hintText: state.connected
                        ? '向 Kimi 提问，或输入 / 命令'
                        : 'Desktop 离线：可编辑草稿，暂不可发送',
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                tooltip: state.running ? '取消' : '发送',
                onPressed: state.running
                    ? controller.cancelPrompt
                    : canSend
                    ? owner.send
                    : null,
                icon: Icon(state.running ? Icons.stop : Icons.arrow_upward),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ApprovalCard extends ConsumerWidget {
  const _ApprovalCard({required this.entry});

  final ChatEntry entry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final RemoteController controller = ref.read(
      remoteControllerProvider.notifier,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(entry.content),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          children: <Widget>[
            FilledButton(
              onPressed: () => controller.respondApproval(entry, 'approved'),
              child: const Text('允许'),
            ),
            OutlinedButton(
              onPressed: () => controller.respondApproval(entry, 'denied'),
              child: const Text('拒绝'),
            ),
          ],
        ),
      ],
    );
  }
}

class _QuestionCard extends ConsumerStatefulWidget {
  const _QuestionCard({required this.entry});

  final ChatEntry entry;

  @override
  ConsumerState<_QuestionCard> createState() => _QuestionCardState();
}

class _QuestionCardState extends ConsumerState<_QuestionCard> {
  final TextEditingController _answer = TextEditingController();

  @override
  void dispose() {
    _answer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(widget.entry.content),
        const SizedBox(height: 10),
        TextField(controller: _answer, decoration: const InputDecoration()),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: () =>
              ref.read(remoteControllerProvider.notifier).respondQuestion(
                widget.entry,
                <String, String>{'answer': _answer.text},
              ),
          child: const Text('回复'),
        ),
      ],
    );
  }
}

class _WorkspacePanel extends ConsumerStatefulWidget {
  const _WorkspacePanel();

  @override
  ConsumerState<_WorkspacePanel> createState() => _WorkspacePanelState();
}

class _WorkspacePanelState extends ConsumerState<_WorkspacePanel> {
  int _index = 0;
  Future<dynamic>? _content;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final RemoteController controller = ref.read(
      remoteControllerProvider.notifier,
    );
    setState(() {
      _content = _index == 0
          ? controller.workspaceDiff()
          : controller.workspaceList();
    });
  }

  @override
  Widget build(BuildContext context) {
    const List<String> tabs = <String>['Changes', 'Files', 'Agents', 'Tasks'];
    return SizedBox(
      height: MediaQuery.sizeOf(context).height * .72,
      child: Column(
        children: <Widget>[
          SegmentedButton<int>(
            segments: List<ButtonSegment<int>>.generate(
              tabs.length,
              (int index) =>
                  ButtonSegment<int>(value: index, label: Text(tabs[index])),
            ),
            selected: <int>{_index},
            onSelectionChanged: (Set<int> value) {
              _index = value.first;
              _load();
            },
          ),
          const Divider(),
          Expanded(
            child: FutureBuilder<dynamic>(
              future: _content,
              builder: (BuildContext context, AsyncSnapshot<dynamic> snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return Center(child: Text(snapshot.error.toString()));
                }
                if (_index >= 2) {
                  return Center(child: Text('${tabs[_index]} 事件会显示在会话时间线中。'));
                }
                return SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: SelectableText(
                    const JsonEncoder.withIndent('  ').convert(snapshot.data),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

String _entryLabel(ChatEntryKind kind) => switch (kind) {
  ChatEntryKind.user => 'YOU',
  ChatEntryKind.assistant => 'KIMI',
  ChatEntryKind.thinking => 'THINKING',
  ChatEntryKind.tool => 'TOOL',
  ChatEntryKind.approval => 'APPROVAL',
  ChatEntryKind.question => 'QUESTION',
  ChatEntryKind.status => 'STATUS',
  ChatEntryKind.task => 'AGENT / TASK',
  ChatEntryKind.error => 'ERROR',
};
