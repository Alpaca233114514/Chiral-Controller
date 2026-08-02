import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../models/protocol.dart';
import '../services/cache_database.dart';
import '../services/attachment_chunker.dart';
import '../services/identity_store.dart';
import '../services/remote_transport.dart';

final remoteControllerProvider =
    NotifierProvider<RemoteController, RemoteState>(RemoteController.new);

class RemoteState {
  const RemoteState({
    this.initialized = false,
    this.pairedDesktop,
    this.connectionMode = ConnectionMode.disconnected,
    this.connectionDetail,
    this.sessions = const <ChiralSession>[],
    this.selectedSessionId,
    this.entries = const <ChatEntry>[],
    this.capabilities = const <String>{},
    this.running = false,
    this.planMode = false,
    this.permissionMode = 'default',
    this.contextLabel,
    this.error,
    this.draft = '',
  });

  final bool initialized;
  final PairedDesktop? pairedDesktop;
  final ConnectionMode connectionMode;
  final String? connectionDetail;
  final List<ChiralSession> sessions;
  final String? selectedSessionId;
  final List<ChatEntry> entries;
  final Set<String> capabilities;
  final bool running;
  final bool planMode;
  final String permissionMode;
  final String? contextLabel;
  final String? error;
  final String draft;

  bool get connected =>
      connectionMode == ConnectionMode.lan ||
      connectionMode == ConnectionMode.cloud;

  ChiralSession? get selectedSession {
    for (final ChiralSession session in sessions) {
      if (session.sessionId == selectedSessionId) return session;
    }
    return null;
  }

  RemoteState copyWith({
    bool? initialized,
    PairedDesktop? pairedDesktop,
    bool clearPairing = false,
    ConnectionMode? connectionMode,
    String? connectionDetail,
    bool clearConnectionDetail = false,
    List<ChiralSession>? sessions,
    String? selectedSessionId,
    bool clearSelectedSession = false,
    List<ChatEntry>? entries,
    Set<String>? capabilities,
    bool? running,
    bool? planMode,
    String? permissionMode,
    String? contextLabel,
    bool clearContextLabel = false,
    String? error,
    bool clearError = false,
    String? draft,
  }) {
    return RemoteState(
      initialized: initialized ?? this.initialized,
      pairedDesktop: clearPairing
          ? null
          : (pairedDesktop ?? this.pairedDesktop),
      connectionMode: connectionMode ?? this.connectionMode,
      connectionDetail: clearConnectionDetail
          ? null
          : (connectionDetail ?? this.connectionDetail),
      sessions: sessions ?? this.sessions,
      selectedSessionId: clearSelectedSession
          ? null
          : (selectedSessionId ?? this.selectedSessionId),
      entries: entries ?? this.entries,
      capabilities: capabilities ?? this.capabilities,
      running: running ?? this.running,
      planMode: planMode ?? this.planMode,
      permissionMode: permissionMode ?? this.permissionMode,
      contextLabel: clearContextLabel
          ? null
          : (contextLabel ?? this.contextLabel),
      error: clearError ? null : (error ?? this.error),
      draft: draft ?? this.draft,
    );
  }
}

class RemoteController extends Notifier<RemoteState> {
  final IdentityStore _identityStore = IdentityStore();
  final CacheDatabase _cache = CacheDatabase();
  final Uuid _uuid = const Uuid();
  late final RemoteTransport _transport;
  bool _disposed = false;

  @override
  RemoteState build() {
    _transport = RemoteTransport(
      identityStore: _identityStore,
      onMessage: _handleMessage,
      onConnection: _handleConnection,
    );
    ref.onDispose(() {
      _disposed = true;
      unawaited(_transport.close());
    });
    Future<void>.microtask(_initialize);
    return const RemoteState();
  }

  Future<void> _initialize() async {
    try {
      final List<ChiralSession> cached = await _cache.readSessions();
      final PairedDesktop? paired = await _identityStore.loadPairedDesktop();
      if (_disposed) return;
      state = state.copyWith(
        initialized: true,
        sessions: cached,
        pairedDesktop: paired,
        clearError: true,
      );
      if (paired != null) await connect();
    } catch (error) {
      if (_disposed) return;
      state = state.copyWith(initialized: true, error: error.toString());
    }
  }

  Future<void> pair(String qrPayload) async {
    state = state.copyWith(clearError: true);
    try {
      final PairingBundle bundle = PairingBundle.fromQr(qrPayload.trim());
      final PairedDesktop paired = await _identityStore.claimPairing(bundle);
      state = state.copyWith(pairedDesktop: paired);
      await connect();
    } catch (error) {
      state = state.copyWith(error: error.toString());
      rethrow;
    }
  }

  Future<void> connect() async {
    final PairedDesktop? paired = state.pairedDesktop;
    if (paired == null) return;
    try {
      await _transport.connect(paired);
      final dynamic handshake = await _transport.request('device.handshake');
      final Map<String, dynamic> payload = _asMap(handshake);
      final Set<String> capabilities =
          (payload['capabilities'] as List<dynamic>? ?? <dynamic>[])
              .map((dynamic value) => value.toString())
              .toSet();
      state = state.copyWith(capabilities: capabilities, clearError: true);
      await refreshSessions();
    } catch (error) {
      state = state.copyWith(error: error.toString());
    }
  }

  Future<void> unpair() async {
    String? warning;
    final PairedDesktop? paired = state.pairedDesktop;
    if (paired != null) {
      try {
        await _identityStore.revokePairing(paired);
      } catch (error) {
        warning = error.toString();
      }
    }
    await _transport.close();
    await _identityStore.clearPairedDesktop();
    await _cache.clear();
    state = RemoteState(initialized: true, error: warning);
  }

  Future<void> refreshSessions() async {
    if (!state.connected) return;
    try {
      final dynamic response = await _transport.request('session.list');
      final dynamic raw = response is Map
          ? (response['sessions'] ?? response['items'] ?? response['data'])
          : response;
      final List<ChiralSession> sessions =
          (raw is List ? raw : const <dynamic>[])
              .whereType<Map>()
              .map(
                (Map value) =>
                    ChiralSession.fromJson(Map<String, dynamic>.from(value)),
              )
              .toList(growable: false);
      await _cache.writeSessions(sessions);
      state = state.copyWith(
        sessions: sessions,
        selectedSessionId:
            state.selectedSessionId ??
            (sessions.isEmpty ? null : sessions.first.sessionId),
        clearError: true,
      );
      if (state.selectedSessionId != null) {
        await selectSession(state.selectedSessionId!);
      }
    } catch (error) {
      state = state.copyWith(error: error.toString());
    }
  }

  Future<void> createSession({String? workDir}) async {
    if (!state.connected) return;
    try {
      final dynamic response = await _transport.request(
        'session.create',
        payload: <String, dynamic>{'workDir': ?workDir},
      );
      final ChiralSession created = ChiralSession.fromJson(_asMap(response));
      state = state.copyWith(
        sessions: <ChiralSession>[created, ...state.sessions],
        selectedSessionId: created.sessionId,
        entries: const <ChatEntry>[],
      );
      await _cache.writeSessions(state.sessions);
    } catch (error) {
      state = state.copyWith(error: error.toString());
    }
  }

  Future<void> selectSession(String sessionId) async {
    state = state.copyWith(
      selectedSessionId: sessionId,
      entries: const <ChatEntry>[],
      clearError: true,
    );
    if (!state.connected) return;
    try {
      final dynamic history = await _transport.request(
        'history.replay',
        sessionId: sessionId,
      );
      final List<ChatEntry> entries = _historyEntries(history);
      state = state.copyWith(entries: entries);
    } catch (error) {
      state = state.copyWith(error: error.toString());
    }
  }

  void setDraft(String value) {
    state = state.copyWith(draft: value);
  }

  Future<void> sendPrompt(String text) async {
    final String prompt = text.trim();
    final String? sessionId = state.selectedSessionId;
    if (prompt.isEmpty || sessionId == null || !state.connected) return;
    final ChatEntry pending = ChatEntry(
      id: _uuid.v4(),
      kind: ChatEntryKind.user,
      content: prompt,
      timestamp: DateTime.now(),
    );
    state = state.copyWith(
      entries: <ChatEntry>[...state.entries, pending],
      running: true,
      draft: '',
      clearError: true,
    );
    try {
      await _transport.request(
        'prompt.send',
        sessionId: sessionId,
        payload: <String, dynamic>{'text': prompt, 'planMode': state.planMode},
      );
    } catch (error) {
      state = state.copyWith(running: false, error: error.toString());
    }
  }

  Future<void> cancelPrompt() async {
    final String? sessionId = state.selectedSessionId;
    if (sessionId == null || !state.connected) return;
    try {
      await _transport.request('prompt.cancel', sessionId: sessionId);
    } catch (error) {
      state = state.copyWith(error: error.toString());
    }
  }

  Future<void> setPlanMode(bool enabled) async {
    state = state.copyWith(planMode: enabled);
    final String? sessionId = state.selectedSessionId;
    if (sessionId == null || !state.connected) return;
    try {
      await _transport.request(
        'session.set_plan_mode',
        sessionId: sessionId,
        payload: <String, dynamic>{'enabled': enabled},
      );
    } catch (error) {
      state = state.copyWith(error: error.toString());
    }
  }

  Future<void> setPermissionMode(String mode) async {
    state = state.copyWith(permissionMode: mode);
    final String? sessionId = state.selectedSessionId;
    if (sessionId == null || !state.connected) return;
    try {
      await _transport.request(
        'session.set_permission_mode',
        sessionId: sessionId,
        payload: <String, dynamic>{'mode': mode},
      );
    } catch (error) {
      state = state.copyWith(error: error.toString());
    }
  }

  Future<void> respondApproval(
    ChatEntry entry,
    String decision, {
    String? feedback,
  }) async {
    await _transport.request(
      'approval.respond',
      sessionId: state.selectedSessionId,
      payload: <String, dynamic>{
        ...entry.data,
        'decision': decision,
        'feedback': ?feedback,
      },
    );
  }

  Future<void> respondQuestion(
    ChatEntry entry,
    Map<String, String> answers,
  ) async {
    await _transport.request(
      'question.respond',
      sessionId: state.selectedSessionId,
      payload: <String, dynamic>{...entry.data, 'answers': answers},
    );
  }

  Future<String?> uploadFile({
    required String filename,
    required Uint8List bytes,
    String mimeType = 'application/octet-stream',
  }) async {
    final String? sessionId = state.selectedSessionId;
    if (sessionId == null || !state.connected) return null;
    final List<AttachmentChunk> chunks = splitAttachment(bytes);
    final String uploadId = _uuid.v4();
    await _transport.request(
      'file.upload.start',
      sessionId: sessionId,
      payload: <String, dynamic>{
        'uploadId': uploadId,
        'filename': filename,
        'mimeType': mimeType,
        'totalBytes': bytes.length,
        'totalChunks': chunks.length,
      },
    );
    for (final AttachmentChunk chunk in chunks) {
      await _transport.request(
        'file.upload.chunk',
        sessionId: sessionId,
        payload: <String, dynamic>{
          'uploadId': uploadId,
          'index': chunk.index,
          'data': base64Encode(chunk.bytes),
        },
      );
    }
    final dynamic response = await _transport.request(
      'file.upload.complete',
      sessionId: sessionId,
      payload: <String, dynamic>{'uploadId': uploadId},
    );
    if (response is! Map) return null;
    final dynamic path = response['path'];
    return path is String && path.isNotEmpty ? path : null;
  }

  Future<dynamic> workspaceList([String? path]) {
    return _transport.request(
      'workspace.list',
      sessionId: state.selectedSessionId,
      payload: <String, dynamic>{'path': ?path},
    );
  }

  Future<dynamic> workspaceDiff() {
    return _transport.request(
      'workspace.diff',
      sessionId: state.selectedSessionId,
    );
  }

  void clearError() {
    state = state.copyWith(clearError: true);
  }

  void _handleConnection(ConnectionMode mode, String? detail) {
    if (_disposed) return;
    state = state.copyWith(
      connectionMode: mode,
      connectionDetail: detail,
      clearConnectionDetail: detail == null,
    );
  }

  void _handleMessage(SecureMessage message, RelayKind kind) {
    if (_disposed) return;
    if (kind != RelayKind.event) return;
    if (message.operation == 'session.wire_event') {
      _handleWireEvent(_asMap(message.payload));
      return;
    }
    _append(
      ChatEntry(
        id: _uuid.v4(),
        kind: ChatEntryKind.status,
        content: message.operation,
        timestamp: DateTime.now(),
        data: _asMap(message.payload),
      ),
    );
  }

  void _handleWireEvent(Map<String, dynamic> wire) {
    final String method =
        (wire['method'] ?? wire['type'] ?? wire['event'] ?? '').toString();
    final Map<String, dynamic> params = _asMap(
      wire['params'] ?? wire['payload'] ?? wire,
    );
    final String normalized = method.toLowerCase();
    if (normalized.contains('turnbegin')) {
      state = state.copyWith(running: true);
      return;
    }
    if (normalized.contains('turnend') ||
        normalized.contains('finished') ||
        normalized.contains('cancelled')) {
      state = state.copyWith(running: false);
      return;
    }
    if (normalized.contains('content')) {
      _appendStreaming(
        ChatEntryKind.assistant,
        _text(params),
        (params['id'] ?? params['message_id'])?.toString(),
      );
      return;
    }
    if (normalized.contains('thinking')) {
      _appendStreaming(
        ChatEntryKind.thinking,
        _text(params),
        (params['id'] ?? params['message_id'])?.toString(),
      );
      return;
    }
    if (normalized.contains('approval')) {
      _append(_entry(ChatEntryKind.approval, _text(params), params));
      return;
    }
    if (normalized.contains('question')) {
      _append(_entry(ChatEntryKind.question, _text(params), params));
      return;
    }
    if (normalized.contains('tool')) {
      _append(_entry(ChatEntryKind.tool, _text(params), params));
      return;
    }
    if (normalized.contains('task') || normalized.contains('subagent')) {
      _append(_entry(ChatEntryKind.task, _text(params), params));
      return;
    }
    if (normalized.contains('status') || normalized.contains('plan')) {
      final String? context = params['context']?.toString();
      state = state.copyWith(
        contextLabel: context,
        clearContextLabel: context == null,
      );
      _append(_entry(ChatEntryKind.status, _text(params), params));
      return;
    }
    _append(_entry(ChatEntryKind.status, method, params));
  }

  ChatEntry _entry(
    ChatEntryKind kind,
    String content,
    Map<String, dynamic> data,
  ) {
    return ChatEntry(
      id: (data['id'] ?? _uuid.v4()).toString(),
      kind: kind,
      content: content,
      timestamp: DateTime.now(),
      data: data,
    );
  }

  void _append(ChatEntry entry) {
    state = state.copyWith(entries: <ChatEntry>[...state.entries, entry]);
  }

  void _appendStreaming(ChatEntryKind kind, String content, String? streamId) {
    if (content.isEmpty) return;
    final String id = streamId ?? 'stream-${kind.name}';
    final List<ChatEntry> entries = <ChatEntry>[...state.entries];
    final int index = entries.lastIndexWhere(
      (ChatEntry entry) => entry.id == id && entry.kind == kind,
    );
    if (index >= 0) {
      entries[index] = entries[index].copyWith(
        content: '${entries[index].content}$content',
      );
    } else {
      entries.add(
        ChatEntry(
          id: id,
          kind: kind,
          content: content,
          timestamp: DateTime.now(),
        ),
      );
    }
    state = state.copyWith(entries: entries);
  }

  List<ChatEntry> _historyEntries(dynamic value) {
    final dynamic raw = value is Map
        ? (value['events'] ?? value['messages'] ?? value['history'])
        : value;
    if (raw is! List) return const <ChatEntry>[];
    return raw
        .map((dynamic item) {
          final Map<String, dynamic> map = _asMap(item);
          final String role = (map['role'] ?? map['type'] ?? 'status')
              .toString();
          final ChatEntryKind kind = switch (role.toLowerCase()) {
            'user' => ChatEntryKind.user,
            'assistant' => ChatEntryKind.assistant,
            'thinking' => ChatEntryKind.thinking,
            'tool' => ChatEntryKind.tool,
            _ => ChatEntryKind.status,
          };
          return ChatEntry(
            id: (map['id'] ?? _uuid.v4()).toString(),
            kind: kind,
            content: _text(map),
            timestamp:
                DateTime.tryParse((map['timestamp'] ?? '').toString()) ??
                DateTime.now(),
            data: map,
          );
        })
        .toList(growable: false);
  }
}

Map<String, dynamic> _asMap(dynamic value) {
  return value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};
}

String _text(Map<String, dynamic> value) {
  final dynamic candidate =
      value['text'] ??
      value['content'] ??
      value['message'] ??
      value['title'] ??
      value['name'];
  if (candidate is String) return candidate;
  if (candidate != null) return candidate.toString();
  return jsonEncode(value);
}
